# Terrain and movement application coverage

Eight additional scenarios exercise production GSE event handlers and the native
map/unit state in two existing catalogued suites. No production implementation,
original observations, catalog membership or lane assignment changes.

## Added behavior

- Two live owners finish Road and Farm work on separate tiles, then undo the
  earlier completion before the later one. The other worker, its completed
  improvement and recorded builder survive the first undo; both undos restore
  the complete observed fixture.
- Three foreign Farm/Mine/Road requests fail validation and application without
  changing either owner, any unit, terrain or native inspection state. The same
  live unit/action still validates for its actual owner.
- A completed work receipt rejects a later improvement or builder-ownership
  patch before any actor/terrain restoration. Undoing the later patch makes the
  original completed receipt usable again.
- Relocating a worker with cancelled location-bound work abandons its earned
  work. Ordinary movement undo restores the cancelled job and movement budget;
  resuming and undoing the resumed work also restores the observed prestate.
- Movement undo restores the original quoted budget while preserving a later
  independent road removal. It neither charges a newly changed traversal cost
  nor erases the terrain transaction; undoing that transaction restores the
  complete fixture.

`_terrain_movement_observation.gls.js` captures detached public observations of
both actual fixture participants, every native unit, the turn, serialized native
fixture state and the complete terrain snapshot. Player observations include
turn completion, energy, selected research and science. Unit observations include
position, definition, movement, health, morale, orders, work, automation, home and
recovery. Tests also inspect the target improvement and construction owner.

## Reproducible validation (2026-11-11)

Base: `c0160cea41c091d659ffe0248c0d532f36bc8a01`, including the SDK completion
ordering repair. The immutable headless engine is the `behavior-engine` artifact
from [PR #53 run 43015901038](https://github.com/pawelchcki/wasmsmac/actions/runs/43015901038).
Its provenance is separate from the current host script inputs:

| Input | SHA-256 |
| --- | --- |
| `GLSMAC.js` | `469a240495f2945052b4fdb6eacc7d72c27231ac68bbf8f323e3d9dcce18750b` |
| `GLSMAC.wasm` | `c75880a5ad8baf7a6e2f8194fde8679cb150f83a45a93b8ca18d56bc073b1f35` |
| `terraforming_primitives.gls.js` | `88fe164f0573196e4e806e778761d062923b2deabe6f6d9456dae6a1b86ee298` |
| `former_movement.gls.js` | `d3a466e6624f410fb3d296686f15d85a83a8cab015d67254232a95a55af461e9` |
| `_terrain_movement_observation.gls.js` | `f46b8e8bb3aa4d3bc6b51d1c8ef53d251528bd843ad9da3315dc5cda1e042730` |

Using Node 24.10.0, one worker and the runner's unchanged per-suite deadlines:

```sh
python3 tools/behavior-tests/fast.py --runtime /path/to/GLSMAC.js \
  --suite terraforming-primitives --suite former-movement \
  --suite former-first-tick --suite road-network --jobs 1 \
  --report build/terrain-movement-artifacts/focused.json
```

| Suite | Scenarios | Assertions |
| --- | ---: | ---: |
| terraforming-primitives | 32 | 224 |
| former-movement | 19 | 66 |
| former-first-tick | 6 | 22 |
| road-network | 17 | 176 |
| Total | 74 | 488 |

The focused two-suite check passed 51 scenarios/290 assertions. The four-suite
run passed in 28.37 seconds, with no failed iteration. Reports remain at
`/tmp/wasmsmac-coverage-terrain-focused-1.json` and
`/tmp/wasmsmac-coverage-terrain-focused-2.json` in the development session.
`.github/workflows/coverage-terrain-movement.yml` replays all four suites on
relevant PR heads, including the Stable suites that the ordinary Hot gate omits.
It uses the shared engine producer, requires its success, and retains the report.

## Limits

These are application regressions using authored terrain/action inputs, not new
original-game parity observations. Both actual participants in this fixture are
observed; this does not establish seven-player AI behavior. No renderer, widgets,
pointer hit testing, animation cadence, video, sound or music transitions are
exercised. The work fixtures use declared action rates and a technology waiver;
source/reference timing tests remain distinct. Passing these bounded checks
does not establish complete terrain, movement or game fidelity.
