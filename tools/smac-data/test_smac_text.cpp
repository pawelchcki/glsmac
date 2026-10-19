// Synthetic format fixtures only: no installed SMAC data or game executable.
// Standalone audit: c++ -std=c++17 -Isrc tools/smac-data/test_smac_text.cpp -o /tmp/test_smac_text
#include "loader/txt/SmacText.h"

#include <functional>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace smac = loader::txt::smac;

namespace {
std::size_t checks = 0;
void expect(bool condition, const std::string& message) {
    ++checks;
    if (!condition) { throw std::runtime_error(message); }
}

std::string rejects(const std::function<void()>& action) {
    try { action(); }
    catch (const std::runtime_error& error) { ++checks; return error.what(); }
    throw std::runtime_error("operation must fail explicitly");
}

void line_endings_and_bytes() {
    const auto doc = smac::parse("\xEF\xBB\xBF#RAW\r\n  $name ^{[value]} \xC3\xA9  \r\n\nlast\rbyte", "dialogs");
    const auto& block = doc.block("RAW");
    expect(block.id == "RAW" && block.line == 1, "BOM and CRLF preserve block line");
    expect(block.records.size() == 3, "LF blank and unterminated final line retained");
    expect(block.records[0].kind == "text" && block.records[0].line == 2, "first record source location");
    expect(block.records[0].text == "  $name ^{[value]} \xC3\xA9  ", "padding, UTF-8 and formatting bytes retained");
    expect(block.records[1].kind == "blank" && block.records[1].line == 3, "blank source location");
    expect(block.records[2].text == "last\rbyte" && block.records[2].line == 4, "non-terminator CR retained");
    const auto ended = smac::parse("#RAW\nvalue\n", smac::Format::Dialogs);
    expect(ended.block("RAW").records.size() == 1, "terminal newline does not invent another line");
}

void headers_comments_and_directives() {
    const auto doc = smac::parse(
        "ignored preamble\n#A\n; a comment\n  ## documentation\n\t# documentation\n"
        "\t \n  #xs\t440  \n#unknown\n#NOT_A_HEADER argument\n  #B_2 \t\nbody\n#END\nignored after end\n#C\nfinal\n#Mixeda\nsuffix", "dialogs");
    expect(doc.ids() == std::vector<std::string>({"A", "B_2", "C", "Mixeda"}), "only uppercase-initial argument-free identifiers begin blocks");
    const auto& records = doc.block("A").records;
    expect(records.size() == 7, "all ordered in-block record kinds retained");
    expect(records[0].kind == "comment" && records[0].text == "; a comment", "semicolon comment retained");
    expect(records[1].kind == "comment" && records[2].kind == "comment", "both hash documentation forms are comments");
    expect(records[3].kind == "blank" && records[3].text == "\t ", "whitespace-only record bytes retained");
    expect(records[4].kind == "directive" && records[4].name == "xs" && records[4].argument == "440", "directive name and argument parsed");
    expect(records[4].text == "  #xs\t440  " && records[4].line == 7, "directive source text and line retained");
    expect(records[5].kind == "directive" && records[5].name == "unknown" && records[5].argument.empty(), "unknown argument-free lowercase directive retained");
    expect(records[0].name.empty() && records[0].argument.empty() && records[3].name.empty(), "non-directive metadata empty");
    expect(doc.block("B_2").line == 10 && doc.block("B_2").records.size() == 1, "END terminates active block");
    expect(doc.block("C").records[0].text == "final", "new block after END remains ordered data");
    expect(doc.block("Mixeda").records[0].text == "suffix", "uppercase-initial IDs retain lowercase suffixes");
}

void duplicate_lookup_is_explicit() {
    const auto doc = smac::parse("#DUP\nfirst\n#OTHER\nother\n#DUP\nsecond\n", "dialogs");
    expect(doc.ids() == std::vector<std::string>({"DUP", "OTHER", "DUP"}), "duplicate IDs remain in source order");
    expect(doc.blocks().size() == 3, "document retains each block occurrence");
    expect(doc.block("DUP", 0).records[0].text == "first", "occurrence zero selects first duplicate");
    expect(doc.dialog("DUP", 1).records[0].text == "second", "explicit dialog occurrence selects second duplicate");
    rejects([&]() { doc.block("DUP"); });
    rejects([&]() { doc.dialog("DUP"); });
    rejects([&]() { doc.rows("DUP"); });
    rejects([&]() { doc.menu("DUP"); });
    rejects([&]() { doc.block("MISSING"); });
    rejects([&]() { doc.block("DUP", 2); });
    rejects([&]() { doc.block("OTHER", 1); });
    rejects([&]() { doc.block("DUP", std::numeric_limits<std::size_t>::max()); });
}

void rules_fields_and_comments() {
    const auto doc = smac::parse(
        "#RULES\n; ignored\n\n## docs\n#xs 10\n"
        " alpha ,  , omega,  \n"
        " \"two,fields\",\"semi;colon\",\"say \"\"hello\"\"\",plain ; trailing comment\n"
        "unquoted\"literal,ab\"cd; outside comment\n"
        "\"  inner padding  \",\"\",tail,\n"
        ",,\n"
        "\"x\" note, \"a,b\" explanatory tail ; comment\n", "rules");
    const auto rows = doc.rows("RULES");
    expect(rows.size() == 6, "rules omit comments blanks and directives");
    expect(rows[0] == std::vector<std::string>({"alpha", "", "omega", ""}), "trim padding while retaining empty trailing fields");
    expect(rows[1] == std::vector<std::string>({"two,fields", "semi;colon", "say \"hello\"", "plain"}), "quoted separators and doubled quotes");
    expect(rows[2] == std::vector<std::string>({"unquoted\"literal", "ab\"cd"}), "quotes in unquoted fields remain literal and do not hide comments");
    expect(rows[3] == std::vector<std::string>({"  inner padding  ", "", "tail", ""}), "quoted interior padding and empty fields survive");
    expect(rows[4] == std::vector<std::string>({"", "", ""}), "all-empty row is data");
    expect(rows[5] == std::vector<std::string>({"x note", "a,b explanatory tail"}), "quoted leading token may have narrative tail");
    expect(doc.block("RULES").records[5].text == " \"two,fields\",\"semi;colon\",\"say \"\"hello\"\"\",plain ; trailing comment", "rules projection does not rewrite raw record");
}

void malformed_quote_has_source_context() {
    const auto error = rejects([]() { smac::parse("#GOOD\nok\n#BROKEN\n  \"never closed,still one field\n", "rules"); });
    expect(error.find("BROKEN") != std::string::npos, "malformed quote reports block ID");
    expect(error.find("4") != std::string::npos, "malformed quote reports source line");
    rejects([]() { smac::parse("#BAD\nfirst, \"unfinished\n", smac::Format::Rules); });
}

void menu_projection_preserves_unknown_data() {
    const auto doc = smac::parse(
        "#MENU\n\n; leading comment\n#xs 10\n&Test Menu\n\n"
        "&Launch|Ctrl+Odd\n; comment between entries\n\n\n"
        "Unimplemented command|Unknown+Chord\nPlain command\n\n## trailing docs\n\n", "menus");
    const auto menu = doc.menu("MENU");
    expect(menu.title == "&Test Menu", "first data line is title with mnemonic markup");
    expect(menu.items.size() == 5, "leading and trailing blank separators omitted from items");
    expect(doc.block("MENU").records[4].kind == "blank" && doc.block("MENU").records[4].line == 6, "blank after title retained in raw block");
    expect(menu.items[1].label.empty() && menu.items[1].shortcut.empty(), "separator has no command data");
    expect(menu.items[0].label == "&Launch" && menu.items[0].shortcut == "Ctrl+Odd" && menu.items[0].line == 7, "label mnemonic and unknown shortcut preserved");
    expect(menu.items[1].separator && menu.items[1].line == 9 && menu.items[2].separator && menu.items[2].line == 10, "consecutive internal separators retain order");
    expect(menu.items[3].label == "Unimplemented command" && menu.items[3].shortcut == "Unknown+Chord", "unknown command remains data");
    expect(menu.items[4].label == "Plain command" && menu.items[4].shortcut.empty() && !menu.items[4].separator, "missing shortcut stays empty");
    const auto empty = smac::parse("#EMPTY\n\n; comment\n", "menus").menu("EMPTY");
    expect(empty.title.empty() && empty.items.empty(), "empty menu does not invent a title or commands");
}

void dialog_order_and_unsupported_formatting() {
    const auto doc = smac::parse("#DIALOG\n#xs 440\n#future {[$value]}\n^A $name {key} [option]\n\n; note\n#xs 120\n", "dialogs");
    const auto& dialog = doc.dialog("DIALOG");
    expect(dialog.records.size() == 6, "all dialog records retained");
    expect(dialog.records[0].name == "xs" && dialog.records[0].argument == "440", "first directive remains first");
    expect(dialog.records[1].name == "future" && dialog.records[1].argument == "{[$value]}", "unsupported directive and substitutions retained");
    expect(dialog.records[2].text == "^A $name {key} [option]" && dialog.records[2].kind == "text", "formatting is not executed or discarded");
    expect(dialog.records[5].name == "xs" && dialog.records[5].argument == "120", "repeated directive not collapsed or given precedence");
}

void projections_do_not_mutate_document() {
    const auto doc = smac::parse("#DATA\nTitle\nLabel|Shortcut\n", "menus");
    auto ids = doc.ids(); ids[0] = "changed";
    auto menu = doc.menu("DATA"); menu.title = "changed"; menu.items[0].label = "changed";
    auto rows = doc.rows("DATA"); rows[0][0] = "changed";
    expect(doc.ids()[0] == "DATA" && doc.menu("DATA").title == "Title", "returned IDs and title are independent values");
    expect(doc.menu("DATA").items[0].label == "Label", "returned menu items are independent values");
    expect(doc.rows("DATA")[0][0] == "Title" && doc.block("DATA").records[0].text == "Title", "row projection leaves source and subsequent projections unchanged");
}

void formats_and_empty_document() {
    expect(smac::parse_format("rules") == smac::Format::Rules, "rules format accepted");
    expect(smac::parse_format("menus") == smac::Format::Menus, "menus format accepted");
    expect(smac::parse_format("dialogs") == smac::Format::Dialogs, "dialogs format accepted");
    rejects([]() { smac::parse("#X\nvalue", "unknown"); });
    rejects([]() { smac::parse_format("RULES"); });
    const auto doc = smac::parse("", "rules");
    expect(doc.ids().empty() && doc.blocks().empty(), "empty source is empty document");
    rejects([&]() { doc.block("ABSENT"); });
}
} // namespace

int main() {
    const std::vector<std::pair<std::string, std::function<void()>>> tests {
        {"line endings and bytes", line_endings_and_bytes},
        {"headers comments and directives", headers_comments_and_directives},
        {"duplicate lookup", duplicate_lookup_is_explicit},
        {"rules fields and comments", rules_fields_and_comments},
        {"malformed quote context", malformed_quote_has_source_context},
        {"menu projection", menu_projection_preserves_unknown_data},
        {"dialog records", dialog_order_and_unsupported_formatting},
        {"independent projections", projections_do_not_mutate_document},
        {"formats and empty source", formats_and_empty_document},
    };
    for (const auto& test : tests) {
        try { test.second(); }
        catch (const std::exception& error) {
            std::cerr << "FAIL " << test.first << ": " << error.what() << '\n';
            return 1;
        }
    }
    std::cout << "PASS " << tests.size() << " scenarios / " << checks << " assertions\n";
}
