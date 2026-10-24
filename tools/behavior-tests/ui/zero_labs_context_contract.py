"""Actual zero-income timing control with a live original cost-input snapshot."""
from protocol import ProtocolError
ALGORITHM='game.zero_labs_live_context.v1'
INPUT=dict(profile='gaians-citizen',target_id=5,advances=5,labs_percent=0,contact_policy='decline-channel')
def validate_input(d):
    if d!=INPUT or any(type(d[k]) is not int for k in ('target_id','advances','labs_percent')):raise ProtocolError('unsupported zero-Labs context fixture')
def validate_output(d):
    if not isinstance(d,dict) or set(d)!={'initial_allocation','initial_labs_income','trace'} or len(d['trace'])!=6:raise ProtocolError('incomplete zero-Labs trace')
    if type(d['initial_labs_income']) is not int:raise ProtocolError('missing actual zero-Labs income')
    for s in d['trace']:
        if set(s)!={'turn','faction_id','goal_id','accumulated','owned_ids','city','units','report','cost_context'}:raise ProtocolError('invalid zero-Labs context checkpoint')
        if set(s['report'])!={'cost','accumulated','per_turn'} or any(type(v) is not int for v in s['report'].values()):raise ProtocolError('invalid actual report values')
        c=s['cost_context'];keys={'faction_id','human','target_id','difficulty','turn','map_area_sqrt','saved_earned_techs','research_ranking','research_rating','discovery_rate_percent','faction_cost_percent','stagnation','cached_cost','auxiliary_adjustment','global_difficulty','faction_counters'}
        if set(c)!=keys or type(c['human']) is not bool or type(c['stagnation']) is not bool or len(c['faction_counters'])!=7:raise ProtocolError('invalid live cost context')
