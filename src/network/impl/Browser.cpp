#include "network/Network.h"

#include <cerrno>

namespace network {

// Browsers cannot open the native TCP sockets used by SimpleTCP. Keep module
// construction harmless; the browser transport reports errors on connection.
Network::Impl::Impl() {}
Network::Impl::~Impl() {}
void Network::Impl::Start() {}
void Network::Impl::Stop() {}

const Network::Impl::ec_t Network::Impl::GetLastErrorCode() const {
	return ENOTSUP;
}

bool Network::Impl::IsSocketInvalid( const fd_t fd ) const {
	return fd == -1;
}

void Network::Impl::ConfigureSocket( const fd_t socket ) const {}

bool Network::Impl::IsConnectionSucceeded( const ec_t ec ) const {
	return false;
}

bool Network::Impl::IsConnectionIdle( const ec_t ec ) const {
	return false;
}

const std::string Network::Impl::GetErrorMessage( const ec_t ec ) const {
	return "TCP multiplayer is unavailable in the browser build";
}

int Network::Impl::Receive( const fd_t fd, void* buf, const int len ) const {
	return -1;
}

int Network::Impl::Send( const fd_t fd, const void* buf, const int len ) const {
	return -1;
}

void Network::Impl::CloseSocket( const fd_t socket ) const {}

}
