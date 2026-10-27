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
	bool IsBlindResearch() const { return m_blind_research; }
	void SetBlindResearch( bool enabled ) { m_blind_research = enabled; }
	bool IgnoreTerraformingTechnologies() const { return m_terraforming_ignore_technologies; }
	void SetTerraformingIgnoreTechnologies( bool enabled ) { m_terraforming_ignore_technologies = enabled; }
	struct world_size_t {
		std::string name;
		std::string description;
		int64_t size_x;
		int64_t size_y;
		bool operator==( const world_size_t& other ) const {
			return name == other.name && description == other.description && size_x == other.size_x && size_y == other.size_y;
		}
	};
	using world_sizes_t = std::vector< world_size_t >;
	const world_sizes_t& GetWorldSizes() const;
	bool HasWorldSizes() const;
	void SetWorldSizes( const world_sizes_t& sizes );
	static world_sizes_t DecodeWorldSizes( GSE_CALLABLE, gse::Value* value );
	gse::Value* WrapWorldSizes( GSE_CALLABLE ) const;

	WRAPDEFS_DYNAMIC( Rules );

	const types::Buffer Serialize() const override;
	void Deserialize( types::Buffer buf ) override;

protected:
	virtual void InitRules() = 0;

private:
	bool m_is_initialized = false;
	int64_t m_nutrient_cost_factor = 10;
	int64_t m_mineral_cost_factor = 10;
	bool m_blind_research = true;
	// Temporary normal-play policy explicitly requested by the user. Structural
	// Disable entries remain unsupported; this does not grant any technologies.
	bool m_terraforming_ignore_technologies = true;
	// Exact historical records retain the earlier reproduction's dimensions.
	// Actual startup replaces this table with the complete installed definition.
	static const world_sizes_t& LegacyWorldSizes();
	world_sizes_t m_world_sizes = LegacyWorldSizes();
	bool m_has_world_sizes = false;
	static void ValidateWorldSizes( const world_sizes_t& sizes );
	// Saved native callables may outlive a settings wrapper or its world.
	// Each copy owns a distinct handle; assignment preserves destination readers.
	const std::shared_ptr< Rules* > m_nutrient_handle = std::make_shared< Rules* >( this );

	const gse::value::array_elements_t WrapDifficultyLevels( gc::Space* const gc_space );

};

}
}
}
