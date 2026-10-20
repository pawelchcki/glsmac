#!/usr/bin/env python3
"""Record, validate or replay the original-application UI reference catalog."""

import argparse
import os
from pathlib import Path
import shlex
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audit
import compare
from protocol import ProtocolError
from ui.drivers import ROOT


DIRECTORY = Path(__file__).resolve().parent


def size_keyboard_command(args):
    target = "original" if args.record else "browser" if args.browser else "headless"
    command = [sys.executable, str(DIRECTORY / "size_keyboard.py"), "--target", target]
    if target != "headless":
        command += ["--assets", str(args.assets.resolve()), "--wine", args.wine,
                    "--build", str(args.build.resolve()), "--timeout", str(args.step_timeout)]
    return shlex.join(command)


def citizen_job_command(args):
    if args.browser:
        raise ProtocolError("citizen-job comparisons use the pixel-free adapter; rendered gameplay is tested separately")
    if args.record:
        command = [sys.executable, str(DIRECTORY / "citizen_job_original.py"),
                   "--assets", str(args.assets.resolve()), "--wine", args.wine]
    else:
        command = [sys.executable, str(DIRECTORY / "citizen_job_headless.py")]
    return shlex.join(command)


def unit_orders_command(args):
    if args.browser:
        raise ProtocolError("unit-orders uses the pixel-free adapter; rendered order transfer is still pending")
    if args.record:
        command = [sys.executable, str(DIRECTORY / "unit_orders_original.py"),
                   "--assets", str(args.assets.resolve()), "--wine", args.wine,
                   "--artifacts", str(DIRECTORY.parent / ".build/unit-orders-original"),
                   "--timeout", str(args.step_timeout)]
    else:
        command = [sys.executable, str(DIRECTORY / "unit_orders_headless.py")]
    return shlex.join(command)


def dimension_dialog_command(args):
    if args.browser:
        raise ProtocolError("dimension-dialog uses pixel-free replay; actual browser controls are tested separately")
    name = "dimension_dialog_original.py" if args.record else "dimension_dialog_headless.py"
    command = [sys.executable, str(DIRECTORY / name)]
    if args.record:
        command += ["--assets", str(args.assets.resolve()), "--wine", args.wine,
                    "--timeout", str(args.step_timeout)]
    return shlex.join(command)


def size_kind_command(args):
    if args.browser:
        raise ProtocolError("custom-size-kind uses pixel-free replay; actual browser integration is separate")
    command = [sys.executable, str(DIRECTORY / ("size_kind_original.py" if args.record else "size_kind_headless.py"))]
    if args.record:
        command += ["--assets", str(args.assets.resolve()), "--wine", args.wine, "--timeout", str(args.step_timeout)]
    return shlex.join(command)


def large_map_command(args):
    if args.browser:
        raise ProtocolError("large-map-warning uses pixel-free replay; rendered setup is checked separately")
    name = "large_map_original.py" if args.record else "large_map_headless.py"
    command = [sys.executable, str(DIRECTORY / name)]
    if args.record:
        command += ["--assets", str(args.assets.resolve()), "--wine", args.wine, "--timeout", str(args.step_timeout)]
    return shlex.join(command)


def world_dimensions_command(args):
    if args.browser:
        raise ProtocolError("custom-grid-dimensions uses native display-free replay; generated browser worlds are checked separately")
    name = "world_dimensions_original.py" if args.record else "world_dimensions_headless.py"
    command = [sys.executable, str(DIRECTORY / name)]
    if args.record:
        command += ["--assets", str(args.assets.resolve()), "--wine", args.wine, "--timeout", str(args.step_timeout)]
    return shlex.join(command)


def faction_setup_command(args):
    if args.browser:
        raise ProtocolError('faction setup uses display-free replay; real browser integration is separate')
    name = 'faction_setup_original_v2.py' if args.record else 'faction_setup_headless.py'
    command = [sys.executable, str(DIRECTORY / name)]
    if args.record:
        command += ['--assets', str(args.assets.resolve()), '--wine', args.wine, '--timeout', str(args.step_timeout)]
    else:
        command += ['--jobs', str(min(args.jobs, 2))]
    return shlex.join(command)


