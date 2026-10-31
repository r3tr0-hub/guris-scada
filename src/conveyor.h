#ifndef SCADA_CONVEYOR_H
#define SCADA_CONVEYOR_H
/* The original HMI exposes two independent BOOLs, not a three-valued PLC enum.
   One logical operation owns the normal transaction queue for the entire change.
   Only confirmed zero of the opposite bit permits setting the desired bit. */
static const char *conveyor_mode_name(int mode){return mode==0?"off":mode==1?"timed":mode==2?"continuous":mode==3?"conflict":"unknown";}
static int conveyor_pair_mode(const unsigned char pair[2]){return pair[0]+2*pair[1];}
/* Caller holds app.mutex. Read quality is independent from permission to write. */
static int conveyor_observed(uint64_t now){
 if(!app.connected)return -1;
 int fields[]={F_TIMED,F_CONT};for(int k=0;k<2;k++){Reading *r=&app.fields[fields[k]];if(!r->quality||now-r->observed>1500||!binding_ready(fields[k],now))return -1;}
 return (int)app.fields[F_TIMED].value+2*(int)app.fields[F_CONT].value;
}
static int conveyor_available(uint64_t now){
 if(conveyor_observed(now)<0||app.ads_status!=5||app.busy||app.command.owned||app.command.storage_error||app.cleaning.restoring||app.unwinder.mode==UNWINDER_RESTORE||atomic_load(&app.quitting))return 0;
 int fields[]={F_TIMED,F_CONT};for(int k=0;k<2;k++){int i=fields[k];if(!defs[i].writable||!metadata_matches(i,&app.fields[i].meta)||(app.fields[i].meta.flags&32u)||!range_ready(i,now))return 0;}
 return 1;
}
static void conveyor_json(Buffer *b,uint64_t now){
 bf(b,",\"conveyor\":{\"mode\":");bj(b,conveyor_mode_name(conveyor_observed(now)));bf(b,",\"available\":%s}",conveyor_available(now)?"true":"false");
}
static void conveyor_event(const Transaction *tx,const char *stage,const unsigned char pair[2]){
 char text[700];Buffer b;binit(&b,text,sizeof(text));bf(&b,"{\"operationId\":");bj(&b,tx->id);bf(&b,",\"actor\":");bj(&b,tx->actor);bf(&b,",\"stage\":");bj(&b,stage);
 bf(&b,",\"requestedMode\":");bj(&b,conveyor_mode_name(tx->conveyor-1));bf(&b,",\"confirmedSteps\":%d,\"timed\":%u,\"continuous\":%u,\"expectedTimed\":%u,\"expectedContinuous\":%u,\"adsError\":%u,\"epoch\":%u}",tx->conveyor_steps,pair[0],pair[1],tx->conveyor_expected[0],tx->conveyor_expected[1],tx->error,tx->epoch);
 if(!b.failed)diagnostic_event("conveyor.transition",text);
}
static int enqueue_conveyor(Pair *pairs,int count,char *reason,size_t cap,int engineer){
 const char *id=pair_get(pairs,count,"id"),*name=pair_get(pairs,count,"mode");double epoch;
 int mode=name&&!strcmp(name,"off")?0:name&&!strcmp(name,"timed")?1:name&&!strcmp(name,"continuous")?2:-1;
 Transaction tx;memset(&tx,0,sizeof(tx));tx.field=F_TIMED;tx.conveyor=mode+1;tx.requested=mode;
 if(count!=5||mode<0||!valid_operation_id(id)||!number_parse(pair_get(pairs,count,"epoch"),&epoch)||epoch<0||epoch>UINT32_MAX||floor(epoch)!=epoch||!hex_raw(pair_get(pairs,count,"expectedTimed"),1,tx.conveyor_expected)||!hex_raw(pair_get(pairs,count,"expectedContinuous"),1,tx.conveyor_expected+1)||tx.conveyor_expected[0]>1||tx.conveyor_expected[1]>1){copy_s(reason,cap,"Некорректный запрос режима конвейера");return 400;}
 tx.epoch=(unsigned)epoch;copy_s(tx.id,sizeof(tx.id),id);copy_s(tx.actor,sizeof(tx.actor),engineer?"local-engineer":"local-operator");copy_s(tx.status,sizeof(tx.status),"queued");tx.expected[0]=tx.conveyor_expected[0];tx.wanted[0]=(unsigned char)(mode==1);
 lock(&app.mutex);
 if(!strcmp(app.tx.id,id)){int same=app.tx.conveyor==tx.conveyor&&app.tx.epoch==tx.epoch&&!memcmp(app.tx.conveyor_expected,tx.conveyor_expected,2);unlock(&app.mutex);copy_s(reason,cap,same?"Операция уже зарегистрирована":"Номер операции уже использован");return same?202:409;}
 for(unsigned k=0;k<app.history_n;k++)if(!strcmp(app.history[k].id,id)){unlock(&app.mutex);copy_s(reason,cap,"Операция уже выполнена; повторной отправки нет");return 409;}
 uint64_t now=now_ms();int before=conveyor_observed(now);
 if(!conveyor_available(now)||app.epoch!=tx.epoch){unlock(&app.mutex);copy_s(reason,cap,"Режим конвейера недоступен: дождитесь свежих данных и завершения текущей операции");return 409;}
 if(app.fields[F_TIMED].raw[0]!=tx.conveyor_expected[0]||app.fields[F_CONT].raw[0]!=tx.conveyor_expected[1]){unlock(&app.mutex);copy_s(reason,cap,"Режим конвейера изменился. Повторно проверьте показания");return 409;}
 if(before==3&&mode!=0){unlock(&app.mutex);copy_s(reason,cap,"Противоречивые режимы. Сначала выберите «Выкл»");return 409;}
 tx.before=before;tx.actual=before;tx.has_actual=1;app.tx=tx;app.queue=1;app.busy=1;diagnostic_transaction_event(&tx,"transaction.queued");conveyor_event(&tx,"queued",tx.conveyor_expected);unlock(&app.mutex);
 copy_s(reason,cap,"Переключение поставлено в очередь; ожидаем подтверждение обоих режимов");return 202;
}
/* Validate identity and read both BOOLs as one version-bounded observation.
   No address from documentation is used as a permanent write location. */
