#include "graphics/opengl/texture/TextureUpload.h"

#include <GLES3/gl3.h>
#include <emscripten/emscripten.h>
#include <emscripten/html5.h>

#include <algorithm>
#include <cstdio>
#include <vector>

namespace {

using graphics::opengl::TextureUpload::Size;
namespace Upload = graphics::opengl::TextureUpload;
std::vector< unsigned char > pixels;
int width = 0, height = 0;

struct Resources {

	EMSCRIPTEN_WEBGL_CONTEXT_HANDLE context = 0;
	GLuint texture = 0, framebuffer = 0;

	bool Initialize() {
		EmscriptenWebGLContextAttributes attributes;
		emscripten_webgl_init_context_attributes( &attributes );
		attributes.majorVersion = 2;
		attributes.antialias = false;
		context = emscripten_webgl_create_context( "#canvas", &attributes );
		if ( context <= 0 || emscripten_webgl_make_context_current( context ) != EMSCRIPTEN_RESULT_SUCCESS ) return false;
		glGenTextures( 1, &texture );
		glBindTexture( GL_TEXTURE_2D, texture );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
		glPixelStorei( GL_UNPACK_ALIGNMENT, 1 );
		glGenFramebuffers( 1, &framebuffer );
		return true;
	}

	~Resources() {
		if ( context <= 0 ) return;
		glBindFramebuffer( GL_FRAMEBUFFER, 0 );
		glDeleteFramebuffers( 1, &framebuffer );
		glDeleteTextures( 1, &texture );
		emscripten_webgl_destroy_context( context );
	}
};

void Color( std::vector< unsigned char >& source, const size_t source_width, const size_t x, const size_t y,
	const unsigned char red, const unsigned char green, const unsigned char blue, const unsigned char alpha = 255 ) {
	const size_t offset = ( y * source_width + x ) * 4;
	source[offset] = red;
	source[offset + 1] = green;
	source[offset + 2] = blue;
	source[offset + 3] = alpha;
}

void Quadrants( std::vector< unsigned char >& source, const size_t sw, const size_t sh ) {
	for ( size_t y = 0; y < sh; ++y ) {
		for ( size_t x = 0; x < sw; ++x ) {
			const bool right = x >= sw / 2, top = y >= sh / 2;
			Color( source, sw, x, y, right == top ? 255 : 0, right ? 255 : 0, top ? 255 : 0 );
		}
	}
}

}

extern "C" {

EMSCRIPTEN_KEEPALIVE const unsigned char* GetUploadPixels() { return pixels.data(); }
EMSCRIPTEN_KEEPALIVE int GetUploadWidth() { return width; }
EMSCRIPTEN_KEEPALIVE int GetUploadHeight() { return height; }

// Read back the actual production helper's texture. The JS tests supply
// independent expected colors; no reference resampler duplicates the helper.
EMSCRIPTEN_KEEPALIVE int TextureUploadCase( const int mode ) {
	Resources resources;
	if ( !resources.Initialize() ) return 1;
	size_t sw = 64, sh = 128, maximum = 32;
	if ( mode == 1 ) { sw = 5; sh = 7; maximum = 4; }
	if ( mode == 3 || mode == 4 ) { sw = 7; sh = 5; maximum = 32; }
	if ( mode == 6 ) { sw = 2048; sh = 1024; maximum = 1024; }
	if ( mode == 7 ) maximum = 1;
	std::vector< unsigned char > source( sw * sh * 4 );
	if ( mode == 1 ) {
		for ( size_t y = 0; y < sh; ++y ) for ( size_t x = 0; x < sw; ++x ) {
			Color( source, sw, x, y, x == sw - 1 ? 200 : 20, y == sh - 1 ? 160 : 40,
				255, x == sw - 1 && y == sh - 1 ? 255 : 128 );
		}
	} else if ( mode == 2 ) {
		for ( size_t y = 0; y < sh; ++y ) for ( size_t x = 0; x < sw; ++x ) Color( source, sw, x, y, 16, 32, 64 );
	} else if ( mode == 3 || mode == 4 ) {
		for ( size_t y = 0; y < sh; ++y ) for ( size_t x = 0; x < sw; ++x ) {
			Color( source, sw, x, y, x * 17, y * 29, x + y, 80 + x * 3 + y * 5 );
		}
	} else if ( mode == 6 ) {
		for ( size_t y = 0; y < sh; ++y ) for ( size_t x = 0; x < sw; ++x ) {
			Color( source, sw, x, y, y < sh / 2 ? 255 : 0, 0, y < sh / 2 ? 0 : 255 );
		}
	} else {
		Quadrants( source, sw, sh );
	}
	const Size size = Upload::GetSize( sw, sh, maximum );
	Upload::Image( source.data(), sw, sh, size );
	if ( mode == 2 ) {
		// Nine source pixels cross four independently averaged 4x4 GPU bins.
		for ( size_t y = 3; y < 6; ++y ) for ( size_t x = 3; x < 6; ++x ) Color( source, sw, x, y, 240, 128, 0, 127 );
		Upload::Region( source.data(), sw, sh, size, 3, 3, 6, 6 );
	}
	if ( mode == 4 ) {
		for ( size_t y = 1; y < 4; ++y ) for ( size_t x = 2; x < 5; ++x ) Color( source, sw, x, y, 201, 102, 53, 77 );
		Upload::Region( source.data(), sw, sh, size, 2, 1, 5, 4 );
	}
	int level = 0;
	if ( mode == 5 ) {
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST_MIPMAP_NEAREST );
		glGenerateMipmap( GL_TEXTURE_2D );
		if ( glGetError() != GL_NO_ERROR ) return 2;
		for ( size_t y = 0; y < sh / 2; ++y ) for ( size_t x = 0; x < sw / 2; ++x ) Color( source, sw, x, y, 255, 255, 0 );
		Upload::Region( source.data(), sw, sh, size, 0, 0, sw / 2, sh / 2 );
		glGenerateMipmap( GL_TEXTURE_2D );
		level = 1;
	}
	width = std::max< size_t >( 1, size.width >> level );
	height = std::max< size_t >( 1, size.height >> level );
	glBindFramebuffer( GL_FRAMEBUFFER, resources.framebuffer );
	glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, resources.texture, level );
	if ( glCheckFramebufferStatus( GL_FRAMEBUFFER ) != GL_FRAMEBUFFER_COMPLETE ) return 3;
	pixels.resize( width * height * 4 );
	glReadPixels( 0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data() );
	const GLenum error = glGetError();
	if ( error != GL_NO_ERROR ) std::fprintf( stderr, "Texture upload GL error: 0x%x\n", error );
	return error;
}

}
