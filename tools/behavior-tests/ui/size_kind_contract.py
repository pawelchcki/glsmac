"""Bounded original custom-size setup-kind and navigation contract."""
import re
from protocol import ProtocolError

ALGORITHM = 'ui.custom_size_kind.v1'
CLOSE_ACTIONS = ('wait', 'Enter', 'OK', 'Escape', 'Cancel')

def validate_input(value):
    if (not isinstance(value, dict) or set(value) != {'route', 'prior_preset', 'close', 'reenter'}
            or value['route'] not in ('random', 'custom')
            or not (value['prior_preset'] is None or type(value['prior_preset']) is int and 0 <= value['prior_preset'] <= 4)
            or value['close'] not in CLOSE_ACTIONS or type(value['reenter']) is not bool
            or value['close'] == 'wait' and value['reenter']):
        raise ProtocolError('custom-size kind needs a route, null/0..4 prior preset, known close action and valid reentry flag')

def validate_output(value):
    if not isinstance(value, dict) or set(value) != {'trace'} or not isinstance(value['trace'], list) or not value['trace']:
        raise ProtocolError('missing custom-size kind trace')
    stages = []
    for item in value['trace']:
        if (not isinstance(item, dict) or set(item) != {'stage', 'size_kind', 'screen'}
                or item['stage'] not in ('open', 'close', 'back', 'reentry')
                or type(item['size_kind']) is not int or item['size_kind'] not in (-1, 0, 1, 2, 3, 4, 99)):
            raise ProtocolError('invalid custom-size kind checkpoint')
        stages.append(item['stage'])
        screen = item['screen']
        if not isinstance(screen, dict):
            raise ProtocolError('missing actual screen')
        if screen.get('kind') == 'dimension-dialog':
            if set(screen) != {'kind', 'caption', 'values'} or not isinstance(screen['caption'], str) or not screen['caption']:
                raise ProtocolError('invalid dimension screen')
            if not isinstance(screen['values'], list) or len(screen['values']) != 2 or any(not isinstance(v, str) or not re.fullmatch('[0-9]+', v) for v in screen['values']):
                raise ProtocolError('invalid actual untouched fields')
        elif screen.get('kind') == 'sliding-menu':
            if (set(screen) != {'kind', 'caption', 'entries', 'selected'}
                    or not (screen['caption'] is None or isinstance(screen['caption'], str))
                    or not isinstance(screen['entries'], list) or not screen['entries']
                    or any(not isinstance(v, str) or not v for v in screen['entries'])
                    or not isinstance(screen['selected'], list) or len(screen['selected']) != 1
                    or screen['selected'][0] not in screen['entries']):
                raise ProtocolError('invalid actual menu')
        else:
            raise ProtocolError('unsupported observed screen')
    if stages[0] != 'open' or len(set(stages)) != len(stages) or stages not in (
            ['open'], ['open', 'close'], ['open', 'close', 'reentry'], ['open', 'close', 'back'], ['open', 'close', 'back', 'reentry']):
        raise ProtocolError('invalid checkpoint sequence')

def parse_candidate(text, cases):
    if 'All tests passed.' not in text or re.search(r'TEST FAILED|Unhandled exception|\bGSE\w*Error\b', text):
        raise ProtocolError('custom-size kind candidate did not complete successfully: ' + text[-2000:])
    rows=[]; trace=[]; current=None; current_id=None; done=False
    for line in text.splitlines():
        match=re.search(r'(?:^|\] )(SIZEKIND_[A-Z]+(?:\|.*)?)$',line)
        if not match:continue
        parts=match[1].split('|');tag=parts[0]
        if done:raise ProtocolError('late custom-size marker')
        if tag=='SIZEKIND_BEGIN':
            if len(parts)!=4 or current is not None or current_id not in (None,parts[1]):raise ProtocolError('invalid checkpoint start')
            if str(int(parts[3]))!=parts[3]:raise ProtocolError('noncanonical size kind')
            current_id=parts[1];current={'stage':parts[2],'size_kind':int(parts[3]),'screen':None}
        elif tag=='SIZEKIND_DIALOG':
            if len(parts)!=4 or current is None or current['screen'] is not None:raise ProtocolError('invalid dimension marker')
            current['screen']={'kind':'dimension-dialog','caption':parts[1],'values':parts[2:]}
        elif tag=='SIZEKIND_MENU':
            if len(parts)!=2 or current is None or current['screen'] is not None:raise ProtocolError('invalid menu marker')
            current['screen']={'kind':'sliding-menu','caption':parts[1] or None,'entries':[],'selected':[]}
        elif tag=='SIZEKIND_ENTRY':
            if len(parts)!=4 or current is None or current['screen'] is None or current['screen']['kind']!='sliding-menu':raise ProtocolError('entry outside menu')
            screen=current['screen']
            if parts[1]!=str(len(screen['entries'])) or parts[2] not in ('true','false'):raise ProtocolError('invalid choice ordinal/highlight')
            screen['entries'].append(parts[3])
            if parts[2]=='true':screen['selected'].append(parts[3])
        elif tag=='SIZEKIND_END':
            if len(parts)!=1 or current is None or current['screen'] is None:raise ProtocolError('incomplete checkpoint')
            trace.append(current);current=None
        elif tag=='SIZEKIND_DONE':
            if len(parts)!=2 or current is not None or parts[1]!=current_id:raise ProtocolError('invalid case completion')
            output={'trace':trace};validate_output(output)
            rows.append({'id':current_id,'status':'ok','output':output});trace=[];current_id=None
        elif tag=='SIZEKIND_COMPLETE':
            if len(parts)!=2 or parts[1]!=str(len(cases)) or current is not None or current_id is not None:raise ProtocolError('invalid batch completion')
            done=True
        else:raise ProtocolError('unknown size-kind marker')
    if not done or [r['id'] for r in rows]!=[case['id'] for case in cases]:
        raise ProtocolError('missing duplicate unknown or reordered custom-size kind cases')
    return rows
