#include "ProductionFixture.h"

#include <memory>
#include "gc/Space.h"
#include "gse/value/Array.h"
#include "gse/value/Bool.h"
#include "gse/value/Callable.h"
#include "gse/value/Int.h"
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
#include "game/backend/faction/Faction.h"
#include "game/backend/faction/FactionManager.h"
#include "game/backend/map/Map.h"
#include "game/backend/map/tile/Tiles.h"
#include "game/backend/slot/Slots.h"

namespace gse::tests::mocks {
namespace backend = game::backend;

// Only native lifecycle, map coordinates, event authorization and event-loop
// delivery are supplied. The actual managers, wrappers and codecs are used.
struct ProductionFixture : gc::Object {
	backend::Game game;
	backend::State* state = nullptr;
	std::unique_ptr< backend::Player > owner;
	backend::base::Base* base = nullptr;
	bool destroying = false;
	bool stopped = false;
	int64_t updates = 0;

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
		bm->Clear();
		state->UnsetGame();
		game.Stop();
		owner.reset();
		stopped = true;
		delete bm;
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
		for ( auto& record : game.m_bm->m_unprocessed_bases ) {
			auto* restored = backend::base::Base::Deserialize( record, &game );
			if ( game.m_bm->m_bases.count( restored->m_id ) ) { THROW( "duplicate fixture base" ); }
			game.m_bm->m_bases.emplace( restored->m_id, restored );
		}
		game.m_bm->m_unprocessed_bases.clear();
		if ( game.m_bm->m_bases.size() != 1 ) { THROW( "fixture requires one base" ); }
		base = game.m_bm->m_bases.begin()->second;
	}
	std::string Corrupt( const std::string& kind ) {
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

Value* MakeProductionFixture( GSE_CALLABLE ) {
	const auto session = std::make_shared< ProductionSession >();
	session->current = std::make_shared< ProductionFixture >( GSE_CALL );
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
	object->Set( "player_copy_probe", NATIVE_CALL( session ) {
		N_EXPECT_ARGS( 1 ); N_GETVALUE( kind, 0, String );
		return session->current->CopyProbe( GSE_CALL, kind );
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
	object->Set( "reset", NATIVE_CALL( session, object ) {
		N_EXPECT_ARGS( 0 );
		auto fresh = std::make_shared< ProductionFixture >( GSE_CALL );
		session->current->Retire();
		session->retired.push_back( session->current );
		session->current = std::move( fresh );
		UpdateWrappers( GSE_CALL, object );
		return VALUE( value::Undefined );
	} ), GSE_CALL );
	return object;
}

}
