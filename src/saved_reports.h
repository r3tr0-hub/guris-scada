#ifndef SCADA_SAVED_REPORTS_H
#define SCADA_SAVED_REPORTS_H
/* Only generated exports are written; clients never provide a filesystem path. */
static int saved_report_file(const char *kind,const char *data,size_t bytes,char *path,size_t cap){
 unsigned char random[16];char hex[33],dir[2400],relative[200];if(!random_bytes(random,sizeof(random)))return 0;bytes_hex(random,sizeof(random),hex);
 path_join(dir,"reports");if(!make_dir(dir))return 0;
 snprintf(relative,sizeof(relative),"reports/GurisSCADA_%s_%llu_%s.json",kind,(unsigned long long)wall_ms(),hex);path_join(path,relative);if(strlen(path)>=cap)return 0;
 FILE *file=file_open(path,"wbx");if(!file)return 0;int ok=fwrite(data,1,bytes,file)==bytes&&fflush(file)==0;
#ifdef _WIN32
 if(ok)ok=_commit(_fileno(file))==0;
#else
 if(ok)ok=fsync(fileno(file))==0;
#endif
 if(fclose(file))ok=0;
 return ok;
}
static void saved_report_response(Socket socket,const char *path){char text[16000];Buffer b;binit(&b,text,sizeof(text));bf(&b,"{\"path\":");bj(&b,path);bf(&b,"}");http_response(socket,200,"application/json; charset=utf-8",(unsigned char*)text,b.used);}
static void saved_snapshot_http(Socket socket,int engineer){
 if(!engineer){http_message(socket,403,"Требуется вход инженера");return;}
 size_t cap=65536u+F_COUNT*1536u;char *data=malloc(cap),path[2400];size_t bytes=data?diagnostic_report_json(data,cap,1):0;
 int ok=bytes&&saved_report_file("Snapshot",data,bytes,path,sizeof(path));free(data);if(ok)saved_report_response(socket,path);else http_message(socket,503,"Не удалось сохранить отчёт в папку reports");
}
static int saved_document_valid(const char *body){
 sqlite3 *db=NULL;sqlite3_stmt *st=NULL;int valid=0;
 if(sqlite3_open(":memory:",&db)==SQLITE_OK&&sqlite3_prepare_v2(db,"SELECT json_valid(?1) AND CASE WHEN json_valid(?1) THEN json_type(?1)='object' AND json_extract(?1,'$.schemaVersion')=1 ELSE 0 END",-1,&st,NULL)==SQLITE_OK){sqlite3_bind_text(st,1,body,-1,SQLITE_STATIC);valid=sqlite3_step(st)==SQLITE_ROW&&sqlite3_column_int(st,0);}
 sqlite3_finalize(st);if(db)sqlite3_close(db);return valid;
}
static void saved_production_http(Socket socket,const char *body,int engineer){
 if(!engineer){http_message(socket,403,"Требуется вход инженера");return;}
 if(!saved_document_valid(body)){http_message(socket,422,"Нужен корректный документ schemaVersion=1");return;}
 char path[2400];if(saved_report_file("Production",body,strlen(body),path,sizeof(path)))saved_report_response(socket,path);else http_message(socket,503,"Не удалось сохранить отчёт в папку reports");
}
/* Sequential HTTP worker owns this bounded, named export upload. No client paths. */
static struct {char id[33],path[2400],final[2400];uint64_t bytes,deadline;int active;} saved_upload;
static void saved_upload_discard(void){
 if(saved_upload.active){
#ifdef _WIN32
  wchar_t path[3000];if(MultiByteToWideChar(CP_UTF8,0,saved_upload.path,-1,path,3000))_wremove(path);
#else
  remove(saved_upload.path);
#endif
 }memset(&saved_upload,0,sizeof(saved_upload));
}
static void saved_upload_begin(Socket socket,int engineer){
 if(!engineer){http_message(socket,403,"Требуется вход инженера");return;}
 saved_upload_discard();unsigned char random[16];char dir[2400],rel[200];if(!random_bytes(random,sizeof(random))){http_message(socket,503,"Недостаточно случайных данных");return;}bytes_hex(random,sizeof(random),saved_upload.id);
 path_join(dir,"reports");if(!make_dir(dir)){http_message(socket,503,"Не удалось создать папку отчётов");return;}
 snprintf(rel,sizeof(rel),"reports/GurisSCADA_Production_%llu_%s.json",(unsigned long long)wall_ms(),saved_upload.id);path_join(saved_upload.final,rel);
 snprintf(rel,sizeof(rel),"reports/%s.partial",saved_upload.id);path_join(saved_upload.path,rel);FILE *file=file_open(saved_upload.path,"wbx");if(!file){http_message(socket,503,"Не удалось создать временный отчёт");return;}fclose(file);
 saved_upload.active=1;saved_upload.deadline=now_ms()+300000;char result[100];snprintf(result,sizeof(result),"{\"id\":\"%s\"}",saved_upload.id);http_response(socket,200,"application/json; charset=utf-8",(unsigned char*)result,strlen(result));
}
static void saved_upload_chunk(Socket socket,const char *route,const char *body,size_t bytes,int engineer){
 if(!engineer){http_message(socket,403,"Требуется вход инженера");return;}
 char id[80],offset_text[40],final[10];double offset;
 if(production_parameter(route,"id",id,sizeof(id))!=1||production_parameter(route,"offset",offset_text,sizeof(offset_text))!=1||production_parameter(route,"final",final,sizeof(final))!=1||!number_parse(offset_text,&offset)||offset<0||floor(offset)!=offset||(strcmp(final,"0")&&strcmp(final,"1"))){http_message(socket,422,"Некорректная часть отчёта");return;}
 if(!saved_upload.active||now_ms()>saved_upload.deadline||strcmp(id,saved_upload.id)||(double)saved_upload.bytes!=offset){http_message(socket,409,"Отчёт изменился или срок передачи истёк");return;}
 if(bytes>1048576||saved_upload.bytes+bytes>UINT64_C(134217728)){saved_upload_discard();http_message(socket,413,"Отчёт превышает предел 128 МиБ");return;}
 FILE *file=file_open(saved_upload.path,"ab");int ok=file&&fwrite(body,1,bytes,file)==bytes&&fflush(file)==0;if(file&&fclose(file))ok=0;
 if(!ok){saved_upload_discard();http_message(socket,503,"Не удалось записать часть отчёта");return;}saved_upload.bytes+=bytes;saved_upload.deadline=now_ms()+300000;
 if(!strcmp(final,"0")){http_message(socket,200,"Часть отчёта сохранена");return;}
 char *document=malloc((size_t)saved_upload.bytes+1);file=file_open(saved_upload.path,"rb");ok=document&&file&&fread(document,1,(size_t)saved_upload.bytes,file)==saved_upload.bytes;if(file)fclose(file);if(ok){document[saved_upload.bytes]=0;ok=saved_document_valid(document);}free(document);
 if(!ok){saved_upload_discard();http_message(socket,422,"Нужен корректный документ schemaVersion=1");return;}
 /* Random generated names are also opened exclusively at the final location. */
 char final_path[2400];file=file_open(saved_upload.path,"rb");FILE *target=file_open(saved_upload.final,"wbx");ok=file&&target;unsigned char block[32768];size_t n;
 while(ok&&(n=fread(block,1,sizeof(block),file)))if(fwrite(block,1,n,target)!=n)ok=0;
 if(file){if(ferror(file))ok=0;fclose(file);}if(target){if(fflush(target))ok=0;
#ifdef _WIN32
  if(ok&&_commit(_fileno(target)))ok=0;
#else
  if(ok&&fsync(fileno(target)))ok=0;
#endif
  if(fclose(target))ok=0;}
 copy_s(final_path,sizeof(final_path),saved_upload.final);saved_upload_discard();if(ok)saved_report_response(socket,final_path);else http_message(socket,503,"Не удалось завершить сохранение отчёта");
}
#endif
