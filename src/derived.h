#ifndef SCADA_DERIVED_H
#define SCADA_DERIVED_H
/* Array layouts are accepted only after fresh live metadata checks. */
static Meta dancer_array,alarm_array;
static int shape_equal(const char *a,const char *b){for(;;){while(*a==' ')a++;while(*b==' ')b++;char x=*a++,y=*b++;if(x>='a'&&x<='z')x-=32;if(y>='a'&&y<='z')y-=32;if(x!=y)return 0;if(!x)return 1;}}
static void resolve_arrays(Ads *c){
 memset(&dancer_array,0,sizeof(dancer_array));memset(&alarm_array,0,sizeof(alarm_array));
 if(ads_lookup(c,"Salmalar.rScaledBalerin",&dancer_array)!=1||dancer_array.size!=84||!shape_equal(dancer_array.type,"ARRAY [0..20] OF REAL")||(dancer_array.flags&6u))dancer_array.valid=0;
 if(ads_lookup(c,".Alarm",&alarm_array)!=1||alarm_array.size!=201*49||!shape_equal(alarm_array.type,"ARRAY [0..200] OF AlarmBlock")||(alarm_array.flags&6u)){alarm_array.valid=0;return;}
 const char *names[]={".Alarm[0].iState",".Alarm[0].ID",".Alarm[0].sOccurTime",".Alarm[0].sAckTime",".Alarm[0].EN"};
 const unsigned offsets[]={0,2,8,28,48},sizes[]={2,2,20,20,1};
 const char *types[]={"INT","INT","STRING(19)","STRING(19)","BOOL"};
 for(unsigned i=0;i<5;i++){
  Meta m;if(ads_lookup(c,names[i],&m)!=1||m.group!=alarm_array.group||m.offset!=alarm_array.offset+offsets[i]||m.size!=sizes[i]||!(shape_equal(m.type,types[i])||(i<2&&shape_equal(m.type,"INT16")))||(m.flags&6u)){alarm_array.valid=0;break;}
 }
}
static int poll_dancers(Ads *c,Meta *m,unsigned char raw[][FIELD_RAW_BYTES],const uint32_t *errors,Reading out[2]){
 memset(out,0,2*sizeof(*out));if(!dancer_array.valid)return 1;
 unsigned char values[84];int rc=ads_read(c,dancer_array.group,dancer_array.offset,84,values);if(!rc)return 0;if(rc!=1)return 1;
 for(int n=0;n<2;n++){
  int ref=n?F_DANCER2_REF:F_DANCER1_REF;Reading *r=&out[n];r->meta=dancer_array;r->observed=now_ms();r->error=0xffffffffu;
  if(!m[ref].valid||errors[ref])continue;
  int index=(int16_t)u16(raw[ref]);r->source_index=index;if(index<0||index>20)continue;
  unsigned char again[2];rc=ads_read(c,m[ref].group,m[ref].offset,2,again);if(!rc)return 0;if(rc!=1||memcmp(again,raw[ref],2))continue;
  memcpy(r->raw,values+index*4,4);r->quality=decode_value(&defs[n?F_DANCER2:F_DANCER1],r->raw,&r->value);r->error=r->quality?0:0xffffffffu;
 }
 return 1;
}
static int poll_alarms(Ads *c,AlarmSnapshot *out){
 memset(out,0,sizeof(*out));out->observed=now_ms();out->error=alarm_array.lookup_error?alarm_array.lookup_error:0xffffffffu;if(!alarm_array.valid)return 1;
 unsigned char data[201*49];int rc=ads_read(c,alarm_array.group,alarm_array.offset,sizeof(data),data);if(!rc)return 0;if(rc!=1){out->error=c->error;return 1;}
 out->quality=1;out->error=0;
 for(unsigned i=0;i<201;i++){
  const unsigned char *p=data+i*49;int st=(int16_t)u16(p);if(!st)continue;
  AlarmRow *r=&out->rows[out->count++];r->slot=(int)i;r->id=(int16_t)u16(p+2);r->state=st;r->condition=p[48]==1;
  memcpy(r->occurred,p+8,19);r->occurred[19]=0;memcpy(r->acknowledged,p+28,19);r->acknowledged[19]=0;
  /* Timestamp buffers are ASCII in this PLC; never export invalid UTF-8 bytes. */
  for(int n=0;n<19;n++){if((unsigned char)r->occurred[n]>=127||(r->occurred[n]&&r->occurred[n]<32))r->occurred[n]='?';if((unsigned char)r->acknowledged[n]>=127||(r->acknowledged[n]&&r->acknowledged[n]<32))r->acknowledged[n]='?';}
  if(st==10){out->active++;if(!r->condition)out->waiting++;}
  if((st!=10&&st!=20)||p[48]>1)out->quality=0;
 }
 return 1;
}
static void alarms_json(Buffer *b,uint64_t now){
 AlarmSnapshot *a=&app.alarms;int fresh=app.connected&&a->quality&&now-a->observed<=1500;
 bf(b,",\"alarms\":{\"quality\":%s,\"activeCount\":%u,\"waitingAcknowledgement\":%u,\"error\":%u,\"records\":[",fresh?"true":"false",a->active,a->waiting,a->error);
 for(unsigned i=0;i<a->count;i++){AlarmRow *r=&a->rows[i];if(i)bf(b,",");bf(b,"{\"slot\":%d,\"id\":%d,\"state\":%d,\"condition\":%s,\"occurred\":",r->slot,r->id,r->state,r->condition?"true":"false");bj(b,r->occurred);bf(b,",\"acknowledged\":");bj(b,r->acknowledged);bf(b,"}");}bf(b,"]}");
}
#endif
