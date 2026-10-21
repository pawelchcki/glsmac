#include "GLSMAC.h"

#include "util/FS.h"
#include "engine/Engine.h"
#include "config/Config.h"
#include "resource/ResourceManager.h"
#include "scheduler/Scheduler.h"
#include "util/LogHelper.h"
#include "gc/Space.h"
#include "console/Console.h"
#include "ui/UI.h"
#include "loader/txt/TXTLoaders.h"
#include "loader/txt/SmacTextLoader.h"

#include "gse/GSE.h"
#include "gse/ExecutionPointer.h"
#include "gse/Async.h"
#include "gse/context/GlobalContext.h"
#include "gse/callable/Native.h"
#include "gse/Exception.h"
#include "gse/value/Undefined.h"
#include "gse/value/Array.h"
#include "gse/value/Int.h"

#include "game/backend/Game.h"
#include "game/backend/State.h"
#include "game/backend/slot/Slots.h"
#include "game/backend/Player.h"
#include "game/backend/faction/Faction.h"
#include "game/backend/faction/FactionManager.h"
#include "game/backend/connection/Server.h"
#include "game/backend/connection/Client.h"

#include "game/frontend/Game.h"
#include "game/frontend/base/BaseManager.h"
#include "game/frontend/base/Base.h"
#include "game/frontend/text/InstancedText.h"

static GLSMAC* s_glsmac = nullptr;

GLSMAC::GLSMAC()
	: gse::GCWrappable( nullptr ) {

	// there can only be one GLSMAC
	ASSERT( !s_glsmac, "GLSMAC already defined" );
	s_glsmac = this;

	Log( "Creating global state" );

	// scripting stuff
	NEW( m_gse, gse::GSE );
	m_gse->AddRootObject( this );
	m_gse->AddBindings( this );
	m_ctx = m_gse->CreateGlobalContext();
	m_gc_space = m_gse->GetGCSpace();

	const auto& c = g_engine->GetConfig();

	const auto entry_script =
		util::FS::GeneratePath(
			{
				c->GetDataPath(),
				"default", // only 'default' mod for now
				c->GetMainScript() // script name (extension is appended automatically)
			}, gse::GSE::PATH_SEPARATOR
		)
	;

	m_gc_space->Accumulate( this, [ this ]() {
		gse::ExecutionPointer ep;
		// init UI
		m_ui = new ui::UI( m_gc_space, m_ctx, { "" }, ep );
	}, nullptr, true);

	// init console
	InitConsole();

	m_gc_space->Accumulate( this, [ this, &entry_script ]() {
		gse::ExecutionPointer ep;
		// load main scripts (will be run in RunMain())
		m_gse->RunScript( m_gc_space, m_ctx, {}, ep, entry_script );
		for ( const auto& mod_path : g_engine->GetConfig()->GetModPaths() ) {
			m_gse->RunScript(
				m_gc_space, m_ctx, {}, ep, util::FS::GeneratePath(
					{
						mod_path,
						"main"
					}
				)
			);
		}
	}, nullptr, true );

}

GLSMAC::~GLSMAC() {

	if ( m_load_thread ) {
		Log( "Waiting for load thread to stop" );
		m_load_thread.load()->join();
		delete m_load_thread;
	}

	if ( m_is_loader_shown ) {
		HideLoader();
	}

	Log( "Destroying global state" );

	if ( m_game ) {
		m_game->Stop();
		delete m_game;
	}

	m_gse->GetAsync()->StopTimers();

	if ( m_console ) {
		m_console->Stop();
		delete m_console;
	}

	m_gc_space->Accumulate( this, [ this ](){
		gse::ExecutionPointer ep;
		m_ui->Destroy( m_gc_space, m_ctx, { "" }, ep );
	}, nullptr, true);

	DELETE( m_gse );

	s_glsmac = nullptr;
}

