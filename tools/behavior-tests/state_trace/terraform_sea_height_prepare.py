"""Prepare NEW Sea capture inputs; never starts WASM, browser, server or test."""
if not __debug__:
    raise RuntimeError('Sea preflight refuses optimized Python: assertion checking is required')

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import shutil

FILES = ('tools/wasm-tests/terraform-sea-height-browser.test.mjs',
 'tools/wasm-tests/terraform-sea-height-observation.mjs', 'tools/wasm-tests/terraform-sea-height-inputs.mjs',
 'tools/wasm-tests/terraform-height-observation.mjs', 'tools/wasm-tests/terraform-browser-inputs.mjs',
 'tools/wasm-tests/fixtures/terraform-sea-height-main.gls.js', 'tools/wasm-tests/fixtures/terraform-sea-height-world.gls.js',
 'tools/wasm-tests/browser-log-cursor.mjs', 'tools/wasm-tests/browser-native-log-hook.mjs',
 'tools/wasm-tests/runtime-fetch-barrier.mjs', 'tools/wasm-tests/terraform-browser-geometry.mjs',
 'tools/wasm-tests/terraform-browser-pointer.mjs', 'GLSMAC_data/tests/_state_trace_observer.gls.js',
 'GLSMAC_data/tests/_terrain_trace_observer.gls.js', 'GLSMAC_data/tests/_terraform_cooperation_observer.gls.js',
 'tools/serve-wasm.py', 'tools/wasm_assets.py', 'tools/wasm-tests/terraform-sea-height-observation.test.mjs',
 'tools/wasm-tests/terraform-height-observation.test.mjs')
DRIVER = FILES[0]
SEED = '1651011033:1377505029:3019448108:3247278135'
KIND = 'terraform-sea-portable-preflight.v1'
LOADER_POLICY = {'removed_exact': ['NODE_OPTIONS', 'NODE_PATH', 'PYTHONPATH', 'PYTHONHOME', 'GLIBC_TUNABLES'],
                 'removed_prefixes': ['LD_', 'DYLD_']}
# These are candidate /tmp tools used historically, not newly executed evidence.
HISTORICAL_TOOLS = {'preflight.py': '9137e1bb050fe2c174bbbee89fd8f4a6c407043106be9727874c61f2f404d187',
                   'run-once.py': '7ee2f069f429c07aa7ec48a1eac7d55e81384bb0e5eb65f7480562dd46cc27a9'}


def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def encoded(value): return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode('utf8')
def write_new(path, data):
    with Path(path).open('xb') as stream: stream.write(data)
def git(root, *args): return subprocess.check_output(['git', *args], cwd=root, text=True).strip()


def directory_hashes(root):
    root = Path(root)
    result = {}
    directories = [root]
    while directories:
        # rglob suppresses nested scan errors, allowing a partial input map.
        # Explicit traversal must propagate these errors at every depth.
        for path in sorted(directories.pop().iterdir()):
            assert not path.is_symlink(), 'Symlink input is unsupported: ' + str(path)
            if path.is_file(): result[str(path.relative_to(root))] = sha(path)
            elif path.is_dir(): directories.append(path)
    assert result, 'Empty input directory: ' + str(root)
    return {name: result[name] for name in sorted(result)}


def source_pins(root):
    root = Path(root)
    changes = git(root, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching',
                  '--', 'src', 'GLSMAC_data/default', *FILES)
    assert changes == '', 'Relevant source differs from clean HEAD'
    return {'head': git(root, 'rev-parse', 'HEAD'), 'native_tree': git(root, 'rev-parse', 'HEAD:src'),
            'default_tree': git(root, 'rev-parse', 'HEAD:GLSMAC_data/default'),
            'files': {name: sha(root / name) for name in FILES},
            'default_files': directory_hashes(root / 'GLSMAC_data/default')}


def pins(config):
    result = {'source': source_pins(config['source_root'])}
    for name in ('runtime', 'web', 'assets', 'browsers'): result[name] = directory_hashes(config[name])
    result['tools'] = {name: sha(config[name]) for name in ('node', 'browser_executable', 'font_config', 'server_python')}
    result['node_packages'] = {name: directory_hashes(Path(config['node_modules']) / name) for name in ('playwright', 'playwright-core', 'pngjs')}
    return result


