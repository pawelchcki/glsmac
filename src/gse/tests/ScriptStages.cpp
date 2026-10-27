#include "ScriptStages.h"
#include "gse/GSE.h"
#include "gse/Async.h"
#include "gse/Exception.h"
#include "gse/ExecutionPointer.h"
#include "gse/context/GlobalContext.h"
#include "gse/callable/Native.h"
#include "gse/value/Array.h"
#include "gse/value/Object.h"
#include "gse/value/Int.h"
#include "gse/value/String.h"
#include "gse/value/Undefined.h"
#include "gc/Space.h"
#include "gc/GC.h"
#include "engine/Engine.h"
#include "util/LogHelper.h"
#include "util/FinallyGuard.h"
#include <deque>
#include <set>
#include <stdexcept>
#include <utility>
#include <vector>

namespace gse::tests {

struct ScriptStages::State {
 enum Kind { PHASE, CLEANUP, AFTER };
 enum Mode { REGISTERING, RUNNING, CLEANING, FINISHING, COMPLETING, CLOSED };
 struct Entry { std::string label; si_t source; };
 struct Queue { value::Array* values = nullptr; std::deque< Entry > entries; };
 GSE* gse;
 gc::Space* space;
 value::Object* root = nullptr;
 Queue queues[3];
 Mode mode = REGISTERING;
 bool enabled = false;
 size_t registrations = 0;
 std::set< std::string > labels;
 std::string error;

 explicit State( GSE* interpreter ) : gse( interpreter ), space( interpreter->GetGCSpace() ) {}

 void Register( GSE_CALLABLE, const Kind kind, const std::string& label, value::Callable* callback ) {
  if ( !space->IsOwnerThread() || mode > RUNNING ) { GSE_ERROR( EC.INVALID_CALL, "Script stage registry is closed" ); }
  if ( label.empty() || label.size() > 1024 || registrations >= 512 ) { GSE_ERROR( EC.INVALID_CALL, "Invalid or excessive script stages" ); }
  const auto key = std::to_string( kind ) + ":" + label;
  if ( !labels.insert( key ).second ) { GSE_ERROR( EC.INVALID_CALL, "Duplicate script stage label: " + label ); }
  auto& queue = queues[kind];
  try {
   queue.entries.push_back( { label, si } );
   try { queue.values->value.push_back( callback ); }
   catch ( ... ) { queue.entries.pop_back(); throw; }
  } catch ( ... ) { labels.erase( key ); throw; }
  ++registrations; enabled = true;
 }

 size_t Pending() const {
  if ( mode == CLOSED ) { return 0; }
  return queues[PHASE].entries.size() + queues[CLEANUP].entries.size() + queues[AFTER].entries.size();
 }

 void AddError( const std::string& label, const std::string& reason ) {
  if ( !error.empty() ) { error += "\n"; }
  error += "Script stage '" + label + "': " + reason;
 }

 void Collect() {
  if ( !space->IsOwnerThread() || space->IsAccumulating() ) { throw std::logic_error( "Stage collection requires an outside owner-thread boundary" ); }
  // Existing collector only: no interpreter, timer, backend or game progress.
  g_engine->GetGC()->Iterate();
 }

 void Invoke( const Kind kind, const bool reverse = false ) {
  space->Accumulate( root, [ & ]() {
   auto& queue = queues[kind];
   const auto index = reverse ? queue.entries.size() - 1 : 0;
   const auto entry = reverse ? queue.entries.back() : queue.entries.front();
   auto* callback = static_cast< value::Callable* >( queue.values->value.at( index ) );
   util::LogHelper::Println( "TEST_STAGE_BEGIN " + entry.label );
   try {
    ExecutionPointer ep;
    // Run creates its ordinary fresh invocation context. Keep this Callable
    // rooted until it returns; never retain an ignored return value afterward.
    callback->Run( space, callback->m_ctx, entry.source, ep, {} );
    util::LogHelper::Println( "TEST_STAGE_END " + entry.label );
   } catch ( const Exception& failure ) {
    // Format while failed invocation objects remain accumulation-protected.
    AddError( entry.label, failure.ToString() );
   } catch ( const std::exception& failure ) { AddError( entry.label, failure.what() ); }
   catch ( ... ) { AddError( entry.label, "Unknown native failure" ); }
   if ( reverse ) { queue.entries.pop_back(); queue.values->value.pop_back(); }
   else { queue.entries.pop_front(); queue.values->value.erase( queue.values->value.begin() ); }
  }, nullptr, true );
  Collect();
 }

 void Clear( const Kind kind ) {
  queues[kind].entries.clear();
  if ( queues[kind].values ) { queues[kind].values->value.clear(); }
 }

