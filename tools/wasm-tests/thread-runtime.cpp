#include <atomic>
#include <cassert>
#include <chrono>
#include <cstdio>
#include <thread>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#include <emscripten/threading.h>
#endif

#include "common/Module.h"
#include "common/Thread.h"

namespace {

class Probe final : public common::Module {
public:
	Probe( int id, std::vector< int >& shutdown_order, bool schedule_callback )
		: m_id( id ), m_shutdown_order( shutdown_order ), m_schedule_callback( schedule_callback ) {}

	const std::string GetClassName() const override { return "Probe"; }
	std::atomic< int > frames = 0;
	std::atomic< bool > callback_delivered = false;

	void Start() override {
		m_owner = std::this_thread::get_id();
#ifdef __EMSCRIPTEN__
		if ( m_schedule_callback ) {
			// Like SDL events, this callback must run on the thread that
			// registered it, while the module continues to receive frames.
			emscripten_async_call( []( void* arg ) {
				auto* probe = static_cast< Probe* >( arg );
				assert( probe->m_owner == std::this_thread::get_id() );
				probe->callback_delivered = true;
			}, this, 10 );
			return;
		}
#endif
		callback_delivered = true;
	}

	void Iterate() override {
		assert( m_owner == std::this_thread::get_id() );
		++frames;
	}

	void Stop() override {
		assert( m_owner == std::this_thread::get_id() );
		m_shutdown_order.push_back( m_id );
	}

private:
	int m_id;
	std::vector< int >& m_shutdown_order;
	bool m_schedule_callback;
	std::thread::id m_owner;
};

}

int main() {
#ifdef __EMSCRIPTEN__
	assert( !emscripten_is_main_browser_thread() );
#endif
	std::vector< int > main_shutdown_order, worker_shutdown_order;
	Probe first( 1, main_shutdown_order, true );
	Probe second( 2, main_shutdown_order, true );
	Probe background( 3, worker_shutdown_order, false );
	common::Thread main_thread( "MAIN" ), worker_thread( "GAME" );
	main_thread.SetIPS( 120 );
	worker_thread.SetIPS( 120 );
	main_thread.AddModule( &first );
	main_thread.AddModule( &second );
	worker_thread.AddModule( &background );
	main_thread.T_Start();
	worker_thread.T_Start();

	const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds( 10 );
	while ( first.frames < 3 || background.frames < 3 || !first.callback_delivered || !second.callback_delivered ) {
		assert( std::chrono::steady_clock::now() < deadline );
		std::this_thread::sleep_for( std::chrono::milliseconds( 5 ) );
	}
	main_thread.T_Stop();
	worker_thread.T_Stop();
	while ( main_thread.T_IsRunning() || worker_thread.T_IsRunning() ) {
		assert( std::chrono::steady_clock::now() < deadline );
		std::this_thread::sleep_for( std::chrono::milliseconds( 5 ) );
	}
	assert( (main_shutdown_order == std::vector< int >{ 2, 1 }) );
	assert( (worker_shutdown_order == std::vector< int >{ 3 }) );
	puts( "Thread callbacks, module affinity, reverse shutdown and join passed" );
}
