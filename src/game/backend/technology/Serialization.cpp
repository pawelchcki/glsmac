#include "Serialization.h"

#include "Table.h"
#include "types/Buffer.h"

#include <stdexcept>

namespace game::backend::technology {

namespace {

int ReadInteger( types::Buffer& buffer, const int minimum, const int maximum ) {
	const auto value = buffer.ReadInt();
	if ( value < minimum || value > maximum ) {
		throw std::runtime_error( "Technology snapshot value is out of range" );
	}
	return value;
}

}

void SerializeTable( const Table& table, types::Buffer& buffer ) {
	buffer.WriteInt( 1 ); // snapshot format version
	buffer.WriteInt( Table::COUNT );
	for ( int id = 0; id < Table::COUNT; id++ ) {
		const auto& technology = table.Get( id );
		for ( const auto prerequisite : technology.prerequisites ) {
			buffer.WriteInt( prerequisite );
		}
		buffer.WriteInt( technology.owners );
		for ( const auto weight : technology.weights ) {
			buffer.WriteInt( weight );
		}
	}
}

void DeserializeTable( Table& table, types::Buffer& buffer ) {
	ReadInteger( buffer, 1, 1 );
	ReadInteger( buffer, Table::COUNT, Table::COUNT );
	Table replacement;
	for ( int id = 0; id < Table::COUNT; id++ ) {
		Table::Technology technology;
		for ( auto& prerequisite : technology.prerequisites ) {
			prerequisite = ReadInteger( buffer, Table::DISABLED, Table::COUNT - 1 );
		}
		technology.owners = ReadInteger( buffer, 0, 255 );
		for ( auto& weight : technology.weights ) {
			weight = ReadInteger( buffer, -32768, 32767 );
		}
		replacement.Set( id, technology );
	}
	if ( buffer.lenr != buffer.lenw ) {
		throw std::runtime_error( "Trailing technology snapshot data" );
	}
	table = replacement;
}

}
