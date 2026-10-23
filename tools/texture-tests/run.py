#!/usr/bin/env python3
"""Compile and run asset-free native texture decoder regressions."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix="glsmac-flic-tests-") as directory:
    binary = Path(directory) / "flic-test"
    subprocess.run([
        os.environ.get("CXX", "c++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
        "-I", str(ROOT / "src"), str(ROOT / "tools/texture-tests/flic.cpp"),
        str(ROOT / "src/loader/texture/Flic.cpp"), "-o", str(binary),
    ], check=True)
    subprocess.run([str(binary)], check=True)
