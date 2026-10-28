#include "Sound.h"

#include <cstdlib>

namespace types {

Sound::~Sound() {
	if ( m_buffer ) {
		std::free( m_buffer );
	}
}

}
