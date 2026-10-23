"""Optional bounded real Blind Research setup toggle contract."""
from protocol import ProtocolError
ALGORITHM='ui.blind_research_rule.v1'
def validate_input(data):
    if not isinstance(data,dict) or set(data)!={'actions'} or not isinstance(data['actions'],list) or not 1<=len(data['actions'])<=12:raise ProtocolError('bounded rule actions required')
    for a in data['actions']:
        if a in ('toggle','OK','cancel','Escape','standard-button','play'):continue
        if isinstance(a,dict) and set(a)=={'choose'} and a['choose'] in ('CUSTOMIZE RULES','CITIZEN','PLAY WITH CURRENT RULES','PLAY WITH STANDARD RULES'):continue
        raise ProtocolError('unknown bounded rule action')
def validate_output(data):
    if not isinstance(data,dict) or set(data)!={'trace'} or not isinstance(data['trace'],list) or not data['trace']:raise ProtocolError('missing rule trace')
    for s in data['trace']:
        if not isinstance(s,dict) or not isinstance(s.get('caption'),str) or not s['caption']:raise ProtocolError('missing observed rule caption')
        if s.get('screen')=='custom-rules':
            if set(s)!={'screen','caption','blind','buttons'} or set(s['blind'])!={'label','checked'} or not isinstance(s['blind']['label'],str) or not s['blind']['label'] or type(s['blind']['checked']) is not bool or len(s['buttons'])!=3:raise ProtocolError('invalid Blind Research checkbox')
        elif s.get('screen')=='menu':
            if set(s)!={'screen','caption','entries','selected'} or not s['entries']:raise ProtocolError('invalid observed return menu')
        elif s.get('screen') in ('factions','priorities','directed'):
            if set(s)!={'screen','caption'}:raise ProtocolError('invalid observed handoff screen')
        else:raise ProtocolError('unknown rule trace screen')
