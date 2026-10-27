#include "Game.h"
#include <memory>

#include "engine/Engine.h"
#include "types/Exception.h"
#include "types/texture/Texture.h"
#include "types/mesh/Render.h"
#include "types/mesh/Data.h"
#include "util/FS.h"
#include "types/Buffer.h"
#include "State.h"
#include "game/backend/faction/Faction.h"
#include "game/backend/faction/FactionManager.h"
#include "Random.h"
#include "config/Config.h"
#include "slot/Slots.h"
#include "Player.h"
#include "connection/Connection.h"
#include "connection/Server.h"
#include "connection/Client.h"
#include "map/Map.h"
#include "map/Consts.h"
#include "gse/value/String.h"
#include "gse/value/Int.h"
#include "gse/value/Undefined.h"
#include "gse/value/Array.h"
#include "map/tile/TileManager.h"
#include "map/tile/Tiles.h"
#include "map/MapState.h"
#include "game/backend/resource/ResourceManager.h"
#include <resource/ResourceManager.h>
#include "Bindings.h"
#include "graphics/Graphics.h"
#include "animation/Def.h"
#include "unit/Def.h"
#include "unit/UnitManager.h"
#include "unit/Unit.h"
#include "unit/MoraleSet.h"
#include "base/BaseManager.h"
#include "base/PopDef.h"
#include "base/Base.h"
#include "base/ProductionCost.h"
#include "animation/AnimationManager.h"
#include "gc/Space.h"
#include "game/backend/event/Event.h"
#include "game/backend/event/EventHandler.h"
#include "gse/value/Bool.h"
#include "technology/Bindings.h"
#include "technology/Serialization.h"
#include "map/tile/GeometryBindings.h"

