#!/usr/bin/env python3
"""Generate custom-map response sequences, never expected behavior."""

import itertools
import json
from pathlib import Path


def make_suite():
    cases = []
    def add(name, choices, preferences=(1, 1, 1, 1)):
        cases.append({"id": name, "algorithm": "ui.custom_planet.v1",
                      "input": {"choices": list(choices), "preferences": list(preferences)}})
    for preferences in itertools.product(range(3), repeat=4):
        add("preferences-" + "".join(map(str, preferences)), (0, 1, 2), preferences)
    for choices in itertools.product(range(3), repeat=4):
        add("confirm-" + "".join(map(str, choices)), choices)
    for length in range(4):
        for prefix in itertools.product(range(3), repeat=length):
            add("cancel-" + ("".join(map(str, prefix)) or "initial"), (*prefix, -1))
    for length in range(3):
        for prefix in itertools.product(range(3), repeat=length):
            add("prefix-" + ("".join(map(str, prefix)) or "initial"), prefix)
    return {"version": 1, "name": "original-custom-planet-controller",
            "description": "All 81 response combinations, all 81 preference vectors, every cancellation prefix and partial input waits. Graphics are excluded.",
            "cases": cases}


if __name__ == "__main__":
    destination = Path(__file__).with_name("cases") / "custom-map.json"
    destination.write_text(json.dumps(make_suite(), indent=2) + "\n")
