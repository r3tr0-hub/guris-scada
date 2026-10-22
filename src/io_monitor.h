#ifndef SCADA_IO_MONITOR_H
#define SCADA_IO_MONITOR_H
/* Read-only diagnostics share the existing sequential ADS worker. Resolve at
   most two new symbols per normal cycle and poll only the visible selection.
   This module has no PLC write function and accepts only generated tag IDs. */
typedef struct {Meta symbol,read;unsigned mask;uint64_t retry;} IoCache;
static IoCache io_cache[IO_TAG_COUNT];
static unsigned io_cache_epoch;
static uint64_t io_next_poll;
static int io_meta_matches(unsigned id,const Meta *m,Meta *read,unsigned *mask){
 static const uint32_t ads_types[]={33,2,18,3,4,5,17};
 static const char *names[]={"BOOL","INT","UINT","DINT","REAL","LREAL","BYTE"};
 static const char *aliases[]={"BOOL","INT16","UINT16","INT32","REAL32","REAL64","UINT8"};
 const IoDef *d=&io_defs[id];*mask=0;
 if(!m->valid||m->size!=d->bytes||m->data_type!=ads_types[d->type]||!(same_ascii(m->type,names[d->type])||same_ascii(m->type,aliases[d->type]))||(m->flags&4u))return 0;
 if(m->group!=0x4020u&&m->group!=0x4040u&&m->group!=0xF020u&&m->group!=0xF021u&&m->group!=0xF030u&&m->group!=0xF031u)return 0;
 *read=*m;
 if(m->group==0xF021u||m->group==0xF031u){
  if(d->type!=IO_BOOL)return 0;
  /* F021/F031 use bit offsets. Read the containing byte through the matching
     byte process-image group, then extract exactly this one bit. */
  read->group=m->group-1;read->offset=m->offset/8;read->size=1;*mask=1u<<(m->offset%8);
 }else if(m->flags&2u)return 0;
 return 1;
}
static int io_decode(unsigned id,const unsigned char raw[8],unsigned mask,double *out){
 int type=io_defs[id].type;double v=0;
 if(type==IO_BOOL){if(mask)v=(raw[0]&mask)!=0;else{if(raw[0]>1)return 0;v=raw[0];}}
 else if(type==IO_BYTE)v=raw[0];
 else if(type==IO_UINT)v=u16(raw);
 else if(type==IO_INT){uint16_t x=u16(raw);v=(int32_t)x-((x&0x8000)?65536:0);}
 else if(type==IO_DINT){uint32_t x=u32(raw);v=(int64_t)x-((x&0x80000000u)?INT64_C(4294967296):0);}
 else if(type==IO_REAL){uint32_t x=u32(raw);float f;memcpy(&f,&x,4);v=f;}
 else if(type==IO_LREAL){uint64_t x=(uint64_t)u32(raw)|((uint64_t)u32(raw+4)<<32);memcpy(&v,&x,8);}
 else return 0;
 if(!isfinite(v))return 0;
 *out=v;return 1;
}
static int io_select(Pair *pairs,int count,char *reason,size_t cap){
 const char *text=pair_get(pairs,count,"ids");double epoch;int ids[IO_VIEW_MAX];unsigned n=0;
 if(count!=2||!text||!number_parse(pair_get(pairs,count,"epoch"),&epoch)||epoch<0||epoch>UINT32_MAX||floor(epoch)!=epoch){copy_s(reason,cap,"Некорректный запрос диагностики");return 400;}
 const char *p=text;
 while(*p){
  if(n==IO_VIEW_MAX||*p<'0'||*p>'9'){copy_s(reason,cap,"Выберите не более 48 сигналов");return 400;}
  unsigned id=0;do{id=id*10+(unsigned)(*p++-'0');if(id>=IO_TAG_COUNT){copy_s(reason,cap,"Неизвестный сигнал диагностики");return 400;}}while(*p>='0'&&*p<='9');
  for(unsigned k=0;k<n;k++)if(ids[k]==(int)id){copy_s(reason,cap,"Сигнал указан повторно");return 400;}
  ids[n++]=(int)id;if(*p){if(*p++!=','||!*p){copy_s(reason,cap,"Некорректный список сигналов");return 400;}}
 }
 lock(&app.mutex);
 if(n&&(unsigned)epoch!=app.epoch){unlock(&app.mutex);copy_s(reason,cap,"Сессия ПЛК изменилась");return 409;}
 if(n!=app.io.count||memcmp(ids,app.io.ids,n*sizeof(ids[0]))){
  app.io.count=n;memcpy(app.io.ids,ids,n*sizeof(ids[0]));memset(app.io.values,0,sizeof(app.io.values));app.io.generation++;
 }
 app.io.lease=n?now_ms()+2500:0;unlock(&app.mutex);copy_s(reason,cap,n?"Диагностика включена для видимых сигналов":"Диагностика приостановлена");return 202;
}
static int io_service(Ads *c,unsigned char version){
 int selected[IO_VIEW_MAX];unsigned count,generation,epoch;uint64_t lease;
 lock(&app.mutex);count=app.io.count;generation=app.io.generation;epoch=app.epoch;lease=app.io.lease;int usable=app.connected&&app.ads_status==5&&!app.busy;memcpy(selected,app.io.ids,count*sizeof(int));unlock(&app.mutex);
 uint64_t now=now_ms();if(!count||now>=lease||!usable)return 1;
 if(epoch!=io_cache_epoch){memset(io_cache,0,sizeof(io_cache));io_cache_epoch=epoch;io_next_poll=0;}
 unsigned resolved=0;
 for(unsigned k=0;k<count&&resolved<2;k++){
  int id=selected[k];IoCache *e=&io_cache[id];if(e->symbol.valid||now<e->retry)continue;
  int rc=ads_lookup(c,io_defs[id].symbol,&e->symbol);resolved++;e->retry=now+10000;
  if(!rc)return 0;
  if(rc==1&&!io_meta_matches((unsigned)id,&e->symbol,&e->read,&e->mask)){
   e->symbol.valid=0;e->symbol.resolution=META_TYPE_MISMATCH;
  }
 }
 if(now<io_next_poll&&!resolved)return 1;
 io_next_poll=now+500;
 static Meta metas[IO_TAG_COUNT];int ids[IO_VIEW_MAX];unsigned n=0;
 for(unsigned k=0;k<count;k++){int id=selected[k];if(io_cache[id].symbol.valid){metas[id]=io_cache[id].read;ids[n++]=id;}}
 unsigned char raw[IO_TAG_COUNT][16];memset(raw,0,sizeof(raw));uint32_t errors[IO_VIEW_MAX]={0};
 unsigned char before;if(ads_version(c,&before)!=1||before!=version)return 0;
 int rc=n?(c->sum?ads_sum(c,metas,ids,n,raw,errors):-1):1;
 if(n&&(!c->sum||(rc==-1&&(c->error==0x701u||c->error==0x702u)))){c->sum=0;rc=1;for(unsigned k=0;k<n;k++){int z=ads_read(c,metas[ids[k]].group,metas[ids[k]].offset,metas[ids[k]].size,raw[ids[k]]);if(!z){rc=0;break;}errors[k]=z==1?0:c->error;}}
 if(!rc)return 0;
 if(rc!=1){for(unsigned k=0;k<n;k++)errors[k]=c->error?c->error:0xffffffffu;}
 if(!version_current(c,version))return 0;
 IoValue values[IO_VIEW_MAX];memset(values,0,sizeof(values));uint64_t at=now_ms();
 for(unsigned k=0;k<count;k++){
  unsigned id=(unsigned)selected[k];IoCache *e=&io_cache[id];IoValue *v=&values[k];v->observed=at;v->resolution=e->symbol.resolution;v->error=e->symbol.lookup_error?e->symbol.lookup_error:0xffffffffu;
  if(!e->symbol.valid)continue;
  unsigned which=0;while(which<n&&ids[which]!=(int)id)which++;if(which==n)continue;
  v->error=errors[which];v->quality=!v->error&&io_decode(id,raw[id],e->mask,&v->value);
 }
 lock(&app.mutex);if(app.epoch==epoch&&app.io.generation==generation&&now_ms()<app.io.lease)memcpy(app.io.values,values,count*sizeof(values[0]));unlock(&app.mutex);return 1;
}
static size_t io_json(char *out,size_t cap){
 Buffer b;binit(&b,out,cap);lock(&app.mutex);uint64_t now=now_ms();int active=app.io.count&&now<app.io.lease;
 bf(&b,"{\"epoch\":%u,\"readOnly\":true,\"active\":%s,\"records\":[",app.epoch,active?"true":"false");
 for(unsigned k=0;k<app.io.count;k++){
  IoValue *v=&app.io.values[k];int good=active&&app.connected&&app.ads_status==5&&v->quality&&now-v->observed<=1500;
  if(k)bf(&b,",");
  bf(&b,"{\"id\":%d,\"quality\":%s,\"value\":",app.io.ids[k],good?"true":"false");if(good)bf(&b,"%.17g",v->value);else bf(&b,"null");
  bf(&b,",\"error\":%u,\"resolution\":%d}",v->error,v->resolution);
 }
 bf(&b,"]}");unlock(&app.mutex);return b.failed?0:b.used;
}
#endif
