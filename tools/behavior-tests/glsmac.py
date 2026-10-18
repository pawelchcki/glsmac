#!/usr/bin/env python3
"""Run the production GLSMAC distance helper through the comparison protocol."""

import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile

from protocol import load_request, validate_cases, validate_distance_input, write_response


ALGORITHM = "map.same_row_distance.v1"
DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parent.parent


def run_distances(inputs, target):
    build = DIRECTORY / ".build"
    build.mkdir(exist_ok=True)
    # Separate builds let simultaneous comparisons use their own executable.
    with tempfile.TemporaryDirectory(prefix=f"glsmac-{target}-", dir=build) as temporary:
        executable = Path(temporary) / ("glsmac.cjs" if target == "wasm" else "glsmac")
        compiler = os.environ.get("EMXX", "em++") if target == "wasm" else "g++"
        command = [
            compiler, str(DIRECTORY / "glsmac.cpp"), f"-I{ROOT / 'src'}",
            "-std=c++17", "-O2", "-Wall", "-Wextra", "-Werror",
        ]
        if target == "wasm":
            command.extend(["-sENVIRONMENT=node", "-sEXIT_RUNTIME=1"])
        command.extend(["-o", str(executable)])
        subprocess.run(command, check=True, stdout=sys.stderr, timeout=120)
        rows = "".join(
            f"{value['width']} {value['x1']} {value['x2']} {value['y']}\n"
            for value in inputs
        )
        command = ["node", str(executable)] if target == "wasm" else [str(executable)]
        completed = subprocess.run(
            command, input=rows, capture_output=True, text=True, check=True, timeout=30,
        )
        if completed.stderr:
            sys.stderr.write(completed.stderr)
        lines = completed.stdout.splitlines()
        if len(lines) != len(inputs) or any(not line.isdecimal() for line in lines):
            raise ValueError("Candidate executable returned an invalid distance response")
        return [int(line) for line in lines]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("native", "wasm"), default="native")
    args = parser.parse_args()
    request = load_request()
    validate_cases(request)
    cases = request["cases"]
    supported = [case for case in cases if case["algorithm"] == ALGORITHM]
    for case in supported:
        validate_distance_input(case["input"])
    distances = iter(run_distances([case["input"] for case in supported], args.target)) if supported else iter(())
    results = []
    for case in cases:
        if case["algorithm"] == ALGORITHM:
            results.append({"id": case["id"], "status": "ok", "output": {"distance": next(distances)}})
        else:
            results.append({
                "id": case["id"], "status": "unsupported",
                "reason": "This adapter supports only map.same_row_distance.v1",
            })
    write_response({
        "name": "glsmac", "kind": "candidate", "target": args.target,
        "source": "src/game/backend/map/tile/Geometry.h",
        "algorithms": [ALGORITHM],
        "scope": "Same-row horizontal distance only",
    }, results)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f"GLSMAC adapter failed: {error}", file=sys.stderr)
        sys.exit(1)
