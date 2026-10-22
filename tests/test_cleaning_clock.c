/* Deterministic boundary tests; the clock substitution exists only in this test TU. */
#define now_ms platform_clock_ms
#include "../src/platform.h"
#undef now_ms
#include <assert.h>
static uint64_t clock_ms=100000;
static uint64_t now_ms(void){return clock_ms;}
#include "../src/app.h"
static void fresh_inputs(void){for(int i=0;i<F_COUNT;i++)app.fields[i].observed=clock_ms;}
static void value(int i,double n){Reading *r=&app.fields[i];r->quality=1;r->meta.valid=1;r->meta.flags=0;r->value=n;memset(r->raw,0,8);if(i==F_IDLE){float v=(float)n;memcpy(r->raw,&v,4);}else r->raw[0]=(unsigned char)n;r->observed=clock_ms;}
static int add(const char *id){Pair p[3];memset(p,0,sizeof(p));copy_s(p[0].key,40,"id");copy_s(p[0].value,160,id);copy_s(p[1].key,40,"expected");raw_hex(app.fields[F_IDLE].raw,4,p[1].value);copy_s(p[2].key,40,"epoch");copy_s(p[2].value,160,"1");char msg[300];return cleaning_add(p,3,msg,sizeof(msg),0);}
static void confirmed(double n){Transaction tx=app.tx;value(F_IDLE,n);tx.actual=n;tx.has_actual=1;transaction_finish(&tx,"confirmed","Test readback confirmed");}
int main(void){
 char dir[]="/tmp/scada-clock-XXXXXX";assert(mkdtemp(dir));memset(&app,0,sizeof(app));mutex_init(&app.mutex);mutex_init(&app.log_mutex);atomic_init(&app.stop,0);atomic_init(&app.quitting,0);copy_s(app.base,sizeof(app.base),dir);copy_s(app.ip,64,"127.0.0.1");copy_s(app.netid,64,"5.105.198.193.1.1");app.ads_port=801;app.epoch=1;app.ads_status=5;app.connected=1;value(F_IDLE,10);value(F_STATE,13);value(F_AUTO,0);
 assert(add("click-0001")==202);assert(app.cleaning.deadline-clock_ms==60000);confirmed(45);
 assert(add("click-0002")==202);assert(app.cleaning.deadline-clock_ms==120000);
 assert(add("click-0003")==202);assert(app.cleaning.deadline-clock_ms==180000);
 clock_ms+=10000;fresh_inputs();assert(app.cleaning.deadline-clock_ms==170000);assert(add("click-0004")==202);assert(app.cleaning.deadline-clock_ms==180000);
 uint64_t until=app.cleaning.deadline;assert(add("click-0004")==200);assert(app.cleaning.deadline==until);
 /* HMI pages and HTTP polling have no role in expiry. */
 clock_ms=until;fresh_inputs();cleaning_service();assert(!app.cleaning.active&&app.cleaning.restoring&&app.queue);assert(app.tx.cleaning==2&&app.tx.requested==10);confirmed(10);assert(!app.cleaning.pending);
 char file[2600];snprintf(file,sizeof(file),"%s/local/cleaning.json",dir);FILE *f=fopen(file,"rb");assert(f);char buf[80];assert(fgets(buf,sizeof(buf),f));fclose(f);assert(strstr(buf,"\"pending\":0"));
 assert(add("click-0005")==202);confirmed(45);char message[200];assert(cleaning_cancel(NULL,0,message,sizeof(message))==202);fresh_inputs();cleaning_service();assert(app.tx.requested==10);confirmed(10);
 /* Expired sessions cannot retain engineering permissions. */
 memset(app.auth.session,'a',64);app.auth.session[64]=0;app.auth.expires=clock_ms+10;assert(auth_engineer(app.auth.session));clock_ms+=10;assert(!auth_engineer(app.auth.session));
 unsigned char raw[8];assert(!encode_value(&defs[F_IDLE],45,raw));assert(encode_value(&defs[F_IDLE],10,raw));
 unlink(file);snprintf(file,sizeof(file),"%s/local",dir);rmdir(file);rmdir(dir);puts("PASS: +60/+120/+180, 170+60 ->180, duplicate ID, exact expiry, cancellation, journal and session expiry.");return 0;
}
