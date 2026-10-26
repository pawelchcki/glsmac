# Duplicate participant identity transfer

The immutable [all-player identity package](all-player-identity/contract-v1.md)
contains two independently repeated duplicate-Gaia setups. Each observes the
first Planetfall state of all seven owners, their faction files and human flags,
and all six verified identity strings. The human authors either `Deirdre` or
`Trace Commander`; the remaining setup is unchanged.

With `Deirdre`, the second Gaia's leader, formal faction name and noun are
`Deirdre-2`, `Gaia's Stepdaughters-2` and `Gaians-2`. With the authored human name,
the opponent leader remains `Deirdre`, while the same formal-name and noun
suffixes remain. The adjective, leader title and leader description are unchanged
for both Gaia participants. Every field of the other five participants remains
observed and compared. Gender, distinct player display names and rendered
offscreen identities remain explicitly unobserved in this evidence.

Before transfer, exact main `0c726238e0078739246935483140d32ef9348992`
produces two mismatches: three opponent identity fields in the stock-name control
and two in the authored-name control. All other native fields agree. The clean
candidate adapter executes shipped setup controls, the shared native participant
initializer and actual seven-player world startup; it observes native strings
rather than substituting faction templates as participant answers. The separate
native projection does not claim full agreement for the original package's
additional presentation observations or unsupported fields. The archived inputs,
observations, comparison and manifests remain byte-identical.

Strict native-projection replay after the fix reports **2 matched, 0 mismatched,
0 unsupported, 0 errors**, while the full package remains unsupported with zero
passing full-package cases. The new application suite passes nine scenarios and
206 assertions. Together with the adjacent participant setup, faction identity
and player-copy suites, focused native-backed WASM verification passes 43
scenarios and 435 assertions. These totals are separate kinds of evidence.

The production initializer now resolves collisions on each participant-owned
faction copy after applying human customization. Leader name, formal name and
noun are checked independently against the actual corresponding fields of
already-created participants. An occupied nonempty field receives the first
unused numeric suffix beginning with `-2`. This preserves the two observed
controls without changing installed faction definitions, actual faction IDs,
social ratings, starting technologies, colors or base-name pools. The other
three identity fields are not disambiguated. No extra random draws are consumed.

More than two duplicates, cross-faction text collisions, authored suffixes,
empty names and maximum-length inputs are application policies covered by
regressions, not additional original observations. Empty editable strings stay
empty. When a suffix would exceed the existing native byte limit (39 for formal
name, 23 for other fields), the collided field is clipped to leave room for the
suffix. For valid UTF-8 input, clipping retains complete code points. The first
participant's authored identity and every source template remain unchanged.
These fallback policies establish no original Unicode, truncation, case-folding
or arbitrary collision-order behavior.

The `duplicate-faction-identity` application suite verifies both observed name
controls across all seven owners, per-field customization, independent template
storage, seven duplicates, suffix reuse, byte limits, UTF-8 clipping, empty names,
distinct faction IDs and native participant/faction codec preservation. The
existing single-player setup suite also checks the changed duplicate formal
name while preserving its source catalog and unrelated startup behavior.

```sh
python3 tools/behavior-tests/fast.py --suite duplicate-faction-identity --jobs 1
```

This change does not implement diplomacy, complete faction mechanics, natural
placement or original AI/research behavior. The unrelated University technology
difference in the explicit-world end-turn trace remains strict failing evidence.
