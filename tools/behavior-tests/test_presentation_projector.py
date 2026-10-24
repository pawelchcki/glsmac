"""Synthetic projector invariants, distinct from real native/browser coverage."""
from copy import deepcopy
import unittest
from protocol import ProtocolError
from state_trace.presentation import RawRecorder
from state_trace.presentation_projector import project_capture
from state_trace.presentation_schema import validate_output


def fixture():
    rows = []
    def add(kind, target='trace', **data):
        if kind == 'semantic.role': data.setdefault('constructor', False)
        rows.append(dict(seq=len(rows)+1,kind=kind,target=target,data=data))
    add('semantic.protocol',version=2)
    add('trace.protocol',version=1,physical_os_complete=False)
    add('trace.action',op=1,action=1,checkpoint=0,nonce=0)
    add('node.create','n1',parent=None,tag='$root')
    add('semantic.role','n1',role='container',source='')
    add('node.create','n2',parent='n1',tag='$button')
    add('semantic.role','n2',role='button',source='')
    add('node.create','n3',parent='n2',tag='$text')
    add('node.property','n3',key='rendered_text',value='CONFIRM')
    add('semantic.part','n3',owner='n2',relation='label')
    add('node.create','n4',parent='n1',tag='$Input')
    add('semantic.role','n4',role='text-editor',source='')
    add('node.create','n5',parent='n4',tag='$text')
    add('semantic.part','n5',owner='n4',relation='editor-display')
    add('node.property','n5',key='rendered_text',value='ABC_')
    add('semantic.field','n4',key='value',value='ABC')
    add('node.create','n6',parent='n1',tag='$choicelist')
    add('semantic.role','n6',role='choice-list',source='')
    add('semantic.choices','n6',count=2)
    for index,key in enumerate(('distinct-a','distinct-b')):
        node='n'+str(index+7)
        add('node.create',node,parent='n6',tag='$button')
        add('semantic.role',node,role='button',source='')
        add('semantic.part',node,owner='n6',relation='choice-item')
        add('semantic.choice','n6',key=key,label='Duplicate label',index=index,node=node)
    add('semantic.field','n6',key='selected',value='distinct-b')
    add('node.create','n9',parent='n1',tag='$unexpected')
    add('node.opaque','n9',key='presentation',type='Object')
    add('node.destroy','n9')
    add('node.create','n10',parent='n1',tag='$text')
    add('node.property','n10',key='rendered_text',value='Unverified measurement probe')
    add('trace.action',op=2,action=1,checkpoint=0,nonce=1)
    add('trace.checkpoint',op=3,action=1,checkpoint=1,nonce=2)
    inputs=dict(fixture={'requested_coverage':['windows','widgets']},actions=[dict(id='launch',kind='launch')],checkpoints=[dict(id='ready',after_action='launch')])
    capture=dict(batches=[dict(enabled=True,dropped=0,events=rows)],input_checkpoints=[dict(id='ready',after_action='launch',checkpoint=1)])
    return inputs,capture,add


