#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace loader::texture {

// Independently implemented from the public tagged CVR format description.
// Coordinates retain the file's Z,X,Y order. No game-specific part selection,
// faction recoloring, camera, lighting or animation timing is implied here.
class Caviar {
public:
	using Vector = std::array< float, 3 >;
	using Matrix = std::array< float, 9 >;
	using Palette = std::array< std::array< uint8_t, 3 >, 256 >;
	struct Voxel { Vector position; uint16_t normal; uint8_t color; };
	struct Pose { uint8_t flags = 0; Vector location{}; Matrix matrix{1,0,0,0,1,0,0,0,1}; };
	struct Part {
		std::string name;
		float units_per_voxel = 1;
		Vector scale{}, position{}, rotation_center{};
		std::vector< Voxel > voxels;
		std::vector< Pose > poses;
	};
	std::string database, scene;
	Palette palette{};
	uint32_t frame_count = 1;
	std::vector< Part > parts;

	// Strict bounded subset: tagged containers, palette, per-frame metadata and
	// flat/jump-group geometry. Unsupported geometry/chunks throw, never disappear.
	static Caviar Decode( const std::vector< uint8_t >& bytes );

	struct Image { uint32_t width, height; std::vector< uint8_t > rgba; };
	// Caller-declared orthographic view, applied to a single part's local voxel
	// coordinates. This deliberately does not guess object transforms/visibility.
	// view rows are horizontal, vertical and depth axes in file Z,X,Y order;
	// larger depth wins. Unlit physical palette colors have opaque alpha.
	Image RasterPart( size_t part, uint32_t width, uint32_t height,
		const Matrix& view, float pixels_per_voxel, float center_x, float center_y ) const;
	// Application preview policy for one-component models: an unlit isometric
	// local view fitted into a transparent canvas. Object transforms, assembly,
	// visibility and the original game's camera/scale are outside this policy.
	Image Preview( uint32_t width = 100, uint32_t height = 75 ) const;
};

}
