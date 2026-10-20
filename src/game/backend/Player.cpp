#include "Player.h"

#include "game/backend/faction/Faction.h"
#include "game/backend/slot/Slot.h"
#include "game/backend/State.h"
#include "game/backend/slot/Slots.h"

#include "gse/value/String.h"
#include "gse/value/Bool.h"
#include "gse/value/Array.h"
#include <algorithm>
#include <memory>
#include <limits>
#include <stdexcept>

#include "engine/Engine.h"
#include "Game.h"

#include "game/backend/base/BaseManager.h"
#include "game/backend/base/Base.h"
#include "game/backend/base/FacilityDef.h"
#include "game/backend/base/ProductionCost.h"
#include "game/backend/base/production/Facility.h"
#include "game/backend/base/production/Custom.h"
#include "game/backend/base/production/Unit.h"
#include "game/backend/unit/UnitManager.h"
#include "game/backend/unit/StaticDef.h"

namespace game {
namespace backend {

Player::Player( types::Buffer buf ) {
	Player::Deserialize( buf );
}

Player::Player(
	const std::string& name,
	const role_t role,
	faction::Faction* faction,
	const std::string& difficulty_level
)
	: m_name( name )
	, m_role( role )
	, m_faction( faction )
	, m_difficulty_level( difficulty_level ) {}

Player::Player( const Player* const other )
	: m_is_connected( other->m_is_connected )
	, m_name( other->m_name )
	, m_role( other->m_role )
	, m_slot( other->m_slot )
	, m_slotnum( other->m_slotnum )
	, m_faction( other->m_faction )
	, m_difficulty_level( other->m_difficulty_level )
	, m_is_turn_completed( other->m_is_turn_completed ) {
	// Notification copies borrow their slot/faction context, but own every
	// production payload. Avoid Serializable assignment followed by memberwise
	// copying, which discarded decoded payloads and aliased the source pointers.
	std::map< std::string, std::unique_ptr< const base::production::Production > > choices;
	for ( const auto& choice : other->m_production_choices ) {
		types::Buffer bytes;
		choice.second->Serialize( bytes );
		auto copy = std::unique_ptr< const base::production::Production >( base::production::Production::Deserialize( bytes ) );
		if ( bytes.lenr != bytes.lenw ) { THROW( "incomplete production choice copy" ); }
		choices.emplace( choice.first, std::move( copy ) );
	}
	// Keep staged ownership until every destination map allocation succeeds.
	for ( const auto& choice : choices ) { m_production_choices.emplace( choice.first, choice.second.get() ); }
	for ( auto& choice : choices ) { choice.second.release(); }
}

Player::~Player() {
	for ( const auto& it : m_production_choices ) {
		delete it.second;
	}
}

const std::string& Player::GetPlayerName() const {
	return m_name;
}

const std::string Player::GetFullName() const {
	return GetPlayerName() + " (" + m_faction->m_name + ")";
}

void Player::Connect() {
	ASSERT( !m_is_connected, "player already connected" );
	m_is_connected = true;
}

void Player::Disconnect() {
	ASSERT( m_is_connected, "player not connected" );
	m_is_connected = false;
}

const bool Player::IsConnected() const {
	return m_is_connected;
}

void Player::SetFaction( faction::Faction* faction ) {
	// TODO: validate?
	m_faction = faction;
}

void Player::ClearFaction() {
	m_faction = nullptr;
}

faction::Faction* Player::GetFaction() const {
	return m_faction;
}

void Player::SetDifficultyLevel( const std::string& difficulty_level ) {
	// TODO: validate?
	m_difficulty_level = difficulty_level;
}

const std::string& Player::GetDifficultyLevel() const {
	return m_difficulty_level;
}

void Player::SetSlot( slot::Slot* slot ) {
	m_slot = slot;
	if ( m_slot ) {
		m_slotnum = m_slot->GetIndex();
	}
}

slot::Slot* Player::GetSlot() const {
	return m_slot;
}

const Player::role_t Player::GetRole() const {
	return m_role;
}

const bool Player::IsTurnCompleted() const {
	return m_is_turn_completed;
}

void Player::CompleteTurn() {
	m_is_turn_completed = true;
}

void Player::UncompleteTurn() {
	m_is_turn_completed = false;
}

void Player::AddProductionChoice( GSE_CALLABLE, const std::string& id, const gse::value::object_properties_t& data ) {
	if ( id.empty() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Production choice id is empty" ); }
	if ( m_production_choices.find( id ) != m_production_choices.end() ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Production choice '" + id + "' is already defined" );
	}
	const auto& type_it = data.find( "type" );
	if ( type_it == data.end() || type_it->second->type != gse::VT_STRING ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Production choice data - type is not specified or is not a string" );
	}
	const auto& type = ((gse::value::String*)type_it->second)->value;
	base::production::Production* production = nullptr;
	if ( type == "facility" ) {
		const auto& facility_id_it = data.find( "id" );
		if ( facility_id_it == data.end() || facility_id_it->second->type != gse::VT_STRING ) {
			GSE_ERROR( gse::EC.GAME_ERROR, "Production choice data - facility id is not specified or is not string" );
		}
		const auto& facility_id = ((gse::value::String*)facility_id_it->second)->value;
		const auto* const facility = GetGame()->GetBM()->GetFacilityDef( facility_id );
		if ( !facility ) {
			GSE_ERROR( gse::EC.GAME_ERROR, "Production choice data - facility id not found: " + facility_id );
		}
		production = new base::production::Facility( facility );
	}
	else if ( type == "unit" ) {
		const auto id_it = data.find( "id" );
		if ( id_it == data.end() || id_it->second->type != gse::VT_STRING ) { GSE_ERROR( gse::EC.GAME_ERROR, "Unit production needs a definition id" ); }
		const auto& unit_id = static_cast< gse::value::String* >( id_it->second )->value;
		const auto* um = GetGame()->GetUM();
		const auto* def = um ? um->GetUnitDef( unit_id ) : nullptr;
		if ( !def || unit_id != "ColonyPod" || def->m_type != unit::DT_STATIC || def->GetMovementType() != unit::MT_LAND ) { GSE_ERROR( gse::EC.GAME_ERROR, "Only a defined static land Colony Pod is supported" ); }
		const auto integer = [ & ]( const std::string& key ) {
			const auto it = data.find( key );
			if ( it == data.end() || it->second->type != gse::VT_INT ) { GSE_ERROR( gse::EC.GAME_ERROR, "Unit production needs integer " + key ); }
			return static_cast< gse::value::Int* >( it->second )->value;
		};
		const auto cost = integer( "cost" ); const auto rows = integer( "cost_rows" ); const auto population = integer( "population_cost" );
		if ( cost <= 0 || rows <= 0 || rows > std::numeric_limits< int64_t >::max() / 10 || population != 1 ) { GSE_ERROR( gse::EC.GAME_ERROR, "Invalid colony production recipe" ); }
		production = new base::production::Unit( unit_id, cost, rows, population );
	}
	else if ( type == "custom" ) {
		const auto& render_it = data.find( "render" );
		if ( render_it == data.end() || render_it->second->type != gse::VT_OBJECT ) {
			GSE_ERROR( gse::EC.GAME_ERROR, "Production choice data - render is not specified or is not object" );
		}
		const auto& render = ((gse::value::Object*)render_it->second)->value;
		const auto r = base::RenderInfo::FromValue( GSE_CALL, render );
		production = new base::production::Custom( r );
	}
	else {
		GSE_ERROR( gse::EC.GAME_ERROR, "Unknown production choice type: " + type );
	}
	m_production_choices.insert({ id, production });
}

Game* Player::GetGame() const {
	// A slotted player belongs to its State's receiving Game. Lobby players
	// without a game retain the existing application's wrapper context.
	if ( m_slot && m_slot->GetGame() ) { return m_slot->GetGame(); }
	return g_engine->GetGame();
}

const base::production::Production* Player::GetProductionChoice( const std::string& id ) const {
	const auto it = m_production_choices.find( id );
	return it == m_production_choices.end() ? nullptr : it->second;
}

gse::value::Array* Player::GetProductionChoices( GSE_CALLABLE ) const {
	gse::value::array_elements_t choices;
	std::vector< std::string > ids;
	for ( const auto& choice : m_production_choices ) { ids.push_back( choice.first ); }
	std::sort( ids.begin(), ids.end() );
	const auto* bm = GetGame()->GetBM();
	for ( const auto& id : ids ) {
		const auto* choice = m_production_choices.at( id );
		if ( choice->GetType() == base::production::Production::PT_UNIT ) {
			const auto* recipe = static_cast< const base::production::Unit* >( choice );
			const auto* um = GetGame()->GetUM();
			const auto* def = um ? um->GetUnitDef( recipe->unit_id ) : nullptr;
			if ( !def || def->m_type != unit::DT_STATIC || def->GetMovementType() != unit::MT_LAND ) { continue; }
			choices.push_back( VALUEEXT( gse::value::Object, GSE_CALL, {
				{ "id", VALUE( gse::value::String,, id ) }, { "type", VALUE( gse::value::String,, "unit" ) },
				{ "unit_id", VALUE( gse::value::String,, recipe->unit_id ) }, { "name", VALUE( gse::value::String,, def->m_name ) },
				{ "description", VALUE( gse::value::String,, "" ) }, { "cost", VALUE( gse::value::Int,, recipe->GetMineralCost( GetGame(), this ) ) },
				{ "population_cost", VALUE( gse::value::Int,, recipe->population_cost ) },
			} ) );
			continue;
		}
		if ( choice->GetType() != base::production::Production::PT_FACILITY || !bm ) { continue; }
		const auto& facility_id = static_cast< const base::production::Facility* >( choice )->GetFacilityId();
		const auto* def = bm->GetFacilityDef( facility_id );
		if ( !def ) { continue; }
		const auto cost = def->GetMineralCost( GetGame(), this );
		if ( cost <= 0 && !base::HasDeclaredMineralCost( GetGame(), this, def->m_cost_rows ) ) { continue; }
		choices.push_back( VALUEEXT( gse::value::Object, GSE_CALL, {
			{ "id", VALUE( gse::value::String,, id ) },
			{ "type", VALUE( gse::value::String,, "facility" ) },
			{ "facility_id", VALUE( gse::value::String,, facility_id ) },
			{ "name", VALUE( gse::value::String,, def->m_name ) },
			{ "description", VALUE( gse::value::String,, def->m_description ) },
			{ "cost", VALUE( gse::value::Int,, cost ) },
		} ) );
	}
	return VALUE( gse::value::Array,, choices );
}

void Player::RemoveProductionChoice( GSE_CALLABLE, const std::string& id ) {
	const auto it = m_production_choices.find( id );
	if ( it == m_production_choices.end() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Unknown production choice: " + id ); }
	if ( const auto* bm = GetGame()->GetBM() ) {
		for ( const auto& base : bm->GetBases() ) {
			if ( base.second->m_owner == m_slot && base.second->GetProductionState().choice_id == id ) {
				GSE_ERROR( gse::EC.GAME_ERROR, "Production choice is active at a base" );
			}
		}
	}
	delete it->second;
	m_production_choices.erase( it );
}

WRAPIMPL_BEGIN( Player )
	auto* const game = GetGame();
	WRAPIMPL_PROPS
			{
				"id",
				VALUE( gse::value::Int, , m_slotnum )
			},
			{
				"type",
				VALUE( gse::value::String, , "human" )
			},
			{
				"name",
				VALUE( gse::value::String, , m_name )
			},
			{
				"is_ready",
				NATIVE_CALL( this ) {
					N_EXPECT_ARGS( 0 );
					return VALUE( gse::value::Bool, , m_slot->HasPlayerFlag( ::game::backend::slot::PF_READY ) );
				} )
			},
			{
				"set_ready",
				NATIVE_CALL( this, game ) {

					game->CheckRW( GSE_CALL );

					N_EXPECT_ARGS( 1 );
					N_GETVALUE( isready, 0, Bool );

					if ( isready ) {
						m_slot->SetPlayerFlag( ::game::backend::slot::PF_READY );
					}
					else {
						m_slot->UnsetPlayerFlag( ::game::backend::slot::PF_READY );
					}

					return VALUE( gse::value::Undefined );
				} )
			},
			{
				"get_faction",
				NATIVE_CALL( this ) {
					N_EXPECT_ARGS( 0 );
					return m_faction
						? m_faction->Wrap( GSE_CALL )
						: VALUE( gse::value::Undefined );
				} )
			},
			{
				"set_faction_by_id",
				NATIVE_CALL( this, game ) {

					game->CheckRW( GSE_CALL );

					N_EXPECT_ARGS( 1 );
					N_GETVALUE( faction_id, 0, String );
					if ( game->IsStarted() ) {
						GSE_ERROR( gse::EC.GAME_ERROR, "Can't change faction after game is started" );
					}
					auto* faction = game->GetFaction( faction_id );
					if ( !faction ) {
						GSE_ERROR( gse::EC.GAME_ERROR, "Faction not found: " + faction_id );
					}
					m_faction = faction;

					return VALUE( gse::value::Undefined );
				} )
			},
			{
				"unset_faction",
				NATIVE_CALL( this, game ) {

					game->CheckRW( GSE_CALL );

					N_EXPECT_ARGS( 0 );
					m_faction = nullptr;

					return VALUE( gse::value::Undefined );
				} )
			},
			{
				"is_master",
				VALUE( gse::value::Bool, , m_role == PR_SINGLE || m_role == PR_HOST )
			},
			{
				"add_production_choice",
				NATIVE_CALL( this, game ) {

					game->CheckRW( GSE_CALL );

					N_EXPECT_ARGS( 2 );
					N_GETVALUE( id, 0, String );
					N_GETVALUE( data, 1, Object );

					AddProductionChoice( GSE_CALL, id, data );

					return VALUE( gse::value::Undefined );
				} )
			},
			{
				"get_production_choices",
				NATIVE_CALL( this ) {
					N_EXPECT_ARGS( 0 );
					try { return GetProductionChoices( GSE_CALL ); }
					catch ( const std::overflow_error& error ) { GSE_ERROR( gse::EC.GAME_ERROR, error.what() ); }
				} )
			},
			{
				"remove_production_choice",
				NATIVE_CALL( this, game ) {

					game->CheckRW( GSE_CALL );
					N_EXPECT_ARGS( 1 );
					N_GETVALUE( id, 0, String );
					RemoveProductionChoice( GSE_CALL, id );

					return VALUE( gse::value::Undefined );
				} )
			},
		};
