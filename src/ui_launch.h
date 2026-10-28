#ifndef GURIS_UI_LAUNCH_H
#define GURIS_UI_LAUNCH_H
/* Windows UI lifecycle only. PLC polling and transaction rules are unchanged. */
#include "ui_launch_config.h"
static HWND tray_window,ui_window;
static HANDLE worker_thread,http_thread,one_instance,edge_process,edge_job;
static wchar_t ui_session_tag[17],ui_session_profiles[2][2400];
static NOTIFYICONDATAW tray;
/* Localised native tray labels use the same editable dictionaries as the web UI. */
static const wchar_t *native_text(const char *source){
 static char previous[20],*dictionary=NULL;static wchar_t output[8][2400];static unsigned slot=0;char language[20];lock(&app.mutex);copy_s(language,20,app.language);unlock(&app.mutex);
 if(strcmp(previous,language)){free(dictionary);dictionary=NULL;copy_s(previous,20,language);char rel[100];snprintf(rel,sizeof(rel),"ui/locales/%s.json",language);size_t bytes;dictionary=(char*)read_file(rel,&bytes);}
 char translated[2400];copy_s(translated,sizeof(translated),source);
 if(dictionary){char encoded[2400];Buffer b;binit(&b,encoded,sizeof(encoded));bj(&b,source);const char *at=dictionary;while(!b.failed&&(at=strstr(at,encoded))){const char *value=skipspace(at+strlen(encoded));if(*value==':'&&jstring(skipspace(value+1),translated,sizeof(translated)))break;at++;}}
 wchar_t *result=output[slot++%8];if(!MultiByteToWideChar(CP_UTF8,0,translated,-1,result,2400))result[0]=0;return result;
}
static wchar_t ui_title[]=L"Guris SCADA · 0.1.25";
static FILE *startup_file;
static char startup_path[2400];
static uint64_t launched_at;
static unsigned ready_before,document_before,error_before;
static int launch_pending,launch_mode,compat_attempted,edge_exit_logged,document_logged;

