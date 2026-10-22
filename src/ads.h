#ifndef SCADA_ADS_H
#define SCADA_ADS_H
#include "platform.h"
#include "../reference/ads_wire_readonly.h"
typedef struct {Socket socket;unsigned char target[6],source[6];uint16_t port;uint32_t invoke,error;int sum;} Ads;
enum { META_UNRESOLVED,META_RESOLVED,META_ADS_ERROR,META_BAD_ENTRY,META_NAME_MISMATCH,META_TYPE_MISMATCH,META_UNSUPPORTED_FLAGS,META_TRANSPORT };
typedef struct {uint32_t group,offset,size,data_type,flags,lookup_error;char type[80];int valid,layout,resolution;} Meta;
static int same_ascii(const char *a,const char *b){while(*a&&*b){char x=*a++,y=*b++;if(x>='a'&&x<='z')x-=32;if(y>='a'&&y<='z')y-=32;if(x!=y)return 0;}return *a==*b;}
static const char *metadata_status(const Meta *m){static const char *names[]={"unresolved","resolved","ads_error","invalid_symbol_entry","returned_name_mismatch","type_or_size_mismatch","unsupported_address_flags","transport_error"};return m->resolution>=0&&m->resolution<=META_TRANSPORT?names[m->resolution]:"unknown";}
/* Match the standard AdsSymbolEntry and only the exact extra-byte F009
   layout captured from this PLC. Ported from Explorer's tested lookup_symbols.h.
   No address is taken from a file; full symbol name and record bounds stay strict. */
static int ads_decode_metadata(const unsigned char *data,size_t n,const char *requested,Meta *m){
 memset(m,0,sizeof(*m));m->resolution=META_BAD_ENTRY;
 if(n<33)return 0;
 uint32_t length=u32(data);unsigned nl=u16(data+24),tl=u16(data+26),cl=u16(data+28);
 size_t required=33u+(size_t)nl+tl+cl;
 if(length!=n||required>n||!nl||!tl||tl>=sizeof(m->type))return 0;
 const unsigned char *name=data+30,*type=name+(size_t)nl+1,*comment=type+(size_t)tl+1;
 if(type[tl]||comment[cl]||memchr(type,0,tl))return 0;
 int layout=0;
 if(!name[nl]&&!memchr(name,0,nl))layout=1;
 else if(nl>=2&&length==required&&!name[nl-1]&&!memchr(name,0,nl-1))layout=2;
 if(!layout)return 0;
 m->group=u32(data+4);m->offset=u32(data+8);m->size=u32(data+12);m->data_type=u32(data+16);m->flags=u32(data+20);m->layout=layout;
 memcpy(m->type,type,tl);m->type[tl]=0;
 if(!same_ascii(requested,(const char*)name)){m->resolution=META_NAME_MISMATCH;return 0;}
 m->valid=1;m->resolution=META_RESOLVED;return layout;
}
static int netid_parse(const char *s,unsigned char out[6]){unsigned p[6];char tail;unsigned any=0;if(sscanf(s,"%u.%u.%u.%u.%u.%u%c",p,p+1,p+2,p+3,p+4,p+5,&tail)!=6)return 0;for(int i=0;i<6;i++){if(p[i]>255)return 0;out[i]=(unsigned char)p[i];any|=p[i];}return any!=0;}
static void ads_close(Ads *c){if(c->socket!=BAD_SOCKET)sock_close(c->socket);c->socket=BAD_SOCKET;}
static int ads_open(Ads *c,const char *ip,const char *net,uint16_t tcp_port,uint16_t ads_port){
 memset(c,0,sizeof(*c));c->socket=BAD_SOCKET;c->port=ads_port;c->invoke=1000;c->sum=1;
 if(!netid_parse(net,c->target))return 0;
 Socket s=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);if(s==BAD_SOCKET)return 0;
 if(!set_nonblocking(s)){sock_close(s);return 0;}
 struct sockaddr_in a;memset(&a,0,sizeof(a));a.sin_family=AF_INET;a.sin_port=htons(tcp_port);
 if(inet_pton(AF_INET,ip,&a.sin_addr)!=1){sock_close(s);return 0;}
 int rc=connect(s,(struct sockaddr*)&a,sizeof(a));
 if(rc<0&&!sock_would_block()){sock_close(s);return 0;}
 if(rc<0){if(wait_io(s,1,1500)<=0){sock_close(s);return 0;}int e=0;
#ifdef _WIN32
  int len=sizeof(e);
#else
  socklen_t len=sizeof(e);
#endif
  if(getsockopt(s,SOL_SOCKET,SO_ERROR,(char*)&e,&len)||e){sock_close(s);return 0;}
 }
 struct sockaddr_in local;
#ifdef _WIN32
 int len=sizeof(local);
#else
 socklen_t len=sizeof(local);
