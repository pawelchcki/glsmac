#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace script {

class SourceMap {
public:
	struct Location {
		std::string source = {};
		size_t line = 0;
		size_t column = 0;
	};
	SourceMap( const std::string& mappings, std::vector< std::string > sources );
	std::optional< Location > Resolve( size_t line, size_t column ) const;

private:
	struct Segment {
		int64_t generated = 0;
		int64_t source = -1;
		int64_t line = 0;
		int64_t column = 0;
	};
	std::vector< std::vector< Segment > > m_lines = {};
	std::vector< std::string > m_sources = {};
};

}// namespace script