namespace game {
namespace backend {

response_map_data_t::~response_map_data_t() {
	if ( terrain_texture ) {
		DELETE( terrain_texture );
	}
	if ( terrain_mesh ) {
		DELETE( terrain_mesh );
	}
	if ( terrain_data_mesh ) {
		DELETE( terrain_data_mesh );
	}
};

Game::Game()
	: gse::GCWrappable( nullptr ) {}

common::mt_id_t Game::MT_Ping() {
	MT_Request request = {};
	request.op = OP_PING;
	return MT_CreateRequest( request );
}

common::mt_id_t Game::MT_Init( State* state, const bool interactive_opening ) {
 	MT_Request request = {};
	request.op = OP_INIT;
	request.data.init.interactive_opening = interactive_opening;
	return MT_CreateRequest( request );
}

common::mt_id_t Game::MT_GetMapData() {
	MT_Request request = {};
	request.op = OP_GET_MAP_DATA;
	return MT_CreateRequest( request );
}

common::mt_id_t Game::MT_Reset() {
	m_init_cancel = true; // stop initialization in Iterate()
	MT_Request request = {};
	request.op = OP_RESET;
	return MT_CreateRequest( request );
}

common::mt_id_t Game::MT_SaveMap( const std::string& path ) {
	ASSERT( !path.empty(), "savemap path is empty" );
	MT_Request request = {};
	request.op = OP_SAVE_MAP;
	NEW( request.data.save_map.path, std::string );
	*request.data.save_map.path = path;
	return MT_CreateRequest( request );
}

common::mt_id_t Game::MT_GetFrontendRequests() {
	MT_Request request = {};
	request.op = OP_GET_FRONTEND_REQUESTS;
	return MT_CreateRequest( request );
}

common::mt_id_t Game::MT_SendBackendRequests( const std::vector< BackendRequest >& requests ) {
	MT_Request request = {};
	request.op = OP_SEND_BACKEND_REQUESTS;
	NEW( request.data.send_backend_requests.requests, std::vector< BackendRequest >, requests );
	return MT_CreateRequest( request );
}

#ifdef DEBUG
#define x( _method, _op ) \
    common::mt_id_t Game::_method( const std::string& path ) { \
        ASSERT( !path.empty(), "dump path is empty" ); \
        MT_Request request = {}; \
        request.op = _op; \
        NEW( request.data.dump.path, std::string ); \
        *request.data.dump.path = path; \
        return MT_CreateRequest( request ); \
    }

x( MT_SaveDump, OP_SAVE_DUMP )

x( MT_LoadDump, OP_LOAD_DUMP )

#undef x
#endif

void Game::Start() {
	MTModule::Start();

	MTModule::Log( "Starting thread" );

	m_game_state = GS_NONE;
	m_init_cancel = false;

	ASSERT( !m_pending_frontend_requests, "frontend requests already set" );
	NEW( m_pending_frontend_requests, std::vector< FrontendRequest > );

	NEW( m_random, Random, this );

	const auto* config = g_engine->GetConfig();
	if ( config->HasLaunchFlag( config::Config::LF_QUICKSTART_SEED ) ) {
		m_random->SetState( config->GetQuickstartSeed() );
	}

}

void Game::Stop() {
	MTModule::Log( "Stopping thread" );

	if ( m_state ) {
	   m_state = nullptr;
	}

	ResetGame();

	m_tm = nullptr;
	m_rm = nullptr;
	m_um = nullptr;
	m_bm = nullptr;
	m_am = nullptr;

	DELETE( m_pending_frontend_requests );
	m_pending_frontend_requests = nullptr;

	DELETE( m_random );
	m_random = nullptr;

	MTModule::Stop();
}

void Game::Iterate() {
	FlushEnergyChanges();
	MTModule::Iterate();

	State* state;
	uint64_t generation;
	{ std::lock_guard guard( m_startup_mutex ); state = m_state; generation = m_startup_generation; }
	if ( state ) { state->Iterate(); }

	if ( m_game_state == GS_INITIALIZING ) {

		ASSERT( m_state, "state is null" );

		if ( !m_state->IsMaster() ) {
			ASSERT( m_state->m_connection, "not master but no connection" );
			// notify server of successful download and continue initialization
			m_slot->SetPlayerFlag( slot::PF_MAP_DOWNLOADED );
			m_state->m_connection->UpdateSlot( m_slot_num, m_slot, true );
		}

		auto ec = m_map->Initialize( m_init_cancel );
		if ( !ec && m_init_cancel ) {
			ec = map::Map::EC_ABORTED;
		}

		if ( !ec ) {

#ifdef DEBUG
			const auto* config = g_engine->GetConfig();
			// also handy to have dump of generated map
			if (
				!ec &&
					config->HasDebugFlag( config::Config::DF_MAPDUMP ) &&
					!config->HasDebugFlag( config::Config::DF_QUICKSTART_MAP_DUMP ) // no point saving if we just loaded it
				) {
				MTModule::Log( (std::string)"Saving map dump to " + config->GetDebugPath() + map::s_consts.debug.lastdump_filename );
				SetLoaderText( "Saving dump" );
				util::FS::WriteFile( config->GetDebugPath() + map::s_consts.debug.lastdump_filename, m_map->Serialize().ToString() );
			}
#endif

			ASSERT( m_map, "map not set" );

			NEW( m_response_map_data, response_map_data_t );

			m_response_map_data->map_width = m_map->GetWidth();
			m_response_map_data->map_height = m_map->GetHeight();

			ASSERT( m_map->m_textures.terrain, "map terrain texture not generated" );
			m_response_map_data->terrain_texture = m_map->m_textures.terrain;

			ASSERT( m_map->m_meshes.terrain, "map terrain mesh not generated" );
			m_response_map_data->terrain_mesh = m_map->m_meshes.terrain;

			ASSERT( m_map->m_meshes.terrain_data, "map terrain data mesh not generated" );
			m_response_map_data->terrain_data_mesh = m_map->m_meshes.terrain_data;

			m_response_map_data->sprites.actors = &m_map->m_sprite_actors;
			m_response_map_data->sprites.instances = &m_map->m_sprite_instances;

			m_response_map_data->tiles = m_map->GetTilesPtr()->GetTilesPtr();
			m_response_map_data->tile_states = m_map->GetMapState()->GetTileStatesPtr();

			if ( m_old_map ) {
				MTModule::Log( "Destroying old map state" );
				DELETE( m_old_map );
				m_old_map = nullptr;
			}

			// notify server of successful initialization
			m_slot->SetPlayerFlag( slot::PF_GAME_INITIALIZED );
			if ( m_state->m_connection ) {
				m_state->m_connection->UpdateSlot( m_slot_num, m_slot, true );
			}

			{
				const auto factions = m_state->GetFM()->GetAll();
				NEWV( faction_defines, FrontendRequest::faction_defines_t );
				for ( const auto& faction : factions ) {
					faction_defines->push_back( faction );
				}
				auto fr = FrontendRequest( FrontendRequest::FR_FACTION_DEFINE );
				fr.data.faction_define.factiondefs = faction_defines;
				AddFrontendRequest( fr );
			}

			{
				const auto& slots = m_state->m_slots->GetSlots();
				NEWV( slot_defines, FrontendRequest::slot_defines_t );
				for ( const auto& slot : slots ) {
					if ( slot.GetState() == slot::Slot::SS_OPEN || slot.GetState() == slot::Slot::SS_CLOSED ) {
						continue;
					}
					ASSERT( slot.GetState() == slot::Slot::SS_PLAYER, "unknown slot state: " + std::to_string( slot.GetState() ) );
					auto* player = slot.GetPlayer();
					ASSERT( player, "slot player not set" );
					ASSERT( player->GetFaction(), "slot player faction not set" );
					slot_defines->push_back(
						FrontendRequest::slot_define_t{
							slot.GetIndex(),
							player->GetFaction()->m_id
						}
					);
				}
				auto fr = FrontendRequest( FrontendRequest::FR_SLOT_DEFINE );
				fr.data.slot_define.slotdefs = slot_defines;
				AddFrontendRequest( fr );
			}

			HideLoader();

			m_game_state = GS_STARTING;

			state->WithGSE( this, [ this, generation ]( GSE_CALLABLE ) {
				std::lock_guard guard( m_startup_mutex );
				if ( generation != m_startup_generation || !m_state ) { return; }

				if ( m_state->IsMaster() ) {
					try {
						m_state->TriggerObject(
							this, "create_world", ARGS_F( this ) {
								{
									"game",
									Wrap( GSE_CALL )
								},
							}; }
						);
						InitComplete( GSE_CALL );
					}
					catch ( const gse::Exception& e ) {
						MTModule::Log( (std::string)"Initialization failed: " + e.ToString() );
						InitFailed( e.what() );
						return;
					}
					if ( m_game_state == GS_RUNNING && m_opening_phase == OPENING_NONE ) {
						FirstTurn( GSE_CALL );
					}
				}
				else {
					InitComplete( GSE_CALL );
				}

				if ( m_game_state == GS_RUNNING ) {
					ProcessEvents();
					CheckTurnComplete();
				}

			});

		}
		else {
			InitFailed( map::Map::GetErrorString( ec ) );
		}
	}
	if ( state ) {
		// Queue outside the startup mutex: the owner drain holds the pending
		// accumulation lock before entering these guarded callbacks.
		state->WithGSE( this, [ this, generation ]( GSE_CALLABLE ) {
			std::lock_guard guard( m_startup_mutex );
			if ( generation != m_startup_generation || !m_state ) { return; }
			ProcessEventResponses();
			ProcessEvents();
		});
		state->WithGSE( this, [ this, generation ]( GSE_CALLABLE ) {
			std::lock_guard guard( m_startup_mutex );
			if ( generation != m_startup_generation || !m_state ) { return; }
			if ( m_bm ) { m_bm->TriggerUpdates( GSE_CALL ); }
			UpdateOpening( GSE_CALL );
			// These operations can call WithGSE themselves. On the owner thread
			// nested accumulation is immediate, avoiding a reverse pending lock.
			if ( m_um ) { m_um->PushUpdates(); }
			if ( m_tm ) { m_tm->ProcessTileLockRequests(); }
		});
	}
	// These native-only update paths do not enqueue script callbacks.
	std::lock_guard guard( m_startup_mutex );
	if ( m_map ) { m_map->PushUpdates(); }
	if ( m_bm ) { m_bm->PushUpdates(); }
}

const bool Game::IsStarted() const {
	return m_game_state != GS_NONE;
}

Random* Game::GetRandom() const {
	return m_random;
}

map::Map* Game::GetMap() const {
	ASSERT( m_map, "backend game map is null" );
	return m_map;
}

State* Game::GetState() const {
	ASSERT( m_state, "state not set" );
	return m_state;
}

const Player* Game::GetPlayer() const {
	ASSERT( m_state, "state not set" );
	if ( m_state->m_connection ) {
		return m_state->m_connection->GetPlayer();
	}
	else {
		return m_state->m_slots->GetSlot( 0 ).GetPlayer();
	}
}

const size_t Game::GetSlotNum() const {
	return m_slot_num;
}

void Game::ShowLoader( const std::string& text ) {
	auto fr = FrontendRequest( FrontendRequest::FR_LOADER_SHOW );
	NEW( fr.data.loader.text, std::string, text );
	AddFrontendRequest( fr );
}

void Game::SetLoaderText( const std::string& text ) {
	auto fr = FrontendRequest( FrontendRequest::FR_LOADER_TEXT );
	NEW( fr.data.loader.text, std::string, text );
	AddFrontendRequest( fr );
	ProcessRequests(); // allow frontend to update % while backend is busy
}

void Game::HideLoader() {
	auto fr = FrontendRequest( FrontendRequest::FR_LOADER_HIDE );
	AddFrontendRequest( fr );
}

void Game::AddEvent( event::Event* const event ) {
	std::lock_guard guard( m_pending_events_mutex );
	m_pending_events.push_back( event );
}

void Game::AddEventResponse( const std::string& event_id, const bool result, gse::Value* const resolved ) {
	std::lock_guard guard( m_pending_event_responses_mutex );
	m_pending_event_responses.push_back({
		event_id,
		result,
		resolved
	});
}

void Game::ClearEvents() {
	std::lock_guard guard( m_event_handlers_mutex );
/*#if defined( DEBUG ) || defined( FASTDEBUG )
	for ( const auto& it : m_event_handlers ) {
		g_engine->Log( "Removing event: \"" + it.first + "\"" );
	}
#endif*/
	m_event_handlers.clear();
}

void Game::Event( GSE_CALLABLE, const std::string& name, const gse::value::object_properties_t& args ) {
	{
		std::lock_guard guard( m_event_handlers_mutex );
		const auto& it = m_event_handlers.find( name );
		if ( it == m_event_handlers.end() ) {
			return;
		}
	}
	AddEvent( new event::Event( this, event::Event::ES_LOCAL, m_slot_num, GSE_CALL, name, args ) );
}

WRAPIMPL_BEGIN( Game )
	WRAPIMPL_PROPS
	WRAPIMPL_TRIGGERS
	WRAPIMPL_CUSTOM_SETTERS
		{ "validate_unit_disband", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 3 ); N_GETVALUE( id, 0, Int ); N_GETVALUE( caller, 1, Int ); N_GETVALUE( turn, 2, Int );
			const auto error = ValidateUnitDisband( id, caller, turn );
			return error.empty() ? (gse::Value*)VALUE( gse::value::Undefined ) : VALUE( gse::value::String,, error );
		} ) },
		{ "disband_unit", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 3 ); N_GETVALUE( id, 0, Int ); N_GETVALUE( caller, 1, Int ); N_GETVALUE( turn, 2, Int );
			return DisbandUnit( GSE_CALL, id, caller, turn );
		} ) },
		{ "get_unit_disband_base", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 3 ); N_GETVALUE( id, 0, Int ); N_GETVALUE( caller, 1, Int ); N_GETVALUE( turn, 2, Int );
			const auto error = ValidateUnitDisband( id, caller, turn ); if ( !error.empty() ) { GSE_ERROR( gse::EC.GAME_ERROR, error ); }
			return VALUE( gse::value::Int,, GetUnitDisbandBase( id ) );
		} ) },
		{ "rollback_unit_disband", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 1 ); N_GETVALUE( receipt, 0, Object );
			N_GETPROP( token, receipt, "transaction_id", Int ); N_GETPROP( id, receipt, "unit_id", Int );
			N_GETPROP( caller, receipt, "owner", Int ); N_GETPROP( turn, receipt, "turn_id", Int );
			N_GETPROP( base, receipt, "base_id", Int );
			RollbackUnitDisband( GSE_CALL, token, id, caller, turn, base ); return VALUE( gse::value::Undefined );
		} ) },
		{ "validate_found_base_unit", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 2 ); N_GETVALUE( id, 0, Int ); N_GETVALUE( caller, 1, Int );
			const auto error = ValidateFoundBaseUnit( id, caller );
			return error.empty() ? (gse::Value*)VALUE( gse::value::Undefined ) : VALUE( gse::value::String,, error );
		} ) },
		{ "is_found_base_adjacent", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 2 ); N_GETVALUE( id, 0, Int ); N_GETVALUE( caller, 1, Int );
			const auto error = ValidateFoundBaseUnit( id, caller ); if ( !error.empty() ) { GSE_ERROR( gse::EC.GAME_ERROR, error ); }
			return VALUE( gse::value::Bool,, IsFoundBaseAdjacent( id ) );
		} ) },
		{ "validate_found_base", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 2 ); N_GETVALUE( id, 0, Int ); N_GETVALUE( caller, 1, Int );
			const auto error = ValidateFoundBase( id, caller );
			return error.empty() ? (gse::Value*)VALUE( gse::value::Undefined ) : VALUE( gse::value::String,, error );
		} ) },
		{ "found_base", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 3 ); N_GETVALUE( id, 0, Int ); N_GETVALUE( caller, 1, Int ); N_GET_CALLABLE( chooser, 2 );
			return FoundBase( GSE_CALL, id, caller, chooser );
		} ) },
		{ "preview_found_base", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 2 ); N_GETVALUE( id, 0, Int ); N_GETVALUE( caller, 1, Int );
			const auto error = ValidateFoundBase( id, caller ); if ( !error.empty() ) { GSE_ERROR( gse::EC.GAME_ERROR, error ); }
			const auto* unit = m_um->GetUnit( id );
			return VALUE( gse::value::String,, m_bm->ResolveName( unit->m_owner->GetPlayer()->GetFaction(), unit->GetTile()->is_water_tile ) );
		} ) },
		{ "validate_named_found_base", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 4 ); N_GETVALUE( id, 0, Int ); N_GETVALUE( caller, 1, Int ); N_GETVALUE( turn, 2, Int ); N_GETVALUE( name, 3, String );
			const auto error = ValidateNamedFoundBase( id, caller, turn, name );
			return error.empty() ? (gse::Value*)VALUE( gse::value::Undefined ) : VALUE( gse::value::String,, error );
		} ) },
		{ "found_named_base", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 5 ); N_GETVALUE( id, 0, Int ); N_GETVALUE( caller, 1, Int ); N_GETVALUE( turn, 2, Int ); N_GETVALUE( name, 3, String ); N_GET_CALLABLE( chooser, 4 );
			return FoundBase( GSE_CALL, id, caller, chooser, &name, turn );
		} ) },
		{ "rollback_found_base", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 1 ); N_GETVALUE( receipt, 0, Object );
			N_GETPROP( token, receipt, "transaction_id", Int ); N_GETPROP( id, receipt, "base_id", Int );
			RollbackFoundBase( GSE_CALL, token, id );
			return VALUE( gse::value::Undefined );
		} ) },
		{ "validate_join_base", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 3 ); N_GETVALUE( id, 0, Int ); N_GETVALUE( base, 1, Int ); N_GETVALUE( caller, 2, Int );
			const auto error = ValidateJoinBase( id, base, caller );
			return error.empty() ? (gse::Value*)VALUE( gse::value::Undefined ) : VALUE( gse::value::String,, error );
		} ) },
		{ "join_base", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 3 ); N_GETVALUE( id, 0, Int ); N_GETVALUE( base, 1, Int ); N_GETVALUE( caller, 2, Int );
			return JoinBase( GSE_CALL, id, base, caller );
		} ) },
		{ "rollback_join_base", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 1 ); N_GETVALUE( receipt, 0, Object );
			N_GETPROP( token, receipt, "transaction_id", Int ); N_GETPROP( id, receipt, "base_id", Int );
			RollbackJoinBase( GSE_CALL, token, id );
			return VALUE( gse::value::Undefined );
		} ) },
		{ "technologies", technology::WrapTable( GSE_CALL, m_technologies, this ) },
		{ "get_research_state", NATIVE_CALL( this ) { N_EXPECT_ARGS( 1 ); N_GETVALUE( player, 0, Int ); return GetResearchState( GSE_CALL, player ); } ) },
		{ "get_research_science", NATIVE_CALL( this ) { N_EXPECT_ARGS( 1 ); N_GETVALUE( player, 0, Int ); return GetResearchScience( GSE_CALL, player ); } ) },
		{ "validate_research_credit", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 3 ); N_GETVALUE( player, 0, Int ); N_GETVALUE( turn, 1, Int ); N_GETVALUE( income, 2, Int );
			const auto error = ValidateResearchCredit( player, turn, income ); return error.empty() ? (gse::Value*)VALUE( gse::value::Undefined ) : VALUE( gse::value::String,, error );
		} ) },
		{ "credit_research", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 3 ); N_GETVALUE( player, 0, Int ); N_GETVALUE( turn, 1, Int ); N_GETVALUE( income, 2, Int );
			return CreditResearch( GSE_CALL, player, turn, income );
		} ) },
		{ "validate_research_target", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 2 ); N_GETVALUE( player, 0, Int ); N_GETVALUE( target, 1, Int );
			const auto error = ValidateResearchTarget( player, target ); return error.empty() ? (gse::Value*)VALUE( gse::value::Undefined ) : VALUE( gse::value::String,, error );
		} ) },
		{ "validate_research_priority", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 2 ); N_GETVALUE( player, 0, Int ); N_GETVALUE( priority, 1, Int );
			const auto error = ValidateResearchPriority( player, priority ); return error.empty() ? (gse::Value*)VALUE( gse::value::Undefined ) : VALUE( gse::value::String,, error );
		} ) },
		{ "select_research_target", NATIVE_CALL( this ) { N_EXPECT_ARGS( 2 ); N_GETVALUE( player, 0, Int ); N_GETVALUE( target, 1, Int ); return SelectResearchTarget( GSE_CALL, player, target ); } ) },
		{ "set_research_priority", NATIVE_CALL( this ) { N_EXPECT_ARGS( 3 ); N_GETVALUE( player, 0, Int ); N_GETVALUE( priority, 1, Int ); N_GETVALUE( enabled, 2, Bool ); return SetResearchPriority( GSE_CALL, player, priority, enabled ); } ) },
		{ "rollback_research", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 1 ); N_GETVALUE( receipt, 0, Object ); N_GETPROP( player, receipt, "player_id", Int ); N_GETPROP( token, receipt, "token", Int ); N_GETPROP( turn, receipt, "turn_id", Int );
			RollbackResearch( GSE_CALL, player, token, turn ); return VALUE( gse::value::Undefined );
		} ) },
		{ "geometry", map::tile::WrapGeometry( GSE_CALL ) },
		{
			"is_master",
			NATIVE_CALL( this ) {
				return VALUE( gse::value::Bool, , m_state->IsMaster() );
			} ),
		},
		{
			"is_slave",
			NATIVE_CALL( this ) {
			return VALUE( gse::value::Bool, , m_state->IsSlave() );
		} ),
		},
		{
			"random",
			m_random->Wrap( GSE_CALL )
		},
		{
			"message",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 1 );
				N_GETVALUE( text, 0, String );
				Message( text );
				return VALUE( gse::value::Undefined );
			})
		},
		{
			"get_player",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS_MIN_MAX( 0, 1 );
				size_t slot_id = m_slot_num;
				if ( arguments.size() > 0 ) {
					N_GETVALUE( id, 0, Int );
					slot_id = id;
				}
				auto& slots = m_state->m_slots->GetSlots();
				if ( slot_id < slots.size() ) {
					auto& slot = slots.at( slot_id );
					return slot.Wrap( GSE_CALL );
				}
				GSE_ERROR( gse::EC.GAME_ERROR, "Player id " + std::to_string( slot_id ) + " not found" );
			}),
		},
		{
			"get_players",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				auto& slots = m_state->m_slots->GetSlots();
				gse::value::array_elements_t elements = {};
				for ( auto& slot : slots ) {
					const auto state = slot.GetState();
					if ( state == slot::Slot::SS_OPEN || state == slot::Slot::SS_CLOSED ) {
						continue; // skip
					}
					elements.push_back( slot.Wrap( GSE_CALL ) );
				}
				return VALUE( gse::value::Array,, elements );
			} )
		},
		{ "get_contacts", NATIVE_CALL( this ) {
			N_EXPECT_ARGS( 0 );
			gse::value::array_elements_t contacts;
			for ( const auto id : m_contacts.at( m_slot_num ) ) { contacts.push_back( VALUE( gse::value::Int,, id ) ); }
			return VALUE( gse::value::Array,, contacts );
		} ) },
		{ "get_opening_state", NATIVE_CALL( this ) { N_EXPECT_ARGS( 0 ); return GetOpeningState( GSE_CALL ); } ) },
		{ "set_auto_end_turn", NATIVE_CALL( this ) { N_EXPECT_ARGS( 1 ); N_GETVALUE( enabled, 0, Bool ); if ( !m_state || m_state->m_connection || m_state->m_settings.local.game_mode != settings::LocalSettings::GM_SINGLEPLAYER ) { GSE_ERROR( gse::EC.GAME_ERROR, "Automatic end turn requires offline single-player" ); } m_auto_end_turn = enabled; return VALUE( gse::value::Undefined ); } ) },
		{ "validate_opening", NATIVE_CALL( this ) { N_EXPECT_ARGS( 6 ); N_GETVALUE( caller, 0, Int ); N_GETVALUE( session, 1, Int ); N_GETVALUE( action, 2, String ); N_GETVALUE( id, 3, Int ); N_GETVALUE( previous, 4, String ); N_GETVALUE( name, 5, String ); const auto error = ValidateOpening( GSE_CALL, caller, session, action, id, previous, name ); return error.empty() ? (gse::Value*)VALUE( gse::value::Undefined ) : VALUE( gse::value::String,, error ); } ) },
		{ "apply_opening", NATIVE_CALL( this ) { N_EXPECT_ARGS( 6 ); N_GETVALUE( caller, 0, Int ); N_GETVALUE( session, 1, Int ); N_GETVALUE( action, 2, String ); N_GETVALUE( id, 3, Int ); N_GETVALUE( previous, 4, String ); N_GETVALUE( name, 5, String ); ApplyOpening( GSE_CALL, caller, session, action, id, previous, name ); return VALUE( gse::value::Undefined ); } ) },
		{
			"get_turn",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				return VALUE( gse::value::Int,, m_current_turn.GetId() );
			} )
		},
		{
			"get_year",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				return VALUE( gse::value::Int,, m_current_turn.GetId() + 2100 /* TODO: better way to define starting year? */ );
			} )
		},
		{
			"is_turn_complete",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 1 );
				N_GETVALUE( slot_id, 0, Int );

				const auto& slots = m_state->m_slots->GetSlots();
				if ( slot_id >= slots.size() ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Player id " + std::to_string( slot_id ) + " not found" );
				}

				const auto& slot = slots.at( slot_id );
				ASSERT( slot.GetState() != slot::Slot::SS_PLAYER || slot.GetPlayer(), "player is null" );
				return VALUE( gse::value::Bool,,
					slot.GetState() == slot::Slot::SS_PLAYER
						? slot.GetPlayer()->IsTurnCompleted()
						: true // ai has always turn completed during turns of players
				);
			} )
		},
		{
			"complete_turn",
			NATIVE_CALL( this ) {

				CheckRW( GSE_CALL );

				N_EXPECT_ARGS( 1 );
				N_GETVALUE( slot_id, 0, Int );

				const auto& slots = m_state->m_slots->GetSlots();
				if ( slot_id >= slots.size() ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Player id " + std::to_string( slot_id ) + " not found" );
				}

				const auto& slot = slots.at( slot_id );
				if ( slot.GetState() != slot::Slot::SS_PLAYER ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Player id " + std::to_string( slot_id ) + " is not player" );
				}
				ASSERT( slot.GetPlayer(), "player is null" );
				ASSERT( !slot.GetPlayer()->IsTurnCompleted(), "player turn already completed" );
				CompleteTurn( GSE_CALL, slot_id );

				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"uncomplete_turn",
			NATIVE_CALL( this ) {

				CheckRW( GSE_CALL );

				N_EXPECT_ARGS( 1 );
				N_GETVALUE( slot_id, 0, Int );

				const auto& slots = m_state->m_slots->GetSlots();
				if ( slot_id >= slots.size() ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Player id " + std::to_string( slot_id ) + " not found" );
				}

				const auto& slot = slots.at( slot_id );
				if ( slot.GetState() != slot::Slot::SS_PLAYER ) {
					GSE_ERROR( gse:: EC.GAME_ERROR, "Player id " + std::to_string( slot_id ) + " is not player" );
				}
				ASSERT( slot.GetPlayer(), "player is null" );
				ASSERT( slot.GetPlayer()->IsTurnCompleted(), "player turn not completed" );
				UncompleteTurn( slot_id );

				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"advance_turn",
			NATIVE_CALL( this ) {

				CheckRW( GSE_CALL );

				N_EXPECT_ARGS( 1 );
				N_GETVALUE( turn_id, 0, Int );

				AdvanceTurn( turn_id );

				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"get_settings", // deprecated
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				if ( !m_state ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Game not initialized" );
				}
				return m_state->m_settings.Wrap( GSE_CALL );
			} )
		},
		{
			"get_initial_production_bonus", NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 1 ); N_GETVALUE( rows, 0, Int );
				if ( !m_state || rows <= 0 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Initial production requires rules and positive rows" ); }
				if ( !m_state->HasOfflineSinglePlayerRoster() || m_state->m_settings.global.map.type != settings::MapSettings::MT_MAPFILE ) { return VALUE( gse::value::Undefined ); }
				const auto kind = m_state->m_settings.global.map.GetRuleSizeKind();
				if ( !settings::MapSettings::IsKnownSizeKind( kind ) ) { return VALUE( gse::value::Undefined ); }
				try { return VALUE( gse::value::Int,, base::InitialProductionBonus( int( kind ), int( m_state->m_settings.global.rules.GetMineralCostFactor() ), rows ) ); }
				catch ( const std::exception& error ) { GSE_ERROR( gse::EC.INVALID_CALL, error.what() ); }
			} )
		},
		{
			"get_map",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				if ( !m_map ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Map not initialized" );
				}
				return m_map->Wrap( GSE_CALL );
			} )
		},
		{
			"register_event",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 2 );
				N_GETVALUE( name, 0, String );
				{
					std::lock_guard guard( m_event_handlers_mutex );
					if ( m_event_handlers.find( name ) != m_event_handlers.end() ) {
						GSE_ERROR( gse::EC.INVALID_HANDLER, "Event already registered: " + name );
					}
				}
				N_GETVALUE( def, 1, Object );
				auto validate_it = def.find( "validate" );
				if ( validate_it == def.end() || validate_it->second->type != gse::VT_CALLABLE ) {
					GSE_ERROR( gse::EC.INVALID_HANDLER, "Event handler does not provide validate method" );
				}
				gse::value::Callable* resolve = nullptr;
				auto resolve_it = def.find( "resolve" );
				if ( resolve_it != def.end() ) {
					if ( resolve_it->second->type != gse::VT_CALLABLE ) {
						GSE_ERROR( gse::EC.INVALID_HANDLER, "Event handler does not provide resolve method" );
					}
					resolve = (gse::value::Callable*)resolve_it->second;
				}
				auto apply_it = def.find( "apply" );
				if ( apply_it == def.end() || apply_it->second->type != gse::VT_CALLABLE ) {
					GSE_ERROR( gse::EC.INVALID_HANDLER, "Event handler does not provide apply method" );
				}
				auto rollback_it = def.find( "rollback" );
				if ( rollback_it == def.end() || rollback_it->second->type != gse::VT_CALLABLE ) {
					GSE_ERROR( gse::EC.INVALID_HANDLER, "Event handler does not provide rollback method" );
				}
				{
					std::lock_guard guard( m_event_handlers_mutex );
					m_event_handlers.insert(
						{ name, new event::EventHandler(
							gc_space, name,
							(gse::value::Callable*)validate_it->second,
							resolve,
							(gse::value::Callable*)apply_it->second,
							(gse::value::Callable*)rollback_it->second
						) }
					);
				}
				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"event",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 2 );
				CheckCustomMutation( GSE_CALL );
				N_GETVALUE( name, 0, String );
				{
					std::lock_guard guard( m_event_handlers_mutex );
					const auto& it = m_event_handlers.find( name );
					if ( it == m_event_handlers.end() ) {
						GSE_ERROR( gse::EC.INVALID_HANDLER, "Unknown event: " + name );
					}
				}
				N_GET( args, 1, Object );
				if ( !args->object_class.empty() ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Invalid event data - expected: primitive object, found: " + args->object_class );
				}
				AddEvent( new event::Event( this, event::Event::ES_LOCAL, m_slot_num, GSE_CALL, name, args->value ) );
				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"get_fm",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				return m_state
					? m_state->GetFM()->Wrap( GSE_CALL )
					: VALUE( gse::value::Undefined )
					;
			} )
		},
