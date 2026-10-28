"""Public candidate evidence replay; no assets, runtime, browser or game."""
from pathlib import Path
import copy
import gzip
import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from state_trace import unit_body_movement_retained as retained

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / 'tools/behavior-tests/ui'
BUNDLE = UI / 'unit-body-movement-evidence-v2.tar.gz'
MANIFEST = UI / 'unit-body-movement-evidence-v2.manifest.json'


def altered_archive(folder, edit):
    """Keep hash/size fields coherent so unsafe tar headers reach validation."""
    manifest = json.loads(MANIFEST.read_text())
    with tarfile.open(fileobj=io.BytesIO(gzip.decompress(BUNDLE.read_bytes())), mode='r:') as source:
        members = [(copy.copy(member), source.extractfile(member).read()) for member in source]
    edit(members)
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w', format=tarfile.USTAR_FORMAT) as target:
        for member, data in members:
            target.addfile(member, io.BytesIO(data) if member.isfile() else None)
    tar = stream.getvalue(); compressed = gzip.compress(tar, mtime=0)
    manifest.update(archive_sha256=hashlib.sha256(compressed).hexdigest(), compressed_bytes=len(compressed), uncompressed_tar_bytes=len(tar))
    path = folder / 'adversarial.tar.gz'; path.write_bytes(compressed)
    return path, manifest


