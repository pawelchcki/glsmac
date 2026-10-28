#include "UnitBodyCensusFixture.h"

#if defined( DEBUG ) || defined( FASTDEBUG )
#include "GLSMAC.h"
#include "engine/Engine.h"
#include "gc/GC.h"
#include "gc/Space.h"
#include "gse/Exception.h"
#include "gse/ExecutionPointer.h"
#include "gse/GSE.h"
#include "gse/context/GlobalContext.h"
#include "gse/value/Array.h"
#include "gse/value/Bool.h"
#include "gse/value/Callable.h"
#include "gse/value/Float.h"
#include "gse/value/Null.h"
#include "gse/value/Object.h"
#include "gse/value/Undefined.h"
#include "game/backend/Game.h"
#include "game/backend/State.h"
#include "game/backend/faction/Faction.h"
#include "game/backend/map/Consts.h"
#include "game/backend/unit/SpriteRender.h"
#include "game/backend/unit/StaticDef.h"
#include "game/frontend/Game.h"
#include "game/frontend/Slot.h"
#include "game/frontend/faction/Faction.h"
#include "game/frontend/sprite/InstancedSprite.h"
#include "game/frontend/sprite/InstancedSpriteManager.h"
#include "game/frontend/tile/Tile.h"
#include "game/frontend/unit/BadgeDefs.h"
#include "game/frontend/unit/Unit.h"
#include "game/frontend/unit/UnitDef.h"
#include "game/frontend/unit/UnitManager.h"
#include "scene/Scene.h"
#include "scene/actor/Instanced.h"
#include "types/texture/Texture.h"
#include "util/LogHelper.h"
#include "util/FinallyGuard.h"
#include <yaml-cpp/yaml.h>
#include <array>
#include <cstring>
#include <functional>
#include <limits>
#include <map>
#include <memory>
#include <set>
#include <stdexcept>

namespace gse::tests::mocks {
namespace backend = game::backend;
namespace frontend = game::frontend;

namespace {
// Test-local access to the real State's inherited retention operations. Keep
// its constructor, collector registration, reachability and retirement intact.
struct CensusFixtureState final : backend::State {
    using backend::State::State;
    using backend::State::Persist;
    using backend::State::Unpersist;
    using backend::State::IsPersisted;
};
}

// This fixture supplies the application/frontend readiness and texture inputs,
// not a normal startup, renderer or backend event loop. It calls the production
// wrapped property and constructs real frontend objects: no census/copy/lookup
// implementation or fabricated body observation lives here.
struct UnitBodyCensusFixture {
    // Both backend identities outlive the GLSMAC-owned State and its wrappers.
    backend::Game backend_game, different_game;
    bool backend_started = false, different_started = false;
    std::unique_ptr< GLSMAC > application;
    CensusFixtureState* state = nullptr; // GC-owned, rooted by application->m_state
    value::Object* game_value = nullptr;
    value::Object* different_value = nullptr;
    value::Callable* binding = nullptr; // rooted via actual application wrap
    std::unique_ptr< frontend::Game > frontend_game;
    std::unique_ptr< scene::Scene > world_scene;
    std::unique_ptr< frontend::sprite::InstancedSpriteManager > sprites;
    std::unique_ptr< frontend::unit::UnitManager > units;
    std::unique_ptr< types::texture::Texture > body_texture, badge_texture;
    std::array< std::unique_ptr< backend::faction::Faction >, 2 > faction_defs;
    std::array< std::unique_ptr< frontend::faction::Faction >, 2 > factions;
    std::array< std::unique_ptr< frontend::Slot >, 2 > slots;
    std::array< std::unique_ptr< frontend::tile::Tile >, 3 > tiles;
    std::array< frontend::unit::Unit*, 3 > actors{}; // owned by real UnitManager
    const std::array< size_t, 3 > ids{ 101, 202, 303 };
    const std::array< size_t, 3 > owners{ 0, 1, 1 };
    const std::array< backend::unit::morale_t, 3 > morales{ 2, 3, 2 };
    const std::array< size_t, 3 > instance_ids{ 1, 1, 2 };
    const std::array< types::Vec3, 3 > positions{ types::Vec3{ .125f, -0.0f, -0.0f },
        types::Vec3{ -2.25f, 3.5f, -0.0f }, types::Vec3{ 4.5f, -1.25f, .75f } };
    size_t checks = 0, calls = 0, invalid_calls = 0, complete_copies = 0;

