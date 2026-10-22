#ifndef SCADA_LOCAL_H
#define SCADA_LOCAL_H
#include <errno.h>
/* Native local identity provider. HTTP permissions are independent of UI visibility. */
#ifdef _WIN32
#include <io.h>
#else
#include <openssl/evp.h>
#endif
static int random_bytes(unsigned char *out,size_t n){
#ifdef _WIN32
 return BCryptGenRandom(NULL,out,(ULONG)n,BCRYPT_USE_SYSTEM_PREFERRED_RNG)==0;
#else
 return getrandom(out,n,0)==(ssize_t)n;
#endif
}
static void bytes_hex(const unsigned char *in,size_t n,char *out){const char *h="0123456789abcdef";for(size_t i=0;i<n;i++){out[2*i]=h[in[i]>>4];out[2*i+1]=h[in[i]&15];}out[2*n]=0;}
static int bytes_unhex(const char *s,size_t n,unsigned char *out){if(!s||strlen(s)!=n*2)return 0;for(size_t i=0;i<n;i++){unsigned char b[8]={0};char pair[3]={s[i*2],s[i*2+1],0};if(!hex_raw(pair,1,b))return 0;out[i]=b[0];}return 1;}
static int password_key(const char *password,const unsigned char salt[16],unsigned char out[32]){
#ifdef _WIN32
 BCRYPT_ALG_HANDLE algorithm=NULL;if(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_SHA256_ALGORITHM,NULL,BCRYPT_ALG_HANDLE_HMAC_FLAG)!=0)return 0;
 NTSTATUS status=BCryptDeriveKeyPBKDF2(algorithm,(PUCHAR)password,(ULONG)strlen(password),(PUCHAR)salt,16,600000,out,32,0);BCryptCloseAlgorithmProvider(algorithm,0);return status==0;
#else
 return PKCS5_PBKDF2_HMAC(password,(int)strlen(password),salt,16,600000,EVP_sha256(),32,out)==1;
