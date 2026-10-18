#pragma once

#include <algorithm>
#include <cstddef>
#include <cstdlib>
#include <cstdint>

namespace game {
namespace backend {
namespace map {
namespace tile {

// Original vector score in horizontal/row coordinate units. This is a
// weighted integer score, distinct from tile steps and movement costs.
inline int GetRawVectorDistance( const int dx, const int dy ) {
	const auto x = std::abs( int64_t( dx ) );
	const auto y = std::abs( int64_t( dy ) );
	return ( 3 * std::max( x, y ) + std::min( x, y ) + 1 ) / 4;
}

// Coordinates must lie within the map; only round maps wrap horizontally.
inline int GetVectorDistance( const int x1, const int y1, const int x2, const int y2, const int map_width, const bool flat ) {
	auto dx = std::abs( x1 - x2 );
	if ( !flat ) {
		dx = std::min( dx, map_width - dx );
	}
	return GetRawVectorDistance( dx, y1 - y2 );
}

// Shared by the production tile manager and the behavioral comparison adapter.
// Keep the original arithmetic: this exposes the existing rule for testing.
inline size_t GetTileDistance( const size_t x1, const size_t y1, const size_t x2, const size_t y2, const size_t map_width ) {
	const auto yd = abs(int( y1 - y2 ) );
	return std::min(
		( abs(int( x1 - x2 ) ) + yd ) / 2, // no wrap
		std::min(
			( abs(int( x1 - map_width - x2 ) ) + yd ) / 2, // left wrap
			( abs(int( x1 + map_width - x2 ) ) + yd ) / 2 // right wrap
		)
	);
}

}
}
}
}
