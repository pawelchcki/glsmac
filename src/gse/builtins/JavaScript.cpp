#include "JavaScript.h"

#include <SDL2/SDL.h>
#include <set>
#include <type_traits>

#include "gse/Exception.h"
#include "gse/callable/Native.h"
#include "gse/context/Context.h"
#include "gse/value/Array.h"
#include "gse/value/Bool.h"
#include "gse/value/Float.h"
#include "gse/value/Int.h"
#include "gse/value/Null.h"
#include "gse/value/Object.h"
#include "gse/value/String.h"
#include "gse/value/Undefined.h"
#include "util/FS.h"

namespace gse::builtins {
namespace {

script::Value Snapshot( Value* input, std::set< Value* >& ancestors, const size_t depth = 0 ) {
	if ( depth > 64 ) { throw script::Error( "Native snapshot nesting limit exceeded" ); }
	input = input->Deref();
	switch ( input->type ) {
		case VT_UNDEFINED:
			return {};
		case VT_NULL:
			return script::Value( nullptr );
		case VT_BOOL:
			return script::Value( static_cast< value::Bool* >( input )->value );
		case VT_INT:
			return script::Value( static_cast< value::Int* >( input )->value );
		case VT_FLOAT:
			return script::Value( static_cast< value::Float* >( input )->value );
		case VT_STRING:
			return script::Value( static_cast< value::String* >( input )->value );
		case VT_ARRAY: {
			if ( !ancestors.insert( input ).second ) { throw script::Error( "Cyclic native snapshot" ); }
			script::Value::Array result = {};
			for ( auto* child : static_cast< value::Array* >( input )->value ) { result.push_back( Snapshot( child, ancestors, depth + 1 ) ); }
			ancestors.erase( input );
			return script::Value( std::move( result ) );
		}
		case VT_OBJECT: {
			const auto* object = static_cast< value::Object* >( input );
			if ( object->wrapobj || object->wrapsetter ) { throw script::Error( "Native objects cannot cross the JavaScript value boundary" ); }
			if ( !ancestors.insert( input ).second ) { throw script::Error( "Cyclic native snapshot" ); }
			script::Value::Object result = {};
			for ( const auto& [ key, child ] : object->value ) { result.emplace( key, Snapshot( child, ancestors, depth + 1 ) ); }
			ancestors.erase( input );
			return script::Value( std::move( result ) );
		}
		default:
			throw script::Error( "Only copied values can cross the JavaScript boundary" );
	}
}

Value* Restore( const script::Value& input, GSE_CALLABLE ) {
	return std::visit( [ & ]( const auto& data ) -> Value* {
		using T = std::decay_t< decltype( data ) >;
		if constexpr ( std::is_same_v< T, script::Undefined > ) { return VALUE( value::Undefined ); }
		else if constexpr ( std::is_same_v< T, std::nullptr_t > ) { return VALUE( value::Null ); }
		else if constexpr ( std::is_same_v< T, bool > ) { return VALUE( value::Bool, , data ); }
		else if constexpr ( std::is_same_v< T, int64_t > ) { return VALUE( value::Int, , data ); }
		else if constexpr ( std::is_same_v< T, float > ) { return VALUE( value::Float, , data ); }
		else if constexpr ( std::is_same_v< T, std::string > ) { return VALUE( value::String, , data ); }
		else if constexpr ( std::is_same_v< T, script::Value::Array > ) {
			value::array_elements_t result = {};
			for ( const auto& child : data ) { result.push_back( Restore( child, GSE_CALL ) ); }
			return VALUE( value::Array, , result );
		}
		else {
			value::object_properties_t result = {};
			for ( const auto& [ key, child ] : data ) { result.emplace( key, Restore( child, GSE_CALL ) ); }
			return VALUEEXT( value::Object, GSE_CALL, result );
		}
	},
					   input.data );
}

std::string PackageDirectory() {
	// Frozen test filesystems and the source tree use the same logical path.
	const std::string local = "GLSMAC_data/standard-js";
	if ( util::FS::DirectoryExists( local ) ) { return local; }
#ifdef __EMSCRIPTEN__
	return "/GLSMAC_data/standard-js";
#else
	std::unique_ptr< char, decltype( &SDL_free ) > executable( SDL_GetBasePath(), SDL_free );
	if ( !executable ) { throw script::Error( "Cannot find the standard-JS script package" ); }
	return std::string( executable.get() ) + "scripts";
#endif
}

}// namespace

void JavaScript::AddToContext( gc::Space* const gc_space, context::Context* ctx, ExecutionPointer& ep ) {
	ctx->CreateBuiltin( "js_call", NATIVE_CALL( this ) {
		N_EXPECT_ARGS( 3 );
		N_GETVALUE( module, 0, String );
		N_GETVALUE( function, 1, String );
		try {
			const auto directory = PackageDirectory();
			const auto manifest = util::FS::ReadTextFile( directory + "/manifest.json" );
			if ( !m_runtime || manifest != m_manifest || directory != m_directory ) {
				m_runtime = std::make_unique< script::Runtime >( manifest, [ directory ]( const std::string& path ) { return util::FS::ReadTextFile( directory + "/" + path ); } );
				m_manifest = manifest;
				m_directory = directory;
			}
			std::set< Value* > ancestors = {};
			const auto result = m_runtime->Call( module, function, Snapshot( arguments[ 2 ], ancestors ) );
			return Restore( result, GSE_CALL );
		}
		catch ( const script::Error& error ) {
			m_runtime.reset();
			if ( !error.Name().empty() ) { throw Exception( error.Name(), error.Reason(), GSE_CALL_NOGC, { error.Stack() } ); }
			GSE_ERROR( EC.OPERATION_FAILED, "TypeScript policy failed: " + std::string( error.what() ) );
		}
		catch ( const std::exception& error ) {
			m_runtime.reset();
			GSE_ERROR( EC.OPERATION_FAILED, "TypeScript policy failed: " + std::string( error.what() ) );
		}
	} ), ep );
}

}// namespace gse::builtins
