"""Portable successor boundary checks. Cheap Python children only; zero engines.

The historical c2a13e capture and raw evidence are immutable; this runner has
NEVER executed a game. Existing six no-child boundaries are ported unchanged."""
import json
import os
import subprocess
import sys
import unittest
from unittest.mock import patch
from pathlib import Path
from state_trace import unit_body_census_runner as executor

class ExecutorBoundaryTests(unittest.TestCase):

    def test_optimized_import_and_file_or_module_cli_reject_before_credit(self):
        root=Path(__file__).resolve().parents[2];script=root/'tools/behavior-tests/state_trace/unit_body_census_runner.py'
        base=dict(os.environ);base.pop('PYTHONOPTIMIZE',None);base['PYTHONPATH']=str(root/'tools/behavior-tests')
        variants=[(['-O'],None),(['-OO'],None),([], '1'),([], '0')]
        entries=[['-c',"import state_trace.unit_body_census_runner;print('UNSAFE_CASE_CREDIT')"],['-m','state_trace.unit_body_census_runner','--help'],[str(script),'--help']]
        for flags,optimize in variants:
            for entry in entries:
                env=dict(base)
                if optimize is not None:env['PYTHONOPTIMIZE']=optimize
                with self.subTest(flags=flags,env=optimize,entry=entry):
                    child=subprocess.run([sys.executable,*flags,*entry],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=5)
                    self.assertNotEqual(child.returncode,0);self.assertIn('requires unoptimized Python',child.stderr);self.assertNotIn('UNSAFE_CASE_CREDIT',child.stdout)
        for entry in entries:
            child=subprocess.run([sys.executable,*entry],cwd=root,env=base,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=5)
            self.assertEqual(child.returncode,0,child.stderr)

    def test_split_utf16_emoji_transport_and_corrupt_chunks(self):
        rows=[dict(start_utf16=0,end_utf16=2,text='a\ud83d'),
              dict(start_utf16=2,end_utf16=4,text='\ude00b')]
        encoded=[json.dumps(row) for row in rows]
        self.assertEqual(executor.audit_chunks('a😀b',encoded),2)
        cases=[encoded[:1],list(reversed(encoded)),
               [encoded[0],json.dumps({**rows[1],'start_utf16':3})],
               [encoded[0],json.dumps({**rows[1],'text':'\ude01b'})]]
        for corrupt in cases:
            with self.subTest(corrupt=corrupt),self.assertRaises((AssertionError,UnicodeError)):
                executor.audit_chunks('a😀b',corrupt)

    def test_os_exit_cannot_be_replaced_by_report_or_tap(self):
        for code in (None,1,-9,False,'0'):
            value=dict(raw_node_exit=code)
            with self.subTest(code=code),self.assertRaises((AssertionError,KeyError)):
                executor.audit({},value,Path('/unused'))

    def test_exit_zero_still_requires_actual_wait_and_complete_cleanup(self):
        baseline=dict(raw_node_exit=0,os_wait_completed=True,outer_timeout=False,
                      owned_group_after_cleanup='absent',tracked_descendants_after_cleanup=[],
                      forced_cleanup=False,postrun_bindings_match=True)
        for field,value in [('os_wait_completed',False),('outer_timeout',True),
                            ('owned_group_after_cleanup','permission-denied'),
                            ('tracked_descendants_after_cleanup',[{'pid':123}]),
                            ('forced_cleanup',True),('postrun_bindings_match',False)]:
            broken={**baseline,field:value}
            with self.subTest(field=field),self.assertRaises(AssertionError):executor.audit({},broken,Path('/unused'))

    def test_only_actual_visible_ancestry_is_tracked(self):
        table={100:dict(pid=100,ppid=1,pgid=100,session=100,start_ticks=10,state='S'),
               101:dict(pid=101,ppid=100,pgid=101,session=101,start_ticks=11,state='S'),
               102:dict(pid=102,ppid=101,pgid=101,session=101,start_ticks=12,state='S'),
               200:dict(pid=200,ppid=1,pgid=200,session=200,start_ticks=20,state='S')}
        tracked={}
        with patch.object(executor,'process_table',return_value=(table,0)):
            sample=executor.own_sample(100,tracked)
        self.assertEqual({row['pid'] for row in sample['observed_owned']},{100,101,102})
        self.assertFalse(sample['exhaustive_host_inventory'])

    def test_reparented_observed_child_keeps_identity_but_reused_pid_does_not(self):
        tracked={100:10,101:11,102:12}
        table={100:dict(pid=100,ppid=1,pgid=100,session=100,start_ticks=50,state='S'),
               101:dict(pid=101,ppid=1,pgid=101,session=101,start_ticks=11,state='S'),
               102:dict(pid=102,ppid=200,pgid=200,session=200,start_ticks=52,state='S')}
        with patch.object(executor,'process_table',return_value=(table,1)):
            sample=executor.own_sample(100,tracked)
        self.assertEqual([row['pid'] for row in sample['observed_owned']],[101])
        self.assertFalse(sample['node_visible']);self.assertEqual(sample['proc_stat_read_failures'],1)

    def test_unavailable_namespace_is_explicit_not_exhaustive_cleanup(self):
        with patch.object(executor,'process_table',return_value=({},5)):
            sample=executor.own_sample(100,{})
        self.assertFalse(sample['node_visible']);self.assertFalse(sample['exhaustive_host_inventory'])
        self.assertEqual(sample['proc_stat_read_failures'],5)

if __name__=='__main__':unittest.main()
