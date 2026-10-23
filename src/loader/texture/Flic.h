#pragma once

#include <array>
#include <cstdint>
#include <vector>

namespace loader::texture {

// Indexed FLI/FLC frames retain their own palette. FLIC has no inherent alpha:
// callers may explicitly select a transparent palette index when exporting RGBA.
class Flic {
public:
	using Palette = std::array< std::array< uint8_t, 3 >, 256 >;
	struct Frame {
		std::vector< uint8_t > pixels;
		Palette palette;
		uint32_t duration_ms;
		std::vector< uint8_t > RGBA( int transparent_index = -1 ) const;
	};
	uint16_t width = 0;
	uint16_t height = 0;
	std::vector< Frame > frames;

	// Throws std::runtime_error on malformed/unsupported input. Resource limits
	// apply before allocations; no file I/O, SDL, renderer or licensed data needed.
	static Flic Decode( const std::vector< uint8_t >& bytes );
};

}