void GLSMAC::Iterate() {
	{
		bool ticked = false;
		while ( m_loader_dots_timer.HasTicked() ) {
			m_loader_dots++;
			if ( m_loader_dots > 3 ) {
				m_loader_dots = 1;
			}
			ticked = true;
		}
		if ( ticked ) {
			UpdateLoaderText();
		}
	}
	if ( m_load_thread ) {
		if ( !m_is_loading ) {
			ASSERT( m_f_after_load, "f_after_load not set" );
			m_load_thread.load()->join();
			delete m_load_thread;
			m_load_thread = nullptr;
			m_gc_space->Accumulate( this, [ this ](){
				HideLoader();
				m_f_after_load();
			});
			m_f_after_load = nullptr;
		}
	}
	m_gse->Iterate();
	m_ui->Iterate();
	if ( m_game ) {
		m_game->Iterate();
	}
	if ( m_reset_needed ) {
		m_reset_needed = false;
		auto* game = g_engine->GetGame();
		const auto mt_id = game->MT_Reset();
		const auto& response = game->MT_WaitResponse( mt_id );
		ASSERT( response.result == game::backend::R_SUCCESS, "failed to reset game thread" );
		game->MT_DestroyResponse( response );
		RunMain();
	}
	if ( m_console ) {
		m_console->Iterate();
	}
}

WRAPIMPL_BEGIN( GLSMAC )
	auto* game = g_engine->GetGame();
	WRAPIMPL_PROPS
	WRAPIMPL_TRIGGERS
		{
			"config",
			g_engine->GetConfig()->Wrap( GSE_CALL ),
		},
		{
			"ui",
			m_ui->Wrap( GSE_CALL )
		},
		{
			"run",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				S_Init( GSE_CALL, {} );
				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"exit",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				g_engine->ShutDown();
				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"mainmenu", NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				S_MainMenu( GSE_CALL );
				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"deinit",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				DeinitGameState( GSE_CALL );
				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"init",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				InitGameState( GSE_CALL );
				return VALUE( gse::value::Undefined );
			} ),
		},
		{
			"reset",
			NATIVE_CALL( this ) {
				S_Reset( GSE_CALL );
				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"game",
			game->Wrap( GSE_CALL ),
		},
		{
			"connect",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				if ( !m_state ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Game not initialized" );
				}
				if ( m_state->GetConnection() ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Connection is already established" );
				}
				if ( m_is_game_running ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Game is already running" );
				}
				game::backend::connection::Connection* connection = nullptr;
				switch ( m_state->m_settings.local.network_role ) {
					case game::backend::settings::LocalSettings::NR_SERVER: {
						NEW( connection, game::backend::connection::Server, gc_space, &m_state->m_settings.local );
						break;
					}
					case game::backend::settings::LocalSettings::NR_CLIENT: {
						NEW( connection, game::backend::connection::Client, gc_space, &m_state->m_settings.local );
						break;
					}
					default:
						GSE_ERROR( gse::EC.GAME_ERROR, "Network role not set" );
				}
				m_state->SetConnection( connection );
				return connection->Wrap( GSE_CALL );
			} ),
		},
		{
			"list_maps",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 0 );
				if ( !m_state ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Game not initialized" );
				}
				if ( m_is_game_running || m_is_loading ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Maps can only be listed during game setup" );
				}
				gse::value::array_elements_t maps = {};
				for ( const auto& map : g_engine->GetResourceManager()->GetMapFiles() ) {
					maps.push_back( VALUEEXT( gse::value::Object, GSE_CALL, ( gse::value::object_properties_t{
						{ "name", VALUE( gse::value::String,, map.first ) },
						{ "filename", VALUE( gse::value::String,, map.second ) },
					} ) ) );
				}
				return VALUE( gse::value::Array,, maps );
			} )
		},
		{
			"load_smac_text",
			NATIVE_CALL() {
				N_EXPECT_ARGS( 2 ); N_GETVALUE( filename, 0, String ); N_GETVALUE( format, 1, String );
				const auto* loaders = g_engine->GetTXTLoaders();
				if ( !loaders ) { GSE_ERROR( gse::EC.LOADER_ERROR, "SMAC text loaders are unavailable" ); }
				try {
					return loader::txt::WrapSmacTextDocument( GSE_CALL, loaders->smac_text->Load( filename, format ) );
				}
				catch ( const std::exception& error ) { GSE_ERROR( gse::EC.LOADER_ERROR, error.what() ); }
			} )
		},
		{
			"get_base_map_label", NATIVE_CALL( this ) {
				N_EXPECT_ARGS( 1 ); N_GETVALUE( id, 0, Int );
				const auto* base = m_game && m_game->GetBM() && id > 0 ? m_game->GetBM()->GetBaseById( id ) : nullptr;
				if ( !base ) { return VALUE( gse::value::Undefined ); }
				const auto* label = base->GetNameSprite();
				return VALUEEXT( gse::value::Object, GSE_CALL, {
					{ "text", VALUE( gse::value::String,, label->GetText() ) },
					{ "symbols", VALUE( gse::value::Int,, label->GetSymbolCount() ) },
					{ "instances", VALUE( gse::value::Int,, label->GetInstanceCount() ) },
				} );
			} )
		},
		{
			"start_game",
			NATIVE_CALL( this ) {
				N_EXPECT_ARGS_MAX( 2 );
				if ( !m_state ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Game not initialized" );
				}
				if ( m_is_game_running ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Game is already running" );
				}
				if ( m_is_loading ) {
					GSE_ERROR( gse::EC.GAME_ERROR, "Game still initializing" );
				}
				game::backend::faction::Faction* faction = nullptr;
				if ( !arguments.empty() ) {
					N_GETVALUE( faction_id, 0, String );
					if ( m_state->m_settings.local.game_mode != game::backend::settings::LocalSettings::GM_SINGLEPLAYER || !m_state->m_slots->GetSlots().empty() ) {
						GSE_ERROR( gse::EC.GAME_ERROR, "Faction can only be chosen when creating a single-player game" );
					}
					if ( faction_id != "RANDOM" ) {
						faction = m_state->GetFM()->Get( faction_id );
						if ( !faction ) {
							GSE_ERROR( gse::EC.GAME_ERROR, "Unknown faction: " + faction_id );
						}
					}
				}
				if ( arguments.size() == 2 ) {
					if ( !faction ) { GSE_ERROR( gse::EC.GAME_ERROR, "Identity requires an explicitly selected faction" ); }
					N_GETVALUE( values, 1, Array );
					const auto identity = game::backend::faction::Faction::ParseIdentity( GSE_CALL, values );
					if ( identity[ 0 ] != m_state->m_settings.local.player_name ) {
						GSE_ERROR( gse::EC.GAME_ERROR, "Leader identity must match the confirmed player name" );
					}
					faction->SetIdentity( identity );
				}
				if ( m_state->m_slots->GetSlots().empty() ) {
					AddSinglePlayerSlot( faction, arguments.size() == 2 );
				}
				StartGame( GSE_CALL );
				return VALUE( gse::value::Undefined );
			} )
		},
	};
