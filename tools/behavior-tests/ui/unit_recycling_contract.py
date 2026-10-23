"""Ready Scout disband controls inside its owned city; original observations only."""
from protocol import ProtocolError
from ui.ingame_menu_contract import INITIAL, text
ALGORITHM='ui.unit_recycling.v1'
PROFILES=('synthetic','recycle-edited')
ROLES=('scout','former','colony')
SEQUENCES={
 'synthetic':['menu',{'header':4},{'row_source':9},'cancel',{'header':4},{'row_source':9},'down','confirm'],
 'recycle-edited':['menu',{'header':4},{'row_source':9},'confirm',{'header':4},{'row_source':9},'up','down','down','button-ok'],
}
def validate_input(data):
 if (not isinstance(data,dict) or set(data)!={'profile','initial_base','text_profile','actions'} or data['profile'] not in ('spread','stacked','scout-free')
  or not isinstance(data['initial_base'],dict) or data['initial_base']!=INITIAL or any(type(data['initial_base'][key]) is not int for key in INITIAL if key!='name')
  or data['text_profile'] not in PROFILES or (data['profile']!='spread' and data['text_profile']!='synthetic') or data['actions']!=((['tab'] if data['profile']=='stacked' else [])+SEQUENCES[data['text_profile']])
  or any(isinstance(action,dict) and any(type(value) is not int for value in action.values()) for action in data['actions'])):raise ProtocolError('Unsupported ready Scout recycling input')
def validate_output(output,actions):
 if not isinstance(output,dict) or set(output)!={'trace'} or not isinstance(output['trace'],list) or len(output['trace'])!=len(actions)+1:raise ProtocolError('Incomplete recycling trace')
 for state in output['trace']:
  if (not isinstance(state,dict) or set(state)!={'year_delta','selected','owned_count','mineral_delta','units','root_open','child_header','dialog'}
   or type(state['year_delta']) is not int or state['year_delta']!=0 or state['selected'] not in (None,*ROLES)
   or type(state['owned_count']) is not int or state['owned_count']!=1 or type(state['mineral_delta']) is not int or not -100000<=state['mineral_delta']<=100000
   or type(state['root_open']) is not bool or state['child_header'] is not None and (type(state['child_header']) is not int or state['child_header']!=4)):raise ProtocolError('Invalid recycling native/menu context')
  units=state['units']
  if not isinstance(units,list) or len(units) not in (2,3):raise ProtocolError('Invalid recycling survivors')
  seen=[]
  for unit in units:
   if (not isinstance(unit,dict) or set(unit)!={'role','order_code','movement_spent'} or unit['role'] not in ROLES or type(unit['order_code']) is not int or not 0<=unit['order_code']<=2
    or type(unit['movement_spent']) is not int or not 0<=unit['movement_spent']<=3):raise ProtocolError('Invalid recycling unit state')
   seen.append(unit['role'])
  if seen not in [list(ROLES),['former','colony'],['scout','colony']]:raise ProtocolError('Wrong recycling survivor membership/order')
  dialog=state['dialog']
  if dialog is not None and (not isinstance(dialog,dict) or set(dialog)!={'caption','body','choices','selected','buttons'} or not text(dialog['caption']) or not text(dialog['body'])
   or not isinstance(dialog['choices'],list) or len(dialog['choices']) not in (2,3) or not all(text(x) for x in dialog['choices'])
   or type(dialog['selected']) is not int or not 0<=dialog['selected']<len(dialog['choices'])
   or not isinstance(dialog['buttons'],list) or len(dialog['buttons'])!=1 or not all(text(x) for x in dialog['buttons'])):raise ProtocolError('Incomplete actual recycling dialog')
