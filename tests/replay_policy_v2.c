/* Offline replay of recorded CSV snapshots. Never opens ADS/network sockets. */
#define now_ms platform_clock_ms
#define wall_ms platform_wall_ms
#include "../src/platform.h"
#undef now_ms
#undef wall_ms
static uint64_t replay_mono,replay_wall;
static uint64_t now_ms(void){return replay_mono;}
static uint64_t wall_ms(void){return replay_wall;}
#include "../src/app.h"
#include <assert.h>
static int columns(char *line,char values[][1024],int cap){
 int count=0;char *p=line;
 while(*p&&count<cap){int quoted=*p=='"';if(quoted)p++;unsigned used=0;
  while(*p){if(quoted&&*p=='"'){if(p[1]=='"'){if(used<1023)values[count][used++]='"';p+=2;continue;}p++;break;}if(!quoted&&(*p==';'||*p=='\r'||*p=='\n'))break;if(used<1023)values[count][used++]=*p;p++;}
  values[count++][used]=0;while(*p=='\r'||*p=='\n')p++;if(*p==';'){p++;continue;}break;
 }return count;
}
static int index_of(char names[][1024],int n,const char *key){for(int i=0;i<n;i++)if(!strcmp(names[i],key))return i;fprintf(stderr,"Missing CSV column: %s\n",key);exit(2);}
int main(int argc,char **argv){
 if(argc!=3){fprintf(stderr,"usage: replay_policy_v2 DB_DIRECTORY TRACE.csv\n");return 2;}
 copy_s(app.base,sizeof(app.base),argv[1]);mutex_init(&app.mutex);production_init();if(production.failed){fprintf(stderr,"%s\n",production.error);return 3;}
 FILE *input=fopen(argv[2],"rb");if(!input)return 4;char *line=NULL;size_t capacity=0;char names[64][1024],cells[64][1024];assert(getline(&line,&capacity,input)>0);int n=columns(line,names,64);
 const char *keys[]={"at","mono","epoch","serial","state","automatic","total","total_observed","good","total_good","alarms_good","cause_mask","plc","session"};int idx[14];for(int i=0;i<14;i++)idx[i]=index_of(names,n,keys[i]);
 uint64_t rows=0,gaps=0,previous_mono=0;char session[100]="";
 assert(production_exec("BEGIN IMMEDIATE"));
 while(getline(&line,&capacity,input)>0){if(columns(line,cells,64)!=n){fprintf(stderr,"Malformed CSV row\n");return 5;}ProductionSample s;memset(&s,0,sizeof(s));s.wall=strtoull(cells[idx[0]],NULL,10);s.mono=strtoull(cells[idx[1]],NULL,10);s.epoch=(unsigned)strtoul(cells[idx[2]],NULL,10);s.serial=(unsigned)strtoul(cells[idx[3]],NULL,10);s.code=atoi(cells[idx[4]]);s.automatic=atoi(cells[idx[5]]);s.total=atoi(cells[idx[6]]);s.total_observed=strtoull(cells[idx[7]],NULL,10);s.good=atoi(cells[idx[8]]);s.total_good=atoi(cells[idx[9]]);s.alarm_good=atoi(cells[idx[10]]);s.cause_mask=(unsigned)strtoul(cells[idx[11]],NULL,10);copy_s(s.plc,sizeof(s.plc),cells[idx[12]]);
  if(session[0]&&strcmp(session,cells[idx[13]])){production_reason_sample(&s,0,2001,1);production_close_interval();production.have_sample=production.have_counter=0;gaps++;}copy_s(session,sizeof(session),cells[idx[13]]);
  if(rows&&(s.mono<previous_mono||s.mono-previous_mono>2000))gaps++;
  previous_mono=s.mono;
  for(unsigned i=0;i<7;i++)if(s.cause_mask&(1u<<i))s.alarms[s.alarm_count++]=production_cause_ids[i];
  replay_mono=s.mono;replay_wall=s.wall;production_sample(&s);rows++;
  if(production.failed){fprintf(stderr,"Replay storage failure: %s\n",production.error);return 6;}
  if(rows%10000==0){assert(production_exec("COMMIT"));assert(production_exec("BEGIN IMMEDIATE"));}
 }
 free(line);fclose(input);assert(production_exec("COMMIT"));
 printf("{\"rows\":%llu,\"observedBoundaries\":%llu,\"episodes\":%lld,\"closed\":%lld,\"uncertain\":%lld,\"competing\":%lld,\"counterResets\":%lld,\"positiveProducts\":%lld,\"candidateStarts\":%lld,\"confirmedStarts\":%lld,\"storageError\":false}\n",(unsigned long long)rows,(unsigned long long)gaps,production_scalar("SELECT count(*) FROM material_episodes WHERE reason<>'' OR confidence='competing'"),production_scalar("SELECT count(*) FROM material_episodes WHERE phase='closed'"),production_scalar("SELECT count(*) FROM material_episodes WHERE confidence='uncertain'"),production_scalar("SELECT count(*) FROM material_episodes WHERE confidence='competing'"),production_scalar("SELECT coalesce(sum(resets),0) FROM interval_motion"),production_scalar("SELECT coalesce(sum(products),0) FROM interval_motion"),production_scalar("SELECT count(*) FROM events WHERE kind='reason.v2.phase' AND json_extract(payload,'$.decision')='restart_candidate'"),production_scalar("SELECT count(*) FROM events WHERE kind='reason.v2.phase' AND json_extract(payload,'$.decision')='restart_confirmed_30s_counter_growth'"));production_shutdown();return 0;
}
