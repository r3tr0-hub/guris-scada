"""Operator policy and reset checks, against the local ADS peer only."""
import json,pathlib,time,unittest,uuid
import test_ads_integration as plc
import test_local_features as local
class OperatorFixes(unittest.TestCase):
 setUp=plc.Backend.setUp;tearDown=plc.Backend.tearDown;request=local.Features.request
 state=plc.Backend.state;await_state=plc.Backend.await_state;write=plc.Backend.write;terminal=plc.Backend.terminal;reset=plc.Backend.reset;restart=local.Features.restart
 def guard(self,mode,override=None):
  s=self.state();body=dict(id=str(uuid.uuid4()),mode=mode,epoch=s['epoch'],expected=s['fields']['unwinderAutoStop']['raw']);body.update(override or {})
  return (*self.request('POST','/api/unwinder',body),body)
 def test_temporary_disable_enable_and_dedicated_api(self):
  s=self.await_state(lambda s:s['unwinder']['available']);self.assertEqual(s['unwinder']['mode'],'normal');self.assertFalse(s['fields']['unwinderAutoStop']['writable']);self.assertEqual(self.write('unwinderAutoStop',0)[0],400)
  status,_,body=self.guard('temporary');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed');s=self.state();self.assertEqual(s['fields']['unwinderAutoStop']['value'],0);self.assertTrue(295000<s['unwinder']['remainingMs']<=300000)
  deadline=s['unwinder']['remainingMs'];self.assertEqual(self.guard('temporary')[0],409);self.assertLessEqual(self.state()['unwinder']['remainingMs'],deadline)
  self.restart();s=self.await_state(lambda s:s['unwinder']['mode']=='temporary');self.assertLessEqual(s['unwinder']['remainingMs'],deadline+5)
  status,_,body=self.guard('enable');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.state()['unwinder']['mode'],'normal');self.assertEqual(self.mock.writes,[('unwinderAutoStop',b'\0'),('unwinderAutoStop',b'\1')])
 def test_permanent_requires_engineer_and_survives_restart(self):
  self.await_state(lambda s:s['unwinder']['available']);self.assertEqual(self.guard('permanent')[0],403);self.assertEqual(self.request('POST','/api/auth/setup',{'password':'246810'})[0],200)
  status,_,body=self.guard('permanent');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.restart();s=self.await_state(lambda s:s['unwinder']['mode']=='permanent');self.assertEqual(s['fields']['unwinderAutoStop']['value'],0);self.assertEqual(len(self.mock.writes),1)
  status,_,body=self.guard('enable');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.state()['unwinder']['mode'],'normal')
 def test_expired_journal_and_no_late_repeat_of_disable(self):
  self.await_state(lambda s:s['unwinder']['available']);status,_,body=self.guard('temporary');self.assertEqual(status,202);self.terminal(body)
  path=pathlib.Path(self.tmp.name)/'local/unwinder.json';data=json.loads(path.read_text());data['started']=int(time.time()*1000)-400000;data['until']=data['started']+300000;path.write_text(json.dumps(data))
  self.restart();self.await_state(lambda s:s['unwinder']['mode']=='normal' and s['fields']['unwinderAutoStop']['value']==1);self.assertEqual(self.mock.writes,[('unwinderAutoStop',b'\0'),('unwinderAutoStop',b'\1')])
 def test_lost_disable_ack_restores_instead_of_reasserting(self):
  self.await_state(lambda s:s['unwinder']['available']);self.mock.behavior='lost_ack';status,_,body=self.guard('temporary');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'uncertain');self.mock.behavior='normal'
  self.await_state(lambda s:s['unwinder']['mode']=='normal',timeout=9);self.assertEqual(self.mock.writes,[('unwinderAutoStop',b'\0'),('unwinderAutoStop',b'\1')])
 def test_legacy_edge_count_zero_keeps_three_readouts(self):
  self.mock.set('edgeChannelCount',0);s=self.await_state(lambda s:s['fields']['edgeChannelCount']['value']==0)
  for channel in range(1,4):
   for suffix in ['Auto','Reverse','Position']:self.assertTrue(s['fields'][f'edge{channel}{suffix}']['quality'])
  self.mock.set('edgeChannelCount',2);s=self.await_state(lambda s:not s['fields']['edge3Position']['quality']);self.assertTrue(s['fields']['edge2Position']['quality']);self.mock.set('edgeChannelCount',5);self.await_state(lambda s:not s['fields']['edge1Position']['quality'])
 def test_current_counter_uses_the_native_reset_pulse(self):
  self.await_state(lambda s:s['fields']['current']['resettable']);self.assertEqual(self.write('current',0)[0],400);status,_,body=self.reset('current');self.assertEqual(status,202);tx=self.terminal(body);self.assertEqual(tx['status'],'confirmed');self.assertEqual(tx['actual'],0);self.assertEqual(self.mock.writes,[('currentReset',b'\1'),('currentReset',b'\0')])
 def test_exit_visibility_persists_and_old_options_preserve_it(self):
  self.assertTrue(self.state()['options']['exitButton']);self.assertEqual(self.request('POST','/api/options',dict(snow=1,animations=1,wallpaper=1,exitButton=0))[0],403);self.request('POST','/api/auth/setup',{'password':'246810'})
  self.assertEqual(self.request('POST','/api/options',dict(snow=1,animations=1,wallpaper=1,exitButton=0))[0],200);self.assertFalse(self.state()['options']['exitButton']);self.request('POST','/api/options',dict(snow=1,animations=1,wallpaper=1));self.assertFalse(self.state()['options']['exitButton']);self.restart();self.assertFalse(self.state()['options']['exitButton'])
 def test_corrupt_journal_never_sends_unscoped_writes(self):
  self.proc.kill();self.proc.wait();path=pathlib.Path(self.tmp.name)/'local';path.mkdir(exist_ok=True);(path/'unwinder.json').write_text('{truncated');self.mock.set('unwinderAutoStop',0);self.restart();s=self.await_state(lambda s:s['unwinder']['storageError']);self.assertEqual(self.mock.writes,[]);self.assertEqual(self.guard('temporary')[0],409)
  status,_,body=self.guard('enable');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertFalse(self.state()['unwinder']['storageError']);self.assertEqual(self.mock.writes,[('unwinderAutoStop',b'\1')])
 def test_pending_guard_never_writes_to_another_plc(self):
  self.await_state(lambda s:s['unwinder']['available']);status,_,body=self.guard('temporary');self.assertEqual(status,202);self.terminal(body);path=pathlib.Path(self.tmp.name)/'local/unwinder.json';data=json.loads(path.read_text());data.update(ip='192.0.2.10',started=1,until=2);path.write_text(json.dumps(data));self.restart();self.await_state(lambda s:s['unwinder']['mode']=='restoring');time.sleep(.2);self.assertEqual(self.mock.writes,[('unwinderAutoStop',b'\0')]);self.assertEqual(self.state()['fields']['unwinderAutoStop']['value'],0)
 def test_startup_without_a_bypass_journal_restores_normal_monitoring(self):
  self.proc.kill();self.proc.wait();(pathlib.Path(self.tmp.name)/'local/unwinder.json').unlink(missing_ok=True);self.mock.set('unwinderAutoStop',0);self.restart();self.await_state(lambda s:s['unwinder']['mode']=='normal' and s['fields']['unwinderAutoStop']['value']==1);self.assertEqual(self.mock.writes,[('unwinderAutoStop',b'\1')])
 def test_quit_restores_temporary_unwinder_before_process_exit(self):
  self.await_state(lambda s:s['unwinder']['available']);status,_,body=self.guard('temporary');self.assertEqual(status,202);self.terminal(body);self.assertEqual(self.request('POST','/api/quit',{})[0],202);self.proc.wait(7);self.assertEqual(self.proc.returncode,0);self.assertEqual(self.mock.writes,[('unwinderAutoStop',b'\0'),('unwinderAutoStop',b'\1')])
if __name__=='__main__':unittest.main(verbosity=2)
