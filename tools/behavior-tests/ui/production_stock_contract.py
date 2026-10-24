"""Independent visible production stock and neutral raw-field observations."""
from protocol import ProtocolError
from ui.research_progress_contract import INPUT as SCIENCE_INPUT
ALGORITHM='ui.initial_production_stock.v1'
INPUT=dict(SCIENCE_INPUT,panels=['base-operations','base-panel'],contact_policy='decline-channel')
def validate_input(d):
    if d!=INPUT or any(type(d[k]) is not int for k in ('target_id','advances')):raise ProtocolError('unsupported production stock fixture')
def validate_output(d):
    if not isinstance(d,dict) or set(d)!={'initial_allocation','trace'} or len(d['trace'])!=2:raise ProtocolError('incomplete production stock trace')
    for s in d['trace']:
        if set(s)!={'before','operations','panel','after'}:raise ProtocolError('invalid production stock checkpoint')
        for name in ('before','after'):
            n=s[name]
            if set(n)!={'turn','raw_mineral_field','current_project_id','queue_size','city','units'} or any(type(n[k]) is not int for k in ('turn','raw_mineral_field','current_project_id','queue_size')):raise ProtocolError('invalid native stock context')
            if not isinstance(n['units'],list) or not n['units']:raise ProtocolError('missing actual unit roster')
        r=s['operations']
        if set(r)!={'project','pair','turns'} or not isinstance(r['project'],str) or not r['project'] or len(r['pair'])!=2 or any(type(x) is not int for x in r['pair']) or type(r['turns']) is not int:raise ProtocolError('invalid observed production report')
        p=s['panel']
        if set(p)!={'project','turns','mineral_intake','mineral_consumption','mineral_surplus','bright_grid_samples','dim_grid_samples'} or not isinstance(p['project'],str) or not p['project'] or any(type(p[k]) is not int for k in p if k!='project'):raise ProtocolError('invalid actual base panel')
