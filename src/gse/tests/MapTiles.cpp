#include "MapTiles.h"

#include "game/backend/map/tile/Tiles.h"
#include "task/gsetests/GSETests.h"

#include <unordered_map>

namespace gse {
namespace tests {

namespace terrain = game::backend::map::tile;

void AddMapTilesTests( task::gsetests::GSETests* task ) {
	task->AddTest(
		"original map center and coast survive updates until a corner height changes",
		GT() {
			terrain::Tiles tiles( nullptr, 4, 4 );
			tiles.Clear();
			auto& tile = tiles.At( 0, 0 );
			for ( auto* corner : tile.elevation.corners ) *corner = 100;
			tile.SetImportedElevation( -750, true );
			for ( size_t i = 0 ; i < 3 ; ++i ) tile.Update();
			GT_ASSERT( *tile.elevation.center == -750 && tile.is_water_tile, "source center/coast changed without a height edit" );
			*tile.elevation.bottom = 200;
			tile.Update();
			GT_ASSERT( *tile.elevation.center == 125 && !tile.is_water_tile, "corner edit did not restore derived terrain" );
			*tile.elevation.bottom = 100;
			tile.Update();
			GT_ASSERT( *tile.elevation.center == 100 && !tile.is_water_tile, "old imported elevation returned after another edit" );
			tile.SetImportedElevation( -500, true );
			tile.Clear();
			tile.Update();
			GT_ASSERT( *tile.elevation.center == 0 && !tile.is_water_tile, "Clear retained imported terrain state" );
			GT_OK();
		}
	);

	task->AddTest(
		"legacy tile record restores its bottom elevation and terrain fields",
		GT() {
			// This record is the old format, without any imported-elevation suffix.
			types::Buffer legacy;
			for ( const auto value : { 0, 0, 27, 11, 22, 33, 44, 2, 3, 1, 1, 8 } ) legacy.WriteInt( value );
			terrain::Tiles restored( nullptr, 4, 4 );
			restored.Clear();
			auto& tile = restored.At( 0, 0 );
			tile.Deserialize( legacy );
			GT_ASSERT( *tile.elevation.left == 11 && *tile.elevation.top == 22 &&
				*tile.elevation.right == 33 && *tile.elevation.bottom == 44, "legacy corner elevations changed" );
			GT_ASSERT( *tile.elevation.center == 27 && !tile.is_water_tile, "legacy derived center/coast changed" );
			GT_ASSERT( tile.moisture == 2 && tile.rockiness == 3 && tile.bonus == 1 &&
				tile.features == 1 && tile.terraforming == 8, "legacy terrain fields changed" );
			GT_ASSERT( tile.Serialize().ToString() == legacy.ToString(), "legacy tile record no longer roundtrips" );
			GT_OK();
		}
	);

	task->AddTest(
		"imported tile metadata survives serialization and a later corner edit",
		GT() {
			terrain::Tiles source( nullptr, 4, 4 );
			source.Clear();
			auto& original = source.At( 0, 0 );
			for ( auto* corner : original.elevation.corners ) *corner = -100;
			original.SetImportedElevation( 1750, false );
			const auto saved = original.Serialize();
			terrain::Tiles restored( nullptr, 4, 4 );
			restored.Clear();
			auto& tile = restored.At( 0, 0 );
			tile.Deserialize( saved );
			tile.Update();
			GT_ASSERT( *tile.elevation.center == 1750 && !tile.is_water_tile, "imported land center/coast did not roundtrip" );
			GT_ASSERT( tile.Serialize().ToString() == saved.ToString(), "imported tile metadata changed during roundtrip" );
			*tile.elevation.bottom = -300;
			tile.Update();
			GT_ASSERT( *tile.elevation.center == -150 && tile.is_water_tile, "deserialized source state survived a real height edit" );
			GT_OK();
		}
	);

	task->AddTest(
		"whole imported map preserves shared vertices and exact source tile centers",
		GT() {
			terrain::Tiles source( nullptr, 4, 4 );
			source.Clear();
			std::unordered_map< terrain::elevation_t*, terrain::elevation_t > vertices;
			for ( size_t y = 0 ; y < 4 ; ++y ) {
				for ( size_t x = y & 1 ; x < 4 ; x += 2 ) {
					for ( auto* corner : source.At( x, y ).elevation.corners ) {
						if ( vertices.find( corner ) == vertices.end() ) {
							const auto elevation = -600 + static_cast< terrain::elevation_t >( vertices.size() ) * 75;
							vertices.emplace( corner, elevation );
							*corner = elevation;
						}
					}
				}
			}
			for ( size_t y = 0 ; y < 4 ; ++y ) {
				for ( size_t x = y & 1 ; x < 4 ; x += 2 ) {
					auto& tile = source.At( x, y );
					const bool water = ( y + x / 2 ) % 2;
					tile.moisture = terrain::MOISTURE_MOIST;
					tile.rockiness = terrain::ROCKINESS_ROLLING;
					tile.bonus = terrain::BONUS_NUTRIENT;
					tile.features = terrain::FEATURE_RIVER;
					tile.terraforming = terrain::TERRAFORMING_ROAD;
					tile.SetImportedElevation( water ? -1300 - 10 * y : 2100 + 10 * x, water );
				}
			}
			terrain::Tiles restored( nullptr );
			restored.Deserialize( source.Serialize() );
			GT_ASSERT( restored.GetWidth() == 4 && restored.GetHeight() == 4, "map dimensions changed" );
			GT_ASSERT( restored.At( 0, 0 ).elevation.bottom == restored.At( 0, 2 ).elevation.top &&
				restored.At( 0, 0 ).elevation.left == restored.At( 2, 0 ).elevation.right, "shared vertices or horizontal wrapping changed" );
			for ( size_t y = 0 ; y < 4 ; ++y ) {
				for ( size_t x = y & 1 ; x < 4 ; x += 2 ) {
					const auto& original = source.AtConst( x, y );
					auto& tile = restored.At( x, y );
					tile.Update();
					GT_ASSERT( *tile.elevation.center == *original.elevation.center && tile.is_water_tile == original.is_water_tile,
						"source center/coast changed while restoring neighboring tiles" );
					for ( size_t i = 0 ; i < 4 ; ++i ) {
						GT_ASSERT( *tile.elevation.corners[ i ] == *original.elevation.corners[ i ], "shared corner elevation changed" );
					}
				}
			}
			GT_ASSERT( restored.Serialize().ToString() == source.Serialize().ToString(), "whole imported map did not roundtrip" );
			GT_OK();
		}
	);
}

}
}
