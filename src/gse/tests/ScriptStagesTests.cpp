#include "ScriptStages.h"
#include "task/gsetests/GSETests.h"
#include "gse/GSE.h"
#include "gse/Async.h"
#include "gse/Exception.h"
#include "gse/ExecutionPointer.h"
#include "gse/context/GlobalContext.h"
#include "gse/callable/Native.h"
#include "gse/value/Object.h"
#include "gse/value/String.h"
#include "gse/value/Bool.h"
#include "gse/value/Undefined.h"
#include "gc/Space.h"
#include "gc/GC.h"
#include "engine/Engine.h"
#include <memory>
#include <vector>
#include <stdexcept>

namespace gse::tests {
namespace {
struct Counts {
 std::vector< std::string > order;
 size_t transient_destroyed = 0, kept_destroyed = 0, timer_calls = 0;
 bool after = false, late_rejected = false;
 timer_id_t timer = 0;
};
struct Tracked final : value::Object {
 std::shared_ptr< Counts > counts;
 bool kept;
 Tracked( GSE_CALLABLE, std::shared_ptr< Counts > state, const bool persistent )
  : value::Object( GSE_CALL ), counts( std::move( state ) ), kept( persistent ) {}
 ~Tracked() override { if ( kept ) { ++counts->kept_destroyed; } else { ++counts->transient_destroyed; } }
};
// NATIVE_CALL expands through VALUE and cannot be nested inside another
// NATIVE_CALL macro argument. Keep construction in this ordinary helper.
value::Callable* TimerCallback( GSE_CALLABLE, const std::shared_ptr< Counts >& counts, const int mode ) {
 return NATIVE_CALL( counts, mode ) {
  ++counts->timer_calls;
  if ( mode == 2 ) { throw std::runtime_error( "finish timer failure" ); }
  return VALUE( value::Bool,, mode == 1 );
 } );
}
std::unique_ptr< ScriptStages > Prepare( GSE* gse, context::Context* ctx ) {
 std::unique_ptr< ScriptStages > result;
 auto* gc_space = gse->GetGCSpace();
 gc_space->Accumulate( nullptr, [ & ]() {
  ExecutionPointer ep; const si_t si;
  ctx->CreateVariable( "test", VALUEEXT( value::Object, GSE_CALL ), si, ep );
  result = ScriptStages::Install( gse, static_cast< context::GlobalContext* >( ctx ) );
 }, nullptr, true );
 return result;
}
void Register( GSE_CALLABLE, const std::string& method, const std::string& label, value::Callable* callback ) {
 auto* object = static_cast< value::Object* >( ctx->GetVariable( "test", si, ep ) );
 auto* function = static_cast< value::Callable* >( object->Get( method ) );
 function->Run( GSE_CALL, { VALUE( value::String,, label ), callback } );
}
}

