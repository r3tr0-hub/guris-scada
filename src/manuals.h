#ifndef SCADA_MANUALS_H
#define SCADA_MANUALS_H
/* Local, read-only documentation. This module never uses ADS or app.mutex.
   Paths are rooted under manuals; directory links and file links are refused. */
#define MANUAL_MAX 128
#define MANUAL_BYTES 65536u
#define MANUAL_PHOTO_BYTES (16u*1024u*1024u)
typedef struct {char folder[192],id[17],title[256],summary[512],category[128],revision[17];uint64_t stamp,modified;size_t bytes;int order;} Manual;
static Manual manuals[MANUAL_MAX];
static unsigned manual_count,manual_invalid;
static int manual_limit,manual_missing;
static uint64_t manual_next_scan;
static char manual_revision[17];
static uint64_t manual_hash(const unsigned char *p,size_t n){uint64_t h=UINT64_C(14695981039346656037);while(n--){h^=*p++;h*=UINT64_C(1099511628211);}return h;}
static void manual_hex(char out[17],uint64_t value){snprintf(out,17,"%016llx",(unsigned long long)value);}
static int manual_utf8(const unsigned char *p,size_t n){
 for(size_t i=0;i<n;){unsigned c=p[i++],need,min;if(!c)return 0;if(c<128)continue;
  if(c>=0xc2&&c<=0xdf){need=1;min=0x80;c&=31;}else if(c>=0xe0&&c<=0xef){need=2;min=0x800;c&=15;}else if(c>=0xf0&&c<=0xf4){need=3;min=0x10000;c&=7;}else return 0;
  if(need>n-i)return 0;
  while(need--){unsigned d=p[i++];if((d&0xc0)!=0x80)return 0;c=(c<<6)|(d&63);}if(c<min||c>0x10ffff||(c>=0xd800&&c<=0xdfff))return 0;
 }return 1;
}
static void manual_copy(char *out,size_t cap,const char *p,size_t n){
 while(n&&(p[n-1]=='\r'||p[n-1]==' '||p[n-1]=='\t'))n--;
 while(n&&(*p==' '||*p=='\t')){p++;n--;}
 if(n>=2&&((p[0]=='"'&&p[n-1]=='"')||(p[0]=='\''&&p[n-1]=='\''))){p++;n-=2;}
 if(n>=cap){n=cap-1;while(n&&((unsigned char)p[n]&0xc0)==0x80)n--;}
 memcpy(out,p,n);out[n]=0;
}
static int manual_component(const char *s){
 size_t n=strlen(s);if(!n||n>=192||!strcmp(s,".")||!strcmp(s,"..")||s[n-1]=='.'||s[n-1]==' ')return 0;
 for(const unsigned char *p=(const unsigned char*)s;*p;p++)if(*p<32||*p==127||strchr("/\\:*?\"<>|",*p))return 0;
 return manual_utf8((const unsigned char*)s,n);
}
static int manual_relative(const char *s){
 if(!s||!s[0]||strlen(s)>=512)return 0;
 char part[192];const char *p=s;
 while(*p){const char *end=strchr(p,'/');size_t n=end?(size_t)(end-p):strlen(p);if(!n||n>=sizeof(part))return 0;memcpy(part,p,n);part[n]=0;if(!manual_component(part))return 0;if(!end)return 1;p=end+1;if(!*p)return 0;}
 return 0;
}
#ifdef _WIN32
static int manual_wide(const char *s,wchar_t *out,int cap){return MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,s,-1,out,cap)>0;}
static int manual_root(wchar_t actual[3000]){
 char path[2400];path_join(path,"manuals");wchar_t wide[3000];if(!manual_wide(path,wide,3000))return 0;
 HANDLE h=CreateFileW(wide,FILE_READ_ATTRIBUTES,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,NULL,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,NULL);
 if(h==INVALID_HANDLE_VALUE)return 0;BY_HANDLE_FILE_INFORMATION info;int ok=GetFileInformationByHandle(h,&info)&&(info.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY)&&!(info.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT);
 DWORD n=ok?GetFinalPathNameByHandleW(h,actual,3000,FILE_NAME_NORMALIZED):0;CloseHandle(h);return n>0&&n<3000;
}
static unsigned char *manual_read(const char *folder,const char *relative,size_t limit,size_t *size,uint64_t *stamp,uint64_t *modified){
 if(!manual_component(folder)||!manual_relative(relative))return NULL;
 wchar_t root[3000],path[3600],wide_folder[256],wide_rel[1024];if(!manual_root(root)||!manual_wide(folder,wide_folder,256)||!manual_wide(relative,wide_rel,1024))return NULL;
 int n=swprintf(path,3600,L"%ls\\%ls\\%ls",root,wide_folder,wide_rel);if(n<0||n>=3600)return NULL;
 for(wchar_t *p=path;*p;p++)if(*p==L'/')*p=L'\\';
 size_t root_n=wcslen(root);for(wchar_t *p=path+root_n+1;*p;p++)if(*p==L'\\'){
  *p=0;DWORD attr=GetFileAttributesW(path);*p=L'\\';if(attr==INVALID_FILE_ATTRIBUTES||!(attr&FILE_ATTRIBUTE_DIRECTORY)||(attr&FILE_ATTRIBUTE_REPARSE_POINT))return NULL;
 }
 HANDLE h=CreateFileW(path,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,NULL,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT|FILE_FLAG_SEQUENTIAL_SCAN,NULL);if(h==INVALID_HANDLE_VALUE)return NULL;
 BY_HANDLE_FILE_INFORMATION before,after;wchar_t actual[3600],prefix[3300];unsigned char *data=NULL;
 if(!GetFileInformationByHandle(h,&before)||(before.dwFileAttributes&(FILE_ATTRIBUTE_DIRECTORY|FILE_ATTRIBUTE_REPARSE_POINT))||before.nFileSizeHigh||before.nFileSizeLow>limit)goto done;
 DWORD actual_n=GetFinalPathNameByHandleW(h,actual,3600,FILE_NAME_NORMALIZED);if(!actual_n||actual_n>=3600)goto done;
 n=swprintf(prefix,3300,L"%ls\\%ls\\",root,wide_folder);if(n<0||n>=3300||_wcsnicmp(actual,prefix,(size_t)n))goto done;
 size_t bytes=before.nFileSizeLow;data=malloc(bytes+1);if(!data)goto done;DWORD got=0;
 if((bytes&&(!ReadFile(h,data,(DWORD)bytes,&got,NULL)||got!=bytes))||!GetFileInformationByHandle(h,&after)||before.nFileSizeLow!=after.nFileSizeLow||memcmp(&before.ftLastWriteTime,&after.ftLastWriteTime,sizeof(FILETIME))){free(data);data=NULL;goto done;}
 data[bytes]=0;*size=bytes;ULARGE_INTEGER ft;ft.LowPart=after.ftLastWriteTime.dwLowDateTime;ft.HighPart=after.ftLastWriteTime.dwHighDateTime;*stamp=ft.QuadPart;*modified=ft.QuadPart/10000-UINT64_C(11644473600000);
 done:CloseHandle(h);return data;
}
#else
#include <dirent.h>
static int manual_root_fd(void){char path[2400];path_join(path,"manuals");return open(path,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);}
static unsigned char *manual_read(const char *folder,const char *relative,size_t limit,size_t *size,uint64_t *stamp,uint64_t *modified){
 if(!manual_component(folder)||!manual_relative(relative))return NULL;
 int root=manual_root_fd();if(root<0)return NULL;
 int dir=openat(root,folder,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);close(root);if(dir<0)return NULL;
 char path[512];copy_s(path,sizeof(path),relative);char *at=path,*slash;
 while((slash=strchr(at,'/'))){*slash=0;int next=openat(dir,at,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);close(dir);if(next<0)return NULL;dir=next;at=slash+1;}
 int fd=openat(dir,at,O_RDONLY|O_NOFOLLOW|O_CLOEXEC|O_NONBLOCK);close(dir);if(fd<0)return NULL;struct stat before,after;unsigned char *data=NULL;
 if(fstat(fd,&before)||!S_ISREG(before.st_mode)||before.st_size<0||(uint64_t)before.st_size>limit)goto done;
 size_t bytes=(size_t)before.st_size,got=0;data=malloc(bytes+1);if(!data)goto done;
 while(got<bytes){ssize_t n=read(fd,data+got,bytes-got);if(n<0&&errno==EINTR)continue;if(n<=0){free(data);data=NULL;goto done;}got+=(size_t)n;}
 if(fstat(fd,&after)||before.st_size!=after.st_size||before.st_mtim.tv_sec!=after.st_mtim.tv_sec||before.st_mtim.tv_nsec!=after.st_mtim.tv_nsec){free(data);data=NULL;goto done;}
 data[bytes]=0;*size=bytes;*stamp=(uint64_t)after.st_mtim.tv_sec*UINT64_C(1000000000)+(uint64_t)after.st_mtim.tv_nsec;*modified=(uint64_t)after.st_mtim.tv_sec*1000+(uint64_t)after.st_mtim.tv_nsec/1000000;
 done:close(fd);return data;
}
#endif
static size_t manual_metadata(Manual *m,const char *text,size_t bytes){
 size_t pos=bytes>=3&&!memcmp(text,"\xef\xbb\xbf",3)?3:0,body=pos;int front=bytes-pos>=4&&!memcmp(text+pos,"---",3)&&(text[pos+3]=='\r'||text[pos+3]=='\n');
 m->title[0]=m->summary[0]=m->category[0]=0;m->order=1000;
 if(front){const char *p=strchr(text+pos,'\n');if(p){p++;unsigned lines=0;while(*p&&lines++<40){const char *end=strchr(p,'\n');if(!end)break;size_t n=(size_t)(end-p);if(n&&p[n-1]=='\r')n--;if(n==3&&!memcmp(p,"---",3)){body=(size_t)(end+1-text);break;}const char *colon=memchr(p,':',n);if(colon){size_t key=(size_t)(colon-p);const char *v=colon+1;size_t len=n-key-1;if(key==5&&!memcmp(p,"title",5))manual_copy(m->title,sizeof(m->title),v,len);else if(key==7&&!memcmp(p,"summary",7))manual_copy(m->summary,sizeof(m->summary),v,len);else if(key==8&&!memcmp(p,"category",8))manual_copy(m->category,sizeof(m->category),v,len);else if(key==5&&!memcmp(p,"order",5)){char number[32];manual_copy(number,sizeof(number),v,len);char *tail;long order=strtol(number,&tail,10);if(*number&&!*tail&&order>=-100000&&order<=100000)m->order=(int)order;}}p=end+1;}}}
 const char *p=text+body;while(*p){const char *end=strchr(p,'\n');size_t n=end?(size_t)(end-p):strlen(p);if(n&&p[n-1]=='\r')n--;
  if(!m->title[0]&&n>2&&p[0]=='#'&&p[1]==' ')manual_copy(m->title,sizeof(m->title),p+2,n-2);
  if(!m->summary[0]&&n&&p[0]!='#'&&p[0]!='!'&&p[0]!='>'&&p[0]!='`'&&p[0]!='-'&&p[0]!='|'&&!((p[0]>='0'&&p[0]<='9')))manual_copy(m->summary,sizeof(m->summary),p,n);
  if(!end)break;
  p=end+1;
 }
 if(!m->title[0])copy_s(m->title,sizeof(m->title),m->folder);
 return body;
}
static void manual_add(const char *name){
 if(name[0]=='.'||name[0]=='_'||!manual_component(name))return;
 if(manual_count==MANUAL_MAX){manual_limit=1;return;}
 size_t n=0;uint64_t stamp=0,modified=0;unsigned char *data=manual_read(name,"index.md",MANUAL_BYTES,&n,&stamp,&modified);if(!data){manual_invalid++;return;}
 if(!manual_utf8(data,n)){free(data);manual_invalid++;return;}
 Manual *m=&manuals[manual_count];memset(m,0,sizeof(*m));copy_s(m->folder,sizeof(m->folder),name);manual_hex(m->id,manual_hash((const unsigned char*)name,strlen(name)));manual_hex(m->revision,manual_hash(data,n));m->bytes=n;m->stamp=stamp;m->modified=modified;manual_metadata(m,(char*)data,n);free(data);
 for(unsigned i=0;i<manual_count;i++)if(!strcmp(manuals[i].id,m->id)){manual_invalid++;return;}
 manual_count++;
}
static int manual_compare(const void *a,const void *b){const Manual *x=a,*y=b;if(x->order!=y->order)return x->order<y->order?-1:1;return strcmp(x->folder,y->folder);}
static void manual_scan(int force){
 uint64_t now=now_ms();if(!force&&now<manual_next_scan)return;manual_next_scan=now+2000;manual_count=manual_invalid=0;manual_limit=manual_missing=0;
#ifdef _WIN32
 wchar_t root[3000],pattern[3300];if(!manual_root(root)){manual_missing=1;goto finish;}swprintf(pattern,3300,L"%ls\\*",root);WIN32_FIND_DATAW row;HANDLE find=FindFirstFileW(pattern,&row);if(find==INVALID_HANDLE_VALUE)goto finish;
 do{if(!(row.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY)||(row.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT))continue;char name[192];if(WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,row.cFileName,-1,name,sizeof(name),NULL,NULL)>0)manual_add(name);}while(FindNextFileW(find,&row));FindClose(find);
