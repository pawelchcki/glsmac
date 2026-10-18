# Behavior reproduction tests

Read README.md before adding a contract or modifying its evidence.

- Reference research produces synthetic test inputs and observed original-game
  outputs. Do not commit original binaries, byte dumps, disassembly, decompiled
  pseudocode, or translated original algorithms. Keep research notes outside
  the checkout.
- The original adapter may contain verified function/global addresses, fixture
  setup and unit conversions. It must execute original instructions for its
  answers and reject unrecognized executable fingerprints. Do not replace
  missing original dependencies with guessed behavior.
- Generate reference observations using compare.py record, with fresh fixture
  state for every case and repeated identical runs. Never generate reference
  answers from GLSMAC or edit answers to make a candidate pass.
- Give implementation agents only the case contracts, recorded observations
  and existing GLSMAC source. Use a fresh agent context without original
  source, disassembly or reverse-engineering notes. Keep reference test work
  separate from implementation changes informed by those tests.
- State each contract's precise scope and units. Preserve mismatches and mark
  unsupported algorithms as unsupported. Do not broaden claims beyond the
  tested behavior or equate different distance metrics.
- Compare relevant state changes and decision sequences as well as return
  values. Control all relevant globals and random inputs before recording.
- Run the harness unit tests and native/WASM comparisons after changes. No
  original assets should be required for public CI or recorded-case replay.
