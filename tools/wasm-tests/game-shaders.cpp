#include "graphics/opengl/GL.h"
#include "graphics/opengl/shader_program/Orthographic.h"
#include "graphics/opengl/shader_program/OrthographicData.h"
#include "scene/actor/Actor.h"

#include <emscripten/emscripten.h>
#include <emscripten/html5.h>

#include <cstdio>
#include <exception>
#include <vector>

// Keep the shader integration test independent of the engine and its logger.
// Shader compilation, linking, uniforms and vertex attributes use game sources.
namespace common {
Class::Class() = default;
const std::string Class::GetNamespace() const { return ""; }
void Class::Log( const std::string& ) const {}
}

namespace {
using namespace graphics::opengl;

std::vector< unsigned char > game_pixels;

struct Resources {
	EMSCRIPTEN_WEBGL_CONTEXT_HANDLE context = 0;
	GLuint vao = 0, buffer = 0, texture = 0, target = 0, depth = 0, framebuffer = 0;

	bool Initialize() {
		EmscriptenWebGLContextAttributes attributes;
		emscripten_webgl_init_context_attributes( &attributes );
		attributes.majorVersion = 2;
		attributes.antialias = false;
		attributes.preserveDrawingBuffer = true;
		context = emscripten_webgl_create_context( "#canvas", &attributes );
		if ( context <= 0 || emscripten_webgl_make_context_current( context ) != EMSCRIPTEN_RESULT_SUCCESS ) {
			return false;
		}
		glGenVertexArrays( 1, &vao );
		glBindVertexArray( vao );
		glGenBuffers( 1, &buffer );
		glBindBuffer( GL_ARRAY_BUFFER, buffer );
		glDisable( GL_DITHER );
		return true;
	}

	bool AttachTarget( const int width, const int height, const bool integer ) {
		glGenTextures( 1, &target );
		glBindTexture( GL_TEXTURE_2D, target );
		glTexImage2D( GL_TEXTURE_2D, 0, integer ? GL_R32UI : GL_RGBA8, width, height, 0,
			integer ? GL_RED_INTEGER : GL_RGBA, integer ? GL_UNSIGNED_INT : GL_UNSIGNED_BYTE, nullptr );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
		glGenFramebuffers( 1, &framebuffer );
		glBindFramebuffer( GL_FRAMEBUFFER, framebuffer );
		glFramebufferTexture2D( GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, target, 0 );
		glGenTextures( 1, &depth );
		glBindTexture( GL_TEXTURE_2D, depth );
		glTexImage2D( GL_TEXTURE_2D, 0, DEPTH_TEXTURE_FORMAT, width, height, 0, GL_DEPTH_COMPONENT, GL_FLOAT, nullptr );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
		glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
		glFramebufferTexture2D( GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, depth, 0 );
		DrawBuffer( GL_COLOR_ATTACHMENT0 );
		return glCheckFramebufferStatus( GL_FRAMEBUFFER ) == GL_FRAMEBUFFER_COMPLETE;
	}

	~Resources() {
		if ( context <= 0 ) {
			return;
		}
		glBindFramebuffer( GL_FRAMEBUFFER, 0 );
		glDeleteFramebuffers( 1, &framebuffer );
		glDeleteTextures( 1, &depth );
		glDeleteTextures( 1, &target );
		glDeleteTextures( 1, &texture );
		glDeleteBuffers( 1, &buffer );
		glDeleteVertexArrays( 1, &vao );
		emscripten_webgl_destroy_context( context );
	}
};

template< typename Parent >
class TestProgram : public Parent {
public:
	void Activate() {
		glUseProgram( this->m_gl_shader_program );
		this->EnableAttributes();
	}
	GLint Uniform( const char* name ) { return this->GetUniformLocation( name ); }
};

const GLfloat world[] = {
	0.5f, 0, 0, 0.5f,
	0, 0.5f, 0, 0.5f,
	0, 0, 1, 0,
	0, 0, 0, 1,
};
const GLfloat instances[] = {
	1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
	1, 0, 0, 20, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
};

int CheckError() {
	const auto error = glGetError();
	if ( error != GL_NO_ERROR ) {
		std::fprintf( stderr, "Game shader GL error: 0x%x\n", error );
		return 5;
	}
	return 0;
}

}

