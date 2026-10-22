"""Measured menu parameters through the compiled native backend and loopback ADS only."""
import json,struct,time,unittest
import test_ads_integration as plc
class Bindings(unittest.TestCase):
    setUp=plc.Backend.setUp;tearDown=plc.Backend.tearDown
    request=plc.Backend.request;state=plc.Backend.state;await_state=plc.Backend.await_state;write=plc.Backend.write;terminal=plc.Backend.terminal
    def test_full_poll_over_64_and_large_report(self):
        s=self.await_state(lambda s:all(v['quality'] for v in s['fields'].values()))
        self.assertEqual(len(s['fields']),len(plc.rows))
        self.assertIn(64,self.mock.sum_batches);self.assertIn((len(plc.rows)-2)%64,self.mock.sum_batches)
        self.assertLessEqual(max(self.mock.sum_batches),64)
        status,report=self.request('GET','/api/report');self.assertEqual(status,200)
        self.assertGreater(len(json.dumps(report,ensure_ascii=False).encode()),48000)
        self.assertTrue(report['fields']['edge3Reverse']['quality']);self.assertEqual(self.mock.writes,[])
        # An error in the second packet belongs only to its own item.
        self.mock.read_errors['photoMissLimit']=0x701
        bad=self.await_state(lambda s:not s['fields']['photoMissLimit']['quality'])
        self.assertEqual(bad['fields']['photoMissLimit']['error'],0x701)
        self.assertTrue(bad['fields']['airStartAngle']['quality']);self.assertTrue(bad['fields']['current']['quality'])
        self.mock.read_errors.clear()
        self.await_state(lambda s:s['fields']['photoMissLimit']['quality'])
        # Changed symbol version across packets discards the cycle and re-resolves.
        epoch=self.state()['epoch'];self.mock.version_on_sum=len(self.mock.sum_batches)+1
        self.await_state(lambda s:s['connected'] and s['epoch']>epoch and all(v['quality'] for v in s['fields'].values()))
        self.assertEqual(self.mock.writes,[])
    def test_every_new_writable_uses_its_declared_type_and_readback(self):
        entries=json.loads((plc.ROOT/'docs/PARAMETER_BINDINGS.json').read_text())['entries']
        self.assertEqual(self.request('POST','/api/auth/setup',{'password':'246810'})[0],200)
        core_keys={row[0] for row in plc.rows}
        for entry in entries:
            if entry['key'] not in core_keys:continue  # Scoped engineering fields are exercised by test_release24.
            if not entry['writable'] or entry['key']=='unwinderAutoStop':continue
            key=entry['key']
            self.mock.set('machineState',13 if key=='beltIdleSpeed' else 5);self.await_state(lambda s:s['fields']['machineState']['value']==(13 if key=='beltIdleSpeed' else 5))
            with self.subTest(key=key):
                if entry.get('gate'):
                    gate=entry['gate'];self.mock.set(gate,1);self.await_state(lambda s:s['fields'][gate]['value']==1)
                if key=='ejectSpeed':
                    self.mock.set('ejectSpeedEnabled',1);self.await_state(lambda s:s['fields']['ejectSpeedEnabled']['value']==1)
                s=self.state();f=s['fields'][key];self.assertTrue(f['bindingReady']);self.assertTrue(f['rangeReady'])
                value=1-int(f['value']) if f['type']=='BOOL' else min(f['max'],max(f['min'],int(f['value'])+1))
                if value==f['value'] and f['type']!='BOOL':value=max(f['min'],value-1)
                status,_,body=self.write(key,value);self.assertEqual(status,202)
                tx=self.terminal(body);self.assertEqual(tx['status'],'confirmed',tx);self.assertAlmostEqual(tx['actual'],value,places=4)
                self.assertEqual(self.mock.writes[-1],(key,struct.pack('<'+plc.FORMATS[f['type']],value/entry.get('scale',1) if f['type'] in ['REAL','LREAL'] else value)))
    def test_hmi_limits_and_derived_fields(self):
        for key,low,high in [('heat1Set',0,490),('heat2Set',0,300),('heat5Set',0,485),('heat6Set',0,100),('glueReference',1,32767),('glueSearchWindow',1,500),('glueMissLimit',3,20),('photoMissLimit',3,20),('tensionSet',-25,25),('takeoffOffset',-120,120),('ejectOffset',-75,75),('support1Time',0,500),('airStartAngle',0,360)]:
            self.assertEqual(self.write(key,low-1)[0],422,key);self.assertEqual(self.write(key,high+1)[0],422,key)
        for key in ['takeoffMoonstepValue','heat1Actual','liner1Diameter','glueEncoder','photoLength']:
            self.assertEqual(self.write(key,1)[0],400,key)
        self.assertEqual(self.write('support1Time',1.5)[0],422)
        self.assertEqual(self.write('glueMissLimit',3.5)[0],422)
        for key in ['support1Identity','heat1Identity']:self.assertEqual(self.write(key,1)[0],403)
        self.assertFalse(self.mock.writes)
        # Heater setpoint and valve duration are editable while their enables are off.
        for key,enable in [('heat2Set','heat2Enabled'),('support1Time','support1Enabled')]:
            self.mock.set(enable,0);self.await_state(lambda s:s['fields'][enable]['value']==0)
            status,_,body=self.write(key,80);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed')
    def test_dynamic_bag_width_limits_are_checked_again_before_write(self):
        self.mock.set('width',159);self.await_state(lambda s:s['fields']['glueWorkingDistance']['max']==159)
        for key in ['glueWorkingDistance','glueWithoutDistance','glueStartOffset','photoSearchWindow','photoOffsetTenths']:
            self.assertEqual(self.write(key,160)[0],422,key)
        self.assertEqual(self.write('glueStartOffset',-160)[0],422)
        status,_,body=self.write('glueStartOffset',-150);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed')
        count=len(self.mock.writes)
        self.mock.lookup_hook=lambda f:self.mock.set('width',100)
        status,_,body=self.write('glueWorkingDistance',150);self.assertEqual(status,202)
        self.assertEqual(self.terminal(body)['status'],'rejected');self.assertEqual(len(self.mock.writes),count)
    def test_channel_assignment_mismatch_blocks_cached_and_fresh_writes(self):
        for identity,target in [('heat1Identity','heat1Set'),('support1Identity','support1Time')]:
            original=self.state()['fields'][identity]['value'];self.mock.set(identity,99)
            s=self.await_state(lambda s:not s['fields'][target]['bindingReady'])
            self.assertFalse(s['fields'][target]['quality']);self.assertIsNone(s['fields'][target]['value']);self.assertFalse(s['fields'][target]['writable'])
            self.assertEqual(self.write(target,100)[0],409)
            self.mock.set(identity,original);self.await_state(lambda s:s['fields'][target]['bindingReady'])
            self.mock.lookup_hook=lambda f,identity=identity:self.mock.set(identity,99)
            status,_,body=self.write(target,100);self.assertEqual(status,202)
            self.assertEqual(self.terminal(body)['status'],'rejected')
            self.mock.set(identity,original);self.await_state(lambda s:s['fields'][target]['bindingReady'])
        self.assertEqual(self.mock.writes,[])
    def test_edge_auto_is_per_channel_and_configured(self):
        for i in range(1,4):self.mock.set(f'edge{i}Auto',i%2)
        s=self.await_state(lambda s:[s['fields'][f'edge{i}Auto']['value'] for i in range(1,4)]==[1,0,1])
        for i in range(1,4):
            f=s['fields'][f'edge{i}Auto'];self.assertEqual(f['sourceIndex'],0);self.assertEqual(f['metadata']['actualSize'],1);self.assertTrue(f['writable'])
        self.mock.set('edgeChannelCount',2)
        s=self.await_state(lambda s:not s['fields']['edge3Auto']['bindingReady'])
        self.assertFalse(s['fields']['edge3Auto']['quality']);self.assertFalse(s['commands']['edge3JogFw']['available'])
        self.assertEqual(self.mock.writes,[])
    def test_new_settings_never_retry_after_lost_ack(self):
        self.mock.behavior='lost_ack';status,_,body=self.write('tensionSet',3);self.assertEqual(status,202)
        tx=self.terminal(body);self.assertEqual(tx['status'],'uncertain')
        self.await_state(lambda s:s['connected'] and s['fields']['tensionSet']['value']==3)
        self.assertEqual(len(self.mock.writes),1)
        self.assertEqual(self.request('POST','/api/write',body)[0],202);time.sleep(.2);self.assertEqual(len(self.mock.writes),1)
if __name__=='__main__':unittest.main(verbosity=2)
