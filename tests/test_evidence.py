"""Evidence structure and integrity verification."""

import json

from qproof import run_experiment, verify_report_integrity
from qproof.evidence import aggregate_status, validate_evidence_structure
from qproof.experiment import bell_state_experiment


def test_report_structure_valid():
    report = run_experiment(bell_state_experiment(shots=32, seed=0))
    data = json.loads(report.to_json())
    assert validate_evidence_structure(data) == []
    ok, detail = verify_report_integrity(data)
    assert ok, detail


def test_tampered_hash_detected():
    report = run_experiment(bell_state_experiment(shots=0))
    data = json.loads(report.to_json())
    data["results"]["fidelity"] = 0.0  # tamper without updating hash
    ok, detail = verify_report_integrity(data)
    assert not ok
    assert "mismatch" in detail or "hash" in detail.lower()


def test_missing_field_detected():
    data = {"schema_version": "1.0.0", "status": "passed"}
    errs = validate_evidence_structure(data)
    assert any("missing" in e for e in errs)


def test_aggregate_status():
    assert aggregate_status(["passed", "passed"]) == "passed"
    assert aggregate_status(["passed", "failed"]) == "failed"
    assert aggregate_status(["passed", "inconclusive"]) == "inconclusive"
    assert aggregate_status([]) == "inconclusive"
