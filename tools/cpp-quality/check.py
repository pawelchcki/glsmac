#!/usr/bin/env python3
"""Pinned changed-line formatting and baseline-aware clang-tidy/static analysis."""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "tools/cpp-quality/baseline.json"
CPP_SUFFIXES = {".cpp", ".cc", ".cxx", ".h", ".hpp"}
# Included implementation fragments are analyzed through their real owning unit.
INCLUDED_IMPLEMENTATIONS = {
    Path("src/ui/dom/Object.colormap.cpp"): Path("src/ui/dom/Object.cpp"),
}
# Exact platform-specific sources absent from the native FastDebug database.
# These remain outside static passing totals; WASM producers run in CI.
NATIVE_UNSUPPORTED = {
    Path("src/debug/MemoryWatcher.cpp"): "Debug-only instrumentation; FastDebug has no DEBUG memory hooks",
    Path("src/network/impl/Windows.cpp"): "Windows socket backend; requires Windows headers and ABI",
    Path("src/network/impl/Browser.cpp"): "WASM backend; platform-build.mjs and full Emscripten application build",
    Path("src/network/simpletcp/Browser.cpp"): "WASM backend; platform-build.mjs and full Emscripten application build",
    Path("tools/innoextract/browser.cpp"): "WASM installer adapter; full Emscripten application build",
    Path("tools/wasm-tests/asset-bridge.cpp"): "WASM-only entrypoint; asset-bridge-build.mjs",
    Path("tools/wasm-tests/canvas.cpp"): "WASM-only graphics entrypoint; build.mjs",
    Path("tools/wasm-tests/game-shaders.cpp"): "WASM-only graphics fixture; build.mjs",
    Path("tools/wasm-tests/platform.cpp"): "WASM-only platform fixture; platform-build.mjs",
    Path("tools/wasm-tests/smac-map.cpp"): "WASM-only map fixture; smac-map-build.mjs",
    Path("tools/wasm-tests/texture-upload.cpp"): "WASM-only texture fixture; texture-upload-build.mjs",
}


def run(args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, **kwargs)


def first_party(path):
    path = Path(path)
    return (path.suffix in CPP_SUFFIXES and path.parts[0] in {"src", "tools"}
            and path.parts[:2] != ("src", "tmp"))


def changed_files(base):
    # Include staged, unstaged and untracked files. CI supplies the merge base.
    data = run(["git", "diff", "--name-only", "--diff-filter=ACMR", "-z", base],
               stdout=subprocess.PIPE).stdout
    untracked = run(["git", "ls-files", "--others", "--exclude-standard", "-z"],
                    stdout=subprocess.PIPE).stdout
    return sorted({Path(os.fsdecode(p)) for p in (data + untracked).split(b"\0") if p})


def tool_version(tool):
    output = run([tool, "--version"], stdout=subprocess.PIPE, text=True).stdout
    version = re.search(r"(?:version |LLVM version )(\d+\.\d+\.\d+)", output)
    if not version:
        raise ValueError(f"Cannot read {tool} version: {output}")
    expected = json.loads((ROOT / "tools/cpp-quality/toolchain.json").read_text())["llvm"]
    if version[1] != expected:
        raise ValueError(f"{tool} {version[1]} != pinned {expected}; use nix develop")
    return version[1]