class RetainedMovementTests(unittest.TestCase):
    def test_actual_capture_replays_from_fresh_evidence_directory_without_historical_access(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory); bundle = folder / 'capture.tar.gz'; manifest = folder / 'capture.json'
            bundle.write_bytes(BUNDLE.read_bytes()); manifest.write_bytes(MANIFEST.read_bytes())
            original = Path.open
            def no_historical(path, *args, **kwargs):
                if str(path).startswith('/tmp/unit-body-movement-browser-v2'):
                    raise AssertionError('Historical absolute path dereference')
                return original(path, *args, **kwargs)
            with patch.object(Path, 'open', no_historical), patch('subprocess.Popen', side_effect=AssertionError('No process launch')), patch.object(os, 'kill', side_effect=AssertionError('No current PID probe')):
                result = retained.replay(bundle, manifest, ROOT)
        self.assertEqual(result['status'], 'offline-audit-complete')
        self.assertFalse(result['candidate_executed']); self.assertFalse(result['current_process_or_host_audit'])
        self.assertEqual(result['recorded_status'], 'incomplete-sampling')
        self.assertEqual((result['recorded_node_exit'], result['recorded_app_exit']), (1, 0))
        self.assertEqual((result['census_reads'], result['census_F32_descriptors_verified'], result['raw_chunks']), (32, 1812, 242))
        self.assertEqual((result['baseline_samples'], result['endpoint_samples'], result['intermediate_samples']), (2, 27, 0))
        self.assertEqual(result['movement_passing_cases'], 0); self.assertEqual(result['full_browser_passing_cases'], 0)
        self.assertFalse(result['all7_effect_guard_accepted'])

    def test_deterministic_archive_contains_exact_regular_utf8_payloads(self):
        manifest = json.loads(MANIFEST.read_text()); loaded = retained.load_bundle(BUNDLE, manifest)
        self.assertEqual(tuple(loaded), retained.ALLOWLIST)
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w', format=tarfile.USTAR_FORMAT) as archive:
            for name, value in loaded.items():
                value.decode('utf-8'); member = tarfile.TarInfo(name)
                member.size = len(value); member.mtime = member.uid = member.gid = 0; member.uname = member.gname = ''; member.mode = 0o444
                archive.addfile(member, io.BytesIO(value))
        self.assertEqual(stream.getvalue(), gzip.decompress(BUNDLE.read_bytes()))
        # Header metadata is deterministic; different zlib versions need not
        # reproduce identical deflate choices for already-pinned exact bytes.
        self.assertEqual(BUNDLE.read_bytes()[:10], bytes([31,139,8,0,0,0,0,0,2,255]))

    def test_corrupt_archive_or_untrusted_manifest_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory); corrupt = folder / 'corrupt.gz'; data = bytearray(BUNDLE.read_bytes()); data[-1] ^= 1; corrupt.write_bytes(data)
            with self.assertRaises(ValueError): retained.load_bundle(corrupt, json.loads(MANIFEST.read_text()))
            changed = folder / 'changed.json'; changed.write_text(MANIFEST.read_text() + ' ')
            with self.assertRaisesRegex(ValueError, 'manifest differs'): retained.replay(BUNDLE, changed, ROOT)

    def test_payload_tamper_fails_even_after_archive_hash_is_updated(self):
        with tempfile.TemporaryDirectory() as directory:
            def edit(members):
                member, data = members[0]; members[0] = (member, data.replace(b'UM_READY', b'UM_BOGUS', 1))
            archive, manifest = altered_archive(Path(directory), edit)
            with self.assertRaisesRegex(ValueError, 'member hash/size'): retained.load_bundle(archive, manifest)

    def test_missing_duplicate_or_extra_member_rejects(self):
        for mode in ('missing', 'duplicate', 'extra'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                def edit(members):
                    if mode == 'missing': members.pop()
                    elif mode == 'duplicate': members[1] = members[0]
                    else: members.append(members[0])
                archive, manifest = altered_archive(Path(directory), edit)
                with self.assertRaises(ValueError): retained.load_bundle(archive, manifest)

    def test_traversal_absolute_symlink_and_directory_never_extract(self):
        for mode in ('traversal', 'absolute', 'symlink', 'directory'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                folder = Path(directory); outside = folder / 'must-not-create'
                def edit(members):
                    member = members[0][0]
                    if mode == 'traversal': member.name = '../must-not-create'
                    elif mode == 'absolute': member.name = str(outside)
                    elif mode == 'symlink': member.type = tarfile.SYMTYPE; member.linkname = str(outside); member.size = 0
                    else: member.type = tarfile.DIRTYPE; member.size = 0
                archive, manifest = altered_archive(folder, edit)
                with self.assertRaises(ValueError): retained.load_bundle(archive, manifest)
                self.assertFalse(outside.exists())

    def test_hidden_bytes_after_tar_end_are_not_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'trailing.gz'; manifest = json.loads(MANIFEST.read_text())
            raw = gzip.decompress(BUNDLE.read_bytes()) + b'UNLISTED'; compressed = gzip.compress(raw, mtime=0); path.write_bytes(compressed)
            manifest.update(archive_sha256=hashlib.sha256(compressed).hexdigest(), compressed_bytes=len(compressed), uncompressed_tar_bytes=len(raw))
            with self.assertRaisesRegex(ValueError, 'noncanonical or unlisted'): retained.load_bundle(path, manifest)

    def test_decompression_and_member_limits_are_executable(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory); path = folder / 'large.gz'; manifest = json.loads(MANIFEST.read_text())
            path.write_bytes(b'x' * (retained.MAX_COMPRESSED + 1))
            with self.assertRaises(ValueError): retained.load_bundle(path, manifest)
            decompressed = b'\0' * (retained.MAX_TAR + 1); compressed = gzip.compress(decompressed, mtime=0); path.write_bytes(compressed)
            manifest.update(archive_sha256=hashlib.sha256(compressed).hexdigest(), compressed_bytes=len(compressed), uncompressed_tar_bytes=retained.MAX_TAR)
            with self.assertRaisesRegex(ValueError, 'decompressed size'): retained.load_bundle(path, manifest)
            manifest = json.loads(MANIFEST.read_text()); manifest['members'][0]['bytes'] = retained.MAX_MEMBER + 1
            with self.assertRaises(ValueError): retained.load_bundle(BUNDLE, manifest)

    def test_normal_and_optimized_cli_are_offline_only_and_corruption_still_rejects(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory); bundle = folder / 'capture.gz'; manifest = folder / 'capture.json'
            bundle.write_bytes(BUNDLE.read_bytes()); manifest.write_bytes(MANIFEST.read_bytes())
            env = dict(os.environ); env.pop('PYTHONOPTIMIZE', None); env['PYTHONPATH'] = str(ROOT / 'tools/behavior-tests')
            args = ['-m', 'state_trace.unit_body_movement_retained', '--bundle', str(bundle), '--manifest', str(manifest), '--source-root', str(ROOT)]
            for flags in ([], ['-O'], ['-OO']):
                child = subprocess.run([sys.executable, *flags, *args], cwd=folder, env=env, capture_output=True, text=True, timeout=10)
                self.assertEqual(child.returncode, 0, child.stderr); result = json.loads(child.stdout)
                self.assertFalse(result['candidate_executed']); self.assertEqual(result['recorded_status'], 'incomplete-sampling'); self.assertEqual(result['movement_passing_cases'], 0)
            bundle.write_bytes(b'corrupt')
            child = subprocess.run([sys.executable, '-O', *args], cwd=folder, env=env, capture_output=True, text=True, timeout=10)
            self.assertNotEqual(child.returncode, 0); self.assertNotIn('offline-audit-complete', child.stdout)


if __name__ == '__main__':
    unittest.main()
