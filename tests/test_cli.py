"""CLI smoke tests."""

import json
import subprocess
import sys

import pytest


def test_cli_bell(tmp_path):
    out = tmp_path / "report.json"
    result = subprocess.run(
        [sys.executable, "-m", "qproof.cli", "run", "bell", "--shots", "128", "--seed", "1", "--out", str(out)],
        capture_output=True,
        text=True,
        cwd=".",
    )
    assert result.returncode == 0, result.stderr
    data = json.loads(out.read_text())
    assert data["status"] == "passed"
    assert data["experiment_id"] == "bell-state-v1"


def test_cli_phase():
    result = subprocess.run(
        [sys.executable, "-m", "qproof.cli", "run", "phase"],
        capture_output=True,
        text=True,
        cwd=".",
    )
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data["status"] == "passed"
