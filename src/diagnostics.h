#ifndef SCADA_DIAGNOSTICS_H
#define SCADA_DIAGNOSTICS_H
/* Versioned local recorder. It never sends an ADS request. */
#define DIAG_MAX_SAMPLES 1200000
#define DIAG_MAX_EVENTS 200000
static sqlite3 *diagnostic_db;
static int diagnostic_batch_failed,diagnostic_last_sql_error;
static sqlite3_stmt *diagnostic_insert;
static uint64_t diagnostic_next_prune,diagnostic_next_context;
static ProductionSample diagnostic_previous;
static int diagnostic_have_previous;
static void diagnostic_failed(const char *message){diagnostic_batch_failed=1;if(diagnostic_db){int code=sqlite3_errcode(diagnostic_db);if(code!=SQLITE_OK)diagnostic_last_sql_error=code;}lock(&diagnostics.mutex);diagnostics.failed=1;diagnostics.storage_errors++;diagnostics.last_error_at=wall_ms();copy_s(diagnostics.last_error,sizeof(diagnostics.last_error),message);copy_s(diagnostics.error,sizeof(diagnostics.error),message);unlock(&diagnostics.mutex);}
static int diagnostic_sql(const char *sql){char *error=NULL;int rc=sqlite3_exec(diagnostic_db,sql,NULL,NULL,&error);if(rc!=SQLITE_OK)diagnostic_failed(error?error:sqlite3_errmsg(diagnostic_db));sqlite3_free(error);return rc==SQLITE_OK;}
static int diagnostic_sqlf(const char *format,...){va_list args;va_start(args,format);char *sql=sqlite3_vmprintf(format,args);va_end(args);if(!sql){diagnostic_failed("Недостаточно памяти для записи журнала");return 0;}int ok=diagnostic_sql(sql);sqlite3_free(sql);return ok;}
static sqlite3_int64 diagnostic_scalar(sqlite3 *db,const char *sql){sqlite3_stmt *st=NULL;sqlite3_int64 value=0;if(sqlite3_prepare_v2(db,sql,-1,&st,NULL)==SQLITE_OK&&sqlite3_step(st)==SQLITE_ROW)value=sqlite3_column_int64(st,0);sqlite3_finalize(st);return value;}
static void diagnostic_store_event(const char *kind,uint64_t wall,uint64_t mono,const char *json){
 diagnostic_sqlf("INSERT INTO events(session,at,mono,kind,payload) VALUES(%Q,%lld,%lld,%Q,%Q)",diagnostics.session,(sqlite3_int64)wall,(sqlite3_int64)mono,kind,json);
}
static void diagnostic_transition(const char *kind,const ProductionSample *s){
 char data[1700],alarms[400];production_alarm_json(s,alarms);Buffer b;binit(&b,data,sizeof(data));
 bf(&b,"{\"state\":%d,\"automatic\":%d,\"good\":%s,\"total\":%d,\"totalGood\":%s,\"control\":%d,\"sensorConfigured\":%d,\"qualityMask\":%u,\"guard\":%d,\"deadlineMonoMs\":%llu,\"cleaningActive\":%d,\"cleaningPending\":%d,\"epoch\":%u,\"configSerial\":%u,\"alarmsGood\":%s,\"alarms\":%s,\"origin\":\"observation_not_button_identity\",\"plc\":",s->code,s->automatic,s->good?"true":"false",s->total,s->total_good?"true":"false",s->diag_control,s->diag_sensor,s->diag_flags,s->diag_guard,(unsigned long long)s->diag_deadline,s->diag_clean_active,s->diag_clean_pending,s->epoch,s->serial,s->alarm_good?"true":"false",alarms);bj(&b,s->plc);bf(&b,"}");if(!b.failed)diagnostic_store_event(kind,s->wall,s->mono,data);
}
static int diagnostic_store_sample(const ProductionSample *s){
 if(!diagnostic_have_previous){diagnostic_transition("signals.initial",s);if(s->good)diagnostic_next_context=0;}
 else{
  ProductionSample *p=&diagnostic_previous;if(s->good&&!p->good)diagnostic_next_context=0;
  int64_t wall_delta=(int64_t)s->wall-(int64_t)p->wall,mono_delta=(int64_t)s->mono-(int64_t)p->mono;
  if(llabs(wall_delta-mono_delta)>2000||mono_delta>2000){char gap[240];snprintf(gap,sizeof(gap),"{\"wallDeltaMs\":%lld,\"monoDeltaMs\":%lld,\"clockChanged\":%s}",(long long)wall_delta,(long long)mono_delta,llabs(wall_delta-mono_delta)>2000?"true":"false");diagnostic_store_event("observation.gap",s->wall,s->mono,gap);}
  if(s->good!=p->good||s->code!=p->code||s->automatic!=p->automatic||s->epoch!=p->epoch||s->serial!=p->serial)diagnostic_transition("machine.changed",s);
  if(s->alarm_good!=p->alarm_good||s->alarm_count!=p->alarm_count||memcmp(s->alarms,p->alarms,sizeof(s->alarms)))diagnostic_transition("alarms.changed",s);
  if(s->diag_control!=p->diag_control||s->diag_sensor!=p->diag_sensor||((s->diag_flags^p->diag_flags)&24u))diagnostic_transition("unwinder.control_observed",s);
  if(s->diag_guard!=p->diag_guard||s->diag_deadline!=p->diag_deadline)diagnostic_transition("unwinder.guard_changed",s);
  if(s->diag_clean_active!=p->diag_clean_active||s->diag_clean_pending!=p->diag_clean_pending||s->diag_clean_deadline!=p->diag_clean_deadline)diagnostic_transition("cleaning.changed",s);
 }
 diagnostic_previous=*s;diagnostic_have_previous=1;
 char alarms[400];production_alarm_json(s,alarms);sqlite3_stmt *st=diagnostic_insert;sqlite3_reset(st);sqlite3_clear_bindings(st);int n=1;
#define DI(v) sqlite3_bind_int64(st,n++,(sqlite3_int64)(v))
 sqlite3_bind_text(st,n++,diagnostics.session,-1,SQLITE_STATIC);DI(s->wall);DI(s->mono);DI(s->epoch);DI(s->serial);DI(s->code);DI(s->automatic);DI(s->total);DI(s->total_observed);DI(s->good);DI(s->total_good);DI(s->alarm_good);sqlite3_bind_text(st,n++,alarms,-1,SQLITE_TRANSIENT);DI(s->cause_mask);DI(s->diag_flags);DI(s->diag_control);DI(s->diag_sensor);DI(s->diag_guard);DI(s->diag_deadline);DI(s->diag_clean_active);DI(s->diag_clean_pending);DI(s->diag_clean_deadline);sqlite3_bind_double(st,n++,isfinite(s->diag_speed)?s->diag_speed:0);sqlite3_bind_double(st,n++,isfinite(s->diag_length)?s->diag_length:0);for(unsigned i=0;i<9;i++)DI(s->diag_ages[i]);DI(s->diag_current);DI(s->diag_groups);DI(s->diag_symbol);DI(s->diag_poll_ms);DI(s->diag_cycles);DI(s->diag_ui_errors);sqlite3_bind_text(st,n++,s->plc,-1,SQLITE_TRANSIENT);
#undef DI
 int ok=sqlite3_step(st)==SQLITE_DONE;if(!ok)diagnostic_failed(sqlite3_errmsg(diagnostic_db));return ok;
}
static void diagnostic_init(void){
 atomic_init(&diagnostic_stopping,0);memset(&diagnostics,0,sizeof(diagnostics));mutex_init(&diagnostics.mutex);unsigned char id[16];if(!random_bytes(id,sizeof(id)))return;bytes_hex(id,sizeof(id),diagnostics.session);path_join(diagnostics.path,"local/diagnostics.sqlite");diagnostics.initialized=1;
 if(sqlite3_open_v2(diagnostics.path,&diagnostic_db,SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE|SQLITE_OPEN_FULLMUTEX,NULL)!=SQLITE_OK){diagnostic_failed("Не удалось открыть журнал диагностики");return;}
 sqlite3_busy_timeout(diagnostic_db,100);
 if(diagnostic_scalar(diagnostic_db,"PRAGMA user_version")>1){diagnostic_failed("Журнал диагностики создан более новой версией");return;}
 if(!diagnostic_sql("PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;PRAGMA max_page_count=131072;PRAGMA journal_size_limit=8388608;"
 "CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,started INTEGER NOT NULL,version TEXT NOT NULL,machine TEXT NOT NULL,ended INTEGER,dropped INTEGER NOT NULL DEFAULT 0,storage_errors INTEGER NOT NULL DEFAULT 0,source_build TEXT NOT NULL,utc_offset_minutes INTEGER NOT NULL);"
 "CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,session TEXT NOT NULL,at INTEGER NOT NULL,mono INTEGER NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)));CREATE INDEX IF NOT EXISTS events_at ON events(at);"
 "CREATE TABLE IF NOT EXISTS samples(seq INTEGER PRIMARY KEY AUTOINCREMENT,session TEXT NOT NULL,at INTEGER NOT NULL,mono INTEGER NOT NULL,epoch INTEGER,serial INTEGER,state INTEGER,automatic INTEGER,total INTEGER,total_observed INTEGER,good INTEGER,total_good INTEGER,alarms_good INTEGER,alarms TEXT,cause_mask INTEGER,quality_mask INTEGER,control INTEGER,sensor_configured INTEGER,guard INTEGER,deadline INTEGER,cleaning_active INTEGER,cleaning_pending INTEGER,cleaning_deadline INTEGER,speed_set REAL,working_length REAL,state_age INTEGER,automatic_age INTEGER,total_age INTEGER,control_age INTEGER,sensor_age INTEGER,speed_age INTEGER,length_age INTEGER,current_age INTEGER,groups_age INTEGER,current_count INTEGER,groups_count INTEGER,symbol_version INTEGER,poll_ms INTEGER,poll_cycle INTEGER,ui_errors INTEGER,plc TEXT);CREATE INDEX IF NOT EXISTS samples_at ON samples(at);CREATE TABLE IF NOT EXISTS contexts(seq INTEGER PRIMARY KEY AUTOINCREMENT,session TEXT NOT NULL,at INTEGER NOT NULL,mono INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)));CREATE INDEX IF NOT EXISTS contexts_at ON contexts(at);PRAGMA user_version=1;"))return;
 const char *insert="INSERT INTO samples(session,at,mono,epoch,serial,state,automatic,total,total_observed,good,total_good,alarms_good,alarms,cause_mask,quality_mask,control,sensor_configured,guard,deadline,cleaning_active,cleaning_pending,cleaning_deadline,speed_set,working_length,state_age,automatic_age,total_age,control_age,sensor_age,speed_age,length_age,current_age,groups_age,current_count,groups_count,symbol_version,poll_ms,poll_cycle,ui_errors,plc) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
 if(sqlite3_prepare_v2(diagnostic_db,insert,-1,&diagnostic_insert,NULL)!=SQLITE_OK){diagnostic_failed(sqlite3_errmsg(diagnostic_db));return;}
 diagnostic_sqlf("INSERT INTO sessions(id,started,version,machine,source_build,utc_offset_minutes) VALUES(%Q,%lld,'0.1.25',%Q,%Q,%d)",diagnostics.session,(sqlite3_int64)wall_ms(),production.machine,SCADA_BUILD_ID,local_utc_offset_minutes());
 diagnostic_event("process.started","{\"version\":\"0.1.25\",\"reasonPolicy\":1}");
}
static void diagnostic_prune(void){
 uint64_t cutoff=wall_ms()>UINT64_C(259200000)?wall_ms()-UINT64_C(259200000):0;
 /* Bound batches so an old backlog cannot monopolise the recorder. */
 diagnostic_sqlf("DELETE FROM samples WHERE seq IN (SELECT seq FROM samples WHERE at<%lld ORDER BY seq LIMIT 20000)",(sqlite3_int64)cutoff);
 diagnostic_sqlf("DELETE FROM contexts WHERE at<%lld",(sqlite3_int64)cutoff);
 sqlite3_int64 count=diagnostic_scalar(diagnostic_db,"SELECT count(*) FROM samples");if(count>DIAG_MAX_SAMPLES)diagnostic_sqlf("DELETE FROM samples WHERE seq IN (SELECT seq FROM samples ORDER BY seq LIMIT %lld)",count-DIAG_MAX_SAMPLES);
 diagnostic_sqlf("DELETE FROM events WHERE seq IN (SELECT seq FROM events WHERE at<%lld ORDER BY seq LIMIT 20000)",(sqlite3_int64)cutoff);
 diagnostic_sql("DELETE FROM events WHERE seq IN (SELECT seq FROM events ORDER BY seq DESC LIMIT -1 OFFSET 200000)");
}
static void diagnostic_context(void){
 size_t capacity=262144;char *text=malloc(capacity);if(!text){diagnostic_failed("Недостаточно памяти для снимка контекста");return;}
 Buffer b;binit(&b,text,capacity);uint64_t mono=now_ms(),wall=wall_ms();
 lock(&app.mutex);bf(&b,"{\"epoch\":%u,\"adsState\":%d,\"connected\":%s,\"symbolVersion\":%u,\"pollMaxMs\":%llu,\"fields\":{",app.epoch,app.ads_status,app.connected?"true":"false",app.symbol_version,(unsigned long long)app.poll_max_duration);
 for(int i=0,emitted=0;i<F_COUNT;i++){
  Reading *r=&app.fields[i];if(i>=F_ENGINEERING_FIRST&&!r->observed)continue;
  uint64_t age=mono>=r->observed?mono-r->observed:UINT32_MAX;int fresh=app.connected&&app.ads_status==5&&r->quality&&age<=1500&&binding_ready(i,mono);
  if(emitted++){bf(&b,",");}bj(&b,defs[i].key);bf(&b,":{\"value\":");if(fresh)bf(&b,"%.17g",r->value);else bf(&b,"null");
  char raw[33];raw_hex(r->raw,defs[i].bytes,raw);bf(&b,",\"quality\":%s,\"ageMs\":%llu,\"error\":%u,\"raw\":",fresh?"true":"false",(unsigned long long)age,r->error);bj(&b,raw);bf(&b,"}");
 }
 bf(&b,"},\"ioViewActive\":%s,\"io\":[",mono<app.io.lease?"true":"false");
 for(unsigned i=0;i<app.io.count;i++){IoValue *v=&app.io.values[i];int fresh=mono<app.io.lease&&app.connected&&v->quality&&mono-v->observed<=1500;if(i)bf(&b,",");bf(&b,"{\"id\":%d,\"quality\":%s,\"value\":",app.io.ids[i],fresh?"true":"false");if(fresh)bf(&b,"%.17g",v->value);else bf(&b,"null");bf(&b,",\"error\":%u}",v->error);}
 bf(&b,"]}");unlock(&app.mutex);
 if(b.failed)diagnostic_failed("Снимок контекста превысил предел");else diagnostic_sqlf("INSERT INTO contexts(session,at,mono,payload) VALUES(%Q,%lld,%lld,%Q)",diagnostics.session,(sqlite3_int64)wall,(sqlite3_int64)mono,text);free(text);
}
/* Never persist UI tokens, session hashes or long numeric input from an exception. */
static void diagnostic_clean_text(char *out,size_t cap,const char *in){
 size_t used=0;while(*in&&used+1<cap){const char *start=in;while((*in>='0'&&*in<='9')||(*in>='a'&&*in<='z')||(*in>='A'&&*in<='Z'))in++;size_t n=(size_t)(in-start);int numeric=n>=6,hex=n>=32;for(size_t i=0;i<n;i++){if(start[i]<'0'||start[i]>'9')numeric=0;if(!((start[i]>='0'&&start[i]<='9')||(start[i]>='a'&&start[i]<='f')||(start[i]>='A'&&start[i]<='F')))hex=0;}
  if(n){const char *part=numeric||hex?"[redacted]":start;size_t take=numeric||hex?10:n;if(take>cap-used-1)take=cap-used-1;memcpy(out+used,part,take);used+=take;}else out[used++]=*in++;
 }out[used]=0;
}
static void diagnostic_run(void){
 DiagnosticItem *batch=calloc(128,sizeof(*batch));if(!batch||!diagnostic_insert){if(!batch)diagnostic_failed("Недостаточно памяти для потока диагностики");free(batch);return;}
 lock(&diagnostics.mutex);diagnostics.running=1;unlock(&diagnostics.mutex);
 while(1){
  unsigned count;uint64_t dropped;
  lock(&diagnostics.mutex);count=diagnostics.count>128?128:diagnostics.count;for(unsigned i=0;i<count;i++)batch[i]=diagnostics.items[(diagnostics.head+i)%DIAG_QUEUE_CAP];diagnostics.head=(diagnostics.head+count)%DIAG_QUEUE_CAP;diagnostics.count-=count;dropped=diagnostics.dropped;unlock(&diagnostics.mutex);
  if(count){
   diagnostic_batch_failed=0;diagnostic_last_sql_error=SQLITE_OK;int ok=diagnostic_sql("BEGIN IMMEDIATE");
   for(unsigned i=0;i<count&&ok;i++){DiagnosticItem *item=&batch[i];if(item->type)diagnostic_store_event(item->data.event.kind,item->wall,item->mono,item->data.event.json);else ok=diagnostic_store_sample(&item->data.sample);}
   if(diagnostic_batch_failed)ok=0;
   if(ok)ok=diagnostic_sqlf("UPDATE sessions SET dropped=%lld,storage_errors=%lld WHERE id=%Q",(sqlite3_int64)dropped,(sqlite3_int64)diagnostics.storage_errors,diagnostics.session);
   if(ok){ok=diagnostic_sql("COMMIT");}
   int disk_limit_hit=diagnostic_last_sql_error==SQLITE_FULL;
   if(!ok){sqlite3_exec(diagnostic_db,"ROLLBACK",NULL,NULL,NULL);diagnostic_have_previous=0;}
   lock(&diagnostics.mutex);if(ok){diagnostics.written+=count;diagnostics.last_write=wall_ms();diagnostics.failed=0;diagnostics.error[0]=0;}else diagnostics.dropped+=count;unlock(&diagnostics.mutex);
   if(!ok){if(disk_limit_hit){diagnostic_sql("DELETE FROM samples WHERE seq IN (SELECT seq FROM samples ORDER BY seq LIMIT 20000)");diagnostic_sql("DELETE FROM contexts WHERE seq IN (SELECT seq FROM contexts ORDER BY seq LIMIT 100)");}pause_ms(100);}
  }
  if(now_ms()>=diagnostic_next_context){diagnostic_context();diagnostic_next_context=now_ms()+30000;}
  if(now_ms()>=diagnostic_next_prune){diagnostic_prune();diagnostic_next_prune=now_ms()+60000;}
  if(atomic_load(&diagnostic_stopping)){lock(&diagnostics.mutex);int empty=diagnostics.count==0;unlock(&diagnostics.mutex);if(empty)break;}
  if(!count)pause_ms(50);
 }
 diagnostic_sqlf("UPDATE sessions SET ended=%lld,dropped=%lld,storage_errors=%lld WHERE id=%Q",(sqlite3_int64)wall_ms(),(sqlite3_int64)diagnostics.dropped,(sqlite3_int64)diagnostics.storage_errors,diagnostics.session);sqlite3_finalize(diagnostic_insert);diagnostic_insert=NULL;sqlite3_close(diagnostic_db);diagnostic_db=NULL;free(batch);
 lock(&diagnostics.mutex);diagnostics.running=0;unlock(&diagnostics.mutex);
}
static void diagnostic_system_json(Buffer *b){
#ifdef _WIN32
 SYSTEM_INFO sys;GetNativeSystemInfo(&sys);MEMORYSTATUSEX mem;memset(&mem,0,sizeof(mem));mem.dwLength=sizeof(mem);int memory=GlobalMemoryStatusEx(&mem);ULARGE_INTEGER free_bytes;wchar_t base[2400];int disk=MultiByteToWideChar(CP_UTF8,0,app.base,-1,base,2400)&&GetDiskFreeSpaceExW(base,&free_bytes,NULL,NULL);
 OSVERSIONINFOW os;memset(&os,0,sizeof(os));os.dwOSVersionInfoSize=sizeof(os);typedef LONG(WINAPI *VersionFunction)(OSVERSIONINFOW*);VersionFunction version=NULL;FARPROC proc=GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"RtlGetVersion");if(sizeof(version)==sizeof(proc))memcpy(&version,&proc,sizeof(version));if(version)version(&os);
 bf(b,"{\"os\":\"Windows\",\"version\":\"%lu.%lu.%lu\",\"architecture\":%u,\"processors\":%lu,\"memoryAvailableBytes\":%llu,\"diskAvailableBytes\":%llu}",os.dwMajorVersion,os.dwMinorVersion,os.dwBuildNumber,sys.wProcessorArchitecture,sys.dwNumberOfProcessors,(unsigned long long)(memory?mem.ullAvailPhys:0),(unsigned long long)(disk?free_bytes.QuadPart:0));
