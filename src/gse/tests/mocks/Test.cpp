#include "Test.h"
#include "ProductionFixture.h"
#include "AsyncFixture.h"
#include "InputFixture.h"
#include "gse/value/Array.h"

#include <unordered_map>
#include <chrono>
#include <memory>

#include "gse/context/GlobalContext.h"
#include "gse/callable/Native.h"
#include "gse/Exception.h"
#include "gse/value/Undefined.h"
#include "gse/value/Object.h"
#include "gse/value/Bool.h"
#include "gse/value/Int.h"
#include "gse/value/Float.h"
#include "gse/value/String.h"
#include "gse/tests/Tests.h"
#include "gse/ExecutionPointer.h"
#include "game/backend/Game.h"
#include "game/backend/settings/Settings.h"
#include "game/backend/technology/Bindings.h"
#include "game/backend/technology/Serialization.h"
#include "loader/txt/SmacTextLoader.h"

namespace gse {
namespace tests {
namespace mocks {

static std::unordered_map< std::string, Value* > s_global_map = {};

// Only lifecycle and write authorization are supplied by the fixture. All
// queries and definition validation execute the production bindings/rules.
struct RulesFixture {
	game::backend::Game game;
	RulesFixture() { game.Start(); }
	~RulesFixture() { game.Stop(); }
};

static Value* MakeRulesFixture( GSE_CALLABLE, const std::shared_ptr< RulesFixture >& fixture ) {
	value::object_properties_t properties = {
		{ "game", fixture->game.Wrap( GSE_CALL ) },
		{ "technologies", game::backend::technology::WrapTable( GSE_CALL, fixture->game.GetTechnologyTable() ) },
		{ "snapshot", NATIVE_CALL( fixture ) {
			N_EXPECT_ARGS( 0 );
			types::Buffer snapshot;
			game::backend::technology::SerializeTable( fixture->game.GetTechnologyTable(), snapshot );
			return VALUE( value::String,, snapshot.ToString() );
		} ) },
		{ "truncated_snapshot", NATIVE_CALL( fixture ) {
			N_EXPECT_ARGS( 0 );
			types::Buffer snapshot;
			game::backend::technology::SerializeTable( fixture->game.GetTechnologyTable(), snapshot );
			const auto bytes = snapshot.ToString();
			return VALUE( value::String,, bytes.substr( 0, bytes.size() - 1 ) );
		} ) },
		{ "out_of_range_snapshot", NATIVE_CALL() {
			N_EXPECT_ARGS( 0 );
			types::Buffer snapshot;
			snapshot.WriteInt( 1 );
			snapshot.WriteInt( game::backend::technology::Table::COUNT );
			// Valid header, invalid first prerequisite; the production
			// reader rejects this value before requesting another field.
			snapshot.WriteInt( game::backend::technology::Table::COUNT );
			return VALUE( value::String,, snapshot.ToString() );
		} ) },
		{ "restore", NATIVE_CALL( fixture ) {
			N_EXPECT_ARGS( 1 );
			N_GETVALUE( bytes, 0, String );
			try {
				types::Buffer snapshot( bytes );
				game::backend::technology::DeserializeTable( fixture->game.GetTechnologyTable(), snapshot );
			}
			catch ( const std::exception& error ) {
				GSE_ERROR( EC.INVALID_CALL, error.what() );
			}
			return VALUE( value::Undefined );
		} ) },
		{ "reset", NATIVE_CALL( fixture ) {
			N_EXPECT_ARGS( 0 );
			fixture->game.Stop();
			fixture->game.Start();
			return VALUE( value::Undefined );
		} ) },
	};
	return VALUE( value::Object,, ctx, si, ep, properties );
}

