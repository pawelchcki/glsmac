import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import handoff


class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Handoff test")
        self.git("config", "user.email", "handoff@example.invalid")
        self.put(".gitignore", "/build\n")
        self.put("ROADMAP.md", "# Roadmap\n- [x] Delivered\n- [ ] Remaining\n  acceptance criterion.\n")
        self.put("tools/behavior-tests/lanes.json", json.dumps({"gaps": [{"id": "unrecorded", "reason": "no observation"}]}))
        self.put("tools/behavior-tests/ui/pending-catalog.json", json.dumps({"references": [{"id": "retained-failure"}]}))
        self.put("tracked.txt", "initial\n")
        self.git("add", ".")
        self.git("commit", "-m", "fixture")
        self.git("update-ref", "refs/remotes/wasmsmac/main", "HEAD")

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.root), *args], stderr=subprocess.PIPE).decode().strip()

    def put(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def capture(self, **kwargs):
        return handoff.capture(self.root, "refs/remotes/wasmsmac/main", "worker", "roadmap task", "review PR", **kwargs)

    def test_clean_identity_and_unsupported_accounting(self):
        record = self.capture()
        self.assertEqual(record["source"]["head"], self.git("rev-parse", "HEAD"))
        self.assertEqual(record["source"]["base_head"], record["source"]["head"])
        self.assertEqual(record["source"]["dirty"], [])
        self.assertEqual(record["remaining"]["unchecked_items"], ["Remaining acceptance criterion."])
        self.assertEqual(record["remaining"]["pending_ui_ids"], ["retained-failure"])
        self.assertEqual(record["remaining"]["unrecorded_gaps"][0]["id"], "unrecorded")
        self.assertEqual(record["runtime"]["files"], [])
        self.assertIn("unknown", record["runtime"]["compiled_source"])

    def test_dirty_names_renames_deletions_and_contents_survive(self):
        self.git("mv", "tracked.txt", "renamed file.txt")
        self.put("renamed file.txt", "edited\n")
        self.put("untracked\nfile.txt", "first")
        (self.root / "ROADMAP.md").unlink()
        state = handoff.source_state(self.root, "refs/remotes/wasmsmac/main")
        rows = {row["path"]: row for row in state["dirty"]}
        self.assertEqual(rows["renamed file.txt"]["original_path"], "tracked.txt")
        self.assertEqual(rows["ROADMAP.md"]["status"], " D")
        self.assertEqual(rows["untracked\nfile.txt"]["sha256"], hashlib.sha256(b"first").hexdigest())
        self.put("untracked\nfile.txt", "second")
        self.assertNotEqual(state, handoff.source_state(self.root, "refs/remotes/wasmsmac/main"))

    def test_index_and_worktree_edits_are_distinct(self):
        clean = self.capture()["source"]
        self.put("tracked.txt", "staged\n")
        self.git("add", "tracked.txt")
        self.put("tracked.txt", "initial\n")
        state = self.capture()["source"]
        self.assertEqual(state["worktree_diff_sha256"], clean["worktree_diff_sha256"])
        self.assertNotEqual(state["index_diff_sha256"], clean["index_diff_sha256"])
        self.assertEqual(state["dirty"][0]["status"], "MM")

    def test_detached_head_and_stale_local_base_are_explicit(self):
        base = self.git("rev-parse", "HEAD")
        self.put("tracked.txt", "new commit\n")
        self.git("commit", "-am", "advance")
        self.git("checkout", "--detach")
        source = self.capture()["source"]
        self.assertIsNone(source["branch"])
        self.assertEqual(source["base_head"], base)
        self.assertNotEqual(source["head"], base)
        self.assertIn("local ref only", source["base_observation"])

    def test_missing_base_fails_without_using_current_head(self):
        self.git("update-ref", "-d", "refs/remotes/wasmsmac/main")
        with self.assertRaises(subprocess.CalledProcessError):
            self.capture()

    def test_runtime_pair_and_check_report_are_hashed_without_claiming_pass(self):
        loader = self.put("build/GLSMAC.js", "loader")
        wasm = self.put("build/GLSMAC.wasm", "engine")
        report = self.put("build/test.json", '{"summary":{"failed":1}}')
        record = self.capture(runtimes=[loader], reports=[report], gaps=["browser untested"])
        self.assertEqual(record["runtime"]["files"], [handoff.fingerprint(loader), handoff.fingerprint(wasm)])
        self.assertEqual(record["last_check_reports"]["files"], [handoff.fingerprint(report)])
        self.assertIn("not revalidated", record["last_check_reports"]["validation"])
        self.assertEqual(record["task_gaps"], ["browser untested"])
        wasm.unlink()
        with self.assertRaises(FileNotFoundError):
            self.capture(runtimes=[loader])

    def test_untracked_symlink_hashes_link_without_reading_target(self):
        (self.root / "link").symlink_to("absent")
        row = self.capture()["source"]["dirty"][0]
        self.assertEqual(row["symlink_sha256"], hashlib.sha256(b"absent").hexdigest())

    def test_nested_untracked_repository_is_explicitly_not_fingerprinted(self):
        nested = self.root / "nested"
        nested.mkdir()
        subprocess.run(["git", "init", str(nested)], check=True, capture_output=True)
        self.put("nested/file.txt", "untracked in nested repository")
        row = self.capture()["source"]["dirty"][0]
        self.assertEqual(row["path"], "nested/")
        self.assertIn("not fingerprinted", row["contents"])

    def test_changes_during_capture_reject_record(self):
        original = handoff.remaining_items

        def changing(root):
            result = original(root)
            self.put("tracked.txt", "concurrent edit")
            return result

        with patch.object(handoff, "remaining_items", changing):
            with self.assertRaisesRegex(ValueError, "state changed"):
                self.capture()

    def test_changed_runtime_rejects_record(self):
        runtime = self.put("build/GLSMAC", "old runtime")
        original = handoff.remaining_items

        def changing(root):
            runtime.write_text("new runtime")
            return original(root)

        with patch.object(handoff, "remaining_items", changing):
            with self.assertRaisesRegex(ValueError, "Runtime/report changed"):
                self.capture(runtimes=[runtime])

    def test_output_preserves_git_state_and_protects_inputs(self):
        record = self.capture()
        target = self.root / "build/handoff.json"
        handoff.write_record(target, record)
        self.assertEqual(json.loads(target.read_text()), record)
        self.assertEqual(self.capture()["source"], record["source"])
        self.assertEqual(list(target.parent.iterdir()), [target])
        with self.assertRaises(subprocess.CalledProcessError):
            handoff.write_record(self.root / "ROADMAP.md", record)
        with self.assertRaises(subprocess.CalledProcessError):
            handoff.write_record(self.root / "untracked.json", record)
        runtime = self.put("build/GLSMAC", "engine")
        record = self.capture(runtimes=[runtime])
        with self.assertRaisesRegex(ValueError, "replace an input"):
            handoff.write_record(runtime, record)
        self.assertEqual(runtime.read_text(), "engine")


if __name__ == "__main__":
    unittest.main()
