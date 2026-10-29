#include "SourceMap.h"

#include <array>
#include <cstdint>
#include <limits>
#include <stdexcept>

namespace script {

SourceMap::SourceMap( const std::string& mappings, std::vector< std::string > sources )
	: m_sources( std::move( sources ) ) {
	const std::string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	int64_t source = 0, line = 0, column = 0, generated = 0;
	m_lines.emplace_back();
	for ( size_t offset = 0; offset < mappings.size(); ) {
		if ( mappings[ offset ] == ';' ) {
			++offset;
			generated = 0;
			m_lines.emplace_back();
			continue;
		}
		if ( mappings[ offset ] == ',' ) {
			++offset;
			continue;
		}
		std::array< int64_t, 5 > fields = {};
		size_t count = 0;
		while ( offset < mappings.size() && mappings[ offset ] != ',' && mappings[ offset ] != ';' ) {
			uint64_t value = 0;
			unsigned shift = 0;
			bool continued = true;
			while ( continued ) {
				if ( offset == mappings.size() || shift > 30 ) { throw std::runtime_error( "Invalid source map VLQ" ); }
				const auto digit = alphabet.find( mappings[ offset++ ] );
				if ( digit == std::string::npos ) { throw std::runtime_error( "Invalid source map digit" ); }
				value |= static_cast< uint64_t >( digit & 31 ) << shift;
				continued = ( digit & 32 ) != 0;
				shift += 5;
			}
			if ( count == fields.size() ) { throw std::runtime_error( "Invalid source map segment" ); }
			fields[ count++ ] = ( value & 1 ) ? -static_cast< int64_t >( value >> 1 ) : static_cast< int64_t >( value >> 1 );
		}
		generated += fields[ 0 ];
		if ( generated < 0 || generated > std::numeric_limits< int32_t >::max() ) { throw std::runtime_error( "Invalid generated source map column" ); }
		if ( count == 1 ) {
			m_lines.back().push_back( { generated, -1, 0, 0 } );
			continue;
		}
		if ( count != 4 && count != 5 ) { throw std::runtime_error( "Incomplete source map segment" ); }
		source += fields[ 1 ];
		line += fields[ 2 ];
		column += fields[ 3 ];
		if ( source < 0 || static_cast< uint64_t >( source ) >= m_sources.size() || line < 0 || column < 0 ) { throw std::runtime_error( "Invalid original source map location" ); }
		m_lines.back().push_back( { generated, source, line, column } );
	}
}

std::optional< SourceMap::Location > SourceMap::Resolve( const size_t line, const size_t column ) const {
	if ( line == 0 || line > m_lines.size() || column == 0 ) { return {}; }
	const Segment* selected = nullptr;
	for ( const auto& segment : m_lines[ line - 1 ] ) {
		if ( static_cast< uint64_t >( segment.generated ) > column - 1 ) { break; }
		selected = &segment;
	}
	if ( !selected || selected->source < 0 ) { return {}; }
	return Location{ m_sources[ selected->source ], static_cast< size_t >( selected->line + 1 ), static_cast< size_t >( selected->column + 1 ) };
}

}// namespace script
