#include "../src/app.h"
#include <assert.h>

static void *recorder(void *unused){(void)unused;diagnostic_run();return NULL;}
int main(int argc,char **argv){
 assert(argc==2);memset(&app,0,sizeof(app));mutex_init(&app.mutex);mutex_init(&app.log_mutex);atomic_init(&app.stop,0);atomic_init(&app.diag_audit_error,0);copy_s(app.base,sizeof(app.base),argv[1]);
 char folder[2400];path_join(folder,"local");assert(make_dir(folder));copy_s(production.machine,sizeof(production.machine),"synthetic-storage-test");diagnostic_init();assert(diagnostic_insert);
 /* Leave only a few pages beyond a real context snapshot. This is SQLite's
    real SQLITE_FULL path, rather than a trigger simulating another error. */
 diagnostic_context();sqlite3_int64 pages=diagnostic_scalar(diagnostic_db,"PRAGMA page_count");assert(pages>0);assert(diagnostic_sqlf("PRAGMA max_page_count=%lld",pages+8));
 ProductionSample sample;memset(&sample,0,sizeof(sample));sample.wall=wall_ms();sample.mono=now_ms();
 for(unsigned i=0;i<DIAG_QUEUE_CAP+50;i++){sample.wall++;sample.mono++;diagnostic_capture(&sample);}
 lock(&diagnostics.mutex);uint64_t overflow=diagnostics.dropped;assert(overflow>=50);assert(diagnostics.count==DIAG_QUEUE_CAP);unlock(&diagnostics.mutex);
 pthread_t thread;assert(!pthread_create(&thread,NULL,recorder,NULL));uint64_t until=now_ms()+10000;int full=0;
 while(now_ms()<until){lock(&diagnostics.mutex);full=diagnostics.storage_errors>0&&diagnostics.dropped>overflow;unlock(&diagnostics.mutex);if(full)break;pause_ms(10);}assert(full);
 /* A restored capacity must allow progress; prior loss stays visible. The
    FULLMUTEX SQLite connection serializes this test-only capacity change. */
 assert(sqlite3_exec(diagnostic_db,"PRAGMA max_page_count=131072",NULL,NULL,NULL)==SQLITE_OK);pause_ms(100);
 lock(&diagnostics.mutex);uint64_t before=diagnostics.written;unlock(&diagnostics.mutex);
 for(unsigned i=0;i<30;i++){sample.wall++;sample.mono++;diagnostic_capture(&sample);}
 until=now_ms()+5000;int recovered=0;while(now_ms()<until){lock(&diagnostics.mutex);recovered=diagnostics.written>before&&!diagnostics.failed;unlock(&diagnostics.mutex);if(recovered)break;pause_ms(10);}assert(recovered);
 atomic_store(&diagnostic_stopping,1);pthread_join(thread,NULL);assert(!diagnostic_db);assert(!diagnostics.running);assert(diagnostics.dropped>0);
 sqlite3 *verify=NULL;assert(sqlite3_open_v2(diagnostics.path,&verify,SQLITE_OPEN_READONLY,NULL)==SQLITE_OK);assert(diagnostic_scalar(verify,"SELECT sum(dropped) FROM sessions")== (sqlite3_int64)diagnostics.dropped);assert(diagnostic_scalar(verify,"SELECT min(ended) FROM sessions")>0);sqlite3_close(verify);
 puts("PASS: bounded recorder overflow, real SQLITE_FULL, eviction/recovery, durable loss count and clean drain.");return 0;
}
