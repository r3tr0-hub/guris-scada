#ifndef SCADA_CLEANING_H
#define SCADA_CLEANING_H
/* This is an operational timer owned by the SCADA backend, not a PLC safety function. */
static int cleaning_target(void){return app.cleaning.port==app.ads_port&&!strcmp(app.cleaning.ip,app.ip)&&!strcmp(app.cleaning.netid,app.netid);}
static int cleaning_live_ready(Ads *c,Meta *metas){
 unsigned char state[8],automatic[8];double s,a;
 return metas[F_STATE].valid&&metas[F_AUTO].valid&&fresh_read(c,F_STATE,&metas[F_STATE],state)==1&&fresh_read(c,F_AUTO,&metas[F_AUTO],automatic)==1&&decode_value(&defs[F_STATE],state,&s)&&decode_value(&defs[F_AUTO],automatic,&a)&&s==13&&a==0;
}
static int cleaning_can_boost(uint64_t now){Reading *s=&app.fields[F_STATE],*a=&app.fields[F_AUTO],*r=&app.fields[F_IDLE];return app.connected&&app.ads_status==5&&r->quality&&s->quality&&a->quality&&now-r->observed<=1500&&now-s->observed<=1500&&now-a->observed<=1500&&r->meta.valid&&!(r->meta.flags&32u)&&s->value==13&&a->value==0;}
static int cleaning_journal_start(void){char data[500];Buffer b;binit(&b,data,sizeof(data));bf(&b,"{\"pending\":1,\"ip\":");bj(&b,app.ip);bf(&b,",\"netId\":");bj(&b,app.netid);bf(&b,",\"port\":%u}\n",app.ads_port);return !b.failed&&local_save("cleaning.json",data);}
static void cleaning_transaction_done(const Transaction *tx){
 if(!tx->cleaning)return;
 lock(&app.mutex);
 if(tx->cleaning==1){if(strcmp(tx->status,"confirmed")){app.cleaning.active=0;app.cleaning.restoring=1;copy_s(app.cleaning.message,256,"Ускорение не подтверждено. Требуется вернуть 10");}}
 else if(!strcmp(tx->status,"confirmed")){
  if(local_save("cleaning.json","{\"pending\":0}\n")){app.cleaning.pending=0;app.cleaning.active=0;app.cleaning.restoring=0;app.cleaning.storage_error=0;copy_s(app.cleaning.message,256,"Скорость 10 подтверждена ПЛК");}
  else {app.cleaning.storage_error=1;copy_s(app.cleaning.message,256,"Скорость 10 подтверждена, но журнал не сохранён. Ускорение заблокировано");}
 }else copy_s(app.cleaning.message,256,"Возврат 10 не подтверждён. Повторим после свежего чтения ПЛК");
 app.cleaning.retry=now_ms()+1000;unlock(&app.mutex);
}
static int cleaning_add(Pair *p,int n,char *reason,size_t cap,int engineer){
 const char *id=pair_get(p,n,"id"),*expected=pair_get(p,n,"expected");double ep;unsigned char baseline[8]={0};
 if(n!=3||!id||strlen(id)<8||strlen(id)>64||!hex_raw(expected,4,baseline)||!number_parse(pair_get(p,n,"epoch"),&ep)||ep<0||ep>UINT32_MAX||floor(ep)!=ep){copy_s(reason,cap,"Некорректный запрос ускорения");return 400;}
 for(const char *q=id;*q;q++)if(!((*q>='0'&&*q<='9')||(*q>='A'&&*q<='Z')||(*q>='a'&&*q<='z')||*q=='-'||*q=='_')){copy_s(reason,cap,"Некорректный номер операции ускорения");return 400;}
 lock(&app.mutex);uint64_t now=now_ms();
 for(unsigned i=0;i<app.cleaning.ids_n&&i<64;i++)if(!strcmp(id,app.cleaning.ids[i])){unlock(&app.mutex);copy_s(reason,cap,"Это нажатие уже учтено");return 200;}
 if(app.cleaning.active&&app.cleaning.deadline<=now){app.cleaning.active=0;app.cleaning.restoring=1;}
 if(app.command.owned||app.cleaning.restoring||app.unwinder.mode==UNWINDER_RESTORE||atomic_load(&app.quitting)||app.epoch!=(unsigned)ep||!cleaning_can_boost(now)||(app.busy&&app.tx.cleaning!=1)){unlock(&app.mutex);copy_s(reason,cap,"Ускорение доступно только в состоянии «Машина не готова», при выключенном автоматическом режиме и свежих данных; дождитесь возврата 10");return 409;}
 if(app.cleaning.pending&&(!app.cleaning.active||!cleaning_target())){unlock(&app.mutex);copy_s(reason,cap,"Сначала подтвердите возврат 10");return 409;}
 if(!app.cleaning.active){
  Reading *r=&app.fields[F_IDLE];if(memcmp(baseline,r->raw,4)){unlock(&app.mutex);copy_s(reason,cap,"Скорость изменилась. Повторите нажатие по свежим данным");return 409;}
  if(!cleaning_journal_start()){app.cleaning.storage_error=1;unlock(&app.mutex);copy_s(reason,cap,"Не удалось сохранить задание возврата 10. Ускорение не отправлено");return 503;}
  app.cleaning.pending=1;app.cleaning.active=1;app.cleaning.storage_error=0;app.cleaning.deadline=now;copy_s(app.cleaning.ip,64,app.ip);copy_s(app.cleaning.netid,64,app.netid);app.cleaning.port=app.ads_port;
  Transaction tx;memset(&tx,0,sizeof(tx));copy_s(tx.id,65,id);copy_s(tx.status,24,"queued");tx.field=F_IDLE;tx.cleaning=1;copy_s(tx.actor,32,engineer?"local-engineer":"local-operator");tx.requested=45;tx.before=r->value;tx.epoch=app.epoch;memcpy(tx.expected,r->raw,4);float speed=45;uint32_t bits;memcpy(&bits,&speed,4);put32(tx.wanted,bits);app.tx=tx;app.queue=1;app.busy=1;diagnostic_transaction_event(&tx,"transaction.queued");
 }
 uint64_t next=app.cleaning.deadline>now?app.cleaning.deadline:now;next+=60000;app.cleaning.deadline=next>now+180000?now+180000:next;
 if(app.cleaning.ids_n>=64){memmove(app.cleaning.ids,app.cleaning.ids+1,63*sizeof(app.cleaning.ids[0]));app.cleaning.ids_n=63;}copy_s(app.cleaning.ids[app.cleaning.ids_n++],65,id);
 copy_s(app.cleaning.message,256,"Ускорение 45 · каждое нажатие +60 секунд, не более 180");unlock(&app.mutex);copy_s(reason,cap,"Добавлено до 60 секунд; остаток ограничен 180 секундами");return 202;
}
static int cleaning_cancel(Pair *p,int n,char *reason,size_t cap){(void)p;if(n){copy_s(reason,cap,"Нужен пустой объект");return 400;}lock(&app.mutex);if(app.cleaning.pending&&!app.cleaning.ip[0]&&app.cleaning.storage_error){unlock(&app.mutex);copy_s(reason,cap,"Журнал ускорения повреждён. Проверьте уставку на HMI и восстановите журнал");return 409;}if(!app.cleaning.pending){unlock(&app.mutex);copy_s(reason,cap,"Ускорение не активно");return 200;}app.cleaning.active=0;app.cleaning.restoring=1;app.cleaning.deadline=0;app.cleaning.retry=0;copy_s(app.cleaning.message,256,"Возвращаем скорость 10…");unlock(&app.mutex);copy_s(reason,cap,"Запрошен возврат скорости 10");return 202;}
static void request_quit(void){atomic_store(&app.quitting,1);}
static void cleaning_service(void){
 lock(&app.mutex);uint64_t now=now_ms();
 if(atomic_load(&app.quitting)&&!app.quit_started)app.quit_started=now;
 if(app.cleaning.pending){
  Reading *idle=&app.fields[F_IDLE];
  if(app.cleaning.active&&(now>=app.cleaning.deadline||atomic_load(&app.quitting)||!app.connected||!cleaning_can_boost(now)||(!app.busy&&idle->value!=45))){app.cleaning.active=0;app.cleaning.restoring=1;copy_s(app.cleaning.message,256,app.connected?"Возвращаем скорость 10…":"Нет связи. Возврат 10 ожидает подключения к ПЛК");}
  if(app.cleaning.restoring&&!app.busy&&now>=app.cleaning.retry&&app.connected&&app.ads_status==5&&idle->quality&&now-idle->observed<=1500&&idle->meta.valid&&!(idle->meta.flags&32u)&&cleaning_target()){
   Transaction tx;memset(&tx,0,sizeof(tx));snprintf(tx.id,65,"normal-%u-%llu",++app.cleaning.serial,(unsigned long long)now);copy_s(tx.status,24,"queued");tx.field=F_IDLE;tx.cleaning=2;copy_s(tx.actor,32,"scada-timer");tx.requested=10;tx.before=idle->value;tx.epoch=app.epoch;memcpy(tx.expected,idle->raw,4);encode_value(&defs[F_IDLE],10,tx.wanted);app.tx=tx;app.busy=1;app.queue=1;
  }
  if(app.cleaning.restoring&&!cleaning_target()&&app.cleaning.ip[0])copy_s(app.cleaning.message,256,"Возврат 10 ожидает исходное подключение к ПЛК. Обратитесь к инженеру");
 }
 if(atomic_load(&app.quitting)&&((!app.cleaning.pending&&!app.command.owned&&app.unwinder.mode!=UNWINDER_TEMP&&app.unwinder.mode!=UNWINDER_RESTORE)||now-app.quit_started>=5000))atomic_store(&app.stop,1);
 unlock(&app.mutex);
}
#endif
