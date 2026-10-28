#!/usr/bin/env python3
"""Compile and run asset-free native texture decoder regressions."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix="glsmac-texture-tests-") as directory:
    for test, source in (("flic", "Flic"), ("caviar", "Caviar")):
        binary = Path(directory) / (test + "-test")
        subprocess.run([
            os.environ.get("CXX", "c++"), "-std=c++23", "-Wall", "-Wextra", "-Werror",
            "-I", str(ROOT / "src"), str(ROOT / f"tools/texture-tests/{test}.cpp"),
            str(ROOT / f"src/loader/texture/{source}.cpp"), "-o", str(binary),
        ], check=True)
        subprocess.run([str(binary)], check=True)
