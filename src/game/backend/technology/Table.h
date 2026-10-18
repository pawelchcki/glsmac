#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace game {
namespace backend {
namespace technology {

// Bounded technology rules. Definitions/ownership are supplied by the caller;
// this table does not load shipped rules or implement a research planner.
class Table {
public:
	static constexpr int COUNT = 89;
	static constexpr int NONE = -1;
	static constexpr int DISABLED = -2;
	static constexpr int REPEATABLE = 88;

	struct Technology {
		std::array< int, 2 > prerequisites = { DISABLED, DISABLED };
		uint8_t owners = 0;
		// Growth, technology, wealth, power. Equal weights prefer earlier fields.
		std::array< int16_t, 4 > weights = {};
	};

	void Clear();
	void Set( const int id, const Technology& technology );
	const Technology& Get( const int id ) const;

	bool HasTech( const int id, const int faction_id ) const;
	int GetCategory( const int id ) const;
	bool IsAvailable( const int id, const int faction_id, const bool expansion_enabled ) const;
	bool IsPrerequisite( const int ancestor_id, const int id, const unsigned int max_depth ) const;

private:
	std::array< Technology, COUNT > m_technologies = {};
};

}
}
}
