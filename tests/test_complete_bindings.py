"""Restored HMI controls: native backend and local ADS peer, no real PLC."""
import re,struct,time,unittest,uuid
import test_ads_integration as plc
import test_local_features as local
class Complete(unittest.TestCase):
 setUp=plc.Backend.setUp;tearDown=plc.Backend.tearDown
 request=plc.Backend.request;state=plc.Backend.state;await_state=plc.Backend.await_state;write=plc.Backend.write;terminal=plc.Backend.terminal
 restart=local.Features.restart
 def command(self,key,action='start',body=None):
  body=body or dict(key=key,action=action,id=str(uuid.uuid4()),epoch=self.state()['epoch'])
  status,data=self.request('POST','/api/command',body);return status,data,body
 def stop(self,body):return self.command(body['key'],body=dict(body,action='stop'))
 def test_all_visible_field_keys_are_bound(self):
  source=(plc.ROOT/'ui/index.html').read_text();keys=set(re.findall(r'data-(?:edit|value|node-reading|node-toggle)="([^"]+)"',source))-{'linear'}
  s=self.await_state(lambda s:all(v['quality'] for v in s['fields'].values()))
  self.assertEqual(keys-set(s['fields']),set());self.assertNotIn('data-unbound',source)
  self.assertEqual(s['fields']['glueMeanLength']['symbol'],'HotmeltUnite1.lrHesaplananUrunBoy')
  self.assertEqual(len(s['fields']),len(plc.rows));self.assertEqual(self.mock.writes,[])
 def test_dancer_reference_changes_and_invalid_index_are_not_hardcoded(self):
  self.mock.set('dancer1Reference',7);s=self.await_state(lambda s:s['fields']['dancer1Position']['value']==21)
  self.assertEqual(s['fields']['dancer1Position']['sourceIndex'],7)
  self.mock.set('dancer1Reference',21);s=self.await_state(lambda s:not s['fields']['dancer1Position']['quality'])
  self.assertTrue(s['fields']['dancer2Position']['quality']);self.assertIsNone(s['fields']['dancer1Position']['value']);self.assertEqual(self.mock.writes,[])
 def test_limits_use_working_length_and_live_heat_configuration(self):
  self.mock.set('width',159);self.mock.set('workingLength',300);self.await_state(lambda s:s['fields']['glueWorkingDistance']['max']==300)
  status,_,body=self.write('glueWorkingDistance',250);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed')
  self.mock.set('heat1Limit',450);self.await_state(lambda s:s['fields']['heat1Set']['max']==450);self.assertEqual(self.write('heat1Set',451)[0],422)
  self.mock.lookup_hook=lambda f:self.mock.set('heat1Limit',430)
  count=len(self.mock.writes);status,_,body=self.write('heat1Set',445);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'rejected');self.assertEqual(len(self.mock.writes),count)
 def test_waiting_quantity_tracks_both_live_bounds(self):
  self.mock.set('waitingMinimum',2);self.mock.set('waitingLimit',35)
  s=self.await_state(lambda s:s['fields']['waitingQty']['min']==2 and s['fields']['waitingQty']['max']==35)
  self.assertEqual(self.write('waitingQty',1)[0],422);self.assertEqual(self.write('waitingQty',36)[0],422)
  status,_,body=self.write('waitingQty',34);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed')
 def test_unwinder_and_edge_toggles_use_their_exact_flags(self):
  for key in ['edge1Auto','edge2Reverse','edge3Auto']:
   before=self.state()['fields'][key]['value'];status,_,body=self.write(key,1-int(before));self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.mock.writes[-1][0],key)
  self.mock.set('unwinderSensorPresent',0);self.await_state(lambda s:not s['fields']['unwinderAutoStop']['bindingReady']);self.assertEqual(self.write('unwinderAutoStop',1)[0],400)
 def test_knife_fields_and_apply_require_engineer_in_any_machine_state(self):
  self.assertEqual(self.write('jawOffset',1)[0],403);self.assertEqual(self.command('knifeSave')[0],403)
  self.assertEqual(self.request('POST','/api/auth/setup',{'password':'246810'})[0],200)
  values={'feedStartSet':12,'feedStopSet':250,'jawOffset':1,'jawServoGearQuantity':20,'jawGearQuantity':30,'jawWeldingAngleWindow':5,'jawJogSpeed':80,'moonstepAccCoefficient':2,'moonstepDecCoefficient':3,'ceneHizAdimi':4,'sistemBaslangicHizi':50,'ceneMaksIvme':20,'ceneMaksHiz':3000,'ceneTrafoManRef':25}
  for key,value in values.items():
   status,_,body=self.write(key,value);self.assertEqual(status,202,key);self.assertEqual(self.terminal(body)['status'],'confirmed',key)
  status,_,body=self.command('knifeSave');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.mock.writes[-2:],[('knifeSave',b'\1'),('knifeSave',b'\0')])
  self.mock.set('automatic',1);self.await_state(lambda s:s['fields']['automatic']['value']==1);status,_,body=self.write('jawOffset',2);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed')
 def test_all_nine_manual_commands_release_and_generic_writes_are_closed(self):
  keys=[k for k,v in self.state()['commands'].items() if v['kind']==1];self.assertEqual(len(keys),9)
  for key in keys:
   with self.subTest(key=key):
    self.assertEqual(self.write(key,1)[0],400);status,_,body=self.command(key);self.assertEqual(status,202)
    self.await_state(lambda s:s['commandLease']['active']);self.assertEqual(self.stop(body)[0],202)
    self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.mock.writes[-2:],[(key,b'\1'),(key,b'\0')])
 def test_lease_expires_without_heartbeat_and_never_reasserts(self):
  status,_,body=self.command('takeoffJog');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed')
  self.assertEqual(self.mock.writes,[('takeoffJog',b'\1'),('takeoffJog',b'\0')]);self.assertFalse(self.state()['commandLease']['pendingRelease'])
  self.assertEqual(self.command('takeoffJog',body=body)[0],202);time.sleep(.3);self.assertEqual(len(self.mock.writes),2)
 def test_opposite_from_original_hmi_is_never_overwritten(self):
  self.mock.set('ejectJogBw',1);self.await_state(lambda s:s['fields']['ejectJogBw']['value']==1)
  status,_,body=self.command('ejectJogFw');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'rejected');self.assertEqual(self.mock.writes,[])
  self.assertEqual(self.mock.fields['ejectJogBw']['raw'],b'\1')
 def test_pulses_and_toggles_preserve_hmi_semantics(self):
  status,_,body=self.command('glueReset');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.mock.writes,[('glueReset',b'\1'),('glueReset',b'\0')])
  for key in ['photoReset','glueTest']:
   for expected in [b'\1',b'\0']:
    status,_,body=self.command(key);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.mock.writes[-1],(key,expected))
 def test_lost_assert_ack_only_releases_after_reconnection(self):
  self.mock.behavior='lost_ack';status,_,body=self.command('edge1JogFw');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'uncertain')
  self.await_state(lambda s:s['connected'] and not s['commandLease']['pendingRelease'],timeout=10)
  self.assertEqual(self.mock.writes,[('edge1JogFw',b'\1'),('edge1JogFw',b'\0')])
 def test_persisted_assertion_is_cleared_on_restart_without_resuming_motion(self):
  status,_,body=self.command('takeoffJog');self.assertEqual(status,202);self.await_state(lambda s:s['commandLease']['active'])
  self.proc.kill();self.proc.wait();self.restart();self.await_state(lambda s:s['connected'] and not s['commandLease']['pendingRelease'],timeout=10)
  self.assertEqual(self.mock.writes,[('takeoffJog',b'\1'),('takeoffJog',b'\0')])
 def test_alarm_ids_and_ack_do_not_clear_an_existing_cause(self):
  with self.mock.lock:
   for slot,id_,en in [(1,93,1),(2,133,0)]:
    at=slot*49;struct.pack_into('<hh',self.mock.alarms,at,10,id_);self.mock.alarms[at+48]=en;self.mock.alarms[at+8:at+27]=b'2026-10-15 18:00:00'
  s=self.await_state(lambda s:s['alarms']['activeCount']==2);self.assertEqual([r['id'] for r in s['alarms']['records']],[93,133])
  status,_,body=self.command('alarmAck');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed')
  s=self.await_state(lambda s:s['alarms']['activeCount']==1);self.assertEqual([r['state'] for r in s['alarms']['records']],[10,20])
  status,_,body=self.command('alarmClear');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed')
  s=self.await_state(lambda s:len(s['alarms']['records'])==1);self.assertTrue(s['alarms']['quality']);self.assertEqual(s['alarms']['records'][0]['id'],93)
 def test_alarm_layout_mismatch_is_unavailable_not_no_alarms(self):
  self.mock.metadata_overrides['__alarm_EN']={'size':2};old=self.state()['epoch'];self.mock.version+=1
  s=self.await_state(lambda s:s['epoch']>old and s['connected'] and not s['alarms']['quality']);self.assertTrue(s['fields']['current']['quality']);self.assertEqual(self.mock.writes,[])
if __name__=='__main__':unittest.main(verbosity=2)
