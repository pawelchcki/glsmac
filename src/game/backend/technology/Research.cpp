#include "Research.h"

#include <stdexcept>

#include "Table.h"

namespace game::backend::technology {

const Research::State& Research::Get( size_t player ) const {
	return m_players.at( player );
}

void Research::Set( size_t player, const State& state ) {
	if ( state.target < Table::NONE || state.target >= Table::COUNT || state.priorities > 15 || state.science < 0 || state.income_turn < 0 ) {
		throw std::out_of_range( "Invalid research state" );
	}
	m_players.at( player ) = state;
}

void Research::Clear() {
	m_players = {};
}

types::Buffer Research::Serialize() const {
	types::Buffer buffer;
	buffer.WriteInt( 2 );
	buffer.WriteInt( PLAYERS );
	for ( const auto& state : m_players ) {
		buffer.WriteInt( state.target ); buffer.WriteInt( state.priorities );
		buffer.WriteInt( state.science ); buffer.WriteInt( state.income_turn );
	}
	return buffer;
}

void Research::Deserialize( types::Buffer buffer ) {
	const auto version = buffer.ReadInt();
	if ( ( version != 1 && version != 2 ) || buffer.ReadInt() != PLAYERS ) { throw std::runtime_error( "Invalid research snapshot header" ); }
	Research replacement;
	for ( size_t player = 0; player < PLAYERS; ++player ) {
		const auto target = buffer.ReadInt(); const auto priorities = buffer.ReadInt();
		if ( priorities < 0 || priorities > 15 ) { throw std::out_of_range( "Invalid research priorities" ); }
		const auto science = version == 2 ? buffer.ReadInt() : 0;
		const auto income_turn = version == 2 ? buffer.ReadInt() : 0;
		replacement.Set( player, { target, static_cast< uint8_t >( priorities ), science, income_turn } );
	}
	if ( buffer.lenr != buffer.lenw ) { throw std::runtime_error( "Trailing research snapshot data" ); }
	*this = replacement;
}

}
