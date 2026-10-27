#include "Conversions.h"

#include "gse/GSE.h"
#include "gse/context/Context.h"
#include "gse/callable/Native.h"
#include "gse/Exception.h"
#include "gse/value/Undefined.h"
#include "gse/value/Int.h"
#include "gse/value/Float.h"
#include "gse/value/String.h"
#include "gse/value/Array.h"
#include "gse/value/Object.h"
#include "gse/value/Bool.h"

#include "types/Color.h"
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iomanip>
#include <limits>
#include <locale>
#include <sstream>
#include <stdexcept>
#include <unordered_set>

namespace {
std::string ExactFloatText( const float number ) {
	if ( !std::isfinite( number ) ) { throw std::invalid_argument( "Exact JSON transport requires a finite Float" ); }
	std::ostringstream stream; stream.imbue( std::locale::classic() );
	stream << std::setprecision( std::numeric_limits< double >::max_digits10 ) << static_cast< double >( number );
	auto text = stream.str();
	if ( text.find_first_of( ".eE" ) == std::string::npos ) { text += ".0"; }
	return text;
}

void ValidateUTF8( const std::string& text ) {
	for ( size_t index = 0; index < text.size(); ) {
		const auto first = static_cast< unsigned char >( text[ index++ ] );
		if ( first < 0x80 ) { continue; }
		size_t tail; uint32_t code, minimum;
		if ( first >= 0xc2 && first <= 0xdf ) { tail = 1; code = first & 0x1f; minimum = 0x80; }
		else if ( first >= 0xe0 && first <= 0xef ) { tail = 2; code = first & 0x0f; minimum = 0x800; }
		else if ( first >= 0xf0 && first <= 0xf4 ) { tail = 3; code = first & 7; minimum = 0x10000; }
		else { throw std::invalid_argument( "Exact JSON string requires valid UTF-8" ); }
		if ( tail > text.size() - index ) { throw std::invalid_argument( "Truncated UTF-8 in exact JSON string" ); }
		while ( tail-- ) {
			const auto next = static_cast< unsigned char >( text[ index++ ] );
			if ( ( next & 0xc0 ) != 0x80 ) { throw std::invalid_argument( "Invalid UTF-8 continuation in exact JSON string" ); }
			code = ( code << 6 ) | ( next & 0x3f );
		}
		if ( code < minimum || code > 0x10ffff || ( code >= 0xd800 && code <= 0xdfff ) ) {
			throw std::invalid_argument( "Invalid Unicode scalar in exact JSON string" );
		}
	}
}

void JSONString( std::ostream& stream, const std::string& text ) {
	ValidateUTF8( text ); stream << '"';
	static constexpr char hex[] = "0123456789abcdef";
	for ( const auto character : text ) {
		const auto byte = static_cast< unsigned char >( character );
		switch ( byte ) {
			case '"': stream << "\\\""; break;
			case '\\': stream << "\\\\"; break;
			case '\b': stream << "\\b"; break;
			case '\f': stream << "\\f"; break;
			case '\n': stream << "\\n"; break;
			case '\r': stream << "\\r"; break;
			case '\t': stream << "\\t"; break;
			default:
				if ( byte < 0x20 ) { stream << "\\u00" << hex[ byte >> 4 ] << hex[ byte & 15 ]; }
				else { stream << character; }
		}
	}
	stream << '"';
}

void JSONValue( std::ostream& stream, gse::Value* input, std::unordered_set< const gse::Value* >& ancestors, const size_t depth = 0 ) {
	if ( !input || depth > 256 ) { throw std::invalid_argument( "Missing or excessively nested exact JSON data" ); }
	auto* value = input->Deref();
	switch ( value->type ) {
		case gse::VT_NULL: stream << "null"; return;
		case gse::VT_BOOL: stream << ( static_cast< const gse::value::Bool* >( value )->value ? "true" : "false" ); return;
		case gse::VT_INT: stream << static_cast< const gse::value::Int* >( value )->value; return;
		case gse::VT_FLOAT: stream << ExactFloatText( static_cast< const gse::value::Float* >( value )->value ); return;
		case gse::VT_STRING: JSONString( stream, static_cast< const gse::value::String* >( value )->value ); return;
		case gse::VT_ARRAY:
		case gse::VT_OBJECT: break;
		default: throw std::invalid_argument( "Exact JSON requires detached primitive data, not functions/undefined/native values" );
	}
	if ( !ancestors.insert( value ).second ) { throw std::invalid_argument( "Cyclic exact JSON data" ); }
	bool first = true;
	if ( value->type == gse::VT_ARRAY ) {
		stream << '[';
		for ( auto* item : static_cast< const gse::value::Array* >( value )->value ) {
			if ( !first ) { stream << ','; } first = false; JSONValue( stream, item, ancestors, depth + 1 );
		}
		stream << ']';
	} else {
		const auto* object = static_cast< const gse::value::Object* >( value );
		if ( object->wrapobj || !object->object_class.empty() ) { throw std::invalid_argument( "Exact JSON cannot serialize a native/class wrapper" ); }
		stream << '{';
		for ( const auto& item : object->value ) {
			if ( !first ) { stream << ','; } first = false; JSONString( stream, item.first ); stream << ':';
			JSONValue( stream, item.second, ancestors, depth + 1 );
		}
		stream << '}';
	}
	ancestors.erase( value );
}
}

