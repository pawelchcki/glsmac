# Installed nutrient multiplier

This is a source-data and GLSMAC integration contract. Original arithmetic is
covered separately by `economy.human_nutrient_factor.v1`; importing a value does
not establish original population-growth or food-grid behavior.

The SMACX source is `alphax.txt`, format `rules`, block `RULES`. The nutrient
cost multiplier is field zero of data row five, using zero-based indices.
Count parsed data rows, excluding comments and blanks. Physical line numbers
and translated comment text do not identify this field. Root checked this
mapping against the installed source; no installed text is copied here.

The consumer must require an unambiguous block and the mapped row. Its first
field must contain a canonical decimal integer from 1 through 100. Parser
padding is already trimmed; leading zeroes, signs, fractional/exponent forms,
trailing characters and empty values are invalid. Additional empty fields from
trailing commas are allowed; additional nonempty fields on this scalar row are
invalid. Other rows remain uninterpreted. Missing files and invalid values must
fail explicitly before changing settings.

Tests use synthetic preceding rows with distinct values, for example:

```text
#RULES
31,
41,
51,61
71,
81,
11, ; synthetic nutrient multiplier
91,
#END
```

The resulting integer belongs in native global rules state, rather than a
script custom property. It must reach ordinary startup and Quick Start and
survive settings transfer. A receiving client must retain authoritative
received rules. Decode an exact legacy empty rules payload as the previous
default 10; validate any present extension completely before mutation.
Retained wrappers must observe native changes consistently.

At the containing `GlobalSettings` boundary, decode all fields and validate the
nested map and rules records before replacing live settings. Rejection of an
invalid nested rules value or a truncated later game-name field must preserve
the complete previous serialized global settings, including the map, multiplier
and name. Successful transfer must retain existing rules readers and refresh
retained map-preset wrappers. Native probes use distinct sender and receiver
values, check their independence after transfer, and cover the nested exact-empty
legacy rules payload.

A separate valid-wire probe exercises actual `State` serialization and
deserialization between dedicated pre-world states, including independently
decoded faction definitions. It does not replace an already populated world.
Atomic rejection is claimed only for the bounded `GlobalSettings` decode above;
these checks do not establish atomic rejection of malformed whole-State or
faction payloads.

For the currently modeled human, named-preset, GROWTH-zero context, native
`Base.get_nutrient_factor()` must pass this multiplier to the already tested
helper. Preserve unsupported-context behavior. On Standard, multiplier 11
produces factor 11; existing GLSMAC population-one growth uses 22 nutrients,
subtracts exactly 22, retains overflow and displays 22 food cells. Those growth
and display expectations test GLSMAC's current policy, not new original-game
observations.

Zero factors must remain exact: multiplier 1 on Tiny produces zero. The food
grid must handle zero columns without division or invented substitute cells.
It must clear previously displayed cells and use the existing supplied label
formatter with zero progress. This is an explicit application rendering policy;
it does not claim original zero-factor UI or growth parity.

Malformed data, native field validation, legacy/current/corrupt settings,
alias refresh, actual growth/overflow, actual nutrient-section cells and both
startup paths need strict tests. New red probes remain outside passing totals
until fixed. Installed-source inspection and synthetic integration checks add
no original-executable parity cases.
