"""Bounded source-backed initial Gaian science report and counter trace."""
from protocol import ProtocolError
ALGORITHM='game.initial_research_progress.v1'
INPUT=dict(target_id=5,advances=5,map_profile='flat-arid-40x80',allocation='default-50-0-50')
def validate_input(data):
    if data!=INPUT or any(type(data[k]) is not int for k in ('target_id','advances')):raise ProtocolError('unsupported bounded initial research fixture')
def validate_output(data):
    if not isinstance(data,dict) or set(data)!={'trace','initial_allocation'} or len(data['trace'])!=6:raise ProtocolError('incomplete initial research trace')
    if set(data['initial_allocation'])!={'economy','psych','labs'} or any(type(x) is not int or not 0<=x<=100 for x in data['initial_allocation'].values()):raise ProtocolError('invalid observed initial allocation')
    for s in data['trace']:
        if set(s)!={'turn','goal_id','accumulated','owned_ids','report','city'}:raise ProtocolError('invalid research checkpoint')
        if any(type(s[k]) is not int or not 0<=s[k]<=100000 for k in ('turn','goal_id','accumulated')):raise ProtocolError('invalid research counter')
        if not isinstance(s['owned_ids'],list) or any(type(x) is not int or not 0<=x<89 for x in s['owned_ids']):raise ProtocolError('invalid actual ownership')
        if set(s['report'])!={'cost','accumulated','per_turn'} or any(type(x) is not int or not 0<=x<=100000 for x in s['report'].values()):raise ProtocolError('invalid rendered science report')
        if set(s['city'])!={'population','workers','doctors','worked_tiles','nutrients','minerals'} or any(type(x) is not int for x in s['city'].values()):raise ProtocolError('invalid research city context')
