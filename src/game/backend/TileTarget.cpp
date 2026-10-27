#include "TileTarget.h"

#include "Game.h"
#include "State.h"
#include "game/backend/map/tile/Tile.h"
#include "gse/value/Bool.h"

namespace game::backend {
bool ConsumeTileTarget( Game* game, map::tile::Tile* tile, const tile_query_purpose_t purpose ) {
	// Catch-all diagnostic listeners are not target consumers. Inactive input
	// retains the existing frontend path without scheduling a script callback.
	if ( purpose != TQP_OBJECT_SELECT || !game || !tile || !game->HasNamedHandlers( "tile_target" ) ) { return false; }
	auto* state = game->GetState();
	if ( !state || state->GetGame() != game ) { return false; }
	bool consumed = false;
	// Frontend pointer input runs on the GSE owner thread, as do ordinary UI
	// callbacks. need_now prevents a queued callback from borrowing stack state.
	state->WithGSE( state, [ game, tile, &consumed ]( GSE_CALLABLE ) {
		auto* result = game->Trigger( GSE_CALL, "tile_target", ARGS_F( tile ) {
			{ "tile", tile->Wrap( GSE_CALL ) },
		}; }, gse::VT_BOOL );
		consumed = static_cast< gse::value::Bool* >( result )->value;
	}, nullptr, true );
	return consumed;
}
}
