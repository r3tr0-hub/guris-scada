#ifndef SCADA_DIAGNOSTIC_COVERAGE_H
#define SCADA_DIAGNOSTIC_COVERAGE_H
/* Export worker only. Coverage follows session/monotonic continuity, never min/max alone. */
static int diagnostic_coverage(sqlite3 *db,uint64_t from,uint64_t until,char *out,size_t cap){
 Buffer b;binit(&b,out,cap);sqlite3_stmt *st=NULL;
 const char *sql="SELECT at,mono,session,epoch,serial,plc,good,total_good,alarms_good FROM samples WHERE at>=? AND at<=? ORDER BY seq";
 if(sqlite3_prepare_v2(db,sql,-1,&st,NULL)!=SQLITE_OK)return 0;
 sqlite3_bind_int64(st,1,(sqlite3_int64)from);sqlite3_bind_int64(st,2,(sqlite3_int64)until);
 uint64_t rows=0,good=0,start=0,end=0,prev_mono=0,gaps=0;unsigned segments=0,emitted=0;int active=0,epoch=0,serial=0,rc;char session[80]="",plc[180]="";
 bf(&b,"{\"continuousSegments\":[");
 while((rc=sqlite3_step(st))==SQLITE_ROW){
  uint64_t at=(uint64_t)sqlite3_column_int64(st,0),mono=(uint64_t)sqlite3_column_int64(st,1);const char *sid=(const char*)sqlite3_column_text(st,2),*pid=(const char*)sqlite3_column_text(st,5);rows++;
  int valid=sqlite3_column_int(st,6)&&sqlite3_column_int(st,7)&&sqlite3_column_int(st,8);
  int continuous=active&&valid&&mono>=prev_mono&&mono-prev_mono<=2000&&at>=end&&llabs((int64_t)(at-end)-(int64_t)(mono-prev_mono))<=2000&&!strcmp(session,sid?sid:"")&&!strcmp(plc,pid?pid:"")&&epoch==sqlite3_column_int(st,3)&&serial==sqlite3_column_int(st,4);
  if(active&&!continuous){segments++;if(emitted<1024){if(emitted++)bf(&b,",");bf(&b,"{\"fromUtcMs\":%llu,\"toUtcMs\":%llu,\"sessionId\":",(unsigned long long)start,(unsigned long long)end);bj(&b,session);bf(&b,"}");}active=0;gaps++;}
  if(valid){good++;if(!active){active=1;start=at;copy_s(session,sizeof(session),sid?sid:"");copy_s(plc,sizeof(plc),pid?pid:"");epoch=sqlite3_column_int(st,3);serial=sqlite3_column_int(st,4);}end=at;prev_mono=mono;}
 }
 sqlite3_finalize(st);if(rc!=SQLITE_DONE)return 0;
 if(active){segments++;if(emitted<1024){if(emitted++)bf(&b,",");bf(&b,"{\"fromUtcMs\":%llu,\"toUtcMs\":%llu,\"sessionId\":",(unsigned long long)start,(unsigned long long)end);bj(&b,session);bf(&b,"}");}}
 char counts_sql[400];uint64_t context=from>600000?from-600000:0;snprintf(counts_sql,sizeof(counts_sql),"SELECT count(*) FROM samples WHERE at>=%llu AND at<%llu",(unsigned long long)context,(unsigned long long)from);sqlite3_int64 context_rows=diagnostic_scalar(db,counts_sql);snprintf(counts_sql,sizeof(counts_sql),"SELECT count(*) FROM (SELECT seq FROM samples WHERE at<%llu ORDER BY seq DESC LIMIT 1)",(unsigned long long)context);sqlite3_int64 baseline_rows=diagnostic_scalar(db,counts_sql);bf(&b,"],\"contextRowsBeforeRequestedPeriod\":%lld,\"baselineAnchorRows\":%lld,\"samplesInRequestedPeriod\":%llu,\"goodSamplesInRequestedPeriod\":%llu,\"continuityBreaks\":%llu,\"segmentCount\":%u,\"segmentsTruncated\":%s,\"continuityToleranceMs\":2000,\"continuousCoverageGuaranteed\":false}",context_rows,baseline_rows,(unsigned long long)rows,(unsigned long long)good,(unsigned long long)gaps,segments,segments>1024?"true":"false");return !b.failed;
}
#endif
