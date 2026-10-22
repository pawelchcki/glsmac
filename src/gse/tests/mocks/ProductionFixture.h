#pragma once
#include "gse/Value.h"
#include <string>
#include <vector>

namespace gse::tests::mocks {
Value* MakeProductionFixture( GSE_CALLABLE, bool founding = false, bool selection = false, const std::string& initial_base_name = "Fixture Base", size_t fixture_map_size = 4, const std::vector< std::string >& land_names = {} );
Value* MakeWorldStartupFixture( GSE_CALLABLE, size_t width, size_t height );
Value* MakeNaturalStartupFixture( GSE_CALLABLE, size_t width, size_t height, const std::string& terrain );
}
