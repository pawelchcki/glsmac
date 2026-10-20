"""Synthetic original map and controlled work-rate inputs, without answers."""
import hashlib
import struct
from protocol import ProtocolError
from ui.former_work_contract import RATE_PROFILES, RATE_ROWS


def arid_map():
    width, height = 40, 80
    count = width * height // 2
    aw, ah = (width + 4) // 5, (height + 4) // 5
    ac = ((aw + 1) // 2) * ah
    offset = 15 + 0xaa4
    data = bytearray(offset + count * 44 + ac)
    data[:11] = b'TERRANMAP\0\x1a'
    struct.pack_into('<I', data, 11, 5)
    for position, value in ((0, width), (4, height), (20, count), (0xa24, aw), (0xa28, ah), (0xa2c, ac)):
        struct.pack_into('<I', data, 15 + position, value)
    for index in range(count):
        at = offset + index * 44
        data[at] = 3 * 32  # land, arid, no elevation or rockiness variation
        data[at + 1] = 64
        data[at + 4] = 255
    return bytes(data)


def block_rows(raw, block):
    lines = raw.decode('latin1').splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.strip() == '#' + block]
    if len(starts) != 1:
        raise ProtocolError('missing or ambiguous original input block: ' + block)
    rows = []
    for index in range(starts[0] + 1, len(lines)):
        body = lines[index].split(';', 1)[0].strip()
        if body.startswith('#'):
            break
        if body:
            rows.append(index)
    return lines, rows


def free_former(raw):
    lines, rows = block_rows(raw, 'GAIANS')
    if len(rows) < 2:
        raise ProtocolError('missing Gaian bonus record')
    index = rows[1]
    body, separator, comment = lines[index].partition(';')
    fields = [field.strip() for field in body.strip().strip(',').split(',')]
    if len(fields) % 2 or 'UNIT' in fields[::2]:
        raise ProtocolError('unsupported existing Gaian starting-unit bonus')
    ending = '\r\n' if lines[index].endswith('\r\n') else '\n'
    lines[index] = body.rstrip('\r\n').rstrip().rstrip(',') + ', UNIT, 1' + (' ;' + comment if separator else ending)
    return ''.join(lines).encode('latin1')


def work_rates(raw, profile):
    lines, rows = block_rows(raw, 'TERRAIN')
    for action, rate in RATE_PROFILES[profile].items():
        if len(rows) <= RATE_ROWS[action]:
            raise ProtocolError('missing original work-rate row')
        index = rows[RATE_ROWS[action]]
        body, separator, comment = lines[index].partition(';')
        fields = body.rstrip('\r\n').split(',')
        if len(fields) < 8:
            raise ProtocolError('incomplete original work-rate declaration')
        fields[4] = ' ' + str(rate)
        ending = '\r\n' if lines[index].endswith('\r\n') else '\n'
        lines[index] = ','.join(fields) + (separator + comment if separator else ending)
    return ''.join(lines).encode('latin1')


def profiles(assets):
    originals = {}
    for wanted in ('alphax.txt', 'gaians.txt'):
        matches = [path for path in assets.iterdir() if path.is_file() and path.name.lower() == wanted]
        if len(matches) != 1:
            raise ProtocolError('missing or ambiguous original Former input: ' + wanted)
        originals[wanted] = (matches[0].name, matches[0].read_bytes())
    result = {}
    for profile in RATE_PROFILES:
        rules_name, rules = originals['alphax.txt']; faction_name, faction = originals['gaians.txt']
        result[profile] = {rules_name: work_rates(rules, profile), faction_name: free_former(faction)}
    return result


def fingerprint_profiles(data):
    digest = hashlib.sha256(arid_map())
    for profile, bundle in sorted(data.items()):
        digest.update(profile.encode() + b'\0')
        for filename, raw in sorted(bundle.items()):
            digest.update(filename.encode() + b'\0' + hashlib.sha256(raw).digest())
    return digest.hexdigest()