extern "C" {

EMSCRIPTEN_KEEPALIVE const unsigned char* GetGamePixels() { return game_pixels.data(); }

EMSCRIPTEN_KEEPALIVE int RenderGameShaders( const int offscreen ) {
	Resources resources;
	if ( !resources.Initialize() ) {
		return 1;
	}
	int width = 0, height = 0;
	emscripten_get_canvas_element_size( "#canvas", &width, &height );
	if ( offscreen && !resources.AttachTarget( width, height, false ) ) {
		return 2;
	}
	// Render::VERTEX_SIZE is 12 floats: coordinate, UV, tint, normal.
	const GLfloat vertices[] = {
		-3, -3, 0,   0, 0,   1, 1, 1, 1,   0, 0, 1,
		 5, -3, 0,   2, 0,   1, 1, 1, 1,   0, 0, 1,
		-3,  5, 0,   0, 2,   1, 1, 1, 1,   0, 0, 1,
	};
	glBufferData( GL_ARRAY_BUFFER, sizeof( vertices ), vertices, GL_STATIC_DRAW );
	const unsigned char texels[] = {
		255, 0, 0, 255,   0, 255, 0, 255,
		0, 0, 255, 255,   255, 255, 255, 255,
	};
	glGenTextures( 1, &resources.texture );
	glActiveTexture( GL_TEXTURE0 );
	glBindTexture( GL_TEXTURE_2D, resources.texture );
	glTexImage2D( GL_TEXTURE_2D, 0, GL_RGBA8, 2, 2, 0, GL_RGBA, GL_UNSIGNED_BYTE, texels );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST );
	glTexParameteri( GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST );
	try {
		TestProgram< shader_program::Orthographic > program;
		program.Start();
		program.Activate();
		glUniform1ui( program.Uniform( "uFlags" ), scene::actor::Actor::RF_IGNORE_LIGHTING );
		glUniform1i( program.Uniform( "uTexture" ), 0 );
		UploadMatrix4( program.Uniform( "uWorld" ), 1, world );
		UploadMatrix4( program.Uniform( "uInstances" ), 2, instances );
		glViewport( 0, 0, width, height );
		glClearColor( 0, 0, 0, 1 );
		glClear( GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT );
		glDrawArraysInstanced( GL_TRIANGLES, 0, 3, 2 );
		game_pixels.resize( static_cast< size_t >( width ) * height * 4 );
		glReadPixels( 0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, game_pixels.data() );
		program.Stop();
	}
	catch ( const std::exception& error ) {
		std::fprintf( stderr, "Game render shader: %s\n", error.what() );
		return 3;
	}
	return CheckError();
}

EMSCRIPTEN_KEEPALIVE int CheckGamePicking() {
	Resources resources;
	if ( !resources.Initialize() || !resources.AttachTarget( 32, 32, true ) ) {
		return 1;
	}
	// Values above 2^24 must survive the integer attribute and flat varying.
	constexpr GLuint expected = 0xf1234567;
	struct Vertex { GLfloat coord[3]; GLuint data; };
	const Vertex vertices[] = {
		{ { -3, -3, 0 }, expected }, { { 5, -3, 0 }, expected }, { { -3, 5, 0 }, expected },
	};
	glBufferData( GL_ARRAY_BUFFER, sizeof( vertices ), vertices, GL_STATIC_DRAW );
	try {
		TestProgram< shader_program::OrthographicData > program;
		program.Start();
		program.Activate();
		UploadMatrix4( program.Uniform( "uWorld" ), 1, world );
		UploadMatrix4( program.Uniform( "uInstances" ), 2, instances );
		glViewport( 0, 0, 32, 32 );
		const GLuint clear[4] = {};
		glClearBufferuiv( GL_COLOR, 0, clear );
		glClear( GL_DEPTH_BUFFER_BIT );
		glEnable( GL_DEPTH_TEST );
		glDrawArraysInstanced( GL_TRIANGLES, 0, 3, 2 );
		glReadBuffer( GL_COLOR_ATTACHMENT0 );
		const auto actual = ReadUnsignedPixel( 16, 16 );
		if ( actual != expected ) {
			std::fprintf( stderr, "Picking mismatch: expected 0x%x, got 0x%x\n", expected, actual );
			return 4;
		}
		DrawBuffer( GL_NONE );
		glReadBuffer( GL_NONE );
		program.Stop();
	}
	catch ( const std::exception& error ) {
		std::fprintf( stderr, "Game picking shader: %s\n", error.what() );
		return 3;
	}
	return CheckError();
}

}
