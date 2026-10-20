#include "ProductionFixture.h"

#include <memory>
#include <set>
#include <atomic>
#include <stdexcept>
#include "gc/Space.h"
#include "gse/value/Array.h"
#include "gse/value/Bool.h"
#include "gse/value/Callable.h"
#include "gse/value/Int.h"
#include "gse/value/Float.h"
#include "game/backend/unit/UnitManager.h"
#include "game/backend/unit/Unit.h"
#include "game/backend/unit/StaticDef.h"
#include "game/backend/unit/MoraleSet.h"
#include "game/backend/unit/SpriteRender.h"
#include "game/backend/Random.h"
#include "game/backend/event/Event.h"
#include "game/backend/connection/Connection.h"
#include "game/backend/event/EventHandler.h"
#include "gse/value/Object.h"
#include "gse/value/String.h"
#include "gse/value/Undefined.h"
#include "gse/callable/Native.h"
#include "game/backend/Game.h"
#include "game/backend/State.h"
#include "game/backend/Player.h"
#include "game/backend/base/Base.h"
#include "game/backend/base/BaseManager.h"
#include "game/backend/base/FacilityDef.h"
#include "game/backend/base/PopDef.h"
#include "game/backend/base/production/Facility.h"
#include "game/backend/base/production/Custom.h"
#include "game/backend/base/production/Unit.h"
#include "game/backend/faction/Faction.h"
#include "game/backend/faction/FactionManager.h"
#include "game/backend/map/Map.h"
#include "game/backend/map/MapState.h"
#include "game/backend/map/tile/Tiles.h"
#include "game/backend/map/tile/TileManager.h"
#include "game/backend/map/module/Finalize.h"
#include "types/mesh/Render.h"
#include "types/mesh/Data.h"
#include "game/backend/resource/ResourceManager.h"
#include "game/backend/resource/Resource.h"
#include "game/backend/slot/Slots.h"

namespace gse::tests::mocks {
namespace backend = game::backend;

// No socket setup is supplied. The actual Connection outgoing queue/codec is
// inspected to exercise publish ordering and wrapper lifetime at that boundary.
class ProbeConnection : public backend::connection::Connection {
public:
	ProbeConnection() : Connection( nullptr, network::CM_SERVER, nullptr ) {}
	void UpdateSlot( const size_t, backend::slot::Slot*, const bool ) override {}
	void SendMessage( const std::string& ) override {}
protected:
	void SendGameEvents( const game_events_t& ) override {}
};

// Only native lifecycle, map coordinates, event authorization and event-loop
// delivery are supplied. The actual managers, wrappers and codecs are used.
struct ProductionFixture : gc::Object {
	backend::Game game;
	backend::State* state = nullptr;
	std::unique_ptr< backend::Player > owner;
	std::unique_ptr< backend::Player > local_player;
	backend::base::Base* base = nullptr;
	bool destroying = false;
	bool stopped = false;
	int64_t updates = 0;
	size_t colony_id = 0;
	std::unique_ptr< ProbeConnection > transport;

	ProductionFixture( GSE_CALLABLE, bool defaults = true ) : gc::Object( nullptr ) {
		game.Start();
		{
			// FixtureObject roots the native graph explicitly. Native managers are
			// fixture-owned; script values continue to use the interpreter space.
			state = new backend::State( gc_space, ctx, nullptr, false );
			state->SetGame( &game );
			game.SetState( state );
			game.m_bm = new backend::base::BaseManager( &game, false );
			game.m_map = new backend::map::Map( &game, false );
			backend::map::tile::Tiles tiles( nullptr, 4, 4 );
			tiles.Clear();
			auto terrain = tiles.Serialize();
			if ( game.m_map->LoadFromBuffer( terrain ) != backend::map::Map::EC_NONE ) { THROW( "fixture terrain failed" ); }
			state->GetFM()->Add( new backend::faction::Faction( "SYNTHETIC", "Synthetic" ) );
			owner = std::make_unique< backend::Player >( "Fixture", backend::Player::PR_SINGLE, state->GetFM()->Get( "SYNTHETIC" ), "Citizen" );
			state->m_slots->Resize( 2 );
			state->m_slots->GetSlot( 1 ).SetPlayer( owner.get(), 0, "" );
			game.m_current_turn.AdvanceTurn( 1 );
			if ( defaults ) {
				const backend::base::RenderInfo render = { "synthetic.pcx", 0, 0, 1, 1 };
				game.m_bm->DefineFacility( new backend::base::FacilityDef( "HEADQUARTERS", "Headquarters", "Existing facility", 0, render ) );
				game.m_bm->DefineFacility( new backend::base::FacilityDef( "RECYCLING_TANKS", "Recycling Tanks", "Synthetic facility", 32, render ) );
				for ( const auto& id : { "HEADQUARTERS", "RECYCLING_TANKS" } ) {
					owner->AddProductionChoice( GSE_CALL, id, {
						{ "type", VALUE( value::String,, "facility" ) }, { "id", VALUE( value::String,, id ) },
					} );
				}
				owner->AddProductionChoice( GSE_CALL, "STOCKPILE_ENERGY", {
					{ "type", VALUE( value::String,, "custom" ) },
					{ "render", VALUEEXT( value::Object, GSE_CALL, {
						{ "type", VALUE( value::String,, "sprite" ) }, { "file", VALUE( value::String,, "synthetic.pcx" ) },
						{ "x", VALUE( value::Int,, 0 ) }, { "y", VALUE( value::Int,, 0 ) },
						{ "w", VALUE( value::Int,, 1 ) }, { "h", VALUE( value::Int,, 1 ) },
					} ) },
				} );
				base = new backend::base::Base( &game, 1, owner->GetSlot(), owner->GetFaction(), game.m_map->GetTile( 0, 0 ), "Fixture Base", { { "HEADQUARTERS", game.m_bm->GetFacilityDef( "HEADQUARTERS" ) } }, {} );
				game.m_bm->m_bases.emplace( base->m_id, base );
			}
		}
	}
	~ProductionFixture() override {
		destroying = true;
		Retire();
	}
	void GetReachableObjects( std::unordered_set< gc::Object* >& objects ) override {
		gc::Object::GetReachableObjects( objects );
		if ( destroying || stopped ) { return; }
		game.GetReachableObjects( objects );
		if ( state ) { state->GetReachableObjects( objects ); }
	}
	void Retire() {
		if ( stopped ) { return; }
		auto* bm = game.m_bm;
		auto* um = game.m_um;
		auto* tm = game.m_tm;
		auto* rm = game.m_rm;
		if ( um ) { um->Clear(); }
		bm->Clear();
		state->m_connection = nullptr;
		transport.reset();
		state->UnsetGame();
		game.Stop();
		owner.reset();
		local_player.reset();
		stopped = true;
		delete bm;
		delete um;
		delete tm;
		delete rm;
		delete state;
		state = nullptr;
	}
	void WithWrite( const std::function< void() >& callback ) { game.WithRW( callback ); }
	void SetTurn( int64_t turn ) {
		if ( turn <= 0 ) { THROW( "invalid fixture turn" ); }
		game.m_current_turn.Reset();
		game.m_current_turn.AdvanceTurn( turn );
	}
	void Flush( GSE_CALLABLE ) {
		updates += game.m_bm->m_updated_bases.size();
		game.m_bm->TriggerUpdates( GSE_CALL );
	}
	void AddWorker( GSE_CALLABLE, int64_t variant ) {
		if ( variant < 0 || variant > 1 ) { GSE_ERROR( EC.INVALID_CALL, "fixture worker variant must be 0 or 1" ); }
		WithWrite( [ & ]() {
			auto* def = game.m_bm->GetPopDef( "WORKER" );
			if ( !def ) {
				const backend::base::RenderInfo render { "synthetic.pcx", 0, 0, 1, 1 };
				def = new backend::base::PopDef( "WORKER", "Worker", { render, render }, { render }, backend::base::PopDef::PF_TILE_WORKER );
				game.m_bm->DefinePop( def );
			}
			base->AddPop( backend::base::Pop( base, base->m_next_pop_id++, def, variant ) );
		} );
		Flush( GSE_CALL );
	}


