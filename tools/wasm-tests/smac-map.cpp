#include "game/backend/map/SMACMap.h"

#include <emscripten/emscripten.h>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
game::backend::map::smac::Data data;
std::string error;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int HasMapSignature( const unsigned char* bytes, const size_t size ) {
	return game::backend::map::smac::HasSignature( std::vector< unsigned char >( bytes, bytes + size ) );
}

EMSCRIPTEN_KEEPALIVE int ParseMap( const unsigned char* bytes, const size_t size ) {
	data = {};
	error.clear();
	try {
		data = game::backend::map::smac::Parse( std::vector< unsigned char >( bytes, bytes + size ) );
		return 1;
	} catch ( const std::runtime_error& failure ) {
		error = failure.what();
		return 0;
	}
}

EMSCRIPTEN_KEEPALIVE const char* GetMapError() { return error.c_str(); }

EMSCRIPTEN_KEEPALIVE double GetMapValue( const int field ) {
	switch ( field ) {
		case 0: return data.width;
		case 1: return data.height;
		case 2: return data.seed;
		case 3: return data.sea_level;
		case 4: return data.flat;
		case 5: return data.tiles.size();
		default: return -1;
	}
}

EMSCRIPTEN_KEEPALIVE int GetMapTileValue( const size_t index, const int field ) {
	if ( index >= data.tiles.size() ) return -1;
	const auto& tile = data.tiles[index];
	switch ( field ) {
		case 0: return tile.elevation;
		case 1: return tile.water;
		case 2: return tile.moisture;
		case 3: return tile.rockiness;
		case 4: return tile.bonus;
		case 5: return tile.features;
		case 6: return tile.terraforming;
		default: return -1;
	}
}

}