void AddScriptStageTests( task::gsetests::GSETests* task ) {
 task->AddTest( "Script stages preserve FIFO roots and do not process due timers between callbacks", GT() {
  auto stages = Prepare( gse, ctx ); const auto counts = std::make_shared< Counts >(); auto* gc_space = gse->GetGCSpace();
  gc_space->Accumulate( nullptr, [ & ]() {
   ExecutionPointer ep; const si_t si;
   ctx->CreateVariable( "kept", VALUEEXT( Tracked, GSE_CALL, counts, true ), si, ep );
   auto* nested = NATIVE_CALL( counts ) { counts->order.push_back( "nested" ); return VALUE( value::Undefined ); } );
   ctx->CreateConst( "nested", nested, si, ep );
   Register( GSE_CALL, "stage", "a", NATIVE_CALL( counts ) {
    counts->order.push_back( "a" ); (void)VALUEEXT( Tracked, GSE_CALL, counts, false );
    auto* timer = TimerCallback( GSE_CALL, counts, 0 );
    counts->timer = ctx->GetGSE()->GetAsync()->StartTimer( 0, timer, GSE_CALL_NOGC );
    auto* next = static_cast< value::Callable* >( ctx->GetVariable( "nested", si, ep ) );
    Register( GSE_CALL, "stage", "nested", next ); return VALUE( value::Undefined );
   } ) );
   Register( GSE_CALL, "stage", "b", NATIVE_CALL( counts ) {
    if ( counts->transient_destroyed != 1 || counts->kept_destroyed != 0 || counts->timer_calls != 0 ) { throw std::runtime_error( "Stage lifetime or timer boundary changed" ); }
    counts->order.push_back( "b" ); return VALUE( value::Undefined );
   } ) );
   Register( GSE_CALL, "stage_cleanup", "cleanup1", NATIVE_CALL( counts ) {
    counts->order.push_back( "cleanup1" );
    try { Register( GSE_CALL, "stage", "late", static_cast< value::Callable* >( ctx->GetVariable( "nested", si, ep ) ) ); }
    catch ( const Exception& ) { counts->late_rejected = true; }
    return VALUE( value::Undefined );
   } ) );
   Register( GSE_CALL, "stage_cleanup", "cleanup2", NATIVE_CALL( counts ) { counts->order.push_back( "cleanup2" ); return VALUE( value::Undefined ); } ) );
   Register( GSE_CALL, "after_stages", "after", NATIVE_CALL( counts ) {
    if ( counts->timer_calls != 1 || !counts->late_rejected ) { throw std::runtime_error( "Finish or closed registration order changed" ); }
    counts->after = true; counts->order.push_back( "after" ); return VALUE( value::Undefined );
   } ) );
  }, nullptr, true );
  GT_ASSERT( stages->Enabled(), "Explicit stages did not activate optional driver" );
  const auto error = stages->RunAndFinish(); if ( !error.empty() ) { GT_FAIL( error ); }
  GT_ASSERT( counts->order == std::vector< std::string >( { "a", "b", "nested", "cleanup2", "cleanup1", "after" } ), "Stage FIFO/cleanup LIFO order changed" );
  GT_ASSERT( counts->after && counts->transient_destroyed == 1 && counts->kept_destroyed == 0, "Rooted and transient objects did not retain independent lifetimes" );
  gc_space->Accumulate( nullptr, [ & ]() { ExecutionPointer ep; const si_t si; ctx->UpdateVariable( "kept", VALUE( value::Undefined ), si, ep ); }, nullptr, true );
  g_engine->GetGC()->Iterate();
  GT_ASSERT( counts->kept_destroyed == 1, "Released global root did not collect exactly once" );
  GT_OK();
 } );
 task->AddTest( "Stage failure runs all cleanup and stops repeating test timers without false completion", GT() {
  auto stages = Prepare( gse, ctx ); const auto counts = std::make_shared< Counts >(); auto* gc_space = gse->GetGCSpace();
  gc_space->Accumulate( nullptr, [ & ]() {
   ExecutionPointer ep; const si_t si;
   Register( GSE_CALL, "stage", "failure", NATIVE_CALL( counts ) {
    auto* timer = TimerCallback( GSE_CALL, counts, 1 );
    counts->timer = ctx->GetGSE()->GetAsync()->StartTimer( 0, timer, GSE_CALL_NOGC ); throw std::runtime_error( "primary stage failure" );
   } ) );
   Register( GSE_CALL, "stage", "never", NATIVE_CALL( counts ) { counts->order.push_back( "never" ); return VALUE( value::Undefined ); } ) );
   Register( GSE_CALL, "stage_cleanup", "release", NATIVE_CALL( counts ) { counts->order.push_back( "release" ); return VALUE( value::Undefined ); } ) );
   Register( GSE_CALL, "stage_cleanup", "throwing_cleanup", NATIVE_CALL( counts ) { counts->order.push_back( "cleanup" ); throw std::runtime_error( "secondary cleanup failure" ); } ) );
   Register( GSE_CALL, "after_stages", "never_after", NATIVE_CALL( counts ) { counts->after = true; return VALUE( value::Undefined ); } ) );
  }, nullptr, true );
  const auto error = stages->RunAndFinish();
  GT_ASSERT( error.find( "primary stage failure" ) != std::string::npos && error.find( "secondary cleanup failure" ) != std::string::npos, "Primary or cleanup error was discarded" );
  GT_ASSERT( counts->order == std::vector< std::string >( { "cleanup", "release" } ) && !counts->after && counts->timer_calls == 0, "Failure skipped cleanup, advanced timers, or emitted completion" );
  bool still_pending = true;
  gc_space->Accumulate( nullptr, [ & ]() { still_pending = gse->GetAsync()->StopTimer( counts->timer ); }, nullptr, true );
  GT_ASSERT( !still_pending, "Failed stage retained a repeating timer for destructor reentry" ); GT_OK();
 } );
 task->AddTest( "Finish errors retain cleanup and cannot execute staged success callbacks", GT() {
  auto stages = Prepare( gse, ctx ); const auto counts = std::make_shared< Counts >(); auto* gc_space = gse->GetGCSpace();
  gc_space->Accumulate( nullptr, [ & ]() {
   ExecutionPointer ep; const si_t si;
   Register( GSE_CALL, "stage", "schedule", NATIVE_CALL( counts ) {
    auto* timer = TimerCallback( GSE_CALL, counts, 2 );
    counts->timer = ctx->GetGSE()->GetAsync()->StartTimer( 0, timer, GSE_CALL_NOGC ); return VALUE( value::Undefined );
   } ) );
   Register( GSE_CALL, "stage_cleanup", "cleanup", NATIVE_CALL( counts ) { counts->order.push_back( "cleanup" ); return VALUE( value::Undefined ); } ) );
   Register( GSE_CALL, "after_stages", "never_after", NATIVE_CALL( counts ) { counts->after = true; return VALUE( value::Undefined ); } ) );
  }, nullptr, true );
  const auto error = stages->RunAndFinish();
  GT_ASSERT( error.find( "Finish" ) != std::string::npos && error.find( "finish timer failure" ) != std::string::npos, "Finish failure was not retained" );
  GT_ASSERT( counts->order == std::vector< std::string >( { "cleanup" } ) && counts->timer_calls == 1 && !counts->after, "Finish failure repeated timers or announced success" ); GT_OK();
 } );
 task->AddTest( "Registration errors still run staged cleanup and close retained native callables", GT() {
  auto stages = Prepare( gse, ctx ); const auto counts = std::make_shared< Counts >(); auto* gc_space = gse->GetGCSpace();
  gc_space->Accumulate( nullptr, [ & ]() {
   ExecutionPointer ep; const si_t si;
   Register( GSE_CALL, "stage_cleanup", "cleanup", NATIVE_CALL( counts ) { counts->order.push_back( "cleanup" ); return VALUE( value::Undefined ); } ) );
   Register( GSE_CALL, "after_stages", "never_after", NATIVE_CALL( counts ) { counts->after = true; return VALUE( value::Undefined ); } ) );
  }, nullptr, true );
  const auto error = stages->RunAndFinish( "registration failed" );
  GT_ASSERT( error == "registration failed" && counts->order == std::vector< std::string >( { "cleanup" } ) && !counts->after, "Registration failure lost cleanup or emitted completion" );
  bool closed = false;
  gc_space->Accumulate( nullptr, [ & ]() {
   ExecutionPointer ep; const si_t si;
   auto* noop = NATIVE_CALL() { return VALUE( value::Undefined ); } );
   try { Register( GSE_CALL, "stage", "late_after_close", noop ); } catch ( const Exception& ) { closed = true; }
  }, nullptr, true );
  GT_ASSERT( closed, "Retained native callback accessed released queue instead of rejecting closure" ); GT_OK();
 } );
 task->AddTest( "Unstaged scripts retain the existing asynchronous finish behavior", GT() {
  auto stages = Prepare( gse, ctx ); const auto counts = std::make_shared< Counts >(); auto* gc_space = gse->GetGCSpace();
  gc_space->Accumulate( nullptr, [ & ]() {
   ExecutionPointer ep; const si_t si;
   auto* timer = NATIVE_CALL( counts ) { ++counts->timer_calls; return VALUE( value::Bool,, counts->timer_calls < 2 ); } );
   gse->GetAsync()->StartTimer( 0, timer, GSE_CALL_NOGC );
  }, nullptr, true );
  GT_ASSERT( !stages->Enabled(), "Optional stage installation changed legacy mode" );
  gse->Finish();
  GT_ASSERT( counts->timer_calls == 2, "Legacy Finish no longer processes ordinary repeats" ); GT_OK();
 } );
}
}
