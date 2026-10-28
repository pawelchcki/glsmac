#include <exception>

#include "engine/Engine.h"

// The probe exercises production Thread/Class with no Engine instance. A call
// through this symbol means the isolation assumption failed; never hide it.
engine::Engine* g_engine = nullptr;

void engine::Engine::Log( const std::string& ) const {
	std::terminate();
}
