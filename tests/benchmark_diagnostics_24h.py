#!/usr/bin/env python3
"""Accelerated volume check, NOT an actual 24-hour on-machine endurance run.
Seeds an offline temporary DB with 24h10m at 10 Hz, then exercises the real
export API while the loopback peer and recorder continue receiving counters.
"""
import csv,io,json,pathlib,sqlite3,sys,time,threading
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from test_diagnostics import Diagnostics


def main():
 case=Diagnostics('test_snapshot_has_time_session_coverage_and_age_without_extra_writes');case.setUp();active=threading.Event();worker=None
 try:
  case.login();case.wait(lambda:case.rows()>8);case.stop()
  started=time.monotonic();until=int(time.time()*1000);begin=until-87000000;count=870001
  database=case.base/'local/diagnostics.sqlite'
  with sqlite3.connect(database) as db:
   template=db.execute('SELECT * FROM samples ORDER BY seq DESC LIMIT 1').fetchone();columns=[r[1] for r in db.execute('PRAGMA table_info(samples)')][1:];values=dict(zip(['seq']+columns,template));context=db.execute('SELECT payload FROM contexts ORDER BY seq DESC LIMIT 1').fetchone()[0]
   db.execute('DELETE FROM samples');db.execute('DELETE FROM contexts');db.execute("INSERT INTO sessions(id,started,version,machine,ended,source_build,utc_offset_minutes) VALUES('synthetic-24h',?,'0.1.25','synthetic-machine',?,'synthetic-volume',0)",(begin,until))
   expressions=[];parameters=[]
   for col in columns:
    if col=='session':expressions.append("'synthetic-24h'")
    elif col in ('at','mono','total_observed'):expressions.append('?+x*100');parameters.append(begin if col=='at' else 100000)
    elif col=='total':expressions.append('1000+cast(x/4 as int)')
    elif col=='current_count':expressions.append('cast(x/4 as int)%100')
    elif col=='groups_count':expressions.append('cast(x/400 as int)')
    elif col in ('state','automatic','good','total_good','alarms_good','quality_mask'):expressions.append(str({'state':4,'automatic':1,'good':1,'total_good':1,'alarms_good':1,'quality_mask':3583}[col]))
    else:expressions.append('?');parameters.append(values[col])
   query='WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<'+str(count-1)+') INSERT INTO samples('+','.join(columns)+') SELECT '+','.join(expressions)+' FROM n'
   db.execute(query,parameters)
   db.executemany("INSERT INTO contexts(session,at,mono,payload) VALUES('synthetic-24h',?,?,?)",((begin+i*30000,100000+i*30000,context) for i in range(2901)))
  seed_seconds=time.monotonic()-started;db_bytes=database.stat().st_size
  case.cookie='';case.start();case.assertEqual(case.request('POST','/api/auth/login',{'password':'827491'})[0],200)
  values_seen=[];active.set()
  def tick():
   total=600000
   while active.is_set():
    case.mock.set('total',total);values_seen.append(total);total+=1;time.sleep(.1)
  worker=threading.Thread(target=tick);worker.start();time.sleep(.3);before=case.status()['recorder'];started=time.monotonic();archive=case.package(24);elapsed=time.monotonic()-started;after=case.status()['recorder'];active.clear();worker.join();worker=None
  manifest=json.loads(archive.read('manifest.json'));case.assertGreaterEqual(manifest['counts']['samples'],863000);case.assertTrue(manifest['recordingStartedBeforeRequestedPeriod']);case.assertEqual(after['dropped'],0);case.assertFalse(after['storageError']);case.assertGreater(after['written'],before['written']);case.assertTrue(case.request('GET','/api/state')[1]['connected'])
  case.assertIsNone(archive.testzip())
  result={'type':'accelerated_synthetic_volume_not_endurance','passed':True,'seededSamples':count,'seededContextSnapshots':2901,'seedSeconds':round(seed_seconds,3),'databaseBytes':db_bytes,'exportSecondsIncludingChunkDownloadAndCRC':round(elapsed,3),'zipBytes':archive.fp.getbuffer().nbytes,'traceSamplesInArchive':manifest['counts']['samples'],'liveItemsWrittenDuringExport':after['written']-before['written'],'droppedDuringActiveSession':after['dropped'],'storageError':after['storageError'],'extraPlcWrites':len(case.mock.writes)}
  target=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'qa/diagnostics-volume-24h.json');target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result))
 finally:
  active.clear()
  if worker:worker.join()
  case.tearDown()

if __name__=='__main__':main()
