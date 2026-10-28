#pragma once

#if defined( DEBUG ) || defined( FASTDEBUG )
#include <string>

namespace gse::tests::mocks {
// Only registered by the existing C++ GSE test runner. No runtime GSE API.
std::string RunUnitBodyCensusFixture();
}
#endif
