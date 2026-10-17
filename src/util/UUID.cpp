#include "UUID.h"

#include "common/Mutex.h"

#ifdef _WIN32
#include <random>
#include <sstream>
#elif defined( __EMSCRIPTEN__ )
#include <array>
#include <iomanip>
#include <random>
#include <sstream>
#endif

namespace util {

static common::Mutex* s_mutex = nullptr;

#if !defined( _WIN32 ) && !defined( __EMSCRIPTEN__ ) // TODO: make ossp-uuid buildable on windows

struct uuid_state_t {
	uuid_state_t() {
		uuid_rc_t rc;
		if ( ( rc = uuid_create( &ctx ) ) != UUID_RC_OK ) {
			THROW( "unable to initialize UUID generator: " + std::to_string( rc ) );
		}
	}
	~uuid_state_t() {
		uuid_destroy( ctx );
	}
	uuid_t* ctx = nullptr;
};
static uuid_state_t s_uuid_state;

#elif defined( _WIN32 )

static std::random_device rd;
static std::mt19937 gen( rd() );
static std::uniform_int_distribution<> dis( 0, 15 );
static std::uniform_int_distribution<> dis2( 8, 11 );

#endif

void UUID::Init() {
	ASSERT( !s_mutex, "mutex already initialized" );
	s_mutex = new common::Mutex();
}

const std::string UUID::Generate( unsigned int mode ) {
	ASSERT( s_mutex, "mutex not initialized" );

	std::lock_guard guard( *s_mutex );

#if !defined( _WIN32 ) && !defined( __EMSCRIPTEN__ ) // TODO: make ossp-uuid buildable on windows
	uuid_rc_t rc;
	if ( ( rc = uuid_make( s_uuid_state.ctx, mode ) ) != UUID_RC_OK ) {
		THROW( "failed to generate UUID (error code: " + std::to_string( rc ) + " )" );
	}
	char* str = NULL;
	if ( ( rc = uuid_export( s_uuid_state.ctx, UUID_FMT_STR, (void**)&str, NULL ) ) != UUID_RC_OK ) {
		THROW( "failed to format UUID (error code: " + std::to_string( rc ) + " )" );
	}
	std::string result( str );
	free( str );
	return result;
#elif defined( __EMSCRIPTEN__ )
	ASSERT( mode == UUID_MAKE_V4, "only UUID v4 is supported in the browser" );
	// Emscripten's random_device obtains entropy from the JavaScript host.
	std::random_device random;
	std::array< unsigned char, 16 > bytes;
	for ( auto& byte : bytes ) {
		byte = static_cast< unsigned char >( random() );
	}
	bytes[ 6 ] = ( bytes[ 6 ] & 0x0f ) | 0x40;
	bytes[ 8 ] = ( bytes[ 8 ] & 0x3f ) | 0x80;
	std::stringstream result;
	result << std::hex << std::setfill( '0' );
	for ( size_t i = 0 ; i < bytes.size() ; i++ ) {
		if ( i == 4 || i == 6 || i == 8 || i == 10 ) {
			result << '-';
		}
		result << std::setw( 2 ) << static_cast< unsigned int >( bytes[ i ] );
	}
	return result.str();
#else
	// this algorithm is bad, used here only until ossp-uuid build is fixed
	std::stringstream ss;
	int i;
	ss << std::hex;
	for ( i = 0; i < 8; i++ ) {
		ss << dis( gen );
	}
	ss << "-";
	for ( i = 0; i < 4; i++ ) {
		ss << dis( gen );
	}
	ss << "-4";
	for ( i = 0; i < 3; i++ ) {
		ss << dis( gen );
	}
	ss << "-";
	ss << dis2( gen );
	for ( i = 0; i < 3; i++ ) {
		ss << dis( gen );
	}
	ss << "-";
	for ( i = 0; i < 12; i++ ) {
		ss << dis( gen );
	};
	return ss.str();

#endif
}

}
