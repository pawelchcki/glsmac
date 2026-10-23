#pragma once

#include <unordered_map>
#include <unordered_set>
#include <string>
#include <map>
#include <vector>
#include <memory>

#include "common/MTModule.h"
#include "gse/GCWrappable.h"

#include "Types.h"
#include "game/backend/map/Types.h"
#include "game/backend/map/RenderResources.h"

#include "types/Exception.h"
#include "gse/Exception.h"
#include "game/FrontendRequest.h"
#include "game/BackendRequest.h"
#include "game/backend/turn/Turn.h"
#include "game/backend/technology/Table.h"
#include "game/backend/technology/Research.h"
#include "game/backend/base/ProductionState.h"

// TODO: remove those
#include "game/backend/map/tile/Tile.h"
#include "game/backend/map/tile/TileState.h"

class GLSMAC;

namespace gse::tests::mocks { struct ProductionFixture; }
namespace gse::value { class Callable; }

namespace types {
namespace texture {
class Texture;
}
namespace mesh {
class Render;

class Data;
}
}

namespace game {
namespace backend {

class Random;

namespace animation {
class Def;
}

namespace faction {
class Faction;
}

namespace map {
namespace tile {
class TileManager;
}
}

namespace resource {
class ResourceManager;
}

namespace unit {
class UnitManager;
}

namespace base {
class BaseManager;
}

namespace animation {
class AnimationManager;
}

namespace event {
class Event;
}

class State;

class Player;

namespace connection {
class Connection;
}

namespace bindings {
class Bindings;
}

namespace map {
class Map;
}

namespace slot {
class Slot;
}

namespace event {
class Event;
class EventHandler;
}

enum op_t {
	OP_NONE,
	OP_PING,
	OP_INIT,
	OP_GET_MAP_DATA,
	OP_RESET,
	OP_SAVE_MAP,
	OP_GET_FRONTEND_REQUESTS,
	OP_SEND_BACKEND_REQUESTS,
	OP_ADD_EVENT,
#ifdef DEBUG
	OP_SAVE_DUMP,
	OP_LOAD_DUMP,
#endif
};

enum result_t {
	R_NONE,
	R_SUCCESS,
	R_ABORTED,
	R_ERROR,
	R_PENDING,
};

typedef std::vector< types::mesh::Render* > data_tile_meshes_t;

typedef union {
	struct {
		bool try_next_unit;
		bool no_scroll_after;
	} tile_select;
	struct {
		size_t unit_id;
		bool no_scroll_after;
	} unit_select;
} tile_query_metadata_t;

struct MT_Request {
	op_t op;
	union {
		struct { bool interactive_opening; } init;
		struct {
			tile_query_purpose_t purpose;
			size_t tile_x;
			size_t tile_y;
			map::tile::direction_t tile_direction;
			tile_query_metadata_t metadata;
		} select_tile;
		struct {
			std::string* path;
		} save_map;
		struct {
			std::string* message;
		} chat;
#ifdef DEBUG
		struct {
			std::string* path;
		} dump;
#endif
		struct {
			std::string* serialized_event;
		} add_event;
		struct {
			std::vector< BackendRequest >* requests;
		} send_backend_requests;
	} data;
};

// can't use types::Vec* because only simple structs can be used in union
struct vec3_t {
	float x;
	float y;
	float z;

	vec3_t operator=( const types::Vec3& source ) {
		x = source.x;
		y = source.y;
		z = source.z;
		return *this;
	};

