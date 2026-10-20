"""Synthetic source overrides are inputs; original output is observed separately."""
import re
from protocol import ProtocolError
from ui.dimension_dialog_original import text_files

CYBORG_OVERRIDE = {'name': 'Nova', 'formal': 'Orbit Guild', 'role': 'Orbit Agenda',
                   'noun': 'Orbiters', 'adjective': 'Orbital', 'title': 'Navigator',
                   'description': 'brisk', 'gender': 'M'}


def rewrite_block(raw, identifier, changes):
    lines = raw.decode('latin1').splitlines(keepends=True)
    starts = [n for n, line in enumerate(lines) if line.strip() == '#' + identifier]
    if len(starts) != 1:
        raise ProtocolError('missing or duplicate faction source block: ' + identifier)
    start = starts[0] + 1
    end = next((n for n in range(start, len(lines)) if re.match(r'#[A-Z][A-Z0-9_]*\s*$', lines[n])), len(lines))
    for prefix, text in changes.items():
        hits = [n for n in range(start, end) if lines[n].strip().startswith(prefix)]
        if len(hits) != 1:
            raise ProtocolError('ambiguous faction source record: ' + prefix)
        lines[hits[0]] = (prefix + text if prefix.startswith('#') else text) + '\r\n'
    return ''.join(lines).encode('latin1')


def script_override(raw, prefix):
    for block, label in (('NAME', ' Male:'), ('NAME2', ' Female:'), ('NAME3', ':')):
        changes = {'#caption ': prefix + ' Pilot', 'Name': prefix + label}
        if block != 'NAME3':
            changes['#button '] = prefix + ' Style'
        raw = rewrite_block(raw, block, changes)
    return rewrite_block(raw, 'CUSTOMNAMES', {'#caption ': prefix + ' Crew', '#button ': prefix + ' Reset'})


def cyborg_override(raw):
    lines = raw.decode('latin1').splitlines(keepends=True)
    starts = [n for n, line in enumerate(lines) if line.strip() == '#CYBORG']
    if len(starts) != 1:
        raise ProtocolError('missing or duplicate synthetic faction source target')
    start = starts[0] + 1
    first = [field.strip() for field in lines[start].split(',')]
    if len(first) < 12:
        raise ProtocolError('unexpected original faction header')
    for index, key in ((0, 'formal'), (1, 'role'), (2, 'noun'), (5, 'name'), (6, 'gender')):
        first[index] = CYBORG_OVERRIDE[key]
    lines[start] = ', '.join(first).rstrip() + '\r\n'
    adjective = [field.strip() for field in lines[start + 4].split(',')]
    adjective[0] = CYBORG_OVERRIDE['adjective']
    lines[start + 4] = ', '.join(adjective).rstrip() + '\r\n'
    title = [field.strip() for field in lines[start + 6].split(',')]
    title[0], title[1] = CYBORG_OVERRIDE['title'], CYBORG_OVERRIDE['description']
    lines[start + 6] = ', '.join(title).rstrip() + '\r\n'
    return ''.join(lines).encode('latin1')


def source_profiles(assets):
    baseline = text_files(assets, 'default')
    matches = [path for path in assets.iterdir() if path.is_file() and path.name.lower() == 'cyborg.txt']
    if len(matches) != 1:
        raise ProtocolError('missing or ambiguous original faction data')
    baseline[matches[0].name] = matches[0].read_bytes()
    filenames = {name.lower(): name for name in baseline}
    result = {}
    for profile in ('default', 'common', 'expansion', 'both'):
        bundle = dict(baseline)
        if profile in ('common', 'both'):
            name = filenames['script.txt']; bundle[name] = script_override(bundle[name], 'Core')
        if profile in ('expansion', 'both'):
            name = filenames['xscript.txt']; bundle[name] = script_override(bundle[name], 'Addon')
        if profile == 'both':
            name = filenames['labels.txt']; lines = bundle[name].decode('latin1').splitlines(keepends=True)
            hits = [n for n, line in enumerate(lines) if line.strip() == 'CHOOSE YOUR FACTIONS']
            if len(hits) != 1:
                raise ProtocolError('ambiguous original faction title label')
            lines[hits[0]] = 'CHOOSE ORBIT CREWS\r\n'; bundle[name] = ''.join(lines).encode('latin1')
            name = filenames['cyborg.txt']; bundle[name] = cyborg_override(bundle[name])
        result[profile] = bundle
    return result
