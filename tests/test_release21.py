"""Release 0.1.21: real native API and loopback PLC; never contacts station hardware."""
import json,struct,time,unittest,uuid
import test_ads_integration as plc
CATALOG=json.loads((plc.ROOT/'ui/functionality.json').read_text())['parameters']
class Release21(unittest.TestCase):
 setUp=plc.Backend.setUp;tearDown=plc.Backend.tearDown
 request=plc.Backend.request;state=plc.Backend.state;await_state=plc.Backend.await_state
 write=plc.Backend.write;terminal=plc.Backend.terminal
 def login(self):self.assertEqual(self.request('POST','/api/auth/setup',{'password':'261021'})[0],200)
 def command(self,key):
  s=self.state();body=dict(id=str(uuid.uuid4()),key=key,epoch=s['epoch'],action='start')
  return self.request('POST','/api/command',body),body
 def test_catalog_covers_all_original_pages_without_address_aliases(self):
  self.assertEqual(len(CATALOG),62);self.assertEqual(len({p['symbol'] for p in CATALOG}),62)
  self.assertEqual([sum(p['page']==i for p in CATALOG) for i in range(1,5)],[16,16,16,14])
  s=self.await_state(lambda s:all(v['quality'] for v in s['fields'].values()))
  self.assertEqual(len(s['fields']),len(plc.rows));self.assertEqual(len(s['commands']),42)
  for p in CATALOG:
   f=s['fields'][p['key']];self.assertEqual(f['symbol'],p['symbol']);self.assertEqual(f['type'],p['type']);self.assertTrue(p['proof']);self.assertFalse(f['writable'])
  self.assertEqual(len({v['symbol'].upper() for v in s['fields'].values()}),len(plc.rows))
  self.assertEqual(self.mock.writes,[])
 def test_operator_cannot_write_configuration_even_via_direct_api(self):
  for p in CATALOG:self.assertEqual(self.write(p['key'],1)[0],403,p['key'])
  self.assertEqual(self.mock.writes,[])
 def test_engineer_configuration_writes_during_work_and_readback(self):
  self.login();self.assertEqual(self.write('cfgBalerin2PotansCalismaAktif',1)[0],400)
  keys=['cfgCeneServoVar','equipmentGlue','equipmentTemperature','equipmentLiner','equipmentEjectAC','equipmentEjectAutoJog','equipmentTakeoff','unwinderSensorPresent','cfgEmniyetKapilarPasif','cfgIstiflemePistonuYOK']
  for state in (5,4,13,2):
   self.mock.set('machineState',state);self.mock.set('automatic',int(state==4));self.await_state(lambda s:s['fields']['machineState']['value']==state)
   for key in keys:
    value=1-int(self.state()['fields'][key]['value']);status,_,body=self.write(key,value);self.assertEqual(status,202,key);self.assertEqual(self.terminal(body)['status'],'confirmed',key)
 def test_numeric_limits_types_and_zero_scaling_are_enforced(self):
  self.login()
  for key,good,bad in [('cfgCurrentAlarmDelay',17,[1.5,-1,1001]),('cfgGlueEncoderPulses',2048,[0,-1,10001])]:
   for value in bad:self.assertEqual(self.write(key,value)[0],422)
   status,_,body=self.write(key,good);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.mock.writes[-1][1],struct.pack('<h' if key=='cfgCurrentAlarmDelay' else '<f',good))
 def test_glue_diameter_is_editable_in_all_machine_states_and_apply_is_a_pulse(self):
  s=self.state();self.assertEqual(s['fields']['glueActualReference']['symbol'],'.AO_HotmeltRef');self.assertEqual(self.write('glueActualReference',1)[0],400)
  for value in [0,500.1]:self.assertEqual(self.write('glueRollDiameter',value)[0],422)
  for state in (5,6,4,13):
   self.mock.set('machineState',state);self.mock.set('automatic',int(state==4));self.await_state(lambda s:s['fields']['machineState']['value']==state)
   value=140.5+state;status,_,body=self.write('glueRollDiameter',value);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.mock.writes[-1],('glueRollDiameter',struct.pack('<f',value)))
   result,body=self.command('glueScaleSave');self.assertEqual(result[0],202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.mock.writes[-2:],[('glueScaleSave',b'\1'),('glueScaleSave',b'\0')]);self.assertFalse(self.state()['commandLease']['pendingRelease'])
 def test_configuration_conflict_does_not_overwrite_original_hmi(self):
  self.login();s=self.state();f=s['fields']['cfgCeneServoVar'];self.mock.set('cfgCeneServoVar',1-int(f['value']))
  body=dict(id=str(uuid.uuid4()),key='cfgCeneServoVar',value=str(1-int(f['value'])),epoch=s['epoch'],expected=f['raw'])
  status,_=self.request('POST','/api/write',body)
  if status==202:self.assertEqual(self.terminal(body)['status'],'conflict')
  else:self.assertEqual(status,409)
  self.assertEqual(self.mock.writes,[])
 def test_operator_can_read_all_jobs_and_spec_but_cannot_import_or_export_history(self):
  self.login();job=json.loads((plc.ROOT/'production/examples/example_100x150.json').read_text());self.assertEqual(self.request('POST','/api/production/import',job)[0],200)
  self.request('POST','/api/auth/operator',{})
  status,data=self.request('GET','/api/production');self.assertEqual(status,200);self.assertFalse(data['canImport']);self.assertEqual(data['totalJobs'],1);self.assertEqual(data['jobs'][0]['id'],job['id'])
  status,detail=self.request('GET','/api/production/job/'+job['id']);self.assertEqual(status,200);self.assertEqual(detail['document']['spec'],job['spec'])
  self.assertEqual(self.request('POST','/api/production/import',job)[0],403);self.assertEqual(self.request('GET','/api/production/export')[0],403);self.assertEqual(self.request('GET','/api/production/interval/1')[0],403)
  self.assertEqual(self.mock.writes,[])
 def test_turkish_catalog_and_native_preference(self):
  self.assertEqual(self.request('POST','/api/language',dict(language='tr'))[0],200);self.assertEqual(self.state()['language'],'tr')
  d=self.request('GET','/locales/tr.json')[1];self.assertEqual(d['messages']['Диаметр вала'],'Hotmelt Merdane Cap (mm)')
  for p in CATALOG:self.assertEqual(d['messages'][p['label']],p['original'])
  self.assertEqual(self.request('GET','/assets/flags/tr.svg')[0],200)
  self.assertEqual(self.mock.writes,[])
if __name__=='__main__':unittest.main(verbosity=2)
