#!/usr/bin/env python3
"""Generate multi-menu re-entry inputs; record outcomes from the original."""

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ui.discover import case_for
from ui.probe import validate_input


DIRECTORY = Path(__file__).resolve().parent


def make_suite():
    cases = []

    def add(labels, tail):
        actions = [{"choose": label} for label in labels] + tail
        case = case_for(actions)
        validate_input(case["input"])
        cases.append(case)

    escape = {"key": "Escape"}
    for size in ("TINY PLANET", "HUGE PLANET"):
        route = ["START GAME", "MAKE RANDOM MAP", size]
        add(route, [escape, {"choose": "MAKE RANDOM MAP"}])
        add(route + ["THINKER"], [escape])
        add(route + ["THINKER"], [escape, escape])

    custom = ["START GAME", "CUSTOMIZE RANDOM MAP", "STANDARD PLANET"]
    for choices in (["30-50% OF SURFACE", "STRONG", "RARE", "SPARSE"],
                    ["70-90% OF SURFACE", "WEAK", "ABUNDANT", "DENSE"]):
        for answered in (1, 2, 3):
            add(custom + choices[:answered], [escape, {"choose": "STANDARD PLANET"}])
        add(custom + choices, [escape])

    return {"version": 1, "name": "original-menu-reentry",
            "description": "Reopen size/custom menus after cancellation, return from nondefault difficulty/rules, and cancel after confirmed custom questions. Inputs only.",
            "cases": cases}


if __name__ == "__main__":
    suite = make_suite()
    (DIRECTORY / "cases/reentry.json").write_text(json.dumps(suite, indent=2) + "\n")
    print(f"Generated {len(suite['cases'])} re-entry paths without expected outputs")
