"""Public synthetic installed-data declarations for candidate source loading.

These are inputs, not notification/selection/citizen answers. The original
adapter independently reads fingerprinted installed files and edits its private
copies. Expansion and common declarations are deliberately separate inputs.
"""
import hashlib
from pathlib import Path
import re

from protocol import ProtocolError
from ui.dimension_dialog_contract import SOURCE_HASHES
from ui.starvation_dialog_contract import EDITED_LABELS, SOURCE_TEXT

LABEL_COUNT = 1131
DEFAULT_NOTICE = {
    'caption': 'Psych Chaplain',
    'lines': ['Our citizens are starving at $BASENAME0!', 'Factories abandoned by hungry workers.'],
}
DEFAULT_LABELS = {44: 'Zoom to Base Control', 45: 'Proceed', 443: "Don't Show As Popup"}


def declarations(profile):
    if profile not in ('default', 'common', 'expansion', 'both'):
        raise ValueError('Unknown starvation source input profile')
    result = {}
    for name, kind in [('script.txt', 'common'), ('xscript.txt', 'expansion')]:
        definition = SOURCE_TEXT[kind] if profile in (kind, 'both') else DEFAULT_NOTICE
        result[name] = '#STARVE\n#xs 320\n#wave 24\n#caption ' + definition['caption'] + '\n' + '\n'.join(definition['lines']) + '\n'
    labels = ['Fixture label ' + str(i) for i in range(LABEL_COUNT)]
    for index, text in DEFAULT_LABELS.items(): labels[index] = text
    if profile in ('expansion', 'both'):
        for index, text in EDITED_LABELS.items(): labels[index] = text
    result['labels.txt'] = '#LABELS\n' + str(LABEL_COUNT) + '\n' + '\n'.join(labels) + '\n'
    return result


def patch_browser_documents(originals, profile):
    """Preserve opaque unrelated startup records in full browser input files."""
    if set(originals) != {'script.txt', 'xscript.txt', 'labels.txt'}:
        raise ProtocolError('Incomplete browser source documents')
    synthetic = declarations(profile)
    result = dict(originals)
    for name, kind in [('script.txt', 'common'), ('xscript.txt', 'expansion')]:
        if profile not in (kind, 'both'): continue
        lines = originals[name].splitlines(keepends=True)
        starts = [index for index, line in enumerate(lines) if line.strip() == '#STARVE']
        if len(starts) != 1: raise ProtocolError('Ambiguous browser STARVE source')
        start = starts[0]
        end = next((index for index in range(start + 1, len(lines)) if re.fullmatch(r'#[A-Z][A-Z0-9_]*', lines[index].strip())), len(lines))
        result[name] = ''.join(lines[:start]) + synthetic[name] + '\n' + ''.join(lines[end:])
    if profile in ('expansion', 'both'):
        lines = originals['labels.txt'].splitlines(keepends=True)
        starts = [index for index, line in enumerate(lines) if line.strip() == '#LABELS']
        if len(starts) != 1 or len(lines) < starts[0] + 2 or lines[starts[0] + 1].strip() != str(LABEL_COUNT):
            raise ProtocolError('Unsupported browser label table')
        if len(lines) < starts[0] + 2 + LABEL_COUNT: raise ProtocolError('Truncated browser label table')
        for ordinal, text in EDITED_LABELS.items(): lines[starts[0] + 2 + ordinal] = text + '\r\n'
        result['labels.txt'] = ''.join(lines)
    return result


def browser_declarations(assets, profile):
    """Read validated runtime inputs; callers need not inspect their contents.

    Returned strings represent Latin-1 bytes. Browser Buffer.from must specify
    'latin1'. Only the declared records change; startup keeps its full menus.
    """
    assets = Path(assets)
    originals = {}
    for name in ('script.txt', 'xscript.txt', 'labels.txt'):
        matches = [path for path in assets.iterdir() if path.is_file() and path.name.lower() == name]
        if len(matches) != 1: raise ProtocolError('Missing or ambiguous browser source input: ' + name)
        raw = matches[0].read_bytes()
        if hashlib.sha256(raw).hexdigest() != SOURCE_HASHES[name]:
            raise ProtocolError('Unsupported installed browser source profile: ' + name)
        originals[name] = raw.decode('latin1')
    return patch_browser_documents(originals, profile)
