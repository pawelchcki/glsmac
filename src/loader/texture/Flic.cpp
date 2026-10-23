#include "Flic.h"

#include <algorithm>
#include <stdexcept>
#include <string>

// Format references (prose specification; independently implemented):
// Jim Kent, The Flic File Format, Dr. Dobb's Journal, March 1993, tables 1-5.
// https://jacobfilipp.com/DrDobbs/articles/DDJ/1993/9303/9303a/9303a.htm
// Autodesk Animator Pro file format documentation, archived at:
// https://www.fileformat.info/format/flt/corion.htm
namespace loader::texture {
namespace {

[[noreturn]] void Invalid( const char* message ) {
	throw std::runtime_error( std::string( "Invalid FLIC: " ) + message );
}

class Reader {
public:
	Reader( const std::vector< uint8_t >& bytes, size_t begin, size_t end ) : pos( begin ), end( end ), bytes( bytes ) {
		if ( begin > end || end > bytes.size() ) { Invalid( "chunk bounds" ); }
	}
	uint8_t U8() {
		if ( pos == end ) { Invalid( "truncated chunk" ); }
		return bytes[ pos++ ];
	}
	int S8() { const auto v = U8(); return v < 128 ? v : int( v ) - 256; }
	uint16_t U16() { const auto lo = U8(); return lo | uint16_t( U8() ) << 8; }
	uint32_t U32() { const auto lo = U16(); return lo | uint32_t( U16() ) << 16; }
	void Skip( size_t count ) {
		if ( count > end - pos ) { Invalid( "truncated chunk" ); }
		pos += count;
	}
	Reader Chunk( size_t size, size_t start ) {
		if ( size < pos - start || size > end - start ) { Invalid( "chunk size" ); }
		Reader result( bytes, pos, start + size );
		pos = start + size;
		return result;
	}
	size_t pos;
	size_t end;
private:
	const std::vector< uint8_t >& bytes;
};

void PaletteChunk( Reader& in, Flic::Palette& palette, bool six_bit ) {
	auto packets = in.U16();
	size_t index = 0;
	while ( packets-- ) {
		index += in.U8();
		size_t count = in.U8();
		if ( count == 0 ) { count = 256; }
		if ( index > 256 || count > 256 - index ) { Invalid( "palette range" ); }
		for ( size_t i = 0; i < count; i++, index++ ) {
			for ( auto& component : palette[ index ] ) {
				const auto value = in.U8();
				if ( six_bit && value > 63 ) { Invalid( "6-bit palette component" ); }
				component = six_bit ? value << 2 : value;
			}
		}
	}
}

void Pixels( Reader& in, uint16_t type, std::vector< uint8_t >& pixels, size_t width, size_t height ) {
	auto span = [ & ]( size_t x, size_t y, size_t count ) {
		if ( y >= height || x > width || count > width - x ) { Invalid( "pixel range" ); }
	};
	if ( type == 13 ) { std::fill( pixels.begin(), pixels.end(), 0 ); }
	else if ( type == 16 ) { for ( auto& pixel : pixels ) { pixel = in.U8(); } }
	else if ( type == 15 ) {
		for ( size_t y = 0; y < height; y++ ) {
			in.U8(); // obsolete packet count: width, not this byte, terminates a row
			size_t x = 0;
			while ( x < width ) {
				const int run = in.S8();
				if ( run == 0 ) { Invalid( "zero BRUN run" ); }
				const size_t count = run < 0 ? -run : run;
				span( x, y, count );
				if ( run > 0 ) {
					const auto value = in.U8();
					std::fill_n( pixels.begin() + y * width + x, count, value );
				}
				else { for ( size_t i = 0; i < count; i++ ) { pixels[ y * width + x + i ] = in.U8(); } }
				x += count;
			}
		}
	}
	else if ( type == 12 ) {
		size_t y = in.U16();
		const auto lines = in.U16();
		if ( y > height || lines > height - y ) { Invalid( "delta line range" ); }
		for ( size_t line = 0; line < lines; line++, y++ ) {
			auto packets = in.U8();
			size_t x = 0;
			while ( packets-- ) {
				x += in.U8();
				const int run = in.S8();
				const size_t count = run < 0 ? -run : run;
				span( x, y, count );
				if ( run < 0 ) {
					const auto value = in.U8();
					std::fill_n( pixels.begin() + y * width + x, count, value );
				}
				else { for ( size_t i = 0; i < count; i++ ) { pixels[ y * width + x + i ] = in.U8(); } }
				x += count;
			}
		}
	}
	else if ( type == 7 ) {
		const auto lines = in.U16();
		if ( lines > height ) { Invalid( "word delta line count" ); }
		size_t y = 0;
		for ( size_t line = 0; line < lines; line++, y++ ) {
			uint16_t code = in.U16();
			while ( code & 0x8000 ) {
				if ( code & 0x4000 ) {
					const size_t skip = 65536 - uint32_t( code );
					if ( y >= height || skip >= height - y ) { Invalid( "word delta line skip" ); }
					y += skip;
				}
				else {
					span( width - 1, y, 1 );
					pixels[ y * width + width - 1 ] = code & 255;
				}
				code = in.U16();
			}
			if ( code & 0x4000 ) { Invalid( "word delta opcode" ); }
			span( 0, y, 0 );
			size_t x = 0;
			for ( size_t packet = 0; packet < code; packet++ ) {
				x += in.U8();
				const int run = in.S8();
				const size_t words = run < 0 ? -run : run;
				// Word-coded writers may include the odd row's one-byte padding
				// in their final word. Consume it without exposing or writing it.
				const size_t row_bytes = width + ( width & 1 );
				if ( x > row_bytes || 2 * words > row_bytes - x ) { Invalid( "word delta pixel range" ); }
				auto put = [ & ]( uint8_t value ) {
					if ( x < width ) { pixels[ y * width + x ] = value; }
					x++;
				};
				if ( run < 0 ) {
					const auto lo = in.U8();
					const auto hi = in.U8();
					for ( size_t i = 0; i < words; i++ ) { put( lo ); put( hi ); }
				}
				else { for ( size_t i = 0; i < 2 * words; i++ ) { put( in.U8() ); } }
			}
		}
	}
}

}

std::vector< uint8_t > Flic::Frame::RGBA( int transparent_index ) const {
	if ( transparent_index < -1 || transparent_index > 255 ) { Invalid( "transparent palette index" ); }
	std::vector< uint8_t > result( pixels.size() * 4 );
	for ( size_t i = 0; i < pixels.size(); i++ ) {
		const auto index = pixels[ i ];
		for ( size_t c = 0; c < 3; c++ ) { result[ i * 4 + c ] = palette[ index ][ c ]; }
		result[ i * 4 + 3 ] = index == transparent_index ? 0 : 255;
	}
	return result;
}

Flic Flic::Decode( const std::vector< uint8_t >& bytes ) {
	constexpr size_t MAX_BYTES = 64 * 1024 * 1024;
	if ( bytes.size() < 128 || bytes.size() > MAX_BYTES ) { Invalid( "file size" ); }
	Reader header( bytes, 0, bytes.size() );
	const auto declared_size = header.U32();
	if ( declared_size < 128 || declared_size > bytes.size() ) { Invalid( "declared file size" ); }
	header.end = declared_size;
	const auto magic = header.U16();
	if ( magic != 0xaf11 && magic != 0xaf12 ) { Invalid( "unsupported file type" ); }
	const size_t count = header.U16();
	Flic result;
	result.width = header.U16();
	result.height = header.U16();
	if ( header.U16() != 8 ) { Invalid( "unsupported color depth" ); }
	header.U16();
	const uint32_t speed = magic == 0xaf11 ? ( uint32_t( header.U16() ) * 1000 + 35 ) / 70 : header.U32();
	const size_t pixels_count = size_t( result.width ) * result.height;
	if ( !count || count > 4000 || !pixels_count || result.width > 4096 || result.height > 4096 ||
		pixels_count > MAX_BYTES / count || count * sizeof( Palette ) > MAX_BYTES - pixels_count * count ) { Invalid( "decoded size limit" ); }
	header.pos = 128;
	std::vector< uint8_t > pixels( pixels_count, 0 );
	Palette palette = {};
	result.frames.reserve( count );
	while ( result.frames.size() < count ) {
		const size_t start = header.pos;
		const size_t size = header.U32();
		const auto type = header.U16();
		auto frame = header.Chunk( size, start );
		if ( type != 0xf1fa ) { continue; } // prefix / unknown ancillary chunks
		const auto chunks = frame.U16();
		const auto delay = frame.U16();
		frame.Skip( 6 );
		for ( size_t chunk = 0; chunk < chunks; chunk++ ) {
			const size_t substart = frame.pos;
			const size_t subsize = frame.U32();
			const auto subtype = frame.U16();
			auto data = frame.Chunk( subsize, substart );
			if ( subtype == 4 || subtype == 11 ) { PaletteChunk( data, palette, subtype == 11 ); }
			else { Pixels( data, subtype, pixels, result.width, result.height ); }
		}
		result.frames.push_back( { pixels, palette, magic == 0xaf12 && delay ? delay : speed } );
	}
	return result; // the optional ring frame is not part of the declared playback
}

}
