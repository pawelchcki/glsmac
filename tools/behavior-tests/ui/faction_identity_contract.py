"""Selected leader's six textual identity fields at Planetfall, excluding AI."""
from protocol import ProtocolError
from ui.faction_setup_contract import validate_input as validate_setup

ALGORITHM = 'game.faction_identity.v1'
FIELDS = ('leader_name', 'formal_name', 'noun', 'adjective', 'leader_title', 'leader_description')


def validate_input(value):
    validate_setup(value)
    if any('mode' in action or 'roster' in action for action in value['actions']):
        raise ProtocolError('identity handoff requires an explicit preset and selected faction')


def validate_output(value):
    if not isinstance(value, dict) or set(value) != {'identity'}:
        raise ProtocolError('identity handoff requires actual native identity fields')
    fields = value['identity']
    if not isinstance(fields, list) or len(fields) != len(FIELDS):
        raise ProtocolError('missing native faction identity field')
    for index, text in enumerate(fields):
        if not isinstance(text, str) or len(text) > (39 if index == 1 else 23) or any(ord(c) < 32 or ord(c) == 127 or c == '|' for c in text):
            raise ProtocolError('invalid native faction identity text')
