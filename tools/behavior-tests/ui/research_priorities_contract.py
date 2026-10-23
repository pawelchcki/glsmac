"""Bounded initial Standard Rules Gaian priority-dialog inputs and outputs."""
from protocol import ProtocolError
ALGORITHM='ui.initial_blind_priorities.v1'
def validate_input(data):
    if not isinstance(data,dict) or set(data)!={'actions'} or not isinstance(data['actions'],list) or not 1<=len(data['actions'])<=10:raise ProtocolError('bounded priority actions required')
    for a in data['actions']:
        if a in ('open','OK','Enter','Escape'):continue
        if isinstance(a,dict) and set(a)=={'toggle'} and type(a['toggle']) is int and 0<=a['toggle']<4:continue
        raise ProtocolError('unknown priority action')
def validate_output(data):
    if not isinstance(data,dict) or set(data)!={'trace'} or not isinstance(data['trace'],list) or not data['trace']:raise ProtocolError('missing priority trace')
    for s in data['trace']:
        if s=={'screen':'map'}:continue
        if set(s)!={'screen','caption','rows','buttons'} or s['screen']!='priorities' or len(s['rows'])!=4 or not isinstance(s['caption'],str) or not s['caption']:raise ProtocolError('invalid priority page')
        if len(s['buttons'])!=1 or not all(isinstance(x,str) and x for x in s['buttons']):raise ProtocolError('invalid priority buttons')
        for r in s['rows']:
            if set(r)!={'label','checked'} or not isinstance(r['label'],str) or not r['label'] or type(r['checked']) is not bool:raise ProtocolError('invalid priority checkbox')
