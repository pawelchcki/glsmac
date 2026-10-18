#pragma once

namespace types {
class Buffer;
}

namespace game::backend::technology {
class Table;

void SerializeTable( const Table& table, types::Buffer& buffer );
// Replaces the destination only after validating the complete bounded table.
void DeserializeTable( Table& table, types::Buffer& buffer );
}
