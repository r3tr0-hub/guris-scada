#ifndef SCADA_UNWINDER_H
#define SCADA_UNWINDER_H
/* Operational auto-return, owned by the backend. It cannot reach the PLC while
   the PC or the link is unavailable. Permanent bypass is an explicit role-gated
   policy, separate from a temporary operator bypass. */
static uint64_t unwinder_wall_ms(void){return wall_ms();}
static int unwinder_target(void){return app.unwinder.port==app.ads_port&&!strcmp(app.unwinder.ip,app.ip)&&!strcmp(app.unwinder.netid,app.netid);}
static int unwinder_journal(void){
 UnwinderGuard *u=&app.unwinder;char data[700];Buffer b;binit(&b,data,sizeof(data));
 bf(&b,"{\"mode\":%d,\"ip\":",u->mode);bj(&b,u->ip);bf(&b,",\"netId\":");bj(&b,u->netid);
 bf(&b,",\"port\":%u,\"started\":%llu,\"until\":%llu}\n",u->port,(unsigned long long)u->started_wall,(unsigned long long)u->until_wall);
 return !b.failed&&local_save("unwinder.json",data);
}
static void unwinder_bind_target(void){copy_s(app.unwinder.ip,64,app.ip);copy_s(app.unwinder.netid,64,app.netid);app.unwinder.port=app.ads_port;}
static void unwinder_init(void){
 char data[800];int read=local_read("unwinder.json",data,sizeof(data));if(!read)return;
 Pair p[8];int n=read==1?json_pairs(data,p,8):-1;double mode,port,started,until;const char *ip=pair_get(p,n,"ip"),*net=pair_get(p,n,"netId");unsigned char ni[6];struct in_addr a;
 if(n!=6||!number_parse(pair_get(p,n,"mode"),&mode)||mode<0||mode>3||floor(mode)!=mode||!ip||inet_pton(AF_INET,ip,&a)!=1||!net||!netid_parse(net,ni)||!number_parse(pair_get(p,n,"port"),&port)||port<1||port>65535||floor(port)!=port||!number_parse(pair_get(p,n,"started"),&started)||!number_parse(pair_get(p,n,"until"),&until)||started<0||until<0||started>9007199254740991.0||until>9007199254740991.0||floor(started)!=started||floor(until)!=until){
  app.unwinder.mode=UNWINDER_RESTORE;app.unwinder.storage_error=1;copy_s(app.unwinder.message,256,"Журнал размотчика повреждён. Включите контроль и проверьте HMI");return;
 }
 UnwinderGuard *u=&app.unwinder;u->mode=(int)mode;u->port=(unsigned)port;u->started_wall=(uint64_t)started;u->until_wall=(uint64_t)until;copy_s(u->ip,64,ip);copy_s(u->netid,64,net);
 if(u->mode==UNWINDER_TEMP){uint64_t wall=unwinder_wall_ms();if(!wall||wall<u->started_wall||u->until_wall<=wall||u->until_wall-u->started_wall>300000)u->mode=UNWINDER_RESTORE;else u->deadline=now_ms()+u->until_wall-wall;}
 copy_s(u->message,256,u->mode==UNWINDER_OFF?"Контроль отключён бессрочно инженером":u->mode==UNWINDER_TEMP?"Временное отключение продолжается после запуска":"Проверяем контроль остатка материала");
}
/* Caller holds the state lock. Presence and writable live metadata are required. */
static int unwinder_available(uint64_t now){Reading *r=&app.fields[F_UNWINDER_STOP];return app.connected&&app.ads_status==5&&r->quality&&now-r->observed<=1500&&r->meta.valid&&!(r->meta.flags&32u)&&binding_ready(F_UNWINDER_STOP,now);}
static void unwinder_queue(const char *id,int kind,int engineer){
 Reading *r=&app.fields[F_UNWINDER_STOP];Transaction tx;memset(&tx,0,sizeof(tx));tx.field=F_UNWINDER_STOP;tx.unwinder=kind;tx.requested=kind==2?1:0;tx.before=r->value;tx.epoch=app.epoch;
 copy_s(tx.id,65,id);copy_s(tx.status,24,"queued");copy_s(tx.actor,32,kind==2&&!engineer?"scada-unwinder":engineer?"local-engineer":"local-operator");memcpy(tx.expected,r->raw,1);encode_value(&defs[F_UNWINDER_STOP],tx.requested,tx.wanted);app.tx=tx;app.queue=1;app.busy=1;diagnostic_transaction_event(&tx,"transaction.queued");
}
static int unwinder_request(Pair *p,int n,char *reason,size_t cap,int engineer){
 const char *id=pair_get(p,n,"id"),*mode=pair_get(p,n,"mode");double epoch;unsigned char raw[8];
 int kind=mode&&!strcmp(mode,"temporary")?1:mode&&!strcmp(mode,"enable")?2:mode&&!strcmp(mode,"permanent")?3:0;
 if(n!=4||!valid_operation_id(id)||!kind||!hex_raw(pair_get(p,n,"expected"),1,raw)||!number_parse(pair_get(p,n,"epoch"),&epoch)||epoch<0||epoch>UINT32_MAX||floor(epoch)!=epoch){copy_s(reason,cap,"Некорректный запрос контроля размотчика");return 400;}
 if(kind==3&&!engineer){copy_s(reason,cap,"Бессрочное отключение доступно только инженеру");return 403;}
 lock(&app.mutex);UnwinderGuard *u=&app.unwinder;
 if(!strcmp(app.tx.id,id)){int same=app.tx.unwinder==kind&&app.tx.epoch==(unsigned)epoch;unlock(&app.mutex);copy_s(reason,cap,same?"Запрос уже зарегистрирован":"Номер операции уже использован");return same?202:409;}
 for(unsigned i=0;i<app.history_n;i++)if(!strcmp(app.history[i].id,id)){unlock(&app.mutex);copy_s(reason,cap,"Этот запрос уже выполнен");return 409;}
 if(app.busy||app.command.owned||app.cleaning.restoring||atomic_load(&app.quitting)||app.epoch!=(unsigned)epoch||!unwinder_available(now_ms())||memcmp(raw,app.fields[F_UNWINDER_STOP].raw,1)||(kind==3&&!engineering_ready(now_ms()))){unlock(&app.mutex);copy_s(reason,cap,"Дождитесь свежих данных и завершения операции; бессрочное отключение требует остановки станка");return 409;}
 if(kind!=2&&(u->storage_error||(u->mode!=UNWINDER_NORMAL&&!unwinder_target())||u->mode==UNWINDER_RESTORE||(kind==1&&app.fields[F_UNWINDER_STOP].value==0))){unlock(&app.mutex);copy_s(reason,cap,"Сначала включите контроль. Повторное нажатие не продлевает отключение");return 409;}
 UnwinderGuard previous=*u;unwinder_bind_target();u->mode=kind==1?UNWINDER_TEMP:kind==2?UNWINDER_RESTORE:UNWINDER_OFF;u->started_wall=unwinder_wall_ms();u->until_wall=kind==1?u->started_wall+300000:0;u->deadline=kind==1?now_ms()+300000:0;u->retry=0;
 if(!u->started_wall||!unwinder_journal()){*u=previous;u->storage_error=1;unlock(&app.mutex);copy_s(reason,cap,"Не удалось сохранить режим размотчика. Запрос в ПЛК не отправлен");return 503;}
 u->storage_error=0;u->initialized=1;copy_s(u->message,256,kind==1?"Контроль отключается на 5 минут":kind==2?"Включаем контроль остатка материала…":"Запрошено бессрочное отключение инженером");unwinder_queue(id,kind,engineer);unlock(&app.mutex);copy_s(reason,cap,kind==1?"Отключение на 5 минут: таймер работает в SCADA":kind==2?"Запрошено включение контроля":"Запрошено бессрочное отключение контроля");return 202;
}
static void unwinder_normal(void){
 UnwinderGuard *u=&app.unwinder;int previous=u->mode;u->mode=UNWINDER_NORMAL;u->deadline=u->until_wall=u->started_wall=0;unwinder_bind_target();
 if(unwinder_journal()){u->storage_error=0;copy_s(u->message,256,"Контроль остатка материала включён");}
 else {u->mode=previous==UNWINDER_OFF?UNWINDER_RESTORE:previous;u->storage_error=1;copy_s(u->message,256,"Контроль включён; журнал не сохранён. Повторим сохранение");}
}
static void unwinder_transaction_done(const Transaction *tx){
 if(!tx->unwinder)return;
 lock(&app.mutex);UnwinderGuard *u=&app.unwinder;
 if(!strcmp(tx->status,"confirmed")){if(tx->unwinder==2)unwinder_normal();else copy_s(u->message,256,tx->unwinder==1?"Контроль временно отключён · возврат через 5 минут":"Контроль отключён бессрочно инженером");}
 else if(tx->unwinder==1){u->mode=UNWINDER_RESTORE;unwinder_journal();copy_s(u->message,256,"Отключение не подтверждено. Возвращаем контроль");}
 else copy_s(u->message,256,tx->unwinder==2?"Включение не подтверждено. Повторим после свежего чтения":"Бессрочное отключение не подтверждено. Проверьте фактическое состояние");
 u->retry=now_ms()+1000;unlock(&app.mutex);
}
static void unwinder_service(void){
 lock(&app.mutex);UnwinderGuard *u=&app.unwinder;uint64_t now=now_ms();
 if(u->mode==UNWINDER_TEMP&&(now>=u->deadline||atomic_load(&app.quitting))){u->mode=UNWINDER_RESTORE;u->retry=0;app.command.desired=0;unwinder_journal();copy_s(u->message,256,"Время отключения истекло. Включаем контроль…");}
 if(!unwinder_available(now)){if(u->mode==UNWINDER_RESTORE&&!u->storage_error)copy_s(u->message,256,"Включение контроля ожидает связи и свежих данных ПЛК");unlock(&app.mutex);return;}
 if(u->mode!=UNWINDER_NORMAL&&!unwinder_target()){copy_s(u->message,256,"Режим размотчика ожидает исходное подключение к ПЛК");unlock(&app.mutex);return;}
 if(app.busy||app.command.owned||app.cleaning.restoring){unlock(&app.mutex);return;}
 double value=app.fields[F_UNWINDER_STOP].value;
 if(value==1){u->initialized=1;if((u->mode!=UNWINDER_NORMAL||u->storage_error)&&now>=u->retry){unwinder_normal();if(u->storage_error)u->retry=now+1000;}unlock(&app.mutex);return;}
 if(u->mode==UNWINDER_NORMAL){
  unwinder_bind_target();u->mode=u->initialized?UNWINDER_TEMP:UNWINDER_RESTORE;u->initialized=1;u->started_wall=unwinder_wall_ms();u->until_wall=u->mode==UNWINDER_TEMP?u->started_wall+300000:0;u->deadline=u->mode==UNWINDER_TEMP?now+300000:0;
  if(!unwinder_journal()){u->mode=UNWINDER_RESTORE;u->storage_error=1;}copy_s(u->message,256,u->mode==UNWINDER_TEMP?"Отключение на HMI обнаружено · возврат через 5 минут":"Возвращаем нормальный контроль после запуска");
 }
 if(u->mode==UNWINDER_RESTORE&&now>=u->retry){char id[65];snprintf(id,65,"unwinder-%u-%llu",++u->serial,(unsigned long long)now);unwinder_queue(id,2,0);u->retry=now+1000;}
 unlock(&app.mutex);
}
static void unwinder_json(Buffer *b,uint64_t now){
 UnwinderGuard *u=&app.unwinder;static const char *names[]={"normal","temporary","permanent","restoring"};bf(b,",\"unwinder\":{\"mode\":");bj(b,names[u->mode]);bf(b,",\"available\":%s,\"temporarySeconds\":300,\"remainingMs\":%llu,\"pendingRestore\":%s,\"storageError\":%s,\"message\":",unwinder_available(now)?"true":"false",(unsigned long long)(u->mode==UNWINDER_TEMP&&u->deadline>now?u->deadline-now:0),(u->mode==UNWINDER_TEMP||u->mode==UNWINDER_RESTORE)?"true":"false",u->storage_error?"true":"false");bj(b,u->message);bf(b,"}");
}
#endif
