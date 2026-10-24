"""Timing-only projection; complete variable contexts remain preserved separately."""
from protocol import ProtocolError
from ui.science_difficulty_contract import validate_input
ALGORITHM='game.early_science_difficulty_timing.v2'
def validate_output(d):
    if not isinstance(d,dict) or set(d)!={'initial_allocation','initial_labs_income','trace'} or len(d['trace'])!=6:raise ProtocolError('incomplete timing-only trace')
    for s in d['trace']:
        if set(s)!={'turn','faction_id','goal_id','accumulated','owned_ids','per_turn'} or any(type(s[k]) is not int for k in ('turn','faction_id','goal_id','accumulated','per_turn')):raise ProtocolError('invalid actual timing-only checkpoint')
