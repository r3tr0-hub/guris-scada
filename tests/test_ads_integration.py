"""Run the actual C backend against a local ADS server. Never uses the real PLC."""
import collections, contextlib, http.client, json, os, pathlib, re, shutil, socket, struct, subprocess, tempfile, threading, time, unittest, uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
FORMATS={'BOOL':'B','INT':'h','DINT':'i','REAL':'f','LREAL':'d','TIME':'I','HEX12':'13s'}
ADS_TYPES={'BOOL':33,'INT':2,'DINT':3,'REAL':4,'LREAL':5,'TIME':19,'HEX12':30}
all_rows=re.findall(r'\{"([^"]+)","([^"]+)","([^"]+)","([^"]*)",T_(\w+),(\d+),([01]),', (ROOT/'src/fields.h').read_text())
rows=all_rows[:256]
def pack_value(typ,value):
    if typ=='HEX12':return (format(int(value),'012X').encode()+b'\0')
    return struct.pack('<'+FORMATS[typ],value)
INITIAL={'edgeSensitivity':.5,'width':249,'batch':100,'welding':125,'weldingEnabled':1,'speedSet':190,'productionQty':1000000,'current':21,'groups':3,'total':321,'machineState':5,'beltTimed':1,'beltTime1':350,'beltTime2':1200,'beltTime3':900,'conveyorContinuous':0,'conveyorTime1':50,'conveyorTime2':75,'beltStep':3,'waitingQty':5,'offset':.575,'beltIdleSpeed':20,'offsetDisplay':-.575,'offsetStep':.025,'speedLimit':265,'waitingLimit':30,'automatic':0}

for _i,(_sp,_pv) in enumerate([(440,439.5),(100,25.4),(1,26.3),(1,24.3),(125,28.5)],1):
    INITIAL['heat%dSet'%_i]=_sp;INITIAL['heat%dActual'%_i]=_pv

INITIAL.update({'glueRollDiameter':100,'glueActualReference':1024,'cfgGlueEncoderPulses':1024})
ENGINEERING_COMMAND_FIELDS={p['key'] for section in json.loads((ROOT/'ui/engineering.json').read_text())['sections'] for p in section['parameters'] if p.get('command')}
COMMAND_KEYS=set(re.findall(r'\{"([^"]+)",F_(?:CMD|ENG)_', (ROOT/'src/commands.h').read_text()))
INITIAL.update({'workingLength':249,'edgeChannelCount':3,'unwinderSensorPresent':1,'unwinderAutoStop':1,'dancer1Reference':2,'dancer2Reference':3,'widthMinimum':30,'widthMaximum':3000,'waitingMinimum':0,'weldingLimit':265,**{f'heat{i}Limit':v for i,v in enumerate([490,300,300,300,485,100],1)}})
INITIAL.update({key: int(key != 'equipmentSeamHidden') for key in ['equipmentTemperature','equipmentGlue','equipmentSeamHidden','equipmentLiner','equipmentEjectServo','equipmentEjectAC','equipmentEjectAutoJog','equipmentTakeoff']})
CAPTURED=json.loads((ROOT/'tests/fixtures/captured_menu_20261015.json').read_text())
for _key,_entry in CAPTURED.items():INITIAL.setdefault(_key,_entry['value'])
# Display values from the supplied PERFORMANS photos, for isolated UI tests.
INITIAL.update(json.loads((ROOT/'tests/fixtures/performance_hmi_values.json').read_text()))

def recvall(sock,n):
    data=b''
    while len(data)<n:
        part=sock.recv(n-len(data))
        if not part: raise EOFError
        data+=part
    return data