WRAPIMPL_END_PTR()

UNWRAPIMPL_PTR( GLSMAC )

void GLSMAC::ShowLoader( const std::string& text ) {
	if ( !m_is_loader_shown ) {
		m_is_loader_shown = true;
		m_loader_text = text;
		m_loader_dots = 1;
		m_loader_dots_timer.SetInterval( 100 );
		m_gc_space->Accumulate( this, [ this ] () {
			try {
				TriggerObject( m_ui, "loader_show" );
			} catch ( const gse::Exception& e ) {
				// tmp fix gdb race conditions // TODO
			}
		});
	}
	UpdateLoaderText();
}

void GLSMAC::SetLoaderText( const std::string& text ) {
	if ( !m_is_loader_shown ) {
		ShowLoader( text );
	}
	else {
		m_loader_text = text;
		UpdateLoaderText();
	}
}

void GLSMAC::HideLoader() {
	if ( m_is_loader_shown ) {
		m_is_loader_shown = false;
		m_loader_dots_timer.Stop();
		m_gc_space->Accumulate( this, [ this ](){
			try {
				TriggerObject( m_ui, "loader_hide" );
			} catch ( const gse::Exception& e ) {
				// tmp fix gdb race conditions // TODO
			}
		});
	}
}

void GLSMAC::ShowError( const std::string& text, const std::function< void() >& on_close ) {
	Log( text );
	m_gc_space->Accumulate( this, [ this ](){
		TriggerObject( m_ui, "error_popup" );
	});
}

gse::Value* const GLSMAC::TriggerObject( gse::GCWrappable* object, const std::string& event, const f_args_t& f_args ) {
	gse::ExecutionPointer ep;
	return object->Trigger( m_gc_space, m_ctx, {}, ep, event, f_args );
}

void GLSMAC::WithGSE( const std::function<void( GSE_CALLABLE )>& f ) {
	m_state->WithGSE( this, f );
}