#define X( _x ) \
		{ \
			"get_" # _x, \
			NATIVE_CALL( this ) { \
				N_EXPECT_ARGS( 0 ); \
				return m_##_x \
					? m_##_x->Wrap( GSE_CALL ) \
					: VALUE( gse::value::Undefined ) \
					; \
			} ) \
		},
		X( um )
		X( bm )
		X( rm )
		X( tm )
#undef X
		{
			"is_started",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				return VALUE( gse::value::Bool,, m_game_state != GS_NONE );
			} )
		},
		{
			"select_tile",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 1 );
				N_GETVALUE_UNWRAP( tile, 0, map::tile::Tile );
				auto fr = FrontendRequest( FrontendRequest::FR_TILE_SELECT );
				fr.data.tile_select.x = tile->coord.x;
				fr.data.tile_select.y = tile->coord.y;
				AddFrontendRequest( fr );
				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"select_unit",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 1 );
				N_GETVALUE_UNWRAP( unit, 0, unit::Unit );
				if ( !m_um || m_um->GetUnit( unit->m_id ) != unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Only a live unit from this game can be explicitly selected" ); }
				auto fr = FrontendRequest( FrontendRequest::FR_UNIT_SELECT );
				fr.data.unit_select.unit_id = unit->m_id;
				AddFrontendRequest( fr );
				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"select_base",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 1 );
				N_GETVALUE_UNWRAP( base, 0, base::Base );
				auto fr = FrontendRequest( FrontendRequest::FR_BASE_SELECT );
				fr.data.base_select.base_id = base->m_id;
				AddFrontendRequest( fr );
				return VALUE( gse::value::Undefined );
			} )
		},
	};
	if ( m_tm ) {
		properties.insert(
			{
				"tm",
				m_tm->Wrap( GSE_CALL )
			}
		);
	}
	if ( m_rm ) {
		properties.insert(
			{
				"rm",
				m_rm->Wrap( GSE_CALL )
			}
		);
	}
	if ( m_um ) {
		properties.insert(
			{
				"um",
				m_um->Wrap( GSE_CALL )
			}
		);
	}
	if ( m_bm ) {
		properties.insert(

			{
				"bm",
				m_bm->Wrap( GSE_CALL ),
			}
		);
	}
	if ( m_am ) {
		properties.insert(
			{
				"am",
				m_am->Wrap( GSE_CALL )
			}
		);
	}
