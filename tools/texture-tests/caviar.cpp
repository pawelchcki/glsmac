// Synthetic public inputs only. Optional installed-file inspection stays private.
#include "loader/texture/Caviar.h"
#include <cstring>
#include <fstream>
#include <iostream>
#include <limits>
#include <stdexcept>

using loader::texture::Caviar;
using Bytes = std::vector< uint8_t >;
static size_t assertions = 0;
static void Check( bool b, const char* message ) { ++assertions; if ( !b ) { throw std::runtime_error( message ); } }
static void U16( Bytes& b, uint16_t n ) { b.push_back( n & 255 ); b.push_back( n >> 8 ); }
static void U32( Bytes& b, uint32_t n ) { U16( b, n & 65535 ); U16( b, n >> 16 ); }
static void Set32( Bytes& b, size_t at, uint32_t n ) { for ( size_t i = 0; i < 4; ++i ) { b.at( at + i ) = n >> ( i * 8 ); } }
static void Float( Bytes& b, float n ) { uint32_t bits; std::memcpy( &bits, &n, 4 ); U32( b, bits ); }
static Bytes Number( uint32_t n ) { Bytes b; U32( b, n ); return b; }
static Bytes Text( const char* s ) { return Bytes( s, s + std::strlen( s ) ); }
static Bytes Chunk( uint32_t tag, const Bytes& data ) {
	Bytes b; U32( b, tag ); U32( b, data.size() + 8 ); b.insert( b.end(), data.begin(), data.end() ); return b;
}
static Bytes Join( std::initializer_list< Bytes > chunks ) {
	Bytes b; for ( const auto& child : chunks ) { b.insert( b.end(), child.begin(), child.end() ); } return b;
}
static Bytes Header( uint32_t flags, uint32_t count ) {
	Bytes b = Number( flags ); U32( b, 0 ); Float( b, 2 ); U32( b, 0 ); U32( b, 0 );
	for ( const auto n : {7,8,9,-2,3,-4,1,2,3} ) { U16( b, uint16_t( n ) ); } U32( b, count ); return b;
}
static Bytes Geometry( bool jumps = false, Bytes data = { uint8_t(15 << 3 | 3),17,1, uint8_t(26 << 3),0,2 } ) {
	Bytes b = Header( jumps ? 10 : 8, jumps ? data.size() / 3 - 1 : data.size() / 3 );
	if ( jumps ) {
		// Group position + offset starts at (-2,3,-4), as the flat input does.
		for ( const auto n : {1,2,3,0,0,0,0,0,0,-3,1,-7} ) { U16( b, uint16_t( n ) ); }
		U32( b, data.size() / 3 ); U32( b, 0 );
	}
	b.insert( b.end(), data.begin(), data.end() ); b.resize( b.size() + 5 );
	Set32( b, 4, b.size() ); Set32( b, 12, b.size() ); Set32( b, 16, b.size() - 1 ); return b;
}
static Bytes Part( const Bytes& geometry, uint32_t frames = 2, Bytes flags = { 1,0 } ) {
	Bytes locations, matrices;
	for ( uint32_t f = 0; f < frames; ++f ) {
		Float( locations, 10 + f ); Float( locations, 20 + f ); Float( locations, 30 + f );
		for ( const auto n : {1,0,0,0,1,0,0,0,1} ) { Float( matrices, n ); }
	}
	return Chunk( 0x04040000, Join( { Chunk( 0x04040100, Text( "Synthetic body" ) ),
		Chunk( 0x04040200, Chunk( 0x04040201, geometry ) ), Chunk( 0x04040300, Join( {
			Chunk( 0x04040301, flags ), Chunk( 0x04040302, locations ), Chunk( 0x04040303, matrices ) } ) ) } ) );
}
static Bytes File( Bytes geometry = Geometry(), uint32_t frames = 2, Bytes flags = { 1,0 }, Bytes extra = {} ) {
	Bytes palette = {0,255};
	for ( size_t i = 0; i < 256; ++i ) { palette.push_back( i ); palette.push_back( 255 - i ); palette.push_back( 17 ); }
	palette.resize( palette.size() + 24 * 256, 0 );
	Bytes version; Float( version, 10.2f );
	return Chunk( 0x00525643, Join( { Chunk( 0x01000000, version ), Chunk( 0x02000000, Text( "Synthetic.max" ) ),
		Chunk( 0x03000000, Join( { Chunk( 0x01010000, Text( "Synthetic" ) ), Chunk( 0x01020000, palette ) } ) ),
		Chunk( 0x04000000, Join( { Chunk( 0x04010000, Text( "Synthetic scene" ) ),
			Chunk( 0x04020000, Number( 1 ) ), Chunk( 0x04030000, Number( frames ) ), Part( geometry, frames, flags ), extra } ) ) } ) );
}
static void Reject( const Bytes& bytes ) {
	bool rejected = false; try { Caviar::Decode( bytes ); } catch ( const std::runtime_error& ) { rejected = true; }
	Check( rejected, "malformed or unsupported CVR accepted" );
}
static void Tests() {
	const auto bytes = File(); const auto model = Caviar::Decode( bytes ); const auto& part = model.parts.at( 0 );
	Check( model.database == "Synthetic.max" && model.scene == "Synthetic scene" && model.frame_count == 2, "scene metadata" );
	Check( part.name == "Synthetic body" && part.voxels.size() == 2 && part.units_per_voxel == 2, "part metadata" );
	Check( part.scale == Caviar::Vector{7,8,9} && part.rotation_center == Caviar::Vector{1,2,3}, "raw scale and pivot retained" );
	Check( part.voxels[0].position == Caviar::Vector{-2,3,-4} && part.voxels[1].position == Caviar::Vector{-2,4,-4}, "signed ZXY and next-direction decoding" );
	Check( part.voxels[0].normal == 3 * 256 + 17 && part.voxels[1].color == 2, "normal/color and colored terminal voxel" );
	Check( part.poses[0].flags == 1 && part.poses[1].flags == 0 && part.poses[1].location == Caviar::Vector{11,21,31}, "raw frame metadata" );
	Check( part.poses[0].matrix == Caviar::Matrix{1,0,0,0,1,0,0,0,1}, "raw matrix" );
	Check( model.palette[2] == std::array<uint8_t,3>{2,253,17}, "physical palette" );
	const auto jumped = Caviar::Decode( File( Geometry( true ) ) );
	Check( jumped.parts[0].voxels[0].position == part.voxels[0].position && jumped.parts[0].voxels[1].position == part.voxels[1].position, "jump position plus offset" );
	auto two_groups = Geometry( true );
	const Bytes group( two_groups.begin()+42,two_groups.end()-5 );
	two_groups.insert( two_groups.end()-5,group.begin(),group.end() );
	Set32( two_groups,4,two_groups.size() ); Set32( two_groups,12,two_groups.size() ); Set32( two_groups,16,two_groups.size()-1 ); Set32( two_groups,38,2 );
	Check( Caviar::Decode( File( two_groups ) ).parts[0].voxels.size() == 4, "multiple independently positioned groups and terminal counts" );
	auto bad_group_count = two_groups; Set32( bad_group_count,38,3 ); Reject( File( bad_group_count ) );
	// Exercise every neighbor, with center omitted from the direction alphabet.
	for ( uint8_t d = 0; d < 26; ++d ) {
		const auto neighbor = Caviar::Decode( File( Geometry( false, { uint8_t(d << 3),0,1,uint8_t(26 << 3),0,2 } ) ) );
		const auto index = d < 13 ? d : d + 1;
		Check( neighbor.parts[0].voxels[1].position == Caviar::Vector{ float(-2 + index / 9 - 1),float(3 + index / 3 % 3 - 1),float(-4 + index % 3 - 1) }, "neighbor direction" );
	}
	const Caviar::Matrix view{0,1,0, 0,0,1, 1,0,0};
	const auto image = model.RasterPart( 0, 16, 16, view, 1, 0, 0 );
	const auto at = size_t( 4 * 16 + 3 ) * 4;
	Check( image.rgba[at] == 1 && image.rgba[at+1] == 254 && image.rgba[at+3] == 255 && image.rgba[3] == 0, "projection palette and transparent background" );
	auto occlusion = model; occlusion.parts[0].voxels.push_back( { {-1,3,-4},0,7 } );
	Check( occlusion.RasterPart( 0,16,16,view,1,0,0 ).rgba[at] == 7, "nearer depth wins" );
	occlusion.parts[0].voxels.push_back( { {-3,3,-4},0,8 } );
	Check( occlusion.RasterPart( 0,16,16,view,1,0,0 ).rgba[at] == 7, "farther depth cannot overwrite" );
	const auto clipped = model.RasterPart( 0,1,1,view,1,0,0 ); Check( clipped.rgba == Bytes(4,0), "offscreen clipping" );
	const auto preview = model.Preview();
	Check( preview.width == 100 && preview.height == 75 && preview.rgba.size() == 100 * 75 * 4, "preview canvas" );
	size_t opaque = 0;
	for ( size_t y=0; y<preview.height; ++y ) { for ( size_t x=0; x<preview.width; ++x ) {
		if ( preview.rgba[(y*preview.width+x)*4+3] ) { ++opaque; Check(x>=5 && y>=5 && x+5<preview.width && y+5<preview.height,"preview fit margins"); }
	} }
	Check( opaque == 2,"preview retains both separated colored voxels" );
	auto multiple = model; multiple.parts.push_back(part); bool rejected=false;
	try { multiple.Preview(); } catch(const std::runtime_error&) {rejected=true;} Check(rejected,"preview must not silently discard assembly parts");
	for ( size_t n = 0; n < bytes.size(); ++n ) { Reject( Bytes( bytes.begin(), bytes.begin() + n ) ); }
	for ( const auto index : { size_t(0),size_t(4),size_t(8),size_t(12) } ) { auto b = bytes; Set32( b,index,0 ); Reject( b ); }
	Reject( File( Geometry(), 0, {} ) ); Reject( File( Geometry(), 4097, Bytes(4097,0) ) );
	Reject( File( Geometry(), 2, {1} ) ); Reject( File( Geometry(),2,{1,0},Chunk(0x12345678,{}) ) );
	Reject( File( Geometry(),2,{1,0},Chunk(0x04030000,Number(2)) ) );
	for ( auto entry : { std::pair<size_t,uint32_t>{0,9}, {4,0}, {8,0}, {12,0}, {16,0}, {38,0xffffffff} } ) {
		auto geometry = Geometry(); Set32( geometry, entry.first, entry.second ); Reject( File( geometry ) );
	}
	auto nonfinite = Geometry(); Set32( nonfinite,8,0x7fc00000 ); Reject( File( nonfinite ) );
	auto tail = Geometry(); tail.back() = 1; Reject( File( tail ) );
	auto terminator = Geometry(); terminator[45] = 0; Reject( File( terminator ) );
	auto early = Geometry(); early[42] = 26 << 3; Reject( File( early ) );
	auto direction = Geometry(); direction[42] = 31 << 3; Reject( File( direction ) );
	auto linked = Geometry( true ); Set32( linked,70,1 ); Reject( File( linked ) );
	for ( const auto width : {0u,2049u} ) { bool rejected=false; try { model.RasterPart(0,width,1,view,1,0,0); } catch(const std::runtime_error&) {rejected=true;} Check(rejected,"raster bounds"); }
	for ( const auto scale : {0.0f,-1.0f,65.0f,std::numeric_limits<float>::quiet_NaN()} ) {
		bool rejected=false; try { model.RasterPart(0,16,16,view,scale,0,0); } catch(const std::runtime_error&) {rejected=true;} Check(rejected,"raster scale");
	}
	std::cout << "CVR synthetic PASS: " << assertions << " assertions\n";
}
int main( int argc, char** argv ) {
	try {
		if ( argc == 1 ) { Tests(); return 0; }
		std::ifstream in( argv[1],std::ios::binary ); Bytes bytes( (std::istreambuf_iterator<char>(in)),{} );
		const auto model = Caviar::Decode( bytes );
		std::cout << "parts=" << model.parts.size() << " frames=" << model.frame_count << '\n';
		for ( const auto& part : model.parts ) { std::cout << part.name << " voxels=" << part.voxels.size() << '\n'; }
		return 0;
	} catch( const std::exception& error ) { std::cerr << error.what() << '\n'; return 1; }
}
