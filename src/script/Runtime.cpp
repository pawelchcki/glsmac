#include "Runtime.h"
#include "SourceMap.h"
#include "script-contracts.h"

#include <charconv>
#include <cmath>
#include <filesystem>
#include <limits>
#include <map>
#include <regex>
#include <set>
#include <thread>

extern "C" {
#include <quickjs.h>
}

namespace script {
namespace {

class Handle {
public:
	Handle( JSContext* ctx, JSValue value )
		: m_ctx( ctx )
		, m_value( value ) {}
	~Handle() { JS_FreeValue( m_ctx, m_value ); }
	Handle( const Handle& ) = delete;
	Handle& operator=( const Handle& ) = delete;
	Handle( Handle&& other ) noexcept
		: m_ctx( other.m_ctx )
		, m_value( other.Release() ) {}
	JSValue Get() const { return m_value; }
	JSValue Release() {
		const auto value = m_value;
		m_value = JS_UNDEFINED;
		return value;
	}

private:
	JSContext* m_ctx;
	JSValue m_value;
};

std::string Text( JSContext* ctx, JSValueConst value ) {
	size_t size = 0;
	const char* bytes = JS_ToCStringLen( ctx, &size, value );
	if ( !bytes ) { throw Error( "Cannot read JavaScript text" ); }
	const std::string result( bytes, size );
	JS_FreeCString( ctx, bytes );
	return result;
}

std::string StringProperty( JSContext* ctx, JSValueConst object, const char* name ) {
	Handle property( ctx, JS_GetPropertyStr( ctx, object, name ) );
	if ( !JS_IsString( property.Get() ) ) { throw Error( "Script package property must be a string: " + std::string( name ) ); }
	return Text( ctx, property.Get() );
}

bool ModulePath( const std::string& path ) {
	return std::regex_match( path, std::regex( "[a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)*\\.js" ) );
}

}// namespace

struct Runtime::Impl {
	std::unique_ptr< JSRuntime, decltype( &JS_FreeRuntime ) > runtime{ nullptr, JS_FreeRuntime };
	std::unique_ptr< JSContext, decltype( &JS_FreeContext ) > context{ nullptr, JS_FreeContext };
	Reader reader;
	Limits limits;
	const std::thread::id owner = std::this_thread::get_id();
	std::chrono::steady_clock::time_point deadline = {};
	std::string package_root = {};
	std::set< std::string > modules = {};
	std::map< std::string, Handle > namespaces = {};
	std::map< std::string, Handle > compiled_modules = {};
	bool failed = false;
	std::map< std::string, SourceMap > maps = {};
	std::unique_ptr< Handle > freezer = {};
	std::unique_ptr< Handle > object_prototype = {}, array_prototype = {};
	JSClassID object_class = 0, array_class = 0;