WRAPIMPL_END_PTR()

UNWRAPIMPL_PTR( Game )

void Game::GetReachableObjects( std::unordered_set< Object* >& reachable_objects ) {
	gse::GCWrappable::GetReachableObjects( reachable_objects );

	GC_DEBUG_BEGIN( "Game" );

	if ( m_tm ) {
		GC_REACHABLE( m_tm );
	}
	if ( m_rm ) {
		GC_REACHABLE( m_rm );
	}
	if ( m_um ) {
		GC_REACHABLE( m_um );
	}
	if ( m_bm ) {
		GC_REACHABLE( m_bm );
	}
	if ( m_am ) {
		GC_REACHABLE( m_am );
	}

	if ( m_map ) {
		GC_REACHABLE( m_map );
	}

	for ( const auto& entry : m_joining_records ) { GC_REACHABLE( entry.second.base_identity ); }
	for ( const auto& entry : m_disbanding_records ) { if ( entry.second.base_identity ) { GC_REACHABLE( entry.second.base_identity ); } }

	GC_DEBUG_BEGIN( "events" );
	{
		std::lock_guard guard( m_pending_events_mutex );
		for ( const auto& event : m_pending_events ) {
			GC_REACHABLE( event );
		}
	}
	GC_DEBUG_END();

	GC_DEBUG_BEGIN( "event_handlers" );
	{
		std::lock_guard guard( m_event_handlers_mutex );
		for ( const auto& it : m_event_handlers ) {
			GC_REACHABLE( it.second );
		}
	}
	GC_DEBUG_END();

	if ( !m_events_waiting_for_responses.empty() ) {
		std::lock_guard guard( m_events_waiting_for_responses_mutex );
		GC_DEBUG_BEGIN( "events_waiting_for_responses" );
		for ( const auto& it : m_events_waiting_for_responses ) {
			GC_REACHABLE( it.second.event );
			if ( it.second.rollback_data ) {
				GC_REACHABLE( it.second.rollback_data );
			}
		}
		GC_DEBUG_END();
	}

	if ( !m_pending_event_responses.empty() ) {
		std::lock_guard guard( m_pending_event_responses_mutex );
		GC_DEBUG_BEGIN( "pending_event_responses" );
		for ( const auto& it : m_pending_event_responses ) {
			if ( it.resolved ) {
				GC_REACHABLE( it.resolved );
			}
		}
		GC_DEBUG_END();
	}

	GC_DEBUG_END();
}

const MT_Response Game::ProcessRequest( const MT_Request& request, MT_CANCELABLE ) {
	MT_Response response = {};
	response.op = request.op;

	switch ( request.op ) {
		case OP_INIT: {
			//MTModule::Log( "Got init request" );

			ASSERT( m_state, "state not set" );

			if ( m_game_state != GS_NONE ) { ResetGame(); }
			QueueStartupInitialize();
			//m_state->SetGame( this );

			const bool interactive = request.data.init.interactive_opening;
			if ( interactive && ( m_state->m_connection || m_state->m_settings.local.game_mode != settings::LocalSettings::GM_SINGLEPLAYER || g_engine->GetConfig()->GetWorldScript() != "default" ) ) {
				response.result = R_ERROR; NEW( response.data.error.error_text, std::string, "Interactive opening requires a new offline single-player world" ); break;
			}
			InitGame( response, interactive, MT_C );
			if ( response.result == R_SUCCESS ) {
				response.data.init.slot_index = m_slot_num;
			}
			else if ( response.result == R_ERROR ) {
				NEW( response.data.error.error_text, std::string, m_initialization_error );
				response.data.error.already_notified = m_initialization_error_notified;
			}
			break;
		}
		case OP_GET_MAP_DATA: {
			std::lock_guard startup_guard( m_startup_mutex );
			//MTModule::Log( "Got get-map-data request" );
			if ( m_game_state != GS_RUNNING ) {
				if ( m_initialization_error.empty() ) {
					response.result = R_PENDING;
				}
				else {
					response.result = R_ERROR;
					NEW( response.data.error.error_text, std::string, m_initialization_error );
					response.data.error.already_notified = m_initialization_error_notified;
				}
			}
			else if ( m_response_map_data ) {
				response.result = R_SUCCESS;
				response.data.get_map_data = m_response_map_data;
				m_response_map_data = nullptr;
				// ownership transferred to frontend
				auto resources = std::make_shared< map::RenderResources >();
				resources->terrain = m_map->m_meshes.terrain; resources->terrain_data = m_map->m_meshes.terrain_data; resources->texture = m_map->m_textures.terrain;
				m_map->m_frontend_resources = resources;
				response.data.get_map_data->render_resources = resources;
				m_map->m_textures.terrain = nullptr;
				m_map->m_meshes.terrain = nullptr;
				m_map->m_meshes.terrain_data = nullptr;
			}
			else if ( m_init_cancel ) {
				response.result = R_ABORTED;
			}
			else {
				response.result = R_ERROR;
				NEW( response.data.error.error_text, std::string, m_initialization_error );
				response.data.error.already_notified = m_initialization_error_notified;
			}
			break;
		}
		case OP_RESET: {
			//MTModule::Log( "Got reset request" );
			ResetGame();
			response.result = R_SUCCESS;
			break;
		}
		case OP_PING: {
			//MTModule::Log( "Got ping request" );
			response.result = R_SUCCESS;
			break;
		}
		case OP_SAVE_MAP: {
			//MTModule::Log( "got save map request" );
			const auto ec = m_map->SaveToFile( *request.data.save_map.path );
			if ( ec ) {
				response.result = R_ERROR;
				response.data.error.error_text = &( map::Map::GetErrorString( ec ) );
			}
			else {
				response.result = R_SUCCESS;
				NEW( response.data.save_map.path, std::string );
				*response.data.save_map.path = *request.data.save_map.path;
			}
			break;
		}
		case OP_GET_FRONTEND_REQUESTS: {
			//MTModule::Log( "got events request" );
			if ( !m_pending_frontend_requests->empty() ) {
				//MTModule::Log( "Sending " + std::to_string( m_pending_frontend_requests->size() ) + " events to frontend" );
				response.data.get_frontend_requests.requests = m_pending_frontend_requests; // will be destroyed in DestroyResponse
				NEW( m_pending_frontend_requests, std::vector< FrontendRequest > ); // reset
			}
			else {
				response.data.get_frontend_requests.requests = nullptr;
			}
			response.result = R_SUCCESS;
			break;
		}
		case OP_SEND_BACKEND_REQUESTS: {
			try {
				auto* gc_space = GetGCSpace();
				for ( const auto& r : *request.data.send_backend_requests.requests ) {
					switch ( r.type ) {
						case BackendRequest::BR_ANIMATION_FINISHED: {
							gc_space->Accumulate( this, [ this, &r ] () {
								m_am->FinishAnimation( r.data.animation_finished.animation_id );
							});
							break;
						}
						default:
							THROW( "unknown backend request type: " + std::to_string( r.type ) );
					}
				}
				response.result = R_SUCCESS;
			}
			catch ( const gse::Exception& e ) {
				OnGSEError( e );
				response.result = R_ERROR;
			}
			catch ( std::runtime_error& e ) {
				OnError( e );
				response.result = R_ERROR;
			}
			break;
		}
		case OP_ADD_EVENT: {
			THROW( "deprecated: OP_ADD_EVENT" );
			/*m_state->WithGSE( [ this, &event, &errmsg, &buf ]( GSE_CALLABLE ) {
				event = event::Event::Deserialize( GSE_CALL, buf );
				errmsg = event->Validate( GSE_CALL, this );
				if ( errmsg ) {
					// log and do nothing
					MTModule::Log( "Event declined: " + *errmsg );
					delete errmsg;
					delete event;
				}
				else {
					AddEvent( GSE_CALL, event );
				}
			});*/
			break;
		}
		default: {
			THROW( "unknown request op " + std::to_string( request.op ) );
		}
	}

	return response;
}

void Game::DestroyRequest( const MT_Request& request ) {
	switch ( request.op ) {
		case OP_SAVE_MAP: {
			if ( request.data.save_map.path ) {
				DELETE( request.data.save_map.path );
			}
			break;
		}
		case OP_ADD_EVENT: {
			DELETE( request.data.add_event.serialized_event );
			break;
		}
		case OP_SEND_BACKEND_REQUESTS: {
			if ( request.data.send_backend_requests.requests ) {
				DELETE( request.data.send_backend_requests.requests );
			}
		}
		default: {
			// nothing to delete
		}
	}
}