static void startup_log(const char *format,...){
 char line[6000],stamp[40];va_list args;va_start(args,format);vsnprintf(line,sizeof(line),format,args);va_end(args);
 if(app.token[0]){char *at=line;while((at=strstr(at,app.token))!=NULL){memset(at,'*',strlen(app.token));at+=strlen(app.token);}}
 utc_stamp(stamp);if(startup_file){fprintf(startup_file,"%s %s\r\n",stamp,line);fflush(startup_file);}
}
static void log_wide(const char *label,const wchar_t *value){char text[5000];if(!WideCharToMultiByte(CP_UTF8,0,value,-1,text,sizeof(text),NULL,NULL))copy_s(text,sizeof(text),"[path conversion failed]");startup_log("%s%s",label,text);}
static void startup_open(void){
 char rel[160];time_t t=time(NULL);struct tm tmv;localtime_s(&tmv,&t);char stamp[48];strftime(stamp,sizeof(stamp),"%Y%m%d_%H%M%S",&tmv);
 snprintf(rel,sizeof(rel),"logs/SCADA_startup_%s_%lu.log",stamp,(unsigned long)GetCurrentProcessId());path_join(startup_path,rel);startup_file=file_open(startup_path,"wb");
 if(!startup_file){wchar_t temp[2000];char utf8[2200];if(GetTempPathW(2000,temp)&&WideCharToMultiByte(CP_UTF8,0,temp,-1,utf8,sizeof(utf8),NULL,NULL)){snprintf(startup_path,sizeof(startup_path),"%sSCADA_startup_%s_%lu.log",utf8,stamp,(unsigned long)GetCurrentProcessId());startup_file=file_open(startup_path,"wb");}}
 if(startup_file)fwrite("\xEF\xBB\xBF",1,3,startup_file);
 startup_log("Guris SCADA 0.1.25 diagnostic recorder; PID=%lu",(unsigned long)GetCurrentProcessId());startup_log("Base directory: %s",app.base);
}
static int launch_argument(void){
 int count=0,mode=UI_APP;LPWSTR *args=CommandLineToArgvW(GetCommandLineW(),&count);
 if(args){for(int i=1;i<count;i++){if(!wcscmp(args[i],L"--ui-compat"))mode=UI_COMPAT;else if(!wcscmp(args[i],L"--ui-browser"))mode=UI_BROWSER;}LocalFree(args);}return mode;
}
static int other_copy(HWND window){
 DWORD pid=0;GetWindowThreadProcessId(window,&pid);HANDLE process=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,pid);
 if(!process)return 0;wchar_t running[2400],current[2400],message[5200];DWORD size=2400;
 int different=QueryFullProcessImageNameW(process,0,running,&size)&&GetModuleFileNameW(NULL,current,2400)&&_wcsicmp(running,current);CloseHandle(process);
 if(different){swprintf(message,5200,L"Уже работает SCADA из другой папки:\n%ls\n\nЗакройте её через значок в трее → Выход, затем запустите нужную копию.",running);MessageBoxW(NULL,message,L"Guris SCADA — другая копия",MB_ICONINFORMATION);}return different;
}
static int directory_ok(const wchar_t *path){DWORD attrs=GetFileAttributesW(path);if(attrs!=INVALID_FILE_ATTRIBUTES)return (attrs&FILE_ATTRIBUTE_DIRECTORY)!=0;return CreateDirectoryW(path,NULL)!=0;}
static int profile_directory(wchar_t out[2400],int mode){
 const wchar_t *vars[]={L"LOCALAPPDATA",L"TEMP"};wchar_t root[2000],parent[2400];
 if(!ui_session_tag[0]){unsigned char random[8];char hex[17];if(!random_bytes(random,8))return 0;bytes_hex(random,8,hex);MultiByteToWideChar(CP_UTF8,0,hex,-1,ui_session_tag,17);}
 for(unsigned i=0;i<2;i++){
  DWORD n=GetEnvironmentVariableW(vars[i],root,2000);if(!n||n>=2000)continue;
  if(swprintf(parent,2400,L"%ls\\GurisSCADA",root)<0||!directory_ok(parent))continue;
  wchar_t profile_root[2400];if(swprintf(profile_root,2400,L"%ls\\%ls",parent,ui_profile_name(mode))<0||!directory_ok(profile_root))continue;
  if(swprintf(out,2400,L"%ls\\Run_%ls",profile_root,ui_session_tag)<0||!directory_ok(out))continue;
  wcscpy(ui_session_profiles[mode==UI_COMPAT?1:0],out);
  log_wide("Dedicated Edge profile: ",out);return 1;
 }startup_log("Cannot create dedicated Edge profile; Win32 error=%lu",(unsigned long)GetLastError());return 0;
}
static int find_edge(wchar_t out[2400]){
 const wchar_t *vars[]={L"ProgramFiles(x86)",L"ProgramFiles",L"LOCALAPPDATA"};out[0]=0;
 for(unsigned i=0;i<3;i++){
  wchar_t root[2000];DWORD n=GetEnvironmentVariableW(vars[i],root,2000);if(!n||n>=2000)continue;
  if(swprintf(out,2400,L"%ls\\Microsoft\\Edge\\Application\\msedge.exe",root)<0)continue;
  DWORD attrs=GetFileAttributesW(out);if(attrs!=INVALID_FILE_ATTRIBUTES&&!(attrs&FILE_ATTRIBUTE_DIRECTORY))return 1;
 }out[0]=0;return 0;
}
static BOOL CALLBACK find_ui(HWND window,LPARAM data){
 (void)data;wchar_t title[500],kind[100],marker[80];GetWindowTextW(window,title,500);GetClassNameW(window,kind,100);swprintf(marker,80,L"[GurisSCADA:%u]",app.http_port);
 if(IsWindowVisible(window)&&wcsstr(title,marker)&&!wcscmp(kind,L"Chrome_WidgetWin_1")){
  DWORD pid=0;BOOL owned=FALSE;GetWindowThreadProcessId(window,&pid);HANDLE process=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,pid);
  if(process){if(edge_job)IsProcessInJob(process,edge_job,&owned);else if(edge_process)owned=pid==GetProcessId(edge_process);CloseHandle(process);}
  if(owned){ui_window=window;return FALSE;}
 }return TRUE;
}
static int ensure_edge_job(void){
 if(edge_job)return 1;
 HANDLE job=CreateJobObjectW(NULL,NULL);if(!job)return 0;JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;memset(&limits,0,sizeof(limits));limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
 if(!SetInformationJobObject(job,JobObjectExtendedLimitInformation,&limits,sizeof(limits))){CloseHandle(job);return 0;}edge_job=job;return 1;
}
static void begin_tracking(int mode){
 launched_at=now_ms();launch_mode=mode;launch_pending=1;edge_exit_logged=0;document_logged=0;ui_window=NULL;
 lock(&app.mutex);app.ui_kiosk=ui_is_kiosk(mode);ready_before=app.ui_ready_count;document_before=app.ui_document_count;error_before=app.ui_error_count;unlock(&app.mutex);
}
static void launch_ui_mode(int mode,int fresh_attempt){
 if(fresh_attempt&&mode==launch_mode&&ui_window&&IsWindow(ui_window)){ShowWindow(ui_window,SW_RESTORE);SetForegroundWindow(ui_window);return;}
 if(fresh_attempt)compat_attempted=mode!=UI_APP;
 if(edge_process){CloseHandle(edge_process);edge_process=NULL;}
 wchar_t url[512],base[2400],edge[2400],profile[2400],command[9000],debug[2400];
 if(!MultiByteToWideChar(CP_UTF8,0,app.url,-1,url,512)||!MultiByteToWideChar(CP_UTF8,0,app.base,-1,base,2400)){startup_log("UI path conversion failed");return;}
 startup_log("Open interface: mode=%s; local HTTP port=%u",mode==UI_COMPAT?"Edge kiosk compatibility (GPU disabled)":mode==UI_BROWSER?"default browser (diagnostic)":"Edge kiosk",app.http_port);
 lock(&app.mutex);app.diag_ui_mode=mode;unlock(&app.mutex);begin_tracking(mode);
 if(mode!=UI_BROWSER&&find_edge(edge)&&profile_directory(profile,mode)){
  log_wide("Edge executable: ",edge);
  swprintf(debug,2400,L"%ls\\logs\\Edge_startup_%lu.log",base,(unsigned long)GetCurrentProcessId());
  int command_ok=ui_build_edge_command(command,9000,edge,url,profile,debug,mode);
  STARTUPINFOW start;PROCESS_INFORMATION process;memset(&start,0,sizeof(start));memset(&process,0,sizeof(process));start.cb=sizeof(start);
  if(command_ok&&ensure_edge_job()&&CreateProcessW(edge,command,NULL,NULL,FALSE,CREATE_SUSPENDED,NULL,base,&start,&process)){
   if(AssignProcessToJobObject(edge_job,process.hProcess)){
    ResumeThread(process.hThread);CloseHandle(process.hThread);edge_process=process.hProcess;startup_log("Dedicated Edge created and owned: PID=%lu",(unsigned long)process.dwProcessId);return;
   }
   startup_log("Cannot own dedicated Edge process, Win32 error=%lu",(unsigned long)GetLastError());TerminateProcess(process.hProcess,1);CloseHandle(process.hThread);CloseHandle(process.hProcess);
  }startup_log("CreateProcessW for Edge failed; Win32 error=%lu",(unsigned long)GetLastError());
 }else if(mode!=UI_BROWSER)startup_log("Edge or dedicated profile unavailable");
 lock(&app.mutex);app.ui_kiosk=0;unlock(&app.mutex);
 HINSTANCE r=ShellExecuteW(NULL,L"open",url,NULL,NULL,SW_SHOWNORMAL);launch_mode=UI_BROWSER;
 startup_log("Fallback/default browser ShellExecute result=%lld",(long long)(INT_PTR)r);
 if((INT_PTR)r<=32){launch_pending=0;MessageBoxW(tray_window,L"Не удалось открыть интерфейс. Подробности в logs/SCADA_startup_*.log.",L"Guris SCADA",MB_ICONERROR);}
}
static void open_ui(void){
 if(ui_window&&IsWindow(ui_window)){ShowWindow(ui_window,SW_RESTORE);SetForegroundWindow(ui_window);return;}
 launch_ui_mode(launch_mode,1);
}
static BOOL CALLBACK close_owned_ui(HWND window,LPARAM data){
 (void)data;DWORD pid=0;BOOL owned=FALSE;GetWindowThreadProcessId(window,&pid);HANDLE process=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,pid);
 if(process){if(edge_job)IsProcessInJob(process,edge_job,&owned);CloseHandle(process);}if(owned)PostMessageW(window,WM_CLOSE,0,0);return TRUE;
}
static void close_scada_ui(void){
 if(!edge_job)return;
 EnumWindows(close_owned_ui,0);
 uint64_t until=now_ms()+1500;JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info;
 while(now_ms()<until&&QueryInformationJobObject(edge_job,JobObjectBasicAccountingInformation,&info,sizeof(info),NULL)&&info.ActiveProcesses)pause_ms(50);
 CloseHandle(edge_job);edge_job=NULL;
 // Only this run's disposable, dedicated profiles are eligible for cleanup.
 for(unsigned i=0;i<2;i++)if(ui_session_profiles[i][0]){
  wchar_t path[2402];size_t n=wcslen(ui_session_profiles[i]);memcpy(path,ui_session_profiles[i],(n+1)*sizeof(wchar_t));path[n+1]=0;
  SHFILEOPSTRUCTW op;memset(&op,0,sizeof(op));op.wFunc=FO_DELETE;op.pFrom=path;op.fFlags=FOF_NO_UI;SHFileOperationW(&op);
 }
}
static void monitor_ui(void){
 if(ui_window&&!IsWindow(ui_window)){ui_window=NULL;startup_log("Interface window closed; backend remains in tray until explicit Exit");}
 if(!launch_pending)return;
 unsigned ready,document,errors;char error[256];lock(&app.mutex);ready=app.ui_ready_count;document=app.ui_document_count;errors=app.ui_error_count;copy_s(error,sizeof(error),app.ui_error);unlock(&app.mutex);
 if(document>document_before&&!document_logged){document_logged=1;startup_log("Authenticated HTML document served");}
 if(errors>error_before){error_before=errors;startup_log("Frontend error: %s",error);}
 if(ready>ready_before){launch_pending=0;startup_log("UI READY: JavaScript initialized successfully, elapsed=%llu ms",(unsigned long long)(now_ms()-launched_at));EnumWindows(find_ui,0);return;}
 if(edge_process&&!edge_exit_logged&&WaitForSingleObject(edge_process,0)==WAIT_OBJECT_0){DWORD code=0;GetExitCodeProcess(edge_process,&code);edge_exit_logged=1;startup_log("Edge launcher process exited: code=0x%08lX (may delegate to another Edge process)",(unsigned long)code);}
 if(now_ms()-launched_at<15000)return;
 if(launch_mode==UI_APP&&!compat_attempted){startup_log("No UI READY in 15 seconds; trying independent compatibility profile");compat_attempted=1;launch_ui_mode(UI_COMPAT,0);return;}
 launch_pending=0;startup_log("No UI READY after startup timeout; backend is alive");
 wchar_t location[2400],message[3300];MultiByteToWideChar(CP_UTF8,0,startup_path,-1,location,2400);
 swprintf(message,3300,L"Edge не подтвердил загрузку интерфейса.\nSCADA остаётся доступна в трее.\n\nМожно выбрать «Открыть в браузере» в меню значка SCADA.\n\nЖурнал запуска:\n%ls",location);
 MessageBoxW(tray_window,message,L"Guris SCADA — окно не загрузилось",MB_ICONWARNING);
}
#endif
