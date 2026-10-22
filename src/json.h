#ifndef SCADA_JSON_H
#define SCADA_JSON_H
typedef struct {char *data;size_t used,cap;int failed;} Buffer;
static void binit(Buffer *b,char *data,size_t cap){b->data=data;b->used=0;b->cap=cap;b->failed=0;if(cap)data[0]=0;}
static void bf(Buffer *b,const char *fmt,...){if(b->failed)return;va_list a;va_start(a,fmt);int n=vsnprintf(b->data+b->used,b->cap-b->used,fmt,a);va_end(a);if(n<0||(size_t)n>=b->cap-b->used){b->failed=1;return;}b->used+=(size_t)n;}
static void bj(Buffer *b,const char *s){bf(b,"\"");for(const unsigned char *p=(const unsigned char*)s;*p;p++){if(*p=='"'||*p=='\\')bf(b,"\\%c",*p);else if(*p<32)bf(b,"\\u%04x",*p);else bf(b,"%c",*p);}bf(b,"\"");}
typedef struct {char key[40],value[600];int number;} Pair;
static const char *skipspace(const char *p){while(*p==' '||*p=='\t'||*p=='\r'||*p=='\n')p++;return p;}
static const char *jstring(const char *p,char *out,size_t cap){if(*p++!='"')return NULL;size_t n=0;while(*p&&*p!='"'){unsigned char x=(unsigned char)*p++;if(x<32)return NULL;if(x=='\\'){x=(unsigned char)*p++;if(x!='"'&&x!='\\'&&x!='/')return NULL;}if(n+1>=cap)return NULL;out[n++]=(char)x;}if(*p!='"')return NULL;out[n]=0;return p+1;}
static int json_pairs(const char *p,Pair *out,int max){p=skipspace(p);if(*p++!='{')return -1;p=skipspace(p);int n=0;if(*p=='}')return !*skipspace(p+1)?0:-1;while(*p){if(n>=max)return -1;Pair *x=&out[n];p=jstring(p,x->key,sizeof(x->key));if(!p)return -1;for(int i=0;i<n;i++)if(!strcmp(out[i].key,x->key))return -1;p=skipspace(p);if(*p++!=':')return -1;p=skipspace(p);x->number=*p!='"';if(!x->number){p=jstring(p,x->value,sizeof(x->value));if(!p)return -1;}else{size_t z=0;while((*p>='0'&&*p<='9')||*p=='-'||*p=='+'||*p=='.'||*p=='e'||*p=='E'){if(z+1>=sizeof(x->value))return -1;x->value[z++]=*p++;}if(!z)return -1;x->value[z]=0;}n++;p=skipspace(p);if(*p=='}')return !*skipspace(p+1)?n:-1;if(*p++!=',')return -1;p=skipspace(p);}return -1;}
static const char *pair_get(Pair *p,int n,const char *key){for(int i=0;i<n;i++)if(!strcmp(p[i].key,key))return p[i].value;return NULL;}
static int number_parse(const char *text,double *out){if(!text||!*text||strlen(text)>40)return 0;char copy[48];copy_s(copy,sizeof(copy),text);if(strchr(copy,',')&&strchr(copy,'.'))return 0;for(char *p=copy;*p;p++)if(*p==',')*p='.';char *tail;double v=strtod(copy,&tail);if(tail==copy||*tail||!isfinite(v))return 0;*out=v;return 1;}
static void raw_hex(const unsigned char *raw,unsigned n,char out[33]){static const char h[]="0123456789ABCDEF";for(unsigned i=0;i<n;i++){out[2*i]=h[raw[i]>>4];out[2*i+1]=h[raw[i]&15];}out[2*n]=0;}
static int hex_raw(const char *s,unsigned n,unsigned char *out){if(n>16||!s||strlen(s)!=2*n)return 0;for(unsigned i=0;i<2*n;i++){char x=s[i];int v=x>='0'&&x<='9'?x-'0':x>='A'&&x<='F'?x-'A'+10:x>='a'&&x<='f'?x-'a'+10:-1;if(v<0)return 0;if(i%2)out[i/2]|=(unsigned char)v;else out[i/2]=(unsigned char)(v<<4);}return 1;}
#endif