void Game::DestroyResponse( const MT_Response& response ) {
	if ( response.result == R_ERROR && ( response.op == OP_INIT || response.op == OP_GET_MAP_DATA ) ) {
		DELETE( response.data.error.error_text );
	}
	if ( response.result == R_SUCCESS ) {
		switch ( response.op ) {
			case OP_GET_MAP_DATA: {
				if ( response.data.get_map_data ) {
					DELETE( response.data.get_map_data );
				}
				break;
			}
			case OP_SAVE_MAP: {
				if ( response.data.save_map.path ) {
					DELETE( response.data.save_map.path );
				}
				break;
			}
			case OP_GET_FRONTEND_REQUESTS: {
				if ( response.data.get_frontend_requests.requests ) {
					DELETE( response.data.get_frontend_requests.requests );
				}
				break;
			}
			default: {
				// nothing to delete
			}
		}
	}
}

void Game::Message( const std::string& text ) {
	m_state->WithGSE( this, [ this, text ]( GSE_CALLABLE ){
		m_state->TriggerObject(
			this, "message", ARGS_F( text ) {
				{ "text", VALUE( gse::value::String,, text ) }
			}; }
		);
	});
}

void Game::Quit( const std::string& reason ) {
	auto fr = FrontendRequest( FrontendRequest::FR_QUIT );
	NEW( fr.data.quit.reason, std::string, "Lost connection to server" );
	AddFrontendRequest( fr );
}

void Game::OnError( std::runtime_error& err ) {
	auto fr = FrontendRequest( FrontendRequest::FR_ERROR );
	NEW( fr.data.error.what, std::string, (std::string)"Script error: " + err.what() );
	fr.data.error.stacktrace = nullptr;
	AddFrontendRequest( fr );
}

void Game::OnGSEError( const gse::Exception& err ) {
	auto fr = FrontendRequest( FrontendRequest::FR_ERROR );
	NEW( fr.data.error.what, std::string, (std::string)"Script error: " + err.what() );
	NEW( fr.data.error.stacktrace, std::string, err.ToString() );
	AddFrontendRequest( fr );
}

const size_t Game::GetTurnId() const {
	return m_current_turn.GetId();
}

const bool Game::IsTurnCompleted( const size_t slot_num ) const {
	const auto& slot = m_state->m_slots->GetSlot( slot_num );
	ASSERT( slot.GetState() == slot::Slot::SS_PLAYER, "slot is not player" );
	const auto* player = slot.GetPlayer();
	ASSERT( player, "slot player not set" );
	return player->IsTurnCompleted();
}

const bool Game::IsTurnChecksumValid( const util::crc32::crc_t checksum ) const {
	return m_turn_checksum == checksum;
}

void Game::CompleteTurn( GSE_CALLABLE, const size_t slot_num ) {
	if ( IsOpeningPending() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Confirm the opening before completing a turn" ); }
	const auto& slot = m_state->m_slots->GetSlot( slot_num );
	ASSERT( slot.GetState() == slot::Slot::SS_PLAYER, "slot is not player" );
	auto* player = slot.GetPlayer();
	ASSERT( player, "slot player not set" );
	player->CompleteTurn();
	SetTurnStatus( turn::TS_WAITING_FOR_PLAYERS );
}

void Game::UncompleteTurn( const size_t slot_num ) {
	const auto& slot = m_state->m_slots->GetSlot( slot_num );
	ASSERT( slot.GetState() == slot::Slot::SS_PLAYER, "slot is not player" );
	auto* player = slot.GetPlayer();
	ASSERT( player, "slot player not set" );
	player->UncompleteTurn();
	if ( slot_num == m_slot_num ) {
		m_is_turn_complete = false;
		CheckTurnComplete();
		if ( !m_is_turn_complete ) {
			SetTurnStatus( turn::TS_TURN_ACTIVE );
		}
	}
}

void Game::AdvanceTurn( const size_t turn_id ) {
	if ( IsOpeningPending() ) {
		if ( m_opening_phase != OPENING_STARTING || turn_id != 1 || !m_opening_first_turn_dispatched || m_opening_first_turn_applied ) { THROW( "Confirm the opening before advancing a turn" ); }
		m_opening_first_turn_applied = true;
	}
	m_has_started_turn = true;
	m_current_turn.AdvanceTurn( turn_id );
	m_is_turn_complete = false;
	MTModule::Log( "Turn started: " + std::to_string( turn_id ) );

	{
		auto fr = FrontendRequest( FrontendRequest::FR_TURN_ADVANCE );
		fr.data.turn_advance.turn_id = turn_id;
		AddFrontendRequest( fr );
	}

	m_state->WithGSE( this, [ this ]( GSE_CALLABLE ) {
		for ( auto& it : m_um->GetUnits() ) {
			auto* unit = it.second;
			m_state->TriggerObject(
				m_um, "unit_turn", ARGS_F( &unit ) {
					{
						"unit",
						unit->Wrap( GSE_CALL )
					},
				}; }
			);
			unit->m_moved_this_turn = false;
			// Work consumes restored movement and completes improvements before
			// base income, with the new turn's movement-history flag in place.
			m_state->TriggerObject( m_um, "unit_turn_ready", ARGS_F( &unit ) {
				{ "unit", unit->Wrap( GSE_CALL ) },
			}; } );
			m_um->RefreshUnit( GSE_CALL, unit );
		}

		for ( auto& it : m_bm->GetBases() ) {
			auto* base = it.second;
			m_state->TriggerObject(
				m_bm, "base_turn", ARGS_F( &base ) {
					{
						"base",
						base->Wrap( GSE_CALL )
					},
				}; }
			);
			m_bm->RefreshBase( base );
		}

		if ( m_state->IsMaster() ) {
			m_state->TriggerObject( this, "turn", ARGS_F( this ) {
				{
					"year",
					VALUE( gse::value::Int,, m_current_turn.GetId() + 2100 /* TODO: better way to define starting year? */ ),
				},
			}; } );
		}
	});

	for ( const auto& slot : m_state->m_slots->GetSlots() ) {
		if ( slot.GetState() == slot::Slot::SS_PLAYER ) {
			auto* player = slot.GetPlayer();
			player->UncompleteTurn();
			// Offline computer participants have no socket from which to receive
			// completion. Their current controller submits no orders; per-turn
			// unit/base mechanics above still execute for every participant.
			// AI decisions and movement remain unimplemented. Never complete a
			// remote human (or any network participant) through this controller.
			if ( !m_state->m_connection && m_state->m_settings.local.game_mode == settings::LocalSettings::GM_SINGLEPLAYER && player->GetRole() == Player::PR_COMPUTER ) {
				player->CompleteTurn();
			}
		}
	}

	m_is_turn_complete = false;
	CheckTurnComplete();
	if ( !m_is_turn_complete ) {
		SetTurnStatus( turn::TS_TURN_ACTIVE );
	}

}

void Game::GlobalFinalizeTurn( GSE_CALLABLE ) {
	ASSERT( m_state->IsMaster(), "not master" );
	ASSERT( m_verified_turn_checksum_slots.empty(), "turn finalization slots not empty" );
	MTModule::Log( "Finalizing turn ( checksum = " + std::to_string( m_turn_checksum ) + " )" );
	THROW( "TODO: GLOBAL FINALIZE TURN");
	//AddEvent( GSE_CALL, new event::FinalizeTurn( m_slot_num ) );
}

void Game::FirstTurn( GSE_CALLABLE ) {
	ASSERT( m_state->IsMaster(), "not master" );
	if ( m_current_turn.GetId() != 0 || ( IsOpeningPending() && m_opening_phase != OPENING_STARTING ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "First turn is not ready or has already started" ); }

	// reset some states
	if ( m_opening_phase == OPENING_STARTING ) { m_opening_first_turn_dispatched = true; }
	m_current_turn.AdvanceTurn( 1 );
	m_verified_turn_checksum_slots.clear();
	m_turn_checksum = 0;

	MTModule::Log( "Advancing turn ( id = " + std::to_string( m_current_turn.GetId() ) + " )" );
	m_state->WithGSE( this, [ this ]( GSE_CALLABLE ){
		Event( GSE_CALL, "advance_turn", {
			{ "turn_id", VALUE( gse::value::Int,, m_current_turn.GetId() ) }
		} );
	});
}

faction::Faction* Game::GetFaction( const std::string& id ) const {
	auto* faction = m_state->GetFM()->Get( id ); // TODO: store factions in Game itself?
	ASSERT( faction, "faction not found: " + id );
	return faction;
}

map::tile::TileManager* Game::GetTM() const {
	return m_tm;
}

resource::ResourceManager* Game::GetRM() const {
	return m_rm;
}

unit::UnitManager* Game::GetUM() const {
	return m_um;
}

base::BaseManager* Game::GetBM() const {
	return m_bm;
}

animation::AnimationManager* Game::GetAM() const {
	return m_am;
}

gc::Space* const Game::GetGCSpace() const {
	ASSERT( m_state, "state not set" );
	ASSERT( m_state->m_gc_space, "state gc space not set" );
	return m_state->m_gc_space;
}

const types::Vec3 Game::GetTileRenderCoords( const map::tile::Tile* tile ) {
	const auto* ts = m_map->GetTileState( tile );
	ASSERT( ts, "ts not set" );
	const auto l = tile->is_water_tile
		? map::tile::LAYER_WATER
		: map::tile::LAYER_LAND;
	const auto& layer = ts->layers[ l ];
	const auto& c = layer.coords.center;
	return {
		c.x,
		-c.y,
		c.z
	};
}

void Game::WithRW( const std::function< void() >& f ) {
	m_rw_counter++;
	try { f(); }
	catch ( ... ) { m_rw_counter--; throw; }
	m_rw_counter--;
}

void Game::InitComplete( GSE_CALLABLE ) {
	ASSERT( m_game_state != GS_RUNNING, "game already initialized" );

	try {
		m_state->TriggerObject(
			this, "start", ARGS_F( this ) {
				{
					"game",
					Wrap( GSE_CALL )
				},
			}; }
		);
	}
	catch ( const gse::Exception& e ) {
		MTModule::Log( (std::string)"Initialization failed: " + e.ToString() );
		InitFailed( e.what() );
		return;
	}

	m_game_state = GS_RUNNING;
	m_um->ProcessUnprocessed( GSE_CALL );
	m_bm->ProcessUnprocessed( GSE_CALL );
	if ( m_state->m_connection ) {
		m_state->m_connection->IfServer(
			[]( connection::Server* connection ) -> void {
				connection->SetGameState( connection::Connection::GS_RUNNING ); // allow clients to download map
			}
		);
	}
}

std::string Game::GetStartupMapError() const {
	if ( !m_state->m_connection && m_state->m_settings.local.game_mode == settings::LocalSettings::GM_SINGLEPLAYER ) {
		return State::GetSinglePlayerMapError( m_map->GetWidth(), m_map->GetHeight() );
	}
	return "";
}

