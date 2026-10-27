# Accepted energy receipt lifetime

Native energy undo records created inside event application carry that event's
transient context. The existing accepted-event finalizer retires matching records
from the world's canonical player slots. This changes neither balance/init/income
fields nor receipt counters, revision values, notification behavior, Player wire
formats, or unit payment metadata. Direct raw API receipts have no event context
and retain their existing same-turn LIFO/ABA authority. Optimistic receipts remain
until acceptance or rejection; compound failures retain undo through cleanup.

The old native runtime accepted real completed-turn income at turn1: balance0
became7 and the income stamp became1, yet receipt2 still validated afterward.
That is the regression assertion, before the new count seam is accessed. The
fixture executes seven real participants, declared city resource inputs, actual
Base getters/allocation, and the shipped income validator/apply/rollback behind
a test-only event adapter. This is candidate receipt lifetime coverage, not an
original economy formula or timing claim.

Ten scenarios/235 assertions pass on host
`e1ecbbd0c8c8e5c0df48436b086d977341a60c10`, native `src` tree
`e20b33e533943c477d51632d4a072df1f291aa81`, with script snapshot
`db7a0944d71750a6616581f06269c5c1cbdcf274f65c18265afce3fa7ac4fa78`.
Native JS/WASM SHA256 values are respectively:

- `c4750c94a09842a58b8f7f4d9f451b84dfcd47495f68d1ae16854ea70a4c67c8`
- `9fb2a1280ffae6021a2fc1785b57c39e22a1e2d58ca0ccc09a654895f9414fc8`

Actual readonly counts demonstrate zero retained opening/accepted history through
12 collections for all seven players; an optimistic pending receipt counts1 until
its response. Coverage also includes an unrelated owner's raw receipt, replicated
acceptance, all four optimistic/deferred response outcomes, stale responses,
failed compound cleanup, direct debit/credit LIFO, ABA, and native Player copy/
receiving codecs. The paid-height feature's unit persistence remains a separate
PR2 compatibility gate; this PR1 suite does not claim to execute it.

The preserved red report is
`/tmp/terraform-pr33-energy-accepted-old-red-v1.json` (snapshot
`0873c461c7bd3f975aa336947f50d1e77b6c32b890435b9d84a70ce5e70a13fd`).
Its old JS/WASM hashes are
`1d2752b64154553adb2527cbc27fa82413ec6cc55a0f62df234ab82d4fd0ad0f` and
`fbf7fa76487a724595e0d0758b47c6d26b55b471673200b5004caf13789c7e9a`.
The green report is `/tmp/terraform-pr33-energy-lifetime-native-v7-first.json`.

```sh
python3 tools/behavior-tests/fast.py --runtime /path/to/GLSMAC.js --jobs 1 \
  --timeout 120 --suite energy-receipt-lifecycle --report /tmp/energy-receipts.json
```