def validate_record(record):
    assert record['kind'] == KIND and type(record['version']) is int and record['version'] == 1
    assert record['candidate_executed'] is False and record['phase'] == 'prepared-without-game-launch'
    assert record['seed_requested'] == SEED and type(record['node_test_budget_ms']) is int and record['node_test_budget_ms'] == 180000
    assert record['native_timeout_override'] is None and type(record['outer_timeout_seconds']) is int and record['outer_timeout_seconds'] == 200
    assert record['argv'] == [record['config']['node'], '--test', '--test-concurrency=1', DRIVER]
    assert record['environment'] == environment(record['config'])
    assert record['loader_environment_policy'] == LOADER_POLICY


def clean_environment():
    env = os.environ.copy()
    for key in list(env):
        if key in LOADER_POLICY['removed_exact'] or key.startswith(tuple(LOADER_POLICY['removed_prefixes'])):
            env.pop(key, None)
    return env


def environment(config):
    return {'FONTCONFIG_FILE': config['font_config'], 'PLAYWRIGHT_BROWSERS_PATH': config['browsers'],
            'WASM_BROWSER_EXECUTABLE': config['browser_executable'], 'SMAC_ASSETS_DIR': config['assets'],
            'WASM_APP_DIR': config['web'], 'WASM_SCRIPTS_ROOT': config['source_root'],
            'TERRAFORM_ROOT_DIAGNOSTIC': '0', 'TERRAFORM_SEA_HEIGHT_ARTIFACTS_DIR': config['output']}


NODE_INPUTS = r"""
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
const [source,assets]=process.argv.slice(1);
const sea=await import(pathToFileURL(join(source,'tools/wasm-tests/terraform-sea-height-inputs.mjs')));
const common=await import(pathToFileURL(join(source,'tools/wasm-tests/terraform-browser-inputs.mjs')));
const original=readFileSync(join(assets,'alphax.txt')),executed=common.rateOneSource(original),map=sea.seaHeightTerrain();
console.log(JSON.stringify({declared:sea.seaHeightInput,map:map.toString('base64'),executed_rules:executed.toString('base64'),
  override_table:sea.seaHeightOverrideManifest(original,executed)}));
"""


