#pragma once

// Lossless block/record import and explicit projections of installed SMAC text.
// This parser does not execute dialog directives or enable menu commands.
#include <cstddef>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace loader {
namespace txt {
namespace smac {

enum class Format { Rules, Menus, Dialogs };

inline Format parse_format(const std::string& format) {
    if (format == "rules") { return Format::Rules; }
    if (format == "menus") { return Format::Menus; }
    if (format == "dialogs") { return Format::Dialogs; }
    throw std::runtime_error("Unknown SMAC text format: " + format);
}

struct Record {
    std::string kind;
    std::size_t line = 0;
    std::string text;
    std::string name;
    std::string argument;
};

struct Block {
    std::string id;
    std::size_t line = 0;
    std::vector<Record> records;
};

using Rows = std::vector<std::vector<std::string>>;

struct MenuItem {
    std::string label;
    std::string shortcut;
    bool separator = false;
    std::size_t line = 0;
};

struct Menu {
    std::string title;
    std::vector<MenuItem> items;
};

namespace detail {

inline bool padding(char value) {
    return value == ' ' || value == '\t' || value == '\r' || value == '\v' || value == '\f';
}

inline std::string trim(const std::string& text) {
    std::size_t begin = 0;
    std::size_t end = text.size();
    while (begin < end && padding(text[begin])) { ++begin; }
    while (end > begin && padding(text[end - 1])) { --end; }
    return text.substr(begin, end - begin);
}

inline bool identifier(const std::string& text) {
    if (text.empty() || text[0] < 'A' || text[0] > 'Z') { return false; }
    for (const char value : text) {
        if (!((value >= 'A' && value <= 'Z') || (value >= 'a' && value <= 'z') ||
              (value >= '0' && value <= '9') || value == '_')) { return false; }
    }
    return true;
}

inline std::vector<std::string> fields(const Record& record, const std::string& block_id) {
    std::vector<std::string> result;
    const auto& text = record.text;
    std::size_t cursor = 0;
    for (;;) {
        std::size_t content = cursor;
        while (content < text.size() && padding(text[content])) { ++content; }
        std::string value;
        if (content < text.size() && text[content] == '"') {
            cursor = content + 1;
            bool closed = false;
            while (cursor < text.size()) {
                const char next = text[cursor++];
                if (next != '"') { value += next; }
                else if (cursor < text.size() && text[cursor] == '"') {
                    value += '"';
                    ++cursor;
                }
                else { closed = true; break; }
            }
            if (!closed) {
                throw std::runtime_error("Unterminated quoted field in block '" + block_id +
                                         "' at line " + std::to_string(record.line));
            }
            // A quoted leading token may be followed by narrative text. Keep
            // its separating padding, but discard padding after the whole field.
            const auto tail_begin = cursor;
            while (cursor < text.size() && text[cursor] != ',' && text[cursor] != ';') { ++cursor; }
            auto tail_end = cursor;
            while (tail_end > tail_begin && padding(text[tail_end - 1])) { --tail_end; }
            value += text.substr(tail_begin, tail_end - tail_begin);
        }
        else {
            const auto begin = cursor;
            while (cursor < text.size() && text[cursor] != ',' && text[cursor] != ';') { ++cursor; }
            // Quotes occurring inside an unquoted field are literal bytes.
            value = trim(text.substr(begin, cursor - begin));
        }
        result.push_back(std::move(value));
        if (cursor == text.size() || text[cursor] == ';') { break; }
        ++cursor; // Comma starts another field, including a trailing empty one.
    }
    return result;
}

inline Rows rows(const Block& block) {
    Rows result;
    for (const auto& record : block.records) {
        if (record.kind == "text") { result.push_back(fields(record, block.id)); }
    }
    return result;
}

inline Menu menu(const Block& block) {
    Menu result;
    bool have_title = false;
    std::vector<MenuItem> pending_separators;
    for (const auto& record : block.records) {
        if (record.kind == "text") {
            if (!have_title) {
                result.title = record.text;
                have_title = true;
                continue;
            }
            // Flush blanks only between actual menu items, so leading and
            // trailing blank separators never become empty commands.
            if (!result.items.empty()) {
                result.items.insert(result.items.end(), pending_separators.begin(), pending_separators.end());
            }
            pending_separators.clear();
            MenuItem item;
            item.line = record.line;
            const auto delimiter = record.text.find('|');
            item.label = record.text.substr(0, delimiter);
            if (delimiter != std::string::npos) { item.shortcut = record.text.substr(delimiter + 1); }
            result.items.push_back(std::move(item));
        }
        else if (record.kind == "blank" && have_title) {
            MenuItem item;
            item.separator = true;
            item.line = record.line;
            pending_separators.push_back(std::move(item));
        }
    }
    return result;
}

} // namespace detail

class Document {
public:
    Document(Format format, std::vector<Block> blocks) : m_format(format), m_blocks(std::move(blocks)) {}