	std::string MapSettingsSnapshot( const std::string& kind ) {
		const auto bytes = state->m_settings.global.map.Serialize().ToString();
		if ( kind == "current" ) { return bytes; }
		types::Buffer input( bytes );
		input.ReadInt(); input.ReadString(); input.ReadInt(); input.ReadInt();
		for ( size_t i = 0; i < 4; ++i ) { input.ReadFloat(); }
		const auto legacy = bytes.substr( 0, input.lenr );
		if ( kind == "legacy" ) { return legacy; }
		if ( kind == "trailing" ) { return bytes + "trailing"; }
		if ( kind == "invalid_level" ) { types::Buffer tail; tail.WriteInt( 5 ); return legacy + tail.ToString(); }
		THROW( "unknown fixture map settings snapshot kind" );
	}
	void RestoreMapSettings( const std::string& bytes ) {
		state->m_settings.global.map.Deserialize( types::Buffer( bytes ) );
	}
	Value* MapGridProbe( GSE_CALLABLE, const bool fix_poles = false ) {
		const auto& config = state->m_settings.global.map;
		if ( config.size_x < 4 || config.size_x > 512 || config.size_x % 2 || config.size_y < 2 || config.size_y > 256 ) {
			GSE_ERROR( EC.INVALID_CALL, "grid probe requires bounded configured dimensions" );
		}
		// These are actual production grids and the production native map-file
		// decoder. Rendering and terrain generation resources are not constructed.
		std::unique_ptr< backend::map::Map > source( new backend::map::Map( &game, false ) );
		source->m_tiles = new backend::map::tile::Tiles( source.get(), uint32_t( config.size_x ), uint32_t( config.size_y ) );
		source->m_tiles->Clear();
		bool polar_zero = true;
		bool rng_preserved = true;
		if ( fix_poles ) {
			std::atomic< bool > cancel{ false };
			const auto cells = source->m_tiles->GetVector( cancel );
			for ( auto* tile : cells ) { for ( auto* corner : tile->elevation.corners ) { *corner = 40; } }
			for ( auto* tile : cells ) { tile->Update(); }
			util::random::Random random( 17 ), expected( 17 );
			for ( int64_t x = 0; x < config.size_x; ++x ) { expected.GetBool(); }
			source->m_tiles->FixTopBottomRows( &random );
			rng_preserved = random.GetStateString() == expected.GetStateString();
			for ( const auto* tile : cells ) {
				if ( tile->coord.y == 0 ) { polar_zero = polar_zero && *tile->elevation.top == 0; }
				if ( tile->coord.y + 1 == uint64_t( config.size_y ) ) { polar_zero = polar_zero && *tile->elevation.bottom == 0; }
			}
		}
		const auto bytes = source->m_tiles->Serialize();
		std::unique_ptr< backend::map::Map > restored( new backend::map::Map( &game, false ) );
		auto input = bytes;
		if ( restored->LoadFromBuffer( input ) != backend::map::Map::EC_NONE ) {
			GSE_ERROR( EC.INVALID_CALL, "native configured grid snapshot did not decode" );
		}
		// Single-row input was implicitly rejected by the old even-height
		// check. Keep it invalid before linking, including in Release builds.
		auto records = bytes;
		records.ReadInt(); records.ReadInt();
		types::Buffer single_row;
		single_row.WriteInt( config.size_x ); single_row.WriteInt( 1 );
		for ( int64_t x = 0; x < config.size_x / 2; ++x ) { single_row.WriteString( records.ReadString() ); }
		std::unique_ptr< backend::map::Map > invalid( new backend::map::Map( &game, false ) );
		const bool rejects_single_row = invalid->LoadFromBuffer( single_row ) == backend::map::Map::EC_MAPFILE_FORMAT_ERROR;
		std::atomic< bool > cancel{ false };
		const auto cells = restored->m_tiles->GetVector( cancel );
		int64_t half_width = 0;
		bool links = true;
		for ( const auto* tile : cells ) {
			if ( tile->coord.y == 0 ) { ++half_width; }
			links = links && tile->E->W == tile && tile->W->E == tile &&
				tile->elevation.right == tile->E->elevation.left;
			if ( tile->coord.y >= 2 ) { links = links && tile->N->elevation.bottom == tile->elevation.top; }
			if ( tile->coord.y == 0 ) { links = links && tile->N == tile && tile->NW == tile && tile->NE == tile; }
			if ( tile->coord.y + 1 == restored->GetHeight() ) { links = links && tile->S == tile && tile->SW == tile && tile->SE == tile; }
		}
		return VALUEEXT( value::Object, GSE_CALL, {
			{ "width", VALUE( value::Int,, restored->GetWidth() ) },
			{ "height", VALUE( value::Int,, restored->GetHeight() ) },
			{ "half_width", VALUE( value::Int,, half_width ) },
			{ "tile_count", VALUE( value::Int,, cells.size() ) },
			{ "links", VALUE( value::Bool,, links ) },
			{ "roundtrip", VALUE( value::Bool,, restored->m_tiles->Serialize().ToString() == bytes.ToString() ) },
			{ "rejects_single_row", VALUE( value::Bool,, rejects_single_row ) },
			{ "polar_zero", VALUE( value::Bool,, polar_zero ) },
			{ "rng_preserved", VALUE( value::Bool,, rng_preserved ) },
		} );
	}
	Value* MapMeshProbe( GSE_CALLABLE ) {
		const auto& config = state->m_settings.global.map;
		if ( config.size_x < 4 || config.size_x > 512 || config.size_x % 2 || config.size_y < 2 || config.size_y > 256 ) {
			GSE_ERROR( EC.INVALID_CALL, "mesh probe requires bounded configured dimensions" );
		}
		// Real mesh allocation and final tile pass, with synthetic all-water
		// tile state. Textures, earlier generation passes and graphics are absent.
		std::unique_ptr< backend::map::Map > source( new backend::map::Map( &game, false ) );
		source->m_tiles = new backend::map::tile::Tiles( source.get(), uint32_t( config.size_x ), uint32_t( config.size_y ) );
		source->m_tiles->Clear();
		source->m_map_state = new backend::map::MapState();
		auto* ms = source->m_map_state;
		ms->dimensions = { uint32_t( config.size_x ), uint32_t( config.size_y ) };
		ms->variables.texture_scaling = { 1.0f, 1.0f };
		ms->first_run = true;
		std::atomic< bool > cancel{ false };
		ms->LinkTileStates( cancel );
		source->InitMeshes();
		// Ordinary meshes are transferred to frontend actors. This fixture
		// has no frontend, so it owns both allocations even if the pass throws.
		std::unique_ptr< types::mesh::Render > terrain( source->m_meshes.terrain );
		std::unique_ptr< types::mesh::Data > data( source->m_meshes.terrain_data );
		backend::map::module::Finalize finalize( source.get() );
		for ( auto* tile : source->m_tiles->GetVector( cancel ) ) {
			tile->is_water_tile = true;
			finalize.GenerateTile( tile, ms->At( tile->coord.x, tile->coord.y ), ms );
		}
		terrain->Finalize();
		data->Finalize();
		return VALUEEXT( value::Object, GSE_CALL, {
			{ "vertices", VALUE( value::Int,, terrain->GetVertexCount() ) },
			{ "surfaces", VALUE( value::Int,, terrain->GetSurfaceCount() ) },
			{ "data_vertices", VALUE( value::Int,, data->GetVertexCount() ) },
			{ "data_surfaces", VALUE( value::Int,, data->GetSurfaceCount() ) },
		} );
	}
	std::string RulesSettingsSnapshot( const std::string& kind ) {
		const auto bytes = state->m_settings.global.rules.Serialize().ToString();
		if ( kind == "current" ) { return bytes; }
		if ( kind == "legacy" ) { return ""; }
		if ( kind == "legacy_nutrient" ) {
			types::Buffer legacy; legacy.WriteInt( state->m_settings.global.rules.GetNutrientCostFactor() ); return legacy.ToString();
		}
		if ( kind == "legacy_costs" ) {
			types::Buffer legacy; legacy.WriteInt( state->m_settings.global.rules.GetNutrientCostFactor() );
			legacy.WriteInt( state->m_settings.global.rules.GetMineralCostFactor() ); return legacy.ToString();
		}
		if ( kind.rfind( "world_", 0 ) == 0 ) {
			const auto& rules = state->m_settings.global.rules;
			types::Buffer invalid; invalid.WriteInt( rules.GetNutrientCostFactor() ); invalid.WriteInt( rules.GetMineralCostFactor() );
			invalid.WriteString( kind == "world_tag" ? "unknown-world-version" : "world-sizes-v1" );
			invalid.WriteInt( kind == "world_count" ? 6 : 5 );
			for ( size_t level = 0; level < rules.GetWorldSizes().size(); ++level ) {
				const auto& size = rules.GetWorldSizes()[level]; const bool last = level == 4;
				invalid.WriteString( last && kind == "world_name" ? "" : size.name ); invalid.WriteString( size.description );
				if ( last && kind == "world_type" ) { invalid.WriteString( "28" ); }
				else { invalid.WriteInt( last && kind == "world_width" ? 3 : size.size_x ); }
				invalid.WriteInt( last && kind == "world_height" ? 3 : size.size_y );
			}
			return invalid.ToString();
		}
		if ( kind == "truncated" ) { return bytes.substr( 0, bytes.size() - 1 ); }
		if ( kind == "trailing" ) { return bytes + "trailing"; }
		types::Buffer invalid;
		if ( kind == "invalid_low" ) { invalid.WriteInt( 0 ); }
		else if ( kind == "invalid_high" ) { invalid.WriteInt( 101 ); }
		else if ( kind == "wrong_type" ) { invalid.WriteString( "11" ); }
		else if ( kind == "mineral_invalid_low" || kind == "mineral_invalid_high" || kind == "mineral_wrong_type" || kind == "mineral_truncated" || kind == "mineral_trailing" ) {
			invalid.WriteInt( state->m_settings.global.rules.GetNutrientCostFactor() );
			if ( kind == "mineral_wrong_type" ) { invalid.WriteString( "11" ); }
			else { invalid.WriteInt( kind == "mineral_invalid_low" ? 0 : kind == "mineral_invalid_high" ? 101 : 11 ); }
			const auto malformed = invalid.ToString();
			if ( kind == "mineral_truncated" ) { return malformed.substr( 0, malformed.size() - 1 ); }
			if ( kind == "mineral_trailing" ) { return malformed + "trailing"; }
		}
		else { THROW( "unknown fixture rules settings snapshot kind" ); }
		return invalid.ToString();
	}
	Value* RulesRecordProbe( GSE_CALLABLE ) {
		auto record = state->m_settings.global.rules.Serialize();
		const auto nutrient = record.ReadInt();
		const auto mineral = record.ReadInt();
		return VALUEEXT( value::Object, GSE_CALL, {
			{ "nutrient", VALUE( value::Int,, nutrient ) }, { "mineral", VALUE( value::Int,, mineral ) },
			{ "exhausted", VALUE( value::Bool,, record.lenr == record.lenw ) },
		} );
	}
	void RestoreRulesSettings( const std::string& bytes ) {
		state->m_settings.global.rules.Deserialize( types::Buffer( bytes ) );
	}
	std::string GlobalSettingsSnapshot( const std::string& kind ) {
		const auto& settings = state->m_settings.global;
		if ( kind == "current" ) { return settings.Serialize().ToString(); }
		types::Buffer result;
		result.WriteString( settings.map.Serialize().ToString() );
		if ( kind == "legacy_rules" ) { result.WriteString( "" ); }
		else if ( kind == "legacy_nutrient_rules" ) {
			types::Buffer legacy; legacy.WriteInt( settings.rules.GetNutrientCostFactor() ); result.WriteString( legacy.ToString() );
		}
		else if ( kind == "invalid_rules" ) {
			types::Buffer invalid; invalid.WriteInt( 101 ); result.WriteString( invalid.ToString() );
		}
		else if ( kind == "invalid_mineral_rules" ) {
			types::Buffer invalid; invalid.WriteInt( settings.rules.GetNutrientCostFactor() ); invalid.WriteInt( 101 ); result.WriteString( invalid.ToString() );
		}
		else if ( kind == "invalid_world_rules" ) { result.WriteString( RulesSettingsSnapshot( "world_width" ) ); }
		else if ( kind == "truncated_name" || kind == "invalid_difficulty" || kind == "invalid_difficulty_wide" ) { result.WriteString( settings.rules.Serialize().ToString() ); }
		else { THROW( "unknown fixture global settings snapshot kind" ); }
		result.WriteInt( kind == "invalid_difficulty" ? 999 : kind == "invalid_difficulty_wide" ? 4294967293LL : settings.difficulty_level );
		result.WriteString( settings.game_name );
		const auto bytes = result.ToString();
		return kind == "truncated_name" ? bytes.substr( 0, bytes.size() - 1 ) : bytes;
	}
	void RestoreGlobalSettings( const std::string& bytes ) {
		state->m_settings.global.Deserialize( types::Buffer( bytes ) );
	}
	Value* StateRulesWireProbe( GSE_CALLABLE ) {
		// Global settings normally arrive before the receiving world exists.
		// These dedicated States have no players/bases retaining faction pointers;
		// exercise the real State wire without replacing the live fixture graph.
		auto source = std::unique_ptr< backend::State >( new backend::State( gc_space, ctx, nullptr, false ) );
		auto target = std::unique_ptr< backend::State >( new backend::State( gc_space, ctx, nullptr, false ) );
		auto& from = source->m_settings.global;
		auto& to = target->m_settings.global;
		from.map.size_x = 68; from.map.size_y = 34; from.map.preset_level = 0;
		from.rules.SetNutrientCostFactor( 17 ); from.rules.SetMineralCostFactor( 19 ); from.game_name = "Source wire";
		const auto worlds_before = state->m_settings.global.rules.GetWorldSizes();
		if ( state->m_settings.global.rules.HasWorldSizes() ) { from.rules.SetWorldSizes( worlds_before ); }
		to.map.size_x = 112; to.map.size_y = 56; to.map.preset_level = 2;
		to.rules.SetNutrientCostFactor( 23 ); to.rules.SetMineralCostFactor( 31 ); to.game_name = "Previous target";
		source->GetFM()->Add( new backend::faction::Faction( "WIRE_SOURCE", "Wire Source" ) );
		target->GetFM()->Add( new backend::faction::Faction( "WIRE_OLD", "Old Target" ) );
		source->GetFM()->Get( "WIRE_SOURCE" )->SetIdentity( { "Wire Pilot", "Wire Guild", "Wirefolk", "Orbital", "Navigator", "brisk" } );
		source->GetFM()->Get( "WIRE_SOURCE" )->SetSocialRatings( 2, -3 );
		source->GetFM()->Get( "WIRE_SOURCE" )->SetStartingTechnologies( { "SyntheticA", "SyntheticB" } );
		auto* wrapper = static_cast< value::Object* >( to.rules.Wrap( GSE_CALL ) );
		auto* read = static_cast< value::Callable* >( wrapper->Get( "get_nutrient_cost_factor" ) );
		auto* mineral_read = static_cast< value::Callable* >( wrapper->Get( "get_mineral_cost_factor" ) );
		auto* worlds_read = static_cast< value::Callable* >( wrapper->Get( "get_world_sizes" ) );
		const auto wire = source->Serialize().ToString();
		target->Deserialize( types::Buffer( wire ) );
		auto* read_value = read->Run( GSE_CALL, {} );
		const bool aliases = read_value->type == VT_INT && static_cast< value::Int* >( read_value )->value == 17;
		auto* mineral_read_value = mineral_read->Run( GSE_CALL, {} );
		const bool mineral_aliases = mineral_read_value->type == VT_INT && static_cast< value::Int* >( mineral_read_value )->value == 19;
		const bool mineral_received = to.rules.GetMineralCostFactor() == 19;
		const bool worlds_received = to.rules.GetWorldSizes() == worlds_before && to.rules.HasWorldSizes() == from.rules.HasWorldSizes();
		const bool worlds_aliases = backend::rules::Rules::DecodeWorldSizes( GSE_CALL, worlds_read->Run( GSE_CALL, {} ) ) == worlds_before;
		const bool received = to.map.size_x == 68 && to.map.size_y == 34 && to.map.preset_level == 0 &&
			to.rules.GetNutrientCostFactor() == 17 && to.game_name == "Source wire";
		const bool factions = target->GetFM()->Get( "WIRE_SOURCE" ) && !target->GetFM()->Get( "WIRE_OLD" ) &&
			target->GetFM()->Get( "WIRE_SOURCE" ) != source->GetFM()->Get( "WIRE_SOURCE" );
		const bool identity_received = factions && target->GetFM()->Get( "WIRE_SOURCE" )->GetIdentity() ==
			source->GetFM()->Get( "WIRE_SOURCE" )->GetIdentity() && target->GetFM()->Get( "WIRE_SOURCE" )->m_name == "Wire Guild";
		const bool roundtrip = target->Serialize().ToString() == wire;
		const bool ratings_received = factions && target->GetFM()->Get( "WIRE_SOURCE" )->m_growth == 2 && target->GetFM()->Get( "WIRE_SOURCE" )->m_industry == -3;
		const bool starting_technologies_received = factions && target->GetFM()->Get( "WIRE_SOURCE" )->GetStartingTechnologies() == source->GetFM()->Get( "WIRE_SOURCE" )->GetStartingTechnologies();
		from.map.preset_level = 4; from.rules.SetNutrientCostFactor( 29 ); from.rules.SetMineralCostFactor( 37 ); from.game_name = "Changed sender";
		auto changed_worlds = worlds_before; changed_worlds[0].name = "Changed sender world"; from.rules.SetWorldSizes( changed_worlds );
		source->GetFM()->Get( "WIRE_SOURCE" )->SetIdentity( { "Changed sender", "Changed guild", "Otherfolk", "Distant", "Captain", "quiet" } );
		source->GetFM()->Get( "WIRE_SOURCE" )->SetSocialRatings( -1, 4 );
		source->GetFM()->Get( "WIRE_SOURCE" )->SetStartingTechnologies( { "ChangedSender" } );
		const bool independent = target->Serialize().ToString() == wire && to.rules.GetNutrientCostFactor() == 17;
		const bool mineral_independent = target->Serialize().ToString() == wire && to.rules.GetMineralCostFactor() == 19;
		return VALUEEXT( value::Object, GSE_CALL, {
			{ "received", VALUE( value::Bool,, received ) }, { "aliases", VALUE( value::Bool,, aliases ) },
			{ "factions", VALUE( value::Bool,, factions ) }, { "roundtrip", VALUE( value::Bool,, roundtrip ) },
			{ "identity_received", VALUE( value::Bool,, identity_received ) },
			{ "ratings_received", VALUE( value::Bool,, ratings_received ) },
			{ "starting_technologies_received", VALUE( value::Bool,, starting_technologies_received ) },
			{ "independent", VALUE( value::Bool,, independent ) },
			{ "mineral_received", VALUE( value::Bool,, mineral_received ) },
			{ "mineral_aliases", VALUE( value::Bool,, mineral_aliases ) },
			{ "mineral_independent", VALUE( value::Bool,, mineral_independent ) },
			{ "worlds_received", VALUE( value::Bool,, worlds_received ) }, { "worlds_aliases", VALUE( value::Bool,, worlds_aliases ) },
			{ "worlds_independent", VALUE( value::Bool,, to.rules.GetWorldSizes() == worlds_before && target->Serialize().ToString() == wire ) },
		} );
	}
	Value* ApplyFactionIdentity( GSE_CALLABLE, const std::vector< Value* >& values ) {
		auto* faction = owner->GetFaction();
		faction->SetIdentity( backend::faction::Faction::ParseIdentity( GSE_CALL, values ) );
		return faction->Wrap( GSE_CALL );
	}
	Value* ApplyFactionRatings( GSE_CALLABLE, const value::object_properties_t& values ) {
		const auto ratings = backend::faction::Faction::ParseSocialRatings( GSE_CALL, values );
		auto* faction = owner->GetFaction(); faction->SetSocialRatings( ratings[ 0 ], ratings[ 1 ] );
		return faction->Wrap( GSE_CALL );
	}
	Value* ApplyFactionStartingTechnologies( GSE_CALLABLE, const std::vector< Value* >& values ) {
		owner->GetFaction()->SetStartingTechnologies( backend::faction::Faction::ParseStartingTechnologies( GSE_CALL, values ) );
		return owner->GetFaction()->Wrap( GSE_CALL );
	}
	Value* FactionIdentityCodec( GSE_CALLABLE ) {
		auto* source = owner->GetFaction();
		const auto wire = source->Serialize().ToString();
		backend::faction::Faction receiving;
		receiving.Deserialize( types::Buffer( wire ) );
		const bool roundtrip = receiving.Serialize().ToString() == wire;
		const bool received = receiving.GetStartingTechnologies() == source->GetStartingTechnologies() && receiving.GetIdentity() == source->GetIdentity() && receiving.m_name == source->m_name &&
			receiving.m_growth == source->m_growth && receiving.m_industry == source->m_industry;
		auto changed = receiving.GetIdentity(); changed[ 0 ] = "Changed receiver"; receiving.SetIdentity( changed );
		const bool independent = source->Serialize().ToString() == wire;
		return VALUEEXT( value::Object, GSE_CALL, {
			{ "received", VALUE( value::Bool,, received ) }, { "roundtrip", VALUE( value::Bool,, roundtrip ) },
			{ "independent", VALUE( value::Bool,, independent ) },
		} );
	}
	Value* WorldSizesCopyProbe( GSE_CALLABLE ) {
		const auto& source = state->m_settings.global.rules; const auto before = source.GetWorldSizes();
		auto constructed = std::make_unique< backend::rules::Default >( source );
		backend::rules::Default assigned;
		auto* alias = static_cast< value::Object* >( assigned.Wrap( GSE_CALL ) );
		auto* read = static_cast< value::Callable* >( alias->Get( "get_world_sizes" ) );
		assigned = *constructed;
		const bool copied = constructed->GetWorldSizes() == before && assigned.GetWorldSizes() == before &&
			constructed->Serialize().ToString() == source.Serialize().ToString() && assigned.Serialize().ToString() == source.Serialize().ToString();
		const bool aliases = backend::rules::Rules::DecodeWorldSizes( GSE_CALL, read->Run( GSE_CALL, {} ) ) == before;
		auto changed = before; changed[0].name = "Constructed copy"; constructed->SetWorldSizes( changed );
		changed[0].name = "Assigned copy"; assigned.SetWorldSizes( changed );
		const bool independent = source.GetWorldSizes() == before && constructed->GetWorldSizes()[0].name == "Constructed copy" &&
			assigned.GetWorldSizes()[0].name == "Assigned copy";
		const bool live = backend::rules::Rules::DecodeWorldSizes( GSE_CALL, read->Run( GSE_CALL, {} ) ) == assigned.GetWorldSizes();
		auto* wrapper = static_cast< value::Object* >( constructed->Wrap( GSE_CALL ) );
		auto* saved = static_cast< value::Callable* >( wrapper->Get( "get_world_sizes" ) );
		constructed.reset(); bool rejected = false;
		try { saved->Run( GSE_CALL, {} ); } catch ( const std::exception& ) { rejected = true; }
		return VALUEEXT( value::Object, GSE_CALL, {
			{ "copied", VALUE( value::Bool,, copied ) }, { "aliases", VALUE( value::Bool,, aliases && live ) },
			{ "independent", VALUE( value::Bool,, independent ) }, { "lifetime", VALUE( value::Bool,, rejected ) },
		} );
	}
	Value* RulesCopyProbe( GSE_CALLABLE ) {
		auto& source = state->m_settings.global.rules;
		const auto before = source.GetNutrientCostFactor();
		const auto mineral_before = source.GetMineralCostFactor();
		auto constructed = std::make_unique< backend::rules::Default >( source );
		const bool constructor = constructed->GetNutrientCostFactor() == before;
		const bool mineral_constructor = constructed->GetMineralCostFactor() == mineral_before;
		auto assigned = std::make_unique< backend::rules::Default >();
		assigned->SetNutrientCostFactor( 19 );
		assigned->SetMineralCostFactor( 43 );
		auto* alias = static_cast< value::Object* >( assigned->Wrap( GSE_CALL ) );
		auto* read = static_cast< value::Callable* >( alias->Get( "get_nutrient_cost_factor" ) );
		auto* mineral_read = static_cast< value::Callable* >( alias->Get( "get_mineral_cost_factor" ) );
		*assigned = *constructed;
		const bool assignment = assigned->GetNutrientCostFactor() == before;
		const bool mineral_assignment = assigned->GetMineralCostFactor() == mineral_before;
		const auto read_factor = [ & ]() {
			auto* result = read->Run( GSE_CALL, {} );
			return result->type == VT_INT && static_cast< value::Int* >( result )->value == assigned->GetNutrientCostFactor();
		};
		bool aliases = read_factor();
		const auto read_mineral = [ & ]() {
			auto* result = mineral_read->Run( GSE_CALL, {} );
			return result->type == VT_INT && static_cast< value::Int* >( result )->value == assigned->GetMineralCostFactor();
		};
		bool mineral_aliases = read_mineral();
		constructed->SetNutrientCostFactor( 29 );
		assigned->SetNutrientCostFactor( 31 );
		constructed->SetMineralCostFactor( 37 );
		assigned->SetMineralCostFactor( 41 );
		const bool independent = source.GetNutrientCostFactor() == before && constructed->GetNutrientCostFactor() == 29 && assigned->GetNutrientCostFactor() == 31;
		const bool mineral_independent = source.GetMineralCostFactor() == mineral_before && constructed->GetMineralCostFactor() == 37 && assigned->GetMineralCostFactor() == 41;
		aliases = aliases && read_factor();
		mineral_aliases = mineral_aliases && read_mineral();
		auto* constructed_wrapper = static_cast< value::Object* >( constructed->Wrap( GSE_CALL ) );
		auto* saved_read = static_cast< value::Callable* >( constructed_wrapper->Get( "get_nutrient_cost_factor" ) );
		auto* saved_write = static_cast< value::Callable* >( constructed_wrapper->Get( "set_nutrient_cost_factor" ) );
		auto* mineral_saved_read = static_cast< value::Callable* >( constructed_wrapper->Get( "get_mineral_cost_factor" ) );
		auto* mineral_saved_write = static_cast< value::Callable* >( constructed_wrapper->Get( "set_mineral_cost_factor" ) );
		constructed.reset();
		bool read_rejected = false; bool write_rejected = false;
		try { saved_read->Run( GSE_CALL, {} ); } catch ( const std::exception& ) { read_rejected = true; }
		try { saved_write->Run( GSE_CALL, { VALUE( value::Int,, 11 ) } ); } catch ( const std::exception& ) { write_rejected = true; }
		const bool lifetime = read_rejected && write_rejected && source.GetNutrientCostFactor() == before && read_factor();
		bool mineral_read_rejected = false; bool mineral_write_rejected = false;
		try { mineral_saved_read->Run( GSE_CALL, {} ); } catch ( const std::exception& ) { mineral_read_rejected = true; }
		try { mineral_saved_write->Run( GSE_CALL, { VALUE( value::Int,, 11 ) } ); } catch ( const std::exception& ) { mineral_write_rejected = true; }
		const bool mineral_lifetime = mineral_read_rejected && mineral_write_rejected && source.GetMineralCostFactor() == mineral_before && read_mineral();
		return VALUEEXT( value::Object, GSE_CALL, {
			{ "constructor", VALUE( value::Bool,, constructor ) }, { "assignment", VALUE( value::Bool,, assignment ) },
			{ "independent", VALUE( value::Bool,, independent ) }, { "aliases", VALUE( value::Bool,, aliases ) },
			{ "lifetime", VALUE( value::Bool,, lifetime ) },
			{ "mineral_constructor", VALUE( value::Bool,, mineral_constructor ) }, { "mineral_assignment", VALUE( value::Bool,, mineral_assignment ) },
			{ "mineral_independent", VALUE( value::Bool,, mineral_independent ) }, { "mineral_aliases", VALUE( value::Bool,, mineral_aliases ) },
			{ "mineral_lifetime", VALUE( value::Bool,, mineral_lifetime ) },
		} );
	}
	void SetOwnerRole( const std::string& role ) {
		if ( role == "single" ) { owner->m_role = backend::Player::PR_SINGLE; }
		else if ( role == "host" ) { owner->m_role = backend::Player::PR_HOST; }
		else if ( role == "player" ) { owner->m_role = backend::Player::PR_PLAYER; }
		else if ( role == "none" ) { owner->m_role = backend::Player::PR_NONE; }
		else { THROW( "unknown fixture owner role" ); }
	}
	size_t NextPopId() const { return base->m_next_pop_id; }
	void EnableEconomy() {
		if ( game.m_rm ) { THROW( "fixture economy already enabled" ); }
		game.m_rm = new backend::resource::ResourceManager( &game, false );
		game.m_tm = new backend::map::tile::TileManager( &game, false );
		local_player = std::make_unique< backend::Player >( "Fixture Host", backend::Player::PR_SINGLE, owner->GetFaction(), "Citizen" );
		state->m_slots->GetSlot( 0 ).SetPlayer( local_player.get(), 0, "" );
		game.m_player = local_player.get();
		game.m_slot_num = 0;
		game.m_slot = local_player->GetSlot();
		game.m_game_state = backend::Game::GS_RUNNING;
		const backend::resource::render_info_t render { "synthetic.pcx", { { { 0, 0 }, { 1, 1 } } } };
		for ( const auto& id : { "NUTRIENTS", "MINERALS", "ENERGY" } ) {
			game.m_rm->DefineResource( new backend::resource::Resource( id, id, render ) );
		}
	}
	void SetupFounding( GSE_CALLABLE ) {
		game.m_um = new backend::unit::UnitManager( &game, false );
		game.m_slot_num = 1;
		game.m_slot = owner->GetSlot();
		game.m_player = owner.get();
		game.m_game_state = backend::Game::GS_RUNNING;
		owner->GetFaction()->m_base_names.land = { "Expansion", "Settlement" };
		game.m_bm->m_registered_base_names.insert( base->m_name );
		auto* morale = new backend::unit::MoraleSet( "SYNTHETIC", { { "One" }, { "Two" }, { "Three" }, { "Four" }, { "Five" }, { "Six" }, { "Seven" } } );
		game.m_um->DefineMoraleSet( morale );
		for ( const auto& id : { "ColonyPod", "Scout" } ) {
			game.m_um->m_unit_defs.emplace( id, new backend::unit::StaticDef( id, morale, id, backend::unit::MT_LAND, 1.0f, new backend::unit::SpriteRender( "synthetic.pcx", 0, 0, 1, 1, 0, 0, 0 ) ) );
		}
		const backend::base::RenderInfo render { "synthetic.pcx", 0, 0, 1, 1 };
		game.m_bm->DefinePop( new backend::base::PopDef( "WORKER", "Worker", { render, render }, { render }, backend::base::PopDef::PF_TILE_WORKER ) );
		game.m_bm->DefinePop( new backend::base::PopDef( "DOCTOR", "Doctor", { render, render }, { render }, 0 ) );
		colony_id = backend::unit::Unit::GetNextId();
		auto* colony = new backend::unit::Unit( GSE_CALL, game.m_um, colony_id, game.m_um->GetUnitDef( "ColonyPod" ), owner->GetSlot(), game.m_map->GetTile( 2, 2 ), 0.75f, 3, 0.625f, true );
		game.m_um->m_units.emplace( colony_id, colony );
	}
	size_t AdditionalColony( GSE_CALLABLE, size_t x, size_t y ) {
		const auto id = backend::unit::Unit::GetNextId();
		auto* unit = new backend::unit::Unit( GSE_CALL, game.m_um, id, game.m_um->GetUnitDef( "ColonyPod" ), owner->GetSlot(), game.m_map->GetTile( x, y ), 1.0f, 2, 1.0f, false );
		game.m_um->m_units.emplace( id, unit );
		return id;
	}
	value::Object* InspectFounding( GSE_CALLABLE ) {
		value::array_elements_t base_ids, unit_ids, names;
		for ( const auto& entry : game.m_bm->GetBases() ) { base_ids.push_back( VALUE( value::Int,, entry.first ) ); }
		for ( const auto& entry : game.m_um->GetUnits() ) { unit_ids.push_back( VALUE( value::Int,, entry.first ) ); }
		std::set< std::string > ordered_names( game.m_bm->m_registered_base_names.begin(), game.m_bm->m_registered_base_names.end() );
		for ( const auto& name : ordered_names ) { names.push_back( VALUE( value::String,, name ) ); }
		size_t dangling_unit_updates = 0;
		for ( const auto& entry : game.m_um->m_unit_updates ) {
			if ( ( entry.second.ops & ( backend::unit::UnitManager::UUO_SPAWN | backend::unit::UnitManager::UUO_REFRESH ) ) && game.m_um->GetUnit( entry.first ) != entry.second.unit ) { dangling_unit_updates++; }
		}
		const value::object_properties_t result {
			{ "dangling_unit_updates", VALUE( value::Int,, dangling_unit_updates ) },
			{ "base_ids", VALUE( value::Array,, base_ids ) }, { "unit_ids", VALUE( value::Array,, unit_ids ) },
			{ "names", VALUE( value::Array,, names ) }, { "next_base_id", VALUE( value::Int,, backend::base::Base::GetNextId() ) },
			{ "next_unit_id", VALUE( value::Int,, backend::unit::Unit::GetNextId() ) },
			{ "rng", VALUE( value::String,, game.GetRandom()->GetStateString() ) },
			{ "updates", VALUE( value::Int,, game.m_bm->m_updated_bases.size() ) },
			{ "unit_updates", VALUE( value::Int,, game.m_um->m_unit_updates.size() ) },
			{ "base_updates", VALUE( value::Int,, game.m_bm->m_base_updates.size() ) },
			{ "pending_events", VALUE( value::Int,, game.m_pending_events.size() ) },
			{ "frontend_requests", VALUE( value::Int,, game.m_pending_frontend_requests->size() ) },
		};
		return VALUEEXT( value::Object, GSE_CALL, result );
	}
	value::Object* UnitRecipeCodecProbe( GSE_CALLABLE ) {
		const auto source_bytes = owner->Serialize().ToString();
		const auto payload = ChoiceBytes( *owner, "COLONY_POD" );
		auto copy = std::make_unique< backend::Player >( owner.get() );
		const bool independent = copy->GetProductionChoice( "COLONY_POD" ) && copy->GetProductionChoice( "COLONY_POD" ) != owner->GetProductionChoice( "COLONY_POD" );
		const bool copied = copy->Serialize().ToString() == source_bytes && ChoiceBytes( *copy, "COLONY_POD" ) == payload;
		copy.reset();
		auto receiving = std::make_unique< ProductionFixture >( GSE_CALL, false );
		receiving->game.m_um = new backend::unit::UnitManager( &receiving->game, false );
		receiving->game.m_game_state = backend::Game::GS_RUNNING;
		types::Buffer units; game.m_um->Serialize( units );
		receiving->game.m_um->Deserialize( GSE_CALL, units );
		receiving->Load( GSE_CALL, Snapshot() );
		const auto* received_def = receiving->game.m_um->GetUnitDef( "ColonyPod" );
		const auto* received_morale = receiving->game.m_um->GetMoraleSet( "SYNTHETIC" );
		const auto* received_unit = receiving->game.m_um->GetUnit( colony_id );
		const bool unit_parent = received_def && received_def != game.m_um->GetUnitDef( "ColonyPod" ) && received_morale && received_morale != game.m_um->GetMoraleSet( "SYNTHETIC" ) && received_def->m_moraleset == received_morale && received_unit && received_unit->m_def->m_moraleset == received_morale && received_unit->m_owner == receiving->owner->GetSlot();
		const bool roundtrip = receiving->Snapshot() == Snapshot();
		const bool parent = receiving->base->m_owner == receiving->owner->GetSlot() && receiving->base->GetGame() == &receiving->game;
		const auto before = receiving->Snapshot();
		auto missing_morale = receiving->game.m_um->m_unit_moralesets.extract( "SYNTHETIC" );
		bool rejected_morale = false;
		try { auto bytes = backend::unit::Def::Serialize( game.m_um->GetUnitDef( "ColonyPod" ) ); std::unique_ptr< backend::unit::Def > staged( backend::unit::Def::Deserialize( bytes, receiving->game.m_um ) ); }
		catch ( ... ) { rejected_morale = true; }
		receiving->game.m_um->m_unit_moralesets.insert( std::move( missing_morale ) );
		// Exercise the actual queued unit, including non-colony land recipes.
		const auto* active_choice = owner->GetProductionChoice( base->m_production.choice_id );
		const auto active_unit = active_choice && active_choice->GetType() == backend::base::production::Production::PT_UNIT
			? static_cast< const backend::base::production::Unit* >( active_choice )->unit_id : "ColonyPod";
		auto missing = receiving->game.m_um->m_unit_defs.extract( active_unit );
		bool rejected = false;
		try { auto bytes = backend::base::Base::Serialize( base ); std::unique_ptr< backend::base::Base > staged( backend::base::Base::Deserialize( GSE_CALL, bytes, &receiving->game, false ) ); }
		catch ( ... ) { rejected = true; }
		receiving->game.m_um->m_unit_defs.insert( std::move( missing ) );
		const value::object_properties_t result {
			{ "independent", VALUE( value::Bool,, independent ) }, { "copied", VALUE( value::Bool,, copied ) },
			{ "roundtrip", VALUE( value::Bool,, roundtrip ) }, { "receiving_parent", VALUE( value::Bool,, parent ) },
			{ "receiving_units", VALUE( value::Bool,, unit_parent ) },
			{ "missing_morale_rejected", VALUE( value::Bool,, rejected_morale ) },
			{ "missing_definition_rejected", VALUE( value::Bool,, rejected ) }, { "receiver_unchanged", VALUE( value::Bool,, receiving->Snapshot() == before ) },
			{ "source_unchanged", VALUE( value::Bool,, owner->Serialize().ToString() == source_bytes ) },
		};
		return VALUEEXT( value::Object, GSE_CALL, result );
	}
	size_t AddScout( GSE_CALLABLE, size_t owner_index ) {
		const auto id = backend::unit::Unit::GetNextId();
		auto* unit = new backend::unit::Unit( GSE_CALL, game.m_um, id, game.m_um->GetUnitDef( "Scout" ), &state->m_slots->GetSlot( owner_index ), game.m_map->GetTile( 2, 2 ), 0.5f, 2, 1.0f, false );
		game.m_um->m_units.emplace( id, unit );
		return id;
	}
	value::Object* UnitOrderCodecProbe( GSE_CALLABLE, size_t id ) {
		auto* source = game.m_um->GetUnit( id );
		if ( !source ) { GSE_ERROR( EC.INVALID_CALL, "Unknown fixture unit" ); }
		const auto old_base_id = backend::base::Base::GetNextId();
		const auto old_unit_id = backend::unit::Unit::GetNextId();
		struct RestoreIds {
			size_t base, unit;
			~RestoreIds() { backend::base::Base::SetNextId( base ); backend::unit::Unit::SetNextId( unit ); }
		} restore_ids { old_base_id, old_unit_id };
		const auto source_before = FoundingSnapshot();
		auto receiving = std::make_unique< ProductionFixture >( GSE_CALL, false );
		receiving->game.m_um = new backend::unit::UnitManager( &receiving->game, false );
		receiving->game.m_game_state = backend::Game::GS_RUNNING;
		types::Buffer units; game.m_um->Serialize( units );
		receiving->game.m_um->Deserialize( GSE_CALL, units );
		const auto* received = receiving->game.m_um->GetUnit( id );
		const bool roundtrip = received && backend::unit::Unit::Serialize( received ).ToString() == backend::unit::Unit::Serialize( source ).ToString();
		const bool held = received && received->GetOrder() == backend::unit::order_t::HOLD && !received->NeedsOrders();
		const bool receiving_owner = received && received->m_owner == receiving->owner->GetSlot() && received->m_def->m_moraleset == receiving->game.m_um->GetMoraleSet( "SYNTHETIC" );
		const bool combat_received = received && received->m_def->GetCombat() == source->m_def->GetCombat();
		// This is the exact pre-order candidate Unit payload, not an original
		// savefile. The enclosing manager length-delimits each such payload.
		types::Buffer legacy;
		legacy.WriteInt( source->m_id );
		legacy.WriteString( backend::unit::Def::Serialize( source->m_def ).ToString() );
		legacy.WriteInt( source->m_owner->GetIndex() );
		legacy.WriteInt( source->GetTile()->coord.x ); legacy.WriteInt( source->GetTile()->coord.y );
		legacy.WriteFloat( source->m_movement ); legacy.WriteInt( source->m_morale );
		legacy.WriteFloat( source->m_health ); legacy.WriteBool( source->m_moved_this_turn );
		receiving->game.m_um->DespawnUnit( GSE_CALL, id );
		auto legacy_bytes = legacy;
		auto* legacy_unit = backend::unit::Unit::Deserialize( GSE_CALL, legacy_bytes, receiving->game.m_um );
		receiving->game.m_um->SpawnUnit( GSE_CALL, legacy_unit );
		const bool legacy_default = legacy_unit->GetOrder() == backend::unit::order_t::NO_ORDERS && legacy_unit->m_movement == source->m_movement && legacy_unit->NeedsOrders();
		// Keep the tested ID/tile slot genuinely free: acceptance of corrupt
		// bytes must not be hidden by a later duplicate-unit assertion.
		receiving->game.m_um->DespawnUnit( GSE_CALL, id );
		const auto receiver_before = receiving->FoundingSnapshot();
		const auto next_before = backend::unit::Unit::GetNextId();
		types::Buffer invalid = legacy; invalid.WriteInt( 99 );
		auto trailing = backend::unit::Unit::Serialize( source ); trailing.WriteInt( 0 );
		const auto full = backend::unit::Unit::Serialize( source ).ToString();
		types::Buffer truncated( full.substr( 0, full.size() - 1 ) );
		auto rejects = [ & ]( types::Buffer& bytes ) {
			try {
				auto* unexpected = backend::unit::Unit::Deserialize( GSE_CALL, bytes, receiving->game.m_um );
				unexpected->GetTile()->units.erase( unexpected->m_id ); delete unexpected;
				return false;
			} catch ( const std::exception& ) { return true; }
		};
		const bool invalid_rejected = rejects( invalid );
		const bool trailing_rejected = rejects( trailing );
		const bool truncated_rejected = rejects( truncated );
		types::Buffer missing_work = legacy; missing_work.WriteInt( static_cast< int64_t >( backend::unit::order_t::TERRAFORM ) );
		types::Buffer unknown_work = legacy; unknown_work.WriteInt( 0 ); unknown_work.WriteString( "unknown-unit-work" );
		types::Buffer invalid_work = legacy;
		invalid_work.WriteInt( static_cast< int64_t >( backend::unit::order_t::TERRAFORM ) ); invalid_work.WriteString( "unit-work-v1" );
		invalid_work.WriteString( "farm" ); invalid_work.WriteInt( 2 ); invalid_work.WriteInt( 2 ); invalid_work.WriteInt( 1 );
		invalid_work.WriteInt( 0 ); invalid_work.WriteFloat( 1.0f ); invalid_work.WriteBool( false ); invalid_work.WriteInt( 0 ); invalid_work.WriteInt( 0 );
		const bool invalid_work_rejected = rejects( missing_work ) && rejects( unknown_work ) && rejects( invalid_work );
		const bool receiver_unchanged = receiving->FoundingSnapshot() == receiver_before && backend::unit::Unit::GetNextId() == next_before;
		backend::base::Base::SetNextId( old_base_id ); backend::unit::Unit::SetNextId( old_unit_id );
		const value::object_properties_t result {
			{ "roundtrip", VALUE( value::Bool,, roundtrip ) }, { "held", VALUE( value::Bool,, held ) },
			{ "receiving_owner", VALUE( value::Bool,, receiving_owner ) }, { "legacy_default", VALUE( value::Bool,, legacy_default ) },
			{ "combat_received", VALUE( value::Bool,, combat_received ) },
			{ "invalid_rejected", VALUE( value::Bool,, invalid_rejected ) }, { "trailing_rejected", VALUE( value::Bool,, trailing_rejected ) },
			{ "truncated_rejected", VALUE( value::Bool,, truncated_rejected ) }, { "receiver_unchanged", VALUE( value::Bool,, receiver_unchanged ) },
			{ "invalid_work_rejected", VALUE( value::Bool,, invalid_work_rejected ) },
			{ "source_unchanged", VALUE( value::Bool,, FoundingSnapshot() == source_before ) },
		};
		return VALUEEXT( value::Object, GSE_CALL, result );
	}
	value::Object* UnitDefinitionCodecProbe( GSE_CALLABLE, const std::string& id ) {
		const auto* source = game.m_um->GetUnitDef( id );
		if ( !source ) { GSE_ERROR( EC.INVALID_CALL, "Unknown fixture unit definition" ); }
		const auto before = FoundingSnapshot();
		const auto full = backend::unit::Def::Serialize( source ).ToString();
		types::Buffer input( full );
		std::unique_ptr< backend::unit::Def > received( backend::unit::Def::Deserialize( input, game.m_um ) );
		const bool roundtrip = received->GetCombat() == source->GetCombat() && backend::unit::Def::Serialize( received.get() ).ToString() == full;
		types::Buffer prefix( full );
		prefix.ReadString(); prefix.ReadString(); prefix.ReadString(); prefix.ReadInt();
		prefix.ReadInt(); prefix.ReadFloat();
		std::unique_ptr< backend::unit::Render > render( backend::unit::Render::Deserialize( prefix ) );
		const auto old = full.substr( 0, prefix.lenr );
		types::Buffer legacy( old );
		std::unique_ptr< backend::unit::Def > legacy_def( backend::unit::Def::Deserialize( legacy, game.m_um ) );
		const bool legacy_default = legacy_def->GetCombat() == backend::unit::Def::combat_t{};
		auto rejects = [ & ]( types::Buffer bytes ) {
			try { std::unique_ptr< backend::unit::Def > unexpected( backend::unit::Def::Deserialize( bytes, game.m_um ) ); return false; }
			catch ( const std::exception& ) { return true; }
		};
		types::Buffer invalid( old ); invalid.WriteString( "unit-combat-v1" ); invalid.WriteString( "conventional" );
		invalid.WriteInt( 1 ); invalid.WriteInt( 1 ); invalid.WriteInt( 0 );
		types::Buffer unknown( old ); unknown.WriteString( "unknown-combat-extension" );
		types::Buffer trailing( full ); trailing.WriteInt( 0 );
		const bool rejected = rejects( invalid ) && rejects( unknown ) && rejects( trailing ) && rejects( types::Buffer( full.substr( 0, full.size() - 1 ) ) );
		return VALUEEXT( value::Object, GSE_CALL, {
			{ "roundtrip", VALUE( value::Bool,, roundtrip ) }, { "legacy_default", VALUE( value::Bool,, legacy_default ) },
			{ "invalid_rejected", VALUE( value::Bool,, rejected ) }, { "source_unchanged", VALUE( value::Bool,, FoundingSnapshot() == before ) },
		} );
	}
	bool TerrainSpriteCacheProbe() {
		std::unique_ptr< backend::map::Map > source( new backend::map::Map( &game, false ) );
		const auto key = source->GetTerrainSpriteActor( "synthetic", { 0, 0 }, 0.5f );
		const auto first = source->AddTerrainSpriteActorInstance( key, { 1, 2, 3 } );
		source->RemoveTerrainSpriteActorInstance( key, first );
		const bool removed = source->m_sprite_instances.empty() && source->m_sprite_instances_to_add.empty() && source->m_sprite_instances_to_remove.empty();
		const auto second = source->AddTerrainSpriteActorInstance( key, { 4, 5, 6 } );
		return removed && second != first && source->m_sprite_instances.size() == 1 && source->m_sprite_instances_to_add.count( second ) == 1;
	}
	void EnableRenderCoordinates() {
		if ( game.m_map->m_map_state ) { return; }
		// Frontend queue serialization needs MapObject's real coordinate
		// lookup, but no terrain mesh, texture generation or graphics. Supply
		// only a linked native MapState with synthetic tile-center coordinates.
		auto render = std::make_unique< backend::map::MapState >();
		const auto* tiles = game.m_map->GetTilesPtr();
		render->dimensions = { tiles->GetWidth(), tiles->GetHeight() };
		render->first_run = false; render->coord = { 0.0f, 0.0f };
		render->variables.texture_scaling = { 0.0f, 0.0f };
		render->terrain_texture = nullptr; render->ter1_pcx = nullptr;
		const common::mt_flag_t canceled { false };
		render->LinkTileStates( canceled );
		for ( size_t y = 0; y < render->dimensions.y; ++y ) {
			for ( size_t x = y % 2; x < render->dimensions.x; x += 2 ) {
				auto* tile_state = render->At( x, y );
				for ( auto& layer : tile_state->layers ) {
					layer.coords.center = { static_cast< float >( x ), static_cast< float >( y ), 0.0f };
				}
			}
		}
		game.m_map->m_map_state = render.release();
	}
	value::Object* UnitOrderSyncProbe( GSE_CALLABLE, size_t id ) {
		auto* unit = game.m_um->GetUnit( id );
		if ( !unit ) { GSE_ERROR( EC.INVALID_CALL, "Unknown fixture unit" ); }
		EnableRenderCoordinates();
		game.m_um->QueueUnitUpdate( unit, backend::unit::UnitManager::UUO_SPAWN );
		game.m_um->RefreshUnit( GSE_CALL, unit );
		game.m_um->PushUpdates();
		bool spawn = false, update = false, copied = true;
		for ( const auto& request : *game.m_pending_frontend_requests ) {
			if ( request.type == ::game::FrontendRequest::FR_UNIT_SPAWN && request.data.unit_spawn.unit_id == id ) {
				spawn = request.data.unit_spawn.order == unit->GetOrder();
				const ::game::FrontendRequest copy( request ); copied = copied && copy.data.unit_spawn.order == unit->GetOrder();
			}
			if ( request.type == ::game::FrontendRequest::FR_UNIT_UPDATE && request.data.unit_update.unit_id == id ) {
				update = request.data.unit_update.order == unit->GetOrder();
				const ::game::FrontendRequest copy( request ); copied = copied && copy.data.unit_update.order == unit->GetOrder();
			}
		}
		const value::object_properties_t result {
			{ "spawn", VALUE( value::Bool,, spawn ) }, { "update", VALUE( value::Bool,, update ) }, { "copied", VALUE( value::Bool,, copied ) },
		};
		return VALUEEXT( value::Object, GSE_CALL, result );
	}
	bool CheckUnitReadiness() {
		game.CheckTurnComplete();
		return game.m_is_turn_complete;
	}
	void EnableTransport() { transport = std::make_unique< ProbeConnection >(); state->m_connection = transport.get(); }
	value::Object* InspectTransport( GSE_CALLABLE ) {
		const auto& queue = transport->m_pending_game_events;
		value::object_properties_t result { { "count", VALUE( value::Int,, queue.size() ) } };
		if ( !queue.empty() ) {
			types::Buffer wire( queue.back().serialized_data );
			wire.ReadString(); wire.ReadString(); wire.ReadInt();
			const auto fields = wire.ReadInt();
			if ( fields == 1 ) {
				wire.ReadString();
				const auto type = wire.ReadInt();
				if ( type == VT_OBJECT ) {
					result.emplace( "wrapper_class", VALUE( value::String,, wire.ReadString() ) );
					result.emplace( "wrapper_id", VALUE( value::Int,, wire.ReadInt() ) );
				}
			}
		}
		return VALUEEXT( value::Object, GSE_CALL, result );
	}
	void Process() { game.ProcessEvents(); }
	void Response( GSE_CALLABLE, const std::string& name, const value::object_properties_t& data, bool accepted, bool applied ) {
		auto* event = new backend::event::Event( &game, backend::event::Event::ES_LOCAL, game.m_slot_num, GSE_CALL, name, data );
		Value* rollback = nullptr;
		if ( applied ) {
			auto* obj = VALUEEXT( value::Object, GSE_CALL, event->GetData() );
			game.WithRW( [ & ]() { rollback = game.m_event_handlers.at( name )->Apply( GSE_CALL, { obj } ); } );
		}
		game.m_events_waiting_for_responses.emplace( event->GetId(), backend::Game::event_waiting_for_response_t { event, rollback, applied } );
		game.AddEventResponse( event->GetId(), accepted, nullptr );
		game.ProcessEventResponses();
	}
	std::string FoundingSnapshot() {
		types::Buffer bytes;
		game.m_bm->Serialize( bytes );
		for ( const auto& entry : game.m_um->GetUnits() ) { bytes.WriteString( backend::unit::Unit::Serialize( entry.second ).ToString() ); }
		bytes.WriteString( game.GetRandom()->GetStateString() );
		bytes.WriteInt( backend::base::Base::GetNextId() );
		bytes.WriteInt( backend::unit::Unit::GetNextId() );
		std::set< std::string > names( game.m_bm->m_registered_base_names.begin(), game.m_bm->m_registered_base_names.end() );
		for ( const auto& name : names ) { bytes.WriteString( name ); }
		return bytes.ToString();
	}
	void ConfigureFounding( const std::string& kind ) {
		auto* unit = game.m_um->GetUnit( colony_id );
		if ( !unit ) { THROW( "fixture colony no longer live" ); }
		if ( kind == "no_moves" ) { unit->m_movement = 0; }
		else if ( kind == "dead" ) { unit->m_health = 0; }
		else if ( kind == "wrong_def" ) { unit->m_def = game.m_um->GetUnitDef( "Scout" ); }
		else if ( kind == "water" ) { unit->GetTile()->is_water_tile = true; }
		else if ( kind == "locked" ) { unit->GetTile()->Lock( 1 ); }
		else if ( kind == "sensor" ) { unit->GetTile()->terraforming |= backend::map::tile::TERRAFORMING_SENSOR; }
		else if ( kind == "occupied" ) { unit->GetTile()->base = base; }
		else if ( kind == "completed" ) { owner->CompleteTurn(); }
		else if ( kind == "inactive" ) { game.m_game_state = backend::Game::GS_NONE; }
		else if ( kind == "animating" ) { unit->m_animation_id = 1; }
		else { THROW( "unknown founding fixture configuration" ); }
	}