void GLSMAC::GetReachableObjects( std::unordered_set< gc::Object* >& reachable_objects ) {
	gse::GCWrappable::GetReachableObjects( reachable_objects );

	g_engine->GetGame()->GetReachableObjects( reachable_objects );

	if ( m_state ) {
		GC_DEBUG_BEGIN( "state" );
		GC_REACHABLE( m_state );
		GC_DEBUG_END();
	}

	if ( m_wrapobj ) {
		GC_DEBUG_BEGIN( "wrapobj" );
		GC_REACHABLE( m_wrapobj );
		GC_DEBUG_END();
	}

	if ( m_ui ) {
		GC_DEBUG_BEGIN( "ui" );
		GC_REACHABLE( m_ui );
		GC_DEBUG_END();
	}

	GC_DEBUG_BEGIN( "main callables" );
	for ( const auto& m : m_main_callables ) {
		GC_REACHABLE( m );
	}
	GC_DEBUG_END();

}

void GLSMAC::AsyncLoad( const std::string& text, const std::function< void() >& f, const std::function< void() >& f_after_load ) {
	ASSERT( !m_load_thread, "load thread already set" );
	ASSERT( !m_f_after_load, "f_after load already set" );
	m_is_loading = true;
	m_f_after_load = f_after_load;
	ShowLoader( text );
	m_load_thread = new std::thread( [ this, f ] {
		f();
		m_is_loading = false;
	});
}

void GLSMAC::S_Init( GSE_CALLABLE, const std::optional< std::string >& path ) {
	const auto& c = g_engine->GetConfig();
	auto* r = g_engine->GetResourceManager();
	if ( !m_state || r->GetDetectedSMACType() == config::ST_UNKNOWN ) {
		if ( !m_state ) {
			m_state = new game::backend::State( m_gc_space, m_ctx, this );
			m_state->m_settings.global.Initialize();
		}
		try {
			if ( path.has_value() ) {
				r->Init( { path.value() }, config::ST_AUTO );
			}
			else {
				r->Init( c->GetPossibleSMACPaths(), c->GetSMACType() );
			}
		} catch ( const std::runtime_error& e ) {
			gse::value::object_properties_t args = {
				{
					"set_smacpath", NATIVE_CALL( this ) {
						N_EXPECT_ARGS( 1 );
						N_GETVALUE( path, 0, String );
						S_Init( GSE_CALL, path );
						return VALUE( gse::value::Undefined );
					} )
				}
			};
			if ( path.has_value() ) {
				args.insert({ "last_failed_path", VALUE( gse::value::String,, path.value() ) } );
			}
			TriggerObject( this, "smacpath_prompt", ARGS( args ) );
			return;
		}
		if ( path.has_value() ) {
			c->SetSMACPath( path.value() );
		}
	}
	// Asset resolution precedes both main-menu startup and CLI Quick Start.
	// Import once here; game configuration and receiving settings never reload
	// local rules over an authoritative transferred value.
	const auto* loaders = g_engine->GetTXTLoaders();
	if ( !loaders ) { GSE_ERROR( gse::EC.LOADER_ERROR, "SMAC text loaders are unavailable" ); }
	loader::txt::SmacTextDocument document;
	try { document = loaders->smac_text->Load( "alphax.txt", "rules" ); }
	catch ( const std::exception& error ) { GSE_ERROR( gse::EC.LOADER_ERROR, error.what() ); }
	auto* factor = TriggerObject( this, "configure_rules", ARGS_F( &document ) {
		{ "document", loader::txt::WrapSmacTextDocument( GSE_CALL, document ) },
	}; } );
	if ( !factor || factor->type != gse::VT_INT ) { GSE_ERROR( gse::EC.INVALID_HANDLER, "configure_rules must return an integer nutrient multiplier" ); }
	const auto value = static_cast< gse::value::Int* >( factor )->value;
	if ( value < 1 || value > 100 ) { GSE_ERROR( gse::EC.INVALID_HANDLER, "configure_rules nutrient multiplier must be from 1 through 100" ); }
	auto* mineral_factor = TriggerObject( this, "configure_mineral_rules", ARGS_F( &document ) {
		{ "document", loader::txt::WrapSmacTextDocument( GSE_CALL, document ) },
	}; } );
	if ( !mineral_factor || mineral_factor->type != gse::VT_INT ) { GSE_ERROR( gse::EC.INVALID_HANDLER, "configure_mineral_rules must return an integer mineral multiplier" ); }
	const auto mineral_value = static_cast< gse::value::Int* >( mineral_factor )->value;
	if ( mineral_value < 1 || mineral_value > 100 ) { GSE_ERROR( gse::EC.INVALID_HANDLER, "configure_mineral_rules mineral multiplier must be from 1 through 100" ); }
	auto* world_sizes = TriggerObject( this, "configure_world_sizes", ARGS_F( &document ) {
		{ "document", loader::txt::WrapSmacTextDocument( GSE_CALL, document ) },
	}; } );
	const auto decoded_sizes = game::backend::rules::Rules::DecodeWorldSizes( GSE_CALL, world_sizes );
	const bool first_sizes = !m_state->m_settings.global.rules.HasWorldSizes();
	// All pure callbacks and native validation finish before any rule changes.
	m_state->m_settings.global.rules.SetNutrientCostFactor( value );
	m_state->m_settings.global.rules.SetMineralCostFactor( mineral_value );
	m_state->m_settings.global.rules.SetWorldSizes( decoded_sizes );
	if ( first_sizes ) {
		auto& map = m_state->m_settings.global.map;
		// Startup owns an untouched default map. Receiving or explicitly chosen
		// settings keep their dimensions when scripts are reinitialized.
		if ( map.type == game::backend::settings::MapSettings::MT_RANDOM && map.preset_level == -1 && map.size_x == 112 && map.size_y == 56 ) {
			map.SelectWorldSize( decoded_sizes[2].size_x, decoded_sizes[2].size_y, 2 );
		}
	}
	Reset( GSE_CALL );
}

