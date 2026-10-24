#include "State.h"
#include <algorithm>
#include <bitset>

#include "game/backend/faction/FactionManager.h"
#include "game/backend/faction/Faction.h"
#include "Game.h"
#include "Random.h"
#include "game/backend/connection/Connection.h"
#include "Bindings.h"
#include "game/backend/slot/Slots.h"
#include "Player.h"
#include "GLSMAC.h"
#include "gc/Space.h"
#include "gse/ExecutionPointer.h"
#include "gse/context/Context.h"
#include "gse/value/String.h"
#include "gse/value/Array.h"
#include "gse/value/Int.h"
#include "gse/value/Bool.h"
#include "game/backend/map/tile/Geometry.h"

namespace game {
namespace backend {

State::State( gc::Space* const gc_space, gse::context::Context* const ctx, GLSMAC* glsmac )
	: State( gc_space, ctx, glsmac, true ) {}

State::State( gc::Space* const gc_space, gse::context::Context* const ctx, GLSMAC* glsmac, const bool register_with_gc )
	: gse::GCWrappable( register_with_gc ? gc_space : nullptr )
	, m_gc_space( gc_space )
	, m_ctx( ctx )
	, m_glsmac( glsmac )
	, m_slots( new slot::Slots( this ) ) {
	NEW( m_fm, faction::FactionManager );
}

State::~State() {
	Reset();
	if ( m_bindings ) {
		delete m_bindings;
	}
	if ( m_connection ) {
		m_connection->SetState( nullptr );
	}
	delete m_slots;
	DELETE( m_fm );
}

void State::SetGame( Game* game ) {
	ASSERT( !m_game, "game already set" );
	m_game = game;
	m_on_gse_error = [ this ]( const gse::Exception& e ) -> void {
		m_game->OnGSEError( e );
	};
}

void State::UnsetGame() {
	m_game = nullptr;
	m_on_gse_error = nullptr;
}

Game* State::GetGame() const {
	return m_game;
}

void State::WithGSE( gc::Object* const owner, const gse_func_t& f, const f_cleanup_t& f_cleanup, const bool need_now ) {
	m_gc_space->Accumulate(
		owner,
		[ space = m_gc_space, context = m_ctx, f ]() {
			gse::ExecutionPointer ep;
			f( space, context, {}, ep );
		},
		f_cleanup,
		need_now,
		this // retain State and its context even after the game detaches it
	);
}

void State::Iterate() {
	//std::lock_guard guard( m_connection_mutex );
	if ( m_connection ) {
		if ( m_connection->IterateAndMaybeDelete() ) {
			if ( m_connection ) {
				m_connection->SetState( nullptr );
				m_connection = nullptr;
			}
			for ( auto& player : m_players ) {
				DELETE( player );
			}
			m_players.clear();
			m_slots->Clear();
			m_cid_slots.clear();
		}
	}
}

bool State::IsMaster() {
	//std::lock_guard guard( m_connection_mutex );
	return !m_connection || m_connection->IsServer();
}

bool State::IsSlave() {
	//std::lock_guard guard( m_connection_mutex );
	return m_connection && m_connection->IsClient();
}

bool State::HasOfflineSinglePlayerRoster() const {
	if ( m_connection || m_settings.local.game_mode != settings::LocalSettings::GM_SINGLEPLAYER || m_players.size() != 7 || m_slots->GetCount() != 7 ) { return false; }
	const auto& human = m_slots->GetSlot( 0 );
	if ( human.GetState() != slot::Slot::SS_PLAYER || human.GetPlayer()->GetRole() != Player::PR_SINGLE ) { return false; }
	for ( size_t index = 1; index < 7; ++index ) {
		const auto& opponent = m_slots->GetSlot( index );
		if ( opponent.GetState() != slot::Slot::SS_PLAYER || opponent.GetPlayer()->GetRole() != Player::PR_COMPUTER ) { return false; }
	}
	return true;
}

void State::AddPlayer( Player* player ) {
	Log( "adding player: " + player->GetPlayerName() );
	ASSERT( m_players.find( player ) == m_players.end(), "duplicate player add" );
	m_players.insert( player );
}

std::vector< faction::Faction* > State::ParseSinglePlayerRoster( GSE_CALLABLE, const gse::value::object_properties_t& setup, faction::Faction* human, bool& random_human ) {
	const auto choices = setup.find( "factions" );
	const auto selected_slot = setup.find( "human_slot" );
	const auto mode = setup.find( "random_human" );
	if ( choices == setup.end() || choices->second->type != gse::VT_ARRAY || selected_slot == setup.end() || selected_slot->second->type != gse::VT_INT || mode == setup.end() || mode->second->type != gse::VT_BOOL ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Faction setup requires factions, human_slot and random_human" );
	}
	const auto& ids = static_cast< gse::value::Array* >( choices->second )->value;
	const auto human_slot = static_cast< gse::value::Int* >( selected_slot->second )->value;
	random_human = static_cast< gse::value::Bool* >( mode->second )->value;
	if ( ids.size() != 7 ) { GSE_ERROR( gse::EC.GAME_ERROR, "Choose exactly seven factions for the single-player roster" ); }
	if ( human_slot < 0 || human_slot >= ids.size() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Choose a human faction row from zero through six" ); }
	std::vector< faction::Faction* > roster;
	std::unordered_set< faction::Faction* > selected;
	size_t random_count = 0;
	for ( auto* value : ids ) {
		if ( value->type != gse::VT_STRING ) { GSE_ERROR( gse::EC.GAME_ERROR, "Roster factions must be faction IDs or RANDOM" ); }
		const auto& id = static_cast< gse::value::String* >( value )->value;
		auto* faction = id == "RANDOM" ? nullptr : m_fm->Get( id );
		if ( !faction && id != "RANDOM" ) { GSE_ERROR( gse::EC.GAME_ERROR, "Unknown roster faction: " + id ); }
		if ( faction ) { selected.insert( faction ); } else { ++random_count; }
		roster.push_back( faction );
	}
	if ( random_human ) {
		if ( human ) { GSE_ERROR( gse::EC.GAME_ERROR, "Random human mode requires RANDOM as the human faction" ); }
	}
	else {
		if ( roster.at( human_slot ) != human ) { GSE_ERROR( gse::EC.GAME_ERROR, "The selected roster row must be the human faction" ); }
		auto* selected = roster.at( human_slot ); roster.erase( roster.begin() + human_slot ); roster.insert( roster.begin(), selected );
	}
	if ( random_count > m_fm->GetAll().size() - selected.size() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Not enough available factions for the Random rows" ); }
	return roster;
}

std::string State::GetSinglePlayerMapError() const {
	const auto& map = m_settings.global.map;
	if ( map.type != settings::MapSettings::MT_RANDOM && map.type != settings::MapSettings::MT_CUSTOM ) { return ""; }
	const auto dimensions = map.GetGenerationDimensions();
	return GetSinglePlayerMapError( dimensions.first, dimensions.second );
}

std::string State::GetSinglePlayerMapError( const int64_t width, const int64_t height ) {
	const std::string error = "Choose a larger map: seven factions need starting tiles at least two steps apart";
	if ( width < 4 || height < 2 || width % 2 ) { return error; }
	// A tile has at most eight neighbors at distance one. Greedy placement
	// therefore guarantees seven separated sites on any grid of 55 tiles.
	// Check smaller grids exactly, using the production horizontal wrap and
	// distance metric; tile count alone misses impossible grids such as 4x4.
	const auto columns = width / 2;
	if ( columns >= 55 || height >= 55 || columns * height >= 55 ) { return ""; }
	std::vector< std::pair< size_t, size_t > > tiles;
	for ( size_t y = 0; y < height; ++y ) {
		for ( size_t x = y % 2; x < width; x += 2 ) { tiles.emplace_back( x, y ); }
	}
	std::vector< uint64_t > compatible( tiles.size(), 0 );
	for ( size_t first = 0; first < tiles.size(); ++first ) {
		for ( size_t second = 0; second < tiles.size(); ++second ) {
			if ( map::tile::GetTileDistance( tiles[ first ].first, tiles[ first ].second, tiles[ second ].first, tiles[ second ].second, width ) >= 2 ) {
				compatible[ first ] |= uint64_t( 1 ) << second;
			}
		}
	}
	std::function< bool( uint64_t, size_t ) > fits = [ & ]( uint64_t candidates, const size_t remaining ) {
		if ( !remaining ) { return true; }
		for ( size_t index = 0; index < tiles.size(); ++index ) {
			if ( std::bitset< 64 >( candidates ).count() < remaining ) { return false; }
			const auto bit = uint64_t( 1 ) << index;
			if ( candidates & bit ) {
				candidates &= ~bit;
				if ( fits( candidates & compatible[ index ], remaining - 1 ) ) { return true; }
			}
		}
		return false;
	};
	return fits( ( uint64_t( 1 ) << tiles.size() ) - 1, 7 ) ? "" : error;
}

faction::Faction* State::CreateSinglePlayerFaction( const faction::Faction* source, const std::array< std::string, 6 >* identity ) {
	auto instance = source->Clone();
	if ( identity ) { instance->SetIdentity( *identity ); }
	auto* result = instance.get();
	m_single_player_factions.push_back( std::move( instance ) );
	return result;
}

void State::AddSinglePlayerSlot( faction::Faction* faction, const bool name_confirmed, const std::vector< faction::Faction* >& roster, const bool random_human, const std::array< std::string, 6 >* identity ) {
	ASSERT( !m_connection && m_settings.local.game_mode == settings::LocalSettings::GM_SINGLEPLAYER, "single-player participants require offline single-player" );
	ASSERT( m_players.empty() && m_cid_slots.empty() && m_slots->GetCount() == 0, "single-player participants already initialized" );
	ASSERT( !m_fm->GetAll().empty(), "single-player requires configured factions" );
	ASSERT( !faction || m_fm->Get( faction->m_id ) == faction, "single-player faction is not configured" );
	m_single_player_roster = roster;
	m_single_player_random_human = random_human;
	m_slots->Resize( 7 ); // TODO: make dynamic?
	const auto& difficulty = m_settings.global.rules.m_difficulty_levels.GetString( m_settings.global.difficulty_level );
	if ( !name_confirmed && m_settings.local.player_name.empty() ) {
		m_settings.local.player_name = "Player";
	}
	auto* human_faction = faction ? CreateSinglePlayerFaction( faction, identity ) : nullptr;
	NEWV( player, Player, m_settings.local.player_name, Player::PR_SINGLE, human_faction, difficulty );
	AddPlayer( player );
	const size_t slot_num = 0; // player always has slot 0
	AddCIDSlot( 0, slot_num );
	auto& slot = m_slots->GetSlot( slot_num );
	slot.SetPlayer( player, 0, "" );
	slot.SetPlayerFlag( slot::PF_READY );
	slot.SetLinkedGSID( m_settings.local.account.GetGSID() );

	// Keep Random unresolved until the ordinary native startup stage, when
	// the backend RNG is available. Explicit selections can fill immediately.
	bool has_random = !faction || random_human;
	for ( auto* selected : roster ) { if ( !selected ) { has_random = true; } }
	if ( !has_random ) { FinalizeSinglePlayerRoster(); }
}

void State::FinalizeSinglePlayerRoster() {
	ASSERT( !m_connection && m_settings.local.game_mode == settings::LocalSettings::GM_SINGLEPLAYER, "single-player participants require offline single-player" );
	ASSERT( m_slots->GetCount() == 7 && m_slots->GetSlot( 0 ).GetState() == slot::Slot::SS_PLAYER, "single-player human slot is missing" );
	auto* human = m_slots->GetSlot( 0 ).GetPlayer();
	ASSERT( human->GetRole() == Player::PR_SINGLE, "single-player human role is missing" );
	if ( m_players.size() > 1 ) { return; }
	const auto factions = m_fm->GetAll();
	ASSERT( !factions.empty(), "single-player requires configured factions" );
	if ( !m_single_player_roster.empty() ) {
		// Reserve every explicit choice before drawing any Random slot.
		// Resolve only at native startup, when the game RNG is available.
		auto available = factions;
		for ( auto* selected : m_single_player_roster ) {
			if ( selected ) { available.erase( std::remove( available.begin(), available.end(), selected ), available.end() ); }
		}
		for ( auto*& selected : m_single_player_roster ) {
			if ( !selected ) {
				ASSERT( m_game && m_game->GetRandom() && !available.empty(), "random roster resolution requires initialized game RNG" );
				const auto index = m_game->GetRandom()->GetUInt( 0, available.size() - 1 );
				selected = available.at( index ); available.erase( available.begin() + index );
			}
		}
		if ( m_single_player_random_human ) {
			const auto index = m_game->GetRandom()->GetUInt( 0, m_single_player_roster.size() - 1 );
			auto* selected = m_single_player_roster.at( index );
			m_single_player_roster.erase( m_single_player_roster.begin() + index );
			m_single_player_roster.insert( m_single_player_roster.begin(), selected );
		}
		if ( !human->GetFaction() ) { human->SetFaction( CreateSinglePlayerFaction( m_single_player_roster.front() ) ); }
		const auto& difficulty = human->GetDifficultyLevel();
		for ( size_t index = 1; index < m_single_player_roster.size(); ++index ) {
			auto* selected = CreateSinglePlayerFaction( m_single_player_roster.at( index ) );
			NEWV( opponent, Player, selected->m_name, Player::PR_COMPUTER, selected, difficulty );
			AddPlayer( opponent );
			auto& slot = m_slots->GetSlot( index ); slot.SetPlayer( opponent, 0, "" ); slot.SetPlayerFlag( slot::PF_READY );
		}
		m_single_player_roster.clear();
		m_single_player_random_human = false;
		return;
	}
	auto* faction = human->GetFaction();
	if ( !faction ) {
		ASSERT( m_game && m_game->GetRandom(), "random faction resolution requires initialized game RNG" );
		faction = CreateSinglePlayerFaction( factions.at( m_game->GetRandom()->GetUInt( 0, factions.size() - 1 ) ) );
		human->SetFaction( faction );
	}
	const auto& difficulty = human->GetDifficultyLevel();

	// Faction-manager order is declared by the active game script. Keep the
	// selected faction in the local slot and fill the remaining six slots from
	// that catalog without duplicating it or manufacturing network clients.
	size_t next_slot = 1;
	for ( auto* opponent_faction : factions ) {
		if ( opponent_faction->m_id == faction->m_id ) { continue; }
		if ( next_slot == m_slots->GetCount() ) { break; }
		auto* instance = CreateSinglePlayerFaction( opponent_faction );
		NEWV( opponent, Player, instance->m_name, Player::PR_COMPUTER, instance, difficulty );
		AddPlayer( opponent );
		auto& opponent_slot = m_slots->GetSlot( next_slot++ );
		opponent_slot.SetPlayer( opponent, 0, "" );
		opponent_slot.SetPlayerFlag( slot::PF_READY );
	}
}

void State::RemovePlayer( Player* player ) {
	Log( "removing player: " + player->GetPlayerName() );
#if defined( DEBUG ) || defined( FASTDEBUG )
	ASSERT( m_players.find( player ) != m_players.end(), "player not found" );
	for ( auto& it : m_cid_slots ) {
		ASSERT( m_slots->GetSlot( it.second ).GetPlayer() != player, "player still in cid slots" );
	}
#endif
	m_players.erase( player );
}

void State::AddCIDSlot( const network::cid_t cid, const size_t slot ) {
	Log( "adding CID " + std::to_string( cid ) + " for slot " + std::to_string( slot ) );
#if defined( DEBUG ) || defined( FASTDEBUG )
	ASSERT( m_cid_slots.find( cid ) == m_cid_slots.end(), "duplicate cid add" );
	for ( auto& it : m_cid_slots ) {
		ASSERT( it.second != slot, "slot " + std::to_string( slot ) + " already in cids" );
	}
#endif
	m_cid_slots[ cid ] = slot;
}

const bool State::HasCIDSlot( const network::cid_t cid ) {
	return m_cid_slots.find( cid ) != m_cid_slots.end();
}

void State::RemoveCIDSlot( const network::cid_t cid ) {
	Log( "removing CID " + std::to_string( cid ) );
	ASSERT( m_cid_slots.find( cid ) != m_cid_slots.end(), "cid not found" );
	m_cid_slots.erase( cid );
}

const std::unordered_map< network::cid_t, size_t >& State::GetCidSlots() const {
	return m_cid_slots;
}

void State::SetConnection( connection::Connection* connection ) {
	//std::lock_guard guard( m_connection_mutex );
	ASSERT( !m_connection, "state connection already set" );
	ASSERT( connection, "connection is null" );
	connection->SetState( this );
	m_connection = connection;
}

connection::Connection* State::GetConnection() {
	//std::lock_guard guard( m_connection_mutex );
	return m_connection;
}

void State::Reset() {
	{
		//std::lock_guard guard( m_connection_mutex );
		if ( m_connection ) {
			if ( m_connection->IsConnected() ) {
				auto* connection = m_connection;
				m_connection->m_on_disconnect = [ connection ]() -> bool {
					// TODO: do this synchronously?
					return true;
				};
				m_connection->Disconnect();
			}
			m_connection->SetState( nullptr );
			m_connection = nullptr;
		}
	}
	for ( auto& player : m_players ) {
		DELETE( player );
	}
	m_players.clear();
	m_single_player_roster.clear();
	m_single_player_random_human = false;
	m_slots->Clear();
	m_cid_slots.clear();
	m_single_player_factions.clear();
	m_game = nullptr;
	m_on_gse_error = nullptr;
}

void State::DetachConnection() {
	if ( m_connection ) {
		m_connection->SetState( nullptr );
		m_connection = nullptr;
	}
}

faction::FactionManager* State::GetFM() const {
	return m_fm;
}

gse::Value* const State::TriggerObject( gse::GCWrappable* object, const std::string& event, const gse::f_args_t& f_args ) {
	CHECKACCUM( m_gc_space );
	// State already owns the script context used by WithGSE. Dispatch here
	// rather than requiring the application's UI/singleton just to call the
	// same native Wrappable dispatcher (including in asset-free fixtures).
	gse::ExecutionPointer ep;
	return object->Trigger( m_gc_space, m_ctx, {}, ep, event, f_args );
}

WRAPIMPL_BEGIN( State )
	WRAPIMPL_PROPS
		WRAPIMPL_TRIGGERS
		{
			"fm",
			m_fm->Wrap( GSE_CALL )
		},
	};
WRAPIMPL_END_PTR()

UNWRAPIMPL_PTR( State )

const types::Buffer State::Serialize() const {
	types::Buffer buf;

	buf.WriteString( m_settings.global.Serialize().ToString() );
	buf.WriteString( m_fm->Serialize().ToString() );

	return buf;
}

void State::Deserialize( types::Buffer buf ) {
	m_settings.global.Deserialize( buf.ReadString() );
	m_fm->Deserialize( buf.ReadString() );
}

void State::GetReachableObjects( std::unordered_set< Object* >& reachable_objects ) {
	gse::GCWrappable::GetReachableObjects( reachable_objects );

	GC_DEBUG_BEGIN( "State" );
	GC_DEBUG_BEGIN( "context" );
	GC_REACHABLE( m_ctx );
	GC_DEBUG_END();

	if ( m_game ) {
		GC_DEBUG_BEGIN( "game" );
		GC_REACHABLE( m_game );
		GC_DEBUG_END();
	}

	if ( m_connection ) {
		GC_DEBUG_BEGIN( "connection" );
		GC_REACHABLE( m_connection );
		GC_DEBUG_END();
	}

	GC_DEBUG_END();
}

}
}