void Test::AddMocks( gc::Space* const gc_space, context::GlobalContext* ctx, const test_info_t& test_info ) {
	const auto rules_fixtures = std::make_shared< std::vector< std::shared_ptr< RulesFixture > > >();
	auto* production_roots = VALUE( value::Array,, value::array_elements_t{} );
	value::object_properties_t mocks = {
		{ "parse_smac_text", NATIVE_CALL() {
			N_EXPECT_ARGS( 2 ); N_GETVALUE( source, 0, String ); N_GETVALUE( format, 1, String );
			return ::loader::txt::ParseSmacText( GSE_CALL, source, format );
		} ) },
		{ "async_probe", NATIVE_CALL() { N_EXPECT_ARGS( 1 ); N_GETVALUE( kind, 0, String ); return ProbeAsyncTimers( GSE_CALL, kind ); } ) },
		{ "input_state", NATIVE_CALL() {
			N_EXPECT_ARGS_MIN_MAX( 1, 2 ); N_GETVALUE( initial_value, 0, String );
			int64_t max_length = 0;
			if ( arguments.size() > 1 ) { N_GETVALUE( length, 1, Int ); if ( length < 0 ) { GSE_ERROR( EC.INVALID_CALL, "Negative input maximum length" ); } max_length = length; }
			return MakeInputState( GSE_CALL, initial_value, max_length );
		} ) },
		{ "founding_fixture", NATIVE_CALL( production_roots ) {
			N_EXPECT_ARGS( 0 );
			auto* fixture = MakeProductionFixture( GSE_CALL, true );
			production_roots->value.push_back( fixture );
			return fixture;
		} ) },
		{ "selection_fixture", NATIVE_CALL( production_roots ) {
			N_EXPECT_ARGS_MIN_MAX( 0, 2 );
			std::string initial_base_name = "Fixture Base";
			if ( !arguments.empty() ) { N_GETVALUE( declared_name, 0, String ); initial_base_name = declared_name; }
			size_t fixture_map_size = 4;
			if ( arguments.size() > 1 ) {
				N_GETVALUE( declared_size, 1, Int );
				if ( declared_size < 4 || declared_size > 64 || declared_size % 2 != 0 ) { GSE_ERROR( EC.INVALID_CALL, "fixture map size must be even and between 4 and 64" ); }
				fixture_map_size = declared_size;
			}
			auto* fixture = MakeProductionFixture( GSE_CALL, false, true, initial_base_name, fixture_map_size );
			production_roots->value.push_back( fixture );
			return fixture;
		} ) },
		{ "production_fixture", NATIVE_CALL( production_roots ) {
			N_EXPECT_ARGS( 0 );
			auto* fixture = MakeProductionFixture( GSE_CALL );
			production_roots->value.push_back( fixture );
			return fixture;
		} ) },
		{ "world_startup_fixture", NATIVE_CALL( production_roots ) {
			N_EXPECT_ARGS( 2 ); N_GETVALUE( width, 0, Int ); N_GETVALUE( height, 1, Int );
			if ( width < 4 || width > 256 || height < 4 || height > 256 || width % 2 != 0 ) {
				GSE_ERROR( EC.INVALID_CALL, "Startup grid requires an even width and dimensions from 4 through 256" );
			}
			auto* fixture = MakeWorldStartupFixture( GSE_CALL, width, height );
			production_roots->value.push_back( fixture );
			return fixture;
		} ) },
		{ "natural_startup_fixture", NATIVE_CALL( production_roots ) {
			N_EXPECT_ARGS( 3 ); N_GETVALUE( width, 0, Int ); N_GETVALUE( height, 1, Int ); N_GETVALUE( terrain, 2, String );
			if ( width < 4 || width > 256 || height < 4 || height > 256 || width % 2 != 0 ||
				( terrain != "flat-arid" && terrain != "flat-moist" && terrain != "flat-rainy" ) ) {
				GSE_ERROR( EC.INVALID_CALL, "Invalid declared natural-startup grid or terrain" );
			}
			auto* fixture = MakeNaturalStartupFixture( GSE_CALL, width, height, terrain );
			production_roots->value.push_back( fixture );
			return fixture;
		} ) },
		{
			"default_map_settings",
			NATIVE_CALL() {
				N_EXPECT_ARGS( 0 );
				// Read the production constructor, rather than supplying synthetic
				// menu preferences. Copy scalars so no wrapper outlives this object.
				const game::backend::settings::MapSettings map;
				const value::object_properties_t properties = {
					{ "size_x", VALUE( value::Int,, map.size_x ) },
					{ "size_y", VALUE( value::Int,, map.size_y ) },
					{ "ocean_coverage", VALUE( value::Float,, map.ocean_coverage ) },
					{ "erosive_forces", VALUE( value::Float,, map.erosive_forces ) },
					{ "native_lifeforms", VALUE( value::Float,, map.native_lifeforms ) },
					{ "cloud_cover", VALUE( value::Float,, map.cloud_cover ) },
				};
				return VALUE( value::Object,, ctx, si, ep, properties );
			} )
		},
		{
			"default_world_sizes", NATIVE_CALL() {
				N_EXPECT_ARGS( 0 );
				const game::backend::rules::Default rules;
				return rules.WrapWorldSizes( GSE_CALL );
			} )
		},
		{
			"rules_fixture",
			NATIVE_CALL( rules_fixtures ) {
				N_EXPECT_ARGS( 0 );
				const auto fixture = std::make_shared< RulesFixture >();
				rules_fixtures->push_back( fixture );
				return MakeRulesFixture( GSE_CALL, fixture );
			} )
		},
		{
			"assert",
			NATIVE_CALL() {
				if ( arguments.size() < 1 ) {
					GSE_ERROR( EC.INVALID_CALL, "Condition to test.assert is missing" );
				}
				if ( arguments.size() > 2 ) {
					GSE_ERROR( EC.INVALID_CALL, "Expected 1 or 2 arguments to test.assert, found: " + std::to_string( arguments.size() ) );
				}
				const auto& condition = arguments.at( 0 );
				if ( condition->type != VT_BOOL ) {
					GSE_ERROR( EC.INVALID_CALL, "Condition to test.assert is not boolean: " + condition->ToString() );
				}
				if ( !( (value::Bool*)condition )->value ) {
					std::string reason = "";
					if ( arguments.size() == 2 ) {
						const auto& reasonv = arguments.at( 1 );
						ASSERT( reasonv->type == VT_STRING, "test.assert reason is not string: " + reasonv->ToString() );
						reason = ( (value::String*)reasonv )->value;
					}
					GSE_ERROR( "TestError", "Assertion failed: " + reason );
				}
				return VALUE( value::Undefined );
			} )
		},
		{
			"get_script_path",
			NATIVE_CALL( test_info ) {
				return VALUE( value::String,, test_info.script_path );
			} )
		},
		{
			"get_current_time_nano",
			NATIVE_CALL() {

				return VALUE( value::Int,, std::chrono::time_point_cast< std::chrono::nanoseconds >( std::chrono::system_clock::now() ).time_since_epoch().count() );
			} )
		},
		{
			"global_get",
			NATIVE_CALL() {
				N_EXPECT_ARGS( 1 );
				N_GETVALUE( key, 0, String );
				const auto& it = s_global_map.find( key );
				if ( it != s_global_map.end() ) {
					return it->second;
				}
				else {
					return VALUE( value::Undefined );
				}
			} )
		},
		{
			"global_set",
			NATIVE_CALL() {
				N_EXPECT_ARGS( 2 );
				N_GETVALUE( key, 0, String );
				N_GET_ANY( value, 1 );
				s_global_map.insert_or_assign( key, value );
				return VALUE( value::Undefined );
			} )
		},
	};
	{
		ExecutionPointer ep;
		ctx->CreateConst( "__production_fixture_lifetimes", production_roots, {}, ep );
		// Native callbacks retain their context. Pin fixture ownership there too,
		// so detached production table callbacks cannot outlive their Game.
		ctx->CreateConst( "__rules_fixture_lifetimes", NATIVE_CALL( rules_fixtures ) {
			( void )rules_fixtures;
			return VALUE( value::Undefined );
		} ), {}, ep );
		ctx->CreateVariable( "test", VALUE( value::Object,, ctx, {}, ep, mocks ), {}, ep );
	}
}

}
}
}
