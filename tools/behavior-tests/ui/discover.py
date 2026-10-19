#!/usr/bin/env python3
"""Discover bounded menu paths from the actual original application's controls.

This creates test *inputs*, never expected outputs. Use compare.py record to
capture independent repeated original runs before replaying the reproduction.
"""

import argparse
from collections import deque
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError, canonical
from ui.drivers import OriginalDriver
from ui.probe import ALGORITHM, run_case, validate_input
from ui.vision import MenuVision, VisionError


DIRECTORY = Path(__file__).resolve().parent
# Terminal actions leave the currently supported menu observer. They remain
# explicitly listed as untested, rather than counted as covered by discovery.
TERMINAL = {"EXIT GAME", "QUICK START", "CREATE SCENARIO", "EDIT SCENARIO"}


def case_for(actions):
    digest = hashlib.sha256(canonical(actions).encode()).hexdigest()[:12]
    return {"id": "menu-" + digest, "algorithm": ALGORITHM, "input": {"actions": actions}}


def discover(driver, vision, artifacts, max_cases=64, max_depth=9, timeout=8,
             start_with=(), context_depth=2):
    initial = [{"choose": label} for label in start_with]
    queue = deque([initial])
    queued = {canonical(initial)}
    seen_menus, seen_contexts = set(), set()
    cases, blocked, excluded = [], [], []
    attempted = 0
    while queue and attempted < max_cases:
        actions = queue.popleft()
        case = case_for(actions)
        attempted += 1
        try:
            output = run_case(driver, vision, case, artifacts / case["id"], timeout)
            if not output["completed"]:
                raise VisionError(str(output["failure"]))
        except (VisionError, ProtocolError) as error:
            blocked.append({"case": case, "reason": str(error)})
            print(f"UNOBSERVED {case['id']}: {error}", file=sys.stderr, flush=True)
            continue
        cases.append(case)
        state = output["trace"][-1]
        print(f"DISCOVERED {case['id']}: {state['caption'] or ', '.join(state['entries'][:2])}",
              file=sys.stderr, flush=True)
        identity = canonical({key: state[key] for key in ("caption", "entries")})
        seen_menus.add(identity)
        # Identical visible size menus lead to different flows after Random
        # Map and Customize Random Map. Preserve a bounded route context.
        route = [action["choose"] for action in actions if "choose" in action][:context_depth]
        context = canonical([identity, route])
        # Arrow/Escape probes are observations of a path, not new graph roots.
        if actions and "key" in actions[-1]:
            continue
        if context in seen_contexts:
            continue
        seen_contexts.add(context)
        if len(actions) >= max_depth:
            excluded.append({"path": actions, "reason": "depth budget"})
            continue
        extensions = []
        for entry in state["entries"]:
            if entry in TERMINAL:
                excluded.append({"path": actions + [{"choose": entry}], "reason": "outside menu observer"})
            else:
                extensions.append([{"choose": entry}])
        # Check selection and return paths on every newly observed menu.
        extensions.extend([[{"key": "ArrowUp"}], [{"key": "ArrowDown"}],
                           [{"key": "ArrowDown"}, {"key": "ArrowUp"}]])
        if actions:
            extensions.append([{"key": "Escape"}])
        for extension in extensions:
            path = actions + extension
            key = canonical(path)
            if key not in queued:
                queued.add(key)
                queue.append(path)
    suite = {"version": 1, "name": "original-menu-discovery",
             "description": "Real original menu paths, visible choices, highlight navigation and cancellation.",
             "cases": cases}
    coverage = {"kind": "bounded-original-ui-discovery", "attempted": attempted,
                "observed_cases": len(cases), "distinct_menus": len(seen_menus),
                "explored_contexts": len(seen_contexts), "context_depth": context_depth,
                "unobserved": blocked, "excluded": excluded,
                "pending_paths": list(queue), "complete": not queue and not blocked and not excluded}
    return suite, coverage


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=os.environ.get("SMAC_ASSETS_DIR"))
    parser.add_argument("--wine", default=os.environ.get("SMAC_WINE", "wine"))
    parser.add_argument("--max-cases", type=int, default=64)
    parser.add_argument("--max-depth", type=int, default=9)
    parser.add_argument("--timeout", type=float, default=8)
    parser.add_argument("--start-with", action="append", default=[], help="initial visible choice (repeat for a path)")
    parser.add_argument("--context-depth", type=int, default=2, help="number of route choices retained for deduplication")
    parser.add_argument("--output", type=Path, default=DIRECTORY.parent / ".build/ui/discovered.json")
    args = parser.parse_args()
    wine = shutil.which(args.wine)
    if not wine or not args.assets or not args.assets.is_dir():
        raise ProtocolError("provide --assets/SMAC_ASSETS_DIR and --wine/SMAC_WINE")
    if (not 1 <= args.max_cases <= 1000 or not 1 <= args.max_depth <= 22
            or not 0 < args.timeout <= 120 or not 0 <= args.context_depth <= 24
            or len(args.start_with) > args.max_depth):
        raise ProtocolError("invalid discovery budget")
    validate_input({"actions": [{"choose": label} for label in args.start_with]})
    artifacts = args.output.resolve().parent / "discovery-artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    vision = MenuVision()
    driver = None
    try:
        driver = OriginalDriver(args.assets.resolve(), wine, artifacts)
        suite, coverage = discover(driver, vision, artifacts, args.max_cases, args.max_depth, args.timeout,
                                   args.start_with, args.context_depth)
        if not suite["cases"]:
            raise ProtocolError("discovery observed no executable cases")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(suite, indent=2) + "\n")
        args.output.with_suffix(".coverage.json").write_text(json.dumps(coverage, indent=2) + "\n")
        print(f"{len(suite['cases'])} observed paths, {coverage['distinct_menus']} menus, "
              f"{len(coverage['unobserved'])} unobserved paths, {len(coverage['pending_paths'])} pending; "
              "no parity score or reference answers generated", file=sys.stderr)
    finally:
        if driver:
            driver.close()
        vision.close()


if __name__ == "__main__":
    try:
        main()
    except (OSError, ProtocolError, VisionError, ImportError) as error:
        print(f"UI discovery failed: {error}", file=sys.stderr)
        sys.exit(1)
