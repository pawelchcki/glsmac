# Paused-turn starting Scout orders

`ui.unit_orders.v1` compares the visible effects of four commands on one
stationary owned land Scout in its first base. Each sequence starts in a fresh
original Quick Start after the first-base setup at MY 2101, with full movement
and no existing order. The actual Preferences dialog enables **Pause at end of
turn** and disables tutorial messages. The first-base tutorial is dismissed.

Inputs contain only `actions`, a list of at most twelve commands:

- `hold`: H, the original Hold This Position command.
- `activate`: A, the original Activate (Move Now) command.
- `skip`: Space, the original Skip Turn command.
- `advance`: Enter after Hold or Skip, at most twice per sequence.
- `close_base`: click OK in the actual base screen opened by an idle Space.

The output is a `trace` with an initial checkpoint and one checkpoint after each
command. Each checkpoint contains `screen` (`world` or `base`) and integer `year_delta`,
read from the actual mission year relative to the initial checkpoint. World
checkpoints additionally contain `movement_label` and `order_label`, read from
the actual unit preview. Base checkpoints omit the occluded unit labels. An
order key delivered while the base screen is open is observed there; the adapter
must not silently close the modal or route it directly to a unit event. Labels are uppercase with normalized
whitespace. The source of answers is repeated rendered original-game execution,
not a reconstruction of its unit rules. See `cases/unit-orders.json` and its
separately recorded observations for the input/output pairs.

Candidate replay must execute the shipped controls/preview and real native
units with shipped command and per-turn callbacks. Display, artwork, audio,
terrain and event-loop delivery may be controlled boundaries. Explicit turn
delivery must advance the actual turn manager and run actual unit-turn callbacks;
assigning the expected year or movement after a command is not candidate replay.

This is a bounded command-effect contract. It does not establish selection among
multiple units, default automatic end-turn, game preference UI parity, Sentry,
Alert, timed holds, healing, movement costs, combat, other unit types, original
save formats, networking or complete turn/economy ordering. Native write guards,
identity validation, rollback, snapshot preservation, control lifetime and
selection readiness are separately checked GLSMAC application invariants.
