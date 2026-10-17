#pragma once

#include <cstddef>

namespace graphics {
namespace opengl {
namespace TextureUpload {

struct Size {
	size_t width;
	size_t height;
};

// Reduce both axes by powers of two until the image fits the device limit.
// Texture coordinates continue to refer to the complete original image.
Size GetSize( size_t source_width, size_t source_height, size_t maximum_dimension );

// The caller binds GL_TEXTURE_2D and sets GL_UNPACK_ALIGNMENT to 1. Regions use
// exclusive right/bottom source coordinates, like Texture::updated_area_t.
void Image( const unsigned char* rgba, size_t source_width, size_t source_height, const Size& size );
void Region( const unsigned char* rgba, size_t source_width, size_t source_height, const Size& size, size_t left, size_t top, size_t right, size_t bottom );

}
}
}
