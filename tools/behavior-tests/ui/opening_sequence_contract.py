"""Opening dialog/turn phases for the declared explicit-faction new-game path."""
from protocol import ProtocolError

ALGORITHM = 'ui.opening_sequence.v1'
PHASES = {'planetfall', 'first-base-name', 'tour', 'map'}


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'confirmation'} or data['confirmation'] not in ('keyboard', 'pointer'):
        raise ProtocolError('Opening sequence requires keyboard or pointer confirmation')


def validate_output(output, case):
    validate_input(case['input'])
    if not isinstance(output, dict) or set(output) != {'frames', 'completed', 'failure'}:
        raise ProtocolError('Opening sequence output requires frames, completed and failure')
    if type(output['completed']) is not bool or not isinstance(output['frames'], list):
        raise ProtocolError('Invalid opening sequence completion state')
    frames = output['frames']
    if len(frames) > 5 or (output['completed'] and len(frames) != 5):
        raise ProtocolError('Opening sequence requires every declared phase')
    if output['completed']:
        if output['failure'] is not None: raise ProtocolError('Completed opening sequence cannot contain a failure')
    elif (not isinstance(output['failure'], dict) or set(output['failure']) != {'step', 'reason'}
          or type(output['failure']['step']) is not int or not 0 <= output['failure']['step'] < 5
          or not isinstance(output['failure']['reason'], str) or not output['failure']['reason']):
        raise ProtocolError('Incomplete opening sequence needs an actual missing-control diagnosis')
    for frame in frames:
        if not isinstance(frame, dict) or set(frame) != {'phase', 'caption', 'value', 'native_turn'}:
            raise ProtocolError('Opening sequence frame requires actual phase, caption, value and native turn')
        if frame['phase'] not in PHASES:
            raise ProtocolError('Unknown observed opening phase')
        if any(value is not None and not isinstance(value, str) for value in [frame['caption'], frame['value']]):
            raise ProtocolError('Opening caption/editor must be text or absent')
        if type(frame['native_turn']) is not int or not 0 <= frame['native_turn'] <= 10000:
            raise ProtocolError('Opening native turn must be a bounded actual counter')
