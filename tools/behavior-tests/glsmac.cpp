#include "game/backend/map/tile/Geometry.h"
#include "game/backend/technology/Table.h"
#include "game/backend/base/ProductionCost.h"
#include "game/backend/base/NutrientCost.h"
#include "game/backend/unit/PrototypeCost.h"

#include <array>
#include <cstdint>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

using game::backend::technology::Table;
namespace geometry = game::backend::map::tile;

namespace {

int ReadInteger( std::istringstream& input, const int minimum, const int maximum ) {
	int64_t value;
	if ( !( input >> value ) || value < minimum || value > maximum ) {
		throw std::invalid_argument( "Invalid candidate input integer" );
	}
	return value;
}

void ReadTechnologies( std::istringstream& input, Table& table ) {
	const auto count = ReadInteger( input, 0, Table::COUNT );
	std::array< bool, Table::COUNT > seen = {};
	for ( int index = 0; index < count; index++ ) {
		const auto id = ReadInteger( input, 0, Table::COUNT - 1 );
		if ( seen[ id ] ) {
			throw std::invalid_argument( "Duplicate technology id" );
		}
		seen[ id ] = true;
		Table::Technology technology;
		technology.prerequisites[ 0 ] = ReadInteger( input, -2, Table::COUNT - 1 );
		technology.prerequisites[ 1 ] = ReadInteger( input, -2, Table::COUNT - 1 );
		technology.owners = ReadInteger( input, 0, 255 );
		table.Set( id, technology );
	}
}

int Evaluate( std::istringstream& input ) {
	std::string algorithm;
	input >> algorithm;
	if ( algorithm == "same_row" ) {
		const auto width = ReadInteger( input, 4, 4096 );
		const auto x1 = ReadInteger( input, 0, width - 1 );
		const auto x2 = ReadInteger( input, 0, width - 1 );
		const auto y = ReadInteger( input, 0, 4095 );
		if ( width % 2 || x1 % 2 != y % 2 || x2 % 2 != y % 2 ) {
			throw std::invalid_argument( "Invalid same-row coordinates" );
		}
		return geometry::GetTileDistance( x1, y, x2, y, width );
	}
	if ( algorithm == "raw_vector" ) {
		const auto dx = ReadInteger( input, -4095, 4095 );
		const auto dy = ReadInteger( input, -4095, 4095 );
		return geometry::GetRawVectorDistance( dx, dy );
	}
	if ( algorithm == "vector" ) {
		const auto width = ReadInteger( input, 4, 4096 );
		const auto height = ReadInteger( input, 2, 4096 );
		const auto flat = ReadInteger( input, 0, 1 );
		const auto x1 = ReadInteger( input, 0, width - 1 );
		const auto y1 = ReadInteger( input, 0, height - 1 );
		const auto x2 = ReadInteger( input, 0, width - 1 );
		const auto y2 = ReadInteger( input, 0, height - 1 );
		if ( width % 2 || x1 % 2 != y1 % 2 || x2 % 2 != y2 % 2 ) {
			throw std::invalid_argument( "Invalid vector coordinates" );
		}
		return geometry::GetVectorDistance( x1, y1, x2, y2, width, flat );
	}
	if ( algorithm == "prototype_base_cost" ) {
		// Record IDs place original fixture data; the production helper receives
		// the explicit component properties stored in those selected records.
		ReadInteger( input, 0, 8 ); ReadInteger( input, 0, 25 ); ReadInteger( input, 0, 13 );
		const auto triad = ReadInteger( input, 0, 2 );
		const auto chassis = ReadInteger( input, 1, 32 );
		const auto missile = ReadInteger( input, 0, 1 );
		const auto offense = ReadInteger( input, -1, 127 );
		const auto mode = ReadInteger( input, 0, 14 );
		const auto weapon = ReadInteger( input, 1, 32 );
		const auto armor = ReadInteger( input, 1, 32 );
		const auto reactor = ReadInteger( input, 1, 4 );
		return game::backend::unit::PrototypeBaseCost( chassis, triad, missile, offense, mode, weapon, armor, reactor );
	}
	if ( algorithm == "human_nutrient_factor" ) {
		ReadInteger( input, 1, 7 ); // original human fixture faction identity
		const auto level = ReadInteger( input, 0, 4 );
		const auto rule = ReadInteger( input, 1, 100 );
		const auto growth = ReadInteger( input, -8, 10 );
		return game::backend::base::HumanNutrientFactor( level, rule, growth );
	}
	if ( algorithm == "human_mineral_factor" ) {
		// Faction identity controls the original human fixture. GLSMAC's pure
		// helper receives the corresponding faction's explicit industry rating.
		ReadInteger( input, 1, 7 );
		const auto size = ReadInteger( input, 0, 4 );
		const auto rule = ReadInteger( input, 1, 100 );
		const auto industry = ReadInteger( input, -8, 10 );
		return game::backend::base::HumanMineralFactor( size, rule, industry );
	}
	Table table;
	if ( algorithm == "has_tech" ) {
		const auto id = ReadInteger( input, -2, Table::COUNT );
		const auto faction = ReadInteger( input, 0, 7 );
		Table::Technology technology;
		technology.prerequisites[ 0 ] = ReadInteger( input, -2, Table::COUNT - 1 );
		technology.prerequisites[ 1 ] = ReadInteger( input, -2, Table::COUNT - 1 );
		technology.owners = ReadInteger( input, 0, 255 );
		if ( id >= 0 && id < Table::COUNT ) {
			table.Set( id, technology );
		}
		return table.HasTech( id, faction );
	}
	if ( algorithm == "category" ) {
		Table::Technology technology;
		for ( auto& weight : technology.weights ) {
			weight = ReadInteger( input, -32768, 32767 );
		}
		table.Set( 0, technology );
		return table.GetCategory( 0 );
	}
	if ( algorithm == "available" ) {
		const auto id = ReadInteger( input, 0, Table::COUNT - 1 );
		const auto faction = ReadInteger( input, 0, 7 );
		const auto expansion = ReadInteger( input, 0, 1 );
		ReadTechnologies( input, table );
		return table.IsAvailable( id, faction, expansion );
	}
	if ( algorithm == "prerequisite" ) {
		const auto ancestor = ReadInteger( input, -2, Table::COUNT - 1 );
		const auto id = ReadInteger( input, -2, Table::COUNT - 1 );
		const auto depth = ReadInteger( input, 0, 5 );
		ReadTechnologies( input, table );
		return table.IsPrerequisite( ancestor, id, depth );
	}
	throw std::invalid_argument( "Unknown candidate algorithm" );
}

}

int main() {
	try {
		std::string line;
		while ( std::getline( std::cin, line ) ) {
			std::istringstream input( line );
			const auto result = Evaluate( input );
			std::string extra;
			if ( input >> extra ) {
				throw std::invalid_argument( "Trailing candidate input" );
			}
			std::cout << result << '\n';
		}
		if ( !std::cin.eof() ) {
			throw std::invalid_argument( "Cannot read candidate input" );
		}
	}
	catch ( const std::exception& error ) {
		std::cerr << error.what() << '\n';
		return 1;
	}
	return 0;
}
