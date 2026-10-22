"""End-to-end evidence integrity and scientific-status layering."""

from __future__ import annotations

import copy
import json
from pathlib import Path

from qproof.evidence import verify_evidence_detailed, verify_report_integrity
from qproof.experiment import run_experiment
from qproof.registry import get_experiment


def test_fresh_experiment_verifies():
    report = run_experiment(get_experiment("hadamard")).to_dict()
    d = verify_evidence_detailed(report)
    assert d["structure"] == "valid"
    assert d["hash_verified"] is True
    assert d["integrity"] == "verified"


def test_legacy_fixture_without_hash_is_unverified():
    """Reports without report_hash stay integrity-unverified (never a silent pass)."""
    path = Path(__file__).resolve().parents[1] / "web" / "evidence" / "hadamard-v1.json"
    report = json.loads(path.read_text())
    # Simulate legacy / incomplete export with hash stripped
    report = copy.deepcopy(report)
    if "integrity" not in report or report["integrity"] is None:
        report["integrity"] = {}
    report["integrity"]["report_hash"] = None
    d = verify_evidence_detailed(report)
    assert d["structure"] == "valid"
    assert d["integrity"] == "unverified"
    assert d["hash_verified"] is False
    assert d["scientific_checks"] == "passed"  # fixture declares scientific pass
    ok, _ = verify_report_integrity(report)
    assert not ok
