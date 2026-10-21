"""Synthetic installed Rename inputs, never original output expectations."""
from protocol import ProtocolError
from ui.base_rename_contract import PROFILES, SOURCE_TEXT

LABEL_COUNT = 1131
DEFAULT_LABELS = {101: 'OK', 102: 'Cancel'}


def declarations(profile):
    if profile not in PROFILES: raise ProtocolError('Unknown Rename source profile')
    result = {}
    for name, kind in [('script.txt', 'common'), ('xscript.txt', 'expansion')]:
        data = SOURCE_TEXT[kind] if profile in (kind, 'both') else SOURCE_TEXT['default']
        result[name] = '#RENAME\n#xs 440\n#caption ' + data['caption'] + '\n' + data['prompt'] + '\n\n' + data['label'] + '\n\n'
    rows = ['Fixture label ' + str(i) for i in range(LABEL_COUNT)]
    for index, value in DEFAULT_LABELS.items(): rows[index] = value
    result['labels.txt'] = '#LABELS\n' + str(LABEL_COUNT) + '\n' + '\n'.join(rows) + '\n'
    return result
