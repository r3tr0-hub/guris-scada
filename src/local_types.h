#ifndef SCADA_LOCAL_TYPES_H
#define SCADA_LOCAL_TYPES_H
typedef struct {
 int configured,locked,failures;unsigned char salt[16],hash[32];
 char session[65];uint64_t expires,retry;
} LocalAuth;
enum { THEME_DARK,THEME_CLASSIC };
enum { FONT_SYSTEM,FONT_TAHOMA,FONT_ARIAL,FONT_VERDANA };
typedef struct {int snow,animations,wallpaper,exit_button,theme,font;} LocalOptions;
enum { UNWINDER_NORMAL,UNWINDER_TEMP,UNWINDER_OFF,UNWINDER_RESTORE };
typedef struct {
 int mode,initialized,storage_error;uint64_t deadline,started_wall,until_wall,retry;unsigned serial,port;
 char ip[64],netid[64],message[256];
} UnwinderGuard;
typedef struct {
 int pending,active,restoring,storage_error;uint64_t deadline,retry;unsigned serial;
 char message[256],ids[64][65],ip[64],netid[64];unsigned ids_n,port;
} Cleaning;
#endif
