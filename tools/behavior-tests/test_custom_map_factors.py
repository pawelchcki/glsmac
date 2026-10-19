"""Fixed custom-size context validation and synthetic oracle boundary checks."""
import importlib.util
import struct
import unittest
import glsmac
import original
from protocol import ProtocolError
from test_original import synthetic_oracle

class CustomMapFactorsTests(unittest.TestCase):
    def examples(self):
        return [(original.CUSTOM_NUTRIENT_FACTOR,{'faction_id':1,'nutrient_rule_factor':13,'growth':0}),
                (original.CUSTOM_MINERAL_FACTOR,{'faction_id':1,'mineral_rule_factor':13,'industry':0})]

    def test_custom_contract_has_fixed_context_and_rejects_caller_supplied_kind(self):
        for algorithm,values in self.examples():
            original.validate_input(algorithm,values)
            self.assertEqual(glsmac.encode_input(algorithm,values).split()[1:4],['1','99','13'])
            for kind in (-1,0,4,5,99):
                with self.subTest(algorithm=algorithm,kind=kind):
                    with self.assertRaises(ProtocolError):original.validate_input(algorithm,dict(values,map_size_level=kind))
                    with self.assertRaises(ProtocolError):glsmac.encode_input(algorithm,dict(values,map_size_level=kind))

    def test_named_contract_scope_is_not_broadened_to_custom_or_unknown_kinds(self):
        for algorithm,values in self.examples():
            named=original.HUMAN_NUTRIENT_FACTOR if algorithm==original.CUSTOM_NUTRIENT_FACTOR else original.HUMAN_MINERAL_FACTOR
            for kind in (5,6,98,99,100):
                with self.assertRaises(ProtocolError):original.validate_input(named,dict(values,map_size_level=kind))
                with self.assertRaises(ProtocolError):glsmac.encode_input(named,dict(values,map_size_level=kind))

    @unittest.skipUnless(importlib.util.find_spec("unicorn"), "optional Unicorn dependency is absent")
    def test_original_instructions_read_custom_context_from_the_fixture(self):
        # Hand-written synthetic x86 loads the input scalar; no SMAC bytes or
        # arithmetic answers are used, and these outputs are never recorded.
        program=b'\xa1'+struct.pack('<I',original.MAP_SIZE_LEVEL)+b'\xc3'
        entry=original.FUNCTIONS[original.CUSTOM_NUTRIENT_FACTOR][1]
        oracle=synthetic_oracle(program,entry=entry)
        for algorithm,values in self.examples():
            self.assertEqual(oracle.probe(algorithm,values),{'factor':99})

if __name__=='__main__':unittest.main()
