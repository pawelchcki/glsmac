#include "SMACMap.h"

#include <algorithm>
#include <array>
#include <stdexcept>

namespace game {
namespace backend {
namespace map {
namespace smac {
namespace {

constexpr std::array< unsigned char, 11 > SIGNATURE = { 'T', 'E', 'R', 'R', 'A', 'N', 'M', 'A', 'P', 0, 0x1a };
constexpr size_t HEADER = 15;
constexpr size_t TILE_OFFSET = HEADER + 0xaa4;
constexpr size_t TILE_SIZE = 44;

uint32_t Read32( const std::vector< unsigned char >& bytes, const size_t offset ) {
	if ( offset > bytes.size() || bytes.size() - offset < 4 ) {
		throw std::runtime_error( "Truncated SMAC map header" );
	}
	return uint32_t( bytes[ offset ] ) | ( uint32_t( bytes[ offset + 1 ] ) << 8 ) |
		( uint32_t( bytes[ offset + 2 ] ) << 16 ) | ( uint32_t( bytes[ offset + 3 ] ) << 24 );
}

int32_t Signed32( const uint32_t value ) {
	return value <= 0x7fffffff ? int32_t( value ) : -1 - int32_t( ~value );
}

// Original resource/pod placement also uses the saved seed, not only explicit item bits.
// Format and rules verified against Thinker c633f0b src/{savegame,map,engine_types}.cpp,
// and OpenSMACX src/map.cpp (elev_at). No original executable code is used.
uint8_t Bonus( const uint32_t items, const uint32_t altitude, const int32_t x, const int32_t y, const uint32_t seed ) {
	const bool explicit_bonus = items & 0x400;
	if ( altitude < 2 || ( !explicit_bonus && ( !seed || altitude >= 3 ) ) ) {
		return 0;
	}
	const int32_t diagonal = ( x + y ) / 2;
	const int32_t difference = x - diagonal;
	const int32_t pattern = ( diagonal & 3 ) + 4 * ( difference & 3 );
	if ( !explicit_bonus && pattern != int32_t( ( seed - 5 * ( diagonal >> 2 ) - 3 * ( difference >> 2 ) ) & 15 ) ) {
		return 0;
	}
	int32_t resource = altitude < 3 ? pattern % 3 + 1 : ( pattern % 5 ) & 3;
	if ( !resource || ( items & 0x20000000 ) ) {
		resource = items & 0x10000 ? 3 : ( items & 0x20000 ? 2 : 1 );
	}
	// SMAC uses 2=mineral, 3=energy; GLSMAC uses 2=energy, 3=mineral.
	return resource == 2 ? 3 : resource == 3 ? 2 : resource;
}

bool Pod( const uint32_t items, const uint32_t altitude, const int32_t x, const int32_t y, const uint32_t seed ) {
	if ( items & ( 0x100000 | 0x2000 ) ) {
		return false;
	}
	if ( items & 0x10000000 ) {
		return true;
	}
	if ( !seed ) {
		return false;
	}
	const int32_t diagonal = ( x + y ) / 2;
	const int32_t difference = x - diagonal;
	const int32_t pattern = ( diagonal & 3 ) + 4 * ( difference & 3 );
	return ( altitude >= 3 && pattern == int32_t( ( seed - 5 * ( diagonal >> 2 ) - 3 * ( difference >> 2 ) ) & 15 ) ) ||
		pattern == int32_t( ( 11 * ( diagonal / 4 ) + 61 * ( difference / 4 ) + seed + 8 ) & 31 );
}

}

bool HasSignature( const std::vector< unsigned char >& bytes ) {
	return bytes.size() >= SIGNATURE.size() && std::equal( SIGNATURE.begin(), SIGNATURE.end(), bytes.begin() );
}

Data Parse( const std::vector< unsigned char >& bytes ) {
	if ( !HasSignature( bytes ) || Read32( bytes, 11 ) != 5 ) {
		throw std::runtime_error( "Unsupported SMAC map signature or version" );
	}
	if ( bytes.size() < TILE_OFFSET ) {
		throw std::runtime_error( "Truncated SMAC map header" );
	}
	Data result;
	result.width = Read32( bytes, HEADER );
	result.height = Read32( bytes, HEADER + 4 );
	result.seed = Read32( bytes, HEADER + 8 );
	result.sea_level = Signed32( Read32( bytes, HEADER + 12 ) );
	const auto flat = Read32( bytes, HEADER + 28 );
	result.flat = flat != 0;
	// The original map reader permits dimensions up to 0x1000. GLSMAC's linked
	// diamond grid additionally requires both dimensions to be even.
	if ( !result.width || !result.height || result.width > 4096 || result.height > 4096 ||
		( result.width & 1 ) || ( result.height & 1 ) || flat > 1 || Read32( bytes, HEADER + 32 ) > 64 ) {
		throw std::runtime_error( "Invalid SMAC map dimensions or header values" );
	}
	const size_t tile_count = size_t( result.width ) * result.height / 2;
	const auto abstract_width = ( result.width + 4 ) / 5;
	const auto abstract_height = ( result.height + 4 ) / 5;
	const auto abstract_count = ( ( abstract_width + 1 ) / 2 ) * abstract_height;
	if ( Read32( bytes, HEADER + 20 ) != tile_count ||
		Read32( bytes, HEADER + 0xa24 ) != abstract_width || Read32( bytes, HEADER + 0xa28 ) != abstract_height ||
		Read32( bytes, HEADER + 0xa2c ) != abstract_count ||
		bytes.size() != TILE_OFFSET + tile_count * TILE_SIZE + abstract_count ) {
		throw std::runtime_error( "Invalid or truncated SMAC map tile data" );
	}
	result.tiles.reserve( tile_count );
	for ( uint32_t y = 0 ; y < result.height ; ++y ) {
		for ( uint32_t x = y & 1 ; x < result.width ; x += 2 ) {
			const auto offset = TILE_OFFSET + result.tiles.size() * TILE_SIZE;
			const uint32_t altitude = bytes[ offset ] >> 5;
			const uint32_t rain = ( bytes[ offset ] >> 3 ) & 3;
			const uint32_t rocky = bytes[ offset + 5 ] >> 6;
			if ( rain > 2 || rocky > 2 ) {
				throw std::runtime_error( "Invalid SMAC map rainfall or rockiness" );
			}
			const uint32_t items = Read32( bytes, offset + 8 );
			const uint32_t landmarks = Read32( bytes, offset + 12 );
			Tile tile = {};
			tile.water = altitude < 3;
			const int64_t contour = bytes[ offset + 1 ];
			int64_t elevation = 50 * ( contour - 60 - result.sea_level );
			elevation += contour <= altitude * 20 ? 10 :
				( int64_t( x ) * 113 + int64_t( y ) * 217 + int64_t( result.sea_level ) * 301 ) % 50;
			tile.elevation = int32_t( std::clamp< int64_t >( elevation, -3000, 3500 ) );
			// Classification is stored independently in SMAC. Keep its exact coast
			// even when the renderer's sea-level convention differs at zero.
			tile.elevation = tile.water ? std::min( tile.elevation, -1 ) : std::max( tile.elevation, 1 );
			tile.moisture = rain + 1;
			tile.rockiness = rocky + 1;
			tile.bonus = Bonus( items, altitude, x, y, result.seed );
			if ( items & 0x80 ) tile.features |= 1 << 0; // river
			if ( items & 0x2000 ) tile.features |= 1 << 1; // monolith
			if ( ( items & 0x20 ) && altitude >= 2 ) tile.features |= 1 << 2; // fungus
			if ( Pod( items, altitude, x, y, result.seed ) ) tile.features |= 1 << 6;
			if ( !( landmarks & 0x80000000 ) ) {
				if ( landmarks & 0x4 ) tile.features |= 1 << 3; // jungle
				if ( landmarks & 0x8 ) tile.features |= 1 << 4; // uranium
				if ( landmarks & 0x400 ) tile.features |= 1 << 5; // geothermal
				if ( landmarks & 0x2 ) tile.features |= 1 << 7; // volcano
				if ( landmarks & 0x100 ) tile.features |= 1 << 8; // mesa
				if ( landmarks & 0x1 ) tile.features |= 1 << 9; // crater
				if ( landmarks & 0x8000 ) tile.features |= 1 << 10; // fossil field ridge
				if ( landmarks & 0x40 ) tile.features |= 1 << 14; // dunes
			}
			constexpr std::array< uint32_t, 13 > enhancements = {
				0x4, 0x8, 0x200000, 0x8000, 0x80000, 0x40, 0x10,
				0x400000, 0x800000, 0x1000000, 0x80000000, 0x800, 0x40000
			};
			for ( size_t bit = 0 ; bit < enhancements.size() ; ++bit ) {
				if ( items & enhancements[ bit ] ) tile.terraforming |= 1 << bit;
			}
			result.tiles.push_back( tile );
		}
	}
	return result;
}

}
}
}
}
