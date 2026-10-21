# Saved-fixture reference capture

The four Python sources are byte-identical to the recorder used for the twelve
context observations. The recorded adapter fingerprint is
`9049714a00372454ab6515b73a1656298083c48979d8d14d3d8eb3a0eed15c06`.
`manifest.json` binds these sources and both untouched six-case recordings.
No original executable, Windows runtime or saved-game binary is committed.

The private save was created through the original Save dialog. Saving preserved
all native city/unit/year guards; fresh-process loading restored the same state.
Before broader capture, two independent saved-fixture runs reproduced every
checkpoint of the previous immutable Former/Hold record. Every subsequent case
restarted the original process and loaded that fixture; both six-case partitions
were independently recorded twice. All three prior pilot outputs are unchanged.
The combined record preserves twelve distinct inputs and 78 checkpoints.

The save is fixture transport, never cached answers. Its SHA-256 is
`cb3415774a80a98535f623682f4a43df58c4b37eba0786984c9e3bfbd3597f92`.
Native selection, unit/base identities, membership, ownership, health, movement,
orders, city resources and year remain guarded after each real control action.
Menu observations still read actual original pixels and native state.

The partition combiner validates complete, disjoint, identical input bindings,
original metadata and repeat counts. It copies observations unchanged and keeps
canonical source-record fingerprints in `reference.recording_partitions`.
From the repository root:

```sh
python3 tools/behavior-tests/combine_observations.py \
  --cases tools/behavior-tests/ui/cases/unit-menu-context.json \
  --part tools/behavior-tests/ui/reference-archives/unit-menu-context-saved-v26/recordings/former-cases.json tools/behavior-tests/ui/reference-archives/unit-menu-context-saved-v26/recordings/former-observations.json \
  --part tools/behavior-tests/ui/reference-archives/unit-menu-context-saved-v26/recordings/colony-cases.json tools/behavior-tests/ui/reference-archives/unit-menu-context-saved-v26/recordings/colony-observations.json \
  --output /tmp/new-context-combination.json
```

Optional original recording requires locally owned assets/Wine, the retained
private save plus receipt in `SMAC_UI_SAVED_FIXTURE_ROOT`, and the validated
Windows Python runtime in `SMAC_UI_WINDOWS_PYTHON_ROOT`. The public launcher
`ui/unit_menu_context_saved_original.py` supplies import paths and adds its own
bytes to future adapter fingerprints. It did not produce the archived captures.
Use `--child` to keep all requested cases sequential in one original worker,
with fresh process/loading per case; two outer repeats remain required.
Public CI replays the observations without any of these private dependencies.

This transport check and the bounded context traces do not establish general
Save/Load equivalence, campaign playability or other menu behavior.
