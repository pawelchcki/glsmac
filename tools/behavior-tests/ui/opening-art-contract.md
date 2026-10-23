# Opening backdrop pixel observations

`ui.opening_art.v1` observes twelve declared RGB pixel coordinates in the visible
opening backdrop at a native 1024 by 768 game viewport. Two cases visit six
settled checkpoints: main on its own, and main followed by map type, planet size,
difficulty and rules using actual visible menu choices. Every input checkpoint
must include every pixel; partial observations, rescaling and out-of-bounds
coordinates fail the protocol.

The original adapter starts the fingerprinted original executable in isolated
Wine installations and reads its screenshots. The reference was accepted by
`compare.py record --repeat 2` with agreement across both complete runs. Pixel
answers come from rendered screenshots; source images and the reproduction do
not populate them. Original images, installed fonts and game assets remain local.

These coordinates distinguish the expansion title artwork from the base title
at each declared screen. They are outside menu controls and avoid the reference
palette's highlight-channel conversion. They establish these exact pixel values,
not full-frame equality, typography, menu chrome, animation timing or correctness
of later setup and gameplay. The complete opening-through-first-round journey
remains unfinished. Full unchanged screenshots and transition frames are retained
locally to expose differences beyond this bounded transfer.

This is a rendered comparison requiring a locally supplied game installation.
It is separate from the asset-free default UI catalog and its passing totals.
The Python contract tests validate evidence and transport completeness; they do
not execute either game and are not visual-agreement evidence.

The named choices are semantic inputs: the original observer clicks rendered
controls, and the reproduction adapter uses actual SDL arrows and Enter to select
the same controls. Matching these backdrop samples does not establish pointer,
focus or timing equivalence between the two transports.

With the browser dependencies and a built application available:

```sh
SMAC_ASSETS_DIR=/path/to/installed/game WASM_APP_DIR=/path/to/app/bin \
  npm --prefix tools/wasm-tests run test:opening-art
```

The browser adapter mounts the current production GSE snapshot before launch and
adds read-only menu telemetry for control discovery and settling. Pixel answers
are read from the actual canvas PNG. The native backing store and screenshot must
both be exactly 1024 by 768; the HTML host is aligned to integer device pixels
without resizing the game. Blank transition frames cannot satisfy settling.
