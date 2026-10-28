#ifndef SCADA_DIAGNOSTIC_QUEUE_H
#define SCADA_DIAGNOSTIC_QUEUE_H
/* Producers copy observations only. All database/file work belongs to the recorder. */
enum { DIAG_QUEUE_CAP=1024, DIAG_EVENT_BYTES=1800 };
typedef struct {
 int type;uint64_t wall,mono;
 union {ProductionSample sample;struct {char kind[48],json[DIAG_EVENT_BYTES];} event;} data;
} DiagnosticItem;
static struct {
 Mutex mutex;int initialized,failed,running;unsigned head,count;uint64_t dropped,accepted,written,last_write,storage_errors,last_error_at;
 char error[256],last_error[256],session[33],path[2400];DiagnosticItem items[DIAG_QUEUE_CAP];
} diagnostics;
static atomic_int diagnostic_stopping;
static void diagnostic_enqueue(const DiagnosticItem *item){
 if(!diagnostics.initialized)return;
 lock(&diagnostics.mutex);
 if(diagnostics.count==DIAG_QUEUE_CAP){diagnostics.dropped++;diagnostics.head=(diagnostics.head+1)%DIAG_QUEUE_CAP;diagnostics.count--;}
 diagnostics.items[(diagnostics.head+diagnostics.count)%DIAG_QUEUE_CAP]=*item;diagnostics.count++;diagnostics.accepted++;
 unlock(&diagnostics.mutex);
}
static void diagnostic_event_at(const char *kind,uint64_t wall,uint64_t mono,const char *json){
 if(!diagnostics.initialized)return;
 DiagnosticItem item;memset(&item,0,sizeof(item));item.type=1;item.wall=wall;item.mono=mono;
 copy_s(item.data.event.kind,sizeof(item.data.event.kind),kind);
 if(strlen(json)>=sizeof(item.data.event.json)){lock(&diagnostics.mutex);diagnostics.dropped++;unlock(&diagnostics.mutex);return;}
 copy_s(item.data.event.json,sizeof(item.data.event.json),json);diagnostic_enqueue(&item);
}
static void diagnostic_event(const char *kind,const char *json){diagnostic_event_at(kind,wall_ms(),now_ms(),json);}
static void diagnostic_capture(const ProductionSample *sample){
 if(!diagnostics.initialized)return;
 DiagnosticItem item;memset(&item,0,sizeof(item));item.wall=sample->wall;item.mono=sample->mono;item.data.sample=*sample;diagnostic_enqueue(&item);
}
static void diagnostic_health_json(Buffer *b){
 if(!diagnostics.initialized){bf(b,"{\"enabled\":false}");return;}
 lock(&diagnostics.mutex);
 bf(b,"{\"enabled\":true,\"running\":%s,\"storageError\":%s,\"queued\":%u,\"accepted\":%llu,\"written\":%llu,\"dropped\":%llu,\"lastWriteUtcMs\":%llu,\"sessionId\":",diagnostics.running?"true":"false",diagnostics.failed?"true":"false",diagnostics.count,(unsigned long long)diagnostics.accepted,(unsigned long long)diagnostics.written,(unsigned long long)diagnostics.dropped,(unsigned long long)diagnostics.last_write);bj(b,diagnostics.session);bf(b,",\"message\":");bj(b,diagnostics.error);bf(b,",\"storageFailures\":%llu,\"lastErrorUtcMs\":%llu,\"lastError\":",(unsigned long long)diagnostics.storage_errors,(unsigned long long)diagnostics.last_error_at);bj(b,diagnostics.last_error);bf(b,",\"retentionHours\":72,\"maxSamples\":1200000,\"maxDatabaseMiB\":512}");
 unlock(&diagnostics.mutex);
}
#endif
