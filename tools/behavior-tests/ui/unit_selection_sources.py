"""Synthetic three-unit input bundle, without selection effects or answers."""
from protocol import ProtocolError
from ui.former_work_sources import arid_map, block_rows, free_former


def three_units(raw):
    lines, rows = block_rows(free_former(raw), 'GAIANS')
    body, separator, comment = lines[rows[1]].partition(';')
    fields = [field.strip() for field in body.strip().strip(',').split(',')]
    if len(fields) % 2 or len(fields) // 2 >= 8:
        raise ProtocolError('Three-unit fixture exceeds the original faction bonus limit')
    ending = '\r\n' if lines[rows[1]].endswith('\r\n') else '\n'
    lines[rows[1]] = body.rstrip('\r\n').rstrip().rstrip(',') + ', UNIT, 0' + (' ;' + comment if separator else ending)
    return ''.join(lines).encode('latin1')


def bundle(assets):
    matches = [path for path in assets.iterdir() if path.is_file() and path.name.lower() == 'gaians.txt']
    if len(matches) != 1: raise ProtocolError('Missing or ambiguous Gaian three-unit input')
    return {matches[0].name: three_units(matches[0].read_bytes())}
