/* Deterministic five-minute policy checks. No PLC and no production clock hook. */
#define now_ms platform_clock_ms
#define wall_ms platform_wall_ms
#include "../src/platform.h"
#undef now_ms
#undef wall_ms
#include <assert.h>
static uint64_t clock_ms=100000;
static time_t wall_now=1800000000;
static uint64_t now_ms(void){return clock_ms;}
static uint64_t wall_ms(void){return (uint64_t)wall_now*1000;}
#include "../src/app.h"
static void value(int i,double n){Reading *r=&app.fields[i];r->quality=1;r->meta.valid=1;r->meta.flags=0;r->value=n;memset(r->raw,0,8);r->raw[0]=(unsigned char)n;r->observed=clock_ms;}
static void fresh(void){for(int i=0;i<F_COUNT;i++)app.fields[i].observed=clock_ms;}
static int request(const char *mode,const char *id,int engineer){Pair p[4];memset(p,0,sizeof(p));copy_s(p[0].key,40,"mode");copy_s(p[0].value,160,mode);copy_s(p[1].key,40,"id");copy_s(p[1].value,160,id);copy_s(p[2].key,40,"expected");raw_hex(app.fields[F_UNWINDER_STOP].raw,1,p[2].value);copy_s(p[3].key,40,"epoch");copy_s(p[3].value,160,"1");char reason[300];return unwinder_request(p,4,reason,sizeof(reason),engineer);}
static void confirmed(double n){Transaction tx=app.tx;value(F_UNWINDER_STOP,n);tx.actual=n;tx.has_actual=1;transaction_finish(&tx,"confirmed","Test confirmed");}
static void restart_guard(void){memset(&app.unwinder,0,sizeof(app.unwinder));unwinder_init();}
int main(void){
 char dir[]="/tmp/scada-unwinder-XXXXXX";assert(mkdtemp(dir));memset(&app,0,sizeof(app));mutex_init(&app.mutex);mutex_init(&app.log_mutex);atomic_init(&app.stop,0);atomic_init(&app.quitting,0);copy_s(app.base,sizeof(app.base),dir);copy_s(app.ip,64,"127.0.0.1");copy_s(app.netid,64,"5.105.198.193.1.1");app.ads_port=801;app.epoch=1;app.ads_status=5;app.connected=1;value(F_UNWINDER_STOP,1);value(F_UNWINDER_SENSOR,1);value(F_STATE,5);value(F_AUTO,0);
 unwinder_service();assert(!app.queue&&app.unwinder.initialized);
 assert(request("temporary","temp-0001",0)==202);uint64_t end=app.unwinder.deadline;assert(end-clock_ms==300000);confirmed(0);
 assert(request("temporary","temp-0001",0)==202);assert(app.unwinder.deadline==end);assert(request("temporary","temp-0002",0)==409);assert(app.unwinder.deadline==end);
 clock_ms=end-1;fresh();unwinder_service();assert(app.unwinder.mode==UNWINDER_TEMP&&!app.queue);
 clock_ms=end;fresh();unwinder_service();assert(app.unwinder.mode==UNWINDER_RESTORE&&app.queue&&app.tx.unwinder==2&&app.tx.requested==1);confirmed(1);assert(app.unwinder.mode==UNWINDER_NORMAL);
 assert(request("temporary","temp-0003",0)==202);confirmed(0);wall_now+=120;restart_guard();assert(app.unwinder.mode==UNWINDER_TEMP&&app.unwinder.deadline-clock_ms==180000);
 wall_now+=181;restart_guard();assert(app.unwinder.mode==UNWINDER_RESTORE);fresh();unwinder_service();assert(app.queue);confirmed(1);
 assert(request("temporary","temp-0004",0)==202);confirmed(0);wall_now-=1;restart_guard();assert(app.unwinder.mode==UNWINDER_RESTORE);fresh();unwinder_service();confirmed(1);wall_now+=1;
 assert(request("permanent","perm-0001",0)==403);value(F_STATE,4);value(F_AUTO,1);assert(request("permanent","perm-0002",1)==409);value(F_STATE,5);value(F_AUTO,0);
 assert(request("permanent","perm-0003",1)==202);confirmed(0);clock_ms+=900000;wall_now+=900;fresh();unwinder_service();assert(app.unwinder.mode==UNWINDER_OFF&&!app.queue);restart_guard();unwinder_service();assert(app.unwinder.mode==UNWINDER_OFF&&!app.queue);
 assert(request("enable","enable-0001",0)==202);confirmed(1);assert(app.unwinder.mode==UNWINDER_NORMAL);
 value(F_UNWINDER_STOP,0);unwinder_service();assert(app.unwinder.mode==UNWINDER_TEMP&&!app.queue);clock_ms=app.unwinder.deadline;app.connected=0;unwinder_service();assert(app.unwinder.mode==UNWINDER_RESTORE&&!app.queue);app.connected=1;fresh();unwinder_service();assert(app.queue);confirmed(1);
 assert(request("temporary","temp-0005",0)==202);confirmed(0);atomic_store(&app.quitting,1);unwinder_service();cleaning_service();assert(app.queue&&!atomic_load(&app.stop));confirmed(1);cleaning_service();assert(atomic_load(&app.stop));
 char path[2600];snprintf(path,sizeof(path),"%s/local/unwinder.json",dir);unlink(path);snprintf(path,sizeof(path),"%s/local",dir);rmdir(path);rmdir(dir);
 puts("PASS: exact 300-second boundary, no extension, restart remaining time, expired/rollback recovery, role/stopped gates, persistent bypass, HMI disable, offline restore and shutdown return.");return 0;
}
