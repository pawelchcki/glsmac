#include "FacilityDef.h"
#include "ProductionCost.h"
#include "game/backend/Game.h"
#include "game/backend/State.h"
#include "game/backend/Player.h"
#include "game/backend/faction/Faction.h"
#include <limits>
#include <stdexcept>

namespace game {
namespace backend {
namespace base {

FacilityDef::FacilityDef(
	const std::string& id,
	const std::string& name,
	const std::string& description,
	const size_t cost,
	const RenderInfo& render_info,
	const int64_t cost_rows
)
	: m_id( id )
	, m_name( name )
	, m_description( description )
	, m_cost( cost )
	, m_cost_rows( cost_rows )
	, m_render_info( render_info ) {
	//
}

int64_t FacilityDef::GetMineralCost( const Game* game, const Player* player ) const {
	const uint64_t declared = m_cost;
	if ( declared > uint64_t( std::numeric_limits< int64_t >::max() ) ) { return 0; }
	const auto fallback = int64_t( declared );
	return DeclaredMineralCost( game, player, fallback, m_cost_rows );
}

bool HasDeclaredMineralCost( const Game* game, const Player* player, const int64_t rows ) {
	if ( !game || !game->GetState() || !player || rows <= 0 ) { return false; }
	const auto role = player->GetRole();
	if ( role != Player::PR_SINGLE && role != Player::PR_HOST && role != Player::PR_PLAYER ) { return false; }
	const auto& map = game->GetState()->m_settings.global.map;
	return settings::MapSettings::IsKnownSizeKind( map.GetRuleSizeKind() );
}

int64_t DeclaredMineralCost( const Game* game, const Player* player, const int64_t fallback, const int64_t rows ) {
	if ( !HasDeclaredMineralCost( game, player, rows ) ) { return fallback; }
	const auto& settings = game->GetState()->m_settings.global;
	// Initial faction ratings are source data; later social policy effects remain
	// outside this bounded no-base factor. Item rows are declared separately.
	const auto* faction = player->GetFaction();
	const auto factor = HumanMineralFactor( settings.map.GetRuleSizeKind(), int( settings.rules.GetMineralCostFactor() ), faction ? faction->m_industry : 0 );
	if ( factor > 0 && rows > std::numeric_limits< int64_t >::max() / factor ) {
		throw std::overflow_error( "Declared mineral price overflow" );
	}
	return rows * factor;
}

const std::string FacilityDef::ToString( const std::string& prefix ) const {
	return (std::string)
		TS_OBJ_BEGIN( "PopDef" ) +
		TS_OBJ_PROP_STR( "id", m_id ) +
		TS_OBJ_PROP_STR( "name", m_name ) +
		TS_OBJ_PROP_STR( "description", m_description ) +
		TS_OBJ_PROP_NUM( "cost", m_cost ) +
		TS_OBJ_PROP_NUM( "cost_rows", m_cost_rows ) +
		TS_OBJ_BEGIN( "render" ) +
		m_render_info.ToString( prefix ) +
		TS_OBJ_END() +
		TS_OBJ_END();
}

const types::Buffer FacilityDef::Serialize( const FacilityDef* def ) {
	types::Buffer buf;
	buf.WriteString( def->m_id );
	buf.WriteString( def->m_name );
	buf.WriteString( def->m_description );
	buf.WriteInt( def->m_cost );
	def->m_render_info.Write( buf );
	buf.WriteInt( def->m_cost_rows );
	return buf;
}

FacilityDef* FacilityDef::Deserialize( types::Buffer& buf ) {
	const auto id = buf.ReadString();
	const auto name = buf.ReadString();
	const auto description = buf.ReadString();
	const auto cost = buf.ReadInt();
	if ( cost < 0 ) { THROW( "negative facility snapshot cost" ); }
	const auto r = RenderInfo::FromBuffer( buf );
	const auto rows = buf.ReadInt();
	if ( rows < 0 || rows > std::numeric_limits< int64_t >::max() / 10 ) { THROW( "invalid facility row cost" ); }
	return new FacilityDef( id, name, description, cost, r, rows );
}

}
}
}
