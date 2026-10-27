#include "Game.h"
#include "State.h"
#include "Player.h"
#include "gse/value/Bool.h"
#include "gse/value/Int.h"
#include "game/backend/slot/Slot.h"
#include "game/backend/slot/Slots.h"
#include <exception>
#include <utility>

namespace game::backend {
bool Game::ValidateReceivedEnergyTurn( const int64_t turn ) const {
	// Player/Slot wire is restored before the world snapshot supplies its turn.
	// Keep detached Player decoding context-free, but never install a running
	// world whose income marker would permanently prevent its next turn.
	if ( turn < 0 || !m_state ) { return false; }
	for ( auto& slot : m_state->m_slots->GetSlots() ) {
		if ( slot.GetState() == slot::Slot::SS_PLAYER && slot.GetPlayer()->GetEnergyIncomeTurn() > turn ) { return false; }
	}
	return true;
}

void Game::QueueEnergyChanged( const std::shared_ptr< Player* >& handle ) {
	auto* player = *handle;
	if ( !player || !player->GetSlot() || player->GetSlot()->GetPlayer() != player ) { return; }
	std::lock_guard guard( m_energy_views_mutex );
	m_pending_energy_views[ player->GetSlot()->GetIndex() ] = handle;
}

void Game::FlushEnergyChanges() {
	decltype( m_pending_energy_views ) pending;
	{ std::lock_guard guard( m_energy_views_mutex ); pending.swap( m_pending_energy_views ); }
	State* state; uint64_t generation;
	{ std::lock_guard guard( m_startup_mutex ); state = m_state; generation = m_startup_generation; }
	if ( pending.empty() || !state ) { return; }
	state->WithGSE( this, [ game = this, state, generation, pending = std::move( pending ) ]( GSE_CALLABLE ) {
		{ std::lock_guard guard( game->m_startup_mutex ); if ( game->m_state != state || game->m_startup_generation != generation ) { return; } }
		if ( state->GetGame() != game ) { return; }
		// Delivery happens after the authoritative receipt has been sealed.
		// An owner-thread accumulation cannot open a mutation scope for views.
		if ( game->m_rw_counter ) {
			for ( const auto& entry : pending ) { game->QueueEnergyChanged( entry.second ); }
			return;
		}
		for ( const auto& entry : pending ) {
			auto* player = *entry.second;
			if ( !player || !player->GetSlot() || player->GetSlot()->GetPlayer() != player ||
				player->GetSlot()->GetIndex() != entry.first || player->GetGame() != game ) { continue; }
			const auto id = static_cast< int64_t >( entry.first );
			const auto credits = player->GetEnergyCredits(), income_turn = player->GetEnergyIncomeTurn();
			const auto initialized = player->IsEnergyInitialized();
			const auto revision = player->GetEnergyRevision();
			try {
				game->Trigger( GSE_CALL, "energy_changed", ARGS_F( id, credits, income_turn, initialized, revision ) {
					{ "player_id", VALUE( gse::value::Int,, id ) },
					{ "credits", VALUE( gse::value::Int,, credits ) },
					{ "last_income_turn", VALUE( gse::value::Int,, income_turn ) },
					{ "initialized", VALUE( gse::value::Bool,, initialized ) },
					{ "revision", VALUE( gse::value::Int,, revision ) },
				}; } );
			} catch ( const std::exception& error ) {
				game->MTModule::Log( "Energy view listener failed: " + std::string( error.what() ) );
			}
		}
	} );
}
}
