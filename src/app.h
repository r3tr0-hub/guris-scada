#ifndef SCADA_APP_H
#define SCADA_APP_H
#include <stdatomic.h>
#include "platform.h"
#include "fields.h"
#include "engineering_catalog.h"
#define FIELD_RAW_BYTES 16
#include "ads.h"
#include "json.h"
#include "local_types.h"
#include "io_types.h"
typedef struct {Meta meta;unsigned char raw[FIELD_RAW_BYTES];double value;uint64_t observed;uint32_t error;int quality,source_index;} Reading;
typedef struct {char id[65],status[24],message[256],utc[40],actor[32];int field,sent,reset,cleaning,command,unwinder,command_explicit;unsigned epoch;double requested,actual,before;uint32_t error;unsigned char expected[FIELD_RAW_BYTES],wanted[FIELD_RAW_BYTES];int has_actual;} Transaction;
#include "control_types.h"
enum { POLL_FAST_MS=100,POLL_FULL_MS=500,POLL_IDLE_MS=25 };
typedef struct {
 Mutex mutex,log_mutex;atomic_int stop,quitting;
 LocalAuth auth;LocalOptions options;Cleaning cleaning;UnwinderGuard unwinder;uint64_t quit_started;char language[20];
 char ip[64],netid[64],base[2048],token[65],url[256],log_path[2400],message[256];
 unsigned tcp_port,ads_port,http_port,config_serial,epoch;unsigned char symbol_version;
 int wanted_connection,connected,ads_status,busy,queue;uint64_t last_poll;
 uint64_t poll_duration,poll_max_duration;unsigned poll_cycles,poll_full_cycles;int poll_sum;
 AlarmSnapshot alarms;CommandLease command;IoView io;
 unsigned char engineering_selected[F_COUNT];uint64_t engineering_until;int engineering_section;
 Reading fields[F_COUNT];Transaction tx,history[32];unsigned history_n;
 unsigned ui_ready_count,ui_document_count,ui_error_count;char ui_error[256];int ui_kiosk;
 FILE *log;
} App;
static App app;
/* Caller holds app.mutex. The core remains on its original schedule. */
static int engineering_requested(int i,uint64_t now){return i<F_ENGINEERING_FIRST||(app.engineering_until>now&&app.engineering_selected[i])||(app.busy&&app.tx.field==i);}
static int engineering_select(Pair *p,int n,char *reason,size_t cap,int engineer){
 const char *id=pair_get(p,n,"section");if(n!=1||!id||p[0].number){copy_s(reason,cap,"Нужен идентификатор раздела");return 400;}
 if(!engineer){copy_s(reason,cap,"Требуется вход инженера");return 403;}
 int selected=-1;for(int k=0;k<ENGINEERING_SECTION_COUNT;k++)if(!strcmp(id,engineering_sections[k].id))selected=k;
 if(*id&&selected<0){copy_s(reason,cap,"Неизвестный инженерный раздел");return 400;}
 lock(&app.mutex);unsigned char wanted[F_COUNT]={0};
 if(selected>=0){const EngineeringSection *section=&engineering_sections[selected];for(unsigned k=0;k<section->count;k++)wanted[section->fields[k]]=1;}
 for(int i=F_ENGINEERING_FIRST;i<F_COUNT;i++)if(wanted[i]&&(!app.engineering_selected[i]||app.engineering_until<=now_ms()))app.fields[i].quality=0;
 memcpy(app.engineering_selected,wanted,sizeof(wanted));app.engineering_until=selected<0?0:now_ms()+5000;app.engineering_section=selected+1;
 unlock(&app.mutex);copy_s(reason,cap,"Раздел выбран");return 200;
}

