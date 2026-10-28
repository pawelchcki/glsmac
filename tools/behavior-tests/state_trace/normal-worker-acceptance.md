# Normal-map native worker acceptance

These are application checks, not original-game path, timing, naval production or visual agreement. Each normal fixture uses a real 40×80 native world with seven populated owner inventories and 1,600 valid tiles. Corridors, extra bases, source components and actor inputs are explicitly authored; native movement completion callbacks, economic processing and production remain real.

The immutable runtime is `/tmp/wasmsmac-terraform-pr2-runtime-v6/GLSMAC.js`, native source tree `115032ffc7f53ff7f0c3a9f997da12674e25e643`. JS SHA256 is `e71036c9365a3ac87bf818e7eb49fb2344077a15aa6836371a436572cedf7f82`; WASM SHA256 is `b2c7fa273042f2407335169eb4fca51f131f1f30656301d7b7573a201b28f5b7`. The runtime directory contains build/cache/toolchain provenance.

| Native check | Frozen host | Strict result | Wall time | Node peak RSS |
| --- | --- | --- | --- | --- |
| Road | `529622d05189a2fb67a435a8e29b1d8225521f20` | 1 scenario / 129 assertions, process 0 | 46.359 s | 2,276,124 KiB |
| Tube | same `529622d0` | 1 / 50, process 0 | 27.828 s | 1,625,632 KiB |
| Produced SeaFormer, ports and home | `379459c4f7dd8517e82a32d6dbf38dfa0b68d802` | 2 / 136, process 0 | 40.151 s | 2,067,856 KiB |

The road route completes six actual ACKs over two turns, including three fractional road steps per turn and the horizontal 0→38 seam. Its per-turn MP is exactly native float32 `1 → 0.66666668653488159 → 0.3333333432674408 → 0`. The independent fresh Tube world completes the same six-edge detour in turn one while retaining MP 1. Planning purity, settled-turn queued child processing, all owners' unit/work/plan/home/recovery/research/economy state, RNG and whole-map before/after guards remain checked. Each action is an existing native completion; no fixture injects a settled position.

The Sea suite separately checks an actually produced unit's persisted home through an independent receiving native codec. Its seven-owner world composes the declared Foil/Terraform source recipe, spends 80 minerals and retains overflow 3, verifies home at the spawn notification, and exercises owned-port quote/debit/ACK/undo plus inland/foreign rejection. After a nearer owned port exists, AutoHome still returns to the persisted production base through two real ACKs over one additional turn, ending with MP 3. Whole-map and unrelated-owner guards remain exact. This is native application acceptance, not a browser or stock-art claim.

The original Sea failure is retained: `/tmp/terraform-sea-home-port-v6-first.json` and the readonly `/tmp/terraform-sea-home-port-v6-diagnostic.json`. A newly authored producer had zero population; native production correctly retained its SEA_FORMERS project and 83 minerals instead of creating a unit. The reviewed fixture correction uses shipped `add_base_pop.validate/apply` to create its initial citizen before the baseline. The native population requirement, mineral cost, production result and home/port assertions were not relaxed. The earlier combined road/Tube fixture's post-ACK render-mesh setup failure is also retained; the two checks now author all terrain before any movement in independent fresh worlds.

Reports and complete request/script snapshots are `/tmp/terraform-normal-road-v6-first.*`, `/tmp/terraform-normal-tube-v6-first.*` and `/tmp/terraform-sea-home-port-v6-population-fixed.*`. Road/Tube scripts snapshot SHA256 is `5766517f108e62a13d13c65c9b7cab7c0ea5ae75ba6a4efee9a8fec782d0d626`; Sea scripts snapshot SHA256 is `3ab87e57ddfb5f06c5bc8d802a9e8c15755d8033b18a59d3aa32c7309786e563`. Timing includes worker startup and stdout transport. RSS is the Node process maximum, not live WASM bytes or a general memory-headroom guarantee.

Reproduce each check in a fresh worker from the matching source checkout:

```sh
python3 tools/behavior-tests/state_trace/normal_worker_routes.py --runtime /path/to/GLSMAC.js --suite normal-worker-routes --report /tmp/normal-road.json --timeout 180
python3 tools/behavior-tests/state_trace/normal_worker_routes.py --runtime /path/to/GLSMAC.js --suite normal-worker-tubes --report /tmp/normal-tube.json --timeout 180
python3 tools/behavior-tests/state_trace/normal_worker_routes.py --runtime /path/to/GLSMAC.js --suite sea-worker-home-port --report /tmp/sea-home-port.json --timeout 180
```

The 36-case small-map trace matrix remains a separate supporting result. Cooperation capacity, the cooperative observer/preview, final-host browser checks and final-source CI/review are separate gates; these route results do not promote them or any original match to passing.