void GLSMAC::S_Reset( GSE_CALLABLE ) {
	ClearHandlers();
	m_ui->Clear( GSE_CALL );
	auto* game = g_engine->GetGame();
	game->ClearHandlers();
	game->ClearEvents();
	m_reset_needed = true;
}

void GLSMAC::S_Intro( GSE_CALLABLE ) {
	TriggerObject( this, "intro" );
}

void GLSMAC::S_MainMenu( GSE_CALLABLE ) {
	TriggerObject( this, "mainmenu_show", ARGS_F( this ) {
		{
			"settings",
			m_state->m_settings.Wrap( GSE_CALL ),
		}
	}; } );
}

void GLSMAC::S_Game( GSE_CALLABLE ) {
	TriggerObject( this, "mainmenu_hide", {} );
	m_game->Start();
}

void GLSMAC::UpdateLoaderText() {
	ASSERT( m_is_loader_shown, "loader not shown" );
	std::string text = m_loader_text + std::string( m_loader_dots, '.' ) + std::string( 3 - m_loader_dots, ' ' );
	m_gc_space->Accumulate( this, [ this, &text ]() {
		try {
			TriggerObject( m_ui, "loader_text", ARGS_F( this, &text ) {
				{
					"text", VALUEEXT( gse::value::String, m_gc_space, text )
				}
			}; } );
		} catch ( const gse::Exception& e ) {
			// tmp fix gdb race conditions // TODO
		}
	});
}

void GLSMAC::Reset( GSE_CALLABLE ) {
	const auto& c = g_engine->GetConfig();

	HideLoader();
	m_is_game_running = false;

	if ( m_game ) {
		m_game->Stop();
	}

	if ( c->HasLaunchFlag( config::Config::LF_QUICKSTART ) ) {
		InitGameState( GSE_CALL );
		m_state->m_settings.local.game_mode = game::backend::settings::LocalSettings::GM_SINGLEPLAYER;
		m_state->m_settings.global.Initialize();
		game::backend::faction::Faction* faction = nullptr;
		if ( c->HasLaunchFlag( config::Config::LF_QUICKSTART_FACTION ) ) {
			const auto* fm = m_state->GetFM();
			ASSERT( fm, "fm is null" );
			faction = fm->Get( c->GetQuickstartFaction() );
			if ( !faction ) {
				std::string errmsg = "Faction \"" + c->GetQuickstartFaction() + "\" does not exist. Available factions:";
				for ( const auto& f : fm->GetAll() ) {
					errmsg += " " + f->m_id;
				}
				THROW( errmsg );
			}
		}
		AddSinglePlayerSlot( faction );
		auto ep2 = ep;
		StartGame( m_gc_space, ctx, si, ep2 );
	}
	else if (
		c->HasLaunchFlag( config::Config::LF_SKIPINTRO ) ||
			g_engine->GetResourceManager()->GetDetectedSMACType() == config::ST_LEGACY // it doesn't have firaxis logo image
		) {
		S_MainMenu( GSE_CALL );
	}
	else {
		S_Intro( GSE_CALL );
	}
}

void GLSMAC::DeinitGameState( GSE_CALLABLE ) {
	if ( m_state ) {
		if ( m_is_game_running ) {
			GSE_ERROR( gse::EC.GAME_ERROR, "Game is still running" );
		}
		m_state->Reset();
	}
}

