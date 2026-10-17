#include <GLES3/gl3.h>
#include <emscripten/emscripten.h>
#include <emscripten/html5.h>

#include <cstdio>
#include <vector>

namespace {

std::vector< unsigned char > pixels;

struct Resources {

	EMSCRIPTEN_WEBGL_CONTEXT_HANDLE context = 0;
	GLuint vertex_shader = 0, fragment_shader = 0, program = 0;
	GLuint vao = 0, buffer = 0, texture = 0, target = 0, framebuffer = 0;

	~Resources() {
		if ( context <= 0 ) {
			return;
		}
		glBindFramebuffer( GL_FRAMEBUFFER, 0 );
		glDeleteFramebuffers( 1, &framebuffer );
		glDeleteTextures( 1, &target );
		glDeleteTextures( 1, &texture );
		glDeleteBuffers( 1, &buffer );
		glDeleteVertexArrays( 1, &vao );
		glDeleteProgram( program );
		glDeleteShader( vertex_shader );
		glDeleteShader( fragment_shader );
		emscripten_webgl_destroy_context( context );
	}
};

GLuint CompileShader( GLenum type, const char* source ) {
	const auto shader = glCreateShader( type );
	glShaderSource( shader, 1, &source, nullptr );
	glCompileShader( shader );
	GLint compiled = 0;
	glGetShaderiv( shader, GL_COMPILE_STATUS, &compiled );
	if ( !compiled ) {
		char log[2048] = {};
		glGetShaderInfoLog( shader, sizeof( log ), nullptr, log );
		std::fprintf( stderr, "Shader compilation failed: %s\n", log );
		glDeleteShader( shader );
		return 0;
	}
	return shader;
}

}

extern "C" {

EMSCRIPTEN_KEEPALIVE const unsigned char* GetPixels() {
	return pixels.data();
}

// Render a 2x2 texture through the GLES3 -> Emscripten -> WebGL2 path.
EMSCRIPTEN_KEEPALIVE int RenderFrame( int offscreen ) {
	Resources resources;
	EmscriptenWebGLContextAttributes attributes;
	emscripten_webgl_init_context_attributes( &attributes );
	attributes.majorVersion = 2;
	attributes.antialias = false;
	attributes.preserveDrawingBuffer = true;
	resources.context = emscripten_webgl_create_context( "#canvas", &attributes );
	if ( resources.context <= 0 || emscripten_webgl_make_context_current( resources.context ) != EMSCRIPTEN_RESULT_SUCCESS ) {
		std::fprintf( stderr, "Cannot create or activate WebGL2 context\n" );
		return 1;
	}

	int width = 0, height = 0;
	if ( emscripten_get_canvas_element_size( "#canvas", &width, &height ) != EMSCRIPTEN_RESULT_SUCCESS || width <= 0 || height <= 0 ) {
		return 2;
	}
	pixels.resize( static_cast< size_t >( width ) * height * 4 );

	resources.vertex_shader = CompileShader( GL_VERTEX_SHADER, R"(#version 300 es
layout(location = 0) in vec2 coord;
out vec2 texpos;
void main() {
	gl_Position = vec4(coord, 0.0, 1.0);
	texpos = coord * 0.5 + 0.5;
}
)" );
	resources.fragment_shader = CompileShader( GL_FRAGMENT_SHADER, R"(#version 300 es
precision highp float;
in vec2 texpos;
uniform sampler2D image;
out vec4 color;
void main() {
	color = texture(image, texpos);
}
)" );
	if ( !resources.vertex_shader || !resources.fragment_shader ) {
		return 3;
	}
	resources.program = glCreateProgram();
	glAttachShader( resources.program, resources.vertex_shader );
	glAttachShader( resources.program, resources.fragment_shader );
	glLinkProgram( resources.program );
	GLint linked = 0;
	glGetProgramiv( resources.program, GL_LINK_STATUS, &linked );
	if ( !linked ) {
		char log[2048] = {};
		glGetProgramInfoLog( resources.program, sizeof( log ), nullptr, log );
		std::fprintf( stderr, "Program linking failed: %s\n", log );
		return 4;
	}
	glUseProgram( resources.program );

	const GLfloat vertices[] = { -1, -1, 3, -1, -1, 3 };
	glGenVertexArrays( 1, &resources.vao );
	glBindVertexArray( resources.vao );
	glGenBuffers( 1, &resources.buffer );
	glBindBuffer( GL_ARRAY_BUFFER, resources.buffer );
	glBufferData( GL_ARRAY_BUFFER, sizeof( vertices ), vertices, GL_STATIC_DRAW );
	glEnableVertexAttribArray( 0 );
	glVertexAttribPointer( 0, 2, GL_FLOAT, GL_FALSE, 0, nullptr );

	const unsigned char texels[] = {
		255, 0, 0, 255,   0, 255, 0, 255,
		0, 0, 255, 255,   255, 255, 255, 255,
	};
	glGenTextures( 1, &resources.texture );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, resources.texture );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
	glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA8, 2, 2, 0, GL_RGBA, GL_UNSIGNED_BYTE, texels );
	glUniform1i( glGetUniformLocation( resources.program, "image" ), 0 );

	if ( offscreen ) {
		glGenTextures( 1, &resources.target );
		glBindTexture( GL_TEXTURE_2D, resources.target );
		glTexStorage2D( GL_TEXTURE_2D, 1, GL_RGBA8, width, height );
		glGenFramebuffers( 1, &resources.framebuffer );
		glBindFramebuffer( GL_FRAMEBUFFER, resources.framebuffer );
		glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, resources.target, 0 );
		if ( glCheckFramebufferStatus( GL_FRAMEBUFFER ) != GL_FRAMEBUFFER_COMPLETE ) {
			std::fprintf( stderr, "Incomplete framebuffer\n" );
			return 5;
		}
		glBindTexture( GL_TEXTURE_2D, resources.texture );
	}

	glDisable( GL_DITHER );
	glViewport( 0, 0, width, height );
	glClearColor( 0, 0, 0, 1 );
	glClear( GL_COLOR_BUFFER_BIT );
	glDrawArraysInstanced( GL_TRIANGLES, 0, 3, 1 );
	glReadPixels( 0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data() );
	const auto error = glGetError();
	if ( error != GL_NO_ERROR ) {
		std::fprintf( stderr, "GL error: 0x%x\n", error );
		return 6;
	}
	return 0;
}

}