WRAPIMPL_END_PTR()

UNWRAPIMPL_PTR( Player )

const types::Buffer Player::Serialize() const {
	types::Buffer buf;

	buf.WriteString( m_name );
	buf.WriteInt( m_role );
	buf.WriteBool( m_faction != nullptr );
	if ( m_faction ) {
		buf.WriteString( m_faction->Serialize().ToString() );
	}
	buf.WriteString( m_difficulty_level );

	buf.WriteInt( m_production_choices.size() );
	std::vector< std::string > ids;
	for ( const auto& choice : m_production_choices ) { ids.push_back( choice.first ); }
	std::sort( ids.begin(), ids.end() );
	for ( const auto& id : ids ) {
		buf.WriteString( id );
		m_production_choices.at( id )->Serialize( buf );
	}

	return buf;
}

void Player::Deserialize( types::Buffer buf ) {

	m_name = buf.ReadString();
	m_role = (role_t)buf.ReadInt();
	m_faction = {};
	if ( buf.ReadBool() ) {
		m_faction = new faction::Faction();
		m_faction->Deserialize( buf.ReadString() );
	}
	m_difficulty_level = buf.ReadString();

	ASSERT( m_production_choices.empty(), "production choices not empty" );
	const auto sz = buf.ReadInt();
	if ( sz < 0 || uint64_t( sz ) > ( buf.lenw - buf.lenr ) / 6 ) { THROW( "invalid production choice count" ); }
	std::map< std::string, std::unique_ptr< const base::production::Production > > choices;
	for ( int64_t i = 0 ; i < sz ; i++ ) {
		const auto id = buf.ReadString();
		if ( id.empty() || choices.count( id ) ) { THROW( "invalid or duplicate production choice id" ); }
		choices.emplace( id, base::production::Production::Deserialize( buf ) );
	}
	if ( buf.lenr != buf.lenw ) { THROW( "trailing player snapshot data" ); }
	for ( auto& choice : choices ) { m_production_choices.emplace( choice.first, choice.second.release() ); }

}

WRAPIMPL_SERIALIZE( Player )
	buf->WriteInt( obj->m_slotnum );
}

WRAPIMPL_DESERIALIZE( Player )
	const auto slot_num = buf->ReadInt();
	const auto& player = game->GetState()->m_slots->GetSlot( slot_num ).GetPlayer();
	return player->Wrap( GSE_CALL );
}

}
}
