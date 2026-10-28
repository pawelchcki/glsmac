# Future census dependency binding

The portable preflight now records every regular file in the `playwright` and
`playwright-core` packages. Package roots and contents containing symlinks are
unsupported. The runner compares the same file map before launch and after the
owned process completes; additions, removals and changed executable bytes reject
the binding even when both package manifests are unchanged.

This portable profile has never executed a game. Its executor inventory is seven
methods in the pinned runner test module, separate from preparation tests; the
count is not a claim that preparation executes those tests.

Historical preflight manifests, raw captures, results and source proofs remain
unchanged. Their package-manifest and browser pins did not bind the remaining
Playwright executable contents. The new checks do not repair that historical
coverage or add native, browser, original-game or complete-world credit.
