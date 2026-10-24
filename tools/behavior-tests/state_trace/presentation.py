"""Detached presentation-event recorder for candidate observer streams.

This is candidate invariant tooling, not original-game evidence. Every event
between checkpoints is retained; incomplete observation never implies absence.
"""
from copy import deepcopy
from math import isfinite

from protocol import ProtocolError

SCHEMA = 'glsmac.presentation.raw.v1'
CLOCK = {'kind': 'event-sequence', 'unit': 'event'}
# A channel is observed only when its producer is installed for the whole epoch.
DOMAINS = ('windows', 'widgets', 'focus', 'modal', 'animation.requests',
           'animation.frames', 'video.requests', 'video.frames',
           'sfx.requests', 'sfx.controls', 'music.requests', 'music.controls',
           'audio.mixer', 'audio.output', 'timing.controlled')


def _require(condition, reason):
    if not condition:
        raise ProtocolError('presentation: ' + reason)


def _primitive(value):
    return value is None or type(value) in (str, bool, int) or (type(value) is float and isfinite(value))


class RawRecorder:
    """Reduce a complete ordered native event stream into detached checkpoints.

    Native birth IDs are opaque logical strings. They are never rewritten from
    text/coordinates or compacted after deletion. Cross-engine correspondence
    belongs to the scenario's declared identity profile.
    """
    def __init__(self, coverage=None, max_events=500000):
        _require(type(max_events) is int and max_events > 0, 'invalid event bound')
        self.coverage = {name: False for name in DOMAINS}
        for name, observed in (coverage or {}).items():
            _require(name in self.coverage and type(observed) is bool, 'invalid coverage channel')
            self.coverage[name] = observed
        self.max_events = max_events
        self.nodes, self.media, self.seen = {}, {}, set()
        self.focus, self.modal_stack = None, []
        self.seq, self.events = 0, []

    def ingest(self, batch):
        """Accept a native drain; reject truncation, gaps and disabled observers."""
        _require(type(batch) is dict and set(batch) == {'enabled', 'dropped', 'events'}, 'invalid drain envelope')
        _require(batch['enabled'] is True, 'observer disabled')
        _require(type(batch['dropped']) is int and batch['dropped'] == 0, 'observer lost events')
        _require(type(batch['events']) is list, 'events must be an array')
        for event in batch['events']:
            self.record(event)

    def record(self, event):
        _require(type(event) is dict and set(event) == {'seq', 'target', 'kind', 'data'}, 'invalid event fields')
        _require(type(event['seq']) is int and event['seq'] == self.seq + 1, 'event sequence gap or reorder')
        _require(type(event['target']) is str and bool(event['target']), 'missing target identity')
        _require(type(event['kind']) is str, 'invalid event kind')
        _require(type(event['data']) is dict and all(type(k) is str and _primitive(v) for k, v in event['data'].items()), 'event data must contain finite primitives')
        _require(len(self.events) < self.max_events, 'checkpoint event bound exceeded')
        target, kind, data = event['target'], event['kind'], event['data']
        if kind == 'node.create':
            _require(target not in self.seen, 'birth identity reused')
            _require(set(data) == {'parent', 'tag'} and type(data['tag']) is str, 'invalid node birth')
            _require(data['parent'] is None or data['parent'] in self.nodes, 'missing parent')
            self.nodes[target] = {'id': target, 'parent': data['parent'], 'tag': data['tag'], 'visible': False, 'attached': False, 'mounted_parent': None, 'attachment_parents': [], 'properties': {}}
            self.seen.add(target)
        elif kind.startswith('node.'):
            _require(target in self.nodes, 'event for missing node')
            node = self.nodes[target]
            if kind == 'node.property':
                _require(set(data) == {'key', 'value'} and type(data['key']) is str, 'invalid property')
                node['properties'][data['key']] = data['value']
                node.get('opaque_properties', {}).pop(data['key'], None)
            elif kind == 'node.opaque':
                _require(set(data) == {'key', 'type'} and all(type(v) is str for v in data.values()), 'invalid opaque property')
                node.setdefault('opaque_properties', {})[data['key']] = data['type']
                node['properties'].pop(data['key'], None)
            elif kind == 'node.unset':
                _require(set(data) == {'key'} and type(data['key']) is str, 'invalid unset')
                node['properties'].pop(data['key'], None)
                node.get('opaque_properties', {}).pop(data['key'], None)
            elif kind in ('node.show', 'node.hide'):
                _require(not data, 'visibility event has unexpected data')
                node['visible'] = kind == 'node.show'
            elif kind == 'node.destroy':
                _require(not data and not any(n['parent'] == target for n in self.nodes.values()), 'destroyed node still has children')
                del self.nodes[target]
                if self.focus == target:
                    self.focus = None
                self.modal_stack = [item for item in self.modal_stack if item != target]
            elif kind in ('node.attach', 'node.detach'):
                _require(set(data) == {'parent'} and data['parent'] in self.nodes, 'invalid attachment parent')
                parents = node['attachment_parents']
                if kind == 'node.detach':
                    _require(data['parent'] in parents, 'detach differs from actual mounted parent')
                    parents.remove(data['parent'])
                elif data['parent'] not in parents:
                    parents.append(data['parent'])
                node['attached'] = bool(parents)
                node['mounted_parent'] = parents[-1] if parents else None
            elif kind == 'node.reparent':
                _require(set(data) == {'parent'} and (data['parent'] is None or data['parent'] in self.nodes), 'invalid parent')
                parent = data['parent']
                while parent is not None:
                    _require(parent != target, 'parent cycle')
                    parent = self.nodes[parent]['parent']
                node['parent'] = data['parent']
            else:
                _require(False, 'unknown node event ' + kind)
        elif kind in ('ui.focus', 'ui.modal'):
            _require(set(data) == {'node'} and (data['node'] is None or data['node'] in self.nodes), 'unknown UI target')
            if kind == 'ui.focus':
                self.focus = data['node']
            else:
                # The current native API exposes a singleton, not a guessed stack.
                self.modal_stack = [] if data['node'] is None else [data['node']]
        elif kind == 'media.create':
            _require(target not in self.seen, 'playback identity reused')
            _require(set(data) == {'type', 'source'} and all(type(x) is str and x for x in data.values()), 'invalid media birth')
            self.media[target] = {'id': target, **data, 'lifecycle': 'created', 'evidence': 'request'}
            self.seen.add(target)
        elif kind.startswith('media.'):
            _require(target in self.media, 'event for missing playback')
            _require(kind in ('media.request', 'media.start', 'media.frame', 'media.progress', 'media.end', 'media.stop', 'media.failure', 'media.loop', 'media.pause', 'media.volume', 'media.control', 'media.mute', 'media.destroy'), 'unknown media event ' + kind)
            _require(data.get('evidence') in ('request', 'mixer-buffer', 'device'), 'missing media evidence level')
            if kind == 'media.destroy':
                del self.media[target]
            else:
                self.media[target].update(data)
                self.media[target]['lifecycle'] = kind.removeprefix('media.')
        elif kind.startswith('semantic.'):
            layouts = {
                'semantic.protocol': {'version'}, 'semantic.role': {'role', 'source', 'constructor'},
                'semantic.part': {'owner', 'relation'}, 'semantic.factory': {'owner', 'factory'},
                'semantic.forward': {'target', 'source_property', 'target_property'},
                'semantic.field': {'key', 'value'},
                'semantic.geometry': {'area', 'left', 'top', 'right', 'bottom', 'zindex'},
                'semantic.choices': {'count'}, 'semantic.choice': {'key', 'label', 'index', 'node'}}
            _require(kind in layouts and set(data) == layouts[kind], 'unknown/malformed semantic diagnostic kind')
            if kind == 'semantic.protocol':
                _require(data == {'version': 2}, 'semantic observer protocol v2 required; rebuild candidate runtime')
                _require(not getattr(self, 'semantic_protocol', False), 'duplicate semantic diagnostic protocol')
                self.semantic_protocol = True
            else:
                _require(getattr(self, 'semantic_protocol', False) and target in self.nodes, 'semantic diagnostic without protocol/live node')
                if kind == 'semantic.role':
                    _require(type(data['role']) is str and type(data['source']) is str and type(data['constructor']) is bool, 'invalid native constructor provenance')
                elif kind == 'semantic.field':
                    _require(type(data['key']) is str and data['key'], 'invalid semantic field key')
                elif kind == 'semantic.geometry':
                    _require(data['area'] in ('layout', 'effective') and all(type(data[k]) in (int, float) for k in ('left', 'top', 'right', 'bottom', 'zindex')), 'invalid native geometry')
                elif kind == 'semantic.choices':
                    _require(type(data['count']) is int and data['count'] >= 0, 'invalid choice count')
                elif kind == 'semantic.choice':
                    _require(type(data['index']) is int and data['index'] >= 0 and all(type(data[k]) is str for k in ('key', 'label', 'node')), 'invalid choice item')
                else:
                    _require(all(type(value) is str for value in data.values()), 'invalid semantic registration fields')
        elif kind in ('trace.protocol', 'trace.action', 'trace.checkpoint', 'input.ingress', 'input.dispatch', 'input.disposition', 'input.filtered', 'input.ui-transition'):
            pass  # Ordered diagnostic ledger; independently validated by input reducer.
        elif kind == 'trace.error':
            _require(False, 'native input/action fence error')
        else:
            _require(False, 'unknown event ' + kind)
        self.seq = event['seq']
        self.events.append(deepcopy(event))

    def checkpoint(self):
        state = {'schema': SCHEMA, 'clock': deepcopy(CLOCK),
                 'nodes': deepcopy(self.nodes), 'media': deepcopy(self.media),
                 'focus': self.focus, 'modal_stack': deepcopy(self.modal_stack),
                 'events': deepcopy(self.events)}
        self.events.clear()
        return state

    def checkpoint_coverage(self):
        """Place these flags in checkpoint.coverage, where strict trace sees them."""
        return {'presentation.' + key: value for key, value in self.coverage.items()}


