"""Unified conveyor switching against the real C backend and loopback ADS only."""
import json,pathlib,struct,time,unittest,uuid
import test_local_features as local

class ConveyorModes(unittest.TestCase):
    setUp=local.Features.setUp
    tearDown=local.Features.tearDown
    state=local.Features.state
    await_state=local.Features.await_state
    terminal=local.Features.terminal
    request=local.Features.request
    write=local.Features.write
    restart=local.Features.restart

    def mode(self,name,**override):
        s=self.state();body=dict(id=str(uuid.uuid4()),mode=name,epoch=s['epoch'],expectedTimed=s['fields']['beltTimed']['raw'],expectedContinuous=s['fields']['conveyorContinuous']['raw']);body.update(override)
        return (*self.request('POST','/api/conveyor-mode',body),body)

    def pair(self,timed,continuous):
        self.mock.set('beltTimed',timed);self.mock.set('conveyorContinuous',continuous)
        return self.await_state(lambda s:s['fields']['beltTimed']['value']==timed and s['fields']['conveyorContinuous']['value']==continuous)

    def hook_write(self,key,behavior):
        original=self.mock.answer
        def answer(cmd,q):
            if cmd==3:
                _,offset,_=struct.unpack_from('<III',q,38)
                if self.mock.addresses[offset]['key']==key:self.mock.behavior=behavior
            return original(cmd,q)
        self.mock.answer=answer

    def test_all_transitions_preserve_hidden_values_and_never_set_both_bits(self):
        saved={k:self.mock.names[self.state()['fields'][k]['symbol'].upper()]['raw'] for k in ['beltTime1','beltTime2','beltTime3','conveyorTime1','conveyorTime2']}
        expected={'off':(0,0),'timed':(1,0),'continuous':(0,1)}
        for role in ['operator','engineer']:
            if role=='engineer':self.assertEqual(self.request('POST','/api/auth/setup',{'password':'281031'})[0],200)
            for source in expected:
                for target in expected:
                    self.pair(*expected[source]);before=len(self.mock.writes)
                    status,_,body=self.mode(target);self.assertEqual(status,202,(source,target));tx=self.terminal(body)
                    self.assertEqual(tx['status'],'confirmed',tx);self.assertEqual(tx['kind'],'conveyor_mode');self.assertEqual(tx['actual'],['off','timed','continuous'].index(target));self.assertEqual(tx['actor'],'local-'+role)
                    pair=list(expected[source])
                    for key,raw in self.mock.writes[before:]:
                        self.assertIn(key,['beltTimed','conveyorContinuous']);pair[key=='conveyorContinuous']=raw[0];self.assertNotEqual(pair,[1,1])
                    self.assertEqual(tuple(pair),expected[target])
                    for key,raw in saved.items():self.assertEqual(self.mock.names[self.state()['fields'][key]['symbol'].upper()]['raw'],raw,key)

    def test_partial_rejection_stays_off_and_does_not_rollback(self):
        self.pair(1,0);self.hook_write('conveyorContinuous','reject')
        status,_,body=self.mode('continuous');self.assertEqual(status,202);tx=self.terminal(body)
        self.assertEqual(tx['status'],'partial',tx);self.assertEqual(tx['confirmedSteps'],1);self.assertEqual(tx['actual'],0)
        self.assertEqual(self.mock.writes,[('beltTimed',b'\0'),('conveyorContinuous',b'\1')]);time.sleep(.3);self.assertEqual(len(self.mock.writes),2)
        self.assertEqual(self.state()['conveyor']['mode'],'off')

    def test_first_rejected_or_ignored_step_never_enables_second(self):
        for behavior,status in [('reject','rejected'),('ignore','not_applied')]:
            with self.subTest(behavior=behavior):
                self.pair(1,0);self.mock.writes.clear();self.mock.behavior=behavior
                code,_,body=self.mode('continuous');self.assertEqual(code,202);tx=self.terminal(body)
                self.assertEqual(tx['status'],status,tx);self.assertEqual(self.mock.writes,[('beltTimed',b'\0')]);self.assertEqual(tx['confirmedSteps'],0)

    def test_lost_ack_first_step_is_uncertain_without_retry_or_enable(self):
        self.pair(1,0);self.mock.behavior='lost_ack';status,_,body=self.mode('continuous');self.assertEqual(status,202)
        self.assertEqual(self.terminal(body)['status'],'uncertain');time.sleep(.5)
        self.assertEqual(self.mock.writes,[('beltTimed',b'\0')]);self.await_state(lambda s:s['connected'],timeout=8)
        self.assertEqual(self.mock.writes,[('beltTimed',b'\0')]);self.assertEqual(self.state()['operation']['status'],'uncertain')

    def test_lost_ack_second_step_is_uncertain_even_if_later_bits_match(self):
        self.pair(1,0);self.hook_write('conveyorContinuous','lost_ack');status,_,body=self.mode('continuous');self.assertEqual(status,202)
        tx=self.terminal(body);self.assertEqual(tx['status'],'uncertain');self.assertEqual(tx['confirmedSteps'],1)
        self.await_state(lambda s:s['connected'] and s['conveyor']['mode']=='continuous',timeout=8)
        self.assertEqual(self.state()['operation']['status'],'uncertain');self.assertEqual(len(self.mock.writes),2)

    def test_conflict_is_explicit_and_only_off_can_normalize_it(self):
        self.pair(1,1);self.assertEqual(self.state()['conveyor']['mode'],'conflict')
        for name in ['timed','continuous']:self.assertEqual(self.mode(name)[0],409)
        self.assertEqual(self.mock.writes,[]);status,_,body=self.mode('off');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed')
        self.assertEqual(self.mock.writes,[('beltTimed',b'\0'),('conveyorContinuous',b'\0')])

    def test_stale_expected_generation_metadata_and_generic_bypass_are_rejected(self):
        for key in ['beltTimed','conveyorContinuous']:self.assertEqual(self.write(key,1)[0],400)
        self.assertEqual(self.mode('off',expectedTimed='00')[0],409)
        self.assertEqual(self.mode('off',epoch=0)[0],409)
        self.assertEqual(self.mode('other')[0],400);self.assertEqual(self.mode('off',expectedContinuous='02')[0],400)
        s=self.state();f=self.mock.names[s['fields']['beltTimed']['symbol'].upper()];f['flags']|=32
        status,_,body=self.mode('off');self.assertIn(status,[202,409])
        if status==202:self.assertEqual(self.terminal(body)['status'],'rejected')
        self.assertEqual(self.mock.writes,[])

    def test_global_busy_and_idempotency_cover_the_entire_group(self):
        self.pair(1,0);self.mock.behavior='ignore';status,_,body=self.mode('continuous');self.assertEqual(status,202)
        self.await_state(lambda s:s['busy'])
        self.assertEqual(self.mode('off')[0],409);self.assertEqual(self.write('width',250)[0],409)
        self.assertEqual(self.request('POST','/api/conveyor-mode',body)[0],202)
        changed=dict(body,mode='off');self.assertEqual(self.request('POST','/api/conveyor-mode',changed)[0],409)
        self.assertEqual(self.terminal(body)['status'],'not_applied');self.assertEqual(len(self.mock.writes),1)

    def test_role_and_ads_run_guards_without_new_machine_state_lock(self):
        for code in [0,4,5,9,13,14]:
            self.mock.set('machineState',code);self.mock.set('automatic',1);self.pair(0,0)
            self.await_state(lambda s:s['fields']['machineState']['value']==code)
            status,_,body=self.mode('timed');self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed')
        self.mock.ads_state=6;self.await_state(lambda s:s['adsState']==6)
        self.assertFalse(self.state()['conveyor']['available']);self.assertEqual(self.mode('off')[0],409)

    def test_restart_does_not_resume_partial_group(self):
        self.pair(1,0);self.hook_write('conveyorContinuous','reject');_,_,body=self.mode('continuous');self.assertEqual(self.terminal(body)['status'],'partial')
        self.restart();time.sleep(.3);self.assertEqual(len(self.mock.writes),2);self.assertEqual(self.state()['conveyor']['mode'],'off')

if __name__=='__main__':unittest.main()
