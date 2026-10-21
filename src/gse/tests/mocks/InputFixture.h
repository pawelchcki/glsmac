#pragma once

#include "gse/Value.h"

namespace gse::tests::mocks {
Value* MakeInputState( GSE_CALLABLE, const std::string& initial_value, size_t max_length = 0 );
}