	void operator-=( const vec3_t rhs ) {
		x -= rhs.x;
		y -= rhs.y;
		z -= rhs.z;
	};
};

struct vec2_t {
	float x;
	float y;
};

struct vertices_t {
	vec3_t center;
	vec3_t left;
	vec3_t top;
	vec3_t right;
	vec3_t bottom;
};

struct response_map_data_t {
	std::shared_ptr< map::RenderResources > render_resources;
	size_t map_width;
	size_t map_height;
	types::texture::Texture* terrain_texture;
	types::mesh::Render* terrain_mesh;
	types::mesh::Data* terrain_data_mesh;
	std::string* path;
	struct {
		std::unordered_map< std::string, map::sprite_actor_t >* actors;
		std::unordered_map< size_t, std::pair< std::string, types::Vec3 > >* instances;
	} sprites;
	const std::vector< map::tile::Tile >* tiles;
	const std::vector< map::tile::TileState >* tile_states;
	~response_map_data_t();
};

struct MT_Response {
	op_t op;
	result_t result;
	union {
		struct {
			size_t slot_index;
		} init;
		response_map_data_t* get_map_data;
		struct {
			const std::string* error_text;
		} error;
		struct {
			tile_query_purpose_t purpose;
			size_t tile_x;
			size_t tile_y;
			vec2_t coords;
			struct {
				map::tile::elevation_t center;
			} elevation;
			vertices_t selection_coords;
			data_tile_meshes_t* preview_meshes;
			std::vector< std::string >* preview_lines;
			bool scroll_adaptively;
			std::vector< std::string >* sprites;
			std::vector< size_t >* unit_ids;
			tile_query_metadata_t metadata;
		} select_tile;
		struct {
			std::string* path;
		} save_map;
		struct {
			std::vector< FrontendRequest >* requests;
		} get_frontend_requests;
	} data;
};

typedef common::MTModule< MT_Request, MT_Response > MTModule;

CLASS2( Game, MTModule, gse::GCWrappable )

	Game();

	// returns success as soon as this thread is ready (not busy with previous requests)
	common::mt_id_t MT_Ping();

	// initialize map and other things
	common::mt_id_t MT_Init( State* state, bool interactive_opening = false );

	// get map data for display
	common::mt_id_t MT_GetMapData();

	// deinitialize everything
	common::mt_id_t MT_Reset();

	// saves current map into file
	common::mt_id_t MT_SaveMap( const std::string& path );

	// get all pending frontend requests (will be cleared after)
	common::mt_id_t MT_GetFrontendRequests();

	// send backend requests for processing
	common::mt_id_t MT_SendBackendRequests( const std::vector< BackendRequest >& requests );

#ifdef DEBUG

	common::mt_id_t MT_SaveDump( const std::string& path );
	common::mt_id_t MT_LoadDump( const std::string& path );

#endif

	void Start() override;
	void Stop() override;
	void Iterate() override;

	const bool IsStarted() const;
	Random* GetRandom() const;
	map::Map* GetMap() const;
	State* GetState() const;
	const Player* GetPlayer() const;
	const size_t GetSlotNum() const;

	void ShowLoader( const std::string& text );
	void SetLoaderText( const std::string& text );
	void HideLoader();

	void Event( GSE_CALLABLE, const std::string& name, const gse::value::object_properties_t& args );
	void AddEvent( event::Event* const event );
	void AddEventResponse( const std::string& event_id, const bool result, gse::Value* const resolved );

	void ClearEvents();
	std::string ValidateFoundBaseUnit( int64_t unit_id, int64_t caller ) const;
	bool IsFoundBaseAdjacent( int64_t unit_id ) const;
	std::string ValidateFoundBase( int64_t unit_id, int64_t caller ) const;
	std::string ValidateNamedFoundBase( int64_t unit_id, int64_t caller, int64_t turn, const std::string& name ) const;
	gse::Value* FoundBase( GSE_CALLABLE, int64_t unit_id, int64_t caller, gse::value::Callable* chooser, const std::string* name = nullptr, int64_t turn = 0 );
	void RollbackFoundBase( GSE_CALLABLE, int64_t token, int64_t base_id );
	std::string ValidateJoinBase( int64_t unit_id, int64_t base_id, int64_t caller ) const;
	gse::Value* JoinBase( GSE_CALLABLE, int64_t unit_id, int64_t base_id, int64_t caller );
	void RollbackJoinBase( GSE_CALLABLE, int64_t token, int64_t base_id );
	std::string ValidateUnitDisband( int64_t unit_id, int64_t caller, int64_t turn ) const;
	size_t GetUnitDisbandBase( int64_t unit_id ) const;
	gse::Value* DisbandUnit( GSE_CALLABLE, int64_t unit_id, int64_t caller, int64_t turn );
	void RollbackUnitDisband( GSE_CALLABLE, int64_t token, int64_t unit_id, int64_t caller, int64_t turn, int64_t base_id );

	WRAPDEFS_PTR( Game )

	void GetReachableObjects( std::unordered_set< Object* >& reachable_objects ) override;

protected:

	const MT_Response ProcessRequest( const MT_Request& request, MT_CANCELABLE ) override;
	void DestroyRequest( const MT_Request& request ) override;
	void DestroyResponse( const MT_Response& response ) override;

public:
	typedef std::function< void() > cb_oncomplete;

