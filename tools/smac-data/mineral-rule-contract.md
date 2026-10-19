# Installed mineral multiplier

This is installed-data and GLSMAC application coverage. Existing recorded
`economy.human_mineral_factor.v1` observations establish bounded factor arithmetic,
not complete original item prices or construction behavior.

The SMACX source is `alphax.txt`, format `rules`, block `RULES`, zero-based data
row six, field zero. Root independently checked the mapping against installed
source. Comments and blank records are not data rows. Require one unambiguous
block and a canonical decimal integer 1..100. Permit trailing empty fields;
reject additional nonempty fields, signs, leading zeroes, fractional/exponent
forms, partial numbers, missing rows and ambiguous blocks before mutation.
Other rows remain uninterpreted. Do not copy installed source into tests.

Use native rules state with strict callable integer accessors, independent
copies, retained aliases and safe saved-callable destruction. Existing nutrient
accessors and its scalar parser API remain supported. Startup loads the same
document once on ordinary and Quick Start routes, validates both cost
multipliers completely before committing either, and does not reload local
values over authoritative receiving settings.

Rules records carry nutrient then mineral typed integers; a configured
[world-size table](world-size-contract.md) follows as a tagged typed extension.
An exact old
empty record defaults both to ten. An exact nutrient-only record from b17ee4ad
retains its nutrient value and defaults mineral to ten. Any present mineral
extension must be complete, valid and consume the record exactly before either
live field changes. Preserve both fields through native copies, Rules and
GlobalSettings transfer, retained readers and actual valid pre-world State
wire. Invalid Rules and truncated later aggregate fields preserve previous
GlobalSettings. Successful direct map and aggregate transfers refresh all nine
exposed map properties plus global difficulty and game name, including wrappers
that previously assigned scalar values. Reject unregistered full-width wire
difficulty values before any commit; narrowing into a valid mapped value is
invalid. Malformed whole-State/faction atomicity is outside this contract.

Declared facility and Colony Pod rows use the loaded mineral multiplier in the
existing human/named-preset/INDUSTRY-zero resolver. For Standard and rule eleven,
four facility rows cost 44 and three Colony Pod rows cost 33. Descriptor,
selection preview, selection, completion and food/mineral displays must agree.
Explicit Custom kind 99 also uses the loaded multiplier, supported by the
separate fixed-Custom original factor observations. Existing explicit fallback
costs remain for unknown/imported provenance,
unmodeled roles and definitions without row declarations. These row declarations
and construction semantics are GLSMAC application policy, not additional
original-executable evidence. Check multiplication against the actual factor
before computing it; rejection must leave live production state unchanged.

Do not replace a recorded zero factor with one or a fallback. Under the existing
row-price policy, Tiny with multiplier one has exact zero declared prices.
Such declared projects remain selectable through the shipped picker and command
validator/apply, including owner/availability checks, and complete on the next processed
production turn, retaining all mineral overflow. Colony Pods still require the
existing population charge/size-one holding policy. Invalid zero-cost fallback
definitions without a supported row-based price remain unavailable. Existing
basic-item switching arithmetic continues to apply. The actual zero-row
mineral grid must clear old cells without dividing by zero. A funded project
that can complete on the next processed turn must display one turn even without
mineral income; an unfunded project with no income keeps its no-surplus label,
and a size-one Colony Pod keeps its population requirement. This application policy adds no original construction/UI cases.

Tests must cover boundaries, malformed source/state, compatibility, aliases,
lifetime, copies, overflow, actual native facility/unit completion and both
real browser startup paths. Preserve strict red probes until fixes pass; do
not count unsupported or failing cases as passing parity.
