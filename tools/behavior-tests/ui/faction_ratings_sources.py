"""Controlled input-only source edits; no observed ratings or costs live here."""
import re
from protocol import ProtocolError

OVERRIDES = {
    'growth-positive': {'growth': 2, 'industry': -3, 'nutrient': 10, 'mineral': 10},
    'industry-positive': {'growth': -3, 'industry': 4, 'nutrient': 10, 'mineral': 10},
    'rules-a': {'growth': 0, 'industry': 0, 'nutrient': 17, 'mineral': 23},
    'rules-b': {'growth': 0, 'industry': 0, 'nutrient': 23, 'mineral': 17},
}


def rules_override(raw, nutrient, mineral):
    lines = raw.decode('latin1').splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.strip() == '#RULES']
    if len(starts) != 1:
        raise ProtocolError('ambiguous original rule source')
    rows = []
    for i in range(starts[0] + 1, len(lines)):
        if re.match(r'#[A-Z]', lines[i]):
            break
        if lines[i].split(';', 1)[0].strip():
            rows.append(i)
    if len(rows) < 7:
        raise ProtocolError('missing original scalar rule rows')
    for ordinal, value in ((5, nutrient), (6, mineral)):
        index = rows[ordinal]
        suffix = ';' + lines[index].split(';', 1)[1].rstrip('\r\n') if ';' in lines[index] else ''
        lines[index] = str(value) + ', ' + suffix + '\r\n'
    return ''.join(lines).encode('latin1')


def social_override(raw, growth, industry):
    lines = raw.decode('latin1').splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.strip() == '#CYBORG']
    if len(starts) != 1:
        raise ProtocolError('ambiguous original social source')
    index = starts[0] + 2
    fields = [value.strip() for value in lines[index].split(';', 1)[0].strip().rstrip(',').split(',')]
    if len(fields) % 2:
        raise ProtocolError('unsupported original bonus pair record')
    retained = []
    for key, value in zip(fields[::2], fields[1::2]):
        if key.upper() != 'SOCIAL' or value.lstrip('+-').upper() not in ('GROWTH', 'INDUSTRY'):
            retained.extend((key, value))
    for name, value in (('GROWTH', growth), ('INDUSTRY', industry)):
        if value:
            retained.extend(('SOCIAL', ('+' if value > 0 else '-') * abs(value) + name))
    lines[index] = '  ' + ', '.join(retained) + '\r\n'
    return ''.join(lines).encode('latin1')
