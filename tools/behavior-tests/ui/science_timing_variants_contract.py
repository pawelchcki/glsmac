"""Stock faction/difficulty variants of the initial real Laboratories trace."""
from protocol import ProtocolError
ALGORITHM='game.early_science_variants.v1'
PROFILES={'hive-citizen':dict(slot=1,difficulty='CITIZEN'),'gaians-talent':dict(slot=0,difficulty='TALENT')}
def validate_input(d):
    if not isinstance(d,dict) or set(d)!={'profile','target_id','advances','contact_policy'} or d['profile'] not in PROFILES or type(d['target_id']) is not int or d['target_id']!=5 or type(d['advances']) is not int or d['advances']!=5 or d['contact_policy']!='decline-channel':raise ProtocolError('unsupported stock science timing variant')
def validate_output(d):
    if not isinstance(d,dict) or set(d)!={'initial_allocation','initial_labs_income','trace'} or len(d['trace'])!=6:raise ProtocolError('incomplete timing variant trace')
    if type(d['initial_labs_income']) is not int:raise ProtocolError('missing actual base labs income')
    for s in d['trace']:
        if set(s)!={'turn','faction_id','goal_id','accumulated','owned_ids','city','units','report'}:raise ProtocolError('invalid timing variant checkpoint')
        if any(type(s[k]) is not int for k in ('turn','faction_id','goal_id','accumulated')):raise ProtocolError('invalid actual timing counter')
        if set(s['report'])!={'cost','accumulated','per_turn'} or any(type(v) is not int for v in s['report'].values()):raise ProtocolError('invalid actual Laboratories values')
        if not isinstance(s['owned_ids'],list) or not isinstance(s['units'],list) or not s['units']:raise ProtocolError('missing actual ownership/roster')
