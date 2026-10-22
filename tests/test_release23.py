"""Paired readbacks and the single shared edge-control dead zone, over loopback ADS."""
import json,struct,time,unittest,uuid
import test_ads_integration as plc

class Release23(unittest.TestCase):
 setUp=plc.Backend.setUp;tearDown=plc.Backend.tearDown
 request=plc.Backend.request;state=plc.Backend.state;await_state=plc.Backend.await_state
 write=plc.Backend.write;terminal=plc.Backend.terminal
 def test_actual_readings_belong_to_their_setpoints_and_stay_readonly(self):
  catalog=self.request('GET','/performance.json')[1]['parameters']
  pairs={p['key']:p['pairedWith'] for p in catalog if p.get('pairedWith')}
  self.assertEqual(pairs,dict(feedStartActual='feedStartSet',feedStopActual='feedStopSet',perfLowMaterialActual='perfLowMaterialTime'))
  for key,value in [('feedStartActual',107.5),('feedStopActual',317.25),('perfLowMaterialActual',2.4)]:
   self.mock.set(key,value);s=self.await_state(lambda s:abs(s['fields'][key]['value']-value)<.0001)
   self.assertFalse(s['fields'][key]['writable']);self.assertEqual(self.write(key,1)[0],400)
   self.assertNotEqual(s['fields'][key]['value'],s['fields'][pairs[key]]['value'])
  self.assertEqual(self.mock.writes,[])
 def test_one_shared_real_symbol_and_original_hmi_bounds(self):
  s=self.await_state(lambda s:all(f['quality'] for f in s['fields'].values()))
  self.assertEqual(len(s['fields']),256);f=s['fields']['edgeSensitivity']
  self.assertEqual(f['symbol'],'.stKaliciData.rKenarKontrol_OluBolge');self.assertEqual(f['type'],'REAL')
  self.assertEqual((f['metadata']['actualSize'],f['min'],f['max']),(4,.1,10));self.assertEqual(f['unit'],'мм')
  self.assertEqual(sum(v['symbol']==f['symbol'] for v in s['fields'].values()),1)
  self.assertEqual(self.mock.writes,[])
 def test_operator_can_set_fractional_dead_zone_with_native_readback(self):
  self.assertEqual(self.state()['auth']['role'],'operator')
  for state in [5,4]:
   self.mock.set('machineState',state);self.mock.set('automatic',int(state==4));self.await_state(lambda s:s['fields']['machineState']['value']==state)
   for value in [.1,2.75,10]:
    status,_,body=self.write('edgeSensitivity',value);self.assertEqual(status,202)
    self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.mock.writes[-1],('edgeSensitivity',struct.pack('<f',value)))
  for value in [0,.09,10.01,11]:self.assertEqual(self.write('edgeSensitivity',value)[0],422)
 def test_presence_uses_common_configuration_including_legacy_zero(self):
  for count in [0,1,2,3,4]:
   self.mock.set('edgeChannelCount',count);self.await_state(lambda s:s['fields']['edgeChannelCount']['value']==count and s['fields']['edgeSensitivity']['bindingReady'])
  self.mock.set('edgeChannelCount',5);self.await_state(lambda s:not s['fields']['edgeSensitivity']['bindingReady'])
  self.assertEqual(self.write('edgeSensitivity',1)[0],409)
  self.mock.set('edgeChannelCount',3);self.await_state(lambda s:s['fields']['edgeSensitivity']['bindingReady'])
  self.mock.lookup_hook=lambda f:self.mock.set('edgeChannelCount',5)
  status,_,body=self.write('edgeSensitivity',1);self.assertEqual(status,202)
  self.assertEqual(self.terminal(body)['status'],'rejected');self.assertEqual(self.mock.writes,[])
 def test_other_hmi_changes_are_not_overwritten(self):
  s=self.state();self.mock.set('edgeSensitivity',.75)
  body=dict(id=str(uuid.uuid4()),key='edgeSensitivity',value=1,expected=s['fields']['edgeSensitivity']['raw'],epoch=s['epoch'])
  status,_=self.request('POST','/api/write',body)
  if status==202:self.assertEqual(self.terminal(body)['status'],'conflict')
  else:self.assertEqual(status,409)
  self.assertEqual(self.mock.writes,[])
 def test_live_type_and_writable_metadata_are_required_and_no_lost_ack_retry(self):
  self.mock.fields['edgeSensitivity']['flags']=32
  status,_,body=self.write('edgeSensitivity',1);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'rejected')
  self.assertEqual(self.mock.writes,[]);self.mock.fields['edgeSensitivity']['flags']=1
  self.mock.behavior='lost_ack';status,_,body=self.write('edgeSensitivity',1);self.assertEqual(status,202)
  self.assertEqual(self.terminal(body)['status'],'uncertain');self.await_state(lambda s:s['connected'] and s['fields']['edgeSensitivity']['value']==1)
  time.sleep(.25);self.assertEqual(len(self.mock.writes),1)

if __name__=='__main__':unittest.main(verbosity=2)
