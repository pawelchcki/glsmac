"""Inputs to bounded original uncached human research-cost observations."""
from protocol import ProtocolError
ALGORITHM='technology.human_research_cost.v1'
BASE=dict(faction_id=1,target_id=5,difficulty=0,turn=1,map_area_sqrt=40,
          saved_earned_techs=0,research_ranking=0,research_rating=0,
          discovery_rate_percent=100,faction_cost_percent=100,stagnation=False)

def validate_input(d):
    if not isinstance(d,dict) or set(d)!=set(BASE):raise ProtocolError('complete research cost fixture required')
    ranges={'faction_id':(1,7),'target_id':(0,88),'difficulty':(0,5),'turn':(0,100),
            'map_area_sqrt':(10,100),'saved_earned_techs':(0,8),'research_ranking':(0,16),
            'research_rating':(-3,3),'discovery_rate_percent':(0,200),'faction_cost_percent':(50,150)}
    for key,(lo,hi) in ranges.items():
        if type(d[key]) is not int or not lo<=d[key]<=hi:raise ProtocolError('invalid research cost input: '+key)
    if type(d['stagnation']) is not bool:raise ProtocolError('stagnation must be boolean')

def validate_output(d):
    if not isinstance(d,dict) or set(d)!={'science_required'} or type(d['science_required']) is not int or not 1<=d['science_required']<=999999999:raise ProtocolError('invalid original science cost result')
