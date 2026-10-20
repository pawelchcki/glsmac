#include "TileManager.h"
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

void TileManager::Clear() {
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
				tm->m_game->GetMap()->SetTerraforming( tile, flags );
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
