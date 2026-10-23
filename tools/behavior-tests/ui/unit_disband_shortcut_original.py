"""Replay actual original Shift+D input using the existing guarded free-Former observer."""
import hashlib
from pathlib import Path
import sys
from types import FunctionType
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import write_response
from ui import unit_disband_original as previous
from ui import unit_disband_shortcut_contract as contract
from ui import unit_disband_shortcut_inputs as inputs


def fingerprint():
    digest = hashlib.sha256(previous.fingerprint().encode())
    for module in (contract, inputs):
        digest.update(Path(module.__file__).read_bytes())
    digest.update(Path(__file__).read_bytes())
    return digest.hexdigest()


def shortcut_response(implementation, rows):
    implementation = dict(implementation,
        observation='Actual ready-Former Tab/Shift+D with no MENU/Action click; independently segmented common dialog text/choices/highlight/button and native selected-unit/city/survivor guards',
        boundaries='One healthy ready Former on the declared free southeast tile; two installed source profiles; cancellation/reopening/navigation and ordinary confirmation only; no overload, city, alternate modifiers or general shortcut/AI parity')
    write_response(implementation, rows)


scope = dict(previous.__dict__, contract=contract, inputs=inputs, fingerprint=fingerprint,
             write_response=shortcut_response)
scope['profiles'] = FunctionType(previous.profiles.__code__, scope)
scope['capture'] = FunctionType(previous.capture.__code__, scope)
main = FunctionType(previous.main.__code__, scope)


if __name__ == '__main__':
    main()