def faction_identity_command(args):
    if args.browser:
        raise ProtocolError('identity comparisons use display-free replay; native gameplay handoff is checked separately')
    name = 'faction_identity_original.py' if args.record else 'faction_identity_headless.py'
    command = [sys.executable, str(DIRECTORY / name)]
    if args.record:
        command += ['--assets', str(args.assets.resolve()), '--wine', args.wine, '--timeout', str(args.step_timeout)]
    else:
        command += ['--jobs', str(min(args.jobs, 2))]
    return shlex.join(command)


def faction_ratings_command(args):
    if args.browser:
        raise ProtocolError('initial rating comparisons use display-free replay; native gameplay effects are checked separately')
    name = 'faction_ratings_original.py' if args.record else 'faction_ratings_headless.py'
    command = [sys.executable, str(DIRECTORY / name)]
    if args.record:
        command += ['--assets', str(args.assets.resolve()), '--wine', args.wine, '--timeout', str(args.step_timeout)]
    else:
        command += ['--jobs', str(min(args.jobs, 2))]
    return shlex.join(command)


def startup_inventory_command(args, sources=False):
    if args.browser:
        raise ProtocolError('startup inventory uses native display-free replay')
    prefix = 'startup_inventory_sources' if sources else 'startup_inventory'
    name = prefix + ('_original.py' if args.record else '_headless.py')
    command = [sys.executable, str(DIRECTORY / name)]
    if args.record:
        command += ['--assets', str(args.assets.resolve()), '--wine', args.wine, '--timeout', str(args.step_timeout)]
    else:
        command += ['--jobs', str(min(args.jobs, 2))]
    return shlex.join(command)


def former_work_command(args):
    if args.browser:
        raise ProtocolError('Former work effects use native display-free replay; rendered controls are checked separately')
    name = 'former_work_original.py' if args.record else 'former_work_headless.py'
    command = [sys.executable, str(DIRECTORY / name)]
    if args.record:
        command += ['--assets', str(args.assets.resolve()), '--wine', args.wine, '--timeout', str(args.step_timeout)]
    return shlex.join(command)


def former_movement_command(args):
    if args.browser:
        raise ProtocolError('Road movement uses native display-free replay; browser controls are checked separately')
    name = 'former_movement_original.py' if args.record else 'former_movement_headless.py'
    command = [sys.executable, str(DIRECTORY / name)]
    if args.record:
        command += ['--assets', str(args.assets.resolve()), '--wine', args.wine, '--timeout', str(args.step_timeout),
                    '--artifacts', str(DIRECTORY.parent / '.build/former-movement-original')]
    return shlex.join(command)


def road_network_command(args):
    if args.browser:
        raise ProtocolError('Road network uses native display-free replay; rendered controls are checked separately')
    name = 'road_network_original.py' if args.record else 'road_network_headless.py'
    command = [sys.executable, str(DIRECTORY / name)]
    if args.record:
        command += ['--assets', str(args.assets.resolve()), '--wine', args.wine, '--timeout', str(args.step_timeout),
                    '--artifacts', str(DIRECTORY.parent / '.build/road-network-original')]
    return shlex.join(command)



def unit_selection_command(args, waiting=False):
    if args.browser:
        raise ProtocolError('Unit selection uses native display-free replay; real browser controls are checked separately')
    name = ('unit_wait_original.py' if waiting else 'unit_selection_original.py') if args.record else 'unit_selection_headless.py'
    command = [sys.executable, str(DIRECTORY / name)]
    if args.record:
        command += ['--assets', str(args.assets.resolve()), '--wine', args.wine, '--timeout', str(args.step_timeout),
                    '--artifacts', str(DIRECTORY.parent / '.build/unit-selection-original')]
    return shlex.join(command)


