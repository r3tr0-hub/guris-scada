#ifndef SCADA_EDGE_POLICY_H
#define SCADA_EDGE_POLICY_H
/* Mandatory, account-scoped Edge kiosk policy, not a per-profile flag.
 * https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/KioskSwipeGesturesEnabled
 * Existing HKLM/HKCU policy is respected. Never modify Windows touch/Task View. */
static int edge_policy_read(HKEY root,DWORD *value){
 HKEY key;LONG rc=RegOpenKeyExW(root,L"SOFTWARE\\Policies\\Microsoft\\Edge",0,KEY_QUERY_VALUE|KEY_WOW64_64KEY,&key);
 if(rc==ERROR_FILE_NOT_FOUND)return 0;if(rc!=ERROR_SUCCESS)return -1;
 DWORD type=0,size=sizeof(*value);rc=RegQueryValueExW(key,L"KioskSwipeGesturesEnabled",NULL,&type,(BYTE*)value,&size);RegCloseKey(key);
 if(rc==ERROR_FILE_NOT_FOUND)return 0;return rc==ERROR_SUCCESS&&type==REG_DWORD&&size==sizeof(*value)?1:-1;
}
static int edge_policy_apply(void){
 DWORD value=1;int machine=edge_policy_read(HKEY_LOCAL_MACHINE,&value);if(machine)return machine==1&&value==0?2:3;
 int user=edge_policy_read(HKEY_CURRENT_USER,&value);if(user)return user==1&&value==0?2:3;
 HKEY key;if(RegCreateKeyExW(HKEY_CURRENT_USER,L"SOFTWARE\\Policies\\Microsoft\\Edge",0,NULL,0,KEY_SET_VALUE|KEY_WOW64_64KEY,NULL,&key,NULL)!=ERROR_SUCCESS)return 4;
 value=0;LONG rc=RegSetValueExW(key,L"KioskSwipeGesturesEnabled",0,REG_DWORD,(BYTE*)&value,sizeof(value));RegCloseKey(key);
 if(rc!=ERROR_SUCCESS)return 4;return edge_policy_read(HKEY_CURRENT_USER,&value)==1&&value==0?1:4;
}
#endif
