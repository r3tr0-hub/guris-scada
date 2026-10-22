"""Read the actual native manuals API. Files and ADS server are local fixtures."""
import base64,hashlib,pathlib,shutil,tempfile,time,unittest,urllib.parse
import test_ads_integration as legacy
ROOT=pathlib.Path(__file__).resolve().parents[1]
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
class Manuals(unittest.TestCase):
 request=legacy.Backend.request;state=legacy.Backend.state;await_state=legacy.Backend.await_state;tearDown=legacy.Backend.tearDown
 def setUp(self):
  legacy.Backend.setUp(self);self.root=pathlib.Path(self.tmp.name)/'manuals';shutil.copytree(ROOT/'manuals',self.root)
 def catalog(self,force=True):
  status,data=self.request('GET','/api/manuals'+('?refresh=1' if force else ''));self.assertEqual(status,200);return data
 def guide(self,name,content):
  p=self.root/name;p.mkdir(exist_ok=True);(p/'index.md').write_text(content,encoding='utf-8');return p
 def row(self,folder):return next(g for g in self.catalog()['guides'] if g['folder']==folder)
 def media(self,id,path,token=None):return self.request('GET','/manual-media/'+id+'/'+path+'?k='+(self.token if token is None else token))
 def test_two_bundled_guides_and_real_photos(self):
  data=self.catalog();self.assertEqual(len(data['guides']),2);self.assertEqual([g['folder'] for g in data['guides']],['01-photo-guide','02-add-manual'])
  for g in data['guides']:
   status,body=self.request('GET','/api/manual/'+g['id']);self.assertEqual(status,200);self.assertNotIn('category: Примеры',body['markdown']);self.assertIn('![',body['markdown']);self.assertEqual(body['revision'],g['revision'])
  a,b=data['guides'];self.assertEqual(self.media(a['id'],'images/hmi-menu.jpg')[0],200);self.assertEqual(self.media(b['id'],'images/hmi-temperature.png')[0],200);self.assertEqual(self.mock.writes,[])
 def test_cyrillic_spaces_nested_photos_and_stable_id(self):
  p=self.guide('Новый гайд 03','# Новый гайд\n\nОписание.\n');(p/'Фото узла').mkdir();(p/'Фото узла'/'Фото 1.png').write_bytes(PNG)
  g=self.row(p.name);self.assertEqual(g['title'],'Новый гайд');self.assertEqual(g['summary'],'Описание.');self.assertRegex(g['id'],r'^[0-9a-f]{16}$')
  route=urllib.parse.quote('Фото узла/Фото 1.png');self.assertEqual(self.media(g['id'],route),(200,PNG))
  self.assertEqual(self.row(p.name)['id'],g['id'])
 def test_new_guide_is_discovered_without_restart(self):
  self.catalog();self.guide('03-new','# Новый\n\nАвтоматически найден.\n');until=time.monotonic()+4
  while time.monotonic()<until:
   data=self.catalog(False)
   if len(data['guides'])==3:break
   time.sleep(.1)
  self.assertEqual(len(data['guides']),3)
 def test_update_metadata_revision_bom_crlf_and_removal(self):
  p=self.guide('03-update','\ufeff---\r\ntitle: "Мой заголовок"\r\nsummary: Описание\r\ncategory: Настройка\r\norder: -5\r\n---\r\n# Текст\r\n\r\nПервая версия.\r\n');a=self.row(p.name);self.assertEqual(a['title'],'Мой заголовок');self.assertEqual(a['category'],'Настройка');self.assertEqual(self.catalog()['guides'][0]['id'],a['id'])
  (p/'index.md').write_text('# Обновлено\n\nВторая версия.\n',encoding='utf-8');b=self.row(p.name);self.assertEqual(b['id'],a['id']);self.assertNotEqual(b['revision'],a['revision']);self.assertEqual(b['title'],'Обновлено')
  status,data=self.request('GET','/api/manual/'+b['id']);self.assertEqual(status,200);self.assertIn('Вторая версия.',data['markdown']);shutil.rmtree(p);self.catalog();self.assertEqual(self.request('GET','/api/manual/'+a['id'])[0],404)
 def test_api_token_and_image_token_required(self):
  self.assertEqual(self.request('GET','/api/manuals',headers={'X-SCADA-Token':'bad'})[0],403);g=self.catalog()['guides'][0]
  self.assertEqual(self.request('GET','/api/manual/'+g['id'],headers={'X-SCADA-Token':'bad'})[0],403);self.assertEqual(self.media(g['id'],'images/hmi-menu.jpg','wrong')[0],403)
  self.assertEqual(self.request('GET','/manual-media/'+g['id']+'/images/hmi-menu.jpg')[0],403)
 def test_unknown_id_and_media_cannot_escape_guide(self):
  g=self.catalog()['guides'][0]
  for id in ['no','f'*16,'../connection.json','..%2fconnection.json','a'*16+'?x=1']:
   self.assertEqual(self.request('GET','/api/manual/'+id)[0],404,id)
  for path in ['../connection.json','%2e%2e/connection.json','..%5cconnection.json','%2fetc/passwd','images//hmi-menu.jpg','images/../hmi-menu.jpg','C%3a/secret.png','images/hmi-menu.jpg%3asecret','images/hmi-menu.svg','%252e%252e/secret.png']:
   self.assertEqual(self.media(g['id'],path)[0],404,path)
 def test_directory_file_and_nested_links_are_refused(self):
  with tempfile.TemporaryDirectory() as external:
   out=pathlib.Path(external);(out/'index.md').write_text('# SECRET\n',encoding='utf-8');(out/'secret.png').write_bytes(PNG)
   (self.root/'linked-guide').symlink_to(out,target_is_directory=True)
   linked=self.root/'linked-file';linked.mkdir();(linked/'index.md').symlink_to(out/'index.md')
   safe=self.guide('03-safe','# Safe\n');(safe/'linked').symlink_to(out,target_is_directory=True);(safe/'direct.png').symlink_to(out/'secret.png')
   data=self.catalog();self.assertFalse(any(g['title']=='SECRET' for g in data['guides']));g=self.row('03-safe');self.assertEqual(self.media(g['id'],'linked/secret.png')[0],404);self.assertEqual(self.media(g['id'],'direct.png')[0],404)
 def test_linked_root_is_refused(self):
  moved=self.root.with_name('saved-manuals');self.root.rename(moved)
  with tempfile.TemporaryDirectory() as external:
   (pathlib.Path(external)/'secret').mkdir();(pathlib.Path(external)/'secret/index.md').write_text('# SECRET\n');self.root.symlink_to(external,target_is_directory=True)
   data=self.catalog();self.assertTrue(data['folderMissing']);self.assertEqual(data['guides'],[])
   self.root.unlink();moved.rename(self.root)
 def test_invalid_encoding_nul_large_text_and_hidden_folders(self):
  for name,data in [('bad-utf8',b'\xff\xfeoops'),('nul',b'# Secret\x00Oops'),('large',b'x'*65537)]:
   p=self.root/name;p.mkdir();(p/'index.md').write_bytes(data)
  self.guide('_hidden','# Hidden\n');self.guide('.hidden','# Hidden\n');data=self.catalog();self.assertEqual(data['invalid'],3);self.assertEqual(len(data['guides']),2)
 def test_photo_signatures_size_and_extension(self):
  p=self.guide('03-photo','# Photo\n');(p/'fake.png').write_text('<script>bad()</script>');(p/'valid.png').write_bytes(PNG);(p/'script.svg').write_text('<svg onload="bad()"/>')
  with (p/'huge.png').open('wb') as f:f.truncate(16*1024*1024+1)
  g=self.row(p.name)
  for path in ['fake.png','script.svg','huge.png','index.md']:self.assertEqual(self.media(g['id'],path)[0],404,path)
  self.assertEqual(self.media(g['id'],'valid.png'),(200,PNG))
 def test_reading_is_read_only_and_does_not_interrupt_counter_polling(self):
  for i in range(32):self.guide('guide-'+str(i),'# Guide '+str(i)+'\n\n'+('Text. '*2500))
  original={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in self.root.rglob('*.md')};start=time.monotonic()
  for _ in range(10):self.assertEqual(len(self.catalog()['guides']),34)
  time.sleep(.4);ticks=[at for at,key in self.mock.reads if key=='current' and at>=start];self.assertGreaterEqual(len(ticks),3);self.assertLess(max((b-a for a,b in zip(ticks,ticks[1:])),default=0),.6)
  self.assertEqual(original,{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in self.root.rglob('*.md')});self.assertEqual(self.mock.writes,[])
 def test_catalog_limit_and_long_unicode_titles_remain_valid_json(self):
  for i in range(129):self.guide('guide-'+str(i),'# '+('Длинный заголовок '*40)+'\n\nОписание.\n')
  data=self.catalog();self.assertEqual(len(data['guides']),128);self.assertTrue(data['limitReached']);self.assertTrue(all('\ufffd' not in g['title'] for g in data['guides']))
if __name__=='__main__':unittest.main(verbosity=2)
