#pragma once

#include <memory>
#include <vector>

#include "Conditional.h"

namespace gse {
namespace program {

class SimpleCondition;
class Case;
class Scope;

class Switch : public Conditional {
private:
	std::unique_ptr< const Scope > m_body;

public:
	Switch( const si_t& si, const SimpleCondition* condition, const std::vector< Case* >& cases, std::unique_ptr< const Scope > body );
	~Switch();

	const SimpleCondition* condition;
	const std::vector< Case* > cases;

	const std::string Dump( const size_t depth = 0 ) const override;
};

}
}

