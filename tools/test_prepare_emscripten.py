import contextlib
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('prepare_emscripten', Path(__file__).with_name('prepare-emscripten.py'))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class Cache:
    def __init__(self, root, fail=False):
        self.root = root
        self.fail = fail
        self.locked = False
        self.clears = 0

    def ensure_setup(self):
        pass

    @contextlib.contextmanager
    def lock(self, reason):
        self.locked = True
        try:
            yield
        finally:
            self.locked = False

    def erase(self):
        assert self.locked
        if self.fail:
            raise OSError('cache is read-only')
        (self.root / 'cached-library.a').unlink()
        self.clears += 1


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'emscripten-version.txt').write_text('"4.0.22"\n')
        self.source = self.root / 'system/lib/pthread/proxying.c'
        self.source.parent.mkdir(parents=True)
        self.original = prepare.BEFORE + b'\n// second path\n' + prepare.BEFORE
        self.source.write_bytes(self.original)
        (self.root / 'cached-library.a').write_bytes(b'old SDK')
        for name, value in [('ORIGINAL_SHA256', self.original),
                            ('PATCHED_SHA256', self.original.replace(prepare.BEFORE, prepare.AFTER))]:
            replacement = patch.object(prepare, name, hashlib.sha256(value).hexdigest())
            replacement.start()
            self.addCleanup(replacement.stop)

    def test_apply_clears_cached_libraries_and_preserves_source_mode(self):
        self.source.chmod(0o640)
        cache = Cache(self.root)
        self.assertTrue(prepare.apply_backport(self.root, cache))
        self.assertEqual(self.source.read_bytes(), self.original.replace(prepare.BEFORE, prepare.AFTER))
        self.assertEqual(self.source.stat().st_mode & 0o777, 0o640)
        self.assertFalse((self.root / 'cached-library.a').exists())
        self.assertEqual(cache.clears, 1)

    def test_second_run_preserves_rebuilt_cache(self):
        cache = Cache(self.root)
        prepare.apply_backport(self.root, cache)
        (self.root / 'cached-library.a').write_bytes(b'new SDK')
        self.assertFalse(prepare.apply_backport(self.root, cache))
        self.assertEqual((self.root / 'cached-library.a').read_bytes(), b'new SDK')
        self.assertEqual(cache.clears, 1)

    def test_unknown_version_leaves_source_and_cache_untouched(self):
        (self.root / 'emscripten-version.txt').write_text('"5.0.0"')
        with self.assertRaisesRegex(ValueError, 'Expected Emscripten'):
            prepare.apply_backport(self.root, Cache(self.root))
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assertTrue((self.root / 'cached-library.a').exists())

    def test_unknown_source_leaves_cache_untouched(self):
        self.source.write_bytes(b'local SDK changes')
        with self.assertRaisesRegex(ValueError, 'Unrecognized SDK source'):
            prepare.apply_backport(self.root, Cache(self.root))
        self.assertEqual(self.source.read_bytes(), b'local SDK changes')
        self.assertTrue((self.root / 'cached-library.a').exists())

    def test_failed_cache_clear_does_not_publish_source(self):
        with self.assertRaisesRegex(OSError, 'read-only'):
            prepare.apply_backport(self.root, Cache(self.root, fail=True))
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_failed_publish_can_be_retried(self):
        cache = Cache(self.root)
        with patch.object(prepare.os, 'replace', side_effect=OSError('interrupted')):
            with self.assertRaisesRegex(OSError, 'interrupted'):
                prepare.apply_backport(self.root, cache)
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assertFalse(list(self.source.parent.glob('.proxying-*')))
        (self.root / 'cached-library.a').write_bytes(b'rebuilt original')
        self.assertTrue(prepare.apply_backport(self.root, cache))


if __name__ == '__main__':
    unittest.main()
