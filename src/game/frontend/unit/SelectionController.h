#pragma once

#include <algorithm>
#include <cstddef>
#include <optional>
#include <set>
#include <utility>
#include <vector>

namespace game::frontend::unit {

// Rendering-free selection state. Both frontend packets and headless native
// integrations supply live readiness/coordinates; no unit pointers survive a
// refresh or removal. Deferred focus is UI state, independent of unit orders.
class SelectionController {
public:
	struct Candidate { size_t id; bool ready; int x; int y; };
	using Candidates = std::vector< Candidate >;
	void Focus( std::optional< size_t > id ) { selected = id; }
	std::optional< size_t > Selected() const { return selected; }
	bool IsDeferred( size_t id ) const { return deferred.count( id ); }
	void Reset() { selected.reset(); deferred.clear(); }
	void Forget( size_t id ) { deferred.erase( id ); if ( selected == id ) { selected.reset(); } }
	// W/Tab completes both native selection and its UI delivery. Losing an
	// explicit exhausted focus must publish tile selection; an already idle
	// controller has no selection change to publish.
	template< typename SelectUnit, typename SelectTile >
	bool Navigate( Candidates units, SelectUnit select_unit, SelectTile select_tile ) {
		const auto previous = selected;
		const auto next = Next( std::move( units ), true );
		if ( next ) { select_unit( *next ); return true; }
		if ( previous ) { select_tile(); }
		return false;
	}
	// Native/frontend removal uses the same ready-survivor choice and publishes
	// a tile selection when consuming the focused unit leaves no ready unit.
	template< typename SelectUnit, typename SelectTile >
	void Removed( size_t id, bool was_selected, Candidates units, SelectUnit select_unit, SelectTile select_tile ) {
		Forget( id );
		if ( !was_selected ) { return; }
		const auto next = Next( std::move( units ) );
		if ( next ) { select_unit( *next ); }
		else { select_tile(); }
	}

	std::optional< size_t > Next( Candidates units, bool wait = false ) {
		std::sort( units.begin(), units.end(), []( const auto& a, const auto& b ) { return a.id < b.id; } );
		for ( auto it = deferred.begin(); it != deferred.end(); ) {
			if ( std::none_of( units.begin(), units.end(), [ & ]( const auto& u ) { return u.id == *it; } ) ) { it = deferred.erase( it ); }
			else { ++it; }
		}
		if ( wait && selected ) { deferred.insert( *selected ); }
		const auto current = std::find_if( units.begin(), units.end(), [ & ]( const auto& u ) { return selected == u.id; } );
		const auto choose = [ & ]() -> std::optional< size_t > {
			const Candidate* best = nullptr; long long distance = 0;
			for ( const auto& unit : units ) {
				if ( !unit.ready || deferred.count( unit.id ) ) { continue; }
				const auto dx = current == units.end() ? 0LL : (long long)unit.x - current->x;
				const auto dy = current == units.end() ? 0LL : (long long)unit.y - current->y;
				const auto d = dx * dx + dy * dy;
				if ( !best || d < distance ) { best = &unit; distance = d; }
			}
			return best ? std::optional< size_t >( best->id ) : std::nullopt;
		};
		auto next = choose();
		if ( !next ) {
			// A deferred pass has run out of candidates. Release the other
			// ready units together, retaining the current unit's deferral. This
			// history matters across repeated Wait/Tab, including ready-list wrap.
			for ( const auto& unit : units ) { if ( unit.ready && selected != unit.id ) { deferred.erase( unit.id ); } }
			next = choose();
			if ( !next && current != units.end() && current->ready ) { next = current->id; }
		}
		selected = next; return selected;
	}
private:
	std::optional< size_t > selected;
	std::set< size_t > deferred;
};
}
