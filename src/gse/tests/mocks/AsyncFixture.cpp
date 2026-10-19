#include "AsyncFixture.h"
#include <memory>
#include "gse/Async.h"
#include "gse/Exception.h"
#include "gse/GSE.h"
#include "gse/context/Context.h"
#include "gse/callable/Native.h"
#include "gse/value/Bool.h"
#include "gse/value/Int.h"
#include "gse/value/Object.h"
#include "util/FinallyGuard.h"

namespace gse::tests::mocks {

// Only equal deadlines and a bounded single due-bucket step are controlled.
// Timer cancellation, dispatch, callback results and rescheduling are actual
// Async operations. No separate scheduler or collection model is supplied.
struct AsyncFixture {
	struct Counts { int64_t first = 0, second = 0; timer_id_t first_id = 0, second_id = 0; };
	static Value* Probe( GSE_CALLABLE, const std::string& kind ) {
		if ( kind != "cancel_sibling" && kind != "self_cancel" && kind != "replacement" && kind != "repeat" && kind != "stop_all" && kind != "handles" ) { GSE_ERROR( EC.INVALID_CALL, "Unknown async probe" ); }
		auto* async = ctx->GetGSE()->GetAsync();
		const auto saved_timers = async->m_timers;
		const auto saved_index = async->m_timers_ms;
		async->m_timers.clear(); async->m_timers_ms.clear();
		util::FinallyGuard restore( [ & ]() { async->m_timers = saved_timers; async->m_timers_ms = saved_index; } );
		const auto counts = std::make_shared< Counts >();
		auto* second = NATIVE_CALL( counts ) { N_EXPECT_ARGS( 0 ); counts->second++; return VALUE( value::Bool,, false ); } );
		if ( kind == "handles" ) {
			auto* other = new Async( gc_space );
			auto* first = NATIVE_CALL( counts ) { N_EXPECT_ARGS( 0 ); counts->first++; return VALUE( value::Bool,, false ); } );
			const auto first_id = async->StartTimer( 0, first, GSE_CALL_NOGC );
			const auto second_id = other->StartTimer( 0, second, GSE_CALL_NOGC );
			const bool distinct = first_id != second_id;
			const bool isolated = !async->StopTimer( second_id ) && !other->StopTimer( first_id );
			const bool stopped = async->StopTimer( first_id );
			other->ProcessTimers( other->m_timers.begin(), ep );
			const value::object_properties_t result {
				{ "distinct", VALUE( value::Bool,, distinct ) }, { "isolated", VALUE( value::Bool,, isolated ) }, { "stopped", VALUE( value::Bool,, stopped ) },
				{ "first_calls", VALUE( value::Int,, counts->first ) }, { "second_calls", VALUE( value::Int,, counts->second ) },
				{ "pending", VALUE( value::Int,, async->m_timers_ms.size() + other->m_timers_ms.size() ) },
			};
			return VALUEEXT( value::Object, GSE_CALL, result );
		}
		auto* first = NATIVE_CALL( async, counts, kind, second ) {
			N_EXPECT_ARGS( 0 ); counts->first++;
			if ( kind == "cancel_sibling" ) { async->StopTimer( counts->second_id ); }
			else if ( kind == "self_cancel" ) { async->StopTimer( counts->first_id ); return VALUE( value::Bool,, true ); }
			else if ( kind == "replacement" ) {
				async->StopTimer( counts->first_id );
				counts->second_id = async->StartTimer( 0, second, GSE_CALL_NOGC );
				return VALUE( value::Bool,, true );
			}
			else if ( kind == "stop_all" ) { async->StopTimers(); return VALUE( value::Bool,, true ); }
			return VALUE( value::Bool,, kind == "repeat" && counts->first < 2 );
		} );
		counts->first_id = async->StartTimer( 0, first, GSE_CALL_NOGC );
		if ( kind == "cancel_sibling" || kind == "stop_all" ) {
			counts->second_id = async->StartTimer( 0, second, GSE_CALL_NOGC );
			const auto first_time = async->m_timers_ms.at( counts->first_id );
			const auto second_time = async->m_timers_ms.at( counts->second_id );
			if ( first_time != second_time ) {
				const auto timer = async->m_timers.at( second_time ).at( counts->second_id );
				async->m_timers.at( second_time ).erase( counts->second_id );
				if ( async->m_timers.at( second_time ).empty() ) { async->m_timers.erase( second_time ); }
				async->m_timers[ first_time ].emplace( counts->second_id, timer );
				async->m_timers_ms.at( counts->second_id ) = first_time;
			}
		}
		async->ProcessTimers( async->m_timers.begin(), ep );
		const auto pending_after_first = async->m_timers_ms.size();
		if ( kind == "replacement" || kind == "repeat" ) {
			if ( !async->m_timers.empty() ) { async->ProcessTimers( async->m_timers.begin(), ep ); }
		}
		const value::object_properties_t result {
			{ "first_calls", VALUE( value::Int,, counts->first ) }, { "second_calls", VALUE( value::Int,, counts->second ) },
			{ "pending_after_first", VALUE( value::Int,, pending_after_first ) },
			{ "pending", VALUE( value::Int,, async->m_timers_ms.size() ) }, { "buckets", VALUE( value::Int,, async->m_timers.size() ) },
		};
		return VALUEEXT( value::Object, GSE_CALL, result );
	}
};
Value* ProbeAsyncTimers( GSE_CALLABLE, const std::string& kind ) { return AsyncFixture::Probe( GSE_CALL, kind ); }
}
