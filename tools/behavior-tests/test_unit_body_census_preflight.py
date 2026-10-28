"""Temporary package/source fixtures only; no browser, runtime or game."""
from pathlib import Path
import ast
import hashlib
import os
import tempfile
import unittest
from unittest.mock import patch

from state_trace import unit_body_census_preflight as preparation
from state_trace import unit_body_census_runner as executor


def packages(root):
    for name in ('playwright', 'playwright-core'):
        (root / name / 'lib').mkdir(parents=True)
        (root / name / 'package.json').write_text('{"version":"fixture"}')
        (root / name / 'lib/driver.js').write_text('original executable bytes')


class CensusPreparationTests(unittest.TestCase):
    def test_preparation_binds_actual_executable_bytes_not_just_manifests(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); packages(root)
            before = preparation.dependency_binding(root)
            for name in ('playwright', 'playwright-core'):
                files = before['dependency_contents_sha256'][name]
                self.assertEqual(set(files), {'package.json', 'lib/driver.js'})
                self.assertEqual(files['lib/driver.js'], hashlib.sha256(b'original executable bytes').hexdigest())
                self.assertEqual(files['package.json'], before['dependency_package_sha256'][name])
            (root / 'playwright/lib/driver.js').write_text('changed code, same package version')
            after = preparation.dependency_binding(root)
            self.assertEqual(before['dependency_package_sha256'], after['dependency_package_sha256'])
            self.assertNotEqual(before['dependency_contents_sha256'], after['dependency_contents_sha256'])
            self.assertIn('Historical capture pinned only manifests/browser', after['dependency_content_scope'])

    def test_shared_pre_and_post_execution_check_rejects_dirty_library(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory); deps = folder / 'dependencies'; packages(deps)
            source = folder / 'source'; (source / 'tools/wasm-tests').mkdir(parents=True)
            (source / 'tools/wasm-tests/node_modules').symlink_to(deps, target_is_directory=True)
            (source / 'driver.py').write_text('declared source bytes')
            web = folder / 'web'; web.mkdir(); (web / 'bootstrap.js').write_text('declared web bytes')
            for name in ('provenance.json', 'node', 'browser', 'fontconfig'):
                (folder / name).write_text('metadata fixture only')
            sha = preparation.sha
            pre = dict(host=str(source), head='a' * 40, web_shell=str(web),
                       dependency_symlink=str(deps), **preparation.dependency_binding(deps),
                       source_files_sha256={'driver.py': sha(source / 'driver.py')},
                       web_files_sha256={'bootstrap.js': sha(web / 'bootstrap.js')},
                       runtime_provenance=str(folder / 'provenance.json'), runtime_provenance_sha256=sha(folder / 'provenance.json'),
                       driver=str(source / 'driver.py'), driver_sha256=sha(source / 'driver.py'),
                       node=str(folder / 'node'), node_sha256=sha(folder / 'node'),
                       browser=str(folder / 'browser'), browser_sha256=sha(folder / 'browser'),
                       fontconfig=str(folder / 'fontconfig'), fontconfig_sha256=sha(folder / 'fontconfig'))
            def metadata_git(argv, **kwargs):
                self.assertEqual(kwargs['cwd'], source)
                if argv == ['git', 'rev-parse', 'HEAD']: return pre['head'] + '\n'
                if argv == ['git', 'status', '--porcelain', '--untracked-files=no']: return ''
                if argv == ['git', 'ls-files', '--others', '--exclude-standard']: return 'tools/wasm-tests/node_modules\n'
                self.fail('Unexpected process request in metadata fixture')
            with patch.object(executor.subprocess, 'check_output', side_effect=metadata_git):
                executor.unchanged(pre)
                for phase, name in (('pre-execution', 'playwright'), ('post-execution', 'playwright-core')):
                    file = deps / name / 'lib/driver.js'; original = file.read_bytes()
                    file.write_bytes(b'changed executable, unchanged manifest')
                    with self.subTest(phase=phase), self.assertRaisesRegex(AssertionError, 'Executable dependency contents changed'):
                        executor.unchanged(pre)
                    file.write_bytes(original)
                    executor.unchanged(pre)

    def test_added_removed_or_missing_content_binding_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); packages(root)
            pre = dict(dependency_symlink=str(root), **preparation.dependency_binding(root))
            executor.unchanged_dependencies(pre)
            extra = root / 'playwright/lib/added.js'; extra.write_text('new module')
            with self.assertRaisesRegex(AssertionError, 'Executable dependency contents changed'):
                executor.unchanged_dependencies(pre)
            extra.unlink(); (root / 'playwright-core/lib/driver.js').unlink()
            with self.assertRaisesRegex(AssertionError, 'Executable dependency contents changed'):
                executor.unchanged_dependencies(pre)
            with self.assertRaises(KeyError):
                executor.unchanged_dependencies({'dependency_symlink': str(root)})

    def test_package_and_nested_file_or_directory_symlinks_are_rejected(self):
        for kind in ('package', 'file', 'directory'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                root = Path(directory); packages(root)
                outside = root / 'outside'; outside.mkdir(); (outside / 'code.js').write_text('outside package')
                if kind == 'package':
                    package = root / 'playwright'; package.rename(root / 'moved-package')
                    package.symlink_to(root / 'moved-package', target_is_directory=True)
                elif kind == 'file':
                    (root / 'playwright/lib/alias.js').symlink_to(outside / 'code.js')
                else:
                    (root / 'playwright/lib/alias').symlink_to(outside, target_is_directory=True)
                with self.assertRaisesRegex(AssertionError, 'package directory|Symlinked package content'):
                    preparation.dependency_binding(root)

    def test_missing_package_manifest_is_not_a_valid_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); packages(root); (root / 'playwright-core/package.json').unlink()
            with self.assertRaisesRegex(AssertionError, 'Missing package content'):
                preparation.dependency_binding(root)

    def test_nested_scan_errors_reject_preparation_and_execution_bindings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); packages(root)
            pre = dict(dependency_symlink=str(root), **preparation.dependency_binding(root))
            actual_scandir = os.scandir
            for name in ('playwright', 'playwright-core'):
                blocked = root / name / 'lib'
                # Known-path code stays readable even when directory listing
                # fails. Inject the scan error deterministically (also as root).
                self.assertEqual((blocked / 'driver.js').read_bytes(), b'original executable bytes')
                for error in (PermissionError('nested listing denied'), OSError('nested scan failed')):
                    scanned = []
                    def strict_scan(path):
                        scanned.append(Path(path))
                        if Path(path) == blocked: raise error
                        return actual_scandir(path)
                    for check in (lambda: preparation.dependency_binding(root),
                                  lambda: executor.unchanged_dependencies(pre)):
                        with self.subTest(package=name, error=type(error).__name__), \
                                patch.object(os, 'scandir', strict_scan):
                            with self.assertRaises(type(error)) as caught:
                                check()
                            self.assertIs(caught.exception, error)
                            self.assertIn(blocked, scanned)
            executor.unchanged_dependencies(pre)

    def test_declared_executor_count_matches_pinned_module_inventory(self):
        path = Path(__file__).with_name('test_unit_body_census_runner.py')
        tree = ast.parse(path.read_text())
        names = [item.name for cls in tree.body if isinstance(cls, ast.ClassDef)
                 for item in cls.body if isinstance(item, ast.FunctionDef) and item.name.startswith('test_')]
        self.assertEqual(len(names), 7)
        self.assertEqual(preparation.EXECUTOR_PURE_CHECKS, len(names))


if __name__ == '__main__': unittest.main()
