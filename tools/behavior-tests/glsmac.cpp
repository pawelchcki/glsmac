#include "game/backend/map/tile/Geometry.h"

#include <cstdint>
#include <iostream>
#include <sstream>
#include <string>

int main() {
	std::string line;
	while ( std::getline( std::cin, line ) ) {
		std::istringstream input( line );
		int64_t width, x1, x2, y;
		std::string extra;
		if ( !( input >> width >> x1 >> x2 >> y ) || ( input >> extra ) ||
			width < 4 || width > 4096 || width % 2 != 0 ||
			x1 < 0 || x1 >= width || x2 < 0 || x2 >= width ||
			y < 0 || y > 4095 || x1 % 2 != y % 2 || x2 % 2 != y % 2 ) {
			std::cerr << "Invalid same-row distance input\n";
			return 1;
		}
		std::cout << game::backend::map::tile::GetTileDistance( x1, y, x2, y, width ) << '\n';
	}
	if ( !std::cin.eof() ) {
		std::cerr << "Cannot read distance input\n";
		return 1;
	}
	return 0;
}
