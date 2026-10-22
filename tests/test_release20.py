"""0.1.20 policies through the real native HTTP backend, loopback ADS only."""
import datetime,json,pathlib,sqlite3,struct,subprocess,time,unittest
import test_ads_integration as legacy

class Release20(unittest.TestCase):
 setUp=legacy.Backend.setUp;tearDown=legacy.Backend.tearDown
 request=legacy.Backend.request;state=legacy.Backend.state;await_state=legacy.Backend.await_state
 def login(self):self.assertEqual(self.request('POST','/api/auth/'+('login' if self.state()['auth']['engineerConfigured'] else 'setup'),{'password':'123456'})[0],200)
 def options(self,**kw):return self.request('POST','/api/options',dict(snow=1,animations=1,wallpaper=1,exitButton=1,theme='dark',**kw))
 def stop_host(self):
  self.request('POST','/api/quit',{});self.proc.wait(8);self.proc.stdout.close();self.proc.stderr.close();self.cookie=''
 def start_host(self):
  self.proc=subprocess.Popen([str(legacy.ROOT/'scada-test-host'),'--ip','127.0.0.1','--tcp-port',str(self.mock.port),'--ui',self.tmp.name],cwd=self.tmp.name,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  line=self.proc.stdout.readline().split();self.assertEqual(line[0],'READY');self.port=int(line[1]);self.token=line[2];self.await_state(lambda s:s['connected'] and s['fields']['total']['quality'])
 def test_font_survives_native_restart_with_legacy_preferences(self):
  self.login();self.assertEqual(self.options(font='verdana')[0],200);self.stop_host();self.start_host();self.assertEqual(self.state()['options']['font'],'verdana');self.assertEqual(self.state()['auth']['role'],'operator')
  self.stop_host();p=pathlib.Path(self.tmp.name)/'local/scada_options.json';v=json.loads(p.read_text());v.pop('font');v['wallpaper']=0;p.write_text(json.dumps(v));self.start_host();self.assertEqual(self.state()['options']['font'],'system');self.assertFalse(self.state()['options']['wallpaper'])
 def test_version1_history_migration_preserves_rows_and_notes(self):
  self.login();time.sleep(.6);self.stop_host();p=pathlib.Path(self.tmp.name)/'local/production.sqlite'
  with sqlite3.connect(p) as db:
   row=db.execute('SELECT max(seq) FROM intervals').fetchone()[0];db.execute("INSERT INTO notes VALUES(?, 'Старая причина', 'Старый комментарий', 'server', 1, 1)",(row,));db.execute('DROP TABLE stop_causes');db.execute('PRAGMA user_version=1');old=db.execute('SELECT count(*) FROM intervals').fetchone()[0]
  self.start_host();self.login()
  with sqlite3.connect(p) as db:
   self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],2);self.assertGreaterEqual(db.execute('SELECT count(*) FROM intervals').fetchone()[0],old);self.assertEqual(db.execute('SELECT count(*) FROM notes').fetchone()[0],1);self.assertEqual(db.execute('SELECT count(*) FROM stop_causes').fetchone()[0],0)
  status,v=self.request('GET','/api/production/interval/'+str(row));self.assertEqual(status,200);self.assertEqual(v['reason'],'Старая причина');self.assertEqual(v['comment'],'Старый комментарий');self.assertEqual(v['reasonSource'],'manual');self.assertEqual(self.mock.writes,[])
 def test_operator_shift_summary_has_no_detail_or_query_escape(self):
  time.sleep(.6);status,data=self.request('GET','/api/production/shift');self.assertEqual(status,200)
  a=datetime.datetime.fromtimestamp(data['from']/1000);z=datetime.datetime.fromtimestamp(data['to']/1000)
  self.assertIn(a.hour,[8,20]);self.assertIn(z.hour,[8,20]);self.assertLessEqual(data['from'],data['now']);self.assertLess(data['now'],data['to']);self.assertTrue(data['shiftOnly'])
  self.assertNotIn('intervals',data);self.assertNotIn('total',data);self.assertLessEqual(len(data['timeline']),480)
  self.assertTrue(all(data['from']<=a<=z<=data['now'] for a,z,k in data['timeline']))
  f=data['from'];t=data['to'];vf=f+(t-f)//3;vt=vf+60000
  zoom=self.request('GET',f'/api/production/shift?viewFrom={vf}&viewTo={vt}');self.assertEqual(zoom[0],200);self.assertEqual(zoom[1]['viewFrom'],vf)
  for query in [f'viewFrom={f-1}&viewTo={vt}',f'viewFrom={vf}&viewTo={t+1}',f'viewFrom={vf}',f'viewFrom={vf}&viewTo={vf}',f'from=0&to={t}',f'viewFrom={vf}&viewFrom={vf}&viewTo={vt}']:
   self.assertEqual(self.request('GET','/api/production/shift?'+query)[0],422,query)
  for route in ['/api/production/history?from=0&to=100','/api/production/interval/1','/api/production/export']:
   self.assertEqual(self.request('GET',route)[0],403,route)
  self.assertEqual(self.request('POST','/api/production/action',dict(id='test',action='start',operationId='one'))[0],403);self.assertEqual(self.mock.writes,[])
 def test_equipment_signals_are_read_only_and_fresh(self):
  s=self.state();keys=[k for k in s['fields'] if k.startswith('equipment')];self.assertEqual(len(keys),8)
  for key in keys:
   f=s['fields'][key];self.assertEqual(f['type'],'BOOL');self.assertTrue(f['quality']);self.assertFalse(f['writable'])
   self.assertEqual(self.request('POST','/api/write',dict(key=key,value='0',id=key,epoch=s['epoch'],expected=f['raw']))[0],403 if key not in ['equipmentSeamHidden','equipmentEjectServo'] else 400)
  self.mock.set('equipmentLiner',0);self.await_state(lambda s:s['fields']['equipmentLiner']['value']==0);self.assertEqual(self.mock.writes,[])
 def test_font_allowlist_legacy_save_and_disk_failure(self):
  self.assertEqual(self.state()['options']['font'],'system');self.assertEqual(self.options(font='tahoma')[0],403);self.login()
  for font in ['tahoma','arial','verdana','system']:
   self.assertEqual(self.options(font=font)[0],200);self.assertEqual(self.state()['options']['font'],font)
  self.assertEqual(self.options(font='tahoma')[0],200);self.assertEqual(self.options()[0],200);self.assertEqual(self.state()['options']['font'],'tahoma')
  config=pathlib.Path(self.tmp.name)/'local/scada_options.json';before=config.read_bytes()
  for font in ['../font','url(https://example.org)',123,True,None,'Tahoma','']:
   self.assertIn(self.options(font=font)[0],[400,422]);self.assertEqual(config.read_bytes(),before)
  (config.parent/'scada_options.json.tmp').mkdir();self.assertEqual(self.options(font='arial')[0],503);self.assertEqual(self.state()['options']['font'],'tahoma');self.assertEqual(self.mock.writes,[])
 def test_engineer_history_rebins_only_bounded_window(self):
  self.login();f=int(time.time()*1000)-60000;t=f+120000
  status,d=self.request('GET',f'/api/production/history?from={f}&to={t}&viewFrom={f+30000}&viewTo={f+90000}');self.assertEqual(status,200);self.assertEqual(d['viewFrom'],f+30000);self.assertIn('intervals',d)
  for a,z in [(f-1,t),(f,t+1),(t,t),(f,f+100)]:self.assertEqual(self.request('GET',f'/api/production/history?from={f}&to={t}&viewFrom={a}&viewTo={z}')[0],422)
  self.assertEqual(self.request('GET','/api/production/export')[0],200)
 def test_actual_alarm_snapshot_infers_and_persists_read_only_reason(self):
  self.login();self.mock.set('machineState',4);self.mock.set('automatic',1);time.sleep(.7)
  with self.mock.lock:
   struct.pack_into('<hh',self.mock.alarms,0,10,14);self.mock.alarms[48]=1
  self.await_state(lambda s:any(r['id']==14 and r['condition'] for r in s['alarms']['records']));self.mock.set('machineState',2);self.mock.set('automatic',0)
  self.await_state(lambda s:s['fields']['machineState']['value']==2);time.sleep(.6)
  with self.mock.lock:self.mock.alarms[48]=0
  self.mock.set('machineState',5);time.sleep(2.1)
  now=int(time.time()*1000);status,h=self.request('GET',f'/api/production/history?from={now-60000}&to={now+1000}');self.assertEqual(status,200)
  rows=[v for v in h['intervals'] if v['reasonCode']=='liner_change'];self.assertGreaterEqual(len(rows),2)
  for v in rows:
   self.assertEqual(v['reason'],'Замена лайнера');self.assertEqual(v['reasonSource'],'automatic');self.assertEqual(v['reasonAlarms'],[14]);self.assertEqual(self.request('GET','/api/production/interval/'+str(v['id']))[1]['reasonCode'],'liner_change')
  self.assertEqual(self.mock.writes,[])

if __name__=='__main__':unittest.main(verbosity=2)
