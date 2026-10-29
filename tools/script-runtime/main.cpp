#include <bit>
#include <cassert>
#include <fstream>
#include <iostream>
#include <limits>
#include <sstream>
#include <thread>

#include "script/Runtime.h"

namespace {
std::string Read( const std::string& filename ) {
	std::ifstream stream( filename );
	if ( !stream ) { throw std::runtime_error( "Cannot read script probe input: " + filename ); }
	std::ostringstream output;
	output << stream.rdbuf();
	return output.str();
}
}// namespace

int main( const int argc, const char** argv ) {
	std::cout << std::unitbuf;
	const char* stage = "startup";
	std::cout << "SCRIPT_RUNTIME_STAGE|" << stage << '\n';
	try {
		assert( argc == 2 );
		const std::string directory = argv[ 1 ];
		const auto manifest = Read( directory + "/manifest.json" );
		const auto reader = [ & ]( const std::string& path ) { return Read( directory + "/" + path ); };
		stage = "runtime construction";
		std::cout << "SCRIPT_RUNTIME_STAGE|" << stage << '\n';
		script::Runtime runtime( manifest, reader );
		stage = "terrain policy";
		std::cout << "SCRIPT_RUNTIME_STAGE|" << stage << '\n';
		const auto snapshot = runtime.Call( "tests/tile-yield", "snapshot", {} );
		const auto produced = runtime.Call( "game/land-resource-yields", "apply", snapshot );
		assert( std::get< int64_t >( std::get< script::Value::Object >( produced.data ).at( "NUTRIENTS" ).data ) == 3 );
		runtime.Call( "tests/tile-yield", "run", {} );
		for ( const auto& field : { "schema", "mirrors", "extra" } ) {
			auto invalid = snapshot;
			std::get< script::Value::Object >( invalid.data )[ field ] = script::Value( field == std::string( "schema" ) ? script::Value::Data( int64_t{ 2 } ) : script::Value::Data( true ) );
			script::Runtime strict( manifest, reader );
			bool rejected = false;
			try {
				strict.Call( "game/land-resource-yields", "apply", invalid );
			}
			catch ( const script::Error& ) {
				rejected = true;
			}
			assert( rejected );
		}
		stage = "unit order policy";
		std::cout << "SCRIPT_RUNTIME_STAGE|" << stage << '\n';
		assert( std::get< int64_t >( runtime.Call( "tests/unit-orders", "run", {} ).data ) == 73 );
		const auto order_snapshot = runtime.Call( "tests/unit-orders", "snapshot", {} );
		const auto order_valid = runtime.Call( "game/unit-orders", "validate", order_snapshot );
		assert( std::holds_alternative< std::nullptr_t >( std::get< script::Value::Object >( order_valid.data ).at( "error" ).data ) );
		for ( const auto& field : { "schema", "caller", "health", "extra" } ) {
			auto invalid = order_snapshot;
			std::get< script::Value::Object >( invalid.data )[ field ] = script::Value( int64_t{ 2 } );
			script::Runtime strict( manifest, reader );
			bool rejected = false;
			try {
				const auto denied = strict.Call( "game/unit-orders", "validate", invalid );
				assert( std::get< std::string >( std::get< script::Value::Object >( denied.data ).at( "error" ).data ) == "Unit command requires its owner" );
			}
			catch ( const script::Error& ) {
				rejected = true;
			}
			// caller=2 is a valid int64 snapshot, but belongs to another owner.
			assert( rejected == ( field != std::string( "caller" ) ) );
		}
		stage = "numeric and owned values";
		std::cout << "SCRIPT_RUNTIME_STAGE|" << stage << '\n';
		for ( const int64_t input : { std::numeric_limits< int64_t >::min(), int64_t{ -9007199254740993 }, int64_t{ 0 }, int64_t{ 9007199254740993 }, std::numeric_limits< int64_t >::max() } ) {
			assert( std::get< int64_t >( runtime.Call( "tests/runtime", "identity", script::Value( input ) ).data ) == input );
		}
		for ( const float input : { -0.0f, 0.1f, -123.125f } ) {
			assert( std::bit_cast< uint32_t >( std::get< float >( runtime.Call( "tests/runtime", "identity", script::Value( input ) ).data ) ) == std::bit_cast< uint32_t >( input ) );
		}
		assert( std::holds_alternative< script::Undefined >( runtime.Call( "tests/runtime", "identity", {} ).data ) );
		assert( std::holds_alternative< std::nullptr_t >( runtime.Call( "tests/runtime", "identity", script::Value( nullptr ) ).data ) );
		const script::Value record( script::Value::Object{ { "n", script::Value( int64_t{ 1 } ) } } );
		const std::string key( "nul\0key", 7 );
		const auto keyed = runtime.Call( "tests/runtime", "identity", script::Value( script::Value::Object{ { key, record } } ) );
		assert( std::get< script::Value::Object >( keyed.data ).contains( key ) );
		for ( const auto& name : { "increment", "imprecise", "mutate", "random", "spin", "allocate", "mappedError", "sparse", "exotic", "accessor", "cycle", "asynchronous" } ) {
			stage = name;
			std::cout << "SCRIPT_RUNTIME_STAGE|" << stage << '\n';
			script::Limits limits;
			limits.execution = std::chrono::milliseconds( 20 );
			if ( name == std::string( "allocate" ) ) {
				limits.memory_bytes = 8 * 1024 * 1024;
				limits.execution = std::chrono::seconds( 5 );
			}
			script::Runtime failing( manifest, reader, limits );
			bool rejected = false;
			try {
				failing.Call( "tests/runtime", name, name == std::string( "mutate" ) ? record : script::Value( std::numeric_limits< int64_t >::max() ) );
			}
			catch ( const script::Error& error ) {
				rejected = true;
				if ( name == std::string( "spin" ) ) { assert( error.Reason() == "interrupted" ); }
				if ( name == std::string( "allocate" ) ) { assert( error.Reason() == "out of memory" ); }
				if ( name == std::string( "accessor" ) ) { assert( std::string( error.what() ).find( "Accessor properties" ) != std::string::npos ); }
				if ( name == std::string( "mappedError" ) ) {
					assert( std::string( error.what() ).find( "scripts/tests/runtime.ts:" ) != std::string::npos );
					std::cout << "SCRIPT_MAPPED_ERROR|" << error.what() << '\n';
				}
			}
			assert( rejected );
		}
		stage = "module initialization interruption";
		std::cout << "SCRIPT_RUNTIME_STAGE|" << stage << '\n';
		{
			script::Limits limits;
			limits.execution = std::chrono::milliseconds( 20 );
			script::Runtime module_loop( manifest, reader, limits );
			bool rejected = false;
			try {
				module_loop.Call( "tests/module-loop", "unreachable", {} );
			}
			catch ( const script::Error& error ) {
				rejected = error.Reason() == "interrupted";
			}
			assert( rejected );
		}
		assert( std::get< int64_t >( std::get< script::Value::Object >( record.data ).at( "n" ).data ) == 1 );
		assert( std::holds_alternative< script::Undefined >( runtime.Call( "fixtures/test", "checkSelection", {} ).data ) );
#ifndef __EMSCRIPTEN__
		stage = "delayed import and thread ownership";
		std::cout << "SCRIPT_RUNTIME_STAGE|" << stage << '\n';
		// File reads and source-map decoding belong to the host. A slow reader
		// must not spend the policy's JavaScript evaluation deadline.
		script::Limits loading_limits;
		loading_limits.execution = std::chrono::milliseconds( 20 );
		script::Runtime delayed( manifest, [ & ]( const std::string& path ) {
			std::this_thread::sleep_for( std::chrono::milliseconds( 30 ) );
			return reader( path ); }, loading_limits );
		assert( std::get< int64_t >( delayed.Call( "tests/runtime", "identity", script::Value( int64_t{ 7 } ) ).data ) == 7 );
		assert( std::holds_alternative< script::Undefined >( delayed.Call( "fixtures/test", "checkSelection", {} ).data ) );
		bool rejected = false;
		std::thread foreign( [ & ]() { try { runtime.Call( "tests/runtime", "identity", {} ); } catch ( const script::Error& ) { rejected = true; } } );
		foreign.join();
		assert( rejected );
#endif
		std::cout << "SCRIPT_RUNTIME_PASS int64 float32 ownership modules limits source-maps\n";
		return 0;
	}
	catch ( const std::exception& error ) {
		std::cerr << "SCRIPT_RUNTIME_ERROR|" << stage << '|' << error.what() << '\n';
		return 1;
	}
}
