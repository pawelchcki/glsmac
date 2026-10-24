#pragma once

#include <array>
#include <cstdint>

#include "types/Buffer.h"

namespace game::backend::technology {

// Research choices and science stores are separate from technology ownership.
class Research {
public:
	static constexpr size_t PLAYERS = 7;
	struct State {
		int64_t target = -1;
		uint8_t priorities = 1; // Explore, Discover, Build, Conquer.
		int64_t science = 0;
		int64_t income_turn = 0;
		bool operator==( const State& other ) const {
			return target == other.target && priorities == other.priorities && science == other.science && income_turn == other.income_turn;
		}
	};
	const State& Get( size_t player ) const;
	void Set( size_t player, const State& state );
	void Clear();
	types::Buffer Serialize() const;
	void Deserialize( types::Buffer buffer );

private:
	std::array< State, PLAYERS > m_players = {};
};

}
