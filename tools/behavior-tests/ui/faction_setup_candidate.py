"""Strict transport for actual candidate controls; no reference answers."""
import re

from protocol import ProtocolError
from ui.faction_setup_contract import validate_output


def parse_candidate(text, cases):
    if not re.search(r'^All tests passed\.$', text, re.MULTILINE) or re.search(r'TEST FAILED|Unhandled exception', text):
        raise ProtocolError('faction worker did not complete: ' + text[-2000:])
    rows, trace = [], []
    current = current_id = None
    complete = False
    for line in text.splitlines():
        match = re.search(r'(?:^|\] )(FSET_[A-Z]+(?:\|.*)?)$', line)
        if not match:
            continue
        tag, separator, body = match[1].partition('|')
        if complete:
            raise ProtocolError('late faction marker')
        if tag == 'FSET_CASE':
            if not separator or current_id is not None or len(rows) >= len(cases) or body != cases[len(rows)]['id']:
                raise ProtocolError('unknown, duplicate or reordered faction case')
            current_id = body
        elif tag == 'FSET_STATE':
            parts = body.split('|')
            if current_id is None or current is not None or len(parts) != 3 or parts[2] not in ('true', 'false'):
                raise ProtocolError('invalid faction checkpoint start')
            try:
                selected = int(parts[1])
            except ValueError as error:
                raise ProtocolError('invalid faction selection') from error
            if str(selected) != parts[1]:
                raise ProtocolError('noncanonical faction selection')
            current = dict(screen=parts[0], selected=selected, random=parts[2] == 'true',
                           items=[], labels=[], values=[], buttons=[])
        elif tag == 'FSET_CAPTION':
            if not separator or current is None or 'caption' in current:
                raise ProtocolError('invalid faction caption marker')
            current['caption'] = body
        elif tag in ('FSET_ITEM', 'FSET_LABEL', 'FSET_VALUE', 'FSET_BUTTON'):
            if not separator or current is None or 'caption' not in current:
                raise ProtocolError('orphan faction control marker')
            key = {'FSET_ITEM': 'items', 'FSET_LABEL': 'labels', 'FSET_VALUE': 'values', 'FSET_BUTTON': 'buttons'}[tag]
            current[key].append(body)
        elif tag == 'FSET_END':
            if separator or current is None or 'caption' not in current:
                raise ProtocolError('incomplete faction checkpoint')
            trace.append(current)
            current = None
        elif tag == 'FSET_DONE':
            if separator or current_id is None or current is not None:
                raise ProtocolError('invalid faction case completion')
            output = {'trace': trace}
            validate_output(output, cases[len(rows)])
            rows.append({'id': current_id, 'status': 'ok', 'output': output})
            current_id, trace = None, []
        elif tag == 'FSET_COMPLETE':
            if body != str(len(cases)) or current is not None or current_id is not None or len(rows) != len(cases):
                raise ProtocolError('invalid faction batch completion')
            complete = True
        else:
            raise ProtocolError('unknown faction marker: ' + tag)
    if not complete:
        raise ProtocolError('missing faction completion marker')
    return rows
