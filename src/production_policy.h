#ifndef SCADA_PRODUCTION_POLICY_H
#define SCADA_PRODUCTION_POLICY_H
/* Policy v2: HMI classifications stay unchanged. Material service is a
   separate inferred episode, with a retrospectively confirmed restart. */
enum { PROD_RESTART_MS=30000, PROD_LONG_SERVICE_MS=600000 };
static const char *production_reason_confidence(void){return production.cause.competing?"competing":production.cause.uncertain?"uncertain":production.cause.settled?"inferred":"candidate";}
static void production_reason_event(const ProductionSample *s,const char *decision){
 const char *phase=!strcmp(decision,"restart_confirmed_30s_counter_growth")?"closed":!strcmp(decision,"observation_boundary")?"interrupted":production.cause.candidate?"starting":"service";
 char data[1000],evidence[100];production_reason_evidence(production.cause.evidence,evidence);
 snprintf(data,sizeof(data),"{\"policy\":2,\"episodeId\":%lld,\"firstIntervalId\":%lld,\"decision\":\"%s\",\"phase\":\"%s\",\"confidence\":\"%s\",\"candidateStart\":%llu,\"candidateMono\":%llu,\"observedMono\":%llu,\"state\":%d,\"automatic\":%d,\"total\":%d,\"totalGood\":%s,\"alarmsGood\":%s,\"evidence\":%s,\"physicalReplacementConfirmed\":false,\"source\":\"cached_snapshot\",\"epoch\":%u,\"configSerial\":%u,\"normalWindowMs\":30000,\"growthBucketMs\":10000,\"growthBuckets\":[%llu,%llu,%llu,%llu],\"lastGrowthMonoMs\":%llu}",production.cause.id,production.cause.first,decision,phase,production_reason_confidence(),(unsigned long long)production.cause.candidate_wall,(unsigned long long)production.cause.candidate,(unsigned long long)s->mono,s->code,s->automatic,s->total,s->total_good?"true":"false",s->alarm_good?"true":"false",evidence,s->epoch,s->serial,(unsigned long long)production.cause.growth[0],(unsigned long long)production.cause.growth[1],(unsigned long long)production.cause.growth[2],(unsigned long long)production.cause.growth[3],(unsigned long long)production.cause.last_growth);
 diagnostic_event_at("reason.v2.phase",s->wall,s->mono,data);production_sql("INSERT INTO events(at,kind,payload) VALUES(%lld,'reason.v2.phase',%Q)",(sqlite3_int64)s->wall,data);
}
static void production_reason_save(const ProductionSample *s,const char *phase){
 if(!production.cause.id)return;
 char evidence[100];production_reason_evidence(production.cause.evidence,evidence);
 production_sql("UPDATE material_episodes SET end=%lld,phase=%Q,confidence=%Q,reason=%Q,evidence=%Q,candidate_start=%lld WHERE id=%lld",(sqlite3_int64)s->wall,phase,production_reason_confidence(),production_reason_code(production.cause.reason),evidence,(sqlite3_int64)production.cause.candidate_wall,production.cause.id);
}
static void production_reason_cancel_start(const ProductionSample *s,const char *decision){
 if(!production.cause.candidate)return;
 production_reason_event(s,decision);production.cause.candidate=production.cause.candidate_wall=production.cause.last_growth=0;memset(production.cause.growth,0,sizeof(production.cause.growth));
}
static void production_reason_sample(const ProductionSample *s,int kind,uint64_t delta,int clock_change){
 int continuous=production.have_sample&&production.last.good&&s->good&&production.last.total_good&&s->total_good&&production.last.alarm_good&&s->alarm_good&&s->mono>=production.last.mono&&delta<=2000&&!clock_change&&s->epoch==production.last.epoch&&s->serial==production.last.serial&&!strcmp(s->plc,production.last.plc);
 if(!continuous){
  if(production.cause.episode){production.cause.uncertain=1;production_reason_event(s,"observation_boundary");production_reason_save(&production.last,"interrupted");}
  memset(&production.cause,0,sizeof(production.cause));
 }
 unsigned rising=0;
 if(s->alarm_good){rising=production.cause.baseline?s->cause_mask&~production.cause.previous:0;for(unsigned i=0;i<7;i++)if(rising&(1u<<i))production.cause.rises[i]=s->mono;production.cause.previous=s->cause_mask;production.cause.baseline=1;}
 else return;
 if(!continuous||kind==0)return;
 if(!production.cause.episode&&((production.last_kind==1&&(kind==2||kind==3))||(rising&&(kind==2||kind==3)))){
  production.cause.episode=1;production.cause.start=s->mono;production.cause.first=production.interval;
  production.cause.settled=production.cause.reason=production.cause.uncertain=production.cause.competing=0;production.cause.evidence=0;production.cause.candidate=production.cause.candidate_wall=production.cause.last_growth=0;memset(production.cause.growth,0,sizeof(production.cause.growth));
  if(!production_sql("INSERT INTO material_episodes(start,end,phase,confidence,reason,evidence,plc,first_interval) VALUES(%lld,%lld,'service','candidate','','[]',%Q,%lld)",(sqlite3_int64)s->wall,(sqlite3_int64)s->wall,s->plc,production.interval))return;
  production.cause.id=sqlite3_last_insert_rowid(production.db);production_reason_event(s,"service_started");
 }
 if(!production.cause.episode)return;
 if(!production.cause.settled&&s->mono-production.cause.start<=PROD_CORRELATE_MS){for(unsigned i=0;i<7;i++)if(production.cause.rises[i]&&production.cause.rises[i]+PROD_CORRELATE_MS>=production.cause.start)production.cause.evidence|=1u<<i;}
 if(rising&&production.cause.settled)production.cause.evidence|=rising;
 if((production.cause.evidence&PROD_LINER_MASK)&&(production.cause.evidence&PROD_ROLL_MASK))production.cause.competing=1;
 production.cause.reason=production.cause.competing?0:(production.cause.evidence&PROD_LINER_MASK)?1:(production.cause.evidence&PROD_ROLL_MASK)?2:0;
 if(!production.cause.settled&&s->mono-production.cause.start>=PROD_CORRELATE_MS){production.cause.settled=1;production_reason_event(s,"material_evidence_settled");if(!production.cause.evidence){production_reason_save(s,"unattributed");production_sql("DELETE FROM interval_material WHERE episode=%lld",production.cause.id);production.cause.episode=0;production.cause.candidate=production.cause.candidate_wall=0;return;}}
 if(!production.cause.uncertain&&s->mono-production.cause.start>=PROD_LONG_SERVICE_MS){production.cause.uncertain=1;production_reason_event(s,"long_service_ambiguous");}
 if(production.interval)production_sql("INSERT OR IGNORE INTO interval_material(interval,episode) VALUES(%lld,%lld)",production.interval,production.cause.id);
 int reset=s->total<production.last.total;
 int normal=kind==1&&s->automatic==1&&!s->cause_mask&&!reset;
 if(!normal)production_reason_cancel_start(s,reset?"counter_reset_candidate_cancelled":"trial_start_cancelled");
 else{
  if(!production.cause.candidate){production.cause.candidate=s->mono;production.cause.candidate_wall=s->wall;memset(production.cause.growth,0,sizeof(production.cause.growth));production_reason_event(s,"restart_candidate");}
  uint64_t elapsed=s->mono-production.cause.candidate,bucket=elapsed/10000;
  if(s->total>production.last.total&&s->total_observed!=production.last.total_observed){production.cause.last_growth=s->mono;production.cause.growth[bucket%4]=bucket+1;}
  int sustained=bucket>=3&&production.cause.last_growth&&s->mono-production.cause.last_growth<=5000;
  if(sustained)for(unsigned k=1;k<=3;k++)if(production.cause.growth[(bucket-k)%4]!=bucket-k+1)sustained=0;
  if(elapsed>=PROD_RESTART_MS&&sustained){
   production_reason_event(s,"restart_confirmed_30s_counter_growth");
   production_reason_save(s,"closed");
   production_sql("UPDATE material_episodes SET end=%lld,confirmed_start=%lld WHERE id=%lld",(sqlite3_int64)production.cause.candidate_wall,(sqlite3_int64)production.cause.candidate_wall,production.cause.id);
   production_sql("DELETE FROM interval_material WHERE episode=%lld AND interval IN (SELECT seq FROM intervals WHERE kind='work' AND start>=%lld)",production.cause.id,(sqlite3_int64)production.cause.candidate_wall);
   production.cause.episode=0;production.cause.candidate=production.cause.candidate_wall=0;memset(production.cause.rises,0,sizeof(production.cause.rises));return;
  }
  /* An output-free normal code cannot keep an arbitrarily old tentative
     boundary that a much later burst would retrospectively validate. */
  if(elapsed>=PROD_RESTART_MS)production_reason_cancel_start(s,"counter_growth_not_sustained");
 }
 production_reason_save(s,production.cause.candidate?"starting":"service");
}
static void production_motion_sample(const ProductionSample *s){
 if(!production.interval||!production.have_sample||!s->total_good||!production.last.total_good||s->mono<production.last.mono||s->mono-production.last.mono>2000||llabs((sqlite3_int64)s->wall-(sqlite3_int64)production.last.wall-(sqlite3_int64)(s->mono-production.last.mono))>2000||s->epoch!=production.last.epoch||s->serial!=production.last.serial||strcmp(s->plc,production.last.plc))return;
 int difference=s->total-production.last.total;
 if(s->total_observed==production.last.total_observed&&difference==0)return;
 production_sql("INSERT INTO interval_motion(interval,products,increments,resets) VALUES(%lld,%d,%d,%d) ON CONFLICT(interval) DO UPDATE SET products=products+excluded.products,increments=increments+excluded.increments,resets=resets+excluded.resets",production.interval,difference>0?difference:0,difference>0?1:0,difference<0?1:0);
}
#endif
