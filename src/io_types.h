#ifndef SCADA_IO_TYPES_H
#define SCADA_IO_TYPES_H
#include "io_tags.h"
typedef struct {double value;uint64_t observed;uint32_t error;int quality,resolution;} IoValue;
typedef struct {int ids[IO_VIEW_MAX];IoValue values[IO_VIEW_MAX];unsigned count,generation;uint64_t lease;} IoView;
#endif
