"""Photomark teaching against the native backend and a loopback ADS peer."""
import collections,time,unittest,uuid
import test_ads_integration as plc
class Photomark(unittest.TestCase):
    tearDown=plc.Backend.tearDown
    request=plc.Backend.request
    state=plc.Backend.state
    await_state=plc.Backend.await_state
    write=plc.Backend.write
    terminal=plc.Backend.terminal
    def setUp(self):
        plc.Backend.setUp(self)
        self.await_state(lambda s:all(f['quality'] for f in s['fields'].values()))
    def teach(self,value,body=None):
        s=self.state()
        body=body or dict(key='photoReset',action='set',value=value,expected=s['fields']['photoReset']['raw'],id=str(uuid.uuid4()),epoch=s['epoch'])
        status,data=self.request('POST','/api/command',body)
        return status,data,body
    def accepted(self,value,body=None):
        status,_,body=self.teach(value,body);self.assertEqual(status,202)
        tx=self.terminal(body);self.assertEqual(tx['status'],'confirmed',tx)
        return tx,body
    def test_latch_zero_manual_feed_and_finish_keep_the_measured_offset(self):
        self.mock.set('photoOffsetTenths',15)
        tx,_=self.accepted(1);self.assertEqual(tx['actual'],1)
        s=self.await_state(lambda s:s['fields']['photoOffsetTenths']['value']==0)
        self.assertFalse(s['fields']['photoOffsetTenths']['writable'])
        time.sleep(.85) # Longer than the manual-command lease: teaching stays on.
        self.assertEqual(self.state()['fields']['photoReset']['value'],1)
        for value in [3.5,17.25,43.5]:
            self.mock.set('photoOffsetTenths',value)
            self.await_state(lambda s:s['fields']['photoOffsetTenths']['value']==value)
        self.assertEqual(self.write('photoOffsetTenths',20)[0],409)
        tx,_=self.accepted(0);self.assertEqual(tx['actual'],0)
        s=self.await_state(lambda s:s['fields']['photoOffsetTenths']['writable'])
        self.assertEqual(s['fields']['photoOffsetTenths']['value'],43.5)
        self.assertEqual(self.mock.writes,[('photoReset',b'\1'),('photoReset',b'\0')])
    def test_repeated_enable_is_idempotent_and_does_not_zero_again(self):
        _,body=self.accepted(1);self.mock.set('photoOffsetTenths',22)
        self.await_state(lambda s:s['fields']['photoOffsetTenths']['value']==22)
        self.assertEqual(self.teach(1,body)[0],202)
        tx,_=self.accepted(1);self.assertFalse(tx['sent'])
        self.assertEqual(self.state()['fields']['photoOffsetTenths']['value'],22)
        self.assertEqual(self.mock.writes,[('photoReset',b'\1')])
        self.assertEqual(self.teach(0,dict(body,value=0))[0],409)
    def test_plc_clears_on_start_and_late_finish_cannot_reenable(self):
        self.accepted(1);s=self.state()
        body=dict(key='photoReset',action='set',value=0,expected='01',id=str(uuid.uuid4()),epoch=s['epoch'])
        self.mock.set('machineState',4);self.mock.set('automatic',1);self.mock.set('photoReset',0)
        self.await_state(lambda s:s['fields']['photoReset']['value']==0 and s['fields']['automatic']['value']==1)
        tx,_=self.accepted(0,body);self.assertEqual(tx['actual'],0);self.assertFalse(tx['sent'])
        self.assertEqual(self.mock.writes,[('photoReset',b'\1')])
        self.assertEqual(self.teach(1)[0],409)
    def test_manual_offset_correction_remains_available_during_automatic_run(self):
        self.mock.set('machineState',4);self.mock.set('automatic',1)
        self.await_state(lambda s:s['fields']['automatic']['value']==1)
        status,_,body=self.write('photoOffsetTenths',42.5);self.assertEqual(status,202)
        self.assertEqual(self.terminal(body)['actual'],42.5)
    def test_offset_limits_follow_working_length_in_mm(self):
        self.mock.set('width',150);self.mock.set('workingLength',200)
        s=self.await_state(lambda s:s['fields']['photoOffsetTenths']['max']==200)
        self.assertEqual(s['fields']['photoOffsetTenths']['min'],0)
        self.assertEqual(self.write('photoOffsetTenths',-.5)[0],422)
        self.assertEqual(self.write('photoOffsetTenths',200.5)[0],422)
        status,_,body=self.write('photoOffsetTenths',199.5);self.assertEqual(status,202)
        self.assertEqual(self.terminal(body)['status'],'confirmed')
        self.mock.lookup_hook=lambda f:self.mock.set('workingLength',100)
        status,_,body=self.write('photoOffsetTenths',150);self.assertEqual(status,202)
        count=len(self.mock.writes);self.assertEqual(self.terminal(body)['status'],'rejected')
        self.assertEqual(len(self.mock.writes),count)
    def test_hmi_starting_teach_before_the_write_blocks_offset(self):
        self.mock.lookup_hook=lambda f:self.mock.set('photoReset',1)
        status,_,body=self.write('photoOffsetTenths',20);self.assertEqual(status,202)
        self.assertEqual(self.terminal(body)['status'],'rejected');self.assertEqual(self.mock.writes,[])
    def test_average_length_is_readonly_and_window_keeps_native_limits(self):
        self.assertEqual(self.write('photoLength',100)[0],400)
        self.mock.set('workingLength',200)
        s=self.await_state(lambda s:s['fields']['photoSearchWindow']['max']==200)
        self.assertEqual(s['fields']['photoSearchWindow']['min'],1)
        self.assertEqual(self.write('photoSearchWindow',0)[0],422)
        self.assertEqual(self.write('photoSearchWindow',201)[0],422)
        self.assertEqual(self.mock.writes,[])
    def test_acknowledgement_without_changed_plc_bit_is_not_success(self):
        commit=self.mock.commit
        self.mock.commit=lambda f,v:None if f['key']=='photoReset' else commit(f,v)
        status,_,body=self.teach(1);self.assertEqual(status,202)
        tx=self.terminal(body);self.assertEqual(tx['status'],'not_applied');self.assertEqual(tx['actual'],0)
        self.assertEqual(self.mock.writes,[('photoReset',b'\1')])
    def test_lost_ack_is_not_replayed_after_reconnect(self):
        self.mock.behavior='lost_ack'
        status,_,body=self.teach(1);self.assertEqual(status,202)
        self.assertEqual(self.terminal(body)['status'],'uncertain')
        self.await_state(lambda s:s['connected'] and s['fields']['photoReset']['value']==1,timeout=10)
        time.sleep(.3);self.assertEqual(self.mock.writes,[('photoReset',b'\1')])
    def test_learning_values_poll_with_fast_counters(self):
        self.mock.reads.clear();time.sleep(1.2)
        counts=collections.Counter(k for _,k in self.mock.reads)
        self.assertGreaterEqual(counts['photoReset'],9,counts)
        self.assertEqual(counts['photoOffsetTenths'],counts['photoReset'])
        self.assertLessEqual(counts['photoLength'],4)
        self.assertEqual(self.mock.writes,[])
    def test_explicit_set_is_restricted_and_validated(self):
        s=self.state()
        body=dict(key='photoReset',action='set',value=1,expected='00',id=str(uuid.uuid4()),epoch=s['epoch'])
        for change in [dict(key='glueTest'),dict(value=2),dict(value=-1),dict(expected='ff'),dict(expected='gg'),dict(expected=''),dict(unexpected=1)]:
            self.assertEqual(self.teach(1,dict(body,**change))[0],400,change)
        self.assertEqual(self.mock.writes,[])
    def test_teaching_state_unavailable_blocks_manual_offset(self):
        self.mock.read_errors['photoReset']=0x701
        self.await_state(lambda s:not s['fields']['photoReset']['quality'])
        self.assertFalse(self.state()['fields']['photoOffsetTenths']['writable'])
        self.assertEqual(self.write('photoOffsetTenths',12)[0],409)
        self.assertEqual(self.mock.writes,[])
if __name__=='__main__':unittest.main(verbosity=2)