    Format format() const { return m_format; }
    const std::vector<Block>& blocks() const { return m_blocks; }

    std::vector<std::string> ids() const {
        std::vector<std::string> result;
        result.reserve(m_blocks.size());
        for (const auto& block : m_blocks) { result.push_back(block.id); }
        return result;
    }

    const Block& block(const std::string& id) const {
        const Block* found = nullptr;
        for (const auto& candidate : m_blocks) {
            if (candidate.id != id) { continue; }
            if (found) { throw std::runtime_error("Ambiguous SMAC text block '" + id + "': specify an occurrence"); }
            found = &candidate;
        }
        if (!found) { throw std::runtime_error("Missing SMAC text block '" + id + "'"); }
        return *found;
    }

    const Block& block(const std::string& id, std::size_t occurrence) const {
        for (const auto& candidate : m_blocks) {
            if (candidate.id == id) {
                if (occurrence == 0) { return candidate; }
                --occurrence;
            }
        }
        throw std::runtime_error("SMAC text block '" + id + "' occurrence is out of range");
    }

    Rows rows(const std::string& id) const { return detail::rows(block(id)); }
    Rows rows(const std::string& id, std::size_t occurrence) const { return detail::rows(block(id, occurrence)); }
    Menu menu(const std::string& id) const { return detail::menu(block(id)); }
    Menu menu(const std::string& id, std::size_t occurrence) const { return detail::menu(block(id, occurrence)); }
    const Block& dialog(const std::string& id) const { return block(id); }
    const Block& dialog(const std::string& id, std::size_t occurrence) const { return block(id, occurrence); }

private:
    Format m_format;
    std::vector<Block> m_blocks;
};

inline Document parse(const std::string& source, Format format) {
    if (format != Format::Rules && format != Format::Menus && format != Format::Dialogs) {
        throw std::runtime_error("Unknown SMAC text format");
    }
    std::vector<Block> blocks;
    Block* active = nullptr;
    std::size_t cursor = source.compare(0, 3, "\xEF\xBB\xBF") == 0 ? 3 : 0;
    std::size_t line = 0;
    while (cursor < source.size()) {
        ++line;
        const auto newline = source.find('\n', cursor);
        const auto end = newline == std::string::npos ? source.size() : newline;
        auto text = source.substr(cursor, end - cursor);
        if (newline != std::string::npos && !text.empty() && text.back() == '\r') { text.pop_back(); }
        cursor = newline == std::string::npos ? source.size() : newline + 1;
        const auto trimmed = detail::trim(text);
        const bool hash = !trimmed.empty() && trimmed[0] == '#';
        if (hash && detail::identifier(trimmed.substr(1))) {
            const auto id = trimmed.substr(1);
            if (id == "END") { active = nullptr; }
            else {
                Block block;
                block.id = id;
                block.line = line;
                blocks.push_back(std::move(block));
                active = &blocks.back();
            }
            continue;
        }
        if (!active) { continue; }
        Record record;
        record.line = line;
        record.text = std::move(text);
        if (trimmed.empty()) { record.kind = "blank"; }
        else if (trimmed[0] == ';' || (hash && (trimmed.size() == 1 || trimmed[1] == '#' || detail::padding(trimmed[1])))) {
            record.kind = "comment";
        }
        else if (hash) {
            record.kind = "directive";
            std::size_t name_end = 1;
            while (name_end < trimmed.size() && !detail::padding(trimmed[name_end])) { ++name_end; }
            record.name = trimmed.substr(1, name_end - 1);
            record.argument = detail::trim(trimmed.substr(name_end));
        }
        else { record.kind = "text"; }
        active->records.push_back(std::move(record));
    }
    Document document(format, std::move(blocks));
    // Reject malformed rule rows at import time rather than deferring errors
    // until a consumer happens to request one particular block.
    if (format == Format::Rules) {
        for (const auto& block : document.blocks()) { detail::rows(block); }
    }
    return document;
}

inline Document parse(const std::string& source, const std::string& format) {
    return parse(source, parse_format(format));
}

} // namespace smac
} // namespace txt
} // namespace loader
