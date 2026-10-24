#pragma once

#include <vector>
#include <string>
#include <memory>

#include "gse/Wrappable.h"
#include "game/backend/MapObject.h"
#include "game/backend/ResourceRelated.h"

#include "types/Buffer.h"

#include "Pop.h"
#include "ProductionState.h"

namespace gse::tests::mocks { struct ProductionFixture; }

namespace gse::value {
class Object;
class Array;
}

namespace game {
namespace backend {

class Game;
class Player;
namespace slot {
class Slot;
}
namespace faction {
class Faction;
}
namespace map::tile {
class Tile;
}

namespace base {

class FacilityDef;

class Base : public gse::Wrappable, public MapObject, public ResourceRelated {
public:

	static const size_t GetNextId();
	static const void SetNextId( const size_t id );

	typedef std::map< size_t, Pop > pops_t;
	typedef std::map< std::string, const FacilityDef* > facilities_t;

	Base(
		Game* game,
		const size_t id,
		slot::Slot* owner,
		faction::Faction* faction, // faction may differ from owner's faction in some cases, i.e. after being conquered
		map::tile::Tile* tile,
		const std::string& name,
		const facilities_t& facilities,
		const pops_t& pops,
		const size_t next_pop_id = 1,
		const bool attach_tile = true
	);
	virtual ~Base() { *m_rename_handle = nullptr; }

	const Game* const GetGame() const;
	const ProductionState& GetProductionState() const { return m_production; }
	static void ValidateInitialProduction( GSE_CALLABLE, Game* game, Player* player, const ProductionState& state );
	int64_t GetProductionSwitchLoss( GSE_CALLABLE, const std::string& choice_id ) const;
	ProductionState SelectProduction( GSE_CALLABLE, const std::string& choice_id );
	struct ProductionResult { ProductionState previous; std::string added_facility; int64_t unit_receipt = 0; };
	ProductionResult ProcessProduction( GSE_CALLABLE, const int64_t turn, const int64_t minerals );
	void RestoreProduction( GSE_CALLABLE, const ProductionState& previous, const std::string& added_facility );
	void RollbackUnitProduction( GSE_CALLABLE, int64_t receipt );

	Pop* const AddPop( const Pop& pop );
	void RemovePop( const size_t pop_id );
	void ClearWorkedTiles();
	void ChangePopType( GSE_CALLABLE, const size_t pop_id, const std::string& def_id );
	std::string ValidateCitizenReconciliation( GSE_CALLABLE, int64_t caller, int64_t turn );
	int64_t ReconcileCitizens( GSE_CALLABLE, int64_t caller, int64_t turn );
	void RollbackCitizenReconciliation( GSE_CALLABLE, int64_t receipt );
	std::string ValidateRename( GSE_CALLABLE, int64_t caller, int64_t turn, const std::string& previous_name, const std::string& name );
	int64_t Rename( GSE_CALLABLE, int64_t caller, int64_t turn, const std::string& previous_name, const std::string& name );
	void RollbackRename( GSE_CALLABLE, int64_t receipt );

	const size_t m_id;
	slot::Slot* m_owner;
	faction::Faction* m_faction;
	std::string m_name;
	facilities_t m_facilities;
	pops_t m_pops;

	static const types::Buffer Serialize( const Base* base );
	static Base* Deserialize( GSE_CALLABLE, types::Buffer& buf, Game* game, const bool attach = true );

	WRAPDEFS_DYNAMIC( Base );

	WRAPDEF_SERIALIZABLE;

	void GetReachableObjects( std::unordered_set< gc::Object* >& reachable_objects ) override;

private:
	friend struct gse::tests::mocks::ProductionFixture;
	friend class BaseManager;
	friend class game::backend::Game;
	std::string ValidateName( GSE_CALLABLE, int64_t caller, const std::string& previous_name, const std::string& name );
	int64_t RenameValidated( GSE_CALLABLE, const std::string& name );
	// Incoming snapshots stay detached until every center and worker claim is valid.
	static void AttachSnapshots( GSE_CALLABLE, const std::vector< Base* >& bases );
	std::vector< std::pair< size_t, map::tile::Tile* > > m_snapshot_work;
	Game* const m_game;
	ProductionState m_production;
	struct UnitProductionRecord {
		int64_t token = 0;
		ProductionState previous;
		pops_t::node_type citizen;
		map::tile::Tile* worked = nullptr;
		std::unordered_set< map::tile::Tile* >::node_type worked_node;
		size_t unit_id = 0;
		size_t previous_unit_id = 0;
		size_t next_unit_id = 0;
		gse::value::Object* identity = nullptr;
		std::string previous_rng, expected_rng, expected_base, expected_unit;
	};
	std::unique_ptr< UnitProductionRecord > m_unit_production;
	int64_t m_next_production_receipt = 0;
	struct CitizenReconciliationRecord {
		size_t turn = 0;
		std::map< size_t, std::string > previous_types;
		std::string expected_base;
	};
	std::map< int64_t, CitizenReconciliationRecord > m_citizen_reconciliations;
	int64_t m_next_citizen_reconciliation = 0;
	struct RenameRecord { size_t turn; std::string previous_name, expected_base; };
	std::map< int64_t, RenameRecord > m_renames;
	int64_t m_next_rename = 0;
	// Saved native methods retain an invalidatable identity, like Rules handles.
	std::shared_ptr< Base* > m_rename_handle = std::make_shared< Base* >( this );
	void ProductionChanged();
	ProductionResult CompleteUnitProduction( GSE_CALLABLE, const ProductionState& next );

	std::unordered_set< map::tile::Tile* > m_worked_tiles = {};

	size_t m_next_pop_id = 1;

	const PopDef* const GetPopDef( GSE_CALLABLE, const std::string& id ) const;

	gse::value::Array* const GetWorkableTiles( GSE_CALLABLE );
	gse::value::Array* const GetWorkedTiles( GSE_CALLABLE );
	gse::value::Array* const GetUnworkedTiles( GSE_CALLABLE );
	gse::value::Object* const GetIntake( GSE_CALLABLE );
	gse::value::Object* const GetConsumption( GSE_CALLABLE );

	void TriggerUpdate();
};

}
}
}
