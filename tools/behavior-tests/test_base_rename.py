"""Strict Rename inputs, native-state schema, source inputs and transport."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from protocol import ProtocolError
import compare
from ui import base_rename_contract as contract
from ui.base_rename_inputs import declarations
from ui.base_rename_original import patch_source
from ui.base_rename_headless import parse_candidate

DIRECTORY = Path(__file__).parent / 'ui'


class RenameContractTests(unittest.TestCase):
    def cases(self):
        return json.loads((DIRECTORY / 'cases/base-rename.json').read_text())['cases']

    def output(self, actions):
        row = dict(after_action=-1, screen='rename', title='SYNTHETIC CITY', year_delta=0, selected='scout',
                   base=dict(name='Synthetic City', population=3, workers=2, doctors=1, worked_tiles=1, owned_count=1),
                   units=[dict(role=role, order_code=1, movement_spent=2) for role in ('scout','former','colony')],
                   dialog=dict(caption='SYNTHETIC CAPTION',prompt='SYNTHETIC PROMPT',label='FIELD:',value='ARBITRARY DRAFT',buttons=['ACCEPT','DISCARD']))
        return dict(trace=[dict(deepcopy(row),after_action=i-1) for i in range(len(actions)+1)])

    @staticmethod
    def encode(case, output):
        rows=['RENAME_CASE|'+case['id']]
        for index,row in enumerate(output['trace']):
            rows.append(f"RENAME_STATE|{index}|{row['screen']}|{row['year_delta']}|{row['selected'] or 'none'}")
            if row['title'] is not None:rows.append('RENAME_TITLE|'+row['title'])
            rows.append('RENAME_NAME|'+row['base']['name'])
            rows.append('RENAME_BASE|'+'|'.join(str(row['base'][k]) for k in ('population','workers','doctors','worked_tiles','owned_count')))
            for unit in row['units']:rows.append(f"RENAME_UNIT|{unit['role']}|{unit['order_code']}|{unit['movement_spent']}")
            if row['dialog'] is not None:
                for key in ('caption','prompt','label','value'):rows.append('RENAME_'+key.upper()+'|'+row['dialog'][key])
                for value in row['dialog']['buttons']:rows.append('RENAME_BUTTON|'+value)
            rows.append('RENAME_STATE_DONE')
        return '\n'.join(rows+['RENAME_CASE_DONE','All tests passed.',''])

    def test_all_declared_sequences_bound_to_profiles(self):
        cases=self.cases();self.assertEqual(len(cases),11)
        self.assertEqual([(c['id'],c['input']['text_profile'],c['input']['actions']) for c in cases],contract.SEQUENCES)
        for case in cases:
            contract.validate_input(case['input']);self.assertEqual(case['algorithm'],contract.ALGORITHM)

    def test_initial_native_name_and_integer_state_are_exact_inputs(self):
        for key in contract.INITIAL:
            for value in (True,None,'invalid',999):
                data=deepcopy(self.cases()[0]['input']);data['initial_base'][key]=value
                with self.subTest(key=key,value=value),self.assertRaises(ProtocolError):contract.validate_input(data)

    def test_unknown_sequences_profiles_or_extra_fields_rejected(self):
        for key,value in [('actions',[]),('actions',['delete']),('profile','spread'),('text_profile','other'),('extra',1)]:
            data=deepcopy(self.cases()[0]['input']);data[key]=value
            with self.assertRaises(ProtocolError):contract.validate_input(data)

    def test_valid_arbitrary_observations_survive_transport(self):
        for case in self.cases():
            output=self.output(case['input']['actions']);contract.validate_output(output,case['input']['actions'])
            self.assertEqual(parse_candidate(self.encode(case,output),[case]),[dict(id=case['id'],status='ok',output=output)])

    def test_raw_native_case_and_spaces_preserved_but_display_normalized(self):
        case=self.cases()[0];output=self.output(case['input']['actions'])
        for row in output['trace']:row['base']['name']='  MiXeD Grove  '
        log=self.encode(case,output).replace('RENAME_VALUE|ARBITRARY DRAFT','RENAME_VALUE|  mixed   draft  ')
        parsed=parse_candidate(log,[case])[0]['output']
        self.assertEqual(parsed['trace'][0]['base']['name'],'  MiXeD Grove  ')
        self.assertEqual(parsed['trace'][0]['dialog']['value'],'MIXED DRAFT')

    def test_empty_draft_and_native_name_are_observations_not_guessed_answers(self):
        case=self.cases()[0];output=self.output(case['input']['actions'])
        for row in output['trace']:row['dialog']['value']='';row['base']['name']='';row['title']=''
        self.assertEqual(parse_candidate(self.encode(case,output),[case])[0]['output'],output)

    def test_year_owner_citizen_and_worked_square_inconsistency_rejected(self):
        case=self.cases()[0]
        for key,value in [('year_delta',1),('owned_count',0),('population',1),('worked_tiles',3)]:
            output=self.output(case['input']['actions']);row=output['trace'][0]
            (row if key=='year_delta' else row['base'])[key]=value
            with self.subTest(key=key),self.assertRaises(ProtocolError):contract.validate_output(output,case['input']['actions'])

    def test_missing_reordered_or_duplicate_checkpoints_rejected(self):
        case=self.cases()[0];output=self.output(case['input']['actions'])
        for trace in (output['trace'][:-1],output['trace']+[output['trace'][-1]],list(reversed(output['trace']))):
            with self.assertRaises(ProtocolError):contract.validate_output(dict(trace=trace),case['input']['actions'])

    def test_map_has_no_dialog_or_management_title(self):
        case=self.cases()[0];output=self.output(case['input']['actions']);row=output['trace'][0];row['screen']='map'
        with self.assertRaises(ProtocolError):contract.validate_output(output,case['input']['actions'])
        row['dialog']=None;row['title']=None;contract.validate_output(output,case['input']['actions'])

    def test_actual_native_failure_remains_error(self):
        case=self.cases()[0];log='RENAME_CASE|'+case['id']+'\nRENAME_ERROR|actual mounted Rename missing\nAll tests passed.\n'
        self.assertEqual(parse_candidate(log,[case]),[dict(id=case['id'],status='error',reason='actual mounted Rename missing')])

    def test_success_marker_cannot_supply_missing_native_state(self):
        case=self.cases()[0]
        for log in ('','All tests passed.\n','RENAME_CASE|'+case['id']+'\nAll tests passed.\n'):
            with self.assertRaises(ProtocolError):parse_candidate(log,[case])

    def test_failed_worker_or_incomplete_duplicate_state_rejected(self):
        case=self.cases()[0];log=self.encode(case,self.output(case['input']['actions']))
        bad=[log.replace('All tests passed.',''),log+'TEST FAILED\n',log+'Unhandled exception\n',
             'RENAME_STATE_DONE\n'+log,log.replace('RENAME_STATE_DONE\n','',1),
             log.replace('RENAME_UNIT|colony|1|2\n','',1),log.replace('RENAME_NAME|Synthetic City','RENAME_NAME|Synthetic City\nRENAME_NAME|Synthetic City',1),
             log.replace('RENAME_VALUE|ARBITRARY DRAFT','RENAME_VALUE|ARBITRARY DRAFT\nRENAME_VALUE|ARBITRARY DRAFT',1)]
        for value in bad:
            with self.assertRaises(ProtocolError):parse_candidate(value,[case])

    def test_source_profiles_are_independent_declarations(self):
        for profile in contract.PROFILES:
            data=declarations(profile)
            for name,kind in [('script.txt','common'),('xscript.txt','expansion')]:
                spec=contract.SOURCE_TEXT[kind] if profile in (kind,'both') else contract.SOURCE_TEXT['default']
                self.assertIn('#caption '+spec['caption']+'\n'+spec['prompt']+'\n\n'+spec['label']+'\n',data[name])
            labels=data['labels.txt'].splitlines();self.assertEqual(labels[:2],['#LABELS','1131']);self.assertEqual(len(labels),1133)
            self.assertEqual((labels[103],labels[104]),('OK','Cancel'))
        first=declarations('both');first['script.txt']='mutated';self.assertNotEqual(first,declarations('both'))

    def test_source_patching_preserves_unrelated_records_and_rejects_ambiguity(self):
        raw=b'#BEFORE\r\nKeep.\r\n#RENAME\r\n#xs 440\r\n#caption Old\r\nOld prompt.\r\n\r\nOld:\r\n\r\n#AFTER\r\nKeep too.\r\n'
        patched=patch_source(raw,contract.SOURCE_TEXT['common'])
        self.assertTrue(patched.startswith(b'#BEFORE\r\nKeep.\r\n'));self.assertTrue(patched.endswith(b'#AFTER\r\nKeep too.\r\n'))
        self.assertIn(b'#xs 440\r\n',patched);self.assertIn(b'Common title for $BASENAME0?',patched)
        for bad in (b'#OTHER\n',raw+raw,b'#RENAME\n#caption Old\nOnly one line\n'):
            with self.assertRaises(ProtocolError):patch_source(bad,contract.SOURCE_TEXT['common'])

    def test_repeated_reference_is_bound_to_current_observer_and_inputs(self):
        from ui.base_rename_original import fingerprint
        suite=json.loads((DIRECTORY/'cases/base-rename.json').read_text())
        evidence=json.loads((DIRECTORY/'observations/smacx-gog-2.0-base-rename.json').read_text())
        compare.validate_observations(evidence,suite)
        self.assertGreaterEqual(evidence['repeat'],2)
        self.assertEqual(evidence['reference']['adapter_sha256'],fingerprint())
        self.assertEqual(evidence['reference']['contract'],contract.ALGORITHM)
        for case,row in zip(suite['cases'],evidence['observations'],strict=True):
            contract.validate_output(row['output'],case['input']['actions'])
            self.assertEqual(parse_candidate(self.encode(case,row['output']),[case])[0]['output'],row['output'])
        changed=deepcopy(suite);changed['cases'][0]['input']['initial_base']['name']='Changed input'
        with self.assertRaises(ProtocolError):compare.validate_observations(evidence,changed)


class RenameSetupRetryTests(unittest.TestCase):
    def fixture(self,root):
        from types import SimpleNamespace
        (root/'game').mkdir()
        return SimpleNamespace(work=root,process=None)

    def test_only_incomplete_initial_management_is_retried_from_fresh_fixture(self):
        import tempfile
        from unittest.mock import patch
        from ui import base_rename_original as original
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);driver=self.fixture(root);case={'id':'synthetic'};output={'actual':'observed'}
            with patch.object(original,'capture',side_effect=[original.InitialManagementUnavailable('not yet open'),output]) as capture:
                result=original.capture_fresh_case(driver,None,None,case,root,{'fixture.txt':b'declared input'})
            self.assertIs(result,output);self.assertEqual(capture.call_count,2)
            self.assertEqual([call.args[-1].name for call in capture.call_args_list],['synthetic','synthetic-setup-retry'])
            self.assertEqual((root/'game/fixture.txt').read_bytes(),b'declared input')

    def test_actual_observation_or_context_errors_are_never_retried(self):
        import tempfile
        from unittest.mock import patch
        from ui import base_rename_original as original
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);driver=self.fixture(root)
            with patch.object(original,'capture',side_effect=ProtocolError('actual native identity mismatch')) as capture:
                with self.assertRaisesRegex(ProtocolError,'actual native identity mismatch'):
                    original.capture_fresh_case(driver,None,None,{'id':'synthetic'},root,{})
                self.assertEqual(capture.call_count,1)

    def test_repeated_initial_failure_stays_fatal_without_output(self):
        import tempfile
        from unittest.mock import patch
        from ui import base_rename_original as original
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);driver=self.fixture(root)
            with patch.object(original,'capture',side_effect=original.InitialManagementUnavailable('not open')) as capture:
                with self.assertRaises(original.InitialManagementUnavailable):original.capture_fresh_case(driver,None,None,{'id':'synthetic'},root,{})
                self.assertEqual(capture.call_count,2)


class RenameCleanFrameConsensusTests(unittest.TestCase):
    def capture_frames(self, frames):
        import tempfile
        from types import SimpleNamespace
        from unittest.mock import Mock, patch
        from ui import base_rename_original as original
        city=dict(contract.INITIAL,id=4,x=8,y=8,population=1)
        units=[dict(role=role,index=i,x=8,y=8,order_code=0,movement_spent=0)
               for i,role in enumerate(('scout','former','colony'))]
        native=dict(turn=2101,selected='scout',units=units)
        driver=Mock(); pending=iter(frames); active=[None]
        driver.snapshot.side_effect=lambda path:active.__setitem__(0,next(pending))
        image=SimpleNamespace(convert=lambda mode:active[0])
        vision=SimpleNamespace(vision=object(),Image=SimpleNamespace(open=lambda path:image))
        dialog=dict(caption='SYNTHETIC READER',prompt='SYNTHETIC PROMPT',label='FIELD:',value='SYNTHETIC DRAFT',buttons=['OK','CANCEL'])
        reader=Mock();reader.present.side_effect=lambda frame:frame!='base'
        def read(frame):
            if frame=='caret':raise original.RenameCaretVisible('unreadable caret frame')
            if frame=='unreadable':raise original.VisionError('unreadable dialog frame')
            return deepcopy(dialog)
        reader.read.side_effect=read;reader.title.return_value="GAIA'S LANDING"
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(original.base,'prepare',return_value=(native,(8,8))), \
                 patch.object(original.base,'native',return_value=native), \
                 patch.object(original.ref.full,'city',return_value=dict(city=city,global_count=1,owned_count=1)), \
                 patch.object(original.ref.hud,'parse_hud'), patch.object(original,'RenameVision',return_value=reader), \
                 patch.object(original.base,'raw_key'), patch.object(original,'click_control'), \
                 patch.object(original.time,'sleep'):
                result=original.capture(driver,None,vision,dict(input=dict(initial_base=contract.INITIAL,actions=['rename','cancel'])),Path(directory)/'case')
        return result,driver.snapshot.call_count

    def test_caret_frames_do_not_supply_text_or_erase_a_complete_clean_reading(self):
        result,count=self.capture_frames(['base','base','clean','caret','clean','base','base'])
        self.assertEqual(count,7)
        self.assertEqual([row['screen'] for row in result['trace']],['base','rename','base'])
        self.assertEqual(result['trace'][1]['dialog']['value'],'SYNTHETIC DRAFT')

    def test_other_unreadable_frames_require_fresh_clean_consensus(self):
        result,count=self.capture_frames(['base','base','clean','unreadable','clean','clean','base','base'])
        self.assertEqual(count,8)
        self.assertEqual(result['trace'][1]['dialog']['value'],'SYNTHETIC DRAFT')


try:
    from PIL import Image, ImageOps
except ImportError:
    Image = ImageOps = None


@unittest.skipIf(Image is None, 'optional Pillow required for observer pixel-shape tests')
class RenameObserverShapeTests(unittest.TestCase):
    def reader(self):
        from types import SimpleNamespace
        from ui.base_rename_original import RenameVision
        vision=SimpleNamespace(Image=Image,ImageOps=ImageOps,text=lambda image:'OBSERVED GLYPHS')
        return RenameVision(vision)

    def test_selected_field_origin_comes_from_rendered_geometry(self):
        reader=self.reader();image=Image.new('RGB',(1024,768),(0,0,0))
        for x in range(220,280):
            for y in range(386,406):image.putpixel((x,y),(100,81,63))
        for x in range(225,229):
            for y in range(391,399):image.putpixel((x,y),(0,0,0))
        self.assertEqual(reader.draft(image),'OBSERVED GLYPHS')
        self.assertEqual(reader.field_left,220)

    def test_unknown_field_origin_is_rejected_without_guessing(self):
        reader=self.reader();image=Image.new('RGB',(1024,768),(0,0,0))
        from ui.vision import VisionError
        with self.assertRaises(VisionError):reader.draft(image)

    def test_caret_overlapping_glyphs_requires_clean_frame(self):
        reader=self.reader();reader.field_left=220;image=Image.new('RGB',(1024,768),(0,0,0))
        for y in range(386,406):image.putpixel((230,y),(120,164,212))
        for x in range(228,233):image.putpixel((x,395),(120,164,212))
        from ui.vision import VisionError
        with self.assertRaises(VisionError):reader.draft(image)

    def test_empty_clean_field_is_an_observed_empty_value(self):
        reader=self.reader();reader.field_left=220;image=Image.new('RGB',(1024,768),(0,0,0))
        self.assertEqual(reader.draft(image),'')


if __name__=='__main__':unittest.main()
