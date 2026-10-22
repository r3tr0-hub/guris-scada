#ifndef SCADA_CONTROL_TYPES_H
#define SCADA_CONTROL_TYPES_H
typedef struct {int slot,id,state,condition;char occurred[20],acknowledged[20];} AlarmRow;
typedef struct {AlarmRow rows[201];unsigned count,active,waiting;int quality;uint64_t observed;uint32_t error;} AlarmSnapshot;
typedef struct {
 int command,owned,desired,asserted,storage_error;uint64_t deadline,retry;
 char id[65],ip[64],netid[64],message[256];unsigned port;
} CommandLease;
#endif
