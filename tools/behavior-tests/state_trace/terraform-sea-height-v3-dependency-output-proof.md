# Sea audit dependency and exclusive-output repairs

Sea source `33b5c07f` repairs two independently substantiated findings on `0fe87967`: the result now records the exact four validation dependency hashes already emitted by Land, and the CLI exclusively creates a new UTF8 output after replay. The initial exists check remains only a fast rejection. A deterministic no-game interleaving writes a winning result during the mocked audit; the old CLI overwrote it, while the new CLI raises FileExistsError and preserves its exact bytes. Changing each imported validator in a temporary source model changes its emitted dependency digest without changing either auditor digest.

Public Sea checks: **36 pass, zero skips**. The existing mandatory PublicSeaParserTests class includes the three new regressions. Its five checks also pass after the exact shared helper/test port from Delivery's `73559f3d` (local byte-port `eb29ee0d`); these are overlapping checks, not 41 distinct public cases.

One unchanged historical Sea read-only CLI passes with shared helper SHA `05d0bffa3433e435c64800f7a9d6f3b6c9057453d4d34c15d0d10c7c62abfb3f`. The new result is separately identified; all earlier sources, raw/report/preflight and derived results remain immutable. The runtime/capture remains historical source7d/Native115/Default25/v6, not the current source tree.

Current evidence stays partial: **six observed worlds, zero complete worlds, one genuine historical execution, one bounded state/receipt case and zero complete browser cases**. Callback identity and native entity-detail handle gaps remain unsupported. No game, browser, Native build/capture or private mutation batch was repeated. Prepare/runner fixes are owned separately by Graphics, and shared CI/publication by Delivery.
