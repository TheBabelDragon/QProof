"""End-to-end evidence: hashes, scientific independence, legacy unverified."""

from __future__ import annotations

import json
from pathlib import Path

from qproof.canonical import circuit_hash, report_hash
from qproof.evidence import verify_evidence_detailed, verify_report_integrity
from qproof.experiment import run_experiment
from qproof.registry import get_experiment


def test_fresh_python_report_has_hashes_and_verifies():
    report = run_experiment(get_experiment("hadamard")).to_dict()
    assert report["integrity"]["report_hash"]
    assert report["integrity"]["circuit_hash"]
    d = verify_evidence_detailed(report)
    assert d["structure"] == "valid"
    assert d["integrity"] == "verified"
    assert d["hash_verified"] is True
    assert d["scientific_checks"] == "passed"
    ok, detail = verify_report_integrity(report)
    assert ok, detail


def test_scientific_fail_with_valid_hash_still_integrity_ok():
    report = run_experiment(get_experiment("hadamard")).to_dict()
    report["status"] = "failed"
    report["results"]["fidelity"] = 0.0
    for c in report["checks"]:
        if c["name"] == "fidelity":
            c["status"] = "failed"
            c["detail"] = "deliberate scientific fail"
    report["integrity"]["report_hash"] = report_hash(report)
    d = verify_evidence_detailed(report)
    assert d["hash_verified"] is True
    assert d["integrity"] == "verified"
    assert d["scientific_checks"] == "failed"


def test_missing_hash_is_unverified_not_pass():
    report = run_experiment(get_experiment("hadamard")).to_dict()
    report["integrity"]["report_hash"] = None
    d = verify_evidence_detailed(report)
    assert d["structure"] == "valid"
    assert d["integrity"] == "unverified"
    assert d["hash_verified"] is False
    ok, _ = verify_report_integrity(report)
    assert not ok


def test_circuit_content_change_breaks_circuit_hash():
    report = run_experiment(get_experiment("hadamard")).to_dict()
    original = report["integrity"]["circuit_hash"]
    report["circuit"]["spec"] = [{"gate": "X", "qubits": [0]}]
    assert circuit_hash(report["circuit"]) != original


def test_result_tamper_breaks_report_hash():
    report = run_experiment(get_experiment("hadamard")).to_dict()
    report["results"]["fidelity"] = 0.42
    ok, detail = verify_report_integrity(report)
    assert not ok
    assert "mismatch" in detail


def test_export_reimport_preserves_integrity(tmp_path: Path):
    report = run_experiment(get_experiment("hadamard")).to_dict()
    path = tmp_path / "r.json"
    path.write_text(json.dumps(report))
    loaded = json.loads(path.read_text())
    ok, detail = verify_report_integrity(loaded)
    assert ok, detail


def test_status_inconsistent_with_checks_rejected():
    report = run_experiment(get_experiment("hadamard")).to_dict()
    report["status"] = "passed"
    report["checks"][0]["status"] = "failed"
    report["integrity"]["report_hash"] = report_hash(report)
    d = verify_evidence_detailed(report)
    # Hash may still match body, but overall ok must be false due to inconsistency
    assert d["status_consistency_error"] is not None
    assert d["ok"] is False


def test_legacy_fixture_without_hash_is_unverified():
    """Fixtures shipped without report_hash stay integrity-unverified forever."""
    path = Path(__file__).resolve().parents[1] / "web" / "evidence" / "hadamard-v1.json"
    report = json.loads(path.read_text())
    d = verify_evidence_detailed(report)
    assert d["structure"] == "valid"
    assert d["integrity"] == "unverified"
    assert d["hash_verified"] is False
    assert d["scientific_checks"] == "passed"  # fixture declares scientific pass
    ok, _ = verify_report_integrity(report)
    assert not ok
