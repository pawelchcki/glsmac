# Sea V3 re-audit with height helper v6

This is a read-only successor on PR38 head `7d6b12cc`, using height helper
`4756fdf5…f1e2b`. It revalidates the same historical Sea capture, not a new game
execution. The capture remains source7d26149a/Native115/historical Default25/v6.
The c49-bound typed result, proof and independent audit are unchanged. New result
files and `terraform-sea-height-v3-helper-v6-proof.json` identify both successor
source versions separately.

The first successor passed the actual CLI and20 retained checks, with20 public
checks separate. Source review then demonstrated that coherent input and all six
payer ledgers could claim `initialized=false` or `last_income_turn=1`. This
contradicts the authored initialization event. The final auditor requires actual
Bool true and exact Int0, alongside existing typed source funding, actor/payer,
position, quote, complete expected-world and bootstrap joins. The final actual
CLI passes;21 public checks and the focused public+retained changed negative
pass. No full retained21 rerun is claimed. Its first retained negative had a
test-only `p0` lookup error; the corrected test resolves raw owner0 to the actual
logical native ID. No assertion, captured input or world was relaxed.

The new parser retains the actual exit marker, allowing the shared helper to
bound the final P carrier. Its source-bound partial order is Native output,
then that checkpoint's matching trace carrier, then next Native/exit. Physical
input happened earlier. No universal packet-before-native ordering is inferred.
The new helper also exhausts every raw pointer button action against the eight
reported physical clicks. Existing Sea code already rejected coherent foreign
actor, remote position and contradictory funding; new regressions preserve those
joins rather than introducing another domain implementation.

Both successor CLIs retain six full worlds, first five pure,71 exact changed
fields,96 native Float checks, source cost40/prefill43/credit1/overflow4, five
frames,919 continuous callbacks,51 lossless trace packets/80475 events, eight
physical clicks, genuine Node OS0/APP0 and owned reaping. All raw/report/outer
receipts remain unchanged. The accepted scope and unsupported original, numeric
mesh, camera, animation/audio, coast/conversion/Lower and physical-movement
claims remain those in the historical proof.

Reproduce with the existing Sea auditor CLI, selecting a NEW output path; it
refuses to replace previous results. Public CI should select `-k PublicSea`
without private capture environment variables. Private retained checks require
`TERRAFORM_SEA_HEIGHT_CAPTURE` and `TERRAFORM_SEA_SOURCE_ROOT`. Public check counts
are not private evidence or additional browser cases. Shared CI/catalog wiring
and publication remain Delivery's responsibility.
