"""Record full actual menu glyphs using the existing guarded input transport."""
import hashlib
from pathlib import Path
import sys
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, write_response
from ui import terraform_menu_original as shared
from ui import terraform_menu_contract as legacy
from ui import terraform_presentation_contract as contract
from ui import terraform_presentation_inputs as inputs

original_capture = shared.capture
original_fingerprint = shared.fingerprint


def capture(driver, observer, vision, menu_vision, case, path):
    # The established recorder executes every original input and checks actual
    # native state/city/companion invariants at every checkpoint. Read its real
    # captured pixels for the complete menu projection, never infer row text,
    # colors or omissions from source fields or selected unit type.
    native = original_capture(driver, observer, vision, menu_vision, case, path)
    trace = []
    for index, state in enumerate(native['trace']):
        if (state['order'] != 'none' or state['movement_spent'] != 0 or state['work_units'] != 0
                or any(state['terrain'].values())):
            raise ProtocolError('Presentation-only input changed native Former work/terrain')
        image = vision.Image.open(path / f'checkpoint-{index}.png').convert('RGB')
        menu = menu_vision.read(image)
        if ((menu is not None) != state['root_open']
                or (menu['child']['header_index'] if menu and menu['child'] else None) != state['child_header']):
            raise ProtocolError('Actual glyph menu projection disagrees with native checkpoint observation')
        trace.append(dict(year_delta=state['year_delta'], selected=state['selected'], menu=menu))
    output = dict(trace=trace)
    contract.validate_output(output, case['input']['actions'])
    return output


def fingerprint():
    digest = hashlib.sha256(original_fingerprint().encode())
    for path in (Path(__file__), Path(legacy.__file__)):
        digest.update(path.read_bytes())
    return digest.hexdigest()


def response(metadata, results):
    write_response(dict(metadata,
        observation='Actual MENU/header5/Escape/Tab inputs and independently read full original menu headers/rows/tones; guarded native selection and unchanged work/terrain/city/companion/year at every checkpoint',
        boundaries='Healthy ready land Former then Colony after real Tab navigation, bare arid tile, three synthetic source profiles including varying declared rates; no work execution, other terrain/status/technology contexts, AI or full Terraform parity'), results)


# Delegate only fixture transport and actual original input execution. The
# shim validates the legacy native guard output before this adapter projects
# independently captured menu pixels. Public inputs/evidence use this new
# algorithm; no game instruction or native state is patched.
shared.contract = SimpleNamespace(__file__=contract.__file__, ALGORITHM=contract.ALGORITHM,
    PROFILES=contract.PROFILES, validate_input=contract.validate_input, validate_output=legacy.validate_output)
shared.inputs = inputs
shared.capture = capture
shared.fingerprint = fingerprint
shared.write_response = response

if __name__ == '__main__':
    shared.main()
