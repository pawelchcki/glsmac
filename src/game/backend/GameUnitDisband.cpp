#include "Game.h"
#include "State.h"
#include "Player.h"
#include "Random.h"
#include "base/Base.h"
#include "slot/Slot.h"
#include "map/Map.h"
#include "unit/Unit.h"
#include "unit/UnitManager.h"
#include "unit/Def.h"
#include "gse/value/Int.h"
#include "gse/value/Object.h"
#include <cmath>
#include <limits>
#include <memory>

namespace game::backend {

// Current application policy accepts a ready, movable owned unit on an
// unlocked tile. Original evidence is narrower: the recorded ready Former.
std::string Game::ValidateUnitDisband( const int64_t unit_id, const int64_t caller, const int64_t turn ) const {
	if ( !IsRunning() || !m_current_turn.GetId() || turn <= 0 || uint64_t( turn ) != GetTurnId() ) { return "Disband requires the current active turn"; }
	if ( unit_id <= 0 || caller < 0 || !m_um || !m_map ) { return "Invalid disband unit or caller"; }
	const auto* unit = m_um->GetUnit( unit_id );
	if ( !unit || !unit->m_owner || unit->m_owner->GetIndex() != size_t( caller ) || !unit->m_owner->GetPlayer() ) { return "Disband requires its live owned unit"; }
	if ( unit->m_owner->GetPlayer()->IsTurnCompleted() ) { return "Disband owner has completed the turn"; }
	if ( !unit->m_def || m_um->GetUnitDef( unit->m_def->m_id ) != unit->m_def || unit->m_def->GetMovementType() == unit::MT_IMMOVABLE ||
		!std::isfinite( unit->m_health ) || unit->m_health <= 0 || !std::isfinite( unit->m_movement ) || unit->m_movement <= 0 || !unit->NeedsOrders() || unit->m_animation_id ) { return "Disband unit is not ready"; }
	const auto* tile = unit->GetTile();
	if ( !tile || tile->tiles != m_map->GetTilesPtr() || tile->IsLocked() ) { return "Disband tile is unavailable"; }
	const auto member = tile->units.find( unit_id );
	if ( member == tile->units.end() || member->second != unit ) { return "Disband tile membership is stale"; }
	if ( m_next_disbanding_id == std::numeric_limits< int64_t >::max() ) { return "Disband transaction identities exhausted"; }
	return "";
}

gse::Value* Game::DisbandUnit( GSE_CALLABLE, const int64_t unit_id, const int64_t caller, const int64_t turn ) {
	CheckRW( GSE_CALL );
	const auto error = ValidateUnitDisband( unit_id, caller, turn ); if ( !error.empty() ) { GSE_ERROR( gse::EC.GAME_ERROR, error ); }
	auto* unit = m_um->GetUnit( unit_id ); auto* tile = unit->GetTile();
	DisbandingRecord record;
	record.unit_id = unit_id; record.owner = caller; record.turn = turn; record.x = tile->coord.x; record.y = tile->coord.y;
	record.def = unit->m_def->m_id; record.unit_snapshot = unit::Unit::Serialize( unit ).ToString(); record.expected_def = unit::Def::Serialize( unit->m_def ).ToString();
	record.next_base_id = base::Base::GetNextId(); record.next_unit_id = unit::Unit::GetNextId(); record.previous_rng = m_random->GetStateString();
	const auto updates = m_um->m_unit_updates; const auto pending_size = m_pending_events.size(); const auto request_size = m_pending_frontend_requests->size();
	const auto token = m_next_disbanding_id + 1;
	std::unique_ptr< unit::Unit > detached;
	try {
		struct WriteRestore { std::atomic< size_t >& counter; size_t previous; ~WriteRestore() { counter = previous; } };
		{
			WriteRestore restore { m_rw_counter, m_rw_counter.exchange( 0 ) };
			const gse::Wrappable::CustomMutationGuard custom_guard;
			detached.reset( m_um->DetachUnit( GSE_CALL, unit_id ) );
		}
		record.expected_rng = m_random->GetStateString();
		auto* receipt = VALUEEXT( gse::value::Object, GSE_CALL, {
			{ "transaction_id", VALUE( gse::value::Int,, token ) }, { "unit_id", VALUE( gse::value::Int,, unit_id ) },
			{ "owner", VALUE( gse::value::Int,, caller ) }, { "turn_id", VALUE( gse::value::Int,, turn ) },
		} );
		m_disbanding_records.emplace( token, record ); m_next_disbanding_id = token;
		return receipt;
	} catch ( ... ) {
		m_disbanding_records.erase( token ); detached.release();
		m_um->m_units.insert_or_assign( unit_id, unit ); tile->units.insert_or_assign( unit_id, unit );
		m_um->m_unit_updates = updates; m_pending_events.resize( pending_size );
		while ( m_pending_frontend_requests->size() > request_size ) { m_pending_frontend_requests->pop_back(); }
		m_random->SetState( util::random::Random::GetStateFromString( record.previous_rng ) );
		throw;
	}
}

void Game::RollbackUnitDisband( GSE_CALLABLE, const int64_t token, const int64_t unit_id, const int64_t caller, const int64_t turn ) {
	CheckRW( GSE_CALL );
	const auto found = m_disbanding_records.find( token );
	if ( found == m_disbanding_records.end() || found != std::prev( m_disbanding_records.end() ) || found->second.unit_id != size_t( unit_id ) ||
		found->second.owner != size_t( caller ) || turn <= 0 || found->second.turn != uint64_t( turn ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Unknown or out-of-order disband receipt" ); }
	const auto& record = found->second; auto* tile = m_map->GetTile( record.x, record.y ); auto* def = m_um->GetUnitDef( record.def );
	if ( !IsRunning() || GetTurnId() != record.turn || tile->IsLocked() || m_um->GetUnit( record.unit_id ) || tile->units.count( record.unit_id ) ||
		!def || unit::Def::Serialize( def ).ToString() != record.expected_def || m_random->GetStateString() != record.expected_rng ||
		base::Base::GetNextId() != record.next_base_id || unit::Unit::GetNextId() != record.next_unit_id ) { GSE_ERROR( gse::EC.GAME_ERROR, "Disband receipt is stale" ); }
	types::Buffer bytes( record.unit_snapshot );
	auto restored = std::unique_ptr< unit::Unit >( unit::Unit::Deserialize( GSE_CALL, bytes, m_um ) );
	std::unique_ptr< unit::Def > decoded( restored->m_def ); restored->m_def = def;
	m_um->m_units.emplace( restored->m_id, restored.get() ); m_um->QueueUnitUpdate( restored.get(), unit::UnitManager::UUO_SPAWN ); restored.release();
	m_random->SetState( util::random::Random::GetStateFromString( record.previous_rng ) );
	m_disbanding_records.erase( found );
}

}
