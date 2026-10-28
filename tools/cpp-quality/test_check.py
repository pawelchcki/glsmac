"""Regressions for the delivery gate: fail closed and retain baseline multiplicity."""
import importlib.util
from pathlib import Path
import tempfile
import argparse
import shutil
import json
from contextlib import redirect_stdout, redirect_stderr
import io
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("cpp_quality", Path(__file__).with_name("check.py"))
quality = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(quality)


class GateTests(unittest.TestCase):
    def diagnostic(self, path="src/probe.cpp", source="int count;", **extra):
        return {"path": path, "check": "cppcoreguidelines-init-variables",
                "message": "variable is not initialized", "source": source, **extra}

    def test_baseline_tracks_each_occurrence(self):
        old = self.diagnostic(count=1)
        self.assertEqual(quality.new_diagnostics([self.diagnostic()], [old]), [])
        self.assertEqual(len(quality.new_diagnostics([self.diagnostic(), self.diagnostic()], [old])), 1)

    def test_baseline_does_not_hide_different_code_or_file(self):
        old = self.diagnostic(count=2)
        added = [self.diagnostic(source="int other;"), self.diagnostic(path="src/new.cpp")]
        self.assertEqual(quality.new_diagnostics(added, [old]), added)

    def test_moving_lines_does_not_create_false_findings(self):
        self.assertEqual(quality.new_diagnostics([self.diagnostic(line=99)],
                                                [self.diagnostic(line=1, count=1)]), [])

    def test_generated_and_vendor_code_is_excluded(self):
        for path in ["dependencies/a.cpp", "build/generated.cpp", "src/tmp/embed.cpp", "web/a.js"]:
            self.assertFalse(quality.first_party(path))
        for path in ["src/common/Thread.h", "tools/embedder.cpp", "tools/innoextract/browser.cpp"]:
            self.assertTrue(quality.first_party(path))

    def test_headers_and_configuration_trigger_full_analysis(self):
        db = [{"file": str(quality.ROOT / p), "directory": str(quality.ROOT)}
              for p in ["src/a.cpp", "src/b.cpp", "src/tmp/embed.cpp"]]
        for change in ["src/a.h", "cmake/ProjectOptions.cmake", ".clang-tidy", "flake.lock", "CMakePresets.json"]:
            self.assertEqual(quality.translation_units(db, [Path(change)]),
                             [Path("src/a.cpp"), Path("src/b.cpp")])
        self.assertEqual(quality.translation_units(db, [Path("src/b.cpp")]), [Path("src/b.cpp")])
        self.assertEqual(quality.translation_units(db, [Path("README.md")]), [])

    def test_included_cpp_selects_its_real_owning_unit(self):
        db = [{"file": str(quality.ROOT / "src/ui/dom/Object.cpp"), "directory": str(quality.ROOT)}]
        self.assertEqual(quality.translation_units(db, [Path("src/ui/dom/Object.colormap.cpp")]),
                         [Path("src/ui/dom/Object.cpp")])
        other = [{"file": str(quality.ROOT / "src/unrelated.cpp"), "directory": str(quality.ROOT)}]
        with self.assertRaisesRegex(ValueError, "absent"):
            quality.translation_units(other, [Path("src/ui/dom/Object.colormap.cpp")])

    def test_known_wasm_sources_remain_explicitly_outside_native_analysis(self):
        db = [{"file": str(quality.ROOT / "src/native.cpp"), "directory": str(quality.ROOT)}]
        path = Path("tools/wasm-tests/platform.cpp")
        self.assertIn("platform-build.mjs", quality.NATIVE_UNSUPPORTED[path])
        self.assertEqual(quality.translation_units(db, [path]), [])
        # A suitable platform compilation database still selects the real unit.
        wasm = [{"file": str(quality.ROOT / path), "directory": str(quality.ROOT)}]
        self.assertEqual(quality.translation_units(wasm, [path]), [path])

    def test_missing_compilation_entry_is_fatal(self):
        db = [{"file": str(quality.ROOT / "src/a.cpp"), "directory": str(quality.ROOT)}]
        with self.assertRaisesRegex(ValueError, "absent"):
            quality.translation_units(db, [Path("src/missing.cpp")])
        with self.assertRaisesRegex(ValueError, "absent"):
            quality.translation_units(db, [Path("src/missing.cpp"), Path("CMakePresets.json")])
        with self.assertRaisesRegex(ValueError, "no first-party"):
            quality.translation_units([])

    def test_parser_errors_cannot_be_baselined_even_in_vendor_code(self):
        with self.assertRaisesRegex(ValueError, "clang-tidy error"):
            quality.read_diagnostics({"Diagnostics": [{"Level": "Error", "DiagnosticMessage": {
                "FilePath": "/outside/repo/header.h", "Message": "fatal parsing error"}}]})

    def test_diagnostic_anchor_uses_offset_line_and_relative_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "src").mkdir()
            path = root / "src/a.cpp"
            path.write_text("// heading\n  int count;\n")
            with patch.object(quality, "ROOT", root):
                result = quality.read_diagnostics({"Diagnostics": [{
                    "DiagnosticName": "cppcoreguidelines-init-variables", "Level": "Warning",
                    "DiagnosticMessage": {"FilePath": str(path), "FileOffset": 17,
                                          "Message": "variable is not initialized"}}]})
            self.assertEqual(result[0]["path"], "src/a.cpp")
            self.assertEqual(result[0]["source"], "int count;")
            self.assertEqual(result[0]["line"], 2)

    def test_preset_changes_invalidate_an_inflight_source_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "src").mkdir()
            (root / "src/probe.cpp").write_text("int main() { return 0; }\n")
            (root / ".clang-tidy").write_text("Checks: '-*'\n")
            presets = root / "CMakePresets.json"
            presets.write_text('{"flags":"before"}')
            with patch.object(quality, "ROOT", root):
                before = quality.source_snapshot([Path("src/probe.cpp")], [])
                presets.write_text('{"flags":"after"}')
                self.assertNotEqual(before, quality.source_snapshot([Path("src/probe.cpp")], []))

    @unittest.skipUnless(shutil.which("clang-tidy"), "requires pinned Nix tools")
    def test_real_tidy_rejects_new_diagnostic_after_baseline(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "src").mkdir()
            (root / "tools/cpp-quality").mkdir(parents=True)
            (root / ".clang-tidy").write_text("Checks: '-*,cppcoreguidelines-init-variables'\n")
            shutil.copyfile(quality.ROOT / "tools/cpp-quality/toolchain.json",
                            root / "tools/cpp-quality/toolchain.json")
            source = root / "src/probe.cpp"
            source.write_text("void probe() { int existing; }\n")
            (root / "compile_commands.json").write_text(json.dumps([{
                "directory": str(root), "file": str(source),
                "arguments": ["clang++", "-std=c++23", "-c", str(source)]}]))
            args = argparse.Namespace(clang_tidy="clang-tidy", build_dir=root,
                                      report_dir=root / "reports", jobs=1, all=True,
                                      write_baseline=True)
            with patch.object(quality, "ROOT", root), patch.object(quality, "BASELINE", root / "baseline.json"), \
                    patch.object(quality, "run", side_effect=lambda cmd, **kw: __import__("subprocess").run(
                        cmd, cwd=quality.ROOT if cmd[0] != "git" else Path(__file__).parent,
                        check=True, **kw)), redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                self.assertEqual(quality.tidy_check(args), 0)
                args.write_baseline = False
                self.assertEqual(quality.tidy_check(args), 0)
                source.write_text("void probe() { int existing; int introduced; }\n")
                self.assertEqual(quality.tidy_check(args), 1)


if __name__ == "__main__":
    unittest.main()
