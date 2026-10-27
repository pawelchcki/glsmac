# Terrain journal acceptance lifetime

Terrain undo records created by an actual native event belong to that event's
transient application context. Native acceptance retires only matching records,
after the whole parent apply returns. This includes work completed inline while
advancing a turn. Pending optimistic application retains its undo until the real
response; rejection uses the shipped rollback. Direct native API calls outside
an event retain their independent LIFO receipts. No context is serialized and
this change does not modify durable unit work, money, or terrain revisions.

The `terrain-journal-lifecycle` application suite executes actual C++ managers,
shipped work handlers, native event processing/response queues, and map codecs.
Ten scenarios/84 assertions pass on native source `70bacb6cef60f2ba19ba5f2153d5ed2faa8cf34f`
(`src` tree `de809b6374aa1f818f0d7396304773fdb27e1604`), with host tests at
`a762cdf5`. The script snapshot SHA256 is
`86d8acc13efdc90b4125bb39c379088c1f022a744d6653df01032bca773b1b4c`.
Runtime SHA256 values are:

- JS: `1d2752b64154553adb2527cbc27fa82413ec6cc55a0f62df234ab82d4fd0ad0f`.
- WASM: `fbf7fa76487a724595e0d0758b47c6d26b55b471673200b5004caf13789c7e9a`.

Coverage includes 24 accepted replacement jobs with a flat journal count, an
unrelated direct receipt remaining reversible, replicated acceptance, all four
optimistic/deferred accept/reject combinations, stale responses, inline turn
completion, failed compound patch cleanup, and same-tile raw LIFO/reuse guards.
The controlled fixture retains its actual native participants; this suite does
not claim seven-player map replay or original-game behavior agreement.

The accepted-Farm retirement assertion fails on the old runtime from
`a62166210adf786cf0f6c117c69f676bd4be9263`, after observing Farm constructed and a
successful native event result. It fails before accessing the new count seam.
That report used snapshot
`5c7dec85f3a0da749782892497c23cadba1e7f36ea62babb725b2a4cd6ad2690`;
the later snapshot fixes a separate, subsequent GSE setter expression. Old JS
and WASM hashes are respectively
`35dfdcaa893dbedec1f6b1723542bb2ff96f1234bf8c373ae16f5c9360168c4b` and
`bbe94bfa6ad4b3057765a8a531018fe6474307c2d4c9e1fcafa25031f95ab10c`.

Local reports are `/tmp/terraform-pr33-journal-old-controlled-red-v3.json` and
`/tmp/terraform-pr33-journal-controlled-v4.json`. Earlier red attempts are retained
as fixture prerequisite failures: economy setup selected player0 while its old
manual-work actor belonged to player1. The corrected event fixture explicitly
spawns its actor for the actual controlled player and retains ownership checks.

Run with the standard harness and an immutable matching native runtime:

```sh
python3 tools/behavior-tests/fast.py --runtime /path/to/GLSMAC.js --jobs 1 \
  --timeout 120 --suite terrain-journal-lifecycle --report /tmp/terrain-journals.json
```
