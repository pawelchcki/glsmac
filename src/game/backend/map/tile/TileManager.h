#pragma once

#include <unordered_set>
#include <memory>
#include <array>

#include "gse/GCWrappable.h"

#include "gse/value/Object.h"

#include "Types.h"
#include "TileLock.h"

namespace gse::tests::mocks { struct ProductionFixture; }

namespace game {
namespace backend {

class Game;
namespace unit { class Unit; }

namespace map {

class Map;

namespace tile {

class Tile;

CLASS( TileManager, gse::GCWrappable )
public:
	TileManager( Game* game );
	~TileManager();
	// Internal event acceptance only; direct raw API receipts retain their undo.
	void FinalizeAcceptedTerrain( const std::string& event_id );

	typedef std::function< void() > cb_oncomplete;

	void Clear();

	typedef std::unordered_set< map::tile::Tile* > tiles_t;

	const Tile* FindLockedTile( const tiles_t& tiles );
	void LockTiles( const size_t initiator_slot, const tiles_t& tiles );
	void UnlockTiles( const size_t initiator_slot, const tiles_t& tiles );

	void ProcessTileLockRequests();
	void ReleaseTileLocks( const size_t initiator_slot );

	WRAPDEFS_PTR( TileManager )

private:
	friend struct gse::tests::mocks::ProductionFixture;
	TileManager( Game* game, const bool register_with_gc );
	Game* m_game = nullptr;
	const std::shared_ptr< TileManager* > m_live_handle = std::make_shared< TileManager* >( this );
	Tile* GetTileAt( GSE_CALLABLE, int64_t x, int64_t y ) const;
	gse::Value* GetTerrainState( GSE_CALLABLE, int64_t x, int64_t y ) const;
	gse::Value* GetTerrainGeometry( GSE_CALLABLE, int64_t x, int64_t y ) const;
	static constexpr size_t MAX_TERRAIN_PATCHES = 4096;
	int64_t ApplyTerrain( GSE_CALLABLE, const std::vector< gse::Value* >& patches, const std::vector< gse::Value* >& workers, bool apply = true );
	void RollbackTerrain( GSE_CALLABLE, int64_t receipt );
	struct TerrainRecord {
		struct Entry {
			Tile* tile;
			std::string expected;
			std::array< elevation_t, 5 > elevation;
			moisture_t moisture; rockiness_t rockiness; feature_t features; terraforming_t terraforming;
			bool previous_water, expected_water, imported, imported_water;
			elevation_t imported_elevation;
			std::array< elevation_t, 4 > imported_corners;
			bool canonical, canonical_water; elevation_t canonical_elevation;
			std::array< int8_t, 13 > terraforming_owners;
			int64_t previous_revision;
		};
		std::weak_ptr< const uint8_t > world;
		std::string acceptance_context;
		std::vector< Entry > entries;
		std::map< size_t, std::weak_ptr< unit::Unit* > > workers;
	};
	void RestoreTerrain( const TerrainRecord& record );
	const TerrainRecord& ValidateTerrainRollback( GSE_CALLABLE, int64_t receipt ) const;
	std::map< int64_t, TerrainRecord > m_terrain_records;
	int64_t m_next_terrain_receipt = 0;

	// server-side lock tracking
	struct tile_lock_request_t {
		const bool is_lock; // lock or unlock
		const size_t initiator_slot;
		const tiles_t tile_positions;
	};
	typedef std::vector< tile_lock_request_t > tile_lock_requests_t;  // requests fifo
	tile_lock_requests_t m_tile_lock_requests = {};
	std::unordered_map< size_t, std::vector< TileLock > > m_tile_locks = {}; // slot id, locks
	std::vector< std::pair< tiles_t, cb_oncomplete > > m_tile_lock_callbacks = {}; // tile positions (for matching), callback

	const std::string TilesToString( const tiles_t& tiles, std::string prefx = "" );

	const size_t GetDistance( const Tile* const tile, const Tile* const other, const size_t map_width ) const;

	Map* GetMap( GSE_CALLABLE ) const;

};

}
}
}
}
