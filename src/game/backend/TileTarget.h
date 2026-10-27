#pragma once

#include "Types.h"

namespace game::backend {
class Game;
namespace map::tile { class Tile; }

// UI-thread pointer selection only. Returns false without dispatch for all
// other purposes and when no dedicated owner has installed a target handler.
bool ConsumeTileTarget( Game* game, map::tile::Tile* tile, tile_query_purpose_t purpose );
}
