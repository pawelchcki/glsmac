#pragma once

#include <unordered_set>
#include <unordered_map>
#include <functional>
#include <vector>
#include <array>
#include <memory>

#include "gse/GCWrappable.h"

#include "network/Types.h"

#include "gse/Exception.h"
#include "game/backend/settings/Settings.h"

class GLSMAC;

namespace gse::tests::mocks { struct ProductionFixture; }

namespace game {
namespace backend {

namespace faction {
class Faction;
class FactionManager;
}

class Bindings;

class Game;

class Player;

namespace connection {
class Connection;
}
namespace slot {
class Slots;
}

CLASS( State, gse::GCWrappable )

	State( gc::Space* const gc_space, gse::context::Context* const ctx, GLSMAC* glsmac );
	virtual ~State();

	void SetGame( Game* game );
	void UnsetGame();
	Game* GetGame() const;

	typedef std::function< void( GSE_CALLABLE ) > gse_func_t;

	void WithGSE( gc::Object* const owner, const gse_func_t& f, const f_cleanup_t& f_cleanup = nullptr, const bool need_now = false );

	settings::Settings m_settings = {};
	slot::Slots* m_slots;

	Bindings* m_bindings = nullptr;

	std::function< void( const gse::Exception& ) > m_on_gse_error = nullptr;

	void Iterate();

	bool IsMaster();
	bool IsSlave();
	bool HasOfflineSinglePlayerRoster() const;

	void AddPlayer( Player* player );
	std::vector< faction::Faction* > ParseSinglePlayerRoster( GSE_CALLABLE, const gse::value::object_properties_t& setup, faction::Faction* human, bool& random_human );
	std::string GetSinglePlayerMapError() const;
	static std::string GetSinglePlayerMapError( int64_t width, int64_t height );
	void AddSinglePlayerSlot( faction::Faction* faction, bool name_confirmed = false, const std::vector< faction::Faction* >& roster = {}, bool random_human = false, const std::array< std::string, 6 >* identity = nullptr );
	void FinalizeSinglePlayerRoster();
	void RemovePlayer( Player* player );

	// used only on host
	void AddCIDSlot( const network::cid_t cid, const size_t slot );
	const bool HasCIDSlot( const network::cid_t cid );
	void RemoveCIDSlot( const network::cid_t cid );

	const std::unordered_map< network::cid_t, size_t >& GetCidSlots() const;

	void SetConnection( connection::Connection* connection );
	connection::Connection* GetConnection();
	void Reset();
	void DetachConnection();

	faction::FactionManager* GetFM() const;

	gse::Value* const TriggerObject( gse::GCWrappable* object, const std::string& event, const gse::f_args_t& f_args );

	WRAPDEFS_PTR( State )

	const types::Buffer Serialize() const;
	void Deserialize( types::Buffer buf );

	gc::Space* const m_gc_space = nullptr;
	gse::context::Context* const m_ctx = nullptr;

	void GetReachableObjects( std::unordered_set< Object* >& reachable_objects ) override;

	connection::Connection* m_connection = nullptr;

private:
	friend struct gse::tests::mocks::ProductionFixture;
	State( gc::Space* const gc_space, gse::context::Context* const ctx, GLSMAC* glsmac, const bool register_with_gc );

	GLSMAC* m_glsmac = nullptr;

	faction::FactionManager* m_fm = nullptr;
	Game* m_game = nullptr;
	faction::Faction* CreateSinglePlayerFaction( const faction::Faction* source, const std::array< std::string, 6 >* identity = nullptr );

	std::unordered_set< Player* > m_players = {}; // persistent
	std::vector< faction::Faction* > m_single_player_roster;
	bool m_single_player_random_human = false;
	std::vector< std::unique_ptr< faction::Faction > > m_single_player_factions;
	std::unordered_map< network::cid_t, size_t > m_cid_slots = {}; // volatile ( { cid, slot_num } )

};

}
}
