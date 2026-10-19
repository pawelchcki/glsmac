#include "TXTLoaders.h"

#include "FactionTXTLoader.h"
#include "SmacTextLoader.h"

namespace loader {
namespace txt {

TXTLoaders::TXTLoaders()
	: factions( new FactionTXTLoader() )
	, smac_text( new SmacTextLoader() ) {
	//
}
TXTLoaders::~TXTLoaders() {
	delete factions;
	delete smac_text;
}

}
}
