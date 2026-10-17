#include "BrowserAssets.h"

#if defined( __EMSCRIPTEN__ ) && defined( __EMSCRIPTEN_PTHREADS__ )
#include <atomic>
#include <limits>
#include <memory>
#include <stdexcept>

#include <emscripten/emscripten.h>
#include <emscripten/threading.h>
#endif

namespace util {
namespace BrowserAssets {

void EnsureFile( const std::string& absolute_path ) {
#if defined( __EMSCRIPTEN__ ) && defined( __EMSCRIPTEN_PTHREADS__ )

	if ( absolute_path.compare( 0, 6, "/smac/" ) != 0 ) {
		return;
	}

	// Production main runs on a pthread. Refuse to block the browser event loop,
	// which must stay free to complete fetch and persistent-cache operations.
	if ( emscripten_is_main_browser_thread() ) {
		if ( EM_ASM_INT( { return !!Module['assetStore']; } ) ) {
			throw std::runtime_error( "Browser asset reads must run on a game worker: " + absolute_path );
		}
		return;
	}

	struct request_t {
		std::atomic< int32_t > status = 0;
		char error[ 1024 ] = {};
	};
	auto request = std::make_unique< request_t >();

	// The waiting worker keeps the path and request alive. The browser thread
	// asynchronously fills MEMFS, then publishes completion in shared memory.
	MAIN_THREAD_ASYNC_EM_ASM( {
		const path = UTF8ToString($0);
		const statusAddress = $1;
		const errorAddress = $2;
		const errorCapacity = $3;
		const finish = (error) => {
			if (error) {
				stringToUTF8(String(error.message || error), errorAddress, errorCapacity);
			}
			Atomics.store(HEAP32, statusAddress >> 2, error ? -1 : 1);
			Atomics.notify(HEAP32, statusAddress >> 2);
		};
		try {
			const store = Module['assetStore'];
			if (store) {
				Promise.resolve(store['ensureFile'](path)).then(() => finish(null), finish);
			} else {
				finish(null);
			}
		} catch (error) {
			finish(error);
		}
	}, absolute_path.c_str(), &request->status, request->error, sizeof( request->error ) );

	while ( request->status.load( std::memory_order_acquire ) == 0 ) {
		emscripten_futex_wait( &request->status, 0, std::numeric_limits< double >::infinity() );
	}
	if ( request->status.load( std::memory_order_acquire ) < 0 ) {
		throw std::runtime_error( "Could not load game asset \"" + absolute_path + "\": " + request->error );
	}

#endif
}

}
}
