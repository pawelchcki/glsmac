#include "Game.h"

#include <limits>

#include "Player.h"
#include "State.h"
#include "slot/Slots.h"
#include "gse/value/Array.h"
#include "gse/value/Bool.h"
#include "gse/value/Int.h"
#include "gse/value/Object.h"

namespace game::backend {

gse::Value* Game::GetResearchState( GSE_CALLABLE, int64_t player ) const {
	if ( player < 0 || player >= technology::Research::PLAYERS ) { GSE_ERROR( gse::EC.INVALID_CALL, "Invalid research player" ); }
	const auto& state = m_research.Get( player );
	gse::value::array_elements_t priorities;
	for ( size_t category = 0; category < 4; ++category ) { priorities.push_back( VALUE( gse::value::Bool,, bool( state.priorities & ( 1u << category ) ) ) ); }
	return VALUEEXT( gse::value::Object, GSE_CALL, {
		{ "target_id", VALUE( gse::value::Int,, state.target ) }, { "priorities", VALUE( gse::value::Array,, priorities ) },
	} );
}

std::string Game::ValidateResearchPlayer( int64_t player ) const {
	if ( !IsRunning() || !GetTurnId() || IsOpeningPending() ) { return "Research requires an active playable world"; }
	if ( player < 0 || player >= technology::Research::PLAYERS || !m_state || size_t( player ) >= m_state->m_slots->GetCount() ) { return "Invalid research player"; }
	const auto& slot = m_state->m_slots->GetSlot( player );
	if ( slot.GetState() != slot::Slot::SS_PLAYER || !slot.GetPlayer() || slot.GetPlayer()->IsTurnCompleted() ) { return "Research requires its live player and unfinished turn"; }
	if ( m_next_research_receipt == std::numeric_limits< int64_t >::max() ) { return "Research transaction identities exhausted"; }
	return "";
}

std::string Game::ValidateResearchTarget( int64_t player, int64_t target ) const {
	const auto error = ValidateResearchPlayer( player ); if ( !error.empty() ) { return error; }
	if ( m_state->m_settings.global.rules.IsBlindResearch() ) { return "Directed selection requires Blind Research off"; }
	if ( target < 0 || target >= technology::Table::COUNT || !m_technologies.IsAvailable( target, player + 1, true ) ) { return "Research target is not available"; }
	return "";
}

std::string Game::ValidateResearchPriority( int64_t player, int64_t priority ) const {
	const auto error = ValidateResearchPlayer( player ); if ( !error.empty() ) { return error; }
	if ( !m_state->m_settings.global.rules.IsBlindResearch() ) { return "Priorities require Blind Research on"; }
	if ( priority < 0 || priority > 3 ) { return "Invalid research priority"; }
	return "";
}

gse::Value* Game::ApplyResearch( GSE_CALLABLE, int64_t player, const technology::Research::State& state ) {
	auto record = std::make_unique< research_receipt_t >( research_receipt_t{ m_next_research_receipt + 1, GetTurnId(), m_research.Get( player ), state } );
	auto* receipt = VALUEEXT( gse::value::Object, GSE_CALL, {
		{ "player_id", VALUE( gse::value::Int,, player ) }, { "token", VALUE( gse::value::Int,, record->token ) },
		{ "turn_id", VALUE( gse::value::Int,, record->turn ) },
	} );
	m_research.Set( player, state ); m_next_research_receipt = record->token; m_research_receipts[ player ] = std::move( record );
	return receipt;
}

gse::Value* Game::SelectResearchTarget( GSE_CALLABLE, int64_t player, int64_t target ) {
	CheckRW( GSE_CALL ); gse::Wrappable::CheckCustomMutation( GSE_CALL );
	const auto error = ValidateResearchTarget( player, target ); if ( !error.empty() ) { GSE_ERROR( gse::EC.GAME_ERROR, error ); }
	auto next = m_research.Get( player ); next.target = target;
	return ApplyResearch( GSE_CALL, player, next );
}

gse::Value* Game::SetResearchPriority( GSE_CALLABLE, int64_t player, int64_t priority, bool enabled ) {
	CheckRW( GSE_CALL ); gse::Wrappable::CheckCustomMutation( GSE_CALL );
	const auto error = ValidateResearchPriority( player, priority ); if ( !error.empty() ) { GSE_ERROR( gse::EC.GAME_ERROR, error ); }
	auto next = m_research.Get( player );
	const auto bit = 1u << priority; next.priorities = enabled ? next.priorities | bit : next.priorities & ~bit;
	return ApplyResearch( GSE_CALL, player, next );
}

void Game::RollbackResearch( GSE_CALLABLE, int64_t player, int64_t token, int64_t turn ) {
	CheckRW( GSE_CALL ); gse::Wrappable::CheckCustomMutation( GSE_CALL );
	if ( player < 0 || player >= technology::Research::PLAYERS ) { GSE_ERROR( gse::EC.GAME_ERROR, "Invalid research receipt player" ); }
	const auto& record = m_research_receipts[ player ];
	if ( !record || token != record->token || turn != record->turn || GetTurnId() != record->turn || !( m_research.Get( player ) == record->expected ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Research receipt is stale" ); }
	m_research.Set( player, record->previous ); m_research_receipts[ player ].reset();
}

}
