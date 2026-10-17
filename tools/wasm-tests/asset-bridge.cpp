#include <cassert>
#include <exception>
#include <stdexcept>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#include <emscripten/emscripten.h>
#include <emscripten/threading.h>

#include "util/FS.h"

const std::unordered_map< std::string, std::vector< unsigned char > >& GetEmbeddedFiles() {
	static const std::unordered_map< std::string, std::vector< unsigned char > > files = {
		{ "GLSMAC_data/default/fixture.txt", { 'e', 'm', 'b', 'e', 'd', 'd', 'e', 'd' } },
	};
	return files;
}

int main() {
	assert( !emscripten_is_main_browser_thread() );
	assert( util::FS::ReadTextFile( "/GLSMAC_data/default/fixture.txt" ) == "embedded" );
	assert( util::FS::FileExists( "/smac/alpha.txt" ) );
	assert( util::FS::ReadTextFile( "/smac/alpha.txt" ) == "streamed text fixture" );

	std::vector< unsigned char > bytes;
	util::FS::ReadFile( bytes, "/smac/fx/sample.bin" );
	assert( ( bytes == std::vector< unsigned char >{ 0, 1, 127, 255 } ) );
	util::FS::ReadFile( bytes, "/smac/empty.bin" );
	assert( bytes.empty() );

	std::string first, second;
	std::exception_ptr first_error, second_error;
	auto read = []( std::string& output, std::exception_ptr& error ) {
		try {
			output = util::FS::ReadTextFile( "/smac/concurrent.txt" );
		}
		catch ( ... ) {
			error = std::current_exception();
		}
	};
	std::thread a( [&] { read( first, first_error ); } );
	std::thread b( [&] { read( second, second_error ); } );
	a.join();
	b.join();
	if ( first_error ) {
		std::rethrow_exception( first_error );
	}
	if ( second_error ) {
		std::rethrow_exception( second_error );
	}
	assert( first == "parallel fixture" && second == first );

	bool failed = false;
	try {
		util::FS::ReadTextFile( "/smac/missing.txt" );
	}
	catch ( const std::runtime_error& error ) {
		const std::string message = error.what();
		failed = message.find( "/smac/missing.txt" ) != std::string::npos && message.find( "503" ) != std::string::npos;
	}
	assert( failed );

	// Existing test pages and callers can supply files without an asset store.
	MAIN_THREAD_EM_ASM( { delete Module['assetStore']; } );
	assert( util::FS::ReadTextFile( "/smac/local.txt" ) == "already present" );
	puts( "Real asset bridge text, binary, empty, concurrent, failure and optional-store reads passed" );
}