#else
 bf(b,"{\"os\":\"Linux test host\",\"pointerBits\":%u}",(unsigned)(sizeof(void*)*8));
#endif
}
static size_t diagnostic_report_json(char *out,size_t cap,int engineer){
 size_t size=state_json(out,cap,engineer);if(!size||out[size-1]!='}')return 0;Buffer b;binit(&b,out+size-1,cap-size+1);char stamp[40];utc_stamp(stamp);
 bf(&b,",\"reportSchemaVersion\":2,\"generatedAt\":");bj(&b,stamp);bf(&b,",\"sourceBuild\":");bj(&b,SCADA_BUILD_ID);bf(&b,",\"generatedAtUtcMs\":%llu,\"capturedMonoMs\":%llu,\"machineId\":",(unsigned long long)wall_ms(),(unsigned long long)now_ms());bj(&b,production.machine);bf(&b,",\"sessionId\":");bj(&b,diagnostics.session);
 bf(&b,",\"utcOffsetMinutes\":%d",local_utc_offset_minutes());
 bf(&b,",\"coverage\":{\"knownFields\":%d,\"coreFields\":%d,\"extraReadsForReport\":false},\"system\":",F_COUNT,F_ENGINEERING_FIRST);diagnostic_system_json(&b);bf(&b,",\"recorder\":");diagnostic_health_json(&b);bf(&b,",\"reasonPolicy\":1,\"ui\":{");lock(&app.mutex);bf(&b,"\"kiosk\":%s,\"launchMode\":%d,\"readyCount\":%u,\"errorCount\":%u",app.ui_kiosk?"true":"false",app.diag_ui_mode,app.ui_ready_count,app.ui_error_count);bf(&b,",\"auditWriteError\":%s,\"userAgent\":",atomic_load(&app.diag_audit_error)?"true":"false");bj(&b,app.diag_user_agent);unlock(&app.mutex);bf(&b,"}}");return b.failed?0:size-1+b.used;
}
#endif
