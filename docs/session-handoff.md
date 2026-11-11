# Session handoff

Fetch the delivery base, inspect live PR/CI state, then capture the local session:

```sh
git fetch wasmsmac main
python3 tools/handoff.py --owner codex --task 'unit-order migration' \
  --next 'inspect the final-head review and CI before merging' \
  --runtime build/wasm/bin/GLSMAC.js \
  --check-report build/hot-artifacts/hot.json \
  --gap 'full TypeScript action lifecycle remains open'
```

The default output is ignored `build/handoff.json`. Supply `--output` to retain
several sessions outside the checkout or in an ignored directory. The tool
refuses tracked and nonignored in-checkout outputs and selected input files.
Ownership, task, next action and additional gaps are supplied by the caller.
`--runtime`, `--check-report` and `--gap` can be repeated; omit them when no local
runtime or check evidence exists. An explicitly supplied missing file fails the
capture. A `.js` runtime also requires and fingerprints its `.wasm` companion.

The record identifies the current worktree, branch (or detached HEAD), commit,
local base ref, staged/unstaged diff hashes, dirty paths including renames and
untracked content hashes. Untracked nested repositories are listed with an
explicit limitation: their directory contents are not fingerprinted. It copies
unchecked roadmap items, unrecorded behavior
gaps and pending UI IDs without putting them in passing totals. Runtime files
and supplied check reports have independent SHA256 fingerprints. The tool checks
Git/source and selected file identities again before accepting the capture.

The base is a **local observation**, not a remote freshness or main-health
certificate. `--base-ref` defaults to `refs/remotes/wasmsmac/main`; supply another
ref for a different delivery target. Missing refs fail rather than substituting
HEAD. On resume, fetch again and inspect actual open PRs, CI and review results.
The tool never fetches, switches branches, stages files, stashes or commits.

Report fingerprints locate the last supplied evidence; they do not certify its
results or bind an old report to the current tree. Inspect each report's own
source/runtime binding and retained failures before reuse. Likewise, executable
hashes identify bytes without proving their compiled source. Keep build
provenance separate from fresh GSE inputs and the verified generated TypeScript
package. Regenerate the package and run applicable checks for a new candidate;
the handoff record itself is never a passing candidate comparison.

Run `python3 -m unittest discover -s tools -p 'test_handoff.py' -v` locally.
