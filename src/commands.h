#ifndef SCADA_COMMANDS_H
#define SCADA_COMMANDS_H
enum { CMD_HOLD=1,CMD_PULSE,CMD_SET,CMD_TOGGLE };
typedef struct {const char *key;int field,mode,opposite,stopped,engineer;} CommandDef;
static const CommandDef commands[]={
 {"edge1JogFw",F_CMD_EDGE1_FW,CMD_HOLD,F_CMD_EDGE1_BW,1,0},{"edge1JogBw",F_CMD_EDGE1_BW,CMD_HOLD,F_CMD_EDGE1_FW,1,0},
 {"edge2JogFw",F_CMD_EDGE2_FW,CMD_HOLD,F_CMD_EDGE2_BW,1,0},{"edge2JogBw",F_CMD_EDGE2_BW,CMD_HOLD,F_CMD_EDGE2_FW,1,0},
 {"edge3JogFw",F_CMD_EDGE3_FW,CMD_HOLD,F_CMD_EDGE3_BW,1,0},{"edge3JogBw",F_CMD_EDGE3_BW,CMD_HOLD,F_CMD_EDGE3_FW,1,0},
 {"takeoffJog",F_CMD_TAKEOFF,CMD_HOLD,-1,1,0},
 {"ejectJogFw",F_CMD_EJECT_FW,CMD_HOLD,F_CMD_EJECT_BW,1,0},{"ejectJogBw",F_CMD_EJECT_BW,CMD_HOLD,F_CMD_EJECT_FW,1,0},
 {"glueReset",F_CMD_GLUE_RESET,CMD_PULSE,-1,1,0},{"glueTest",F_CMD_GLUE_TEST,CMD_TOGGLE,-1,1,0},
 {"photoReset",F_CMD_PHOTO_RESET,CMD_TOGGLE,-1,1,0},{"knifeSave",F_CMD_KNIFE_SAVE,CMD_PULSE,-1,0,1},
 {"alarmAck",F_CMD_ALARM_ACK,CMD_PULSE,-1,0,0},{"alarmClear",F_CMD_ALARM_CLEAR,CMD_PULSE,-1,0,0},
 {"groupsReset",F_CMD_GROUP_RESET,CMD_PULSE,-1,0,0},{"totalReset",F_CMD_TOTAL_RESET,CMD_PULSE,-1,0,0},
 {"currentReset",F_CMD_CURRENT_RESET,CMD_PULSE,-1,0,0},
 {"glueScaleSave",F_CMD_GLUE_SCALE_SAVE,CMD_PULSE,-1,0,0},
 {"eng0010Action",F_ENG_0010,CMD_PULSE,-1,0,1},
 {"eng0015Action",F_ENG_0015,CMD_PULSE,-1,0,1},
 {"eng0016Action",F_ENG_0016,CMD_PULSE,-1,0,1},
 {"eng0218Action",F_ENG_0218,CMD_PULSE,-1,1,1},
 {"eng0235Action",F_ENG_0235,CMD_PULSE,-1,0,1},
 {"eng0237Action",F_ENG_0237,CMD_PULSE,-1,0,1},
 {"eng0281Action",F_ENG_0281,CMD_PULSE,-1,1,1},
 {"eng0292Action",F_ENG_0292,CMD_PULSE,-1,0,1},
 {"eng0322Action",F_ENG_0322,CMD_PULSE,-1,0,1},
 {"eng0323Action",F_ENG_0323,CMD_TOGGLE,-1,1,1},
 {"eng0332Action",F_ENG_0332,CMD_PULSE,-1,0,1},
 {"eng0333Action",F_ENG_0333,CMD_PULSE,-1,0,1},
 {"eng0367Action",F_ENG_0367,CMD_PULSE,-1,0,1},
 {"eng0368Action",F_ENG_0368,CMD_PULSE,-1,0,1},
 {"eng0369Action",F_ENG_0369,CMD_PULSE,-1,0,1},
 {"eng0370Action",F_ENG_0370,CMD_PULSE,-1,0,1},
 {"eng0371Action",F_ENG_0371,CMD_PULSE,-1,0,1},
 {"eng0372Action",F_ENG_0372,CMD_PULSE,-1,0,1},
 {"eng0401Action",F_ENG_0401,CMD_PULSE,-1,0,1},
 {"eng0444Action",F_ENG_0444,CMD_PULSE,-1,0,1},
 {"eng0445Action",F_ENG_0445,CMD_PULSE,-1,0,1},
 {"eng0453Action",F_ENG_0453,CMD_PULSE,-1,1,1},
 {"eng0454Action",F_ENG_0454,CMD_PULSE,-1,1,1}
};
#define COMMAND_COUNT ((int)(sizeof(commands)/sizeof(commands[0])))
static int command_index(const char *key){if(key)for(int i=0;i<COMMAND_COUNT;i++)if(!strcmp(key,commands[i].key))return i;return -1;}
/* Caller holds the state lock. */
static int manual_ready(uint64_t now){Reading *s=&app.fields[F_STATE],*a=&app.fields[F_AUTO];return app.connected&&app.ads_status==5&&s->quality&&a->quality&&now-s->observed<=1500&&now-a->observed<=1500&&(s->value==5||s->value==6||s->value==9)&&a->value==0;}
static int manual_live_ready(Ads *c,Meta *metas){
 unsigned char state[8],automatic[8];double s,a;
 return metas[F_STATE].valid&&metas[F_AUTO].valid&&fresh_read(c,F_STATE,&metas[F_STATE],state)==1&&fresh_read(c,F_AUTO,&metas[F_AUTO],automatic)==1&&decode_value(&defs[F_STATE],state,&s)&&decode_value(&defs[F_AUTO],automatic,&a)&&(s==5||s==6||s==9)&&a==0;
}
static int command_base_available(int n,uint64_t now,int engineer){
 const CommandDef *d=&commands[n];Reading *r=&app.fields[d->field];
 if(!app.connected||app.ads_status!=5||!r->quality||now-r->observed>1500||!r->meta.valid||(r->meta.flags&32u)||!binding_ready(d->field,now)||(d->engineer&&!engineer))return 0;
 return 1;
}
static int command_available(int n,uint64_t now,int engineer){
 const CommandDef *d=&commands[n];
 if(!command_base_available(n,now,engineer))return 0;
 if(d->stopped&&!manual_ready(now)&&!((d->field==F_CMD_GLUE_TEST||d->field==F_CMD_PHOTO_RESET)&&app.fields[d->field].value==1))return 0;
 return 1;
}
static int command_target(void){return app.command.port==app.ads_port&&!strcmp(app.command.ip,app.ip)&&!strcmp(app.command.netid,app.netid);}
static int command_journal(int n){char text[600];Buffer b;binit(&b,text,sizeof(text));bf(&b,"{\"key\":");bj(&b,commands[n].key);bf(&b,",\"ip\":");bj(&b,app.ip);bf(&b,",\"netId\":");bj(&b,app.netid);bf(&b,",\"port\":%u}",app.ads_port);return !b.failed&&local_save("command_pending.json",text);}
static void command_init(void){
 char data[700];int read=local_read("command_pending.json",data,sizeof(data));if(!read)return;
 Pair p[8];int n=read==1?json_pairs(data,p,8):-1;if(n==1&&pair_get(p,n,"clear"))return;
 double port;int ci=command_index(pair_get(p,n,"key"));const char *ip=pair_get(p,n,"ip"),*net=pair_get(p,n,"netId");unsigned char ni[6];struct in_addr a;
 if(n!=4||ci<0||!ip||!net||inet_pton(AF_INET,ip,&a)!=1||!netid_parse(net,ni)||!number_parse(pair_get(p,n,"port"),&port)||port<1||port>65535||floor(port)!=port){app.command.storage_error=1;app.command.owned=1;copy_s(app.command.message,256,"Журнал ручной команды повреждён. Проверьте состояние на HMI");return;}
 app.command.command=ci+1;app.command.owned=1;app.command.desired=0;app.command.port=(unsigned)port;copy_s(app.command.ip,64,ip);copy_s(app.command.netid,64,net);copy_s(app.command.message,256,"Ожидается снятие команды предыдущего запуска");
}
static int valid_operation_id(const char *id){if(!id||strlen(id)<8||strlen(id)>64)return 0;for(const char *p=id;*p;p++)if(!((*p>='a'&&*p<='z')||(*p>='A'&&*p<='Z')||(*p>='0'&&*p<='9')||*p=='_'||*p=='-'))return 0;return 1;}
static int enqueue_command_common(int ci,const char *id,unsigned epoch,char *reason,size_t cap,int engineer,int logical_field,const unsigned char *baseline,int desired_value){
 const CommandDef *d=&commands[ci];lock(&app.mutex);
 if(!strcmp(app.tx.id,id)){int same=app.tx.command==ci+1&&app.tx.epoch==epoch&&(desired_value<0||app.tx.requested==desired_value);unlock(&app.mutex);copy_s(reason,cap,same?"Команда уже зарегистрирована":"Номер операции уже использован");return same?202:409;}
 for(unsigned i=0;i<app.history_n;i++)if(!strcmp(app.history[i].id,id)){unlock(&app.mutex);copy_s(reason,cap,"Операция уже выполнена; повторной отправки нет");return 409;}
 if(app.busy||app.command.owned||app.command.storage_error||app.cleaning.restoring||app.unwinder.mode==UNWINDER_RESTORE||atomic_load(&app.quitting)){unlock(&app.mutex);copy_s(reason,cap,"Дождитесь окончания текущей операции и снятия ручной команды");return 409;}
 if(d->engineer&&!engineer){unlock(&app.mutex);copy_s(reason,cap,"Требуется вход инженера");return 403;}
 int photo=d->field==F_CMD_PHOTO_RESET;
 if(photo&&desired_value<0)desired_value=1-(int)app.fields[d->field].value;
 int available=photo&&desired_value==0?command_base_available(ci,now_ms(),engineer):command_available(ci,now_ms(),engineer);
 if(app.epoch!=epoch||!available||(photo&&desired_value==1&&!manual_ready(now_ms()))){unlock(&app.mutex);copy_s(reason,cap,"Команда недоступна: проверьте связь, комплектацию и состояние станка");return 409;}
 if(logical_field>=0&&(!app.fields[logical_field].quality||now_ms()-app.fields[logical_field].observed>1500)){unlock(&app.mutex);copy_s(reason,cap,"Нет свежего показания счётчика");return 409;}
 Transaction tx;memset(&tx,0,sizeof(tx));tx.command=ci+1;tx.field=logical_field>=0?logical_field:d->field;tx.reset=logical_field>=0;tx.requested=logical_field>=0?0:d->mode==CMD_TOGGLE?1-app.fields[d->field].value:1;tx.before=app.fields[tx.field].value;if(baseline)memcpy(tx.expected,baseline,defs[tx.field].bytes);tx.epoch=epoch;copy_s(tx.id,65,id);copy_s(tx.actor,32,engineer?"local-engineer":"local-operator");copy_s(tx.status,24,"queued");
 if(photo){tx.command_explicit=1;tx.requested=desired_value;tx.expected[0]=baseline?baseline[0]:app.fields[d->field].raw[0];}
 app.tx=tx;app.queue=1;app.busy=1;diagnostic_transaction_event(&tx,"transaction.queued");app.command.command=ci+1;app.command.desired=1;app.command.asserted=0;app.command.deadline=now_ms()+700;copy_s(app.command.id,65,id);unlock(&app.mutex);copy_s(reason,cap,"Команда поставлена в очередь");return 202;
}
static int enqueue_command(Pair *p,int n,char *reason,size_t cap,int engineer){
 const char *key=pair_get(p,n,"key"),*id=pair_get(p,n,"id"),*action=pair_get(p,n,"action");double epoch;int ci=command_index(key);
 if(ci<0||!valid_operation_id(id)||!action||!number_parse(pair_get(p,n,"epoch"),&epoch)||epoch<0||epoch>UINT32_MAX||floor(epoch)!=epoch){copy_s(reason,cap,"Некорректная команда");return 400;}
 if(!strcmp(action,"set")){
  double value;unsigned char expected[8];
  if(n!=6||commands[ci].field!=F_CMD_PHOTO_RESET||!number_parse(pair_get(p,n,"value"),&value)||(value!=0&&value!=1)||!hex_raw(pair_get(p,n,"expected"),1,expected)||expected[0]>1){copy_s(reason,cap,"Некорректное состояние обучения фотометки");return 400;}
  return enqueue_command_common(ci,id,(unsigned)epoch,reason,cap,engineer,-1,expected,(int)value);
 }
 if(n!=4){copy_s(reason,cap,"Некорректная команда");return 400;}
 if(!strcmp(action,"keepalive")||!strcmp(action,"stop")){
  lock(&app.mutex);int same=app.command.command==ci+1&&!strcmp(app.command.id,id);
  if(same){if(!strcmp(action,"stop"))app.command.desired=0;else if(app.command.desired&&app.epoch==(unsigned)epoch&&commands[ci].mode==CMD_HOLD)app.command.deadline=now_ms()+700;}
  unlock(&app.mutex);copy_s(reason,cap,same?"Состояние команды обновлено":"Команда уже завершена");return same?202:200;
 }
 if(strcmp(action,"start")){copy_s(reason,cap,"Неизвестное действие команды");return 400;}
 if(commands[ci].field==F_CMD_GROUP_RESET||commands[ci].field==F_CMD_TOTAL_RESET||commands[ci].field==F_CMD_CURRENT_RESET){copy_s(reason,cap,"Для счётчика используйте отдельное подтверждение обнуления");return 400;}
 return enqueue_command_common(ci,id,(unsigned)epoch,reason,cap,engineer,-1,NULL,-1);
}
static int enqueue_counter_command(Pair *p,int n,char *reason,size_t cap,int engineer){
 const char *key=pair_get(p,n,"key"),*id=pair_get(p,n,"id");int field=key?field_index(key):-1;double ep;unsigned char expected[8];
 if(n!=4||!valid_operation_id(id)||!reset_counter(field)||!number_parse(pair_get(p,n,"epoch"),&ep)||ep<0||ep>UINT32_MAX||floor(ep)!=ep||!hex_raw(pair_get(p,n,"expected"),4,expected)){copy_s(reason,cap,"Некорректный запрос обнуления");return 400;}
 return enqueue_command_common(command_index(counter_command_key(field)),id,(unsigned)ep,reason,cap,engineer,field,expected,-1);
}
static int command_live_meta(Ads *c,Meta *m,int field,Meta *fresh){return ads_lookup(c,defs[field].symbol,fresh)==1&&metadata_matches(field,fresh)&&!(fresh->flags&32u)&&m[field].valid&&fresh->group==m[field].group&&fresh->offset==m[field].offset&&fresh->size==m[field].size;}
/* Clear only an assertion previously owned by this SCADA. Never repeat the assertion. */
static int command_release(Ads *c,Meta *m,unsigned char version){
 lock(&app.mutex);int n=app.command.command-1,owned=app.command.owned,target=command_target();unlock(&app.mutex);
 if(!owned||n<0||n>=COMMAND_COUNT||!target||c->socket==BAD_SOCKET)return 0;
 Meta fresh;unsigned char zero=0,got[8];unsigned st;
 if(ads_state(c,&st)!=1||st!=5||!version_current(c,version)||!command_live_meta(c,m,commands[n].field,&fresh))return 0;
 if(ads_write_field(c,&fresh,&zero,1,1)!=1||fresh_read(c,commands[n].field,&fresh,got)!=1||got[0]!=0||!version_current(c,version))return 0;
 lock(&app.mutex);int saved=local_save("command_pending.json","{\"clear\":1}");app.command.desired=0;app.command.asserted=0;app.command.owned=!saved;app.command.storage_error=!saved;copy_s(app.command.message,256,saved?"Команда снята":"Команда снята, но журнал не сохранён");unlock(&app.mutex);return saved;
}
static void process_command(Ads *c,Meta *m,unsigned char version,Transaction tx){
 const CommandDef *d=&commands[tx.command-1];int f=d->field;Meta fresh;unsigned st;unsigned char before[8],value;char message[256];
 int photo=tx.command_explicit&&f==F_CMD_PHOTO_RESET,photo_finish=photo&&tx.requested==0;
 lock(&app.mutex);int allowed=app.command.desired&&app.epoch==tx.epoch&&(photo_finish?command_base_available(tx.command-1,now_ms(),!strcmp(tx.actor,"local-engineer")):command_available(tx.command-1,now_ms(),!strcmp(tx.actor,"local-engineer")));unlock(&app.mutex);
 if(!allowed||atomic_load(&app.quitting)||ads_state(c,&st)!=1||st!=5||!version_current(c,version)||!command_live_meta(c,m,f,&fresh)||!binding_live_ready(c,m,f)||fresh_read(c,f,&fresh,before)!=1){transaction_finish(&tx,"rejected","Условия команды изменились до отправки");return;}
 if(d->stopped&&!photo_finish&&!(f==F_CMD_GLUE_TEST&&before[0]==1)&&!manual_live_ready(c,m)){transaction_finish(&tx,"rejected","Для ручной команды остановите станок");return;}
 if(photo){
  tx.before=before[0];tx.actual=before[0];tx.has_actual=1;
  if(before[0]==(unsigned char)tx.requested){transaction_finish(&tx,"confirmed",photo_finish?"Обучение фотометки уже выключено в ПЛК":"Обучение фотометки уже включено в ПЛК");return;}
  if(before[0]!=tx.expected[0]){transaction_finish(&tx,"conflict","Режим обучения изменился в ПЛК. Проверьте его состояние");return;}
 }
 if(tx.reset){unsigned char counter[8];if(!m[tx.field].valid||fresh_read(c,tx.field,&m[tx.field],counter)!=1||!decode_value(&defs[tx.field],counter,&tx.before)){transaction_finish(&tx,"rejected","Нет свежего показания счётчика");return;}}
 if(d->opposite>=0){unsigned char other[8];if(!m[d->opposite].valid||fresh_read(c,d->opposite,&m[d->opposite],other)!=1||other[0]){transaction_finish(&tx,"rejected","Встречное направление активно или недоступно");return;}}
 if(d->mode!=CMD_TOGGLE&&before[0]){transaction_finish(&tx,"rejected","Команда уже активна со стороны ПЛК или HMI");return;}
 value=photo?(unsigned char)tx.requested:d->mode==CMD_TOGGLE?(unsigned char)!before[0]:1;
 if(!tx.reset){tx.before=before[0];tx.requested=value;}
 if(d->mode==CMD_HOLD||d->mode==CMD_PULSE){
  lock(&app.mutex);int desired=app.command.desired&&now_ms()<app.command.deadline;
  int saved=desired&&command_journal(tx.command-1);if(saved){app.command.owned=1;copy_s(app.command.ip,64,app.ip);copy_s(app.command.netid,64,app.netid);app.command.port=app.ads_port;}unlock(&app.mutex);
  if(!saved){transaction_finish(&tx,"cancelled",desired?"Не удалось сохранить задание снятия команды":"Нажатие уже отпущено");return;}
 }
 if(!version_current(c,version)){lock(&app.mutex);app.command.desired=0;unlock(&app.mutex);transaction_finish(&tx,"rejected","Описание ПЛК изменилось до отправки команды");return;}
 tx.sent=1;diagnostic_transaction_event(&tx,"transaction.sent");lock(&app.mutex);app.tx.sent=1;copy_s(app.tx.status,24,"verifying");unlock(&app.mutex);
 int rc=ads_write_field(c,&fresh,&value,1,1);
 if(rc!=1){lock(&app.mutex);app.command.desired=0;unlock(&app.mutex);transaction_finish(&tx,rc==0?"uncertain":"rejected",rc==0?"Ответ на команду потерян. Повтора нет; ожидается снятие сигнала":"ПЛК отклонил команду");if(!rc)offline("Нет связи во время команды");return;}
 if(d->mode==CMD_HOLD){lock(&app.mutex);app.command.asserted=1;copy_s(app.command.message,256,"Ручной ход: удерживайте кнопку");unlock(&app.mutex);return;}
 if(photo){
  unsigned char actual[8];
  if(fresh_read(c,f,&fresh,actual)!=1||!version_current(c,version)){tx.has_actual=0;transaction_finish(&tx,"uncertain","Команда обучения отправлена, но состояние ПЛК не подтверждено. Проверьте показания; повторной отправки нет");return;}
  tx.actual=actual[0];tx.has_actual=1;
  transaction_finish(&tx,actual[0]==value?"confirmed":"not_applied",actual[0]!=value?"ПЛК изменил режим обучения. Проверьте состояние станка":value?"ПЛК подтвердил включение обучения фотометки":"ПЛК подтвердил завершение обучения фотометки");return;
 }
 tx.has_actual=0;
 if(tx.reset){
  /* Observe the reset while its pulse is asserted. A running line may count
     a new package immediately after release; that is not a failed reset. */
  unsigned char counter[8];int zero=0,readable=1;pause_ms(80);
  for(int n=0;n<6;n++){
   if(fresh_read(c,tx.field,&m[tx.field],counter)!=1||!decode_value(&defs[tx.field],counter,&tx.actual)||!version_current(c,version)){readable=0;break;}
   tx.has_actual=1;if(tx.actual==0){zero=1;break;}pause_ms(20);
  }
  if(!command_release(c,m,version)){transaction_finish(&tx,"uncertain","Команда передана; снятие сигнала пока не подтверждено");return;}
  if(!readable){transaction_finish(&tx,"uncertain","Команда сброса отправлена; результат не прочитан");return;}
  if(!zero){transaction_finish(&tx,"not_applied","Команда сброса отправлена, но счётчик не обнулился");return;}
 }else if(d->mode==CMD_PULSE){pause_ms(80);if(!command_release(c,m,version)){transaction_finish(&tx,"uncertain","Команда передана; снятие сигнала пока не подтверждено");return;}}
 snprintf(message,sizeof(message),"%s",tx.reset?"ПЛК подтвердил обнуление счётчика":d->mode==CMD_SET?"Запрос применения настроек передан ПЛК":"Команда передана ПЛК");transaction_finish(&tx,"confirmed",message);
}
static void command_service(Ads *c,Meta *m,unsigned char version){
 lock(&app.mutex);int owned=app.command.owned,ci=app.command.command-1;
 int active=owned&&app.command.asserted&&ci>=0&&commands[ci].mode==CMD_HOLD;
 if(active&&(!manual_ready(now_ms())||now_ms()>=app.command.deadline||atomic_load(&app.quitting)))app.command.desired=0;
 int release=owned&&(!app.command.desired||atomic_load(&app.quitting))&&now_ms()>=app.command.retry;
 if(release)app.command.retry=now_ms()+400;
 Transaction tx=app.tx;int finish=app.busy&&tx.command==ci+1;
 unlock(&app.mutex);
 if(release&&command_release(c,m,version)&&finish)transaction_finish(&tx,"confirmed","Ручная команда снята");
}
static void command_json(Buffer *b,uint64_t now,int engineer){
 bf(b,",\"commandLease\":{\"active\":%s,\"pendingRelease\":%s,\"id\":",app.command.asserted&&app.command.desired?"true":"false",app.command.owned?"true":"false");bj(b,app.command.id);bf(b,",\"message\":");bj(b,app.command.message);bf(b,"},\"commands\":{");
 for(int n=0;n<COMMAND_COUNT;n++){if(n)bf(b,",");bj(b,commands[n].key);bf(b,":{\"available\":%s,\"held\":%s,\"kind\":%d,\"field\":",command_available(n,now,engineer)?"true":"false",app.command.asserted&&app.command.command==n+1?"true":"false",commands[n].mode);bj(b,defs[commands[n].field].key);bf(b,"}");}bf(b,"}");
}
#endif
