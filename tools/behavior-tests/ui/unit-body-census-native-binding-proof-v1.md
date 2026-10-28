# Compiled native Census binding: bounded proof

The fourth local core execution passed the real compiled Census fixture and
completed with the sole `All tests passed.` footer. The waited worker exited 0;
the external controller also returned OS 0 after wait and cleanup in 6.151 s.
No timeout or forced cleanup occurred, the owned process group was absent, and
source/runtime post-run hashes matched. Independent retained-evidence review
returned CLEAN without rerunning the engine.

This proves the synthetic native binding/resource/copy/retirement contract below.
It adds **zero gameplay, normal-startup, GPU, Original, world or animation fidelity
cases**. The [machine record](unit-body-census-native-binding-proof-v1.json)
contains the exact inputs, names, outcomes, retained-file hashes and limits.

## Executed versions

The actual execution source was
`d59a00c9875b55d9df2384ea56410b8e8267a107`, Native tree
`df34c4700c2f1f6b9eee5305d5c1e1c4841921c6`, Default tree
`d0cf7c429d28d8d918c78cd7d958237064d988ab`. This documentation is based on
`2ce78f723d17e851de488bd8d1fb9ad2a6918dd2`; its Native, Default and worker/parser
bytes match that execution. This is not a rerun on the documentation commit.

The immutable v6 build used Emscripten **4.0.22**, Node **22.16.0**, FastDebug,
two compiler jobs and the existing default 2 GiB WASM maximum. Its compile/link
step exited 0 after wait in 286.102 s; the complete build driver took 290.858 s.
Runtime SHA-256 values are:

- JS: `c829f6ec7158c24dee3d665a5d958db1304ed0b0a9ec8bfe4fd7aa3562981ee1`
- WASM: `e8ac53df33ca014ac667717f7cdb589f1d0de06f7c7bd92723e449fe7f21a57b`

Build metadata joins the source, toolchain and actual runtime bytes. These are
local build records, not signed compiler or executable-memory attestations.

## Actual accepted observations

There were **26 registered test headers in total, including
`functions.gls.js`**. This is not 26 C++ tests plus that script. The bounded local
snapshot mounted only `functions.gls.js` as a top-level script, alongside the
current production scripts and helpers; it was not the full shipped script suite.

Inside the exact named Census test block, the actual post-retirement marker
recorded **19 binding calls, 11 ordinary GSE argument-error cases, five complete
copies, two supplied frontend owners, three real Units, and 786 checks including
retirement**. The fixture invoked the actual GLSMAC wrapped callable and copied
real retained UnitDef resources, ISM actors and instance maps using synthetic
in-memory textures. It checked present and allocated-absent membership, repeated
read purity, resource/owner/ID joins, normalization and Float32 bits including
signed zero, real Show/Hide restoration, and a genuine nonfinite-copy fallback
whose input was restored before teardown.

Actual collector/root retention and retirement completed before the marker:
frontend resources and application/GSE wrappers retired while both backend
Game/Random owners remained alive, then both real public backend owners stopped
in reverse order. Those backend identities were started for wrapper prerequisites;
no backend gameplay world or normal startup was initialized.

The tracked public font
`resource/font/terminus/TerminusTTF-4.49.3-minified.ttf` was supplied as exactly
**55,700 bytes**, SHA-256
`16709dd4c96ff4e1a1b032175a7fefa18c3199ea95f691a5f6968321a0bfe2e0`,
Git blob `e59b6658e2d90002ef82a3bc99ffa617c8b4f334`. The worker verified its
binary FS readback beside the isolated scripts and retained `/full-gse-snapshot`
as cwd. Its resource identity record appeared at raw line 0, before the first
registered header at line 2. The Census header/marker were at lines 3/4, the next
test at line 5, and the sole terminal native footer at line 123. Stderr was empty.
All line indices are zero-based. The Null font loader did not rasterize glyphs.

The inner worker bound was 120 seconds and the external OS-wait guard was 130
seconds; there was no native CLI timeout override. Cleanup evidence covers the
waited worker and owned process group, not every process in the host namespace.

## Preserved failures

All three earlier core executions remain strict failures with worker OS 1,
external OS 2, no Census marker/footer and zero credit:

| Attempt | Actual failure |
| --- | --- |
| 1 | Zero-sized Null viewport caused a real UI effective-area assertion; a later GC trap followed failed construction. |
| 2 | The isolated filesystem lacked the bundled Console font; its real read failed, followed by a later GC trap. |
| 3 | Never-started backend identities lacked the eager Random wrapper prerequisite; real `Game::Wrap` trapped. The font prerequisite had passed. |

The retained build history also preserves the initial missing-toolchain
preflight (zero compiler steps), six protected retention-access compile errors
in build v2, and two incomplete-Graphics include errors in build v4. None is
relabeled as a successful compile or execution. The initial cheap font-protocol
Git `EPERM` failure also remains environmental failure evidence; an exception's
misleading `status: 0` was not treated as a successful child exit.

The machine record binds those receipts and the accepted local artifacts under
`/tmp/census-native-core-v4` and `/tmp/census-native-core-build-v6`. The independent
read-only audit is `/tmp/census-native-core-v4/independent-proof-audit.json`,
SHA-256 `5f5133233f123c936fe3b2f0fd4aa0bfa98644fbee162c121b077f22d76b44be`.
No raw archive, signatures or portable replay of those local paths is provided
by these documents.

## Fresh public execution route

Build the intended checkout's FastDebug WASM runtime with the repository's
Emscripten recipe, then use Node 22.16 and the actual built runtime:

```sh
WASM_APP_DIR=/absolute/path/to/built/bin WASM_SCRIPTS_ROOT="$PWD" \
  node tools/wasm-tests/gse.test.mjs --report /tmp/census-full-gse-report.json
```

This is a **new candidate execution**, not replay of the local proof. It needs
Git, the tracked public font and shipped scripts; it needs no installed or
Original game assets. The checked-in worker mounts verified font bytes before
Native tests. The producer requires the real 19/11/5 marker, own-test interval,
terminal footer and OS-close success. Mandatory CI uses four script partitions
and independently reparses each retained v2 native/resource report during
aggregation. Four executions of this same synthetic fixture are not four
distinct fidelity cases. This documentation task executed none of those commands
and makes no fresh full-CI claim.

The [older installed-data browser proof](unit-body-census-proof-v1.md) remains
historical Native `23e54d08` / Default `a69dd4e0` / runtime v8 evidence. It was not
rerun or relabeled for this Native tree. General constructor exception safety,
installed-art appearance, GPU/map rendering, all-player world fidelity, motion,
poses/clips/facing, cadence and Original parity remain outside this proof.
