#include "Test.h"

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
#include "gse/value/String.h"
#include "gse/tests/Tests.h"
#include "gse/ExecutionPointer.h"
#include "game/backend/Game.h"
#include "game/backend/technology/Bindings.h"
#include "game/backend/technology/Serialization.h"

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
	value::object_properties_t mocks = {
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
