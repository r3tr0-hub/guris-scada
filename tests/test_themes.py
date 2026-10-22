"""Display preferences against the native backend and loopback ADS peer."""
import json,pathlib,unittest
import test_local_features as local

class Themes(unittest.TestCase):
    setUp=local.Features.setUp
    tearDown=local.Features.tearDown
    state=local.Features.state
    await_state=local.Features.await_state
    request=local.Features.request
    restart=local.Features.restart
    def engineer(self):
        self.assertEqual(self.request('POST','/api/auth/setup',{'password':'262016'})[0],200)
    def options(self,**changes):
        body=dict(snow=1,animations=1,wallpaper=1,exitButton=1,theme='classic')
        body.update(changes)
        return self.request('POST','/api/options',body)
    def test_default_and_initial_html(self):
        self.assertEqual(self.state()['options']['theme'],'dark')
        status,html=self.request('GET','/?k='+self.token)
        self.assertEqual(status,200);self.assertIn(b'data-theme="dark"',html)
        self.assertNotIn(b'@@SCADA_THEME@@',html)
        self.assertEqual(self.request('GET','/themes.css')[0],200)
        self.assertEqual(self.mock.writes,[])
    def test_common_preference_survives_restart_language_and_profile(self):
        self.assertEqual(self.options()[0],403);self.engineer()
        self.assertEqual(self.options(exitButton=0,snow=0)[0],200)
        config=pathlib.Path(self.tmp.name)/'local/scada_options.json'
        self.assertEqual(json.loads(config.read_text())['theme'],'classic')
        self.assertEqual(self.request('POST','/api/language',{'language':'en'})[0],200)
        self.assertEqual(json.loads(config.read_text())['theme'],'classic')
        self.request('POST','/api/auth/operator',{})
        self.assertEqual(self.state()['options']['theme'],'classic')
        self.assertEqual(self.options(theme='dark')[0],403)
        self.restart();s=self.state()
        self.assertEqual(s['auth']['role'],'operator');self.assertEqual(s['language'],'en')
        self.assertEqual(s['options']['theme'],'classic');self.assertFalse(s['options']['exitButton']);self.assertFalse(s['options']['snow'])
        self.assertIn(b'data-theme="classic"',self.request('GET','/?k='+self.token)[1])
        self.assertEqual(self.mock.writes,[])
    def test_legacy_files_keep_preferences_and_default_to_dark(self):
        for extras in [{},{'language':'en'},{'language':'ru','exitButton':0}]:
            with self.subTest(extras=extras):
                self.proc.kill();self.proc.wait()
                folder=pathlib.Path(self.tmp.name)/'local';folder.mkdir(exist_ok=True)
                (folder/'scada_options.json').write_text(json.dumps(dict(snow=0,animations=0,wallpaper=0,**extras)))
                self.restart();s=self.state()
                self.assertEqual(s['options']['theme'],'dark')
                self.assertFalse(s['options']['snow']);self.assertFalse(s['options']['animations']);self.assertFalse(s['options']['wallpaper'])
                self.assertEqual(s['options']['exitButton'],bool(extras.get('exitButton',1)))
        self.assertEqual(self.mock.writes,[])
    def test_legacy_option_requests_preserve_selected_theme(self):
        self.engineer();self.assertEqual(self.options()[0],200)
        for body in [dict(snow=0,animations=1,wallpaper=0),dict(snow=1,animations=0,wallpaper=1,exitButton=0)]:
            self.assertEqual(self.request('POST','/api/options',body)[0],200)
            self.assertEqual(self.state()['options']['theme'],'classic')
        self.assertEqual(self.options(theme='dark')[0],200)
        self.restart();self.assertEqual(self.state()['options']['theme'],'dark')
        self.assertEqual(self.mock.writes,[])
    def test_invalid_selection_never_changes_current_or_saved_preference(self):
        self.engineer();self.assertEqual(self.options()[0],200)
        config=pathlib.Path(self.tmp.name)/'local/scada_options.json';before=config.read_bytes()
        for value in ['',1,True,None,'Classic','light','classic" style="color:red']:
            with self.subTest(value=value):
                self.assertIn(self.options(theme=value)[0],[400,422])
                self.assertEqual(config.read_bytes(),before);self.assertEqual(self.state()['options']['theme'],'classic')
        self.assertEqual(self.options(unexpected=1)[0],422)
        self.assertEqual(self.mock.writes,[])
    def test_failed_save_retains_previous_theme(self):
        self.engineer();self.assertEqual(self.options()[0],200)
        folder=pathlib.Path(self.tmp.name)/'local'
        (folder/'scada_options.json.tmp').mkdir()
        self.assertEqual(self.options(theme='dark')[0],503)
        self.assertEqual(self.state()['options']['theme'],'classic')
        self.assertEqual(json.loads((folder/'scada_options.json').read_text())['theme'],'classic')
        self.assertEqual(self.mock.writes,[])
    def test_unknown_saved_theme_falls_back_without_resetting_other_options(self):
        self.proc.kill();self.proc.wait()
        folder=pathlib.Path(self.tmp.name)/'local';folder.mkdir(exist_ok=True)
        (folder/'scada_options.json').write_text(json.dumps(dict(snow=0,animations=0,wallpaper=0,exitButton=0,language='en',theme='future-theme')))
        self.restart();s=self.state()
        self.assertEqual(s['options'],dict(snow=False,animations=False,wallpaper=False,exitButton=False,theme='dark',font='system'))
        self.assertEqual(s['language'],'en');self.assertEqual(self.mock.writes,[])

if __name__=='__main__':unittest.main(verbosity=2)
