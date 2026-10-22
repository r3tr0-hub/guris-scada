#ifndef SCADA_PRODUCTION_QUEUE_H
#define SCADA_PRODUCTION_QUEUE_H
/* ADS only copies snapshots here. Disk and SQLite never run on the ADS thread. */
enum { PROD_QUEUE_CAP=512, PROD_ALARMS=24 };
/* IDs and conditions verified in Slow_Task.Alarms, not translated text. */
static const int production_cause_ids[]={14,15,28,29,67,68,27};
enum { PROD_LINER_MASK=63, PROD_ROLL_MASK=64, PROD_CORRELATE_MS=2000 };
typedef struct {
 uint64_t mono,wall,total_observed;unsigned epoch,serial;int good,total_good,code,automatic,total;
 int alarm_good;unsigned cause_mask,alarm_count;int alarms[PROD_ALARMS];char plc[180];
} ProductionSample;
static struct {Mutex mutex;int initialized,overflow;unsigned head,count;ProductionSample items[PROD_QUEUE_CAP];} production_queue;
static void production_capture(void){
 if(!production_queue.initialized)return;
 ProductionSample s;memset(&s,0,sizeof(s));s.mono=now_ms();s.wall=wall_ms();
 lock(&app.mutex);
 Reading *st=&app.fields[F_STATE],*au=&app.fields[F_AUTO],*t=&app.fields[F_TOTAL];
 s.epoch=app.epoch;s.serial=app.config_serial;s.code=(int)st->value;s.automatic=(int)au->value;
 s.good=app.connected&&app.ads_status==5&&st->quality&&au->quality&&s.mono-st->observed<=1500&&s.mono-au->observed<=1500;
 s.total_good=s.good&&t->quality&&s.mono-t->observed<=1500&&t->value>=0&&t->value<=2147483647.0;
 s.total=(int)t->value;s.total_observed=t->observed;
 snprintf(s.plc,sizeof(s.plc),"%s|%s|%u",app.ip,app.netid,app.ads_port);
 s.alarm_good=app.connected&&app.alarms.quality&&s.mono-app.alarms.observed<=1500;
 if(s.alarm_good)for(unsigned i=0;i<app.alarms.count;i++)if(app.alarms.rows[i].condition){
  int id=app.alarms.rows[i].id;if(s.alarm_count<PROD_ALARMS)s.alarms[s.alarm_count++]=id;
  for(unsigned k=0;k<sizeof(production_cause_ids)/sizeof(*production_cause_ids);k++)if(id==production_cause_ids[k])s.cause_mask|=1u<<k;
 }
 unlock(&app.mutex);
 lock(&production_queue.mutex);
 if(production_queue.count==PROD_QUEUE_CAP){production_queue.overflow=1;production_queue.head=(production_queue.head+1)%PROD_QUEUE_CAP;production_queue.count--;}
 production_queue.items[(production_queue.head+production_queue.count)%PROD_QUEUE_CAP]=s;production_queue.count++;
 unlock(&production_queue.mutex);
}
#endif
