#ifndef SCADA_DIAGNOSTIC_EXPORT_H
#define SCADA_DIAGNOSTIC_EXPORT_H
#include "../vendor/miniz/miniz.h"
#ifndef SCADA_BUILD_ID
#define SCADA_BUILD_ID "development-unidentified"
#endif
static struct {Mutex mutex;int initialized,state;unsigned serial,hours,progress;uint64_t size;char id[80],error[256],path[2400];
#ifdef _WIN32
 HANDLE thread;
#else
 pthread_t thread;int thread_valid;
#endif
} diagnostic_export;
static void diagnostic_export_init(void){memset(&diagnostic_export,0,sizeof(diagnostic_export));mutex_init(&diagnostic_export.mutex);diagnostic_export.initialized=1;path_join(diagnostic_export.path,"local/diagnostic-export.zip");}
static void diagnostic_export_progress(unsigned value){lock(&diagnostic_export.mutex);diagnostic_export.progress=value;unlock(&diagnostic_export.mutex);}
static size_t diagnostic_export_write(void *opaque,mz_uint64 offset,const void *data,size_t size){FILE *f=opaque;if(offset>LONG_MAX||fseek(f,(long)offset,SEEK_SET))return 0;return fwrite(data,1,size,f);}
static int diagnostic_export_add(mz_zip_archive *zip,const char *name,FILE *f){
 long length=ftell(f);if(length<0||ferror(f)||fflush(f)||fseek(f,0,SEEK_SET))return 0;
 return mz_zip_writer_add_cfile(zip,name,f,(mz_uint64)length,NULL,NULL,0,MZ_BEST_SPEED,NULL,0,NULL,0);
}
static FILE *diagnostic_export_temp(void){char path[2400];path_join(path,"local/diagnostic-export-entry.tmp");return file_open(path,"w+b");}
static int diagnostic_export_query(mz_zip_archive *zip,sqlite3 *db,const char *name,const char *sql,int csv,uint64_t *rows){
 FILE *f=diagnostic_export_temp();if(!f)return 0;sqlite3_stmt *st=NULL;int ok=sqlite3_prepare_v2(db,sql,-1,&st,NULL)==SQLITE_OK;int count=st?sqlite3_column_count(st):0,rc=SQLITE_ERROR;
 if(ok&&csv){for(int i=0;i<count;i++){if(i)fputc(';',f);csv_text(f,sqlite3_column_name(st,i));}fputc('\n',f);}
 uint64_t n=0;
 while(ok&&(rc=sqlite3_step(st))==SQLITE_ROW){
  if((n++%1024)==0&&atomic_load(&app.stop)){ok=0;break;}
  if(csv){for(int i=0;i<count;i++){if(i)fputc(';',f);const unsigned char *s=sqlite3_column_text(st,i);csv_text(f,s?(const char*)s:"");}fputc('\n',f);}else{const unsigned char *s=sqlite3_column_text(st,0);if(s)fputs((const char*)s,f);fputc('\n',f);}
  if(ferror(f))ok=0;
 }
 if(rc!=SQLITE_DONE){ok=0;}
 sqlite3_finalize(st);if(ok)ok=diagnostic_export_add(zip,name,f);if(rows)*rows=n;fclose(f);return ok;
}
static int diagnostic_export_text(mz_zip_archive *zip,const char *name,const char *text){return mz_zip_writer_add_mem(zip,name,text,strlen(text),MZ_BEST_SPEED);}
static void diagnostic_export_work(void){
 sqlite3 *db=NULL,*prod=NULL;FILE *out=NULL;mz_zip_archive zip;memset(&zip,0,sizeof(zip));int ok=0,zip_open=0;uint64_t trace_rows=0,event_rows=0,interval_rows=0,production_events=0;unsigned hours;
 lock(&diagnostic_export.mutex);hours=diagnostic_export.hours;unlock(&diagnostic_export.mutex);
 uint64_t until=wall_ms(),from=until-(uint64_t)hours*3600000,context=from>600000?from-600000:0;
 char production_path[2400];path_join(production_path,"local/production.sqlite");
 if(sqlite3_open_v2(diagnostics.path,&db,SQLITE_OPEN_READONLY|SQLITE_OPEN_FULLMUTEX,NULL)!=SQLITE_OK||sqlite3_open_v2(production_path,&prod,SQLITE_OPEN_READONLY|SQLITE_OPEN_FULLMUTEX,NULL)!=SQLITE_OK)goto done;
 sqlite3_busy_timeout(db,300);sqlite3_busy_timeout(prod,300);
 /* Each database is pinned by a read transaction, independent of live writers. */
 if(sqlite3_exec(db,"BEGIN",NULL,NULL,NULL)!=SQLITE_OK||sqlite3_exec(prod,"BEGIN",NULL,NULL,NULL)!=SQLITE_OK)goto done;
 sqlite3_int64 last_sample=diagnostic_scalar(db,"SELECT coalesce(max(seq),0) FROM samples"),last_event=diagnostic_scalar(db,"SELECT coalesce(max(seq),0) FROM events");
 sqlite3_int64 last_interval=diagnostic_scalar(prod,"SELECT coalesce(max(seq),0) FROM intervals"),last_production_event=diagnostic_scalar(prod,"SELECT coalesce(max(seq),0) FROM events");
 sqlite3_int64 first_at=diagnostic_scalar(db,"SELECT coalesce(min(at),0) FROM samples"),last_at=diagnostic_scalar(db,"SELECT coalesce(max(at),0) FROM samples");
 size_t cap=65536u+F_COUNT*1536u;char *snapshot=malloc(cap);if(!snapshot)goto done;size_t bytes=diagnostic_report_json(snapshot,cap,1);if(!bytes){free(snapshot);goto done;}
 out=file_open(diagnostic_export.path,"w+b");if(!out){free(snapshot);goto done;}zip.m_pWrite=diagnostic_export_write;zip.m_pIO_opaque=out;
 if(!mz_zip_writer_init(&zip,0)){free(snapshot);goto done;}zip_open=1;
 int added=diagnostic_export_text(&zip,"snapshot.json",snapshot);free(snapshot);if(!added)goto done;
 char *sql=sqlite3_mprintf("SELECT * FROM samples WHERE seq<=%lld AND ((at>=%lld AND at<=%lld) OR seq=(SELECT seq FROM samples WHERE at<%lld ORDER BY seq DESC LIMIT 1)) ORDER BY seq",last_sample,(sqlite3_int64)context,(sqlite3_int64)until,(sqlite3_int64)context);if(!sql)goto done;
 diagnostic_export_progress(10);int query_ok=diagnostic_export_query(&zip,db,"trace.csv",sql,1,&trace_rows);sqlite3_free(sql);if(!query_ok)goto done;
 diagnostic_export_progress(45);
 sql=sqlite3_mprintf("SELECT json_object('sequence',seq,'sessionId',session,'observedUtcMs',at,'observedMonoMs',mono,'kind',kind,'payload',json(payload)) FROM events WHERE seq<=%lld AND at>=%lld AND at<=%lld ORDER BY seq",last_event,(sqlite3_int64)context,(sqlite3_int64)until);if(!sql)goto done;query_ok=diagnostic_export_query(&zip,db,"events.jsonl",sql,0,&event_rows);sqlite3_free(sql);if(!query_ok)goto done;
 sql=sqlite3_mprintf("SELECT json_object('sequence',seq,'sessionId',session,'observedUtcMs',at,'observedMonoMs',mono,'data',json(payload)) FROM contexts WHERE at<=%lld AND (at>=%lld OR seq=(SELECT seq FROM contexts WHERE at<%lld ORDER BY seq DESC LIMIT 1)) ORDER BY seq",(sqlite3_int64)until,(sqlite3_int64)context,(sqlite3_int64)context);if(!sql)goto done;query_ok=diagnostic_export_query(&zip,db,"context.jsonl",sql,0,NULL);sqlite3_free(sql);if(!query_ok)goto done;
 if(!diagnostic_export_query(&zip,db,"sessions.csv","SELECT * FROM sessions ORDER BY started",1,NULL))goto done;
 diagnostic_export_progress(60);
 sql=sqlite3_mprintf("SELECT i.seq AS id,i.start AS startUtcMs,i.end AS endUtcMs,i.duration AS durationMs,i.kind AS state,i.code,i.automatic,i.job AS jobId,i.epoch,i.plc,i.alarms,i.open,n.reason AS manualReason,n.comment,n.author,c.code AS reasonCode,c.alarms AS reasonAlarms,c.detected AS reasonDetectedUtcMs FROM intervals i LEFT JOIN notes n ON n.interval=i.seq LEFT JOIN stop_causes c ON c.interval=i.seq WHERE i.seq<=%lld AND i.start<%lld AND i.end>=%lld ORDER BY i.seq",last_interval,(sqlite3_int64)until,(sqlite3_int64)context);if(!sql)goto done;
 /* Preserve raw interval columns and the corresponding inferred/manual evidence. */
 query_ok=diagnostic_export_query(&zip,prod,"production_intervals.csv",sql,1,&interval_rows);sqlite3_free(sql);if(!query_ok)goto done;
 sql=sqlite3_mprintf("SELECT json_object('sequence',seq,'occurredAt',at,'kind',kind,'payload',json(payload)) FROM events WHERE seq<=%lld AND at>=%lld AND at<=%lld ORDER BY seq",last_production_event,(sqlite3_int64)context,(sqlite3_int64)until);if(!sql)goto done;
 query_ok=diagnostic_export_query(&zip,prod,"production_events.jsonl",sql,0,&production_events);sqlite3_free(sql);if(!query_ok)goto done;
 diagnostic_export_progress(75);
 /* The audit is a bounded copy of complete rows from the current launch. */
 FILE *audit_copy=diagnostic_export_temp();if(!audit_copy)goto done;
 lock(&app.log_mutex);if(app.log)fflush(app.log);FILE *audit_file=file_open(app.log_path,"rb");long audit_size=-1;if(audit_file&&!fseek(audit_file,0,SEEK_END)){audit_size=ftell(audit_file);rewind(audit_file);}unlock(&app.log_mutex);
 if(audit_size<0){fputs("Audit file unavailable; transactions remain in events.jsonl.\n",audit_copy);}else{
  unsigned char block[32768];long left=audit_size;while(left>0){size_t want=(size_t)(left>(long)sizeof(block)?(long)sizeof(block):left);size_t got=fread(block,1,want,audit_file);if(got!=want||fwrite(block,1,got,audit_copy)!=got){left=-1;break;}left-=(long)got;}if(left<0){fclose(audit_file);fclose(audit_copy);goto done;}
 }
 if(audit_file){fclose(audit_file);}
 added=diagnostic_export_add(&zip,"audit_current_session.csv",audit_copy);fclose(audit_copy);if(!added)goto done;
 /* Catalog contains definitions only; no symbol lookup is performed. */
 FILE *catalog=diagnostic_export_temp();if(!catalog)goto done;fputs("key;symbol;label;type;bytes;unit\n",catalog);for(int i=0;i<F_COUNT;i++){csv_text(catalog,defs[i].key);fputc(';',catalog);csv_text(catalog,defs[i].symbol);fputc(';',catalog);csv_text(catalog,defs[i].label);fputc(';',catalog);csv_text(catalog,type_name(defs[i].type));fprintf(catalog,";%u;",defs[i].bytes);csv_text(catalog,defs[i].unit);fputc('\n',catalog);}added=diagnostic_export_add(&zip,"field_catalog.csv",catalog);fclose(catalog);if(!added)goto done;
 size_t alarms_size=0;unsigned char *alarms=read_file("ui/alarms.json",&alarms_size);if(alarms){added=mz_zip_writer_add_mem(&zip,"alarm_catalog.json",alarms,alarms_size,MZ_BEST_SPEED);free(alarms);if(!added)goto done;}
 char manifest[6000];Buffer b;binit(&b,manifest,sizeof(manifest));
 uint64_t dropped;int failed;lock(&diagnostics.mutex);dropped=diagnostics.dropped;failed=diagnostics.failed;unlock(&diagnostics.mutex);
 sqlite3_int64 historical_drops=diagnostic_scalar(db,"SELECT coalesce(sum(dropped),0) FROM sessions");
 bf(&b,"{\"schemaVersion\":1,\"appVersion\":\"0.1.25\",\"sourceBuild\":");bj(&b,SCADA_BUILD_ID);bf(&b,",\"machineId\":");bj(&b,production.machine);bf(&b,",\"requestedHours\":%u,\"requestedFromUtcMs\":%llu,\"requestedToUtcMs\":%llu,\"contextFromUtcMs\":%llu,\"historyAvailableFromUtcMs\":%lld,\"historyAvailableToUtcMs\":%lld,\"recordingStartedBeforeRequestedPeriod\":%s,\"recorderStorageError\":%s,\"droppedThisSession\":%llu,\"persistedDropsAllSessions\":%lld,\"reasonPolicy\":1,\"reasonPolicyChanged\":false,\"counts\":{\"samples\":%llu,\"events\":%llu,\"intervals\":%llu,\"productionEvents\":%llu},\"snapshotBoundaries\":{\"diagnosticSampleSequence\":%lld,\"diagnosticEventSequence\":%lld,\"productionIntervalSequence\":%lld,\"productionEventSequence\":%lld},\"consistency\":\"Each history database is pinned in its own SQLite read transaction. snapshot.json is a separately timed live cache snapshot.\",\"auditCurrentSessionAvailable\":%s,\"captureWritesToPlc\":false,\"extraAdsReads\":false,\"integrity\":\"ZIP CRC32 for every entry\"}",hours,(unsigned long long)from,(unsigned long long)until,(unsigned long long)context,first_at,last_at,first_at&&first_at<=(sqlite3_int64)from?"true":"false",failed?"true":"false",(unsigned long long)dropped,historical_drops,(unsigned long long)trace_rows,(unsigned long long)event_rows,(unsigned long long)interval_rows,(unsigned long long)production_events,last_sample,last_event,last_interval,last_production_event,audit_size>=0?"true":"false");
 if(b.failed||!diagnostic_export_text(&zip,"manifest.json",manifest))goto done;
 const char *readme="Guris SCADA 0.1.25 diagnostic package\n\nTimes ending in UtcMs are milliseconds since Unix epoch UTC. mono is monotonic time and must only be compared within session.\ntrace.csv preserves every recorder observation; it is not a higher-frequency PLC trace. Quality mask bits 0..6: state, automatic, total, unwinder control, sensor configuration, speed setpoint, working length; bit 7 connected; bit 8 alarm quality; bit 9 alarm-list truncation; bits 10/11 current-batch and group counter quality.\ncontrol is unwinderAutoStop; sensor_configured is the equipment/configuration flag, NOT the physical sensor input. guard: 0 normal, 1 temporary, 2 permanent, 3 restore (see source). speed_set is a setpoint, working_length is millimetres. current_count and groups_count are the other two counters. deadline is monotonic and scoped to session.\nThe current reason policy remains version 1; reason.closed(first_work_state) records its known short-restart limitation. Automatic material causes are inferences, not evidence of physical replacement.\ncontext.jsonl stores cached parameter and already-open I/O view snapshots every 30 seconds, with field age, raw bytes, ADS error and quality; scoped engineering fields are not polled just for diagnostics.\nUse raw trace + events to analyse winding off, ordinary stop and restart. Commands are separately identified by operationId and actor; an observed PLC change alone does not identify the physical button or originating client.\nA baseline observation before the context window is included when available. Missing history before upgrade cannot be recovered. Queue drops, storage failures, process restarts and bad-quality observations must be considered before drawing conclusions.\nNo accounts, password hashes, browser profiles or UI session token files are included. audit_current_session.csv covers only the current launch; durable transaction events cover recorded launches.\n";
 if(!diagnostic_export_text(&zip,"README.txt",readme))goto done;
 diagnostic_export_progress(95);if(!mz_zip_writer_finalize_archive(&zip)||fflush(out)||ferror(out))goto done;
 if(fseek(out,0,SEEK_END)){goto done;}
 long zip_size=ftell(out);if(zip_size<0)goto done;lock(&diagnostic_export.mutex);diagnostic_export.size=(uint64_t)zip_size;unlock(&diagnostic_export.mutex);ok=1;
 done:
 if(zip_open){mz_zip_writer_end(&zip);}
 if(out){fclose(out);}
 if(db){sqlite3_exec(db,"ROLLBACK",NULL,NULL,NULL);sqlite3_close(db);}if(prod){sqlite3_exec(prod,"ROLLBACK",NULL,NULL,NULL);sqlite3_close(prod);}
 lock(&diagnostic_export.mutex);diagnostic_export.state=ok?2:3;diagnostic_export.progress=ok?100:diagnostic_export.progress;if(!ok)copy_s(diagnostic_export.error,sizeof(diagnostic_export.error),"Не удалось сформировать пакет. Проверьте свободное место и состояние журнала.");unlock(&diagnostic_export.mutex);
}
#ifdef _WIN32
static DWORD WINAPI diagnostic_export_entry(LPVOID arg){(void)arg;SetThreadPriority(GetCurrentThread(),THREAD_PRIORITY_BELOW_NORMAL);diagnostic_export_work();return 0;}
#else
static void *diagnostic_export_entry(void *arg){(void)arg;diagnostic_export_work();return NULL;}
#endif
static void diagnostic_export_join(void){
#ifdef _WIN32
 if(diagnostic_export.thread){WaitForSingleObject(diagnostic_export.thread,INFINITE);CloseHandle(diagnostic_export.thread);diagnostic_export.thread=NULL;}
#else
 if(diagnostic_export.thread_valid){pthread_join(diagnostic_export.thread,NULL);diagnostic_export.thread_valid=0;}
#endif
}
static int diagnostic_export_request(Pair *p,int n,char *reason,size_t cap){
 double hours;if(n!=1||!p[0].number||strcmp(p[0].key,"hours")||!number_parse(p[0].value,&hours)||(hours!=12&&hours!=24)){copy_s(reason,cap,"Выберите 12 или 24 часа");return 422;}
 lock(&diagnostic_export.mutex);int busy=diagnostic_export.state==1;unlock(&diagnostic_export.mutex);if(busy){copy_s(reason,cap,"Пакет уже формируется");return 409;}diagnostic_export_join();
 lock(&diagnostic_export.mutex);diagnostic_export.hours=(unsigned)hours;diagnostic_export.state=1;diagnostic_export.progress=0;diagnostic_export.size=0;diagnostic_export.error[0]=0;snprintf(diagnostic_export.id,sizeof(diagnostic_export.id),"%s-%u",diagnostics.session,++diagnostic_export.serial);unlock(&diagnostic_export.mutex);
#ifdef _WIN32
 diagnostic_export.thread=CreateThread(NULL,0,diagnostic_export_entry,NULL,0,NULL);int started=diagnostic_export.thread!=NULL;
#else
 int started=pthread_create(&diagnostic_export.thread,NULL,diagnostic_export_entry,NULL)==0;diagnostic_export.thread_valid=started;
#endif
 if(!started){lock(&diagnostic_export.mutex);diagnostic_export.state=3;copy_s(diagnostic_export.error,sizeof(diagnostic_export.error),"Не удалось запустить формирование пакета");unlock(&diagnostic_export.mutex);copy_s(reason,cap,diagnostic_export.error);return 503;}copy_s(reason,cap,"Пакет формируется в фоне");return 202;
}
static size_t diagnostic_status_json(char *out,size_t cap){Buffer b;binit(&b,out,cap);bf(&b,"{\"recorder\":");diagnostic_health_json(&b);lock(&diagnostic_export.mutex);bf(&b,",\"export\":{\"state\":%d,\"progress\":%u,\"size\":%llu,\"hours\":%u,\"id\":",diagnostic_export.state,diagnostic_export.progress,(unsigned long long)diagnostic_export.size,diagnostic_export.hours);bj(&b,diagnostic_export.id);bf(&b,",\"message\":");bj(&b,diagnostic_export.error);bf(&b,"}}");unlock(&diagnostic_export.mutex);return b.failed?0:b.used;}
static void diagnostic_chunk_http(Socket s,const char *route){
 char id[100],offset_text[40];double offset;if(production_parameter(route,"id",id,sizeof(id))!=1||production_parameter(route,"offset",offset_text,sizeof(offset_text))!=1||!number_parse(offset_text,&offset)||offset<0||offset>2147483647.0||floor(offset)!=offset){http_message(s,422,"Некорректная часть пакета");return;}
 lock(&diagnostic_export.mutex);int match=diagnostic_export.state==2&&!strcmp(id,diagnostic_export.id);uint64_t size=diagnostic_export.size;unlock(&diagnostic_export.mutex);
 if(!match||(uint64_t)offset>=size){http_message(s,409,"Пакет изменился или ещё не готов");return;}
 FILE *f=file_open(diagnostic_export.path,"rb");unsigned char *data=malloc(262144);if(!f||!data||fseek(f,(long)offset,SEEK_SET)){if(f)fclose(f);free(data);http_message(s,503,"Не удалось прочитать пакет");return;}
 size_t want=(size_t)(size-(uint64_t)offset>262144?262144:size-(uint64_t)offset),got=fread(data,1,want,f);fclose(f);if(got!=want)http_message(s,503,"Пакет прочитан не полностью");else http_response(s,200,"application/octet-stream",data,got);free(data);
}
#endif
