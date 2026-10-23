"""Classify mounted text against independent raw source input, never UI page IDs."""
import re


def normalized(text):
    return ' '.join(text.split()).upper()


def raw_bodies(source):
    """Read only named raw tutorial records; do not invoke GLSMAC's parser."""
    blocks = {}
    block = None
    for line in source.splitlines():
        if re.fullmatch(r'#[A-Z][A-Z0-9_]*', line):
            block = line[1:]
            blocks[block] = []
        elif block is not None and line.strip() and not line.lstrip().startswith(('#', ';')):
            blocks[block].append(line)
    return {name: ' '.join(lines) for name, lines in blocks.items()}


def classify_body(body, source, topics, bindings):
    actual = normalized(body)
    if not actual:
        return 'unrecognized-body'
    matches = set()
    for record, declared in raw_bodies(source).items():
        if record != 'LANDFALL' and record not in topics:
            continue
        # This classifier interprets source markup independently, before values
        # are substituted. Literal edited unit/base names remain literal text.
        declared = declared.replace('{', '').replace('}', '').replace('^', ' ')
        declared = re.sub(r'\$BASENAME0|\$UNITNAME[01]',
                          lambda match: bindings.get(match[0], match[0]), declared)
        if normalized(declared) == actual:
            matches.add('tour-prompt' if record == 'LANDFALL' else topics[record])
    return next(iter(matches)) if len(matches) == 1 else 'ambiguous-body' if matches else 'unrecognized-body'


def classify_frames(output, source, topics):
    for frame in output['frames']:
        stage = frame.pop('observed_stage')
        body = frame.pop('mounted_body')
        bindings = frame.pop('native_bindings')
        frame['topic'] = 'map' if stage == 'map' else classify_body(body, source, topics, bindings)
