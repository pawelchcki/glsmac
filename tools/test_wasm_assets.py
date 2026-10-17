"""Run with: python3 -m unittest discover -s tools -p test_wasm_assets.py"""

from functools import partial
import hashlib
from http.server import ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

from wasm_assets import AssetError, build_manifest, open_asset, validate_path, write_manifest


spec = importlib.util.spec_from_file_location("serve_wasm", Path(__file__).with_name("serve-wasm.py"))
serve_wasm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serve_wasm)


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "assets"
        self.root.mkdir()
        (self.root / "a.pcx").write_bytes(b"asset-one")
        (self.root / "voices").mkdir()
        (self.root / "voices" / "voix été #1?.wav").write_bytes(b"asset-two")

    def test_manifest_is_deterministic_and_indexes_unicode_names(self):
        first = build_manifest(self.root)
        second = build_manifest(self.root)
        self.assertEqual(first, second)
        self.assertEqual(first["version"], 1)
        self.assertEqual(len(first["id"]), 64)
        self.assertEqual(first["files"], [
            {"path": "a.pcx", "size": 9, "sha256": hashlib.sha256(b"asset-one").hexdigest()},
            {"path": "voices/voix été #1?.wav", "size": 9,
             "sha256": hashlib.sha256(b"asset-two").hexdigest()},
        ])
        (self.root / "a.pcx").touch()
        self.assertEqual(build_manifest(self.root)["id"], first["id"])
        (self.root / "a.pcx").write_bytes(b"asset-new")
        self.assertNotEqual(build_manifest(self.root)["id"], first["id"])
        (self.root / "a.pcx").rename(self.root / "renamed.pcx")
        self.assertNotEqual(build_manifest(self.root)["id"], second["id"])

    def test_output_never_overwrites_without_force_and_excludes_itself(self):
        output = self.root / "manifest.json"
        expected = build_manifest(self.root)
        self.assertEqual(write_manifest(self.root, output), expected)
        self.assertEqual(json.loads(output.read_text()), expected)
        self.assertEqual(build_manifest(self.root), expected)
        original = output.read_bytes()
        with self.assertRaises(FileExistsError):
            write_manifest(self.root, output)
        self.assertEqual(output.read_bytes(), original)
        self.assertEqual(write_manifest(self.root, output, force=True), expected)

    def test_custom_manifest_output_inside_assets_is_excluded(self):
        output = self.root / "index.json"
        expected = build_manifest(self.root)
        self.assertEqual(write_manifest(self.root, output), expected)
        self.assertEqual(write_manifest(self.root, output, force=True), expected)

    def test_rejects_unsafe_paths(self):
        for path in ("", "/a.pcx", "../a.pcx", "voices/../../a.pcx", "a//b",
                     "./a.pcx", "a/./b", "a/../b", "a\\b", "a\x00b", "a\nb"):
            with self.subTest(path=path), self.assertRaises(AssetError):
                validate_path(path)
        with self.assertRaises(AssetError):
            open_asset(self.root, "../outside")

    def test_rejects_file_and_directory_symlinks(self):
        outside = Path(self.temporary.name) / "outside"
        outside.write_bytes(b"secret")
        link = self.root / "link"
        link.symlink_to(outside)
        with self.assertRaises(AssetError):
            build_manifest(self.root)
        with self.assertRaises((AssetError, OSError)):
            open_asset(self.root, "link")
        link.unlink()
        link.symlink_to(outside.parent, target_is_directory=True)
        with self.assertRaises(AssetError):
            build_manifest(self.root)
        with self.assertRaises((AssetError, OSError)):
            open_asset(self.root, "link/outside")

    def test_manifest_output_symlink_is_never_followed(self):
        outside = Path(self.temporary.name) / "outside"
        outside.write_bytes(b"secret")
        output = self.root / "manifest.json"
        output.symlink_to(outside)
        with self.assertRaises(AssetError):
            write_manifest(self.root, output, force=True)
        self.assertEqual(outside.read_bytes(), b"secret")


class QuietHandler(serve_wasm.Handler):
    def log_message(self, *_args):
        pass


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.app = self.root / "app"
        self.app.mkdir()
        (self.app / "GLSMAC.js").write_text("// runtime")
        (self.app / "GLSMAC.wasm").write_bytes(b"wasm")
        self.assets = self.root / "assets"
        self.assets.mkdir()
        self.path = "voices/été #1?.wav"
        (self.assets / "voices").mkdir()
        (self.assets / self.path).write_bytes(b"sound")
        (self.root / "outside").write_bytes(b"secret")
        self.manifest = build_manifest(self.assets)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(
            QuietHandler, directory=str(self.app), assets=self.assets, asset_manifest=self.manifest))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def test_manifest_assets_headers_and_original_build_routes(self):
        with urlopen(self.base + "/assets/manifest.json") as response:
            self.assertEqual(json.load(response), self.manifest)
            self.assertEqual(response.headers.get_content_type(), "application/json")
            self.assertEqual(response.headers["Cross-Origin-Opener-Policy"], "same-origin")
            self.assertEqual(response.headers["Cross-Origin-Embedder-Policy"], "require-corp")
            self.assertEqual(response.headers["Cross-Origin-Resource-Policy"], "cross-origin")
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], "*")
        with urlopen(self.base + "/assets/" + quote(self.path)) as response:
            self.assertEqual(response.read(), b"sound")
            self.assertEqual(response.headers.get_content_type(), "audio/wav")
        with urlopen(self.base + "/GLSMAC.wasm") as response:
            self.assertEqual(response.read(), b"wasm")
            self.assertEqual(response.headers.get_content_type(), "application/wasm")
        request = Request(self.base + "/assets/" + quote(self.path), method="HEAD")
        with urlopen(request) as response:
            self.assertEqual(response.headers["Content-Length"], "5")
            self.assertEqual(response.read(), b"")

    def test_refuses_traversal_unindexed_files_and_new_symlink_escape(self):
        (self.assets / "unindexed").write_bytes(b"new")
        for path in ("../outside", "%2e%2e/outside", "voices/%2e%2e/%2e%2e/outside",
                     "%2fetc/passwd", "voices%5c..%5coutside", "unindexed"):
            with self.subTest(path=path), self.assertRaises(HTTPError) as error:
                urlopen(self.base + "/assets/" + path)
            self.assertEqual(error.exception.code, 404)
            error.exception.close()
        (self.assets / self.path).unlink()
        (self.assets / self.path).symlink_to(self.root / "outside")
        with self.assertRaises(HTTPError) as error:
            urlopen(self.base + "/assets/" + quote(self.path))
        self.assertEqual(error.exception.code, 404)
        error.exception.close()


if __name__ == "__main__":
    unittest.main()
