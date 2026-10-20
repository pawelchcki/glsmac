# Original evidence scope clarifications

## Citizen jobs: setup has reached MY 2101

The immutable `cases/citizen-job.json` description says “no turn advanced”.
This must not be read as an assertion that the fixture is at MY 2100: the fresh
Quick Start setup has reached MY 2101 before its final Enter opens the base.
Two settled world captures before that Enter and two after closing the base
showed 2101. The final Enter itself did not change the year in that probe.
The world HUD briefly retains 2100 during setup; an immediate screenshot is
insufficient to establish the current turn. An earlier research explanation
incorrectly attributed this stale-label difference to Enter advancing a turn.

This clarifies fixture scope, not observed Worker/Doctor choices, selected rows,
draft/confirm/cancel transitions, keyboard behavior or Psych bonus. Those actual
recorded outputs and their hashes remain unchanged. Original adapter fingerprints
identify the historical capture versions; current setup comments incorporate the
subsequent settled-display clarification. No reference answers were edited.

This contract establishes behavior for that starting size-one base at MY 2101.
It does not establish year-display synchronization or isolate which earlier
startup action caused the year to reach 2101. No candidate output supplied any
original observation.

## Faction setup: isolate labels from editable values

The first 80-case `smacx-gog-2.0-faction-setup.json` recording is retained
unchanged. Six checkpoints read a closing parenthesis as `}` when the OCR
region also contained the adjoining editable value and caret. The affected
cases are `faction-base-1-editors`, `faction-base-2-editors`,
`faction-base-6-editors`, `faction-expansion-2-editors`,
`faction-expansion-4-editors`, and `faction-name-case-spaces`.

`faction_setup_original_v2.py` isolates the shortest rendered region containing
a complete label and delimiter. It rejects ambiguous formatting glyphs and
unbalanced parentheses, without a word dictionary or character substitutions.
Focused values still come from the guarded native control. The original observer
and old reference remain available for provenance. The fresh `smacx-gog-2.0-faction-setup-v2.json` recording contains all 80 cases
from two independent identical original runs and is the reference used by the
passing catalog. Its only output differences are those six label glyphs. Existing observations are
never patched using candidate results or expected source strings.