    void Require( bool condition, const std::string& message ) {
        ++checks;
        if ( !condition ) { throw std::runtime_error( "Unit body census fixture: " + message ); }
    }

    void Owner( const std::function< void( GSE_CALLABLE ) >& f ) {
        application->m_gc_space->Accumulate( application.get(), [ & ]() {
            ExecutionPointer ep;
            f( application->m_gc_space, application->m_ctx, {}, ep );
        }, nullptr, true );
    }

    ~UnitBodyCensusFixture() {
        // Run failures still retire the supplied context. Normal completion
        // calls Retire explicitly so any cleanup failure becomes a failed test.
        if ( application || backend_started || different_started ) {
            try { Retire(); }
            catch ( const std::exception& error ) {
                util::LogHelper::Println( std::string( "UNIT_BODY_CENSUS_CLEANUP_ERROR|" ) + error.what() );
            }
        }
    }

    void Retire() {
        if ( !application && !backend_started && !different_started ) { return; }
        // Collect the real Game/Random wrappers before retiring their native
        // owners. These are started identities, not initialized backend worlds.
        RetireApplication();
        if ( different_started ) {
            different_started = false; // consume once, including a failed Stop
            different_game.Stop();
        }
        if ( backend_started ) {
            backend_started = false;
            backend_game.Stop();
        }
        Require( !backend_game.GetRandom() && !different_game.GetRandom(), "native backend retirement left RNG owners behind" );
    }

    void RetireApplication() {
        if ( !application ) { return; }
        bool empty_scene = true, backend_detached = true;
        // Detach first, under the same GC-owner boundary as installation. The
        // GLSMAC destructor must not call normal frontend Stop on this supplied
        // context (that path requires a running engine backend).
        Owner( [ & ]( GSE_CALLABLE ) {
            application->m_game = nullptr;
            if ( frontend_game ) {
                frontend_game->m_is_initialized = false;
                frontend_game->m_game = nullptr;
                frontend_game->m_um = nullptr;
                frontend_game->m_ism = nullptr;
                frontend_game->m_world_scene = nullptr;
            }
            // Real manager retirement deletes Units before retained definitions,
            // owner badges and BadgeDefs. Tiles/textures/ISM remain alive here.
            units.reset();
            actors.fill( nullptr );
            for ( auto& tile : tiles ) { tile.reset(); }
            for ( auto& slot : slots ) { slot.reset(); }
            for ( auto& faction : factions ) { faction.reset(); }
            for ( auto& faction : faction_defs ) { faction.reset(); }
            sprites.reset();
            if ( world_scene ) {
                size_t remaining = 0;
                world_scene->WithActors( [ & ]( const auto& list ) { remaining = list.size(); } );
                empty_scene = remaining == 0;
            }
            world_scene.reset();
            body_texture.reset(); badge_texture.reset();
            frontend_game.reset();
            if ( state ) {
                state->UnsetGame();
                if ( game_value && state->IsPersisted( game_value ) ) { state->Unpersist( game_value ); }
                if ( different_value && state->IsPersisted( different_value ) ) { state->Unpersist( different_value ); }
                backend_detached = !state->GetGame();
            }
            // State/wrappers are owned by the real GSE space, not manually
            // deleted while still registered. GLSMAC/GSE teardown collects them.
            binding = nullptr; game_value = nullptr; different_value = nullptr;
        } );
        application.reset();
        state = nullptr;
        Require( empty_scene, "native retirement left scene actors behind" );
        Require( backend_detached, "backend remained linked after fixture retirement" );
    }

    Value* Invoke( GSE_CALLABLE, const value::function_arguments_t& arguments ) {
        ++calls;
        return binding->Run( GSE_CALL, arguments );
    }

    std::string Read( GSE_CALLABLE, value::Object* requested ) {
        auto* result = Invoke( GSE_CALL, { requested } );
        Require( result->type == VT_STRING, "production binding did not return a Native String" );
        return static_cast< value::String* >( result )->value;
    }

    void Invalid( GSE_CALLABLE, const value::function_arguments_t& arguments, const std::string& reason ) {
        bool caught = false;
        try { Invoke( GSE_CALL, arguments ); }
        catch ( const gse::Exception& error ) {
            Require( error.class_name == EC.INVALID_CALL, "argument error changed normal GSE class" );
            Require( error.reason.find( reason ) != std::string::npos, "wrong native argument-error reason" );
            caught = true;
        }
        Require( caught, "malformed call became an unavailable String instead of a GSE exception" );
        ++invalid_calls;
    }

