"""Native HTTP/ADS tests. The only PLC is the loopback MockPLC."""
import contextlib, hashlib, http.client, json, pathlib, struct, subprocess, time, unittest, uuid
import test_ads_integration as legacy
ROOT=legacy.ROOT

class Features(unittest.TestCase):
    state=legacy.Backend.state
    await_state=legacy.Backend.await_state
    write=legacy.Backend.write
    terminal=legacy.Backend.terminal
    def setUp(self):
        self.cookie='';legacy.Backend.setUp(self);self.mock.set('machineState',13);self.await_state(lambda s:s['fields']['machineState']['value']==13)
    tearDown=legacy.Backend.tearDown
    def request(self,method,path,body=None,headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.port,timeout=12)
        h={'X-SCADA-Token':self.token,'Content-Type':'application/json'}
        if self.cookie:h['Cookie']=self.cookie
        if headers:h.update(headers)
        conn.request(method,path,json.dumps(body,ensure_ascii=False).encode() if body is not None else None,h)
        r=conn.getresponse();data=r.read();status=r.status
        cookie=r.getheader('Set-Cookie')
        if cookie:self.cookie=cookie.split(';')[0];self.assertIn('HttpOnly',cookie);self.assertIn('SameSite=Strict',cookie)
        typ=r.getheader('Content-Type','');conn.close()
        return status,json.loads(data) if typ.startswith('application/json') else data
    def boost(self,id=None,**extra):
        s=self.state();body={'id':id or str(uuid.uuid4()),'expected':s['fields']['beltIdleSpeed']['raw'],'epoch':s['epoch']};body.update(extra)
        return (*self.request('POST','/api/cleaning-add',body),body)
    def restart(self):
        self.proc.kill();self.proc.wait();self.proc.stdout.close();self.proc.stderr.close();self.cookie=''
        self.proc=subprocess.Popen([str(ROOT/'scada-test-host'),'--ip','127.0.0.1','--tcp-port',str(self.mock.port),'--ui',self.tmp.name],cwd=self.tmp.name,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        line=self.proc.stdout.readline().split();self.assertEqual(line[0],'READY');self.port=int(line[1]);self.token=line[2]
        return self.await_state(lambda s:s['connected'] and s['fields']['beltIdleSpeed']['quality'])
    def normal(self):
        self.assertEqual(self.request('POST','/api/cleaning-stop',{})[0],202)
        return self.await_state(lambda s:not s['cleaning']['pendingRestore'] and s['fields']['beltIdleSpeed']['value']==10)
    def test_profiles_permission_and_hashed_password(self):
        opts={'snow':0,'animations':1,'wallpaper':0}
        self.assertEqual(self.state()['auth']['role'],'operator')
        self.assertEqual(self.request('POST','/api/options',opts)[0],403)
        self.assertEqual(self.request('POST','/api/connect',{'ip':'127.0.0.1','netId':'5.105.198.193.1.1','port':801,'enabled':1})[0],403)
        self.assertEqual(self.request('POST','/api/auth/setup',{'password':'short'})[0],422)
        password='049137'
        self.assertEqual(self.request('POST','/api/auth/setup',{'password':password})[0],200)
        self.assertEqual(self.state()['auth']['role'],'engineer')
        account=json.loads((pathlib.Path(self.tmp.name)/'local/accounts.json').read_text())
        self.assertEqual(account['hash'],hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(account['salt']),600000).hex())
        self.assertNotIn(password,json.dumps(account));self.assertNotIn(account['hash'],json.dumps(self.state()))
        self.assertEqual(self.request('GET','/local/accounts.json')[0],404)
        self.assertEqual(self.request('POST','/api/auth/setup',{'password':'overwrite-password'})[0],409)
        self.assertEqual(self.request('POST','/api/options',opts)[0],200)
        self.assertFalse(self.state()['options']['snow']);self.assertFalse(self.state()['options']['wallpaper'])
        old_cookie=self.cookie
        self.assertEqual(self.request('POST','/api/auth/operator',{})[0],200)
        self.assertEqual(self.request('POST','/api/options',opts,{'Cookie':old_cookie})[0],403)
        self.assertEqual(self.request('POST','/api/auth/login',{'password':'invalid-password'})[0],403)
        self.assertEqual(self.request('POST','/api/auth/login',{'password':password})[0],200)
        self.assertEqual(self.request('POST','/api/auth/password',{'oldPassword':password,'newPassword':'902456'})[0],200)
        self.request('POST','/api/auth/operator',{})
        self.assertEqual(self.request('POST','/api/auth/login',{'password':password})[0],403)
        self.assertEqual(self.request('POST','/api/auth/login',{'password':'902456'})[0],200)
        self.restart();self.assertEqual(self.state()['auth']['role'],'operator');self.assertTrue(self.state()['auth']['engineerConfigured']);self.assertFalse(self.state()['options']['snow'])
        self.assertEqual(self.request('POST','/api/auth/login',{'password':'902456'})[0],200)
        self.assertEqual(self.mock.writes,[])
    def test_corrupt_profile_does_not_allow_bootstrap_overwrite(self):
        d=pathlib.Path(self.tmp.name)/'local';d.mkdir(exist_ok=True);(d/'accounts.json').write_text('{truncated')
        self.restart();self.assertTrue(self.state()['auth']['locked'])
        self.assertEqual(self.request('POST','/api/auth/setup',{'password':'012345'})[0],409)
        self.assertEqual((d/'accounts.json').read_text(),'{truncated')
    def test_login_throttle_and_cookie_cannot_be_replaced_by_role(self):
        self.request('POST','/api/auth/setup',{'password':'123456'});self.request('POST','/api/auth/operator',{})
        for _ in range(5):self.assertEqual(self.request('POST','/api/auth/login',{'password':'wrong-password'})[0],403)
        self.assertEqual(self.request('POST','/api/auth/login',{'password':'123456'})[0],429)
        self.assertEqual(self.request('POST','/api/options',{'snow':0,'animations':0,'wallpaper':0},{'X-SCADA-Role':'engineer','Cookie':'scada_session='+'0'*64})[0],403)
    def test_boost_accumulates_caps_and_deduplicates(self):
        status,_,body=self.boost();self.assertEqual(status,202)
        s=self.await_state(lambda s:s['fields']['beltIdleSpeed']['value']==45 and not s['busy']);self.assertTrue(s['cleaning']['active']);self.assertLessEqual(s['cleaning']['remainingMs'],60000)
        self.assertEqual(self.boost()[0],202);self.assertEqual(self.boost()[0],202)
        self.assertEqual(self.boost()[0],202);s=self.state();self.assertGreater(s['cleaning']['remainingMs'],178000);self.assertLessEqual(s['cleaning']['remainingMs'],180000)
        before=s['cleaning']['remainingMs'];self.assertEqual(self.request('POST','/api/cleaning-add',body)[0],200);self.assertLessEqual(self.state()['cleaning']['remainingMs'],before)
        self.assertEqual(self.write('beltIdleSpeed',45)[0],422)
        self.assertEqual(self.boost(value=45)[0],400)
        invalid=self.boost(id='invalid id____');self.assertEqual(invalid[0],400);self.assertIn('номер операции',invalid[1]['message'])
        self.normal();self.assertEqual([struct.unpack('<f',v)[0] for k,v in self.mock.writes if k=='beltIdleSpeed'],[45,10])
        self.assertEqual(json.loads((pathlib.Path(self.tmp.name)/'local/cleaning.json').read_text()),{'pending':0})
    def test_no_boost_when_running_stale_or_journal_unwritable(self):
        self.mock.set('automatic',1);self.mock.set('machineState',4)
        self.await_state(lambda s:s['fields']['machineState']['value']==4)
        self.assertEqual(self.boost()[0],409);self.assertEqual(self.mock.writes,[])
        self.mock.set('automatic',0);self.mock.set('machineState',13)
        self.await_state(lambda s:s['fields']['machineState']['value']==13)
        self.assertEqual(self.boost(epoch=0)[0],409)
        (pathlib.Path(self.tmp.name)/'local/cleaning.json.tmp').mkdir()
        self.assertEqual(self.boost()[0],503);self.assertEqual(self.mock.writes,[])
    def test_lost_boost_ack_recovers_to_10_without_retrying_45(self):
        self.mock.behavior='lost_ack';self.assertEqual(self.boost()[0],202)
        s=self.await_state(lambda s:len(s['history'])>=2 and not s['cleaning']['pendingRestore'],timeout=12)
        self.assertEqual(s['fields']['beltIdleSpeed']['value'],10)
        self.assertIn('uncertain',[t['status'] for t in s['history']])
        self.assertEqual([struct.unpack('<f',v)[0] for k,v in self.mock.writes if k=='beltIdleSpeed'],[45,10])
    def test_restart_restores_pending_speed_and_does_not_resume_boost(self):
        self.assertEqual(self.boost()[0],202);self.await_state(lambda s:s['fields']['beltIdleSpeed']['value']==45 and not s['busy'])
        self.restart();s=self.await_state(lambda s:not s['cleaning']['pendingRestore'])
        self.assertFalse(s['cleaning']['active']);self.assertEqual(s['fields']['beltIdleSpeed']['value'],10)
        self.assertEqual([struct.unpack('<f',v)[0] for k,v in self.mock.writes if k=='beltIdleSpeed'],[45,10])
    def test_rapid_clicks_during_write_are_all_counted(self):
        self.mock.behavior='delay'
        for _ in range(3):self.assertEqual(self.boost()[0],202)
        s=self.await_state(lambda s:s['fields']['beltIdleSpeed']['value']==45 and not s['busy'])
        self.assertGreater(s['cleaning']['remainingMs'],177000);self.assertLessEqual(s['cleaning']['remainingMs'],180000)
        self.normal()
    def test_graceful_exit_returns_10_and_clears_journal(self):
        self.assertEqual(self.boost()[0],202);self.await_state(lambda s:s['fields']['beltIdleSpeed']['value']==45 and not s['busy'])
        self.assertEqual(self.request('POST','/api/quit',{})[0],202);self.proc.wait(7)
        self.assertEqual(struct.unpack('<f',self.mock.fields['beltIdleSpeed']['raw'])[0],10)
        self.assertEqual(json.loads((pathlib.Path(self.tmp.name)/'local/cleaning.json').read_text()),{'pending':0})
    def test_legacy_unicode_password_migrates_to_numeric_pin(self):
        password='Инженер_пароль_2026_🔒'
        # Existing 0.1.7 profile, generated independently with the documented format.
        d=pathlib.Path(self.tmp.name)/'local';d.mkdir(exist_ok=True)
        salt=bytes(range(16))
        account={'version':1,'iterations':600000,'salt':salt.hex(),'hash':hashlib.pbkdf2_hmac('sha256',password.encode(),salt,600000).hex()}
        (d/'accounts.json').write_text(json.dumps(account));self.restart()
        self.assertEqual(self.request('POST','/api/auth/login',{'password':password})[0],200)
        self.assertEqual(self.request('POST','/api/auth/password',{'oldPassword':password,'newPassword':'902456'})[0],200)
        self.request('POST','/api/auth/operator',{})
        self.assertEqual(self.request('POST','/api/auth/login',{'password':password})[0],403)
        self.assertEqual(self.request('POST','/api/auth/login',{'password':'902456'})[0],200)
        self.assertEqual(self.mock.writes,[])
    def test_new_password_requires_six_ascii_digits_and_keeps_leading_zero(self):
        for invalid in ['12345','abcdef','12345x','１２３４５６','١٢٣٤٥٦','123 456','1'*129]:
            self.assertEqual(self.request('POST','/api/auth/setup',{'password':invalid})[0],422,repr(invalid))
        self.assertIn(self.request('POST','/api/auth/setup',{'password':'123456\n'})[0],[400,422])
        self.assertEqual(self.request('POST','/api/auth/setup',{'password':'012345'})[0],200)
        for invalid in ['12345','abcdef','12345x']:
            self.assertEqual(self.request('POST','/api/auth/password',{'oldPassword':'012345','newPassword':invalid})[0],422)
        self.request('POST','/api/auth/operator',{})
        self.assertEqual(self.request('POST','/api/auth/login',{'password':'12345'})[0],422)
        self.assertEqual(self.request('POST','/api/auth/login',{'password':'012345'})[0],200)
        self.assertEqual(self.mock.writes,[])
    def test_pending_journal_does_not_write_to_another_plc(self):
        d=pathlib.Path(self.tmp.name)/'local';d.mkdir(exist_ok=True);(d/'cleaning.json').write_text(json.dumps({'pending':1,'ip':'192.0.2.8','netId':'1.2.3.4.5.6','port':801}))
        self.restart();s=self.state();self.assertTrue(s['cleaning']['pendingRestore']);self.assertFalse(s['cleaning']['active']);self.assertEqual(self.boost()[0],409)
        time.sleep(.3);self.assertEqual(self.mock.writes,[])
        # Clear this synthetic test-only foreign journal before shutdown.
        (d/'cleaning.json').write_text('{"pending":0}');self.restart()
    def test_connection_loss_queues_normal_until_connection_recovers(self):
        self.assertEqual(self.boost()[0],202);self.await_state(lambda s:s['fields']['beltIdleSpeed']['value']==45 and not s['busy'])
        answer=self.mock.answer;down=[True];self.mock.answer=lambda cmd,q:None if down[0] else answer(cmd,q)
        for peer in self.mock.peers:
            with contextlib.suppress(OSError):peer.shutdown(2)
        s=self.await_state(lambda s:not s['connected'] and not s['cleaning']['active'])
        self.assertTrue(s['cleaning']['pendingRestore']);self.assertEqual(self.boost()[0],409)
        down[0]=False;s=self.await_state(lambda s:s['connected'] and not s['cleaning']['pendingRestore'],timeout=12)
        self.assertEqual(s['fields']['beltIdleSpeed']['value'],10)
    def test_expiry_returns_to_10_without_any_browser(self):
        self.assertEqual(self.boost()[0],202);s=self.await_state(lambda s:s['fields']['beltIdleSpeed']['value']==45 and not s['busy'])
        self.assertGreater(s['cleaning']['remainingMs'],57000)
        # No UI and no polling are present for the complete duration.
        time.sleep(61)
        s=self.await_state(lambda s:not s['cleaning']['pendingRestore'])
        self.assertEqual(s['fields']['beltIdleSpeed']['value'],10);self.assertFalse(s['cleaning']['active'])

if __name__=='__main__':unittest.main(verbosity=2)
