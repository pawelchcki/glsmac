#!/usr/bin/env python3
"""Compile and run synthetic shared-parser fixtures in an isolated directory."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile


DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[1]
SOURCES = (
    ROOT / "src/loader/txt/SmacText.h",
    DIRECTORY / "test_smac_text.cpp",
    DIRECTORY / "inspect.cpp",
    Path(__file__).resolve(),
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tool_identity(command):
    executable = shutil.which(command[0])
    if executable is None:
        raise OSError(f"Executable not found: {command[0]}")
    path = Path(executable).resolve()
    return {"path": str(path), "sha256": digest(path)}


def execute(command, timeout):
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
    return {"command": command, "exit_code": result.returncode,
            "stdout": result.stdout, "stderr": result.stderr}


def verify(args, report):
    compiler = shlex.split(os.environ.get("EMXX", "em++") if args.target == "wasm"
                           else os.environ.get("CXX", "c++"))
    if not compiler:
        raise ValueError("Compiler command is empty")
    report["compiler"] = tool_identity(compiler)
    with tempfile.TemporaryDirectory(prefix=f"glsmac-smac-text-{args.target}-") as temporary:
        directory = Path(temporary)
        executable = directory / ("test_smac_text.cjs" if args.target == "wasm" else "test_smac_text")
        command = [*compiler, "-std=c++17", "-O2", "-Wall", "-Wextra", "-Werror",
                   f"-I{ROOT / 'src'}", str(DIRECTORY / "test_smac_text.cpp")]
        if args.target == "wasm":
            # Match the application's compile/link exception support: invalid
            # input fixtures deliberately exercise native throw/catch paths.
            command.extend(["-fexceptions", "-sENVIRONMENT=node", "-sEXIT_RUNTIME=1", "-sWASM_ASYNC_COMPILATION=0"])
        command.extend(["-o", str(executable)])
        report["compile"] = execute(command, args.compile_timeout)
        if report["compile"]["exit_code"] != 0:
            report["error"] = "Fixture compilation failed"
            return False
        report["artifacts"] = {path.name: digest(path) for path in sorted(directory.iterdir()) if path.is_file()}
        if args.target == "wasm":
            node = shlex.split(os.environ.get("NODE", "node"))
            if not node:
                raise ValueError("Node command is empty")
            report["runtime"] = tool_identity(node)
            command = [*node, str(executable)]
        else:
            report["runtime"] = {"path": str(executable), "sha256": digest(executable)}
            command = [str(executable)]
        report["run"] = execute(command, args.run_timeout)
        passed = (report["run"]["exit_code"] == 0 and
                  re.fullmatch(r"PASS [1-9][0-9]* scenarios / [1-9][0-9]* assertions\n?", report["run"]["stdout"]) is not None)
        if not passed:
            report["error"] = "Fixture run failed or did not emit its strict PASS summary"
        return passed


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("native", "wasm"), default="native")
    parser.add_argument("--report", type=Path, help="Also write the JSON report to this path")
    parser.add_argument("--compile-timeout", type=float, default=120)
    parser.add_argument("--run-timeout", type=float, default=30)
    args = parser.parse_args(argv)
    if not 0 < args.compile_timeout < float("inf") or not 0 < args.run_timeout < float("inf"):
        parser.error("Timeouts must be finite and positive")
    report = {"version": 1, "kind": "smac-text-synthetic-fixtures", "target": args.target,
              "scope": "Data import fixtures; no installed assets or original-executable behavior parity",
              "compiled_sources": ["tools/smac-data/test_smac_text.cpp"], "status": "error"}
    try:
        report["sources"] = {str(path.relative_to(ROOT)): digest(path) for path in SOURCES}
        if verify(args, report):
            report["status"] = "pass"
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        report["error"] = str(error)
    encoded = json.dumps(report, indent=2, sort_keys=True, ensure_ascii=True) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(encoded, encoding="utf-8")
    sys.stdout.write(encoded)
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