	Impl( const std::string& manifest, Reader loader, const Limits& budget )
		: reader( std::move( loader ) )
		, limits( budget ) {
		runtime.reset( JS_NewRuntime() );
		if ( !runtime ) { throw Error( "Cannot create JavaScript runtime" ); }
		JS_SetMemoryLimit( runtime.get(), limits.memory_bytes );
		JS_SetMaxStackSize( runtime.get(), limits.stack_bytes );
		context.reset( JS_NewContext( runtime.get() ) );
		if ( !context ) { throw Error( "Cannot create JavaScript context" ); }
		ResetDeadline();
		Handle object( context.get(), JS_NewObject( context.get() ) );
		Handle array( context.get(), JS_NewArray( context.get() ) );
		Check( object.Get() );
		Check( array.Get() );
		object_class = JS_GetClassID( object.Get() );
		array_class = JS_GetClassID( array.Get() );
		object_prototype = std::make_unique< Handle >( context.get(), JS_GetPrototype( context.get(), object.Get() ) );
		array_prototype = std::make_unique< Handle >( context.get(), JS_GetPrototype( context.get(), array.Get() ) );
		JS_SetInterruptHandler( runtime.get(), []( JSRuntime*, void* opaque ) { return std::chrono::steady_clock::now() >= static_cast< Impl* >( opaque )->deadline ? 1 : 0; }, this );
		JS_SetModuleLoaderFunc( runtime.get(), nullptr, &LoadModule, this );
		const std::string setup = "globalThis.Date = undefined; globalThis.eval = undefined; globalThis.Function = undefined;"
								  "globalThis.SharedArrayBuffer = undefined; globalThis.Atomics = undefined;"
								  "Math.random = () => { throw new Error('Ambient randomness is unavailable to game policy'); }; Object.freeze(Math); Object.freeze";
		ResetDeadline();
		freezer = std::make_unique< Handle >( context.get(), JS_Eval( context.get(), setup.c_str(), setup.size(), "<host-policy>", JS_EVAL_TYPE_GLOBAL ) );
		Check( freezer->Get() );
		Handle metadata( context.get(), JS_ParseJSON( context.get(), manifest.c_str(), manifest.size(), "<script-package>" ) );
		Check( metadata.Get() );
		if ( StringProperty( context.get(), metadata.Get(), "schema" ) != "glsmac.standard-js.v1" ) { throw Error( "Unsupported standard-JS package schema" ); }
		if ( StringProperty( context.get(), metadata.Get(), "contract_sha256" ) != contract::Signature ) { throw Error( "Script contract changed; rebuild the native engine" ); }
		package_root = StringProperty( context.get(), metadata.Get(), "root" );
		if ( !std::regex_match( package_root, std::regex( "packages/[a-f0-9]{64}" ) ) ) { throw Error( "Invalid standard-JS package root" ); }
		Handle declared( context.get(), JS_GetPropertyStr( context.get(), metadata.Get(), "modules" ) );
		JSPropertyEnum* entries = nullptr;
		uint32_t count = 0;
		if ( JS_GetOwnPropertyNames( context.get(), &entries, &count, declared.Get(), JS_GPN_STRING_MASK | JS_GPN_ENUM_ONLY ) < 0 ) { throw Error( Failure() ); }
		try {
			for ( uint32_t i = 0; i < count; ++i ) {
				Handle key( context.get(), JS_AtomToString( context.get(), entries[ i ].atom ) );
				const auto name = Text( context.get(), key.Get() );
				if ( !ModulePath( name ) ) { throw Error( "Invalid standard-JS module path: " + name ); }
				modules.insert( name );
			}
		}
		catch ( ... ) {
			JS_FreePropertyEnum( context.get(), entries, count );
			throw;
		}
		JS_FreePropertyEnum( context.get(), entries, count );
		if ( modules.empty() ) { throw Error( "Standard-JS package contains no modules" ); }
	}

	void ResetDeadline() { deadline = std::chrono::steady_clock::now() + limits.execution; }
	void Check( JSValueConst value ) {
		if ( JS_IsException( value ) ) { throw Error( Failure() ); }
	}

	Error Failure() {
		// Reporting an interruption must itself be able to inspect the exception.
		ResetDeadline();
		Handle exception( context.get(), JS_GetException( context.get() ) );
		std::string message = Text( context.get(), exception.Get() );
		std::string name = "Error", reason = message;
		if ( JS_IsObject( exception.Get() ) ) {
			Handle kind( context.get(), JS_GetPropertyStr( context.get(), exception.Get(), "name" ) );
			Handle detail( context.get(), JS_GetPropertyStr( context.get(), exception.Get(), "message" ) );
			if ( JS_IsString( kind.Get() ) ) { name = Text( context.get(), kind.Get() ); }
			if ( JS_IsString( detail.Get() ) ) { reason = Text( context.get(), detail.Get() ); }
		}
		Handle stack( context.get(), JS_GetPropertyStr( context.get(), exception.Get(), "stack" ) );
		if ( JS_IsString( stack.Get() ) ) { message += "\n" + Text( context.get(), stack.Get() ); }
		const std::regex location( "([a-zA-Z0-9_./-]+\\.js):([0-9]+):([0-9]+)" );
		std::string result = {};
		std::smatch match;
		while ( std::regex_search( message, match, location ) ) {
			result += match.prefix().str();
			const auto found = maps.find( match[ 1 ].str() );
			const auto mapped = found == maps.end() ? std::optional< SourceMap::Location >{} : found->second.Resolve( std::stoull( match[ 2 ].str() ), std::stoull( match[ 3 ].str() ) );
			result += mapped ? mapped->source + ":" + std::to_string( mapped->line ) + ":" + std::to_string( mapped->column ) : match.str();
			message = match.suffix().str();
		}
		const auto rendered = result + message;
		const auto newline = rendered.find( '\n' );
		return Error( rendered, std::move( name ), std::move( reason ), newline == std::string::npos ? "" : rendered.substr( newline + 1 ) );
	}

