#include "Game.h"
#include "State.h"
#include "Player.h"
#include "Random.h"
#include "slot/Slots.h"
#include "base/Base.h"
#include "base/BaseManager.h"
#include "base/PopDef.h"
#include "faction/Faction.h"
#include "unit/Unit.h"
#include "unit/UnitManager.h"
#include "unit/Def.h"
#include "map/Map.h"
#include "gse/callable/Native.h"
#include "gse/value/Array.h"
#include "gse/value/Bool.h"
#include "gse/value/Float.h"
#include "gse/value/Int.h"
#include "gse/value/String.h"
#include "gse/value/Undefined.h"
#include <cmath>
#include <memory>

namespace game::backend {

std::string Game::ValidateFoundBase( const int64_t unit_id, const int64_t caller ) const {
	if ( !IsRunning() || !m_current_turn.GetId() ) { return "Game is not active"; }
	if ( unit_id <= 0 || caller < 0 || !m_um ) { return "Invalid colony unit or owner"; }
	const auto* unit = m_um->GetUnit( unit_id );
	if ( !unit ) { return "Colony unit no longer exists"; }
	if ( !unit->m_owner || unit->m_owner->GetIndex() != size_t( caller ) || !unit->m_owner->GetPlayer() ) { return "Colony unit belongs to another player"; }
	if ( unit->m_def->m_id != "ColonyPod" || unit->m_def->GetMovementType() != unit::MT_LAND ) { return "Unit cannot found a land base"; }
	if ( unit->m_owner->GetPlayer()->IsTurnCompleted() ) { return "Player has completed the turn"; }
	if ( !std::isfinite( unit->m_movement ) || unit->m_movement <= 0 || !std::isfinite( unit->m_health ) || unit->m_health <= 0 || unit->m_animation_id ) { return "Colony unit is not ready"; }
	const auto* tile = unit->GetTile();
	if ( !tile || tile->is_water_tile || tile->base || tile->IsLocked() ) { return "Base needs an unlocked empty land tile"; }
	for ( const auto& entry : tile->units ) {
		if ( entry.second->m_owner != unit->m_owner ) { return "Foreign units occupy the founding tile"; }
	}
	return "";
}

gse::Value* Game::FoundBase( GSE_CALLABLE, const int64_t unit_id, const int64_t caller, gse::value::Callable* chooser ) {
	CheckRW( GSE_CALL );
	struct WriteRestore { std::atomic< size_t >& counter; size_t previous; ~WriteRestore() { counter = previous; } };
	const auto error = ValidateFoundBase( unit_id, caller );
	if ( !error.empty() ) { GSE_ERROR( gse::EC.GAME_ERROR, error ); }
	WriteRestore read_only { m_rw_counter, m_rw_counter.exchange( 0 ) };
	auto* unit = m_um->GetUnit( unit_id );
	auto* tile = unit->GetTile();
	FoundingRecord record;
	record.unit_id = unit_id; record.owner = caller; record.x = tile->coord.x; record.y = tile->coord.y;
	record.def = unit->m_def->m_id; record.movement = unit->m_movement; record.morale = unit->m_morale; record.health = unit->m_health; record.moved = unit->m_moved_this_turn;
	record.order = unit->GetOrder();
	record.previous_rng = m_random->GetStateString(); record.previous_base_id = base::Base::GetNextId(); record.next_unit_id = unit::Unit::GetNextId();
	record.base_id = record.previous_base_id;
	const auto old_names = m_bm->m_registered_base_names;
	const auto old_base_updates = m_bm->m_base_updates;
	const auto old_updated_bases = m_bm->m_updated_bases;
	const auto old_unit_updates = m_um->m_unit_updates;
	const auto pending_size = m_pending_events.size();
	const auto request_size = m_pending_frontend_requests->size();
	const auto token = ++m_next_founding_id;
	std::unique_ptr< unit::Unit > detached;
	std::unique_ptr< base::Base > created;
	try {
		created = std::make_unique< base::Base >( this, record.base_id, unit->m_owner, unit->m_owner->GetPlayer()->GetFaction(), tile, "", base::Base::facilities_t{}, base::Base::pops_t{} );
		gse::Value* plan_value = nullptr;
		// A chooser describes a citizen; game mutation remains native-owned.
		const auto write_depth = m_rw_counter.exchange( 0 );
		try { plan_value = chooser->Run( GSE_CALL, { created->Wrap( GSE_CALL ) } ); }
		catch ( ... ) { m_rw_counter = write_depth; throw; }
		m_rw_counter = write_depth;
		if ( !plan_value || plan_value->type != gse::VT_OBJECT ) { GSE_ERROR( gse::EC.GAME_ERROR, "Citizen plan must be an object" ); }
		const auto& plan = static_cast< gse::value::Object* >( plan_value )->value;
		const auto type_it = plan.find( "type" );
		if ( type_it == plan.end() || type_it->second->type != gse::VT_STRING ) { GSE_ERROR( gse::EC.GAME_ERROR, "Citizen plan needs a type" ); }
		const auto& type = static_cast< gse::value::String* >( type_it->second )->value;
		if ( type != "WORKER" && type != "DOCTOR" ) { GSE_ERROR( gse::EC.GAME_ERROR, "Unsupported founding citizen" ); }
		const auto* def = m_bm->GetPopDef( type );
		if ( !def ) { GSE_ERROR( gse::EC.GAME_ERROR, "Founding citizen definition is missing" ); }
		map::tile::Tile* worked = nullptr;
		if ( type == "WORKER" ) {
			const auto worked_it = plan.find( "worked_tile" );
			if ( worked_it == plan.end() || worked_it->second->type != gse::VT_OBJECT || static_cast< gse::value::Object* >( worked_it->second )->object_class != "Tile" ) { GSE_ERROR( gse::EC.GAME_ERROR, "Worker plan needs a tile" ); }
			worked = map::tile::Tile::Unwrap( worked_it->second );
			bool eligible = false;
			for ( auto* candidate : created->GetWorkableTiles( GSE_CALL )->value ) { if ( map::tile::Tile::Unwrap( candidate ) == worked ) { eligible = true; break; } }
			if ( !eligible || worked->tiles != m_map->GetTilesPtr() || worked == tile || worked->base || worked->CustomHas( "working_pop" ) || worked->IsLocked() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Worker tile is not available to this base" ); }
		}
		const auto& renders = created->m_faction->m_flags & faction::Faction::FF_PROGENITOR ? def->m_renders_progenitor : def->m_renders_human;
		if ( renders.empty() || renders.size() > 256 ) { GSE_ERROR( gse::EC.GAME_ERROR, "Founding citizen has no valid render variants" ); }
		auto* pop = created->AddPop( base::Pop( created.get(), created->m_next_pop_id++, def, m_random->GetUInt( 0, renders.size() - 1 ) ) );
		created->CustomSet( "accumulated_nutrients", VALUE( gse::value::Int,, 0 ) );
		if ( worked ) {
			pop->CustomSet( "worked_tile", worked->Wrap( GSE_CALL ) );
			worked->CustomSet( "working_pop", pop->Wrap( GSE_CALL ) );
			created->m_worked_tiles.insert( worked );
			record.worked_x = worked->coord.x; record.worked_y = worked->coord.y;
		}
		m_bm->SpawnBase( GSE_CALL, created.get() );
		if ( created->m_pops.size() != 1 || !created->m_facilities.empty() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Founding initialization changed the initial citizen or facilities" ); }
		// Keep the detached pod alive until all receipt allocation/bookkeeping
		// succeeds. Its final destruction is the last step of this transaction.
		detached.reset( m_um->DetachUnit( GSE_CALL, unit_id ) );
		record.name = created->m_name;
		record.base_snapshot = base::Base::Serialize( created.get() ).ToString();
		record.expected_rng = m_random->GetStateString(); record.next_base_id = base::Base::GetNextId();
		const gse::value::object_properties_t unit_data {
			{ "id", VALUE( gse::value::Int,, record.unit_id ) }, { "def", VALUE( gse::value::String,, record.def ) },
			{ "owner", VALUE( gse::value::Int,, record.owner ) }, { "x", VALUE( gse::value::Int,, record.x ) }, { "y", VALUE( gse::value::Int,, record.y ) },
			{ "movement", VALUE( gse::value::Float,, record.movement ) }, { "morale", VALUE( gse::value::Int,, record.morale ) },
			{ "health", VALUE( gse::value::Float,, record.health ) }, { "moved_this_turn", VALUE( gse::value::Bool,, record.moved ) },
		};
		auto* receipt = VALUEEXT( gse::value::Object, GSE_CALL, {
			{ "transaction_id", VALUE( gse::value::Int,, token ) }, { "base_id", VALUE( gse::value::Int,, record.base_id ) },
			{ "base_name", VALUE( gse::value::String,, record.name ) }, { "unit", VALUEEXT( gse::value::Object, GSE_CALL, unit_data ) },
		} );
		m_founding_records.emplace( token, record );
		created.release();
		return receipt;
	} catch ( ... ) {
		m_founding_records.erase( token );
		if ( created ) {
			created->ClearWorkedTiles();
			m_bm->m_bases.erase( created->m_id );
			if ( tile->base == created.get() ) { tile->base = nullptr; }
			created.reset();
		}
		detached.release();
		unit->m_movement = record.movement; unit->m_morale = record.morale;
		unit->m_health = record.health; unit->m_moved_this_turn = record.moved;
		unit->SetOrder( record.order );
		m_um->m_units.insert_or_assign( unit_id, unit ); tile->units.insert_or_assign( unit_id, unit );
		m_bm->m_registered_base_names = old_names;
		m_bm->m_base_updates = old_base_updates;
		m_bm->m_updated_bases = old_updated_bases;
		m_um->m_unit_updates = old_unit_updates;
		m_pending_events.resize( pending_size );
		while ( m_pending_frontend_requests->size() > request_size ) { m_pending_frontend_requests->pop_back(); }
		m_random->SetState( util::random::Random::GetStateFromString( record.previous_rng ) );
		base::Base::SetNextId( record.previous_base_id ); unit::Unit::SetNextId( record.next_unit_id );
		throw;
	}
}

void Game::RollbackFoundBase( GSE_CALLABLE, const int64_t token, const int64_t base_id ) {
	CheckRW( GSE_CALL );
	const auto it = m_founding_records.find( token );
	if ( it == m_founding_records.end() || it != std::prev( m_founding_records.end() ) || it->second.base_id != size_t( base_id ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Unknown or out-of-order founding receipt" ); }
	const auto& record = it->second;
	auto* base = m_bm->GetBase( base_id );
	if ( !base || m_um->GetUnit( record.unit_id ) || base::Base::Serialize( base ).ToString() != record.base_snapshot || m_random->GetStateString() != record.expected_rng || base::Base::GetNextId() != record.next_base_id || unit::Unit::GetNextId() != record.next_unit_id ) { GSE_ERROR( gse::EC.GAME_ERROR, "Founding receipt is stale" ); }
	if ( record.worked_x >= 0 ) {
		auto* tile = m_map->GetTile( record.worked_x, record.worked_y );
		const auto* assignment = tile->CustomGet( "working_pop" );
		if ( !assignment || assignment->type != gse::VT_OBJECT || static_cast< const gse::value::Object* >( assignment )->wrapobj != &base->m_pops.begin()->second ) { GSE_ERROR( gse::EC.GAME_ERROR, "Founding worker assignment changed" ); }
	}
	auto* def = m_um->GetUnitDef( record.def );
	if ( !def ) { GSE_ERROR( gse::EC.GAME_ERROR, "Colony prototype no longer exists" ); }
	auto restored = std::make_unique< unit::Unit >( GSE_CALL, m_um, record.unit_id, def, &m_state->m_slots->GetSlot( record.owner ), m_map->GetTile( record.x, record.y ), record.movement, record.morale, record.health, record.moved );
	restored->SetOrder( record.order );
	// Undo emits frontend changes, but does not invoke extensible callbacks on
	// a half-removed object. The journal has already validated the whole undo.
	base->ClearWorkedTiles();
	m_bm->m_updated_bases.erase( base );
	m_bm->QueueBaseUpdate( base, base::BaseManager::BUO_DESPAWN );
	base->GetTile()->base = nullptr;
	m_bm->m_registered_base_names.erase( base->m_name );
	m_bm->m_bases.erase( base_id );
	delete base;
	m_um->m_units.emplace( restored->m_id, restored.get() );
	m_um->QueueUnitUpdate( restored.get(), unit::UnitManager::UUO_SPAWN );
	restored.release();
	m_random->SetState( util::random::Random::GetStateFromString( record.previous_rng ) );
	base::Base::SetNextId( record.previous_base_id );
	m_founding_records.erase( it );
}

}
