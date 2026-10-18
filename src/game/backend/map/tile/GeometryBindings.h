#pragma once

#include "gse/Value.h"

namespace gse {
class Value;
}

namespace game::backend::map::tile {
// Pure geometry queries with explicit dimensions, independent of renderer state.
gse::Value* WrapGeometry( GSE_CALLABLE );
}
