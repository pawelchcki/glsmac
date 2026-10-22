# Repository automation

`pawelchcki/wasmsmac` is the independent development repository, retaining the
existing commit ancestry. `main` accepts pull requests only, with no admin bypass.
The initial import seeds an empty repository before protection can be installed.

PRs run the explicit hot lane. Stable tests, full GSE/engine checks, native builds,
rendering/startup checks and reference-integrity validation run on main. See
`tools/behavior-tests/lanes.json`; pending failures and unrecorded gaps remain
separate from passing totals.

`.runnerless-ci.ts` executes on Runnerless from the trusted PR base revision.
Required checks are Hot tests (GitHub Actions), Runnerless / Main health and
Runnerless / Codex review (Runnerless App 4602759). The managed codex/review-gate
is also required. Automatic Codex review must be enabled
for this repository in the connected Codex GitHub integration.

Main health reads the latest attempt of the configured workflow at the actual
current default-branch SHA. Missing, pending, failed or unverifiable evidence
cannot pass. The Runnerless host rollout must include policies.defaultBranchCi
and refresh dependent PRs on main pushes and workflow transitions; until then the
check deliberately fails. This is a deployment prerequisite, not a passing check.

The program explicitly subscribes to the host-created `default_branch_ci` event.
This declaration must be on the trusted default branch before main transitions
can refresh open PRs; an ordinary `push` subscription does not opt in.

After each main workflow succeeds, `sync-fork.yml` merges that immutable revision
into `pawelchcki/glsmac:in_webbrowser`, retaining both parents and the message
`Synced from wasmsmac <sha>`. The scoped deploy key can write only that fork.
Failed or cancelled attempts do not sync, so a successful retry can trigger the
fork's Pages publication. Existing downstream commits are preserved and conflicts
fail visibly. An already-linked older revision is never used to rewind the fork.

The fork verifies the sync parents, exact source tree and successful source main
workflow before downloading its Pages artifact. It deploys that tested artifact
without rerunning stable tests. Both Pages URLs deploy a successful main build of the same source revision.
Separate successful runs of that revision can produce different binary hashes;
each URL is verified against the particular artifact it publishes. Main
and fork workflow failures remain visible; no force pushes or automatic conflict
resolution are used.

Desired protection is versioned in `repository-policy.json`. Bootstrap applied
GitHub ruleset 25531394 directly: active on main, PRs required, no bypass actors,
and producer-pinned Hot/Main health/Codex review checks plus codex/review-gate. The installed Runl CLI
supports read-only automation/policy access; its generic API cannot write these
settings. The managed Review gate must be enabled in Runnerless repository
automation; it remains required while activation is pending. Managed repository-policy adoption can be done through Runnerless's
administrator UI later without weakening GitHub enforcement. A checked-in policy
alone does not prove enforcement.

The first main workflow is 39565462224 at 62eebe00; it was manually dispatched
because GitHub did not schedule the initial default-branch creation. Subsequent
main updates use the ordinary push trigger. Deployment is still gated on its
successful completion; the previous public build remains live until then.

The first main runs 39565462224 and 39565466953 both passed, including stable,
hot, native builds, full GSE and browser/platform checks. Sync created fork merge
cbc06d36fc2404adbef0cc16dd28859e7808590f; linked Pages run 39568591169 passed.
The read-only Main health capability dependency is tracked in
https://github.com/pawelchcki/my-infra/pull/279. Custom Runnerless gate executions
are still being checked; required checks remain in place during rollout.
