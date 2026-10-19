#pragma once

#include <algorithm>

namespace game::backend::base {

// Human mineral cost factor with no base effects. Inputs use the raw map
// preset level (0..4), integer mineral rule multiplier (1..100), and signed
// social INDUSTRY rating (-8..10). This is a factor, not a facility/unit cost.
inline int HumanMineralFactor( const int map_size_level, const int mineral_rule_factor, const int industry ) {
	// Small maps reduce the rule multiplier, truncating before INDUSTRY applies.
	// Standard and larger map presets use the full multiplier.
	const int map_factor = 8 + std::min( map_size_level, 2 );
	const int mineral_factor = mineral_rule_factor * map_factor / 10;
	const int industry_factor = 10 - std::max( -2, std::min( industry, 5 ) );
	// Round the adjusted mineral factor up, retaining zero for tiny multipliers.
	return ( mineral_factor * industry_factor + 9 ) / 10;
}

}
