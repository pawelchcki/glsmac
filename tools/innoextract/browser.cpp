#include <string>
#include <vector>

#include <emscripten/emscripten.h>

#include "browser-callback.hpp"
#include "util/log.hpp"

int InnoextractMain( int argc, char* argv[] );

EM_ASYNC_JS( int, glsmac_store_output_file, ( const char* filename ), {
	try {
		if (Module['onExtractedFile']) await Module['onExtractedFile'](UTF8ToString(filename));
		return 0;
	} catch (error) {
		Module['extractorError'] = String(error && error.message || error);
		return -1;
	}
} );

extern "C" EMSCRIPTEN_KEEPALIVE int ExtractInstaller( const char* filename, int extract ) {
	logger::total_errors = 0;
	logger::total_warnings = 0;
	std::vector< std::string > arguments = {
		"innoextract", "--silent", "--language", "en-US", "--timestamps", "none",
		"--exclude-temp", "--no-warn-unused", "--output-dir", "/out",
	};
	if ( extract ) {
		// Extraction and checksum verification can run together. A failed file
		// aborts the import before the launcher publishes the collected files.
		arguments.push_back( "--extract" );
		arguments.push_back( "--test" );
	}
	else {
		arguments.push_back( "--list" );
	}
	arguments.push_back( filename );
	std::vector< char* > argv;
	for ( auto& argument : arguments ) argv.push_back( argument.data() );
	argv.push_back( nullptr );
	return InnoextractMain( static_cast< int >( arguments.size() ), argv.data() );
}

int main( int argc, char* argv[] ) {
	return InnoextractMain( argc, argv );
}
