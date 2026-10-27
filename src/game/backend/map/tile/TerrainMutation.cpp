#include "TileManager.h"
#include "Tile.h"
#include "game/backend/Game.h"
#include "game/backend/State.h"
#include "game/backend/slot/Slots.h"
#include "game/backend/slot/Slot.h"
#include "game/backend/map/Map.h"
#include "game/backend/unit/Unit.h"
#include "game/backend/unit/Def.h"
#include "game/backend/unit/UnitManager.h"
#include "gse/value/Int.h"
#include "gse/value/Bool.h"
#include <limits>
#include <iterator>

namespace game::backend::map::tile {

int64_t TileManager::ApplyTerrain( GSE_CALLABLE, const std::vector< gse::Value* >& patches, const std::vector< gse::Value* >& workers, const bool apply ) {
	if ( apply ) { m_game->CheckRW( GSE_CALL ); CheckCustomMutation( GSE_CALL ); }
	auto* map = GetMap( GSE_CALL ); map->ValidateTerrainMutation();
	if ( patches.empty() || patches.size() > MAX_TERRAIN_PATCHES || workers.size() > 64 || m_next_terrain_receipt == std::numeric_limits< int64_t >::max() ) {
		GSE_ERROR( gse::EC.INVALID_CALL, "Invalid terrain patch count or receipt capacity" );
	}
	struct Patch { Tile* tile; moisture_t moisture; rockiness_t rockiness; feature_t features; terraforming_t terraforming; std::array< int8_t, 13 > owners; };
	std::vector< Patch > prepared;
	std::map< Tile*, size_t > prepared_indices;
	std::vector< Tile::WrappedTerrainUpdate > wrapper_updates;
	std::set< std::pair< size_t, size_t > > targets, region;
	std::map< elevation_t*, elevation_t > vertices;
	std::map< Tile*, std::pair< elevation_t, bool > > canonical;
	const auto integer = [ & ]( const gse::value::object_properties_t& object, const char* key, const int64_t minimum, const int64_t maximum ) {
		const auto it = object.find( key );
		if ( it == object.end() || it->second->Deref()->type != gse::VT_INT ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain patch needs integer " + std::string( key ) ); }
		const auto number = static_cast< const gse::value::Int* >( it->second->Deref() )->value;
		if ( number < minimum || number > maximum ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain patch value outside bounds: " + std::string( key ) ); }
		return number;
	};
	for ( auto* value : patches ) {
		value = value->Deref();
		if ( value->type != gse::VT_OBJECT ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain patch must be an object" ); }
		const auto& object = static_cast< const gse::value::Object* >( value )->value;
		for ( const auto& entry : object ) {
			if ( entry.first != "x" && entry.first != "y" && entry.first != "moisture" && entry.first != "rockiness" &&
				entry.first != "features" && entry.first != "terraforming" && entry.first != "elevation" && entry.first != "canonical" && entry.first != "terraforming_owners" ) {
				GSE_ERROR( gse::EC.INVALID_CALL, "Unknown terrain patch field: " + entry.first );
			}
		}
		if ( object.size() < 3 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain patch needs a changed field" ); }
		auto* tile = GetTileAt( GSE_CALL, integer( object, "x", 0, map->GetWidth() - 1 ), integer( object, "y", 0, map->GetHeight() - 1 ) );
		const auto position = std::make_pair( tile->coord.y, tile->coord.x );
		if ( !targets.emplace( position ).second ) { GSE_ERROR( gse::EC.INVALID_CALL, "Duplicate terrain patch tile" ); }
		Patch patch { tile, tile->moisture, tile->rockiness, tile->features, tile->terraforming, tile->m_terraforming_owners };
		if ( object.count( "moisture" ) ) { patch.moisture = integer( object, "moisture", MOISTURE_NONE, MOISTURE_RAINY ); }
		if ( object.count( "rockiness" ) ) { patch.rockiness = integer( object, "rockiness", ROCKINESS_NONE, ROCKINESS_ROCKY ); }
		const auto flags = [ & ]( const char* key, const std::vector< std::pair< std::string, uint16_t > >& names ) {
			auto* data = object.at( key )->Deref();
			if ( data->type != gse::VT_OBJECT ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain flags must be an object" ); }
			const auto& values = static_cast< const gse::value::Object* >( data )->value;
			if ( values.size() != names.size() ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain flags require every named boolean" ); }
			uint16_t result = 0;
			for ( const auto& name : names ) {
				const auto found = values.find( name.first );
				if ( found == values.end() || found->second->Deref()->type != gse::VT_BOOL ) { GSE_ERROR( gse::EC.INVALID_CALL, "Invalid terrain boolean: " + name.first ); }
				if ( static_cast< const gse::value::Bool* >( found->second->Deref() )->value ) { result |= name.second; }
			}
			return result;
		};
		if ( object.count( "features" ) ) {
			patch.features = ( tile->features & ~uint16_t( 0x7fff ) ) | flags( "features", {
				{ "river", FEATURE_RIVER }, { "monolith", FEATURE_MONOLITH }, { "xenofungus", FEATURE_XENOFUNGUS },
				{ "jungle", FEATURE_JUNGLE }, { "uranium", FEATURE_URANIUM }, { "geothermal", FEATURE_GEOTHERMAL },
				{ "unity_pod", FEATURE_UNITY_POD }, { "volcano", FEATURE_VOLCANO }, { "sunny_mesa", FEATURE_SUNNY_MESA },
				{ "garland_crater", FEATURE_GARLAND_CRATER }, { "fossil_field_ridge", FEATURE_FOSSIL_FIELD_RIDGE },
				{ "unity_energy", FEATURE_UNITY_ENERGY }, { "unity_chopper", FEATURE_UNITY_CHOPPER },
				{ "unity_radar", FEATURE_UNITY_RADAR }, { "dunes", FEATURE_DUNES },
			} );
		}
		if ( object.count( "terraforming" ) ) {
			patch.terraforming = ( tile->terraforming & ~uint16_t( 0x1fff ) ) | flags( "terraforming", {
				{ "road", TERRAFORMING_ROAD }, { "mag_tube", TERRAFORMING_MAG_TUBE }, { "forest", TERRAFORMING_FOREST },
				{ "farm", TERRAFORMING_FARM }, { "soil_enricher", TERRAFORMING_SOIL_ENRICHER }, { "solar", TERRAFORMING_SOLAR },
				{ "mine", TERRAFORMING_MINE }, { "condenser", TERRAFORMING_CONDENSER }, { "mirror", TERRAFORMING_MIRROR },
				{ "borehole", TERRAFORMING_BOREHOLE }, { "sensor", TERRAFORMING_SENSOR }, { "bunker", TERRAFORMING_BUNKER }, { "airbase", TERRAFORMING_AIRBASE },
			} );
		}
		if ( object.count( "terraforming_owners" ) ) {
			auto* value = object.at( "terraforming_owners" )->Deref();
			if ( value->type != gse::VT_OBJECT ) { GSE_ERROR( gse::EC.INVALID_CALL, "Improvement owners require a complete dictionary" ); }
			const auto& values = static_cast< const gse::value::Object* >( value )->value;
			if ( values.size() != Tile::s_terraforming_names.size() ) { GSE_ERROR( gse::EC.INVALID_CALL, "Improvement owners require all named fields" ); }
			for ( size_t index = 0; index < Tile::s_terraforming_names.size(); ++index ) {
				const auto owner = integer( values, Tile::s_terraforming_names[index].c_str(), -1, 7 );
				if ( owner >= 0 ) {
					auto* slots = m_game->GetState()->m_slots;
					if ( !( patch.terraforming & ( 1 << index ) ) || size_t( owner ) >= slots->GetCount() || slots->GetSlot( owner ).GetState() != slot::Slot::SS_PLAYER ) {
						GSE_ERROR( gse::EC.INVALID_CALL, "Improvement owner must be a live player with an existing enhancement" );
					}
				}
				patch.owners[index] = owner;
			}
		}
		for ( size_t index = 0; index < patch.owners.size(); ++index ) { if ( !( patch.terraforming & ( 1 << index ) ) ) { patch.owners[index] = -1; } }

		if ( object.count( "canonical" ) ) {
			auto* value = object.at( "canonical" )->Deref();
			if ( value->type != gse::VT_OBJECT ) { GSE_ERROR( gse::EC.INVALID_CALL, "Canonical terrain requires elevation and is_water" ); }
			const auto& fields = static_cast< const gse::value::Object* >( value )->value;
			const auto water = fields.find( "is_water" );
			if ( fields.size() != 2 || water == fields.end() || water->second->Deref()->type != gse::VT_BOOL ) { GSE_ERROR( gse::EC.INVALID_CALL, "Canonical terrain requires a Boolean class" ); }
			canonical.emplace( tile, std::make_pair( integer( fields, "elevation", ELEVATION_MIN, ELEVATION_MAX ), static_cast< const gse::value::Bool* >( water->second->Deref() )->value ) );
		}
		if ( object.count( "elevation" ) ) {
			auto* value = object.at( "elevation" )->Deref();
			if ( value->type != gse::VT_OBJECT ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain elevation requires four corner integers" ); }
			const auto& corners = static_cast< const gse::value::Object* >( value )->value;
			if ( corners.size() != 4 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain elevation requires four corner integers" ); }
			for ( const auto& corner : std::vector< std::pair< const char*, elevation_t* > >{
				{ "left", tile->elevation.left }, { "top", tile->elevation.top }, { "right", tile->elevation.right }, { "bottom", tile->elevation.bottom },
			} ) {
				const auto number = integer( corners, corner.first, ELEVATION_MIN, ELEVATION_MAX );
				const auto existing = vertices.find( corner.second );
				if ( existing != vertices.end() && existing->second != number ) { GSE_ERROR( gse::EC.INVALID_CALL, "Conflicting shared terrain vertex" ); }
				vertices[corner.second] = number;
			}
		}
		prepared_indices.emplace( patch.tile, prepared.size() );
		prepared.push_back( patch );
	}
	if ( !canonical.empty() && !vertices.empty() ) { GSE_ERROR( gse::EC.INVALID_CALL, "Canonical center edits and direct corner edits need separate transactions" ); }
	// Reuse the importer's geometry policy: each shared render vertex is the
	// mean of all incident gameplay centers. It never becomes a neighbor's new
	// gameplay center. A complete canonical batch participates in every mean.
	for ( const auto& center : canonical ) {
		for ( auto* vertex : center.first->elevation.corners ) {
			std::set< Tile* > incident { center.first };
			for ( auto* neighbor : center.first->neighbours ) {
				for ( auto* corner : neighbor->elevation.corners ) { if ( corner == vertex ) { incident.emplace( neighbor ); break; } }
			}
			elevation_t sum = 0;
			for ( auto* tile : incident ) {
				const auto changed = canonical.find( tile ); sum += changed == canonical.end() ? *tile->elevation.center : changed->second.first;
			}
			vertices[vertex] = sum / int64_t( incident.size() );
		}
	}
	TerrainRecord record; record.world = map->m_terrain_identity;
	record.acceptance_context = m_game->m_applying_event_id;
	for ( auto* value : workers ) {
		value = value->Deref();
		if ( value->type != gse::VT_INT ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain participant must be a live worker ID" ); }
		const auto id = static_cast< const gse::value::Int* >( value )->value;
		auto* worker = id > 0 && m_game->GetUM() ? m_game->GetUM()->GetUnit( id ) : nullptr;
		if ( !worker || !worker->m_def->CanTerraform() || worker->m_health <= 0 ||
			!targets.count( { worker->GetTile()->coord.y, worker->GetTile()->coord.x } ) || record.workers.count( id ) ) {
			GSE_ERROR( gse::EC.INVALID_CALL, "Terrain participant is not a live capable worker on a target" );
		}
		record.workers.emplace( id, worker->m_order_handle );
	}
	region = targets;
	for ( const auto& patch : prepared ) {
		for ( auto* neighbor : patch.tile->neighbours ) {
			for ( auto* corner : neighbor->elevation.corners ) {
				if ( vertices.count( corner ) && vertices.at( corner ) != *corner ) { region.emplace( neighbor->coord.y, neighbor->coord.x ); break; }
			}
		}
	}
	for ( const auto& position : region ) {
		auto* tile = map->GetTile( position.second, position.first );
		if ( tile->IsLocked() ) { GSE_ERROR( gse::EC.INVALID_CALL, "Affected terrain tile is locked" ); }
		std::array< elevation_t, 4 > corners; bool retains_import = tile->m_has_imported_elevation; bool geometry_changed = false;
		elevation_t sum = 0; size_t water = 0;
		for ( size_t i = 0; i < corners.size(); ++i ) {
			const auto found = vertices.find( tile->elevation.corners[i] );
			corners[i] = found == vertices.end() ? *tile->elevation.corners[i] : found->second;
			retains_import = retains_import && corners[i] == tile->m_imported_corners[i];
			geometry_changed = geometry_changed || corners[i] != *tile->elevation.corners[i];
			sum += corners[i]; if ( corners[i] < ELEVATION_LEVEL_COAST ) { ++water; }
		}
		if ( sum / 4 < ELEVATION_LEVEL_COAST ) { ++water; }
		const auto primary = canonical.find( tile );
		const bool next_water = !canonical.empty() ? ( primary == canonical.end() ? tile->is_water_tile : primary->second.second ) :
			( tile->m_has_canonical_elevation && !geometry_changed ? tile->m_canonical_water : ( retains_import ? tile->m_imported_water : water > 2 ) );
		if ( next_water != tile->is_water_tile ) {
			if ( tile->base ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain class change would alter a city's ground" ); }
			for ( const auto& entry : tile->units ) {
				const auto type = entry.second->m_def->GetMovementType();
				if ( ( type == unit::MT_LAND && next_water || type == unit::MT_WATER && !next_water ) && !record.workers.count( entry.first ) ) {
					GSE_ERROR( gse::EC.INVALID_CALL, "Terrain class change would strand an unrelated unit" );
				}
			}
		}
		if ( apply ) {
			const auto next_elevation = !canonical.empty() ? ( primary == canonical.end() ? *tile->elevation.center : primary->second.first ) :
				( tile->m_has_canonical_elevation && !geometry_changed ? tile->m_canonical_elevation : ( retains_import ? tile->m_imported_elevation : sum / 4 ) );
			const auto position = prepared_indices.find( tile );
			const auto* patch = position == prepared_indices.end() ? nullptr : &prepared.at( position->second );
			auto next = tile->PrepareWrappedTerrain( GSE_CALL, { next_elevation, next_water,
				patch ? patch->moisture : tile->moisture, patch ? patch->rockiness : tile->rockiness,
				patch ? patch->features : tile->features, tile->bonus, patch ? patch->terraforming : tile->terraforming } );
			wrapper_updates.insert( wrapper_updates.end(), std::make_move_iterator( next.begin() ), std::make_move_iterator( next.end() ) );
		}
		record.entries.push_back( { tile, "", { *tile->elevation.center, *tile->elevation.left, *tile->elevation.top, *tile->elevation.right, *tile->elevation.bottom },
			tile->moisture, tile->rockiness, tile->features, tile->terraforming, tile->is_water_tile, next_water,
			tile->m_has_imported_elevation, tile->m_imported_water, tile->m_imported_elevation, tile->m_imported_corners,
			tile->m_has_canonical_elevation, tile->m_canonical_water, tile->m_canonical_elevation, tile->m_terraforming_owners, tile->m_terrain_revision } );
	}
	if ( !apply ) { return 0; }
	const auto token = m_next_terrain_receipt + 1;
	auto dirty_before = map->m_dirty_tiles;
	auto inserted = m_terrain_records.emplace( token, std::move( record ) ).first;
	try {
		const auto changed_geometry = [ & ]( const Tile* tile ) {
			for ( auto* corner : tile->elevation.corners ) { const auto found = vertices.find( corner ); if ( found != vertices.end() && found->second != *corner ) { return true; } }
			return false;
		};
		if ( !canonical.empty() ) {
			for ( const auto& entry : inserted->second.entries ) {
				const auto changed = canonical.find( entry.tile );
				if ( changed == canonical.end() ) {
					if ( changed_geometry( entry.tile ) ) { entry.tile->SetCanonicalElevation( entry.elevation[0], entry.previous_water, false ); }
				} else { entry.tile->SetCanonicalElevation( changed->second.first, changed->second.second ); }
			}
		} else if ( !vertices.empty() ) {
			// The original explicit-corner API intentionally recalculates gameplay
			// centers/classes; canonical operations above are a separate model.
			for ( const auto& entry : inserted->second.entries ) { if ( changed_geometry( entry.tile ) ) { entry.tile->m_has_canonical_elevation = false; } }
		}
		for ( const auto& vertex : vertices ) { *vertex.first = vertex.second; }
		for ( const auto& patch : prepared ) {
			patch.tile->moisture = patch.moisture; patch.tile->rockiness = patch.rockiness;
			patch.tile->features = patch.features; patch.tile->terraforming = patch.terraforming; patch.tile->m_terraforming_owners = patch.owners;
		}
		for ( auto& entry : inserted->second.entries ) {
			entry.tile->m_terrain_revision = token; map->MarkTerrainChanged( entry.tile ); entry.expected = entry.tile->Serialize().ToString();
		}
	} catch ( ... ) {
		RestoreTerrain( inserted->second ); map->m_dirty_tiles.swap( dirty_before ); m_terrain_records.erase( inserted ); throw;
	}
	Tile::PublishWrappedTerrain( wrapper_updates );
	m_next_terrain_receipt = token;
	return token;
}

void TileManager::RestoreTerrain( const TerrainRecord& record ) {
	// Shared vertices must all be restored before any imported center/class is
	// refreshed. No caller-owned objects or extensible callbacks enter this undo.
	for ( const auto& entry : record.entries ) {
		for ( size_t i = 0; i < 4; ++i ) { *entry.tile->elevation.corners[i] = entry.elevation[i + 1]; }
	}
	for ( const auto& entry : record.entries ) {
		auto* tile = entry.tile;
		tile->moisture = entry.moisture; tile->rockiness = entry.rockiness; tile->features = entry.features; tile->terraforming = entry.terraforming; tile->m_terraforming_owners = entry.terraforming_owners; tile->m_terrain_revision = entry.previous_revision;
		tile->m_has_imported_elevation = entry.imported; tile->m_imported_elevation = entry.imported_elevation;
		tile->m_imported_water = entry.imported_water; tile->m_imported_corners = entry.imported_corners;
		tile->m_has_canonical_elevation = entry.canonical; tile->m_canonical_elevation = entry.canonical_elevation; tile->m_canonical_water = entry.canonical_water;
		*tile->elevation.center = entry.elevation[0]; tile->is_water_tile = entry.previous_water;
	}
}

const TileManager::TerrainRecord& TileManager::ValidateTerrainRollback( GSE_CALLABLE, const int64_t receipt ) const {
	auto* map = GetMap( GSE_CALL ); map->ValidateTerrainMutation();
	const auto found = m_terrain_records.find( receipt );
	if ( found == m_terrain_records.end() ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unknown terrain receipt" ); }
	const auto& record = found->second;
	const auto world = record.world.lock();
	if ( !world || world != map->m_terrain_identity ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain receipt belongs to a retired grid" ); }
	for ( const auto& entry : record.entries ) {
		auto* tile = entry.tile;
		if ( tile->IsLocked() || tile->m_terrain_revision != receipt || tile->Serialize().ToString() != entry.expected || tile->is_water_tile != entry.expected_water ) {
			GSE_ERROR( gse::EC.INVALID_CALL, "Terrain receipt is stale or locked" );
		}
		if ( tile->is_water_tile != entry.previous_water ) {
			if ( tile->base ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain undo would alter a city's ground" ); }
			for ( const auto& occupant : tile->units ) {
				const auto type = occupant.second->m_def->GetMovementType();
				if ( type == unit::MT_LAND && entry.previous_water || type == unit::MT_WATER && !entry.previous_water ) {
					const auto worker = record.workers.find( occupant.first );
					const auto handle = worker == record.workers.end() ? std::shared_ptr< game::backend::unit::Unit* >{} : worker->second.lock();
					if ( !handle || *handle != occupant.second ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terrain undo would strand an unrelated unit" ); }
				}
			}
		}
	}
	return record;
}

void TileManager::FinalizeAcceptedTerrain( const std::string& event_id ) {
	if ( event_id.empty() ) { return; }
	for ( auto it = m_terrain_records.begin(); it != m_terrain_records.end(); ) {
		if ( it->second.acceptance_context == event_id ) { it = m_terrain_records.erase( it ); }
		else { ++it; }
	}
}

void TileManager::RollbackTerrain( GSE_CALLABLE, const int64_t receipt ) {
	m_game->CheckRW( GSE_CALL ); CheckCustomMutation( GSE_CALL );
	auto* map = GetMap( GSE_CALL );
	const auto& record = ValidateTerrainRollback( GSE_CALL, receipt );
	// Reserve dirty entries before mutation so allocation failures cannot leave
	// a half-restored world. Native field restoration itself allocates nothing.
	auto dirty = map->m_dirty_tiles;
	for ( const auto& entry : record.entries ) { dirty.emplace( entry.tile->coord.y, entry.tile->coord.x ); }
	std::vector< Tile::WrappedTerrainUpdate > wrapper_updates;
	for ( const auto& entry : record.entries ) {
		auto next = entry.tile->PrepareWrappedTerrain( GSE_CALL, { entry.elevation[0], entry.previous_water,
			entry.moisture, entry.rockiness, entry.features, entry.tile->bonus, entry.terraforming } );
		wrapper_updates.insert( wrapper_updates.end(), std::make_move_iterator( next.begin() ), std::make_move_iterator( next.end() ) );
	}
	RestoreTerrain( record ); map->m_dirty_tiles.swap( dirty );
	Tile::PublishWrappedTerrain( wrapper_updates ); m_terrain_records.erase( receipt );
}

}