#else
 int fd=manual_root_fd();if(fd<0){manual_missing=1;goto finish;}DIR *dir=fdopendir(fd);if(!dir){close(fd);manual_missing=1;goto finish;}struct dirent *row;
 while((row=readdir(dir))){struct stat st;if(fstatat(dirfd(dir),row->d_name,&st,AT_SYMLINK_NOFOLLOW)||!S_ISDIR(st.st_mode))continue;manual_add(row->d_name);}closedir(dir);
#endif
 finish:qsort(manuals,manual_count,sizeof(manuals[0]),manual_compare);uint64_t h=UINT64_C(14695981039346656037);for(unsigned i=0;i<manual_count;i++){h^=manual_hash((unsigned char*)manuals[i].id,16);h*=UINT64_C(1099511628211);h^=manual_hash((unsigned char*)manuals[i].revision,16);h*=UINT64_C(1099511628211);}h^=(uint64_t)manual_invalid<<32|manual_limit;manual_hex(manual_revision,h);
}
static Manual *manual_find(const char *id){if(strlen(id)!=16)return NULL;for(const char *p=id;*p;p++)if(!(*p>='0'&&*p<='9')&&!(*p>='a'&&*p<='f'))return NULL;manual_scan(0);for(unsigned i=0;i<manual_count;i++)if(!strcmp(manuals[i].id,id))return &manuals[i];return NULL;}
static int manual_unhex(char c){return c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:c>='A'&&c<='F'?c-'A'+10:-1;}
static int manual_url_path(char *out,size_t cap,const char *in,size_t bytes){size_t n=0;for(size_t i=0;i<bytes;i++){unsigned char c=(unsigned char)in[i];if(c=='%'){if(i+2>=bytes)return 0;int a=manual_unhex(in[i+1]),b=manual_unhex(in[i+2]);if(a<0||b<0)return 0;c=(unsigned char)((a<<4)|b);i+=2;}if(!c||n+1>=cap)return 0;out[n++]=(char)c;}out[n]=0;return manual_relative(out);}
static size_t manual_list_json(char *out,size_t cap){
 manual_scan(0);Buffer b;binit(&b,out,cap);bf(&b,"{\"revision\":");bj(&b,manual_revision);bf(&b,",\"folderMissing\":%s,\"invalid\":%u,\"limitReached\":%s,\"guides\":[",manual_missing?"true":"false",manual_invalid,manual_limit?"true":"false");
 for(unsigned i=0;i<manual_count;i++){Manual *m=&manuals[i];if(i)bf(&b,",");bf(&b,"{\"id\":");bj(&b,m->id);bf(&b,",\"title\":");bj(&b,m->title);bf(&b,",\"summary\":");bj(&b,m->summary);bf(&b,",\"category\":");bj(&b,m->category);bf(&b,",\"folder\":");bj(&b,m->folder);bf(&b,",\"revision\":");bj(&b,m->revision);bf(&b,",\"modified\":%llu,\"bytes\":%zu}",(unsigned long long)m->modified,m->bytes);}
 bf(&b,"]}");return b.failed?0:b.used;
}
static void manual_content_http(Socket s,const char *id){
 Manual *m=manual_find(id);if(!m){http_message(s,404,"Мануал не найден");return;}size_t n;uint64_t stamp,modified;unsigned char *data=manual_read(m->folder,"index.md",MANUAL_BYTES,&n,&stamp,&modified);if(!data||!manual_utf8(data,n)){free(data);http_message(s,404,"Мануал недоступен. Проверьте файл index.md");return;}
 Manual current=*m;manual_hex(current.revision,manual_hash(data,n));size_t body=manual_metadata(&current,(char*)data,n),cap=6*n+2048;char *out=malloc(cap);if(!out){free(data);http_message(s,503,"Не удалось открыть мануал");return;}
 Buffer b;binit(&b,out,cap);bf(&b,"{\"id\":");bj(&b,current.id);bf(&b,",\"revision\":");bj(&b,current.revision);bf(&b,",\"title\":");bj(&b,current.title);bf(&b,",\"folder\":");bj(&b,current.folder);bf(&b,",\"markdown\":");bj(&b,(char*)data+body);bf(&b,"}");free(data);
 if(b.failed)http_message(s,503,"Не удалось открыть мануал");else http_response(s,200,"application/json; charset=utf-8",(unsigned char*)out,b.used);free(out);
}
static void manual_photo_http(Socket s,const char *path){
 const char *slash=strchr(path,'/');if(!slash||slash-path!=16){http_message(s,404,"Фотография не найдена");return;}char id[17];memcpy(id,path,16);id[16]=0;Manual *m=manual_find(id);const char *query=strchr(slash+1,'?');
 if(!query||strncmp(query,"?k=",3)||strcmp(query+3,app.token)){http_message(s,403,"Недействительная сессия интерфейса");return;}
 char relative[512];if(!m||!manual_url_path(relative,sizeof(relative),slash+1,(size_t)(query-slash-1))){http_message(s,404,"Фотография не найдена");return;}
 const char *ext=strrchr(relative,'.'),*mime=NULL;if(ext){if(same_ascii(ext,".jpg")||same_ascii(ext,".jpeg"))mime="image/jpeg";else if(same_ascii(ext,".png"))mime="image/png";else if(same_ascii(ext,".webp"))mime="image/webp";}
 if(!mime){http_message(s,404,"Поддерживаются фотографии JPG, PNG и WebP");return;}size_t n;uint64_t stamp,modified;unsigned char *data=manual_read(m->folder,relative,MANUAL_PHOTO_BYTES,&n,&stamp,&modified);if(!data){http_message(s,404,"Фотография не найдена");return;}
 int signature=(!strcmp(mime,"image/jpeg")&&n>=3&&data[0]==255&&data[1]==216&&data[2]==255)||(!strcmp(mime,"image/png")&&n>=8&&!memcmp(data,"\x89PNG\r\n\x1a\n",8))||(!strcmp(mime,"image/webp")&&n>=12&&!memcmp(data,"RIFF",4)&&!memcmp(data+8,"WEBP",4));
 if(signature)http_response(s,200,mime,data,n);else http_message(s,404,"Файл не является поддерживаемой фотографией");free(data);
}
#endif
