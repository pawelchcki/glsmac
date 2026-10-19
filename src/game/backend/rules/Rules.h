#pragma once

#include <unordered_map>
#include <vector>
#include <memory>
#include <cstdint>

#include "types/Serializable.h"
#include "gse/Wrappable.h"

namespace game {
namespace backend {
namespace rules {

CLASS2( Rules, types::Serializable, gse::Wrappable )

	Rules() = default;
	Rules( const Rules& other );
	Rules& operator=( const Rules& other );
	~Rules() override;

	wrapmap_t< int > m_difficulty_levels{ {
		{ -3, "Citizen", },
		{ -2, "Specialist", },
		{ -1, "Talent", },
		{ 0, "Librarian", },
		{ 1, "Thinker", },
		{ 2, "Transcend", },
	} }; // TODO: fix and wrap DifficultyLevel class, for now just hardcode and map name to difficulty

	virtual const std::string& GetDefaultDifficultyLevel() const = 0;
	const int GetDefaultDifficultyLevelV() const;

	void Initialize();
	int64_t GetNutrientCostFactor() const;
	void SetNutrientCostFactor( int64_t factor );
	int64_t GetMineralCostFactor() const;
	void SetMineralCostFactor( int64_t factor );

	WRAPDEFS_DYNAMIC( Rules );

	const types::Buffer Serialize() const override;
	void Deserialize( types::Buffer buf ) override;

protected:
	virtual void InitRules() = 0;

private:
	bool m_is_initialized = false;
	int64_t m_nutrient_cost_factor = 10;
	int64_t m_mineral_cost_factor = 10;
	// Saved native callables may outlive a settings wrapper or its world.
	// Each copy owns a distinct handle; assignment preserves destination readers.
	const std::shared_ptr< Rules* > m_nutrient_handle = std::make_shared< Rules* >( this );

	const gse::value::array_elements_t WrapDifficultyLevels( gc::Space* const gc_space );

};

}
}
}
