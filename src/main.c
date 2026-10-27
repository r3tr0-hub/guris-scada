#include "app.h"
#include "http.h"

static int create_token(void){unsigned char bytes[32];
#ifdef _WIN32
 if(BCryptGenRandom(NULL,bytes,sizeof(bytes),BCRYPT_USE_SYSTEM_PREFERRED_RNG)!=0)return 0;
#else
 if(getrandom(bytes,sizeof(bytes),0)!=(ssize_t)sizeof(bytes))return 0;
#endif
 static const char h[]="0123456789abcdef";for(unsigned i=0;i<32;i++){app.token[2*i]=h[bytes[i]>>4];app.token[2*i+1]=h[bytes[i]&15];}app.token[64]=0;return 1;
}
static void app_init(const char *base){
 memset(&app,0,sizeof(app));mutex_init(&app.mutex);mutex_init(&app.log_mutex);atomic_init(&app.stop,0);atomic_init(&app.quitting,0);atomic_init(&app.diag_audit_error,0);
 copy_s(app.base,sizeof(app.base),base);copy_s(app.ip,sizeof(app.ip),"192.168.1.250");copy_s(app.netid,sizeof(app.netid),"5.105.198.193.1.1");app.ads_port=801;app.tcp_port=48898;app.wanted_connection=1;app.config_serial=1;app.tx.field=-1;copy_s(app.message,sizeof(app.message),"Подключение к ПЛК…");
 size_t size;unsigned char *config=read_file("connection.json",&size);
 if(config){Pair p[8];int n=json_pairs((char*)config,p,8);char reason[256];if(n==4)connect_config(p,n,reason,sizeof(reason));free(config);}
 char path[2400];path_join(path,"logs");make_dir(path);time_t tt=time(NULL);struct tm tmv;
#ifdef _WIN32
 localtime_s(&tmv,&tt);unsigned pid=(unsigned)GetCurrentProcessId();
#else
 localtime_r(&tt,&tmv);unsigned pid=(unsigned)getpid();
#endif
 char stamp[80],rel[150];strftime(stamp,sizeof(stamp),"%Y%m%d_%H%M%S",&tmv);snprintf(rel,sizeof(rel),"logs/SCADA_%s_%u.csv",stamp,pid);path_join(app.log_path,rel);app.log=file_open(app.log_path,"wb");
 if(!app.log)atomic_store(&app.diag_audit_error,1);
 local_init();command_init();unwinder_init();
 if(app.log){fwrite("\xEF\xBB\xBF",1,3,app.log);fputs("utc;operation;parameter;result;before;requested;actual;ads_error;message;actor\r\n",app.log);fflush(app.log);}
}
static void finish_pending(void){Transaction t;lock(&app.mutex);int pending=app.busy;t=app.tx;unlock(&app.mutex);if(pending)transaction_finish(&t,t.sent?"uncertain":"cancelled",t.sent?"Программа закрыта до подтверждения записи":"Запись отменена до отправки");}
#ifdef _WIN32
#include "ui_launch.h"
static DWORD WINAPI worker_entry(LPVOID arg){(void)arg;worker_run();return 0;}
static DWORD WINAPI http_entry(LPVOID arg){(void)arg;http_run();return 0;}
static HANDLE production_thread,diagnostic_thread;
static DWORD WINAPI diagnostic_entry(LPVOID arg){(void)arg;diagnostic_run();return 0;}
static DWORD WINAPI production_entry(LPVOID arg){(void)arg;production_run();return 0;}
static LRESULT CALLBACK tray_proc(HWND hwnd,UINT message,WPARAM wp,LPARAM lp){
 if(message==WM_APP+1){if(lp==WM_LBUTTONDBLCLK){open_ui();return 0;}if(lp==WM_RBUTTONUP){POINT p;GetCursorPos(&p);HMENU m=CreatePopupMenu();AppendMenuW(m,MF_STRING,1,native_text("Открыть SCADA"));AppendMenuW(m,MF_STRING,3,native_text("Открыть без ускорения GPU"));AppendMenuW(m,MF_STRING,4,native_text("Открыть в браузере"));AppendMenuW(m,MF_STRING,2,native_text("Выход"));SetForegroundWindow(hwnd);int cmd=TrackPopupMenu(m,TPM_RETURNCMD|TPM_RIGHTBUTTON,p.x,p.y,0,hwnd,NULL);DestroyMenu(m);if(cmd==1)open_ui();else if(cmd==3)launch_ui_mode(UI_COMPAT,1);else if(cmd==4)launch_ui_mode(UI_BROWSER,1);else if(cmd==2)request_quit();return 0;}}
 if(message==WM_APP+10){if(wp==UI_COMPAT||wp==UI_BROWSER)launch_ui_mode((int)wp,1);else open_ui();return 0;}
 if(message==WM_TIMER){
  if(atomic_load(&app.stop)){PostMessageW(hwnd,WM_CLOSE,0,0);return 0;}
  monitor_ui();
  return 0;
 }
 if(message==WM_CLOSE){if(!atomic_load(&app.stop)){request_quit();return 0;}DestroyWindow(hwnd);return 0;}
 if(message==WM_DESTROY){Shell_NotifyIconW(NIM_DELETE,&tray);PostQuitMessage(0);return 0;}
 return DefWindowProcW(hwnd,message,wp,lp);
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE previous,PWSTR command,int show){
 (void)previous;(void)command;(void)show;int requested_mode=launch_argument();one_instance=CreateMutexW(NULL,FALSE,L"Local\\GurisSCADA_Test_0_1");
 if(!one_instance)return 1;
 if(GetLastError()==ERROR_ALREADY_EXISTS){HWND w=FindWindowW(L"GurisSCADA_Tray_0_1",NULL);if(w&&!other_copy(w))PostMessageW(w,WM_APP+10,(WPARAM)requested_mode,0);CloseHandle(one_instance);return 0;}
 WSADATA ws;if(WSAStartup(MAKEWORD(2,2),&ws)){MessageBoxW(NULL,L"Не удалось запустить сеть Windows.",ui_title,MB_ICONERROR);CloseHandle(one_instance);return 1;}
 wchar_t exe[2400];char base[2400];GetModuleFileNameW(NULL,exe,2400);wchar_t *slash=wcsrchr(exe,L'\\');if(slash)*slash=0;WideCharToMultiByte(CP_UTF8,0,exe,-1,base,sizeof(base),NULL,NULL);app_init(base);production_init();diagnostic_init();diagnostic_export_init();startup_open();
 const char *assets[]={"ui/index.html","ui/diagnostics.js","ui/app.js","ui/style.css","ui/themes.css","ui/assets/brand.png","ui/favicon.svg","ui/mockup.css","ui/mechanisms.js","ui/i18n.js","ui/alarms.json","ui/io.js","ui/manuals.js","ui/manuals.css","ui/production.js","ui/production.css","ui/vendor/marked-17.0.5.umd.js","ui/io_catalog.json","ui/locales/catalog.json","ui/locales/ru.json","ui/locales/en.json","ui/locales/tr.json","ui/functionality.js","ui/functionality.json","ui/performance.json","ui/engineering.json","ui/assets/flags/tr.svg","ui/assets/flags/ru.svg","ui/assets/flags/gb.svg"};
 for(unsigned i=0;i<sizeof(assets)/sizeof(assets[0]);i++){size_t n;unsigned char *data=read_file(assets[i],&n);if(!data){startup_log("Required UI file unavailable: %s",assets[i]);MessageBoxW(NULL,L"Не найдены файлы ui. Распакуйте весь архив и запускайте EXE из распакованной папки.",ui_title,MB_ICONERROR);WSACleanup();CloseHandle(one_instance);return 1;}free(data);}
 startup_log("All required UI files readable");
 if(!create_token()||!http_open()){startup_log("Cannot initialize token or local HTTP, Win32 error=%lu",(unsigned long)GetLastError());MessageBoxW(NULL,L"Не удалось запустить локальный интерфейс.",ui_title,MB_ICONERROR);WSACleanup();CloseHandle(one_instance);return 1;}
 startup_log("HTTP listener ready on 127.0.0.1:%u",app.http_port);
 WNDCLASSW wc;memset(&wc,0,sizeof(wc));wc.lpfnWndProc=tray_proc;wc.hInstance=instance;wc.lpszClassName=L"GurisSCADA_Tray_0_1";RegisterClassW(&wc);
 tray_window=CreateWindowExW(0,wc.lpszClassName,ui_title,WS_OVERLAPPED,0,0,0,0,NULL,NULL,instance,NULL);if(!tray_window)return 1;
 memset(&tray,0,sizeof(tray));tray.cbSize=sizeof(tray);tray.hWnd=tray_window;tray.uID=1;tray.uFlags=NIF_MESSAGE|NIF_ICON|NIF_TIP;tray.uCallbackMessage=WM_APP+1;tray.hIcon=LoadIconW(NULL,IDI_APPLICATION);copy_s(app.message,sizeof(app.message),"Подключение к ПЛК…");wcscpy(tray.szTip,L"Guris SCADA · 0.1.25");Shell_NotifyIconW(NIM_ADD,&tray);SetTimer(tray_window,1,500,NULL);
 worker_thread=CreateThread(NULL,0,worker_entry,NULL,0,NULL);http_thread=CreateThread(NULL,0,http_entry,NULL,0,NULL);production_thread=CreateThread(NULL,0,production_entry,NULL,0,NULL);diagnostic_thread=CreateThread(NULL,0,diagnostic_entry,NULL,0,NULL);if(!diagnostic_thread)diagnostic_failed("Не удалось запустить запись диагностики");
 if(!worker_thread||!http_thread||!production_thread){atomic_store(&app.stop,1);MessageBoxW(NULL,L"Не удалось запустить обмен с ПЛК.",ui_title,MB_ICONERROR);}else launch_ui_mode(requested_mode,1);
 MSG msg;while(GetMessageW(&msg,NULL,0,0)>0){TranslateMessage(&msg);DispatchMessageW(&msg);}
 atomic_store(&app.stop,1);if(worker_thread){WaitForSingleObject(worker_thread,INFINITE);CloseHandle(worker_thread);}if(http_thread){WaitForSingleObject(http_thread,INFINITE);CloseHandle(http_thread);}if(production_thread){WaitForSingleObject(production_thread,INFINITE);CloseHandle(production_thread);}finish_pending();diagnostic_export_join();production_shutdown();atomic_store(&diagnostic_stopping,1);if(diagnostic_thread){WaitForSingleObject(diagnostic_thread,INFINITE);CloseHandle(diagnostic_thread);}
 close_scada_ui();startup_log("Backend stopped by explicit Exit");if(edge_process)CloseHandle(edge_process);if(startup_file)fclose(startup_file);if(app.log)fclose(app.log);WSACleanup();CloseHandle(one_instance);return 0;
}
#else
#include <signal.h>
static void *worker_entry(void *arg){(void)arg;worker_run();return NULL;}
static void *http_entry(void *arg){(void)arg;http_run();return NULL;}
static void *diagnostic_entry(void *arg){(void)arg;diagnostic_run();return NULL;}
static void *production_entry(void *arg){(void)arg;production_run();return NULL;}
static void stopped(int sig){(void)sig;request_quit();}
int main(int argc,char **argv){
 char base[2048];if(!getcwd(base,sizeof(base)))return 1;app_init(base);
 for(int i=1;i<argc;i++){if(!strcmp(argv[i],"--ip")&&i+1<argc)copy_s(app.ip,sizeof(app.ip),argv[++i]);else if(!strcmp(argv[i],"--tcp-port")&&i+1<argc)app.tcp_port=(unsigned)atoi(argv[++i]);else if(!strcmp(argv[i],"--ui")&&i+1<argc)copy_s(app.base,sizeof(app.base),argv[++i]);else if(!strcmp(argv[i],"--offline"))app.wanted_connection=0;}
 production_init();diagnostic_init();diagnostic_export_init();
 signal(SIGPIPE,SIG_IGN);signal(SIGINT,stopped);signal(SIGTERM,stopped);
 if(!create_token()||!http_open())return 1;
 /* Private test harness consumes this line; production Windows does not print it. */
 printf("READY %u %s\n",app.http_port,app.token);fflush(stdout);
 pthread_t w,h,p,d;pthread_create(&w,NULL,worker_entry,NULL);pthread_create(&h,NULL,http_entry,NULL);pthread_create(&p,NULL,production_entry,NULL);int diagnostic_started=pthread_create(&d,NULL,diagnostic_entry,NULL)==0;if(!diagnostic_started)diagnostic_failed("Не удалось запустить запись диагностики");while(!atomic_load(&app.stop))pause_ms(100);pthread_join(w,NULL);pthread_join(h,NULL);pthread_join(p,NULL);finish_pending();diagnostic_export_join();production_shutdown();atomic_store(&diagnostic_stopping,1);if(diagnostic_started)pthread_join(d,NULL);if(app.log)fclose(app.log);return 0;
}
#endif
