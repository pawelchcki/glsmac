#include "Table.h"

#include <algorithm>
#include <stdexcept>

namespace game {
namespace backend {
namespace technology {

void Table::Clear() {
	m_technologies = {};
}

void Table::Set( const int id, const Technology& technology ) {
	if ( id < 0 || id >= COUNT ) {
		throw std::out_of_range( "Invalid technology id" );
	}
	for ( const auto prerequisite : technology.prerequisites ) {
		if ( prerequisite < DISABLED || prerequisite >= COUNT ) {
			throw std::out_of_range( "Invalid prerequisite id" );
		}
	}
	m_technologies[ id ] = technology;
}

const Table::Technology& Table::Get( const int id ) const {
	if ( id < 0 || id >= COUNT ) {
		throw std::out_of_range( "Invalid technology id" );
	}
	return m_technologies[ id ];
}

bool Table::HasTech( const int id, const int faction_id ) const {
	if ( faction_id < 1 || faction_id > 7 ) {
		return false;
	}
	if ( id == NONE ) {
		return true;
	}
	// The final technology is repeatable and never counts as possessed.
	if ( id < 0 || id >= REPEATABLE ) {
		return false;
	}
	const auto& technology = m_technologies[ id ];
	const auto& prerequisites = technology.prerequisites;
	const auto enabled = prerequisites[ 0 ] == NONE ||
		( prerequisites[ 0 ] >= 0 && prerequisites[ 1 ] != DISABLED );
	return enabled && ( technology.owners & ( 1u << faction_id ) );
}

int Table::GetCategory( const int id ) const {
	const auto& weights = Get( id ).weights;
	return std::max_element( weights.begin(), weights.end() ) - weights.begin();
}

bool Table::IsAvailable( const int id, const int faction_id, const bool expansion_enabled ) const {
	if ( id < 0 || id >= COUNT || faction_id < 1 || faction_id > 7 ||
		( !expansion_enabled && id >= 78 && id <= 86 ) || HasTech( id, faction_id ) ) {
		return false;
	}
	const auto& prerequisites = m_technologies[ id ].prerequisites;
	return HasTech( prerequisites[ 0 ], faction_id ) && HasTech( prerequisites[ 1 ], faction_id );
}

bool Table::IsPrerequisite( const int ancestor_id, const int id, const unsigned int max_depth ) const {
	if ( ancestor_id < 0 || ancestor_id >= COUNT || id < 0 || id >= COUNT ) {
		return false;
	}
	// A breadth-first walk observes the edge-depth limit, visits each row once,
	// and terminates on cycles even when callers supply a large depth limit.
	std::array< bool, COUNT > visited = {};
	struct Pending {
		int id;
		unsigned int depth;
	};
	std::array< Pending, COUNT > pending = {};
	size_t begin = 0;
	size_t end = 1;
	pending[ 0 ] = { id, 0 };
	visited[ id ] = true;
	while ( begin < end ) {
		const auto current = pending[ begin++ ];
		if ( current.id == ancestor_id ) {
			return true;
		}
		if ( current.depth == max_depth ) {
			continue;
		}
		for ( const auto prerequisite : m_technologies[ current.id ].prerequisites ) {
			if ( prerequisite >= 0 && !visited[ prerequisite ] ) {
				visited[ prerequisite ] = true;
				pending[ end++ ] = { prerequisite, current.depth + 1 };
			}
		}
	}
	return false;
}

}
}
}
