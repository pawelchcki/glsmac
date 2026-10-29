#pragma once

#include <cstdint>
#include <map>
#include <string>
#include <utility>
#include <variant>
#include <vector>

namespace script {

// Values cross by copy. No native pointers, callable objects or borrowed views.
struct Undefined {};
struct Value {
	using Array = std::vector< Value >;
	using Object = std::map< std::string, Value >;
	using Data = std::variant< Undefined, std::nullptr_t, bool, int64_t, float, std::string, Array, Object >;
	Data data = Undefined{};
	Value() = default;
	explicit Value( Data input )
		: data( std::move( input ) ) {}
};

}// namespace script
