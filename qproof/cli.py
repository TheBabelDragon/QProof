"""Command-line interface for running experiments and emitting JSON reports."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .experiment import (
    ExperimentStatus,
    bell_state_experiment,
    global_phase_experiment,
    run_experiment,
)


BUILTIN = {
    "bell": bell_state_experiment,
    "phase": global_phase_experiment,
}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="qproof",
        description="QProof — run falsifiable quantum state-vector experiments",
    )
    sub = parser.add_subparsers(dest="command")

    run_p = sub.add_parser("run", help="Run a named built-in experiment")
    run_p.add_argument(
        "name",
        choices=list(BUILTIN.keys()),
        help="Experiment name (bell | phase)",
    )
    run_p.add_argument("--shots", type=int, default=None, help="Override shot count")
    run_p.add_argument("--seed", type=int, default=None, help="Override RNG seed")
    run_p.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Write JSON report to this path (default: stdout)",
    )
    run_p.add_argument(
        "--expect-fail",
        action="store_true",
        help="Exit 0 only if the experiment status is FAILED (for negative tests)",
    )

    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_help()
        return 0

    if args.command == "run":
        factory = BUILTIN[args.name]
        kwargs: dict = {}
        if args.name == "bell":
            if args.shots is not None:
                kwargs["shots"] = args.shots
            if args.seed is not None:
                kwargs["seed"] = args.seed
        exp = factory(**kwargs)
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

    return 0


if __name__ == "__main__":
    sys.exit(main())
