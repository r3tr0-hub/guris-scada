#include "../src/app.h"
#include <assert.h>
static void sample(uint64_t mono,uint64_t wall,int state,int automatic,int total,int good){
 ProductionSample s;memset(&s,0,sizeof(s));s.mono=mono;s.wall=wall;s.total_observed=mono;s.epoch=s.serial=1;s.code=state;s.automatic=automatic;s.total=total;s.good=s.total_good=good;copy_s(s.plc,sizeof(s.plc),"test-plc");production_sample(&s);assert(!production.failed);
}
int main(int argc,char **argv){
 assert(argc==2);mutex_init(&app.mutex);copy_s(app.base,sizeof(app.base),argv[1]);production_init();assert(!production.failed);
 assert(production_exec("BEGIN IMMEDIATE"));
 production_sql("INSERT INTO jobs(id,number,title,plan,created,plc,document,status) VALUES('test','1','test',1000,1,'test-plc','{}','active')");production_active();
 sample(100,1000,5,0,100,1);sample(200,1100,5,0,100,1);
 sample(300,1200,4,1,101,1);sample(400,1300,4,1,102,1);
 sample(500,1400,6,0,102,1);sample(550,1450,6,0,102,1);
 sample(600,1500,6,0,102,0);sample(700,1600,0,0,102,0);
 assert(production_scalar("SELECT sum(duration) FROM intervals WHERE kind='stop'")==200);
 assert(production_scalar("SELECT sum(duration) FROM intervals WHERE kind='work'")==200);
 assert(production_scalar("SELECT sum(duration) FROM intervals WHERE kind='manual'")==50);
 assert(production_scalar("SELECT sum(duration) FROM intervals WHERE kind='unknown'")==150);
 assert(production_scalar("SELECT produced FROM jobs WHERE id='test'")==2);
 sample(800,1700,4,1,900,1);assert(production_scalar("SELECT produced FROM jobs WHERE id='test'")==2);
 sample(900,1800,4,1,901,1);assert(production_scalar("SELECT produced FROM jobs WHERE id='test'")==3);
 sample(1000,1900,4,1,0,1);sample(1001,1901,4,1,2,1);
 assert(production_scalar("SELECT produced FROM jobs WHERE id='test'")==5);
 assert(production_scalar("SELECT uncertain FROM jobs WHERE id='test'")==1);
 /* A long scheduler/observation gap is unknown; it is not continuing production. */
 sample(5000,5900,4,1,100,1);assert(production_scalar("SELECT produced FROM jobs WHERE id='test'")==5);
 assert(production_scalar("SELECT count(*) FROM intervals WHERE kind='unknown' AND duration>3000")>=1);
 sample(5100,2000,4,1,101,1);
 assert(production_scalar("SELECT count(*) FROM events WHERE kind='clock.changed'")==1);
 assert(production_scalar("SELECT count(*) FROM intervals WHERE duration<0 OR end<start")==0);
 assert(production_exec("COMMIT"));production_shutdown();
 puts("PASS: monotonic durations, conservative loss boundary, all four states, batched/reset/gap counts, clock rollback and nonnegative intervals");return 0;
}
