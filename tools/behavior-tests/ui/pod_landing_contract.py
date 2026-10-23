"""Rendered pod frames and landing/name sequencing for one declared new-game path."""
from protocol import ProtocolError
ALGORITHM = 'ui.pod_landing.v1'
FRAME_SAMPLES = (1, 7, 15, 21, 27)
def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'confirmation','motion_projection'} or data['confirmation'] not in ('keyboard','pointer') or data['motion_projection'] != 'horizontal-direction-from-first-sample':
        raise ProtocolError('Pod landing requires keyboard or pointer Planetfall confirmation')
def validate_output(output, case):
    validate_input(case['input'])
    if not isinstance(output,dict) or set(output) != {'phases','frames','name_after_animation','completed','failure'}:
        raise ProtocolError('Pod landing requires actual phases, rendered frames, ordering and completion')
    if type(output['completed']) is not bool or type(output['name_after_animation']) is not bool:
        raise ProtocolError('Pod landing completion and ordering must be booleans')
    if not isinstance(output['phases'],list) or len(output['phases'])>3 or not isinstance(output['frames'],list) or len(output['frames'])>5:
        raise ProtocolError('Unbounded pod landing observation')
    for phase in output['phases']:
        if not isinstance(phase,dict) or set(phase)!={'phase','native_turn'} or phase['phase'] not in ('planetfall','landing','first-base-name','map','tour') or type(phase['native_turn']) is not int or not 0<=phase['native_turn']<=10000:
            raise ProtocolError('Pod phase requires actual phase and native turn')
    for frame in output['frames']:
        if not isinstance(frame,dict) or set(frame)!={'index','motion_x'} or any(type(v) is not int for v in frame.values()) or not 0<=frame['index']<=10000 or frame['motion_x'] not in (-1,0,1):
            raise ProtocolError('Pod frame requires rendered asset index and declared horizontal direction')
    if output['completed']:
        if output['failure'] is not None: raise ProtocolError('Completed landing cannot contain failure')
    elif not isinstance(output['failure'],str) or not output['failure']:
        raise ProtocolError('Incomplete landing requires a diagnostic')
