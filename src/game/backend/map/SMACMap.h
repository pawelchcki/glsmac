#pragma once

#include <cstdint>
#include <vector>

namespace game {
namespace backend {
namespace map {
namespace smac {

// Original TERRANMAP files contain tile-center elevations rather than mesh vertices.
// Scalar values and flags below use GLSMAC's tile/Types.h representation.
struct Tile {
	int32_t elevation;
	bool water;
	uint8_t moisture;
	uint8_t rockiness;
	uint8_t bonus;
	uint16_t features;
	uint16_t terraforming;
};

struct Data {
	uint32_t width;
	uint32_t height;
	uint32_t seed;
	int32_t sea_level;
	bool flat;
	// Packed rows: index = y * (width / 2) + x / 2, with x % 2 == y % 2.
	std::vector< Tile > tiles;
};

bool HasSignature( const std::vector< unsigned char >& bytes );

// Throws std::runtime_error for an unsupported or malformed original map.
Data Parse( const std::vector< unsigned char >& bytes );

}
}
}
}
