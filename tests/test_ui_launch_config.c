#include <assert.h>
#include <stdio.h>
#include "../src/ui_launch_config.h"
int main(void){
 wchar_t command[9000],tiny[8];
 const wchar_t *edge=L"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
 const wchar_t *url=L"http://127.0.0.1:43199/?k=test-only-token";
 for(int mode=UI_APP;mode<=UI_COMPAT;mode++){
  assert(ui_build_edge_command(command,9000,edge,url,L"C:\\Users\\Operator One\\SCADA profile",L"D:\\SCADA\\logs\\Edge.log",mode));
  assert(wcsstr(command,L"--kiosk \"http://127.0.0.1:43199/?k=test-only-token\""));
  assert(wcsstr(command,L"--edge-kiosk-type=fullscreen"));
  assert(wcsstr(command,L"--kiosk-idle-timeout-minutes=0"));
  assert(wcsstr(command,L"--disable-features=Translate"));
  assert(wcsstr(command,L"--user-data-dir=\"C:\\Users\\Operator One\\SCADA profile\""));
  assert((wcsstr(command,L"--disable-gpu")!=NULL)==(mode==UI_COMPAT));
  assert(!wcsstr(command,L"--app=")&&!wcsstr(command,L"--start-fullscreen"));
 }
 assert(!ui_is_kiosk(UI_BROWSER));
 assert(!ui_build_edge_command(command,9000,edge,url,L"profile",L"debug",UI_BROWSER));
 assert(!ui_build_edge_command(tiny,8,edge,url,L"profile",L"debug",UI_COMPAT));
 assert(wcscmp(ui_profile_name(UI_COMPAT),ui_profile_name(UI_APP)));
 puts("PASS: actual Edge command builder: kiosk URL quoting, fullscreen, no idle reset, translation disabled, dedicated profiles, compatibility GPU flag, diagnostic-mode and buffer guards.");
 return 0;
}
