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
is also required by Runnerless automation. Automatic Codex review must be enabled
for this repository in the connected Codex GitHub integration.

Main health reads the latest attempt of the configured workflow at the actual
current default-branch SHA. Missing, pending, failed or unverifiable evidence
cannot pass. The Runnerless host rollout must include policies.defaultBranchCi
and refresh dependent PRs on main pushes and workflow transitions; until then the
check deliberately fails. This is a deployment prerequisite, not a passing check.

After each main workflow completes, `sync-fork.yml` merges that immutable revision
into `pawelchcki/glsmac:in_webbrowser`, retaining both parents and the message
`Synced from wasmsmac <sha>`. The scoped deploy key can write only that fork.
The sync also occurs for failed main workflows, preserving history; their Pages
publication is refused. Existing downstream commits are preserved and conflicts
fail visibly. An already-linked older revision is never used to rewind the fork.

The fork verifies the sync parents, exact source tree and successful source main
workflow before downloading its Pages artifact. It deploys that tested artifact
without rerunning stable tests. Both Pages URLs use the same main build. Main
and fork workflow failures remain visible; no force pushes or automatic conflict
resolution are used.

Desired protection is versioned in `repository-policy.json` and applied through
Runnerless's repository policy API. Verify both its readback and GitHub rulesets;
a checked-in policy alone does not prove enforcement.
