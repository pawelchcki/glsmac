#pragma once

#include <algorithm>
#include <cstdint>
#include <stdexcept>

namespace game::backend::technology {

// Uncached human requirement, inferred from bounded independent observations.
// Earned and ranking are explicit state inputs, not counts of owned table rows.
// Rival state and AI research are outside this helper's supported contract.
inline int64_t HumanResearchCost( int64_t earned, int64_t ranking, int64_t rating, int64_t difficulty,
                                 int64_t turn, int64_t area, int64_t discovery_percent, int64_t faction_percent, bool stagnation ) {
	if ( earned < 0 || earned > 8 || ranking < 0 || ranking > 16 || rating < -3 || rating > 3 ||
	     difficulty < 0 || difficulty > 5 || turn < 0 || turn > 100 || area < 10 || area > 100 ||
	     discovery_percent < 0 || discovery_percent > 200 || faction_percent < 50 || faction_percent > 150 ) {
		throw std::invalid_argument( "Unsupported human research cost input" );
	}
	if ( discovery_percent == 0 ) { return 999999999; }
	const auto count = std::max< int64_t >( 1, earned + ranking / 2 );
	const auto adjusted = std::max< int64_t >( 1, count - ( rating > 0 ? 1 : rating < 0 ? -1 : 0 ) );
	auto factor = std::max< int64_t >( 12, 12 + count - turn / ( stagnation ? 12 : 8 ) );
	factor = std::min< int64_t >( stagnation ? 36 : 24, factor );
	// Talent and Librarian share this human difficulty step.
	const auto difficulty_step = difficulty > 2 ? difficulty - 1 : difficulty;
	factor += std::min( count, 4 * difficulty_step );

	// Keep each truncation boundary: combining these fractions changes results.
	int64_t science = adjusted * factor;
	science = science * 100 / discovery_percent;
	science = science * faction_percent / 100;
	science = science * area / 56;
	if ( stagnation ) { science = science * 3 / 2; }
	return std::max< int64_t >( 1, science );
}

}
