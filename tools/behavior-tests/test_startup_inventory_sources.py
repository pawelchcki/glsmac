"""Controlled source edits and immutable independent original inventory cases."""
import hashlib
from pathlib import Path
import unittest
import compare
from protocol import ProtocolError
from ui.startup_inventory_sources import technology_override
from ui.startup_inventory_sources_contract import validate_input, validate_output


class StartupInventorySourceTests(unittest.TestCase):
    def test_one_technology_token_changes_and_unrelated_bytes_are_preserved(self):
        source = (b'#GAIANS\r\nHeader Ecology\r\n TECH, Ecology, TECH, Other, SOCIAL, -MORALE, ; Ecology\r\n'
                  b'Untouched Ecology\r\n#END\r\n')
        changed = technology_override(source, 'GAIANS', 'Ecology', 'Physic')
        self.assertEqual(changed, source.replace(b'TECH, Ecology,', b'TECH, Physic,', 1))
        for old, new in (('Absent', 'Physic'), ('Ecology', 'bad token')):
            with self.assertRaises(ProtocolError):
                technology_override(source, 'GAIANS', old, new)
        with self.assertRaises(ProtocolError):
            technology_override(source.replace(b'TECH, Other', b'TECH, Ecology'), 'GAIANS', 'Ecology', 'Physic')

    def test_explicit_profiles_and_immutable_original_inputs_are_bound(self):
        directory = Path(__file__).parent / 'ui'
        suite = compare.read_json(directory / 'cases/startup-inventory-sources.json')
        path = directory / 'observations/smacx-gog-2.0-startup-inventory-sources.json'
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),
                         '898b729d7c8e7bcdae743988cf1c8edf9347c4cd4a2d351b276d9a48d77a6b34')
        evidence = compare.read_json(path); compare.validate_observations(evidence, suite)
        self.assertEqual(evidence['repeat'], 2)
        self.assertEqual(len(evidence['observations']), 4)
        for case, row in zip(suite['cases'], evidence['observations']):
            validate_input(case['input']); validate_output(row['output'])
        for value in ({'preset': 'base', 'slot': 0, 'profile': 'cyborg-ecology'},
                      {'preset': 'expansion', 'slot': 0, 'profile': 'gaian-physics'},
                      {'preset': 'base', 'slot': True, 'profile': 'default'}):
            with self.assertRaises(ProtocolError):
                validate_input(value)


if __name__ == '__main__':
    unittest.main()
