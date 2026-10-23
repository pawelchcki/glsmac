#include "Game.h"
#include "State.h"
#include "Player.h"
#include "unit/UnitManager.h"
#include "base/Base.h"
#include "base/BaseManager.h"
#include "map/tile/Tile.h"
#include "slot/Slot.h"
#include "gse/value/Bool.h"
#include "gse/value/Int.h"
#include "gse/value/Object.h"
#include "gse/value/String.h"
namespace game::backend {
bool Game::IsOpeningPending() const {
    return m_opening_phase != OPENING_NONE && m_opening_phase != OPENING_MAP;
}
bool Game::IsOpeningEventAllowed( const std::string& name ) const {
    if ( !IsOpeningPending() || name == "opening_command" ) { return true; }
    if ( m_opening_phase == OPENING_PREPARING ) {
        return name == "define_resource" || name == "define_no_resource" || name == "define_animation" ||
            name == "define_moraleset" || name == "define_unit" || name == "define_base_pop" ||
            name == "define_base_facility" || name == "add_production_choice" || name == "spawn_base" || name == "spawn_unit";
    }
    if ( m_opening_phase == OPENING_STARTING ) {
        return name == "advance_turn" || name == "process_base_production" || name == "process_base_growth" ||
            name == "add_base_pop" || name == "remove_base_pop" || name == "spawn_unit";
    }
    return false;
}
gse::Value* Game::GetOpeningState( GSE_CALLABLE ) const {
    static const char* phases[] = { "none", "preparing", "planetfall", "first-base-name", "starting", "tour", "map", "failed" };
    return VALUEEXT( gse::value::Object, GSE_CALL, {
        { "phase", VALUE( gse::value::String,, phases[m_opening_phase] ) },
        { "session", VALUE( gse::value::Int,, m_opening_session ) },
        { "base_id", VALUE( gse::value::Int,, m_opening_base_id ) },
        { "automatic_end_turn", VALUE( gse::value::Bool,, m_auto_end_turn ) },
    } );
}
void Game::UpdateOpening( GSE_CALLABLE ) {
    if ( !m_state || m_game_state != GS_RUNNING || !IsOpeningPending() || m_opening_phase == OPENING_FAILED ) { return; }
    if ( m_opening_base_id && ( !m_bm || m_bm->GetBase( m_opening_base_id ) != m_opening_base ) ) {
        m_opening_base = nullptr; m_opening_base_id = 0; m_opening_phase = OPENING_FAILED; ++m_opening_session; return;
    }
    { std::lock_guard guard( m_pending_events_mutex ); if ( !m_pending_events.empty() ) { return; } }
    if ( m_opening_phase == OPENING_PREPARING ) {
        for ( const auto& entry : m_bm->GetBases() ) {
            auto* base = entry.second;
            if ( base->m_owner == m_slot && base->m_facilities.count( "HEADQUARTERS" ) ) { m_opening_base = base; m_opening_base_id = base->m_id; break; }
        }
        if ( !m_opening_base ) { m_opening_phase = OPENING_FAILED; ++m_opening_session; return; }
        m_opening_phase = OPENING_PLANETFALL;
        SetTurnStatus( turn::TS_PLEASE_WAIT );
    } else if ( m_opening_phase == OPENING_STARTING ) {
        if ( m_current_turn.GetId() == 0 ) { FirstTurn( GSE_CALL ); }
        else if ( m_current_turn.GetId() == 1 && m_opening_first_turn_applied ) { m_opening_phase = OPENING_TOUR; }
    }
}
std::string Game::ValidateOpening( GSE_CALLABLE, const int64_t caller, const int64_t session, const std::string& action, const int64_t base_id, const std::string& previous, const std::string& name ) const {
    if ( !m_state || m_game_state != GS_RUNNING || m_state->m_connection || m_state->m_settings.local.game_mode != settings::LocalSettings::GM_SINGLEPLAYER || caller != 0 || size_t( caller ) != m_slot_num || !m_slot || !m_slot->GetPlayer() ) { return "Opening requires the offline human host"; }
    if ( session != m_opening_session || !IsOpeningPending() || m_opening_phase == OPENING_FAILED || !m_opening_base || m_bm->GetBase( m_opening_base_id ) != m_opening_base || m_opening_base->m_owner != m_slot ) { return "Opening session or Headquarters identity is stale"; }
    if ( action == "planetfall" && m_opening_phase == OPENING_PLANETFALL && GetTurnId() == 0 && base_id == 0 && previous.empty() && name.empty() ) { return ""; }
    if ( action == "dismiss" && m_opening_phase == OPENING_TOUR && GetTurnId() == 1 && base_id == 0 && previous.empty() && name.empty() ) { return ""; }
    if ( action == "name" && m_opening_phase == OPENING_NAME && GetTurnId() == 0 && base_id > 0 && size_t( base_id ) == m_opening_base_id ) { return m_opening_base->ValidateName( GSE_CALL, caller, previous, name ); }
    return "Opening command is out of order or has invalid fields";
}
void Game::ApplyOpening( GSE_CALLABLE, const int64_t caller, const int64_t session, const std::string& action, const int64_t base_id, const std::string& previous, const std::string& name ) {
    CheckRW( GSE_CALL );
    const auto error = ValidateOpening( GSE_CALL, caller, session, action, base_id, previous, name );
    if ( !error.empty() ) { GSE_ERROR( gse::EC.GAME_ERROR, error ); }
    if ( action == "planetfall" ) { m_opening_phase = OPENING_NAME; }
    else if ( action == "name" ) { m_opening_base->RenameValidated( GSE_CALL, name ); m_opening_phase = OPENING_STARTING; }
    else { m_opening_phase = OPENING_MAP; SetTurnStatus( m_um->HasReadyUnit( m_slot_num ) ? turn::TS_TURN_ACTIVE : turn::TS_TURN_COMPLETE ); }
}
}
