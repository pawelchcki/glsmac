#!/usr/bin/env python3
"""Serve a GLSMAC browser build with the headers required by WASM threads."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

from wasm_assets import AssetError, asset_root, build_manifest, manifest_bytes, open_asset


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".wasm": "application/wasm", ".wav": "audio/wav"}

    def __init__(self, *args, assets=None, asset_manifest=None, **kwargs):
        self.assets = assets
        self.asset_manifest = asset_manifest
        self.asset_paths = {entry["path"] for entry in asset_manifest["files"]} if assets else set()
        super().__init__(*args, **kwargs)

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        try:
            path = unquote(urlsplit(self.path).path, errors="strict")
        except (UnicodeError, ValueError):
            self.send_error(400, "Invalid URL")
            return None
        if not path.startswith("/assets/"):
            return super().send_head()
        if self.assets is None:
            self.send_error(404, "No asset directory configured")
            return None
        relative = path[len("/assets/"):]
        if relative == "manifest.json":
            data = manifest_bytes(self.asset_manifest)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return BytesIO(data)
        if relative not in self.asset_paths:
            self.send_error(404, "Unknown asset")
            return None
        try:
            handle = open_asset(self.assets, relative)
        except (AssetError, OSError):
            self.send_error(404, "Asset unavailable")
            return None
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(relative))
        self.send_header("Content-Length", str(os.fstat(handle.fileno()).st_size))
        self.end_headers()
        return handle


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", default="build/wasm/bin", type=Path)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--assets", type=Path,
                        help="serve original game files and /assets/manifest.json without copying them")
    args = parser.parse_args()
    if not (args.directory / "GLSMAC.js").is_file():
        parser.error(f"{args.directory} does not contain GLSMAC.js; build the WASM target first")
    assets = None
    manifest = None
    if args.assets is not None:
        try:
            assets = asset_root(args.assets)
            manifest = build_manifest(assets)
        except (AssetError, OSError) as error:
            parser.error(str(error))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(
        Handler, directory=str(args.directory), assets=assets, asset_manifest=manifest))
    print(f"GLSMAC: http://127.0.0.1:{server.server_port}", flush=True)
    if assets is not None:
        print(f"Assets: http://127.0.0.1:{server.server_port}/assets/manifest.json", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
