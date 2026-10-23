"""Synthetic dialog declarations and ready-city Scout controls, without expected outcomes."""
from copy import deepcopy
import json
from protocol import ProtocolError
from ui import unit_disband_inputs as previous
from ui.unit_recycling_contract import ALGORITHM, INITIAL, PROFILES, SEQUENCES, validate_input
# Read-only original preparation audit establishes these initial pricing inputs.
# They are supplied before any command and contain no refund/selection answers.
PRICING_CONTEXT=dict(map_size_kind=0,mineral_rule_factor=10,industry=0)
SOURCE_TEXT={
 'synthetic':dict(row='Recycle Scout',caption='Service decision',body='Retire $UNITTYPE0?',choices=['Keep serving.','Retire unit.']),
 'recycle-edited':dict(row='Release City Patrol',caption='City patrol decision',body='Release $UNITTYPE0?',choices=['Stay on patrol.','Release patrol.']),
}
def fragment(marker,data):return '#'+marker+'\n#xs 320\n#caption '+data['caption']+'\n'+data['body']+'\n\n'+'\n'.join(data['choices'])+'\n\n#END\n'
def declarations(profile):
 if profile not in PROFILES:raise ProtocolError('Unknown recycling profile')
 files=previous.declarations('synthetic');data=SOURCE_TEXT[profile]
 lines=files['menu.txt'].splitlines();i=lines.index('#ACTION')+2+9;lines[i]=data['row']+'|'+lines[i].split('|',1)[1];files['menu.txt']='\n'.join(lines)+'\n'
 files['script.txt']=fragment('DISBAND',data)+files['script.txt']
 decoy=dict(caption='Expansion service decoy',body='Ignore this decoy?',choices=['Keep decoy.','Retire decoy.'])
 files['xscript.txt']=fragment('DISBAND',decoy)+files['xscript.txt'];return files
def source_label(profile):return SOURCE_TEXT[profile]['row']
def suite():
 cases=[]
 for profile in PROFILES:
  data=dict(profile='spread',initial_base=deepcopy(INITIAL),text_profile=profile,actions=deepcopy(SEQUENCES[profile]));validate_input(data)
  cases.append(dict(id='unit-recycling-'+profile,algorithm=ALGORITHM,input=data))
 return dict(version=1,name='Ready city Scout disband and recycling',description='Actual Action9, two-choice source declarations, cancellation/default and ordinary confirmation; native city mineral delta measured from prepared baseline.',cases=cases)
def former_city_suite():
 data=dict(profile='stacked',initial_base=deepcopy(INITIAL),text_profile='synthetic',actions=['tab']+deepcopy(SEQUENCES['synthetic']));validate_input(data)
 return dict(version=1,name='Ready Former city disband context',description='Actual Former inside own city, same synthetic source declarations and cancel/reopen/confirm; native mineral delta measured from prepared baseline.',cases=[dict(id='unit-recycling-former-city',algorithm=ALGORITHM,input=data)])
def scout_free_suite():
 data=dict(profile='scout-free',initial_base=deepcopy(INITIAL),text_profile='synthetic',actions=deepcopy(SEQUENCES['synthetic']));validate_input(data)
 return dict(version=1,name='Ready Scout free-tile disband context',description='Ready Scout shares the free southeast tile with Former after actual preparation movement and another turn; same source declarations and cancel/reopen/ordinary confirm.',cases=[dict(id='unit-recycling-scout-free',algorithm=ALGORITHM,input=data)])
if __name__=='__main__':print(json.dumps(suite(),indent=2))
