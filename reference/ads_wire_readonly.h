#ifndef GURIS_ADS_WIRE_H
#define GURIS_ADS_WIRE_H
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#define ADS_REQUEST_SIZE 38
#define ADS_READ_REQUEST_SIZE 50
#define ADS_LOOKUP_CAP 65535u
#define ADS_NAME_CAP 512u
typedef struct {
    uint32_t ams_error, ads_error;
    uint16_t command, state, device_state, build;
    unsigned char major, minor;
    char name[17];
    const unsigned char *data;
    uint32_t data_length;
} AdsReply;
static inline uint16_t u16(const unsigned char *b) {
    return (uint16_t)(b[0] | ((uint16_t)b[1]<<8));
}
static inline uint32_t u32(const unsigned char *b) {
    return (uint32_t)b[0] | ((uint32_t)b[1]<<8) | ((uint32_t)b[2]<<16) | ((uint32_t)b[3]<<24);
}
static inline void put16(unsigned char *b,uint16_t n) {b[0]=(unsigned char)n;b[1]=(unsigned char)(n>>8);}
static inline void put32(unsigned char *b,uint32_t n) {
    for(int i=0;i<4;i++)b[i]=(unsigned char)(n>>(8*i));
}
/* Only ReadDeviceInfo (1) and ReadState (4) are accepted by the builder. */
static inline int ads_request(unsigned char *b,const unsigned char target[6],uint16_t port,
                       const unsigned char source[6],uint16_t client_port,
                       uint16_t command,uint32_t invoke) {
    if(command!=1 && command!=4)return 0;
    memset(b,0,ADS_REQUEST_SIZE);put32(b+2,32);
    memcpy(b+6,target,6);put16(b+12,port);
    memcpy(b+14,source,6);put16(b+20,client_port);
    put16(b+22,command);put16(b+24,4);put32(b+34,invoke);
    return 1;
}
/* ReadWrite(9) is restricted to symbol-description lookup (0xF009).
   Its name payload is a query, not data written to a PLC variable. */
static inline size_t ads_lookup_request(unsigned char *b,const unsigned char target[6],uint16_t port,
                       const unsigned char source[6],uint16_t client_port,uint32_t invoke,const char *name) {
    size_t length=0;
    while(length<ADS_NAME_CAP && name[length])length++;
    if(!length || length==ADS_NAME_CAP)return 0;
    size_t bytes=length+1;
    if(!ads_request(b,target,port,source,client_port,1,invoke))return 0;
    put32(b+2,(uint32_t)(48+bytes));put16(b+22,9);put32(b+26,(uint32_t)(16+bytes));
    put32(b+38,0xF009);put32(b+42,0);put32(b+46,ADS_LOOKUP_CAP);put32(b+50,(uint32_t)bytes);
    memcpy(b+54,name,bytes);return 54+bytes;
}
/* ADS Read (2) has a 12-byte request payload and never writes PLC memory. */
static inline int ads_read_request(unsigned char *b,const unsigned char target[6],uint16_t port,
                       const unsigned char source[6],uint16_t client_port,uint32_t invoke,
                       uint32_t group,uint32_t offset,uint32_t length) {
    if(!length)return 0;
    if(!ads_request(b,target,port,source,client_port,1,invoke))return 0;
    memset(b+ADS_REQUEST_SIZE,0,12);
    put32(b+2,44);put16(b+22,2);put32(b+26,12);
    put32(b+38,group);put32(b+42,offset);put32(b+46,length);
    return 1;
}
static inline int ads_response(const unsigned char *b,size_t n,const unsigned char *request,AdsReply *r) {
    if(n<38 || u16(b)!=0 || u32(b+2)!=n-6 || u32(b+26)!=n-38)return 0;
    if(!(u16(b+24)&1) || u16(b+22)!=u16(request+22) || u32(b+34)!=u32(request+34))return 0;
    if(memcmp(b+6,request+14,8)!=0)return 0;
    memset(r,0,sizeof(*r));r->command=u16(b+22);r->ams_error=u32(b+30);
    if(r->ams_error)return 1; /* Router error may carry no ADS payload. */
    if(memcmp(b+14,request+6,8)!=0 || !(u16(b+24)&4) || n<42)return 0;
    r->ads_error=u32(b+38);if(r->ads_error)return 1;
    if(r->command==1) {
        if(n<62)return 0;
        r->major=b[42];r->minor=b[43];r->build=u16(b+44);
        memcpy(r->name,b+46,16);r->name[16]=0;
    } else if(r->command==4) {
        if(n<46)return 0;
        r->state=u16(b+42);r->device_state=u16(b+44);
    } else if(r->command==2 || r->command==9) {
        if(n<46)return 0;
        r->data_length=u32(b+42);
        if(r->data_length!=n-46 || r->data_length>u32(request+46))return 0;
        r->data=b+46;
    } else return 0;
    return 1;
}
#endif
