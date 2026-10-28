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
 /* Diagnostic-only observations; never consumed by the production policy. */
 unsigned diag_flags,diag_symbol,diag_poll_ms,diag_cycles,diag_ui_errors;
 unsigned diag_ages[9];int diag_current,diag_groups;int diag_control,diag_sensor,diag_guard,diag_clean_active,diag_clean_pending;
 uint64_t diag_deadline,diag_clean_deadline;double diag_speed,diag_length;
} ProductionSample;
#include "diagnostic_queue.h"
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
 unsigned active_alarms=0;
 if(s.alarm_good)for(unsigned i=0;i<app.alarms.count;i++)if(app.alarms.rows[i].condition){
  active_alarms++;int id=app.alarms.rows[i].id;if(s.alarm_count<PROD_ALARMS)s.alarms[s.alarm_count++]=id;
  for(unsigned k=0;k<sizeof(production_cause_ids)/sizeof(*production_cause_ids);k++)if(id==production_cause_ids[k])s.cause_mask|=1u<<k;
 }
 Reading *dc=&app.fields[F_UNWINDER_STOP],*ds=&app.fields[F_UNWINDER_SENSOR],*sp=&app.fields[F_SPEED],*film=&app.fields[F_WORK_LENGTH],*cur=&app.fields[F_CURRENT],*groups=&app.fields[F_GROUPS];
 Reading *observed[]={st,au,t,dc,ds,sp,film,cur,groups};
 for(unsigned i=0;i<9;i++){uint64_t age=s.mono>=observed[i]->observed?s.mono-observed[i]->observed:UINT32_MAX;s.diag_ages[i]=(unsigned)(age>UINT32_MAX?UINT32_MAX:age);if(observed[i]->quality&&age<=1500)s.diag_flags|=1u<<(i<7?i:i+3);}
 s.diag_flags|=(app.connected?128u:0u)|(s.alarm_good?256u:0u)|(active_alarms>PROD_ALARMS?512u:0u);
 s.diag_control=(int)dc->value;s.diag_sensor=(int)ds->value;s.diag_guard=app.unwinder.mode;s.diag_deadline=app.unwinder.deadline;
 s.diag_clean_active=app.cleaning.active;s.diag_clean_pending=app.cleaning.pending;s.diag_clean_deadline=app.cleaning.deadline;
 s.diag_current=(int)cur->value;s.diag_groups=(int)groups->value;s.diag_speed=sp->value;s.diag_length=film->value;s.diag_symbol=app.symbol_version;s.diag_poll_ms=(unsigned)app.poll_duration;s.diag_cycles=app.poll_cycles;s.diag_ui_errors=app.ui_error_count;
 unlock(&app.mutex);
 diagnostic_capture(&s);
 lock(&production_queue.mutex);
 if(production_queue.count==PROD_QUEUE_CAP){production_queue.overflow=1;production_queue.head=(production_queue.head+1)%PROD_QUEUE_CAP;production_queue.count--;}
 production_queue.items[(production_queue.head+production_queue.count)%PROD_QUEUE_CAP]=s;production_queue.count++;
 unlock(&production_queue.mutex);
}
#endif
