# `ui.custom_size_kind.v1`

Inputs declare random/custom setup, an optional earlier named preset (ordinal
0..4), a close action (`wait`, focused-field Enter, OK, Escape or Cancel), and
whether to return through setup. Every original case starts a fresh game process
and INI in an isolated Wine prefix. Sources and executable use the existing
pinned GOG Alien Crossfire 2.0 profile.

Each checkpoint observes actual visible dialog/menu text, actual highlight and
the original's setup size-kind scalar. The scalar is read without modification
at image RVA `0x54A2A0`, the same field used by the existing bounded original
custom-planet and human cost-factor adapters. The observer finds exactly one
owned `terranx.exe` process under its unique private Wine prefix, verifies that
its executable image mapping names the private pinned binary and starts with
an MZ header, then reads only four bytes. Launcher processes are never treated
as the game. Process IDs, memory mappings and unrelated values are not outputs.
The checkpoint starts after explicitly entering Custom Size; unmaterialized
initial setup storage is outside this contract.

Values 0..4 identify named sizes and 99 identifies custom setup in the observed
original context. The size menu's remembered highlight is a separate observable;
this contract does not equate it with the current setup kind. Outputs come from
actual original memory and independent OCR, never from the reproduction or case
inputs. Recording requires two complete identical independent passes.

Candidate replay uses real native Rules and MapSettings and actual production
menu/popup callbacks, with display, audio and synchronous timer delivery replaced.
Synthetic text declares equivalent functional menu names and installed preset
dimensions. Dialog values and native settings are read directly. Missing,
duplicate, reordered, incomplete and runtime-error traces fail strictly.

This contract observes untouched fields and configuration/navigation only.
Edited-input filtering, validation, warning thresholds, resulting map coordinate
units, generated terrain, save/load and complete original gameplay remain
separate requirements. Human factor comparisons for kind 99 require separately
recorded original-function evidence; this UI contract alone proves no arithmetic.
