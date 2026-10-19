#pragma once

namespace loader {
namespace txt {

class FactionTXTLoader;
class SmacTextLoader;

class TXTLoaders {
public:
	TXTLoaders();
	~TXTLoaders();

	FactionTXTLoader* const factions;
	SmacTextLoader* const smac_text;
};

}
}
