#include "Base.h"

#include "BaseManager.h"
#include "production/Unit.h"
#include "game/backend/Game.h"
#include "game/backend/Player.h"
#include "game/backend/Random.h"
#include "game/backend/slot/Slot.h"
#include "game/backend/unit/Unit.h"
#include "game/backend/unit/StaticDef.h"
#include "game/backend/unit/UnitManager.h"
#include "gse/value/Object.h"
#include "gse/value/Undefined.h"
#include <limits>

namespace game::backend::base {

Base::ProductionResult Base::CompleteUnitProduction( GSE_CALLABLE, const ProductionState& next ) {
	auto* um = m_game->GetUM();
	auto* bm = m_game->GetBM();
	if ( !m_game->IsRunning() || !um || m_tile->is_water_tile || m_tile->IsLocked() || m_tile->base != this || m_next_production_receipt == std::numeric_limits< int64_t >::max() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Base cannot complete a land unit now" ); }
	const auto* recipe = static_cast< const production::Unit* >( m_owner->GetPlayer()->GetProductionChoice( m_production.choice_id ) );
	auto* def = static_cast< unit::StaticDef* >( um->GetUnitDef( recipe->unit_id ) );
	auto record = std::make_unique< UnitProductionRecord >();
	record->token = m_next_production_receipt + 1;
	record->previous = m_production;
	record->previous_rng = m_game->GetRandom()->GetStateString();
	record->previous_unit_id = unit::Unit::GetNextId();
	record->unit_id = record->previous_unit_id;
	if ( um->GetUnit( record->unit_id ) || m_tile->units.count( record->unit_id ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Next production unit identity is already occupied" ); }

	// Only a charged colony recipe removes the most recently added citizen.
	// Keep its map node alive so undo preserves its exact identity. Ordinary
	// land-unit recipes leave population and worker links attached throughout.
	auto citizen = m_pops.end();
	if ( recipe->population_cost ) { citizen = std::prev( m_pops.end() ); }
	auto* worked = citizen != m_pops.end() ? citizen->second.CustomGet( "worked_tile" ) : nullptr;
	if ( worked ) {
		if ( worked->type != gse::VT_OBJECT || static_cast< gse::value::Object* >( worked )->object_class != "Tile" ) { GSE_ERROR( gse::EC.GAME_ERROR, "Produced unit's citizen has an invalid worker assignment" ); }
		record->worked = map::tile::Tile::Unwrap( worked );
		const auto* backlink = record->worked->CustomGet( "working_pop" );
		if ( !m_worked_tiles.count( record->worked ) || !backlink || backlink->type != gse::VT_OBJECT || static_cast< const gse::value::Object* >( backlink )->wrapobj != &citizen->second ) { GSE_ERROR( gse::EC.GAME_ERROR, "Produced unit's worker backlink is inconsistent" ); }
	}
	const auto base_updates = bm->m_base_updates;
	const auto updated_bases = bm->m_updated_bases;
	const auto unit_updates = um->m_unit_updates;
	const auto pending_events = m_game->m_pending_events.size();
	const auto frontend_requests = m_game->m_pending_frontend_requests->size();
	std::unique_ptr< unit::Unit > created;
	try {
		if ( citizen != m_pops.end() ) { record->citizen = m_pops.extract( citizen ); }
		if ( record->worked ) {
			record->worked_node = m_worked_tiles.extract( record->worked );
			record->worked->CustomUnset( "working_pop" );
		}
		m_production = next;
		created = std::make_unique< unit::Unit >( GSE_CALL, um, record->unit_id, def, m_owner, m_tile, def->m_movement_per_turn, 1, 1.0f, false );
		record->identity = static_cast< gse::value::Object* >( created->Wrap( GSE_CALL ) );
		// Lifecycle listeners may observe the completed state and consume random
		// draws. Native field/custom setters and event queueing are guarded;
		// arbitrary script closure state is outside this native transaction.
		const auto write_depth = m_game->m_rw_counter.exchange( 0 );
		try { const gse::Wrappable::CustomMutationGuard custom_guard; um->SpawnUnit( GSE_CALL, created.get() ); }
		catch ( ... ) { m_game->m_rw_counter = write_depth; throw; }
		m_game->m_rw_counter = write_depth;
		ProductionChanged();
		record->expected_base = Serialize( this ).ToString();
		record->expected_unit = unit::Unit::Serialize( created.get() ).ToString();
		record->expected_rng = m_game->GetRandom()->GetStateString();
		record->next_unit_id = unit::Unit::GetNextId();
		ProductionResult result { record->previous, "", record->token };
		m_next_production_receipt = record->token;
		m_unit_production = std::move( record );
		created.release();
		return result;
	} catch ( ... ) {
		if ( created ) { um->m_units.erase( created->m_id ); m_tile->units.erase( created->m_id ); created.reset(); }
		m_production = record->previous;
		if ( !record->citizen.empty() ) {
			auto* pop = &m_pops.insert( std::move( record->citizen ) ).position->second;
			if ( record->worked ) {
				m_worked_tiles.insert( std::move( record->worked_node ) );
				record->worked->CustomSet( "working_pop", pop->Wrap( GSE_CALL ) );
			}
		}
		bm->m_base_updates = base_updates; bm->m_updated_bases = updated_bases; um->m_unit_updates = unit_updates;
		m_game->m_pending_events.resize( pending_events );
		while ( m_game->m_pending_frontend_requests->size() > frontend_requests ) { m_game->m_pending_frontend_requests->pop_back(); }
		m_game->GetRandom()->SetState( util::random::Random::GetStateFromString( record->previous_rng ) );
		unit::Unit::SetNextId( record->previous_unit_id );
		throw;
	}
}

void Base::RollbackUnitProduction( GSE_CALLABLE, const int64_t receipt ) {
	m_game->CheckRW( GSE_CALL );
	if ( !m_unit_production || m_unit_production->token != receipt ) { GSE_ERROR( gse::EC.GAME_ERROR, "Unknown unit production receipt" ); }
	auto& record = *m_unit_production;
	auto* um = m_game->GetUM();
	auto* produced = um->GetUnit( record.unit_id );
	if ( !produced || record.identity->wrapobj != produced || produced->m_animation_id || unit::Unit::Serialize( produced ).ToString() != record.expected_unit || Serialize( this ).ToString() != record.expected_base || m_game->GetRandom()->GetStateString() != record.expected_rng || unit::Unit::GetNextId() != record.next_unit_id || ( !record.citizen.empty() && m_pops.count( record.citizen.key() ) ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Unit production receipt is stale" ); }
	if ( record.worked && ( record.worked->CustomHas( "working_pop" ) || m_worked_tiles.count( record.worked ) ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Produced unit's former worker tile is no longer free" ); }
	// All receipt validation precedes removal. Native undo intentionally avoids
	// extensible lifecycle callbacks while the unit/citizen graph is changing.
	if ( record.worked ) { record.worked->CustomSet( "working_pop", record.citizen.mapped().Wrap( GSE_CALL ) ); }
	if ( !record.citizen.empty() ) { m_pops.insert( std::move( record.citizen ) ); }
	if ( record.worked ) { m_worked_tiles.insert( std::move( record.worked_node ) ); }
	um->QueueUnitUpdate( produced, unit::UnitManager::UUO_DESPAWN );
	produced->GetTile()->units.erase( produced->m_id );
	um->m_units.erase( produced->m_id );
	delete produced;
	m_production = record.previous;
	m_game->GetRandom()->SetState( util::random::Random::GetStateFromString( record.previous_rng ) );
	unit::Unit::SetNextId( record.previous_unit_id );
	m_unit_production.reset();
	ProductionChanged();
}

}
