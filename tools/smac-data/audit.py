#!/usr/bin/env python3
"""Check installed-file import fidelity, separately from original-game behavior.

No original files or answers are copied into this repository. A source-line
oracle checks ordered blocks/records and menu definitions against the production
C++ inspector. Unquoted rule rows additionally get an independent string split;
quoted-field grammar is covered by the synthetic native/WASM fixture suite.
"""

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys


FILES = (("alpha.txt", "rules"), ("alphax.txt", "rules"),
         ("Script.txt", "dialogs"), ("xscript.txt", "dialogs"), ("menu.txt", "menus"))
PADDING = " \t\r\v\f"


def blocks_from_lines(source):
    if source.startswith(b"\xef\xbb\xbf"):
        source = source[3:]
    lines = source.split(b"\n")
    if lines and lines[-1] == b"":
        lines.pop()
    blocks = []
    active = None
    for number, raw in enumerate(lines, 1):
        if number < len(lines) or source.endswith(b"\n"):
            raw = raw.removesuffix(b"\r")
        text = raw.decode("latin1")
        content = text.strip(PADDING)
        if re.fullmatch(r"#[A-Z][A-Za-z0-9_]*", content):
            if content == "#END":
                active = None
            else:
                active = {"id": content[1:], "line": number, "records": []}
                blocks.append(active)
            continue
        if active is None:
            continue
        record = dict(line=number, text=text, name="", argument="")
        if not content:
            record["kind"] = "blank"
        elif content.startswith(";") or re.match(r"^#(?:#|[ \t\r\v\f]|$)", content):
            record["kind"] = "comment"
        elif content.startswith("#"):
            record["kind"] = "directive"
            directive = re.fullmatch(r"#([^ \t\r\v\f]+)(.*)", content)
            record.update(name=directive[1], argument=directive[2].strip(PADDING))
        else:
            record["kind"] = "text"
        active["records"].append(record)
    return blocks


def menu_from_records(records):
    data = [record for record in records if record["kind"] == "text"]
    if not data:
        return {"title": "", "items": []}
    title = data[0]["text"]
    if len(data) == 1:
        return {"title": title, "items": []}
    first, last = data[1]["line"], data[-1]["line"]
    items = []
    for record in records:
        if not first <= record["line"] <= last:
            continue
        if record["kind"] == "text":
            label, _, shortcut = record["text"].partition("|")
            items.append(dict(label=label, shortcut=shortcut, separator=False, line=record["line"]))
        elif record["kind"] == "blank":
            items.append(dict(label="", shortcut="", separator=True, line=record["line"]))
    return {"title": title, "items": items}


def check_file(inspector, path, kind):
    source = path.read_bytes()
    digest = hashlib.sha256(source).hexdigest()
    process = subprocess.run([str(inspector), kind], input=source, capture_output=True, timeout=30)
    if process.returncode:
        raise RuntimeError(f"{path.name}: production inspector exited {process.returncode}: {process.stderr.decode(errors='replace')[:500]}")
    actual = json.loads(process.stdout)
    expected = blocks_from_lines(source)
    if set(actual) != {"format", "blocks"} or actual["format"] != kind or len(actual["blocks"]) != len(expected):
        raise RuntimeError(f"{path.name}: incomplete or malformed document")
    row_count = row_fields = plain_rows = menu_items = 0
    for index, (got, want) in enumerate(zip(actual["blocks"], expected)):
        fields = {"id", "line", "records"} | ({"rows"} if kind == "rules" else {"menu"} if kind == "menus" else set())
        if set(got) != fields or {key: got[key] for key in want} != want:
            raise RuntimeError(f"{path.name}: raw block/record preservation differs at block {index}, source line {want['line']}")
        if kind == "rules":
            records = [record for record in want["records"] if record["kind"] == "text"]
            if not isinstance(got["rows"], list) or len(got["rows"]) != len(records):
                raise RuntimeError(f"{path.name}: rule row count differs at block {index}")
            for record, row in zip(records, got["rows"]):
                if not isinstance(row, list) or not row or any(not isinstance(value, str) for value in row):
                    raise RuntimeError(f"{path.name}: malformed rule row at source line {record['line']}")
                row_count += 1
                row_fields += len(row)
                if '"' not in record["text"]:
                    plain = [field.strip(PADDING) for field in record["text"].split(";", 1)[0].split(",")]
                    if row != plain:
                        raise RuntimeError(f"{path.name}: unquoted rule fields differ at source line {record['line']}")
                    plain_rows += 1
        elif kind == "menus":
            if got["menu"] != menu_from_records(want["records"]):
                raise RuntimeError(f"{path.name}: menu projection differs at source line {want['line']}")
            menu_items += sum(not item["separator"] for item in got["menu"]["items"])
    if path.read_bytes() != source:
        raise RuntimeError(f"{path.name}: installed source changed during audit")
    counts = Counter(block["id"] for block in expected)
    return dict(file=path.name, format=kind, source_sha256=digest, blocks=len(expected),
                records=sum(len(block["records"]) for block in expected),
                duplicate_ids={key: count for key, count in counts.items() if count > 1},
                rule_rows=row_count, rule_fields=row_fields, independently_split_unquoted_rows=plain_rows,
                quoted_rows_covered_by_synthetic_grammar_tests=row_count - plain_rows, menu_items=menu_items)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, required=True)
    parser.add_argument("--inspector", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    inspector = args.inspector.resolve(strict=True)
    initial_inspector = hashlib.sha256(inspector.read_bytes()).hexdigest()
    results = []
    report = dict(version=1, kind="smac-data-import-fidelity", original_executable_executed=False,
                  rendering=False, inspector_sha256=initial_inspector, complete=False, results=results)
    try:
        for filename, kind in FILES:
            matches = [path for path in args.assets.iterdir() if path.name.lower() == filename.lower() and path.is_file()]
            if len(matches) != 1:
                raise RuntimeError(f"expected one installed {filename}")
            results.append(check_file(inspector, matches[0], kind))
        if initial_inspector != hashlib.sha256(inspector.read_bytes()).hexdigest():
            raise RuntimeError("inspector changed during audit")
        report["complete"] = True
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        report["error"] = str(error)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if report["complete"] else 1


if __name__ == "__main__":
    sys.exit(main())
