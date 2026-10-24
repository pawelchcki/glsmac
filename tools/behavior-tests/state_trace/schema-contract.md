# State-trace schema contract v1 (FROZEN)

Algorithm: `game.state_trace.v1`. Generic scenario/state trace for SMAC
fidelity testing. This document freezes the wire schema. Adapters
(candidate and reference) implement to this text; the framework validates
exactly what is written here.

Envelope reuse: version-1 `protocol.py` case envelopes
(`{id, algorithm, input}`), observation records
(`{id, case_sha256, output}`) and `compare.py` evidence binding
(`suite_sha256`, `select_cases`, `capture_reference`, `differences`) are
reused unchanged. This contract adds only the `input`/`output` shapes for
`game.state_trace.v1` and the comparison/record rules for them.

## 1. Case input

`input` is an object with exactly these fields:

| Field | Type | Rule |
|---|---|---|
| `fixture` | object | Required, non-empty. Opaque to the framework (adapter-defined world setup), but see completeness rule below. |
| `actions` | array | Required, 1..256 entries, ordered. The bounded scenario script. |
| `checkpoints` | array | Optional. Declares the requested checkpoints (see section 3). |

Action entry: object with exactly `{id, kind}` plus optional `args`:

- `id`: non-empty string, `[A-Za-z0-9][A-Za-z0-9_.-]{0,127}`, unique
  within the case. `initial` is reserved for the checkpoint epoch and
  must not be used as an action id.
- `kind`: non-empty string, `[a-z0-9][a-z0-9_.-]{0,95}`. Adapter-defined
  action vocabulary (e.g. `end-turn`, `move-unit`).
- `args`: optional object (default `{}`), adapter-defined arguments.

### Fixture completeness rule (semantic, enforced by scenario authors)

A fixture must describe the COMPLETE initial world: every player
(including nonhuman/AI players), the map, and all initial units/bases.
A fixture that describes only human-visible state violates this contract.
Framework validation cannot see inside `fixture`, so reviewers must check
this per scenario. Consequences are observable: differing initial
rosters or positions are actionable mismatches (section 4), never a
reason to subset reference state.

## 2. Successful output

`output` for status `ok` is an object with exactly `{checkpoints}` plus
optional `diagnostics`:

- `checkpoints`: array, length fixed by section 3, ordered.
- `diagnostics`: optional free-form object. Runtime-specific IDs
  (pointers, engine handles, WASM addresses) belong here. `diagnostics`
  is EXCLUDED from comparison and never affects pass/fail.

Checkpoint entry: object with exactly `{id, after_action, state}` plus
optional `coverage`:

- `id`: non-empty string, same pattern as action IDs, unique within the
  output.
- `after_action`: `"initial"` or an action `id` from this case's input.
  Checkpoint order must follow action order monotonically (`"initial"`
  first, then non-decreasing action index; each action index used at
  most as many times as requested). A candidate sequence that reorders
  otherwise well-formed checkpoints is a comparison mismatch; a reference
  sequence that violates the requested plan is malformed evidence.
- `state`: object, the observed semantic state (section 3).
- `coverage`: optional object mapping domain names to `true`
  (observed) or `false` (not observed). Declared `false` domains never
  pass (section 4). Absent `coverage` means all required domains are
  claimed observed.

### 3. State shape

`state` is an object with exactly these required fields plus optional
extensible fields:

| Field | Type | Rule |
|---|---|---|
| `turn` | integer | Required. Actual native turn counter. |
| `map` | object | Required: `{width, height}`, positive integers. Actual dimensions. |
| `players` | array | Required, non-empty. Complete roster, ALL players. |
| `units` | array | Required. EVERY native unit (all owners, including offscreen/hidden). |
| `bases` | array | Required. EVERY native base (all owners). |

Optional extensible fields (`resources`, `research`, `tiles`, future
domains): objects when present. Presence is strict: present-vs-absent
between reference and candidate is a mismatch. Units explicitly stated.

Player entry: `{id}` plus optional extras (e.g. `faction`,
`is_human`). `id`: non-empty string, unique within the checkpoint.

Unit entry: `{id, owner, x, y, prototype}` plus optional extras
(e.g. `moves_remaining` integer, `order` string):

- `id`: stable LOGICAL identity, non-empty string, unique within the
  checkpoint, STABLE across checkpoints: a unit that moves keeps its
  `id`. Delete/create is reported as remove+add, never as an id change.
  Adapters must not re-key units per checkpoint (e.g. by coordinates).
