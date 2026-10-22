"""All engineering sections against a synthetic loopback ADS peer; never a machine."""
import json,struct,time,unittest,uuid,re
import test_ads_integration as plc
CATALOG=json.loads((plc.ROOT/'ui/engineering.json').read_text())['sections']
class Release24(unittest.TestCase):
 setUp=plc.Backend.setUp;tearDown=plc.Backend.tearDown
 request=plc.Backend.request;state=plc.Backend.state;await_state=plc.Backend.await_state
 write=plc.Backend.write;terminal=plc.Backend.terminal
 def login(self):self.assertEqual(self.request('POST','/api/auth/setup',{'password':'221024'})[0],200)
 def select(self,id):self.assertEqual(self.request('POST','/api/engineering-view',{'section':id})[0],200)
 def activate(self,section):
  self.select(section['id']);until=time.monotonic()+15;beat=0
  keys={p['key'] for p in section['parameters'] if not p.get('sources')}
  while time.monotonic()<until:
   if time.monotonic()>beat:self.select(section['id']);beat=time.monotonic()+1
   s=self.state()
   if all(k in s['fields'] and s['fields'][k]['quality'] for k in keys):return s
   time.sleep(.05)
  self.fail('Section failed to resolve: '+section['id']+' / '+str({k:s['fields'].get(k) for k in keys if not s['fields'].get(k,{}).get('quality')}))
 def test_scope_is_engineer_only_allowlisted_and_does_not_write_on_open(self):
  self.assertEqual(self.request('POST','/api/engineering-view',{'section':'mainRoller'})[0],403)
  self.login();self.assertEqual(self.request('POST','/api/engineering-view',{'section':'.arbitrary.symbol'})[0],400)
  self.assertEqual(self.request('POST','/api/engineering-view',{'section':'mainRoller','extra':1})[0],400)
  s=self.activate(CATALOG[0]);self.assertGreater(len(s['fields']),256)
  self.select('');s=self.state();self.assertEqual(len(s['fields']),256);self.assertEqual(self.mock.writes,[])
 def test_all_sections_and_scalars_match_native_metadata_without_aliases(self):
  self.assertEqual(len(CATALOG),30);self.assertEqual(len(plc.all_rows),714)
  self.assertEqual(len({q[1].upper() for q in plc.all_rows}),714)
  self.login()
  for section in CATALOG:
   s=self.activate(section)
   for p in section['parameters']:
    self.assertTrue(p['description']);self.assertTrue(p['original'])
    if p.get('sources'):continue
    f=s['fields'][p['key']];self.assertEqual(f['symbol'].upper(),p['symbol'].upper());self.assertEqual(f['type'],p['type']);self.assertTrue(f['metadata']['resolved'])
    if (p['readOnly'] or p.get('command')) and p['key']!='offset':self.assertFalse(f['writable'],p['key'])
   self.assertTrue(all(n<=64 for n in self.mock.sum_batches))
  self.assertEqual(self.mock.writes,[])
 def test_every_writable_engineering_reference_has_exact_wire_encoding_and_readback(self):
  self.login();self.mock.set('machineState',4);self.mock.set('automatic',1)
  seen=set();count=0
  for section in CATALOG:
   s=self.activate(section);beat=time.monotonic()+1
   for p in section['parameters']:
    key=p['key']
    if p['readOnly'] or p.get('command') or key in seen:continue
    seen.add(key)
    if time.monotonic()>beat:self.select(section['id']);beat=time.monotonic()+1
    f=self.state()['fields'][key];lo,hi=f['min'],f['max']
    value=(1-int(f['value'])) if p['type']=='BOOL' else (int('A0123456789F',16) if p['type']=='STRING(12)' else max(lo,min(hi,2 if f['integer'] else 1.25)))
    # This test deliberately changes references, including channel assignments.
    status,_,body=self.write(key,value);self.assertEqual(status,202,(section['id'],key,f))
    done=self.terminal(body);self.assertEqual(done['status'],'confirmed',(key,done))
    wire=plc.pack_value('HEX12' if p['type']=='STRING(12)' else p['type'],value)
    self.assertEqual(self.mock.fields[key]['raw'],wire,key);self.assertEqual(self.state()['fields'][key]['raw'].upper(),wire.hex().upper(),key);count+=1
   # Channel renaming invalidates fixed operator bindings, intentionally, but not engineering fields.
  self.assertGreaterEqual(count,400)
 def test_existing_and_new_engineering_references_ignore_all_machine_state_codes(self):
  self.login();section=CATALOG[0];self.activate(section);key=next(p['key'] for p in section['parameters'] if not p['readOnly'])
  for state in range(15):
   self.select(section['id']);self.mock.set('machineState',state);self.mock.set('automatic',state%2)
   self.await_state(lambda s:s['fields']['machineState']['value']==state)
   for name,value in [(key,90+state/10),('perfHydraulicMode',1+state%3),('cfgCeneServoVar',state%2)]:
    status,_,body=self.write(name,value);self.assertEqual(status,202,(state,name));self.assertEqual(self.terminal(body)['status'],'confirmed')
 def test_scoped_fields_expire_and_stop_polling_after_the_page_is_closed(self):
  self.login();s=self.activate(CATALOG[0]);key=next(p['key'] for p in CATALOG[0]['parameters'] if p['key'].startswith('eng'))
  self.select('');time.sleep(.65);mark=len(self.mock.reads);time.sleep(.65)
  self.assertFalse(any(k==key for _,k in self.mock.reads[mark:]));self.assertEqual(len(self.state()['fields']),256)
  self.select('mainRoller');self.await_state(lambda s:s['fields'].get(key,{}).get('quality'));time.sleep(5.2)
  self.assertEqual(len(self.state()['fields']),256)
  fast=[at for at,k in self.mock.reads[mark:] if k=='current'];self.assertGreater(len(fast),35)
 def test_uint_time_double_and_string_metadata_mismatches_never_enable_writes(self):
  self.login()
  cases=[next((s,p) for s in CATALOG for p in s['parameters'] if p['type']==typ and not p['readOnly']) for typ in ('TIME','LREAL','STRING(12)')]
  for section,p in cases:self.mock.metadata_overrides[p['key']]={'data_type':3}
  for section,p in cases:
   self.select(section['id'])
   self.await_state(lambda st:st['fields'].get(p['key'],{}).get('metadata',{}).get('status')=='type_or_size_mismatch',12)
   self.assertEqual(self.write(p['key'],0)[0],409);self.assertFalse(self.state()['fields'][p['key']]['writable'])
  self.assertEqual(self.mock.writes,[])
 def test_new_fields_recheck_original_hmi_changes_and_do_not_retry_lost_ack(self):
  self.login();section=CATALOG[0];s=self.activate(section);key=next(p['key'] for p in section['parameters'] if p['type']=='REAL' and not p['readOnly']);self.mock.set(key,91)
  body=dict(id=str(uuid.uuid4()),key=key,value=92,epoch=s['epoch'],expected=s['fields'][key]['raw'])
  status,_=self.request('POST','/api/write',body)
  if status==202:self.assertEqual(self.terminal(body)['status'],'conflict')
  else:self.assertEqual(status,409)
  self.assertEqual(self.mock.writes,[]);self.await_state(lambda s:s['fields'][key]['value']==91)
  self.mock.behavior='lost_ack';status,_,body=self.write(key,93);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'uncertain');time.sleep(.3);self.assertEqual(len(self.mock.writes),1)
 def test_timed_cleaning_cannot_be_bypassed_by_the_engineering_catalog(self):
  self.login();self.activate(next(s for s in CATALOG if s['id']=='belt'))
  for value in (45,20,180):self.assertEqual(self.write('beltIdleSpeed',value)[0],422)
  self.mock.set('machineState',4);self.mock.set('automatic',1);self.await_state(lambda s:s['fields']['machineState']['value']==4)
  status,_,body=self.write('beltIdleSpeed',10);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed')
 def test_readonly_failure_is_independent_from_its_editable_reference(self):
  self.login();section=next(s for s in CATALOG if s['id']=='photocell');self.activate(section)
  p=next(p for p in section['parameters'] if p.get('pairedWith'));self.mock.read_errors[p['key']]=0x701
  s=self.await_state(lambda s:not s['fields'][p['key']]['quality']);self.assertTrue(s['fields'][p['pairedWith']]['quality']);self.assertTrue(s['fields'][p['pairedWith']]['writable'])
 def test_time_boundaries_double_precision_and_lossless_audit(self):
  import csv,pathlib
  self.login();section=next(s for s in CATALOG if s['id']=='heatTuning');self.activate(section)
  timer=next(p['key'] for p in section['parameters'] if p['type']=='TIME')
  double=next(p['key'] for p in section['parameters'] if p['type']=='LREAL' and not p['readOnly'])
  for bad in (-1,4294967296,1.5):self.assertEqual(self.write(timer,bad)[0],422)
  status,_,body=self.write(timer,4294967295);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.mock.fields[timer]['raw'],b'\xff'*4)
  value=1.234567890123;status,_,body=self.write(double,value);self.assertEqual(status,202);self.assertEqual(self.terminal(body)['status'],'confirmed');self.assertEqual(self.mock.fields[double]['raw'],struct.pack('<d',value))
  logs=list((pathlib.Path(self.tmp.name)/'logs').glob('*.csv'));self.assertTrue(logs)
  rows=[r for p in logs for r in csv.reader(p.read_text(encoding='utf-8-sig').splitlines(),delimiter=';') if double in r]
  self.assertTrue(any(float(r[5])==value for r in rows),rows)

if __name__=='__main__':unittest.main(verbosity=2)
