#include "TextureLoader.h"

#include <algorithm>
#include <stdexcept>

#include "types/texture/Texture.h"
#include "types/texture/LazyTexture.h"
#include "engine/Engine.h"
#include "resource/ResourceManager.h"
#include "util/FS.h"

namespace loader {
namespace texture {

// some pcxs contain special yellow shadows, replace with semi-transparent shadow
static const std::unordered_set< resource::resource_t > s_fix_yellow_shadow = {
	resource::PCX_TER1,
	resource::PCX_GAIANS,
	resource::PCX_HIVE,
	resource::PCX_UNIV,
	resource::PCX_MORGAN,
	resource::PCX_SPARTANS,
	resource::PCX_BELIEVE,
	resource::PCX_PEACE,
	resource::PCX_CYBORG,
	resource::PCX_PIRATES,
	resource::PCX_DRONE,
	resource::PCX_ANGELS,
	resource::PCX_FUNGBOY,
	resource::PCX_CARETAKE,
	resource::PCX_USURPER,
};

// different pcxs use different color for transparency, also some colors should be filtered out
static const auto s_tc_pink = types::Color::RGB( 255, 0, 255 );
static const auto s_tc_purple = types::Color::RGB( 152, 24, 228 );
static const auto s_tc_darkpurple = types::Color::RGB( 100, 16, 156 );
static const auto s_tc_aqua = types::Color::RGB( 24, 184, 228 );
static const auto s_tc_facborder = types::Color::RGB( 77, 156, 176 );
static const std::unordered_map< resource::resource_t, TextureLoader::transparent_colors_t > s_tcs = {
	{
		resource::PCX_TEXTURE,
		{
			types::Color::RGB( 125, 0, 128 ),
		}
	},
	{
		resource::PCX_INTERFACE,
		{
			s_tc_pink,
		}
	},
	{
		resource::PCX_MOON1,
		{
			s_tc_pink,
		}
	},
	{
		resource::PCX_MOON2,
		{
			s_tc_pink,
		}
	},
	{
		resource::PCX_MOON3,
		{
			s_tc_pink,
		}
	},
	{
		resource::PCX_ICONS,
		{
			s_tc_purple,
		}
	},
	{
		resource::PCX_NEWICONS,
		{
			s_tc_pink,
		}
	},
	{
		resource::PCX_ALIENCIT,
		{
			s_tc_pink,
		}
	},
	{
		resource::PCX_CONSOLE_X,
		{
			s_tc_pink,
		}
	},
	{
		resource::PCX_CONSOLE2_A,
		{
			s_tc_darkpurple,
		}
	},
	{
		resource::PCX_CONSOLE_X2_A,
		{
			s_tc_pink,
		}
	},
	{
		resource::PCX_JACKAL,
		{
			s_tc_darkpurple,
		}
	},
	{
		resource::PCX_TER1,
		{
			s_tc_purple,
			s_tc_darkpurple, // tile markings
			s_tc_aqua, // borders
		}
	},
	{
		resource::PCX_UNITS,
		{
			s_tc_purple,
			s_tc_darkpurple, // tile markings
			s_tc_aqua, // borders
		}
	},
	{
		resource::PCX_FLAGS,
		{
			types::Color::RGB( 124, 124, 124 ),
			s_tc_aqua, // borders
		}
	},
	{
		resource::PCX_XI,
		{
			types::Color::RGB( 0, 67, 255 ),
			types::Color::RGB( 155, 27, 231 ), // label
			types::Color::RGB( 27, 187, 231 ), // borders
		}
	},
	{
		resource::PCX_XF,
		{
			types::Color::RGB( 0, 0, 0 ),
			types::Color::RGB( 155, 27, 231 ), // tile
			types::Color::RGB( 27, 187, 231 ), // borders
		}
	},
	{
		resource::PCX_GAIANS,
		{
			s_tc_pink,
			s_tc_facborder,
		},
	},
	{
		resource::PCX_HIVE,
		{
			s_tc_pink,
			s_tc_facborder,
		},
	},
	{
		resource::PCX_UNIV,
		{
			s_tc_pink,
			s_tc_facborder,
		},
	},
	{
		resource::PCX_MORGAN,
		{
			s_tc_pink,
			s_tc_facborder,
		},
	},
	{
		resource::PCX_SPARTANS,
		{
			s_tc_pink,
			s_tc_facborder,
		},
	},
	{
		resource::PCX_BELIEVE,
		{
			s_tc_pink,
			s_tc_facborder,
		},
	},
	{
		resource::PCX_PEACE,
		{
			s_tc_pink,
			s_tc_facborder,
		},
	},
	{
		resource::PCX_CYBORG,
		{
			s_tc_darkpurple,
			s_tc_facborder,
		},
	},
	{
		resource::PCX_PIRATES,
		{
			s_tc_darkpurple,
			s_tc_facborder,
		},
	},
	{
		resource::PCX_DRONE,
		{
			s_tc_darkpurple,
			s_tc_facborder,
		},
	},
	{
		resource::PCX_ANGELS,
		{
			s_tc_darkpurple,
			s_tc_facborder,
		},
	},
	{
		resource::PCX_FUNGBOY,
		{
			s_tc_darkpurple,
			s_tc_facborder,
		},
	},
	{
		resource::PCX_CARETAKE,
		{
			s_tc_darkpurple,
			s_tc_facborder,
		},
	},
	{
		resource::PCX_USURPER,
		{
			s_tc_darkpurple,
			s_tc_facborder,
		},
	},
};
static const TextureLoader::transparent_colors_t s_no_transparent_colors = {};

TextureLoader::~TextureLoader() {
	for ( const auto& it : m_flic_frames ) { delete it.second; }
	for ( const auto& it : m_color_textures ) {
		DELETE( it.second );
	}
	for ( const auto& it : m_lazy_textures ) {
		DELETE( it.second );
	}
}

const TextureLoader::transparent_colors_t& TextureLoader::GetTCs( const resource::resource_t res ) {
	const auto& transparent_colors_it = s_tcs.find( res );
	if ( transparent_colors_it != s_tcs.end() ) {
		return transparent_colors_it->second;
	}
	else {
		return s_no_transparent_colors;
	}
}

types::texture::LazyTexture* TextureLoader::GetLazyTexture( const std::string& filename, const types::texture::texture_flag_t flags ) {
	const auto& it = m_lazy_textures.find( filename );
	if ( it != m_lazy_textures.end() ) {
		return it->second;
	}
	return m_lazy_textures.insert( { filename, new types::texture::LazyTexture( this, filename, flags ) } ).first->second;
}

types::texture::Texture* TextureLoader::LoadTexture( const resource::resource_t res, const types::texture::texture_flag_t flags ) {
	const transparent_colors_t colors_old = m_transparent_colors;
	const bool fix_yellow_shadows_old = m_fix_yellow_shadows;
	m_transparent_colors = GetTCs( res );
	m_fix_yellow_shadows = s_fix_yellow_shadow.find( res ) != s_fix_yellow_shadow.end();
	auto* result = LoadTextureImpl( GetPath( res ), flags );
	m_transparent_colors = colors_old;
	m_fix_yellow_shadows = fix_yellow_shadows_old;
	return result;
}

types::texture::Texture* TextureLoader::TryLoadCustomTexture( const std::string& filename, const types::texture::texture_flag_t flags ) {
	std::string key;
	key.resize( filename.size() );
	std::transform( filename.begin(), filename.end(), key.begin(), ::tolower );
	const auto res = g_engine->GetResourceManager()->GetResource( filename );
	transparent_colors_t colors_old;
	bool fix_yellow_shadows_old;
	if ( res != resource::NONE ) {
		colors_old = m_transparent_colors;
		fix_yellow_shadows_old = m_fix_yellow_shadows;
		m_transparent_colors = GetTCs( res );
		m_fix_yellow_shadows = s_fix_yellow_shadow.find( res ) != s_fix_yellow_shadow.end();
	}
	const auto path = TryGetCustomFilename( filename );
	auto* result = path.empty()
		? nullptr
		: LoadTextureImpl( path, flags );
	if ( res != resource::NONE ) {
		m_transparent_colors = colors_old;
		m_fix_yellow_shadows = fix_yellow_shadows_old;
	}
	return result;
}

types::texture::Texture* TextureLoader::LoadCustomTexture( const std::string& filename, const types::texture::texture_flag_t flags ) {
	auto* result = TryLoadCustomTexture( filename, flags );
	if ( !result ) {
		THROW( "could not load texture: " + filename );
	}
	return result;
}

const Flic& TextureLoader::LoadFlic( const std::string& filename ) {
	const auto path = GetCustomFilename( filename );
	auto found = m_flics.find( path );
	if ( found == m_flics.end() ) {
		std::vector< unsigned char > bytes;
		util::FS::ReadFile( bytes, path, util::FS::PATH_SEPARATOR, 64 * 1024 * 1024 );
		found = m_flics.emplace( path, Flic::Decode( bytes ) ).first;
	}
	return found->second;
}

types::texture::Texture* TextureLoader::LoadFlicFrame( const std::string& filename, size_t frame, int transparent_index, const types::texture::texture_flag_t flags ) {
	const auto& animation = LoadFlic( filename );
	if ( frame >= animation.frames.size() ) { throw std::runtime_error( "FLIC frame out of range" ); }
	if ( transparent_index < -1 || transparent_index > 255 ) { throw std::runtime_error( "FLIC transparent index out of range" ); }
	const auto key = GetCustomFilename( filename ) + ":frame(" + std::to_string( frame ) + "," + std::to_string( transparent_index ) + "):" + std::to_string( flags );
	const auto found = m_flic_frames.find( key );
	if ( found != m_flic_frames.end() ) { return found->second; }
	const auto rgba = animation.frames.at( frame ).RGBA( transparent_index );
	auto* texture = new types::texture::Texture( key, animation.width, animation.height, flags );
	memcpy( texture->GetBitmap(), rgba.data(), rgba.size() );
	m_flic_frames.emplace( key, texture );
	return texture;
}

types::texture::Texture* TextureLoader::LoadTexture( const resource::resource_t res, const size_t x1, const size_t y1, const size_t x2, const size_t y2, const uint8_t flags, const float value, const types::texture::texture_flag_t texture_flags ) {
	const transparent_colors_t colors_old = m_transparent_colors;
	m_transparent_colors = GetTCs( res );
	types::texture::Texture* result = LoadTextureImpl( GetPath( res ), x1, y1, x2, y2, flags, value, texture_flags );
	m_transparent_colors = colors_old;
	return result;
}

types::texture::Texture* TextureLoader::GetColorTexture( const types::Color& color ) {
	const types::Color::rgba_t c = color.GetRGBA();
	const auto& it = m_color_textures.find( c );
	if ( it != m_color_textures.end() ) {
		return it->second;
	}
	auto* texture = types::texture::Texture::FromColor( color );
	m_color_textures[ c ] = texture;
	return texture;
}

}
}