namespace gse {
namespace builtins {

void Conversions::AddToContext( gc::Space* const gc_space, context::Context* ctx, ExecutionPointer& ep ) {

#define CONVERSION_ERROR( _type ) GSE_ERROR( EC.CONVERSION_ERROR, "Could not convert " + ( v ? v->GetTypeString() : "Undefined" ) + " to " + _type + ": " + ( v ? v->ToString() : "Undefined" ) )

#define CONVERT_COLOR( _type, _constructor, _min, _max ) { \
	N_GETVALUE( r, 0, _type ); \
    if ( r < _min || r > _max ) GSE_ERROR( EC.INVALID_CALL, "Red value should be between " + std::to_string( _min ) + " and " + std::to_string( _max ) + ": " + std::to_string( r ) ); \
	N_GETVALUE( g, 1, _type ); \
    if ( g < _min || g > _max ) GSE_ERROR( EC.INVALID_CALL, "Green value should be between " + std::to_string( _min ) + " and " + std::to_string( _max ) + ": " + std::to_string( g ) ); \
	N_GETVALUE( b, 2, _type ); \
    if ( b < _min || b > _max ) GSE_ERROR( EC.INVALID_CALL, "Blue value should be between " + std::to_string( _min ) + " and " + std::to_string( _max ) + ": " + std::to_string( b ) ); \
	if ( arguments.size() == 4 ) { \
		N_GETVALUE( a, 3, _type ); \
	    if ( a < _min || a > _max ) GSE_ERROR( EC.INVALID_CALL, "Alpha value should be between " + std::to_string( _min ) + " and " + std::to_string( _max ) + ": " + std::to_string( a ) ); \
		return _constructor( r, g, b, a ).Wrap( GSE_CALL ); \
	} \
	return _constructor( r, g, b ).Wrap( GSE_CALL ); \
}

	ctx->CreateBuiltin( "to_string", NATIVE_CALL() {
		N_EXPECT_ARGS( 1 );
		N_GET_ANY( v, 0 );
		return VALUE( value::String,, v->ToString() );
	} ), ep );

