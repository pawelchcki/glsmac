#pragma once

#include <algorithm>
#include <cstdint>

namespace game::backend { class Game; class Player; }

namespace game::backend::base {

int64_t DeclaredMineralCost( const Game* game, const Player* player, int64_t fallback, int64_t rows );
// A supported row declaration may resolve to exactly zero. An explicit zero
// fallback without this pricing context is not a constructible project.
bool HasDeclaredMineralCost( const Game* game, const Player* player, int64_t rows );

// Human mineral cost factor with no base effects. Inputs use the raw map
// size kind (named 0..4 or Custom 99), integer mineral rule multiplier (1..100), and signed
// social INDUSTRY rating (-8..10). This is a factor, not a facility/unit cost.
inline int HumanMineralFactor( const int map_size_level, const int mineral_rule_factor, const int industry ) {
	// Small maps reduce the rule multiplier, truncating before INDUSTRY applies.
	// Standard and larger map presets use the full multiplier.
	const int map_factor = 8 + std::min( map_size_level, 2 );
	const int mineral_factor = mineral_rule_factor * map_factor / 10;
	// Calibrated against the original INDUSTRY row and mineral rule (v2).
	const int adjusted_industry = industry == -8 ? 5 : std::max( -3, std::min( industry, 5 ) );
	const int industry_factor = 10 - adjusted_industry;
	// Round the adjusted mineral factor up, retaining zero for tiny multipliers.
	return ( mineral_factor * industry_factor + 9 ) / 10;
}

}
