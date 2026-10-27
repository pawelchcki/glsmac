#pragma once

#include <string>
#include <unordered_map>
#include <optional>
#include <memory>
#include <map>

#include "types/Serializable.h"
#include "gse/Wrappable.h"

namespace gse::value { class Array; }
namespace gse::tests::mocks { struct ProductionFixture; }

namespace game {
namespace backend {

class Game;

namespace faction {
class Faction;
}

namespace slot {
class Slot;
}

namespace base::production {
class Production;
}

CLASS2( Player, types::Serializable, gse::Wrappable )

	enum role_t {
		PR_NONE,
		PR_SINGLE,
		PR_HOST,
		PR_PLAYER,
		// Append roles to preserve existing serialized human role values.
		PR_COMPUTER,
	};

	Player( types::Buffer buf );
	Player(
		const std::string& name,
		const role_t role,
		faction::Faction* faction,
		const std::string& difficulty_level
	);
	Player( const Player* const other );

	virtual ~Player();

	const std::string& GetPlayerName() const;
	const std::string GetFullName() const;

	void Connect();
	void Disconnect();
	const bool IsConnected() const;

	void SetFaction( faction::Faction* faction );
	void ClearFaction();
	faction::Faction* GetFaction() const;

	void SetDifficultyLevel( const std::string& difficulty_level );
	const std::string& GetDifficultyLevel() const;

	void SetSlot( slot::Slot* slot );
	slot::Slot* GetSlot() const;

	const role_t GetRole() const;

	const bool IsTurnCompleted() const;
	void CompleteTurn();
	void UncompleteTurn();
	std::string ValidateInitialEnergy( int64_t credits ) const;
	int64_t InitializeEnergy( GSE_CALLABLE, int64_t credits );
	bool IsEnergyInitialized() const { return m_energy_initialized; }
	int64_t GetEnergyCredits() const { return m_energy_credits; }
	int64_t GetEnergyIncomeTurn() const { return m_energy_income_turn; }
	int64_t GetEnergyRevision() const { return m_energy_revision; }
	int64_t ChangeEnergy( GSE_CALLABLE, int64_t delta, int64_t expected, int64_t turn, bool income = false );
	void RollbackEnergy( GSE_CALLABLE, int64_t receipt );
	// Native acceptance boundary only; no GSE finalization capability.
	void FinalizeAcceptedEnergy( const std::string& event_id );

	void AddProductionChoice( GSE_CALLABLE, const std::string& id, const gse::value::object_properties_t& data );
	Game* GetGame() const;
	const base::production::Production* GetProductionChoice( const std::string& id ) const;
	// No recipe is distinct from an invalid or ambiguous live recipe.
	std::optional< int64_t > GetUnitMineralCost( const std::string& unit_id ) const;
	gse::value::Array* GetProductionChoices( GSE_CALLABLE ) const;
	void RemoveProductionChoice( GSE_CALLABLE, const std::string& id );

	WRAPDEFS_PTR( Player );

	const types::Buffer Serialize() const override;
	void Deserialize( types::Buffer buf ) override;

	WRAPDEF_SERIALIZABLE;

private:
	friend struct gse::tests::mocks::ProductionFixture;

	bool m_is_connected = false;

	std::string m_name = "";
	role_t m_role = PR_NONE;

	slot::Slot* m_slot = nullptr;
	size_t m_slotnum = 0;

	faction::Faction* m_faction = {};
	std::string m_difficulty_level = "";

	bool m_is_turn_completed = false;
	// Empty legacy snapshots carry an unfunded application treasury. Opening
	// grants and income timing are separate game policies, never inferred here.
	int64_t m_energy_credits = 0, m_energy_income_turn = 0, m_next_energy_receipt = 0, m_energy_revision = 0;
	bool m_energy_initialized = false, m_energy_initialization_allowed = true;
	struct EnergyReceipt { int64_t turn, credits, income_turn, expected, expected_income_turn, previous_revision; bool was_initialized, initialization, was_allowed; std::string acceptance_context; };
	std::map< int64_t, EnergyReceipt > m_energy_receipts;
	const EnergyReceipt& ValidateEnergyRollback( GSE_CALLABLE, int64_t receipt ) const;
	const std::shared_ptr< Player* > m_energy_handle = std::make_shared< Player* >( this );

	std::unordered_map< std::string, const base::production::Production* > m_production_choices = {};
};

}
}