def unit_activation_command(args):
    if args.browser:
        raise ProtocolError('Activation picker uses native display-free replay; real browser controls are checked separately')
    name = 'unit_activation_original.py' if args.record else 'unit_activation_headless.py'
    command = [sys.executable, str(DIRECTORY / name)]
    if args.record:
        command += ['--assets', str(args.assets.resolve()), '--wine', args.wine, '--timeout', str(args.step_timeout),
                    '--artifacts', str(DIRECTORY.parent / '.build/unit-activation-original')]
    return shlex.join(command)


def unit_sentry_command(args):
    if args.browser:
        raise ProtocolError('Sentry uses native display-free replay; real browser controls are checked separately')
    name = 'unit_sentry_original.py' if args.record else 'unit_sentry_headless.py'
    command = [sys.executable, str(DIRECTORY / name)]
    if args.record:
        command += ['--assets', str(args.assets.resolve()), '--wine', args.wine, '--timeout', str(args.step_timeout),
                    '--artifacts', str(DIRECTORY.parent / '.build/unit-sentry-original')]
    return shlex.join(command)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--record", action="store_true", help="capture two independent identical original runs")
    mode.add_argument("--validate-only", action="store_true", help="validate evidence without executing either app")
    parser.add_argument("--force", action="store_true", help="explicitly replace existing evidence when recording")
    parser.add_argument("--browser", action="store_true", help="optional rendered integration replay")
    parser.add_argument("--render-smoke", action="store_true", help="render a small selection covering real menu inputs")
    parser.add_argument("--case", action="append", help="replay selected case IDs after validating their full reference")
    parser.add_argument("--reference-python", default=os.environ.get("SMAC_REFERENCE_PYTHON", sys.executable))
    parser.add_argument("--suite", action="append")
    parser.add_argument("--pending", action="store_true", help="strictly replay recorded contracts still awaiting transfer; failures remain failures")
    parser.add_argument("--assets", type=Path, default=os.environ.get("SMAC_ASSETS_DIR"))
    parser.add_argument("--wine", default=os.environ.get("SMAC_WINE", "wine"))
    parser.add_argument("--build", type=Path, default=Path(os.environ.get("WASM_APP_DIR", ROOT / "build/wasm-release/bin")))
    parser.add_argument("--jobs", type=int, help="workers (default: browser 1, otherwise 2)")
    parser.add_argument("--step-timeout", type=float, help="settling deadline (browser 20s, otherwise 8s)")
    parser.add_argument("--timeout", type=float, default=600)
    parser.add_argument("--report", type=Path, default=DIRECTORY.parent / ".build/ui/parity.json")
    args = parser.parse_args(argv)
    rendered_cases = None
    if args.render_smoke:
        if args.record or args.suite or args.case:
            raise ProtocolError("--render-smoke selects its own replay suite and cases")
        args.browser = True
        rendered_cases = compare.read_json(DIRECTORY / "render-smoke.json")["suites"]
        args.suite = list(rendered_cases)
    if args.case and (args.record or not args.suite or len(args.suite) != 1):
        raise ProtocolError("--case requires exactly one --suite and cannot replace evidence")
    if args.jobs is None:
        args.jobs = 1 if args.browser else 2
    if args.step_timeout is None:
        args.step_timeout = 20 if args.browser else 8
    started = time.perf_counter()
    if (not 1 <= args.jobs <= 4 or not 0 < args.step_timeout <= 120 or not 0 < args.timeout <= 1800
            or args.force and not args.record):
        raise ProtocolError("invalid worker/time budgets or --force without --record")
    if args.pending and args.render_smoke:
        raise ProtocolError("pending contracts are separate from the rendered passing profile")
    references = audit.load_references(DIRECTORY / ("pending-catalog.json" if args.pending else "catalog.json"), allow_empty=args.pending)
    if args.suite:
        unknown = set(args.suite) - {reference["id"] for reference in references}
        if unknown:
            raise ProtocolError(f"unknown UI suites: {sorted(unknown)}")
        references = [reference for reference in references if reference["id"] in args.suite]
    command = None
    if not args.validate_only and (args.record or args.browser):
        if not args.assets or not args.assets.is_dir():
            raise ProtocolError("set SMAC_ASSETS_DIR or --assets to a local original installation")
        command = shlex.join([sys.executable, str(DIRECTORY / "probe.py"),
                              "--target", "original" if args.record else "browser",
                              "--assets", str(args.assets.resolve()), "--wine", args.wine,
                              "--build", str(args.build.resolve()), "--jobs", str(args.jobs),
                              "--timeout", str(args.step_timeout)])
    elif not args.validate_only:
        command = shlex.join([sys.executable, str(DIRECTORY / "headless.py"), "--jobs", str(args.jobs)])
    if not references:
        command = None
        print("No recorded contracts are currently pending transfer; apps not executed.", flush=True)
    # Reject missing/corrupt evidence or accidental overwrites before booting apps.
    for reference in references:
        suite = compare.read_json(DIRECTORY / reference["cases"])
        if args.browser and any(case["algorithm"] not in ("ui.menu_trace.v1", "ui.map_size_keyboard.v1") for case in suite["cases"]):
            raise ProtocolError("browser replay supports menu traces and map-size keyboard; use headless replay for custom-map")
        if args.record:
            if (DIRECTORY / reference["observations"]).exists() and not args.force:
                raise ProtocolError("observation file already exists; choose --force explicitly to replace it")
        else:
            evidence = compare.read_json(DIRECTORY / reference["observations"])
            compare.validate_observations(evidence, suite)
            case_ids = rendered_cases[reference["id"]] if rendered_cases else args.case
            if case_ids:
                compare.select_cases(suite, evidence, case_ids)
    results = []
    for reference in references:
        if args.record:
            suite = compare.read_json(DIRECTORY / reference["cases"])
            reference_command = command
            if reference["id"] == "size-keyboard":
                reference_command = size_keyboard_command(args)
            if reference["id"] == "custom-map":
                reference_command = shlex.join([args.reference_python, str(DIRECTORY / "original_headless.py"),
                                                "--exe", str(args.assets.resolve() / "terranx.exe")])
            if reference["id"] == "citizen-job":
                reference_command = citizen_job_command(args)
            if reference["id"] == "unit-orders":
                reference_command = unit_orders_command(args)
            if reference["id"] in ("dimension-dialog", "dimension-caption-sources"):
                reference_command = dimension_dialog_command(args)
            if reference["id"] == "custom-size-kind":
                reference_command = size_kind_command(args)
            if reference["id"] in ("large-map-warning", "large-map-warning-navigation", "large-map-warning-odd-heights"):
                reference_command = large_map_command(args)
            if reference["id"] == "custom-grid-dimensions":
                reference_command = world_dimensions_command(args)
            if reference["id"] in ("faction-setup", "faction-random-customization"):
                reference_command = faction_setup_command(args)
            if reference['id'] == 'faction-identity':
                reference_command = faction_identity_command(args)
            if reference['id'] == 'faction-ratings':
                reference_command = faction_ratings_command(args)
            if reference['id'] == 'startup-inventory':
                reference_command = startup_inventory_command(args)
            if reference['id'] == 'startup-inventory-sources':
                reference_command = startup_inventory_command(args, sources=True)
            if reference['id'] in ('former-work-core', 'former-work-basic', 'former-work-edge', 'former-work-timing'):
                reference_command = former_work_command(args)
            if reference['id'] == 'former-movement':
                reference_command = former_movement_command(args)
            if reference['id'] == 'road-network':
                reference_command = road_network_command(args)
            if reference['id'].startswith('unit-selection-') or reference['id'].startswith('unit-wait-'):
                reference_command = unit_selection_command(args, waiting=reference['id'].startswith('unit-wait-'))
            if reference['id'] == 'unit-activation':
                reference_command = unit_activation_command(args)
            if reference['id'] == 'unit-sentry':
                reference_command = unit_sentry_command(args)
            record = compare.capture_reference(suite, reference_command, timeout=args.timeout)
            compare.write_json(DIRECTORY / reference["observations"], record, overwrite=args.force)
            print(f"RECORDED {reference['id']}: {len(suite['cases'])} original traces, two identical runs", flush=True)
        else:
            case_ids = rendered_cases[reference["id"]] if rendered_cases else args.case
            candidate_command = size_keyboard_command(args) if command is not None and reference["id"] == "size-keyboard" else command
            if command is not None and reference["id"] == "citizen-job":
                candidate_command = citizen_job_command(args)
            if command is not None and reference["id"] == "unit-orders":
                candidate_command = unit_orders_command(args)
            if command is not None and reference["id"] in ("dimension-dialog", "dimension-caption-sources"):
                candidate_command = dimension_dialog_command(args)
            if command is not None and reference["id"] == "custom-size-kind":
                candidate_command = size_kind_command(args)
            if command is not None and reference["id"] in ("large-map-warning", "large-map-warning-navigation", "large-map-warning-odd-heights"):
                candidate_command = large_map_command(args)
            if command is not None and reference["id"] == "custom-grid-dimensions":
                candidate_command = world_dimensions_command(args)
            if command is not None and reference["id"] in ("faction-setup", "faction-random-customization"):
                candidate_command = faction_setup_command(args)
            if command is not None and reference['id'] == 'faction-identity':
                candidate_command = faction_identity_command(args)
            if command is not None and reference['id'] == 'faction-ratings':
                candidate_command = faction_ratings_command(args)
            if command is not None and reference['id'] == 'startup-inventory':
                candidate_command = startup_inventory_command(args)
            if command is not None and reference['id'] == 'startup-inventory-sources':
                candidate_command = startup_inventory_command(args, sources=True)
            if command is not None and reference['id'] in ('former-work-core', 'former-work-basic', 'former-work-edge', 'former-work-timing'):
                candidate_command = former_work_command(args)
            if command is not None and reference['id'] == 'former-movement':
                candidate_command = former_movement_command(args)
            if command is not None and reference['id'] == 'road-network':
                candidate_command = road_network_command(args)
            if command is not None and (reference['id'].startswith('unit-selection-') or reference['id'].startswith('unit-wait-')):
                candidate_command = unit_selection_command(args, waiting=reference['id'].startswith('unit-wait-'))
            if command is not None and reference['id'] == 'unit-activation':
                candidate_command = unit_activation_command(args)
            if command is not None and reference['id'] == 'unit-sentry':
                candidate_command = unit_sentry_command(args)
            result = audit.check_reference(reference, candidate_command, args.timeout, directory=DIRECTORY, case_ids=case_ids)
            results.append(result)
            counts = result.get("comparison", {}).get("summary")
            print(f"{reference['id']}: {counts if counts is not None else 'evidence valid; apps not executed'}", flush=True)
    if args.record:
        return 0
    summary = {"reference_cases": sum(result["cases"] for result in results),
               "candidate_executed": command is not None}
    if command is not None:
        for status in ("matched", "mismatched", "unsupported", "errors"):
            summary[status] = sum(result["comparison"]["summary"][status] for result in results)
    compare.write_json(args.report, {
        "version": 1, "kind": "original-ui-evidence-validation" if args.validate_only else "original-ui-parity",
        "scope": "Recorded contracts awaiting transfer; an empty queue does not establish full-game parity" if args.pending else "Recorded menus/setup/source text, bounded native identity/ratings/inventory, selected map dimensions, citizen jobs, Scout orders, Former work/roads, unit selection/waiting and activation pickers; not full-game parity",
        "pending_transfer": args.pending,
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
        "summary": summary, "results": results,
    }, overwrite=True)
    if command is None:
        return 0
    return 2 if summary["errors"] else int(summary["mismatched"] > 0 or summary["unsupported"] > 0)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ProtocolError) as error:
        print(f"UI campaign failed: {error}", file=sys.stderr)
        sys.exit(2)