    static uint32_t Bits( float value ) {
        uint32_t bits; static_assert( sizeof( bits ) == sizeof( value ) );
        std::memcpy( &bits, &value, sizeof( bits ) ); return bits;
    }

    void Float( const YAML::Node& actual, float expected ) {
        Require( actual.IsMap() && actual.size() == 2, "native Float32 descriptor missing" );
        Require( actual["bits"].as< uint32_t >() == Bits( expected ), "native Float32 bit pattern differs" );
        Require( Bits( actual["value"].as< float >() ) == Bits( expected ), "serialized Float32 value/bits disagree" );
    }

    void Vec( const YAML::Node& actual, const types::Vec3& expected ) {
        Require( actual.IsMap() && actual.size() == 3, "native vector descriptor missing" );
        Float( actual["x"], expected.x ); Float( actual["y"], expected.y ); Float( actual["z"], expected.z );
    }

    std::string Key( size_t index ) {
        // Declared sprite geometry: x=4+8*morale, y=8, size16x24.
        return "Unit_CensusSynthetic_" + std::to_string( morales[index] ) + " " +
            types::Vec2< uint32_t >{ static_cast< uint32_t >( 4 + 8 * morales[index] ), 8 }.ToString() + " " +
            types::Vec2< uint32_t >{ 16, 24 }.ToString();
    }

    using CacheState = std::map< backend::unit::morale_t, std::pair< const frontend::sprite::InstancedSprite*, size_t > >;
    CacheState CachedSources() {
        auto* definition = units->m_unitdefs.at( "CensusSynthetic" );
        Require( definition->static_.render.morale_based_sprites != nullptr, "actual retained morale cache is absent" );
        CacheState result;
        for ( const auto& entry : *definition->static_.render.morale_based_sprites ) {
            result.emplace( entry.first, std::make_pair( entry.second.instanced_sprite, entry.second.next_instance_id ) );
        }
        return result;
    }