	static JSModuleDef* LoadModule( JSContext* ctx, const char* filename, void* opaque ) {
		auto* self = static_cast< Impl* >( opaque );
		try {
			const std::string name = filename;
			if ( !ModulePath( name ) || !self->modules.contains( name ) ) { throw Error( "Undeclared JavaScript module: " + name ); }
			const auto cached = self->compiled_modules.find( name );
			if ( cached != self->compiled_modules.end() ) { return static_cast< JSModuleDef* >( JS_VALUE_GET_PTR( cached->second.Get() ) ); }
			const auto source = self->reader( self->package_root + "/" + name );
			const auto source_map = self->reader( self->package_root + "/" + name + ".map" );
			self->ResetDeadline();
			Handle map( ctx, JS_ParseJSON( ctx, source_map.c_str(), source_map.size(), ( name + ".map" ).c_str() ) );
			self->Check( map.Get() );
			Handle sources( ctx, JS_GetPropertyStr( ctx, map.Get(), "sources" ) );
			Handle length( ctx, JS_GetPropertyStr( ctx, sources.Get(), "length" ) );
			uint32_t count = 0;
			if ( JS_ToUint32( ctx, &count, length.Get() ) < 0 || count > 1024 ) { throw Error( "Invalid source map sources" ); }
			std::vector< std::string > paths = {};
			for ( uint32_t i = 0; i < count; ++i ) {
				Handle path( ctx, JS_GetPropertyUint32( ctx, sources.Get(), i ) );
				paths.push_back( Text( ctx, path.Get() ) );
			}
			self->maps.emplace( name, SourceMap( StringProperty( ctx, map.Get(), "mappings" ), std::move( paths ) ) );
			self->ResetDeadline();
			Handle compiled( ctx, JS_Eval( ctx, source.c_str(), source.size(), name.c_str(), JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY ) );
			self->Check( compiled.Get() );
			const auto [ stored, inserted ] = self->compiled_modules.emplace( name, Handle( ctx, compiled.Release() ) );
			return static_cast< JSModuleDef* >( JS_VALUE_GET_PTR( stored->second.Get() ) );
		}
		catch ( const std::exception& error ) {
			JS_ThrowReferenceError( ctx, "%s", error.what() );
			return nullptr;
		}
	}

	Handle ToJS( const Value& input, const size_t depth = 0 ) {
		if ( depth > 64 ) { throw Error( "JavaScript snapshot nesting limit exceeded" ); }
		auto* ctx = context.get();
		Handle value( ctx, std::visit( [ & ]( const auto& data ) -> JSValue {
						  using T = std::decay_t< decltype( data ) >;
						  if constexpr ( std::is_same_v< T, Undefined > ) { return JS_UNDEFINED; }
						  else if constexpr ( std::is_same_v< T, std::nullptr_t > ) { return JS_NULL; }
						  else if constexpr ( std::is_same_v< T, bool > ) { return JS_NewBool( ctx, data ); }
						  else if constexpr ( std::is_same_v< T, int64_t > ) { return JS_NewBigInt64( ctx, data ); }
						  else if constexpr ( std::is_same_v< T, float > ) {
							  if ( !std::isfinite( data ) ) { throw Error( "Nonfinite float32 snapshot" ); }
							  return JS_NewFloat64( ctx, data );
						  }
						  else if constexpr ( std::is_same_v< T, std::string > ) { return JS_NewStringLen( ctx, data.data(), data.size() ); }
						  else {
							  if ( data.size() > 65536 ) { throw Error( "JavaScript snapshot collection limit exceeded" ); }
							  Handle container( ctx, std::is_same_v< T, Value::Array > ? JS_NewArray( ctx ) : JS_NewObject( ctx ) );
							  Check( container.Get() );
							  if constexpr ( std::is_same_v< T, Value::Array > ) {
								  for ( size_t i = 0; i < data.size(); ++i ) {
									  auto child = ToJS( data[ i ], depth + 1 );
									  if ( JS_SetPropertyUint32( ctx, container.Get(), i, child.Release() ) < 0 ) { throw Error( Failure() ); }
								  }
							  }
							  else {
								  for ( const auto& [ key, item ] : data ) {
									  auto child = ToJS( item, depth + 1 );
									  const auto atom = JS_NewAtomLen( ctx, key.data(), key.size() );
									  if ( atom == JS_ATOM_NULL ) { throw Error( Failure() ); }
									  const auto result = JS_DefinePropertyValue( ctx, container.Get(), atom, child.Release(), JS_PROP_C_W_E );
									  JS_FreeAtom( ctx, atom );
									  if ( result < 0 ) { throw Error( Failure() ); }
								  }
							  }
							  auto argument = container.Get();
							  Handle frozen( ctx, JS_Call( ctx, freezer->Get(), JS_UNDEFINED, 1, &argument ) );
							  Check( frozen.Get() );
							  return container.Release();
						  }
					  },
									   input.data ) );
		Check( value.Get() );
		return value;
	}

