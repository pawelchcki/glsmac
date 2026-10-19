#include <cassert>
#include <iostream>
#include <string>

#include "types/Buffer.h"

int main() {
    for (const auto length : {1, 1000, 2048}) {
        types::Buffer source;
        const std::string text(length, 'x');
        source.WriteInt(7);
        source.WriteString(text);
        const auto original = source.ToString();
        // Copy a partially consumed buffer, then append both within the
        // advertised spare capacity and across a later allocation boundary.
        assert(source.ReadInt() == 7);
        types::Buffer copy(source);
        copy.WriteInt(99);
        copy.WriteString(std::string(4096, 'y'));
        assert(copy.ReadString() == text);
        assert(copy.ReadInt() == 99);
        assert(copy.ReadString() == std::string(4096, 'y'));
        assert(copy.lenr == copy.lenw);
        assert(source.ToString() == original);
        assert(source.ReadString() == text);
    }
    types::Buffer empty;
    types::Buffer copy(empty);
    copy.WriteInt(42);
    assert(copy.ReadInt() == 42 && empty.lenw == 0);
    std::cout << "BUFFER_COPY_PASS 4\n";
}
