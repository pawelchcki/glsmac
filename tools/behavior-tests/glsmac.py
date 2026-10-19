#!/usr/bin/env python3
"""Run shared GLSMAC rule helpers through the probe protocol."""

import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile

from protocol import ProtocolError, load_request, validate_distance_input, write_response


# Contract name -> executable operation, output field, output type.
ALGORITHMS = {
    "map.same_row_distance.v1": ("same_row", "distance", int),
    "map.vector_distance.v1": ("vector", "distance", int),
    "map.raw_vector_distance.v1": ("raw_vector", "distance", int),
    "technology.has_tech.v1": ("has_tech", "has_tech", bool),
    "technology.category.v1": ("category", "category", int),
    "technology.available.v1": ("available", "available", bool),
    "technology.prerequisite.v1": ("prerequisite", "is_prerequisite", bool),
    "economy.human_mineral_factor.v1": ("human_mineral_factor", "factor", int),
    "economy.human_nutrient_factor.v1": ("human_nutrient_factor", "factor", int),
    "economy.basic_production_switch_loss.v1": ("basic_production_switch_loss", "lost", int),
    "unit.prototype_base_cost.v1": ("prototype_base_cost", "rows", int),
}
DIRECTORY = Path(__file__).resolve().parent
ROOT = DIRECTORY.parent.parent


def fields(data, required):
    if not isinstance(data, dict) or set(data) != set(required):
        raise ProtocolError(f"expected input fields {sorted(required)}")