static FILE *file_open(const char *path,const char *mode){
#ifdef _WIN32
 wchar_t wp[3000],wm[32];if(!MultiByteToWideChar(CP_UTF8,0,path,-1,wp,3000)||!MultiByteToWideChar(CP_UTF8,0,mode,-1,wm,32))return NULL;return _wfopen(wp,wm);
#else
 return fopen(path,mode);
#endif
}
static int make_dir(const char *path){
#ifdef _WIN32
 wchar_t p[3000];if(!MultiByteToWideChar(CP_UTF8,0,path,-1,p,3000))return 0;return CreateDirectoryW(p,NULL)||GetLastError()==ERROR_ALREADY_EXISTS;
#else
 return mkdir(path,0700)==0||errno==EEXIST;
#endif
}
static void path_join(char out[2400],const char *rel){snprintf(out,2400,"%s/%s",app.base,rel);}
#include "local.h"
#include "production_queue.h"
static void cleaning_transaction_done(const Transaction *tx);
static void unwinder_transaction_done(const Transaction *tx);
static int cleaning_live_ready(Ads *c,Meta *metas);
static int manual_ready(uint64_t now);
static int enqueue_counter_command(Pair*,int,char*,size_t,int);
static int decode_value(const FieldDef *d,const unsigned char *raw,double *out){
 double v=0;switch(d->type){case T_BOOL:{int index=field_source_index(d);if(raw[index]>1)return 0;v=raw[index];}break;
 case T_INT:{uint16_t x=u16(raw);v=(int32_t)x-((x&0x8000)?65536:0);break;}
 case T_DINT:{uint32_t x=u32(raw);v=(int64_t)x-((x&0x80000000u)?INT64_C(4294967296):0);break;}
 case T_REAL:{uint32_t x=u32(raw);float f;memcpy(&f,&x,4);v=f;break;}
 case T_TIME:v=u32(raw);break;
 case T_HEX12:{uint64_t x=0;if(!raw[0]){v=0;break;}if(raw[12])return 0;for(int k=0;k<12;k++){unsigned char ch=raw[k];int h=ch>='0'&&ch<='9'?ch-'0':ch>='A'&&ch<='F'?ch-'A'+10:ch>='a'&&ch<='f'?ch-'a'+10:-1;if(h<0)return 0;x=(x<<4)|(unsigned)h;}v=(double)x;break;}
 case T_LREAL:{uint64_t x=(uint64_t)u32(raw)|((uint64_t)u32(raw+4)<<32);memcpy(&v,&x,8);break;}}
 if(!isfinite(v))return 0;
 *out=v*d->scale;return isfinite(*out);
}
static int encode_value(const FieldDef *d,double v,unsigned char *raw){
 if(!isfinite(v)||v<d->min-1e-9||v>d->max+1e-9||(d->integer&&floor(v)!=v))return 0;
 memset(raw,0,d->bytes);v/=d->scale;
 switch(d->type){case T_BOOL:if(v!=0&&v!=1)return 0;raw[0]=(unsigned char)v;return 1;
 case T_INT:if(v<-32768||v>32767||floor(v)!=v)return 0;put16(raw,(uint16_t)(int16_t)v);return 1;
 case T_DINT:if(v<-2147483648.0||v>2147483647.0||floor(v)!=v)return 0;put32(raw,(uint32_t)(int32_t)v);return 1;
 case T_REAL:{float f=(float)v;uint32_t x;if(!isfinite(f))return 0;memcpy(&x,&f,4);put32(raw,x);return 1;}
 case T_LREAL:{uint64_t x;memcpy(&x,&v,8);put32(raw,(uint32_t)x);put32(raw+4,(uint32_t)(x>>32));return 1;}
 case T_TIME:if(v<0||v>4294967295.0||floor(v)!=v)return 0;put32(raw,(uint32_t)v);return 1;
 case T_HEX12:{if(v<0||v>281474976710655.0||floor(v)!=v)return 0;uint64_t x=(uint64_t)v;static const char h[]="0123456789ABCDEF";for(int k=11;k>=0;k--){raw[k]=(unsigned char)h[x&15];x>>=4;}raw[12]=0;return 1;}
 default:return 0;}
}
static int metadata_type_matches(int i,const Meta *m){
 if(field_source_index(&defs[i]))return !defs[i].writable&&m->size==5&&m->data_type==33&&same_ascii(m->type,"ARRAY [0..4] OF BOOL");
 static const uint32_t ads_types[]={33,2,3,4,5,19,30};
 static const char *aliases[]={"BOOL","INT16","INT32","REAL32","REAL64","TIME","STRING(12)"};FieldType t=defs[i].type;
 return m->size==defs[i].bytes&&m->data_type==ads_types[t]&&(same_ascii(m->type,type_name(t))||same_ascii(m->type,aliases[t]));
}
static int metadata_matches(int i,const Meta *m){return m->valid&&metadata_type_matches(i,m)&&!(m->flags&6u);}
static void csv_text(FILE *f,const char *s){fputc('"',f);for(;*s;s++){if(*s=='"')fputc('"',f);fputc((unsigned char)*s,f);}fputc('"',f);}
static void audit(const Transaction *tx){
 lock(&app.log_mutex);if(app.log){char n[64];csv_text(app.log,tx->utc);fputc(';',app.log);csv_text(app.log,tx->id);fputc(';',app.log);csv_text(app.log,defs[tx->field].key);fputc(';',app.log);csv_text(app.log,tx->status);fputc(';',app.log);
 snprintf(n,sizeof(n),"%.17g",tx->before);csv_text(app.log,n);fputc(';',app.log);snprintf(n,sizeof(n),"%.17g",tx->requested);csv_text(app.log,n);fputc(';',app.log);
 if(tx->has_actual)snprintf(n,sizeof(n),"%.17g",tx->actual);else n[0]=0;csv_text(app.log,n);fputc(';',app.log);snprintf(n,sizeof(n),"0x%08X",tx->error);csv_text(app.log,n);fputc(';',app.log);csv_text(app.log,tx->message);fputc(';',app.log);csv_text(app.log,tx->actor);fputs("\r\n",app.log);fflush(app.log);}unlock(&app.log_mutex);
}
static void transaction_finish(Transaction *tx,const char *status,const char *message){
 copy_s(tx->status,sizeof(tx->status),status);copy_s(tx->message,sizeof(tx->message),message);utc_stamp(tx->utc);
 lock(&app.mutex);app.tx=*tx;app.busy=0;app.queue=0;
 if(app.history_n==32){memmove(app.history,app.history+1,31*sizeof(Transaction));app.history_n=31;}app.history[app.history_n++]=*tx;unlock(&app.mutex);audit(tx);cleaning_transaction_done(tx);unwinder_transaction_done(tx);
}
static void offline(const char *message){lock(&app.mutex);app.command.desired=0;app.alarms.quality=0;app.connected=0;app.ads_status=0;copy_s(app.message,sizeof(app.message),message);for(int i=0;i<F_COUNT;i++)app.fields[i].quality=0;unlock(&app.mutex);production_capture();}
static int publish_one(int i,const Meta *m,const unsigned char *raw,uint32_t error){
 Reading v;memset(&v,0,sizeof(v));v.meta=*m;v.error=error;v.observed=now_ms();memcpy(v.raw,raw,defs[i].bytes);v.quality=!error&&decode_value(&defs[i],raw,&v.value);
 lock(&app.mutex);app.fields[i]=v;unlock(&app.mutex);if(i==F_TOTAL)production_capture();return v.quality;
}
static int fresh_read(Ads *c,int i,const Meta *m,unsigned char *raw){memset(raw,0,m->size);int r=ads_read(c,m->group,m->offset,m->size,raw);if(r==1)publish_one(i,m,raw,0);return r;}
/* Caller holds app.mutex. Missing, stale or reassigned slots are not bindings. */
static int binding_ready(int i,uint64_t now){
 int lo,hi,p=field_presence(i,&lo,&hi);if(p>=0){Reading *v=&app.fields[p];if(!v->quality||now-v->observed>1500||!field_presence_matches(p,v->value,lo,hi))return 0;}
 int expected=0,id=field_identity(i,&expected);if(id<0)return 1;
 Reading *r=&app.fields[id];return r->quality&&now-r->observed<=1500&&r->value==expected;
}
static void field_bounds(int i,double width,double *min,double *max){
 *min=defs[i].min;*max=defs[i].max;
 int lo=field_lower_limit(i),hi=field_upper_limit(i);if(lo>=0)*min=app.fields[lo].value;if(hi>=0)*max=fmin(*max,app.fields[hi].value);
 if(field_width_limited(i)){*max=fmin(*max,width);if(i==F_GLUE_START_OFFSET)*min=fmax(*min,-width);}
}
static int range_ready(int i,uint64_t now){
 int bounds[]={field_lower_limit(i),field_upper_limit(i)};for(int k=0;k<2;k++)if(bounds[k]>=0){Reading *r=&app.fields[bounds[k]];if(!r->quality||now-r->observed>1500||r->value<0)return 0;}
 Reading *w=&app.fields[F_WORK_LENGTH];return !field_width_limited(i)||(w->quality&&now-w->observed<=1500&&w->value>=1&&w->value<=100000);
}
static int binding_live_ready(Ads *c,Meta *metas,int i){
 int lo,hi,p=field_presence(i,&lo,&hi);if(p>=0){unsigned char b[8];double v;if(!metas[p].valid||fresh_read(c,p,&metas[p],b)!=1||!decode_value(&defs[p],b,&v)||!field_presence_matches(p,v,lo,hi))return 0;}
 int expected=0,id=field_identity(i,&expected);if(id<0)return 1;
 Meta fresh;unsigned char raw[FIELD_RAW_BYTES];double value;
 return metas[id].valid&&ads_lookup(c,defs[id].symbol,&fresh)==1&&metadata_matches(id,&fresh)&&fresh.group==metas[id].group&&fresh.offset==metas[id].offset&&fresh_read(c,id,&fresh,raw)==1&&decode_value(&defs[id],raw,&value)&&value==expected;
}
/* TouchProbePencere owns this offset while learning from Axis_Merdane1. */
static int photo_offset_ready(uint64_t now){Reading *r=&app.fields[F_CMD_PHOTO_RESET];return app.connected&&r->quality&&now-r->observed<=1500&&r->value==0;}
static int fast_field(int i){return i==F_CURRENT||i==F_GROUPS||i==F_TOTAL||i==F_STATE||i==F_AUTO||i==F_CMD_PHOTO_RESET||i==F_PHOTO_OFFSET_TENTHS;}
#include "derived.h"
static int coherent_poll(Ads *c,Meta *m,unsigned char version,int full){
 uint64_t started=now_ms();
 unsigned char before,after;if(ads_version(c,&before)!=1||before!=version)return 0;
 int ids[F_COUNT];unsigned count=0;lock(&app.mutex);for(int i=0;i<F_COUNT;i++)if(engineering_requested(i,started)&&!field_virtual(i)&&m[i].valid&&(full||fast_field(i)))ids[count++]=i;unlock(&app.mutex);
 unsigned char raw[F_COUNT][FIELD_RAW_BYTES];memset(raw,0,sizeof(raw));uint32_t errors[F_COUNT]={0};
 int rc=1;
 /* The ADS SUM protocol builder accepts at most 64 entries. Publish only after all chunks and the final version check. */
 if(c->sum)for(unsigned at=0;at<count;at+=64){unsigned n=count-at;if(n>64)n=64;rc=ads_sum(c,m,ids+at,n,raw,errors+at);if(rc!=1)break;}
 else rc=-1;
 if(c->sum&&rc==-1&&(c->error==0x701||c->error==0x702)){c->sum=0;rc=-1;}
 if(!c->sum){rc=1;for(unsigned k=0;k<count;k++){int i=ids[k];int z=ads_read(c,m[i].group,m[i].offset,m[i].size,raw[i]);if(!z){rc=0;break;}errors[k]=z==1?0:c->error;}}
 if(rc!=1)return 0;
 Reading dancers[2];AlarmSnapshot alarms;
 if(full){uint32_t byfield[F_COUNT];for(int i=0;i<F_COUNT;i++)byfield[i]=0xffffffffu;for(unsigned k=0;k<count;k++)byfield[ids[k]]=errors[k];
  if(!poll_dancers(c,m,raw,byfield,dancers)||!poll_alarms(c,&alarms))return 0;
 }
 if(ads_version(c,&after)!=1||after!=before)return 0;
 uint64_t at=now_ms();lock(&app.mutex);
 for(unsigned k=0;k<count;k++){int i=ids[k];Reading *v=&app.fields[i];v->meta=m[i];memcpy(v->raw,raw[i],defs[i].bytes);v->error=errors[k];v->observed=at;v->quality=!errors[k]&&decode_value(&defs[i],v->raw,&v->value);}
 if(full){app.fields[F_DANCER1]=dancers[0];app.fields[F_DANCER2]=dancers[1];app.alarms=alarms;}
 unsigned good=0,total=0;for(int i=0;i<F_COUNT;i++)if(engineering_requested(i,at)){total++;if(app.fields[i].quality&&at-app.fields[i].observed<=1500&&binding_ready(i,at))good++;}
 app.last_poll=at;app.connected=1;
 app.poll_duration=at-started;if(app.poll_duration>app.poll_max_duration)app.poll_max_duration=app.poll_duration;
 app.poll_cycles++;if(full)app.poll_full_cycles++;app.poll_sum=c->sum;
 if(good==total)copy_s(app.message,sizeof(app.message),"Данные получены из ПЛК");
 else snprintf(app.message,sizeof(app.message),"Данные ПЛК: доступны %u из %u параметров",good,total);
 unlock(&app.mutex);production_capture();return 1;
}
static int version_current(Ads *c,unsigned char v){unsigned char got;return ads_version(c,&got)==1&&got==v;}
static int reset_counter(int i){return i==F_CURRENT||i==F_GROUPS||i==F_TOTAL;}
static const char *counter_command_key(int i){return i==F_CURRENT?"currentReset":i==F_GROUPS?"groupsReset":"totalReset";}
/* Caller holds app.mutex. Special unwinder and bulk/manual policies use fresh stopped-state readings. */
static int engineering_ready(uint64_t now){
 Reading *s=&app.fields[F_STATE],*a=&app.fields[F_AUTO];
 return app.connected&&app.ads_status==5&&s->quality&&a->quality&&now-s->observed<=1500&&now-a->observed<=1500&&(s->value==5||s->value==9)&&a->value==0;
}
static int engineering_live_ready(Ads *c,Meta *metas){
 unsigned char state[8],automatic[8];double s,a;
 return metas[F_STATE].valid&&metas[F_AUTO].valid&&fresh_read(c,F_STATE,&metas[F_STATE],state)==1&&fresh_read(c,F_AUTO,&metas[F_AUTO],automatic)==1&&decode_value(&defs[F_STATE],state,&s)&&decode_value(&defs[F_AUTO],automatic,&a)&&(s==5||s==9)&&a==0;
}
static void process_write(Ads *c,Meta *metas,unsigned char version,Transaction tx){
 int i=tx.field;Meta *m=&metas[i];unsigned char live[FIELD_RAW_BYTES]={0};char msg[256];unsigned state;
 if(atomic_load(&app.stop)){transaction_finish(&tx,"cancelled","Запись отменена до отправки");return;}
 if(ads_state(c,&state)!=1||!version_current(c,version)){transaction_finish(&tx,"rejected","Сессия ПЛК изменилась. Откройте ввод заново");ads_close(c);return;}
 if(state!=5){transaction_finish(&tx,"rejected","ПЛК не находится в режиме RUN");return;}
 Meta fresh;if(ads_lookup(c,defs[i].symbol,&fresh)!=1||!metadata_matches(i,&fresh)||fresh.group!=m->group||fresh.offset!=m->offset||fresh.size!=m->size){transaction_finish(&tx,"rejected","Изменилось описание параметра ПЛК. Откройте ввод заново");ads_close(c);return;}
 *m=fresh;
 if(fresh.flags&32u){transaction_finish(&tx,"rejected","ПЛК объявил параметр доступным только для чтения");return;}
 if((field_engineer(i)&&strcmp(tx.actor,"local-engineer"))||(field_stopped(i)&&!engineering_live_ready(c,metas))){transaction_finish(&tx,"rejected","Для инженерной настройки остановите станок и войдите как инженер");return;}
 if(i==F_UNWINDER_SENSOR){lock(&app.mutex);int pending=app.unwinder.mode!=UNWINDER_NORMAL;unlock(&app.mutex);if(pending){transaction_finish(&tx,"rejected","Сначала восстановите контроль размотчика");return;}}
 if(!binding_live_ready(c,metas,i)){transaction_finish(&tx,"rejected","Назначение канала HMI изменилось или недоступно. Запись заблокирована");return;}
 if(i==F_PHOTO_OFFSET_TENTHS){unsigned char teach[8];if(!metas[F_CMD_PHOTO_RESET].valid||fresh_read(c,F_CMD_PHOTO_RESET,&metas[F_CMD_PHOTO_RESET],teach)!=1||teach[0]!=0){transaction_finish(&tx,"rejected","Завершите обучение фотометки перед ручной коррекцией смещения");return;}}
 {
  int limit[]={field_lower_limit(i),field_upper_limit(i),field_width_limited(i)?F_WORK_LENGTH:-1};
  for(int k=0;k<3;k++)if(limit[k]>=0){unsigned char raw[8];if(!metas[limit[k]].valid||fresh_read(c,limit[k],&metas[limit[k]],raw)!=1){transaction_finish(&tx,"rejected","Текущие пределы HMI недоступны");return;}}
  lock(&app.mutex);double lo,hi;field_bounds(i,app.fields[F_WORK_LENGTH].value,&lo,&hi);int valid=tx.cleaning==1?(i==F_IDLE&&tx.requested==45):(range_ready(i,now_ms())&&tx.requested>=lo&&tx.requested<=hi);unlock(&app.mutex);
  if(!valid){transaction_finish(&tx,"rejected","Значение вышло за текущие пределы HMI");return;}
 }

 if(i==F_IDLE&&tx.cleaning!=2&&strcmp(tx.actor,"local-engineer")&&!cleaning_live_ready(c,metas)){transaction_finish(&tx,"rejected","Холостая скорость доступна только в состоянии «Машина не готова» при выключенном автоматическом режиме");return;}
 if(tx.unwinder==3&&(strcmp(tx.actor,"local-engineer")||!engineering_live_ready(c,metas))){transaction_finish(&tx,"rejected","Для бессрочного отключения остановите станок и войдите инженером");return;}
 if(tx.reset&&(!reset_counter(i)||tx.requested!=0||!engineering_live_ready(c,metas))){transaction_finish(&tx,"rejected","Обнуление доступно только на остановленном готовом станке");return;}
 if(defs[i].gate>=0){int gate=defs[i].gate;unsigned char g[8];if(!metas[gate].valid||fresh_read(c,gate,&metas[gate],g)!=1||g[0]!=1){transaction_finish(&tx,"rejected","Сначала включите режим, к которому относится параметр");return;}}
 if(i==F_SPEED||i==F_WAIT){
  int limit_field=i==F_SPEED?F_SPEED_LIMIT:F_WAIT_LIMIT;unsigned char b[8];double lim;
  if(!metas[limit_field].valid||fresh_read(c,limit_field,&metas[limit_field],b)!=1||!decode_value(&defs[limit_field],b,&lim)||(i==F_SPEED?lim<=0:lim<0)){
   transaction_finish(&tx,"rejected","Текущее ограничение ПЛК недоступно. Запись не отправлена");return;
  }
  if(tx.requested>lim){snprintf(msg,sizeof(msg),"Предел %s ПЛК: %.3g",i==F_SPEED?"скорости":"холостых ударов",lim);transaction_finish(&tx,"rejected",msg);return;}
 }
 if(fresh_read(c,i,m,live)!=1){transaction_finish(&tx,"rejected","Не удалось прочитать текущее значение перед записью");return;}
 if(!decode_value(&defs[i],live,&tx.before)){transaction_finish(&tx,"rejected","ПЛК вернул недопустимое текущее значение");return;}
 tx.actual=tx.before;tx.has_actual=1;
 if(memcmp(live,tx.expected,defs[i].bytes)){transaction_finish(&tx,"conflict","Значение изменилось в ПЛК. Откройте ввод заново");return;}
 if(!memcmp(live,tx.wanted,defs[i].bytes)){if(tx.cleaning==2||tx.unwinder==2){pause_ms(60);if(fresh_read(c,i,m,live)!=1||memcmp(live,tx.wanted,defs[i].bytes)||!version_current(c,version)){transaction_finish(&tx,"uncertain","Повторное чтение скорости 10 не подтверждено");return;}}transaction_finish(&tx,"confirmed","Это значение уже установлено в ПЛК");return;}
 if(!version_current(c,version)){transaction_finish(&tx,"rejected","Описание ПЛК изменилось до записи");ads_close(c);return;}
 lock(&app.mutex);int same_epoch=app.epoch==tx.epoch;unlock(&app.mutex);
 if(!same_epoch||atomic_load(&app.stop)){transaction_finish(&tx,"cancelled","Сессия изменилась до отправки записи");return;}
 if(tx.cleaning==1){lock(&app.mutex);int allowed=app.cleaning.active&&app.cleaning.deadline>now_ms()&&!atomic_load(&app.quitting);unlock(&app.mutex);if(!allowed){transaction_finish(&tx,"cancelled","Ускорение отменено до отправки");return;}}
 if(tx.unwinder&&tx.unwinder!=2){lock(&app.mutex);int allowed=!atomic_load(&app.quitting)&&(tx.unwinder==3?app.unwinder.mode==UNWINDER_OFF:app.unwinder.mode==UNWINDER_TEMP&&app.unwinder.deadline>now_ms());unlock(&app.mutex);if(!allowed){transaction_finish(&tx,"cancelled","Отключение размотчика отменено до отправки");return;}}
 tx.sent=1;lock(&app.mutex);copy_s(app.tx.status,sizeof(app.tx.status),"verifying");app.tx.sent=1;unlock(&app.mutex);
 int ack=ads_write_field(c,&fresh,tx.wanted,defs[i].bytes,defs[i].writable||(tx.reset&&reset_counter(i)&&tx.requested==0));
 if(ack==-1){tx.error=c->error;snprintf(msg,sizeof(msg),"ADS отклонил запись: 0x%08X",tx.error);transaction_finish(&tx,"rejected",msg);return;}
 if(!ack){transaction_finish(&tx,"uncertain","Ответ на запись не получен. Результат неизвестен; повторной отправки нет");offline("Связь потеряна во время записи");return;}
 uint64_t deadline=now_ms()+2500;unsigned equal=0;unsigned char previous[FIELD_RAW_BYTES]={0};unsigned stable_other=0;int read_ok=0;
 while(now_ms()<deadline&&!atomic_load(&app.stop)){
  if(!version_current(c,version)||fresh_read(c,i,&fresh,live)!=1||!version_current(c,version)){transaction_finish(&tx,"uncertain","Запись отправлена, но обратное чтение не завершено. Проверьте значение после восстановления связи");ads_close(c);offline("Не удалось подтвердить запись");return;}
  if(tx.reset&&(!engineering_live_ready(c,metas)||!version_current(c,version))){transaction_finish(&tx,"uncertain","Обнуление отправлено, но состояние станка изменилось. Проверьте фактический счётчик");return;}
  if(!decode_value(&defs[i],live,&tx.actual)){tx.has_actual=0;transaction_finish(&tx,"uncertain","После записи получено недопустимое значение ПЛК");return;}
  read_ok=1;tx.has_actual=1;
  int target=!memcmp(live,tx.wanted,defs[i].bytes);
  if(i==F_OFFSET&&target&&metas[F_OFFSET_DISPLAY].valid){unsigned char display[8];double actual_display,stored_display;if(fresh_read(c,F_OFFSET_DISPLAY,&metas[F_OFFSET_DISPLAY],display)!=1||!decode_value(&defs[F_OFFSET_DISPLAY],display,&actual_display)||!decode_value(&defs[i],live,&stored_display)){transaction_finish(&tx,"uncertain","Не удалось прочитать показание тонкой настройки");return;}target=fabs(actual_display-stored_display)<0.00001;}
  equal=target?equal+1:0;
  if(equal>=2){transaction_finish(&tx,"confirmed",tx.reset?"ПЛК подтвердил обнуление счётчика":"ПЛК подтвердил значение обратным чтением");return;}
  if(!target&&memcmp(live,tx.expected,defs[i].bytes)){
   stable_other=!memcmp(live,previous,defs[i].bytes)?stable_other+1:0;
   if(stable_other>=3){snprintf(msg,sizeof(msg),"ПЛК вернул другое значение: %.9g",tx.actual);transaction_finish(&tx,"different",msg);return;}
  }else stable_other=0;
  memcpy(previous,live,defs[i].bytes);pause_ms(60);
 }
 if(atomic_load(&app.stop))transaction_finish(&tx,"uncertain","Программа закрывается; запись отправлена, подтверждение не завершено");
 else if(read_ok)transaction_finish(&tx,"not_applied","ПЛК не сохранил запрошенное значение. Показано фактическое значение");
 else transaction_finish(&tx,"uncertain","Нет свежего обратного чтения после записи");
}
#include "cleaning.h"
#include "commands.h"
#include "unwinder.h"
#include "io_monitor.h"
#include "production.h"
static void worker_run(void){
 Ads c;memset(&c,0,sizeof(c));c.socket=BAD_SOCKET;Meta metas[F_COUNT];memset(metas,0,sizeof(metas));unsigned serial=0;unsigned char version=0;uint64_t retry=0,last_state=0,next_full=0;
 while(!atomic_load(&app.stop)){
  command_service(&c,metas,version);unwinder_service();cleaning_service();if(atomic_load(&app.stop))break;
  char ip[64],net[64];unsigned tp,ap,wanted,cs;Transaction tx;int pending=0;
  lock(&app.mutex);copy_s(ip,sizeof(ip),app.ip);copy_s(net,sizeof(net),app.netid);tp=app.tcp_port;ap=app.ads_port;wanted=app.wanted_connection;cs=app.config_serial;if(app.queue){tx=app.tx;app.queue=0;pending=1;}unlock(&app.mutex);
  if(serial!=cs){ads_close(&c);memset(metas,0,sizeof(metas));serial=cs;retry=0;next_full=0;offline(wanted?"Подключение к ПЛК…":"Соединение отключено");}
  if(pending){if(c.socket==BAD_SOCKET)transaction_finish(&tx,"rejected","Связь отсутствует; запись не отправлена");else if(tx.command)process_command(&c,metas,version,tx);else process_write(&c,metas,version,tx);next_full=0;}
  if(!wanted){pause_ms(100);continue;}
  if(c.socket==BAD_SOCKET){
   if(now_ms()<retry){pause_ms(100);continue;}retry=now_ms()+2000;
   if(!ads_open(&c,ip,net,(uint16_t)tp,(uint16_t)ap)){offline("Нет связи с ПЛК. Проверьте сеть и настройки подключения");continue;}
   unsigned st;if(ads_state(&c,&st)!=1||ads_version(&c,&version)!=1){ads_close(&c);offline("ADS не отвечает. Проверьте AMS Net ID и маршрут");continue;}
   lock(&app.mutex);app.epoch++;app.symbol_version=version;app.ads_status=(int)st;for(int i=0;i<F_COUNT;i++)app.fields[i].quality=0;unlock(&app.mutex);
   memset(metas,0,sizeof(metas));
   for(int i=0;i<F_ENGINEERING_FIRST&&!atomic_load(&app.stop);i++){
    if(field_virtual(i))continue;
    int rc=ads_lookup(&c,defs[i].symbol,&metas[i]);
    if(rc==1&&!metadata_matches(i,&metas[i])){metas[i].resolution=metadata_type_matches(i,&metas[i])?META_UNSUPPORTED_FLAGS:META_TYPE_MISMATCH;metas[i].valid=0;}
    lock(&app.mutex);app.fields[i].meta=metas[i];app.fields[i].error=metas[i].valid?0:0xffffffffu;unlock(&app.mutex);
    if(!rc)break;
   }
   if(atomic_load(&app.stop))break;
   if(c.socket==BAD_SOCKET||!version_current(&c,version)){ads_close(&c);offline("Не удалось получить согласованное описание параметров");continue;}
   resolve_arrays(&c);
   last_state=0;next_full=0;
  }
  if(now_ms()-last_state>=1500){unsigned st;if(ads_state(&c,&st)!=1){ads_close(&c);offline("Связь с ADS потеряна");continue;}lock(&app.mutex);app.ads_status=(int)st;unlock(&app.mutex);last_state=now_ms();}
  if(atomic_load(&app.stop))break;
  uint64_t started=now_ms();int full=started>=next_full;

  if(!coherent_poll(&c,metas,version,full)){ads_close(&c);offline("Связь или версия символов изменилась. Подключаемся заново");continue;}
  if(full)next_full=started+POLL_FULL_MS;
  unwinder_service();cleaning_service();
  for(int i=F_ENGINEERING_FIRST,budget=4;i<F_COUNT&&budget>0;i++){
   lock(&app.mutex);int selected=engineering_requested(i,now_ms());unlock(&app.mutex);
   if(!selected||metas[i].resolution!=META_UNRESOLVED)continue;
   budget--;int rc=ads_lookup(&c,defs[i].symbol,&metas[i]);
   if(rc==1&&!metadata_matches(i,&metas[i])){metas[i].resolution=metadata_type_matches(i,&metas[i])?META_UNSUPPORTED_FLAGS:META_TYPE_MISMATCH;metas[i].valid=0;}
   lock(&app.mutex);app.fields[i].meta=metas[i];app.fields[i].error=metas[i].valid?0:0xffffffffu;unlock(&app.mutex);
   if(!rc)break;
  }
  if(!io_service(&c,version)){ads_close(&c);offline("Связь изменилась во время диагностики I/O");continue;}
  /* One sequential ADS cycle at a time. Skip missed ticks and leave a gap if the PLC is slow. */
  uint64_t until=started+POLL_FAST_MS,earliest=now_ms()+POLL_IDLE_MS;if(until<earliest)until=earliest;
  while(!atomic_load(&app.stop)){uint64_t now=now_ms();if(now>=until)break;lock(&app.mutex);int wake=app.queue||app.config_serial!=serial;unlock(&app.mutex);if(wake)break;uint64_t remaining=until-now;if(remaining>10)remaining=10;pause_ms((unsigned)remaining);}
 }
 ads_close(&c);
}
static int enqueue_transaction(Pair *pairs,int count,char *reason,size_t cap,int reset,int engineer){
 const char *id=pair_get(pairs,count,"id"),*key=pair_get(pairs,count,"key"),*value=reset?"0":pair_get(pairs,count,"value"),*expected=pair_get(pairs,count,"expected"),*ep=pair_get(pairs,count,"epoch");double v,epoch_d;
 int i=key?field_index(key):-1;
 if(!reset&&i==F_UNWINDER_STOP){copy_s(reason,cap,"Используйте временное или инженерное отключение размотчика");return 400;}
 if(!reset&&i>=0&&field_engineer(i)&&!engineer){copy_s(reason,cap,"Требуется вход инженера");return 403;}
 if(count!=(reset?4:5)||(reset&&pair_get(pairs,count,"value"))||!id||strlen(id)<8||strlen(id)>64||i<0||(reset?!reset_counter(i):!defs[i].writable)||!number_parse(value,&v)||!number_parse(ep,&epoch_d)||epoch_d<0||epoch_d>UINT32_MAX||floor(epoch_d)!=epoch_d){copy_s(reason,cap,"Некорректный запрос или параметр недоступен для записи");return 400;}
 for(const char *p=id;*p;p++)if(!((*p>='0'&&*p<='9')||(*p>='a'&&*p<='z')||(*p>='A'&&*p<='Z')||*p=='-'||*p=='_')){copy_s(reason,cap,"Некорректный номер операции");return 400;}
 Transaction t;memset(&t,0,sizeof(t));t.field=i;t.reset=reset;copy_s(t.actor,32,engineer?"local-engineer":"local-operator");t.requested=v;t.epoch=(unsigned)epoch_d;copy_s(t.id,sizeof(t.id),id);copy_s(t.status,sizeof(t.status),"queued");
 if(!hex_raw(expected,defs[i].bytes,t.expected)||!encode_value(&defs[i],v,t.wanted)){snprintf(reason,cap,"Допустимый диапазон: %.9g…%.9g",defs[i].min,defs[i].max);return 422;}
 lock(&app.mutex);
 if(!strcmp(app.tx.id,id)){int same=app.tx.field==i&&app.tx.reset==t.reset&&app.tx.epoch==t.epoch&&!memcmp(app.tx.wanted,t.wanted,defs[i].bytes);unlock(&app.mutex);copy_s(reason,cap,same?"Операция уже зарегистрирована":"Номер операции уже использован");return same?202:409;}
 for(unsigned k=0;k<app.history_n;k++)if(!strcmp(app.history[k].id,id)){unlock(&app.mutex);copy_s(reason,cap,"Операция уже выполнена; повторной отправки нет");return 409;}
 if(app.busy||app.command.owned||app.cleaning.restoring||app.unwinder.mode==UNWINDER_RESTORE||atomic_load(&app.quitting)){unlock(&app.mutex);copy_s(reason,cap,"Дождитесь подтверждения записи или возврата скорости 10");return 409;}
 if(i==F_UNWINDER_SENSOR&&app.unwinder.mode!=UNWINDER_NORMAL){unlock(&app.mutex);copy_s(reason,cap,"Сначала восстановите контроль размотчика");return 409;}
 if(i==F_IDLE&&app.cleaning.pending){unlock(&app.mutex);copy_s(reason,cap,"Используйте кнопку «Вернуть 10», чтобы завершить таймер");return 409;}
 if(i==F_IDLE&&!engineer&&!cleaning_can_boost(now_ms())){unlock(&app.mutex);copy_s(reason,cap,"Холостая скорость доступна только в состоянии «Машина не готова» при выключенном автоматическом режиме");return 409;}
 Reading *r=&app.fields[i];int gate=defs[i].gate;
 if(!app.connected||app.ads_status!=5||app.epoch!=t.epoch||!r->quality||now_ms()-r->observed>1500){unlock(&app.mutex);copy_s(reason,cap,"Нет свежих данных ПЛК. Запись не отправлена");return 409;}
 if(reset&&(!engineering_ready(now_ms())||!r->meta.valid||(r->meta.flags&32u))){unlock(&app.mutex);copy_s(reason,cap,"Остановите станок и дождитесь готовности перед обнулением");return 409;}
 if(field_stopped(i)&&!engineering_ready(now_ms())){unlock(&app.mutex);copy_s(reason,cap,"Остановите станок перед инженерной настройкой");return 409;}
 if(!binding_ready(i,now_ms())){unlock(&app.mutex);copy_s(reason,cap,"Назначение канала HMI изменилось или недоступно. Запись заблокирована");return 409;}
 if(i==F_PHOTO_OFFSET_TENTHS&&!photo_offset_ready(now_ms())){unlock(&app.mutex);copy_s(reason,cap,"Завершите обучение фотометки перед ручной коррекцией смещения");return 409;}
 if(!range_ready(i,now_ms())){unlock(&app.mutex);copy_s(reason,cap,"Ширина пакета недоступна. Запись не отправлена");return 409;}
 double lo,hi;field_bounds(i,app.fields[F_WORK_LENGTH].value,&lo,&hi);
 if(v<lo||v>hi){unlock(&app.mutex);snprintf(reason,cap,"Допустимый диапазон по текущей ширине: %.9g…%.9g",lo,hi);return 422;}
 if(memcmp(r->raw,t.expected,defs[i].bytes)){unlock(&app.mutex);copy_s(reason,cap,"Значение изменилось. Откройте ввод заново");return 409;}
 if(gate>=0&&(!app.fields[gate].quality||now_ms()-app.fields[gate].observed>1500||app.fields[gate].value!=1)){unlock(&app.mutex);copy_s(reason,cap,"Сначала включите соответствующий режим");return 409;}
 t.before=r->value;app.tx=t;app.queue=1;app.busy=1;unlock(&app.mutex);copy_s(reason,cap,"Запись поставлена в очередь; ожидаем ПЛК");return 202;
}
static int enqueue_write(Pair *pairs,int count,char *reason,size_t cap,int engineer){return enqueue_transaction(pairs,count,reason,cap,0,engineer);}
static int enqueue_counter_reset(Pair *pairs,int count,char *reason,size_t cap,int engineer){return enqueue_counter_command(pairs,count,reason,cap,engineer);}
static void tx_json(Buffer *b,const Transaction *t){bf(b,"{\"id\":");bj(b,t->id);bf(b,",\"key\":");bj(b,t->field>=0&&t->field<F_COUNT?defs[t->field].key:"");bf(b,",\"kind\":");bj(b,t->reset?"counter_reset":t->cleaning==1?"cleaning_boost":t->cleaning==2?"cleaning_normal":t->command?"command":"setting");bf(b,",\"status\":");bj(b,t->status);bf(b,",\"message\":");bj(b,t->message);bf(b,",\"before\":%.17g,\"requested\":%.17g,\"sent\":%s,\"epoch\":%u,\"actual\":",t->before,t->requested,t->sent?"true":"false",t->epoch);if(t->has_actual)bf(b,"%.17g",t->actual);else bf(b,"null");bf(b,",\"utc\":");bj(b,t->utc);bf(b,",\"actor\":");bj(b,t->actor);bf(b,"}");}
static size_t state_json(char *out,size_t cap,int engineer){
 Buffer b;binit(&b,out,cap);lock(&app.mutex);uint64_t now=now_ms();
 bf(&b,"{\"version\":\"0.1.24\",\"connected\":%s,\"epoch\":%u,\"adsState\":%d,\"symbolVersion\":%u,\"busy\":%s,\"message\":",app.connected?"true":"false",app.epoch,app.ads_status,app.symbol_version,app.busy?"true":"false");bj(&b,app.message);bf(&b,",\"ip\":");bj(&b,app.ip);bf(&b,",\"netId\":");bj(&b,app.netid);bf(&b,",\"port\":%u,\"language\":",app.ads_port);bj(&b,app.language);bf(&b,",\"fields\":{");
 for(int i=0,emitted=0;i<F_COUNT;i++){if(i>=F_ENGINEERING_FIRST&&(!engineer||!engineering_requested(i,now)))continue;if(emitted++)bf(&b,",");bj(&b,defs[i].key);bf(&b,":{");Reading *r=&app.fields[i];int identity=binding_ready(i,now),range=range_ready(i,now);double min,max;field_bounds(i,range?app.fields[F_WORK_LENGTH].value:0,&min,&max);int fresh=app.connected&&r->quality&&now-r->observed<=1500&&identity;char hex[33];raw_hex(r->raw,defs[i].bytes,hex);bf(&b,"\"quality\":%s,\"value\":",fresh?"true":"false");if(fresh)bf(&b,"%.17g",r->value);else bf(&b,"null");bf(&b,",\"raw\":");bj(&b,hex);bf(&b,",\"writable\":%s,\"min\":%.9g,\"max\":%.9g,\"integer\":%s,\"type\":",(i!=F_UNWINDER_STOP&&(i!=F_UNWINDER_SENSOR||app.unwinder.mode==UNWINDER_NORMAL)&&defs[i].writable&&r->meta.valid&&!(r->meta.flags&32u)&&identity&&range&&(i!=F_PHOTO_OFFSET_TENTHS||photo_offset_ready(now))&&(!field_engineer(i)||engineer)&&(!field_stopped(i)||engineering_ready(now)))?"true":"false",min,max,defs[i].integer?"true":"false");bj(&b,type_name(defs[i].type));bf(&b,",\"unit\":");bj(&b,i==F_WIDTH&&app.fields[F_CFG_INCH_MODE].quality&&now-app.fields[F_CFG_INCH_MODE].observed<=1500&&app.fields[F_CFG_INCH_MODE].value==1?"дюйм":defs[i].unit);bf(&b,",\"label\":");bj(&b,defs[i].label);bf(&b,",\"error\":%u,\"symbol\":",r->error);bj(&b,defs[i].symbol);
  bf(&b,",\"bindingReady\":%s,\"rangeReady\":%s,\"sourceIndex\":%d,\"gate\":",identity?"true":"false",range?"true":"false",field_virtual(i)?r->source_index:field_source_index(&defs[i]));if(defs[i].gate>=0)bj(&b,defs[defs[i].gate].key);else bf(&b,"null");
  bf(&b,",\"resettable\":%s",(reset_counter(i)&&command_available(command_index(counter_command_key(i)),now,engineer))?"true":"false");
  bf(&b,",\"metadata\":{\"resolved\":%s,\"status\":",r->meta.valid?"true":"false");bj(&b,metadata_status(&r->meta));
  bf(&b,",\"layout\":%d,\"adsError\":%u,\"actualType\":",r->meta.layout,r->meta.lookup_error);bj(&b,r->meta.type);
  bf(&b,",\"actualSize\":%u,\"dataType\":%u,\"flags\":%u,\"group\":%u,\"offset\":%u}}",r->meta.size,r->meta.data_type,r->meta.flags,r->meta.group,r->meta.offset);}
 bf(&b,"}");alarms_json(&b,now);command_json(&b,now,engineer);unwinder_json(&b,now);bf(&b,",\"auth\":{\"provider\":\"local\",\"userId\":\"%s\",\"role\":\"%s\",\"engineerConfigured\":%s,\"locked\":%s},\"options\":{\"snow\":%s,\"animations\":%s,\"wallpaper\":%s,\"exitButton\":%s,\"theme\":\"%s\",\"font\":\"%s\"},\"quitting\":%s,\"cleaning\":{\"available\":true,\"normalSpeed\":10,\"boostSpeed\":45,\"addSeconds\":60,\"maxSeconds\":180,\"owner\":\"scada\",\"active\":%s,\"pendingRestore\":%s,\"remainingMs\":%llu,\"storageError\":%s,\"message\":",engineer?"local-engineer":"local-operator",engineer?"engineer":"operator",app.auth.configured?"true":"false",app.auth.locked?"true":"false",app.options.snow?"true":"false",app.options.animations?"true":"false",app.options.wallpaper?"true":"false",app.options.exit_button?"true":"false",display_theme_code(app.options.theme),display_font_code(app.options.font),atomic_load(&app.quitting)?"true":"false",app.cleaning.active?"true":"false",app.cleaning.pending?"true":"false",(unsigned long long)(app.cleaning.active&&app.cleaning.deadline>now?app.cleaning.deadline-now:0),app.cleaning.storage_error?"true":"false");bj(&b,app.cleaning.message);bf(&b,"},\"polling\":{\"fastIntervalMs\":%u,\"fullIntervalMs\":%u,\"lastCycleMs\":%llu,\"maxCycleMs\":%llu,\"cycles\":%u,\"fullCycles\":%u,\"sumRead\":%s},\"operation\":",POLL_FAST_MS,POLL_FULL_MS,(unsigned long long)app.poll_duration,(unsigned long long)app.poll_max_duration,app.poll_cycles,app.poll_full_cycles,app.poll_sum?"true":"false");tx_json(&b,&app.tx);bf(&b,",\"history\":[");for(unsigned k=0;k<app.history_n;k++){if(k)bf(&b,",");tx_json(&b,&app.history[k]);}bf(&b,"]}");unlock(&app.mutex);return b.failed?0:b.used;
}
#endif
