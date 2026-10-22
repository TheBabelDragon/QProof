"""CLI smoke tests."""

import json
import subprocess
import sys


def test_cli_bell(tmp_path):
    out = tmp_path / "report.json"
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "qproof.cli",
            "run",
            "bell",
            "--shots",
            "128",
            "--seed",
            "1",
            "--out",
            str(out),
        ],
        capture_output=True,
        text=True,
        cwd=".",
    )
    assert result.returncode == 0, result.stderr
    data = json.loads(out.read_text())
    assert data["status"] == "passed"


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


def test_cli_capabilities():
    result = subprocess.run(
        [sys.executable, "-m", "qproof.cli", "capabilities"],
        capture_output=True,
        text=True,
        cwd=".",
    )
    assert result.returncode == 0
    data = json.loads(result.stdout)
    assert "gates" in data


def test_cli_list():
    result = subprocess.run(
        [sys.executable, "-m", "qproof.cli", "list"],
        capture_output=True,
        text=True,
        cwd=".",
    )
    assert result.returncode == 0
    data = json.loads(result.stdout)
    assert isinstance(data, list) and len(data) >= 4


def test_cli_verify_evidence(tmp_path):
    out = tmp_path / "r.json"
    subprocess.run(
        [sys.executable, "-m", "qproof.cli", "run", "hadamard", "--out", str(out)],
        check=True,
        cwd=".",
    )
    result = subprocess.run(
        [sys.executable, "-m", "qproof.cli", "verify-evidence", str(out)],
        capture_output=True,
        text=True,
        cwd=".",
    )
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data["ok"] is True
