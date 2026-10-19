#include "Base.h"

#include "gse/context/Context.h"
#include "gse/value/Object.h"
#include "gse/value/Int.h"
#include "gse/value/String.h"
#include "gse/value/Undefined.h"
#include "gse/value/Array.h"
#include "gse/value/Bool.h"
#include "gse/callable/Native.h"
#include "game/backend/Game.h"
#include "game/backend/State.h"
#include "game/backend/slot/Slot.h"
#include "game/backend/slot/Slots.h"
#include "game/backend/map/Map.h"
#include "game/backend/map/tile/Tile.h"
#include "game/backend/faction/Faction.h"
#include "game/backend/base/BaseManager.h"
#include "Pop.h"
#include "PopDef.h"
#include "FacilityDef.h"
#include "NutrientCost.h"
#include "ProductionSwitchCost.h"
#include "ProductionCost.h"
#include "game/backend/Random.h"
#include "game/backend/resource/ResourceManager.h"
#include "game/backend/Player.h"
#include "production/Facility.h"
#include "production/Unit.h"
#include "game/backend/unit/Unit.h"
#include "game/backend/unit/UnitManager.h"
#include "game/backend/unit/StaticDef.h"
#include <limits>
#include <memory>
#include <set>
#include <stdexcept>

namespace game {
namespace backend {
namespace base {

static size_t next_id = 1;
const size_t Base::GetNextId() {
	return next_id;
}
const void Base::SetNextId( const size_t id ) {
	next_id = id;
}

Base::Base(
	Game* game,
	const size_t id,
	slot::Slot* owner,
	faction::Faction* faction,
	map::tile::Tile* tile,
	const std::string& name,
	const facilities_t& facilities,
	const pops_t& pops,
	const size_t next_pop_id,
	const bool attach_tile
)
	: MapObject( game->GetMap(), tile )
	, m_game( game )
	, m_id( id )
	, m_owner( owner )
	, m_faction( faction )
	, m_name( name )
	, m_facilities( facilities )
	, m_pops( pops )
	, m_next_pop_id( next_pop_id ) {
	if ( next_id <= id ) {
		next_id = id + 1;
	}
	if ( attach_tile ) {
		ASSERT( !tile->base, "tile already has base" );
		tile->base = this;
	}
	m_tile = tile;
	for ( auto& it : m_pops ) {
		it.second.SetBase( this );
	}
}

const Game* const Base::GetGame() const {
	return m_game;
}

static const FacilityDef* ResolveProduction( Game* game, slot::Slot* owner, const std::string& id ) {
	const auto* choice = owner->GetPlayer()->GetProductionChoice( id );
	if ( !choice || choice->GetType() != production::Production::PT_FACILITY ) { return nullptr; }
	const auto* def = game->GetBM()->GetFacilityDef( static_cast< const production::Facility* >( choice )->GetFacilityId() );
	return def && ( def->GetMineralCost( game, owner->GetPlayer() ) > 0 || HasDeclaredMineralCost( game, owner->GetPlayer(), def->m_cost_rows ) ) ? def : nullptr;
}

static const production::Unit* ResolveUnitProduction( Game* game, slot::Slot* owner, const std::string& id ) {
	const auto* choice = owner->GetPlayer()->GetProductionChoice( id );
	if ( !choice || choice->GetType() != production::Production::PT_UNIT ) { return nullptr; }
	const auto* recipe = static_cast< const production::Unit* >( choice );
	const auto* def = game->GetUM() ? game->GetUM()->GetUnitDef( recipe->unit_id ) : nullptr;
	// Resolve the live price even for a same-project preview, so overflow is
	// rejected consistently before selection or production state can change.
	return def && def->m_type == unit::DT_STATIC && def->GetMovementType() == unit::MT_LAND && recipe->GetMineralCost( game, owner->GetPlayer() ) >= 0 ? recipe : nullptr;
}

static gse::value::Object* WrapProduction( GSE_CALLABLE, const ProductionState& state ) {
	return VALUEEXT( gse::value::Object, GSE_CALL, {
		{ "choice_id", VALUE( gse::value::String,, state.choice_id ) },
		{ "minerals", VALUE( gse::value::Int,, state.minerals ) },
		{ "last_processed_turn", VALUE( gse::value::Int,, state.last_processed_turn ) },
	} );
}

void Base::ProductionChanged() {
	m_game->GetBM()->RefreshBase( this );
	TriggerUpdate();
}

static bool SameProduction( const FacilityDef* previous_def, const production::Unit* previous_recipe, const FacilityDef* def, const production::Unit* recipe ) {
	return ( previous_def && def && previous_def->m_id == def->m_id ) ||
		( previous_recipe && recipe && previous_recipe->unit_id == recipe->unit_id );
}

int64_t Base::GetProductionSwitchLoss( GSE_CALLABLE, const std::string& choice_id ) const {
	const auto* def = ResolveProduction( m_game, m_owner, choice_id );
	const auto* recipe = ResolveUnitProduction( m_game, m_owner, choice_id );
	if ( !def && !recipe ) { GSE_ERROR( gse::EC.GAME_ERROR, "Unknown or unsupported production choice: " + choice_id ); }
	if ( def && m_facilities.count( def->m_id ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Facility is already installed" ); }
	if ( m_production.choice_id.empty() ) { return 0; }
	const auto* previous_def = ResolveProduction( m_game, m_owner, m_production.choice_id );
	const auto* previous_recipe = ResolveUnitProduction( m_game, m_owner, m_production.choice_id );
	if ( SameProduction( previous_def, previous_recipe, def, recipe ) ) { return 0; }
	const auto role = m_owner->GetPlayer()->GetRole();
	const auto supported_item = []( const FacilityDef* facility, const production::Unit* unit ) {
		return ( facility && facility->m_id == "RECYCLING_TANKS" ) || ( unit && unit->unit_id == "ColonyPod" );
	};
	// This application models only these declared basic items and human rules.
	// Installed Headquarters is ordinary application state, not new original
	// evidence. Other categories and Skunkworks require separate contracts.
	if ( ( role != Player::PR_SINGLE && role != Player::PR_HOST && role != Player::PR_PLAYER ) ||
		m_facilities.count( "SKUNKWORKS" ) || !supported_item( previous_def, previous_recipe ) || !supported_item( def, recipe ) ||
		m_production.minerals < 0 || m_production.minerals > 1000000 ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Production switching is unsupported for this context" );
	}
	const auto valid_cost = [ & ]( const FacilityDef* facility, const production::Unit* unit ) {
		const auto cost = unit ? unit->GetMineralCost( m_game, m_owner->GetPlayer() ) : facility->GetMineralCost( m_game, m_owner->GetPlayer() );
		return cost >= 0 && cost <= 1000000;
	};
	if ( !valid_cost( previous_def, previous_recipe ) || !valid_cost( def, recipe ) ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Production switching is unsupported for this project cost" );
	}
	// The recorded basic-item arithmetic depends only on equality, not which
	// differing basic item is chosen. Representative basic codes keep application
	// definition IDs separate from original fixture table indices.
	return BasicProductionSwitchLoss( previous_def ? -1 : 0, def ? -1 : 0, int( m_production.minerals ) );
}

ProductionState Base::SelectProduction( GSE_CALLABLE, const std::string& choice_id ) {
	m_game->CheckRW( GSE_CALL );
	const auto lost = GetProductionSwitchLoss( GSE_CALL, choice_id );
	const auto* def = ResolveProduction( m_game, m_owner, choice_id );
	const auto* recipe = ResolveUnitProduction( m_game, m_owner, choice_id );
	const auto previous = m_production;
	if ( SameProduction( ResolveProduction( m_game, m_owner, m_production.choice_id ), ResolveUnitProduction( m_game, m_owner, m_production.choice_id ), def, recipe ) ) { return previous; }
	m_production.choice_id = choice_id;
	m_production.minerals -= lost;
	m_production.last_processed_turn = m_game->GetTurnId();
	m_unit_production.reset();
	ProductionChanged();
	return previous;
}

Base::ProductionResult Base::ProcessProduction( GSE_CALLABLE, const int64_t turn, const int64_t minerals ) {
	m_game->CheckRW( GSE_CALL );
	if ( turn <= 0 || uint64_t( turn ) != m_game->GetTurnId() || turn <= m_production.last_processed_turn || minerals < 0 ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Invalid or already processed production turn or mineral credit" );
	}
	ProductionResult result { m_production, "" };
	auto next = m_production;
	next.last_processed_turn = turn;
	const FacilityDef* def = nullptr;
	if ( !next.choice_id.empty() ) {
		def = ResolveProduction( m_game, m_owner, next.choice_id );
		const auto* recipe = ResolveUnitProduction( m_game, m_owner, next.choice_id );
		if ( ( !def && !recipe ) || ( def && m_facilities.count( def->m_id ) ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Production choice is unavailable or already installed" ); }
		if ( minerals > std::numeric_limits< int64_t >::max() - next.minerals ) { GSE_ERROR( gse::EC.GAME_ERROR, "Production mineral credit overflow" ); }
		next.minerals += minerals;
		const auto cost = recipe ? recipe->GetMineralCost( m_game, m_owner->GetPlayer() ) : def->GetMineralCost( m_game, m_owner->GetPlayer() );
		if ( next.minerals >= cost ) {
			if ( recipe ) {
				// Size-one abandonment is not implemented. Keep the credited project
				// until another citizen exists; this is explicit application policy.
				if ( m_pops.size() > size_t( recipe->population_cost ) ) {
					next.minerals -= cost; next.choice_id.clear();
					return CompleteUnitProduction( GSE_CALL, next );
				}
			} else {
			next.minerals -= cost;
			next.choice_id.clear();
			result.added_facility = def->m_id;
			}
		}
	}
	// All validation and arithmetic complete before either state is changed.
	if ( !result.added_facility.empty() ) { m_facilities.emplace( def->m_id, def ); }
	m_production = std::move( next );
	m_unit_production.reset();
	ProductionChanged();
	return result;
}

void Base::RestoreProduction( GSE_CALLABLE, const ProductionState& previous, const std::string& added_facility ) {
	m_game->CheckRW( GSE_CALL );
	if ( previous.minerals < 0 || previous.last_processed_turn < 0 || uint64_t( previous.last_processed_turn ) > m_game->GetTurnId() ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Invalid production restore state" );
	}
	const auto* def = previous.choice_id.empty() ? nullptr : ResolveProduction( m_game, m_owner, previous.choice_id );
	const auto* recipe = previous.choice_id.empty() ? nullptr : ResolveUnitProduction( m_game, m_owner, previous.choice_id );
	if ( !previous.choice_id.empty() && !def && !recipe ) { GSE_ERROR( gse::EC.GAME_ERROR, "Unknown production restore choice" ); }
	if ( !added_facility.empty() ) {
		if ( !def || def->m_id != added_facility || !m_production.choice_id.empty() || !m_facilities.count( added_facility ) ) {
			GSE_ERROR( gse::EC.GAME_ERROR, "Production rollback facility does not match the previous project" );
		}
	} else if ( def && m_facilities.count( def->m_id ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Restored production facility is already installed" ); }
	if ( previous == m_production && added_facility.empty() ) { return; }
	if ( !added_facility.empty() ) { m_facilities.erase( added_facility ); }
	m_production = previous;
	m_unit_production.reset();
	ProductionChanged();
}

Pop* const Base::AddPop( const Pop& pop ) {
	ASSERT( m_pops.find( pop.m_id ) == m_pops.end(), "pop already exists" );
	m_pops.insert_or_assign( pop.m_id, pop );
	m_game->GetBM()->RefreshBase( this );
	TriggerUpdate();
	return &m_pops.at( pop.m_id );
}

void Base::ClearWorkedTiles() {
	for ( auto& entry : m_pops ) {
		auto& pop = entry.second;
		auto* value = pop.CustomGet( "worked_tile" );
		if ( value && value->type == gse::VT_OBJECT && static_cast< gse::value::Object* >( value )->object_class == "Tile" ) {
			auto* tile = map::tile::Tile::Unwrap( value );
			auto* assignment = tile->CustomGet( "working_pop" );
			if ( assignment && assignment->type == gse::VT_OBJECT && static_cast< gse::value::Object* >( assignment )->wrapobj == &pop ) { tile->CustomUnset( "working_pop" ); }
		}
		pop.CustomUnset( "worked_tile" );
	}
	m_worked_tiles.clear();
}

void Base::RemovePop( const size_t pop_id ) {
	ASSERT( m_pops.find( pop_id ) != m_pops.end(), "pop id not found" );
	m_pops.erase( pop_id );
	m_game->GetBM()->RefreshBase( this );
	TriggerUpdate();
}

void Base::ChangePopType( GSE_CALLABLE, const size_t pop_id, const std::string& def_id ) {
	ASSERT( m_pops.find( pop_id ) != m_pops.end(), "pop id " + std::to_string( pop_id ) + " not found" );
	auto& pop = m_pops.at( pop_id );
	const auto& defs = m_game->GetBM()->GetBasePopDefs();
	const auto& it = defs.find( def_id );
	if ( it == defs.end() ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Unknown pop type: " + def_id );
	}
	if ( pop.m_def != it->second ) {
		pop.m_def = it->second;
		TriggerUpdate();
	}
}

const types::Buffer Base::Serialize( const Base* base ) {
	types::Buffer buf;
	buf.WriteInt( base->m_id );
	buf.WriteInt( base->m_owner->GetIndex() );
	buf.WriteString( base->m_faction->m_id );
	buf.WriteInt( base->m_tile->coord.x );
	buf.WriteInt( base->m_tile->coord.y );
	buf.WriteString( base->m_name );
	buf.WriteInt( base->m_facilities.size() );
	for ( const auto& it : base->m_facilities ) {
		buf.WriteString( it.first );
	}
	buf.WriteInt( base->m_pops.size() );
	for ( const auto& it : base->m_pops ) {
		buf.WriteInt( it.first );
		it.second.Serialize( buf );
	}
	buf.WriteInt( base->m_next_pop_id );
	base->m_production.Serialize( buf );
	buf.WriteString( "GLSMAC_BASE_WORK_V1" );
	auto* nutrients = const_cast< Base* >( base )->CustomGet( "accumulated_nutrients" );
	if ( nutrients && ( nutrients->type != gse::VT_INT || ( (gse::value::Int*)nutrients )->value < 0 ) ) { THROW( "invalid stored base nutrients" ); }
	buf.WriteBool( nutrients != nullptr );
	if ( nutrients ) { buf.WriteInt( ( (gse::value::Int*)nutrients )->value ); }
	std::map< size_t, map::tile::Tile* > work;
	std::unordered_set< map::tile::Tile* > tiles;
	for ( const auto& entry : base->m_pops ) {
		auto* value = const_cast< Pop& >( entry.second ).CustomGet( "worked_tile" );
		if ( !value ) { continue; }
		if ( value->type != gse::VT_OBJECT ) { THROW( "invalid population worked tile" ); }
		auto* object = (gse::value::Object*)value;
		if ( object->object_class != "Tile" || !object->wrapobj ) { THROW( "invalid population worked tile" ); }
		auto* tile = (map::tile::Tile*)object->wrapobj;
		auto* backlink = tile->CustomGet( "working_pop" );
		if ( !( entry.second.m_def->m_flags & PopDef::PF_TILE_WORKER ) || tile == base->m_tile || tile->base ||
			tile->coord.x >= base->m_game->GetMap()->GetWidth() || tile->coord.y >= base->m_game->GetMap()->GetHeight() ||
			base->m_game->GetMap()->GetTile( tile->coord.x, tile->coord.y ) != tile || !tiles.insert( tile ).second ||
			!backlink || backlink->type != gse::VT_OBJECT || ( (gse::value::Object*)backlink )->object_class != "Pop" ||
			( (gse::value::Object*)backlink )->wrapobj != &entry.second ) { THROW( "inconsistent population worker links" ); }
		work.emplace( entry.first, tile );
	}
	if ( tiles != base->m_worked_tiles ) { THROW( "inconsistent base worked tiles" ); }
	buf.WriteInt( work.size() );
	for ( const auto& entry : work ) {
		buf.WriteInt( entry.first ); buf.WriteInt( entry.second->coord.x ); buf.WriteInt( entry.second->coord.y );
	}
	return buf;
}

Base* Base::Deserialize( GSE_CALLABLE, types::Buffer& buf, Game* game, const bool attach ) {
	ASSERT( game, "game is null" );
	const auto id = buf.ReadInt();
	const auto owner = buf.ReadInt();
	if ( id <= 0 || owner < 0 || uint64_t( owner ) >= game->GetState()->m_slots->GetCount() ) { THROW( "invalid base identity or owner" ); }
	auto* slot = &game->GetState()->m_slots->GetSlot( owner );
	if ( slot->GetState() != game::backend::slot::Slot::SS_PLAYER ) { THROW( "invalid base owner slot" ); }
	const auto faction_id = buf.ReadString();
	auto* faction = game->GetFaction( faction_id );
	const auto pos_x = buf.ReadInt();
	const auto pos_y = buf.ReadInt();
	const auto get_tile = [ game ]( int64_t x, int64_t y ) {
		if ( x < 0 || y < 0 || uint64_t( x ) >= game->GetMap()->GetWidth() || uint64_t( y ) >= game->GetMap()->GetHeight() || x % 2 != y % 2 ) { THROW( "invalid base snapshot tile coordinate" ); }
		return game->GetMap()->GetTile( x, y );
	};
	auto* tile = get_tile( pos_x, pos_y );
	const auto name = buf.ReadString();
	facilities_t facilities = {};
	const auto facilities_count = buf.ReadInt();
	if ( facilities_count < 0 || uint64_t( facilities_count ) > ( buf.lenw - buf.lenr ) / 6 ) { THROW( "invalid base facility count" ); }
	if ( facilities_count > 0 ) {
		const auto& bm = game->GetBM();
		for ( size_t i = 0 ; i < facilities_count ; i++ ) {
			const auto facility_id = buf.ReadString();
			const auto* def = bm->GetFacilityDef( facility_id );
			if ( !def ) {
				THROW( "can't deserialize base - facility def not found: " + facility_id );
			}
			facilities.insert({ facility_id, def });
		}
	}
	pops_t pops = {};
	const auto pops_count = buf.ReadInt();
	if ( pops_count < 0 || uint64_t( pops_count ) > ( buf.lenw - buf.lenr ) / 6 ) { THROW( "invalid base population count" ); }
	for ( size_t i = 0 ; i < pops_count ; i++ ) {
		const auto pop_id = buf.ReadInt();
		Pop pop = {};
		pop.Deserialize( buf, game );
		if ( pop_id <= 0 || pop.m_id != uint64_t( pop_id ) || !pops.emplace( pop_id, pop ).second ) { THROW( "invalid duplicate population identity" ); }
	}
	const auto next_pop_id = buf.ReadInt();
	if ( next_pop_id <= 0 || ( !pops.empty() && uint64_t( next_pop_id ) <= pops.rbegin()->first ) ) { THROW( "invalid next population identity" ); }
	const auto production = ProductionState::Deserialize( buf );
	if ( !production.choice_id.empty() ) {
		const auto* def = ResolveProduction( game, slot, production.choice_id );
		if ( ( !def && !ResolveUnitProduction( game, slot, production.choice_id ) ) || ( def && facilities.count( def->m_id ) ) ) { THROW( "invalid or installed base production choice" ); }
	}
	if ( buf.ReadString() != "GLSMAC_BASE_WORK_V1" ) { THROW( "unsupported base work snapshot" ); }
	const auto has_nutrients = buf.ReadBool();
	const auto nutrients = has_nutrients ? buf.ReadInt() : 0;
	if ( nutrients < 0 ) { THROW( "invalid stored base nutrients" ); }
	const auto work_count = buf.ReadInt();
	if ( work_count < 0 || uint64_t( work_count ) > pops.size() ) { THROW( "invalid base worker count" ); }
	std::vector< std::pair< size_t, map::tile::Tile* > > work;
	std::set< size_t > workers;
	for ( int64_t i = 0; i < work_count; ++i ) {
		const auto pop_id = buf.ReadInt();
		const auto x = buf.ReadInt(); const auto y = buf.ReadInt();
		auto it = pops.find( pop_id );
		if ( it == pops.end() || !( it->second.m_def->m_flags & PopDef::PF_TILE_WORKER ) || !workers.insert( pop_id ).second ) { THROW( "invalid base worker population reference" ); }
		work.emplace_back( pop_id, get_tile( x, y ) );
	}
	if ( buf.lenr != buf.lenw ) { THROW( "trailing base snapshot data" ); }
	const auto previous_next_id = GetNextId();
	auto base = std::make_unique< Base >( game, id, slot, faction, tile, name, facilities, pops, next_pop_id, false );
	base->m_production = production;
	base->m_snapshot_work = std::move( work );
	try {
		if ( has_nutrients ) { base->CustomSet( "accumulated_nutrients", VALUE( gse::value::Int,, nutrients ) ); }
		if ( attach ) { AttachSnapshots( GSE_CALL, { base.get() } ); }
	} catch ( ... ) { SetNextId( previous_next_id ); throw; }
	return base.release();
}


void Base::AttachSnapshots( GSE_CALLABLE, const std::vector< Base* >& bases ) {
	std::unordered_set< map::tile::Tile* > centers, claims;
	for ( auto* base : bases ) {
		if ( base->m_tile->base || base->m_tile->CustomHas( "working_pop" ) || !centers.insert( base->m_tile ).second ) { THROW( "base snapshot center is occupied or duplicated" ); }
	}
	struct link_t { map::tile::Tile* tile; Pop* pop; gse::Value* wrapper; };
	std::vector< link_t > links;
	for ( auto* base : bases ) {
		for ( const auto& work : base->m_snapshot_work ) {
			auto* tile = work.second;
			if ( tile->base || centers.count( tile ) || tile->CustomHas( "working_pop" ) || !claims.insert( tile ).second ) { THROW( "base snapshot worker tile is occupied or duplicated" ); }
			auto* pop = &base->m_pops.at( work.first );
			pop->CustomSet( "worked_tile", tile->Wrap( GSE_CALL ) );
			base->m_worked_tiles.insert( tile );
			links.push_back( { tile, pop, pop->Wrap( GSE_CALL ) } );
		}
	}
	try {
		for ( const auto& link : links ) { link.tile->CustomSet( "working_pop", link.wrapper ); }
	} catch ( ... ) {
		for ( const auto& link : links ) { link.tile->CustomUnset( "working_pop" ); }
		throw;
	}
	for ( auto* base : bases ) { base->m_tile->base = base; base->m_snapshot_work.clear(); }
}

WRAPIMPL_SERIALIZE( Base )
	buf->WriteInt( obj->m_id );
}

WRAPIMPL_DESERIALIZE( Base )
	const auto id = buf->ReadInt();
	const auto& base = game->GetBM()->GetBase( id );
	ASSERT( base, "base id not found: " + std::to_string( id ) );
	return base->Wrap( GSE_CALL );
}

WRAPIMPL_DYNAMIC_GETTERS( Base )
	WRAPIMPL_GET_CUSTOM( "id", Int, m_id )
	WRAPIMPL_GET_CUSTOM( "name", String, m_name )
	WRAPIMPL_LINK( "get_owner", m_owner )
	WRAPIMPL_LINK( "get_tile", m_tile )
	WRAPIMPL_CUSTOM_SETTERS
	{
		"get_nutrient_factor", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 0 );
			const auto* state = m_game->GetState();
			const auto* player = m_owner->GetPlayer();
			if ( !state || !player ) { return VALUE( gse::value::Undefined ); }
			const auto role = player->GetRole();
			if ( role != Player::PR_SINGLE && role != Player::PR_HOST && role != Player::PR_PLAYER ) { return VALUE( gse::value::Undefined ); }
			const auto& map = state->m_settings.global.map;
			if ( !map.HasKnownSizeKind() ) { return VALUE( gse::value::Undefined ); }
			// Model only the recorded human/no-base factor at GROWTH0. The
			// installed multiplier is typed rules state; growth rows are script policy.
			return VALUE( gse::value::Int,, HumanNutrientFactor( map.preset_level, int( state->m_settings.global.rules.GetNutrientCostFactor() ), 0 ) );
		} )
	},
	{
		"get_production", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 0 );
			return WrapProduction( GSE_CALL, m_production );
		} )
	},
	{
		"get_production_switch_loss", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 1 ); N_GETVALUE( choice, 0, String );
			try { return VALUE( gse::value::Int,, GetProductionSwitchLoss( GSE_CALL, choice ) ); }
			catch ( const std::overflow_error& error ) { GSE_ERROR( gse::EC.GAME_ERROR, error.what() ); }
		} )
	},
	{
		"select_production", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 1 ); N_GETVALUE( choice, 0, String );
			try { return WrapProduction( GSE_CALL, SelectProduction( GSE_CALL, choice ) ); }
			catch ( const std::overflow_error& error ) { GSE_ERROR( gse::EC.GAME_ERROR, error.what() ); }
		} )
	},
	{
		"process_production", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 2 ); N_GETVALUE( turn, 0, Int ); N_GETVALUE( minerals, 1, Int );
			ProductionResult result;
			try { result = ProcessProduction( GSE_CALL, turn, minerals ); }
			catch ( const std::overflow_error& error ) { GSE_ERROR( gse::EC.GAME_ERROR, error.what() ); }
			auto* object = VALUEEXT( gse::value::Object, GSE_CALL, {
				{ "previous", WrapProduction( GSE_CALL, result.previous ) },
				{ "added_facility", VALUE( gse::value::String,, result.added_facility ) },
			} );
			if ( result.unit_receipt ) { object->Set( "unit_receipt", VALUE( gse::value::Int,, result.unit_receipt ), GSE_CALL ); }
			return object;
		} )
	},
	{
		"rollback_unit_production", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 1 ); N_GETVALUE( receipt, 0, Int );
			RollbackUnitProduction( GSE_CALL, receipt );
			return VALUE( gse::value::Undefined );
		} )
	},
	{
		"restore_production", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 2 ); N_GETVALUE( data, 0, Object ); N_GETVALUE( added, 1, String );
			N_GETPROP( choice, data, "choice_id", String );
			N_GETPROP( minerals, data, "minerals", Int );
			N_GETPROP( turn, data, "last_processed_turn", Int );
			try { RestoreProduction( GSE_CALL, { choice, minerals, turn }, added ); }
			catch ( const std::overflow_error& error ) { GSE_ERROR( gse::EC.GAME_ERROR, error.what() ); }
			return VALUE( gse::value::Undefined );
		} )
	},
	{
		"create_pop",
		NATIVE_CALL( this ) {

			m_game->CheckRW( GSE_CALL );

			N_EXPECT_ARGS( 1 );
			N_GETVALUE( data, 0, Object );
			N_GETPROP( def_id, data, "type", String );
			N_GETPROP_UNWRAP_OPT( worked_tile, data, "worked_tile", map::tile::Tile );
			auto* def = GetPopDef( GSE_CALL, def_id );
			const auto max_variants = (m_faction->m_flags & faction::Faction::FF_PROGENITOR)
				? 1 // aliens have 1 gender
				: 2; // humans have 2
			ASSERT( max_variants > 0, "no variants found for pop type: " + def_id );

			auto* const pop = AddPop( Pop( this, m_next_pop_id++, def, m_game->GetRandom()->GetUInt(0, max_variants - 1), worked_tile ) );

			return pop->Wrap( GSE_CALL );
		} )
	},
	{
		"destroy_pop",
		NATIVE_CALL( this ) {

			m_game->CheckRW( GSE_CALL );

			N_EXPECT_ARGS( 1 );
			N_GETVALUE_UNWRAP( pop, 0, Pop );

			const auto it = m_pops.find( pop->m_id );
			if ( it == m_pops.end() || &it->second != pop ) {
				GSE_ERROR( gse::EC.GAME_ERROR, "Base does not have pop " + std::to_string( pop->m_id ) );
			}

			RemovePop( pop->m_id );

			return VALUE( gse::value::Undefined );
		} )
	},
	{
		"add_worked_tile",
		NATIVE_CALL( this ) {

			m_game->CheckRW( GSE_CALL );

			N_EXPECT_ARGS( 1 );
			N_GETVALUE_UNWRAP( tile, 0, map::tile::Tile );

			if ( m_worked_tiles.find( tile ) != m_worked_tiles.end() ) {
				GSE_ERROR( gse::EC.GAME_ERROR, "This tile is already worked" );
			}
			m_worked_tiles.insert( tile );

			TriggerUpdate();

			return VALUE( gse::value::Undefined );
		} )
	},
	{
		"remove_worked_tile",
		NATIVE_CALL( this ) {

			m_game->CheckRW( GSE_CALL );

			N_EXPECT_ARGS( 1 );
			N_GETVALUE_UNWRAP( tile, 0, map::tile::Tile );

			if ( m_worked_tiles.find( tile ) == m_worked_tiles.end() ) {
				GSE_ERROR( gse::EC.GAME_ERROR, "This tile is not worked" );
			}
			m_worked_tiles.erase( tile );

			TriggerUpdate();

			return VALUE( gse::value::Undefined );
		} )
	},
	{
		"is_tile_worked",
		NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 1 );
			N_GETVALUE_UNWRAP( tile, 0, map::tile::Tile );
			return VALUE( gse::value::Bool,, m_worked_tiles.find( tile ) != m_worked_tiles.end() );
		} )
	},
	{
		"get_pops",
		NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 0 );

			gse::value::array_elements_t elements = {};

			for ( auto& it : m_pops ) {
				elements.push_back( it.second.Wrap( GSE_CALL ) );
			}

			return VALUE( gse::value::Array,, elements );
		} ),
	},
	{
		"get_facilities",
		NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 0 );

			gse::value::object_properties_t result = {};

			for ( auto& it : m_facilities ) {
				int64_t cost;
				try { cost = it.second->GetMineralCost( m_game, m_owner->GetPlayer() ); }
				catch ( const std::overflow_error& error ) { GSE_ERROR( gse::EC.GAME_ERROR, error.what() ); }
				result.insert( { it.first, VALUEEXT( gse::value::Object, GSE_CALL, {
					{ "name", VALUE( gse::value::String,, it.second->m_name ) },
					{ "description", VALUE( gse::value::String,, it.second->m_description ) },
					{ "cost", VALUE( gse::value::Int,, cost ) },
				} ) } );
			}

			return VALUEEXT( gse::value::Object, GSE_CALL, result );
		} ),
	},
	{
		"has_facility",
		NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 1 );

			N_GETVALUE( id, 0, String );

			return VALUE( gse::value::Bool,, m_facilities.find( id ) != m_facilities.end() );
		} ),
	},
	{
		"get_size",
		NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 0 );
			return VALUE( gse::value::Int,, m_pops.size() );
		} ),
	},
	{
		"get_workable_tiles",
		NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 0 );
			return GetWorkableTiles( GSE_CALL );
		} ),
	},
	{
		"get_worked_tiles",
		NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 0 );
			return GetWorkedTiles( GSE_CALL );
		} ),
	},
	{
		"get_unworked_tiles",
		NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 0 );
			return GetUnworkedTiles( GSE_CALL );
		} ),
	},
	{
		"get_intake",
		NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 0 );
			return GetIntake( GSE_CALL );
		} ),
	},
	{
		"get_consumption",
		NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 0 );
			return GetConsumption( GSE_CALL );
		} ),
	},
