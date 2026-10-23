#include "Research.h"

#include <stdexcept>

#include "Table.h"

namespace game::backend::technology {

const Research::State& Research::Get( size_t player ) const {
	return m_players.at( player );
}

void Research::Set( size_t player, const State& state ) {
	if ( state.target < Table::NONE || state.target >= Table::COUNT || state.priorities > 15 ) {
		throw std::out_of_range( "Invalid research state" );
	}
	m_players.at( player ) = state;
}

void Research::Clear() {
	m_players = {};
}

types::Buffer Research::Serialize() const {
	types::Buffer buffer;
	buffer.WriteInt( 1 );
	buffer.WriteInt( PLAYERS );
	for ( const auto& state : m_players ) { buffer.WriteInt( state.target ); buffer.WriteInt( state.priorities ); }
	return buffer;
}

void Research::Deserialize( types::Buffer buffer ) {
	if ( buffer.ReadInt() != 1 || buffer.ReadInt() != PLAYERS ) { throw std::runtime_error( "Invalid research snapshot header" ); }
	Research replacement;
	for ( size_t player = 0; player < PLAYERS; ++player ) {
		const auto target = buffer.ReadInt(); const auto priorities = buffer.ReadInt();
		if ( priorities < 0 || priorities > 15 ) { throw std::out_of_range( "Invalid research priorities" ); }
		replacement.Set( player, { target, static_cast< uint8_t >( priorities ) } );
	}
	if ( buffer.lenr != buffer.lenw ) { throw std::runtime_error( "Trailing research snapshot data" ); }
	*this = replacement;
}

}