 void Close() {
  if ( mode == CLOSED ) { return; }
  space->Accumulate( root, [ & ]() {
   mode = CLOSED;
   for ( auto& queue : queues ) { queue.entries.clear(); if ( queue.values ) { queue.values->value.clear(); } queue.values = nullptr; }
   if ( root ) { gse->RemoveRootObject( root ); root = nullptr; }
  }, nullptr, true );
 }
};

ScriptStages::ScriptStages( std::shared_ptr< State > state ) : m_state( std::move( state ) ) {}
ScriptStages::~ScriptStages() { m_state->Close(); }

std::unique_ptr< ScriptStages > ScriptStages::Install( GSE* gse, context::GlobalContext* ctx ) {
 auto* gc_space = gse->GetGCSpace();
 if ( !gc_space->IsAccumulating() ) { throw std::logic_error( "Install script stages during script registration" ); }
 const auto state = std::make_shared< State >( gse );
 ExecutionPointer ep; const si_t si;
 value::object_properties_t roots;
 for ( size_t index = 0; index < 3; ++index ) {
  state->queues[index].values = VALUE( value::Array,, value::array_elements_t{} );
  roots.emplace( std::to_string( index ), state->queues[index].values );
 }
 state->root = VALUEEXT( value::Object, GSE_CALL, roots );
 gse->AddRootObject( state->root );
 auto* object = static_cast< value::Object* >( ctx->GetVariable( "test", si, ep ) );
 object->Set( "stage_version", VALUE( value::Int,, 1 ), GSE_CALL );
 for ( const auto& entry : std::vector< std::pair< std::string, State::Kind > >{ { "stage", State::PHASE }, { "stage_cleanup", State::CLEANUP }, { "after_stages", State::AFTER } } ) {
  const auto kind = entry.second;
  object->Set( entry.first, NATIVE_CALL( state, kind ) {
   if ( state->mode == State::CLOSED ) { GSE_ERROR( EC.INVALID_CALL, "Script stage registry is closed" ); }
   // An invalid explicit staging request still needs staged error cleanup.
   state->enabled = true;
   N_EXPECT_ARGS( 2 ); N_GETVALUE( label, 0, String ); N_GET_CALLABLE( callback, 1 );
   state->Register( GSE_CALL, kind, label, callback ); return VALUE( value::Undefined );
  } ), GSE_CALL );
 }
 object->Set( "stages_pending", NATIVE_CALL( state ) {
  N_EXPECT_ARGS( 0 ); return VALUE( value::Int,, state->Pending() );
 } ), GSE_CALL );
 return std::unique_ptr< ScriptStages >( new ScriptStages( state ) );
}

bool ScriptStages::Enabled() const { return m_state->enabled; }

std::string ScriptStages::RunAndFinish( const std::string& initial_error ) {
 auto& state = *m_state;
 if ( state.space->IsAccumulating() || !state.space->IsOwnerThread() ) { throw std::logic_error( "Run script stages outside owner accumulation" ); }
 util::FinallyGuard close_registry( [ &state ]() { state.Close(); } );
 state.error = initial_error;
 state.mode = State::RUNNING;
 while ( !state.queues[State::PHASE].entries.empty() && state.error.empty() ) { state.Invoke( State::PHASE ); }
 state.space->Accumulate( state.root, [ & ]() { state.Clear( State::PHASE ); state.mode = State::CLEANING; }, nullptr, true );
 // Always attempt every registered resource cleanup, even if one fails.
 while ( !state.queues[State::CLEANUP].entries.empty() ) { state.Invoke( State::CLEANUP, true ); }
 state.space->Accumulate( state.root, [ & ]() {
  state.mode = State::FINISHING;
  if ( !state.error.empty() ) { state.gse->GetAsync()->StopTimers(); }
  try { state.gse->Finish(); }
  catch ( const Exception& failure ) { state.AddError( "Finish", failure.ToString() ); state.gse->GetAsync()->StopTimers(); }
  catch ( const std::exception& failure ) { state.AddError( "Finish", failure.what() ); state.gse->GetAsync()->StopTimers(); }
  catch ( ... ) { state.AddError( "Finish", "Unknown native failure" ); state.gse->GetAsync()->StopTimers(); }
  state.mode = State::COMPLETING;
 }, nullptr, true );
 state.Collect();
 while ( !state.queues[State::AFTER].entries.empty() && state.error.empty() ) { state.Invoke( State::AFTER ); }
 if ( !state.error.empty() ) {
  state.space->Accumulate( state.root, [ & ]() { state.gse->GetAsync()->StopTimers(); }, nullptr, true );
 }
 const auto result = state.error;
 state.Close();
 return result;
}

}
