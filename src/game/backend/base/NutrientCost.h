#pragma once

#include <algorithm>

namespace game::backend::base {

// Human nutrient factor with no base effects. Inputs use the raw map preset
// kind (named 0..4 or Custom 99), integer nutrient rule multiplier (1..100), and signed faction
// GROWTH rating (-8..10). Multiply separately by the population growth rows.
inline int HumanNutrientFactor( const int map_size_level, const int nutrient_rule_factor, const int growth ) {
	// Apply the small-map reduction before rounding the growth adjustment.
	const int map_factor = 8 + std::min( map_size_level, 2 );
	const int nutrient_factor = nutrient_rule_factor * map_factor / 10;
	// The observed -8 rating uses the minimum nutrient factor, like growth >= 5.
	const int adjusted_growth = growth == -8 ? 5 : std::max( -3, std::min( growth, 5 ) );
	return ( nutrient_factor * ( 10 - adjusted_growth ) + 9 ) / 10;
}

}
