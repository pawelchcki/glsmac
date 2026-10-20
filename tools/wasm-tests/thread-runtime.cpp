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

struct CollectionState {
	std::atomic< bool > reading = false, release = false, stopping = false;
	std::atomic< bool > collector_stopped = false, teardown_overlap = false;
	std::atomic< bool > owner_stopped = false, invalid_stop_phase = false;
	bool separate_collector = true;
};

class CollectionProbe final : public common::Module {
public:
	explicit CollectionProbe( CollectionState& state ) : state( state ) {}
	const std::string GetClassName() const override { return "CollectionProbe"; }
	void Iterate() override {
		state.reading = true;
		while ( !state.release ) { std::this_thread::sleep_for( std::chrono::milliseconds( 1 ) ); }
		state.reading = false;
	}
	void Stop() override {
		state.invalid_stop_phase = state.separate_collector ? state.owner_stopped.load() : !state.owner_stopped.load();
		state.collector_stopped = true;
	}
private:
	CollectionState& state;
};

class ResourceOwnerProbe final : public common::Module {
public:
	explicit ResourceOwnerProbe( CollectionState& state ) : state( state ) {}
	const std::string GetClassName() const override { return "ResourceOwnerProbe"; }
	void Iterate() override {
		// Keep serving work while the collector drains an in-flight traversal.
		if ( state.stopping && ++draining_frames == 20 ) { state.release = true; }
	}
	void Stop() override {
		state.teardown_overlap = state.reading || ( state.separate_collector && !state.collector_stopped );
		state.release = true; // a bad stop order fails without hanging the probe
		state.owner_stopped = true;
	}
private:
	CollectionState& state;
	int draining_frames = 0;
};

void CheckCollectionShutdown( const bool separate_collector ) {
	CollectionState state;
	state.separate_collector = separate_collector;
	CollectionProbe collection( state ); ResourceOwnerProbe owner( state );
	common::Thread collector_thread( "GC" ), owner_thread( "RESOURCE_OWNER" );
	collector_thread.SetIPS( 1000 ); owner_thread.SetIPS( 1000 );
	collector_thread.AddModule( &collection ); owner_thread.AddModule( &owner );
	collector_thread.T_Start(); owner_thread.T_Start();
	const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds( 5 );
	while ( !state.reading ) {
		assert( std::chrono::steady_clock::now() < deadline );
		std::this_thread::sleep_for( std::chrono::milliseconds( 1 ) );
	}
	state.stopping = true;
	common::Thread::StopAll( { &owner_thread, &collector_thread }, separate_collector ? &collector_thread : nullptr );
	while ( collector_thread.T_IsRunning() || owner_thread.T_IsRunning() ) {
		assert( std::chrono::steady_clock::now() < deadline );
		std::this_thread::sleep_for( std::chrono::milliseconds( 1 ) );
	}
	assert( !state.teardown_overlap );
	assert( !state.invalid_stop_phase );
	puts( separate_collector ? "In-flight collection finishes and joins before resource teardown" :
		"Background workers quiesce before UI-owned script state teardown" );
}

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
	common::Thread::StopAll( { &main_thread, &worker_thread } );
	while ( main_thread.T_IsRunning() || worker_thread.T_IsRunning() ) {
		assert( std::chrono::steady_clock::now() < deadline );
		std::this_thread::sleep_for( std::chrono::milliseconds( 5 ) );
	}
	assert( (main_shutdown_order == std::vector< int >{ 2, 1 }) );
	assert( (worker_shutdown_order == std::vector< int >{ 3 }) );
	puts( "Thread callbacks, module affinity, reverse shutdown and join passed" );
	CheckCollectionShutdown( true );
	CheckCollectionShutdown( false );
}
