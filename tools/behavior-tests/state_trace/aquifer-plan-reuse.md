# Aquifer plan reuse checkpoint

The real 4,096-tile cooperation capacity attempt exhausted the unchanged 2 GiB
WASM limit before guard encoding. A counter-only replay completed the first
16,544 geometry reads, 4,096 feature-patch reads, and native terrain validation.
It then repeated the geometry search (33,088 cumulative reads) and reached
7,680 cumulative feature reads before aborting. Full terrain-state reads remained
at one. This evidence supports removing duplicate per-call route construction;
it does not establish a problem in the later identity guard allocation.

`terraforming_effects.plan` now asks its private validation implementation to
retain the exact route array after successful native validation. Assignment into
a fresh local result object preserves the array reference in GSE. Planning
returns that same array. Standalone public validation retains its four-argument
signature and existing undefined/reason results. There is no global cache,
changed route search, tie breaking, ordering, patch fields, validation bypass,
transaction capacity increase, or original-game fidelity claim.

The `aquifer-plan-reuse` regression uses two declared small native water-outlet
inputs. A forwarding TileManager records the actual array submitted to native
validation. The plan must match those complete ordered patch bytes, validate
once, and perform the same geometry/feature reads as standalone validation.
It prints exact patch JSON and the real cooperative identity for independent
old/new byte comparison, preserves native world/terrain/inventory state, and
checks that an already existing river still produces the same rejection.

Native same-input parity, the unchanged 4,096-tile capacity case and the 512 KiB
boundary checks now pass on the exact source/runtime below. The original
allocation failures remain separate retained evidence.

## Native verification

On immutable native v6 (source `115032ffc7f53ff7f0c3a9f997da12674e25e643`),
full host `38e7917acac50430e65f5b78e073f77f6e24ae92` passed the three
small regression scenarios / nineteen assertions. A retained paired replay
used the existing worker's `initial_seed` input `1:2:3:4`; actual native RNG
receipts matched that state for both outlets in both snapshots. The snapshots
differed only in the effect module. Both ordered patch JSON strings and both
cooperative identity strings matched as exact UTF-8 bytes. The old module
completed both output/purity probes before failing the efficiency gate. The
new module performed geometry reads 2 instead of 4 for the west outlet and
4 instead of 8 for the north outlet, with one feature materialization instead
of two and one native validation in each case. The earlier unseeded runs are
retained as semantic/byte evidence, not relabeled as seeded comparisons.

The unchanged large test then passed one scenario / eleven assertions, raw exit
zero and `All tests passed`, in 78.918 seconds. It produced exactly 4,096 native
patches and 4,096 full terrain reads. The independently decoded identity was
261,177 ASCII/UTF-8 bytes, SHA-256
`ec74d2103109b1430b3d5ebb85710f95824930cd850454b5fa6fb9acbecd3b7a`.
All 4,096 coordinates were unique and sorted y/x; the actual integer fields,
nonnegative persistent epoch domain, raw flag ranges, and thirteen ownership entries
per tile passed the external type/range checks. Native work storage accepted
and read back exactly 524,288 bytes, rejected 524,289 bytes before mutation,
and restored the original native world. Peak process RSS was 2,173,872 KiB;
the WASM limit remained 2 GiB. The actual fixture values do not constitute an
execution test of every theoretical worst-value tuple; the larger general
encoded-size upper bound remains a separate source-derived proof.

Local artifacts: `/tmp/aquifer-plan-reuse-seeded-v6/{pair,byte-audit}.json`,
`/tmp/terraform-cooperation-v6-capacity-reused.json`, its full `.log`, and
`/tmp/terraform-cooperation-v6-capacity-reused-identity-audit.json`. The prior
2 GiB failures and diagnostic-only syntax failure remain preserved. No compact
native guard API, collection cadence change, observer field removal, or larger
memory limit was required.
