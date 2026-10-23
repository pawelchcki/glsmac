// All bytes and expected images here are synthetic, publicly distributable inputs.
#include "loader/texture/Flic.h"
#include <fstream>
#include <iostream>
#include <stdexcept>

using loader::texture::Flic;
using Bytes = std::vector< uint8_t >;
static size_t assertions = 0;
static void Check( bool condition, const char* message ) {
	assertions++;
	if ( !condition ) { throw std::runtime_error( message ); }
}
static void U16( Bytes& b, unsigned v ) { b.push_back( v & 255 ); b.push_back( ( v >> 8 ) & 255 ); }
static void U32( Bytes& b, unsigned v ) { U16( b, v & 65535 ); U16( b, v >> 16 ); }
static void Set16( Bytes& b, size_t at, unsigned v ) { b.at( at ) = v & 255; b.at( at + 1 ) = ( v >> 8 ) & 255; }
static void Set32( Bytes& b, size_t at, unsigned v ) { Set16( b, at, v & 65535 ); Set16( b, at + 2, v >> 16 ); }
static Bytes Chunk( unsigned type, const Bytes& payload ) {
	Bytes b; U32( b, payload.size() + 6 ); U16( b, type ); b.insert( b.end(), payload.begin(), payload.end() ); return b;
}
static Bytes Frame( std::initializer_list< Bytes > chunks, unsigned delay = 0 ) {
	Bytes b( 16, 0 ); Set16( b, 4, 0xf1fa ); Set16( b, 6, chunks.size() ); Set16( b, 8, delay );
	for ( const auto& chunk : chunks ) { b.insert( b.end(), chunk.begin(), chunk.end() ); }
	Set32( b, 0, b.size() ); return b;
}
static Bytes File( unsigned width, unsigned height, std::initializer_list< Bytes > frames, bool fli = false ) {
	Bytes b( 128, 0 ); Set16( b, 4, fli ? 0xaf11 : 0xaf12 ); Set16( b, 6, frames.size() );
	Set16( b, 8, width ); Set16( b, 10, height ); Set16( b, 12, 8 ); Set32( b, 16, fli ? 7 : 71 );
	// A prefix block is not a playback frame; it carries no image.
	const auto prefix = Chunk( 0xf100, Bytes( 10, 0 ) ); b.insert( b.end(), prefix.begin(), prefix.end() );
	for ( const auto& frame : frames ) { b.insert( b.end(), frame.begin(), frame.end() ); }
	Set32( b, 0, b.size() ); return b;
}
static void Reject( const Bytes& b ) {
	bool failed = false;
	try { Flic::Decode( b ); } catch ( const std::runtime_error& ) { failed = true; }
	Check( failed, "malformed input accepted" );
}
static void Tests() {
	const auto copy = Chunk( 16, { 1,2,3,4,5, 6,7,8,9,10, 11,12,13,14,15 } );
	const auto palette = Chunk( 4, { 1,0, 0,2, 10,20,30, 40,50,60 } );
	const auto word_delta = Chunk( 7, { 2,0, 255,255, 99,128, 1,0, 1,255,42,43, 1,0, 0,2,20,21,22,23 } );
	const auto palette_delta = Chunk( 4, { 1,0, 6,1, 12,34,56 } );
	const auto byte_delta = Chunk( 12, { 1,0,2,0, 2,0,2,100,101,1,254,55, 0 } );
	const auto brun = Chunk( 15, { 0,253,2,3,4,2,9, 255,253,2,3,4,2,9, 1,253,2,3,4,2,9 } );
	const auto bytes = File( 5, 3, {
		Frame( { palette, copy }, 17 ), Frame( { word_delta } ), Frame( { palette_delta } ),
		Frame( { byte_delta } ), Frame( { brun } ), Frame( { Chunk( 13, {} ) } ), Frame( {} ),
	} );
	const auto movie = Flic::Decode( bytes );
	Check( movie.width == 5 && movie.height == 3 && movie.frames.size() == 7, "metadata" );
	Check( movie.frames[ 0 ].duration_ms == 17 && movie.frames[ 1 ].duration_ms == 71, "source delays" );
	Check( movie.frames[ 0 ].pixels == Bytes( {1,2,3,4,5,6,7,8,9,10,11,12,13,14,15} ), "COPY" );
	Check( movie.frames[ 1 ].pixels == Bytes( {1,2,3,4,5,6,42,43,9,99,20,21,22,23,15} ), "SS2 skip/last pixel/literal/repeated pair" );
	Check( movie.frames[ 2 ].pixels == movie.frames[ 1 ].pixels, "palette-only frame preserves indices" );
	Check( movie.frames[ 1 ].palette[ 6 ] == std::array<uint8_t,3>{0,0,0}, "old frame palette immutable" );
	Check( movie.frames[ 2 ].palette[ 6 ] == std::array<uint8_t,3>{12,34,56}, "palette index skip" );
	const auto rgba = movie.frames[ 2 ].RGBA( 6 );
	Check( rgba[20] == 12 && rgba[21] == 34 && rgba[22] == 56 && rgba[23] == 0 && rgba[3] == 255, "explicit alpha key preserves RGB" );
	Check( movie.frames[ 2 ].RGBA()[23] == 255, "default has no alpha key" );
	Check( movie.frames[ 3 ].pixels == Bytes( {1,2,3,4,5,100,101,43,55,55,20,21,22,23,15} ), "LC literal/repeat/unchanged line" );
	Check( movie.frames[ 4 ].pixels == Bytes( {2,3,4,9,9,2,3,4,9,9,2,3,4,9,9} ), "BRUN packet count ignored" );
	Check( movie.frames[ 5 ].pixels == Bytes( 15, 0 ) && movie.frames[ 6 ].pixels == Bytes( 15, 0 ), "BLACK and empty frame" );
	const auto fli = Flic::Decode( File( 1, 1, { Frame( { Chunk( 11, {1,0,0,1,63,1,32} ), Chunk(16,{0}) } ) }, true ) );
	Check( fli.frames[0].duration_ms == 100 && fli.frames[0].RGBA() == Bytes({252,4,128,255}), "FLI clock and 6-bit palette" );
	Bytes colors = {1,0,0,0}; for ( unsigned i = 0; i < 256; i++ ) { colors.insert( colors.end(), {uint8_t(i),uint8_t(255-i),123} ); }
	const auto full = Flic::Decode( File( 1,1, { Frame({Chunk(4,colors),Chunk(16,{255}),Chunk(18,{7,8}),Chunk(99,{9})}) } ) );
	Check( full.frames[0].RGBA() == Bytes({255,0,123,255}), "zero palette count means 256; ancillary chunks skipped" );
	for ( size_t n = 0; n < bytes.size(); n++ ) { Reject( Bytes( bytes.begin(), bytes.begin() + n ) ); }
	for ( auto entry : { std::pair<size_t,unsigned>{4,0xaf44}, {6,0}, {8,0}, {12,24} } ) { auto bad = bytes; Set16(bad,entry.first,entry.second); Reject(bad); }
	auto huge = bytes; Set16(huge,8,4096); Set16(huge,10,4096); Reject(huge);
	Reject( File(1,1,{Frame({Chunk(4,{1,0,255,2,1,2,3,4,5,6})})}) );
	Reject( File(1,1,{Frame({Chunk(11,{1,0,0,1,64,0,0})})}) );
	Reject( File(1,1,{Frame({Chunk(15,{0,0})})}) );
	Reject( File(1,1,{Frame({Chunk(15,{0,2,7})})}) );
	Reject( File(1,1,{Frame({Chunk(12,{1,0,1,0})})}) );
	Reject( File(1,1,{Frame({Chunk(7,{1,0,255,255,0,0})})}) );
	const auto padded = Flic::Decode( File(1,2,{Frame({Chunk(7,{2,0,1,0,0,1,7,8,1,0,0,255,9,10})})}) );
	Check(padded.frames[0].pixels == Bytes({7,9}),"odd SS2 literal/repeated word padding consumed, never next row");
	Reject( File(1,1,{Frame({Chunk(7,{1,0,1,0,0,2,7,8,9,10})})}) );
	Reject( File(1,1,{Frame({Chunk(7,{1,0,0,64})})}) );
	for ( int key : {-2,256} ) { bool failed=false; try { movie.frames[0].RGBA(key); } catch(const std::runtime_error&) {failed=true;} Check(failed,"invalid alpha key accepted"); }
	// The ring frame is not exposed as an extra frame during one-shot playback.
	auto ring = File(1,1,{Frame({Chunk(16,{3})}),Frame({Chunk(16,{4})})}); Set16(ring,6,1);
	Check(Flic::Decode(ring).frames.size()==1,"ring frame excluded");
	std::cout << "FLIC synthetic PASS: " << assertions << " assertions\n";
}
int main( int argc, char** argv ) {
	try {
		if ( argc == 1 ) { Tests(); return 0; }
		// Optional private diagnostic: no assets are needed by or copied into tests.
		std::ifstream in(argv[1],std::ios::binary); Bytes bytes((std::istreambuf_iterator<char>(in)),{});
		const auto movie = Flic::Decode(bytes);
		std::cout << movie.width << 'x' << movie.height << " frames=" << movie.frames.size() << '\n';
		std::ofstream out; if(argc==3) { out.open(argv[2],std::ios::binary); }
		for(const auto& frame:movie.frames) { const auto rgba=frame.RGBA(); if(out.is_open()) {out.write(reinterpret_cast<const char*>(rgba.data()),rgba.size());} }
		return 0;
	} catch(const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