WRAPIMPL_DYNAMIC_SETTERS( Base )
WRAPIMPL_DYNAMIC_ON_SET( Base )
WRAPIMPL_DYNAMIC_END()

UNWRAPIMPL_PTR( Base )

void Base::GetReachableObjects( std::unordered_set< gc::Object* >& reachable_objects ) {
	gse::Wrappable::GetReachableObjects( reachable_objects );

	GC_DEBUG_BEGIN( "pops" );
	for ( auto& it : m_pops ) {
		it.second.GetReachableObjects( reachable_objects );
	}
	if ( m_unit_production ) {
		GC_REACHABLE( m_unit_production->identity );
		if ( !m_unit_production->citizen.empty() ) { m_unit_production->citizen.mapped().GetReachableObjects( reachable_objects ); }
	}
	GC_DEBUG_END();
}

const PopDef* const Base::GetPopDef( GSE_CALLABLE, const std::string& id ) const {
	auto* def = m_game->GetBM()->GetPopDef( id );
	if ( !def ) {
		GSE_ERROR( gse::EC.INVALID_DEFINITION, "Unknown pop type: " + id );
	}
	return def;
}

gse::value::Array* const Base::GetWorkableTiles( GSE_CALLABLE ) {
	auto* const result = m_game->GetBM()->Trigger( GSE_CALL, "get_base_workable_tiles", ARGS_F( this ) {
		{
			"base",
			Wrap( GSE_CALL )
		},
	}; } );
	ASSERT( result, "GetWorkableTiles result is null" );
	if ( result->type != gse::VT_ARRAY ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "get_base_workable_tiles must return array, got: " + result->ToString() );
	}
	for ( const auto& v : ((gse::value::Array*)result)->value ) {
		if ( v->type != gse::VT_OBJECT || ((gse::value::Object*)v)->object_class != "Tile" ) {
			GSE_ERROR( gse::EC.GAME_ERROR, "get_base_workable_tiles elements must be objects of type Tile, got: " + v->ToString() );
		}
	}
	return (gse::value::Array*)result;
}

