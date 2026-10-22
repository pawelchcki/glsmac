"""Synthetic source and user actions; no warning outcomes."""
from copy import deepcopy
import json
from protocol import ProtocolError
from ui import colony_found_menu_inputs as previous
from ui.colony_near_contract import ALGORITHM, INITIAL, PROFILES, ACTIONS, validate_input
SOURCE_TEXT = {
 'synthetic': dict(body='Choose a site farther from this base.',row='&Found Base'),
 'near-edited': dict(body='Leave more room between towns.',row='&Choose Settlement Site'),
}


def declarations(profile):
    if profile not in PROFILES: raise ProtocolError('Unknown adjacent warning source profile')
    data=SOURCE_TEXT[profile]; files=previous.declarations('synthetic')
    lines=files['menu.txt'].splitlines(); index=lines.index('#ACTION')+2
    lines[index]=data['row']+'|'+lines[index].split('|',1)[1]
    files['menu.txt']='\n'.join(lines)+'\n'
    files['script.txt']=files['script.txt'].split('#END')[0]+'#BASETOONEAR\n#xs 320\n#wave 3\n#caption Site selection\n'+data['body']+'\n\n#END\n'
    return files


def source_label(profile): return SOURCE_TEXT[profile]['row']


def suite():
    cases=[]
    for profile in PROFILES:
        data=dict(profile='spread',initial_base=deepcopy(INITIAL),text_profile=profile,actions=deepcopy(ACTIONS))
        validate_input(data);cases.append(dict(id='colony-adjacent-first-frame-'+profile,algorithm=ALGORITHM,input=data))
    return dict(version=1,name='Colony Action adjacent-city warning',description='Actual Tab/Tab/MENU/Action/source0; existing city, units and paused year guarded.',cases=cases)


if __name__=='__main__':print(json.dumps(suite(),indent=2))
