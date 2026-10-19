#include "Unit.h"

#include "game/backend/base/ProductionCost.h"
#include <limits>

namespace game::backend::base::production {

Unit::Unit( const std::string& unit_id, int64_t cost, int64_t cost_rows, int64_t population_cost )
	: Production( PT_UNIT ), unit_id( unit_id ), cost( cost ), cost_rows( cost_rows ), population_cost( population_cost ) {
	if ( unit_id != "ColonyPod" || cost <= 0 || cost_rows <= 0 || cost_rows > std::numeric_limits< int64_t >::max() / 10 || population_cost != 1 ) { THROW( "invalid colony production recipe" ); }
}

int64_t Unit::GetMineralCost( const Game* game, const Player* player ) const {
	return DeclaredMineralCost( game, player, cost, cost_rows );
}

void Unit::SerializeImpl( types::Buffer& buf ) const {
	buf.WriteString( unit_id ); buf.WriteInt( cost ); buf.WriteInt( cost_rows ); buf.WriteInt( population_cost );
}

const Production* const Unit::DeserializeImpl( types::Buffer& buf ) {
	const auto id = buf.ReadString(); const auto cost = buf.ReadInt();
	const auto rows = buf.ReadInt(); const auto population = buf.ReadInt();
	return new Unit( id, cost, rows, population );
}

}