void Game::InitFailed( const std::string& error_text ) {
	HideLoader();
	std::lock_guard startup_guard( m_startup_mutex );
	// need to delete these here because they weren't passed to main thread
	if ( m_map && m_map->m_textures.terrain ) {
		DELETE( m_map->m_textures.terrain );
		m_map->m_textures.terrain = nullptr;
	}
	if ( m_map && m_map->m_meshes.terrain ) {
		DELETE( m_map->m_meshes.terrain );
		m_map->m_meshes.terrain = nullptr;
	}
	if ( m_map && m_map->m_meshes.terrain_data ) {
		DELETE( m_map->m_meshes.terrain_data );
		m_map->m_meshes.terrain_data = nullptr;
	}

	ASSERT( m_state, "state not set" );
	if ( m_state->m_connection ) {
		m_state->m_connection->Disconnect( "Failed to initialize game" );
	}
	// Script failures reached while already executing GSE retain the script hook.
	// Native backend failures travel through their owned MT response instead.
	m_initialization_error_notified = HasHandlers( "error" ) && m_state->m_gc_space->IsOwnerThread() && m_state->m_gc_space->IsAccumulating();
	if ( m_initialization_error_notified ) {
		m_state->TriggerObject(
			this, "error", ARGS_F( this, &error_text ) {
				{
					"game",
					Wrap( GSE_CALL )
				},
				{
					"error",
					VALUE( gse::value::String, , error_text ),
				},
			}; }
		);
	}

	ResetGame();
	m_state = nullptr;

	m_initialization_error = error_text;

	if ( m_old_map ) {
		MTModule::Log( "Restoring old map state" );
		DELETE( m_map );
		m_map = m_old_map;
		m_old_map = nullptr;
	}
}

static const std::unordered_map< backend::turn::turn_status_t, std::string > s_turn_status_str = {
	{ turn::TS_PLEASE_WAIT, "please_wait" },
	{ turn::TS_TURN_ACTIVE, "active" },
	{ turn::TS_TURN_COMPLETE, "turn_complete" },
	{ turn::TS_WAITING_FOR_PLAYERS, "waiting_for_players" },
};

void Game::SetTurnStatus( const backend::turn::turn_status_t requested_status ) {
	const auto status = IsOpeningPending() ? turn::TS_PLEASE_WAIT : requested_status;
	auto fr = FrontendRequest( FrontendRequest::FR_TURN_STATUS );
	fr.data.turn_status.status = status;
	AddFrontendRequest( fr );
	ASSERT( s_turn_status_str.find( status ) != s_turn_status_str.end(), "unknown status: " + std::to_string( status ) );
	m_state->WithGSE( this, [ this, status ]( GSE_CALLABLE ) {
		m_state->TriggerObject( this, "turn_status", ARGS_F( &status ) {
			{
				"status",
				VALUE( gse::value::String,, s_turn_status_str.at( status ) ),
			},
		}; } );
	});
}

gse::Value* Game::ApplyEventWithContext( const event::Event* event, const std::function< gse::Value*() >& apply ) {
	// Allocate before touching a possibly nested owner's context. Swapping and
	// restoring the transient owner cannot throw, including during Apply cleanup.
	std::string previous = event->GetId();
	previous.swap( m_applying_event_id );
	struct RestoreContext {
		std::string& current;
		std::string& previous;
		~RestoreContext() { current.swap( previous ); }
	} restore { m_applying_event_id, previous };
	return apply();
}

void Game::FinalizeAcceptedEvent( const event::Event* event, gse::Value* applied ) {
	FinalizeUnitDisbandEvent( event, applied );
	// The whole parent Apply has succeeded, including inline turn-ready work.
	// Pending optimistic events do not reach this boundary before acceptance.
	if ( m_tm ) { m_tm->FinalizeAcceptedTerrain( event->GetId() ); }
	// Only the receiving world's live canonical roster participates. Notification
	// copies and retired players never acquire acceptance authority.
	if ( m_state ) {
		for ( auto& slot : m_state->m_slots->GetSlots() ) {
			if ( slot.GetState() == slot::Slot::SS_PLAYER ) { slot.GetPlayer()->FinalizeAcceptedEnergy( event->GetId() ); }
		}
	}
}

void Game::ProcessEventResponses() {
	std::vector< pending_event_response_t > responses;
	{ std::lock_guard guard( m_pending_event_responses_mutex ); responses.swap( m_pending_event_responses ); }
	for ( const auto& response : responses ) {
		event_waiting_for_response_t waiting;
		{
			std::lock_guard guard( m_events_waiting_for_responses_mutex );
			const auto it = m_events_waiting_for_responses.find( response.event_id );
			if ( it == m_events_waiting_for_responses.end() ) { MTModule::Log( "Ignoring stale event response: " + response.event_id ); continue; }
			waiting = it->second;
			m_events_waiting_for_responses.erase( it );
		}
		m_state->WithGSE( this, [ this, waiting, response ]( GSE_CALLABLE ) {
			bool success = response.is_accepted;
			try {
				event::EventHandler* handler = nullptr;
				{ std::lock_guard guard( m_event_handlers_mutex ); const auto it = m_event_handlers.find( waiting.event->GetEventName() ); if ( it != m_event_handlers.end() ) { handler = it->second; } }
				if ( !handler ) { GSE_ERROR( gse::EC.INVALID_HANDLER, "Missing event response handler" ); }
				auto* obj = VALUEEXT( gse::value::Object, GSE_CALL, waiting.event->GetData() );
				if ( response.resolved ) { obj->Set( "resolved", response.resolved, GSE_CALL ); }
				if ( waiting.rollback_data ) { obj->Set( "applied", waiting.rollback_data, GSE_CALL ); }
				const gse::value::function_arguments_t args { obj };
				if ( !response.is_accepted && waiting.applied ) { WithRW( [ & ]() { handler->Rollback( GSE_CALL, args ); } ); }
				else if ( response.is_accepted ) {
					auto* applied = waiting.rollback_data;
					if ( !waiting.applied ) { WithRW( [ & ]() { applied = ApplyEventWithContext( waiting.event, [ & ]() { return handler->Apply( GSE_CALL, args ); } ); } ); }
					FinalizeAcceptedEvent( waiting.event, applied );
				}
			} catch ( const std::exception& error ) { success = false; MTModule::Log( "Event response failed: " + std::string( error.what() ) ); }
			NotifyEventResult( GSE_CALL, waiting.event, success );
		} );
	}
}

void Game::NotifyEventResult( GSE_CALLABLE, const event::Event* event, const bool success ) {
	if ( event->GetSource() != event::Event::ES_LOCAL ) { return; }
	const auto& data = event->GetScalarData();
	const gse::value::object_properties_t result {
		{ "name", VALUE( gse::value::String,, event->GetEventName() ) },
		{ "event_id", VALUE( gse::value::String,, event->GetId() ) },
		{ "caller", VALUE( gse::value::Int,, event->GetCaller() ) },
		{ "data", VALUEEXT( gse::value::Object, GSE_CALL, data ) },
		{ "success", VALUE( gse::value::Bool,, success ) },
	};
	// View callbacks cannot turn an already committed command into a rejection.
	try { Trigger( GSE_CALL, "event_result", ARGS( result ) ); }
	catch ( const std::exception& error ) { MTModule::Log( "Event result listener failed: " + std::string( error.what() ) ); }
}

void Game::ProcessEvents() {
	std::vector< event::Event* > events;
	{ std::lock_guard guard( m_pending_events_mutex ); events.swap( m_pending_events ); }
	if ( events.empty() ) { return; }
	m_state->WithGSE( this, [ this, events ]( GSE_CALLABLE ) {
		for ( auto* event : events ) {
			auto* obj = VALUEEXT( gse::value::Object, GSE_CALL, event->GetData() );
			const gse::value::function_arguments_t args { obj };
			event::EventHandler* handler = nullptr;
			{ std::lock_guard guard( m_event_handlers_mutex ); const auto it = m_event_handlers.find( event->GetEventName() ); if ( it != m_event_handlers.end() ) { handler = it->second; } }
			bool success = false;
			std::string error;
			try {
				if ( !IsOpeningEventAllowed( event->GetEventName() ) ) { error = "Confirm the opening before issuing gameplay commands"; }
				else if ( !handler ) { error = "Unknown event: " + event->GetEventName(); }
				else {
					std::unique_ptr< const std::string > rejected( handler->Validate( GSE_CALL, args ) );
					if ( rejected ) { error = *rejected; }
				}
				if ( error.empty() ) {
					const auto apply = [ & ]() {
						auto* applied = ApplyEventWithContext( event, [ & ]() { return handler->Apply( GSE_CALL, args ); } );
						if ( applied ) { obj->Set( "applied", applied, GSE_CALL ); }
						return applied;
					};
					if ( m_state->IsMaster() ) {
						ASSERT( event->GetSource() != event::Event::ES_SERVER, "got event from server to server" );
						gse::Value* resolved = nullptr;
						if ( handler->HasResolve() ) {
							resolved = handler->Resolve( GSE_CALL, args );
							if ( resolved ) { event->SetResolved( resolved ); obj->Set( "resolved", resolved, GSE_CALL ); }
						}
						const auto wire = m_state->m_connection ? event->Serialize().ToString() : std::string{};
						WithRW( [ & ]() { FinalizeAcceptedEvent( event, apply() ); } );
						success = true;
						// A failed native apply must never be published as accepted.
						if ( m_state->m_connection ) {
							if ( event->GetCaller() != 0 ) { m_state->m_connection->AsServer()->SendGameEventResponse( event->GetCaller(), event->GetId(), true, resolved ); }
							ASSERT( m_state->m_connection->IsServer(), "master but not server" );
							m_state->m_connection->SendSerializedGameEvent( event->GetCaller(), event->GetEventName(), wire );
						}
					}
					else {
						ASSERT( event->GetSource() != event::Event::ES_CLIENT, "got event from client to client" );
						ASSERT( m_state->m_connection, "not master but no connection" );
						const bool process_now = !handler->HasResolve() || event->GetSource() != event::Event::ES_LOCAL;
						if ( handler->HasResolve() && process_now ) {
							auto* resolved = event->GetResolved();
							ASSERT( resolved, "server sent unresolved event" ); obj->Set( "resolved", resolved, GSE_CALL );
						}
						const auto wire = event->GetSource() == event::Event::ES_LOCAL ? event->Serialize().ToString() : std::string{};
						gse::Value* rollback = nullptr;
						if ( process_now ) { WithRW( [ & ]() { rollback = apply(); } ); }
						if ( event->GetSource() == event::Event::ES_LOCAL ) {
							std::lock_guard guard( m_events_waiting_for_responses_mutex );
							ASSERT( !m_events_waiting_for_responses.count( event->GetId() ), "event already waiting for response" );
							m_events_waiting_for_responses.emplace( event->GetId(), event_waiting_for_response_t { event, rollback, process_now } );
							m_state->m_connection->SendSerializedGameEvent( event->GetCaller(), event->GetEventName(), wire );
						}
						else { FinalizeAcceptedEvent( event, rollback ); }
					}
				}
			} catch ( const std::exception& failure ) { error = failure.what(); }
			if ( !error.empty() ) {
				MTModule::Log( "Event rejected: " + error );
				if ( !success && m_state->IsMaster() && m_state->m_connection && event->GetCaller() != 0 ) { m_state->m_connection->AsServer()->SendGameEventResponse( event->GetCaller(), event->GetId(), false, nullptr ); }
				if ( !success ) { NotifyEventResult( GSE_CALL, event, false ); }
			}
			if ( success ) { NotifyEventResult( GSE_CALL, event, true ); }
		}
	} );
}

