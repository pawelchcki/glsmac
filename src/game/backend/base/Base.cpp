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
#include "game/backend/Random.h"
#include "game/backend/resource/ResourceManager.h"
#include "game/backend/Player.h"
#include "production/Facility.h"
#include <limits>

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
	const size_t next_pop_id
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
	ASSERT( !tile->base, "tile already has base" );
	tile->base = this;
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
	return def && def->m_cost > 0 && def->m_cost <= uint64_t( std::numeric_limits< int64_t >::max() ) ? def : nullptr;
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

ProductionState Base::SelectProduction( GSE_CALLABLE, const std::string& choice_id ) {
	m_game->CheckRW( GSE_CALL );
	const auto* def = ResolveProduction( m_game, m_owner, choice_id );
	if ( !def ) { GSE_ERROR( gse::EC.GAME_ERROR, "Unknown or unsupported facility production choice: " + choice_id ); }
	if ( m_facilities.count( def->m_id ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Facility is already installed" ); }
	const auto previous = m_production;
	if ( choice_id == m_production.choice_id ) { return previous; }
	if ( !m_production.choice_id.empty() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Switching active production is not supported" ); }
	m_production.choice_id = choice_id;
	m_production.last_processed_turn = m_game->GetTurnId();
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
		if ( !def || m_facilities.count( def->m_id ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Production facility is unavailable or already installed" ); }
		if ( minerals > std::numeric_limits< int64_t >::max() - next.minerals ) { GSE_ERROR( gse::EC.GAME_ERROR, "Production mineral credit overflow" ); }
		next.minerals += minerals;
		if ( uint64_t( next.minerals ) >= def->m_cost ) {
			next.minerals -= def->m_cost;
			next.choice_id.clear();
			result.added_facility = def->m_id;
		}
	}
	// All validation and arithmetic complete before either state is changed.
	if ( !result.added_facility.empty() ) { m_facilities.emplace( def->m_id, def ); }
	m_production = std::move( next );
	ProductionChanged();
	return result;
}

void Base::RestoreProduction( GSE_CALLABLE, const ProductionState& previous, const std::string& added_facility ) {
	m_game->CheckRW( GSE_CALL );
	if ( previous.minerals < 0 || previous.last_processed_turn < 0 || uint64_t( previous.last_processed_turn ) > m_game->GetTurnId() ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Invalid production restore state" );
	}
	const auto* def = previous.choice_id.empty() ? nullptr : ResolveProduction( m_game, m_owner, previous.choice_id );
	if ( !previous.choice_id.empty() && !def ) { GSE_ERROR( gse::EC.GAME_ERROR, "Unknown production restore choice" ); }
	if ( !added_facility.empty() ) {
		if ( !def || def->m_id != added_facility || !m_production.choice_id.empty() || !m_facilities.count( added_facility ) ) {
			GSE_ERROR( gse::EC.GAME_ERROR, "Production rollback facility does not match the previous project" );
		}
	} else if ( def && m_facilities.count( def->m_id ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Restored production facility is already installed" ); }
	if ( previous == m_production && added_facility.empty() ) { return; }
	if ( !added_facility.empty() ) { m_facilities.erase( added_facility ); }
	m_production = previous;
	ProductionChanged();
}

Pop* const Base::AddPop( const Pop& pop ) {
	ASSERT( m_pops.find( pop.m_id ) == m_pops.end(), "pop already exists" );
	m_pops.insert_or_assign( pop.m_id, pop );
	m_game->GetBM()->RefreshBase( this );
	TriggerUpdate();
	return &m_pops.at( pop.m_id );
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
	return buf;
}

Base* Base::Deserialize( types::Buffer& buf, Game* game ) {
	ASSERT( game, "game is null" );
	const auto id = buf.ReadInt();
	auto* slot = &game->GetState()->m_slots->GetSlot( buf.ReadInt() );
	const auto faction_id = buf.ReadString();
	auto* faction = game->GetFaction( faction_id );
	const auto pos_x = buf.ReadInt();
	const auto pos_y = buf.ReadInt();
	auto* tile = game->GetMap()->GetTile( pos_x, pos_y );
	const auto name = buf.ReadString();
	facilities_t facilities = {};
	const auto facilities_count = buf.ReadInt();
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
	for ( size_t i = 0 ; i < pops_count ; i++ ) {
		const auto pop_id = buf.ReadInt();
		Pop pop = {};
		pop.Deserialize( buf, game );
		pops.insert_or_assign( pop_id, pop );
	}
	const auto next_pop_id = buf.ReadInt();
	const auto production = ProductionState::Deserialize( buf );
	if ( !production.choice_id.empty() ) {
		const auto* def = ResolveProduction( game, slot, production.choice_id );
		if ( !def || facilities.count( def->m_id ) ) { THROW( "invalid or installed base production choice" ); }
	}
	if ( buf.lenr != buf.lenw ) { THROW( "trailing base snapshot data" ); }
	if ( tile->base ) { THROW( "base snapshot tile is occupied" ); }
	auto* base = new Base( game, id, slot, faction, tile, name, facilities, pops, next_pop_id );
	base->m_production = production;
	return base;
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
		"get_production", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 0 );
			return WrapProduction( GSE_CALL, m_production );
		} )
	},
	{
		"select_production", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 1 ); N_GETVALUE( choice, 0, String );
			return WrapProduction( GSE_CALL, SelectProduction( GSE_CALL, choice ) );
		} )
	},
	{
		"process_production", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 2 ); N_GETVALUE( turn, 0, Int ); N_GETVALUE( minerals, 1, Int );
			const auto result = ProcessProduction( GSE_CALL, turn, minerals );
			return VALUEEXT( gse::value::Object, GSE_CALL, {
				{ "previous", WrapProduction( GSE_CALL, result.previous ) },
				{ "added_facility", VALUE( gse::value::String,, result.added_facility ) },
			} );
		} )
	},
	{
		"restore_production", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 2 ); N_GETVALUE( data, 0, Object ); N_GETVALUE( added, 1, String );
			N_GETPROP( choice, data, "choice_id", String );
			N_GETPROP( minerals, data, "minerals", Int );
			N_GETPROP( turn, data, "last_processed_turn", Int );
			RestoreProduction( GSE_CALL, { choice, minerals, turn }, added );
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

			if ( m_pops.find( pop->m_id ) == m_pops.end() ) {
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
				result.insert( { it.first, VALUEEXT( gse::value::Object, GSE_CALL, {
					{ "name", VALUE( gse::value::String,, it.second->m_name ) },
					{ "description", VALUE( gse::value::String,, it.second->m_description ) },
					{ "cost", VALUE( gse::value::Int,, it.second->m_cost ) },
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