class ProjectionTests(unittest.TestCase):
    def assert_live_choice_history(self, events):
        objects = {}
        for event in events:
            target = event['object_id']
            if event['kind'] == 'create': objects[target] = deepcopy(event['fields'])
            elif event['kind'] == 'update': objects[target].update(deepcopy(event['fields']))
            elif event['kind'] == 'destroy': del objects[target]
            for owner in objects.values():
                for item in owner.get('items') or []:
                    self.assertIn(item['control'], objects)

    def test_first_script_role_does_not_precede_prior_native_observations(self):
        inputs, capture, _ = fixture()
        rows = capture['batches'][0]['events']
        index = next(i for i, event in enumerate(rows) if event['target'] == 'n10' and event['kind'] == 'node.property')
        rows[index:index] = [dict(kind='node.show', target='n10', data={}),
                             dict(kind='node.attach', target='n10', data=dict(parent='n1'))]
        rows.insert(index + 3, dict(kind='semantic.role', target='n10', data=dict(role='paragraph', source='later-script-binding', constructor=False)))
        for seq, event in enumerate(rows, 1): event['seq'] = seq
        state = project_capture(capture, inputs)['checkpoints'][0]['state']['presentation']
        birth = next(event['seq'] for event in state['events'] if event['kind'] == 'create' and event['object_id'] == 'candidate-birth:n10')
        prior = [event['seq'] for event in state['events'] if event['kind'] == 'observed' and event['fields']['target'] == 'n10' and event['fields']['kind'] in ('node.show', 'node.attach', 'node.property')]
        self.assertTrue(all(sequence < birth for sequence in prior))
        self.assertTrue(state['objects']['candidate-birth:n10']['visible_local'])
        self.assertTrue(state['objects']['candidate-birth:n10']['mounted'])

    def test_container_destruction_invalidates_membership_without_faking_native_clear(self):
        inputs, capture, _ = fixture()
        rows = capture['batches'][0]['events']
        rows[-2:-2] = [dict(kind='node.destroy', target=target, data={}) for target in ('n7', 'n8', 'n6')]
        for seq, event in enumerate(rows, 1): event['seq'] = seq
        state = project_capture(capture, inputs)['checkpoints'][0]['state']['presentation']
        self.assert_live_choice_history(state['events'])
        changes = [event['fields'] for event in state['events'] if event['kind'] == 'update' and event['object_id'] == 'candidate-birth:n6' and 'items' in event['fields']]
        self.assertEqual([len(change['items']) if change['items'] is not None else None for change in changes], [2, None])
        self.assertEqual(changes[-1]['field_availability']['items'], 'unavailable: choice control retired')
        self.assertFalse(any(event['kind'] == 'semantic.choices' and event['data']['count'] == 0 for event in rows))

    def test_late_choice_registration_cannot_publish_retired_cached_controls(self):
        inputs, capture, _ = fixture()
        rows = capture['batches'][0]['events']
        rows[:] = [event for event in rows if not (event['target'] == 'n6' and event['kind'] == 'semantic.role')]
        rows[-2:-2] = [dict(kind='node.destroy', target=target, data={}) for target in ('n7', 'n8')] + [
            dict(kind='semantic.role', target='n6', data=dict(role='choice-list', source='late-binding', constructor=False))]
        for seq, event in enumerate(rows, 1): event['seq'] = seq
        state = project_capture(capture, inputs)['checkpoints'][0]['state']['presentation']
        self.assert_live_choice_history(state['events'])
        self.assertIsNone(state['objects']['candidate-birth:n6']['items'])
        self.assertEqual(state['objects']['candidate-birth:n6']['field_availability']['items'], 'unavailable: choice control retired')
    def assert_live_selection_history(self, events):
        live, selections = set(), {}
        for event in events:
            target, fields = event['object_id'], event['fields']
            if event['kind'] == 'create':
                live.add(target)
            elif event['kind'] == 'update' and 'selected' in fields:
                if fields['field_availability']['selected'] == 'actual native live logical selection target':
                    self.assertIn(fields['selected'], live)
                    selections[target] = fields['selected']
                else:
                    selections.pop(target, None)
            elif event['kind'] == 'destroy':
                self.assertNotIn(target, selections.values())
                live.remove(target)
                selections.pop(target, None)

    def test_protocol_v2_requires_explicit_typed_constructor_provenance(self):
        for corrupt in ('legacy', 'missing', 'untyped'):
            inputs, capture, _ = fixture()
            rows = capture['batches'][0]['events']
            if corrupt == 'legacy':
                rows[0]['data']['version'] = 1
                message = 'v2 required; rebuild'
            else:
                role = next(e['data'] for e in rows if e['kind'] == 'semantic.role')
                if corrupt == 'missing':
                    del role['constructor']
                    message = 'malformed'
                else:
                    role['constructor'] = 'true'
                    message = 'constructor provenance'
            with self.subTest(corrupt=corrupt), self.assertRaisesRegex(ProtocolError, message):
                project_capture(capture, inputs)

    def test_native_window_constructor_birth_and_later_annotations_stay_distinct(self):
        inputs, capture, _ = fixture()
        rows = capture['batches'][0]['events']
        index = next(i for i, e in enumerate(rows) if e['target'] == 'n2' and e['kind'] == 'semantic.role')
        rows[index]['data'].update(role='window', constructor=True)
        rows.insert(index, dict(kind='semantic.role', target='n2', data=dict(role='container', source='', constructor=True)))
        rows[-2:-2] = [dict(kind='semantic.role', target='n2', data=dict(role='container', source='runtime-container', constructor=False)),
                       dict(kind='semantic.role', target='n2', data=dict(role='dialog', source='runtime-dialog', constructor=False))]
        for seq, event in enumerate(rows, 1): event['seq'] = seq
        events = project_capture(capture, inputs)['checkpoints'][0]['state']['presentation']['events']
        canonical = [e for e in events if e['object_id'] == 'candidate-birth:n2' and e['kind'] in ('create', 'update')]
        self.assertEqual((canonical[0]['kind'], canonical[0]['domain'], canonical[0]['fields']['role']), ('create', 'windows', 'window'))
        roles = [e['fields']['role'] for e in canonical if 'role' in e['fields']]
        self.assertEqual(roles, ['window', 'container', 'dialog'])
        self.assertEqual(sum(e['kind'] == 'create' for e in canonical), 1)
        observed = [e['fields']['data'] for e in events if e['kind'] == 'observed' and e['fields']['kind'] == 'semantic.role' and e['fields']['target'] == 'n2']
        self.assertEqual([e['role'] for e in observed], ['container', 'window', 'container', 'dialog'])

    def test_selected_reference_waits_for_birth_then_becomes_unavailable_on_retirement(self):
        inputs, capture, _ = fixture()
        rows = capture['batches'][0]['events']
        index = next(i for i, e in enumerate(rows) if e['target'] == 'n2' and e['kind'] == 'node.create')
        rows.insert(index, dict(kind='semantic.field', target='n1', data=dict(key='selected_node', value='n2')))
        rows[-2:-2] = [dict(kind='node.destroy', target='n3', data={}), dict(kind='node.destroy', target='n2', data={})]
        for seq, event in enumerate(rows, 1): event['seq'] = seq
        state = project_capture(capture, inputs)['checkpoints'][0]['state']['presentation']
        events = state['events']
        self.assert_live_selection_history(events)
        birth = next(e['seq'] for e in events if e['kind'] == 'create' and e['object_id'] == 'candidate-birth:n2')
        selection = next(e['seq'] for e in events if e['kind'] == 'update' and e['object_id'] == 'candidate-birth:n1' and e['fields'].get('selected') == 'candidate-birth:n2')
        retired = next(e['seq'] for e in events if e['kind'] == 'destroy' and e['object_id'] == 'candidate-birth:n2')
        unavailable = next(e['seq'] for e in events if e['kind'] == 'update' and e['object_id'] == 'candidate-birth:n1' and e['fields'].get('field_availability', {}).get('selected') == 'unavailable: target retired')
        self.assertLess(birth, selection)
        self.assertLess(unavailable, retired)
        self.assertIsNone(state['objects']['candidate-birth:n1']['selected'])
        self.assertTrue(any(e['kind'] == 'observed' and e['fields']['data'] == dict(key='selected_node', value='n2') for e in events))

    def test_future_fence_selection_target_cannot_rewrite_an_earlier_prefix(self):
        inputs, capture, add = fixture()
        rows = capture['batches'][0]['events']
        rows.insert(-2, dict(kind='semantic.field', target='n1', data=dict(key='selected_node', value='later')))
        for seq, event in enumerate(rows, 1): event['seq'] = seq
        prefix = deepcopy(capture)
        add('node.create', 'later', parent='n1', tag='$button')
        add('semantic.role', 'later', role='button', source='', constructor=True)
        add('trace.checkpoint', op=3, action=1, checkpoint=2, nonce=3)
        inputs['checkpoints'].append(dict(id='later', after_action='launch'))
        capture['input_checkpoints'].append(dict(id='later', after_action='launch', checkpoint=2))
        output = project_capture(capture, inputs)
        self.assert_live_selection_history([event for point in output['checkpoints'] for event in point['state']['presentation']['events']])
        self.assertIsNone(output['checkpoints'][0]['state']['presentation']['objects']['candidate-birth:n1']['selected'])
        self.assertEqual(output['checkpoints'][1]['state']['presentation']['objects']['candidate-birth:n1']['selected'], 'candidate-birth:later')
        self.assertEqual(project_capture(prefix, dict(inputs, checkpoints=inputs['checkpoints'][:1]))['checkpoints'][0], output['checkpoints'][0])

    def test_media_specific_unknown_disposition_survives_birth_control_and_retirement(self):
        inputs, capture, _ = fixture()
        rows = capture['batches'][0]['events']
        rows[-2:-2] = [dict(kind='media.create', target='m1', data=dict(type='audio', source='synthetic.wav')),
                       dict(kind='media.control', target='m1', data=dict(evidence='request', volume=.5)),
                       dict(kind='media.destroy', target='m1', data=dict(evidence='request'))]
        for seq, event in enumerate(rows, 1): event['seq'] = seq
        output = project_capture(capture, inputs)
        observations = output['checkpoints'][0]['state']['presentation']['events']
        media = [e['fields'] for e in observations if e['kind'] == 'observed' and e['fields']['kind'].startswith('media.')]
        self.assertEqual([e['disposition'] for e in media], ['unknown-media'] * 3)
        self.assertEqual(output['diagnostics']['unknown_inventory']['m1']['source']['source'], 'synthetic.wav')

    def test_control_fields_use_explicit_mapping_and_actual_edit_state(self):
        inputs,capture,_=fixture();out=project_capture(capture,inputs)
        state=out['checkpoints'][0]['state']['presentation'];objects=state['objects']
        self.assertEqual(objects['candidate-birth:n2']['text'],'CONFIRM')
        self.assertEqual(objects['candidate-birth:n4']['value'],'ABC')
        self.assertIsNone(objects['candidate-birth:n4']['text'])
        choices=objects['candidate-birth:n6']
        self.assertEqual([x['key'] for x in choices['items']],['distinct-a','distinct-b'])
        self.assertEqual([x['label'] for x in choices['items']],['Duplicate label']*2)
        self.assertEqual(choices['selected'],'distinct-b')
        self.assertIn('candidate-birth:n7',objects);self.assertIn('candidate-birth:n8',objects)
        self.assertEqual(objects['candidate-birth:n7']['parent'],'candidate-birth:n6')
        self.assertNotIn('candidate-birth:n3',objects);self.assertNotIn('candidate-birth:n5',objects)
        self.assertTrue(all(x['enabled'] is None for x in objects.values()))
        validate_output(out,inputs)

    def test_unknown_transients_and_text_probes_are_retained_and_incomplete(self):
        inputs,capture,_=fixture();out=project_capture(capture,inputs)
        diagnostics=out['diagnostics'];unknown=diagnostics['unknown_inventory']
        self.assertEqual(set(unknown),{'n9','n10'})
        self.assertIsInstance(unknown['n9']['retirement_sequence'],int)
        observations=[e for e in out['checkpoints'][0]['state']['presentation']['events'] if e['kind']=='observed']
        self.assertEqual(len(observations),len(capture['batches'][0]['events']))
        self.assertEqual([e['fields']['raw_sequence'] for e in observations],list(range(1,len(observations)+1)))
        self.assertTrue(all(not x for x in out['checkpoints'][0]['coverage'].values()))

    def test_raw_drain_partition_does_not_change_projection(self):
        inputs,capture,_=fixture();expected=project_capture(capture,inputs);rows=capture['batches'][0]['events']
        for size in (1,2,5,17):
            split=deepcopy(capture);split['batches']=[dict(enabled=True,dropped=0,events=rows[i:i+size]) for i in range(0,len(rows),size)]
            self.assertEqual(project_capture(split,inputs),expected)

    def test_missing_protocol_and_future_checkpoint_fields_cannot_be_used(self):
        inputs,capture,_=fixture();capture['batches'][0]['events'][0]['kind']='trace.protocol'
        with self.assertRaisesRegex(ProtocolError,'without protocol'):
            project_capture(capture,inputs)

    def test_geometry_native_bounds_are_separate_from_local_visibility(self):
        inputs,capture,_=fixture();rows=capture['batches'][0]['events'];rows.insert(-2,dict(kind='semantic.geometry',target='n2',data=dict(area='layout',left=8,top=9,right=20,bottom=25,zindex=.5)))
        for seq,e in enumerate(rows,1):e['seq']=seq
        out=project_capture(capture,inputs);obj=out['checkpoints'][0]['state']['presentation']['objects']['candidate-birth:n2']
        self.assertEqual(obj['geometry']['layout']['left'],8)
        self.assertFalse(obj['visible_local']);self.assertFalse(obj['mounted'])

    def test_unchanged_native_geometry_keeps_raw_observations_without_semantic_noops(self):
        inputs,capture,_=fixture();rows=capture['batches'][0]['events']
        layout=dict(area='layout',left=8,top=9,right=20,bottom=25,zindex=.5)
        effective=dict(area='effective',left=8,top=9,right=24,bottom=29,zindex=.5)
        snapshots=[layout,effective,layout,effective,dict(layout,left=10),effective]
        rows[-2:-2]=[dict(kind='semantic.geometry',target='n2',data=deepcopy(area)) for area in snapshots]
        for seq,event in enumerate(rows,1):event['seq']=seq
        output=project_capture(capture,inputs)
        state=output['checkpoints'][0]['state']['presentation']
        geometry_updates=[event for event in state['events'] if event['object_id']=='candidate-birth:n2'
                          and event['kind']=='update' and 'geometry' in event['fields']]
        self.assertEqual(len(geometry_updates),3)
        self.assertEqual(state['objects']['candidate-birth:n2']['geometry']['layout']['left'],10)
        self.assertEqual(state['objects']['candidate-birth:n2']['geometry']['effective']['left'],8)
        geometry_observations=[event for event in state['events'] if event['kind']=='observed'
                               and event['fields']['kind']=='semantic.geometry']
        self.assertEqual(len(geometry_observations),len(snapshots))
        self.assertEqual(output['diagnostics']['observed_events'],len(rows))

    def test_shared_attachment_retains_mounted_state_after_one_edge_is_removed(self):
        inputs,capture,_=fixture();rows=capture['batches'][0]['events']
        edges=[dict(kind='node.attach',target='n4',data=dict(parent='n1')),
               dict(kind='node.attach',target='n4',data=dict(parent='n2')),
               dict(kind='node.detach',target='n4',data=dict(parent='n2'))]
        rows[-2:-2]=edges
        for seq,event in enumerate(rows,1):event['seq']=seq
        output=project_capture(capture,inputs)
        state=output['checkpoints'][0]['state']['presentation']
        self.assertTrue(state['objects']['candidate-birth:n4']['mounted'])
        observed=[event for event in state['events'] if event['kind']=='observed'
                  and event['object_id']=='candidate-birth:n4'
                  and event['fields']['kind'] in ('node.attach','node.detach')]
        self.assertEqual(len(observed),3)

    def test_select_choice_popup_keeps_typed_inventory_and_explicit_logical_parent(self):
        inputs,capture,_=fixture();rows=capture['batches'][0]['events']
        birth=next(i for i,event in enumerate(rows) if event['kind']=='node.create' and event['target']=='n6')
        rows.insert(birth+1,dict(kind='semantic.part',target='n6',data=dict(owner='n2',relation='choice-popup')))
        for seq,event in enumerate(rows,1):event['seq']=seq
        output=project_capture(capture,inputs);objects=output['checkpoints'][0]['state']['presentation']['objects']
        popup=objects['candidate-birth:n6']
        self.assertEqual(popup['role'],'choice-list')
        self.assertEqual(popup['parent'],'candidate-birth:n2')
        self.assertEqual([item['key'] for item in popup['items']],['distinct-a','distinct-b'])
        self.assertEqual(popup['selected'],'distinct-b')
        self.assertEqual(objects['candidate-birth:n7']['parent'],'candidate-birth:n6')
        self.assertEqual(output['diagnostics']['dispositions']['n6']['disposition'],'logical')
        self.assertEqual(output['diagnostics']['dispositions']['n6']['native_parent'],'n1')

    def test_editor_stored_request_is_not_an_actual_native_state_transition(self):
        inputs,capture,_=fixture();rows=capture['batches'][0]['events']
        rows.insert(-2,dict(kind='node.property',target='n4',data=dict(key='value',value='ABCD')))
        for seq,event in enumerate(rows,1):event['seq']=seq
        output=project_capture(capture,inputs)
        editor=output['checkpoints'][0]['state']['presentation']['objects']['candidate-birth:n4']
        self.assertEqual(editor['value'],'ABC')
        self.assertTrue(any(event['fields'].get('data')==dict(key='value',value='ABCD')
                            for event in output['checkpoints'][0]['state']['presentation']['events'] if event['kind']=='observed'))

    def test_late_editor_registration_uses_native_cache_after_untrusted_stores(self):
        inputs,capture,add=fixture();rows=capture['batches'][0]['events']
        rows[:]=[event for event in rows if not(event['target']=='n4' and event['kind']=='semantic.role')]
        rows.insert(-2,dict(kind='semantic.field',target='n4',data=dict(key='max_length',value=3)))
        for seq,event in enumerate(rows,1):event['seq']=seq
        inputs['checkpoints'].append(dict(id='later',after_action='launch'))
        add('node.property','n4',key='value',value='ABCD')
        add('node.property','n4',key='max_length',value=-1)
        add('semantic.role','n4',role='text-editor',source='actual-late-registration')
        add('trace.checkpoint',op=3,action=1,checkpoint=2,nonce=3)
        capture['input_checkpoints'].append(dict(id='later',after_action='launch',checkpoint=2))
        output=project_capture(capture,inputs)
        self.assertNotIn('candidate-birth:n4',output['checkpoints'][0]['state']['presentation']['objects'])
        editor=output['checkpoints'][1]['state']['presentation']['objects']['candidate-birth:n4']
        self.assertEqual(editor['value'],'ABC')
        self.assertEqual(editor['max_length'],3)

    def test_editor_without_native_fields_keeps_stored_request_unavailable(self):
        inputs,capture,_=fixture();rows=capture['batches'][0]['events']
        rows[:]=[event for event in rows if not(event['target']=='n4' and event['kind']=='semantic.field')]
        rows.insert(-2,dict(kind='node.property',target='n4',data=dict(key='value',value='requested')))
        for seq,event in enumerate(rows,1):event['seq']=seq
        output=project_capture(capture,inputs)
        editor=output['checkpoints'][0]['state']['presentation']['objects']['candidate-birth:n4']
        self.assertIsNone(editor['value'])
        self.assertEqual(editor['field_availability']['value'],'unavailable until native editor state')

    def test_choice_snapshot_publishes_complete_membership_once_before_selection(self):
        inputs,capture,_=fixture();output=project_capture(capture,inputs)
        events=output['checkpoints'][0]['state']['presentation']['events']
        updates=[event for event in events if event['object_id']=='candidate-birth:n6' and event['kind']=='update']
        membership=[event for event in updates if 'items' in event['fields']]
        selection=[event for event in updates if 'selected' in event['fields']]
        self.assertEqual([len(event['fields']['items']) for event in membership],[2])
        self.assertLess(membership[0]['seq'],selection[0]['seq'])
        self.assertEqual(output['diagnostics']['observed_events'],len(capture['batches'][0]['events']))

    def test_invalid_choice_snapshot_framing_and_retired_incomplete_snapshot_fail(self):
        for corruption in ('missing-header','overrun','restart','incomplete','retired-incomplete'):
            with self.subTest(corruption=corruption):
                inputs,capture,_=fixture();rows=capture['batches'][0]['events']
                first=next(i for i,event in enumerate(rows) if event['kind']=='semantic.choice')
                if corruption=='missing-header':
                    rows[:]=[event for event in rows if event['kind']!='semantic.choices']
                elif corruption=='overrun':
                    rows.insert(-2,dict(kind='semantic.choice',target='n6',data=dict(key='extra',label='Extra',index=2,node='n7')))
                elif corruption=='restart':
                    rows.insert(first+1,dict(kind='semantic.choices',target='n6',data=dict(count=2)))
                else:
                    rows[:]=[event for event in rows if not(event['kind']=='semantic.choice' and event['data']['index']==1)]
                    if corruption=='retired-incomplete':
                        rows[-2:-2]=[dict(kind='node.destroy',target=target,data={}) for target in ('n7','n8','n6')]
                for seq,event in enumerate(rows,1):event['seq']=seq
                with self.assertRaisesRegex(ProtocolError,'choice'):
                    project_capture(capture,inputs)

    def test_zero_choice_snapshot_publishes_actual_clear_immediately(self):
        inputs,capture,_=fixture();rows=capture['batches'][0]['events']
        rows[-2:-2]=[dict(kind='node.destroy',target=target,data={}) for target in ('n7','n8')]+[
            dict(kind='semantic.choices',target='n6',data=dict(count=0)),
            dict(kind='semantic.field',target='n6',data=dict(key='selected',value=None))]
        for seq,event in enumerate(rows,1):event['seq']=seq
        output=project_capture(capture,inputs);state=output['checkpoints'][0]['state']['presentation']
        self.assert_live_choice_history(state['events'])
        self.assertEqual(state['objects']['candidate-birth:n6']['items'],[])
        self.assertIsNone(state['objects']['candidate-birth:n6']['selected'])
        membership=[event['fields']['items'] for event in state['events'] if event['object_id']=='candidate-birth:n6'
                    and event['kind']=='update' and 'items' in event['fields']]
        self.assertEqual([len(items) if items is not None else None for items in membership],[2,None,0])

    def test_late_choice_registration_uses_only_last_complete_membership_cache(self):
        inputs,capture,add=fixture();rows=capture['batches'][0]['events']
        rows[:]=[event for event in rows if not(event['target']=='n6' and event['kind']=='semantic.role')]
        for seq,event in enumerate(rows,1):event['seq']=seq
        inputs['checkpoints'].append(dict(id='later',after_action='launch'))
        add('semantic.choices','n6',count=2)
        add('semantic.choice','n6',key='distinct-a',label='Duplicate label',index=0,node='n7')
        add('semantic.role','n6',role='choice-list',source='actual-late-choice-registration')
        add('semantic.choice','n6',key='distinct-b',label='Duplicate label',index=1,node='n8')
        add('semantic.field','n6',key='selected',value='distinct-b')
        add('trace.checkpoint',op=3,action=1,checkpoint=2,nonce=3)
        capture['input_checkpoints'].append(dict(id='later',after_action='launch',checkpoint=2))
        output=project_capture(capture,inputs)
        self.assertNotIn('candidate-birth:n6',output['checkpoints'][0]['state']['presentation']['objects'])
        events=output['checkpoints'][1]['state']['presentation']['events']
        membership=[event['fields']['items'] for event in events if event['object_id']=='candidate-birth:n6'
                    and event['kind']=='update' and 'items' in event['fields']]
        self.assertEqual([len(items) for items in membership],[2])
        self.assertEqual([item['key'] for item in membership[0]],['distinct-a','distinct-b'])

    def test_pinned_metadata_is_not_an_identity_or_role_source(self):
        inputs,capture,_=fixture();out=project_capture(capture,inputs)
        self.assertTrue(out['diagnostics']['candidate_birth_identity_only'])
        self.assertFalse(out['diagnostics']['cross_engine_correspondence'])
        self.assertEqual(set(out['diagnostics']['dispositions']),{'n'+str(i) for i in range(1,11)})


    def test_logical_owner_born_later_in_fence_never_has_a_forward_birth_reference(self):
        inputs,capture,_=fixture();rows=capture['batches'][0]['events']
        extras=[dict(kind='node.create',target='n11',data=dict(parent='n1',tag='$choicelist')),
                dict(kind='semantic.role',target='n11',data=dict(role='choice-list',source='actual',constructor=False)),
                dict(kind='semantic.part',target='n2',data=dict(owner='n11',relation='choice-item'))]
        rows[-2:-2]=extras
        for seq,e in enumerate(rows,1):e['seq']=seq
        output=project_capture(capture,inputs);events=output['checkpoints'][0]['state']['presentation']['events']
        owner_birth=next(e['seq'] for e in events if e['kind']=='create' and e['object_id']=='candidate-birth:n11')
        child_birth=next(e for e in events if e['kind']=='create' and e['object_id']=='candidate-birth:n2')
        self.assertIsNone(child_birth['fields']['parent'])
        references=[e for e in events if e['object_id']=='candidate-birth:n2' and e['fields'].get('parent')=='candidate-birth:n11']
        self.assertTrue(references);self.assertTrue(all(e['seq']>owner_birth for e in references))

    def test_later_fence_role_registration_preserves_earlier_unknown_and_prefix(self):
        inputs,capture,add=fixture();prefix=deepcopy(capture)
        inputs['checkpoints'].append(dict(id='later',after_action='launch'))
        add('semantic.role','n10',role='text',source='explicit-producer')
        add('node.property','n10',key='rendered_text',value='Actual later text')
        add('trace.checkpoint',op=3,action=1,checkpoint=2,nonce=3)
        capture['input_checkpoints'].append(dict(id='later',after_action='launch',checkpoint=2))
        result=project_capture(capture,inputs)
        first=result['checkpoints'][0]['state']['presentation']
        second=result['checkpoints'][1]['state']['presentation']
        self.assertNotIn('candidate-birth:n10',first['objects'])
        self.assertEqual(second['objects']['candidate-birth:n10']['text'],'Actual later text')
        self.assertEqual(project_capture(prefix,dict(inputs,checkpoints=inputs['checkpoints'][:1]))['checkpoints'][0],result['checkpoints'][0])
        history=result['diagnostics']['dispositions']['n10']['classification_history']
        self.assertEqual(history[0]['previous'],'unknown')

    def test_role_refinements_follow_the_actual_order_without_rebirth(self):
        inputs,capture,_=fixture();rows=capture['batches'][0]['events']
        rows.insert(-2,dict(kind='semantic.role',target='n2',data=dict(role='menu-entry',source='actual-entry',constructor=False)))
        for seq,e in enumerate(rows,1):e['seq']=seq
        events=project_capture(capture,inputs)['checkpoints'][0]['state']['presentation']['events']
        control=[e for e in events if e['object_id']=='candidate-birth:n2' and e['kind'] in ('create','update')]
        self.assertEqual([e['kind'] for e in control].count('create'),1)
        self.assertEqual(control[0]['fields']['role'],'button')
        self.assertEqual(control[-1]['fields']['role'],'menu-entry')

    def test_retirement_requires_observed_focus_clear(self):
        inputs,capture,_=fixture();rows=capture['batches'][0]['events']
        extras=[dict(kind='ui.focus',target='ui',data=dict(node='n4')),
                dict(kind='node.destroy',target='n5',data={}),
                dict(kind='node.destroy',target='n4',data={})]
        rows[-2:-2]=extras
        for seq,e in enumerate(rows,1):e['seq']=seq
        with self.assertRaisesRegex(ProtocolError,'retirement while focused'):
            project_capture(capture,inputs)
        rows.insert(-4,dict(kind='ui.focus',target='ui',data=dict(node=None)))
        for seq,e in enumerate(rows,1):e['seq']=seq
        output=project_capture(capture,inputs)
        self.assertIsNone(output['checkpoints'][0]['state']['presentation']['focus'])

    def test_invalid_input_attribution_stays_incomplete_and_is_retained(self):
        inputs,capture,_=fixture();capture['input_attribution']=dict(complete=False,gaps=['native/browser mismatch'])
        output=project_capture(capture,inputs)
        self.assertEqual(output['diagnostics']['input_attribution'],capture['input_attribution'])
        self.assertTrue(all(not value for value in output['checkpoints'][0]['coverage'].values()))

    def test_media_and_post_checkpoint_transients_have_total_dispositions(self):
        inputs,capture,add=fixture()
        add('node.create','n11',parent='n1',tag='$late-unexpected')
        add('node.destroy','n11')
        add('media.create','m1',type='audio',source='unclassified.wav')
        add('media.destroy','m1',evidence='request')
        output=project_capture(capture,inputs);diagnostics=output['diagnostics']
        for target in ('n11','m1'):
            self.assertIsInstance(diagnostics['unknown_inventory'][target]['retirement_sequence'],int)
        tail=diagnostics['tail_presentation']['events']
        self.assertEqual(len(tail),4)
        self.assertEqual(diagnostics['source_final_sequence'],len(capture['batches'][0]['events']))

if __name__=='__main__':unittest.main()
