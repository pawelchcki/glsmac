"""Remaining stock Gaian difficulty timing fixtures, without threshold inference."""
from protocol import ProtocolError
ALGORITHM='game.early_science_difficulties.v1'
PROFILES={'specialist':'SPECIALIST','librarian':'LIBRARIAN','thinker':'THINKER','transcend':'TRANSCEND'}
def validate_input(d):
    if not isinstance(d,dict) or set(d)!={'difficulty','target_id','advances','contact_policy'} or d['difficulty'] not in PROFILES or type(d['target_id']) is not int or d['target_id']!=5 or type(d['advances']) is not int or d['advances']!=5 or d['contact_policy']!='decline-channel':raise ProtocolError('unsupported additional difficulty fixture')
def validate_output(d):
    if not isinstance(d,dict) or set(d)!={'initial_allocation','initial_labs_income','trace'} or len(d['trace'])!=6:raise ProtocolError('incomplete additional difficulty trace')
    for s in d['trace']:
        if set(s)!={'turn','faction_id','goal_id','accumulated','owned_ids','city','units','report'} or any(type(s[k]) is not int for k in ('turn','faction_id','goal_id','accumulated')):raise ProtocolError('invalid actual difficulty context')
        if set(s['report'])!={'cost','accumulated','per_turn'} or any(type(v) is not int for v in s['report'].values()):raise ProtocolError('invalid actual difficulty report')
