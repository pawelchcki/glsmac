"""Initial unit inventory under controlled installed starting-tech inputs."""
from protocol import ProtocolError
from ui.startup_inventory_contract import validate_input as base_input, validate_output

ALGORITHM = 'game.startup_inventory_sources.v1'


def validate_input(value):
    if not isinstance(value, dict) or set(value) != {'preset', 'slot', 'profile'}:
        raise ProtocolError('startup source inventory requires preset, slot and profile')
    base_input({key: value[key] for key in ('preset', 'slot')})
    allowed = ('default', 'gaian-physics') if value['preset'] == 'base' else ('default', 'cyborg-ecology')
    if value['profile'] not in allowed:
        raise ProtocolError('unsupported starting-technology input profile')
