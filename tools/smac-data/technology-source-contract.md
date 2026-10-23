# Installed technology source input

The installed `alphax.txt` `#TECHNOLOGY` block has 89 rows in declaration
order, IDs 0 through 88. It uses nine comma-separated fields per row:

| Position (zero based) | Meaning |
| --- | --- |
| 0 | Display name |
| 1 | Abbreviated identifier token |
| 2 | AI military / power weight |
| 3 | AI technology weight |
| 4 | AI infrastructure / wealth weight |
| 5 | AI colonization / growth weight |
| 6 | First prerequisite token |
| 7 | Second prerequisite token |
| 8 | Nine binary flag characters |

The installed block is ASCII within a Windows-1252 file. Remove comments
beginning with `;`, ignore blank lines and trim surrounding field whitespace.
The next `#` section ends this block. Tokens are identifiers rather than a
fixed-width code: observed source tokens exceed three characters and can contain
`=`. Resolve prerequisite tokens after reading the full table, because they may
refer forward. Installed sentinel spelling is `None` for no prerequisite and
`Disable` for a disabled prerequisite. These correspond to the existing native
Table constants -1 and -2. The final row has native repeatable ID 88.

This synthetic four-row excerpt illustrates field syntax, with no expected
original outcome. A complete table fixture supplies all 89 rows:

```text
#TECHNOLOGY
Foundations,        Root,   1, 2, 3, 4, None, None, 000000000
Synthetic Equation, E=Q7,   5, 6, 7, 8, Later, Root, 000000010
Later Studies,      Later,  0, 9, 2, 1, Root, None, 000000000
Excluded Study,     Closed, 3, 2, 1, 0, Disable, None, 000000000
```

Native Table weights are ordered growth, technology, wealth, power, so the
source weight columns project as 5, 3, 4, 2. Flags are retained source input;
this contract establishes no flag effects. Unknown references, duplicate tokens,
malformed row counts/fields, invalid weights and malformed flags require explicit
handling by the importer; no original malformed-input behavior is claimed.

The application computes and validates the complete ownership plan before
queuing any world-creation events. The host sends owned scalar arrays through
the existing event codec. Recipients validate and apply that plan independently
of their locally installed rules; this is a bounded transfer check, not complete
multiplayer synchronization. Interactive opening accepts initialization during
its preparing phase, and the native reset clears both table and initialization
marker before the same Game can start another session.

This source schema is separate from original-executable behavior observations.
It does not establish research choice filtering, ordering, cost, progress,
acquisition, random exclusion, faction bonuses or UI behavior. No installed
asset table bodies belong in version control.
