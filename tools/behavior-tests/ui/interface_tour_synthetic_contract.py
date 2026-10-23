"""Asset-free replay of declared synthetic tutorial inputs and native controls."""
from protocol import ProtocolError
from ui import interface_tour_contract as v1
from ui.interface_tour_inputs import PROFILES, source_sha256

ALGORITHM = 'ui.interface_tour_controls.v2'
TOPICS = dict(v1.TOPICS, LANDFALL='tour-prompt')


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'source_profile', 'source_sha256', 'finish'}:
        raise ProtocolError('Synthetic tour requires declared source profile/hash and finish')
    if data['source_profile'] not in PROFILES or data['source_sha256'] != source_sha256(data['source_profile']):
        raise ProtocolError('Synthetic tutorial input does not match its declared source digest')
    v1.validate_input({'finish':data['finish']})


def validate_output(output, case):
    validate_input(case['input'])
    if not isinstance(output, dict) or not isinstance(output.get('frames'), list):
        raise ProtocolError('Synthetic tour requires actual observed frames')
    projected = []
    for frame in output['frames']:
        if not isinstance(frame, dict) or 'commlink_text' not in frame:
            raise ProtocolError('Synthetic tour requires actual Commlink heading or absence')
        if frame['commlink_text'] is not None and not isinstance(frame['commlink_text'], str):
            raise ProtocolError('Commlink heading must be actual text or absent')
        projected.append({key:value for key,value in frame.items() if key!='commlink_text'})
    v1.validate_output(dict(output, frames=projected),
                       dict(case, input={'finish':case['input']['finish']}))