gse::value::Array* const Base::GetWorkedTiles( GSE_CALLABLE ) {
	gse::value::array_elements_t result = {};
	for ( const auto& tile : m_worked_tiles ) {
		result.push_back( tile->Wrap( GSE_CALL ) );
	}
	return VALUE( gse::value::Array,, result );
}

gse::value::Array* const Base::GetUnworkedTiles( GSE_CALLABLE ) {
	gse::value::array_elements_t result = {};
	const auto* workable_tiles_v = GetWorkableTiles( GSE_CALL );
	for ( const auto& v : workable_tiles_v->value ) {
		ASSERT( v->type == gse::VT_OBJECT && ((gse::value::Object*)v)->object_class == "Tile", "invalid tile object" );
		auto* tile = (map::tile::Tile*)((gse::value::Object*)v)->wrapobj;
		if ( m_worked_tiles.find( tile ) == m_worked_tiles.end() ) {
			result.push_back( v );
		}
	}
	return VALUE( gse::value::Array,, result );
}

gse::value::Object* const Base::GetIntake( GSE_CALLABLE ) {
	return GetResourcesFromCallback( GSE_CALL, m_game->GetBM(), m_game->GetRM(), "get_base_intake", ARGS_F( this ) {
		{
			"base",
			Wrap( GSE_CALL )
		},
		{
			"player",
			m_owner->Wrap( GSE_CALL )
		},
	}; } );
}

gse::value::Object* const Base::GetConsumption( GSE_CALLABLE ) {
	return GetResourcesFromCallback( GSE_CALL, m_game->GetBM(), m_game->GetRM(), "get_base_consumption", ARGS_F( this ) {
		{
			"base",
			Wrap( GSE_CALL )
		},
		{
			"player",
			m_owner->Wrap( GSE_CALL )
		},
	}; } );
}

void Base::TriggerUpdate() {
	m_game->GetBM()->AddUpdateTrigger( this );
}

}
}
}
