"""Synthetic disband source declarations and actions, never expected outcomes."""
from copy import deepcopy
import json
from protocol import ProtocolError
from ui import terraform_menu_inputs as previous
from ui.unit_disband_contract import ALGORITHM, INITIAL, PROFILES, SEQUENCES, validate_input
SOURCE_TEXT = {
 'disband-name':dict(row='Dismiss Selected Unit',caption='Unit name decision',body='Retire $UNITTYPE0?',choices=['Keep working.','Retire unit.','Overload equipment.']),
 'synthetic':dict(row='Dismiss Worker',caption='Worker decision',body='Retire this worker?',choices=['Keep working.','Retire unit.','Overload equipment.']),
 'disband-edited':dict(row='Retire Selected Unit',caption='Field unit decision',body='Release this field crew?',choices=['Stay on duty.','Release unit.','Overload field kit.']),
}
EXPANSION = dict(caption='Expansion decoy',body='Discard this decoy?',choices=['Keep decoy.','Discard decoy.','Overload decoy.'])


def fragment(data):
    return '#DISBAND2\n#xs 320\n#caption '+data['caption']+'\n'+data['body']+'\n\n'+'\n'.join(data['choices'])+'\n\n#END\n'


def declarations(profile):
    if profile not in PROFILES:raise ProtocolError('Unknown disband source profile')
    sources=previous.declarations('synthetic');data=SOURCE_TEXT[profile]
    lines=sources['menu.txt'].splitlines();index=lines.index('#ACTION')+2+9
    lines[index]=data['row']+'|'+lines[index].split('|',1)[1]
    sources['menu.txt']='\n'.join(lines)+'\n';sources['script.txt']=fragment(data);sources['xscript.txt']=fragment(EXPANSION)
    return sources


def source_label(profile):return SOURCE_TEXT[profile]['row']


def suite():
    cases=[]
    for profile in PROFILES[:2]:
        data=dict(profile='spread',initial_base=deepcopy(INITIAL),text_profile=profile,actions=deepcopy(SEQUENCES[profile]))
        validate_input(data);cases.append(dict(id='unit-disband-'+profile,algorithm=ALGORITHM,input=data))
    return dict(version=1,name='Ready Former Action disband controls',description='Actual menu source9, cancellation/default confirmation, draft navigation and final ordinary disband; self-destruct effects excluded.',cases=cases)


def name_suite():
    profile='disband-name'
    data=dict(profile='spread',initial_base=deepcopy(INITIAL),text_profile=profile,actions=deepcopy(SEQUENCES[profile]))
    validate_input(data)
    return dict(version=1,name='Disband selected unit name source',description='Actual common DISBAND2 unit-name token, real selected Former and cancellation.',cases=[dict(id='unit-disband-name',algorithm=ALGORITHM,input=data)])


if __name__=='__main__':print(json.dumps(suite(),indent=2))