class MockPLC:
    def __init__(self, unsupported_sum=False):
        self.socket=socket.socket();self.socket.bind(('127.0.0.1',0));self.socket.listen(5);self.port=self.socket.getsockname()[1]
        self.fields={};self.addresses={};self.lock=threading.RLock();self.stop=False;self.peers=[];self.writes=[];self.version=1;self.ads_state=5;self.unsupported_sum=unsupported_sum;self.plant_layout=True;self.metadata_overrides={};self.behavior='normal';self.corrupt=False
        self.reads=[];self.reply_delay=0;self.sum_batches=[];self.read_errors={};self.version_on_sum=0;self.lookup_hook=None
        for i,(key,symbol,label,unit,typ,size,writable) in enumerate(all_rows):
            f={'key':key,'symbol':symbol,'type':typ,'size':int(size),'writable':int(writable),'offset':100+i*16,'flags':1 if int(writable) else 0 if key in COMMAND_KEYS else 32,'raw':bytes.fromhex(CAPTURED[key]['raw']) if int(size)==5 else pack_value(typ,INITIAL.get(key,0))}
            if key in ['groups','total'] or any(c[0]==key for c in []):f['flags']=0
            if any(field==key for field in ENGINEERING_COMMAND_FIELDS):f['flags']=0
            self.fields[key]=f;self.addresses[f['offset']]=f
        self.names={f['symbol'].upper():f for f in self.fields.values()}
        self.dancers=bytearray(struct.pack('<21f',*[float(i*3) for i in range(21)]));self.alarms=bytearray(201*49)
        extra=[('__dancers','Salmalar.rScaledBalerin','ARRAY [0..20] OF REAL',84,4,bytes(self.dancers),0x30000),('__alarms','.Alarm','ARRAY [0..200] OF AlarmBlock',201*49,65,bytes(self.alarms),0x40000)]
        for name,off,sz,typ,dt in [('iState',0,2,'INT',2),('ID',2,2,'INT',2),('sOccurTime',8,20,'STRING(19)',30),('sAckTime',28,20,'STRING(19)',30),('EN',48,1,'BOOL',33)]:extra.append(('__alarm_'+name,'.Alarm[0].'+name,typ,sz,dt,bytes(sz),0x40000+off))
        for key,name,typ,size,dt,raw,offset in extra:
            f={'key':key,'symbol':name,'type':typ,'size':size,'data_type':dt,'writable':0,'offset':offset,'flags':32,'raw':raw};self.names[name.upper()]=f
            if offset not in self.addresses:self.addresses[offset]=f
        self.thread=threading.Thread(target=self.run,daemon=True);self.thread.start()
    def set(self,key,value):
        with self.lock:
            if self.fields[key]['size']==5:
                source=self.names[self.fields[key]['symbol'].upper()];data=bytearray(source['raw']);data[int(key[4])]=int(value)
                for f in self.fields.values():
                    if f['symbol']==source['symbol']:f['raw']=bytes(data)
            else:
                self.fields[key]['raw']=pack_value(self.fields[key]['type'],value)
                if key=='width':self.fields['workingLength']['raw']=struct.pack('<f',value)
    def run(self):
        while not self.stop:
            try:s,_=self.socket.accept()
            except OSError:return
            s.setsockopt(socket.IPPROTO_TCP,socket.TCP_NODELAY,1)
            self.peers.append(s)
            try:
                while not self.stop:
                    h=recvall(s,6);n=struct.unpack_from('<I',h,2)[0];q=h+recvall(s,n);cmd=struct.unpack_from('<H',q,22)[0]
                    with self.lock:payload=self.answer(cmd,q)
                    if payload is None:break
                    if self.reply_delay:time.sleep(self.reply_delay)
                    reply=bytearray(38);struct.pack_into('<HI',reply,0,0,32+len(payload));reply[6:14]=q[14:22];reply[14:22]=q[6:14]
                    struct.pack_into('<HHIII',reply,22,cmd,5,len(payload),0,struct.unpack_from('<I',q,34)[0])
                    if self.corrupt:self.corrupt=False;struct.pack_into('<I',reply,34,777777)
                    frame=bytes(reply)+payload
                    # Fragmentation is intentional: exercise exact TCP receive loops.
                    s.sendall(frame[:3]);s.sendall(frame[3:17]);s.sendall(frame[17:])
            except (EOFError,OSError,KeyError):pass
            finally:
                with contextlib.suppress(OSError):s.close()
    def read(self,group,offset,size):
        if group==0xf008:return bytes([self.version])
        if group!=0x4020 or offset not in self.addresses:return b'\0'*size
        self.reads.append((time.monotonic(),self.addresses[offset]['key']))
        f=self.addresses[offset]
        if offset==0x30000:return bytes(self.dancers)
        if 0x40000<=offset<0x40000+201*49:return bytes(self.alarms[offset-0x40000:offset-0x40000+size])
        return f['raw']
    def answer(self,cmd,q):
        if cmd==4:return struct.pack('<IHH',0,self.ads_state,0)
        if cmd==2:
            g,o,n=struct.unpack_from('<III',q,38);data=self.read(g,o,n);return struct.pack('<II',0,len(data))+data
        if cmd==9:
            g,o,n,w=struct.unpack_from('<IIII',q,38)
            if g==0xf009:
                f=self.names.get(q[54:54+w-1].decode().upper())
                if not f:return struct.pack('<II',0x710,0)
                if self.lookup_hook:
                    hook=self.lookup_hook;self.lookup_hook=None;hook(f)
                if self.behavior=='version_change' and f['key']=='speedSet':self.version+=1;self.behavior='normal'
                override=self.metadata_overrides.get(f['key'],{})
                name=f['symbol'].encode();type_name=override.get('type','ARRAY [0..4] OF BOOL' if f['size']==5 else 'INT16' if self.plant_layout and f['type']=='INT' else 'STRING(12)' if f['type']=='HEX12' else f['type']);typ=type_name.encode()
                padded=self.plant_layout and f['symbol'].startswith('.')
                name_length=len(name)+int(padded);length=33+name_length+len(typ)
                gap=b'\0\xa5' if padded else b'\0'
                data=struct.pack('<IIIIIIHHH',length,0x4020,f['offset'],override.get('size',f['size']),override.get('data_type',f.get('data_type',ADS_TYPES.get(f['type'],65))),f['flags'],name_length,len(typ),0)+name+gap+typ+b'\0\0'
                return struct.pack('<II',0,len(data))+data
            if g==0xf080:
                if self.unsupported_sum:return struct.pack('<II',0x701,0)
                items=[struct.unpack_from('<III',q,54+k*12) for k in range(o)];self.sum_batches.append(o)
                errors=[self.read_errors.get(self.addresses[x[1]]['key'],0) for x in items]
                data=b''.join(struct.pack('<I',e) for e in errors)+b''.join(self.read(*x) for x in items)
                if self.version_on_sum and len(self.sum_batches)>=self.version_on_sum:self.version+=1;self.version_on_sum=0
                return struct.pack('<II',0,len(data))+data
        if cmd==3:
            g,o,n=struct.unpack_from('<III',q,38);f=self.addresses[o];value=q[50:50+n];self.writes.append((f['key'],value))
            behavior=self.behavior;self.behavior='normal'
            if behavior=='reject':return struct.pack('<I',0x723)
            if behavior=='ignore':return struct.pack('<I',0)
            if behavior=='clamp':value=struct.pack('<f',180)
            if behavior=='delay':
                threading.Timer(.35,lambda:self.commit(f,value)).start();return struct.pack('<I',0)
            self.commit(f,value)
            if behavior=='lost_ack':return None
            return struct.pack('<I',0)
        raise ValueError(cmd)
    def commit(self,f,value):
        with self.lock:
            photo_rising=f['key']=='photoReset' and f['raw']==b'\0' and value==b'\1'
            f['raw']=value
            if photo_rising:self.set('photoOffsetTenths',0)
            if f['key']=='width':self.set('workingLength',struct.unpack('<f',value)[0])
            if f['key']=='currentReset' and value==b'\1':self.set('current',0)
            if f['key']=='groupsReset' and value==b'\1':self.set('groups',0)
            if f['key']=='totalReset' and value==b'\1':self.set('total',0)
            if f['key']=='knifeSave':f['raw']=b'\0'
            if f['key']=='alarmAck' and value==b'\1':
                for slot in range(201):
                    at=slot*49
                    if struct.unpack_from('<h',self.alarms,at)[0]==10 and self.alarms[at+48]==0:struct.pack_into('<h',self.alarms,at,20)
            if f['key']=='alarmClear' and value==b'\1':
                for slot in range(201):
                    at=slot*49
                    if struct.unpack_from('<h',self.alarms,at)[0]==20:struct.pack_into('<h',self.alarms,at,0)
            if f['key']=='offset':self.set('offsetDisplay',-struct.unpack('<f',value)[0])
    def close(self):
        self.stop=True
        for s in self.peers:
            with contextlib.suppress(OSError):s.shutdown(socket.SHUT_RDWR)
        with contextlib.suppress(OSError):self.socket.shutdown(socket.SHUT_RDWR)
        self.socket.close();self.thread.join(1)