void GLSMAC::InitGameState( GSE_CALLABLE ) {
	if ( m_is_game_running ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Game is already running" );
	}
	auto* game = g_engine->GetGame();
	m_state->Reset();
	m_state->SetGame( game );
	game->SetState( m_state );
	m_state->WithGSE( this, [ this ]( GSE_CALLABLE ) {
		TriggerObject( this, "configure_state", ARGS_F( this ) {
			{
				"fm",
				m_state->GetFM()->Wrap( GSE_CALL ),
			}
		}; } );
	});
}

void GLSMAC::RandomizeSettings( GSE_CALLABLE ) {
	if ( !m_state ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Game is not initialized" );
	}
	if ( m_is_game_running ) {
		GSE_ERROR( gse::EC.GAME_ERROR, "Game is already running" );
	}
}

void GLSMAC::AddSinglePlayerSlot( game::backend::faction::Faction* const faction, const bool name_confirmed ) {
	m_state->m_slots->Resize( 7 ); // TODO: make dynamic?
	const auto& rules = m_state->m_settings.global.rules;
	const auto& difficulty = rules.m_difficulty_levels.GetString( m_state->m_settings.global.difficulty_level );
	Log( "Single-player setup: faction=" + ( faction ? faction->m_id : "RANDOM" ) + ", difficulty=" + difficulty );
	if ( !name_confirmed && m_state->m_settings.local.player_name.empty() ) {
		m_state->m_settings.local.player_name = "Player";
	}
	NEWV( player, ::game::backend::Player,
		m_state->m_settings.local.player_name,
		::game::backend::Player::PR_SINGLE,
		faction,
		difficulty
	);
	m_state->AddPlayer( player );
	size_t slot_num = 0; // player always has slot 0
	m_state->AddCIDSlot( 0, slot_num ); // for consistency
	auto& slot = m_state->m_slots->GetSlot( slot_num );
	slot.SetPlayer( player, 0, "" );
	slot.SetPlayerFlag( ::game::backend::slot::PF_READY );
	slot.SetLinkedGSID( m_state->m_settings.local.account.GetGSID() );
}

void GLSMAC::StartGame( GSE_CALLABLE ) {
	// real state belongs to game task now
	// save it as backup, then make temporary shallow copy (no connection, players etc)
	//   just for the sake of passing settings to previous menu
	auto* real_state = m_state;

	//m_state = nullptr; // TODO: why?

	m_is_game_running = true;

	auto* game = g_engine->GetGame();
	ASSERT( game, "game not set" );

	if ( m_game ) {
		m_game->Stop();
		delete m_game;
	}
	m_game = new ::game::frontend::Game(
		this, real_state, m_ui, [ this, si, ep ] () {
			m_gc_space->Accumulate(
				this, [ this ]() {
					TriggerObject( this, "start_game" );
				}
			);
		}, [] () {
			// THROW( "TODO: cancel" );
		}
	);

	S_Game( GSE_CALL );

	TriggerObject( this, "configure_game", ARGS_F( &game ) {
		{
			"game",
			game->Wrap( GSE_CALL ),
		}
	}; } );
}

void GLSMAC::InitConsole() {
	ASSERT( !m_console, "console already initialized" );
	m_console = new console::Console();
	m_console->Start();
}

void GLSMAC::RunMain() {
	ASSERT( m_gc_space, "gc space is null" );
	for ( const auto& main : m_main_callables ) {
		ASSERT( main->type == gse::VT_CALLABLE, "main not callable" );
		m_gc_space->Accumulate( this, [ this, &main ] (){
			gse::ExecutionPointer ep;
			if ( !m_wrapobj ) {
				m_wrapobj = Wrap( m_gc_space, m_ctx, {}, ep );
			}
			( (gse::value::Callable*)main )->Run( m_gc_space, m_ctx, {}, ep, {
				m_wrapobj
			} );
		});
	}
}

void GLSMAC::AddToContext( gc::Space* const gc_space, gse::context::Context* ctx, gse::ExecutionPointer& ep ) {
	ctx->CreateBuiltin( "main", NATIVE_CALL( this ) {
		N_EXPECT_ARGS( 1 );
		const auto& main = arguments.at(0);
		N_CHECKARG( main, 0, Callable );
		m_main_callables.push_back( main );
		return VALUE( gse::value::Undefined );
	} ), ep );
}
