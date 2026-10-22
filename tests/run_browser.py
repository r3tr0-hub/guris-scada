import contextlib,http.server,json,pathlib,subprocess,sys,tempfile,threading
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tests'))
import test_ads_integration as protocol
from mock_io import IoMockPLC
mock=IoMockPLC();network=[True];answer=mock.answer;mock.answer=lambda cmd,q:answer(cmd,q) if network[0] else None;tmp=tempfile.TemporaryDirectory();p=None
class Control(http.server.BaseHTTPRequestHandler):
 def do_POST(self):
  data=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  for k,v in data.items():
   if k=='__connection':
    network[0]=bool(v)
    if not v:
     for peer in mock.peers:
      with contextlib.suppress(OSError):peer.shutdown(2)
   elif k=='__alarms':
    import struct
    mock.alarms[:]=bytes(201*49)
    for row in v:
     at=row['slot']*49;struct.pack_into('<hh',mock.alarms,at,row.get('state',10),row['id']);mock.alarms[at+48]=int(row.get('condition',True));text=row.get('occurred','2026-10-15 18:00:00').encode()[:19];mock.alarms[at+8:at+8+len(text)]=text
   elif k=='__manual':
    folder=pathlib.Path(tmp.name)/'manuals'/v['folder'];assert folder.parent==pathlib.Path(tmp.name)/'manuals'
    if v.get('remove'):
     import shutil
     shutil.rmtree(folder)
    else:
     folder.mkdir(exist_ok=True);(folder/'index.md').write_text(v['text'],encoding='utf-8')
   elif k=='__io':
    for id,value in v.items():mock.set_io(id,value)
   elif k=='__read_errors':mock.read_errors=dict(v)
   elif k=='__ads_state':mock.ads_state=int(v)
   else:mock.set(k,v)
  self.send_response(200);self.end_headers();self.wfile.write(b'ok')
 def log_message(self,*a):pass
server=http.server.HTTPServer(('127.0.0.1',0),Control);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 import shutil
 shutil.copytree(ROOT/'ui',pathlib.Path(tmp.name)/'ui')
 shutil.copytree(ROOT/'manuals',pathlib.Path(tmp.name)/'manuals')
 p=subprocess.Popen([str(ROOT/'scada-test-host'),'--ip','127.0.0.1','--tcp-port',str(mock.port),'--ui',tmp.name],cwd=tmp.name,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 line=p.stdout.readline().split();assert line[0]=='READY',line
 import os
 out=pathlib.Path(os.environ.get('SCADA_QA_DIR',str(pathlib.Path(tmp.name)/'qa')));out.mkdir(exist_ok=True)
 result=subprocess.run(['node',str(ROOT/'tests'/(sys.argv[1] if len(sys.argv)>1 else 'test_browser.cjs')),f'http://127.0.0.1:{line[1]}/?k={line[2]}',line[2],f'http://127.0.0.1:{server.server_port}',str(out)])
 print('Actual mock writes:',[(k,v.hex()) for k,v in mock.writes]);sys.exit(result.returncode)
finally:
 if p:
  p.terminate()
  try:p.wait(8)
  except subprocess.TimeoutExpired:p.kill();p.wait()
  p.stdout.close();p.stderr.close()
 mock.close();server.shutdown();server.server_close();tmp.cleanup()
