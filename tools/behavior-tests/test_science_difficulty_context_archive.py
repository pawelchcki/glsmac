"""The rejected full original context remains explicit, including mismatch witnesses."""
from pathlib import Path
import unittest
import compare
from ui.science_difficulty_contract import validate_output

class ScienceDifficultyContextArchiveTests(unittest.TestCase):
    def runs(self):
        root=Path(__file__).parent/'ui/reference-archives/early-science-difficulties-v1'
        return [{r['id']:r['output'] for r in compare.read_json(root/name)['observations']} for name in ('run-a.json','run-b.json')]

    def test_both_complete_original_contexts_are_preserved(self):
        a,b=self.runs();self.assertEqual(set(a),set(b));self.assertEqual(len(a),4)
        for d in (*a.values(),*b.values()):validate_output(d)
        for k in a:
            self.assertEqual([s['accumulated'] for s in a[k]['trace']],[s['accumulated'] for s in b[k]['trace']])
            self.assertEqual([s['report']['per_turn'] for s in a[k]['trace']],[s['report']['per_turn'] for s in b[k]['trace']])

    def test_rejected_roster_and_cost_witnesses_remain_unequal(self):
        a,b=self.runs();l='gaians-librarian-first-five-advances';t='gaians-thinker-first-five-advances'
        self.assertEqual(sorted([len(a[l]['trace'][0]['units']),len(b[l]['trace'][0]['units'])]),[1,2])
        for i in (4,5):self.assertEqual(sorted([a[t]['trace'][i]['report']['cost'],b[t]['trace'][i]['report']['cost']]),[9,10])
