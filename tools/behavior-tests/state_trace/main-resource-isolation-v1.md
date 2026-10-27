# Main regression resource isolation

Main run40576278956 at55e706e timed out after the colony suite printed all16 case passes and its64-assertion summary, before the native completion footer. The strict103/104 regression result remains failed. The unchanged local120-second diagnostic completed in71.306s on Node24; it spent35.244s after summary with active CPU and reached about2.52GiB process RSS. This does not reproduce the CI timeout or establish a particular GC or teardown defect.

The selection fixture intentionally retains Native game contexts until worker shutdown. The same logical colony suite now uses three isolated whole-case workers (8/36,5/19,3/9); all original case body bytes, names, order, inputs, cleanup and64 assertions remain unchanged. Each worker retains120 seconds and must return0 with its own actual native footer; the documented maximum serial suite budget is360 seconds. The canonical complete16-case script remains available to full GSE discovery.

Focused execution on source63214215 with CI-matching Node22.16.0 and the unchanged Main artifact strictly passed all16/64. Workers took59.937s,48.424s and29.989s; each had raw0 and its own native footer. The adjacent JSON binds the exact source/runtime/worker/snapshot and each retained raw log hash. Artifacts: `/tmp/main55-colony-packets-focused/`.

The same Main run also exhausted the existing20-minute limit of GSE partition3 while partition4 completed in595.986s. Move only the three measured scripts (unit_disband_controls163.118s, terraform_automation105.418s, terraforming_controls_all102.217s) from3 to4. The projected new fourth-partition time of about966.7s is a prediction. Keep four workers, all189 public entrypoints exactly once, all helpers, native builtin tests in every worker and the same20-minute limit. Serial and non-four-way plans retain their existing assignments.

At publication, actual full affected-partition3/4 verification on Node22 and fresh mandatory CI remain PENDING. This is a measured resource-isolation improvement; it is not proof of the historical timeout cause, a production fix, or a healthy Main result.