	// Trace transport preserves the actual binary32 value after promotion to
	// the binary64 number used by strict JSON readers. Nine digits only round
	// trip back to float; they do not preserve the promoted JSON/Python value.
	ctx->CreateBuiltin( "float_text_exact", NATIVE_CALL() {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( number, 0, Float );
		try { return VALUE( value::String,, ExactFloatText( number ) ); }
		catch ( const std::invalid_argument& error ) { GSE_ERROR( EC.CONVERSION_ERROR, error.what() ); }
	} ), ep );
	ctx->CreateBuiltin( "float_bits", NATIVE_CALL() {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( number, 0, Float );
		static_assert( sizeof( float ) == sizeof( uint32_t ) && std::numeric_limits< float >::is_iec559 );
		uint32_t bits;
		std::memcpy( &bits, &number, sizeof( bits ) );
		return VALUE( value::Int,, static_cast< int64_t >( bits ) );
	} ), ep );
	// Native traversal avoids allocating a GSE execution context for every
	// scalar/escape in complete world traces. Existing to_string is unchanged.
	ctx->CreateBuiltin( "json_text_exact", NATIVE_CALL() {
		N_EXPECT_ARGS( 1 ); N_GET_ANY( json_value, 0 );
		try {
			std::ostringstream stream; stream.imbue( std::locale::classic() );
			std::unordered_set< const Value* > ancestors; JSONValue( stream, json_value, ancestors );
			return VALUE( value::String,, stream.str() );
		} catch ( const std::invalid_argument& error ) { GSE_ERROR( EC.CONVERSION_ERROR, error.what() ); }
	} ), ep );

	ctx->CreateBuiltin( "to_dump", NATIVE_CALL() {
		N_EXPECT_ARGS( 1 );
		N_GET_ANY( v, 0 );
		return VALUE( value::String,, v->Dump() );
	} ), ep );

	ctx->CreateBuiltin( "to_int", NATIVE_CALL() {
		N_EXPECT_ARGS( 1 );
		N_GETPTR( v, 0 );
		if ( !v ) {
			CONVERSION_ERROR( "Int" )
		}
		int64_t value = 0;
		switch ( v->type ) {
			case VT_INT: {
				value = ( (value::Int*)v )->value;
				break;
			}
			case VT_STRING: {
				try {
					value = std::stol( ((value::String*)v)->value );
				}
				catch ( std::logic_error const& ex ) {
					CONVERSION_ERROR( "Int" )
				}
				break;
			}
			default:
				CONVERSION_ERROR( "Int" );
		}
		return VALUE( value::Int,, value );
	} ), ep );

	ctx->CreateBuiltin( "to_float", NATIVE_CALL() {
		N_EXPECT_ARGS( 1 );
		N_GETPTR( v, 0 );
		if ( !v ) {
			CONVERSION_ERROR( "Float" )
		}
		float value = 0.0f;
		switch ( v->type ) {
			case VT_FLOAT: {
				value = ( (value::Float*)v)->value;
				break;
			}
			case VT_INT: {
				value = ( (value::Int*)v)->value;
				break;
			}
			case VT_STRING: {
				try {
					value = std::stof( ((value::String*)v)->value );
				}
				catch ( std::logic_error const& ex ) {
					CONVERSION_ERROR( "Float" )
				}
				break;
			}
			default:
				CONVERSION_ERROR( "Float" );
		}
		return VALUE( value::Float,, value );
	} ), ep );

	ctx->CreateBuiltin( "to_color", NATIVE_CALL() {
		N_EXPECT_ARGS_MIN_MAX( 3, 4 );
		const auto f_err = [ &ctx, &si, &ep ] () {
			GSE_ERROR( EC.INVALID_CALL, "Color can be specified either by floats (0.0 to 1.0) or by ints (0 to 255)" );
		};

		switch ( arguments.at( 0 )->type ) {
			case VT_FLOAT: CONVERT_COLOR( Float, types::Color, 0.0f, 1.0f );
			case VT_INT: CONVERT_COLOR( Int, types::Color::FromRGBA, 0, 255 );
			default:
				f_err();
		}
		return VALUE( value::Undefined );
	} ), ep );

#undef CONVERT_COLOR

#undef CONVERSION_ERROR
}

}
}
