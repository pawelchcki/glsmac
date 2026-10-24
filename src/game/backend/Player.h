#pragma once

#include <string>
#include <unordered_map>
#include <optional>

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

	std::unordered_map< std::string, const base::production::Production* > m_production_choices = {};
};

}
}