	Handle OwnData( JSValueConst object, const JSAtom key ) {
		auto* ctx = context.get();
		JSPropertyDescriptor descriptor = { 0, JS_UNDEFINED, JS_UNDEFINED, JS_UNDEFINED };
		const auto found = JS_GetOwnProperty( ctx, &descriptor, object, key );
		if ( found < 0 ) { throw Error( Failure() ); }
		if ( !found ) { throw Error( "Sparse JavaScript arrays are unsupported" ); }
		Handle value( ctx, descriptor.value ), getter( ctx, descriptor.getter ), setter( ctx, descriptor.setter );
		if ( !JS_IsUndefined( getter.Get() ) || !JS_IsUndefined( setter.Get() ) ) { throw Error( "Accessor properties cannot cross the value boundary" ); }
		if ( !( descriptor.flags & JS_PROP_ENUMERABLE ) ) { throw Error( "Non-enumerable result properties are unsupported" ); }
		return value;
	}

	Value FromJS( JSValueConst input, std::set< void* >& ancestors, const size_t depth = 0 ) {
		auto* ctx = context.get();
		if ( depth > 64 ) { throw Error( "JavaScript result nesting limit exceeded" ); }
		if ( JS_IsUndefined( input ) ) { return {}; }
		if ( JS_IsNull( input ) ) { return Value( nullptr ); }
		if ( JS_IsBool( input ) ) { return Value( JS_ToBool( ctx, input ) != 0 ); }
		if ( JS_IsBigInt( ctx, input ) ) {
			const auto text = Text( ctx, input );
			int64_t integer = 0;
			const auto parsed = std::from_chars( text.data(), text.data() + text.size(), integer );
			if ( parsed.ec != std::errc{} || parsed.ptr != text.data() + text.size() ) { throw Error( "JavaScript BigInt exceeds signed int64 range" ); }
			return Value( integer );
		}
		if ( JS_IsNumber( input ) ) {
			double number = 0;
			if ( JS_ToFloat64( ctx, &number, input ) < 0 ) { throw Error( Failure() ); }
			const float narrowed = static_cast< float >( number );
			if ( !std::isfinite( number ) || !std::isfinite( narrowed ) || static_cast< double >( narrowed ) != number ) { throw Error( "JavaScript Number must be an exact finite float32; use Math.fround" ); }
			return Value( narrowed );
		}
		if ( JS_IsString( input ) ) { return Value( Text( ctx, input ) ); }
		if ( !JS_IsObject( input ) || JS_IsFunction( ctx, input ) || static_cast< int >( JS_PromiseState( ctx, input ) ) >= 0 ) { throw Error( "Unsupported JavaScript result type" ); }
		const auto kind = JS_GetClassID( input );
		if ( kind != object_class && kind != array_class ) { throw Error( "Only plain records and dense arrays can cross the value boundary" ); }
		Handle prototype( ctx, JS_GetPrototype( ctx, input ) );
		Check( prototype.Get() );
		const auto expected = kind == array_class ? array_prototype->Get() : object_prototype->Get();
		if ( !JS_IsNull( prototype.Get() ) && JS_VALUE_GET_PTR( prototype.Get() ) != JS_VALUE_GET_PTR( expected ) ) { throw Error( "Custom result prototypes are unsupported" ); }
		void* identity = JS_VALUE_GET_PTR( input );
		if ( !ancestors.insert( identity ).second ) { throw Error( "Cyclic JavaScript result" ); }
		if ( JS_IsArray( ctx, input ) ) {
			Handle length( ctx, JS_GetPropertyStr( ctx, input, "length" ) );
			uint32_t size = 0;
			if ( JS_ToUint32( ctx, &size, length.Get() ) < 0 || size > 65536 ) { throw Error( "JavaScript result collection limit exceeded" ); }
			JSPropertyEnum* own = nullptr;
			uint32_t count = 0;
			if ( JS_GetOwnPropertyNames( ctx, &own, &count, input, JS_GPN_STRING_MASK | JS_GPN_SYMBOL_MASK ) < 0 ) { throw Error( Failure() ); }
			JS_FreePropertyEnum( ctx, own, count );
			if ( count != size + 1 ) { throw Error( "Sparse or extended JavaScript arrays are unsupported" ); }
			Value::Array array = {};
			for ( uint32_t i = 0; i < size; ++i ) {
				const auto atom = JS_NewAtomUInt32( ctx, i );
				try {
					auto item = OwnData( input, atom );
					array.push_back( FromJS( item.Get(), ancestors, depth + 1 ) );
				}
				catch ( ... ) {
					JS_FreeAtom( ctx, atom );
					throw;
				}
				JS_FreeAtom( ctx, atom );
			}
			ancestors.erase( identity );
			return Value( std::move( array ) );
		}
		JSPropertyEnum* entries = nullptr;
		uint32_t count = 0;
		if ( JS_GetOwnPropertyNames( ctx, &entries, &count, input, JS_GPN_STRING_MASK | JS_GPN_SYMBOL_MASK ) < 0 ) { throw Error( Failure() ); }
		Value::Object object = {};
		try {
			if ( count > 65536 ) { throw Error( "JavaScript result collection limit exceeded" ); }
			for ( uint32_t i = 0; i < count; ++i ) {
				Handle key( ctx, JS_AtomToValue( ctx, entries[ i ].atom ) );
				if ( !JS_IsString( key.Get() ) ) { throw Error( "Symbol result keys are unsupported" ); }
				auto value = OwnData( input, entries[ i ].atom );
				object.emplace( Text( ctx, key.Get() ), FromJS( value.Get(), ancestors, depth + 1 ) );
			}
		}
		catch ( ... ) {
			JS_FreePropertyEnum( ctx, entries, count );
			throw;
		}
		JS_FreePropertyEnum( ctx, entries, count );
		ancestors.erase( identity );
		return Value( std::move( object ) );
	}

