"""Own declared tutorial/label inputs shared by original and asset-free probes.

These documents contain synthetic markers, never text copied from observations.
Only the listed tutorial blocks and label ordinals override installed data in
the original. Unmeasured prelude/world data remains outside this contract.
"""
import hashlib
import json

from protocol import ProtocolError
from ui.interface_tour_contract import TOPICS

PROFILES = ('synthetic-a', 'synthetic-b')


def declarations(profile):
    if profile not in PROFILES:
        raise ProtocolError('Unknown synthetic interface-tour source profile')
    prefix = 'ALPHA' if profile == 'synthetic-a' else 'BETA'
    controls = ({'tour':'TOUR ALPHA', 'close':'CLOSE ALPHA', 'end':'END ALPHA',
                 'next':'NEXT ALPHA', 'no_contacts':'ALPHA NONE'} if profile == 'synthetic-a' else
                {'tour':'BETA TOUR', 'close':'BETA CLOSE', 'end':'BETA STOP',
                 'next':'BETA MORE', 'no_contacts':'BETA EMPTY'})
    dialogs = {'LANDFALL': {'button':controls['tour'],
                            'paragraphs':[prefix+' DECLARED TOUR PROMPT READY.']}}
    for tag, topic in TOPICS.items():
        words = topic.replace('-', ' ').upper()
        unit = ' $UNITNAME0' if topic == 'unit-status' else ''
        dialogs[tag] = {'paragraphs':[prefix+' DECLARED '+words+unit+' READY.']}
    labels = {220:controls['close'], 236:controls['end'],
              237:controls['next'], 629:controls['no_contacts']}
    return {'tutorial_dialogs':dialogs, 'label_overrides':labels, 'controls':controls}


def source_sha256(profile):
    payload = json.dumps(declarations(profile),sort_keys=True,separators=(',',':')).encode()
    return hashlib.sha256(payload).hexdigest()


def tutorial_document(profile):
    result = []
    for tag, entry in declarations(profile)['tutorial_dialogs'].items():
        result.extend(['#'+tag, '#xs 300'])
        if 'button' in entry: result.append('#button '+entry['button'])
        for index, paragraph in enumerate(entry['paragraphs']):
            if index: result.append('^')
            result.append(paragraph)
        result.append('')
    return '\n'.join(result)+'\n'


def label_document(profile):
    overrides = declarations(profile)['label_overrides']
    labels = [overrides.get(index, 'UNMEASURED FIXTURE LABEL '+str(index)) for index in range(630)]
    return '#LABELS\n'+'\n'.join(labels)+'\n'
