#pragma once

#include <algorithm>
#include <iterator>

#include "Tile.h"
#include "TileState.h"

namespace game::backend::map::tile {

// Owned frontend input. TileState itself owns textures and links neighbours;
// copying it or queueing its address would expose mutable backend storage.
struct VisualState {
	coords_t coord;
	bool is_water_tile, west_water, north_water, east_water, south_water;
	elevation_t elevation;
	moisture_t moisture;
	rockiness_t rockiness;
	bonus_t bonus;
	feature_t features;
	terraforming_t terraforming;
	TileState::tile_layer_t layers[LAYER_MAX];
	bool is_coastline_corner;
	TileState::sprites_t sprites;

	VisualState( const Tile& tile, const TileState& state )
		: coord( tile.coord ), is_water_tile( tile.is_water_tile ),
		west_water( tile.W->is_water_tile ), north_water( tile.N->is_water_tile ),
		east_water( tile.E->is_water_tile ), south_water( tile.S->is_water_tile ),
		elevation( *tile.elevation.center ), moisture( tile.moisture ), rockiness( tile.rockiness ),
		bonus( tile.bonus ), features( tile.features ), terraforming( tile.terraforming ),
		is_coastline_corner( state.is_coastline_corner ), sprites( state.sprites ) {
		std::copy( std::begin( state.layers ), std::end( state.layers ), std::begin( layers ) );
	}
};

}