	// Old broken copies borrow their source's owned payloads. Record that
	// strict-red observation, then discard only those borrowed entries before
	// cleanup so a test failure does not itself double-delete the source.
	static void DiscardBorrowedChoices( backend::Player& copy, const backend::Player& source ) {
		for ( auto it = copy.m_production_choices.begin(); it != copy.m_production_choices.end(); ) {
			bool borrowed = false;
			for ( const auto& choice : source.m_production_choices ) { if ( choice.second == it->second ) { borrowed = true; break; } }
			if ( borrowed ) { it = copy.m_production_choices.erase( it ); }
			else { ++it; }
		}
	}
	static std::string ChoiceBytes( const backend::Player& player, const std::string& id ) {
		const auto* choice = player.GetProductionChoice( id );
		if ( !choice ) { return ""; }
		types::Buffer bytes;
		choice->Serialize( bytes );
		return bytes.ToString();
	}
	value::Object* CopyProbe( GSE_CALLABLE, const std::string& kind ) {
		if ( kind != "ownership" && kind != "mutation" && kind != "copy_destroyed" && kind != "source_destroyed" ) { GSE_ERROR( EC.INVALID_CALL, "unknown Player copy probe" ); }
		if ( !owner->IsConnected() ) { owner->Connect(); }
		owner->CompleteTurn();
		owner->SetDifficultyLevel( "Transcend" );
		const auto before = owner->Serialize().ToString();
		const auto custom = ChoiceBytes( *owner, "STOCKPILE_ENERGY" );
		auto copy = std::make_unique< backend::Player >( owner.get() );
		const bool facility_independent = copy->GetProductionChoice( "RECYCLING_TANKS" ) && copy->GetProductionChoice( "RECYCLING_TANKS" ) != owner->GetProductionChoice( "RECYCLING_TANKS" );
		const bool custom_independent = copy->GetProductionChoice( "STOCKPILE_ENERGY" ) && copy->GetProductionChoice( "STOCKPILE_ENERGY" ) != owner->GetProductionChoice( "STOCKPILE_ENERGY" );
		const bool scalars_match = copy->GetPlayerName() == owner->GetPlayerName() && copy->GetRole() == owner->GetRole() && copy->GetSlot() == owner->GetSlot() && copy->m_slotnum == owner->m_slotnum && copy->GetFaction() == owner->GetFaction() && copy->GetDifficultyLevel() == owner->GetDifficultyLevel() && copy->IsConnected() == owner->IsConnected() && copy->IsTurnCompleted() == owner->IsTurnCompleted();
		const bool serialized_equal = copy->Serialize().ToString() == before;
		const bool custom_preserved = ChoiceBytes( *copy, "STOCKPILE_ENERGY" ) == custom;
		bool lifetime_ok = false;
		value::object_properties_t result {
			{ "facility_independent", VALUE( value::Bool,, facility_independent ) },
			{ "custom_independent", VALUE( value::Bool,, custom_independent ) },
			{ "scalars_match", VALUE( value::Bool,, scalars_match ) },
			{ "serialized_equal", VALUE( value::Bool,, serialized_equal ) },
			{ "custom_payload_preserved", VALUE( value::Bool,, custom_preserved ) },
			{ "choices", copy->GetProductionChoices( GSE_CALL ) },
			{ "name", VALUE( value::String,, copy->GetPlayerName() ) },
			{ "full_name", VALUE( value::String,, copy->GetFullName() ) },
			{ "role", VALUE( value::Int,, copy->GetRole() ) },
			{ "slot", VALUE( value::Int,, copy->m_slotnum ) },
			{ "difficulty", VALUE( value::String,, copy->GetDifficultyLevel() ) },
			{ "connected", VALUE( value::Bool,, copy->IsConnected() ) },
			{ "turn_completed", VALUE( value::Bool,, copy->IsTurnCompleted() ) },
		};
		if ( facility_independent && custom_independent ) {
			if ( kind == "ownership" ) { lifetime_ok = true; }
			else if ( kind == "mutation" ) {
				WithWrite( [ & ]() {
					copy->RemoveProductionChoice( GSE_CALL, "RECYCLING_TANKS" );
					copy->RemoveProductionChoice( GSE_CALL, "STOCKPILE_ENERGY" );
				} );
				lifetime_ok = !copy->GetProductionChoice( "RECYCLING_TANKS" ) && !copy->GetProductionChoice( "STOCKPILE_ENERGY" ) && owner->GetProductionChoice( "RECYCLING_TANKS" ) && ChoiceBytes( *owner, "STOCKPILE_ENERGY" ) == custom;
			} else if ( kind == "copy_destroyed" ) {
				copy.reset();
				lifetime_ok = owner->Serialize().ToString() == before && ChoiceBytes( *owner, "STOCKPILE_ENERGY" ) == custom;
			} else {
				auto survivor = std::make_unique< backend::Player >( copy.get() );
				const bool independent = survivor->GetProductionChoice( "RECYCLING_TANKS" ) != copy->GetProductionChoice( "RECYCLING_TANKS" ) && survivor->GetProductionChoice( "STOCKPILE_ENERGY" ) != copy->GetProductionChoice( "STOCKPILE_ENERGY" );
				if ( independent ) {
					copy.reset();
					lifetime_ok = survivor->Serialize().ToString() == before && ChoiceBytes( *survivor, "STOCKPILE_ENERGY" ) == custom;
				} else { DiscardBorrowedChoices( *survivor, *copy ); }
			}
		}
		if ( copy ) { DiscardBorrowedChoices( *copy, *owner ); }
		copy.reset();
		result.emplace( "lifetime_ok", VALUE( value::Bool,, lifetime_ok ) );
		result.emplace( "original_unchanged", VALUE( value::Bool,, owner->Serialize().ToString() == before ) );
		return VALUEEXT( value::Object, GSE_CALL, result );
	}
	std::string Snapshot() {
		types::Buffer result;
		result.WriteString( "GLSMAC_PRODUCTION_FIXTURE_V1" );
		result.WriteInt( game.GetTurnId() );
		result.WriteString( owner->Serialize().ToString() );
		types::Buffer bases;
		game.m_bm->Serialize( bases );
		result.WriteString( bases.ToString() );
		return result.ToString();
	}
	void Load( GSE_CALLABLE, const std::string& bytes ) {
		types::Buffer input( bytes );
		if ( input.ReadString() != "GLSMAC_PRODUCTION_FIXTURE_V1" ) { THROW( "invalid fixture snapshot" ); }
		SetTurn( input.ReadInt() );
		const auto player = input.ReadString();
		auto bases = types::Buffer( input.ReadString() );
		if ( input.lenr != input.lenw ) { THROW( "trailing fixture snapshot data" ); }
		owner->Deserialize( player );
		state->GetFM()->Add( owner->GetFaction() );
		game.m_bm->Deserialize( GSE_CALL, bases );
		// Production deferral is a native-manager boundary. Decode actual Base
		// records after the receiving registry has been reconstructed, without
		// dispatching graphical spawn callbacks in this asset-free fixture.
		auto staged = game.m_bm->DecodeSnapshotBases( GSE_CALL, game.m_bm->m_unprocessed_bases, game.m_bm->m_unprocessed_next_id );
		for ( auto& restored : staged ) {
			const auto id = restored->m_id;
			game.m_bm->m_bases.emplace( id, restored.release() );
		}
		game.m_bm->m_unprocessed_bases.clear();
		game.m_bm->m_unprocessed_next_id = 0;
		if ( game.m_bm->m_bases.empty() ) { THROW( "fixture requires a base" ); }
		base = game.m_bm->m_bases.begin()->second;
	}
	void AddSnapshotBase( GSE_CALLABLE, int64_t x, int64_t y ) {
		if ( x < 0 || y < 0 || x >= 4 || y >= 4 || x % 2 != y % 2 ) { GSE_ERROR( EC.INVALID_CALL, "invalid fixture base coordinate" ); }
		auto* tile = game.GetMap()->GetTile( x, y );
		if ( tile->base ) { GSE_ERROR( EC.INVALID_CALL, "fixture base tile occupied" ); }
		auto* added = new backend::base::Base( &game, backend::base::Base::GetNextId(), owner->GetSlot(), owner->GetFaction(), tile, "Second Base", {}, {} );
		game.m_bm->m_bases.emplace( added->m_id, added );
	}
	// Rewrite typed tokens from a genuine snapshot; never reproduce decoding
	// behavior or construct a parallel simulated world in the probe.
	static std::string CorruptWorkRecord( const std::string& bytes, const std::string& kind, bool later ) {
		types::Buffer record( bytes );
		record.ReadInt(); record.ReadInt(); record.ReadString();
		const auto center_offset = record.lenr;
		record.ReadInt(); record.ReadInt();
		const auto center_end = record.lenr;
		if ( later && kind == "worker_later_center" ) {
			types::Buffer changed; changed.WriteInt( 2 ); changed.WriteInt( 0 );
			return bytes.substr( 0, center_offset ) + changed.ToString() + bytes.substr( center_end );
		}
		record.ReadString();
		const auto facilities = record.ReadInt();
		for ( int64_t i = 0; i < facilities; ++i ) { record.ReadString(); }
		const auto pops = record.ReadInt();
		for ( int64_t i = 0; i < pops; ++i ) { record.ReadInt(); record.ReadInt(); record.ReadString(); record.ReadInt(); }
		record.ReadInt(); record.ReadString(); record.ReadInt(); record.ReadInt();
		record.ReadString();
		if ( record.ReadBool() ) { record.ReadInt(); }
		const auto work_offset = record.lenr;
		const auto count = record.ReadInt();
		if ( count != 1 ) { THROW( "worker corruption requires one assigned population" ); }
		auto id = record.ReadInt(); auto x = record.ReadInt(); auto y = record.ReadInt();
		if ( kind == "worker_unknown_pop" ) { id = 999; }
		else if ( kind == "worker_out_of_map" ) { x = 4; }
		else if ( kind == "worker_bad_parity" ) { x = 1; y = 0; }
		else if ( kind == "worker_center" ) { x = 0; y = 0; }
		else if ( kind == "worker_nonworker" ) { id = 2; }
		else if ( kind == "worker_later_claim" ) { x = 2; y = 0; }
		types::Buffer changed;
		const bool duplicate = kind == "worker_duplicate_tile" || kind == "worker_duplicate_pop";
		changed.WriteInt( duplicate ? 2 : 1 ); changed.WriteInt( id ); changed.WriteInt( x ); changed.WriteInt( y );
		if ( duplicate ) { changed.WriteInt( kind == "worker_duplicate_pop" ? id : 2 ); changed.WriteInt( x ); changed.WriteInt( y ); }
		return bytes.substr( 0, work_offset ) + changed.ToString();
	}
	std::string CorruptWorkerSnapshot( const std::string& kind ) {
		types::Buffer incoming( Snapshot() ), result;
		result.WriteString( incoming.ReadString() ); result.WriteInt( incoming.ReadInt() ); result.WriteString( incoming.ReadString() );
		types::Buffer bases( incoming.ReadString() ), changed;
		changed.WriteString( bases.ReadString() );
		const auto pops = bases.ReadInt(); changed.WriteInt( pops );
		for ( int64_t i = 0; i < pops; ++i ) { changed.WriteString( bases.ReadString() ); changed.WriteString( bases.ReadString() ); }
		const auto facilities = bases.ReadInt(); changed.WriteInt( facilities );
		for ( int64_t i = 0; i < facilities; ++i ) { changed.WriteString( bases.ReadString() ); }
		const auto count = bases.ReadInt(); changed.WriteInt( count );
		for ( int64_t i = 0; i < count; ++i ) {
			auto bytes = bases.ReadString();
			if ( kind == "truncated_later_base" && i == 1 ) { bytes.resize( bytes.size() - 1 ); }
			else if ( kind == "worker_later_center" || kind == "worker_later_claim" ) {
				if ( i == 1 ) { bytes = CorruptWorkRecord( bytes, kind, true ); }
			} else if ( i == 0 ) { bytes = CorruptWorkRecord( bytes, kind, false ); }
			changed.WriteString( bytes );
		}
		changed.WriteInt( bases.ReadInt() );
		result.WriteString( changed.ToString() );
		return result.ToString();
	}
	void ProcessPendingBases( GSE_CALLABLE ) { game.m_bm->ProcessUnprocessed( GSE_CALL ); }
	value::Object* ProbeEmptySnapshot( GSE_CALLABLE, int64_t next_id ) {
		if ( next_id <= 0 ) { GSE_ERROR( EC.INVALID_CALL, "invalid empty fixture next ID" ); }
		auto receiving = std::make_shared< ProductionFixture >( GSE_CALL, false );
		const auto previous = backend::base::Base::GetNextId();
		try {
			// Generate the actual empty BM snapshot with an independently chosen
			// next ID, then return the source process counter to its prior value.
			backend::base::Base::SetNextId( next_id );
			types::Buffer snapshot; receiving->game.m_bm->Serialize( snapshot );
			backend::base::Base::SetNextId( previous );
			receiving->game.m_bm->Deserialize( GSE_CALL, snapshot );
			const bool deferred_preserved = backend::base::Base::GetNextId() == previous;
			receiving->ProcessPendingBases( GSE_CALL );
			const auto first = backend::base::Base::GetNextId();
			receiving->ProcessPendingBases( GSE_CALL );
			const auto second = backend::base::Base::GetNextId();
			backend::base::Base::SetNextId( previous );
			const value::object_properties_t result {
				{ "deferred_preserved", VALUE( value::Bool,, deferred_preserved ) },
				{ "first", VALUE( value::Int,, first ) }, { "second", VALUE( value::Int,, second ) },
				{ "bases", VALUE( value::Int,, receiving->game.m_bm->GetBases().size() ) },
			};
			return VALUEEXT( value::Object, GSE_CALL, result );
		} catch ( ... ) { backend::base::Base::SetNextId( previous ); throw; }
	}
	value::Object* ProbeSnapshotDecode( GSE_CALLABLE, const std::string& bytes ) {
		auto receiving = std::make_shared< ProductionFixture >( GSE_CALL, false );
		bool rejected = false;
		const auto next_id = backend::base::Base::GetNextId();
		try { receiving->Load( GSE_CALL, bytes ); } catch ( const std::exception& ) { rejected = true; }
		size_t centers = 0, claims = 0;
		for ( int64_t y = 0; y < 4; ++y ) {
			for ( int64_t x = y % 2; x < 4; x += 2 ) {
				auto* tile = receiving->game.GetMap()->GetTile( x, y );
				if ( tile->base ) { centers++; }
				auto* wrapper = (value::Object*)tile->Wrap( GSE_CALL );
				auto* has = (value::Callable*)wrapper->value.at( "has" );
				if ( ( (value::Bool*)has->Run( GSE_CALL, { VALUE( value::String,, "working_pop" ) } ) )->value ) { claims++; }
			}
		}
		const value::object_properties_t result {
			{ "rejected", VALUE( value::Bool,, rejected ) }, { "centers", VALUE( value::Int,, centers ) },
			{ "claims", VALUE( value::Int,, claims ) }, { "bases", VALUE( value::Int,, receiving->game.m_bm->GetBases().size() ) },
			{ "next_id_preserved", VALUE( value::Bool,, backend::base::Base::GetNextId() == next_id ) },
		};
		return VALUEEXT( value::Object, GSE_CALL, result );
	}
	std::string Corrupt( const std::string& kind ) {
		if ( kind.rfind( "worker_", 0 ) == 0 || kind == "truncated_later_base" ) { return CorruptWorkerSnapshot( kind ); }
		if ( kind == "truncated" ) { auto bytes = Snapshot(); return bytes.substr( 0, bytes.size() - 1 ); }
		if ( kind == "trailing" ) { return Snapshot() + "trailing"; }
		const auto before = base->m_production;
		if ( kind == "unknown_choice" ) { base->m_production.choice_id = "MISSING"; }
		else if ( kind == "negative_minerals" ) { base->m_production.minerals = -1; }
		else if ( kind == "negative_turn" ) { base->m_production.last_processed_turn = -1; }
		else if ( kind == "unknown_facility" ) { base->m_facilities.emplace( "MISSING", game.m_bm->GetFacilityDef( "HEADQUARTERS" ) ); }
		else if ( kind == "unknown_pop" ) {
			if ( base->m_pops.empty() ) { THROW( "unknown-pop corruption requires a populated base" ); }
			auto& pop = base->m_pops.begin()->second;
			const auto* def = pop.m_def;
			const backend::base::PopDef missing( "MISSING", "Missing", {}, {}, 0 );
			pop.m_def = &missing;
			const auto bytes = Snapshot();
			pop.m_def = def;
			return bytes;
		}
		else { THROW( "unknown fixture corruption" ); }
		const auto bytes = Snapshot();
		base->m_production = before;
		base->m_facilities.erase( "MISSING" );
		return bytes;
	}
};

struct ProductionSession {
	std::shared_ptr< ProductionFixture > current;
	std::vector< std::shared_ptr< ProductionFixture > > retired;
};

class FixtureObject : public value::Object {
public:
	FixtureObject( GSE_CALLABLE, std::shared_ptr< ProductionSession > session ) : value::Object( GSE_CALL ), session( std::move( session ) ) {}
	void GetReachableObjects( std::unordered_set< gc::Object* >& objects ) override {
		value::Object::GetReachableObjects( objects );
		session->current->GetReachableObjects( objects );
		for ( const auto& fixture : session->retired ) { fixture->GetReachableObjects( objects ); }
	}
	std::shared_ptr< ProductionSession > session;
};

static void UpdateWrappers( GSE_CALLABLE, FixtureObject* object ) {
	const auto& f = object->session->current;
	object->Set( "game", f->game.Wrap( GSE_CALL ), GSE_CALL );
	object->Set( "base", f->base->Wrap( GSE_CALL ), GSE_CALL );
	object->Set( "owner", f->owner->Wrap( GSE_CALL ), GSE_CALL );
}

Value* MakeProductionFixture( GSE_CALLABLE, bool founding ) {
	const auto session = std::make_shared< ProductionSession >();
	session->current = std::make_shared< ProductionFixture >( GSE_CALL );
	if ( founding ) { session->current->SetupFounding( GSE_CALL ); }
	auto* object = new FixtureObject( GSE_CALL, session );
	UpdateWrappers( GSE_CALL, object );
	object->Set( "with_write", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GET_CALLABLE( callback, 0 );
		Value* result = nullptr;
		session->current->WithWrite( [ & ]() { result = callback->Run( GSE_CALL, {} ); } );
		session->current->Flush( GSE_CALL );
		return result;
	} ), GSE_CALL );
	object->Set( "set_turn", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( turn, 0, Int );
		if ( turn <= 0 ) { GSE_ERROR( EC.INVALID_CALL, "invalid fixture turn" ); }
		session->current->SetTurn( turn );
		return VALUE( value::Undefined );
	} ), GSE_CALL );
	object->Set( "update_count", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 ); session->current->Flush( GSE_CALL );
		return VALUE( value::Int,, session->current->updates );
	} ), GSE_CALL );
	object->Set( "add_worker", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( variant, 0, Int );
		session->current->AddWorker( GSE_CALL, variant );
		return VALUE( value::Undefined );
	} ), GSE_CALL );
	object->Set( "map_settings_snapshot", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( kind, 0, String );
		return VALUE( value::String,, session->current->MapSettingsSnapshot( kind ) );
	} ), GSE_CALL );
	object->Set( "restore_map_settings", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( bytes, 0, String );
		try { session->current->RestoreMapSettings( bytes ); }
		catch ( const std::exception& error ) { GSE_ERROR( EC.INVALID_CALL, error.what() ); }
		return VALUE( value::Undefined );
	} ), GSE_CALL );
	object->Set( "map_grid_probe", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 );
		try { return session->current->MapGridProbe( GSE_CALL ); }
		catch ( const std::exception& error ) { GSE_ERROR( EC.INVALID_CALL, error.what() ); }
	} ), GSE_CALL );
	object->Set( "map_polar_probe", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 );
		try { return session->current->MapGridProbe( GSE_CALL, true ); }
		catch ( const std::exception& error ) { GSE_ERROR( EC.INVALID_CALL, error.what() ); }
	} ), GSE_CALL );
	object->Set( "map_mesh_probe", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 );
		try { return session->current->MapMeshProbe( GSE_CALL ); }
		catch ( const std::exception& error ) { GSE_ERROR( EC.INVALID_CALL, error.what() ); }
	} ), GSE_CALL );
	object->Set( "rules_settings_snapshot", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( kind, 0, String );
		return VALUE( value::String,, session->current->RulesSettingsSnapshot( kind ) );
	} ), GSE_CALL );
	object->Set( "restore_rules_settings", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( bytes, 0, String );
		try { session->current->RestoreRulesSettings( bytes ); }
		catch ( const std::exception& error ) { GSE_ERROR( EC.INVALID_CALL, error.what() ); }
		return VALUE( value::Undefined );
	} ), GSE_CALL );
	object->Set( "rules_copy_probe", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 ); return session->current->RulesCopyProbe( GSE_CALL );
	} ), GSE_CALL );
	object->Set( "rules_record_probe", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 ); return session->current->RulesRecordProbe( GSE_CALL );
	} ), GSE_CALL );
	object->Set( "world_sizes_copy_probe", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 ); return session->current->WorldSizesCopyProbe( GSE_CALL );
	} ), GSE_CALL );
	object->Set( "global_settings_snapshot", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( kind, 0, String );
		return VALUE( value::String,, session->current->GlobalSettingsSnapshot( kind ) );
	} ), GSE_CALL );
	object->Set( "restore_global_settings", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( bytes, 0, String );
		try { session->current->RestoreGlobalSettings( bytes ); }
		catch ( const std::exception& error ) { GSE_ERROR( EC.INVALID_CALL, error.what() ); }
		return VALUE( value::Undefined );
	} ), GSE_CALL );
	object->Set( "state_rules_wire_probe", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 ); return session->current->StateRulesWireProbe( GSE_CALL );
	} ), GSE_CALL );
	object->Set( "set_owner_role", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( role, 0, String ); session->current->SetOwnerRole( role );
		return VALUE( value::Undefined );
	} ), GSE_CALL );
	object->Set( "enable_economy", NATIVE_CALL( session, object ) {
		N_EXPECT_ARGS( 0 ); session->current->EnableEconomy();
		UpdateWrappers( GSE_CALL, object );
		return VALUE( value::Undefined );
	} ), GSE_CALL );
	object->Set( "tile_at", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 2 ); N_GETVALUE( x, 0, Int ); N_GETVALUE( y, 1, Int );
		if ( x < 0 || y < 0 || x >= 4 || y >= 4 || x % 2 != y % 2 ) { GSE_ERROR( EC.INVALID_CALL, "invalid fixture tile coordinate" ); }
		return session->current->game.GetMap()->GetTile( x, y )->Wrap( GSE_CALL );
	} ), GSE_CALL );
	object->Set( "next_ids", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 );
		const value::object_properties_t result {
			{ "base", VALUE( value::Int,, backend::base::Base::GetNextId() ) },
			{ "pop", VALUE( value::Int,, session->current->NextPopId() ) },
		};
		return VALUEEXT( value::Object, GSE_CALL, result );
	} ), GSE_CALL );
	object->Set( "terrain_snapshot", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 );
		return VALUE( value::String,, session->current->game.GetMap()->GetTilesPtr()->Serialize().ToString() );
	} ), GSE_CALL );
	object->Set( "terrain_patch_copy_probe", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 ); auto& f = *session->current; f.EnableRenderCoordinates();
		std::unique_ptr< ::game::FrontendRequest > copy;
		{
			::game::FrontendRequest source( ::game::FrontendRequest::FR_UPDATE_TILES );
			auto* patch = new ::game::FrontendRequest::terrain_patch_t(); source.data.update_tiles.patch = patch;
			patch->tiles.emplace_back( *f.game.GetMap()->GetTile( 2, 2 ), *f.game.GetMap()->GetTileState( 2, 2 ) );
			patch->tiles[ 0 ].terraforming = backend::map::tile::TERRAFORMING_FOREST;
			patch->tiles[ 0 ].layers[ 0 ].coords.center.x = 17.0f;
			patch->tiles[ 0 ].sprites.push_back( { "actor", 1, "name", {} } );
			patch->actors.emplace( "key", backend::map::sprite_actor_t { "actor", { 1, 2 }, 0.5f } );
			patch->removed.emplace( 1, "actor" ); patch->added.emplace( 2, std::make_pair( "actor", types::Vec3 { 1, 2, 3 } ) );
			copy = std::make_unique< ::game::FrontendRequest >( source );
			patch->tiles[ 0 ].terraforming = 0; patch->tiles[ 0 ].layers[ 0 ].coords.center.x = 99.0f;
			patch->tiles[ 0 ].sprites[ 0 ].actor = "changed"; patch->actors.at( "key" ).name = "changed";
			patch->removed.at( 1 ) = "changed"; patch->added.at( 2 ).first = "changed";
		}
		const auto& patch = *copy->data.update_tiles.patch;
		return VALUE( value::Bool,, patch.tiles[ 0 ].terraforming == backend::map::tile::TERRAFORMING_FOREST &&
			patch.tiles[ 0 ].layers[ 0 ].coords.center.x == 17.0f && patch.tiles[ 0 ].sprites[ 0 ].actor == "actor" &&
			patch.actors.at( "key" ).name == "actor" && patch.removed.at( 1 ) == "actor" && patch.added.at( 2 ).first == "actor" );
	} ), GSE_CALL );
	object->Set( "terrain_random_probe", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( fail, 0, Bool );
		auto& random = *session->current->game.GetRandom(); const auto before = random.GetStateString();
		bool consumed = false, caught = false;
		try {
			const util::random::Random::ScopedState preserve_random( random );
			for ( size_t i = 0; i < 16; ++i ) { random.GetInt64( 0, 1000 ); random.GetFloat( 0.0f, 1.0f ); }
			consumed = random.GetStateString() != before;
			if ( fail ) { throw std::runtime_error( "Synthetic artwork failure" ); }
		} catch ( const std::runtime_error& ) { caught = true; }
		return VALUE( value::Bool,, consumed && random.GetStateString() == before && caught == fail );
	} ), GSE_CALL );
	object->Set( "terrain_sprite_cache_probe", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 ); return VALUE( value::Bool,, session->current->TerrainSpriteCacheProbe() );
	} ), GSE_CALL );
	object->Set( "process_pending_bases", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 ); session->current->ProcessPendingBases( GSE_CALL ); return VALUE( value::Undefined );
	} ), GSE_CALL );
	object->Set( "probe_empty_snapshot", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( next_id, 0, Int );
		return session->current->ProbeEmptySnapshot( GSE_CALL, next_id );
	} ), GSE_CALL );
	object->Set( "add_snapshot_base", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 2 ); N_GETVALUE( x, 0, Int ); N_GETVALUE( y, 1, Int );
		session->current->AddSnapshotBase( GSE_CALL, x, y ); return VALUE( value::Undefined );
	} ), GSE_CALL );
	object->Set( "probe_snapshot_decode", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( bytes, 0, String );
		return session->current->ProbeSnapshotDecode( GSE_CALL, bytes );
	} ), GSE_CALL );
	object->Set( "player_copy_probe", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( kind, 0, String );
		return session->current->CopyProbe( GSE_CALL, kind );
	} ), GSE_CALL );
	object->Set( "apply_faction_identity", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( values, 0, Array );
		return session->current->ApplyFactionIdentity( GSE_CALL, values );
	} ), GSE_CALL );
	object->Set( "apply_faction_ratings", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( values, 0, Object );
		return session->current->ApplyFactionRatings( GSE_CALL, values );
	} ), GSE_CALL );
	object->Set( "apply_faction_starting_technologies", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( values, 0, Array );
		return session->current->ApplyFactionStartingTechnologies( GSE_CALL, values );
	} ), GSE_CALL );
	object->Set( "faction_identity_codec", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 ); return session->current->FactionIdentityCodec( GSE_CALL );
	} ), GSE_CALL );
	object->Set( "snapshot", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 0 ); return VALUE( value::String,, session->current->Snapshot() );
	} ), GSE_CALL );
	object->Set( "corrupt_snapshot", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( kind, 0, String );
		return VALUE( value::String,, session->current->Corrupt( kind ) );
	} ), GSE_CALL );
	object->Set( "restore", NATIVE_CALL( session, object ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( bytes, 0, String );
		try {
			auto receiving = std::make_shared< ProductionFixture >( GSE_CALL, false );
			receiving->Load( GSE_CALL, bytes );
			session->current->Retire();
			session->retired.push_back( session->current );
			session->current = std::move( receiving );
			UpdateWrappers( GSE_CALL, object );
		} catch ( const std::exception& error ) { GSE_ERROR( EC.INVALID_CALL, error.what() ); }
		return VALUE( value::Undefined );
	} ), GSE_CALL );
	object->Set( "reset", NATIVE_CALL( session, object, founding ) {
		N_EXPECT_ARGS( 0 );
		auto fresh = std::make_shared< ProductionFixture >( GSE_CALL );
		if ( founding ) { fresh->SetupFounding( GSE_CALL ); }
		session->current->Retire();
		session->retired.push_back( session->current );
		session->current = std::move( fresh );
		UpdateWrappers( GSE_CALL, object );
		if ( founding ) {
			object->Set( "unit_id", VALUE( value::Int,, session->current->colony_id ), GSE_CALL );
			object->Set( "tile", session->current->game.GetMap()->GetTile( 2, 2 )->Wrap( GSE_CALL ), GSE_CALL );
			object->Set( "worker_tile", session->current->game.GetMap()->GetTile( 0, 2 )->Wrap( GSE_CALL ), GSE_CALL );
		}
		return VALUE( value::Undefined );
	} ), GSE_CALL );
	if ( founding ) {
		object->Set( "unit_id", VALUE( value::Int,, session->current->colony_id ), GSE_CALL );
		object->Set( "tile", session->current->game.GetMap()->GetTile( 2, 2 )->Wrap( GSE_CALL ), GSE_CALL );
		object->Set( "worker_tile", session->current->game.GetMap()->GetTile( 0, 2 )->Wrap( GSE_CALL ), GSE_CALL );
		object->Set( "add_scout", NATIVE_CALL( session ) { N_EXPECT_ARGS( 1 ); N_GETVALUE( owner, 0, Int ); return VALUE( value::Int,, session->current->AddScout( GSE_CALL, owner ) ); } ), GSE_CALL );
		object->Set( "add_colony", NATIVE_CALL( session ) { N_EXPECT_ARGS( 2 ); N_GETVALUE( x, 0, Int ); N_GETVALUE( y, 1, Int ); return VALUE( value::Int,, session->current->AdditionalColony( GSE_CALL, x, y ) ); } ), GSE_CALL );
		object->Set( "inspect", NATIVE_CALL( session ) { N_EXPECT_ARGS( 0 ); return session->current->InspectFounding( GSE_CALL ); } ), GSE_CALL );
		object->Set( "unit_recipe_codec_probe", NATIVE_CALL( session ) { N_EXPECT_ARGS( 0 ); return session->current->UnitRecipeCodecProbe( GSE_CALL ); } ), GSE_CALL );
		object->Set( "unit_order_codec_probe", NATIVE_CALL( session ) { N_EXPECT_ARGS( 1 ); N_GETVALUE( id, 0, Int ); return session->current->UnitOrderCodecProbe( GSE_CALL, id ); } ), GSE_CALL );
		object->Set( "unit_definition_codec_probe", NATIVE_CALL( session ) { N_EXPECT_ARGS( 1 ); N_GETVALUE( id, 0, String ); return session->current->UnitDefinitionCodecProbe( GSE_CALL, id ); } ), GSE_CALL );
		object->Set( "unit_order_sync_probe", NATIVE_CALL( session ) { N_EXPECT_ARGS( 1 ); N_GETVALUE( id, 0, Int ); return session->current->UnitOrderSyncProbe( GSE_CALL, id ); } ), GSE_CALL );
		object->Set( "check_unit_readiness", NATIVE_CALL( session ) { N_EXPECT_ARGS( 0 ); return VALUE( value::Bool,, session->current->CheckUnitReadiness() ); } ), GSE_CALL );
		object->Set( "snapshot", NATIVE_CALL( session ) { N_EXPECT_ARGS( 0 ); return VALUE( value::String,, session->current->FoundingSnapshot() ); } ), GSE_CALL );
		object->Set( "configure", NATIVE_CALL( session ) { N_EXPECT_ARGS( 1 ); N_GETVALUE( kind, 0, String ); session->current->ConfigureFounding( kind ); return VALUE( value::Undefined ); } ), GSE_CALL );
	}
	object->Set( "enable_transport", NATIVE_CALL( session ) { N_EXPECT_ARGS( 0 ); session->current->EnableTransport(); return VALUE( value::Undefined ); } ), GSE_CALL );
	object->Set( "transport", NATIVE_CALL( session ) { N_EXPECT_ARGS( 0 ); return session->current->InspectTransport( GSE_CALL ); } ), GSE_CALL );
	object->Set( "process_events", NATIVE_CALL( session ) { N_EXPECT_ARGS( 0 ); session->current->Process(); return VALUE( value::Undefined ); } ), GSE_CALL );
	object->Set( "response_event", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 4 ); N_GETVALUE( name, 0, String ); N_GETVALUE( data, 1, Object ); N_GETVALUE( accepted, 2, Bool ); N_GETVALUE( applied, 3, Bool );
		session->current->Response( GSE_CALL, name, data, accepted, applied );
		return VALUE( value::Undefined );
	} ), GSE_CALL );
	object->Set( "remote_event", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 2 ); N_GETVALUE( name, 0, String ); N_GET( data, 1, Object );
		session->current->game.AddEvent( new backend::event::Event( &session->current->game, backend::event::Event::ES_CLIENT, 1, GSE_CALL, name, data->value ) );
		return VALUE( value::Undefined );
	} ), GSE_CALL );
	return object;
}

}
