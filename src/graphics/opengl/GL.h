#pragma once

#include <cstddef>

#ifdef __EMSCRIPTEN__
#include <GLES3/gl3.h>
#include <vector>
#else
#include <GL/glew.h>
#endif

namespace graphics {
namespace opengl {

#ifdef __EMSCRIPTEN__
// WebGL2 guarantees 256 vertex uniform vectors. Leave room for the camera,
// position and flags alongside the four vectors used by each instance matrix.
static constexpr size_t MAX_SHADER_INSTANCES = 48;
static constexpr const char* GLSL_HEADER = "#version 300 es\nprecision highp float;\nprecision highp int;\n";
static constexpr GLint DEPTH_TEXTURE_FORMAT = GL_DEPTH_COMPONENT32F;
#else
static constexpr size_t MAX_SHADER_INSTANCES = 224;
static constexpr const char* GLSL_HEADER = "#version 330\n";
static constexpr GLint DEPTH_TEXTURE_FORMAT = GL_DEPTH_COMPONENT;
#endif

inline void DrawBuffer( const GLenum buffer ) {
#ifdef __EMSCRIPTEN__
	glDrawBuffers( 1, &buffer );
#else
	glDrawBuffer( buffer );
#endif
}

// Matrix44 stores rows, while GLES/WebGL only accept column-major uploads.
inline void UploadMatrix4( const GLint location, const GLsizei count, const GLfloat* values ) {
#ifdef __EMSCRIPTEN__
	std::vector< GLfloat > columns( static_cast< size_t >( count ) * 16 );
	for ( GLsizei i = 0; i < count; ++i ) {
		for ( size_t row = 0; row < 4; ++row ) {
			for ( size_t column = 0; column < 4; ++column ) {
				columns[ i * 16 + column * 4 + row ] = values[ i * 16 + row * 4 + column ];
			}
		}
	}
	glUniformMatrix4fv( location, count, GL_FALSE, columns.data() );
#else
	glUniformMatrix4fv( location, count, GL_TRUE, values );
#endif
}

inline GLuint ReadUnsignedPixel( const GLint x, const GLint y ) {
#ifdef __EMSCRIPTEN__
	// RGBA_INTEGER/UNSIGNED_INT is the portable WebGL2 unsigned readback pair,
	// including when the framebuffer attachment has only a red channel.
	GLuint pixel[4] = {};
	glReadPixels( x, y, 1, 1, GL_RGBA_INTEGER, GL_UNSIGNED_INT, pixel );
	return pixel[0];
#else
	GLuint pixel = 0;
	glReadPixels( x, y, 1, 1, GL_RED_INTEGER, GL_UNSIGNED_INT, &pixel );
	return pixel;
#endif
}

}
}