- `owner`: a player `id` from this checkpoint's roster.
- `x`, `y`: integers (native coordinates).
- `prototype`: non-empty string (native unit type name).

Base entry: `{id, owner, x, y, population}` plus optional extras
(e.g. `resources`, `project`). Same identity/owner/coordinate rules;
`population`: integer.

### Declaring missing support honestly

An adapter that cannot observe a required domain (or a player subset,
e.g. only human-owned units) must NOT emit a partial array as if it
were complete. It must either omit the optional field, or declare the
gap in `coverage` (e.g. `{"units.opponent": false}`) or return status
`unsupported` for the case. Partial arrays presented as complete are
mismatches, not passes. Empty `units` matches only a truly empty
reference `units`.

## 4. Comparison (strict)

1. The reference must reproduce the declared checkpoint plan
   exactly (count, order, id and `after_action` per entry; without a
   declared plan, one checkpoint per action in action order). A
   reference that breaks the plan is malformed evidence (exit 2).
   Candidate checkpoints are compared against the reference in
   chronological order: dropped, added or reordered candidate
   checkpoints are mismatches naming the first divergent checkpoint.
   An unchanged final state never conceals an early divergence, and
   an early state divergence is never hidden by a later dropped
   checkpoint, id change or coverage gap.
2. Within a checkpoint, `units`/`bases`/`players` are matched by stable
   `id` (array order is insignificant and declared so here). Added or
   removed entities are mismatches (`missing`/`extra` with entity id).
   Duplicate entity or checkpoint IDs are malformed evidence (exit 2),
   as are unhashable or mistyped ids, `after_action` values and owners.
3. Field values compare with exact types and values (reuse of
   `compare.differences`: no coercion, no tolerances, `bool` distinct
   from `int`). The report gives the first divergent checkpoint, the
   JSON path of the first difference, and bounded per-domain
   differences (at most 20 per domain, 50 total); every difference
   carries its checkpoint id.
4. Any checkpoint with `coverage` marking a required domain `false`
   on either side, or any candidate result with status `unsupported`,
   is reported `unsupported` and never passes. A coverage gap on the
   reference side additionally fails recording and suite validation
   as malformed evidence (exit 2). Any observed value or structural
   divergence beats a coverage gap anywhere. Status `error` is an
   error.
5. `diagnostics` is ignored by comparison. Nothing else is ignored,
   sorted away or re-indexed to hide a difference.

## 5. Recording

Reference recording uses `compare.capture_reference` with `repeat=2`
default (2..10 allowed): two or more identical runs, otherwise no
evidence exists. Each observed output is strictly validated before it
is stored: it must reproduce the declared checkpoint plan exactly and
must not declare any coverage gap; invalid reference output aborts
recording (exit 2). Cases using an unknown algorithm are rejected
before recording, never stored. Input binding is exact: per-case
`case_sha256` and `suite_sha256` fingerprints; changed inputs require
re-recording. Reference outputs are never sent to the candidate
(`protocol.probe_request` strips them).

## 6. Runner protocol and exit codes

Both runners speak the `protocol.py` stdin/stdout JSON protocol. CLI:

- `run.py compare --cases SUITE --reference OBS --command CMD` runs the
  candidate once and compares. `--case ID` (repeatable) selects a
  scenario subset via `select_cases`, preserving evidence binding.
- `run.py record --cases SUITE --reference-command CMD --output FILE`
  captures repeated reference observations.

Exit codes: `0` complete agreement on all supported checkpoints,
`1` mismatch or unsupported, `2` malformed evidence or execution
error (bad schema, duplicate identity, crash, timeout, probe failure).

## 7. Report fields

Reports state what actually happened, without unearned claims:

- `candidate_executed`: `true` only after the candidate process actually
  started in this invocation (even if it then crashed or timed out),
  `false` when inputs, command parsing or process launch failed before
  a process started. A stale
  report is deleted before the probe attempt; a failed invocation
  replaces it with error evidence (`error` plus `candidate_executed`),
  so a failed run never leaves an old pass behind. Integrity-only
  validation reports `false` and claims no agreement.
- `candidate`/`reference`: the actual `implementation` identities
  returned by the runners where available (`name`, `kind`, plus
  `executable_sha256`/`adapter_version` for references).
- `duration_s`: measured candidate wall time (no synthetic speedups).
