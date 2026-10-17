#include "SimpleTCP.h"

namespace network {
namespace simpletcp {

SimpleTCP::SimpleTCP()
	: Network() {}

void SimpleTCP::Start() {
	m_impl.Start();
}

void SimpleTCP::Stop() {
	m_impl.Stop();
}

void SimpleTCP::Iterate() {
	Network::Iterate();
}

MT_Response SimpleTCP::ListenStart() {
	return Error( "TCP multiplayer hosting is unavailable in the browser build" );
}

MT_Response SimpleTCP::ListenStop() {
	return Success();
}

MT_Response SimpleTCP::Connect( const std::string& remote_address, MT_CANCELABLE ) {
	return Error( "TCP multiplayer connections are unavailable in the browser build" );
}

MT_Response SimpleTCP::Disconnect() {
	return Success();
}

MT_Response SimpleTCP::DisconnectClient( const network::cid_t cid ) {
	return Success();
}

void SimpleTCP::ProcessEvents() {
	// Drain requests so stale outbound packets cannot accumulate in the stub.
	GetEvents();
}

}
}
