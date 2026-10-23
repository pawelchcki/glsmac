"""Scout recycling schema, synthetic inputs and immutable reference boundaries."""
from copy import deepcopy
import json
from pathlib import Path
import unittest
from types import SimpleNamespace
from ui import run
import compare
from protocol import ProtocolError,validate_cases
from ui import unit_recycling_contract as contract
from ui import unit_recycling_inputs as inputs
DIRECTORY=Path(__file__).parent/'ui'

class UnitRecyclingContractTests(unittest.TestCase):
 def test_public_cases_and_both_dialog_sources_are_exact_inputs(self):
  suite=inputs.suite();self.assertEqual(json.loads((DIRECTORY/'cases/unit-recycling.json').read_text()),suite)
  self.assertEqual(len(validate_cases(suite)),2)
  for case in suite['cases']:
   contract.validate_input(case['input']);self.assertNotIn('output',case)
   profile=case['input']['text_profile'];files=inputs.declarations(profile)
   self.assertEqual(files['script.txt'].count('#DISBAND\n'),1);self.assertEqual(files['script.txt'].count('#DISBAND2\n'),1)
   self.assertEqual(files['xscript.txt'].count('#DISBAND\n'),1)
   self.assertIn(inputs.SOURCE_TEXT[profile]['body'],files['script.txt'])
   self.assertNotEqual(files['script.txt'],files['xscript.txt'])
   self.assertNotIn('tab',case['input']['actions'])
  with self.assertRaises(ProtocolError):inputs.declarations('unknown')

 def test_rejects_other_layouts_sequences_extra_answers_and_bool_identities(self):
  original=inputs.suite()['cases'][0]['input'];defects=[]
  for key,value in [('profile','stacked'),('text_profile','stock'),('answer',5)]:
   bad=deepcopy(original);bad[key]=value;defects.append(bad)
  for action in ['tab',{'row_source':0},{'row_source':True},{'header':False}]:
   bad=deepcopy(original);bad['actions'][1]=action;defects.append(bad)
  bad=deepcopy(original);bad['initial_base']['workers']=False;defects.append(bad)
  for bad in defects:
   with self.subTest(bad=bad),self.assertRaises(ProtocolError):contract.validate_input(bad)

 def test_output_reads_actual_state_without_predicting_minerals_or_choice_count(self):
  for roles in [contract.ROLES,('former','colony')]:
   for delta in [-17,0,19]:
    for count in [2,3]:
     state=dict(year_delta=0,selected='former',owned_count=1,mineral_delta=delta,root_open=True,child_header=None,
      units=[dict(role=role,order_code=0,movement_spent=0) for role in roles],
      dialog=dict(caption='OBSERVED CAPTION',body='OBSERVED BODY',choices=['OPTION '+str(i) for i in range(count)],selected=count-1,buttons=['ACCEPT']))
     contract.validate_output(dict(trace=[state]),[])
  for key,value in [('mineral_delta',True),('mineral_delta',100001),('year_delta',1),('owned_count',False),('answer',5)]:
   bad=deepcopy(state);bad[key]=value
   with self.subTest(key=key,value=value),self.assertRaises(ProtocolError):contract.validate_output(dict(trace=[bad]),[])
  for key,value in [('choices',['ONE']),('selected',True),('selected',3),('buttons',[]),('body','')]:
   bad=deepcopy(state);bad['dialog'][key]=value
   with self.subTest(key=key),self.assertRaises(ProtocolError):contract.validate_output(dict(trace=[bad]),[])
  bad=deepcopy(state);bad['units'].reverse()
  with self.assertRaises(ProtocolError):contract.validate_output(dict(trace=[bad]),[])

 def test_complete_repeated_original_record_is_bound_to_full_inputs(self):
  suite=inputs.suite();record=compare.read_json(DIRECTORY/'observations/smacx-gog-2.0-unit-recycling.json')
  outputs=compare.validate_observations(record,suite);self.assertGreaterEqual(record['repeat'],2)
  for case in suite['cases']:contract.validate_output(outputs[case['id']],case['input']['actions'])
  changed=deepcopy(suite);changed['cases'][0]['input']['actions'].pop()
  with self.assertRaises(ProtocolError):compare.validate_observations(record,changed)
  incomplete=deepcopy(record);incomplete['observations'].pop()
  with self.assertRaises(ProtocolError):compare.validate_observations(incomplete,suite)
 def test_former_city_supplement_has_independent_repeated_evidence(self):
  suite=inputs.former_city_suite();self.assertEqual(json.loads((DIRECTORY/'cases/unit-recycling-former-city.json').read_text()),suite)
  self.assertEqual(len(validate_cases(suite)),1)
  self.assertEqual(suite['cases'][0]['input']['profile'],'stacked');self.assertEqual(suite['cases'][0]['input']['actions'][0],'tab')
  contract.validate_input(suite['cases'][0]['input'])
  record=compare.read_json(DIRECTORY/'observations/smacx-gog-2.0-unit-recycling-former-city.json');outputs=compare.validate_observations(record,suite)
  self.assertGreaterEqual(record['repeat'],2)
  for case in suite['cases']:contract.validate_output(outputs[case['id']],case['input']['actions'])
  self.assertEqual(len(inputs.suite()['cases']),2)

 def test_free_scout_supplement_has_independent_repeated_evidence(self):
  suite=inputs.scout_free_suite();self.assertEqual(json.loads((DIRECTORY/'cases/unit-recycling-scout-free.json').read_text()),suite)
  self.assertEqual(len(validate_cases(suite)),1);contract.validate_input(suite['cases'][0]['input'])
  record=compare.read_json(DIRECTORY/'observations/smacx-gog-2.0-unit-recycling-scout-free.json');outputs=compare.validate_observations(record,suite)
  self.assertGreaterEqual(record['repeat'],2)
  for case in suite['cases']:contract.validate_output(outputs[case['id']],case['input']['actions'])
  self.assertEqual(len(inputs.suite()['cases']),2)

 def test_pricing_preparation_inputs_are_bound_to_independent_original_audit(self):
  suite=json.loads((DIRECTORY/'cases/unit-recycling-pricing-context.json').read_text())
  record=compare.read_json(DIRECTORY/'observations/smacx-gog-2.0-unit-recycling-pricing-context.json')
  outputs=compare.validate_observations(record,suite);self.assertGreaterEqual(record['repeat'],2)
  observed=outputs['unit-recycling-pricing-context']
  self.assertEqual(inputs.PRICING_CONTEXT,{key:observed[key] for key in inputs.PRICING_CONTEXT})
  self.assertEqual(set(inputs.PRICING_CONTEXT),{'map_size_kind','mineral_rule_factor','industry'})
  self.assertNotIn('mineral_delta',inputs.PRICING_CONTEXT)

 def test_candidate_dispatch_needs_no_original_assets_or_renderer(self):
  args=SimpleNamespace(browser=False,record=False);command=run.unit_recycling_command(args)
  self.assertIn('unit_recycling_headless.py',command);self.assertNotIn('--assets',command)
  args.browser=True
  with self.assertRaises(ProtocolError):run.unit_recycling_command(args)

if __name__=='__main__':unittest.main()
