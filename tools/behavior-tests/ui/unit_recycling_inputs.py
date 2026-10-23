"""Synthetic dialog declarations and ready-city Scout controls, without expected outcomes."""
from copy import deepcopy
import json
from protocol import ProtocolError
from ui import unit_disband_inputs as previous
from ui.unit_recycling_contract import ALGORITHM, INITIAL, PROFILES, SEQUENCES, validate_input
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
if __name__=='__main__':print(json.dumps(suite(),indent=2))
