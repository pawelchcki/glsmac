#pragma once

#include <algorithm>

namespace game {
namespace backend {
namespace unit {

// Ability-free mineral rows, before map/faction factors and prototype surcharges.
// Component costs are 1..32, triad is land/sea/air (0/1/2), offense is
// -1..127, weapon_mode is 0..14, and reactor is 1..4. Component table slots
// do not participate in this calculation.
// Recovered from recorded synthetic-component observations; this does not
// establish behavior for abilities, design validation, or production policy.
inline int PrototypeBaseCost(
	int chassis_cost,
	int triad,
	bool missile,
	int offense,
	int weapon_mode,
	int weapon_cost,
	int armor_cost,
	int reactor
) {
	if ( missile && offense >= 99 ) {
		return weapon_cost;
	}

	const int reactor_divisor = 1 << ( reactor - 1 );
	const bool armed_and_armored = weapon_cost > 1 && armor_cost > 1;
	int rows;

	if ( triad == 0 ) {
		const int weapon_weight = std::max( weapon_cost, armor_cost / 2 + 1 );
		const int component_cost = ( chassis_cost + armor_cost ) * weapon_weight / reactor_divisor;
		const int interaction = armed_and_armored ? 8 : 0;
		if ( chassis_cost == 1 ) {
			rows = ( component_cost + interaction + 10 ) / 8;
			const int minimum = weapon_cost == 1 && armor_cost == 1 ? 1 : 2;
			rows = std::max( rows, minimum );
		}
		else {
			rows = std::max( 2, ( component_cost + interaction + 2 ) / 4 );
		}
	}
	else if ( triad == 1 ) {
		const int armor_weight = armor_cost / 2 + reactor;
		const int weapon_weight = std::max( weapon_cost, armor_cost / 4 + 1 );
		const int component_cost = ( chassis_cost + armor_weight ) * weapon_weight / reactor_divisor;
		const int interaction = armed_and_armored ? 4 : 0;
		rows = weapon_mode == 11
			? ( component_cost + interaction + 2 ) / 4
			: ( component_cost + interaction + 6 ) / 8;
		rows = std::max( rows, 2 );
	}
	else {
		const int armor_weight = armor_cost > 1 ? 2 * reactor * ( armor_cost + 1 ) : 2 * reactor + 1;
		const int weapon_weight = armor_cost > 1 ? std::max( weapon_cost, armor_cost * reactor + 1 ) : weapon_cost;
		const int component_cost = ( chassis_cost + armor_weight ) * weapon_weight / reactor_divisor;
		const int interaction = armed_and_armored ? 4 : 0;
		const int mode_factor = weapon_mode > 2 ? 2 : 1;
		rows = std::max( 2, ( component_cost + interaction + 2 ) * mode_factor / 16 );
	}

	return std::max( rows, 5 * reactor / 3 );
}

}
}
}
