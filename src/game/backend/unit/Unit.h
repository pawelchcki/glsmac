#pragma once

#include <string>
#include <memory>

#include "gse/Wrappable.h"
#include "game/backend/MapObject.h"

#include "Types.h"

#include "types/Buffer.h"

namespace game {
namespace backend {

namespace base { class Base; }

namespace slot {
class Slot;
}
namespace map::tile {
class Tile;
class TileManager;
}

namespace unit {

class Def;
class UnitManager;

class Unit : public gse::Wrappable, public MapObject {
public:

	static const size_t GetNextId();
	static const void SetNextId( const size_t id );

	Unit(
		GSE_CALLABLE,
		UnitManager* um,
		const size_t id,
		Def* def,
		slot::Slot* owner,
		map::tile::Tile* tile,
		const movement_t movement,
		const morale_t morale,
		const health_t health,
		const bool moved_this_turn
	);
	virtual ~Unit();

	const size_t m_id;
	Def* m_def;
	slot::Slot* m_owner;

	movement_t m_movement;
	morale_t m_morale;
	health_t m_health;
	bool m_moved_this_turn;

	size_t m_animation_id = 0;

	static const movement_t MINIMUM_MOVEMENT_TO_KEEP;
	static const movement_t MINIMUM_HEALTH_TO_KEEP;
	const bool HasMovesLeft() const;
	const bool NeedsOrders() const;
	order_t GetOrder() const;
	void SetOrder( order_t order );
	void SetTerraformHomeFromProduction( const base::Base* base );
	// Script-owned work policy, stored with the native unit so progress survives
	// wrapper recreation, synchronization and manager serialization.
	struct work_state_t {
		std::string action;
		int64_t work_units = 0, required_work = 0, last_turn = 0;
		int64_t previous_work_units = 0;
		movement_t previous_movement = 0.0f;
		bool previous_moved = false;
		int64_t tile_x = 0, tile_y = 0;
	};

	// Versioned pure-data automation intent. No wrapper, callback or route cache
	// is retained: paths are recomputed against the receiving live world.
	struct automation_state_t {
		std::string command;
		int64_t epoch = 0, owner = 0, issued_turn = 0, last_turn = 0;
		int64_t target_x = 0, target_y = 0, origin_x = 0, origin_y = 0, cursor = 0, phase = 0;
	};

	const std::string& GetMoraleString() const;

	void SetTile( GSE_CALLABLE, map::tile::Tile* tile );

	static const types::Buffer Serialize( const Unit* unit );
	static Unit* Deserialize( GSE_CALLABLE, types::Buffer& buf, UnitManager* um );

	WRAPDEFS_DYNAMIC( Unit );

	WRAPDEF_SERIALIZABLE;

private:
	friend class map::tile::TileManager;
	UnitManager* const m_um;
	order_t m_order = order_t::NO_ORDERS;
	work_state_t m_work;
	automation_state_t m_automation;
	int64_t m_terraform_home = 0;
	int64_t m_home_revision = 0;
	struct { int64_t token = 0, previous = 0, expected = 0; } m_home_undo;
	static bool ValidAutomation( const automation_state_t& plan, const map::Map* map, const size_t owner );
	static bool ValidWork( const work_state_t& work, const map::Map* map );
	// Native callables can outlive their wrapper and even their manager.
	const std::shared_ptr< Unit* > m_order_handle = std::make_shared< Unit* >( this );
	void CheckLive( GSE_CALLABLE ) const;

};

}
}
}
