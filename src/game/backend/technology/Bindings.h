#pragma once

#include "gse/Value.h"

namespace gse {
class Value;
}

namespace game::backend {
class Game;
namespace technology {
class Table;

// Faction arguments are original ownership-mask IDs: 0 is native life,
// 1..7 are playable factions. They are not GLSMAC player/slot indices.
gse::Value* WrapTable( GSE_CALLABLE, Table& table, Game* const write_guard = nullptr );
}
}
