#include "OrthographicData.h"

#include "types/mesh/Data.h"

namespace graphics {
namespace opengl {
namespace shader_program {

void OrthographicData::AddShaders() {
	AddShader(
		GL_VERTEX_SHADER, std::string( GLSL_HEADER ) + "\
\
in vec3 aCoord; \
in uint aData; \
uniform mat4 uWorld; \
uniform mat4 uInstances[" + std::to_string( MAX_SHADER_INSTANCES ) + "]; \
flat out uint data; \
\
void main(void) { \
	gl_Position = uWorld * uInstances[ gl_InstanceID ] * vec4( aCoord, 1.0 ); \
	data = aData; \
} \
\
"
	);
	AddShader(
		GL_FRAGMENT_SHADER, std::string( GLSL_HEADER ) + "\
\
flat in uint data; \
out uint FragColor; \
\
void main(void) { \
	FragColor = data; \
} \
\
"
	);
}

void OrthographicData::Initialize() {
	attributes.coord = GetAttributeLocation( "aCoord" );
	attributes.data = GetAttributeLocation( "aData" );
	uniforms.world = GetUniformLocation( "uWorld" );
	uniforms.instances = GetUniformLocation( "uInstances" );
};

void OrthographicData::EnableAttributes() const {
	const size_t tsz = sizeof( types::mesh::coord_t );
	const size_t vasz = types::mesh::Data::VERTEX_SIZE * tsz;
	size_t vaofs = 0;
	glEnableVertexAttribArray( attributes.coord );
	glVertexAttribPointer( attributes.coord, types::mesh::Data::VERTEX_COORD_SIZE, GL_FLOAT, GL_FALSE, vasz, (const GLvoid*)vaofs );
	vaofs += types::mesh::Data::VERTEX_COORD_SIZE * tsz;
	glEnableVertexAttribArray( attributes.data );
	glVertexAttribIPointer( attributes.data, types::mesh::Data::VERTEX_DATA_SIZE, GL_UNSIGNED_INT, vasz, (const GLvoid*)vaofs );
};

void OrthographicData::DisableAttributes() const {
	glDisableVertexAttribArray( attributes.coord );
	glDisableVertexAttribArray( attributes.data );
};

}
}
}
