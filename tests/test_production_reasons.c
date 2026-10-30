#include "../src/app.h"
#include <assert.h>
static uint64_t mono=1000,wallbase=1800000000000ULL;
static int total=100,good=1,alarms_good=1;static unsigned epoch=1,serial=1;static const char *plc="test-plc";
static void tick(uint64_t step,int code,int automatic,unsigned mask,int delta){
 mono+=step;total+=delta;ProductionSample s;memset(&s,0,sizeof(s));s.mono=mono;s.wall=wallbase+mono;s.total_observed=mono;s.epoch=epoch;s.serial=serial;s.code=code;s.automatic=automatic;s.good=s.total_good=good;s.total=total;s.alarm_good=alarms_good;s.cause_mask=mask;copy_s(s.plc,sizeof(s.plc),plc);for(unsigned i=0;i<7;i++)if(mask&(1u<<i))s.alarms[s.alarm_count++]=production_cause_ids[i];production_sample(&s);assert(!production.failed);
}
static void scenario(unsigned mask){
 production_close_interval();production.have_sample=production.have_counter=0;memset(&production.cause,0,sizeof(production.cause));mono+=10000;good=alarms_good=1;epoch=serial=1;plc="test-plc";total=100;
 tick(100,4,1,0,0);tick(1000,4,1,mask,1);tick(1000,2,0,mask,0);tick(2000,2,0,mask,0);assert(production.cause.episode&&production.cause.settled);
}
static sqlite3_int64 current(void){return production.cause.id;}
static int scalar(const char *format,sqlite3_int64 id){sqlite3_stmt *s=production_query(format,id);assert(s&&sqlite3_step(s)==SQLITE_ROW);int n=sqlite3_column_int(s,0);sqlite3_finalize(s);return n;}
int main(int argc,char **argv){
 assert(argc==2);mutex_init(&app.mutex);copy_s(app.base,sizeof(app.base),argv[1]);production_init();assert(!production.failed);assert(production_scalar("PRAGMA user_version")==3);
 /* Existing v1 automatic cause and user note survive v2 calculations/restart. */
 assert(production_sql("INSERT INTO intervals(start,end,duration,kind,code,automatic,job,epoch,plc,alarms,open) VALUES(1,2,1,'stop',5,0,'',1,'legacy','[27]',0)"));sqlite3_int64 legacy=sqlite3_last_insert_rowid(production.db);
 assert(production_sql("INSERT INTO stop_causes VALUES(%lld,'roll_change','[27]',2,1)",legacy));assert(production_sql("INSERT INTO notes VALUES(%lld,'manual note','comment','engineer',2,1)",legacy));
 for(unsigned bit=0;bit<7;bit++){
  scenario(1u<<bit);sqlite3_int64 id=current();assert(production.cause.reason==(bit==6?2:1));
  tick(1000,4,1,0,0);for(int i=0;i<23;i++)tick(1000,4,1,0,0);assert(production.cause.episode);tick(1000,5,0,0,0);assert(current()==id&&!production.cause.candidate);
  /* Output while HMI still reports alarm is observed, not relabelled work. */
  sqlite3_int64 products=production_scalar("SELECT coalesce(sum(products),0) FROM interval_motion");tick(1000,2,1,0,5);assert(production.last_kind==2);assert(production_scalar("SELECT coalesce(sum(products),0) FROM interval_motion")==products+5);
  tick(1000,4,1,0,1);uint64_t start=wallbase+mono;
  for(int i=0;i<29;i++){tick(1000,4,1,0,1);}
  assert(production.cause.episode);tick(999,4,1,0,0);assert(production.cause.episode);tick(1,4,1,0,1);assert(!production.cause.episode);
  assert(scalar("SELECT end=confirmed_start AND end=%lld FROM material_episodes WHERE id=(SELECT max(id) FROM material_episodes)",(sqlite3_int64)start));
 }
 scenario(64);tick(1000,4,1,0,1);uint64_t old_candidate=production.cause.candidate;
 for(int i=0;i<40;i++){tick(1000,4,1,0,0);}assert(production.cause.episode&&production.cause.candidate>old_candidate);
 uint64_t later_candidate=production.cause.candidate;assert(later_candidate==old_candidate+31000);
 /* This candidate's first 10s had no growth: at 30s it must cancel,
    rather than validating its old boundary from a later burst. */
 for(int i=0;i<21;i++){tick(1000,4,1,0,1);}assert(production.cause.episode&&!production.cause.candidate);
 tick(1000,4,1,0,1);uint64_t sustained_start=mono;
 for(int i=0;i<29;i++){tick(1000,4,1,0,1);}assert(production.cause.episode);
 tick(1000,4,1,0,1);assert(!production.cause.episode);
 assert(scalar("SELECT confirmed_start=%lld FROM material_episodes WHERE id=(SELECT max(id) FROM material_episodes)",(sqlite3_int64)(wallbase+sustained_start)));
 scenario(64);sqlite3_int64 id=current();tick(1000,4,1,0,1);for(int i=0;i<40;i++)tick(1000,4,1,0,0);assert(production.cause.episode);tick(1000,5,0,0,0);assert(!production.cause.candidate);
 /* A counter reset cancels only a start candidate; it is not an ADS gap. */
 tick(1000,4,1,0,1);total=0;tick(1000,4,1,0,0);assert(current()==id&&production.cause.episode&&!production.cause.candidate);assert(production_scalar("SELECT count(*) FROM events WHERE kind='counter.reset'")>=1);
 total=INT_MAX;tick(1000,4,1,0,0);total=0;tick(1000,4,1,0,0);assert(production.cause.episode);assert(production_scalar("SELECT sum(resets) FROM interval_motion")>=2);
 scenario(1);tick(1000,2,0,65,0);assert(production.cause.competing&&production.cause.reason==0);assert(scalar("SELECT confidence='competing' FROM material_episodes WHERE id=%lld",current()));
 /* Exactly 2000ms remains continuous; 2001ms is a boundary. */
 scenario(64);id=current();tick(2000,5,0,0,0);assert(production.cause.episode);tick(2001,5,0,0,0);assert(!production.cause.episode);assert(scalar("SELECT phase='interrupted' AND confidence='uncertain' FROM material_episodes WHERE id=%lld",id));
 scenario(64);id=current();good=0;tick(1000,5,0,0,0);assert(!production.cause.episode);assert(scalar("SELECT confidence='uncertain' FROM material_episodes WHERE id=%lld",id));
 scenario(64);epoch++;tick(1000,5,0,0,0);assert(!production.cause.episode);
 scenario(64);serial++;tick(1000,5,0,0,0);assert(!production.cause.episode);
 scenario(64);plc="another-plc";tick(1000,5,0,0,0);assert(!production.cause.episode);
 scenario(64);alarms_good=0;tick(1000,5,0,0,0);assert(!production.cause.episode);
 scenario(64);id=current();for(int i=0;i<601;i++)tick(1000,5,0,0,0);assert(scalar("SELECT confidence='uncertain' FROM material_episodes WHERE id=%lld",id));
 /* Migration never edits legacy policy or manual attribution. */
 production_shutdown();production_init();assert(!production.failed);assert(scalar("SELECT policy=1 AND code='roll_change' FROM stop_causes WHERE interval=%lld",legacy));assert(scalar("SELECT reason='manual note' AND revision=1 FROM notes WHERE interval=%lld",legacy));assert(scalar("SELECT phase='interrupted' AND confidence='uncertain' FROM material_episodes WHERE id=%lld",id));
 /* Failed batch rolls back and cannot carry a confident in-memory episode. */
 scenario(64);assert(production_exec("CREATE TRIGGER fail_material BEFORE UPDATE ON material_episodes BEGIN SELECT RAISE(FAIL,'synthetic storage failure'); END"));
 ProductionSample next=production.last;next.mono+=1000;next.wall+=1000;production_queue.items[0]=next;production_queue.head=0;production_queue.count=1;production_drain();assert(production.failed&&!production.cause.episode&&!production.have_sample);assert(production_exec("DROP TRIGGER fail_material"));production.failed=0;production_shutdown();
 puts("PASS: v2 short trials, 30s sustained growth/retro boundary, HMI/output separation, counter resets/overflow, competing materials, exact 2000ms boundary, quality/PLC/epoch/config changes, restart/storage failure, immutable v1 notes and long-pause uncertainty");return 0;
}
