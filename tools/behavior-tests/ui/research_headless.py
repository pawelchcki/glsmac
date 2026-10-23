#!/usr/bin/env python3
"""Optional installed-source replay of initial directed and blind research."""
import argparse
import hashlib
from pathlib import Path
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fast import create_snapshot
from protocol import ProtocolError, canonical, load_request, write_response
from ui import research_choice_contract as directed
from ui import research_priorities_contract as priorities
from ui.headless import gse_literal

DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parents[2]
CONTRACTS = {module.ALGORITHM: module for module in (directed, priorities)}
SOURCE_NAMES = ('alphax', 'script', 'labels', 'menu', 'gaians', 'hive', 'univ', 'morgan',
                'spartans', 'believe', 'peace', 'cyborg', 'pirates', 'drone', 'angels',
                'fungboy', 'caretake', 'usurper')


def installed_sources(directory):
    files = {}
    for path in directory.iterdir():
        key = path.name.lower()
        if key in files:
            raise ProtocolError('Ambiguous installed source filename: ' + key)
        files[key] = path
    sources = []
    for name in SOURCE_NAMES:
        key = name + '.txt'
        if key not in files:
            raise ProtocolError('Missing installed research source: ' + key)
        # Text mode normalizes CRLF before embedding a GSE string. Its parser
        # supports LF escapes; passing a literal '\\r' changes source tokens.
        sources.append(dict(filename=key, contents=files[key].read_text(encoding='cp1252')))
    return sources