class SemanticRecorder:
    """Architecture-neutral semantic events, separate from raw engine mutation.

    The adapter must classify every semantic object and playback. Unmapped
    events are retained as unknown and set coverage false; they cannot vanish
    through a selector/expected-inventory filter. This recorder is reusable by
    both engines; no original presentation observation is currently available.
    """
    def __init__(self, coverage=None):
        self.coverage = {name: False for name in DOMAINS}
        for key, value in (coverage or {}).items():
            _require(key in self.coverage and type(value) is bool, 'invalid semantic coverage')
            self.coverage[key] = value
        self.objects, self.media, self.retired = {}, {}, set()
        self.events, self.seq = [], 0
        self.focus, self.modal_stack = None, []

    def record(self, event):
        _require(type(event) is dict and set(event) == {'seq', 'after_input', 'domain', 'kind', 'object_id', 'fields'}, 'invalid semantic event')
        _require(type(event['seq']) is int and event['seq'] == self.seq + 1, 'semantic sequence gap')
        _require(all(type(event[key]) is str and event[key] for key in ('after_input', 'domain', 'kind', 'object_id')), 'invalid semantic identity')
        _require(type(event['fields']) is dict, 'invalid semantic fields')
        domain, kind, target, fields = (event[key] for key in ('domain', 'kind', 'object_id', 'fields'))
        if domain == 'unknown':
            # Unknown UI/media may belong to any declared channel.
            # Conservatively invalidate every channel rather than hide it.
            self.coverage = {name: False for name in DOMAINS}
        elif domain in ('windows', 'widgets', 'animation', 'video', 'sfx', 'music'):
            # These are generic inventory operations. A future semantic profile
            # must explicitly define additional operations instead of silently
            # treating an unrecognized lifecycle event as an update.
            _require(kind in ('create', 'update', 'destroy'), 'unknown semantic inventory event must be explicit unknown')
            inventory = self.objects if domain in ('windows', 'widgets') else self.media
            if kind == 'create':
                _require(target not in self.objects and target not in self.media and target not in self.retired, 'semantic birth reused')
                inventory[target] = deepcopy(fields)
            elif kind == 'destroy':
                _require(target in inventory, 'semantic retirement without birth')
                _require(target != self.focus and target not in self.modal_stack, 'semantic retirement while focused or modal')
                del inventory[target]
                self.retired.add(target)
            else:
                _require(target in inventory, 'semantic update without birth')
                inventory[target].update(deepcopy(fields))
        elif domain in ('input', 'action', 'diagnostic'):
            _require(kind == 'observed', 'invalid observation operation')
        elif domain == 'focus':
            _require(kind == 'change' and fields.get('node') in (None, *self.objects), 'unknown semantic focus')
            self.focus = fields['node']
        elif domain == 'modal':
            _require(target in self.objects, 'unknown semantic modal')
            if kind == 'push':
                _require(target not in self.modal_stack, 'duplicate semantic modal')
                self.modal_stack.append(target)
            elif kind == 'pop':
                _require(bool(self.modal_stack) and self.modal_stack[-1] == target, 'semantic modal order')
                self.modal_stack.pop()
            else:
                _require(False, 'unknown semantic modal event')
        else:
            _require(False, 'unknown semantic domain must be explicit unknown')
        self.seq = event['seq']
        self.events.append(deepcopy(event))

    def checkpoint(self):
        result = {'schema': 'presentation.trace.v1', 'clock': deepcopy(CLOCK),
                  'objects': deepcopy(self.objects), 'media': deepcopy(self.media),
                  'focus': self.focus, 'modal_stack': deepcopy(self.modal_stack),
                  'events': deepcopy(self.events)}
        self.events.clear()
        return result

    def checkpoint_coverage(self):
        return {'presentation.' + key: observed for key, observed in self.coverage.items()}


# Compatibility for the native diagnostic stream; never a parity projection.
Recorder = RawRecorder
