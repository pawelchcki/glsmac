# `game.faction_social_ratings.v1`

Inputs select an explicit original/expansion roster slot on a random Tiny map,
Citizen difficulty and standard rules. The recorder confirms the first base,
dismisses the actual named tutorial dialogs, accepts displayed research defaults
(or the first visible goal when a direct goal picker appears), and opens Social
Engineering. Research outcomes and arrival years are outside this contract.

The output is initial GROWTH, INDUSTRY, nutrient rule and mineral rule. Rating
values are read independently from the actual labeled Social Engineering rows
with two agreeing OCR numerals. No expected numeric value or glyph substitution
supplies an answer. Each case also reads the selected human faction's guarded
writable data and requires it to match those two named rows. One human-mask
byte selects the actual faction; neighboring flags are excluded. The physical
fields are `0x0096CC44 + faction*0x20CC` for GROWTH and `0x0096CC50 +
faction*0x20CC` for INDUSTRY. These values are still unset at the opening dialog;
the recorder must wait for initialized gameplay.

Four controlled source profiles replace only the two selected SOCIAL bonuses
or the two cost-rule input rows. Distinct 17/23 and 23/17 source values identify
the nutrient global at `0x00949750` and mineral global at `0x00949754` separately.
Source text remains input; outputs are actual initialized original state.
All fourteen default factions and four overrides are recorded in fresh games,
with two complete identical passes. Original assets remain private.

Candidate replay executes the production source consumer and faction configure
callback against minimal equivalent source inputs. Display/artwork, world
creation and human selection are controlled boundaries. Actual native rating
validation, storage, wrappers, rule settings and faction codecs provide its
outputs. Browser tests separately check the real configure-state callback,
selection, generated world, food threshold, picker prices and actual turn credits.

Only initial GROWTH/INDUSTRY are transferred. Other social/faction bonuses,
social policy changes, population booms, per-base adjustments, AI and research
planning are excluded. The corrected cost-factor kernels have independent v2
original-executable contracts. Historical mislabeled v1 cases remain unchanged
in their separate provenance catalog and are not counted again.
