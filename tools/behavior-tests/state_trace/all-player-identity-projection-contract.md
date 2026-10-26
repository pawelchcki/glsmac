# All-player native text replay v1

Algorithm `game.all_player_identity.native_text.v1` is an explicit bounded
projection of the immutable [all-player identity evidence](all-player-identity/contract-v1.md).
It compares every owner's faction source file, actual human flag and all six
native text fields: leader name, formal faction name, noun, adjective, leader
title and leader description. Both original cases retain all seven owners.
No owner, faction or text is selected using candidate results.

The public runner validates the pinned original manifest and every bound file,
then validates the original case and observation fingerprints. Projection only
copies the four declared native player fields, with all six identity strings,
from each original `after_launch.players` row. Missing/duplicate/reordered
owners, missing or extra native fields, nontext identities, incomplete declared
native coverage, changed unsupported fields and inconsistent reference human
flags are errors. The projected protocol binds the unchanged inputs to the new
algorithm and preserves its original record, manifest and suite fingerprints.
The original inputs, observations, manifests and passing catalogs are unchanged.
This is a deterministic projection of repeated evidence, not a new recording.

The candidate receives only declared case inputs. It executes the actual shipped
faction chooser and Name controls, clicks the base roster and the declared
opponent dropdown, enters the requested human name and submits the actual input.
The start callback enters the production native roster initializer and actual
world startup on the declared flat-arid40x80 map. Seven actual native bases are
required before all native participant identities are exported. An owner is the
actual native zero-based slot plus one; the original profile uses owners1..7.
Faction file stems come from the production `source_catalog` mapping for each
actual stored faction ID. No expected opponent text or suffix enters the
candidate, and identities are never written after native initialization.

The existing `_startup_faction_sources_fixture`, `_faction_ratings_fixture`,
`_faction_text_fixture` and `_dimension_text_fixture` independently supply
synthetic equivalent faction headers and editor inputs. Production parsers read
those declarations. `_natural_startup_mechanics` supplies the existing bounded
world configuration. This observes identity transfer from equivalent source
records; it does not certify parsing every original installed file. Source
fixture hashes, the actual script snapshot, adapter/template/worker hashes and
immutable JS/WASM digests identify each execution. A native source-mutation test
changes a declared Gaian adjective and verifies that both actual participants
reflect that source value, preserving its distinct input fingerprint.

Display, event delivery, artwork/base-name loading and the bounded world setup
are controlled boundaries. The original reference's before-launch UI, Name
prompt, rendered human Planetfall and rendered opponent identity remain outside
this native-text projection. All-owner gender, a distinct player display name,
raw native turn counter and cross-engine RNG equivalence are also unsupported.
In particular, original Planetfall counter0 is not relabeled or tolerated as the
candidate's ordinary first turn1. No original presentation, gender or RNG
agreement follows from textual identity agreement.

```sh
python3 tools/behavior-tests/state_trace/all_player_identity.py compare \
  --runtime /path/to/GLSMAC.js --report /tmp/all-player-native-identity.json
```

`--case ID` selects either frozen input while retaining its evidence binding.
`candidate` exposes the input-only stdin/stdout protocol adapter. Comparison
reports count native-text projection outcomes separately and always retain
`full_package_status: unsupported`, `full_package_passing_cases: 0` and the
complete unsupported inventory. Unsupported/error candidate results never pass;
malformed native fields are errors. Exit0 means complete agreement only for this
bounded native-text projection, exit1 means mismatch/unsupported, and exit2 means
execution or evidence errors. Failed invocations replace stale reports with
current error evidence, and report paths cannot overwrite original evidence.
The adapter process execution flag is distinct from each actual native worker's
launch flag; timeout after launch remains executed and is killed/drained.

Exact main0c726238 initially produced two strict mismatches: three owner2 fields
in the stock-name case and two in the authored-name case. The initial development
attempt with unsuitable synthetic bonus rows failed source parsing; a later
preliminary parser accepted duplicate behavior summaries. Those local attempts
are not passing verification. The final strict adapter requires one completed
GSE summary, preserves the same3/2 original mismatches against the immutable old
runtime, and agrees with the rebuilt participant-identity implementation in both
cases. These totals add no full-package or general game parity claim. The hot
workflow separately gates this asset-free replay and its infrastructure tests.
