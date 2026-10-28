#ifndef SCADA_HTTP_H
#define SCADA_HTTP_H
static Socket listener=BAD_SOCKET;
static int header_value(const char *headers,const char *name,char *out,size_t cap){
 size_t n=strlen(name);const char *p=strstr(headers,"\r\n");int found=0;
 while(p&&p[2]){p+=2;const char *end=strstr(p,"\r\n");if(!end)return -1;if(end==p)break;
  if((size_t)(end-p)>n&&p[n]==':'){int match=1;for(size_t i=0;i<n;i++){char a=p[i],b=name[i];if(a>='A'&&a<='Z')a+=32;if(b>='A'&&b<='Z')b+=32;if(a!=b){match=0;break;}}
   if(match){if(found)return -1;const char *v=p+n+1;while(v<end&&(*v==' '||*v=='\t'))v++;while(end>v&&(end[-1]==' '||end[-1]=='\t'))end--;if((size_t)(end-v)>=cap)return -1;memcpy(out,v,(size_t)(end-v));out[end-v]=0;found=1;}}
  p=strstr(p,"\r\n");
 }return found;
}
static char http_cookie[220];
static int request_engineer(const char *headers){
 char cookies[600];if(header_value(headers,"Cookie",cookies,sizeof(cookies))!=1)return 0;
 char *p=cookies;while(*p){while(*p==' '||*p==';')p++;char *end=strchr(p,';');if(end)*end=0;if(!strncmp(p,"scada_session=",14)&&auth_engineer(p+14))return 1;if(!end)break;p=end+1;}return 0;
}
static void http_response(Socket s,int status,const char *mime,const unsigned char *body,size_t bytes){
 char h[1800];const char *text=status==200?"OK":status==202?"Accepted":status==400?"Bad Request":status==403?"Forbidden":status==404?"Not Found":status==409?"Conflict":status==429?"Too Many Requests":status==422?"Unprocessable Entity":"Service Unavailable";
 int n=snprintf(h,sizeof(h),"HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %zu\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'self'; script-src 'self' 'nonce-%s'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'\r\n%s\r\n",status,text,mime,bytes,app.token,http_cookie);
 uint64_t deadline=now_ms()+3500;if(n>0&&(size_t)n<sizeof(h)&&io_bytes(s,(unsigned char*)h,(size_t)n,1,deadline)&&bytes)io_bytes(s,(unsigned char*)body,bytes,1,deadline);
}
static void http_message(Socket s,int status,const char *message){char body[700];Buffer b;binit(&b,body,sizeof(body));bf(&b,"{\"message\":");bj(&b,message);bf(&b,"}");http_response(s,status,"application/json; charset=utf-8",(unsigned char*)body,b.used);}
static unsigned char *read_file(const char*,size_t*);
#include "diagnostic_export.h"
static unsigned char *read_file(const char *rel,size_t *size){char path[2400];path_join(path,rel);FILE *f=file_open(path,"rb");if(!f)return NULL;if(fseek(f,0,SEEK_END)||ftell(f)<0){fclose(f);return NULL;}long n=ftell(f);rewind(f);if(n>2000000){fclose(f);return NULL;}unsigned char *data=malloc((size_t)n+1);if(!data){fclose(f);return NULL;}if(fread(data,1,(size_t)n,f)!=(size_t)n){free(data);fclose(f);return NULL;}fclose(f);data[n]=0;*size=(size_t)n;return data;}
static unsigned char *expand_boot(const unsigned char *text,size_t size,size_t *outsize){
 const char *at=strstr((const char*)text,"@@SCADA_TOKEN@@");if(!at)return NULL;size_t off=(size_t)(at-(const char*)text),tag=strlen("@@SCADA_TOKEN@@"),n=size-tag+strlen(app.token);
 unsigned char *out=malloc(n+1);if(!out)return NULL;memcpy(out,text,off);memcpy(out+off,app.token,strlen(app.token));memcpy(out+off+strlen(app.token),text+off+tag,size-off-tag);out[n]=0;
 /* The same token is used as the nonce of the tiny bootstrap script. */
 char *nonce=strstr((char*)out,"@@SCADA_NONCE@@");if(nonce){size_t pos=(size_t)(nonce-(char*)out),old=strlen("@@SCADA_NONCE@@"),nn=n-old+strlen(app.token);unsigned char *second=malloc(nn+1);if(!second){free(out);return NULL;}memcpy(second,out,pos);memcpy(second+pos,app.token,strlen(app.token));memcpy(second+pos+strlen(app.token),out+pos+old,n-pos-old);second[nn]=0;free(out);out=second;n=nn;}
 char *kiosk=strstr((char*)out,"@@SCADA_KIOSK@@");if(kiosk){lock(&app.mutex);const char *value=app.ui_kiosk?"true":"false";unlock(&app.mutex);size_t pos=(size_t)(kiosk-(char*)out),old=strlen("@@SCADA_KIOSK@@"),nn=n-old+strlen(value);unsigned char *second=malloc(nn+1);if(!second){free(out);return NULL;}memcpy(second,out,pos);memcpy(second+pos,value,strlen(value));memcpy(second+pos+strlen(value),out+pos+old,n-pos-old);second[nn]=0;free(out);out=second;n=nn;}
 char *theme=strstr((char*)out,"@@SCADA_THEME@@");if(theme){lock(&app.mutex);const char *value=display_theme_code(app.options.theme);unlock(&app.mutex);size_t pos=(size_t)(theme-(char*)out),old=strlen("@@SCADA_THEME@@"),nn=n-old+strlen(value);unsigned char *second=malloc(nn+1);if(!second){free(out);return NULL;}memcpy(second,out,pos);memcpy(second+pos,value,strlen(value));memcpy(second+pos+strlen(value),out+pos+old,n-pos-old);second[nn]=0;free(out);out=second;n=nn;}
 *outsize=n;return out;
}
static int connect_config(Pair *p,int n,char *reason,size_t cap){
 const char *ip=pair_get(p,n,"ip"),*net=pair_get(p,n,"netId"),*port=pair_get(p,n,"port"),*enabled=pair_get(p,n,"enabled");double pr,en;unsigned char ni[6];struct in_addr a;
 if(n!=4||!ip||!net||strlen(ip)>=64||strlen(net)>=64||inet_pton(AF_INET,ip,&a)!=1||!netid_parse(net,ni)||!number_parse(port,&pr)||pr<1||pr>65535||floor(pr)!=pr||!number_parse(enabled,&en)||(en!=0&&en!=1)){copy_s(reason,cap,"Проверьте IP, AMS Net ID и порт ADS");return 422;}
 uint32_t host=ntohl(a.s_addr);if(!host||host==0xffffffffu||(host>>24)>=224){copy_s(reason,cap,"Нужен адрес конкретного ПЛК");return 422;}
 lock(&app.mutex);if(app.unwinder.mode!=UNWINDER_NORMAL&&(strcmp(ip,app.unwinder.ip)||strcmp(net,app.unwinder.netid)||(unsigned)pr!=app.unwinder.port||en!=1)){unlock(&app.mutex);copy_s(reason,cap,"Сначала включите контроль размотчика перед изменением подключения");return 409;}if(app.cleaning.pending&&(strcmp(ip,app.cleaning.ip)||strcmp(net,app.cleaning.netid)||(unsigned)pr!=app.cleaning.port||en!=1)){unlock(&app.mutex);copy_s(reason,cap,"До подтверждения возврата 10 нельзя менять ПЛК или отключать связь");return 409;}if(app.command.owned){unlock(&app.mutex);copy_s(reason,cap,"Дождитесь снятия ручной команды");return 409;}if(app.busy){unlock(&app.mutex);copy_s(reason,cap,"Сначала дождитесь результата записи");return 409;}
 copy_s(app.ip,sizeof(app.ip),ip);copy_s(app.netid,sizeof(app.netid),net);app.ads_port=(unsigned)pr;app.wanted_connection=(int)en;app.config_serial++;app.connected=0;for(int i=0;i<F_COUNT;i++)app.fields[i].quality=0;unlock(&app.mutex);
 char path[2400];path_join(path,"connection.json");FILE *f=file_open(path,"wb");if(f){char b[500];Buffer buf;binit(&buf,b,sizeof(b));bf(&buf,"{\"ip\":");bj(&buf,ip);bf(&buf,",\"netId\":");bj(&buf,net);bf(&buf,",\"port\":%.0f,\"enabled\":%.0f}\n",pr,en);fwrite(b,1,buf.used,f);fclose(f);}
 copy_s(reason,cap,en?"Подключаемся к ПЛК…":"Соединение отключено");return 202;
}
#include "manuals.h"
static void http_client(Socket s){
 http_cookie[0]=0;
 unsigned char buffer[139265];size_t used=0;char *end=NULL;uint64_t deadline=now_ms()+2000;
 while(used<8192&&!end){if(wait_io(s,0,300)<=0){if(now_ms()>=deadline)return;continue;}int n=recv(s,(char*)buffer+used,(int)(8192-used),0);if(n<=0)return;used+=(size_t)n;buffer[used]=0;end=strstr((char*)buffer,"\r\n\r\n");}
 if(!end){http_message(s,400,"Запрос слишком большой");return;}size_t header_length=(size_t)(end-(char*)buffer)+4;
 char method[16],route[2048],proto[20],extra;if(sscanf((char*)buffer,"%15s %2047s %19s%c",method,route,proto,&extra)!=4||extra!='\r'||strcmp(proto,"HTTP/1.1")){http_message(s,400,"Некорректный HTTP-запрос");return;}
 if(header_length>8192){http_message(s,400,"Заголовки слишком большие");return;}char headers[8193];memcpy(headers,buffer,header_length);headers[header_length]=0;
 char host[100],expected_host[100],origin[180],expected_origin[180],token[100],cl[40],transfer[80];snprintf(expected_host,sizeof(expected_host),"127.0.0.1:%u",app.http_port);snprintf(expected_origin,sizeof(expected_origin),"http://%s",expected_host);
 if(header_value(headers,"Host",host,sizeof(host))!=1||strcmp(host,expected_host)||header_value(headers,"Origin",origin,sizeof(origin))<0){http_message(s,403,"Доступ разрешён только локальному интерфейсу");return;}
 if(header_value(headers,"Origin",origin,sizeof(origin))==1&&strcmp(origin,expected_origin)){http_message(s,403,"Источник запроса не разрешён");return;}
 int api=!strncmp(route,"/api/",5);
 if(api&&(header_value(headers,"X-SCADA-Token",token,sizeof(token))!=1||strcmp(token,app.token))){http_message(s,403,"Недействительная сессия интерфейса");return;}
 int engineer=request_engineer(headers);
 if(!strcmp(method,"GET")){
  if(!strcmp(route,"/api/diagnostics/status")||!strncmp(route,"/api/diagnostics/chunk?",23)){
   if(!engineer){http_message(s,403,"Требуется вход инженера");return;}
   if(!strncmp(route,"/api/diagnostics/chunk?",23)){diagnostic_chunk_http(s,route);return;}
   char data[2400];size_t n=diagnostic_status_json(data,sizeof(data));http_response(s,200,"application/json; charset=utf-8",(unsigned char*)data,n);return;
  }
  if(!strncmp(route,"/api/production",15)){
   int shift=!strcmp(route,"/api/production/shift")||!strncmp(route,"/api/production/shift?",22);
   if(!engineer&&strcmp(route,"/api/production")&&!shift&&strncmp(route,"/api/production/job/",20)){http_message(s,403,"Детализация производства доступна инженеру");return;}
   size_t cap=4194304;char *data=malloc(cap);size_t n=0;int status=503;
   if(data){
    if(!strcmp(route,"/api/production"))n=production_list_json(data,cap,engineer);
    else if(shift){n=production_shift_json(data,cap,route);status=422;}
    else if(!strncmp(route,"/api/production/history?",24)){n=production_history_json(data,cap,route);status=422;}
    else if(!strncmp(route,"/api/production/job/",20)){n=production_detail_json(data,cap,route+20,0);status=404;}
    else if(!strncmp(route,"/api/production/interval/",25)){n=production_detail_json(data,cap,route+25,1);status=404;}
    else if(!strcmp(route,"/api/production/export")||!strncmp(route,"/api/production/export?",23)){n=production_export_json(data,cap,route);status=422;}
    else status=404;
   }
   if(n)http_response(s,200,"application/json; charset=utf-8",(unsigned char*)data,n);else http_message(s,status,"Данные производства недоступны или запрос некорректен");free(data);return;
  }
  if(!strcmp(route,"/api/manuals")||!strcmp(route,"/api/manuals?refresh=1")){if(strchr(route,'?'))manual_next_scan=0;char *data=malloc(256000);size_t n=data?manual_list_json(data,256000):0;if(!n)http_message(s,503,"Не удалось получить список мануалов");else http_response(s,200,"application/json; charset=utf-8",(unsigned char*)data,n);free(data);return;}
  if(!strncmp(route,"/api/manual/",12)){manual_content_http(s,route+12);return;}
  if(!strncmp(route,"/manual-media/",14)){manual_photo_http(s,route+14);return;}
  if(!strcmp(route,"/api/io")){char data[20000];size_t size=io_json(data,sizeof(data));if(!size){http_message(s,503,"Не удалось сформировать диагностику");return;}http_response(s,200,"application/json; charset=utf-8",(unsigned char*)data,size);return;}
  if(!strcmp(route,"/api/state")){size_t cap=65536u+F_COUNT*1024u;char *data=malloc(cap);size_t size=data?state_json(data,cap,engineer):0;if(!size){free(data);http_message(s,503,"Не удалось сформировать состояние");return;}http_response(s,200,"application/json; charset=utf-8",(unsigned char*)data,size);free(data);return;}
  if(!strcmp(route,"/api/report")){size_t cap=65536u+F_COUNT*1024u;char *data=malloc(cap);size_t size=data?diagnostic_report_json(data,cap,engineer):0;if(!size){free(data);http_message(s,503,"Не удалось сформировать отчёт");return;}http_response(s,200,"application/json; charset=utf-8",(unsigned char*)data,size);free(data);return;}
  const char *rel=NULL,*mime=NULL;int boot=0;char want[150];snprintf(want,sizeof(want),"/?k=%s",app.token);
  if(!strcmp(route,want)){rel="ui/index.html";mime="text/html; charset=utf-8";boot=1;}
  else if(!strcmp(route,"/engineering.json")){rel="ui/engineering.json";mime="application/json; charset=utf-8";}
  else if(!strcmp(route,"/performance.json")){rel="ui/performance.json";mime="application/json; charset=utf-8";}
  else if(!strcmp(route,"/functionality.json")){rel="ui/functionality.json";mime="application/json; charset=utf-8";}
  else if(!strcmp(route,"/functionality.js")){rel="ui/functionality.js";mime="text/javascript; charset=utf-8";}
  else if(!strcmp(route,"/alarms.json")){rel="ui/alarms.json";mime="application/json; charset=utf-8";}
  else if(!strcmp(route,"/diagnostics.js")){rel="ui/diagnostics.js";mime="text/javascript; charset=utf-8";}
  else if(!strcmp(route,"/app.js")){rel="ui/app.js";mime="text/javascript; charset=utf-8";}
  else if(!strcmp(route,"/production.js")){rel="ui/production.js";mime="text/javascript; charset=utf-8";}
  else if(!strcmp(route,"/production.css")){rel="ui/production.css";mime="text/css; charset=utf-8";}
  else if(!strcmp(route,"/manuals.js")){rel="ui/manuals.js";mime="text/javascript; charset=utf-8";}
  else if(!strcmp(route,"/manuals.css")){rel="ui/manuals.css";mime="text/css; charset=utf-8";}
  else if(!strcmp(route,"/vendor/marked-17.0.5.umd.js")){rel="ui/vendor/marked-17.0.5.umd.js";mime="text/javascript; charset=utf-8";}
  else if(!strcmp(route,"/io.js")){rel="ui/io.js";mime="text/javascript; charset=utf-8";}
  else if(!strcmp(route,"/io_catalog.json")){rel="ui/io_catalog.json";mime="application/json; charset=utf-8";}
  else if(!strcmp(route,"/style.css")){rel="ui/style.css";mime="text/css; charset=utf-8";}
  else if(!strcmp(route,"/themes.css")){rel="ui/themes.css";mime="text/css; charset=utf-8";}
  else if(!strcmp(route,"/mockup.css")){rel="ui/mockup.css";mime="text/css; charset=utf-8";}
  else if(!strcmp(route,"/mechanisms.js")){rel="ui/mechanisms.js";mime="text/javascript; charset=utf-8";}
  else if(!strcmp(route,"/i18n.js")){rel="ui/i18n.js";mime="text/javascript; charset=utf-8";}
  else if(!strncmp(route,"/locales/",9)){const char *name=route+9;size_t len=strlen(name);char code[20];if(len>5&&len<24&&!strcmp(name+len-5,".json")){memcpy(code,name,len-5);code[len-5]=0;if(language_code_ok(code)){snprintf(want,sizeof(want),"ui/locales/%s.json",code);rel=want;mime="application/json; charset=utf-8";}}}
  else if(!strncmp(route,"/assets/flags/",14)){const char *name=route+14;size_t len=strlen(name);char code[20];if(len>4&&len<23&&!strcmp(name+len-4,".svg")){memcpy(code,name,len-4);code[len-4]=0;if(language_code_ok(code)){snprintf(want,sizeof(want),"ui/assets/flags/%s.svg",code);rel=want;mime="image/svg+xml";}}}
  else if(!strcmp(route,"/assets/brand.png")){rel="ui/assets/brand.png";mime="image/png";}
  else if(!strcmp(route,"/favicon.svg")){rel="ui/favicon.svg";mime="image/svg+xml";}
  if(!rel){http_message(s,404,"Страница не найдена");return;}
  size_t size=0;unsigned char *data=read_file(rel,&size);if(!data){http_message(s,503,"Файлы интерфейса не найдены. Распакуйте весь архив");return;}
  if(boot){size_t n=0;unsigned char *expanded=expand_boot(data,size,&n);free(data);data=expanded;size=n;if(!data){http_message(s,503,"Ошибка загрузки интерфейса");return;}}
  if(boot){lock(&app.mutex);app.ui_document_count++;unlock(&app.mutex);}
  http_response(s,200,mime,data,size);free(data);return;
 }
 if(strcmp(method,"POST")||!api){http_message(s,403,"Метод не разрешён");return;}
 if(header_value(headers,"Transfer-Encoding",transfer,sizeof(transfer))!=0||header_value(headers,"Content-Length",cl,sizeof(cl))!=1){http_message(s,400,"Нужна явная длина JSON-запроса");return;}
 double length_d;if(!number_parse(cl,&length_d)||length_d<2||length_d>(!strcmp(route,"/api/production/import")?131072:2048)||floor(length_d)!=length_d){http_message(s,400,"Некорректная длина запроса");return;}size_t length=(size_t)length_d;
 if(header_length+length>=sizeof(buffer)){http_message(s,400,"Запрос слишком большой");return;}
 while(used<header_length+length){if(now_ms()>=deadline||wait_io(s,0,300)<=0){if(now_ms()>=deadline)return;continue;}int n=recv(s,(char*)buffer+used,(int)(header_length+length-used),0);if(n<=0)return;used+=(size_t)n;}buffer[header_length+length]=0;
 if(memchr(buffer+header_length,0,length)){http_message(s,400,"Нулевые байты в JSON не разрешены");return;}
 if(!strcmp(route,"/api/production/import")){char reason[300];int status=production_import((char*)buffer+header_length,engineer,reason,sizeof(reason));http_message(s,status,reason);return;}
 Pair pairs[8];int count=json_pairs((char*)buffer+header_length,pairs,8);if(count<0){http_message(s,400,"Нужен корректный JSON-запрос");return;}
 char reason[300]={0};int status=400;
 if(!strcmp(route,"/api/ui-ready")){
  if(count!=0){copy_s(reason,sizeof(reason),"Нужен пустой объект");status=400;}
  else {lock(&app.mutex);app.ui_ready_count++;unlock(&app.mutex);copy_s(reason,sizeof(reason),"Интерфейс загружен");status=200;}
 }
 else if(!strcmp(route,"/api/ui-error")){
  if(count!=1||!pair_get(pairs,count,"message")||pairs[0].number){copy_s(reason,sizeof(reason),"Нужно текстовое сообщение");status=400;}
  else {lock(&app.mutex);app.ui_error_count++;diagnostic_clean_text(app.ui_error,sizeof(app.ui_error),pair_get(pairs,count,"message"));char error_json[1200];Buffer eb;binit(&eb,error_json,sizeof(error_json));bf(&eb,"{\"count\":%u,\"message\":",app.ui_error_count);bj(&eb,app.ui_error);bf(&eb,"}");unlock(&app.mutex);if(!eb.failed)diagnostic_event("ui.error",error_json);copy_s(reason,sizeof(reason),"Ошибка интерфейса записана");status=200;}
 }
 else if(!strcmp(route,"/api/diagnostics/client")){
  const char *agent=pair_get(pairs,count,"userAgent");if(!engineer){status=403;copy_s(reason,sizeof(reason),"Требуется вход инженера");}else if(count!=1||!agent||pairs[0].number||strlen(agent)>=sizeof(app.diag_user_agent)){status=422;copy_s(reason,sizeof(reason),"Некорректные сведения интерфейса");}else{lock(&app.mutex);diagnostic_clean_text(app.diag_user_agent,sizeof(app.diag_user_agent),agent);unlock(&app.mutex);status=200;copy_s(reason,sizeof(reason),"Сведения интерфейса сохранены");}
 }
 else if(!strcmp(route,"/api/diagnostics/export")){if(!engineer){copy_s(reason,sizeof(reason),"Требуется вход инженера");status=403;}else status=diagnostic_export_request(pairs,count,reason,sizeof(reason));}
 else if(!strcmp(route,"/api/production/action")){if(!engineer){copy_s(reason,sizeof(reason),"Детализация производства доступна инженеру");status=403;}else status=production_action(pairs,count,reason,sizeof(reason));}
 else if(!strcmp(route,"/api/engineering-view"))status=engineering_select(pairs,count,reason,sizeof(reason),engineer);
 else if(!strcmp(route,"/api/io-view"))status=io_select(pairs,count,reason,sizeof(reason));
 else if(!strcmp(route,"/api/command"))status=enqueue_command(pairs,count,reason,sizeof(reason),engineer);
 else if(!strcmp(route,"/api/write"))status=enqueue_write(pairs,count,reason,sizeof(reason),engineer);
 else if(!strcmp(route,"/api/counter-reset"))status=enqueue_counter_reset(pairs,count,reason,sizeof(reason),engineer);
 else if(!strcmp(route,"/api/unwinder"))status=unwinder_request(pairs,count,reason,sizeof(reason),engineer);
 else if(!strcmp(route,"/api/cleaning-add"))status=cleaning_add(pairs,count,reason,sizeof(reason),engineer);
 else if(!strcmp(route,"/api/cleaning-stop"))status=cleaning_cancel(pairs,count,reason,sizeof(reason));
 else if(!strcmp(route,"/api/auth/login"))status=auth_request(pairs,count,0,reason,sizeof(reason),http_cookie);
 else if(!strcmp(route,"/api/auth/setup"))status=auth_request(pairs,count,1,reason,sizeof(reason),http_cookie);
 else if(!strcmp(route,"/api/auth/operator")&&count==0){app.auth.session[0]=0;copy_s(http_cookie,sizeof(http_cookie),"Set-Cookie: scada_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0\r\n");account_event("operator_login");copy_s(reason,sizeof(reason),"Выбран профиль: Оператор");status=200;}
 else if(!strcmp(route,"/api/auth/password")){if(!engineer){copy_s(reason,sizeof(reason),"Требуется вход инженера");status=403;}else status=auth_change_password(pairs,count,reason,sizeof(reason),http_cookie);}
 else if(!strcmp(route,"/api/language"))status=language_save(pairs,count,reason,sizeof(reason));
 else if(!strcmp(route,"/api/options")||!strcmp(route,"/api/connect")){
  if(!engineer){copy_s(reason,sizeof(reason),"Требуется вход инженера");status=403;}
  else status=!strcmp(route,"/api/options")?options_save(pairs,count,reason,sizeof(reason)):connect_config(pairs,count,reason,sizeof(reason));
 }
 else if(!strcmp(route,"/api/quit")&&count==0){request_quit();http_message(s,202,"Завершаем работу; возвращаем временные режимы в нормальное состояние");return;}
 else {copy_s(reason,sizeof(reason),"Команда не найдена");status=404;}
 http_message(s,status,reason);
}
static int http_open(void){
 listener=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);if(listener==BAD_SOCKET)return 0;
 struct sockaddr_in a;memset(&a,0,sizeof(a));a.sin_family=AF_INET;a.sin_addr.s_addr=htonl(INADDR_LOOPBACK);a.sin_port=0;
 if(bind(listener,(struct sockaddr*)&a,sizeof(a))||listen(listener,12)||!set_nonblocking(listener))return 0;
#ifdef _WIN32
 int n=sizeof(a);
#else
 socklen_t n=sizeof(a);
#endif
 if(getsockname(listener,(struct sockaddr*)&a,&n))return 0;
 app.http_port=ntohs(a.sin_port);snprintf(app.url,sizeof(app.url),"http://127.0.0.1:%u/?k=%s",app.http_port,app.token);return 1;
}
static void http_run(void){while(!atomic_load(&app.stop)){if(wait_io(listener,0,200)<=0)continue;Socket s=accept(listener,NULL,NULL);if(s==BAD_SOCKET)continue;set_nonblocking(s);http_client(s);sock_close(s);}if(listener!=BAD_SOCKET){sock_close(listener);listener=BAD_SOCKET;}}
#endif
