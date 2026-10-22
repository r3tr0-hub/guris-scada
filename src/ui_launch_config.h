#ifndef GURIS_UI_LAUNCH_CONFIG_H
#define GURIS_UI_LAUNCH_CONFIG_H
#include <wchar.h>
enum { UI_APP=0,UI_COMPAT=1,UI_BROWSER=2 };
static int ui_is_kiosk(int mode){return mode==UI_APP||mode==UI_COMPAT;}
static const wchar_t *ui_profile_name(int mode){return mode==UI_COMPAT?L"Edge_SCADA_Kiosk_1_Compatibility":L"Edge_SCADA_Kiosk_1";}
/* Only the dedicated SCADA browser is configured; no Windows/Edge policies. */
static int ui_build_edge_command(wchar_t *out,size_t cap,const wchar_t *edge,const wchar_t *url,const wchar_t *profile,const wchar_t *debug,int mode){
 if(!ui_is_kiosk(mode)||!out||!cap)return 0;
 int n=swprintf(out,cap,L"\"%ls\" --kiosk \"%ls\" --edge-kiosk-type=fullscreen --kiosk-idle-timeout-minutes=0 --no-first-run --no-default-browser-check --disable-features=Translate --user-data-dir=\"%ls\" --enable-logging --log-file=\"%ls\"%ls",edge,url,profile,debug,mode==UI_COMPAT?L" --disable-gpu":L"");
 return n>0&&(size_t)n<cap;
}
#endif
