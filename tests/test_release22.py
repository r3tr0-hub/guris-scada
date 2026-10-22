"""PERFORMANS writes use the actual native API and a loopback ADS peer only."""
import json,struct,time,unittest,uuid
import test_ads_integration as plc
CATALOG=json.loads((plc.ROOT/'ui/performance.json').read_text())['parameters']
class Release22(unittest.TestCase):
 setUp=plc.Backend.setUp;tearDown=plc.Backend.tearDown
 request=plc.Backend.request;state=plc.Backend.state;await_state=plc.Backend.await_state
 write=plc.Backend.write;terminal=plc.Backend.terminal
 def login(self):self.assertEqual(self.request('POST','/api/auth/setup',{'password':'221026'})[0],200)
 def test_original_25_controls_and_three_readings_are_bound_without_aliases(self):
  self.assertEqual(len(CATALOG),28);self.assertEqual(sum(not p['readOnly'] for p in CATALOG),25)
  s=self.await_state(lambda s:all(f['quality'] for f in s['fields'].values()))
  self.assertEqual(len(s['fields']),len(plc.rows));self.assertEqual(len({f['symbol'].upper() for f in s['fields'].values()}),len(plc.rows))
  for p in CATALOG:
   f=s['fields'][p['key']];self.assertEqual(f['symbol'].upper(),p['symbol'].upper());self.assertEqual(f['type'],p['type']);self.assertTrue(p['description']);self.assertTrue(p['proof'])
  self.assertEqual(s['fields']['widthMaximum']['symbol'],'MAIN.rMaxUrunBoy')
  self.assertEqual(s['fields']['perfProductLengthLimit']['symbol'],'.stKaliciData.iMaxUrunBoyu_mm')
  self.assertEqual(s['fields']['widthMaximum']['type'],'REAL');self.assertEqual(s['fields']['perfProductLengthLimit']['type'],'INT')
  self.assertEqual(self.mock.writes,[])
 def test_operator_cannot_write_new_performance_settings(self):
  for p in CATALOG:
   if not p['readOnly'] and p['key'] not in ['airStartAngle','airStopAngle']:
    self.assertEqual(self.write(p['key'],p['minimum'])[0],403,p['key'])
  self.assertEqual(self.mock.writes,[])
 def test_all_original_controls_write_correct_scalars_and_read_back(self):
  self.login()
  for p in CATALOG:
   if p['readOnly']:continue
   key=p['key'];lo,hi=p['minimum'],p['maximum'];value=int(lo+1) if p['type']!='REAL' else lo+1.25
   if value==self.state()['fields'][key]['value']:value=lo if p['type']=='REAL' else int(lo)
   self.assertLessEqual(value,hi)
   status,_,body=self.write(key,value);self.assertEqual(status,202,key)
   done=self.terminal(body);self.assertEqual(done['status'],'confirmed',(key,done));self.assertAlmostEqual(self.state()['fields'][key]['value'],value,places=3)
   self.assertEqual(self.mock.writes[-1],(key,struct.pack('<'+plc.FORMATS[p['type']],value)))
 def test_machine_state_change_does_not_block_engineer_parameter_write(self):
  self.login();self.mock.set('machineState',4);self.mock.set('automatic',1);self.await_state(lambda s:s['fields']['machineState']['value']==4)
  for key,value in [('perfJawRateLimit',10),('perfFeedAcceleration',65),('perfHydraulicMode',1),('perfProductLengthLimit',1000),('feedStartSet',10)]:
   status,_,body=self.write(key,value);self.assertEqual(status,202,key);self.assertEqual(self.terminal(body)['status'],'confirmed')
  self.mock.set('machineState',5);self.mock.set('automatic',0);self.await_state(lambda s:s['fields']['machineState']['value']==5)
  self.mock.lookup_hook=lambda f:self.mock.set('automatic',1)
  status,_,body=self.write('perfFeedAcceleration',66);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed')
 def test_original_bounds_integer_types_and_software_distance_guard(self):
  self.login()
  for p in CATALOG:
   if p['readOnly']:continue
   for v in [p['minimum']-1,p['maximum']+1]:self.assertEqual(self.write(p['key'],v)[0],422,p['key'])
   if p['type']!='REAL':self.assertEqual(self.write(p['key'],p['minimum']+.5)[0],422,p['key'])
  guarded=[p for p in CATALOG if p.get('upperBoundPolicy')];self.assertEqual(len(guarded),3)
  self.assertTrue(all(p['originalMaximum']=='' and p['maximum']==100000 for p in guarded));self.assertEqual(self.mock.writes,[])
 def test_original_hmi_conflict_and_readonly_values_are_not_overwritten(self):
  self.login();s=self.state();key='perfFilmSpeedLimit';self.mock.set(key,79)
  body=dict(id=str(uuid.uuid4()),key=key,value=90,expected=s['fields'][key]['raw'],epoch=s['epoch'])
  status,_=self.request('POST','/api/write',body)
  if status==202:self.assertEqual(self.terminal(body)['status'],'conflict')
  else:self.assertEqual(status,409)
  for p in CATALOG:
   if p['readOnly']:self.assertEqual(self.write(p['key'],1)[0],400)
  self.assertEqual(self.mock.writes,[])
 def test_catalog_and_original_names_in_english_turkish_modes(self):
  self.assertEqual(self.request('GET','/performance.json')[0],200)
  en=self.request('GET','/locales/en.json')[1]['messages'];tr=self.request('GET','/locales/tr.json')[1]['messages']
  for p in CATALOG:
   self.assertEqual(en[p['label']],p['en']);self.assertEqual(en[p['description']],p['descriptionEN']);self.assertEqual(tr[p['label']],p['original'])
  self.assertEqual(self.mock.writes,[])

if __name__=='__main__':unittest.main(verbosity=2)
