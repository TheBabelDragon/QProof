"""Command-line interface for experiments, capabilities, and evidence verification."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .capabilities import capability_manifest
from .circuit_spec import CircuitSpecError, circuit_from_dict, validate_circuit_dict
from .evidence import verify_evidence_file, verify_report_integrity
from .experiment import ExperimentStatus, run_experiment
from .registry import BUILTIN_FACTORIES, experiment_from_spec, get_experiment, list_experiments
from .campaign import run_campaign


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="qproof",
        description="QProof — capability-first quantum circuit verification",
    )
    sub = parser.add_subparsers(dest="command")

    run_p = sub.add_parser("run", help="Run a named built-in experiment")
    run_p.add_argument(
        "name",
        choices=sorted(BUILTIN_FACTORIES.keys()),
        help="Experiment name",
    )
    run_p.add_argument("--shots", type=int, default=None)
    run_p.add_argument("--seed", type=int, default=None)
    run_p.add_argument("--out", type=Path, default=None)
    run_p.add_argument(
        "--expect-fail",
        action="store_true",
        help="Exit 0 only if status is FAILED",
    )

    run_json = sub.add_parser(
        "run-json",
        help="Run a generic experiment from a JSON experiment file",
    )
    run_json.add_argument("path", type=Path, help="Experiment JSON path")
    run_json.add_argument("--out", type=Path, default=None)

    sub.add_parser("list", help="List built-in experiments")
    sub.add_parser("capabilities", help="Print capability registry JSON")

    val = sub.add_parser("validate-circuit", help="Validate a circuit JSON file")
    val.add_argument("path", type=Path)

    ver = sub.add_parser("verify-evidence", help="Validate evidence structure + integrity hash")
    ver.add_argument("path", type=Path)

    camp = sub.add_parser(
        "campaign",
        help="Run adversarial verification campaign (seeded faults + clean circuits)",
    )
    camp.add_argument("--seed", type=int, default=42)
    camp.add_argument("--circuits", type=int, default=12, help="Random clean circuits")
    camp.add_argument("--max-qubits", type=int, default=3)
    camp.add_argument("--max-gates", type=int, default=8)
    camp.add_argument("--out", type=Path, default=None, help="Directory for report artifacts")
    camp.add_argument(
        "--json",
        action="store_true",
        help="Print full campaign JSON to stdout",
    )

    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_help()
        return 0

    if args.command == "list":
        print(json.dumps(list_experiments(), indent=2))
        return 0

    if args.command == "capabilities":
        print(json.dumps(capability_manifest(), indent=2, sort_keys=True))
        return 0

    if args.command == "validate-circuit":
        data = json.loads(args.path.read_text())
        circ = data.get("circuit", data)
        errs = validate_circuit_dict(circ)
        if errs:
            print(json.dumps({"ok": False, "errors": errs}, indent=2))
            return 1
        print(json.dumps({"ok": True, "errors": []}, indent=2))
        return 0

    if args.command == "verify-evidence":
        result = verify_evidence_file(str(args.path))
        print(json.dumps(result, indent=2))
        return 0 if result["ok"] else 1

    if args.command == "run-json":
        data = json.loads(args.path.read_text())
        try:
            exp = experiment_from_spec(
                experiment_id=data.get("experiment_id", "custom"),
                description=data.get("description", ""),
                claim=data.get("claim", ""),
                circuit_dict=data["circuit"],
                expected_amplitudes=data["expected_amplitudes"],
                shots=int(data.get("shots", 0)),
                seed=data.get("seed"),
                reference_id=data.get("reference_id", "supplied/expected-v1"),
                limitations=data.get("limitations"),
            )
        except (CircuitSpecError, KeyError, ValueError, TypeError) as exc:
            print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
            return 1
        report = run_experiment(exp)
        text = report.to_json()
        if args.out:
            args.out.write_text(text)
            print(f"Wrote {args.out}", file=sys.stderr)
        else:
            print(text)
        return 0 if report.status == ExperimentStatus.PASSED else 1

    if args.command == "run":
        kwargs = {}
        if args.name == "bell":
            if args.shots is not None:
                kwargs["shots"] = args.shots
            if args.seed is not None:
                kwargs["seed"] = args.seed
        exp = get_experiment(args.name, **kwargs)
        report = run_experiment(exp)
        text = report.to_json()
        if args.out:
            args.out.write_text(text)
            print(f"Wrote {args.out}", file=sys.stderr)
        else:
            print(text)
        if args.expect_fail:
            return 0 if report.status == ExperimentStatus.FAILED else 1
        return 0 if report.status == ExperimentStatus.PASSED else 1

    if args.command == "campaign":
        report = run_campaign(
            seed=args.seed,
            n_random_circuits=args.circuits,
            max_qubits=args.max_qubits,
            max_gates=args.max_gates,
            output_dir=str(args.out) if args.out else None,
        )
        metrics = report["metrics"]
        summary = {
            "seed": report["seed"],
            "engine_id": report["engine_id"],
            "detection_rate": metrics["detection_rate"],
            "false_pass_rate": metrics["false_pass_rate"],
            "false_alarm_rate": metrics["false_alarm_rate"],
            "n_clean_pass": metrics["n_clean_pass"],
            "n_clean_fail": metrics["n_clean_fail"],
            "n_total": metrics["n_total"],
            "acceptance": report["acceptance"],
            "campaign_hash": report.get("campaign_hash"),
        }
        if args.json:
            print(json.dumps(report, indent=2, sort_keys=True))
        else:
            print(json.dumps(summary, indent=2, sort_keys=True))
        acc = report.get("acceptance") or {}
        ok = acc.get("overall_ok")
        if ok is None:
            ok = (
                acc.get("detection_rate_ok")
                and acc.get("clean_ok")
                and acc.get("no_false_alarms_on_identity")
            )
        return 0 if ok else 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
