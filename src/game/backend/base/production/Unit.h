#pragma once

#include "Production.h"

namespace game::backend {
class Game;
class Player;
namespace base::production {

// A declared application recipe. Component arithmetic and the human mineral
// factor have separate evidence; citizen consumption is GLSMAC policy.
class Unit : public Production {
public:
	Unit( const std::string& unit_id, int64_t cost, int64_t cost_rows, int64_t population_cost );
	const std::string unit_id;
	const int64_t cost;
	const int64_t cost_rows;
	const int64_t population_cost;
	int64_t GetMineralCost( const Game* game, const Player* player ) const;

private:
	friend class Production;
	static const Production* const DeserializeImpl( types::Buffer& buf );
	void SerializeImpl( types::Buffer& buf ) const override;
};

}
}
