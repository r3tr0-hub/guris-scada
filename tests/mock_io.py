"""Read-only I/O fixture layered over the existing protocol mock, on loopback."""
import json,pathlib,struct,time
import test_ads_integration as protocol
FORMATS={'BOOL':'B','INT':'h','UINT':'H','DINT':'i','REAL':'f','LREAL':'d','BYTE':'B'}
TYPES={'BOOL':33,'INT':2,'UINT':18,'DINT':3,'REAL':4,'LREAL':5,'BYTE':17}
CATALOG=json.loads((pathlib.Path(__file__).resolve().parents[1]/'ui/io_catalog.json').read_text())
class IoMockPLC(protocol.MockPLC):
 def __init__(self,*a,**kw):
  self.io_memory={};self.io_names={};self.io_reads=[];self.io_lookups=[];self.io_errors={}
  super().__init__(*a,**kw)
  with self.lock:
   for t in CATALOG['tags']:
    if t['symbol'].upper() in self.names:
     self.io_names[t['id']]=self.names[t['symbol'].upper()];continue
    i=t['id'];typ=t['type'];size=struct.calcsize('<'+FORMATS[typ]);direction=t['direction']
    group=0xf020 if direction=='in' else 0xf030
    offset=0x100000+i*16;value=(i%2) if typ=='BOOL' else (i%100 if typ in ['BYTE','UINT'] else -7 if typ=='INT' else 1234 if typ=='DINT' else 2.75)
    raw=struct.pack('<'+FORMATS[typ],value)
    f={'key':'io_'+str(i),'symbol':t['symbol'],'type':typ,'size':size,'offset':offset,'flags':32,'data_type':TYPES[typ],'group':group,'raw':raw}
    if typ=='BOOL' and i%2:
     f.update(group=group+1,offset=offset*8+5,flags=34);raw=bytes([(int(value)<<5)|4])
    self.names[t['symbol'].upper()]=f;self.io_names[i]=f
    self.io_memory[(group,offset)]=dict(f,raw=raw)
 def read(self,group,offset,size):
  f=self.io_memory.get((group,offset))
  if f:
   self.io_reads.append((time.monotonic(),f['key']));return f['raw'][:size]
  return super().read(group,offset,size)
 def answer(self,cmd,q):
  if cmd==9:
   g,o,n,w=struct.unpack_from('<IIII',q,38)
   if g==0xf009:
    f=self.names.get(q[54:54+w-1].decode().upper())
    if f and f['key'].startswith('io_'):
     self.io_lookups.append((time.monotonic(),f['key']))
     override=self.metadata_overrides.get(f['key'],{});err=override.get('error')
     if err:return struct.pack('<II',err,0)
     name=f['symbol'].encode();typ=override.get('type',f['type']).encode();size=override.get('size',f['size']);dt=override.get('data_type',f['data_type'])
     data=struct.pack('<IIIIIIHHH',33+len(name)+len(typ),f['group'],f['offset'],size,dt,override.get('flags',f['flags']),len(name),len(typ),0)+name+b'\0'+typ+b'\0\0'
     return struct.pack('<II',0,len(data))+data
   if g==0xf080:
    items=[struct.unpack_from('<III',q,54+k*12) for k in range(o)]
    if any((x[0],x[1]) in self.io_memory for x in items):
     self.sum_batches.append(o)
     if self.unsupported_sum:return struct.pack('<II',0x701,0)
     errors=[self.io_errors.get(self.io_memory.get((x[0],x[1]),{}).get('key'),0) for x in items]
     data=b''.join(struct.pack('<I',e) for e in errors)+b''.join(self.read(*x) for x in items)
     return struct.pack('<II',0,len(data))+data
  return super().answer(cmd,q)
 def set_io(self,id,value):
  f=self.io_names[int(id)]
  with self.lock:
   if not f['key'].startswith('io_'):return self.set(f['key'],value)
   group=f['group'];offset=f['offset'];raw=struct.pack('<'+FORMATS[f['type']],value)
   if group in (0xf021,0xf031):group-=1;offset//=8;raw=bytes([(int(bool(value))<<5)|4])
   self.io_memory[(group,offset)]['raw']=raw
