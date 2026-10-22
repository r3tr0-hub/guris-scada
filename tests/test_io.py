"""Exercise read-only diagnostics against the real C backend and a local mock."""
import time,unittest
import test_ads_integration as legacy
from mock_io import IoMockPLC,CATALOG
class Diagnostics(unittest.TestCase):
 request=legacy.Backend.request;state=legacy.Backend.state;await_state=legacy.Backend.await_state;tearDown=legacy.Backend.tearDown
 def setUp(self):
  original=legacy.MockPLC;legacy.MockPLC=IoMockPLC
  try:legacy.Backend.setUp(self)
  finally:legacy.MockPLC=original
 def select(self,ids,epoch=None):return self.request('POST','/api/io-view',{'ids':','.join(map(str,ids)),'epoch':self.state()['epoch'] if epoch is None else epoch})
 def sample(self,predicate,timeout=6):
  until=time.monotonic()+timeout
  while time.monotonic()<until:
   status,data=self.request('GET','/api/io');self.assertEqual(status,200)
   if predicate(data):return data
   time.sleep(.04)
  self.fail('No expected I/O snapshot: '+str(data))
 def ids(self,typ=None,direction=None):return [t['id'] for t in CATALOG['tags'] if (not typ or t['type']==typ) and (not direction or t['direction']==direction)]
 def test_all_scalar_types_bit_extraction_and_no_writes(self):
  ids=[next(iter([i for i in self.ids(typ) if self.mock.io_names[i]['key'].startswith('io_')] or self.ids(typ))) for typ in ['BOOL','INT','UINT','DINT','REAL','BYTE']]
  for i,v in zip(ids,[1,-7,17,1234,2.75,9]):self.mock.set_io(i,v)
  bit=next(i for i in self.ids('BOOL','out') if i%2 and self.mock.io_names[i]['key'].startswith('io_'));ids.append(bit)
  self.mock.set_io(bit,0);self.assertEqual(self.select(ids)[0],202)
  d=self.sample(lambda d:len(d['records'])==len(ids) and all(r['quality'] for r in d['records']))
  values={r['id']:r['value'] for r in d['records']};self.assertEqual(values[bit],0);self.assertEqual(values[ids[1]],-7);self.assertEqual(values[ids[3]],1234);self.assertEqual(values[ids[4]],2.75);self.assertGreaterEqual(values[ids[5]],0)
  self.mock.set_io(bit,1);self.sample(lambda d:any(r['id']==bit and r['value']==1 for r in d['records']));self.assertEqual(self.mock.writes,[])
 def test_selection_schema_bounds_epoch_and_authentication(self):
  for body in [{'ids':'-1','epoch':1},{'ids':str(len(CATALOG['tags'])),'epoch':1},{'ids':'0,0','epoch':1},{'ids':'0,','epoch':1},{'ids':'0.1','epoch':1},{'ids':','.join(map(str,range(49))),'epoch':1},{'ids':'0','epoch':1,'symbol':'.DO_Korna'},{'ids':'0','epoch':1,'offset':123}]:
   self.assertEqual(self.request('POST','/api/io-view',body)[0],400,body)
  self.assertEqual(self.select([0],self.state()['epoch']+1)[0],409)
  self.assertEqual(self.request('GET','/api/io',headers={'X-SCADA-Token':'wrong'})[0],403)
  self.assertEqual(self.request('POST','/api/io-view',{'ids':'','epoch':0})[0],202)
  self.assertEqual(self.mock.writes,[])
 def test_missing_wrong_type_and_per_item_error_are_unknown(self):
  ids=[i for i in self.ids('BOOL') if self.mock.io_names[i]['key'].startswith('io_')][:4]
  self.mock.metadata_overrides['io_'+str(ids[0])]={'error':0x710}
  self.mock.metadata_overrides['io_'+str(ids[1])]={'type':'INT','data_type':2}
  self.mock.io_errors['io_'+str(ids[2])]=0x703
  self.select(ids);data=self.sample(lambda d:any(r['id']==ids[3] and r['quality'] for r in d['records']))
  for row in data['records'][:3]:self.assertFalse(row['quality']);self.assertIsNone(row['value'])
  self.assertTrue(data['records'][3]['quality']);self.assertEqual(self.mock.writes,[])
 def test_lease_expiry_and_explicit_pause_stop_io_reads(self):
  ids=self.ids('REAL')[:2];self.select(ids);self.sample(lambda d:any(r['quality'] for r in d['records']))
  time.sleep(2.6);d=self.sample(lambda d:not d['active']);self.assertTrue(all(r['value'] is None for r in d['records']))
  before=len(self.mock.io_reads);time.sleep(.65);self.assertEqual(len(self.mock.io_reads),before)
  self.select(ids);self.sample(lambda d:any(r['quality'] for r in d['records']));self.select([])
  self.sample(lambda d:not d['active'] and not d['records']);time.sleep(.2);before=len(self.mock.io_reads);time.sleep(.55);self.assertEqual(len(self.mock.io_reads),before)
 def test_symbol_version_resolves_selection_again_and_offline_is_unknown(self):
  ids=self.ids('BOOL')[:2];self.select(ids);self.sample(lambda d:all(r['quality'] for r in d['records']))
  before=len(self.mock.io_lookups);old=self.state()['epoch'];self.mock.version+=1
  self.await_state(lambda d:d['epoch']>old and d['connected']);self.select(ids)
  self.sample(lambda d:all(r['quality'] for r in d['records']));self.assertGreater(len(self.mock.io_lookups),before)
  self.mock.ads_state=4;self.await_state(lambda d:d['adsState']==4)
  data=self.sample(lambda d:all(not r['quality'] for r in d['records']));self.assertTrue(all(r['value'] is None for r in data['records']));self.assertEqual(self.mock.writes,[])
 def test_visible_page_change_never_leaks_old_values(self):
  a,b=self.ids('REAL')[:2];self.select([a]);self.sample(lambda d:len(d['records'])==1 and d['records'][0]['quality'])
  self.select([b]);d=self.sample(lambda d:len(d['records'])==1 and d['records'][0]['id']==b and d['records'][0]['quality']);self.assertNotEqual(d['records'][0]['id'],a)
 def test_48_signal_resolution_keeps_counters_polling(self):
  ids=[i for i in range(len(CATALOG['tags'])) if self.mock.io_names[i]['key'].startswith('io_')][:48]
  start=time.monotonic();self.select(ids)
  until=time.monotonic()+4
  while time.monotonic()<until:
   self.select(ids);time.sleep(.4)
  data=self.sample(lambda d:len(d['records'])==48 and all(r['quality'] for r in d['records']))
  ticks=[at for at,key in self.mock.reads if key=='current' and at>=start];self.assertGreater(len(ticks),20)
  self.assertLess(max(b-a for a,b in zip(ticks,ticks[1:])),.6)
  lookups=[at for at,key in self.mock.io_lookups if at>=start];self.assertEqual(len(lookups),48)
  self.assertEqual(self.mock.writes,[])
 def test_sum_read_fallback_remains_read_only(self):
  self.mock.unsupported_sum=True;ids=self.ids('INT')[:3];self.select(ids)
  self.sample(lambda d:len(d['records'])==3 and all(r['quality'] for r in d['records']));self.assertEqual(self.mock.writes,[])
if __name__=='__main__':unittest.main(verbosity=2)
