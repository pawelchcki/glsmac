"""Edited custom-size warning controls, with observed input and setup state."""
import re

from protocol import ProtocolError

ALGORITHM = 'ui.large_map_warning.v1'
PROFILES = ('default', 'common', 'expansion', 'both')
ACTIONS = ('ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape', 'OK', 'ClickFirst', 'ClickSecond')


def validate_input(value):
    if not isinstance(value, dict) or set(value) != {'route', 'horizontal', 'vertical', 'submit', 'actions', 'text_profile'}:
        raise ProtocolError('large-map warning requires exact route, input, submit, action and text-profile fields')
    if value['route'] not in ('random', 'custom') or value['submit'] not in ('Enter', 'OK') or value['text_profile'] not in PROFILES:
        raise ProtocolError('unknown warning route, submit action or source profile')
    for key in ('horizontal', 'vertical'):
        text = value[key]
        if not isinstance(text, str) or not re.fullmatch('[0-9]{1,3}', text) or str(int(text)) != text or not 2 <= int(text) <= 256:
            raise ProtocolError('warning inputs are typed canonical decimal strings from 2 through 256')
    actions = value['actions']
    if not isinstance(actions, list) or len(actions) > 6 or any(action not in ACTIONS for action in actions):
        raise ProtocolError('unknown or excessive warning actions')
    if any(action in ('Enter', 'Escape', 'OK') for action in actions[:-1]):
        raise ProtocolError('confirmation must be the final warning action')


def validate_screen(screen):
    if not isinstance(screen, dict):
        raise ProtocolError('missing actual warning screen')
    kind = screen.get('kind')
    if kind == 'dimension-dialog':
        if set(screen) != {'kind', 'caption', 'values'} or not isinstance(screen['caption'], str) or not screen['caption']:
            raise ProtocolError('invalid edited-dimension screen')
        if not isinstance(screen['values'], list) or len(screen['values']) != 2 or any(not isinstance(v, str) or not re.fullmatch('[0-9]+', v) for v in screen['values']):
            raise ProtocolError('missing actual edited numeric values')
        return
    fields = {'kind', 'caption', 'entries', 'selected'}
    if kind == 'large-map-warning':
        fields.add('buttons')
        if not isinstance(screen.get('buttons'), list) or len(screen['buttons']) != 1 or any(not isinstance(v, str) or not v for v in screen['buttons']):
            raise ProtocolError('warning needs the actual single confirmation button')
    elif kind != 'sliding-menu':
        raise ProtocolError('unsupported actual screen')
    if (set(screen) != fields or not (screen['caption'] is None or isinstance(screen['caption'], str))
            or not isinstance(screen['entries'], list) or not screen['entries']
            or any(not isinstance(v, str) or not v for v in screen['entries'])
            or not isinstance(screen['selected'], list) or len(screen['selected']) != 1
            or screen['selected'][0] not in screen['entries']):
        raise ProtocolError('invalid actual choices or highlight')
    if kind == 'large-map-warning' and (len(screen['entries']) != 2 or not screen['caption']):
        raise ProtocolError('warning needs two actual choices and a caption')


def validate_output(value, case):
    expected_stages = ['edited', 'submit'] + [f'action-{n}' for n in range(len(case['input']['actions']))]
    if not isinstance(value, dict) or set(value) != {'trace'} or not isinstance(value['trace'], list):
        raise ProtocolError('missing warning trace')
    if [row.get('stage') for row in value['trace'] if isinstance(row, dict)] != expected_stages:
        raise ProtocolError('incomplete, duplicate or reordered warning checkpoints')
    for item in value['trace']:
        if (not isinstance(item, dict) or set(item) != {'stage', 'available', 'size_kind', 'screen'}
                or type(item['available']) is not bool or type(item['size_kind']) is not int
                or item['size_kind'] not in (-1, 0, 1, 2, 3, 4, 99)):
            raise ProtocolError('invalid observed warning checkpoint')
        validate_screen(item['screen'])


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('warning candidate did not complete: ' + text[-2000:])
    rows, trace = [], []
    current = current_id = None
    complete = False
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(WARN_[A-Z]+(?:\|.*)?)$', line)
        if not match:
            continue
        if complete:
            raise ProtocolError('late warning marker')
        parts = match[1].split('|')
        tag = parts[0]
        if tag == 'WARN_BEGIN':
            if len(parts) != 5 or current is not None or current_id not in (None, parts[1]) or parts[4] not in ('true', 'false'):
                raise ProtocolError('invalid warning checkpoint start')
            try:
                kind = int(parts[3])
            except ValueError as error:
                raise ProtocolError('invalid native size kind') from error
            if str(kind) != parts[3]:
                raise ProtocolError('noncanonical native size kind')
            current_id = parts[1]
            current = {'stage': parts[2], 'size_kind': kind, 'available': parts[4] == 'true', 'screen': None}
        elif tag in ('WARN_DIMENSION', 'WARN_MENU', 'WARN_WARNING'):
            expected = 4 if tag == 'WARN_DIMENSION' else 2
            if len(parts) != expected or current is None or current['screen'] is not None:
                raise ProtocolError('unexpected warning screen marker')
            if tag == 'WARN_DIMENSION':
                current['screen'] = {'kind': 'dimension-dialog', 'caption': parts[1], 'values': parts[2:]}
            else:
                current['screen'] = {'kind': 'large-map-warning' if tag == 'WARN_WARNING' else 'sliding-menu',
                                     'caption': parts[1] or None, 'entries': [], 'selected': []}
                if tag == 'WARN_WARNING':
                    current['screen']['buttons'] = []
        elif tag == 'WARN_ENTRY':
            screen = current['screen'] if current else None
            if len(parts) != 4 or not screen or 'entries' not in screen or parts[1] != str(len(screen['entries'])) or parts[2] not in ('true', 'false'):
                raise ProtocolError('invalid actual warning entry')
            screen['entries'].append(parts[3])
            if parts[2] == 'true':
                screen['selected'].append(parts[3])
        elif tag == 'WARN_BUTTON':
            screen = current['screen'] if current else None
            if len(parts) != 3 or not screen or 'buttons' not in screen or parts[1] != str(len(screen['buttons'])):
                raise ProtocolError('invalid actual warning button')
            screen['buttons'].append(parts[2])
        elif tag == 'WARN_END':
            if len(parts) != 1 or current is None or current['screen'] is None:
                raise ProtocolError('incomplete warning checkpoint')
            trace.append(current)
            current = None
        elif tag == 'WARN_DONE':
            if len(parts) != 2 or current is not None or parts[1] != current_id or len(rows) >= len(cases):
                raise ProtocolError('invalid warning case completion')
            output = {'trace': trace}
            validate_output(output, cases[len(rows)])
            rows.append({'id': current_id, 'status': 'ok', 'output': output})
            trace, current_id = [], None
        elif tag == 'WARN_COMPLETE':
            if len(parts) != 2 or parts[1] != str(len(cases)) or current is not None or current_id is not None:
                raise ProtocolError('invalid warning batch completion')
            complete = True
        else:
            raise ProtocolError('unknown warning marker')
    if not complete or [row['id'] for row in rows] != [case['id'] for case in cases]:
        raise ProtocolError('missing, unknown or reordered warning cases')
    return rows