	// for bindings etc
	void Message( const std::string& text );
	void Quit( const std::string& reason );
	void OnError( std::runtime_error& err );
	void OnGSEError( const gse::Exception& e );
	const size_t GetTurnId() const;
	const bool IsTurnCompleted( const size_t slot_num ) const;
	const bool IsTurnChecksumValid( const util::crc32::crc_t checksum ) const;
	void CompleteTurn( GSE_CALLABLE, const size_t slot_num );
	void UncompleteTurn( const size_t slot_num );
	void AdvanceTurn( const size_t turn_id );

	void GlobalFinalizeTurn( GSE_CALLABLE );
	void FirstTurn( GSE_CALLABLE );
	gse::Value* GetOpeningState( GSE_CALLABLE ) const;
	std::string ValidateOpening( GSE_CALLABLE, int64_t caller, int64_t session, const std::string& action, int64_t base_id, const std::string& previous, const std::string& name ) const;
	void ApplyOpening( GSE_CALLABLE, int64_t caller, int64_t session, const std::string& action, int64_t base_id, const std::string& previous, const std::string& name );

	faction::Faction* GetFaction( const std::string& id ) const;

	map::tile::TileManager* GetTM() const;
	resource::ResourceManager* GetRM() const;
	unit::UnitManager* GetUM() const;
	base::BaseManager* GetBM() const;
	animation::AnimationManager* GetAM() const;
	technology::Table& GetTechnologyTable();
	const technology::Table& GetTechnologyTable() const;
	gse::Value* GetResearchState( GSE_CALLABLE, int64_t player ) const;
	std::string ValidateResearchTarget( int64_t player, int64_t target ) const;
	std::string ValidateResearchPriority( int64_t player, int64_t priority ) const;
	gse::Value* SelectResearchTarget( GSE_CALLABLE, int64_t player, int64_t target );
	gse::Value* SetResearchPriority( GSE_CALLABLE, int64_t player, int64_t priority, bool enabled );
	void RollbackResearch( GSE_CALLABLE, int64_t player, int64_t token, int64_t turn );

	gc::Space* const GetGCSpace() const;

	void CheckRW( GSE_CALLABLE ) const;

	void SetSlotNum( const size_t slotnum ); // not thread-safe, make sure to call from game thread only

private:

	const types::Vec3 GetTileRenderCoords( const map::tile::Tile* tile );

	map::tile::TileManager* m_tm = nullptr;
	resource::ResourceManager* m_rm = nullptr;
	unit::UnitManager* m_um = nullptr;
	base::BaseManager* m_bm = nullptr;
	animation::AnimationManager* m_am = nullptr;
	technology::Table m_technologies;
	technology::Research m_research;
	struct research_receipt_t {
		int64_t token;
		size_t turn;
		technology::Research::State previous, expected;
	};
	std::array< std::unique_ptr< research_receipt_t >, technology::Research::PLAYERS > m_research_receipts;
	int64_t m_next_research_receipt = 0;
	std::string ValidateResearchPlayer( int64_t player ) const;
	gse::Value* ApplyResearch( GSE_CALLABLE, int64_t player, const technology::Research::State& state );

	enum game_state_t {
		GS_NONE,
		GS_PREPARING_MAP,
		GS_INITIALIZING,
		GS_STARTING,
		GS_RUNNING,
	};
	std::atomic< game_state_t > m_game_state = GS_NONE;
	common::mt_flag_t m_init_cancel = false;
	std::string m_initialization_error = "";

	Player* m_player = nullptr;
	bool m_is_master = true;
	size_t m_slot_num = 0;
	slot::Slot* m_slot = nullptr;

	response_map_data_t* m_response_map_data = nullptr;

	util::crc32::crc_t m_turn_checksum = 0;
	std::unordered_set< size_t > m_verified_turn_checksum_slots = {};

	std::vector< FrontendRequest >* m_pending_frontend_requests = nullptr;

	void InitGame( MT_Response& response, const bool interactive_opening, MT_CANCELABLE );
	void ResetGame();

	// seed needs to be consistent during session (to prevent save-scumming and for easier reproduction of bugs)
	Random* m_random = nullptr;
	State* m_state = nullptr;

	map::Map* m_map = nullptr;
	map::Map* m_old_map = nullptr; // to restore state, for example if loading of another map failed

