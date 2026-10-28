#include "GSE.h"
#if defined( DEBUG ) || defined( FASTDEBUG )
#include "mocks/UnitBodyCensusFixture.h"
#endif

#include "task/gsetests/GSETests.h"
#include "gse/GSE.h"
#include "gse/value/Null.h"
#include "gse/value/Bool.h"
#include "gse/value/Int.h"
#include "gse/value/String.h"
#include "gse/value/Object.h"
#include "gse/value/Callable.h"
#include "gse/ExecutionPointer.h"
#include "gc/Space.h"
#include "gc/GC.h"
#include "engine/Engine.h"
#include "config/Config.h"
#include "game/backend/settings/Settings.h"
#include "game/backend/faction/Faction.h"
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <exception>
#include <mutex>
#include <stdexcept>
#include <thread>

namespace gse {
namespace tests {

void AddGSETests( task::gsetests::GSETests* task ) {
#if defined( DEBUG ) || defined( FASTDEBUG )
	task->AddTest(
		"Unit body census production binding validates calls and copies real cached native instances",
		GT() { return mocks::RunUnitBodyCensusFixture(); }
	);
#endif
	task->AddTest(
		"Faction instances preserve complete templates without sharing mutable identity",
		GT() {
			game::backend::faction::Faction source( "CLONE", "Original Guild" );
			source.SetIdentity( { "Original Pilot", "Original Guild", "Originals", "Orbital", "Navigator", "brisk" } );
			source.m_flags = game::backend::faction::Faction::FF_NAVAL | game::backend::faction::Faction::FF_PROGENITOR;
			source.m_colors.text = types::Color( 0.2f, 0.4f, 0.6f );
			source.m_base_names.land = { "Land City" }; source.m_base_names.water = { "Water City" };
			source.m_bases_render.file = "original.pcx"; source.m_bases_render.grid_x = 3;
			source.SetSocialRatings( 2, -1 ); source.SetStartingTechnologies( { "Ecology", "Biogen" } );
			const auto original = source.Serialize().ToString();
			auto copy = source.Clone();
			GT_ASSERT( copy.get() != &source && copy->Serialize().ToString() == original, "clone changed canonical metadata, colors, rendering, ratings or technologies" );
			GT_ASSERT( copy->m_flags == source.m_flags && copy->m_base_names.land == source.m_base_names.land && copy->m_base_names.water == source.m_base_names.water, "clone lost fields absent from the persistence codec" );
			auto identity = copy->GetIdentity(); identity[ 0 ] = "Changed human"; copy->SetIdentity( identity );
			copy->m_base_names.land[ 0 ] = "Changed city"; copy->m_flags = 0; copy->SetStartingTechnologies( { "Changed" } );
			GT_ASSERT( source.Serialize().ToString() == original && source.m_base_names.land[ 0 ] == "Land City" && source.m_flags != 0, "instance changes leaked to its source template" );
			GT_OK();
		}
	);
	task->AddTest(
		"Custom world generation normalizes each minimum axis without changing editable setup",
		GT() {
			// Independent original controls are frozen under
			// tools/behavior-tests/state_trace/setup-controls/contract-v1.md.
			game::backend::settings::MapSettings map;
			map.preset_level = game::backend::settings::MapSettings::CUSTOM_SIZE;
			for ( const auto& sample : std::vector< std::vector< int64_t > >{ { 4, 2, 32, 16 }, { 4, 32, 32, 32 }, { 64, 2, 64, 16 }, { 32, 16, 32, 16 } } ) {
				map.size_x = sample[ 0 ]; map.size_y = sample[ 1 ];
				const auto actual = map.GetGenerationDimensions();
				GT_ASSERT( actual.first == sample[ 2 ] && actual.second == sample[ 3 ], "generated custom dimensions differ from recorded startup" );
				GT_ASSERT( map.size_x == sample[ 0 ] && map.size_y == sample[ 1 ] && map.preset_level == 99, "normalization changed editable settings or custom kind" );
			}
			map.size_x = 4; map.size_y = 2; map.preset_level = 2;
			GT_ASSERT( map.GetGenerationDimensions() == std::make_pair( int64_t( 4 ), int64_t( 2 ) ), "named or declared dimensions were normalized as custom input" );
			map.preset_level = 99; map.type = game::backend::settings::MapSettings::MT_MAPFILE;
			GT_ASSERT( map.GetGenerationDimensions() == std::make_pair( int64_t( 4 ), int64_t( 2 ) ), "loaded map dimensions were normalized as generated input" );
			GT_OK();
		}
	);

	task->AddTest(
		"Queued accumulations retain both callback owner and detached script context",
		GT() {
			class Root : public gc::Object {
			public:
				Root() : gc::Object( nullptr ) {}
				gc::Object* owner = nullptr; gc::Object* context = nullptr;
				void GetReachableObjects( std::unordered_set< gc::Object* >& objects ) override {
					gc::Object::GetReachableObjects( objects );
					if ( owner ) { owner->GetReachableObjects( objects ); }
					if ( context ) { context->GetReachableObjects( objects ); }
				}
			} root;
			std::atomic< int > destroyed = 0;
			class Tracked : public gc::Object {
			public:
				Tracked( gc::Space* space, std::atomic< int >& destroyed ) : gc::Object( space ), destroyed( destroyed ) {}
				~Tracked() override { ++destroyed; }
			private:
				std::atomic< int >& destroyed;
			};
			gc::Space space( &root );
			space.SetThreadId( std::this_thread::get_id() );
			Tracked* owner = nullptr;
			Tracked* context = nullptr;
			space.Accumulate( &root, [ & ](){ owner = new Tracked( &space, destroyed ); root.owner = owner; context = new Tracked( &space, destroyed ); root.context = context; } );
			bool delivered = false;
			std::thread producer( [ & ](){
				space.Accumulate( owner, [ & ](){ delivered = true; }, nullptr, false, context );
			} );
			producer.join();
			space.Accumulate( &root, [ & ](){ root.owner = nullptr; root.context = nullptr; } );
			// Neither object is otherwise rooted. Collection before UI delivery
			// must preserve both independently of the live game's State pointer.
			g_engine->GetGC()->Iterate();
			GT_ASSERT( destroyed == 0, "pending callback lost an owner or context root" );
			GT_ASSERT( !delivered, "producer executed a UI-thread callback" );
			space.ProcessAccumulations();
			GT_ASSERT( delivered, "queued callback was not delivered" );
			g_engine->GetGC()->Iterate();
			GT_ASSERT( destroyed == 2, "completed callback leaked its lifetime roots" );
			GT_OK();
		}
	);

	// A single-thread launch has no concurrent collector/producer contract.
	// Do not register or count that unsupported concurrency test in that mode.
	if ( !g_engine->GetConfig()->HasLaunchFlag( config::Config::LF_SINGLE_THREAD ) ) {
		task->AddTest(
			"Concurrent collection leaves queued producers runnable during owner accumulation",
			GT() {
				class Root : public gc::Object {
				public:
					Root() : gc::Object( nullptr ) {}
					gc::Object* owner = nullptr; gc::Object* context = nullptr;
					void GetReachableObjects( std::unordered_set< gc::Object* >& objects ) override {
						gc::Object::GetReachableObjects( objects );
						if ( owner ) { owner->GetReachableObjects( objects ); }
						if ( context ) { context->GetReachableObjects( objects ); }
					}
				} root;
				std::atomic< int > destroyed = 0, delivered = 0, cleaned = 0;
				std::atomic< bool > delivered_on_owner = false;
				class Tracked : public gc::Object {
				public:
					Tracked( gc::Space* space, std::atomic< int >& count ) : gc::Object( space ), count( count ) {}
					~Tracked() override { ++count; }
				private:
					std::atomic< int >& count;
				};
				gc::Space space( &root ); space.SetThreadId( std::this_thread::get_id() );
				Tracked* owner = nullptr; Tracked* context = nullptr;
				space.Accumulate( &root, [ & ]() {
					owner = new Tracked( &space, destroyed ); root.owner = owner;
					context = new Tracked( &space, destroyed ); root.context = context;
				} );
				std::mutex progress_mutex;
				std::condition_variable progress;
				bool collector_entered = false, collector_done = false, producer_done = false;
				bool both_finished_inside_owner = false;
				std::exception_ptr owner_error, collector_error, producer_error;
				std::thread collector, producer;
				try {
					space.Accumulate( &root, [ & ]() {
						// These are real collector/producer calls. No private lock model,
						// polling sleep, disabled GC or owner-thread callback substitute.
						collector = std::thread( [ & ]() {
							{ std::lock_guard guard( progress_mutex ); collector_entered = true; }
							progress.notify_all();
							try { g_engine->GetGC()->Iterate(); } catch ( ... ) { collector_error = std::current_exception(); }
							{ std::lock_guard guard( progress_mutex ); collector_done = true; }
							progress.notify_all();
						} );
						{
							std::unique_lock guard( progress_mutex );
							if ( !progress.wait_for( guard, std::chrono::seconds( 2 ), [ & ]() { return collector_entered; } ) ) { return; }
						}
						producer = std::thread( [ & ]() {
							try {
								space.Accumulate( owner, [ & ]() { ++delivered; delivered_on_owner = space.IsOwnerThread(); },
									[ & ]() { ++cleaned; }, false, context );
							} catch ( ... ) { producer_error = std::current_exception(); }
							{ std::lock_guard guard( progress_mutex ); producer_done = true; }
							progress.notify_all();
						} );
						std::unique_lock guard( progress_mutex );
						both_finished_inside_owner = progress.wait_for( guard, std::chrono::seconds( 2 ), [ & ]() {
							return collector_done && producer_done;
						} );
					} );
				} catch ( ... ) { owner_error = std::current_exception(); }
				// Even the old implementation must leave the owner accumulation
				// before either join. Its expected regression failure is finite.
				if ( collector.joinable() ) { collector.join(); }
				if ( producer.joinable() ) { producer.join(); }
				const bool no_early_delivery = delivered == 0 && cleaned == 0;
				space.Accumulate( &root, [ & ]() { root.owner = nullptr; root.context = nullptr; } );
				g_engine->GetGC()->Iterate();
				const bool pending_roots_retained = destroyed == 0;
				space.ProcessAccumulations();
				g_engine->GetGC()->Iterate();
				// Assert only after threads and pending cleanup have settled. Root
				// references stay live until both threads join, including old-red.
				GT_ASSERT( !owner_error && !collector_error && !producer_error, "Concurrent GC progress probe raised an exception" );
				GT_ASSERT( no_early_delivery && pending_roots_retained, "Concurrent probe executed off-owner or lost pending lifetime roots" );
				GT_ASSERT( delivered == 1 && cleaned == 1 && delivered_on_owner, "Concurrent probe lost, duplicated or mis-threaded a callback/cleanup" );
				GT_ASSERT( destroyed == 2, "Delivered concurrent callback retained its owner/context or destroyed them twice" );
				GT_ASSERT( both_finished_inside_owner, "Collector or queued producer blocked until owner accumulation ended" );
				GT_OK();
			}
		);
	}

	task->AddTest(
		"GC batch sweep preserves shared cyclic roots and destroys released objects exactly once",
		GT() {
			class Tracked : public gc::Object {
			public:
				Tracked( gc::Space* space, std::atomic< int >& destroyed ) : gc::Object( space ), destroyed( destroyed ) {}
				~Tracked() override { ++destroyed; }
				Tracked* next = nullptr;
				void GetReachableObjects( std::unordered_set< gc::Object* >& reachable_objects ) override {
					gc::Object::GetReachableObjects( reachable_objects );
					if ( next ) { GC_REACHABLE( next ); }
				}
			private:
				std::atomic< int >& destroyed;
			};
			class Root : public gc::Object {
			public:
				Root() : gc::Object( nullptr ) {}
				Tracked* first = nullptr; Tracked* shared = nullptr;
				void GetReachableObjects( std::unordered_set< gc::Object* >& reachable_objects ) override {
					gc::Object::GetReachableObjects( reachable_objects );
					if ( first ) { GC_REACHABLE( first ); }
					if ( shared ) { GC_REACHABLE( shared ); }
				}
			} root;
			std::atomic< int > discarded = 0; std::atomic< int > retained = 0;
			gc::Space space( &root ); space.SetThreadId( std::this_thread::get_id() );
			space.Accumulate( &root, [ & ]() {
				Tracked* first = nullptr; Tracked* previous = nullptr;
				for ( size_t i = 0; i < 1024; ++i ) {
					auto* current = new Tracked( &space, discarded );
					if ( previous ) { previous->next = current; } else { first = current; }
					previous = current;
				}
				previous->next = first;
				previous = nullptr;
				for ( size_t i = 0; i < 32; ++i ) {
					auto* current = new Tracked( &space, retained );
					if ( previous ) { previous->next = current; } else { root.first = current; }
					previous = current;
					if ( i == 16 ) { root.shared = current; }
				}
				previous->next = root.first;
			} );
			g_engine->GetGC()->Iterate();
			GT_ASSERT( discarded == 1024 && retained == 0, "batch sweep lost a shared cyclic root or retained unreachable allocations" );
			// Commit a second, nested batch into a space that already retains
			// live registrations. Both accumulation levels must preserve them.
			space.Accumulate( &root, [ & ]() {
				new Tracked( &space, discarded );
				space.Accumulate( &root, [ & ]() {
					for ( size_t i = 0; i < 63; ++i ) { new Tracked( &space, discarded ); }
				} );
			} );
			GT_ASSERT( discarded == 1024 && retained == 0, "accumulation destroyed existing registrations" );
			g_engine->GetGC()->Iterate();
			GT_ASSERT( discarded == 1088 && retained == 0, "nested batch registration lost live objects or leaked unreachable objects" );
			space.Accumulate( &root, [ & ]() { root.first = nullptr; } );
			g_engine->GetGC()->Iterate();
			GT_ASSERT( discarded == 1088 && retained == 0, "one remaining root did not preserve its complete cycle" );
			space.Accumulate( &root, [ & ]() { root.shared = nullptr; } );
			g_engine->GetGC()->Iterate();
			g_engine->GetGC()->Iterate();
			GT_ASSERT( discarded == 1088 && retained == 32, "released batch was leaked or destroyed more than once" );
			GT_OK();
		}
	);

	task->AddTest(
		"GC accumulation recovers from native and non-standard exceptions",
		GT() {
			class Root : public gc::Object {
			public:
				Root() : gc::Object( nullptr ) {}
				gc::Object* kept = nullptr;
				void GetReachableObjects( std::unordered_set< gc::Object* >& reachable_objects ) override {
					gc::Object::GetReachableObjects( reachable_objects );
					if ( kept ) { GC_REACHABLE( kept ); }
				}
			} root;
			class Tracked : public gc::Object {
			public:
				Tracked( gc::Space* space, std::atomic< int >& destroyed ) : gc::Object( space ), destroyed( destroyed ) {}
				~Tracked() override { destroyed++; }
			private:
				std::atomic< int >& destroyed;
			};
			std::atomic< int > destroyed = 0;
			gc::Space space( &root );
			space.SetThreadId( std::this_thread::get_id() );
			for ( int phase = 0; phase < 2; phase++ ) {
				bool propagated = false;
				try {
					space.Accumulate( &root, [ & ]() {
						new Tracked( &space, destroyed );
						space.Accumulate( &root, [ & ]() {
							root.kept = new Tracked( &space, destroyed );
							if ( phase == 0 ) { throw std::runtime_error( "native failure" ); }
							throw 73;
						} );
					} );
				}
				catch ( const std::runtime_error& error ) { propagated = phase == 0 && std::string( error.what() ) == "native failure"; }
				catch ( int error ) { propagated = phase == 1 && error == 73; }
				GT_ASSERT( propagated, "exception payload changed" );
				GT_ASSERT( !space.IsAccumulating(), "failed callback left accumulation active" );
				// Force real collection at each boundary; no timer or allocation-pressure assumptions.
				g_engine->GetGC()->Iterate();
				GT_ASSERT( destroyed.load() == phase * 2 + 1, "failed callback's unreachable allocation was not collected" );
				space.Accumulate( &root, [ & ]() { root.kept = nullptr; } );
				g_engine->GetGC()->Iterate();
				GT_ASSERT( destroyed.load() == phase * 2 + 2, "later accumulation failed to release the retained allocation" );
			}
			GT_OK();
		}
	);

	class Sum : public value::Callable {
	public:
		Sum( gc::Space* const gc_space, context::Context* const ctx )
			: value::Callable( gc_space, ctx ) {}
		Value* Run( GSE_CALLABLE, const value::function_arguments_t& arguments ) override {
			int64_t result = 0;
			for ( const auto& it : arguments ) {
				const auto arg = it;
				switch ( arg->type ) {
					case VT_INT: {
						result += ( (value::Int*)arg )->value;
						break;
					}
					default: {
						// TODO: exception
					}
				}
			}
			return VALUE( value::Int, , result );
		}
	};

	task->AddTest(
		"test if modules get assigned and run correctly",
		GT() {
			auto* gc_space = gse->GetGCSpace();

			static std::string modules_run_order = "";

			class TestModuleY : public value::Callable {
			public:
				TestModuleY( gc::Space* const gc_space, context::Context* const ctx )
					: Callable( gc_space, ctx ) {}
				Value* Run( GSE_CALLABLE, const value::function_arguments_t& arguments ) override {
					modules_run_order += 'Y';
					return VALUE( value::Null );
				}
			};
			gc_space->Accumulate(
				nullptr,
				[ &gc_space, &ctx, &gse ]() {
					NEWV( test_module_y, TestModuleY, gc_space, ctx );
					gse->AddModule( "test_module_y", test_module_y );
				}
			);

			class TestModuleX : public value::Callable {
			public:
				TestModuleX( gc::Space* const gc_space, context::Context* const ctx )
					: Callable( gc_space, ctx ) {}
				Value* Run( GSE_CALLABLE, const value::function_arguments_t& arguments ) override {
					modules_run_order += 'X';
					return VALUE( value::Null );
				}
			};
			gc_space->Accumulate(
				nullptr,
				[ &gc_space, &ctx, &gse ]() {
					NEWV( test_module_x, TestModuleX, gc_space, ctx );
					gse->AddModule( "test_module_x", test_module_x );
				}
			);

			gse->Run();

			GT_ASSERT( modules_run_order == "YX", "wrong modules order" );

			GT_OK();
		}
	);

	task->AddTest(
		"test if variables are written and read correctly",
		GT() {
			auto* gc_space = gse->GetGCSpace();

			class SetVariables : public value::Callable {
			public:
				SetVariables( gc::Space* const gc_space, GSE* gse, context::Context* const ctx )
					: value::Callable( gc_space, ctx )
					, gse( gse ) {}
				GSE* gse;
				Value* Run( GSE_CALLABLE, const value::function_arguments_t& arguments ) override {
					gse->SetGlobal( "testvar_null", VALUE( value::Null ) );
					gse->SetGlobal( "testvar_bool_first", VALUE( value::Bool, , true ) );
					gse->SetGlobal( "testvar_bool_second", VALUE( value::Bool, , false ) );
					gse->SetGlobal( "testvar_int_first", VALUE( value::Int, , 3 ) );
					gse->SetGlobal( "testvar_int_second", VALUE( value::Int, , 7 ) );
					gse->SetGlobal( "testvar_int_third", VALUE( value::Int, , 25 ) );
					gse->SetGlobal( "testvar_string_first", VALUE( value::String, , "FIRST" ) );
					gse->SetGlobal( "testvar_string_second", VALUE( value::String, , "SECOND" ) );

					return VALUE( value::Null );
				}
			};
			gc_space->Accumulate(
				nullptr,
				[ &gc_space, &ctx, &gse ]() {
					NEWV( set_variables, SetVariables, gc_space, gse, ctx );
					gse->AddModule( "set_variables", set_variables );
				}
			);

			static std::string errmsg = "";
			class CheckVariables : public value::Callable {
			public:
				CheckVariables( gc::Space* const gc_space, GSE* gse, context::Context* const ctx )
					: value::Callable( gc_space, ctx )
					, gse( gse ) {}
				GSE* gse;
				Value* Run( GSE_CALLABLE, const value::function_arguments_t& arguments ) override {
					const auto validate = [ this ]() -> const std::string {
						Value* t;

#define CHECK( _varname, _expected_type ) \
                        t = gse->GetGlobal( _varname ); \
                        GT_ASSERT( t->type == _expected_type, "unexpected value type" );
#define CHECKV( _varname, _type, _expected_value ) \
                        CHECK( _varname, value::_type::GetType() ); \
                        GT_ASSERT( ((value::_type*)t)->value == _expected_value, "unexpected value" );

						CHECK( "testvar_undefined1", VT_UNDEFINED );
						CHECK( "testvar_undefined2", VT_UNDEFINED );
						CHECK( "testvar_undefined3", VT_UNDEFINED );
						CHECK( "testvar_null", VT_NULL );
						CHECKV( "testvar_bool_first", Bool, true );
						CHECKV( "testvar_bool_second", Bool, false );
						CHECKV( "testvar_int_first", Int, 3 );
						CHECKV( "testvar_int_second", Int, 7 );
						CHECKV( "testvar_int_third", Int, 25 );
						CHECKV( "testvar_string_first", String, "FIRST" );
						CHECKV( "testvar_string_second", String, "SECOND" );
#undef CHECKV
#undef CHECK
						GT_OK();
					};
					errmsg = validate();
					return VALUE( value::Null );
				}
			};
			gc_space->Accumulate(
				nullptr,
				[ &gc_space, &ctx, &gse ]() {
					NEWV( check_variables, CheckVariables, gc_space, gse, ctx );
					gse->AddModule( "check_variables", check_variables );
				}
			);

			gse->Run();

			return errmsg;

		}
	);

	task->AddTest(
		"test if methods are defined and called correctly",
		GT() {
			auto* gc_space = gse->GetGCSpace();

			static bool wasTestMethodCalled = false;

			class SetMethods : public value::Callable {
			public:
				SetMethods( gc::Space* const gc_space, GSE* gse, context::Context* const ctx )
					: value::Callable( gc_space, ctx )
					, gse( gse ) {}
				GSE* gse;

				class TestMethod : public value::Callable {
				public:
					TestMethod( gc::Space* const gc_space, context::Context* const ctx )
						: value::Callable( gc_space, ctx ) {}
					Value* Run( GSE_CALLABLE, const value::function_arguments_t& arguments ) override {
						wasTestMethodCalled = true;
						return VALUE( value::Null );
					}
				};

				Value* Run( GSE_CALLABLE, const value::function_arguments_t& arguments ) override {
					gse->SetGlobal( "test_method", VALUE( TestMethod, , ctx ) );
					gse->SetGlobal( "sum", VALUE( Sum, , ctx ) );
					return VALUE( value::Null );
				}
			};
			gc_space->Accumulate(
				nullptr,
				[ &gc_space, &ctx, &gse ]() {
					NEWV( set_methods, SetMethods, gc_space, gse, ctx );
					gse->AddModule( "set_methods", set_methods );
				}
			);

			gse->Run();

#define GETMETHOD( _method ) \
    auto* value = gse->GetGlobal( _method ); \
    GT_ASSERT( value->type != VT_UNDEFINED, "method not found" ); \
    GT_ASSERT( value->type == VT_CALLABLE, "method is not callable" ); \
    auto* method = (value::Callable*)value;

#define GETRESULT( _args, _expected_type, _cast_type ) \
    ExecutionPointer ep; \
    auto resultvalue = method->Run( gc_space, nullptr, {}, ep, _args ); \
    auto* resultv = resultvalue; \
    GT_ASSERT( resultv->type == _expected_type, "wrong result type ( " + std::to_string( resultv->type ) + " != " + std::to_string( _expected_type ) + " )" ); \
    auto* result = (_cast_type*)resultv;

#define CHECKRESULT( _args, _expected_type, _cast_type, _expected_value ) \
    { \
        GETRESULT( _args, _expected_type, _cast_type ); \
        GT_ASSERT( result->value == _expected_value, "wrong result value: " + std::to_string( result->value ) ); \
    }

			const auto& run_tests = [ &gse, &gc_space ]() -> std::string {
				{ // test test_method()
					GETMETHOD( "test_method" );
					GT_ASSERT( !wasTestMethodCalled, "method should have not be called yet" );
					GETRESULT( {}, VT_NULL, value::Null );
					GT_ASSERT( wasTestMethodCalled, "method should have been called" );
				}
				{ // test sum()
					GETMETHOD( "sum" );
					CHECKRESULT( {}, VT_INT, value::Int, 0 );
					CHECKRESULT( { VALUE( value::Int, , 3 ) }, VT_INT, value::Int, 3 );
					std::vector< Value* > args = {
						VALUE( value::Int, , 2 ),
						VALUE( value::Int, , 5 ),
					};
					CHECKRESULT( args, VT_INT, value::Int, 7 );
					args = {
						VALUE( value::Int, , 11 ),
						VALUE( value::Int, , 22 ),
						VALUE( value::Int, , 33 ),
					};
					CHECKRESULT( args, VT_INT, value::Int, 66 );
				}
				GT_OK();
			};

#undef GETMETHOD
#undef GETRESULT
#undef CHECKRESULT

			std::string result = "";
			gc_space->Accumulate(
				nullptr,
				[ &run_tests, &result ]() {
					result = run_tests();
				}
			);

			return result;
		}
	);

	task->AddTest(
		"test if variables are assigned and reassigned correctly",
		GT() {
			auto* gc_space = gse->GetGCSpace();

			class SetVariables : public value::Callable {
			public:
				SetVariables( gc::Space* const gc_space, GSE* gse, context::Context* const ctx )
					: value::Callable( gc_space, ctx )
					, gse( gse ) {}
				GSE* gse;
				Value* Run( GSE_CALLABLE, const value::function_arguments_t& arguments ) override {

					auto val1 = VALUE( value::Int, , 1 );
					auto val2 = VALUE( value::Int, , VALUE_GET( value::Int, val1 ) + 1 );

					gse->SetGlobal( "testvar_first", val1 );
					gse->SetGlobal( "testvar_second", val2 );

					VALUE_SET( value::Int, val1, 10 ); // this should update testvar_first

					auto val3 = VALUE_CLONE( value::Int, val2 );
					VALUE_SET( value::Int, val3, 20 ); // this should not update testvar_second
					gse->SetGlobal( "testvar_third", val3 );

					gse->SetGlobal( "testvar_obj1", VALUEEXT( value::Object, GSE_CALL ) );

					auto obj2 = VALUEEXT( value::Object, GSE_CALL );
					auto data2 = VALUE_DATA( value::Object, obj2 );
					data2->Set( "property_int", VALUE( value::Int, , 555 ), GSE_CALL );
					data2->Set( "property_bool", VALUE( value::Bool, , false ), GSE_CALL );
					data2->Set( "property_bool", VALUE( value::Bool, , true ), GSE_CALL ); // this should overwrite previous value
					gse->SetGlobal( "testvar_obj2", obj2 );

					auto properties = value::object_properties_t{
						{ "property_int", val3 },
						{ "property_sum",    VALUE( Sum, , ctx ) },
						{ "property_string", VALUE( value::String, , "STRING" ) },
					};
					gse->SetGlobal( "testvar_obj3", VALUEEXT( value::Object, GSE_CALL, properties ) );

					VALUE_SET( value::Int, val3, 30 ); // this should update testvar_third and testvar_obj3.property_int

					return VALUE( value::Null );
				}
			};

			std::string result = "";

			gc_space->Accumulate(
				nullptr,
				[ &gc_space, &ctx, &gse, &result ]() {
					NEWV( set_variables, SetVariables, gc_space, gse, ctx );
					gse->AddModule( "set_variables", set_variables );

					gse->Run();

					const auto f_asserts = [ &gse, &gc_space ]() {

						GT_ASSERT( VALUE_GET( value::Int, gse->GetGlobal( "testvar_first" ) ) == 10 );
						GT_ASSERT( VALUE_GET( value::Int, gse->GetGlobal( "testvar_second" ) ) == 2 );
						GT_ASSERT( VALUE_GET( value::Int, gse->GetGlobal( "testvar_third" ) ) == 30 );

						const auto obj1 = VALUE_GET( value::Object, gse->GetGlobal( "testvar_obj1" ) );
						GT_ASSERT( obj1.empty() );

						const auto obj2 = VALUE_GET( value::Object, gse->GetGlobal( "testvar_obj2" ) );
						GT_ASSERT( obj2.size() == 2 );
						GT_ASSERT( VALUE_GET( value::Int, obj2.at( "property_int" ) ) == 555 );
						GT_ASSERT( VALUE_GET( value::Bool, obj2.at( "property_bool" ) ) == true );

						const auto obj3 = VALUE_GET( value::Object, gse->GetGlobal( "testvar_obj3" ) );
						GT_ASSERT( obj3.size() == 3 );
						GT_ASSERT( VALUE_GET( value::Int, obj3.at( "property_int" ) ) == 30 );
						GT_ASSERT( VALUE_GET( value::String, obj3.at( "property_string" ) ) == "STRING" );
						const auto sum = VALUE_DATA( value::Callable, obj3.at( "property_sum" ) );

						const auto run_tests = [ &gse, &gc_space, &sum ]() -> const std::string {
							std::vector< Value* > args = {
								VALUE( value::Int, , 2 ),
								VALUE( value::Int, , 5 ),
							};
							{
								ExecutionPointer ep;
								GT_ASSERT( VALUE_GET( value::Int, sum->Run( gc_space, nullptr, {}, ep, args ) ) == 7 );
							}
							GT_OK();
						};

						return run_tests();
					};

					result = f_asserts();

				}
			);
			return result;
		}
	);

}

}
}
