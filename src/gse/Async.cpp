#include "Async.h"

#include <thread>
#include <chrono>

#include "gse/value/Callable.h"
#include "gse/value/Bool.h"
#include "gse/value/Int.h"
#include "gse/context/ChildContext.h"
#include "Exception.h"
#include "util/Time.h"
#include "gc/Space.h"
#include "gse/callable/Native.h"
#include "gse/value/Undefined.h"
#include "gse/value/Object.h"

namespace gse {

// just a precaution
#define MAX_SLEEP_MS ( 1000 * 3600 )

Async::Async( gc::Space* const gc_space )
	: gc::Object( gc_space )
	, m_gc_space( gc_space ) {}

void Async::WithTimerState( const std::function< void() >& callback ) {
	// These operations return synchronously. Never enqueue captures of their
	// stack locals on a foreign interpreter thread, including Release builds.
	if ( !m_gc_space->IsOwnerThread() ) { THROW( "Async timer operations require their owning interpreter thread" ); }
	m_gc_space->Accumulate( this, callback, nullptr, true );
}

void Async::Iterate( ExecutionPointer& ep ) {
	WithTimerState( [ & ]() {
		if ( !m_is_stopping ) {
			while ( !m_timers.empty() && util::Time::Now() >= m_timers.begin()->first ) {
				ProcessTimers( m_timers.begin(), ep );
			}
		}
	} );
}

static std::atomic< timer_id_t > s_next_id = 0;

const timer_id_t Async::StartTimer( const size_t ms, gse::value::Callable* const f, GSE_CALLABLE_NOGC ) {
	timer_id_t result = 0;
	WithTimerState( [ & ]() {
		ASSERT( f->type == VT_CALLABLE, "invalid callable type: " + f->GetTypeString() );
		ValidateMs( ms, m_gc_space, ctx, si, ep );
		auto previous = s_next_id.load( std::memory_order_relaxed );
		do { result = previous >= SIZE_MAX - 1 ? 1 : previous + 1; }
		while ( !s_next_id.compare_exchange_weak( previous, result, std::memory_order_relaxed ) );
		const auto time = util::Time::Now() + ms;
		m_timers[ time ].emplace( result, timer_t { ms, f, ctx, si } );
		m_timers_ms.emplace( result, time );
	} );
	return result;
}

const bool Async::StopTimer( const gse::timer_id_t id ) {
	bool result = false;
	WithTimerState( [ & ]() {
		const auto it = m_timers_ms.find( id );
		if ( it == m_timers_ms.end() ) { return; }
		const auto time = it->second;
		ASSERT( m_timers.find( time ) != m_timers.end(), "timers not found" );
		auto& timers = m_timers.at( time );
		ASSERT( timers.find( id ) != timers.end(), "timer not found" );
		timers.erase( id );
		if ( timers.empty() ) { m_timers.erase( time ); }
		m_timers_ms.erase( it );
		result = true;
	} );
	return result;
}

void Async::StopTimers() {
	WithTimerState( [ this ]() { m_timers.clear(); m_timers_ms.clear(); } );
}

gse::Value* const Async::CreateTimer( const size_t ms, gse::value::Callable* const f, GSE_CALLABLE_NOGC, timer_id_t* const out_timer_id ) {
	const auto timer_id = StartTimer( ms, f, GSE_CALL_NOGC );

	auto* const gc_space = m_gc_space;
	const gse::value::object_properties_t properties = {
		{
			"stop",
			// recursive NATIVE_CALL doesn't work
			NATIVE_CALL( this, timer_id ) {
				N_EXPECT_ARGS( 0 );
				StopTimer( timer_id );
				return VALUE( gse::value::Undefined );
			} ),
		}
	};

	if ( out_timer_id ) {
		*out_timer_id = timer_id;
	}

	return VALUEEXT( gse::value::Object, GSE_CALL, properties, "async" );
}

void Async::ProcessAndExit( ExecutionPointer& ep ) {
	WithTimerState( [ & ]() {
		m_is_stopping = true;
		m_process_timers_mutex.lock();
		m_process_timers_mutex.unlock();
		while ( !m_timers.empty() ) {
			const auto it = m_timers.begin();
			const auto now = util::Time::Now();
			if ( it->first > now ) { std::this_thread::sleep_for( std::chrono::milliseconds( it->first - now ) ); }
			ProcessTimers( it, ep );
		}
	} );
}

void Async::GetReachableObjects( std::unordered_set< gc::Object* >& reachable_objects ) {
	gc::Object::GetReachableObjects( reachable_objects );

	GC_DEBUG_BEGIN( "Async" );

	// timer callables are reachable
	GC_DEBUG_BEGIN( "timer_callables" );
	for ( const auto& timers : m_timers ) {
		for ( const auto& timer : timers.second ) {
			GC_REACHABLE( timer.second.callable );
			ASSERT( reachable_objects.find( timer.second.ctx ) != reachable_objects.end(), "callable context not reachable" );
		}
	}
	GC_DEBUG_END();

	GC_DEBUG_END();
}

void Async::ValidateMs( const int64_t ms, GSE_CALLABLE ) const {
	if ( ms < 0 ) {
		GSE_ERROR( EC.OPERATION_FAILED, "Timeout can't be negative: " + std::to_string( ms ) );
	}
	if ( ms > MAX_SLEEP_MS ) {
		GSE_ERROR( EC.OPERATION_FAILED, "Timeout can't be larger than " + std::to_string( MAX_SLEEP_MS ) + "ms: " + std::to_string( ms ) );
	}
}

void Async::ProcessTimers( const timers_t::const_iterator& it, ExecutionPointer& ep ) {
	WithTimerState( [ & ]() {
		std::lock_guard guard( m_process_timers_mutex );
		const auto due_time = it->first;
		const auto timers = it->second;
		for ( const auto& entry : timers ) {
			const auto id = entry.first;
			auto active = m_timers_ms.find( id );
			if ( active == m_timers_ms.end() || active->second != due_time ) { continue; }
			const auto timer = entry.second;
			auto* ctx = timer.ctx;
			const auto& si = timer.si;
			const auto* result = timer.callable->Run( m_gc_space, GSE_CALL_NOGC, {} );
			bool repeat = false;
			size_t ms = 0;
			if ( result ) {
				switch ( result->type ) {
					case VT_UNDEFINED: case VT_NULL: break;
					case VT_BOOL:
						repeat = static_cast< const value::Bool* >( result )->value;
						ms = timer.ms;
						break;
					case VT_INT: {
						const auto requested_ms = static_cast< const value::Int* >( result )->value;
						ValidateMs( requested_ms, m_gc_space, GSE_CALL_NOGC );
						ms = requested_ms; repeat = true;
						break;
					}
					default: GSE_ERROR( EC.INVALID_HANDLER, "Unexpected async return type: " + result->GetTypeString() );
				}
			}
			// Cancellation in this callback wins over a repeat request. The
			// copied due bucket may also contain siblings cancelled earlier.
			active = m_timers_ms.find( id );
			if ( active == m_timers_ms.end() || active->second != due_time ) { continue; }
			StopTimer( id );
			if ( repeat ) {
				const auto time = util::Time::Now() + ms;
				m_timers[ time ].emplace( id, timer_t { ms, timer.callable, ctx, si } );
				m_timers_ms.emplace( id, time );
			}
		}
	} );
}

}
