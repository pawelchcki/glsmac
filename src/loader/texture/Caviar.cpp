#include "Caviar.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <stdexcept>
#include <unordered_map>

namespace loader::texture {
namespace {
constexpr size_t MAX_BYTES = 64 * 1024 * 1024;
constexpr size_t MAX_VOXELS = 2 * 1024 * 1024;
constexpr uint32_t MAX_PARTS = 256, MAX_FRAMES = 4096;
constexpr uint32_t FILE_TAG = 0x00525643, VERSION = 0x01000000, DATABASE = 0x02000000;
constexpr uint32_t PALETTE = 0x03000000, PALETTE_NAME = 0x01010000, COLORS = 0x01020000, MATERIAL = 0x01030000;
constexpr uint32_t SCENE = 0x04000000, SCENE_NAME = 0x04010000, OBJECTS = 0x04020000, FRAMES = 0x04030000;
constexpr uint32_t OBJECT = 0x04040000, NAME = 0x04040100, GEOMETRY = 0x04040200, VOXELS = 0x04040201;
constexpr uint32_t ANIMATION = 0x04040300, FLAGS = 0x04040301, LOCATION = 0x04040302, MATRIX = 0x04040303;
[[noreturn]] void Fail( const char* message ) { throw std::runtime_error( std::string( "CVR: " ) + message ); }

struct Reader {
	const std::vector< uint8_t >& bytes;
	size_t pos, end;
	void Need( size_t n ) const { if ( n > end - pos ) { Fail( "truncated data" ); } }
	uint8_t U8() { Need( 1 ); return bytes[pos++]; }
	uint16_t U16() { const uint16_t a = U8(), b = U8(); return a | b << 8; }
	uint32_t U32() { const uint32_t a = U16(), b = U16(); return a | b << 16; }
	float Float() {
		const auto bits = U32(); float f; std::memcpy( &f, &bits, 4 );
		if ( !std::isfinite( f ) || std::abs( f ) > 1000000 ) { Fail( "invalid float" ); } return f;
	}
	Caviar::Vector ShortVector() {
		Caviar::Vector v; for ( auto& n : v ) { const auto u = U16(); n = u < 32768 ? float( u ) : float( int32_t( u ) - 65536 ); } return v;
	}
	Caviar::Vector FloatVector() { return { Float(), Float(), Float() }; }
	std::string Text() {
		if ( end - pos > 1024 ) { Fail( "text too long" ); }
		std::string s( bytes.begin() + pos, bytes.begin() + end ); pos = end;
		if ( !s.empty() && s.back() == '\0' ) { s.pop_back(); }
		if ( s.find( '\0' ) != std::string::npos ) { Fail( "embedded string terminator" ); } return s;
	}
	Reader Chunk( uint32_t& tag ) {
		Need( 8 ); tag = U32(); const auto size = U32();
		if ( size < 8 ) { Fail( "invalid chunk size" ); } Need( size - 8 );
		Reader r{ bytes, pos, pos + size - 8 }; pos = r.end; return r;
	}
	void Done() const { if ( pos != end ) { Fail( "unexpected trailing data" ); } }
};
using Chunks = std::unordered_map< uint32_t, Reader >;
Chunks Unique( Reader r, std::initializer_list< uint32_t > allowed ) {
	Chunks chunks;
	while ( r.pos < r.end ) {
		uint32_t tag; auto child = r.Chunk( tag );
		if ( std::find( allowed.begin(), allowed.end(), tag ) == allowed.end() ) { Fail( "unsupported chunk" ); }
		if ( !chunks.emplace( tag, child ).second ) { Fail( "duplicate chunk" ); }
	} return chunks;
}
Reader Require( const Chunks& chunks, uint32_t tag ) {
	const auto it = chunks.find( tag ); if ( it == chunks.end() ) { Fail( "missing chunk" ); } return it->second;
}
uint32_t Counter( const Chunks& chunks, uint32_t tag, uint32_t fallback ) {
	const auto it = chunks.find( tag ); if ( it == chunks.end() ) { return fallback; }
	auto r = it->second; const auto n = r.U32(); r.Done(); return n;
}
void Geometry( Reader r, Caviar::Part& part, size_t& total ) {
	const auto size = r.end - r.pos;
	const auto flags = r.U32();
	// Bit 8 is known in installed data but has no interpreted rendering effect.
	// The multi-header layout and linked/padded jump variants remain unsupported.
	if ( flags != 0 && flags != 2 && flags != 8 && flags != 10 ) { Fail( "unsupported voxel layout" ); }
	const bool jumps = ( flags & 2 ) != 0;
	if ( r.U32() != size ) { Fail( "voxel object size mismatch" ); }
	part.units_per_voxel = r.Float();
	if ( part.units_per_voxel <= 0 ) { Fail( "nonpositive voxel scale" ); }
	if ( r.U32() != size ) { Fail( "unsupported voxel header link" ); }
	if ( r.U32() != size - 1 ) { Fail( "voxel end offset mismatch" ); }
	part.scale = r.ShortVector(); part.position = r.ShortVector(); part.rotation_center = r.ShortVector();
	const auto count = r.U32();
	if ( !count || count > MAX_VOXELS - total || count > ( r.end - r.pos ) / 3 ) { Fail( "voxel count exceeds limit or data" ); }
	size_t groups = 0;
	do {
		auto position = part.position;
		uint32_t n = count;
		if ( jumps ) {
			position = r.ShortVector();
			r.ShortVector(); r.ShortVector(); // Documented bounding vectors.
			const auto offset = r.ShortVector(); for ( size_t i = 0; i < 3; ++i ) { position[i] += offset[i]; }
			n = r.U32();
			if ( r.U32() != 0 ) { Fail( "unsupported jump links" ); }
		}
		if ( !n || n > MAX_VOXELS - total || n > ( r.end - r.pos ) / 3 ) { Fail( "invalid jump count" ); }
		++groups;
		for ( uint32_t i = 0; i < n; ++i ) {
			const auto direction = r.U8(); const auto normal = r.U8(); const auto color = r.U8();
			const auto d = direction >> 3;
			if ( d > 26 || ( d == 26 ) != ( i + 1 == n ) ) { Fail( "invalid voxel direction or terminator" ); }
			part.voxels.push_back( { position, uint16_t( ( direction & 7 ) << 8 | normal ), color } ); ++total;
			if ( d < 26 ) {
				// The direction belongs to the NEXT voxel; emit before advancing.
				const auto index = d < 13 ? d : d + 1;
				position[0] += int( index / 9 ) - 1;
				position[1] += int( index / 3 % 3 ) - 1;
				position[2] += int( index % 3 ) - 1;
			}
		}
	} while ( jumps && r.end - r.pos > 5 );
	// Installed jump-group files exclude each terminal record from the header
	// counter; flat files include it. Five zero bytes terminate both layouts.
	if ( part.voxels.size() != count + ( jumps ? groups : 0 ) || r.end - r.pos != 5 ) { Fail( "voxel count or tail mismatch" ); }
	while ( r.pos < r.end ) { if ( r.U8() != 0 ) { Fail( "unsupported voxel tail" ); } }

}
}

Caviar Caviar::Decode( const std::vector< uint8_t >& bytes ) {
	if ( bytes.size() > MAX_BYTES ) { Fail( "file limit" ); }
	Reader file{ bytes, 0, bytes.size() }; uint32_t tag; auto root = file.Chunk( tag ); file.Done();
	if ( tag != FILE_TAG ) { Fail( "not a CVR container" ); }
	const auto chunks = Unique( root, { VERSION, DATABASE, PALETTE, SCENE } );
	auto version = Require( chunks, VERSION ); const auto v = version.Float(); version.Done();
	if ( std::abs( v - 10.1f ) > 0.001f && std::abs( v - 10.2f ) > 0.001f ) { Fail( "unsupported version" ); }
	Caviar model; model.database = Require( chunks, DATABASE ).Text();
	const auto colors = Unique( Require( chunks, PALETTE ), { PALETTE_NAME, COLORS, MATERIAL } );
	Require( colors, PALETTE_NAME ).Text();
	auto rgb = Require( colors, COLORS );
	if ( rgb.end - rgb.pos != 2 + 256 * 3 + 24 * 256 ) { Fail( "unsupported palette layout" ); }
	const auto first = rgb.U8(), last = rgb.U8(); if ( first > last ) { Fail( "invalid palette range" ); }
	for ( auto& color : model.palette ) { for ( auto& component : color ) { component = rgb.U8(); } }
	// Keep physical colors; lighting/shading lookup is deliberately not guessed.
	const auto material = colors.find( MATERIAL );
	if ( material != colors.end() && material->second.end - material->second.pos != 24 * 256 * 2 &&
		material->second.end - material->second.pos != 24 * 256 * 2 + 4 ) { Fail( "unsupported material layout" ); }
	auto scene = Require( chunks, SCENE ); Chunks metadata; std::vector< Reader > objects;
	while ( scene.pos < scene.end ) {
		auto child = scene.Chunk( tag );
		if ( tag == OBJECT ) { if ( objects.size() == MAX_PARTS ) { Fail( "part limit" ); } objects.push_back( child ); }
		else if ( tag == SCENE_NAME || tag == OBJECTS || tag == FRAMES ) {
			if ( !metadata.emplace( tag, child ).second ) { Fail( "duplicate scene metadata" ); }
		} else { Fail( "unsupported scene chunk" ); }
	}
	model.scene = Require( metadata, SCENE_NAME ).Text();
	model.frame_count = Counter( metadata, FRAMES, 1 );
	if ( !model.frame_count || model.frame_count > MAX_FRAMES || objects.empty() ||
		Counter( metadata, OBJECTS, objects.size() ) != objects.size() ) { Fail( "invalid scene counts" ); }
	size_t total = 0;
	for ( auto object : objects ) {
		const auto fields = Unique( object, { NAME, GEOMETRY, ANIMATION } );
		Part part; part.name = Require( fields, NAME ).Text();
		const auto geometry = fields.find( GEOMETRY );
		if ( geometry != fields.end() ) { const auto voxel = Unique( geometry->second, { VOXELS } ); Geometry( Require( voxel, VOXELS ), part, total ); }
		const auto animation = Unique( Require( fields, ANIMATION ), { FLAGS, LOCATION, MATRIX } );
		part.poses.resize( model.frame_count );
		for ( const auto& entry : animation ) {
			auto r = entry.second;
			const size_t stride = entry.first == FLAGS ? 1 : entry.first == LOCATION ? 12 : 36;
			if ( r.end - r.pos != stride * model.frame_count ) { Fail( "animation frame count mismatch" ); }
			for ( auto& pose : part.poses ) {
				if ( entry.first == FLAGS ) { pose.flags = r.U8(); }
				else if ( entry.first == LOCATION ) { pose.location = r.FloatVector(); }
				else { for ( auto& f : pose.matrix ) { f = r.Float(); } }
			}
		}
		model.parts.push_back( std::move( part ) );
	}
	return model;
}

Caviar::Image Caviar::RasterPart( size_t part, uint32_t width, uint32_t height,
	const Matrix& view, float pixels_per_voxel, float center_x, float center_y ) const {
	if ( part >= parts.size() || !width || !height || width > 2048 || height > 2048 ||
		uint64_t( width ) * height > 1024 * 1024 || !std::isfinite( pixels_per_voxel ) ||
		pixels_per_voxel <= 0 || pixels_per_voxel > 64 || !std::isfinite( center_x ) || !std::isfinite( center_y ) ||
		std::abs( center_x ) > 1000000 || std::abs( center_y ) > 1000000 ) { Fail( "invalid raster bounds" ); }
	for ( const auto f : view ) { if ( !std::isfinite( f ) || std::abs( f ) > 1 ) { Fail( "invalid raster view" ); } }
	Image image{ width, height, std::vector< uint8_t >( size_t( width ) * height * 4, 0 ) };
	std::vector< float > depth( size_t( width ) * height, -std::numeric_limits< float >::infinity() );
	for ( const auto& voxel : parts[part].voxels ) {
		Vector p{};
		for ( size_t row = 0; row < 3; ++row ) { for ( size_t col = 0; col < 3; ++col ) { p[row] += view[row * 3 + col] * voxel.position[col]; } }
		const auto x = std::floor( center_x + p[0] * pixels_per_voxel ), y = std::floor( center_y - p[1] * pixels_per_voxel );
		if ( x < 0 || y < 0 || x >= width || y >= height ) { continue; }
		const auto index = size_t( y ) * width + size_t( x ); if ( p[2] < depth[index] ) { continue; } depth[index] = p[2];
		for ( size_t c = 0; c < 3; ++c ) { image.rgba[index * 4 + c] = palette[voxel.color][c]; } image.rgba[index * 4 + 3] = 255;
	}
	return image;
}

Caviar::Image Caviar::Preview( uint32_t width, uint32_t height ) const {
	if ( parts.size() != 1 || parts[0].voxels.empty() ) { Fail( "preview requires one geometry component" ); }
	if ( width < 16 || height < 16 || width > 1024 || height > 1024 ) { Fail( "invalid preview dimensions" ); }
	const Matrix view{ 0.70710678f,-0.70710678f,0, 0.35355339f,0.35355339f,0.86602540f, 0.61237244f,0.61237244f,-0.5f };
	Vector low{ std::numeric_limits<float>::infinity(),std::numeric_limits<float>::infinity(),0 };
	Vector high{ -low[0],-low[1],0 };
	for ( const auto& voxel : parts[0].voxels ) {
		for ( size_t row = 0; row < 2; ++row ) {
			float p = 0; for ( size_t col = 0; col < 3; ++col ) { p += view[row*3+col] * voxel.position[col]; }
			low[row] = std::min( low[row],p ); high[row] = std::max( high[row],p );
		}
	}
	const float scale = std::min( 64.0f,std::min( ( width - 13.0f ) / std::max( 1.0f,high[0]-low[0] ),
		( height - 13.0f ) / std::max( 1.0f,high[1]-low[1] ) ) );
	return RasterPart( 0,width,height,view,scale,( width - 1 ) / 2.0f - ( low[0]+high[0] ) * scale / 2,
		( height - 1 ) / 2.0f + ( low[1]+high[1] ) * scale / 2 );
}
}