#endif
 if(getsockname(s,(struct sockaddr*)&local,&len)){sock_close(s);return 0;}
 memcpy(c->source,&local.sin_addr.s_addr,4);c->source[4]=1;c->source[5]=1;
 if(!memcmp(c->source,c->target,6)){sock_close(s);return 0;}
 c->socket=s;return 1;
}
/* 1=success, -1=explicit ADS/AMS error, 0=untrusted/absent reply. */
static int ads_rpc(Ads *c,unsigned char *request,size_t request_len,unsigned char *data,size_t cap,size_t *length){
 c->error=0;if(length)*length=0;if(c->socket==BAD_SOCKET)return 0;
 unsigned char response[65584];uint64_t deadline=now_ms()+1500;
 if(!io_bytes(c->socket,request,request_len,1,deadline)||!io_bytes(c->socket,response,6,0,deadline))goto bad;
 uint32_t frame=u32(response+2);
 if(u16(response)||frame<32||frame>sizeof(response)-6)goto bad;
 if(!io_bytes(c->socket,response+6,frame,0,deadline))goto bad;
 size_t n=frame+6;uint16_t command=u16(request+22);
 if(command==3){
  if(n<38||u32(response+26)!=n-38||u32(response+34)!=u32(request+34)||u16(response+22)!=3||!(u16(response+24)&1)||memcmp(response+6,request+14,8)||memcmp(response+14,request+6,8))goto bad;
  c->error=u32(response+30);if(c->error)return -1;
  if(n!=42||!(u16(response+24)&4)||memcmp(response+14,request+6,8))goto bad;
  c->error=u32(response+38);return c->error?-1:1;
 }
 AdsReply r;if(!ads_response(response,n,request,&r))goto bad;
 if(r.ams_error||r.ads_error){c->error=r.ams_error?r.ams_error:r.ads_error;return -1;}
 if(command==4){if(cap<2)goto bad;put16(data,r.state);if(length)*length=2;return 1;}
 if(r.data_length>cap)goto bad;
 if(r.data_length)memcpy(data,r.data,r.data_length);
 if(length)*length=r.data_length;
 return 1;
bad:ads_close(c);return 0;
}
static int ads_read(Ads *c,uint32_t group,uint32_t offset,unsigned bytes,unsigned char *out){
 unsigned char q[50];size_t len=0;if(!ads_read_request(q,c->target,c->port,c->source,32768,++c->invoke,group,offset,bytes))return 0;
 int r=ads_rpc(c,q,sizeof(q),out,bytes,&len);if(r==1&&len!=bytes){ads_close(c);return 0;}return r;
}
static int ads_version(Ads *c,unsigned char *v){return ads_read(c,0xF008,0,1,v);}
static int ads_state(Ads *c,unsigned *s){unsigned char q[38],b[2];size_t n=0;ads_request(q,c->target,c->port,c->source,32768,4,++c->invoke);int r=ads_rpc(c,q,sizeof(q),b,sizeof(b),&n);if(r==1)*s=u16(b);return r;}
static int ads_lookup(Ads *c,const char *name,Meta *m){
 unsigned char q[600],data[65535];size_t n=0;memset(m,0,sizeof(*m));
 size_t qn=ads_lookup_request(q,c->target,c->port,c->source,32768,++c->invoke,name);if(!qn)return 0;
 int rc=ads_rpc(c,q,qn,data,sizeof(data),&n);
 if(rc!=1){m->lookup_error=c->error;m->resolution=rc==0?META_TRANSPORT:META_ADS_ERROR;return rc;}
 return ads_decode_metadata(data,n,name,m)?1:-2;
}
static int ads_write_field(Ads *c,const Meta *m,const unsigned char *value,unsigned count,int whitelisted){
 /* Bit 0 is PERSISTENT, not read-only. Recipe settings commonly have it. */
 if(!whitelisted||!m->valid||count!=m->size||(count!=1&&count!=2&&count!=4&&count!=8&&count!=13)||m->flags&(6u|32u))return -1;
 unsigned char q[66];ads_request(q,c->target,c->port,c->source,32768,1,++c->invoke);
 put16(q+22,3);put32(q+2,44+count);put32(q+26,12+count);put32(q+38,m->group);put32(q+42,m->offset);put32(q+46,count);memcpy(q+50,value,count);
 size_t n=0;return ads_rpc(c,q,50+count,NULL,0,&n);
}
static int ads_sum(Ads *c,const Meta *metas,const int *ids,unsigned count,unsigned char raw[][16],uint32_t *errors){
 if(!count||count>64)return -1;
 unsigned char q[822],data[2048];unsigned bytes=4*count;size_t n=0;
 for(unsigned k=0;k<count;k++)bytes+=metas[ids[k]].size;
 ads_request(q,c->target,c->port,c->source,32768,1,++c->invoke);put16(q+22,9);put32(q+2,48+12*count);put32(q+26,16+12*count);
 put32(q+38,0xF080);put32(q+42,count);put32(q+46,bytes);put32(q+50,12*count);
 for(unsigned k=0;k<count;k++){const Meta *m=&metas[ids[k]];put32(q+54+12*k,m->group);put32(q+58+12*k,m->offset);put32(q+62+12*k,m->size);}
 int rc=ads_rpc(c,q,54+12*count,data,sizeof(data),&n);if(rc!=1)return rc;
 if(n!=bytes){ads_close(c);return 0;}unsigned at=4*count;
 for(unsigned k=0;k<count;k++){errors[k]=u32(data+4*k);memcpy(raw[ids[k]],data+at,metas[ids[k]].size);at+=metas[ids[k]].size;}return 1;
}
#endif
