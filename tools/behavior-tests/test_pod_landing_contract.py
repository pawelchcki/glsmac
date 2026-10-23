import copy,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from protocol import ProtocolError
from ui.pod_landing_contract import validate_input,validate_output

class LandingContractTests(unittest.TestCase):
    def setUp(self):
        self.case={'input':{'confirmation':'keyboard','motion_projection':'horizontal-direction-from-first-sample'}}
        self.output={'phases':[{'phase':'planetfall','native_turn':0},{'phase':'landing','native_turn':0},{'phase':'first-base-name','native_turn':0}],
            'frames':[{'index':1,'motion_x':0},{'index':7,'motion_x':-1}],
            'name_after_animation':True,'completed':True,'failure':None}
    def test_wrong_observed_motion_and_order_remain_comparable(self):
        value=copy.deepcopy(self.output);value['frames'][1]['motion_x']=1;value['name_after_animation']=False;value['phases'][1]['native_turn']=1
        validate_output(value,self.case)
    def test_missing_animation_has_explicit_comparable_failure(self):
        value=copy.deepcopy(self.output);value.update(frames=[],completed=False,failure='No rendered pod frame was found',name_after_animation=False)
        validate_output(value,self.case)
    def test_rejects_malformed_or_unbounded_observations(self):
        for field,bad in [('frames',[{'index':1,'motion_x':True}]),('phases',[{'phase':'landing','native_turn':True}]),('failure','despite completion')]:
            with self.subTest(field=field),self.assertRaises(ProtocolError):
                value=copy.deepcopy(self.output);value[field]=bad;validate_output(value,self.case)
    def test_confirmation_is_declared_input(self):
        for bad in ({'confirmation':'timer'}, {'confirmation':'keyboard','expected_frame':1},None):
            with self.subTest(bad=bad),self.assertRaises(ProtocolError):validate_input(bad)

if __name__=='__main__':unittest.main()
