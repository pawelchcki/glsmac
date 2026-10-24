"""Candidate birth-based projection of ordered native presentation observations.

No cross-engine correspondence or exhaustive semantic/media coverage is claimed.
Every raw event survives with an explicit disposition, including retired unknowns.
Native constructor roles and declared part ownership may be resolved through the
current fence, never beyond it. Script roles are processed at their own event.
"""
from copy import deepcopy
from collections import Counter

from protocol import ProtocolError
from state_trace.presentation import RawRecorder, SemanticRecorder
from state_trace.presentation_schema import validate_output

ROLES = {'container', 'window', 'dialog', 'button', 'text-editor', 'choice-list',
         'menu', 'menu-entry', 'paragraph', 'text'}
LOGICAL_RELATIONS = {'choice-item', 'choice-popup'}
# Embedded native parts have verified ownership, without guessing their human role.
PARTS = {'embedded', 'label', 'audio-support', 'editor-display', 'background',
         'border', 'blocker', 'body', 'header', 'title', 'decoration', 'layout-fragment'}


def project_capture(capture, case_input):
    raw = RawRecorder(max_events=1000000)
    for batch in capture['batches']:
        raw.ingest(batch)
    events = raw.checkpoint()['events']
    if not any(e['kind'] == 'semantic.protocol' for e in events):
        raise ProtocolError('semantic observer protocol absent; rebuild the candidate runtime')
    actions = case_input['actions']
    action_ids = {i + 1: action['id'] for i, action in enumerate(actions)}
    points = capture.get('input_checkpoints', [])
    if not points:
        raise ProtocolError('semantic projection requires acknowledged checkpoint watermarks')
    projector = Projector(action_ids)
    output = {'checkpoints': [], 'diagnostics': {}}
    offset = 0
    for point in points:
        # Each raw prefix is immutable at its native sequence, independent of drains.
        matching = [e for e in events if e['kind'] == 'trace.checkpoint'
                    and e['data']['checkpoint'] == point['checkpoint']]
        if len(matching) != 1:
            raise ProtocolError('missing/duplicate native checkpoint fence')
        boundary = matching[0]['seq']
        if type(boundary) is not int or boundary <= offset:
            raise ProtocolError('missing/nonmonotone semantic checkpoint native watermark')
        chunk = events[offset:boundary]
        if not chunk or chunk[-1]['seq'] != boundary or chunk[-1]['kind'] != 'trace.checkpoint':
            raise ProtocolError('semantic checkpoint watermark does not end at native fence')
        projector.ingest_interval(chunk)
        after = action_ids[chunk[-1]['data']['action']]
        output['checkpoints'].append({'id': point['id'], 'after_action': after,
            'state': {'presentation': projector.semantic.checkpoint()},
            'coverage': projector.semantic.checkpoint_coverage()})
        offset = boundary
    tail = events[offset:]
    if tail:
        projector.ingest_interval(tail)
    output['diagnostics'] = projector.diagnostics()
    output['diagnostics']['tail_presentation'] = projector.semantic.checkpoint()
    output['diagnostics'].update({'raw_tail': deepcopy(events[offset:]),
        'input_attribution': deepcopy(capture.get('input_attribution')),
        'candidate_birth_identity_only': True, 'cross_engine_correspondence': False,
        'prelaunch_history_observed': False,
        'geometry_effective_meaning': 'native expanded bounds including overflowing children; no pixel visibility or clipping claim'})
    validate_output(output, case_input)
    return output


