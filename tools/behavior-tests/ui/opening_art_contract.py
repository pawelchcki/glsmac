"""Exact rendered-pixel probes for the opening backdrop at a fixed viewport."""
from protocol import ProtocolError

ALGORITHM = 'ui.opening_art.v1'
VIEWPORT = [1024, 768]


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {'viewport', 'actions', 'probes'}:
        raise ProtocolError('Opening artwork needs viewport, actions and probes')
    if data['viewport'] != VIEWPORT:
        raise ProtocolError('Opening artwork requires the declared 1024x768 viewport')
    if not isinstance(data['actions'], list) or len(data['actions']) > 16:
        raise ProtocolError('Opening artwork actions must be a bounded list')
    for action in data['actions']:
        if not isinstance(action, dict) or set(action) != {'choose'}:
            raise ProtocolError('Opening artwork actions choose an actual visible control')
        if not isinstance(action['choose'], str) or not action['choose'] or len(action['choose']) > 100:
            raise ProtocolError('Invalid opening artwork control label')
    probes = data['probes']
    if not isinstance(probes, list) or not 1 <= len(probes) <= 64:
        raise ProtocolError('Opening artwork requires 1 to 64 pixel probes')
    for point in probes:
        if (not isinstance(point, list) or len(point) != 2
                or any(type(value) is not int for value in point)
                or not 0 <= point[0] < VIEWPORT[0] or not 0 <= point[1] < VIEWPORT[1]):
            raise ProtocolError('Opening artwork probe is outside the viewport')
    if len({tuple(point) for point in probes}) != len(probes):
        raise ProtocolError('Opening artwork probes must be unique')


def validate_output(output, case):
    data = case['input']; validate_input(data)
    if not isinstance(output, dict) or set(output) != {'frames'}:
        raise ProtocolError('Opening artwork output needs frames')
    frames = output['frames']
    if not isinstance(frames, list) or len(frames) != len(data['actions']) + 1:
        raise ProtocolError('Opening artwork must observe every input checkpoint')
    for frame in frames:
        if not isinstance(frame, dict) or set(frame) != {'viewport', 'pixels'} or frame['viewport'] != VIEWPORT:
            raise ProtocolError('Opening artwork frame has an invalid viewport')
        pixels = frame['pixels']
        if not isinstance(pixels, list) or len(pixels) != len(data['probes']):
            raise ProtocolError('Opening artwork frame must observe every pixel probe')
        for pixel in pixels:
            if (not isinstance(pixel, list) or len(pixel) != 3
                    or any(type(channel) is not int or not 0 <= channel <= 255 for channel in pixel)):
                raise ProtocolError('Opening artwork pixels must be RGB bytes')
