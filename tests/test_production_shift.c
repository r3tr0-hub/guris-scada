#include "../src/app.h"
#include <assert.h>
static uint64_t local_ms(int y,int m,int d,int h,int minute){struct tm t={0};t.tm_year=y-1900;t.tm_mon=m-1;t.tm_mday=d;t.tm_hour=h;t.tm_min=minute;t.tm_isdst=-1;time_t s=mktime(&t);assert(s>0);return (uint64_t)s*1000;}
static void zone(const char *name){
#ifdef _WIN32
 _putenv_s("TZ",name);_tzset();
#else
 setenv("TZ",name,1);tzset();
#endif
}
static void check(int y,int m,int d,int h,int minute,uint64_t start,uint64_t end){sqlite3_int64 a,z;uint64_t now=local_ms(y,m,d,h,minute);assert(production_shift_bounds(now,&a,&z));assert((uint64_t)a==start&&(uint64_t)z==end);assert((uint64_t)a<=now&&now<(uint64_t)z);}
int main(void){
 zone("UTC0");
 check(2026,10,21,7,59,local_ms(2026,10,20,20,0),local_ms(2026,10,21,8,0));
 check(2026,10,21,8,0,local_ms(2026,10,21,8,0),local_ms(2026,10,21,20,0));
 check(2026,10,21,19,59,local_ms(2026,10,21,8,0),local_ms(2026,10,21,20,0));
 check(2026,10,21,20,0,local_ms(2026,10,21,20,0),local_ms(2026,10,22,8,0));
 check(2027,1,1,0,0,local_ms(2026,12,31,20,0),local_ms(2027,1,1,8,0));
 check(2026,11,1,0,0,local_ms(2026,10,31,20,0),local_ms(2026,11,1,8,0));
 zone("EST5EDT");sqlite3_int64 a,z;
 assert(production_shift_bounds(local_ms(2026,3,8,0,30),&a,&z));assert(z-a==11*3600000LL);
 assert(production_shift_bounds(local_ms(2026,11,1,0,30),&a,&z));assert(z-a==13*3600000LL);
 zone("UTC0");puts("PASS: 08:00/20:00 boundaries, previous night, month/year changes, DST shifts use local clock hours");return 0;
}
