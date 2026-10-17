#!/usr/bin/env python3
"""Build a pinned innoextract browser module; downloaded sources stay in build/."""

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request


SOURCES = [
    (
        "innoextract-1.9.tar.gz", "innoextract-1.9",
        "https://constexpr.org/innoextract/files/innoextract-1.9.tar.gz",
        "6344a69fc1ed847d4ed3e272e0da5998948c6b828cb7af39c6321aba6cf88126",
    ),
    (
        "boost_1_83_0.tar.bz2", "boost_1_83_0",
        "https://archives.boost.io/release/1.83.0/source/boost_1_83_0.tar.bz2",
        "6478edfe2f3305127cffe8caf73ea0176c53769f4bf1585be237eb30798c3b8e",
    ),
    (
        "xz-5.8.1.tar.xz", "xz-5.8.1",
        "https://github.com/tukaani-project/xz/releases/download/v5.8.1/xz-5.8.1.tar.xz",
        "0b54f79df85912504de0b14aec7971e3f964491af1812d83447005807513cd9e",
    ),
]


def file_digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def write_changed(path, text):
    if not path.exists() or path.read_text() != text:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)


def prepare_sources(cache):
    downloads = cache / "downloads"
    sources = cache / "sources"
    downloads.mkdir(parents=True, exist_ok=True)
    sources.mkdir(parents=True, exist_ok=True)
    for filename, directory, url, expected in SOURCES:
        archive = downloads / filename
        if not archive.exists() or file_digest(archive) != expected:
            print(f"Downloading {filename}", flush=True)
            temporary = archive.with_suffix(archive.suffix + ".part")
            with urllib.request.urlopen(url) as response, temporary.open("wb") as output:
                shutil.copyfileobj(response, output)
            if file_digest(temporary) != expected:
                temporary.unlink()
                raise RuntimeError(f"Source checksum mismatch: {filename}")
            temporary.replace(archive)
        marker = sources / directory / ".glsmac-extracted"
        if not marker.exists():
            print(f"Extracting {filename}", flush=True)
            with tarfile.open(archive) as source:
                # Avoid Boost's unrelated tools, examples, documentation and
                # tests: only headers and the three compiled libraries are used.
                members = source.getmembers()
                if directory.startswith("boost_"):
                    prefixes = [f"{directory}/boost/", f"{directory}/libs/filesystem/src/",
                                f"{directory}/libs/iostreams/src/", f"{directory}/libs/program_options/src/"]
                    members = [member for member in members if member.name == f"{directory}/LICENSE_1_0.txt"
                               or any(member.name.startswith(prefix) for prefix in prefixes)]
                source.extractall(sources, members=members, filter="data")
            marker.write_text(expected)
    return sources


def prepare_inno_source(source):
    extract = source / "src/cli/extract.cpp"
    original = extract.read_text()
    if '"browser-callback.hpp"' not in original:
        original = original.replace('#include "cli/extract.hpp"',
                                    '#include "cli/extract.hpp"\n#include "browser-callback.hpp"')
        anchor = "\t\t\t\t// Adjust file timestamps"
        if original.count(anchor) != 1:
            raise RuntimeError("Unexpected innoextract completion hook location")
        original = original.replace(anchor, """\t\t\t\t// GLSMAC browser adaptation: publish each completed output before
\t\t\t\t// continuing, so the JavaScript worker can release its MEMFS bytes.
\t\t\t\tif(o.extract) {
\t\t\t\t\toutput->close();
\t\t\t\t\tif(glsmac_store_output_file(output->path().string().c_str()) != 0) {
\t\t\t\t\t\tthrow std::runtime_error("Could not save extracted file");
\t\t\t\t\t}
\t\t\t\t}

""" + anchor)
        extract.write_text(original)


def write_release(source, binary):
    version = (source / "VERSION").read_text().splitlines()
    license_text = (source / "LICENSE").read_text()
    fields = {
        "innoextract_name": "innoextract",
        "innoextract_version": "1.9 (GLSMAC browser adaptation)",
        "innosetup_versions": version[3],
        "innoextract_bugs": version[6],
        "innoextract_copyright": license_text.splitlines()[0],
        "innoextract_license": license_text,
    }
    content = '#include "release.hpp"\n'
    content += "\n".join(f"const char {key}[] = {json.dumps(value)};" for key, value in fields.items())
    write_changed(binary / "release.cpp", content + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=Path("build/wasm-extractor"))
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--jobs", type=int, default=min(8, os.cpu_count() or 1))
    args = parser.parse_args()
    if args.jobs < 1:
        parser.error("--jobs must be positive")
    cache = args.cache_dir.resolve()
    cache.mkdir(parents=True, exist_ok=True)
    project = Path(__file__).resolve().parent / "innoextract"
    compiler = shutil.which(os.environ.get("EMXX", "em++"))
    if not compiler:
        parser.error("Activate Emscripten or set EMXX to its em++ executable")
    sdk = Path(compiler).resolve().parent
    with (cache / ".build.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        sources = prepare_sources(cache)
        inno = sources / "innoextract-1.9"
        prepare_inno_source(inno)
        binary = cache / "cmake"
        write_release(inno, binary)
        subprocess.run([
            str(sdk / "emcmake"), "cmake", "-S", str(project), "-B", str(binary),
            f"-DINNO_SOURCE={inno}", f"-DBOOST_SOURCE={sources / 'boost_1_83_0'}",
            f"-DXZ_SOURCE={sources / 'xz-5.8.1'}",
        ], check=True)
        subprocess.run(["cmake", "--build", str(binary), "--parallel", str(args.jobs),
                        "--target", "innoextract"], check=True)
        notices = "GLSMAC browser installer extractor\n\n"
        notices += "innoextract 1.9 is adapted with a completed-file browser callback.\n"
        notices += "No installer executable is run. Parser and compression sources are compiled to WebAssembly.\n\n"
        for title, path in [
            ("innoextract 1.9", inno / "LICENSE"),
            ("Boost 1.83.0", sources / "boost_1_83_0/LICENSE_1_0.txt"),
            ("XZ/liblzma 5.8.1", sources / "xz-5.8.1/COPYING"),
            ("XZ/liblzma 0BSD notice", sources / "xz-5.8.1/COPYING.0BSD"),
        ]:
            notices += f"{title}\n{'=' * len(title)}\n{path.read_text()}\n\n"
        notices += "zlib and bzip2 are Emscripten ports, under the zlib and bzip2 licenses.\n"
        for port, filename in [("zlib", "LICENSE"), ("bzip2", "LICENSE")]:
            matches = list((sdk / "cache/ports").glob(f"{port}/**/{filename}"))
            if matches:
                notices += f"\n{port}\n{matches[0].read_text()}\n"
        write_changed(binary / "bin/innoextract-licenses.txt", notices)
        args.output_dir.mkdir(parents=True, exist_ok=True)
        for filename in ["innoextract.js", "innoextract.wasm", "innoextract-licenses.txt"]:
            source = binary / "bin" / filename
            destination = args.output_dir / filename
            if not destination.exists() or file_digest(source) != file_digest(destination):
                shutil.copyfile(source, destination)
        print(f"Installer extractor ready in {args.output_dir}", flush=True)


if __name__ == "__main__":
    main()