class Backend(unittest.TestCase):
    def setUp(self):
        self.cookie='';self.mock=MockPLC();self.tmp=tempfile.TemporaryDirectory()
        shutil.copytree(ROOT/'ui',pathlib.Path(self.tmp.name)/'ui')
        self.proc=subprocess.Popen([str(ROOT/'scada-test-host'),'--ip','127.0.0.1','--tcp-port',str(self.mock.port),'--ui',self.tmp.name],cwd=self.tmp.name,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        line=self.proc.stdout.readline().split();assert line[0]=='READY';self.port=int(line[1]);self.token=line[2]
        self.await_state(lambda s:s['connected'] and s['fields']['speedSet']['quality'])
    def tearDown(self):
        with contextlib.suppress(Exception):self.request('POST','/api/quit',{})
        try:self.proc.wait(6)
        except subprocess.TimeoutExpired:self.proc.kill();self.proc.wait()
        self.mock.close();self.proc.stdout.close();self.proc.stderr.close();self.tmp.cleanup()
    def request(self,method,path,body=None,headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.port,timeout=4);h={'X-SCADA-Token':self.token,'Content-Type':'application/json'}
        if getattr(self,'cookie',''):h['Cookie']=self.cookie
        if headers:h.update(headers)
        conn.request(method,path,json.dumps(body) if body is not None else None,h);r=conn.getresponse();data=r.read();status=r.status
        if r.getheader('Set-Cookie'):self.cookie=r.getheader('Set-Cookie').split(';')[0]
        conn.close()
        return status,json.loads(data) if r.getheader('Content-Type','').startswith('application/json') else data
    def state(self):
        status,data=self.request('GET','/api/state');self.assertEqual(status,200);return data
    def await_state(self,predicate,timeout=7):
        deadline=time.monotonic()+timeout
        while time.monotonic()<deadline:
            s=self.state()
            if predicate(s):return s
            time.sleep(.04)
        self.fail('State did not reach expected condition')
    def write(self,key,value,override=None):
        s=self.state();body={'id':str(uuid.uuid4()),'key':key,'value':str(value),'expected':s['fields'][key]['raw'],'epoch':s['epoch']}
        if override:body.update(override)
        status,data=self.request('POST','/api/write',body);return status,data,body
    def terminal(self,body):
        return self.await_state(lambda s:s['operation']['id']==body['id'] and s['operation']['status'] not in ('queued','verifying'))['operation']
    def reset(self,key,override=None):
        s=self.state();body={'id':str(uuid.uuid4()),'key':key,'expected':s['fields'][key]['raw'],'epoch':s['epoch']}
        if override:body.update(override)
        status,data=self.request('POST','/api/counter-reset',body);return status,data,body

    def test_counter_resets_are_zero_only_and_keep_generic_write_closed(self):
        for key in ['current','groups','total']:
            state=self.state();self.assertTrue(state['fields'][key]['resettable']);self.assertFalse(state['fields'][key]['writable'])
            self.assertEqual(self.write(key,1)[0],400)
            self.assertEqual(self.reset(key,{'value':'1'})[0],400)
            status,_,body=self.reset(key);self.assertEqual(status,202)
            tx=self.terminal(body);self.assertEqual(tx['status'],'confirmed',tx);self.assertEqual(tx['kind'],'counter_reset');self.assertEqual(tx['actual'],0)
            self.assertEqual(self.mock.writes[-2:],[(key+'Reset',b'\1'),(key+'Reset',b'\0')])
        for key in ['width','beltIdleSpeed']:self.assertEqual(self.reset(key)[0],400)
        self.assertEqual(len(self.mock.writes),6)

    def test_counter_reset_accepts_any_machine_state_and_a_moving_counter(self):
        for code in range(15):
            self.mock.set('machineState',code);self.mock.set('automatic',1)
            self.await_state(lambda s:s['fields']['machineState']['value']==code)
            for key in ['current','groups','total']:
                self.mock.set(key,100+code)
                status,_,body=self.reset(key,{'expected':'ffffffff'})
                self.assertEqual(status,202,(code,key))
                self.assertEqual(self.terminal(body)['status'],'confirmed',(code,key))
        self.mock.fields['groupsReset']['flags']=32
        before=len(self.mock.writes);status,_,body=self.reset('groups')
        self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'rejected')
        self.assertEqual(len(self.mock.writes),before)

    def test_counter_can_count_again_immediately_after_reset_release(self):
        self.mock.set('machineState',4);self.mock.set('automatic',1)
        commit=self.mock.commit
        def counting(f,value):
            commit(f,value)
            if f['key'].endswith('Reset') and value==b'\0':
                self.mock.set(f['key'][:-5],1)
        self.mock.commit=counting
        for key in ['current','groups','total']:
            status,_,body=self.reset(key);self.assertEqual(status,202)
            tx=self.terminal(body);self.assertEqual(tx['status'],'confirmed');self.assertEqual(tx['actual'],0)
            self.await_state(lambda s:s['fields'][key]['value']==1)

    def test_counter_reset_ack_and_lost_ack_do_not_fake_success_or_retry(self):
        self.mock.behavior='ignore';status,_,body=self.reset('groups');self.assertEqual(status,202)
        self.assertEqual(self.terminal(body)['status'],'not_applied');self.assertEqual(self.state()['fields']['groups']['value'],3)
        self.mock.behavior='lost_ack';status,_,body=self.reset('total');self.assertEqual(status,202)
        self.assertEqual(self.terminal(body)['status'],'uncertain')
        self.await_state(lambda s:s['connected'] and s['fields']['total']['value']==0)
        time.sleep(.3);self.assertEqual(sum(v==b'\1' for _,v in self.mock.writes),2);self.assertTrue(all(k.endswith('Reset') for k,_ in self.mock.writes))

    def test_generic_idle_writes_allow_only_normal_speed(self):
        for value in [45,20,25,-10]:self.assertEqual(self.write('beltIdleSpeed',value)[0],422)
        self.assertFalse(self.mock.writes);self.assertTrue(self.state()['cleaning']['available'])
        self.assertEqual(self.request('POST','/api/cleaning-add',{})[0],400)
        self.mock.set('machineState',13);self.await_state(lambda s:s['fields']['machineState']['value']==13)
        status,_,body=self.write('beltIdleSpeed',10);self.assertEqual(status,202)
        self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.mock.writes,[('beltIdleSpeed',struct.pack('<f',10))])
    def test_all_plant_fields_resolve_and_report_their_metadata(self):
        state=self.state()
        self.assertEqual(state['version'],'0.1.25')
        self.assertEqual(len(state['fields']),len(rows))
        self.assertTrue(all(field['quality'] for field in state['fields'].values()))
        for key,field in state['fields'].items():
            self.assertEqual(field['metadata']['status'],'resolved',key)
            self.assertEqual(field['symbol'],self.mock.fields[key]['symbol'])
            self.assertEqual(field['metadata']['layout'],2 if field['symbol'].startswith('.') else 1,key)
        self.assertEqual(state['fields']['machineState']['metadata']['actualType'],'INT16')
        self.assertEqual(state['fields']['waitingLimit']['metadata']['actualType'],'INT16')
        self.assertTrue(state['fields']['offset']['writable'])
        self.assertTrue(state['fields']['offsetStep']['quality'])

    def test_fast_counters_and_slow_settings_with_sum_and_fallback(self):
        for unsupported in [False,True]:
            with self.subTest(sum_read=not unsupported):
                self.mock.unsupported_sum=unsupported
                self.await_state(lambda s:s['polling']['sumRead']==(not unsupported))
                with self.mock.lock:self.mock.reads.clear()
                time.sleep(1.2)
                with self.mock.lock:counts=collections.Counter(key for _,key in self.mock.reads)
                self.assertGreaterEqual(counts['current'],9,counts)
                self.assertGreaterEqual(counts['width'],2,counts)
                self.assertLessEqual(counts['width'],4,counts)
                self.assertGreaterEqual(counts['current'],3*counts['width'],counts)
                for key in ['groups','total','machineState','automatic']:self.assertEqual(counts[key],counts['current'],counts)
                state=self.state()
                self.assertTrue(all(f['quality'] for f in state['fields'].values()))
                self.assertEqual(state['message'],'Данные получены из ПЛК')
                self.assertEqual(state['polling']['fastIntervalMs'],100)
                self.assertEqual(state['polling']['fullIntervalMs'],500)
                self.assertEqual(self.mock.writes,[])

    def test_slow_plc_leaves_a_gap_instead_of_catching_up(self):
        self.mock.reply_delay=.14
        started=time.monotonic();time.sleep(4.2)
        with self.mock.lock:times=[at for at,key in self.mock.reads if key=='current' and at>started+.5]
        self.assertGreaterEqual(len(times),2,times)
        self.assertTrue(all(b-a>=.43 for a,b in zip(times,times[1:])),times)
        state=self.state()
        self.assertGreaterEqual(state['polling']['lastCycleMs'],400)
        self.assertTrue(state['connected']);self.assertEqual(self.mock.writes,[])

    def test_invalid_fast_fields_do_not_break_slow_fields(self):
        for key in ['current','groups','total','machineState','automatic']:
            self.mock.metadata_overrides[key]={'data_type':19}
        before=self.state()['epoch'];self.mock.version+=1
        state=self.await_state(lambda s:s['connected'] and s['epoch']>before and s['fields']['width']['quality'])
        epoch=state['epoch'];cycles=state['polling']['cycles']
        state=self.await_state(lambda s:s['connected'] and s['polling']['cycles']>=cycles+6)
        self.assertEqual(state['epoch'],epoch)
        self.assertFalse(state['fields']['current']['quality'])
        self.assertTrue(state['fields']['width']['quality']);self.assertEqual(self.mock.writes,[])

    def test_standard_metadata_still_resolves_after_reconnect(self):
        self.mock.plant_layout=False
        state=self.state()
        self.assertEqual(self.request('POST','/api/auth/setup',{'password':'135790'})[0],200)
        self.assertEqual(self.request('POST','/api/connect',{'ip':'127.0.0.1','netId':state['netId'],'port':801,'enabled':1})[0],202)
        actual=self.await_state(lambda s:s['epoch']>state['epoch'] and s['connected'] and all(v['quality'] for v in s['fields'].values()))
        self.assertTrue(all(v['metadata']['layout']==1 for v in actual['fields'].values()))
        self.assertEqual(actual['fields']['machineState']['metadata']['actualType'],'INT')

    def test_changed_signedness_is_rejected_before_any_write(self):
        self.mock.metadata_overrides['width']={'type':'UDINT','data_type':19}
        sent=len(self.mock.writes)
        status,_,body=self.write('width',250)
        self.assertEqual(status,202)
        self.assertEqual(self.terminal(body)['status'],'rejected')
        self.assertEqual(len(self.mock.writes),sent)
        state=self.state()
        self.assertEqual(self.request('POST','/api/auth/setup',{'password':'135790'})[0],200)
        self.assertEqual(self.request('POST','/api/connect',{'ip':'127.0.0.1','netId':state['netId'],'port':801,'enabled':1})[0],202)
        actual=self.await_state(lambda s:s['epoch']>state['epoch'] and s['connected'])
        self.assertFalse(actual['fields']['width']['quality'])
        self.assertFalse(actual['fields']['width']['writable'])
        self.assertEqual(actual['fields']['width']['metadata']['status'],'type_or_size_mismatch')
        self.assertEqual(actual['fields']['width']['metadata']['actualType'],'UDINT')

    def test_ui_ready_and_error_are_authenticated_and_do_not_write_plc(self):
        writes=len(self.mock.writes)
        self.assertEqual(self.request('POST','/api/ui-ready',{}, {'X-SCADA-Token':'wrong'})[0],403)
        self.assertEqual(self.request('POST','/api/ui-ready',{})[0],200)
        self.assertEqual(self.request('POST','/api/ui-ready',{'unexpected':'field'})[0],400)
        self.assertEqual(self.request('POST','/api/ui-error',{'message':'test renderer error'})[0],200)
        status,html=self.request('GET','/?k='+self.token)
        self.assertEqual(status,200)
        self.assertNotIn(b'@@SCADA_',html)
        self.assertIn(b'scada-startup-notice',html)
        self.assertEqual(len(self.mock.writes),writes)

    def test_typed_writes_persistent_recipe_and_offset_sign(self):
        for key,value,fmt in [('speedSet',195,'f'),('batch',101,'i'),('beltTime1',400,'h'),('weldingEnabled',0,'B'),('offset',-.5,'f')]:
            status,_,body=self.write(key,value);self.assertEqual(status,202);tx=self.terminal(body);self.assertEqual(tx['status'],'confirmed',tx)
            self.assertEqual(self.mock.writes[-1],(key,struct.pack('<'+fmt,-value if key=='offset' else value)))
        self.assertAlmostEqual(self.state()['fields']['offsetDisplay']['value'],-.5)
        audit=list(pathlib.Path(self.tmp.name,'logs').glob('*.csv'))[0].read_text('utf-8-sig');self.assertEqual(audit.count('confirmed'),5)
    def test_access_validation_and_gates_send_nothing(self):
        initial=len(self.mock.writes)
        for key,value in [('total',2),('speedSet','NaN'),('batch',1.5),('speedSet',401),('conveyorTime1',60)]:
            status,_,_=self.write(key,value);self.assertIn(status,(400,409,422))
        status,_,body=self.write('speedSet',266);self.assertEqual(status,422)
        s=self.state();body={'id':str(uuid.uuid4()),'key':'speedSet','value':'195','expected':s['fields']['speedSet']['raw'],'epoch':s['epoch']}
        self.assertEqual(self.request('POST','/api/write',body,{'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.request('POST','/api/write',body,{'X-SCADA-Token':'invalid'})[0],403)
        self.assertEqual(len(self.mock.writes),initial)
    def test_remaining_home_and_belt_bindings(self):
        assignments=[('width',250),('welding',126),('productionQty',1000001),('beltTime2',1250),('beltTime3',950),('conveyorContinuous',1),('conveyorTime1',60),('conveyorTime2',80),('beltStep',4),('waitingQty',6),('beltIdleSpeed',10),('beltTimed',0)]
        for key,value in assignments:
            self.mock.set('machineState',13 if key=='beltIdleSpeed' else 5);self.await_state(lambda s:s['fields']['machineState']['value']==(13 if key=='beltIdleSpeed' else 5))
            status,_,body=self.write(key,value);self.assertEqual(status,202,(key,status));self.assertEqual(self.terminal(body)['status'],'confirmed',key)
        self.assertEqual(len(self.mock.writes),len(assignments))
        status,_,_=self.write('beltTime1',450);self.assertEqual(status,409)
        self.mock.set('speedLimit',float('nan'));self.await_state(lambda s:not s['fields']['speedLimit']['quality'])
        status,_,body=self.write('speedSet',195);self.assertEqual(status,409)
        self.assertEqual(len(self.mock.writes),len(assignments))
    def test_changed_value_and_generation_are_not_overwritten(self):
        old=self.state();self.mock.set('speedSet',191)
        status,_,body=self.write('speedSet',195,{'expected':old['fields']['speedSet']['raw']});self.assertIn(status,(202,409))
        if status==202:self.assertEqual(self.terminal(body)['status'],'conflict')
        self.assertEqual(len(self.mock.writes),0)
        self.await_state(lambda s:s['fields']['speedSet']['value']==191)
        self.mock.behavior='version_change';status,_,body=self.write('speedSet',195);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'rejected');self.assertEqual(len(self.mock.writes),0)
        self.await_state(lambda s:s['connected'] and s['epoch']>old['epoch'])
    def test_ack_is_not_confirmation(self):
        for behavior,expected in [('ignore','not_applied'),('clamp','different'),('reject','rejected')]:
            self.mock.behavior=behavior;status,_,body=self.write('speedSet',195);self.assertEqual(status,202);tx=self.terminal(body);self.assertEqual(tx['status'],expected,tx)
    def test_no_duplicate_or_replay_after_lost_ack(self):
        self.mock.behavior='delay';status,_,body=self.write('speedSet',195);self.assertEqual(status,202)
        self.assertEqual(self.request('POST','/api/write',body)[0],202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(len(self.mock.writes),1)
        self.mock.behavior='lost_ack';_,_,body=self.write('speedSet',190);self.assertEqual(self.terminal(body)['status'],'uncertain')
        self.await_state(lambda s:s['connected'] and s['fields']['speedSet']['value']==190)
        time.sleep(.6);self.assertEqual(len(self.mock.writes),2)
    def test_stop_readonly_bad_reply_and_sum_fallback(self):
        self.mock.ads_state=6;self.await_state(lambda s:s['adsState']==6);status,_,_=self.write('speedSet',195);self.assertEqual(status,409);self.assertFalse(self.mock.writes)
        self.mock.ads_state=5;self.await_state(lambda s:s['adsState']==5)
        self.mock.fields['speedSet']['flags']=33;_,_,body=self.write('speedSet',195);self.assertEqual(self.terminal(body)['status'],'rejected');self.assertFalse(self.mock.writes)
        self.mock.fields['speedSet']['flags']=1;old=self.state()['epoch'];self.mock.unsupported_sum=True;self.mock.corrupt=True
        # A fast reconnect can finish between HTTP samples; require a new session and actual fallback.
        self.await_state(lambda s:s['connected'] and s['epoch']>old and not s['polling']['sumRead'])
        self.assertEqual(self.state()['fields']['speedSet']['value'],190)
    def test_static_ui_and_report(self):
        for path in ['/app.js','/style.css','/assets/brand.png','/favicon.svg','/?k='+self.token]:self.assertEqual(self.request('GET',path)[0],200)
        status,html=self.request('GET','/?k='+self.token);self.assertNotIn(b'@@',html)
        self.assertEqual(self.request('GET','/api/report')[0],200);self.assertEqual(self.request('GET','/../src/main.c')[0],404)

if __name__=='__main__':unittest.main(verbosity=2)