static int conveyor_live(Ads *c,Meta *metas,unsigned char version,const Transaction *tx,unsigned char pair[2],int lookup){
 unsigned run;if(atomic_load(&app.stop)||atomic_load(&app.quitting)||ads_state(c,&run)!=1||run!=5||!version_current(c,version))return 0;
 lock(&app.mutex);int same=app.epoch==tx->epoch;unlock(&app.mutex);if(!same)return 0;
 int ids[]={F_TIMED,F_CONT};for(int k=0;k<2;k++){
  int i=ids[k];Meta *m=&metas[i];if(lookup){Meta fresh;if(ads_lookup(c,defs[i].symbol,&fresh)!=1||!metadata_matches(i,&fresh)||(fresh.flags&32u)||fresh.group!=m->group||fresh.offset!=m->offset||fresh.size!=m->size)return 0;*m=fresh;}
  if(!metadata_matches(i,m)||(m->flags&32u)||!binding_live_ready(c,metas,i)||fresh_read(c,i,m,pair+k)!=1||pair[k]>1)return 0;
 }
 return version_current(c,version);
}
static void process_conveyor(Ads *c,Meta *metas,unsigned char version,Transaction tx){
 unsigned char pair[2]={0},expected[2]={tx.conveyor_expected[0],tx.conveyor_expected[1]},target[2]={(unsigned char)(tx.conveyor==2),(unsigned char)(tx.conveyor==3)};
 if(!conveyor_live(c,metas,version,&tx,pair,1)){transaction_finish(&tx,"rejected","Не удалось проверить оба режима перед переключением. Запись не отправлена");return;}
 tx.before=conveyor_pair_mode(pair);tx.actual=tx.before;tx.has_actual=1;
 if(memcmp(pair,expected,2)){transaction_finish(&tx,"conflict","Режим конвейера изменился в ПЛК. Запись не отправлена");return;}
 if(tx.before==3&&tx.conveyor!=1){transaction_finish(&tx,"conflict","Противоречивые режимы. Сначала выберите «Выкл»");return;}
 /* All zero writes precede any one write. This deliberately does not roll back
    a confirmed zero if the later enable fails: every new request needs a fresh pair. */
 int order[4]={F_TIMED,F_CONT,F_TIMED,F_CONT};
 for(int at=0;at<4;at++){
  int i=order[at],k=i==F_TIMED?0:1,value=at<2?0:1;
  if(target[k]!=value||expected[k]==value)continue;
  if(!conveyor_live(c,metas,version,&tx,pair,1)){
   tx.has_actual=0;conveyor_event(&tx,"preflight_failed",pair);transaction_finish(&tx,tx.conveyor_steps?"partial":"rejected","Переключение остановлено: условия или описание ПЛК изменились. Проверьте оба режима");return;
  }
  tx.actual=conveyor_pair_mode(pair);tx.has_actual=1;
  if(memcmp(pair,expected,2)||(value==1&&pair[1-k]!=0)){conveyor_event(&tx,"conflict",pair);transaction_finish(&tx,tx.conveyor_steps?"partial":"conflict","Сочетание режимов изменилось. Следующий шаг не отправлен");return;}
  tx.sent=1;lock(&app.mutex);app.tx.sent=1;copy_s(app.tx.status,sizeof(app.tx.status),"verifying");unlock(&app.mutex);
  conveyor_event(&tx,value?"enable_sent":"disable_sent",pair);
  unsigned char raw=(unsigned char)value;int ack=ads_write_field(c,&metas[i],&raw,1,1);
  if(ack==-1){tx.error=c->error;conveyor_event(&tx,"ads_rejected",pair);transaction_finish(&tx,tx.conveyor_steps?"partial":"rejected","ПЛК отклонил шаг переключения. Успех общего режима не подтверждён");return;}
  if(!ack){tx.has_actual=0;conveyor_event(&tx,"ack_unknown",pair);transaction_finish(&tx,"uncertain","Ответ на шаг переключения не получен. Результат неизвестен; повторной отправки и отката нет");offline("Связь потеряна во время переключения конвейера");return;}
  unsigned char wanted[2]={expected[0],expected[1]};wanted[k]=raw;unsigned equal=0;uint64_t deadline=now_ms()+2500;
  while(now_ms()<deadline&&!atomic_load(&app.stop)){
   if(!conveyor_live(c,metas,version,&tx,pair,0)){tx.has_actual=0;conveyor_event(&tx,"readback_unknown",pair);transaction_finish(&tx,"uncertain","Шаг отправлен, но оба режима не подтверждены обратным чтением. Автоматического повтора нет");ads_close(c);offline("Не удалось подтвердить переключение конвейера");return;}
   tx.actual=conveyor_pair_mode(pair);tx.has_actual=1;
   if(pair[1-k]!=wanted[1-k]){conveyor_event(&tx,"other_bit_changed",pair);transaction_finish(&tx,"uncertain","Другой режим изменился во время подтверждения. Переключение не подтверждено");return;}
   equal=!memcmp(pair,wanted,2)?equal+1:0;if(equal>=2)break;pause_ms(60);
  }
  if(equal<2){conveyor_event(&tx,"not_applied",pair);transaction_finish(&tx,atomic_load(&app.stop)?"uncertain":tx.conveyor_steps?"partial":"not_applied","Шаг переключения не подтверждён. Проверьте фактическое сочетание режимов");return;}
  memcpy(expected,wanted,2);tx.conveyor_steps++;lock(&app.mutex);app.tx.conveyor_steps=tx.conveyor_steps;unlock(&app.mutex);conveyor_event(&tx,"step_confirmed",pair);
 }
 /* Even a no-op request is confirmed by two coherent pair observations. */
 for(int n=0;n<2;n++){
  if(!conveyor_live(c,metas,version,&tx,pair,1)||memcmp(pair,target,2)){tx.has_actual=0;conveyor_event(&tx,"final_unknown",pair);transaction_finish(&tx,"uncertain","Итоговое сочетание режимов не подтверждено. Проверьте показания ПЛК");return;}
  if(n==0)pause_ms(60);
 }
 tx.actual=conveyor_pair_mode(pair);tx.has_actual=1;conveyor_event(&tx,"confirmed",pair);transaction_finish(&tx,"confirmed","ПЛК подтвердил оба бита режима конвейера обратным чтением");
}
#endif
