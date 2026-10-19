#pragma once

#include <cstdint>
#include <string>
#include "types/Buffer.h"

namespace game::backend::base {

// Integer mineral credit and the last actual processing/selection turn. Empty
// choice IDs mean idle; excess credit survives completion without auto-repeat.
struct ProductionState {
	std::string choice_id;
	int64_t minerals = 0;
	int64_t last_processed_turn = 0;

	bool operator==( const ProductionState& other ) const {
		return choice_id == other.choice_id && minerals == other.minerals && last_processed_turn == other.last_processed_turn;
	}
	void Serialize( types::Buffer& buf ) const {
		buf.WriteString( choice_id );
		buf.WriteInt( minerals );
		buf.WriteInt( last_processed_turn );
	}
	static ProductionState Deserialize( types::Buffer& buf ) {
		ProductionState state;
		state.choice_id = buf.ReadString();
		state.minerals = buf.ReadInt();
		state.last_processed_turn = buf.ReadInt();
		if ( state.minerals < 0 || state.last_processed_turn < 0 ) { THROW( "invalid base production state" ); }
		return state;
	}
};

}
