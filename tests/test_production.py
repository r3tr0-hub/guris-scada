"""Production API against the actual native backend and mock ADS endpoint."""
import copy,http.client,json,pathlib,sqlite3,subprocess,time,unittest,uuid
import test_ads_integration as legacy
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Production(unittest.TestCase):
 setUp=legacy.Backend.setUp;tearDown=legacy.Backend.tearDown
 request=legacy.Backend.request;state=legacy.Backend.state;await_state=legacy.Backend.await_state
 def login(self):self.assertEqual(self.request('POST','/api/auth/'+('login' if self.state()['auth']['engineerConfigured'] else 'setup'),{'password':'123456'})[0],200)
 def job(self,id='job-001'):
  return dict(schemaVersion=1,id=id,number='ПЗ-001',title='Курьерский пакет',plan=1000,spec=dict(id='ТЗ-001',revision='1',inputs=dict(A=100,B=150,C=40,t=45,stack=100,other='Проверка\nкачества.')))
 def catalog(self):
  status,data=self.request('GET','/api/production');self.assertEqual(status,200);return data
 def history(self,extra=''):
  if self.state()['auth']['role']!='engineer':self.login()
  status,data=self.request('GET',f'/api/production/history?from={int(time.time()*1000)-60000}&to={int(time.time()*1000)+1000}'+extra);self.assertEqual(status,200);return data
 def wait(self,predicate,timeout=5):
  until=time.monotonic()+timeout
  while time.monotonic()<until:
   data=self.catalog()
   if predicate(data):return data
   time.sleep(.1)
  self.fail(str(data))
 def action(self,id,action,operation=None):return self.request('POST','/api/production/action',dict(id=id,action=action,operationId=operation or str(uuid.uuid4())))
 def load(self,id='job-001'):
  self.login();job=self.job(id);self.assertEqual(self.request('POST','/api/production/import',job)[0],200);return job
 def restart(self,kill=False):
  if kill:self.proc.kill()
  else:self.request('POST','/api/quit',{})
  self.proc.wait(8);self.proc.stdout.close();self.proc.stderr.close();time.sleep(.15)
  self.cookie='';self.proc=subprocess.Popen([str(ROOT/'scada-test-host'),'--ip','127.0.0.1','--tcp-port',str(self.mock.port),'--ui',self.tmp.name],cwd=self.tmp.name,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  line=self.proc.stdout.readline().split();self.assertEqual(line[0],'READY');self.port=int(line[1]);self.token=line[2];self.await_state(lambda s:s['connected'] and s['fields']['total']['quality'])
 def test_local_history_without_jobs_and_plc_writes(self):
  c=self.catalog();self.assertEqual(c['jobs'],[]);self.assertFalse(c['serverConnected']);self.assertFalse(c['storageError']);self.assertRegex(c['machineId'],r'^[a-f0-9]{32}$')
  time.sleep(.7);h=self.history();self.assertGreater(h['totals'].get('stop',0),0);self.assertTrue(any(r['state']=='stop' and r['code']==5 for r in h['intervals']));self.assertEqual(self.mock.writes,[])
 def test_import_permission_schema_and_immutable_id(self):
  j=self.job();self.assertEqual(self.request('POST','/api/production/import',j)[0],403);self.login()
  for invalid in [dict(j,schemaVersion=1.5),dict(j,id='../file'),dict(j,plan='1000'),dict(j,plan=0),dict(j,machineId='other')]:self.assertEqual(self.request('POST','/api/production/import',invalid)[0],422)
  self.assertEqual(self.request('POST','/api/production/import',j)[0],200);self.assertEqual(self.request('POST','/api/production/import',j)[0],200)
  self.assertEqual(self.request('POST','/api/production/import',dict(j,plan=2000))[0],409);self.assertEqual(len(self.catalog()['jobs']),1);self.assertEqual(self.mock.writes,[])
 def test_real_counter_increments_stop_does_not_finish_and_pause(self):
  j=self.load();self.assertEqual(self.action(j['id'],'start')[0],200);self.mock.set('automatic',1);self.mock.set('machineState',4);time.sleep(.3)
  self.mock.set('total',324);self.wait(lambda c:c['jobs'][0]['produced']==3);self.mock.set('automatic',0);self.mock.set('machineState',5);time.sleep(.7)
  self.assertEqual(self.catalog()['jobs'][0]['status'],'active');self.assertEqual(self.action(j['id'],'pause')[0],200);self.mock.set('total',326);time.sleep(.7);self.assertEqual(self.catalog()['jobs'][0]['produced'],3)
  self.assertEqual(self.action(j['id'],'start')[0],200);self.mock.set('total',328);self.wait(lambda c:c['jobs'][0]['produced']==5);self.assertEqual(self.action(j['id'],'finish')[0],200);self.assertEqual(self.catalog()['jobs'][0]['status'],'done');self.assertEqual(self.mock.writes,[])
 def test_batched_positive_counter_change_is_not_rejected_by_speed_guess(self):
  j=self.load();self.action(j['id'],'start');self.mock.set('total',421);c=self.wait(lambda c:c['jobs'][0]['produced']==100);self.assertFalse(c['jobs'][0]['uncertain'])
 def test_reset_marks_incomplete_and_counts_after_reset_without_negative_delta(self):
  j=self.load();self.action(j['id'],'start');self.mock.set('total',324);self.wait(lambda c:c['jobs'][0]['produced']==3);self.mock.set('total',0);self.wait(lambda c:c['jobs'][0]['uncertain']);self.mock.set('total',2);self.wait(lambda c:c['jobs'][0]['produced']==5)
  h=self.request('GET','/api/production/export')[1];self.assertTrue(any(e['kind']=='counter.reset' for e in h['events']))
 def test_job_action_idempotency_and_one_active_job(self):
  j=self.load();j2=self.job('job-002');self.request('POST','/api/production/import',j2);op=str(uuid.uuid4());self.assertEqual(self.action(j['id'],'start',op)[0],200);self.assertEqual(self.action(j['id'],'start',op)[0],200)
  self.assertEqual(self.action(j2['id'],'start')[0],409);self.assertEqual(self.action(j['id'],'pause',op)[0],409);self.assertEqual(self.action(j['id'],'START')[0],400)
  self.action(j['id'],'pause');self.action(j2['id'],'start');self.action(j['id'],'finish');c=self.catalog();self.assertEqual(c['currentJobId'],j2['id']);self.assertEqual(sum(x['status']=='active' for x in c['jobs']),1)
 def test_persistence_crash_gap_and_stable_machine_id(self):
  j=self.load();self.action(j['id'],'start');self.mock.set('total',324);c=self.wait(lambda c:c['jobs'][0]['produced']==3);machine=c['machineId'];self.restart(kill=True);c=self.wait(lambda c:c['jobs'][0]['uncertain']);self.assertEqual(c['machineId'],machine);self.assertEqual(c['jobs'][0]['produced'],3);self.mock.set('total',326);self.wait(lambda c:c['jobs'][0]['produced']==5)
  self.assertTrue(any(v['state']=='unknown' and not v['open'] for v in self.history()['intervals']))
 def test_ads_reconnect_never_adds_unobserved_counter_delta(self):
  j=self.load();self.action(j['id'],'start');self.mock.set('total',324);self.wait(lambda c:c['jobs'][0]['produced']==3);old=self.state()['epoch'];self.mock.version+=1;self.mock.set('total',1000);self.await_state(lambda s:s['connected'] and s['epoch']>old);c=self.wait(lambda c:c['jobs'][0]['uncertain']);self.assertEqual(c['jobs'][0]['produced'],3)
 def test_manual_and_disconnected_states_are_not_stops(self):
  self.mock.set('machineState',6);time.sleep(.8);self.assertTrue(any(r['state']=='manual' for r in self.history()['intervals']));self.login();s=self.state();self.request('POST','/api/connect',dict(ip=s['ip'],netId=s['netId'],port=s['port'],enabled=0));time.sleep(.8);self.assertEqual(self.history()['intervals'][0]['state'],'unknown')
 def test_range_validation_token_and_detail_text_are_read_only(self):
  self.assertEqual(self.request('GET','/api/production',headers={'X-SCADA-Token':'bad'})[0],403)
  self.login()
  for route in ['/api/production/history?from=0&to=999999999999','/api/production/history?from=1&to=1','/api/production/history?from=0&to=100&kind=evil','/api/production/interval/1,0','/api/production/interval/1e0','/api/production/job/..']:
   self.assertIn(self.request('GET',route)[0],[404,422])
  time.sleep(.6);row=self.history()['intervals'][0];status,detail=self.request('GET','/api/production/interval/'+str(row['id']));self.assertEqual(status,200);self.assertEqual(detail['reason'],'');self.assertEqual(detail['comment'],'');self.assertFalse(self.catalog()['storageError']);self.assertEqual(self.mock.writes,[])
 def test_invalid_unicode_and_duplicate_json_do_not_disable_journal(self):
  self.login();j=self.job();j['title']='bad\x00title';self.assertEqual(self.request('POST','/api/production/import',j)[0],422);j['title']='\ud800';self.assertEqual(self.request('POST','/api/production/import',j)[0],422)
  c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=4);body=json.dumps(self.job())[:-1]+',"id":"different"}';c.request('POST','/api/production/import',body,{'X-SCADA-Token':self.token,'Cookie':self.cookie,'Content-Type':'application/json'});r=c.getresponse();r.read();self.assertEqual(r.status,422);c.close();self.assertFalse(self.catalog()['storageError'])
 def test_export_sequence_and_sources_are_stable(self):
  self.load();one=self.request('GET','/api/production/export')[1];two=self.request('GET','/api/production/export')[1];self.assertEqual(one['events'],two['events']);self.assertTrue(any(e['kind']=='job.imported' for e in one['events']));self.assertEqual(len({e['id'] for e in one['events']}),len(one['events']));self.assertEqual(self.request('GET','/api/production/export?after='+str(one['nextAfter']))[1]['events'],[])
 def test_disk_lock_reports_failure_without_blocking_ads(self):
  db=sqlite3.connect(pathlib.Path(self.tmp.name)/'local/production.sqlite');db.execute('BEGIN IMMEDIATE');time.sleep(1)
  try:
   self.assertTrue(self.catalog()['storageError']);before=self.state()['polling']['cycles'];time.sleep(.5);self.assertGreater(self.state()['polling']['cycles'],before+2);self.assertEqual(self.mock.writes,[])
  finally:db.rollback();db.close()
if __name__=='__main__':unittest.main(verbosity=2)
