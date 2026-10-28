"""Actual recorder and ZIP export against a loopback ADS peer; no physical PLC."""
import contextlib,csv,http.client,io,json,pathlib,shutil,sqlite3,struct,subprocess,tempfile,time,unittest,zipfile
from test_ads_integration import ROOT,MockPLC

class Diagnostics(unittest.TestCase):
 def setUp(self):
  self.mock=MockPLC();self.tmp=tempfile.TemporaryDirectory();self.base=pathlib.Path(self.tmp.name);shutil.copytree(ROOT/'ui',self.base/'ui');self.cookie='';self.start()
 def start(self):
  self.proc=subprocess.Popen([str(ROOT/'scada-test-host'),'--ip','127.0.0.1','--tcp-port',str(self.mock.port),'--ui',str(self.base)],cwd=self.base,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  line=self.proc.stdout.readline().split();self.assertEqual(line[0],'READY');self.port=int(line[1]);self.token=line[2]
  self.wait(lambda:self.request('GET','/api/state')[1]['fields']['total']['quality'])
 def stop(self):
  with contextlib.suppress(Exception):self.request('POST','/api/quit',{})
  self.proc.wait(8);self.assertEqual(self.proc.returncode,0,self.proc.stderr.read());self.proc.stdout.close();self.proc.stderr.close()
 def tearDown(self):
  try:self.stop()
  finally:self.mock.close();self.tmp.cleanup()
 def request(self,method,path,body=None):
  c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5);headers={'X-SCADA-Token':self.token,'Content-Type':'application/json'}
  if self.cookie:headers['Cookie']=self.cookie
  c.request(method,path,json.dumps(body) if body is not None else None,headers);r=c.getresponse();data=r.read();status=r.status;typ=r.getheader('Content-Type','');cookie=r.getheader('Set-Cookie');c.close()
  if cookie:self.cookie=cookie.split(';')[0]
  return status,json.loads(data) if typ.startswith('application/json') else data
 def wait(self,fn,timeout=8):
  deadline=time.monotonic()+timeout
  while time.monotonic()<deadline:
   result=fn()
   if result:return result
   time.sleep(.05)
  self.fail('Expected diagnostic condition not reached')
 def login(self):self.assertEqual(self.request('POST','/api/auth/setup',{'password':'827491'})[0],200)
 def status(self):
  status,data=self.request('GET','/api/diagnostics/status');self.assertEqual(status,200);return data
 def package(self,hours=24):
  self.assertEqual(self.request('POST','/api/diagnostics/export',{'hours':hours})[0],202)
  job=self.wait(lambda:(j if (j:=self.status()['export'])['state'] in [2,3] else None),20);self.assertEqual(job['state'],2,job)
  data=bytearray()
  while len(data)<job['size']:
   status,chunk=self.request('GET',f"/api/diagnostics/chunk?id={job['id']}&offset={len(data)}");self.assertEqual(status,200);self.assertTrue(chunk);data.extend(chunk)
  self.assertEqual(len(data),job['size']);z=zipfile.ZipFile(io.BytesIO(data));self.assertIsNone(z.testzip());return z
 def rows(self):
  with sqlite3.connect(self.base/'local/diagnostics.sqlite') as db:return db.execute('SELECT count(*) FROM samples').fetchone()[0]
 def test_snapshot_has_time_session_coverage_and_age_without_extra_writes(self):
  before=list(self.mock.writes);status,d=self.request('GET','/api/report');self.assertEqual(status,200);self.assertEqual(d['reportSchemaVersion'],2);self.assertEqual(d['version'],'0.1.25');self.assertEqual(d['coverage']['knownFields'],714);self.assertFalse(d['coverage']['extraReadsForReport']);self.assertGreater(d['generatedAtUtcMs'],0);self.assertEqual(len(d['sessionId']),32);self.assertIn('ageMs',d['fields']['total']);self.assertEqual(self.mock.writes,before)
 def test_export_requires_engineer_and_valid_period(self):
  self.assertEqual(self.request('GET','/api/diagnostics/status')[0],403);self.assertEqual(self.request('POST','/api/diagnostics/export',{'hours':24})[0],403);self.login()
  for body in [{'hours':0},{'hours':48},{'hours':'24'},{'hours':12,'other':1},{}]:self.assertEqual(self.request('POST','/api/diagnostics/export',body)[0],422)
 def test_zip_contains_consistent_trace_catalog_and_no_credentials(self):
  self.login();self.wait(lambda:self.rows()>5);before=list(self.mock.writes);z=self.package();m=json.loads(z.read('manifest.json'));self.assertEqual(m['requestedHours'],24);self.assertFalse(m['reasonPolicyChanged']);self.assertFalse(m['recordingStartedBeforeRequestedPeriod']);self.assertFalse(m['extraAdsReads']);self.assertIn('field_catalog.csv',z.namelist());self.assertIn('production_intervals.csv',z.namelist());self.assertIn('audit_current_session.csv',z.namelist());self.assertIn('events.jsonl',z.namelist());trace=list(csv.DictReader(io.StringIO(z.read('trace.csv').decode()),delimiter=';'));self.assertEqual(len(trace),m['counts']['samples']);self.assertEqual(len({r['seq'] for r in trace}),len(trace));self.assertTrue(all(int(r['seq'])<=m['snapshotBoundaries']['diagnosticSampleSequence'] for r in trace));self.assertEqual(self.mock.writes,before)
  for name in z.namelist():
   payload=z.read(name);self.assertNotIn(self.token.encode(),payload);self.assertNotIn(b'827491',payload);self.assertNotIn(b'accounts.json',name.encode())
 def test_external_control_and_guard_are_observed_without_inventing_actor(self):
  self.login();self.wait(lambda:self.rows()>5);self.mock.set('unwinderAutoStop',0)
  def observed():
   with sqlite3.connect(self.base/'local/diagnostics.sqlite') as db:return db.execute("SELECT payload FROM events WHERE kind='unwinder.control_observed' AND json_extract(payload,'$.control')=0").fetchone()
  record=self.wait(observed);d=json.loads(record[0]);self.assertEqual(d['origin'],'observation_not_button_identity');self.assertNotIn('actor',d)
  def guard_observed():
   with sqlite3.connect(self.base/'local/diagnostics.sqlite') as db:return db.execute('SELECT 1 FROM samples WHERE guard!=0 LIMIT 1').fetchone()
  self.wait(guard_observed)
  z=self.package(12);rows=list(csv.DictReader(io.StringIO(z.read('trace.csv').decode()),delimiter=';'));self.assertTrue(any(r['control']=='0' for r in rows));self.assertTrue(any(int(r['guard'])!=0 for r in rows))
 def test_counter_changes_and_bad_quality_are_preserved(self):
  self.login();self.wait(lambda:self.rows()>5);self.mock.set('total',333);time.sleep(.3);self.mock.set('total',337);time.sleep(.3);self.mock.read_errors={'total':0x710};time.sleep(.7)
  z=self.package();rows=list(csv.DictReader(io.StringIO(z.read('trace.csv').decode()),delimiter=';'));self.assertTrue(any(r['total']=='333' and r['total_good']=='1' for r in rows));self.assertTrue(any(r['total']=='337' and r['total_good']=='1' for r in rows));self.assertTrue(any(r['total_good']=='0' for r in rows))
 def test_recorder_survives_restart_and_keeps_distinct_sessions(self):
  self.login();self.wait(lambda:self.rows()>5);first=self.status()['recorder']['sessionId'];self.stop();self.cookie='';self.start();self.assertEqual(self.request('POST','/api/auth/login',{'password':'827491'})[0],200);self.wait(lambda:self.rows()>10);second=self.status()['recorder']['sessionId'];self.assertNotEqual(first,second);z=self.package();sessions=list(csv.DictReader(io.StringIO(z.read('sessions.csv').decode()),delimiter=';'));self.assertTrue({first,second}.issubset({s['id'] for s in sessions}))
 def test_recorder_failure_is_visible_and_does_not_stop_ads(self):
  self.login();self.wait(lambda:self.rows()>5)
  with sqlite3.connect(self.base/'local/diagnostics.sqlite') as db:db.execute("CREATE TRIGGER synthetic_failure BEFORE INSERT ON samples BEGIN SELECT RAISE(FAIL,'synthetic diagnostic failure');END")
  self.wait(lambda:self.status()['recorder']['dropped']>0);self.assertTrue(self.request('GET','/api/state')[1]['connected']);self.mock.set('total',444);self.wait(lambda:self.request('GET','/api/state')[1]['fields']['total']['value']==444)
  with sqlite3.connect(self.base/'local/diagnostics.sqlite') as db:db.execute('DROP TRIGGER synthetic_failure')
  self.wait(lambda:not self.status()['recorder']['storageError']);self.assertGreater(self.status()['recorder']['dropped'],0)
 def test_short_restart_policy_is_recorded_as_policy_one(self):
  self.login();self.mock.set('machineState',4);self.mock.set('automatic',1);time.sleep(.6)
  with self.mock.lock:struct.pack_into('<hh',self.mock.alarms,27*49,10,27);self.mock.alarms[27*49+48]=1
  self.mock.set('machineState',2);time.sleep(2.8);self.mock.set('machineState',4);time.sleep(.6)
  z=self.package();events=[json.loads(line) for line in z.read('events.jsonl').splitlines()];closed=[e for e in events if e['kind']=='reason.closed'];self.assertTrue(closed);self.assertEqual(closed[-1]['payload']['trigger'],'first_work_state');self.assertTrue(any(e['kind']=='reason.decision' for e in events))

 def test_context_has_cached_parameters_and_all_three_counters(self):
  self.login();self.mock.set('current',17);self.mock.set('groups',23);self.wait(lambda:self.rows()>8)
  z=self.package();contexts=[json.loads(line) for line in z.read('context.jsonl').splitlines()];self.assertTrue(contexts);self.assertIn('heat1Actual',contexts[-1]['data']['fields']);self.assertIn('raw',contexts[-1]['data']['fields']['total']);self.assertIn('ageMs',contexts[-1]['data']['fields']['total']);self.assertGreaterEqual(len(contexts[-1]['data']['fields']),256)
  rows=list(csv.DictReader(io.StringIO(z.read('trace.csv').decode()),delimiter=';'));self.assertTrue(any(r['current_count']=='17' and r['groups_count']=='23' and int(r['quality_mask'])&3072==3072 for r in rows))
 def test_ui_error_is_journalled_with_sensitive_runs_redacted(self):
  self.login();self.assertEqual(self.request('POST','/api/ui-error',{'message':'UI failure: '+self.token+' password 827491'})[0],200);time.sleep(.2);z=self.package();events=[json.loads(line) for line in z.read('events.jsonl').splitlines()];error=next(e for e in events if e['kind']=='ui.error');self.assertIn('UI failure:',error['payload']['message']);self.assertNotIn(self.token,error['payload']['message']);self.assertNotIn('827491',error['payload']['message'])
 def test_alarm_truncation_is_explicit(self):
  self.login()
  with self.mock.lock:
   for i in range(30,55):struct.pack_into('<hh',self.mock.alarms,i*49,10,i);self.mock.alarms[i*49+48]=1
  time.sleep(.8);z=self.package();rows=list(csv.DictReader(io.StringIO(z.read('trace.csv').decode()),delimiter=';'));self.assertTrue(any(int(r['quality_mask'])&512 for r in rows))

 def test_transaction_lifecycle_and_readback_result_are_durable(self):
  self.login();state=self.request('GET','/api/state')[1];field=state['fields']['width'];body={'id':'diag-lifecycle','key':'width','value':250,'expected':field['raw'],'epoch':state['epoch']};self.assertEqual(self.request('POST','/api/write',body)[0],202);self.wait(lambda:self.request('GET','/api/state')[1]['operation']['status']=='confirmed');time.sleep(.15)
  z=self.package();events=[json.loads(line) for line in z.read('events.jsonl').splitlines()];stages={e['kind']:e['payload'] for e in events if e['payload'].get('operationId')=='diag-lifecycle'};self.assertTrue({'transaction.queued','transaction.sent','transaction.finished'}.issubset(stages));self.assertEqual(stages['transaction.finished']['status'],'confirmed');self.assertEqual(stages['transaction.finished']['actual'],250);self.assertEqual(stages['transaction.queued']['actor'],'local-engineer')
 def test_chunk_rejects_forged_identity_and_bad_offsets(self):
  self.login();self.package();job=self.status()['export']
  for offset in [-1,.5,job['size'],9999999999999]:self.assertIn(self.request('GET',f"/api/diagnostics/chunk?id={job['id']}&offset={offset}")[0],[409,422])
  self.assertEqual(self.request('GET','/api/diagnostics/chunk?id=forged&offset=0')[0],409)
 def test_current_future_schema_failure_keeps_controls_alive(self):
  self.stop()
  with sqlite3.connect(self.base/'local/diagnostics.sqlite') as db:db.execute('PRAGMA user_version=99')
  self.cookie='';self.start()
  report=self.request('GET','/api/report')[1];self.assertTrue(report['recorder']['storageError']);self.assertFalse(report['recorder']['running']);self.assertTrue(report['connected']);self.mock.set('total',112233);self.wait(lambda:self.request('GET','/api/state')[1]['fields']['total']['value']==112233)
