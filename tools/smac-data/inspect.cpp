// Standalone import inspector. Bytes are represented as Latin-1 JSON code points.
#include "loader/txt/SmacText.h"

#include <iostream>
#include <iterator>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>

namespace smac = loader::txt::smac;

namespace {
void string(std::ostream& output, const std::string& value) {
    static constexpr char hex[] = "0123456789ABCDEF";
    output << '"';
    for (const unsigned char byte : value) {
        switch (byte) {
            case '"': output << "\\\""; break;
            case '\\': output << "\\\\"; break;
            case '\b': output << "\\b"; break;
            case '\f': output << "\\f"; break;
            case '\n': output << "\\n"; break;
            case '\r': output << "\\r"; break;
            case '\t': output << "\\t"; break;
            default:
                if (byte < 0x20 || byte >= 0x7F) {
                    output << "\\u00" << hex[byte >> 4] << hex[byte & 15];
                }
                else { output << static_cast<char>(byte); }
        }
    }
    output << '"';
}

void records(std::ostream& output, const std::vector<smac::Record>& values) {
    output << '[';
    bool comma = false;
    for (const auto& record : values) {
        if (comma) { output << ','; }
        comma = true;
        output << "{\"kind\":"; string(output, record.kind);
        output << ",\"line\":" << record.line << ",\"text\":"; string(output, record.text);
        output << ",\"name\":"; string(output, record.name);
        output << ",\"argument\":"; string(output, record.argument);
        output << '}';
    }
    output << ']';
}

void rows(std::ostream& output, const smac::Rows& values) {
    output << '[';
    bool row_comma = false;
    for (const auto& row : values) {
        if (row_comma) { output << ','; }
        row_comma = true;
        output << '[';
        bool field_comma = false;
        for (const auto& field : row) {
            if (field_comma) { output << ','; }
            field_comma = true;
            string(output, field);
        }
        output << ']';
    }
    output << ']';
}

void menu(std::ostream& output, const smac::Menu& value) {
    output << "{\"title\":"; string(output, value.title);
    output << ",\"items\":[";
    bool comma = false;
    for (const auto& item : value.items) {
        if (comma) { output << ','; }
        comma = true;
        output << "{\"label\":"; string(output, item.label);
        output << ",\"shortcut\":"; string(output, item.shortcut);
        output << ",\"separator\":" << (item.separator ? "true" : "false") << ",\"line\":" << item.line << '}';
    }
    output << "]}";
}
} // namespace

int main(int argc, char** argv) {
    try {
        if (argc != 2) { throw std::runtime_error("Usage: smac-text-inspect rules|menus|dialogs < source.txt"); }
        const std::string format_name = argv[1];
        const auto format = smac::parse_format(format_name);
        const std::string source((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>());
        if (std::cin.bad()) { throw std::runtime_error("Failed to read source from stdin"); }
        const auto document = smac::parse(source, format);
        std::ostringstream output;
        output << "{\"format\":"; string(output, format_name);
        output << ",\"blocks\":[";
        bool comma = false;
        std::map<std::string, std::size_t> occurrences;
        for (const auto& block : document.blocks()) {
            const auto occurrence = occurrences[block.id]++;
            if (comma) { output << ','; }
            comma = true;
            output << "{\"id\":"; string(output, block.id);
            output << ",\"line\":" << block.line << ",\"records\":";
            records(output, block.records);
            if (format == smac::Format::Rules) {
                output << ",\"rows\":";
                rows(output, document.rows(block.id, occurrence));
            }
            else if (format == smac::Format::Menus) {
                output << ",\"menu\":";
                menu(output, document.menu(block.id, occurrence));
            }
            output << '}';
        }
        output << "]}\n";
        // No success bytes are published until parsing and every projection finish.
        std::cout << output.str();
        if (!std::cout) { throw std::runtime_error("Failed to write JSON to stdout"); }
        return 0;
    }
    catch (const std::exception& error) {
        std::cerr << "SMAC text inspection failed: " << error.what() << '\n';
        return 1;
    }
}