def prepare(config, expected):
    import base64
    config = {key: str(Path(value).resolve(strict=True)) for key, value in config.items() if key != 'output'} | {
        'output': str(Path(config['output']).resolve())}
    assert not Path(config['output']).exists(), 'Use a NEW output directory; never replace historical files'
    for name in ('source_root', 'runtime', 'web', 'assets', 'browsers', 'node_modules'): assert Path(config[name]).is_dir()
    for name in ('node', 'browser_executable', 'font_config', 'server_python'): assert Path(config[name]).is_file()
    assert os.access(config['node'], os.X_OK) and os.access(config['browser_executable'], os.X_OK)
    assert (Path(config['source_root']) / 'tools/wasm-tests/node_modules').resolve(strict=True) == Path(config['node_modules']), 'Node dependencies must be those actually resolved by the unchanged driver'
    assert Path(shutil.which('python3', path=str(Path(config['server_python']).parent) + os.pathsep + os.environ.get('PATH', ''))).resolve() == Path(config['server_python']), 'Server python3 resolution differs'
    before = pins(config)
    for key in ('head', 'native_tree', 'default_tree'): assert before['source'][key] == expected[key], key
    for name, key in [('GLSMAC.js', 'js'), ('GLSMAC.wasm', 'wasm')]:
        assert before['runtime'][name] == before['web'][name] == expected[key], name
    assert before['assets']['alphax.txt'] == expected['rules'], 'Different installed rules profile'
    provenance = json.loads((Path(config['runtime']) / 'provenance.json').read_bytes())
    assert provenance['src_tree'] == expected['native_tree']
    assert all(provenance['runtime'][name] == before['runtime'][name] for name in ('GLSMAC.js', 'GLSMAC.wasm'))
    # The driver remains unchanged. Bind its declared seed/budget rather than
    # promising an unsupported arbitrary seed or native timeout CLI flag.
    driver = (Path(config['source_root']) / DRIVER).read_text()
    assert "const seed='" + SEED + "'" in driver and 'timeout:180000' in driver
    inputs = json.loads(subprocess.check_output([config['node'], '--input-type=module', '-e', NODE_INPUTS,
                       config['source_root'], config['assets']], text=True, encoding='utf8', env=clean_environment()))
    map_bytes, rules = base64.b64decode(inputs.pop('map'), validate=True), base64.b64decode(inputs.pop('executed_rules'), validate=True)
    assert map_bytes.startswith(b'TERRANMAP\0\x1a')
    assert hashlib.sha256(rules).hexdigest() == expected['executed_rules']
    rows = inputs['override_table']
    assert len(rows) == 20 and all(type(row['field_index']) is int and row['field_index'] == 4 and
        type(row['new']) is int and row['new'] == 1 and row['applies_to'] == ['land', 'sea'] for row in rows)
    assert pins(config) == before, 'Inputs changed during preparation'
    record = {'kind': KIND, 'version': 1, 'candidate_executed': False, 'phase': 'prepared-without-game-launch',
              'portable_form_game_executed': False, 'historical_candidate_tool_hashes': HISTORICAL_TOOLS,
              'config': config, 'pins': before, 'expected': expected, 'seed_requested': SEED,
              'node_test_budget_ms': 180000, 'native_timeout_override': None, 'outer_timeout_seconds': 200,
              'argv': [config['node'], '--test', '--test-concurrency=1', DRIVER], 'environment': environment(config),
              'loader_environment_policy': LOADER_POLICY,
              'inputs': inputs | {'map_sha256': hashlib.sha256(map_bytes).hexdigest(),
                                  'executed_rules_sha256': hashlib.sha256(rules).hexdigest()},
              'tool_sources': {str(Path(__file__).resolve()): sha(__file__),
                              str(Path(__file__).with_name('terraform_sea_height_run.py').resolve()): sha(Path(__file__).with_name('terraform_sea_height_run.py'))},
              'node_version': subprocess.check_output([config['node'], '--version'], text=True, env=clean_environment()).strip(),
              'unsupported': ['No native setup/quote/fee/state observation before execution',
                              'No generated external tool session/chunk receipt',
                              'Historical offset-only callback identity cannot earn complete-browser credit']}
    validate_record(record)
    out = Path(config['output']); out.mkdir(parents=True, exist_ok=False)
    write_new(out / 'declared-map.MP', map_bytes); write_new(out / 'executed-rules.txt', rules)
    for name in ('main', 'world'):
        write_new(out / ('fixture-' + name + '.gls.js'), (Path(config['source_root']) / ('tools/wasm-tests/fixtures/terraform-sea-height-' + name + '.gls.js')).read_bytes())
    record['prepared_files'] = {name: sha(out / name) for name in ('declared-map.MP', 'executed-rules.txt', 'fixture-main.gls.js', 'fixture-world.gls.js')}
    write_new(out / 'preflight.json', encoded(record))
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('source-root', 'runtime', 'web', 'assets', 'node', 'browsers', 'browser-executable', 'font-config', 'node-modules', 'server-python', 'output'):
        parser.add_argument('--' + name, required=True)
    for name in ('head', 'native-tree', 'default-tree', 'js', 'wasm', 'rules', 'executed-rules'):
        parser.add_argument('--expected-' + name, required=True)
    args = vars(parser.parse_args())
    expected = {key.removeprefix('expected_'): value for key, value in args.items() if key.startswith('expected_')}
    record = prepare({key: value for key, value in args.items() if not key.startswith('expected_')}, expected)
    print(json.dumps({'candidate_executed': False, 'preflight': str(Path(record['config']['output']) / 'preflight.json'),
                      'preflight_sha256': sha(Path(record['config']['output']) / 'preflight.json')}, indent=2))


if __name__ == '__main__': main()
