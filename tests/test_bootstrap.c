#include "../src/app.h"
#include "../src/http.h"
#include <assert.h>
int main(void){
 mutex_init(&app.mutex);copy_s(app.token,sizeof(app.token),"test-token-not-a-real-session");
 const char *html="<html data-theme=\"@@SCADA_THEME@@\"><script nonce=\"@@SCADA_NONCE@@\">window.SCADA_BOOT={token:\"@@SCADA_TOKEN@@\",kiosk:@@SCADA_KIOSK@@};</script>";
 for(int theme=0;theme<2;theme++)for(int mode=0;mode<2;mode++){
  app.options.theme=theme;
  app.ui_kiosk=mode;size_t size=0;unsigned char *out=expand_boot((const unsigned char*)html,strlen(html),&size);assert(out);
  assert(size==strlen((const char*)out));assert(!strstr((char*)out,"@@SCADA_"));
  assert(strstr((char*)out,theme?"data-theme=\"classic\"":"data-theme=\"dark\""));
  assert(strstr((char*)out,mode?",kiosk:true}":",kiosk:false}"));assert(strstr((char*)out,"nonce=\"test-token-not-a-real-session\""));free(out);
 }
 size_t size=0;assert(!expand_boot((const unsigned char*)"no bootstrap token",18,&size));
 puts("PASS: native bootstrap expands nonce/token/kiosk mode, byte counts and terminators for both launch modes/themes; no test mode in production CLI.");return 0;
}
