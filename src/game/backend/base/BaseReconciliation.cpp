#include "Base.h"
#include "BaseManager.h"
#include "PopDef.h"
#include "game/backend/Game.h"
#include "game/backend/map/Map.h"
#include "game/backend/map/tile/Tile.h"
#include "game/backend/slot/Slot.h"
#include "gse/value/Object.h"
#include "gse/callable/Native.h"
#include <limits>

namespace game::backend::base {

// Management preparation is bookkeeping, not worker allocation. Joining may
// leave an unassigned Worker on the closed map; management represents that idle
// citizen as a Doctor without selecting terrain or changing stored resources.
std::string Base::ValidateCitizenReconciliation( GSE_CALLABLE, const int64_t caller, const int64_t turn ) {
	if ( !m_game->IsRunning() || turn <= 0 || uint64_t( turn ) != m_game->GetTurnId() ) { return "Base management turn is stale"; }
	if ( !m_game->GetBM() || m_game->GetBM()->GetBase( m_id ) != this || !m_owner || caller < 0 || size_t( caller ) != m_owner->GetIndex() || !m_owner->GetPlayer() ) { return "Only the live base owner may reconcile citizens"; }
	if ( !m_game->GetMap() || !m_tile || m_tile->base != this || m_tile->tiles != m_game->GetMap()->GetTilesPtr() || m_tile->IsLocked() ) { return "Base management needs its live unlocked tile"; }
	const auto* doctor = m_game->GetBM()->GetPopDef( "DOCTOR" );
	if ( !doctor || ( doctor->m_flags & PopDef::PF_TILE_WORKER ) ) { return "Doctor definition is missing or is a tile worker"; }
	std::unordered_set< const gse::Wrappable* > pending;
	for ( const auto& entry : m_pops ) {
		if ( entry.second.m_base != this || entry.second.m_id != entry.first ) { return "Citizen identity is inconsistent with its base"; }
		if ( entry.second.m_def->m_id == "WORKER" && !const_cast< Pop& >( entry.second ).CustomHas( "worked_tile" ) ) { pending.insert( &entry.second ); }
	}
	try {
		// Check both citizen -> tile and the base worked-tile set before changing
		// any type. Serialization remains permissive of unassigned Workers.
		Serialize( this );
	} catch ( const std::exception& error ) { return error.what(); }
	if ( pending.empty() ) { return ""; }
	// A tile backlink omitted from the base's worked set must not turn an
	// apparently idle Worker into a specialist while retaining a hidden claim.
	for ( size_t y = 0; y < m_game->GetMap()->GetHeight(); ++y ) {
		for ( size_t x = y % 2; x < m_game->GetMap()->GetWidth(); x += 2 ) {
			auto* tile = m_game->GetMap()->GetTile( x, y );
			auto* claim = tile->CustomGet( "working_pop" );
			if ( !claim || claim->type != gse::VT_OBJECT ) { continue; }
			auto* object = static_cast< gse::value::Object* >( claim );
			if ( pending.count( object->wrapobj ) ) { return "Unassigned Worker has an inconsistent tile backlink"; }
		}
	}
	return "";
}

int64_t Base::ReconcileCitizens( GSE_CALLABLE, const int64_t caller, const int64_t turn ) {
	m_game->CheckRW( GSE_CALL );
	const auto error = ValidateCitizenReconciliation( GSE_CALL, caller, turn );
	if ( !error.empty() ) { GSE_ERROR( gse::EC.GAME_ERROR, error ); }
	CitizenReconciliationRecord record; record.turn = m_game->GetTurnId();
	for ( const auto& entry : m_pops ) {
		if ( entry.second.m_def->m_id == "WORKER" && !const_cast< Pop& >( entry.second ).CustomHas( "worked_tile" ) ) { record.previous_types.emplace( entry.first, "WORKER" ); }
	}
	if ( record.previous_types.empty() ) { return 0; }
	if ( m_next_citizen_reconciliation == std::numeric_limits< int64_t >::max() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Citizen reconciliation receipts exhausted" ); }
	auto* bm = m_game->GetBM(); const auto* doctor = bm->GetPopDef( "DOCTOR" );
	const auto old_updates = bm->m_base_updates; const auto old_triggers = bm->m_updated_bases;
	const auto token = m_next_citizen_reconciliation + 1;
	try {
		for ( const auto& entry : record.previous_types ) { m_pops.at( entry.first ).m_def = doctor; }
		record.expected_base = Serialize( this ).ToString();
		m_citizen_reconciliations.emplace( token, record );
		bm->RefreshBase( this ); TriggerUpdate();
		m_next_citizen_reconciliation = token;
		return token;
	} catch ( ... ) {
		for ( const auto& entry : record.previous_types ) { m_pops.at( entry.first ).m_def = bm->GetPopDef( entry.second ); }
		m_citizen_reconciliations.erase( token ); bm->m_base_updates = old_updates; bm->m_updated_bases = old_triggers;
		throw;
	}
}

void Base::RollbackCitizenReconciliation( GSE_CALLABLE, const int64_t receipt ) {
	m_game->CheckRW( GSE_CALL );
	if ( !m_game->IsRunning() || m_game->GetBM()->GetBase( m_id ) != this || m_tile->IsLocked() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Citizen reconciliation base is stale" ); }
	if ( receipt == 0 ) { return; }
	const auto it = m_citizen_reconciliations.find( receipt );
	if ( it == m_citizen_reconciliations.end() || it != std::prev( m_citizen_reconciliations.end() ) || it->second.turn != m_game->GetTurnId() || Serialize( this ).ToString() != it->second.expected_base ) { GSE_ERROR( gse::EC.GAME_ERROR, "Citizen reconciliation receipt is stale or out of order" ); }
	auto* bm = m_game->GetBM();
	for ( const auto& entry : it->second.previous_types ) {
		if ( !bm->GetPopDef( entry.second ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Previous citizen definition no longer exists" ); }
	}
	const auto old_updates = bm->m_base_updates; const auto old_triggers = bm->m_updated_bases;
	try {
		for ( const auto& entry : it->second.previous_types ) { m_pops.at( entry.first ).m_def = bm->GetPopDef( entry.second ); }
		bm->RefreshBase( this ); TriggerUpdate();
		m_citizen_reconciliations.erase( it );
	} catch ( ... ) {
		for ( const auto& entry : it->second.previous_types ) { m_pops.at( entry.first ).m_def = bm->GetPopDef( "DOCTOR" ); }
		bm->m_base_updates = old_updates; bm->m_updated_bases = old_triggers;
		throw;
	}
}

}
