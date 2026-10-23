#include <functional>
#include <iostream>
#include <stdexcept>

#include "game/backend/technology/Research.h"

using game::backend::technology::Research;

namespace {
size_t assertions = 0;
void check( bool value ) {
	++assertions;
	if ( !value ) { throw std::runtime_error( "Research state assertion failed" ); }
}
void rejects( const std::function< void() >& callback ) {
	bool failed = false;
	try { callback(); } catch ( const std::exception& ) { failed = true; }
	check( failed );
}
}

int main() {
	try {
		Research source;
		for ( size_t player = 0; player < Research::PLAYERS; ++player ) { check( source.Get( player ).target == -1 && source.Get( player ).priorities == 1 ); }
		source.Set( 0, { 5, 15, 17, 6 } ); source.Set( 6, { 88, 0, 9, 5 } );
		const auto bytes = source.Serialize().ToString();
		Research receiving; receiving.Deserialize( types::Buffer( bytes ) );
		check( receiving.Get( 0 ).target == 5 && receiving.Get( 0 ).priorities == 15 );
		check( receiving.Get( 0 ).science == 17 && receiving.Get( 0 ).income_turn == 6 );
		check( receiving.Get( 6 ).target == 88 && receiving.Get( 6 ).priorities == 0 );
		check( receiving.Serialize().ToString() == bytes );
		source.Clear();
		check( source.Get( 0 ).target == -1 && source.Get( 0 ).priorities == 1 );
		check( receiving.Serialize().ToString() == bytes );
		for ( const auto& invalid : { types::Buffer{}, types::Buffer( bytes.substr( 0, bytes.size() - 1 ) ), types::Buffer( bytes + "trailing" ) } ) {
			rejects( [ & ]() { receiving.Deserialize( invalid ); } ); check( receiving.Serialize().ToString() == bytes );
		}
		for ( int kind = 0; kind < 6; ++kind ) {
			types::Buffer malformed; malformed.WriteInt( kind == 0 ? 99 : 2 ); malformed.WriteInt( kind == 1 ? 8 : 7 );
			for ( size_t player = 0; player < Research::PLAYERS; ++player ) {
				const auto& state = receiving.Get( player );
				malformed.WriteInt( player == 6 && kind == 2 ? 89 : state.target );
				malformed.WriteInt( player == 6 && kind == 3 ? 16 : state.priorities );
				malformed.WriteInt( player == 6 && kind == 4 ? -1 : state.science );
				malformed.WriteInt( player == 6 && kind == 5 ? -1 : state.income_turn );
			}
			rejects( [ & ]() { receiving.Deserialize( malformed ); } ); check( receiving.Serialize().ToString() == bytes );
		}
		rejects( [ & ]() { receiving.Set( 0, { -2, 0 } ); } );
		rejects( [ & ]() { receiving.Set( 0, { 89, 0 } ); } );
		rejects( [ & ]() { receiving.Set( 0, { 0, 16 } ); } );
		rejects( [ & ]() { receiving.Set( 7, { 0, 0 } ); } );
		check( receiving.Serialize().ToString() == bytes );
		types::Buffer legacy; legacy.WriteInt( 1 ); legacy.WriteInt( Research::PLAYERS );
		for ( size_t player = 0; player < Research::PLAYERS; ++player ) {
			const auto& state = receiving.Get( player ); legacy.WriteInt( state.target ); legacy.WriteInt( state.priorities );
		}
		Research restored; restored.Deserialize( legacy );
		check( restored.Get( 0 ).target == 5 && restored.Get( 0 ).priorities == 15 );
		check( restored.Get( 0 ).science == 0 && restored.Get( 0 ).income_turn == 0 );
		rejects( [ & ]() { receiving.Set( 0, { 5, 1, -1, 0 } ); } );
		rejects( [ & ]() { receiving.Set( 0, { 5, 1, 0, -1 } ); } );
		std::cout << "PASS research state / " << assertions << " assertions\n";
		return 0;
	} catch ( const std::exception& error ) {
		std::cerr << error.what() << '\n'; return 1;
	}
}
