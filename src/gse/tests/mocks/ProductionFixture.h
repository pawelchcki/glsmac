#pragma once
#include "gse/Value.h"

namespace gse::tests::mocks {
Value* MakeProductionFixture( GSE_CALLABLE, bool founding = false, bool selection = false, const std::string& initial_base_name = "Fixture Base", size_t fixture_map_size = 4 );
Value* MakeWorldStartupFixture( GSE_CALLABLE, size_t width, size_t height );
}
