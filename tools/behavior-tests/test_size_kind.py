import json
from pathlib import Path
from types import SimpleNamespace
import struct
import tempfile
import unittest
from unittest.mock import patch

from protocol import ProtocolError
from ui import size_kind_contract as contract
from ui import size_kind_original as original
from ui import size_kind_headless as candidate


def case(name='first'):
    return {'id':name,'algorithm':contract.ALGORITHM,'input':{'route':'random','prior_preset':None,'close':'wait','reenter':False}}

def marker(name='first',kind='-1'):
    return f'SIZEKIND_BEGIN|{name}|open|{kind}\nSIZEKIND_DIALOG|ACTUAL WINDOW|17|29\nSIZEKIND_END\nSIZEKIND_DONE|{name}\n'

def completed(text,count=1):
    return text+f'SIZEKIND_COMPLETE|{count}\nAll tests passed.\n'


class SizeKindTests(unittest.TestCase):
    def test_inputs_do_not_carry_expected_state_or_size_kind(self):
        base=case()['input']
        for value in [None,{},dict(base,prior_preset=True),dict(base,prior_preset=99),dict(base,prior_preset=[]),dict(base,close='other'),dict(base,reenter=1),dict(base,reenter=True),dict(base,size_kind=99)]:
            with self.subTest(value=value),self.assertRaises(ProtocolError):contract.validate_input(value)
        for route in ('random','custom'):
            for prior in (None,0,1,2,3,4):
                for close in contract.CLOSE_ACTIONS:
                    contract.validate_input(dict(base,route=route,prior_preset=prior,close=close,reenter=close!='wait'))

    def test_observed_native_kind_and_field_values_are_not_substituted(self):
        output=contract.parse_candidate(completed(marker()),[case()])[0]['output']['trace'][0]
        self.assertEqual(output['size_kind'],-1)
        self.assertEqual(output['screen']['values'],['17','29'])
        self.assertEqual(output['screen']['caption'],'ACTUAL WINDOW')

    def test_menu_highlight_and_current_kind_remain_distinct(self):
        text=marker().replace('SIZEKIND_DONE|first\n','')+'SIZEKIND_BEGIN|first|close|99\nSIZEKIND_MENU|ACTUAL MENU\nSIZEKIND_ENTRY|0|true|FIRST\nSIZEKIND_ENTRY|1|false|SECOND\nSIZEKIND_END\nSIZEKIND_DONE|first\n'
        row=contract.parse_candidate(completed(text),[case()])[0]['output']['trace'][-1]
        self.assertEqual(row['size_kind'],99)
        self.assertEqual(row['screen']['selected'],['FIRST'])

    def test_missing_duplicate_reordered_unknown_and_late_cases_fail(self):
        for text,cases in [('',[case()]),(marker(),[case()]),(completed(marker()+marker()),[case()]),(completed(marker('other')),[case()]),(completed(marker('second')+marker(),2),[case(),case('second')]),(completed(marker())+marker(),[case()]),(completed(marker(),0),[case()])]:
            with self.subTest(text=text),self.assertRaises(ProtocolError):contract.parse_candidate(text,cases)

    def test_incomplete_unknown_noncanonical_and_failure_markers_fail(self):
        for text in [completed(marker()).replace('SIZEKIND_END\n',''),completed(marker()).replace('open','unknown'),completed(marker(kind='099')),completed(marker(kind='5')),completed(marker())+'TEST FAILED',completed(marker())+'Unhandled exception',completed(marker()).replace('ACTUAL WINDOW','')]:
            with self.subTest(text=text),self.assertRaises((ProtocolError,ValueError)):contract.parse_candidate(text,[case()])

    def test_owned_process_requires_the_private_prefix_and_actual_executable(self):
        driver=SimpleNamespace(env={'WINEPREFIX':'/owned/prefix'})
        with tempfile.TemporaryDirectory() as temporary:
            proc=Path(temporary)
            for pid,name,prefix in [('11','start.exe','/owned/prefix'),('12','terranx.exe','/other/prefix'),('13','terranx.exe','/owned/prefix')]:
                path=proc/pid;path.mkdir();(path/'comm').write_text(name+'\n');(path/'environ').write_bytes(('WINEPREFIX='+prefix).encode()+b'\0')
            self.assertEqual(original.owned_process(driver,proc),proc/'13')
            path=proc/'14';path.mkdir();(path/'comm').write_text('terranx.exe\n');(path/'environ').write_bytes(b'WINEPREFIX=/owned/prefix\0')
            with self.assertRaises(ProtocolError):original.owned_process(driver,proc)

    def test_native_reader_requires_the_mapped_pinned_image_and_known_scalar(self):
        with tempfile.TemporaryDirectory() as temporary:
            process=Path(temporary)
            (process/'maps').write_text('00000000-00600000 r-xp 00000000 00:00 1 /owned/game/terranx.exe\n')
            with (process/'mem').open('wb') as stream:
                stream.write(b'MZ');stream.seek(original.SIZE_KIND_RVA);stream.write(struct.pack('<i',99))
            driver=SimpleNamespace(work=Path('/owned'))
            with patch.object(original,'owned_process',return_value=process):
                self.assertEqual(original.read_kind(driver),99)
                with (process/'mem').open('r+b') as stream:stream.seek(original.SIZE_KIND_RVA);stream.write(struct.pack('<i',88))
                with self.assertRaisesRegex(ProtocolError,'unknown original'):original.read_kind(driver)
                with (process/'mem').open('r+b') as stream:stream.write(b'NO')
                with self.assertRaisesRegex(ProtocolError,'image header'):original.read_kind(driver)

    def test_ambiguous_image_mapping_is_not_read(self):
        with tempfile.TemporaryDirectory() as temporary:
            process=Path(temporary);line='00000000-00600000 r-xp 00000000 00:00 1 /owned/game/terranx.exe\n'
            (process/'maps').write_text(line+line)
            with patch.object(original,'owned_process',return_value=process),self.assertRaisesRegex(ProtocolError,'ambiguous'):
                original.read_kind(SimpleNamespace(work=Path('/owned')))

    def test_unknown_original_contract_never_launches_wine(self):
        request={'cases':[dict(case(),algorithm='unknown.v1')]}
        with patch('sys.argv',['original.py','--assets','/unused']),patch.object(original,'load_request',return_value=request),patch.object(original,'capture') as capture,patch.object(original,'write_response') as write:
            original.main()
        capture.assert_not_called();self.assertEqual(write.call_args.args[1][0]['status'],'unsupported')

    def test_unknown_candidate_contract_never_launches_wasm(self):
        request={'cases':[dict(case(),algorithm='unknown.v1')]}
        with patch('sys.argv',['candidate.py']),patch.object(candidate,'load_request',return_value=request),patch.object(candidate,'headless') as headless,patch.object(candidate,'write_response') as write:
            candidate.main()
        headless.assert_not_called();self.assertEqual(write.call_args.args[1][0]['status'],'unsupported')

    def test_input_only_suite_is_complete_and_unique(self):
        path=Path(__file__).parent/'ui/cases/custom-size-kind.json';cases=json.loads(path.read_text())['cases']
        self.assertEqual(len(cases),20);self.assertEqual(len({c['id'] for c in cases}),20)
        for c in cases:contract.validate_input(c['input'])

if __name__=='__main__':unittest.main()
