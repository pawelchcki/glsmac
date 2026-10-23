#include "Base.h"
#include "BaseManager.h"
#include "game/backend/Game.h"
#include "game/backend/map/Map.h"
#include "game/backend/map/tile/Tile.h"
#include "game/backend/slot/Slot.h"
#include "gse/value/Object.h"
#include <limits>

namespace game::backend::base {

std::string Base::ValidateRename( GSE_CALLABLE, const int64_t caller, const int64_t turn, const std::string& previous_name, const std::string& name ) {
	if ( !m_game->IsRunning() || turn <= 0 || uint64_t( turn ) != m_game->GetTurnId() ) { return "Base rename turn is stale"; }
	return ValidateName( GSE_CALL, caller, previous_name, name );
}

std::string Base::ValidateName( GSE_CALLABLE, const int64_t caller, const std::string& previous_name, const std::string& name ) {
	if ( !m_game->GetBM() || m_game->GetBM()->GetBase( m_id ) != this || !m_owner || caller < 0 || size_t( caller ) != m_owner->GetIndex() || !m_owner->GetPlayer() ) { return "Only the live base owner may rename it"; }
	if ( !m_game->GetMap() || !m_tile || m_tile->base != this || m_tile->tiles != m_game->GetMap()->GetTilesPtr() || m_tile->IsLocked() ) { return "Base rename needs its live unlocked tile"; }
	if ( previous_name != m_name ) { return "Base rename name is stale"; }
	if ( name.size() > 24 ) { return "Base rename exceeds the supported ASCII length"; }
	for ( const unsigned char c : name ) { if ( c < 32 || c >= 127 ) { return "Base rename supports printable ASCII only"; } }
	if ( name != m_name && m_game->GetBM()->m_registered_base_names.count( name ) ) { return "Base name is already registered"; }
	return "";
}

int64_t Base::Rename( GSE_CALLABLE, const int64_t caller, const int64_t turn, const std::string& previous_name, const std::string& name ) {
	m_game->CheckRW( GSE_CALL );
	const auto error = ValidateRename( GSE_CALL, caller, turn, previous_name, name );
	if ( !error.empty() ) { GSE_ERROR( gse::EC.GAME_ERROR, error ); }
	return RenameValidated( GSE_CALL, name );
}

int64_t Base::RenameValidated( GSE_CALLABLE, const std::string& name ) {
	m_game->CheckRW( GSE_CALL );
	if ( name == m_name ) { return 0; }
	if ( m_next_rename == std::numeric_limits< int64_t >::max() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Base rename receipts exhausted" ); }
	auto* bm = m_game->GetBM();
	const auto names = bm->m_registered_base_names; const auto updates = bm->m_base_updates; const auto triggers = bm->m_updated_bases;
	const auto old_name = m_name; const auto token = m_next_rename + 1;
	auto* const old_value = VALUE( gse::value::String,, old_name ); auto* const new_value = VALUE( gse::value::String,, name );
	try {
		bm->m_registered_base_names.erase( old_name ); bm->m_registered_base_names.insert( name ); m_name = name;
		for ( auto* wrapper : m_wrapobjs ) { wrapper->Assign( "name", new_value ); }
		m_renames.emplace( token, RenameRecord{ m_game->GetTurnId(), old_name, Serialize( this ).ToString() } );
		bm->RefreshBase( this ); TriggerUpdate(); m_next_rename = token; return token;
	} catch ( ... ) {
		m_name = old_name; for ( auto* wrapper : m_wrapobjs ) { wrapper->Assign( "name", old_value ); }
		bm->m_registered_base_names = names; bm->m_base_updates = updates; bm->m_updated_bases = triggers; m_renames.erase( token ); throw;
	}
}

void Base::RollbackRename( GSE_CALLABLE, const int64_t receipt ) {
	m_game->CheckRW( GSE_CALL );
	if ( !m_game->IsRunning() || m_game->GetBM()->GetBase( m_id ) != this || !m_tile || m_tile->IsLocked() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Base rename rollback is stale" ); }
	if ( receipt == 0 ) { return; }
	const auto it = m_renames.find( receipt );
	if ( it == m_renames.end() || it != std::prev( m_renames.end() ) || it->second.turn != m_game->GetTurnId() || Serialize( this ).ToString() != it->second.expected_base ) { GSE_ERROR( gse::EC.GAME_ERROR, "Base rename receipt is stale or out of order" ); }
	auto* bm = m_game->GetBM();
	if ( bm->m_registered_base_names.count( it->second.previous_name ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Previous base name is now registered" ); }
	const auto names = bm->m_registered_base_names; const auto updates = bm->m_base_updates; const auto triggers = bm->m_updated_bases; const auto old_name = m_name;
	auto* const old_value = VALUE( gse::value::String,, old_name ); auto* const previous_value = VALUE( gse::value::String,, it->second.previous_name );
	try {
		bm->m_registered_base_names.erase( m_name ); bm->m_registered_base_names.insert( it->second.previous_name ); m_name = it->second.previous_name;
		for ( auto* wrapper : m_wrapobjs ) { wrapper->Assign( "name", previous_value ); }
		bm->RefreshBase( this ); TriggerUpdate(); m_renames.erase( it );
	} catch ( ... ) {
		m_name = old_name; for ( auto* wrapper : m_wrapobjs ) { wrapper->Assign( "name", old_value ); }
		bm->m_registered_base_names = names; bm->m_base_updates = updates; bm->m_updated_bases = triggers; throw;
	}
}

}
