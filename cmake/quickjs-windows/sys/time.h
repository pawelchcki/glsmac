#pragma once

#include <malloc.h>
#include <stdint.h>
#include <time.h>

// Private compatibility for the pinned QuickJS C translation units. No Windows
// headers or replacement time API leak into first-party C++ or script policy.
struct timeval {
	int64_t tv_sec;
	int64_t tv_usec;
};

static inline int gettimeofday( struct timeval* value, void* zone ) {
	struct timespec now;
	(void)zone;
	if ( timespec_get( &now, TIME_UTC ) != TIME_UTC ) {
		value->tv_sec = 0;
		value->tv_usec = 0;
		return -1;
	}
	value->tv_sec = (int64_t)now.tv_sec;
	value->tv_usec = (int64_t)now.tv_nsec / 1000;
	return 0;
}
