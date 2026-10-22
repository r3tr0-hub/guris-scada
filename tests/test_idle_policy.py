"""Idle-speed policy, isolated from the manual-command state policy."""
import struct,unittest
import test_ads_integration as plc
import test_local_features as local
import test_complete_bindings as complete

class IdlePolicy(unittest.TestCase):
    setUp=local.Features.setUp;tearDown=local.Features.tearDown
    request=local.Features.request;state=local.Features.state;await_state=local.Features.await_state
    write=local.Features.write;terminal=local.Features.terminal;boost=local.Features.boost;normal=local.Features.normal
    command=complete.Complete.command
    def machine(self,number,automatic=0):
        self.mock.set('machineState',number);self.mock.set('automatic',automatic)
        return self.await_state(lambda s:s['fields']['machineState']['value']==number and s['fields']['automatic']['value']==automatic)
    def test_other_states_reject_manual_normal_and_boost_without_writes(self):
        for state in list(range(13))+[14,15]:
            with self.subTest(state=state):
                self.machine(state)
                self.assertEqual(self.boost()[0],409)
                self.assertEqual(self.write('beltIdleSpeed',10)[0],409)
        self.assertEqual(self.mock.writes,[])
    def test_13_accepts_boost_accumulation_and_manual_return(self):
        status,_,body=self.boost();self.assertEqual(status,202)
        self.assertEqual(self.terminal(body)['status'],'confirmed')
        self.assertEqual(self.boost()[0],202);self.assertEqual(self.boost()[0],202);self.assertEqual(self.boost()[0],202)
        s=self.state();self.assertGreater(s['cleaning']['remainingMs'],178000);self.assertLessEqual(s['cleaning']['remainingMs'],180000)
        self.normal();self.assertEqual(self.mock.writes,[('beltIdleSpeed',struct.pack('<f',45)),('beltIdleSpeed',struct.pack('<f',10))])
    def test_13_still_requires_auto_off_and_fresh_state(self):
        self.machine(13,1);self.assertEqual(self.boost()[0],409);self.assertEqual(self.write('beltIdleSpeed',10)[0],409)
        self.machine(13,0);self.mock.read_errors['machineState']=0x701
        self.await_state(lambda s:not s['fields']['machineState']['quality'])
        self.assertEqual(self.boost()[0],409);self.assertEqual(self.write('beltIdleSpeed',10)[0],409)
        self.assertEqual(self.mock.writes,[])
    def test_live_state_change_before_boost_write_rejects_45(self):
        self.mock.lookup_hook=lambda f:self.mock.set('machineState',5)
        status,_,body=self.boost();self.assertEqual(status,202)
        s=self.await_state(lambda s:any(t['id']==body['id'] for t in s['history']))
        tx=next(t for t in s['history'] if t['id']==body['id'])
        self.assertEqual(tx['status'],'rejected');self.assertIn('Машина не готова',tx['message'])
        self.await_state(lambda s:not s['cleaning']['pendingRestore'])
        self.assertFalse(any(k=='beltIdleSpeed' and v==struct.pack('<f',45) for k,v in self.mock.writes))
    def test_leaving_13_returns_10_even_when_controls_are_blocked(self):
        status,_,body=self.boost();self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed')
        self.machine(2)
        s=self.await_state(lambda s:not s['busy'] and not s['cleaning']['pendingRestore'] and s['fields']['beltIdleSpeed']['value']==10)
        self.assertFalse(s['cleaning']['active']);self.assertEqual(self.boost()[0],409)
        self.assertEqual(self.mock.writes,[('beltIdleSpeed',struct.pack('<f',45)),('beltIdleSpeed',struct.pack('<f',10))])
    def test_live_state_change_before_generic_normal_write_is_rejected(self):
        self.mock.lookup_hook=lambda f:self.mock.set('machineState',5)
        status,_,body=self.write('beltIdleSpeed',10);self.assertEqual(status,202)
        self.assertEqual(self.terminal(body)['status'],'rejected');self.assertEqual(self.mock.writes,[])
    def test_manual_commands_keep_5_6_9_and_reject_13(self):
        for state in [5,6,9]:
            self.machine(state);status,_,body=self.command('glueReset');self.assertEqual(status,202)
            self.assertEqual(self.terminal(body)['status'],'confirmed')
        self.machine(13);self.assertEqual(self.command('glueReset')[0],409)
        self.assertEqual(sum(k=='glueReset' and value==b'\1' for k,value in self.mock.writes),3)

if __name__=='__main__':unittest.main(verbosity=2)
