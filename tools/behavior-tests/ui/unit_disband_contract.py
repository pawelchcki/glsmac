"""Public ready-Former disband controls on one flat arid free tile."""
from protocol import ProtocolError
from ui.ingame_menu_contract import INITIAL, text
ALGORITHM = 'ui.unit_disband.v1'
PROFILES = ('synthetic', 'disband-edited')
SEQUENCES = {
 'synthetic': ['tab','menu',{'header':4},{'row_source':9},'cancel',{'header':4},{'row_source':9},'down','confirm'],
 'disband-edited': ['tab','menu',{'header':4},{'row_source':9},'confirm',{'header':4},{'row_source':9},'up','down','down','up','button-ok'],
}
ROLES = ('scout','former','colony')


def validate_input(data):
    if (not isinstance(data,dict) or set(data)!={'profile','initial_base','text_profile','actions'}
            or data['profile']!='spread' or data['initial_base']!=INITIAL
            or not isinstance(data['initial_base'],dict)
            or any(type(data['initial_base'][key]) is not int for key in INITIAL if key!='name')
            or data['text_profile'] not in PROFILES
            or data['actions']!=SEQUENCES[data['text_profile']]
            or any(isinstance(action,dict) and any(type(value) is not int for value in action.values()) for action in data['actions'])):
        raise ProtocolError('Unsupported ready Former disband input')


def validate_output(output,actions):
    if (not isinstance(output,dict) or set(output)!={'trace'} or not isinstance(output['trace'],list)
            or len(output['trace'])!=len(actions)+1):
        raise ProtocolError('Incomplete disband trace')
    for state in output['trace']:
        if (not isinstance(state,dict) or set(state)!={'year_delta','selected','owned_count','units','root_open','child_header','dialog'}
                or type(state['year_delta']) is not int or state['year_delta']!=0
                or state['selected'] not in (None,*ROLES)
                or type(state['owned_count']) is not int or state['owned_count']!=1
                or type(state['root_open']) is not bool
                or state['child_header'] is not None and (type(state['child_header']) is not int or state['child_header']!=4)):
            raise ProtocolError('Invalid disband native/menu context')
        units=state['units'];seen=[]
        if not isinstance(units,list) or not 2<=len(units)<=3:raise ProtocolError('Invalid surviving disband unit membership')
        for unit in units:
            if (not isinstance(unit,dict) or set(unit)!={'role','order_code','movement_spent'} or unit['role'] not in ROLES
                    or type(unit['order_code']) is not int or not 0<=unit['order_code']<=2
                    or type(unit['movement_spent']) is not int or not 0<=unit['movement_spent']<=3):
                raise ProtocolError('Invalid surviving disband unit')
            seen.append(unit['role'])
        if seen not in [list(ROLES),['scout','colony']]:raise ProtocolError('Wrong disband survivor order/membership')
        dialog=state['dialog']
        if dialog is not None and (not isinstance(dialog,dict) or set(dialog)!={'caption','body','choices','selected','buttons'}
                or not text(dialog['caption']) or not text(dialog['body'])
                or not isinstance(dialog['choices'],list) or len(dialog['choices'])!=3 or not all(text(value) for value in dialog['choices'])
                or type(dialog['selected']) is not int or not 0<=dialog['selected']<=2
                or not isinstance(dialog['buttons'],list) or len(dialog['buttons'])!=1 or not all(text(value) for value in dialog['buttons'])):
            raise ProtocolError('Incomplete actual disband dialog')