def integer(value, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ProtocolError(f"expected integer in [{minimum}, {maximum}]")
    return value


def prerequisites(value):
    if not isinstance(value, list) or len(value) != 2:
        raise ProtocolError("expected exactly two prerequisites")
    return [integer(item, -2, 88) for item in value]


def technologies(value):
    if not isinstance(value, list) or len(value) > 89:
        raise ProtocolError("expected at most 89 technology rows")
    seen = set()
    result = [len(value)]
    for row in value:
        fields(row, {"id", "prerequisites", "owners"})
        tech_id = integer(row["id"], 0, 88)
        if tech_id in seen:
            raise ProtocolError("duplicate technology id")
        seen.add(tech_id)
        result.extend([tech_id, *prerequisites(row["prerequisites"]), integer(row["owners"], 0, 255)])
    return result


def encode_input(algorithm, data):
    """Validate the entire JSON contract before passing integers to native code."""
    operation = ALGORITHMS[algorithm][0]
    if operation == "same_row":
        validate_distance_input(data)
        values = [data[key] for key in ("width", "x1", "x2", "y")]
    elif operation == "raw_vector":
        fields(data, {"dx", "dy"})
        values = [integer(data[key], -4095, 4095) for key in ("dx", "dy")]
    elif operation == "vector":
        fields(data, {"width", "height", "flat", "x1", "y1", "x2", "y2"})
        width = integer(data["width"], 4, 4096)
        height = integer(data["height"], 2, 4096)
        if width % 2 or type(data["flat"]) is not bool:
            raise ProtocolError("expected even width and boolean flat flag")
        coordinates = []
        for suffix in ("1", "2"):
            x = integer(data["x" + suffix], 0, width - 1)
            y = integer(data["y" + suffix], 0, height - 1)
            if x % 2 != y % 2:
                raise ProtocolError("coordinates must have equal parity")
            coordinates.extend([x, y])
        values = [width, height, int(data["flat"]), *coordinates]
    elif operation == "has_tech":
        fields(data, {"tech_id", "faction_id", "prerequisites", "owners"})
        values = [integer(data["tech_id"], -2, 89), integer(data["faction_id"], 0, 7),
                  *prerequisites(data["prerequisites"]), integer(data["owners"], 0, 255)]
    elif operation == "category":
        fields(data, {"weights"})
        if not isinstance(data["weights"], list) or len(data["weights"]) != 4:
            raise ProtocolError("expected four technology weights")
        values = [integer(value, -32768, 32767) for value in data["weights"]]
    elif operation == "available":
        fields(data, {"tech_id", "faction_id", "expansion_enabled", "technologies"})
        if type(data["expansion_enabled"]) is not bool:
            raise ProtocolError("expected boolean expansion_enabled flag")
        values = [integer(data["tech_id"], 0, 88), integer(data["faction_id"], 0, 7),
                  int(data["expansion_enabled"]), *technologies(data["technologies"])]
    elif operation == "prototype_base_cost":
        fields(data, {"chassis_id", "weapon_id", "armor_id", "triad", "chassis_cost", "missile",
                      "offense", "weapon_mode", "weapon_cost", "armor_cost", "reactor"})
        if type(data["missile"]) is not bool:
            raise ProtocolError("expected boolean missile flag")
        values = [integer(data["chassis_id"], 0, 8), integer(data["weapon_id"], 0, 25),
                  integer(data["armor_id"], 0, 13), integer(data["triad"], 0, 2),
                  integer(data["chassis_cost"], 1, 32), int(data["missile"]),
                  integer(data["offense"], -1, 127), integer(data["weapon_mode"], 0, 14),
                  integer(data["weapon_cost"], 1, 32), integer(data["armor_cost"], 1, 32),
                  integer(data["reactor"], 1, 4)]
    elif operation == "basic_production_switch_loss":
        fields(data, {"base_id", "faction_id", "previous_item", "current_item", "minerals"})
        values = [integer(data["base_id"], 0, 7), integer(data["faction_id"], 1, 7),
                  integer(data["previous_item"], -64, 511), integer(data["current_item"], -64, 511),
                  integer(data["minerals"], 0, 1_000_000)]
    elif operation == "human_nutrient_factor":
        fields(data, {"faction_id", "map_size_level", "nutrient_rule_factor", "growth"})
        values = [integer(data["faction_id"], 1, 7), integer(data["map_size_level"], 0, 4),
                  integer(data["nutrient_rule_factor"], 1, 100), integer(data["growth"], -8, 10)]
    elif operation == "human_mineral_factor":
        fields(data, {"faction_id", "map_size_level", "mineral_rule_factor", "industry"})
        values = [integer(data["faction_id"], 1, 7), integer(data["map_size_level"], 0, 4),
                  integer(data["mineral_rule_factor"], 1, 100), integer(data["industry"], -8, 10)]
    else:
        fields(data, {"ancestor_id", "tech_id", "max_depth", "technologies"})
        values = [integer(data["ancestor_id"], -2, 88), integer(data["tech_id"], -2, 88),
                  integer(data["max_depth"], 0, 5), *technologies(data["technologies"])]
    return operation + " " + " ".join(str(value) for value in values) + "\n"


def run_cases(cases, target):
    rows = "".join(encode_input(case["algorithm"], case["input"]) for case in cases)
    build = DIRECTORY / ".build"
    build.mkdir(exist_ok=True)
    # Separate builds let simultaneous comparisons use their own executable.
    with tempfile.TemporaryDirectory(prefix=f"glsmac-{target}-", dir=build) as temporary:
        executable = Path(temporary) / ("glsmac.cjs" if target == "wasm" else "glsmac")
        compiler = os.environ.get("EMXX", "em++") if target == "wasm" else "g++"
        command = [
            compiler, str(DIRECTORY / "glsmac.cpp"),
            str(ROOT / "src/game/backend/technology/Table.cpp"), f"-I{ROOT / 'src'}",
            "-std=c++17", "-O2", "-Wall", "-Wextra", "-Werror",
        ]
        if target == "wasm":
            command.extend(["-sENVIRONMENT=node", "-sEXIT_RUNTIME=1"])
        command.extend(["-o", str(executable)])
        subprocess.run(command, check=True, stdout=sys.stderr, timeout=120)
        command = ["node", str(executable)] if target == "wasm" else [str(executable)]
        completed = subprocess.run(
            command, input=rows, capture_output=True, text=True, check=True, timeout=30,
        )
        if completed.stderr:
            sys.stderr.write(completed.stderr)
        lines = completed.stdout.splitlines()
        if len(lines) != len(cases) or any(not line.isdecimal() for line in lines):
            raise ProtocolError("Candidate executable returned an invalid response")
        outputs = []
        for case, line in zip(cases, lines):
            _, field, output_type = ALGORITHMS[case["algorithm"]]
            value = int(line)
            if output_type is bool and value not in (0, 1):
                raise ProtocolError("Candidate executable returned an invalid boolean")
            if field == "category" and value not in range(4):
                raise ProtocolError("Candidate executable returned an invalid category")
            outputs.append({field: output_type(value)})
        return outputs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("native", "wasm"), default="native")
    args = parser.parse_args()
    cases = load_request()["cases"]
    supported = [case for case in cases if case["algorithm"] in ALGORITHMS]
    outputs = iter(run_cases(supported, args.target)) if supported else iter(())
    results = []
    for case in cases:
        if case["algorithm"] in ALGORITHMS:
            results.append({"id": case["id"], "status": "ok", "output": next(outputs)})
        else:
            results.append({
                "id": case["id"], "status": "unsupported",
                "reason": f"Unknown GLSMAC candidate contract: {case['algorithm']}",
            })
    write_response({
        "name": "glsmac", "kind": "candidate", "target": args.target,
        "sources": ["src/game/backend/map/tile/Geometry.h", "src/game/backend/technology/Table.cpp",
                    "src/game/backend/base/ProductionCost.h", "src/game/backend/base/NutrientCost.h",
                    "src/game/backend/base/ProductionSwitchCost.h",
                    "src/game/backend/unit/PrototypeCost.h"],
        "algorithms": list(ALGORITHMS),
        "scope": "Bounded geometry, technology, human mineral/nutrient factors, basic switch loss and no-ability prototype base costs; excludes complete economy",
    }, results)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f"GLSMAC adapter failed: {error}", file=sys.stderr)
        sys.exit(1)