#endif
}
static int secret_equal(const unsigned char *a,const unsigned char *b,size_t n){unsigned diff=0;for(size_t i=0;i<n;i++)diff|=a[i]^b[i];return diff==0;}
/* Journal/config replacement is atomic; flush before allowing any boost write. */
static int local_save(const char *name,const char *data){
 char dir[2400],path[2400],temp[2500];path_join(dir,"local");if(!make_dir(dir))return 0;char rel[180];snprintf(rel,sizeof(rel),"local/%s",name);path_join(path,rel);snprintf(temp,sizeof(temp),"%s.tmp",path);
 FILE *f=file_open(temp,"wb");if(!f)return 0;size_t n=strlen(data);int ok=fwrite(data,1,n,f)==n&&fflush(f)==0;
#ifdef _WIN32
 if(ok)ok=_commit(_fileno(f))==0;
#else
 if(ok)ok=fsync(fileno(f))==0;
#endif
 if(fclose(f)!=0)ok=0;
 if(!ok)return 0;
#ifdef _WIN32
 wchar_t a[3000],b[3000];if(!MultiByteToWideChar(CP_UTF8,0,temp,-1,a,3000)||!MultiByteToWideChar(CP_UTF8,0,path,-1,b,3000))return 0;
 return MoveFileExW(a,b,MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)!=0;
#else
 if(rename(temp,path))return 0;
 int fd=open(dir,O_RDONLY);if(fd<0)return 0;ok=fsync(fd)==0;close(fd);return ok;
#endif
}
/* -1: unreadable/oversized; 0: absent; 1: complete. */
static int local_read(const char *name,char *out,size_t cap){char rel[180],path[2400];snprintf(rel,sizeof(rel),"local/%s",name);path_join(path,rel);errno=0;FILE *f=file_open(path,"rb");if(!f)return errno==ENOENT?0:-1;size_t n=fread(out,1,cap-1,f);int ok=!ferror(f)&&feof(f);out[n]=0;fclose(f);return ok?1:-1;}
static void account_event(const char *event){char path[2400];path_join(path,"logs/accounts.csv");FILE *f=file_open(path,"ab");if(f){char utc[40];utc_stamp(utc);fprintf(f,"%s;%s\r\n",utc,event);fclose(f);}}
static int language_code_ok(const char *s){if(!s||strlen(s)<2||strlen(s)>18)return 0;for(const char *p=s;*p;p++)if(!((*p>='a'&&*p<='z')||(*p>='A'&&*p<='Z')||(*p>='0'&&*p<='9')||*p=='-'||*p=='_'))return 0;return 1;}
static const char *display_theme_code(int theme){return theme==THEME_CLASSIC?"classic":"dark";}
static int display_theme_parse(const char *code){return !code?-1:!strcmp(code,"dark")?THEME_DARK:!strcmp(code,"classic")?THEME_CLASSIC:-1;}
static const char *display_font_code(int font){return font==FONT_TAHOMA?"tahoma":font==FONT_ARIAL?"arial":font==FONT_VERDANA?"verdana":"system";}
static int display_font_parse(const char *code){return !code?-1:!strcmp(code,"system")?FONT_SYSTEM:!strcmp(code,"tahoma")?FONT_TAHOMA:!strcmp(code,"arial")?FONT_ARIAL:!strcmp(code,"verdana")?FONT_VERDANA:-1;}
static int save_display_options(LocalOptions o,const char *language){char data[340];snprintf(data,sizeof(data),"{\"snow\":%d,\"animations\":%d,\"wallpaper\":%d,\"exitButton\":%d,\"theme\":\"%s\",\"font\":\"%s\",\"language\":\"%s\"}\n",o.snow,o.animations,o.wallpaper,o.exit_button,display_theme_code(o.theme),display_font_code(o.font),language);return local_save("scada_options.json",data);}
static int language_save(Pair *p,int n,char *reason,size_t cap){const char *code=pair_get(p,n,"language");if(n!=1||!language_code_ok(code)){copy_s(reason,cap,"Некорректный код языка");return 422;}char rel[100],path[2400];snprintf(rel,sizeof(rel),"ui/locales/%s.json",code);path_join(path,rel);FILE *f=file_open(path,"rb");if(!f){copy_s(reason,cap,"Языковой файл не найден");return 422;}fclose(f);if(!save_display_options(app.options,code)){copy_s(reason,cap,"Не удалось сохранить язык интерфейса");return 503;}lock(&app.mutex);copy_s(app.language,20,code);unlock(&app.mutex);copy_s(reason,cap,"Язык интерфейса сохранён");return 200;}
static void local_init(void){
 char data[1600];Pair p[8];app.options=(LocalOptions){1,1,1,1,THEME_DARK,FONT_SYSTEM};copy_s(app.language,20,"ru");int read=local_read("scada_options.json",data,sizeof(data));
 if(read==1){int n=json_pairs(data,p,8);double a,b,c;if(n>=3&&n<=7&&number_parse(pair_get(p,n,"snow"),&a)&&number_parse(pair_get(p,n,"animations"),&b)&&number_parse(pair_get(p,n,"wallpaper"),&c)&&(a==0||a==1)&&(b==0||b==1)&&(c==0||c==1))app.options=(LocalOptions){(int)a,(int)b,(int)c,1,THEME_DARK,FONT_SYSTEM};double exit_value;if(pair_get(p,n,"exitButton")&&number_parse(pair_get(p,n,"exitButton"),&exit_value)&&(exit_value==0||exit_value==1))app.options.exit_button=(int)exit_value;int theme=display_theme_parse(pair_get(p,n,"theme")),font=display_font_parse(pair_get(p,n,"font"));if(theme>=0)app.options.theme=theme;if(font>=0)app.options.font=font;if(pair_get(p,n,"language")&&language_code_ok(pair_get(p,n,"language")))copy_s(app.language,20,pair_get(p,n,"language"));}
 read=local_read("accounts.json",data,sizeof(data));
 if(read){int n=read==1?json_pairs(data,p,8):-1;double version,rounds;app.auth.locked=1;
  if(n==4&&number_parse(pair_get(p,n,"version"),&version)&&version==1&&number_parse(pair_get(p,n,"iterations"),&rounds)&&rounds==600000&&bytes_unhex(pair_get(p,n,"salt"),16,app.auth.salt)&&bytes_unhex(pair_get(p,n,"hash"),32,app.auth.hash)){app.auth.configured=1;app.auth.locked=0;}
 }
 read=local_read("cleaning.json",data,sizeof(data));
 if(read){int n=read==1?json_pairs(data,p,8):-1;double pending,port;app.cleaning.pending=1;app.cleaning.restoring=1;
  if(n==1&&number_parse(pair_get(p,n,"pending"),&pending)&&pending==0){app.cleaning.pending=0;app.cleaning.restoring=0;}
  else if(n==4&&number_parse(pair_get(p,n,"pending"),&pending)&&pending==1&&pair_get(p,n,"ip")&&pair_get(p,n,"netId")&&number_parse(pair_get(p,n,"port"),&port)&&port>=1&&port<=65535&&floor(port)==port){copy_s(app.cleaning.ip,64,pair_get(p,n,"ip"));copy_s(app.cleaning.netid,64,pair_get(p,n,"netId"));app.cleaning.port=(unsigned)port;copy_s(app.cleaning.message,256,"После запуска требуется подтвердить возврат скорости 10");}
  else {app.cleaning.storage_error=1;copy_s(app.cleaning.message,256,"Журнал ускорения повреждён. Проверьте скорость и восстановите local/cleaning.json");}
 }
}
static int auth_engineer(const char *session){return session&&strlen(session)==64&&app.auth.session[0]&&now_ms()<app.auth.expires&&secret_equal((const unsigned char*)session,(const unsigned char*)app.auth.session,64);}
/* Existing hashes remain valid; only creation/replacement requires a numeric PIN. */
static int password_length_ok(const char *password){if(!password||strlen(password)>512)return 0;unsigned n=0;for(const unsigned char *p=(const unsigned char*)password;*p;p++)if((*p&0xc0)!=0x80)n++;return n>=6&&n<=128;}
static int password_new_ok(const char *password){if(!password||strlen(password)<6||strlen(password)>128)return 0;for(const char *p=password;*p;p++)if(*p<'0'||*p>'9')return 0;return 1;}
static int auth_password_ok(const char *password){unsigned char hash[32]={0};int ok=app.auth.configured&&password_key(password,app.auth.salt,hash)&&secret_equal(hash,app.auth.hash,32);memset(hash,0,sizeof(hash));return ok;}
static int auth_request(Pair *p,int n,int setup,char *reason,size_t cap,char cookie[220]){
 const char *password=pair_get(p,n,"password");
 if(n!=1||!password_length_ok(password)){copy_s(reason,cap,"Введите пароль длиной от 6 до 128 символов");return 422;}
 if(app.auth.locked){copy_s(reason,cap,"Файл профилей недоступен или повреждён. Требуется восстановление accounts.json");return 409;}
 if(now_ms()<app.auth.retry){copy_s(reason,cap,"Слишком много попыток. Повторите вход через 30 секунд");return 429;}
 if(setup){
  if(app.auth.configured){copy_s(reason,cap,"Профиль инженера уже настроен. Используйте вход");return 409;}
  if(!password_new_ok(password)){copy_s(reason,cap,"Новый пароль должен содержать от 6 до 128 цифр");return 422;}
  unsigned char salt[16],hash[32];char a[33],b[65],data[300];
  if(!random_bytes(salt,16)||!password_key(password,salt,hash)){copy_s(reason,cap,"Не удалось подготовить профиль");return 503;}
  bytes_hex(salt,16,a);bytes_hex(hash,32,b);snprintf(data,sizeof(data),"{\"version\":1,\"iterations\":600000,\"salt\":\"%s\",\"hash\":\"%s\"}\n",a,b);
  if(!local_save("accounts.json",data)){copy_s(reason,cap,"Не удалось сохранить пароль. Проверьте доступ к папке программы");return 503;}
  memcpy(app.auth.salt,salt,16);memcpy(app.auth.hash,hash,32);memset(hash,0,32);app.auth.configured=1;account_event("engineer_created");
 }else if(!auth_password_ok(password)){
  if(++app.auth.failures>=5){app.auth.retry=now_ms()+30000;app.auth.failures=0;}
  account_event("engineer_login_failed");copy_s(reason,cap,"Неверный пароль инженера");return 403;
 }
 unsigned char bytes[32];if(!random_bytes(bytes,32)){copy_s(reason,cap,"Не удалось создать сессию");return 503;}
 bytes_hex(bytes,32,app.auth.session);app.auth.expires=now_ms()+UINT64_C(28800000);app.auth.failures=0;app.auth.retry=0;
 snprintf(cookie,220,"Set-Cookie: scada_session=%s; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800\r\n",app.auth.session);
 account_event("engineer_login");copy_s(reason,cap,"Выполнен вход: Инженер");return 200;
}
static int options_save(Pair *p,int n,char *reason,size_t cap){
 double a,b,c,d=app.options.exit_button;int theme=app.options.theme,font=app.options.font;const char *theme_code=pair_get(p,n,"theme"),*font_code=pair_get(p,n,"font"),*exit_value=pair_get(p,n,"exitButton");
 int keys_ok=1;for(int i=0;i<n;i++)if(strcmp(p[i].key,"snow")&&strcmp(p[i].key,"animations")&&strcmp(p[i].key,"wallpaper")&&strcmp(p[i].key,"exitButton")&&strcmp(p[i].key,"theme")&&strcmp(p[i].key,"font"))keys_ok=0;
 if(n<3||n>6||!keys_ok||!number_parse(pair_get(p,n,"snow"),&a)||!number_parse(pair_get(p,n,"animations"),&b)||!number_parse(pair_get(p,n,"wallpaper"),&c)||(a!=0&&a!=1)||(b!=0&&b!=1)||(c!=0&&c!=1)||(exit_value&&(!number_parse(exit_value,&d)||(d!=0&&d!=1)))||(theme_code&&(theme=display_theme_parse(theme_code))<0)||(font_code&&(font=display_font_parse(font_code))<0)){copy_s(reason,cap,"Некорректные настройки интерфейса");return 422;}
 LocalOptions next={(int)a,(int)b,(int)c,(int)d,theme,font};
 if(!save_display_options(next,app.language)){copy_s(reason,cap,"Не удалось сохранить опции");return 503;}
 lock(&app.mutex);app.options=next;unlock(&app.mutex);account_event("scada_options_changed");copy_s(reason,cap,"Опции SCADA сохранены");return 200;
}
static int auth_change_password(Pair *p,int n,char *reason,size_t cap,char cookie[220]){
 const char *old=pair_get(p,n,"oldPassword"),*password=pair_get(p,n,"newPassword");
 if(n!=2||!old||!password_new_ok(password)){copy_s(reason,cap,"Проверьте текущий пароль; новый должен содержать от 6 до 128 цифр");return 422;}
 if(!auth_password_ok(old)){account_event("password_change_failed");copy_s(reason,cap,"Текущий пароль неверен");return 403;}
 unsigned char salt[16],hash[32];char a[33],b[65],data[300];if(!random_bytes(salt,16)||!password_key(password,salt,hash)){copy_s(reason,cap,"Не удалось подготовить новый пароль");return 503;}
 bytes_hex(salt,16,a);bytes_hex(hash,32,b);snprintf(data,sizeof(data),"{\"version\":1,\"iterations\":600000,\"salt\":\"%s\",\"hash\":\"%s\"}\n",a,b);
 if(!local_save("accounts.json",data)){copy_s(reason,cap,"Не удалось сохранить новый пароль. Прежний пароль действует");return 503;}
 memcpy(app.auth.salt,salt,16);memcpy(app.auth.hash,hash,32);memset(hash,0,32);Pair login;memset(&login,0,sizeof(login));copy_s(login.key,40,"password");copy_s(login.value,sizeof(login.value),password);int status=auth_request(&login,1,0,reason,cap,cookie);memset(login.value,0,sizeof(login.value));account_event("password_changed");if(status==200)copy_s(reason,cap,"Пароль инженера изменён");return status;
}
#endif