	turn::Turn m_current_turn = {};

	bool m_is_turn_complete = false;
	void CheckTurnComplete();

	std::unordered_map< std::string, event::EventHandler* > m_event_handlers = {};
	common::Mutex m_event_handlers_mutex;

	std::vector< event::Event* > m_pending_events = {};
	common::Mutex m_pending_events_mutex;

	struct event_waiting_for_response_t {
		event::Event* event;
		gse::Value* rollback_data;
		bool applied = false;
	};
	std::unordered_map< std::string, event_waiting_for_response_t > m_events_waiting_for_responses = {};
	common::Mutex m_events_waiting_for_responses_mutex;

	struct pending_event_response_t {
		std::string event_id;
		bool is_accepted;
		gse::Value* resolved;
	};
	std::vector< pending_event_response_t > m_pending_event_responses = {};
	common::Mutex m_pending_event_responses_mutex;

	std::atomic< uint64_t > m_next_event_id = 0;

	std::atomic< size_t > m_rw_counter = 0;
	void WithRW( const std::function< void() >& f );

	enum OpeningPhase { OPENING_NONE, OPENING_PREPARING, OPENING_PLANETFALL, OPENING_NAME, OPENING_STARTING, OPENING_TOUR, OPENING_MAP, OPENING_FAILED };
	OpeningPhase m_opening_phase = OPENING_NONE;
	int64_t m_opening_session = 0;
	size_t m_opening_base_id = 0;
	base::Base* m_opening_base = nullptr;
	bool m_auto_end_turn = false;
	bool m_opening_first_turn_dispatched = false;
	bool m_opening_first_turn_applied = false;
	void UpdateOpening( GSE_CALLABLE );
	bool IsOpeningPending() const;
	bool IsOpeningEventAllowed( const std::string& name ) const;
	void InitComplete( GSE_CALLABLE );
	void InitFailed( const std::string& error_text );

	void SetTurnStatus( const backend::turn::turn_status_t status );

	void ProcessEvents();
	void ProcessEventResponses();
	void NotifyEventResult( GSE_CALLABLE, const event::Event* event, bool success );
	void FinalizeUnitDisbandEvent( const event::Event* event, gse::Value* applied );
	struct FoundingRecord {
		size_t unit_id = 0, base_id = 0, owner = 0, x = 0, y = 0;
		std::string def, name, previous_rng, expected_rng, base_snapshot;
		float movement = 0, health = 0;
		int64_t morale = 0, worked_x = -1, worked_y = -1;
		bool moved = false;
		unit::order_t order = unit::order_t::NO_ORDERS;
		size_t previous_base_id = 0, next_base_id = 0, next_unit_id = 0;
	};
	std::map< int64_t, FoundingRecord > m_founding_records;
	int64_t m_next_founding_id = 0;
	struct JoiningRecord {
		size_t unit_id = 0, base_id = 0, pop_id = 0;
		size_t previous_pop_id = 0, next_base_id = 0, next_unit_id = 0;
		std::string def, unit_snapshot, expected_def, previous_rng, expected_rng, expected_base;
		uint64_t turn = 0;
		gse::value::Object* base_identity = nullptr;
	};
	std::map< int64_t, JoiningRecord > m_joining_records;
	int64_t m_next_joining_id = 0;
	struct DisbandingRecord {
		size_t unit_id = 0, owner = 0, x = 0, y = 0, next_base_id = 0, next_unit_id = 0;
		uint64_t turn = 0;
		std::string def, unit_snapshot, expected_def, previous_rng, expected_rng;
		size_t base_id = 0;
		gse::value::Object* base_identity = nullptr;
		base::ProductionState previous_production;
		std::string expected_base;
	};
	std::map< int64_t, DisbandingRecord > m_disbanding_records;
	int64_t m_next_disbanding_id = 0;

private:
	friend struct gse::tests::mocks::ProductionFixture;
	friend class map::tile::TileManager;
	friend class map::Map;
	friend class resource::ResourceManager;
	friend class unit::UnitManager;
	friend class base::BaseManager;
	friend class base::Base;
	friend class animation::AnimationManager;
	void AddFrontendRequest( const FrontendRequest& request );

	const bool IsRunning() const;
	const bool IsMapReady() const;

private:
	friend class event::Event;
	const std::string GenerateEventId();

private:
	friend class ::GLSMAC;
	void SetState( State* const state );

};

}
}
