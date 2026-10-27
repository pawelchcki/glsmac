#pragma once

#include <string>

#include "Types.h"
#include "types/Buffer.h"

#include "game/backend/map/tile/Types.h"
#include "gse/Wrappable.h"

namespace game {
namespace backend {

namespace map {
namespace tile {
class Tile;
class TileState;
}
}

namespace unit {

class MoraleSet;
class UnitManager;

class Def : public gse::Wrappable {
public:

	Def( const std::string& id, const MoraleSet* moraleset, const def_type_t type, const std::string& name );
	virtual ~Def() = default;

	const std::string m_id;
	const MoraleSet* m_moraleset;
	const def_type_t m_type;
	const std::string m_name;
	struct combat_t {
		std::string kind = "psi";
		int offense = 0;
		int defense = 0;
		int reactor = 1;
		bool operator==( const combat_t& other ) const {
			return kind == other.kind && offense == other.offense && defense == other.defense && reactor == other.reactor;
		}
	};
	static combat_t ParseCombat( GSE_CALLABLE, const gse::value::object_properties_t& values );
	void SetCombat( const combat_t& combat );
	const combat_t& GetCombat() const { return m_combat; }
	bool CanTerraform() const { return m_can_terraform; }
	void SetCanTerraform( bool enabled );

	virtual const movement_type_t GetMovementType() const = 0;

	virtual const std::string ToString( const std::string& prefix = "" ) const = 0;

	static const types::Buffer Serialize( const Def* def );
	static Def* Deserialize( types::Buffer& buf, const UnitManager* manager );

	WRAPDEFS_PTR( Def );

private:
	combat_t m_combat;
	bool m_can_terraform = false;
	static bool ValidCombat( const combat_t& combat );

};

}
}
}
