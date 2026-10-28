#ifndef SCADA_PRODUCTION_H
#define SCADA_PRODUCTION_H
#include "../vendor/sqlite/sqlite3.h"
/* A single durable local journal, serialized independently of ADS. */
static struct {
 Mutex mutex;sqlite3 *db;int initialized,failed,have_counter,have_sample;char error[256],machine[33],active[81];
 sqlite3_int64 interval;ProductionSample last;int last_kind;char last_job[81];
 struct {int baseline,episode,settled,reason;unsigned previous,evidence;uint64_t rises[7],start;sqlite3_int64 first;} cause;
} production;
static const char *production_kind(int k){return k==1?"work":k==2?"stop":k==3?"manual":"unknown";}
static void production_error(const char *message){production.failed=1;copy_s(production.error,sizeof(production.error),message?message:"Ошибка локальной истории");}
static int production_exec(const char *sql){
 if(!production.db)return 0;
 char *error=NULL;int rc=sqlite3_exec(production.db,sql,NULL,NULL,&error);
 if(rc!=SQLITE_OK){production_error(error?error:sqlite3_errmsg(production.db));sqlite3_free(error);return 0;}return 1;
}
static int production_sql(const char *format,...){
 va_list args;va_start(args,format);char *sql=sqlite3_vmprintf(format,args);va_end(args);
 if(!sql){production_error("Недостаточно памяти для истории");return 0;}int ok=production_exec(sql);sqlite3_free(sql);return ok;
}
static sqlite3_stmt *production_query(const char *format,...){
 va_list args;va_start(args,format);char *sql=sqlite3_vmprintf(format,args);va_end(args);sqlite3_stmt *st=NULL;
 if(!sql||sqlite3_prepare_v2(production.db,sql,-1,&st,NULL)!=SQLITE_OK){production_error(production.db?sqlite3_errmsg(production.db):"История недоступна");sqlite3_free(sql);return NULL;}
 sqlite3_free(sql);return st;
}
static sqlite3_int64 production_scalar(const char *sql){sqlite3_stmt *s=production_query("%s",sql);sqlite3_int64 n=0;if(s&&sqlite3_step(s)==SQLITE_ROW)n=sqlite3_column_int64(s,0);sqlite3_finalize(s);return n;}
static const char *production_text(sqlite3_stmt *s,int i){const unsigned char *v=sqlite3_column_text(s,i);return v?(const char*)v:"";}
static void production_active(void){sqlite3_stmt *s=production_query("SELECT id FROM jobs WHERE status='active' LIMIT 1");production.active[0]=0;if(s&&sqlite3_step(s)==SQLITE_ROW)copy_s(production.active,sizeof(production.active),production_text(s,0));sqlite3_finalize(s);}
static int production_event(const char *kind,uint64_t at,const char *payload){diagnostic_event_at(kind,at,now_ms(),payload);return production_sql("INSERT INTO events(at,kind,payload) VALUES(%lld,%Q,json(%Q))",(sqlite3_int64)at,kind,payload);}
static void production_note(const char *kind,uint64_t at,const char *job,int before,int after){
 char text[400];Buffer b;binit(&b,text,sizeof(text));bf(&b,"{\"jobId\":");bj(&b,job);bf(&b,",\"before\":%d,\"after\":%d}",before,after);if(!b.failed)production_event(kind,at,text);
}
static void production_uncertain(uint64_t at,const char *kind,int before,int after){
 if(production.active[0])production_sql("UPDATE jobs SET uncertain=1 WHERE id=%Q",production.active);
 production_note(kind,at,production.active,before,after);
}
static void production_close_interval(void){
 if(!production.interval)return;
 production_sql("UPDATE intervals SET open=0 WHERE seq=%lld",production.interval);
 production_sql("INSERT INTO events(at,kind,payload) SELECT end,'interval.closed',json_object('intervalId',seq,'start',start,'end',end,'durationMs',duration,'state',kind,'code',code,'automatic',automatic,'jobId',job,'epoch',epoch,'plc',plc,'alarms',json(alarms)) FROM intervals WHERE seq=%lld",production.interval);
 production.interval=0;
}
static void production_alarm_json(const ProductionSample *s,char out[400]){Buffer b;binit(&b,out,400);bf(&b,"[");for(unsigned i=0;i<s->alarm_count;i++)bf(&b,"%s%d",i?",":"",s->alarms[i]);bf(&b,"]");}
static int production_classify(const ProductionSample *s){
 if(!s->good||s->code<1||s->code>13)return 0;
 if((s->code==4||s->code==7)&&s->automatic==1)return 1;
 if(s->code==6||s->code==12)return 3;
 /* A contradictory automatic state is not evidence of a stopped line. */
 if(s->automatic==1&&(s->code==5||s->code==9||s->code==13))return 0;
 return 2;
}
static const char *production_reason_code(int reason){return reason==1?"liner_change":reason==2?"roll_change":"";}
static void production_reason_evidence(unsigned mask,char out[100]){Buffer b;binit(&b,out,100);bf(&b,"[");int comma=0;for(unsigned i=0;i<7;i++)if(mask&(1u<<i))bf(&b,"%s%d",comma++?",":"",production_cause_ids[i]);bf(&b,"]");}
static void production_reason_apply(const ProductionSample *s){
 if(!production.cause.reason||!production.cause.first)return;
 char alarms[100];production_reason_evidence(production.cause.evidence,alarms);
 if(!production_sql("INSERT OR IGNORE INTO stop_causes(interval,code,alarms,detected,policy) SELECT seq,%Q,%Q,%lld,1 FROM intervals WHERE seq>=%lld AND kind IN ('stop','manual') AND plc=%Q",production_reason_code(production.cause.reason),alarms,(sqlite3_int64)s->wall,production.cause.first,s->plc))return;
 if(sqlite3_changes(production.db)){
  char payload[300];snprintf(payload,sizeof(payload),"{\"firstIntervalId\":%lld,\"reasonCode\":\"%s\",\"alarms\":%s,\"source\":\"automatic\",\"policy\":1}",production.cause.first,production_reason_code(production.cause.reason),alarms);
  production_event("downtime.reason_inferred",s->wall,payload);
 }
}
static void production_reason_settle(const ProductionSample *s){
 if(!production.cause.episode||production.cause.settled)return;
 unsigned mask=production.cause.evidence;production.cause.settled=1;
 char decision[300];snprintf(decision,sizeof(decision),"{\"policy\":1,\"firstIntervalId\":%lld,\"evidenceMask\":%u,\"decision\":\"%s\",\"elapsedMs\":%llu}",production.cause.first,mask,!mask?"no_material_evidence":(mask&PROD_LINER_MASK)&&(mask&PROD_ROLL_MASK)?"competing_materials":"material_reason",(unsigned long long)(s->mono-production.cause.start));diagnostic_event_at("reason.decision",s->wall,s->mono,decision);
 /* Two competing material causes remain unassigned; there is no priority. */
 production.cause.reason=(mask&PROD_LINER_MASK)&&!(mask&PROD_ROLL_MASK)?1:(mask&PROD_ROLL_MASK)&&!(mask&PROD_LINER_MASK)?2:0;
 production_reason_apply(s);
}
static void production_reason_sample(const ProductionSample *s,int kind,uint64_t delta,int clock_change){
 int continuous=production.have_sample&&production.last.good&&s->good&&delta<=2000&&!clock_change&&s->epoch==production.last.epoch&&s->serial==production.last.serial&&!strcmp(s->plc,production.last.plc);
 if(!continuous)memset(&production.cause,0,sizeof(production.cause));
 if(s->alarm_good){
  unsigned rising=production.cause.baseline?s->cause_mask&~production.cause.previous:0;
  for(unsigned i=0;i<7;i++)if(rising&(1u<<i))production.cause.rises[i]=s->mono;
  production.cause.previous=s->cause_mask;production.cause.baseline=1;
 }else{production.cause.baseline=0;memset(production.cause.rises,0,sizeof(production.cause.rises));}
 if(kind==1){
  if(production.cause.episode){char close[240];snprintf(close,sizeof(close),"{\"policy\":1,\"firstIntervalId\":%lld,\"trigger\":\"first_work_state\",\"state\":%d,\"automatic\":%d}",production.cause.first,s->code,s->automatic);diagnostic_event_at("reason.closed",s->wall,s->mono,close);production_reason_settle(s);production.cause.episode=0;production.cause.first=0;production.cause.reason=0;memset(production.cause.rises,0,sizeof(production.cause.rises));}
  return;
 }
 if(!continuous||kind==0)return;
 if(production.last_kind==1&&(kind==2||kind==3)){
  production.cause.episode=1;production.cause.settled=production.cause.reason=0;production.cause.evidence=0;production.cause.start=s->mono;production.cause.first=production.interval;
 }
 if(!production.cause.episode)return;
 if(!production.cause.settled&&s->alarm_good&&s->mono-production.cause.start<=PROD_CORRELATE_MS){
  for(unsigned i=0;i<7;i++)if(production.cause.rises[i]&&production.cause.rises[i]+PROD_CORRELATE_MS>=production.cause.start)production.cause.evidence|=1u<<i;
 }
 if(s->mono-production.cause.start>=PROD_CORRELATE_MS)production_reason_settle(s);
 if(production.cause.settled)production_reason_apply(s);
}
static void production_sample(const ProductionSample *s){
 int kind=production_classify(s);char alarms[400];production_alarm_json(s,alarms);
 uint64_t delta=production.have_sample&&s->mono>=production.last.mono?s->mono-production.last.mono:0;
 int clock_change=production.have_sample&&llabs((sqlite3_int64)s->wall-(sqlite3_int64)production.last.wall-(sqlite3_int64)delta)>2000;
 if(production.have_sample&&(delta>2000||clock_change)){
  production_close_interval();
  if(!clock_change&&s->wall>production.last.wall){
   production_sql("INSERT INTO intervals(start,end,duration,kind,code,automatic,job,epoch,plc,alarms,open) VALUES(%lld,%lld,%lld,'unknown',0,0,%Q,%u,%Q,'[]',0)",(sqlite3_int64)production.last.wall,(sqlite3_int64)s->wall,(sqlite3_int64)(s->wall-production.last.wall),production.active,s->epoch,s->plc);
   production.interval=sqlite3_last_insert_rowid(production.db);production_close_interval();
  }
  production_uncertain(s->wall,clock_change?"clock.changed":"observation.gap",production.last.total,s->total);production.have_counter=0;delta=0;
 }
 if(production.interval&&(kind!=production.last_kind||s->code!=production.last.code||s->automatic!=production.last.automatic||s->epoch!=production.last.epoch||strcmp(s->plc,production.last.plc)||strcmp(production.active,production.last_job))){
  /* The uncertain tail starts at the last trustworthy observation. */
  uint64_t boundary=kind==0?production.last.wall:s->wall;
  uint64_t add=kind==0?0:delta;
  production_sql("UPDATE intervals SET end=max(start,%lld),duration=duration+%lld WHERE seq=%lld",(sqlite3_int64)boundary,(sqlite3_int64)add,production.interval);
  production_close_interval();delta=kind==0?delta:0;
 }
 if(!production.interval){
  uint64_t start=production.have_sample&&!clock_change&&delta&&s->wall>=production.last.wall?production.last.wall:s->wall;
  production_sql("INSERT INTO intervals(start,end,duration,kind,code,automatic,job,epoch,plc,alarms,open) VALUES(%lld,%lld,%lld,%Q,%d,%d,%Q,%u,%Q,%Q,1)",(sqlite3_int64)start,(sqlite3_int64)s->wall,(sqlite3_int64)(start==s->wall?0:delta),production_kind(kind),s->code,s->automatic,production.active,s->epoch,s->plc,alarms);
  production.interval=sqlite3_last_insert_rowid(production.db);
 }else{
  production_sql("UPDATE intervals SET end=max(start,%lld),duration=duration+%lld,alarms=(SELECT json_group_array(value) FROM (SELECT DISTINCT value FROM json_each(intervals.alarms) UNION SELECT value FROM json_each(%Q))) WHERE seq=%lld",(sqlite3_int64)s->wall,(sqlite3_int64)delta,alarms,production.interval);
 }
 /* Use the original inter-sample delta: interval boundaries consume delta. */
 production_reason_sample(s,kind,production.have_sample&&s->mono>=production.last.mono?s->mono-production.last.mono:0,clock_change);
 int same=production.have_counter&&s->total_good&&s->epoch==production.last.epoch&&s->serial==production.last.serial&&!strcmp(s->plc,production.last.plc)&&delta<=2000;
 if(same&&(s->total_observed!=production.last.total_observed||s->total!=production.last.total)){
  int difference=s->total-production.last.total;
  /* A PLC may publish several products at once. Do not infer a packet limit from knife speed. */
  if(difference>=0){
   if(difference&&production.active[0])production_sql("UPDATE jobs SET produced=produced+%d WHERE id=%Q AND status='active' AND plc=%Q",difference,production.active,s->plc);
  }else production_uncertain(s->wall,"counter.reset",production.last.total,s->total);
 }else if(production.have_counter&&(!s->total_good||s->epoch!=production.last.epoch||s->serial!=production.last.serial||strcmp(s->plc,production.last.plc)))production_uncertain(s->wall,"counter.gap",production.last.total,s->total);
 if(s->total_good&&production.active[0])production_sql("UPDATE jobs SET uncertain=1 WHERE id=%Q AND plc<>%Q",production.active,s->plc);
 production.have_counter=s->total_good;production.last=*s;production.last_kind=kind;production.have_sample=1;copy_s(production.last_job,sizeof(production.last_job),production.active);
}
static void production_drain(void){
 ProductionSample samples[PROD_QUEUE_CAP];unsigned count;int overflow;
 lock(&production_queue.mutex);count=production_queue.count;overflow=production_queue.overflow;for(unsigned i=0;i<count;i++)samples[i]=production_queue.items[(production_queue.head+i)%PROD_QUEUE_CAP];production_queue.head=(production_queue.head+count)%PROD_QUEUE_CAP;production_queue.count=0;production_queue.overflow=0;unlock(&production_queue.mutex);
 if(production.failed||!count)return;
 if(!production_exec("BEGIN IMMEDIATE"))return;
 if(overflow){production_uncertain(samples[0].wall,"queue.overflow",production.last.total,samples[0].total);production.have_counter=0;production_close_interval();samples[0].good=samples[0].total_good=0;}
 for(unsigned i=0;i<count&&!production.failed;i++)production_sample(&samples[i]);
 if(production.failed){sqlite3_exec(production.db,"ROLLBACK",NULL,NULL,NULL);production.interval=0;production.have_sample=production.have_counter=0;}else if(!production_exec("COMMIT")){sqlite3_exec(production.db,"ROLLBACK",NULL,NULL,NULL);production.interval=0;production.have_sample=production.have_counter=0;}
}
static void production_init(void){
 memset(&production,0,sizeof(production));mutex_init(&production.mutex);mutex_init(&production_queue.mutex);production.initialized=1;production_queue.initialized=1;
 char directory[2400],path[2400];path_join(directory,"local");if(!make_dir(directory)){production_error("Не удалось создать каталог истории");return;}path_join(path,"local/production.sqlite");
 if(sqlite3_open_v2(path,&production.db,SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE|SQLITE_OPEN_FULLMUTEX,NULL)!=SQLITE_OK){production_error("Не удалось открыть локальную историю");return;}
 sqlite3_busy_timeout(production.db,200);sqlite3_limit(production.db,SQLITE_LIMIT_LENGTH,4*1024*1024);sqlite3_limit(production.db,SQLITE_LIMIT_SQL_LENGTH,2*1024*1024);
 if(production_scalar("PRAGMA user_version")>2){production_error("История создана более новой версией SCADA");return;}
 if(!production_exec("PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;PRAGMA foreign_keys=ON;PRAGMA max_page_count=262144;PRAGMA journal_size_limit=8388608;BEGIN IMMEDIATE;"
 "CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);"
 "CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,number TEXT NOT NULL,title TEXT NOT NULL,plan INTEGER NOT NULL,priority INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'queued',produced INTEGER NOT NULL DEFAULT 0,uncertain INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,started INTEGER,finished INTEGER,plc TEXT NOT NULL,document TEXT NOT NULL CHECK(json_valid(document)));"
 "CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON jobs(status) WHERE status='active';"
 "CREATE TABLE IF NOT EXISTS intervals(seq INTEGER PRIMARY KEY AUTOINCREMENT,start INTEGER NOT NULL,end INTEGER NOT NULL,duration INTEGER NOT NULL,kind TEXT NOT NULL,code INTEGER NOT NULL,automatic INTEGER NOT NULL,job TEXT NOT NULL,epoch INTEGER NOT NULL,plc TEXT NOT NULL,alarms TEXT NOT NULL,open INTEGER NOT NULL DEFAULT 0);"
 "CREATE INDEX IF NOT EXISTS intervals_time ON intervals(start,end);CREATE INDEX IF NOT EXISTS intervals_job ON intervals(job,seq);"
 "CREATE TABLE IF NOT EXISTS notes(interval INTEGER PRIMARY KEY,reason TEXT NOT NULL,comment TEXT NOT NULL,author TEXT NOT NULL,updated INTEGER NOT NULL,revision INTEGER NOT NULL);"
 "CREATE TABLE IF NOT EXISTS stop_causes(interval INTEGER PRIMARY KEY REFERENCES intervals(seq),code TEXT NOT NULL,alarms TEXT NOT NULL CHECK(json_valid(alarms)),detected INTEGER NOT NULL,policy INTEGER NOT NULL);"
 "CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)));"
 "PRAGMA user_version=2;COMMIT;"))return;
 sqlite3_stmt *s=production_query("PRAGMA quick_check(1)");int healthy=s&&sqlite3_step(s)==SQLITE_ROW&&!strcmp(production_text(s,0),"ok");sqlite3_finalize(s);if(!healthy){production_error("Проверка локальной истории не пройдена");return;}
 s=production_query("SELECT value FROM meta WHERE key='machineId'");if(s&&sqlite3_step(s)==SQLITE_ROW)copy_s(production.machine,sizeof(production.machine),production_text(s,0));sqlite3_finalize(s);
 if(!production.machine[0]){unsigned char bytes[16];if(!random_bytes(bytes,sizeof(bytes))){production_error("Не удалось создать идентификатор линии");return;}bytes_hex(bytes,sizeof(bytes),production.machine);production_sql("INSERT INTO meta VALUES('machineId',%Q)",production.machine);}
 production_active();
 if(!production_exec("BEGIN IMMEDIATE"))return;
 s=production_query("SELECT seq FROM intervals WHERE open=1 ORDER BY seq");while(s&&sqlite3_step(s)==SQLITE_ROW){production.interval=sqlite3_column_int64(s,0);production_close_interval();}sqlite3_finalize(s);
 sqlite3_int64 last_end=production_scalar("SELECT end FROM intervals ORDER BY seq DESC LIMIT 1");uint64_t now=wall_ms();
 if(last_end>0&&now>(uint64_t)last_end){production_sql("INSERT INTO intervals(start,end,duration,kind,code,automatic,job,epoch,plc,alarms,open) VALUES(%lld,%lld,%lld,'unknown',0,0,%Q,0,'','[]',0)",last_end,(sqlite3_int64)now,(sqlite3_int64)now-last_end,production.active);production.interval=sqlite3_last_insert_rowid(production.db);production_close_interval();production_uncertain(now,"process.restarted",0,0);}
 if(production.failed)sqlite3_exec(production.db,"ROLLBACK",NULL,NULL,NULL);else production_exec("COMMIT");
}
static void production_run(void){
 uint64_t next_stale=0;
 while(!atomic_load(&app.stop)){
  lock(&production.mutex);production_drain();unlock(&production.mutex);
  uint64_t now=now_ms();if(now>=next_stale){int fresh;lock(&app.mutex);fresh=app.connected&&app.fields[F_STATE].quality&&now-app.fields[F_STATE].observed<=1500;unlock(&app.mutex);if(!fresh)production_capture();next_stale=now+500;}
  for(unsigned i=0;i<25&&!atomic_load(&app.stop);i++)pause_ms(20);
 }
 lock(&production.mutex);production_drain();if(!production.failed&&production.db){production_exec("BEGIN IMMEDIATE");production_close_interval();production_exec("COMMIT");}unlock(&production.mutex);
}
static void production_shutdown(void){lock(&production.mutex);if(production.db){production_drain();if(!production.failed){production_exec("BEGIN IMMEDIATE");production_close_interval();production_exec("COMMIT");}sqlite3_close(production.db);production.db=NULL;}unlock(&production.mutex);production_queue.initialized=0;}
static void production_job_json(Buffer *b,sqlite3_stmt *s,int document){
 bf(b,"{\"id\":");bj(b,production_text(s,0));bf(b,",\"number\":");bj(b,production_text(s,1));bf(b,",\"title\":");bj(b,production_text(s,2));
 bf(b,",\"plan\":%lld,\"priority\":%d,\"status\":",sqlite3_column_int64(s,3),sqlite3_column_int(s,4));bj(b,production_text(s,5));
 bf(b,",\"produced\":%lld,\"uncertain\":%s,\"createdAt\":%lld,\"startedAt\":",sqlite3_column_int64(s,6),sqlite3_column_int(s,7)?"true":"false",sqlite3_column_int64(s,8));
 if(sqlite3_column_type(s,9)==SQLITE_NULL)bf(b,"null");else bf(b,"%lld",sqlite3_column_int64(s,9));bf(b,",\"finishedAt\":");if(sqlite3_column_type(s,10)==SQLITE_NULL)bf(b,"null");else bf(b,"%lld",sqlite3_column_int64(s,10));
 bf(b,",\"document\":%s}",document?production_text(s,12):"null");
}
static size_t production_list_json(char *out,size_t cap,int engineer){
 Buffer b;binit(&b,out,cap);lock(&production.mutex);
 bf(&b,"{\"schemaVersion\":1,\"machineId\":");bj(&b,production.machine);bf(&b,",\"serverConnected\":false,\"storageError\":%s,\"message\":",production.failed?"true":"false");bj(&b,production.error);
 bf(&b,",\"canImport\":%s,\"now\":%llu,\"currentJobId\":",engineer&&!production.failed?"true":"false",(unsigned long long)wall_ms());
 sqlite3_stmt *s=production.db?production_query("SELECT value FROM meta WHERE key='currentJob'"):NULL;bj(&b,s&&sqlite3_step(s)==SQLITE_ROW?production_text(s,0):"");sqlite3_finalize(s);
 bf(&b,",\"totalJobs\":%lld,\"eventCount\":%lld,\"jobs\":[",production.db?production_scalar("SELECT count(*) FROM jobs"):0,production.db&&engineer?production_scalar("SELECT count(*) FROM events"):0);int comma=0;
 if(production.db){s=production_query("SELECT id,number,title,plan,priority,status,produced,uncertain,created,started,finished,plc,json_object('spec',json_object('id',json_extract(document,'$.spec.id'),'revision',json_extract(document,'$.spec.revision'),'inputs',json_object('A',json_extract(document,'$.spec.inputs.A'),'B',json_extract(document,'$.spec.inputs.B'),'C',json_extract(document,'$.spec.inputs.C'),'t',json_extract(document,'$.spec.inputs.t'),'channel',json_extract(document,'$.spec.inputs.channel'),'color',json_extract(document,'$.spec.inputs.color')))) FROM jobs WHERE %d ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'queued' THEN 2 ELSE 3 END,priority DESC,created DESC LIMIT 500",1);while(s&&sqlite3_step(s)==SQLITE_ROW){if(comma++)bf(&b,",");production_job_json(&b,s,1);}sqlite3_finalize(s);}
 bf(&b,"]}");unlock(&production.mutex);return b.failed?0:b.used;
}
static int production_id(const char *s){size_t n=s?strlen(s):0;if(!n||n>80)return 0;for(;*s;s++)if(!((*s>='a'&&*s<='z')||(*s>='A'&&*s<='Z')||(*s>='0'&&*s<='9')||*s=='-'||*s=='_'))return 0;return 1;}
static int production_utf8(const char *text){
 const unsigned char *p=(const unsigned char*)text;
 while(*p){unsigned c=*p++;if(c<128)continue;unsigned cp,n;
  if(c>=0xc2&&c<=0xdf){cp=c&31;n=1;}else if(c>=0xe0&&c<=0xef){cp=c&15;n=2;}else if(c>=0xf0&&c<=0xf4){cp=c&7;n=3;}else return 0;
  unsigned bytes=n;while(n--){if((*p&0xc0)!=0x80)return 0;cp=(cp<<6)|(*p++&63);}
  if((bytes==1&&cp<0x80)||(bytes==2&&cp<0x800)||(bytes==3&&cp<0x10000)||cp>0x10ffff||(cp>=0xd800&&cp<=0xdfff))return 0;
 }return 1;
}
static int production_import(const char *json,int engineer,char *reason,size_t cap){
 if(!engineer){copy_s(reason,cap,"Требуется вход инженера");return 403;}
 if(!production_utf8(json)){copy_s(reason,cap,"Нужен файл задания в UTF-8");return 422;}
 int status=422;lock(&production.mutex);if(production.failed){status=503;goto done;}
 sqlite3_stmt *s=production_query("SELECT json_valid(%Q)",json);int valid=s&&sqlite3_step(s)==SQLITE_ROW&&sqlite3_column_int(s,0);sqlite3_finalize(s);if(!valid){copy_s(reason,cap,"Нужен корректный JSON задания");goto done;}
 s=production_query("SELECT count(*) FROM (SELECT parent,key FROM json_tree(%Q) WHERE typeof(key)='text' GROUP BY parent,key HAVING count(*)>1)",json);int duplicates=s&&sqlite3_step(s)==SQLITE_ROW?sqlite3_column_int(s,0):1;sqlite3_finalize(s);if(duplicates){copy_s(reason,cap,"Повторяющиеся ключи JSON задания не разрешены");goto done;}
 s=production_query("SELECT key,atom,type FROM json_tree(%Q)",json);unsigned nodes=0;valid=1;
 while(s&&sqlite3_step(s)==SQLITE_ROW){if(++nodes>4096){valid=0;break;}for(int i=0;i<2;i++)if(sqlite3_column_type(s,i)==SQLITE_TEXT){const char *value=production_text(s,i);int bytes=sqlite3_column_bytes(s,i);if(bytes>8192||(int)strlen(value)!=bytes||!production_utf8(value)){valid=0;break;}}if(!valid)break;}sqlite3_finalize(s);
 if(!valid){copy_s(reason,cap,"Проверьте текст и объём данных задания: UTF-8, без нулевых символов, до 8192 байт на поле");goto done;}
 s=production_query("WITH d(j) AS (VALUES(%Q)) SELECT json_extract(j,'$.schemaVersion'),json_extract(j,'$.id'),json_extract(j,'$.number'),json_extract(j,'$.title'),json_extract(j,'$.plan'),json_type(j,'$.plan'),json_type(j,'$.spec.inputs'),json_extract(j,'$.spec.id'),json_extract(j,'$.spec.revision'),json_extract(j,'$.machineId'),json_extract(j,'$.priority') FROM d",json);
 char id[81],number[121],title[241];sqlite3_int64 plan=0;int priority=0;
 if(!s||sqlite3_step(s)!=SQLITE_ROW||(sqlite3_column_type(s,0)!=SQLITE_INTEGER||sqlite3_column_int(s,0)!=1)||sqlite3_column_type(s,1)!=SQLITE_TEXT||sqlite3_column_type(s,2)!=SQLITE_TEXT||sqlite3_column_type(s,3)!=SQLITE_TEXT||!production_id(production_text(s,1))||!production_text(s,2)[0]||strlen(production_text(s,2))>120||!production_text(s,3)[0]||strlen(production_text(s,3))>240||strcmp(production_text(s,5),"integer")||sqlite3_column_int64(s,4)<1||sqlite3_column_int64(s,4)>1000000000||strcmp(production_text(s,6),"object")||sqlite3_column_type(s,7)!=SQLITE_TEXT||sqlite3_column_type(s,8)!=SQLITE_TEXT||!production_text(s,7)[0]||strlen(production_text(s,7))>120||!production_text(s,8)[0]||strlen(production_text(s,8))>80||(production_text(s,9)[0]&&strcmp(production_text(s,9),production.machine))){sqlite3_finalize(s);copy_s(reason,cap,"Проверьте schemaVersion, id, номер, название, тираж и редакцию ТЗ; задание должно относиться к этой линии");goto done;}
 copy_s(id,sizeof(id),production_text(s,1));copy_s(number,sizeof(number),production_text(s,2));copy_s(title,sizeof(title),production_text(s,3));plan=sqlite3_column_int64(s,4);priority=sqlite3_column_int(s,10);sqlite3_finalize(s);
 if(priority<0||priority>100){copy_s(reason,cap,"Приоритет задания: от 0 до 100");goto done;}
 s=production_query("WITH d(j) AS (VALUES(%Q)) SELECT json_type(j,'$.spec.inputs.A'),json_extract(j,'$.spec.inputs.A'),json_type(j,'$.spec.inputs.B'),json_extract(j,'$.spec.inputs.B'),json_type(j,'$.spec.inputs.C'),json_extract(j,'$.spec.inputs.C'),json_type(j,'$.spec.inputs.t'),json_extract(j,'$.spec.inputs.t'),json_extract(j,'$.spec.inputs.stack') FROM d",json);
 valid=s&&sqlite3_step(s)==SQLITE_ROW;for(int i=0;i<4&&valid;i++){const char *type=production_text(s,i*2);double v=sqlite3_column_double(s,i*2+1);valid=(!strcmp(type,"integer")||!strcmp(type,"real"))&&isfinite(v)&&v>=(i==2?0:1)&&v<=100000;}if(valid){double stack=sqlite3_column_double(s,8);valid=stack>=1&&stack<=100000&&floor(stack)==stack;}sqlite3_finalize(s);
 if(!valid){copy_s(reason,cap,"Проверьте числовые размеры A, B, C, толщину и количество в стопке");goto done;}
 s=production_query("SELECT document FROM jobs WHERE id=%Q",id);if(s&&sqlite3_step(s)==SQLITE_ROW){char *prior=sqlite3_mprintf("%s",production_text(s,0));sqlite3_finalize(s);sqlite3_stmt *same=production_query("SELECT json(%Q)=json(%Q)",prior,json);int equal=same&&sqlite3_step(same)==SQLITE_ROW&&sqlite3_column_int(same,0);sqlite3_finalize(same);sqlite3_free(prior);copy_s(reason,cap,equal?"Задание уже загружено":"Задание с таким id уже загружено. Новое ТЗ должно иметь новый id задания");status=equal?200:409;goto done;}sqlite3_finalize(s);
 if(production_scalar("SELECT count(*) FROM jobs")>=5000){copy_s(reason,cap,"Достигнут предел 5000 локальных заданий");status=409;goto done;}
 char plc[180];lock(&app.mutex);snprintf(plc,sizeof(plc),"%s|%s|%u",app.ip,app.netid,app.ads_port);unlock(&app.mutex);
 if(!production_exec("BEGIN IMMEDIATE")){status=503;goto done;}
 valid=production_sql("INSERT INTO jobs(id,number,title,plan,priority,created,plc,document) VALUES(%Q,%Q,%Q,%lld,%d,%lld,%Q,json(%Q))",id,number,title,plan,priority,(sqlite3_int64)wall_ms(),plc,json)&&production_event("job.imported",wall_ms(),json);
 if(valid)valid=production_exec("COMMIT");else sqlite3_exec(production.db,"ROLLBACK",NULL,NULL,NULL);
 if(valid){status=200;copy_s(reason,cap,"Задание загружено. Настройки станка не изменены");}else status=503;
 done:if(status==503)copy_s(reason,cap,"Не удалось сохранить задание или историю");unlock(&production.mutex);return status;
}
static int production_action(Pair *pairs,int n,char *reason,size_t cap){
 const char *id=pair_get(pairs,n,"id"),*action=pair_get(pairs,n,"action"),*op=pair_get(pairs,n,"operationId");
 if(n!=3||pairs[0].number||pairs[1].number||pairs[2].number||!production_id(id)||!production_id(op)||!action||(strcmp(action,"start")&&strcmp(action,"pause")&&strcmp(action,"finish"))){copy_s(reason,cap,"Некорректное действие задания");return 400;}
 production_capture();lock(&production.mutex);production_drain();int status=409;sqlite3_stmt *s=NULL;
 if(production.failed){status=503;goto done;}
 s=production_query("SELECT payload FROM events WHERE kind='job.action' AND json_extract(payload,'$.operationId')=%Q LIMIT 1",op);
 if(s&&sqlite3_step(s)==SQLITE_ROW){const char *data=production_text(s,0);sqlite3_stmt *same=production_query("SELECT json_extract(%Q,'$.id')=%Q AND json_extract(%Q,'$.action')=%Q",data,id,data,action);int match=same&&sqlite3_step(same)==SQLITE_ROW&&sqlite3_column_int(same,0);sqlite3_finalize(same);sqlite3_finalize(s);status=match?200:409;copy_s(reason,cap,match?"Действие уже сохранено":"Номер операции уже использован");goto done;}sqlite3_finalize(s);
 s=production_query("SELECT status FROM jobs WHERE id=%Q",id);char old[20];old[0]=0;if(s&&sqlite3_step(s)==SQLITE_ROW)copy_s(old,sizeof(old),production_text(s,0));sqlite3_finalize(s);
 if(!old[0]){status=404;copy_s(reason,cap,"Задание не найдено");goto done;}
 if(!strcmp(action,"start")&&(production.active[0]||(!strcmp(old,"done")))){copy_s(reason,cap,"Сначала приостановите или завершите текущее задание");goto done;}
 if(!strcmp(action,"pause")&&strcmp(old,"active")){copy_s(reason,cap,"Приостановить можно выполняемое задание");goto done;}
 if(!strcmp(action,"finish")&&strcmp(old,"active")&&strcmp(old,"paused")){copy_s(reason,cap,"Завершить можно начатое задание");goto done;}
 if(!production_exec("BEGIN IMMEDIATE")){status=503;goto done;}
 production_close_interval();uint64_t at=wall_ms();
 if(!strcmp(action,"start"))production_sql("UPDATE jobs SET status='active',started=coalesce(started,%lld),uncertain=uncertain OR %d WHERE id=%Q",(sqlite3_int64)at,!production.have_counter,id);
 else if(!strcmp(action,"pause"))production_sql("UPDATE jobs SET status='paused' WHERE id=%Q",id);
 else production_sql("UPDATE jobs SET status='done',finished=%lld WHERE id=%Q",(sqlite3_int64)at,id);
 production_sql("INSERT INTO meta(key,value) VALUES('currentJob',%Q) ON CONFLICT(key) DO UPDATE SET value=excluded.value",production.active[0]&&strcmp(production.active,id)?production.active:!strcmp(action,"finish")?"":id);
 char payload[600];Buffer b;binit(&b,payload,sizeof(payload));bf(&b,"{\"id\":");bj(&b,id);bf(&b,",\"action\":");bj(&b,action);bf(&b,",\"operationId\":");bj(&b,op);bf(&b,"}");if(!b.failed)production_event("job.action",at,payload);else production_error("Ошибка формирования действия");
 if(production.failed){sqlite3_exec(production.db,"ROLLBACK",NULL,NULL,NULL);status=503;}else if(production_exec("COMMIT")){production_active();status=200;copy_s(reason,cap,!strcmp(action,"finish")?"Задание завершено":!strcmp(action,"pause")?"Учёт задания приостановлен":"Учёт задания начат");}else{sqlite3_exec(production.db,"ROLLBACK",NULL,NULL,NULL);status=503;}
 done:if(status==503)copy_s(reason,cap,"Не удалось сохранить действие. Проверьте локальную историю");unlock(&production.mutex);return status;
}
static int production_parameter(const char *route,const char *key,char *out,size_t cap){
 const char *p=strchr(route,'?');if(!p)return 0;size_t keylen=strlen(key);int found=0;
 for(p++;*p;){const char *end=strchr(p,'&');if(!end)end=p+strlen(p);if((size_t)(end-p)>keylen&&p[keylen]=='='&&!strncmp(p,key,keylen)){size_t n=(size_t)(end-p-keylen-1);if(found||n>=cap)return -1;memcpy(out,p+keylen+1,n);out[n]=0;found=1;}if(!*end)break;p=end+1;}return found;
}
static int production_range(const char *route,sqlite3_int64 *from,sqlite3_int64 *to,int *offset,char kind[16],char job[81]){
 char a[32],b[32],o[32];double x,y,z=0;
 if(production_parameter(route,"from",a,sizeof(a))!=1||production_parameter(route,"to",b,sizeof(b))!=1||!number_parse(a,&x)||!number_parse(b,&y)||floor(x)!=x||floor(y)!=y||x<0||y<=x||y-x>31.0*86400000||y>4102444800000.0)return 0;
 int has=production_parameter(route,"offset",o,sizeof(o));if(has<0||(has&&(!number_parse(o,&z)||z<0||z>10000000||floor(z)!=z)))return 0;
 kind[0]=job[0]=0;if(production_parameter(route,"kind",kind,16)<0||production_parameter(route,"job",job,81)<0)return 0;
 if(kind[0]&&strcmp(kind,"all")&&strcmp(kind,"work")&&strcmp(kind,"stop")&&strcmp(kind,"manual")&&strcmp(kind,"unknown"))return 0;
 if(job[0]&&!production_id(job))return 0;
 *from=(sqlite3_int64)x;*to=(sqlite3_int64)y;*offset=(int)z;return 1;
}
static void production_interval_json(Buffer *b,sqlite3_stmt *s){
 bf(b,"{\"id\":%lld,\"start\":%lld,\"end\":%lld,\"durationMs\":%lld,\"state\":",sqlite3_column_int64(s,0),sqlite3_column_int64(s,1),sqlite3_column_int64(s,2),sqlite3_column_int64(s,3));bj(b,production_text(s,4));
 bf(b,",\"code\":%d,\"automatic\":%d,\"jobId\":",sqlite3_column_int(s,5),sqlite3_column_int(s,6));bj(b,production_text(s,7));bf(b,",\"epoch\":%d,\"plc\":",sqlite3_column_int(s,8));bj(b,production_text(s,9));
 bf(b,",\"alarms\":%s,\"open\":%s,\"reason\":",production_text(s,10),sqlite3_column_int(s,11)?"true":"false");bj(b,production_text(s,12));bf(b,",\"comment\":");bj(b,production_text(s,13));bf(b,",\"author\":");bj(b,production_text(s,14));bf(b,",\"updatedAt\":%lld,\"reasonSource\":",sqlite3_column_int64(s,15));bj(b,production_text(s,19)[0]?"manual":production_text(s,16)[0]?"automatic":"");bf(b,",\"reasonCode\":");bj(b,production_text(s,16));bf(b,",\"reasonAlarms\":%s,\"reasonDetectedAt\":%lld}",production_text(s,17)[0]?production_text(s,17):"[]",sqlite3_column_int64(s,18));
}
static const char *production_interval_select="SELECT i.*,coalesce(nullif(n.reason,''),CASE c.code WHEN 'liner_change' THEN 'Замена лайнера' WHEN 'roll_change' THEN 'Замена рулона' ELSE '' END),n.comment,n.author,n.updated,c.code,c.alarms,c.detected,n.reason FROM intervals i LEFT JOIN notes n ON n.interval=i.seq LEFT JOIN stop_causes c ON c.interval=i.seq";
static int production_view(const char *route,sqlite3_int64 from,sqlite3_int64 to,sqlite3_int64 *a,sqlite3_int64 *z){
 char x[32],y[32];double f,t;int hf=production_parameter(route,"viewFrom",x,sizeof(x)),ht=production_parameter(route,"viewTo",y,sizeof(y));
 *a=from;*z=to;if(!hf&&!ht)return 1;
 if(hf!=1||ht!=1||!number_parse(x,&f)||!number_parse(y,&t)||floor(f)!=f||floor(t)!=t||f<from||t>to||t<=f||t-f<1000)return 0;
 *a=(sqlite3_int64)f;*z=(sqlite3_int64)t;return 1;
}
static int production_shift_bounds(uint64_t now,sqlite3_int64 *from,sqlite3_int64 *to){
 time_t clock=(time_t)(now/1000);struct tm local;
#ifdef _WIN32
 if(localtime_s(&local,&clock))return 0;
#else
 if(!localtime_r(&clock,&local))return 0;
#endif
 int hour=local.tm_hour;
 local.tm_hour=hour>=20?20:hour>=8?8:20;local.tm_min=local.tm_sec=0;if(hour<8)local.tm_mday--;local.tm_isdst=-1;
 time_t a=mktime(&local);local.tm_hour+=12;local.tm_isdst=-1;time_t z=mktime(&local);
 if(a<0||z<=a)return 0;
 *from=(sqlite3_int64)a*1000;*to=(sqlite3_int64)z*1000;return 1;
}
static size_t production_history_json_mode(char *out,size_t cap,const char *route,int summary){
 sqlite3_int64 from,to,a,z;int offset=0;char kind[16]="all",job[81]="";
 if(summary){if(!production_shift_bounds(wall_ms(),&from,&to))return 0;}
 else if(!production_range(route,&from,&to,&offset,kind,job))return 0;
 if(!production_view(route,from,to,&a,&z))return 0;
 Buffer b;binit(&b,out,cap);lock(&production.mutex);if(!production.db){unlock(&production.mutex);return 0;}
 bf(&b,"{\"from\":%lld,\"to\":%lld,\"viewFrom\":%lld,\"viewTo\":%lld,\"now\":%llu,\"shiftOnly\":%s,\"storageError\":%s,\"totals\":{",from,to,a,z,(unsigned long long)wall_ms(),summary?"true":"false",production.failed?"true":"false");
 sqlite3_stmt *q=production_query("WITH clipped AS (SELECT kind,duration*1.0*max(0,min(end,%lld)-max(start,%lld))/max(1,end-start) AS ms FROM intervals WHERE start<%lld AND end>=%lld AND (%Q='' OR job=%Q)) SELECT kind,CAST(sum(ms) AS INTEGER) FROM clipped GROUP BY kind",to,from,to,from,job,job);int comma=0;
 while(q&&sqlite3_step(q)==SQLITE_ROW){if(comma++)bf(&b,",");bj(&b,production_text(q,0));bf(&b,":%lld",sqlite3_column_int64(q,1));}sqlite3_finalize(q);
 bf(&b,"}");
 if(!summary){
  q=production_query("SELECT count(*) FROM intervals WHERE start<%lld AND end>=%lld AND (%Q IN ('','all') OR kind=%Q) AND (%Q='' OR job=%Q)",to,from,kind,kind,job,job);sqlite3_int64 total=q&&sqlite3_step(q)==SQLITE_ROW?sqlite3_column_int64(q,0):0;sqlite3_finalize(q);bf(&b,",\"total\":%lld,\"offset\":%d,\"pageSize\":100,\"intervals\":[",total,offset);
  q=production_query("%s WHERE i.start<%lld AND i.end>=%lld AND (%Q IN ('','all') OR i.kind=%Q) AND (%Q='' OR i.job=%Q) ORDER BY i.seq DESC LIMIT 100 OFFSET %d",production_interval_select,to,from,kind,kind,job,job,offset);comma=0;while(q&&sqlite3_step(q)==SQLITE_ROW){if(comma++)bf(&b,",");production_interval_json(&b,q);}sqlite3_finalize(q);bf(&b,"]");
 }
 /* Re-bin the visible window on zoom: short stops regain their resolution. */
 bf(&b,",\"timeline\":[");q=production_query("WITH RECURSIVE bins(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM bins WHERE n<479),ranges AS (SELECT n,%lld+(%lld-%lld)*n/480 a,%lld+(%lld-%lld)*(n+1)/480 z FROM bins),weights AS (SELECT n,a,z,kind,sum(max(0,min(end,z)-max(start,a))) weight,min(max(start,a)) first_seen,max(min(end,z)) last_seen FROM ranges JOIN intervals ON start<z AND end>a WHERE (%Q='' OR job=%Q) GROUP BY n,kind),ranked AS (SELECT *,row_number() OVER (PARTITION BY n ORDER BY weight DESC,kind) rank FROM weights) SELECT max(a,first_seen),min(z,last_seen),kind FROM ranked WHERE rank=1 ORDER BY n",a,z,a,a,z,a,job,job);comma=0;while(q&&sqlite3_step(q)==SQLITE_ROW){if(comma++)bf(&b,",");bf(&b,"[%lld,%lld,",sqlite3_column_int64(q,0),sqlite3_column_int64(q,1));bj(&b,production_text(q,2));bf(&b,"]");}sqlite3_finalize(q);bf(&b,"]}");unlock(&production.mutex);return b.failed?0:b.used;
}
static size_t production_history_json(char *out,size_t cap,const char *route){return production_history_json_mode(out,cap,route,0);}
static size_t production_shift_json(char *out,size_t cap,const char *route){
 /* Operators can only pan within the shift selected by the server clock. */
 const char *p=strchr(route,'?');
 if(p)for(p++;*p;){const char *end=strchr(p,'&');if(!end)end=p+strlen(p);const char *eq=memchr(p,'=',(size_t)(end-p));size_t n=eq?(size_t)(eq-p):0;if(!eq||!((n==8&&!strncmp(p,"viewFrom",8))||(n==6&&!strncmp(p,"viewTo",6))))return 0;if(!*end)break;p=end+1;}
 return production_history_json_mode(out,cap,route,1);
}
static size_t production_detail_json(char *out,size_t cap,const char *id,int interval){
 Buffer b;binit(&b,out,cap);if(interval){double number;if(!id||strlen(id)>16)return 0;for(const char *p=id;*p;p++)if(*p<'0'||*p>'9')return 0;if(!number_parse(id,&number)||number<1||number>9007199254740991.0||floor(number)!=number)return 0;}
 else if(!production_id(id))return 0;
 lock(&production.mutex);if(!production.db){unlock(&production.mutex);return 0;}
 sqlite3_stmt *s=interval?production_query("%s WHERE i.seq=%s",production_interval_select,id):production_query("SELECT * FROM jobs WHERE id=%Q",id);
 if(s&&sqlite3_step(s)==SQLITE_ROW){if(interval)production_interval_json(&b,s);else production_job_json(&b,s,1);}sqlite3_finalize(s);unlock(&production.mutex);return b.failed?0:b.used;
}
static size_t production_export_json(char *out,size_t cap,const char *route){
 char text[32];double after=0;if(production_parameter(route,"after",text,sizeof(text))<0)return 0;if(production_parameter(route,"after",text,sizeof(text))==1&&(!number_parse(text,&after)||after<0||floor(after)!=after||after>9007199254740991.0))return 0;
 sqlite3_int64 from=0,to=9007199254740991LL;char optional[32];int hf=production_parameter(route,"from",optional,sizeof(optional)),ht=production_parameter(route,"to",optional,sizeof(optional));if(hf||ht){int offset;char kind[16],job[81];if(!production_range(route,&from,&to,&offset,kind,job))return 0;}
 Buffer b;binit(&b,out,cap);lock(&production.mutex);if(!production.db){unlock(&production.mutex);return 0;}bf(&b,"{\"schemaVersion\":1,\"machineId\":");bj(&b,production.machine);bf(&b,",\"events\":[");
 sqlite3_stmt *s=production_query("SELECT seq,at,kind,payload FROM events WHERE seq>%lld AND at>=%lld AND at<%lld ORDER BY seq LIMIT 20",(sqlite3_int64)after,from,to);int comma=0;sqlite3_int64 last=(sqlite3_int64)after;
 while(s&&sqlite3_step(s)==SQLITE_ROW){if(comma++)bf(&b,",");last=sqlite3_column_int64(s,0);bf(&b,"{\"id\":\"%s-%lld\",\"sequence\":%lld,\"occurredAt\":%lld,\"kind\":",production.machine,last,last,sqlite3_column_int64(s,1));bj(&b,production_text(s,2));bf(&b,",\"payload\":%s}",production_text(s,3));}sqlite3_finalize(s);bf(&b,"],\"nextAfter\":%lld,\"hasMore\":%s}",last,comma==20?"true":"false");unlock(&production.mutex);return b.failed?0:b.used;
}
#endif
