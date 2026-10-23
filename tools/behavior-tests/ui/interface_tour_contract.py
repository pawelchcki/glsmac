"""Mandatory interface-tour controls, independently of generated terrain pages."""
from protocol import ProtocolError

ALGORITHM = 'ui.interface_tour_controls.v1'
TOPICS = {
    'TOUR1': 'unit-status', 'TOUR1A': 'unit-status', 'TOUR2': 'movement',
    'TOURMENU': 'menu', 'TOURCOMMLINK': 'commlink',
    'TOURUNITSINFO': 'unit-window', 'TOURTERRAININFO': 'terrain-window',
    'TOURSTACKINFO': 'stack-window', 'TOURMESSAGEINFO': 'message-window',
    'TOURBUTTONMESSAGE': 'message-button', 'TOURBUTTONINFO': 'info-button',
    'TOURWORLDINFO': 'world-window', 'TOURDATEINFO': 'date-energy',
    'TOUROVER': 'finished',
}


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'finish'} or data['finish'] not in ('early', 'full'):
        raise ProtocolError('Interface tour requires early or full finish')


def validate_output(output, case):
    validate_input(case['input'])
    if not isinstance(output, dict) or set(output) != {'frames', 'completed', 'failure', 'units_unchanged'}:
        raise ProtocolError('Interface tour requires actual frames, completion, failure and unit preservation')
    if type(output['completed']) is not bool or not isinstance(output['frames'], list):
        raise ProtocolError('Invalid interface tour completion')
    limit = 3 if case['input']['finish'] == 'early' else 15
    if len(output['frames']) > limit or (output['completed'] and len(output['frames']) != limit):
        raise ProtocolError('Interface tour needs every declared mandatory checkpoint')
    if output['completed']:
        if output['failure'] is not None or type(output['units_unchanged']) is not bool:
            raise ProtocolError('Completed tour needs an actual unit preservation result and no failure')
    else:
        failure = output['failure']
        if (not isinstance(failure, dict) or set(failure) != {'step', 'reason'}
                or type(failure['step']) is not int or not 0 <= failure['step'] < limit
                or not isinstance(failure['reason'], str) or not failure['reason']):
            raise ProtocolError('Missing tour controls need an explicit observed failure')
        if output['units_unchanged'] is not None and type(output['units_unchanged']) is not bool:
            raise ProtocolError('Invalid partial tour preservation result')
    for frame in output['frames']:
        if not isinstance(frame, dict) or set(frame) != {'topic', 'buttons', 'menu_open', 'commlink_open', 'native_turn'}:
            raise ProtocolError('Tour checkpoint requires actual topic, controls, panels and native turn')
        if not isinstance(frame['topic'], str) or not 1 <= len(frame['topic']) <= 80:
            raise ProtocolError('Invalid actual tour topic')
        if (not isinstance(frame['buttons'], list) or len(frame['buttons']) > 3
                or any(not isinstance(label, str) or not label for label in frame['buttons'])):
            raise ProtocolError('Tour buttons must be an ordered actual label list')
        if any(type(frame[key]) is not bool for key in ('menu_open', 'commlink_open')):
            raise ProtocolError('Tour panel visibility must be actual booleans')
        if type(frame['native_turn']) is not int or not 0 <= frame['native_turn'] <= 10000:
            raise ProtocolError('Tour native turn must be a bounded actual counter')
