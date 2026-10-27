#pragma once

#include <vector>
#include <string>
#include <array>
#include <memory>

#include "types/Serializable.h"
#include "gse/Wrappable.h"

#include "game/backend/faction/Types.h"
#include "types/Color.h"

namespace game {
namespace backend {
namespace faction {

CLASS2( Faction, types::Serializable, gse::Wrappable )

	Faction();
	Faction( const std::string& id, const std::string& name );
	std::unique_ptr< Faction > Clone() const;

	// Editor order: leader, formal faction name, noun, adjective, title, description.
	using identity_t = std::array< std::string, 6 >;
	static identity_t ParseIdentity( GSE_CALLABLE, const std::vector< gse::Value* >& values );
	void SetIdentity( const identity_t& identity );
	identity_t GetIdentity() const;
	static std::array< int, 2 > ParseSocialRatings( GSE_CALLABLE, const gse::value::object_properties_t& values );
	void SetSocialRatings( int growth, int industry );
	int m_growth = 0;
	int m_industry = 0;
	static std::vector< std::string > ParseStartingTechnologies( GSE_CALLABLE, const std::vector< gse::Value* >& values );
	void SetStartingTechnologies( const std::vector< std::string >& technologies );
	const std::vector< std::string >& GetStartingTechnologies() const { return m_starting_technologies; }

	struct economy_bonuses_t { int64_t starting_energy = 0; bool terraform_cost_halved = false; };
	static economy_bonuses_t ParseEconomyBonuses( GSE_CALLABLE, const gse::value::object_properties_t& values );
	void SetEconomyBonuses( const economy_bonuses_t& bonuses );
	const economy_bonuses_t& GetEconomyBonuses() const { return m_economy_bonuses; }

	typedef uint8_t faction_flag_t;
	static constexpr Faction::faction_flag_t FF_NONE = 0;
	static constexpr Faction::faction_flag_t FF_NAVAL = 1 << 0;
	static constexpr Faction::faction_flag_t FF_PROGENITOR = 1 << 1;

	std::string m_id = "";
	std::string m_name = "";
	faction_flag_t m_flags = FF_NONE;

	struct {
		types::Color text = {};
		types::Color text_shadow = {};
		types::Color border = {};
	} m_colors = {};

	struct {
		std::vector< std::string > land = {};
		std::vector< std::string > water = {};
	} m_base_names = {};

	faction::bases_render_info_t m_bases_render = {};

	const types::Buffer Serialize() const override;
	void Deserialize( types::Buffer buf ) override;

	WRAPDEFS_PTR( Faction )

private:
	economy_bonuses_t m_economy_bonuses;
	identity_t m_identity = {};
	std::vector< std::string > m_starting_technologies;

};

}
}
}
