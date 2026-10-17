#include "TextureUpload.h"

#include <algorithm>
#include <cstdint>
#include <stdexcept>
#include <vector>

#include "graphics/opengl/GL.h"

namespace graphics {
namespace opengl {
namespace TextureUpload {

Size GetSize( const size_t source_width, const size_t source_height, const size_t maximum_dimension ) {
	if ( !source_width || !source_height || !maximum_dimension ) {
		throw std::invalid_argument( "Texture upload dimensions must be positive" );
	}
	Size size = { source_width, source_height };
	while ( size.width > maximum_dimension || size.height > maximum_dimension ) {
		size.width = size.width / 2 + size.width % 2;
		size.height = size.height / 2 + size.height % 2;
	}
	return size;
}

void Image( const unsigned char* rgba, const size_t source_width, const size_t source_height, const Size& size ) {
	glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA8, static_cast< GLsizei >( size.width ), static_cast< GLsizei >( size.height ), 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr );
	Region( rgba, source_width, source_height, size, 0, 0, source_width, source_height );
}

void Region( const unsigned char* rgba, const size_t source_width, const size_t source_height, const Size& size, const size_t left, const size_t top, const size_t right, const size_t bottom ) {
	if ( !rgba || !source_width || !source_height || !size.width || !size.height || size.width > source_width || size.height > source_height || left > right || top > bottom || right > source_width || bottom > source_height ) {
		throw std::invalid_argument( "Invalid texture upload region" );
	}
	if ( left == right || top == bottom ) {
		return;
	}

	// Include every GPU texel whose source box overlaps the modified rectangle.
	// A conservative edge texel is harmless: it is rebuilt from original data.
	const auto scale_floor = []( const size_t position, const size_t target, const size_t source ) {
		return static_cast< size_t >( static_cast< uint64_t >( position ) * target / source );
	};
	const auto scale_ceil = []( const size_t position, const size_t target, const size_t source ) {
		const auto numerator = static_cast< uint64_t >( position ) * target;
		return static_cast< size_t >( numerator / source + ( numerator % source != 0 ) );
	};
	const size_t x1 = scale_floor( left, size.width, source_width );
	const size_t y1 = scale_floor( top, size.height, source_height );
	const size_t x2 = scale_ceil( right, size.width, source_width );
	const size_t y2 = scale_ceil( bottom, size.height, source_height );
	const size_t width = x2 - x1;

	std::vector< size_t > source_x( width + 1 );
	for ( size_t x = 0; x <= width; ++x ) {
		source_x[ x ] = scale_floor( x1 + x, source_width, size.width );
	}

	// Avoid allocating a second copy of the enormous terrain atlas. A bounded
	// strip holds the reduced pixels even for a full-image upload.
	const size_t rows_per_strip = std::max< size_t >( 1, 1048576 / ( width * 4 ) );
	std::vector< unsigned char > pixels( width * std::min( rows_per_strip, y2 - y1 ) * 4 );
	for ( size_t strip_y = y1; strip_y < y2; strip_y += rows_per_strip ) {
		const size_t rows = std::min( rows_per_strip, y2 - strip_y );
		for ( size_t y = 0; y < rows; ++y ) {
			const size_t sy1 = scale_floor( strip_y + y, source_height, size.height );
			const size_t sy2 = scale_floor( strip_y + y + 1, source_height, size.height );
			for ( size_t x = 0; x < width; ++x ) {
				uint64_t sum[ 4 ] = {};
				for ( size_t sy = sy1; sy < sy2; ++sy ) {
					const auto* source = rgba + ( sy * source_width + source_x[ x ] ) * 4;
					for ( size_t sx = source_x[ x ]; sx < source_x[ x + 1 ]; ++sx ) {
						for ( size_t channel = 0; channel < 4; ++channel ) {
							sum[ channel ] += source[ channel ];
						}
						source += 4;
					}
				}
				const size_t count = ( sy2 - sy1 ) * ( source_x[ x + 1 ] - source_x[ x ] );
				for ( size_t channel = 0; channel < 4; ++channel ) {
					pixels[ ( y * width + x ) * 4 + channel ] = static_cast< unsigned char >( sum[ channel ] / count );
				}
			}
		}
		glTexSubImage2D( GL_TEXTURE_2D, 0, static_cast< GLint >( x1 ), static_cast< GLint >( strip_y ), static_cast< GLsizei >( width ), static_cast< GLsizei >( rows ), GL_RGBA, GL_UNSIGNED_BYTE, pixels.data() );
	}
}

}
}
}