void Game::CheckRW( GSE_CALLABLE ) const {
	if ( !m_rw_counter ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Game state is read-only. Try using events?");
	}
}

void Game::SetSlotNum( const size_t slotnum ) {
	m_slot_num = slotnum;
}

void Game::AddFrontendRequest( const FrontendRequest& request ) {
	//MTModule::Log( "Sending frontend request (type=" + std::to_string( request.type ) + ")" ); // spammy
	m_pending_frontend_requests->push_back( request );
}

void Game::QueueStartupInitialize() {
	uint64_t generation;
	{ std::lock_guard guard( m_startup_mutex ); generation = ++m_startup_generation; }
	m_state->WithGSE(
		this,
		[ this, generation ]( GSE_CALLABLE ) {
			std::lock_guard guard( m_startup_mutex );
			if ( generation != m_startup_generation || !m_state ) { return; }
			m_state->TriggerObject(
				this, "initialize", ARGS_F( this ) {
					{
						"game",
						Wrap( GSE_CALL )
					}
				}; }
			);
		}
	);
}

void Game::QueueStartupConfigure() {
	uint64_t generation;
	{ std::lock_guard guard( m_startup_mutex ); generation = m_startup_generation; }
	m_state->WithGSE( this, [ this, generation ]( GSE_CALLABLE ) {
		std::lock_guard guard( m_startup_mutex );
		if ( generation != m_startup_generation || !m_state ) { return; }
		ASSERT( !m_tm, "tm not null" );
		m_tm = new map::tile::TileManager( this );
		ASSERT( !m_rm, "rm not null" );
		m_rm = new resource::ResourceManager( this );
		ASSERT( !m_um, "um not null" );
		m_um = new unit::UnitManager( this );
		ASSERT( !m_bm, "bm not null" );
		m_bm = new base::BaseManager( this );
		ASSERT( !m_am, "am not null" );
		m_am = new animation::AnimationManager( this );
		m_state->TriggerObject( this, "configure", ARGS_F( this ) {
			{
				"game",
				Wrap( GSE_CALL )
			},
		}; } );
	});
}

void Game::InitGame( MT_Response& response, const bool interactive_opening, MT_CANCELABLE ) {

	ASSERT( !m_state || !m_state->m_connection || m_game_state == GS_NONE, "multiplayer game already initializing or running" );
	ASSERT( m_game_state == GS_NONE, "game still initializing" );

	m_opening_phase = interactive_opening ? OPENING_PREPARING : OPENING_NONE;
	m_auto_end_turn = interactive_opening;
	m_opening_first_turn_dispatched = m_opening_first_turn_applied = false;
	m_opening_base = nullptr; m_opening_base_id = 0; ++m_opening_session;


	MTModule::Log( "Initializing game" );

	QueueStartupConfigure();

	ASSERT( m_pending_frontend_requests, "pending events not set" );
	m_pending_frontend_requests->clear();

	m_game_state = GS_PREPARING_MAP;
	m_initialization_error = "";
	m_initialization_error_notified = false;

	auto* const connection = m_state->m_connection;

	if ( m_state->IsMaster() ) {

		if ( !m_state->m_connection && m_state->m_settings.local.game_mode == settings::LocalSettings::GM_SINGLEPLAYER ) {
			m_state->FinalizeSinglePlayerRoster();
		}

		// assign random factions to players
		auto factions = m_state->GetFM()->GetAll();
		std::vector< size_t > m_available_factions = {};
		const auto& slots = m_state->m_slots->GetSlots();
		for ( const auto& slot : slots ) {
			if ( slot.GetState() == slot::Slot::SS_PLAYER ) {
				auto* player = slot.GetPlayer();
				ASSERT( player, "player not set" );
				if ( !player->GetFaction() ) {
					if ( m_available_factions.empty() ) {
						// (re)load factions list
						for ( size_t i = 0 ; i < factions.size() ; i++ ) {
						//for ( const auto& faction : factions ) {
							m_available_factions.push_back( i );
						}
						ASSERT( !m_available_factions.empty(), "no factions found" );
					}
					const auto it = m_available_factions.begin() + m_random->GetUInt( 0, m_available_factions.size() - 1 );
					player->SetFaction( factions.at( *it ) );
					m_available_factions.erase( it );
				}
			}
		}
		if ( connection ) {
			connection->AsServer()->SendPlayersList();
		}

	}

	if ( connection ) {

		m_slot_num = connection->GetSlotNum();

		connection->ResetHandlers();
		connection->IfServer(
			[ this ]( connection::Server* connection ) -> void {

				/*connection->m_on_player_join = [ this, connection ]( const size_t slot_num, slot::Slot* slot, const Player* player ) -> void {
					MTModule::Log( "Player " + player->GetFullName() + " is connecting..." );
					connection->GlobalMessage( "Connection from " + player->GetFullName() + "..." );
					// actual join will happen after he downloads and initializes map
				};*/

				connection->m_on_flags_update = [ this, connection ]( const size_t slot_num, slot::Slot* slot, const slot::player_flag_t old_flags, const slot::player_flag_t new_flags ) -> void {
					if ( !( old_flags & slot::PF_GAME_INITIALIZED ) && ( new_flags & slot::PF_GAME_INITIALIZED ) ) {
						const auto* player = slot->GetPlayer();
						MTModule::Log( player->GetFullName() + " joined the game." );
						connection->GlobalMessage( player->GetFullName() + " joined the game." );
					}
				};

				/*connection->m_on_player_leave = [ this, connection ]( const size_t slot_num, slot::Slot* slot, const Player* player ) -> void {
					MTModule::Log( "Player " + player->GetFullName() + " left the game." );
					connection->GlobalMessage( player->GetFullName() + " left the game." );
					m_tm->ReleaseTileLocks( slot_num );
				};*/

				connection->m_on_download_request = [ this ]() -> const std::string {
					if ( !m_map ) {
						// map not generated yet
						return "";
					}
					MTModule::Log( "Preparing snapshot for download" );
					types::Buffer buf;

					// map
					m_map->SaveToBuffer( buf );

					// resources
					{
						types::Buffer b;
						m_rm->Serialize( b );
						buf.WriteString( b.ToString() );
					}

					// units
					{
						types::Buffer b;
						m_um->Serialize( b );
						buf.WriteString( b.ToString() );
					}

					// bases
					{
						types::Buffer b;
						m_bm->Serialize( b );
						buf.WriteString( b.ToString() );
					}

					// animations
					{
						types::Buffer b;
						m_am->Serialize( b );
						buf.WriteString( b.ToString() );
					}

					// technology definitions and ownership
					{
						types::Buffer b;
						technology::SerializeTable( m_technologies, b );
						buf.WriteString( b.ToString() );
					}

					// send turn info
					MTModule::Log( "Sending turn ID: " + std::to_string( m_current_turn.GetId() ) );
					buf.WriteInt( m_current_turn.GetId() );
					buf.WriteString( m_research.Serialize().ToString() );

					return buf.ToString();
				};

				connection->SetGameState( connection::Connection::GS_INITIALIZING );
			}
		);

		connection->IfClient(
			[ this ]( connection::Client* connection ) -> void {
				connection->m_on_disconnect = [ this ]() -> bool {
					MTModule::Log( "Connection lost" );
					m_state->DetachConnection();
					if ( m_game_state != GS_RUNNING ) {
						m_initialization_error = "Lost connection to server";
					}
					else {
						Quit( "Lost connection to server" );
					}
					return true;
				};
				connection->m_on_error = [ this ]( const std::string& reason ) -> bool {
					m_initialization_error = reason;
					return true;
				};
			}
		);

		connection->m_on_message = [ this ]( const std::string& message ) -> void {
			Message( message );
		};

		connection->m_on_game_event_validate = [ this ]( event::Event* event ) -> void {
			if ( m_state->IsMaster() ) {
				ASSERT( m_game_state == GS_RUNNING, "game is not running but received event" );
			}
			THROW( "TODO: m_on_game_event_validate");
			if ( m_game_state == GS_RUNNING ) {
/*				m_state->WithGSE( this, [ this, event ]( GSE_CALLABLE ) {
					ValidateEvent( GSE_CALL, event );
				} );*/
			}
			else {
				//m_unprocessed_events.push_back( event );
			}

		};

		connection->m_on_game_event_apply = [ this ]( event::Event* event ) -> void {
			if ( m_state->IsMaster() ) {
				ASSERT( m_game_state == GS_RUNNING, "game is not running but received event" );
			}
			THROW( "TODO: m_on_game_event_apply");
			if ( m_game_state == GS_RUNNING ) {
				/*m_state->WithGSE( this, [ this, event ]( GSE_CALLABLE ) {
					ProcessEvent( GSE_CALL, event );
				});*/
			}
		};

		connection->m_on_game_event_rollback = [ this ]( event::Event* event ) -> void {
			if ( m_state->IsMaster() ) {
				ASSERT( m_game_state == GS_RUNNING, "game is not running but received event" );
			}
			THROW( "TODO: m_on_game_event_rollback");
			if ( m_game_state == GS_RUNNING ) {
				/*m_state->WithGSE( this, [ this, event ]( GSE_CALLABLE ) {
					ProcessEvent( GSE_CALL, event );
				});*/
			}
		};

	}
	else {
		m_slot_num = 0;
	}
	m_player = m_state->m_slots->GetSlot( m_slot_num ).GetPlayer();
	m_slot = m_player->GetSlot();

	if ( m_state->IsMaster() ) {
		// generate map

		MTModule::Log( "Game seed: " + m_random->GetStateString() );

		ASSERT( !m_old_map, "old map not null" );
		m_old_map = nullptr;
		if ( m_map ) {
			m_old_map = m_map;
		}
		NEW( m_map, map::Map, this );

		const auto* config = g_engine->GetConfig();

#ifdef DEBUG
		// if crash happens - it's handy to have a seed to reproduce it
		util::FS::WriteFile( config->GetDebugPath() + map::s_consts.debug.lastseed_filename, m_random->GetStateString() );
#endif

		map::Map::error_code_t ec = map::Map::EC_UNKNOWN;

#ifdef DEBUG
		if ( !connection && config->HasDebugFlag( config::Config::DF_QUICKSTART_MAP_DUMP ) ) {
			const std::string& filename = config->GetQuickstartMapDump();
			ASSERT( util::FS::FileExists( filename ), "map dump file \"" + filename + "\" not found" );
			MTModule::Log( (std::string)"Loading map dump from " + filename );
			SetLoaderText( "Loading dump" );
			m_state->m_settings.global.map.preset_level = -1;
			m_map->Deserialize( types::Buffer( util::FS::ReadTextFile( filename ) ) );
			// A debug map dump starts a new roster, rather than restoring a full world.
			m_map->ResetConstructionOwnersForImport();
			ec = map::Map::EC_NONE;
		}
		else
#endif
		{
			if ( !connection && config->HasLaunchFlag( config::Config::LF_QUICKSTART_MAP_FILE ) ) {
				const std::string& filename = config->GetQuickstartMapFile();
				ec = m_map->LoadFromFile( filename );
			}
			else {
				auto& map_settings = m_state->m_settings.global.map;
				if ( map_settings.type == settings::MapSettings::MT_PLANET || map_settings.type == settings::MapSettings::MT_HUGE_PLANET ) {
					const bool huge = map_settings.type == settings::MapSettings::MT_HUGE_PLANET;
					auto* resources = g_engine->GetResourceManager();
					// Alien Crossfire adds its landmarks to the same Planet terrain.
					// Original Alpha Centauri installations provide the base maps.
					map_settings.filename = resources->TryGetCustomPath( huge ? "maps/xplanetx.MP" : "maps/xplanet.MP" );
					if ( map_settings.filename.empty() ) {
						map_settings.filename = resources->TryGetCustomPath( huge ? "maps/planetx.MP" : "maps/planet.MP" );
					}
					ec = map_settings.filename.empty()
						? map::Map::EC_MAPFILE_NOT_FOUND
						: m_map->LoadFromFile( map_settings.filename );
				}
				else if ( map_settings.type == settings::MapSettings::MT_MAPFILE ) {
					ASSERT( !map_settings.filename.empty(), "loading map requested but map file not specified" );
					ec = m_map->LoadFromFile( map_settings.filename );
				}
				else {
					ec = m_map->Generate( &map_settings, MT_C );
				}
			}

		}

		if ( !ec && canceled ) {
			ec = map::Map::EC_ABORTED;
		}

		if ( !ec ) {
			// Validate the actual map after import or CLI overrides, before any
			// world entities are created. Setup dimensions may describe another map.
			const auto error = GetStartupMapError();
			if ( !error.empty() ) {
				InitFailed( error );
				response.result = R_ERROR;
				return;
			}
			auto& completed_map = m_state->m_settings.global.map;
			if ( completed_map.type != settings::MapSettings::MT_RANDOM && completed_map.type != settings::MapSettings::MT_CUSTOM ) { completed_map.preset_level = -1; }
			m_state->m_settings.global.map.size_x = m_map->GetWidth();
			m_state->m_settings.global.map.size_y = m_map->GetHeight();
			m_slot->SetPlayerFlag( slot::PF_MAP_DOWNLOADED ); // map was generated locally
			if ( connection ) {
				connection->UpdateSlot( m_slot_num, m_slot, true );
			}
			m_game_state = GS_INITIALIZING;
			response.result = R_SUCCESS;
		}
		else if ( ec == map::Map::EC_ABORTED ) {
			response.result = R_ABORTED;
		}
		else {
			InitFailed( map::Map::GetErrorString( ec ) );
			response.result = R_ERROR;
		}
	}
	else {
		connection->IfClient(
			[ this, &response ]( connection::Client* connection ) -> void {

				// wait for server to initialize
				SetLoaderText( "Waiting for server" );

				const auto f_download_map = [ this, connection ] {

					SetLoaderText( "Downloading world snapshot" );

					connection->m_on_download_progress = [ this ]( const float progress ) -> void {
						SetLoaderText( "Downloading world snapshot:  " + std::to_string( (size_t)std::round( progress * 100 ) ) + "%" );
					};
					connection->m_on_download_complete = [ this, connection ]( const std::string serialized_snapshot ) -> void {
						connection->m_on_download_complete = nullptr;
						connection->m_on_download_progress = nullptr;
						MTModule::Log( "Unpacking world snapshot" );

						m_state->WithGSE( this, [ this, connection, serialized_snapshot ]( GSE_CALLABLE ) {

							auto buf = types::Buffer( serialized_snapshot );

							// map
							auto b = types::Buffer( buf.ReadString() );
							auto incoming_map = map::Map::LoadWorldTerrain( this, b );
							const auto ec = incoming_map ? map::Map::EC_NONE : map::Map::EC_MAPFILE_FORMAT_ERROR;
							if ( ec == map::Map::EC_NONE ) {
								m_map = incoming_map.release();

								// resources
								{
									auto ub = types::Buffer( buf.ReadString() );
									m_rm->Deserialize( ub );
								}

								// units
								{
									auto ub = types::Buffer( buf.ReadString() );
									m_um->Deserialize( GSE_CALL, ub );
								}

								// bases
								{
									auto bb = types::Buffer( buf.ReadString() );
									m_bm->Deserialize( GSE_CALL, bb );
								}

								// animations
								{
									auto ab = types::Buffer( buf.ReadString() );
									m_am->Deserialize( ab );
								}

								// technology definitions and ownership
								{
									auto tb = types::Buffer( buf.ReadString() );
									technology::DeserializeTable( m_technologies, tb );
								}

								// get turn info
								const auto turn_id = buf.ReadInt();
								technology::Research research;
								if ( buf.lenr != buf.lenw ) { research.Deserialize( types::Buffer( buf.ReadString() ) ); }
								if ( buf.lenr != buf.lenw ) { THROW( "Trailing world research snapshot data" ); }
								for ( size_t player = 0; player < technology::Research::PLAYERS; ++player ) {
									if ( research.Get( player ).income_turn > turn_id ) { THROW( "Future research credit in world snapshot" ); }
								}
								if ( !ValidateReceivedEnergyTurn( turn_id ) ) {
									connection->Disconnect( "Future player income in world snapshot" );
									return;
								}
								m_research = research;
								if ( turn_id > 0 ) {
									MTModule::Log( "Received turn ID: " + std::to_string( turn_id ) );
									AdvanceTurn( turn_id );
								}

								m_game_state = GS_INITIALIZING;

							}
							else {
								MTModule::Log( "WARNING: failed to unpack world snapshot (code=" + std::to_string( ec ) + ")" );
								connection->Disconnect( "Snapshot format mismatch" );
							}
						});
					};
					connection->RequestDownload();
				};
				if ( connection->GetGameState() == connection::Connection::GS_RUNNING ) {
					// server already initialized
					f_download_map();
				}
				else {
					// wait for server to initialize
					connection->m_on_game_state_change = [ this, f_download_map ]( const connection::Connection::game_state_t state ) -> void {
						switch ( state ) {
							case connection::Connection::GS_INITIALIZING: {
								// waiting
								break;
							}
							case connection::Connection::GS_RUNNING: {
								f_download_map();
								break;
							}
							default: {
								THROW( "unexpected game state: " + std::to_string( state ) );
							}
						}
					};
				}
				response.result = R_SUCCESS;
			}
		);
	}
}