    void CheckCopy( const std::string& text, const std::array< bool, 3 >& shown ) {
        const auto doc = YAML::Load( text ); // real producer String, not a supplied payload
        Require( doc["schema"].as< std::string >() == "application.unit-body-census.v1", "schema differs" );
        Require( doc["complete"].as< bool >() && doc["requested_game_matches"].as< bool >(), "copy incomplete/current binding wrong" );
        Require( doc["reasons"].IsSequence() && doc["reasons"].size() == 0, "copy has unsupported reasons" );
        Require( doc["known_frontend_units"].as< size_t >() == ids.size(), "known unit inventory differs" );
        Require( doc["cache_counts_before"].as< size_t >() == 2 && doc["cache_counts_after"].as< size_t >() == 2, "copy loaded/removed morale sprite cache" );
        Require( doc["owner_counts"].size() == 2, "both owners must be reported" );
        Require( doc["owner_counts"][0]["owner_id"].as< std::string >() == "0" && doc["owner_counts"][0]["units"].as< size_t >() == 1, "owner0 inventory differs" );
        Require( doc["owner_counts"][1]["owner_id"].as< std::string >() == "1" && doc["owner_counts"][1]["units"].as< size_t >() == 2, "foreign inventory filtered" );
        Require( doc["units"].IsSequence() && doc["units"].size() == ids.size(), "unit rows missing" );
        const float dx = backend::map::s_consts.tile.scale.x * ( 2.0f / 16.0f - .5f );
        const float dy = ( backend::map::s_consts.tile.scale.y * backend::map::s_consts.sprite.y_scale ) * ( 6.0f / 24.0f - .5f );
        std::set< std::pair< std::string, size_t > > claims;
        for ( size_t index = 0; index < ids.size(); ++index ) {
            const auto row = doc["units"][index];
            Require( row["manager_unit_id"].as< std::string >() == std::to_string( ids[index] ) && row["unit_id"].as< std::string >() == std::to_string( ids[index] ), "native entity join differs" );
            Require( row["unit_available"].as< bool >() && row["owner_supported"].as< bool >() && row["owner_id"].as< std::string >() == std::to_string( owners[index] ), "actual owner-badge lookup differs" );
            Require( row["definition_id"].as< std::string >() == "CensusSynthetic", "retained definition differs" );
            Require( row["resource_available"].as< bool >(), "actual cached body resource missing" );
            Require( row["unit_shown"].as< bool >() == shown[index] && row["actor_visible"].as< bool >(), "native Show/Hide/body visibility differs" );
            Vec( row["unit_render_coords"], positions[index] );
            const auto resource = row["resource"];
            Require( resource["key"].as< std::string >() == Key( index ), "retained morale cache key differs" );
            Require( resource["name"].as< std::string >() == "Unit_CensusSynthetic_" + std::to_string( morales[index] ), "native resource name differs" );
            Require( resource["texture_filename_supported"].as< bool >() && resource["texture_filename"].as< std::string >() == "memory:census-\"body", "actual synthetic texture metadata/escaping differs" );
            Require( resource["atlas"]["x"].as< size_t >() == 4 + 8 * morales[index] && resource["atlas"]["y"].as< size_t >() == 8 && resource["atlas"]["width"].as< size_t >() == 16 && resource["atlas"]["height"].as< size_t >() == 24, "native atlas metadata differs" );
            Float( resource["destination_offsets"]["x"], dx ); Float( resource["destination_offsets"]["y"], dy );
            Require( row["instance_id"].as< std::string >() == std::to_string( instance_ids[index] ), "actual allocated instance ID differs" );
            Require( row["instance_state"].as< std::string >() == ( shown[index] ? "present" : "absent" ), "real instance membership differs" );
            const auto* native_sprite = units->m_unitdefs.at( "CensusSynthetic" )->GetCachedSpriteForObservation( morales[index] );
            Require( native_sprite && native_sprite->instanced_sprite, "copy lost retained cached native source" );
            auto* native_actor = native_sprite->instanced_sprite->actor;
            Require( native_actor->HasInstance( instance_ids[index] ) == shown[index], "independent actor membership differs" );
            if ( shown[index] ) {
                const types::Vec3 normalized{ positions[index].x + dx, positions[index].y + dy, positions[index].z };
                Vec( row["instance_position"], normalized ); Vec( row["instance_angle"], {} );
                Require( claims.emplace( Key( index ), instance_ids[index] ).second, "duplicate body resource/instance claim" );
            } else {
                Require( !row["instance_position"] && !row["instance_angle"], "absent instance has invented coordinates" );
            }
        }
        Require( doc["instance_counts"].size() == 2, "native resource count inventory differs" );
        for ( const auto& row : doc["instance_counts"] ) {
            const auto key = row["resource_key"].as< std::string >();
            const size_t count = key == Key( 0 ) ? size_t( shown[0] ) + size_t( shown[2] ) : size_t( shown[1] );
            Require( key == Key( 0 ) || key == Key( 1 ), "unexpected resource inventory" );
            Require( row["before"].as< std::string >() == std::to_string( count ) && row["after"].as< std::string >() == std::to_string( count ), "copy mutated actual instance map" );
        }
        ++complete_copies;
    }

    void InstallBodies() {
        // Real constructors and ownership; only in-memory source textures and
        // lifecycle links are supplied, because Null test loaders have no assets.
        body_texture = std::make_unique< types::texture::Texture >( "memory:census-\"body", 128, 96 );
        badge_texture = std::make_unique< types::texture::Texture >( "memory:census-badges", 256, 128 );
        body_texture->Fill( 0, 0, 127, 95, types::Color( .25f, .5f, .75f, 1.0f ) );
        badge_texture->Fill( 0, 0, 255, 127, types::Color( 1.0f, 0.0f, 0.0f, 1.0f ) );
        frontend_game = std::make_unique< frontend::Game >( application.get(), state, application->m_ui, [](){}, [](){} );
        world_scene = std::make_unique< scene::Scene >( "CensusSynthetic", scene::SCENE_TYPE_WORLD );
        sprites = std::make_unique< frontend::sprite::InstancedSpriteManager >( world_scene.get() );
        frontend_game->m_ism = sprites.get();
        units = std::make_unique< frontend::unit::UnitManager >( frontend_game.get() );
        frontend_game->m_um = units.get();
        frontend_game->m_world_scene = world_scene.get();
        frontend_game->m_game = &backend_game;
        // These are the two declared source inputs, not synthetic lookup results.
        units->m_badge_defs->m_badges_texture = badge_texture.get();
        backend::unit::StaticDef definition( "CensusSynthetic", nullptr, "Synthetic census body", backend::unit::MT_LAND, 1.0f,
            new backend::unit::SpriteRender( "memory:unused-file", 4, 8, 16, 24, 6, 14, 8 ) );
        units->DefineUnit( &definition );
        units->m_unitdefs.at( "CensusSynthetic" )->static_.render.texture = body_texture.get();
        for ( size_t index = 0; index < factions.size(); ++index ) {
            faction_defs[index] = std::make_unique< backend::faction::Faction >( "CENSUS" + std::to_string( index ), "Synthetic owner" );
            faction_defs[index]->m_colors.border = types::Color( .2f + .3f * index, .4f, .6f );
            factions[index] = std::make_unique< frontend::faction::Faction >( faction_defs[index].get(), sprites.get() );
            slots[index] = std::make_unique< frontend::Slot >( index, factions[index].get() );
            units->DefineSlotBadges( index, factions[index].get() );
        }
        for ( size_t index = 0; index < actors.size(); ++index ) {
            tiles[index] = std::make_unique< frontend::tile::Tile >( types::Vec2< size_t >{ 2 + 2 * index, 2 } );
            auto actor = std::make_unique< frontend::unit::Unit >( units.get(), units->m_badge_defs, ids[index], units->m_unitdefs.at( "CensusSynthetic" ),
                slots[owners[index]].get(), tiles[index].get(), positions[index], owners[index] == 0, 1.0f, morales[index], "Synthetic morale", 1.0f, backend::unit::order_t::NO_ORDERS );
            actors[index] = actor.get();
            units->m_units.emplace( ids[index], actor.get() );
            actor.release(); // ownership transferred to actual manager destructor
        }
        actors[1]->Hide(); // allocated ID remains while real actor membership disappears
        frontend_game->m_is_initialized = true;
        application->m_game = frontend_game.get();
    }

