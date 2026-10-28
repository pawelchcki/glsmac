# CLAUDE.md

## `.gls.js` is not JavaScript

Files matching `*.gls.js` (mostly under `GLSMAC_data/default/`) are GSE
(GLSMAC's embedded script language) — JS-*shaped* syntax, JS-incompatible
semantics. Do not pattern-match JS habits onto them.

Before editing or generating `.gls.js`, read `tools/js-vs-glsjs-cheatsheet.md`
for the mental-model diff. Grammar source of truth: `src/gse/parser/JS.h`.

Test loop: `./build/bin/GLSMAC --gse-tests --gse-tests-script PATH.gls.js --quiet`
(no script arg = full suite).

## Game fidelity iteration loop

When continuing the game implementation, repeat this loop until the user pauses
or changes the task. Finish an explicitly requested wrap-up boundary, then pause;
do not start another batch after it.

1. Reconcile current main, open PRs, test results, and the recorded fidelity gaps.
   Preserve unrelated changes and use isolated worktrees where needed.
2. Start with broad gameplay and end-to-end flows, then work through progressively
   smaller differences. Improve the test harness first when missing observations
   or unreliable checks prevent fast, trustworthy iteration.
3. Capture and compare the state of every player on the map, including opponents.
   Treat every window, widget, animation, video, sound, and music transition as
   observable state. Track lifecycle, content, selection/focus, and timing where
   supported; record missing observation capabilities as gaps.
4. Inspect the original game when behavior is uncertain, following the reference
   isolation rules in `tools/behavior-tests/AGENTS.md`. Keep original-binary
   research separate from candidate implementation; use clean contracts and
   recorded observations to communicate expected behavior.
5. Pick a coherent batch of missing features or demonstrated bugs. Add meaningful
   coverage, preserve failing evidence, implement fixes, and verify the result.
   Use focused checks for iteration and the applicable broader suites before
   delivery. Do not change expected observations merely to make tests pass.
6. Delegate bounded, independent implementation, testing, reference research, or
   PR work when authorized. Give agents clear ownership and acceptance criteria;
   coordinate shared files, runtime artifacts, and heavy workers to keep results
   reproducible. Run candidate browser checks without competing heavy work.
7. Once the batch is substantial and verified, commit and push it, drive its PR
   through CI and review, resolve substantiated findings, and obtain a clean
   review on the final head. When merging is authorized, merge only after the
   fresh-head gates pass, verify the merge, and refresh main before the next batch.
8. Record the exact source/runtime versions, checks, observed matches, failures,
   unsupported cases, and remaining gaps. Continue with the next highest-value
   gap unless the user requested a pause. Passing bounded checks is not proof of
   100% game fidelity; keep unsupported behavior outside passing totals.

## Main repair merge exception

A proven repair of failing main may merge without further confirmation when the
only failing applicable context is Main health caused by that same main failure,
and fresh exact-head checks otherwise succeed, the final-head review is clean,
all review findings are resolved, and the head is mergeable with the current base.
Pause any strict all-green goal before using this exception; do not claim that
goal passed. Use a normal merge guarded by the expected head, preserve branch
protections and checks, then verify the merged tree, refresh main, and inspect
the automatic full Main CI result before claiming main is healthy.
