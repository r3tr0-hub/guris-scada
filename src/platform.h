#ifndef SCADA_PLATFORM_H
#define SCADA_PLATFORM_H
#define _POSIX_C_SOURCE 200809L
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <math.h>
#include <time.h>
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define _UNICODE
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#include <bcrypt.h>
typedef SOCKET Socket;
typedef CRITICAL_SECTION Mutex;
#define BAD_SOCKET INVALID_SOCKET
#define sock_close closesocket
static void mutex_init(Mutex *m){InitializeCriticalSection(m);}
static void lock(Mutex *m){EnterCriticalSection(m);}
static void unlock(Mutex *m){LeaveCriticalSection(m);}
static uint64_t now_ms(void){return GetTickCount64();}
static uint64_t wall_ms(void){FILETIME ft;ULARGE_INTEGER ticks;GetSystemTimeAsFileTime(&ft);ticks.LowPart=ft.dwLowDateTime;ticks.HighPart=ft.dwHighDateTime;uint64_t ms=ticks.QuadPart/10000;return ms>=UINT64_C(11644473600000)?ms-UINT64_C(11644473600000):0;}
static void pause_ms(unsigned ms){Sleep(ms);}
static int set_nonblocking(Socket s){u_long one=1;return ioctlsocket(s,FIONBIO,&one)==0;}
static int sock_would_block(void){int e=WSAGetLastError();return e==WSAEWOULDBLOCK||e==WSAEINPROGRESS;}
#else
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <sys/socket.h>
#include <sys/select.h>
#include <sys/stat.h>
#include <arpa/inet.h>
#include <sys/random.h>
typedef int Socket;
typedef pthread_mutex_t Mutex;
#define BAD_SOCKET (-1)
#define sock_close close
static void mutex_init(Mutex *m){pthread_mutex_init(m,NULL);}
static void lock(Mutex *m){pthread_mutex_lock(m);}
static void unlock(Mutex *m){pthread_mutex_unlock(m);}
static uint64_t now_ms(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return (uint64_t)t.tv_sec*1000+t.tv_nsec/1000000;}
static uint64_t wall_ms(void){struct timespec t;if(clock_gettime(CLOCK_REALTIME,&t)||t.tv_sec<0)return 0;return (uint64_t)t.tv_sec*1000+t.tv_nsec/1000000;}
static void pause_ms(unsigned ms){struct timespec t={ms/1000,(long)(ms%1000)*1000000};nanosleep(&t,NULL);}
static int set_nonblocking(Socket s){return fcntl(s,F_SETFL,fcntl(s,F_GETFL,0)|O_NONBLOCK)==0;}
static int sock_would_block(void){return errno==EWOULDBLOCK||errno==EAGAIN||errno==EINPROGRESS;}
#endif
static int wait_io(Socket s,int writing,unsigned ms){
 fd_set r,w,e;FD_ZERO(&r);FD_ZERO(&w);FD_ZERO(&e);FD_SET(s,&e);
 if(writing)FD_SET(s,&w);else FD_SET(s,&r);
 struct timeval t={(long)(ms/1000),(long)(ms%1000)*1000};
 return select((int)s+1,&r,&w,&e,&t);
}
static int io_bytes(Socket s,unsigned char *b,size_t count,int writing,uint64_t deadline){
 size_t done=0;
 while(done<count){uint64_t n=now_ms();if(n>=deadline)return 0;
  if(wait_io(s,writing,(unsigned)(deadline-n))<=0)return 0;
  int z=writing?send(s,(const char*)b+done,(int)(count-done),0):recv(s,(char*)b+done,(int)(count-done),0);
  if(z==0)return 0;
  if(z<0){if(sock_would_block())continue;return 0;}
  done+=(size_t)z;
 }return 1;
}
static void copy_s(char *out,size_t cap,const char *s){if(cap){snprintf(out,cap,"%s",s?s:"");out[cap-1]=0;}}
static void utc_stamp(char out[40]){
 time_t t=time(NULL);struct tm tmv;
#ifdef _WIN32
 gmtime_s(&tmv,&t);
#else
 gmtime_r(&t,&tmv);
#endif
 strftime(out,40,"%Y-%m-%dT%H:%M:%SZ",&tmv);
}
#endif