    void Run() {
        application = std::make_unique< GLSMAC >(); // normal registration, not RunMain/start_game
        // Public Start supplies the real eager Random wrapper prerequisite.
        // Its inherited Module::Start is empty: no scheduler/thread/MT_Init or
        // backend world is supplied, and no reverse State linkage is claimed.
        backend_game.Start(); backend_started = true;
        different_game.Start(); different_started = true;
        Require( backend_game.GetRandom() && different_game.GetRandom(), "native backend wrapper RNG prerequisite missing" );
        Owner( [ & ]( GSE_CALLABLE ) {
            Require( gc_space->IsOwnerThread(), "binding setup is not on application GC owner" );
            Require( g_engine->GetGame() == nullptr, "fixture requires the existing asset-free GSE test engine" );
            Require( !application->m_state && !application->m_game, "unexpected live application context" );
            state = new CensusFixtureState( gc_space, ctx, application.get() );
            application->m_state = state;
            state->SetGame( &backend_game );
            application->m_wrapobj = application->Wrap( GSE_CALL );
            Require( static_cast< value::Object* >( application->m_wrapobj )->Get( "game" )->type == VT_UNDEFINED,
                "missing engine backend was not represented as unavailable in the real wrapper" );
            auto* property = static_cast< value::Object* >( application->m_wrapobj )->Get( "get_unit_body_census" );
            Require( property && property->type == VT_CALLABLE, "production wrapped property not registered" );
            binding = static_cast< value::Callable* >( property );
            auto* actual_game = backend_game.Wrap( GSE_CALL );
            auto* actual_different = different_game.Wrap( GSE_CALL );
            Require( actual_game->type == VT_OBJECT && actual_different->type == VT_OBJECT, "actual backend wrappers are missing" );
            game_value = static_cast< value::Object* >( actual_game );
            different_value = static_cast< value::Object* >( actual_different );
            state->Persist( game_value ); state->Persist( different_value );
            Invalid( GSE_CALL, {}, "Expected 1 arguments" );
            Invalid( GSE_CALL, { game_value, game_value }, "Expected 1 arguments" );
            Invalid( GSE_CALL, { VALUE( value::Int,, 1 ) }, "expected to be Object" );
            Invalid( GSE_CALL, { VALUE( value::Bool,, true ) }, "expected to be Object" );
            Invalid( GSE_CALL, { VALUE( value::Float,, .5f ) }, "expected to be Object" );
            Invalid( GSE_CALL, { VALUE( value::String,, "not a Game" ) }, "expected to be Object" );
            Invalid( GSE_CALL, { VALUE( value::Null ) }, "expected to be Object" );
            Invalid( GSE_CALL, { VALUE( value::Undefined ) }, "expected to be Object" );
            Invalid( GSE_CALL, { VALUE( value::Array,, value::array_elements_t{} ) }, "expected to be Object" );
            Invalid( GSE_CALL, { VALUEEXT( value::Object, GSE_CALL, value::object_properties_t{} ) }, "object of class" );
            Invalid( GSE_CALL, { application->m_wrapobj }, "object of class" );
            const auto unavailable = YAML::Load( Read( GSE_CALL, game_value ) );
            Require( !unavailable["complete"].as< bool >() && unavailable["reason"].as< std::string >() == "frontend-unavailable", "unavailable negative changed" );
            InstallBodies();
            const auto other = YAML::Load( Read( GSE_CALL, different_value ) );
            Require( !other["complete"].as< bool >() && other["reason"].as< std::string >() == "different-current-game", "different native Game accepted" );
        } );
        // Explicit real collector boundary. The state roots its separately owned
        // backend and retained wrapper values, even though engine.GetGame is null.
        Require( !application->m_gc_space->IsAccumulating(), "collector requested during owner accumulation" );
        g_engine->GetGC()->Iterate();
        Owner( [ & ]( GSE_CALLABLE ) {
            std::unordered_set< gc::Object* > reachable;
            application->GetReachableObjects( reachable );
            Require( state->GetGame() == &backend_game && reachable.count( &backend_game ) == 1 && reachable.count( game_value ) == 1 && reachable.count( different_value ) == 1, "real State lost backend/wrapper reachability" );
            const auto actual_cache = CachedSources();
            Require( actual_cache.size() == 2, "fixture did not create both actual morale resources" );
            const auto baseline = Read( GSE_CALL, game_value );
            CheckCopy( baseline, { true, false, true } );
            const auto repeated = Read( GSE_CALL, game_value );
            CheckCopy( repeated, { true, false, true } );
            Require( baseline == repeated, "read-only repeated census changed bytes" );
            Require( CachedSources() == actual_cache, "reads mutated native cache entries/next-instance IDs" );
            actors[1]->Show(); actors[0]->Hide();
            CheckCopy( Read( GSE_CALL, game_value ), { false, true, true } );
            actors[0]->Show(); actors[1]->Hide();
            const auto restored = Read( GSE_CALL, game_value );
            CheckCopy( restored, { true, false, true } );
            Require( restored == baseline, "actual Show/Hide failed to restore body maps" );
            // A genuine native-copy failure remains the unavailable fallback;
            // this does not suppress GSE argument errors tested above.
            auto* actor = actors[0]->GetSprite()->instanced_sprite->actor;
            {
                util::FinallyGuard restore( [ & ]() { actor->SetInstance( instance_ids[0], positions[0] ); } );
                actor->SetInstance( instance_ids[0], { std::numeric_limits< float >::quiet_NaN(), 0.0f, 0.0f } );
                const auto failed_copy = YAML::Load( Read( GSE_CALL, game_value ) );
                Require( !failed_copy["complete"].as< bool >() && failed_copy["reason"].as< std::string >() == "observation-copy-unavailable", "genuine native copy exception lost fallback" );
            }
            const auto after_failure = Read( GSE_CALL, game_value );
            CheckCopy( after_failure, { true, false, true } );
            Require( after_failure == baseline, "copy-error recovery changed real body state" );
            Require( CachedSources() == actual_cache, "lifecycle/read/error recovery mutated retained native cache" );
            Require( invalid_calls == 11 && complete_copies == 5 && calls == 19, "declared binding acceptance inventory differs" );
        } );
    }

    std::string Summary() const {
        return "UNIT_BODY_CENSUS_NATIVE|{\"binding_calls\":" + std::to_string( calls ) +
            ",\"invalid_calls\":" + std::to_string( invalid_calls ) + ",\"complete_copies\":" + std::to_string( complete_copies ) +
            ",\"owners\":2,\"units\":3,\"checks_including_retirement\":" + std::to_string( checks ) +
            ",\"synthetic_texture_inputs\":true,\"normal_startup\":false,\"gpu_pixels\":false}";
    }
};

std::string RunUnitBodyCensusFixture() {
    try {
        std::string summary;
        { UnitBodyCensusFixture fixture; fixture.Run(); fixture.Retire(); summary = fixture.Summary(); }
        // A receipt is emitted only after native and GSE/GC retirement returns.
        util::LogHelper::Println( summary );
    }
    catch ( const gse::Exception& error ) { return "Unit body census native fixture: " + error.ToString(); }
    catch ( const std::exception& error ) { return error.what(); }
    return {};
}
}
#endif