class Projector:
    def __init__(self, action_ids):
        self.action_ids, self.after_input = action_ids, 'initial'
        self.semantic = SemanticRecorder()
        self.roles, self.parts, self.factories, self.nodes = {}, {}, {}, {}
        self.dispositions, self.observations = {}, []
        self.fields, self.native_fields, self.geometry, self.choice_items = {}, {}, {}, {}
        self.choice_pending = {}
        self.constructor_roles, self.selected_targets = {}, {}
        self.retired_native_ids = set()
        self.animations = set()
        self.raw_seq = 0

    @staticmethod
    def identity(target):
        return 'candidate-birth:' + target

    def logical(self, target):
        return target in self.roles and (target not in self.parts or self.parts[target]['relation'] in LOGICAL_RELATIONS)

    def owner(self, target):
        seen = set()
        while target in self.parts and not self.logical(target):
            if target in seen:
                raise ProtocolError('semantic part ownership cycle')
            seen.add(target)
            target = self.parts[target]['owner']
        return target if self.logical(target) else None

    def emit(self, domain, kind, target, fields):
        self.semantic.record({'seq': self.semantic.seq + 1, 'after_input': self.after_input,
            'domain': domain, 'kind': kind, 'object_id': self.identity(target), 'fields': fields})

    def domain(self, target):
        return 'windows' if self.roles[target]['role'] in ('window', 'dialog') else 'widgets'

    def update(self, target, fields):
        identity = self.identity(target)
        if identity in self.semantic.objects:
            current = self.semantic.objects[identity]
            changed = {key: value for key, value in fields.items() if key not in current or current[key] != value}
            if changed:
                self.emit(self.domain(target), 'update', target, changed)

    def verified_update(self, target, fields, evidence):
        identity = self.identity(target)
        if identity not in self.semantic.objects:
            return
        availability = deepcopy(self.semantic.objects[identity]['field_availability'])
        availability.update({key: evidence for key in fields})
        self.update(target, {**fields, 'field_availability': availability})

    def ingest_interval(self, events):
        # Only explicit native constructor registrations can establish a new
        # birth's initialized type. Later script annotations remain ordered.
        self.constructor_roles = {}
        # Resolve only explicit ownership evidence available through this fence.
        for event in events:
            target, kind, data = (event[k] for k in ('target', 'kind', 'data'))
            if kind == 'semantic.role' and data['role'] in ROLES:
                if data['constructor'] and target not in self.nodes:
                    self.constructor_roles[target] = deepcopy(data)
            elif kind == 'semantic.part':
                if data['relation'] not in PARTS | LOGICAL_RELATIONS:
                    continue
                self.parts[target] = deepcopy(data)
            elif kind == 'semantic.factory':
                self.factories[target] = deepcopy(data)
        self.roles.update(self.constructor_roles)
        for event in events:
            if event['seq'] != self.raw_seq + 1:
                raise ProtocolError('semantic source sequence gap')
            self.raw_seq = event['seq']
            self.record(event)
        if self.choice_pending:
            raise ProtocolError('incomplete native choice snapshot at fence')

    def parent(self, target):
        native_parent = self.factories.get(target, {}).get('owner', self.nodes[target]['parent'])
        if self.parts.get(target, {}).get('relation') in LOGICAL_RELATIONS:
            native_parent = self.parts[target]['owner']
        owner = self.owner(native_parent)
        return self.identity(owner) if owner and self.identity(owner) in self.semantic.objects else None

    def create_logical(self, target):
        role = self.roles[target]['role']
        self.emit(self.domain(target), 'create', target, {'role': role,
            'parent': self.parent(target), 'source': self.roles[target].get('source') or None,
            'text': None, 'value': None, 'items': None, 'selected': None,
            'enabled': None, 'visible_local': False, 'mounted': False, 'geometry': None,
            'field_availability': {'enabled': 'unavailable: native controls define no enabled gate',
                'text': 'unavailable until verified producer/label/full paragraph',
                'value': 'unavailable until native editor state',
                'items': 'unavailable until native choice membership',
                'selected': 'unavailable until native selection',
                'geometry': 'unavailable until actual native area observation',
                'visible_local': 'native local visibility; no pixel visibility claim',
                'parent': 'explicit factory/native direct logical owner or verified part mapping',
                'media': 'unclassified', 'cross_engine_identity': 'unimplemented'}})
        known = self.fields.get(target, {})
        native = self.native_fields.get(target, {})
        values = {}
        if role == 'text-editor':
            values.update({key: native[key] for key in ('value', 'max_length') if key in native})
        if role == 'text' and 'rendered_text' in known:
            values['text'] = known['rendered_text']
        if 'full_text' in native:
            values['text'] = native['full_text']
        if 'selected' in native:
            values['selected'] = native['selected']
        if target in self.geometry:
            values['geometry'] = {'coordinates': 'native-ui-absolute', **deepcopy(self.geometry[target])}
        values.update({key: self.nodes[target][key] for key in ('visible_local', 'mounted') if key in self.nodes[target]})
        if values:
            self.verified_update(target, values, 'current previously observed fields at actual registration')
        self.reconcile_parents()
        self.reconcile_selections()
        self.reconcile_choices()

    def reconcile_parents(self):
        for target in self.nodes:
            identity = self.identity(target)
            if identity not in self.semantic.objects:
                continue
            parent = self.parent(target)
            if self.semantic.objects[identity]['parent'] != parent:
                self.update(target, {'parent': parent})

    def reconcile_selections(self):
        # Keep the native cached ID in raw observations. An unavailable logical
        # reference does not claim that native code deselected that ID.
        for owner, target in self.selected_targets.items():
            if self.identity(owner) not in self.semantic.objects:
                continue
            retired = target is not None and self.dispositions.get(target, {}).get('retirement_sequence') is not None
            if retired:
                value, evidence = None, 'unavailable: target retired'
            elif target is None:
                value, evidence = None, 'actual native selected_node null'
            elif self.identity(target) in self.semantic.objects:
                value, evidence = self.identity(target), 'actual native live logical selection target'
            else:
                value, evidence = None, 'unavailable: selection target not yet a live logical control'
            self.verified_update(owner, {'selected': value}, evidence)

    def reconcile_choices(self):
        # Preserve the last complete native snapshot. Missing live controls
        # make its logical references unavailable, never an invented empty list.
        for owner, items in self.choice_items.items():
            if self.identity(owner) not in self.semantic.objects:
                continue
            controls = [item['control'] for item in items]
            if any(control in self.retired_native_ids for control in controls):
                value, evidence = None, 'unavailable: choice control retired'
            elif any(control not in self.semantic.objects for control in controls):
                value, evidence = None, 'unavailable: choice control not yet live'
            else:
                value, evidence = deepcopy(items), 'actual native ordered typed choice membership'
            self.verified_update(owner, {'items': value}, evidence)

    def record(self, event):
        target, kind, data = (event[k] for k in ('target', 'kind', 'data'))
        if kind == 'trace.action':
            self.after_input = self.action_ids[data['action']]
        disposition = 'diagnostic'
        if kind == 'node.create':
            self.nodes[target] = deepcopy(data)
            category = 'logical' if self.logical(target) else 'part' if target in self.parts else 'unknown'
            self.dispositions[target] = {'disposition': category, 'birth_sequence': event['seq'],
                'retirement_sequence': None, 'native_parent': data['parent'], 'tag': data['tag'],
                'mapping': deepcopy(self.parts.get(target)), 'role': deepcopy(self.roles.get(target)),
                'factory': deepcopy(self.factories.get(target))}
            self.fields[target] = {}
            if category == 'logical':
                self.create_logical(target)
        elif kind == 'node.destroy':
            self.dispositions[target]['retirement_sequence'] = event['seq']
            self.retired_native_ids.add(self.identity(target))
            self.reconcile_selections()
            self.reconcile_choices()
            if self.identity(target) in self.semantic.objects:
                self.emit(self.domain(target), 'destroy', target, {})
            self.nodes.pop(target)
            self.selected_targets.pop(target, None)
            self.choice_items.pop(target, None)
            self.reconcile_parents()
        elif kind in ('node.show', 'node.hide'):
            self.nodes[target]['visible_local'] = kind == 'node.show'
            self.update(target, {'visible_local': kind == 'node.show'})
        elif kind in ('node.attach', 'node.detach'):
            parents = self.nodes[target].setdefault('attachment_parents', [])
            if kind == 'node.attach' and data['parent'] not in parents:
                parents.append(data['parent'])
            elif kind == 'node.detach':
                parents.remove(data['parent'])
            self.nodes[target]['mounted'] = bool(parents)
            self.update(target, {'mounted': bool(parents)})
        elif kind == 'semantic.role':
            if data['role'] in ROLES:
                # Fold only proven constructor initialization, retaining every
                # provisional raw role. Annotations are never folded forward.
                role = self.constructor_roles[target] if data['constructor'] and target in self.constructor_roles else data
                self.roles[target] = deepcopy(role)
                if self.logical(target) and target in self.nodes:
                    if self.identity(target) not in self.semantic.objects:
                        self.create_logical(target)
                        disposition_record = self.dispositions[target]
                        disposition_record.setdefault('classification_history', []).append({
                            'sequence': event['seq'], 'previous': disposition_record['disposition'], 'current': 'logical'})
                        disposition_record['disposition'] = 'logical'
                    self.update(target, {'role': role['role'], 'source': role.get('source') or None})
                    self.dispositions[target]['role'] = deepcopy(role)
                self.reconcile_selections()
                self.reconcile_choices()
            else:
                disposition = 'unknown-role'
        elif kind in ('semantic.part', 'semantic.factory'):
            if kind == 'semantic.part':
                record = self.dispositions[target]
                if record['disposition'] == 'unknown' and data['relation'] in PARTS:
                    record.setdefault('classification_history', []).append({
                        'sequence': event['seq'], 'previous': 'unknown', 'current': 'part'})
                    record['disposition'] = 'part'
                if self.identity(target) in self.semantic.objects and not self.logical(target):
                    # An already-published logical lifetime cannot silently vanish.
                    disposition = 'unknown-late-part-refinement'
                record['mapping'] = deepcopy(data)
            self.reconcile_parents()
        elif kind == 'media.create':
            animation = data['type'] == 'animation'
            self.dispositions[target] = {'disposition': 'logical' if animation else 'unknown', 'type': 'media',
                'birth_sequence': event['seq'], 'retirement_sequence': None, 'source': deepcopy(data)}
            if animation:
                self.animations.add(target)
                self.emit('animation', 'create', target, {
                    'role': 'scene-animation', 'source': data['source'],
                    'duration_ms': data['duration_ms'], 'frame_count': data['frame_count'],
                    'coordinates': {key: data[key] for key in ('x', 'y', 'z')},
                    'history': data['history'], 'evidence': data['evidence'],
                    'lifecycle': 'registered', 'frame_index': None, 'scene_instance_id': None,
                    'evidence_scope': 'native scene instance submission; rendered pixels unobserved'})
                disposition = 'animation'
            else:
                disposition = 'unknown-media'
        elif kind == 'media.destroy':
            self.dispositions[target]['retirement_sequence'] = event['seq']
            if target in self.animations:
                self.emit('animation', 'destroy', target, {})
                disposition = 'animation'
            else:
                disposition = 'unknown-media'
        elif target in self.animations and kind.startswith('media.'):
            fields = deepcopy(data)
            if kind == 'media.frame':
                fields['lifecycle'] = 'frame-submitted' if data['present'] else 'frame-removed'
                if not data['present']:
                    fields.update(frame_index=None, scene_instance_id=None)
            else:
                fields['lifecycle'] = {'media.start': 'started', 'media.end': 'completed', 'media.stop': 'cancelled'}[kind]
            self.emit('animation', 'update', target, fields)
            disposition = 'animation'
        elif kind == 'semantic.geometry':
            self.geometry.setdefault(target, {})[data['area']] = {k: v for k, v in data.items() if k != 'area'}
            self.verified_update(target, {'geometry': {'coordinates': 'native-ui-absolute', **deepcopy(self.geometry[target])}}, 'actual native layout/expanded effective area')
        elif kind == 'semantic.choices':
            if target in self.choice_pending:
                raise ProtocolError('native choice snapshot restarted before completion')
            if data['count'] == 0:
                self.choice_items[target] = []
                self.reconcile_choices()
            else:
                self.choice_pending[target] = {'count': data['count'], 'items': []}
        elif kind == 'semantic.choice':
            if target not in self.choice_pending:
                raise ProtocolError('native choice row without snapshot header or after overrun')
            snapshot = self.choice_pending[target]
            items = snapshot['items']
            if data['index'] != len(items) or len(items) >= snapshot['count']:
                raise ProtocolError('unordered or excessive native choice membership')
            items.append({'key': data['key'], 'label': data['label'],
                          'control': self.identity(data['node']), 'key_type': 'string'})
            if len(items) == snapshot['count']:
                self.choice_items[target] = deepcopy(items)
                del self.choice_pending[target]
                self.reconcile_choices()
        elif kind in ('node.property', 'semantic.field'):
            key, value = data['key'], data['value']
            self.fields.setdefault(target, {})[key] = value
            if kind == 'semantic.field':
                self.native_fields.setdefault(target, {})[key] = value
                if key == 'selected_node':
                    self.selected_targets[target] = value
                    self.reconcile_selections()
            owner = self.owner(target)
            relation = self.parts.get(target, {}).get('relation')
            canonical = None
            if self.logical(target):
                if kind == 'semantic.field' and key == 'selected_node':
                    pass  # Published only by live-target reconciliation above.
                elif kind == 'semantic.field' and key in ('selected', 'full_text'):
                    canonical = 'text' if key == 'full_text' else key
                elif kind == 'semantic.field' and key in ('value', 'max_length') and self.roles[target]['role'] == 'text-editor':
                    canonical = key
                elif key == 'rendered_text' and self.roles[target]['role'] == 'text':
                    canonical = 'text'
            elif owner and relation in ('label', 'title') and key in ('rendered_text', 'text'):
                canonical = 'text' if key == 'rendered_text' else 'requested_text'
            if canonical:
                self.verified_update(owner or target, {canonical: value}, 'actual native field or explicit producer/part mapping')
            elif kind == 'semantic.field' and key == 'selected_node':
                pass  # The raw reference is understood even while unavailable.
            else:
                disposition = 'unknown-field'
        elif kind == 'ui.focus':
            owner = self.owner(data['node'])
            if data['node'] is None or (owner and self.identity(owner) in self.semantic.objects):
                self.emit('focus', 'change', owner or 'focus', {'node': self.identity(owner) if owner else None})
            else:
                disposition = 'unknown-focus'
        elif kind == 'ui.modal':
            # Native singleton is not a verified complete logical modal stack.
            disposition = 'unknown-modal-scope'
        elif kind == 'node.opaque' or kind.startswith('media.'):
            disposition = 'unknown-field' if kind == 'node.opaque' else 'unknown-media'
        elif kind.startswith('semantic.'):
            pass
        elif kind.startswith('input.'):
            disposition = 'input'
        elif kind.startswith('trace.'):
            disposition = 'action'
        if disposition == 'diagnostic' and target in self.dispositions and self.dispositions[target]['disposition'] == 'unknown':
            disposition = 'unknown-object'
        observation = {'raw_sequence': event['seq'], 'kind': kind,
                       'target': target, 'disposition': disposition, 'data': deepcopy(data)}
        self.observations.append(observation)
        domain = 'unknown' if disposition.startswith('unknown') else disposition if disposition in ('input', 'action') else 'diagnostic'
        self.emit(domain, 'observed', target, observation)

    def diagnostics(self):
        return {'schema': 'glsmac.presentation.projection.v1',
            'source_final_sequence': self.raw_seq,
            'dispositions': deepcopy(self.dispositions),
            'counts': dict(Counter(d['disposition'] for d in self.dispositions.values())),
            'observed_events': len(self.observations),
            'all_births_disposed': True, 'coverage_complete': False,
            'unknown_inventory': {k: deepcopy(v) for k, v in self.dispositions.items() if v['disposition'] == 'unknown'}}