def changed_ranges(path, base):
    patch = run(["git", "diff", "--unified=0", base, "--", str(path)],
                stdout=subprocess.PIPE, text=True).stdout
    if not patch:
        tracked = subprocess.run(["git", "cat-file", "-e", f"{base}:{path}"], cwd=ROOT,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if tracked.returncode:
            return [(1, max(1, len((ROOT / path).read_bytes().splitlines())))]
    return [(int(m[1]), int(m[1]) + int(m[2] or 1) - 1)
            for m in re.finditer(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", patch, re.M)
            if m[2] != "0"]


def format_check(args):
    tool_version(args.clang_format)
    failed = False
    for path in changed_files(args.base):
        if not first_party(path):
            continue
        ranges = changed_ranges(path, args.base)
        if not ranges:
            continue
        data = (ROOT / path).read_bytes()
        command = [args.clang_format, "--output-replacements-xml"]
        command += [f"--lines={a}:{b}" for a, b in ranges]
        command += [str(path)]
        # clang-format may adjust surrounding syntax to format the requested lines.
        result = run(command, stdout=subprocess.PIPE).stdout
        if b"<replacement " in result:
            print(f"Formatting required: {path}", file=sys.stderr)
            failed = True
    return int(failed)


def translation_units(database, changed=None):
    units = set()
    for entry in database:
        path = Path(entry["file"])
        if not path.is_absolute():
            path = Path(entry["directory"]) / path
        try:
            relative = path.resolve().relative_to(ROOT)
        except ValueError:
            continue
        if first_party(relative):
            units.add(relative)
    if not units:
        raise ValueError("Compilation database contains no first-party translation units")
    if changed is None:
        return sorted(units)
    cpp = {INCLUDED_IMPLEMENTATIONS.get(p, p) for p in changed if first_party(p)
           and (p not in NATIVE_UNSUPPORTED or p in units)}
    missing = {p for p in cpp - units if p.suffix not in {".h", ".hpp"}}
    if missing:
        raise ValueError("Changed sources absent from compile_commands.json: " +
                         ", ".join(map(str, sorted(missing))))
    # A changed header can affect every translation unit. Global build/profile
    # changes also require full analysis; never report a vacuous incremental pass.
    config = {"CMakeLists.txt", "CMakePresets.json", "flake.nix", "flake.lock", ".clang-tidy",
              "tools/cpp-quality/check.py", "tools/cpp-quality/toolchain.json",
              "tools/cpp-quality/baseline.json"}
    if any(p.suffix in {".h", ".hpp"} for p in cpp) or any(
            str(p) in config or str(p).startswith("cmake/") or p.name == "CMakeLists.txt"
            for p in changed):
        return sorted(units)
    return sorted(cpp & units)


def fingerprint(diagnostic):
    return tuple(diagnostic[k] for k in ("path", "check", "message", "source"))


def new_diagnostics(diagnostics, baseline):
    remaining = Counter({fingerprint(d): d["count"] for d in baseline})
    added = []
    for diagnostic in diagnostics:
        key = fingerprint(diagnostic)
        if remaining[key]:
            remaining[key] -= 1
        else:
            added.append(diagnostic)
    return added


def read_diagnostics(document):
    found = []
    for raw in document.get("Diagnostics", []):
        message = raw["DiagnosticMessage"]
        path = Path(message.get("FilePath", ""))
        if not path.is_absolute():
            path = ROOT / path
        try:
            relative = path.resolve().relative_to(ROOT)
        except ValueError:
            relative = None
        # Errors in vendor or system headers are still fatal, never baselined.
        if raw.get("Level") == "Error":
            raise ValueError(f"clang-tidy error: {message['Message']}")
        if relative is None or not first_party(relative):
            continue
        data = path.read_bytes()
        offset = message["FileOffset"]
        line = data[:offset].count(b"\n") + 1
        start = data.rfind(b"\n", 0, offset) + 1
        end = data.find(b"\n", offset)
        source = data[start:end if end >= 0 else len(data)].decode("utf-8").strip()
        check = raw["DiagnosticName"]
        priority = ("high" if check.startswith(("clang-analyzer-", "bugprone-", "concurrency-"))
                    else "medium" if check.startswith(("clang-diagnostic-", "cppcoreguidelines-"))
                    else "low")
        found.append({"path": relative.as_posix(), "check": check,
                      "message": message["Message"].replace(str(ROOT), "<repo>"),
                      "source": source, "line": line, "offset": offset, "priority": priority})
    return found


def source_snapshot(units, database):
    paths = {ROOT / unit for unit in units}
    paths.update(p for p in (ROOT / "src").rglob("*")
                 if p.suffix in {".h", ".hpp"} and "tmp" not in p.relative_to(ROOT).parts)
    paths.update(ROOT / fragment for fragment, owner in INCLUDED_IMPLEMENTATIONS.items()
                 if owner in units)
    paths.add(ROOT / ".clang-tidy")
    config_files = [ROOT / name for name in ["CMakeLists.txt", "CMakePresets.json", "flake.nix", "flake.lock",
                                            "tools/cpp-quality/check.py", "tools/cpp-quality/toolchain.json"]]
    paths.update(path for path in config_files if path.exists())
    paths.update((ROOT / "cmake").rglob("*.cmake"))
    digest = hashlib.sha256(json.dumps(database, sort_keys=True).encode())
    for path in sorted(paths):
        digest.update(str(path.relative_to(ROOT)).encode() + b"\0" + path.read_bytes())
    return digest.hexdigest()


def tidy_check(args):
    import yaml  # Supplied by the pinned Nix shell.
    version = tool_version(args.clang_tidy)
    profile = hashlib.sha256((ROOT / ".clang-tidy").read_bytes()).hexdigest()
    baseline = json.loads(BASELINE.read_text()) if BASELINE.exists() else None
    if not args.write_baseline and (baseline is None or baseline["llvm"] != version
                                    or baseline["profile_sha256"] != profile):
        raise ValueError("Missing or stale baseline; full analysis and explicit baseline review required")
    database = json.loads((args.build_dir / "compile_commands.json").read_text())
    units = translation_units(database, None if args.all else changed_files(args.base))
    args.report_dir.mkdir(parents=True, exist_ok=True)
    snapshot = source_snapshot(units, database)

    def analyze(path):
        with tempfile.TemporaryDirectory(prefix="glsmac-tidy-") as temporary:
            fixes = Path(temporary) / "fixes.yaml"
            command = [args.clang_tidy, "-p", str(args.build_dir), str(path),
                       f"--export-fixes={fixes}", "--quiet"]
            result = subprocess.run(command, cwd=ROOT, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, text=True)
            log = args.report_dir / (str(path).replace("/", "_") + ".log")
            log.write_text(result.stdout)
            if result.returncode:
                raise ValueError(f"clang-tidy failed for {path}; see {log}")
            found = read_diagnostics(yaml.safe_load(fixes.read_text()) or {}) if fixes.exists() else []
            print(f"Analyzed {path}: {len(found)} diagnostics", flush=True)
            return found

    unique = {}
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for found in pool.map(analyze, units):
            for diagnostic in found:
                # The same header finding can be emitted by many translation units.
                key = (diagnostic["path"], diagnostic["offset"], diagnostic["check"], diagnostic["message"])
                unique[key] = diagnostic
    current_database = json.loads((args.build_dir / "compile_commands.json").read_text())
    if snapshot != source_snapshot(units, current_database):
        raise ValueError("Sources or compile commands changed during analysis; rerun on a stable tree")
    diagnostics = sorted(unique.values(), key=lambda d: (d["path"], d["offset"], d["check"]))
    registered = set(translation_units(database))
    unsupported = [{"path": str(path), "reason": reason} for path, reason in sorted(NATIVE_UNSUPPORTED.items())
                   if path not in registered]
    report = {"llvm": version, "profile_sha256": profile, "unsupported_native_sources": unsupported,
              "translation_units": len(units), "source_snapshot": snapshot, "diagnostics": diagnostics}
    (args.report_dir / "diagnostics.json").write_text(json.dumps(report, indent=2) + "\n")
    if args.write_baseline:
        if not args.all:
            raise ValueError("Baseline writes require --all")
        counts = Counter(fingerprint(d) for d in diagnostics)
        entries = {fingerprint(d): {k: v for k, v in d.items() if k != "offset"} for d in diagnostics}
        report["diagnostics"] = [dict(entries[key], count=count) for key, count in sorted(counts.items())]
        report["source_revision"] = run(["git", "rev-parse", "HEAD"], stdout=subprocess.PIPE, text=True).stdout.strip()
        BASELINE.write_text(json.dumps(report, indent=2) + "\n")
        print(f"Wrote {len(diagnostics)} existing diagnostics for review to {BASELINE}")
        return 0
    added = new_diagnostics(diagnostics, baseline["diagnostics"])
    for d in added:
        print(f"{d['path']}:{d['line']}: {d['message']} [{d['check']}]", file=sys.stderr)
    print(f"{len(units)} translation units; {len(diagnostics)} findings; {len(added)} new; "
          f"{len(unsupported)} declared platform sources outside native static-analysis totals")
    return int(bool(added))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["format", "tidy"])
    parser.add_argument("--base", default="HEAD")
    parser.add_argument("--build-dir", type=Path, default=ROOT / "build/native")
    parser.add_argument("--report-dir", type=Path, default=ROOT / "build/cpp-quality")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--write-baseline", action="store_true")
    parser.add_argument("--jobs", type=int, default=2)
    parser.add_argument("--clang-tidy", default="clang-tidy")
    parser.add_argument("--clang-format", default="clang-format")
    args = parser.parse_args()
    if args.jobs < 1:
        parser.error("--jobs must be positive")
    args.build_dir = args.build_dir.resolve()
    args.report_dir = args.report_dir.resolve()
    try:
        return format_check(args) if args.mode == "format" else tidy_check(args)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(error, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