	Value Call( const std::string& name, const std::string& function, const Value& input ) {
		if ( failed ) { throw Error( "JavaScript runtime requires reset after a failed call" ); }
		if ( std::this_thread::get_id() != owner ) { throw Error( "JavaScript runtime used from a foreign thread" ); }
		ResetDeadline();
		auto* ctx = context.get();
		const std::string filename = name + ".js";
		if ( !namespaces.contains( filename ) ) {
			auto* module = LoadModule( ctx, filename.c_str(), this );
			if ( !module ) { throw Error( Failure() ); }
			Handle compiled( ctx, JS_DupValue( ctx, JS_MKPTR( JS_TAG_MODULE, module ) ) );
			ResetDeadline();
			Handle result( ctx, JS_EvalFunction( ctx, compiled.Release() ) );
			Check( result.Get() );
			if ( JS_PromiseState( ctx, result.Get() ) == JS_PROMISE_PENDING ) { throw Error( "Top-level await is unsupported in synchronous game policy" ); }
			if ( JS_PromiseState( ctx, result.Get() ) == JS_PROMISE_REJECTED ) {
				Handle reason( ctx, JS_PromiseResult( ctx, result.Get() ) );
				JS_Throw( ctx, reason.Release() );
				throw Error( Failure() );
			}
			namespaces.emplace( filename, Handle( ctx, JS_GetModuleNamespace( ctx, module ) ) );
		}
		const auto symbol = JS_NewAtomLen( ctx, function.data(), function.size() );
		if ( symbol == JS_ATOM_NULL ) { throw Error( Failure() ); }
		Handle callable( ctx, JS_GetProperty( ctx, namespaces.at( filename ).Get(), symbol ) );
		JS_FreeAtom( ctx, symbol );
		Check( callable.Get() );
		if ( !JS_IsFunction( ctx, callable.Get() ) ) { throw Error( "Missing JavaScript export: " + name + ":" + function ); }
		auto argument = ToJS( input );
		auto raw = argument.Get();
		ResetDeadline();
		Handle result( ctx, JS_Call( ctx, callable.Get(), JS_UNDEFINED, 1, &raw ) );
		Check( result.Get() );
		if ( JS_IsJobPending( runtime.get() ) ) { throw Error( "Unscheduled asynchronous work in synchronous game policy" ); }
		std::set< void* > ancestors = {};
		return FromJS( result.Get(), ancestors );
	}
};

Runtime::Runtime( const std::string& manifest, Reader reader, const Limits limits )
	: m_impl( std::make_unique< Impl >( manifest, std::move( reader ), limits ) ) {}
Runtime::~Runtime() = default;
Value Runtime::Call( const std::string& module, const std::string& function, const Value& input ) {
	if ( std::this_thread::get_id() != m_impl->owner ) { throw Error( "JavaScript runtime used from a foreign thread" ); }
	try {
		contract::ValidateInput( module, function, input );
		auto result = m_impl->Call( module, function, input );
		contract::ValidateOutput( module, function, result );
		return result;
	}
	catch ( ... ) {
		m_impl->failed = true;
		throw;
	}
}
std::string Runtime::Version() { return "QuickJS 2026-06-04"; }

}// namespace script