void Game::ResetGame() {
	{ std::lock_guard guard( m_energy_views_mutex ); m_pending_energy_views.clear(); }
	std::lock_guard startup_guard( m_startup_mutex );
	++m_startup_generation;
	for ( auto& contacts : m_contacts ) { contacts.clear(); }
	m_technologies.Clear();
	m_research.Clear();
	for ( auto& receipt : m_research_receipts ) { receipt.reset(); }
	CustomUnset( "technologies_initialized" );

	ClearHandlers();

	if ( m_game_state != GS_NONE ) {
		// TODO: do something?
		m_game_state = GS_NONE;
	}
	m_init_cancel = false;
	m_player = nullptr;
	m_slot_num = 0;
	m_slot = nullptr;

	{
		std::lock_guard guard( m_events_waiting_for_responses_mutex );
		m_events_waiting_for_responses.clear();
	}
	{
		std::lock_guard guard( m_pending_events_mutex );
		m_pending_events.clear();
	}
	{
		std::lock_guard guard( m_event_handlers_mutex );
		m_event_handlers.clear();
	}
	m_next_event_id = 0;
	m_founding_records.clear();
	m_joining_records.clear();
	m_disbanding_records.clear();

	m_tm = nullptr;
	m_rm = nullptr;
	m_um = nullptr;
	m_bm = nullptr;
	m_am = nullptr;

	if ( m_response_map_data ) {
		ASSERT( m_map, "pending map response without map" );
		// Before transfer the response borrows map resources. InitFailed may
		// already have freed them, so use the current fields rather than stale
		// response pointers. On normal cancellation this destructor owns them.
		m_response_map_data->terrain_texture = m_map->m_textures.terrain;
		m_response_map_data->terrain_mesh = m_map->m_meshes.terrain;
		m_response_map_data->terrain_data_mesh = m_map->m_meshes.terrain_data;
		m_map->m_textures.terrain = nullptr;
		m_map->m_meshes.terrain = nullptr;
		m_map->m_meshes.terrain_data = nullptr;
		DELETE( m_response_map_data );
		m_response_map_data = nullptr;
	}
	if ( m_map ) {
		MTModule::Log( "Resetting map" );
		DELETE( m_map );
		m_map = nullptr;
	}

	ASSERT( m_pending_frontend_requests, "pending events not set" );
	m_pending_frontend_requests->clear();

	m_current_turn.Reset();
	m_has_started_turn = false;
	m_opening_phase = OPENING_NONE; m_opening_base = nullptr; m_opening_base_id = 0; m_auto_end_turn = false; m_opening_first_turn_dispatched = m_opening_first_turn_applied = false; ++m_opening_session;
	m_is_turn_complete = false;

	if ( m_state ) {
		// ui thread will reset state as needed
		m_state->UnsetGame();
		if ( m_state->m_connection ) {
			m_state->m_connection->Disconnect();
			m_state->m_connection->ResetHandlers();
		}
	}
}

technology::Table& Game::GetTechnologyTable() {
	return m_technologies;
}

const technology::Table& Game::GetTechnologyTable() const {
	return m_technologies;
}

void Game::CheckTurnComplete() {
	if ( IsOpeningPending() ) { return; }

	const bool is_turn_complete = !m_um->HasReadyUnit( m_slot_num );

	if ( m_is_turn_complete != is_turn_complete ) {
		m_is_turn_complete = is_turn_complete;
		MTModule::Log( "Sending turn complete status: " + std::to_string( m_is_turn_complete ) );
		SetTurnStatus( m_is_turn_complete
			? turn::TS_TURN_COMPLETE
			: turn::TS_TURN_ACTIVE
		);
	}

}

const bool Game::IsRunning() const {
	return m_game_state == GS_RUNNING;
}

const bool Game::IsMapReady() const {
	return m_game_state > GS_PREPARING_MAP;
}

const std::string Game::GenerateEventId() {
	return std::to_string( m_slot_num ) + "_" + std::to_string( ++m_next_event_id );
}

void Game::SetState( State* const state ) {
	ASSERT( state, "state is null" );
	if ( state != m_state ) {
		ASSERT( !m_state, "game state already set" );
		m_state = state;
	}
}

}
}
