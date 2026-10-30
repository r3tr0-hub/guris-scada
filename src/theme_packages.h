#ifndef SCADA_THEME_PACKAGES_H
#define SCADA_THEME_PACKAGES_H
#include <ctype.h>
#include <stdatomic.h>
/* Data-only local theme packages. IDs are append-only in memory; persistence uses
   their string IDs so directory enumeration order never changes a saved choice. */
#ifndef _WIN32
#include <dirent.h>
#include <sys/stat.h>
#endif
typedef struct {char id[40],json[14000];atomic_int valid;} ThemePackage;
static ThemePackage theme_packages[64]={{{'d','a','r','k',0},{0},0},{{'c','l','a','s','s','i','c',0},{0},0}};
static atomic_int theme_package_count=2;
static int theme_id_valid(const char *id){if(!id||!*id||strlen(id)>39||id[0]<'a'||id[0]>'z')return 0;for(const char *p=id;*p;p++)if(!((*p>='a'&&*p<='z')||(*p>='0'&&*p<='9')||*p=='-'))return 0;return 1;}
static int theme_value_valid(const char *v){
 size_t n=strlen(v);if(!n||n>64)return 0;
 if(*v=='#'){if(n!=4&&n!=5&&n!=7&&n!=9)return 0;for(const char *p=v+1;*p;p++)if(!isxdigit((unsigned char)*p))return 0;return 1;}
 if(!strcmp(v,"transparent")||!strcmp(v,"none"))return 1;
 for(const char *p=v;*p;p++)if(!((*p>='0'&&*p<='9')||strchr(" .%pxrem",*p)))return 0;
 return 1;
}
static void theme_package_load(const char *id){
 if(!theme_id_valid(id))return;
 char relative[100],path[2400];snprintf(relative,sizeof(relative),"ui/themes/%s.json",id);path_join(path,relative);
#ifdef _WIN32
 wchar_t wide[3000];if(!MultiByteToWideChar(CP_UTF8,0,path,-1,wide,3000))return;DWORD attrs=GetFileAttributesW(wide);if(attrs==INVALID_FILE_ATTRIBUTES||(attrs&(FILE_ATTRIBUTE_REPARSE_POINT|FILE_ATTRIBUTE_DIRECTORY)))return;
#else
 struct stat st;if(lstat(path,&st)||!S_ISREG(st.st_mode))return;
#endif
 FILE *file=file_open(path,"rb");if(!file)return;char raw[14000];size_t length=fread(raw,1,sizeof(raw)-1,file);int complete=!ferror(file)&&feof(file);fclose(file);if(!complete)return;raw[length]=0;
 Pair pairs[128];int n=json_pairs(raw,pairs,128);if(n<8)return;
 const char *declared=pair_get(pairs,n,"id"),*scheme=pair_get(pairs,n,"scheme");if(!declared||strcmp(declared,id)||!scheme||(strcmp(scheme,"dark")&&strcmp(scheme,"light")))return;
 for(int i=0;i<n;i++){
  const char *k=pairs[i].key,*v=pairs[i].value;if(pairs[i].number)return;
  if(!strncmp(k,"--sc-",5)){for(const char *p=k+5;*p;p++)if(!((*p>='a'&&*p<='z')||(*p>='0'&&*p<='9')||*p=='-'))return;if(!theme_value_valid(v))return;}
  else if(strcmp(k,"id")&&strcmp(k,"scheme")&&strcmp(k,"nameRu")&&strcmp(k,"nameEn")&&strcmp(k,"nameTr")&&strcmp(k,"description"))return;
 }
 if(!pair_get(pairs,n,"nameRu")||!pair_get(pairs,n,"nameEn")||!pair_get(pairs,n,"nameTr")||!pair_get(pairs,n,"--sc-bg")||!pair_get(pairs,n,"--sc-text")||!pair_get(pairs,n,"--sc-panel"))return;
 int index=-1;for(int i=0;i<theme_package_count;i++)if(!strcmp(theme_packages[i].id,id)){index=i;break;}
 if(index<0){if(theme_package_count>=64)return;index=theme_package_count;copy_s(theme_packages[index].id,40,id);theme_package_count=index+1;}
 copy_s(theme_packages[index].json,sizeof(theme_packages[index].json),raw);theme_packages[index].valid=1;
}
static void theme_packages_refresh(void){
 for(int i=0;i<theme_package_count;i++)theme_packages[i].valid=0;
 theme_package_load("dark");theme_package_load("classic");char path[2400];path_join(path,"ui/themes");
#ifdef _WIN32
 wchar_t wide[3000],pattern[3100];if(!MultiByteToWideChar(CP_UTF8,0,path,-1,wide,3000))return;swprintf(pattern,3100,L"%ls\\*.json",wide);WIN32_FIND_DATAW row;HANDLE find=FindFirstFileW(pattern,&row);if(find==INVALID_HANDLE_VALUE)return;
 do{if(row.dwFileAttributes&(FILE_ATTRIBUTE_DIRECTORY|FILE_ATTRIBUTE_REPARSE_POINT))continue;char name[100];if(!WideCharToMultiByte(CP_UTF8,0,row.cFileName,-1,name,sizeof(name),NULL,NULL))continue;size_t n=strlen(name);if(n>5&&!strcmp(name+n-5,".json")){name[n-5]=0;theme_package_load(name);}}while(FindNextFileW(find,&row));FindClose(find);
#else
 DIR *dir=opendir(path);if(!dir)return;struct dirent *row;while((row=readdir(dir))){size_t n=strlen(row->d_name);if(n>5&&n<45&&!strcmp(row->d_name+n-5,".json")){char id[40];memcpy(id,row->d_name,n-5);id[n-5]=0;theme_package_load(id);}}closedir(dir);
#endif
}
static const char *display_theme_code(int theme){return theme>=0&&theme<theme_package_count&&theme_packages[theme].valid?theme_packages[theme].id:"dark";}
static int display_theme_parse(const char *id){if(!theme_id_valid(id))return -1;theme_packages_refresh();for(int i=0;i<theme_package_count;i++)if(theme_packages[i].valid&&!strcmp(theme_packages[i].id,id))return i;return !strcmp(id,"dark")?0:!strcmp(id,"classic")?1:-1;}
static void theme_packages_json(Buffer *b){theme_packages_refresh();bf(b,"{\"themes\":[");int first=1;for(int i=0;i<theme_package_count;i++)if(theme_packages[i].valid){bf(b,"%s%s",first?"":",",theme_packages[i].json);first=0;}bf(b,"]}");}
#endif
