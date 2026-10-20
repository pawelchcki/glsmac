#include <chrono>
#include <thread>
#include <cstring>
#include <cmath>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

#include "Thread.h"
#include "common/Module.h"

namespace common {

Thread::Thread( const std::string& thread_name )
	: m_thread_name( thread_name ) {
	m_state = STATE_INACTIVE;
	m_command = COMMAND_NONE;
	m_name = thread_name;
}

Thread::~Thread() {
	if ( m_state != STATE_INACTIVE ) {
		Log( "WARNING: thread " + GetThreadName() + " was not shutdown properly!" );
	}
	else {
		//delete m_thread;
	}
}

void Thread::SetIPS( const float ips ) {
	m_ips = ips;
}
void Thread::AddModule( Module* module ) {
	ASSERT( module, "null module added" );
	m_modules.push_back( module );
}

void Thread::T_Start() {
	ASSERT( !m_thread, "thread object already initialized" );
	m_state = STATE_STARTING;
	m_thread = new std::thread( &Thread::Run, this );
}

bool Thread::T_IsRunning() {
	if ( m_state != STATE_INACTIVE ) {
		return true;
	}
	else {
		if ( m_thread ) {
			m_thread->join();
			delete m_thread;
			m_thread = nullptr;
		}
		return false;
	}
}

void Thread::T_Stop() {
	ASSERT( m_command == COMMAND_NONE, "thread command overlap" );
	Log( "Sent STOP command" );
	m_command = Thread::COMMAND_STOP;
}

void Thread::StopAll( const std::vector< Thread* >& threads, Thread* collector ) {
	// Collection traverses game/UI objects. Let an in-flight traversal finish
	// while their owner threads can still serve work, then join it before any
	// owner begins destroying that graph. Shared single-thread engines pass null.
	if ( collector ) {
		collector->T_Stop();
		while ( collector->T_IsRunning() ) { std::this_thread::sleep_for( std::chrono::milliseconds( 1 ) ); }
	}
	if ( threads.empty() ) { return; }
	auto* owner = threads.front();
	ASSERT( owner != collector, "collector cannot own the UI thread" );
	// Drain iterations while the owner can still serve callbacks. Keep native
	// worker state alive until UI timers, listeners and script roots are gone.
	for ( size_t i = 1; i < threads.size(); ++i ) {
		auto* thread = threads[i];
		if ( thread != collector ) {
			ASSERT( thread->m_command == COMMAND_NONE, "thread command overlap" );
			thread->m_command = COMMAND_QUIESCE;
		}
	}
	for ( size_t i = 1; i < threads.size(); ++i ) {
		auto* thread = threads[i];
		if ( thread != collector ) {
			while ( thread->m_state != STATE_QUIESCENT ) { std::this_thread::sleep_for( std::chrono::milliseconds( 1 ) ); }
		}
	}
	owner->T_Stop();
	while ( owner->T_IsRunning() ) { std::this_thread::sleep_for( std::chrono::milliseconds( 1 ) ); }
	for ( size_t i = threads.size(); i > 1; --i ) {
		auto* thread = threads[i - 1];
		if ( thread != collector ) {
			thread->m_command = COMMAND_STOP;
			while ( thread->T_IsRunning() ) { std::this_thread::sleep_for( std::chrono::milliseconds( 1 ) ); }
		}
	}
}

void Thread::Run() {

	ASSERT( m_state == STATE_STARTING, "starting thread from invalid state" );

	Log( "Starting thread" );

#ifdef DEBUG
	m_icounter = 0;
#endif

	for ( modules_t::iterator it = m_modules.begin() ; it < m_modules.end() ; ++it ) {
		( *it )->Start();
	}

	float step_diff = 0.0f;
	float step_len;
	size_t step_len_rounded;

#ifdef DEBUG
	/*std::vector< size_t > modulensdiff = {};
	modulensdiff.resize( m_modules.size() );*/
#endif

	m_state = STATE_ACTIVE;

	Log( "Thread started, entering main loop" );

#ifdef __EMSCRIPTEN__
	if ( m_thread_name == "MAIN" ) {
		// SDL sends browser events back to the thread that initialized it. Yield
		// between frames so those events and audio callbacks can be delivered.
		// The main loop keeps this pthread alive after its C++ entry point returns;
		// Engine::Run remains on the separate PROXY_TO_PTHREAD application thread.
		emscripten_set_main_loop_arg( []( void* const arg ) {
			auto* thread = static_cast< Thread* >( arg );
			thread->IterateModules();
			if ( thread->m_command == COMMAND_STOP ) {
				thread->Log( "Received STOP command" );
				thread->StopModules();
				emscripten_cancel_main_loop();
			}
		}, this, 0, false );
		return;
	}
#endif

//	try {

	while ( m_state == STATE_ACTIVE ) {

		auto start = std::chrono::high_resolution_clock::now();

#ifdef DEBUG
		//auto mstart = start;
#endif

		IterateModules();

		auto finish = std::chrono::high_resolution_clock::now();

		auto nsdiff = std::chrono::duration_cast< std::chrono::nanoseconds >( finish - start ).count();

		step_len = 1000000000 / m_ips - step_diff;
		if ( nsdiff > step_len ) {
#ifdef DEBUG
/*	TODO: fix and add stats to debug overlay			
				Log( "Thread lag detected!" );
				for ( modules_t::iterator it = m_modules.begin() ; it != m_modules.end() ; ++it ) {
					Log( (*it)->GetName() + " " + std::to_string( modulensdiff[ it - m_modules.begin() ] ) + "ns ( " + std::to_string( (float) modulensdiff[ it - m_modules.begin() ] * 100 / step_len ) + "%)");
				}
				*/
#endif
			step_diff = 0.0f;
			// TODO: change ips?
		}
		else {
			step_len -= nsdiff;
			step_len_rounded = ceil( step_len );
			step_diff = step_len_rounded - step_len;

#ifdef DEBUG
			m_icounter++;
/*				Log( "frame " + std::to_string( m_icounter ) + ": sleeping " + std::to_string( step_len_rounded) + "ns (nsdiff: " + std::to_string( nsdiff ) + ", stepdiff: " + std::to_string( step_diff ) + ")" );
				for ( modules_t::iterator it = m_modules.begin() ; it != m_modules.end() ; ++it ) {
					Log( (*it)->GetName() + " " + std::to_string( modulensdiff[ it - m_modules.begin() ] ) + "ns ( " + std::to_string( (float) modulensdiff[ it - m_modules.begin() ] * 100 / step_len ) + "%)");
				}*/
#endif

			std::this_thread::sleep_for( std::chrono::nanoseconds( step_len_rounded ) );
		}

		switch ( m_command ) {
			case COMMAND_NONE:
				// nothing
				break;
			case COMMAND_QUIESCE:
				m_state = STATE_QUIESCENT;
				while ( m_command == COMMAND_QUIESCE ) { std::this_thread::sleep_for( std::chrono::milliseconds( 1 ) ); }
				ASSERT( m_command == COMMAND_STOP, "quiescent thread must stop" );
				m_state = STATE_STOPPING;
				break;
			case COMMAND_STOP:
				Log( "Received STOP command" );
				m_state = STATE_STOPPING;
				break;
			default:
				THROW( "unknown thread command " + std::to_string( m_command ) );
		}
	}

	StopModules();

/*	} catch ( runtime_error &e ) {

		try {
			m_state = STATE_STOPPING;
			for ( modules_t::iterator it = m_modules.end() - 1 ; it >= m_modules.begin() ; --it )
				(*it)->Stop();
			m_state = STATE_INACTIVE;
		} catch ( runtime_error &e ) {};

		throw e;
	}*/
}

void Thread::IterateModules() {
	for ( auto* module : m_modules ) {
		module->Iterate();
	}
}

void Thread::StopModules() {
	Log( "Stopping thread" );
	m_state = STATE_STOPPING;
	for ( auto it = m_modules.rbegin(); it != m_modules.rend(); ++it ) {
		( *it )->Stop();
	}
	Log( "Thread stopped" );
	m_state = STATE_INACTIVE;
}

const std::string& Thread::GetThreadName() const {
	return m_thread_name;
}

}
