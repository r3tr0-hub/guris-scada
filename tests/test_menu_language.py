"""Measured menu bindings and language preferences through the real native API."""
import json,pathlib,unittest
import test_ads_integration as legacy
import test_local_features as local
class MenuLanguage(unittest.TestCase):
    setUp=legacy.Backend.setUp
    tearDown=legacy.Backend.tearDown
    request=legacy.Backend.request
    state=legacy.Backend.state
    await_state=legacy.Backend.await_state
    restart=local.Features.restart
    write=legacy.Backend.write
    def test_confirmed_temperature_fields_and_no_connection_writes(self):
        s=self.await_state(lambda s:all(s['fields'][f'heat{i}Actual']['quality'] for i in range(1,6)))
        self.assertEqual(len(s['fields']),len(legacy.rows))
        for i,limit in enumerate([490,300,300,300,485,100],1):
            setting=s['fields'][f'heat{i}Set'];self.assertTrue(setting['writable']);self.assertEqual(setting['max'],limit)
            self.assertTrue(s['fields'][f'heat{i}Enabled']['writable'])
            if i<6:
                key=f'heat{i}Actual';field=s['fields'][key]
                self.assertEqual(field['type'],'REAL');self.assertEqual(field['metadata']['actualSize'],4)
                self.assertTrue(field['quality']);self.assertFalse(field['writable']);self.assertFalse(field['resettable'])
                self.assertEqual(self.write(key,100)[0],400)
        self.assertNotIn('heat6Actual',s['fields'])
        self.assertAlmostEqual(s['fields']['heat1Actual']['value'],439.5)
        self.assertAlmostEqual(s['fields']['heat5Actual']['value'],28.5)
        self.assertEqual(self.mock.writes,[])
    def test_language_is_operator_accessible_and_persists_with_options(self):
        self.assertEqual(self.state()['language'],'ru')
        self.assertEqual(self.request('POST','/api/language',{'language':'en'})[0],200)
        self.assertEqual(self.state()['language'],'en');self.assertEqual(self.state()['auth']['role'],'operator')
        self.assertEqual(self.request('POST','/api/options',{'snow':0,'animations':0,'wallpaper':0})[0],403)
        self.assertEqual(self.request('POST','/api/auth/setup',{'password':'246810'})[0],200)
        self.assertEqual(self.request('POST','/api/options',{'snow':0,'animations':1,'wallpaper':1})[0],200)
        self.assertEqual(self.state()['language'],'en')
        self.restart();self.assertEqual(self.state()['language'],'en');self.assertFalse(self.state()['options']['snow'])
        self.assertEqual(self.request('POST','/api/language',{'language':'ru'})[0],200);self.assertEqual(self.state()['language'],'ru')
        self.assertEqual(self.mock.writes,[])
    def test_localization_assets_are_confined_and_catalogs_match(self):
        for code in ['../connection','..%2Fconnection','missing','en.json','',1]:
            self.assertEqual(self.request('POST','/api/language',{'language':code})[0],422)
        for uri in ['/locales/../connection.json','/locales/../../local/accounts.json','/assets/flags/../../connection.svg']:
            self.assertEqual(self.request('GET',uri)[0],404)
        ru=self.request('GET','/locales/ru.json')[1];en=self.request('GET','/locales/en.json')[1]
        self.assertEqual(set(ru['messages']),set(en['messages']))
        self.assertEqual(en['messages']['Нет связи'],'No connection')
        self.assertEqual(en['messages']['Скорость шва'],'Seam speed')
        self.assertEqual(len(self.request('GET','/locales/catalog.json')[1]['languages']),3)
        self.assertEqual(self.request('GET','/assets/flags/ru.svg')[0],200)
        self.assertEqual(self.request('GET','/assets/flags/gb.svg')[0],200)
        self.assertEqual(self.mock.writes,[])
if __name__=='__main__':unittest.main(verbosity=2)
