#include "../src/app.h"
#include <assert.h>
static uint64_t serial_wall=1700000000000ULL;
static void sample(uint64_t mono,int code,int automatic,unsigned mask,int alarm_good){
 ProductionSample s;memset(&s,0,sizeof(s));s.mono=mono;s.wall=serial_wall+mono;s.total_observed=mono;s.epoch=s.serial=1;s.code=code;s.automatic=automatic;s.good=s.total_good=1;s.total=100;s.alarm_good=alarm_good;s.cause_mask=mask;copy_s(s.plc,sizeof(s.plc),"test-plc");
 for(unsigned i=0;i<7;i++)if(mask&(1u<<i))s.alarms[s.alarm_count++]=production_cause_ids[i];
 production_sample(&s);assert(!production.failed);
}
static void scenario(void){production_close_interval();production.have_sample=production.have_counter=0;serial_wall+=100000;sample(100,4,1,0,1);sample(200,4,1,0,1);}
int main(int argc,char **argv){
 assert(argc==2);mutex_init(&app.mutex);copy_s(app.base,sizeof(app.base),argv[1]);production_init();assert(!production.failed);assert(production_scalar("PRAGMA user_version")==2);assert(production_exec("BEGIN IMMEDIATE"));
 for(unsigned bit=0;bit<7;bit++){
  scenario();sample(300,4,1,1u<<bit,1);sample(400,2,0,1u<<bit,1);sqlite3_int64 first=production.interval;
  sample(700,5,0,0,1);sample(900,6,0,0,1);sample(1500,5,0,0,1);sample(2400,5,0,0,1);
  assert(production_scalar("SELECT count(*) FROM stop_causes")==(sqlite3_int64)(bit+1)*4);
  sqlite3_stmt *q=production_query("SELECT code,alarms FROM stop_causes WHERE interval=%lld",first);assert(sqlite3_step(q)==SQLITE_ROW);assert(!strcmp(production_text(q,0),bit==6?"roll_change":"liner_change"));char id[16];snprintf(id,sizeof(id),"[%d]",production_cause_ids[bit]);assert(!strcmp(production_text(q,1),id));sqlite3_finalize(q);
  sample(2500,4,1,0,1);sample(2600,5,0,0,1);sample(4000,5,0,0,1);sample(4700,5,0,0,1);
  assert(production_scalar("SELECT count(*) FROM stop_causes")==(sqlite3_int64)(bit+1)*4);
 }
 sqlite3_int64 count=production_scalar("SELECT count(*) FROM stop_causes");
 /* A second material cause within one PLC polling cycle is ambiguous. */
 scenario();sample(300,4,1,1,1);sample(400,2,0,1,1);sample(800,2,0,65,1);sample(2000,5,0,0,1);sample(2400,5,0,0,1);assert(production_scalar("SELECT count(*) FROM stop_causes")==count);
 /* Unrelated alarms, old conditions and stale alarm data do not infer causes. */
 scenario();sample(300,4,1,64,1);sample(1800,4,1,64,1);sample(3000,4,1,64,1);sample(3100,5,0,64,1);sample(4600,5,0,0,1);sample(5200,5,0,0,1);assert(production_scalar("SELECT count(*) FROM stop_causes")==count);
 scenario();sample(300,4,1,1,0);sample(400,2,0,1,0);sample(1800,2,0,1,0);sample(2400,2,0,1,0);assert(production_scalar("SELECT count(*) FROM stop_causes")==count);
 /* Alarm/state polling skew: a new alarm can arrive just after the stop. */
 scenario();sample(400,5,0,0,1);sample(800,2,0,4,1);sample(1800,5,0,0,1);sample(2400,5,0,0,1);assert(production_scalar("SELECT count(*) FROM stop_causes")==count+3);count+=3;
 /* Short stops settle at the next actual work observation. */
 scenario();sample(300,4,1,64,1);sample(400,5,0,64,1);sample(700,4,1,0,1);assert(production_scalar("SELECT count(*) FROM stop_causes")==count+1);count++;
 /* Observation gaps break the causal chain instead of labelling a later stop. */
 scenario();sample(300,4,1,1,1);sample(5000,5,0,1,1);sample(6200,5,0,0,1);sample(7200,5,0,0,1);assert(production_scalar("SELECT count(*) FROM stop_causes")==count);
 assert(production_exec("COMMIT"));production_shutdown();puts("PASS: all seven PLC material alarms, state fragmentation/manual motion, reset persistence, next-start boundary, ambiguity, stale/old alarms, polling skew, short stops, gaps");return 0;
}
