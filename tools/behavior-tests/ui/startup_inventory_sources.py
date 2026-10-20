"""Controlled technology input edits, without inventory answers."""
import hashlib
import re
from protocol import ProtocolError


def technology_override(raw, block, previous, replacement):
    lines = raw.decode('latin1').splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.strip() == '#' + block]
    if len(starts) != 1 or starts[0] + 2 >= len(lines):
        raise ProtocolError('ambiguous faction source for technology override')
    index = starts[0] + 2
    body, separator, comment = lines[index].partition(';')
    fields = body.rstrip('\r\n').split(',')
    logical = fields[:-1] if fields[-1].strip() == '' else fields
    if len(logical) % 2:
        raise ProtocolError('unsupported faction technology bonus pairs')
    found = []
    for key in range(0, len(logical), 2):
        if logical[key].strip().upper() == 'TECH' and logical[key + 1].strip() == previous:
            found.append(key + 1)
    if len(found) != 1 or not re.fullmatch(r'[A-Za-z][A-Za-z0-9]*', replacement):
        raise ProtocolError('missing or ambiguous explicit starting technology token')
    field = fields[found[0]]
    fields[found[0]] = field.replace(previous, replacement)
    ending = '\r\n' if lines[index].endswith('\r\n') else '\n'
    lines[index] = ','.join(fields) + (separator + comment if separator else ending)
    return ''.join(lines).encode('latin1')


def profiles(assets):
    originals = {}
    for wanted in ('gaians.txt', 'cyborg.txt'):
        matches = [path for path in assets.iterdir() if path.is_file() and path.name.lower() == wanted]
        if len(matches) != 1:
            raise ProtocolError('missing or ambiguous startup source: ' + wanted)
        originals[wanted] = (matches[0].name, matches[0].read_bytes())
    default = dict(originals.values())
    result = {'default': default}
    for name, filename, block, previous, replacement in (
            ('gaian-physics', 'gaians.txt', 'GAIANS', 'Ecology', 'Physic'),
            ('cyborg-ecology', 'cyborg.txt', 'CYBORG', 'Physic', 'Ecology')):
        bundle = dict(default)
        actual, raw = originals[filename]
        bundle[actual] = technology_override(raw, block, previous, replacement)
        result[name] = bundle
    return result


def fingerprint_profiles(profiles):
    digest = hashlib.sha256()
    for profile, bundle in sorted(profiles.items()):
        digest.update(profile.encode() + b'\0')
        for filename, raw in sorted(bundle.items()):
            digest.update(filename.encode() + b'\0' + hashlib.sha256(raw).digest())
    return digest.hexdigest()
