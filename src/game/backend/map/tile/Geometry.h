#pragma once

#include <algorithm>
#include <cstddef>
#include <cstdlib>

namespace game {
namespace backend {
namespace map {
namespace tile {

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
