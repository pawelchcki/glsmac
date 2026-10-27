# Native aquifer capacity and compact geometry

Aquifer eligibility now checks the existing native terrain transaction capacity before work starts. Route discovery keeps the same breadth-first queue, neighbor order, nonascending comparisons, visited rule and reverse patch order. Geometry reads use detached version-1 arrays from `get_terrain_geometry(x,y)`: `[1,x,y,center,is_water,max_patches,neighbors]`; the eight null-or-coordinate neighbor entries follow W, NW, N, NE, E, SE, S, SW. Center is the same native integer field exposed by `get_terrain_state`; the full observation interface is unchanged.

The native transaction cap remains 4096. Oversized paths reject before full feature records are materialized. Supported paths retain every named feature from the native tile, add only the river bit, and pass the existing pure native terrain validator before accepting work. Caching is confined to one synchronous search; rejected uphill edges remain available from another parent and later searches read changed terrain again.

The declared 256 by 136 corridor contains seven native players, no cities, and one worker. Its actual route has 4190 land patches. The old source, using compact reads, found that route and accepted the command despite the native validator rejecting the patch count. The fixed source rejects without work, movement, RNG or native graph changes; read-only diagnostics confirm 16922 actual geometry reads and zero feature-record materializations before rejection. It passes strict shutdown within the unchanged 2 GB limit. This is application correctness evidence, not original-game route or timing agreement and not a general map-size memory guarantee.

Native evidence is recorded in `/tmp/terraform-aquifer-compact-native-red` and `/tmp/terraform-aquifer-compact-native-green`. Earlier full-record, repeated-search, single-search and cache-only shutdown failures remain separate failed evidence. The fixed long case passes 1 scenario and 5 assertions. Short routing and alternate-parent cases pass 2/14; compact/full geometry parity, bounds, imported/canonical values, wrapping, poles, detached arrays and retired managers pass 2/282; the existing primitive suite passes 26/199. All four workers exit zero.

Public asset-free checks:

```
python3 tools/behavior-tests/fast.py --runtime /path/GLSMAC.js --jobs 1 --timeout 120 --suite aquifer-capacity --suite aquifer-routing --suite terrain-geometry --suite terraforming-primitives --report /tmp/aquifer-checks.json
```

The long case has its own suite and fresh WASM process. The historical failing probe is preserved by the recorded red script snapshot, rather than included among current passing cases.
