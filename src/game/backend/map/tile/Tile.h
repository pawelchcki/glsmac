#pragma once

#include <cstdint>
#include <array>
#include <vector>
#include <map>
#include <unordered_map>
#include <string>

#include "gse/Wrappable.h"
#include "game/backend/ResourceRelated.h"

#include "Types.h"

#include "types/Buffer.h"

namespace game {
namespace backend {

namespace slot {
class Slot;
}

namespace unit {
class Unit;
}

namespace base {
class Base;
}

namespace map {
class Map;
namespace tile {

class Tiles;

// WARNING: for now everything is public (because it's not clear what should be hidden from what)
//   you can read any properties you need
//   but be careful modifying anything, some things are only to be modified within Tile::Update() to keep consistent state
// Some day this class will be refactored with access isolation and getters/setters
class Tile : public gse::Wrappable, public ResourceRelated {
public:

	typedef std::unordered_map< std::string, uint8_t > resources_t;

	Tiles* tiles = nullptr;

	coords_t coord;

	// when reading or writing elevation - work only with values, make sure to not modify pointers themselves!
	// pointers are set only once by Tiles and are not to be changed after
	struct {
		elevation_t* center = nullptr;
		elevation_t* left = nullptr;
		elevation_t* top = nullptr;
		elevation_t* right = nullptr;
		elevation_t* bottom = nullptr;
		std::vector< elevation_t* > corners = {}; // for more convenient iteration, contains left, top, right and bottom pointers
	} elevation;

	struct { // moved to separate structure to allow main structure to have only pointers, for consistency
		elevation_t bottom;
		elevation_t center;
	} elevation_data;

	// links to adjactent tiles ( west, north, east, south and combinations )
	// will be linked to itself if tile is at north or south map edge
	// never modify these pointers, work only with values
	Tile* W = nullptr;
	Tile* NW = nullptr;
	Tile* N = nullptr;
	Tile* NE = nullptr;
	Tile* E = nullptr;
	Tile* SE = nullptr;
	Tile* S = nullptr;
	Tile* SW = nullptr;
	std::vector< Tile* > neighbours = {}; // for more convenient iteration, contains all neighbouring tiles

	static const std::unordered_map< direction_t, std::string > s_direction_str;
	static const std::string& GetDirectionString( const direction_t direction );
	Tile* GetNeighbour( const direction_t direction );

	// dynamic parameters, do not modify them manually
	bool is_water_tile = false;

	moisture_t moisture;
	rockiness_t rockiness;
	bonus_t bonus;
	feature_t features;
	terraforming_t terraforming;

	// units (id -> unit)
	std::map< size_t, unit::Unit* > units = {};

	base::Base* base = nullptr;

	// WARNING: make sure to call this after changing something in tile
	//   it recalculates dynamic properties and solves inconsistencies
	//   safe to call anytime
	void Update();
	static const std::array< std::string, 13 > s_terraforming_names;

	// Original SMAC maps store center heights and a separate land/sea class.
	// Preserve them until an actual edit changes one of the shared corners.
	void SetImportedElevation( const elevation_t value, const bool water );
	// A gameplay center/class is independent of shared render vertices.
	void SetCanonicalElevation( elevation_t value, bool water, bool edited = true );

	// reset to empty state
	void Clear();

	const bool IsAdjactentTo( const Tile* other ) const;

	const types::Buffer Serialize() const;
	void Deserialize( types::Buffer data );

	const std::string ToString() const;

	WRAPDEFS_PTR( Tile );

	WRAPDEF_SERIALIZABLE;

	void Lock( const size_t initiator_slot );
	void Unlock();
	const bool IsLocked() const;
	const bool IsLockedBy( const size_t initiator_slot ) const;

	const resources_t GetResources( GSE_CALLABLE, slot::Slot* const slot );
	gse::value::Object* const GetResourcesAsValue( GSE_CALLABLE, slot::Slot* const slot );

private:
	friend class TileManager;
	friend class game::backend::map::Map;
	struct WrappedTerrainFields {
		elevation_t elevation;
		bool water;
		moisture_t moisture;
		rockiness_t rockiness;
		feature_t features;
		bonus_t bonus;
		terraforming_t terraforming;
	};
	struct WrappedTerrainUpdate {
		gse::value::Object* wrapper;
		gse::value::object_properties_t fields;
	};
	std::vector< WrappedTerrainUpdate > PrepareWrappedTerrain( GSE_CALLABLE, const WrappedTerrainFields& fields );
	static void PublishWrappedTerrain( const std::vector< WrappedTerrainUpdate >& updates );
	int64_t m_terrain_revision = 0;
	int64_t m_terrain_epoch = 0;
	std::array< int8_t, 13 > m_terraforming_owners = [](){ std::array< int8_t, 13 > value; value.fill( -1 ); return value; }();
	bool m_has_canonical_elevation = false;
	elevation_t m_canonical_elevation = 0;
	bool m_canonical_water = false;
	bool m_has_imported_elevation = false;
	elevation_t m_imported_elevation = 0;
	bool m_imported_water = false;
	std::array< elevation_t, 4 > m_imported_corners = {};

	bool m_is_locked = false;
	size_t m_lock_initiator_slot = 0;

	gse::Value* const GetFeatures( GSE_CALLABLE ) const;
	gse::Value* const GetBonuses( GSE_CALLABLE ) const;
	gse::Value* const GetTerraforming( GSE_CALLABLE ) const;
	gse::Value* GetTerraformingOwners( GSE_CALLABLE ) const;

};

}
}
}
}
