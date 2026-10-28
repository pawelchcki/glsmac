#pragma once

#include <memory>
#include <string>

#include "gse/Bindings.h"
#include "script/Runtime.h"

namespace gse::builtins {

// Temporary value-only adapter for the modules whose policy has moved to TS.
class JavaScript : public Bindings {
public:
	void AddToContext( gc::Space* gc_space, context::Context* ctx, ExecutionPointer& ep ) override;

private:
	std::unique_ptr< script::Runtime > m_runtime = {};
	std::string m_manifest = {};
	std::string m_directory = {};
};

}// namespace gse::builtins