def parse_candidate(output, cases):
    if not re.search(r'^All tests passed\.$', output, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', output):
        raise ProtocolError('Research execution failed: ' + output[-3000:])
    results, current, page = [], None, None
    for line in output.splitlines():
        found = re.search(r'(?:^|\] )(RESEARCH_.*)$', line)
        if not found:
            continue
        parts = found[1].split('|'); marker = parts[0]
        if marker == 'RESEARCH_CASE':
            if current is not None or page is not None or len(parts) != 2 or len(results) >= len(cases) or parts[1] != cases[len(results)]['id']:
                raise ProtocolError('Duplicate or reordered research case')
            current = dict(id=parts[1], status='ok', output=dict(trace=[]))
        elif current is None:
            raise ProtocolError('Orphan research observation')
        elif marker == 'RESEARCH_OPEN':
            if page is not None or len(parts) != 4 or parts[1] not in ('research', 'priorities'):
                raise ProtocolError('Malformed research page')
            page = dict(screen=parts[1], caption=parts[3])
            if parts[1] == 'research':
                page.update(goal_id=int(parts[2]), choices=[])
            else:
                page.update(rows=[], buttons=[])
        elif marker == 'RESEARCH_MAP':
            if page is not None or len(parts) != 2:
                raise ProtocolError('Malformed map observation')
            state = dict(screen='map')
            if cases[len(results)]['algorithm'] == directed.ALGORITHM:
                state['goal_id'] = int(parts[1])
            current['output']['trace'].append(state)
        elif marker == 'RESEARCH_CARD':
            if page is None or page['screen'] != 'research' or len(parts) != 3:
                raise ProtocolError('Orphan research card')
            page['choices'].append(dict(name=parts[1], category=parts[2]))
        elif marker == 'RESEARCH_ROW':
            if page is None or page['screen'] != 'priorities' or len(parts) != 3 or parts[2] not in ('true', 'false'):
                raise ProtocolError('Malformed priority row')
            page['rows'].append(dict(label=parts[1], checked=parts[2] == 'true'))
        elif marker == 'RESEARCH_OK':
            if page is None or page['screen'] != 'priorities' or len(parts) != 2:
                raise ProtocolError('Orphan research button')
            page['buttons'].append(parts[1])
        elif marker == 'RESEARCH_END':
            if page is None or len(parts) != 1:
                raise ProtocolError('Incomplete research page')
            current['output']['trace'].append(page); page = None
        elif marker == 'RESEARCH_DONE':
            case = cases[len(results)]
            if page is not None or len(parts) != 1 or len(current['output']['trace']) != len(case['input']['actions']) + 1:
                raise ProtocolError('Incomplete research trace')
            CONTRACTS[case['algorithm']].validate_output(current['output'])
            results.append(current); current = None
        else:
            raise ProtocolError('Unknown research marker')
    if current is not None or page is not None or len(results) != len(cases):
        raise ProtocolError('Missing research results')
    return results


def replay(cases, runtime, sources, log):
    hashes = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (runtime, runtime.with_suffix('.wasm'))}
    scripts = create_snapshot(ROOT)
    template = (DIRECTORY / '_research_headless.gls.js').read_text()
    digest = hashlib.sha256((canonical(scripts) + template).encode()).hexdigest()
    rows, logs = [], []
    for offset in range(0, len(cases), 2):
        chunk = cases[offset:offset + 2]
        snapshot = dict(scripts)
        script = 'GLSMAC_data/tests/installed_research_probe.gls.js'
        inputs = [dict(case['input'], id=case['id'], algorithm=case['algorithm']) for case in chunk]
        snapshot[script] = ('const research_sources = ' + gse_literal(sources) + ';\nconst research_inputs = '
                            + gse_literal(inputs) + ';\n' + template)
        with tempfile.TemporaryDirectory(prefix='glsmac-installed-research-') as temporary:
            path = Path(temporary) / 'scripts.json'; path.write_text(canonical(snapshot))
            process = subprocess.run(['node', str(DIRECTORY.parent / 'gse-worker.cjs')],
                                     input=canonical(dict(runtime=str(runtime), snapshot=str(path), script=script, prefix=temporary)),
                                     text=True, capture_output=True, timeout=180, cwd=ROOT)
        logs.append(process.stdout + process.stderr); log.parent.mkdir(parents=True, exist_ok=True); log.write_text('\n'.join(logs))
        if process.returncode or any(hashlib.sha256(path.read_bytes()).hexdigest() != value for path, value in hashes.items()):
            raise ProtocolError('Research worker failed or runtime changed; see ' + str(log))
        rows.extend(parse_candidate(process.stdout, chunk))
    return dict(name='glsmac-installed-research', kind='candidate', target='wasm-gse', rendering=False,
                assets_required=True, source_sha256=hashlib.sha256(canonical(sources).encode()).hexdigest(),
                scripts_sha256=digest, runtime_sha256=hashes[runtime.with_suffix('.wasm')],
                executed=['installed faction and technology parsing', 'native single-player startup and ownership',
                          'production Shift+R, popup controls and backend event receipts', 'native research state'],
                mocked=['display nodes and audio', 'declared flat terrain', 'art definitions and base-name artwork inputs'],
                excluded=['setup navigation', 'rendering fidelity', 'costs, research progress and acquisition']), rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--runtime', type=Path, default=ROOT / 'build/wasm/bin/GLSMAC.js')
    parser.add_argument('--log', type=Path, default=DIRECTORY.parent / '.build/ui/research-headless.log')
    args = parser.parse_args(); cases = load_request()['cases']
    supported = [case for case in cases if case['algorithm'] in CONTRACTS]
    if len(supported) > 8:
        raise ProtocolError('Research replay accepts eight cases per request')
    for case in supported:
        CONTRACTS[case['algorithm']].validate_input(case['input'])
    metadata, rows = replay(supported, args.runtime.resolve(), installed_sources(args.assets.resolve()), args.log)
    iterator = iter(rows)
    write_response(metadata, [next(iterator) if case['algorithm'] in CONTRACTS else
                             dict(id=case['id'], status='unsupported', reason='Unknown initial research contract') for case in cases])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, IndexError, TypeError, ProtocolError, subprocess.SubprocessError) as error:
        print('Research replay failed:', error, file=sys.stderr); sys.exit(1)
