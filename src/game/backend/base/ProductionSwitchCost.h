#pragma once

#include <stdexcept>

namespace game::backend::base {

// Recorded human basic-item contract: default strictness 2, penalty 50%,
// exemption 10, and no installed facilities. Item codes -64..-1 are basic
// facilities and 0..511 are units. No project, orbital or Stockpile support.
inline int BasicProductionSwitchLoss( const int previous_item, const int current_item, const int minerals ) {
	if ( previous_item < -64 || previous_item > 511 || current_item < -64 || current_item > 511 || minerals < 0 || minerals > 1000000 ) {
		throw std::out_of_range( "Unsupported basic production switch input" );
	}
	if ( previous_item == current_item || minerals <= 10 ) {
		return 0;
	}
	return ( minerals - 10 + 1 ) / 2;
}

}
