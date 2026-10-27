#include "TileManager.h"
#include <limits>
#include "Geometry.h"

#include "game/backend/Game.h"
#include "game/backend/State.h"
#include "game/backend/slot/Slot.h"
#include "game/backend/slot/Slots.h"
#include "game/backend/map/Map.h"

#include "gse/context/Context.h"
#include "gse/callable/Native.h"
#include "gse/ExecutionPointer.h"
#include "gse/value/Bool.h"
#include "gse/value/Int.h"
#include "gse/value/Array.h"
#include "gse/value/Null.h"

namespace game {
namespace backend {
namespace map {
namespace tile {

TileManager::TileManager( Game* game )
	: TileManager( game, true ) {}

TileManager::TileManager( Game* game, const bool register_with_gc )
	: gse::GCWrappable( register_with_gc ? game->GetGCSpace() : nullptr )
	, m_game( game ) {
	//
}

TileManager::~TileManager() {
	*m_live_handle = nullptr;
}

Tile* TileManager::GetTileAt( GSE_CALLABLE, const int64_t x, const int64_t y ) const {
	const auto* map = GetMap( GSE_CALL );
	if ( x < 0 || y < 0 || static_cast< uint64_t >( x ) >= map->GetWidth() || static_cast< uint64_t >( y ) >= map->GetHeight() || x % 2 != y % 2 ) {
		GSE_ERROR( gse::EC.INVALID_CALL, "Invalid terraforming tile coordinates" );
	}
	return map->GetTile( x, y );
}

gse::Value* TileManager::GetTerrainState( GSE_CALLABLE, const int64_t x, const int64_t y ) const {
	const auto* tile = GetTileAt( GSE_CALL, x, y );
	const auto* map = GetMap( GSE_CALL );
	// Detached native values only. Imported center/class are retained in engine
	// units; the original source map's raw height byte is not stored here.
	gse::Value* source_elevation = VALUE( gse::value::Null );
	gse::Value* source_water = VALUE( gse::value::Null );
	gse::Value* source_corners = VALUE( gse::value::Null );
	if ( tile->m_has_imported_elevation ) {
		source_elevation = VALUE( gse::value::Int,, tile->m_imported_elevation );
		source_water = VALUE( gse::value::Bool,, tile->m_imported_water );
		gse::value::array_elements_t corners;
		for ( const auto elevation : tile->m_imported_corners ) { corners.push_back( VALUE( gse::value::Int,, elevation ) ); }
		source_corners = VALUE( gse::value::Array,, corners );
	}
	gse::value::object_properties_t neighbors;
	for ( const auto& entry : std::vector< std::pair< std::string, const Tile* > >{
		{ "W", tile->W }, { "NW", tile->NW }, { "N", tile->N }, { "NE", tile->NE },
		{ "E", tile->E }, { "SE", tile->SE }, { "S", tile->S }, { "SW", tile->SW },
	} ) {
		const auto* neighbor = entry.second;
		neighbors.emplace( entry.first, neighbor ? VALUEEXT( gse::value::Object, GSE_CALL, {
			{ "x", VALUE( gse::value::Int,, neighbor->coord.x ) }, { "y", VALUE( gse::value::Int,, neighbor->coord.y ) },
		} ) : static_cast< gse::Value* >( VALUE( gse::value::Null ) ) );
	}
	return VALUEEXT( gse::value::Object, GSE_CALL, {
		{ "version", VALUE( gse::value::Int,, 1 ) },
		{ "terrain_epoch", VALUE( gse::value::Int,, tile->m_terrain_epoch ) },
		{ "neighbors", VALUEEXT( gse::value::Object, GSE_CALL, neighbors ) },
		{ "x", VALUE( gse::value::Int,, tile->coord.x ) }, { "y", VALUE( gse::value::Int,, tile->coord.y ) },
		{ "width", VALUE( gse::value::Int,, map->GetWidth() ) }, { "height", VALUE( gse::value::Int,, map->GetHeight() ) },
		{ "elevation", VALUEEXT( gse::value::Object, GSE_CALL, {
			{ "center", VALUE( gse::value::Int,, *tile->elevation.center ) },
			{ "left", VALUE( gse::value::Int,, *tile->elevation.left ) }, { "top", VALUE( gse::value::Int,, *tile->elevation.top ) },
			{ "right", VALUE( gse::value::Int,, *tile->elevation.right ) }, { "bottom", VALUE( gse::value::Int,, *tile->elevation.bottom ) },
		} ) },
		{ "is_land", VALUE( gse::value::Bool,, !tile->is_water_tile ) }, { "is_water", VALUE( gse::value::Bool,, tile->is_water_tile ) },
		{ "moisture", VALUE( gse::value::Int,, tile->moisture ) }, { "rockiness", VALUE( gse::value::Int,, tile->rockiness ) },
		{ "bonus", VALUE( gse::value::Int,, tile->bonus ) },
		{ "features_raw", VALUE( gse::value::Int,, tile->features ) }, { "features", tile->GetFeatures( GSE_CALL ) },
		{ "terraforming_owners", tile->GetTerraformingOwners( GSE_CALL ) },
		{ "terraforming_raw", VALUE( gse::value::Int,, tile->terraforming ) }, { "terraforming", tile->GetTerraforming( GSE_CALL ) },
		{ "canonical", VALUEEXT( gse::value::Object, GSE_CALL, {
			{ "active", VALUE( gse::value::Bool,, tile->m_has_canonical_elevation ) },
			{ "elevation", tile->m_has_canonical_elevation ? static_cast< gse::Value* >( VALUE( gse::value::Int,, tile->m_canonical_elevation ) ) : VALUE( gse::value::Null ) },
			{ "is_water", tile->m_has_canonical_elevation ? static_cast< gse::Value* >( VALUE( gse::value::Bool,, tile->m_canonical_water ) ) : VALUE( gse::value::Null ) },
		} ) },
		{ "imported", VALUEEXT( gse::value::Object, GSE_CALL, {
			{ "active", VALUE( gse::value::Bool,, tile->m_has_imported_elevation ) },
			{ "source_elevation", source_elevation }, { "source_water", source_water }, { "source_corners", source_corners },
		} ) },
	} );
}

gse::Value* TileManager::GetTerrainGeometry( GSE_CALLABLE, const int64_t x, const int64_t y ) const {
	const auto* tile = GetTileAt( GSE_CALL, x, y );
	// Version 1: [version, x, y, native integer center, water, patch limit,
	//             [W, NW, N, NE, E, SE, S, SW]], each neighbor null or [x,y].
	// Arrays carry detached scalar data without per-Object script contexts.
	gse::value::array_elements_t neighbors;
	for ( const auto* neighbor : std::array< const Tile*, 8 >{ tile->W, tile->NW, tile->N, tile->NE, tile->E, tile->SE, tile->S, tile->SW } ) {
		neighbors.push_back( neighbor ? static_cast< gse::Value* >( VALUE( gse::value::Array,, ( gse::value::array_elements_t {
			VALUE( gse::value::Int,, neighbor->coord.x ), VALUE( gse::value::Int,, neighbor->coord.y ),
		} ) ) ) : VALUE( gse::value::Null ) );
	}
	return VALUE( gse::value::Array,, ( gse::value::array_elements_t {
		VALUE( gse::value::Int,, 1 ), VALUE( gse::value::Int,, tile->coord.x ), VALUE( gse::value::Int,, tile->coord.y ),
		VALUE( gse::value::Int,, *tile->elevation.center ), VALUE( gse::value::Bool,, tile->is_water_tile ),
		VALUE( gse::value::Int,, MAX_TERRAIN_PATCHES ), VALUE( gse::value::Array,, neighbors ),
	} ) );
}

void TileManager::Clear() {
	m_terrain_records.clear();
	m_tile_lock_requests.clear();
	m_tile_locks.clear();
	m_tile_lock_callbacks.clear();
}

void TileManager::LockTiles( const size_t initiator_slot, const tiles_t& tiles ) {
	for ( const auto& tile : tiles ) {
		ASSERT( !tile->IsLocked(), "tile " + tile->coord.ToString() + " is already locked" );
		tile->Lock( initiator_slot );
	}
	for ( auto it = m_tile_lock_callbacks.begin() ; it != m_tile_lock_callbacks.end() ; it++ ) {
		const auto& it_positions = it->first;
		const auto sz = it_positions.size();
		if ( sz == tiles.size() ) {
			bool match = true;
			for ( const auto& tile : tiles ) {
				if ( it_positions.find( tile ) == it_positions.end() ) {
					match = false;
					break;
				}
			}
			if ( match ) {
				const auto cb = it->second;
				m_tile_lock_callbacks.erase( it );
				cb();
				break;
			}
		}
	}
}

const Tile* TileManager::FindLockedTile( const tiles_t& tiles ) {
	for ( const auto& tile : tiles ) {
		if ( tile->IsLocked() ) {
			return tile;
		}
	}
	return nullptr;
}

void TileManager::UnlockTiles( const size_t initiator_slot, const tiles_t& tiles ) {
	for ( const auto& tile : tiles ) {
		ASSERT( tile->IsLockedBy( initiator_slot ), "tile " + tile->coord.ToString() + " is not locked by " + std::to_string( initiator_slot ) );
		tile->Unlock();
	}
}

void TileManager::ProcessTileLockRequests() {
	if ( m_game->IsRunning() ) {
		auto* state = m_game->GetState();
		if ( state->IsMaster() && !m_tile_lock_requests.empty() ) {
			const auto tile_lock_requests = m_tile_lock_requests;
			m_tile_lock_requests.clear();
			const auto slot_num = m_game->GetSlotNum();
			if ( !tile_lock_requests.empty() ) {
				m_game->GetState()->WithGSE(
					this,
					[ this, &tile_lock_requests, &state, &slot_num ]( GSE_CALLABLE ) {
						for ( const auto& req : tile_lock_requests ) {
							const auto slot_state = state->m_slots->GetSlot( req.initiator_slot ).GetState();
							if ( slot_state != slot::Slot::SS_PLAYER ) {
								// player disconnected?
								Log( "Skipping tile locks/unlocks for slot " + std::to_string( req.initiator_slot ) + " (invalid slot state: " + std::to_string( slot_state ) + ")" );
								continue;
							}
							auto it = m_tile_locks.find( req.initiator_slot );
							if ( it == m_tile_locks.end() ) {
								it = m_tile_locks.insert(
									{
										req.initiator_slot,
										{}
									}
								).first;
							}
							auto& locks = it->second;
							if ( req.is_lock ) {
								// lock
								Log( "Locking tiles for " + std::to_string( req.initiator_slot ) + ": " + TilesToString( req.tile_positions ) );
								locks.push_back( TileLock{ req.tile_positions } );
							}
							else {
								// unlock
								bool found = false;
								for ( auto locks_it = locks.begin() ; locks_it != locks.end() ; locks_it++ ) {
									if ( locks_it->Matches( req.tile_positions ) ) {
										found = true;
										Log( "Unlocking tiles for " + std::to_string( req.initiator_slot ) + ": " + TilesToString( req.tile_positions ) );
										locks.erase( locks_it );
										if ( locks.empty() ) {
											m_tile_locks.erase( it );
										}
										break;
									}
								}
								if ( !found ) {
									Log( "Could not find matching tile locks for " + std::to_string( req.initiator_slot ) + ": " + TilesToString( req.tile_positions ) );
								}
							}
						}
					}
				);
			}
		}
	}
}

void TileManager::ReleaseTileLocks( const size_t initiator_slot ) {
	const auto& it = m_tile_locks.find( initiator_slot );
	if ( it != m_tile_locks.end() ) {
		Log( "Releasing " + std::to_string( it->second.size() ) + " tile locks" );
		m_tile_locks.erase( it );
	}
}

WRAPIMPL_BEGIN( TileManager )
	WRAPIMPL_PROPS
	WRAPIMPL_TRIGGERS
		{
			"validate_terrain", NATIVE_CALL( handle = m_live_handle ) {
				N_EXPECT_ARGS( 2 ); N_GETVALUE( patches, 0, Array ); N_GETVALUE( workers, 1, Array ); auto* tm = *handle;
				if ( !tm || tm->m_game->GetTM() != tm ) { GSE_ERROR( gse::EC.INVALID_CALL, "Tile manager no longer exists" ); }
				tm->ApplyTerrain( GSE_CALL, patches, workers, false ); return VALUE( gse::value::Undefined );
			} )
		},
		{
			"validate_terrain_rollback", NATIVE_CALL( handle = m_live_handle ) {
				N_EXPECT_ARGS( 1 ); N_GETVALUE( receipt, 0, Int ); auto* tm = *handle;
				if ( !tm || tm->m_game->GetTM() != tm ) { GSE_ERROR( gse::EC.INVALID_CALL, "Tile manager no longer exists" ); }
				tm->ValidateTerrainRollback( GSE_CALL, receipt ); return VALUE( gse::value::Undefined );
			} )
		},
		{
			"apply_terrain", NATIVE_CALL( handle = m_live_handle ) {
				N_EXPECT_ARGS( 2 ); N_GETVALUE( patches, 0, Array ); N_GETVALUE( workers, 1, Array );
				auto* tm = *handle;
				if ( !tm || tm->m_game->GetTM() != tm ) { GSE_ERROR( gse::EC.INVALID_CALL, "Tile manager no longer exists" ); }
				return VALUE( gse::value::Int,, tm->ApplyTerrain( GSE_CALL, patches, workers ) );
			} )
		},
		{
			"rollback_terrain", NATIVE_CALL( handle = m_live_handle ) {
				N_EXPECT_ARGS( 1 ); N_GETVALUE( receipt, 0, Int ); auto* tm = *handle;
				if ( !tm || tm->m_game->GetTM() != tm ) { GSE_ERROR( gse::EC.INVALID_CALL, "Tile manager no longer exists" ); }
				tm->RollbackTerrain( GSE_CALL, receipt ); return VALUE( gse::value::Undefined );
			} )
		},
		{
			"get_terrain_geometry", NATIVE_CALL( handle = m_live_handle ) {
				N_EXPECT_ARGS( 2 ); N_GETVALUE( x, 0, Int ); N_GETVALUE( y, 1, Int );
				auto* tm = *handle;
				if ( !tm || tm->m_game->GetTM() != tm ) { GSE_ERROR( gse::EC.INVALID_CALL, "Tile manager no longer exists" ); }
				return tm->GetTerrainGeometry( GSE_CALL, x, y );
			} )
		},
		{
			"get_terrain_state", NATIVE_CALL( handle = m_live_handle ) {
				N_EXPECT_ARGS( 2 ); N_GETVALUE( x, 0, Int ); N_GETVALUE( y, 1, Int );
				auto* tm = *handle;
				if ( !tm || tm->m_game->GetTM() != tm ) { GSE_ERROR( gse::EC.INVALID_CALL, "Tile manager no longer exists" ); }
				return tm->GetTerrainState( GSE_CALL, x, y );
			} )
		},
		{
			"get_terraforming", NATIVE_CALL( handle = m_live_handle ) {
				N_EXPECT_ARGS( 2 ); N_GETVALUE( x, 0, Int ); N_GETVALUE( y, 1, Int );
				auto* tm = *handle;
				if ( !tm || tm->m_game->GetTM() != tm ) { GSE_ERROR( gse::EC.INVALID_CALL, "Tile manager no longer exists" ); }
				return tm->GetTileAt( GSE_CALL, x, y )->GetTerraforming( GSE_CALL );
			} )
		},
		{
			"set_terraforming", NATIVE_CALL( handle = m_live_handle ) {
				N_EXPECT_ARGS( 3 ); N_GETVALUE( x, 0, Int ); N_GETVALUE( y, 1, Int ); N_GETVALUE( data, 2, Object );
				auto* tm = *handle;
				if ( !tm || tm->m_game->GetTM() != tm ) { GSE_ERROR( gse::EC.INVALID_CALL, "Tile manager no longer exists" ); }
				tm->m_game->CheckRW( GSE_CALL ); tm->CheckCustomMutation( GSE_CALL );
				auto* tile = tm->GetTileAt( GSE_CALL, x, y );
				if ( tile->IsLocked() ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terraforming tile is locked" ); }
				if ( data.size() != 4 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Expected road farm mine and forest flags" ); }
				N_GETPROP( road, data, "road", Bool ); N_GETPROP( farm, data, "farm", Bool );
				N_GETPROP( mine, data, "mine", Bool ); N_GETPROP( forest, data, "forest", Bool );
				const auto mask = TERRAFORMING_ROAD | TERRAFORMING_FARM | TERRAFORMING_MINE | TERRAFORMING_FOREST;
				const terraforming_t flags = ( tile->terraforming & ~mask ) | ( road ? TERRAFORMING_ROAD : 0 ) |
					( farm ? TERRAFORMING_FARM : 0 ) | ( mine ? TERRAFORMING_MINE : 0 ) | ( forest ? TERRAFORMING_FOREST : 0 );
				if ( tm->m_next_terrain_receipt == std::numeric_limits< int64_t >::max() || tile->m_terrain_epoch == std::numeric_limits< int64_t >::max() ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain revision capacity exhausted" ); }
				auto wrappers = tile->PrepareWrappedTerrain( GSE_CALL, { *tile->elevation.center, tile->is_water_tile,
					tile->moisture, tile->rockiness, tile->features, tile->bonus, flags } );
				tm->m_game->GetMap()->SetTerraforming( tile, flags );
				Tile::PublishWrappedTerrain( wrappers );
				tile->m_terrain_revision = ++tm->m_next_terrain_receipt; ++tile->m_terrain_epoch;
				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"get_map_width",
			NATIVE_CALL( this ) {
				const auto* m = GetMap( GSE_CALL );
				return VALUE( gse::value::Int,, m->GetWidth() );
			} )
		},
		{
			"get_map_height",
			NATIVE_CALL( this ) {
				const auto* m = GetMap( GSE_CALL );
				return VALUE( gse::value::Int,, m->GetHeight() );
			})
		},
		{
			"get_tile",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 2 );
				N_GETVALUE( x, 0, Int );
				N_GETVALUE( y, 1, Int );
				const auto* m = GetMap( GSE_CALL );
				const auto w = m->GetWidth();
				const auto h = m->GetHeight();
				if ( x >= w ) {
					GSE_ERROR( gse::EC.INVALID_CALL, "X coordinate exceeds map width ( " + std::to_string( x ) + " >= " + std::to_string( w ) + " )" );
				}
				if ( y >= h ) {
					GSE_ERROR( gse::EC.INVALID_CALL, "Y coordinate exceeds map height ( " + std::to_string( y ) + " >= " + std::to_string( h ) + " )" );
				}
				if ( x < 0 ) {
					GSE_ERROR( gse::EC.INVALID_CALL, "X coordinate can't be negative ( " + std::to_string( x ) + " < 0" );
				}
				if ( y < 0 ) {
					GSE_ERROR( gse::EC.INVALID_CALL, "Y coordinate can't be negative ( " + std::to_string( y ) + " < 0" );
				}
				if ( x % 2 != y % 2 ) {
					GSE_ERROR( gse::EC.INVALID_CALL, "X and Y oddity differs ( " + std::to_string( x ) + " % 2 != " + std::to_string( y ) + " % 2 )" );
				}
				return m->GetTile( x, y )->Wrap( GSE_CALL );
			} )
		},
		{
			"get_distance",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 2 );
				N_GETVALUE_UNWRAP( tile, 0, Tile );
				N_GETVALUE_UNWRAP( other, 1, Tile );
				const auto* m = GetMap( GSE_CALL );
				return VALUE( gse::value::Int,, GetDistance( tile, other, m->GetWidth() ) );
			} )
		},
	};
WRAPIMPL_END_PTR()

UNWRAPIMPL_PTR( TileManager )

const std::string TileManager::TilesToString( const tiles_t& tiles, std::string prefx ) {
	// TODO: refactor
	std::string result = TS_ARR_BEGIN( "Tiles" );
	for ( const auto& tile : tiles ) {
		std::string prefix = prefx + TS_OFFSET;
		result += TS_OFFSET + TS_OBJ_BEGIN( "Tile" ) +
			TS_OBJ_PROP_NUM( "x", tile->coord.x ) +
			TS_OBJ_PROP_NUM( "y", tile->coord.y ) +
			TS_OBJ_END() + ",\n";
	}
	std::string prefix = prefx;
	result += TS_ARR_END();
	return result;
}

const size_t TileManager::GetDistance( const Tile* const tile, const Tile* const other, const size_t map_width ) const {
	return GetTileDistance( tile->coord.x, tile->coord.y, other->coord.x, other->coord.y, map_width );
}

Map* TileManager::GetMap( GSE_CALLABLE ) const {
	ASSERT( m_game, "game is null" );
	if ( !m_game->IsMapReady() ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Map is not ready." );
	}
	return m_game->GetMap();
}

}
}
}
}
