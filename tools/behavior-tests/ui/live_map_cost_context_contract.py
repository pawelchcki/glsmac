"""Bounded actual setup-preset/map-dimension/live-cost context, without conversion."""
from protocol import ProtocolError
ALGORITHM='game.live_map_cost_context.v1'
MAPS={(40,80),(68,34),(80,160),(42,81)}
def validate_input(d):
    if not isinstance(d,dict) or set(d)!={'map_width','map_height','setup_preset','target_id'} or any(type(d[k]) is not int for k in ('map_width','map_height','target_id')):raise ProtocolError('complete live map context required')
    if (d['map_width'],d['map_height']) not in MAPS or d['target_id']!=5 or d['setup_preset'] not in ('load-default','tiny','standard') or (d['setup_preset']!='load-default' and (d['map_width'],d['map_height'])!=(40,80)):raise ProtocolError('unsupported live map context')
def validate_output(d):
    if not isinstance(d,dict) or set(d)!={'setup_preset_trace','initial_allocation','initial_labs_income','native','report','cost_context','entry'}:raise ProtocolError('incomplete live map observation')
    if set(d['report'])!={'cost','accumulated','per_turn'} or any(type(v) is not int for v in d['report'].values()):raise ProtocolError('invalid actual Labs report')
    if d['entry']!={'key':'F2','transport':'windows-sendinput'}:raise ProtocolError('missing actual shortcut input')
    c=d['cost_context']
    if len(c.get('faction_counters',[]))!=7 or any(type(c.get(k)) is not int for k in ('turn','map_area_sqrt','saved_earned_techs','research_ranking','research_rating','cached_cost')):raise ProtocolError('missing direct live context')
