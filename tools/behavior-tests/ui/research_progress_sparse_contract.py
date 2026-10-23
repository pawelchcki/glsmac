"""Control fixture with only initial/final Laboratories report openings."""
from protocol import ProtocolError
from ui.research_progress_contract import INPUT as ORIGINAL_INPUT
ALGORITHM='game.initial_research_progress_sparse.v1'
INPUT=dict(ORIGINAL_INPUT,report_openings=[0,5])
def validate_input(data):
    if data!=INPUT or any(type(data[k]) is not int for k in ('target_id','advances')) or any(type(x) is not int for x in data['report_openings']):raise ProtocolError('unsupported sparse report fixture')
def validate_output(data):
    if not isinstance(data,dict) or set(data)!={'initial_allocation','trace'} or len(data['trace'])!=2:raise ProtocolError('incomplete sparse report trace')
    if set(data['initial_allocation'])!={'economy','psych','labs'} or any(type(x) is not int or not 0<=x<=100 for x in data['initial_allocation'].values()):raise ProtocolError('invalid initial allocation')
    for s in data['trace']:
        if set(s)!={'turn','goal_id','accumulated','owned_ids','report','city'}:raise ProtocolError('invalid sparse research checkpoint')
        if any(type(s[k]) is not int or not 0<=s[k]<=100000 for k in ('turn','goal_id','accumulated')):raise ProtocolError('invalid sparse research counter')
        if not isinstance(s['owned_ids'],list) or any(type(x) is not int or not 0<=x<89 for x in s['owned_ids']):raise ProtocolError('invalid ownership')
        if set(s['report'])!={'cost','accumulated','per_turn'} or any(type(x) is not int or not 0<=x<=100000 for x in s['report'].values()):raise ProtocolError('invalid science report')
        if set(s['city'])!={'population','workers','doctors','worked_tiles','nutrients','minerals'} or any(type(x) is not int for x in s['city'].values()):raise ProtocolError('invalid city context')
