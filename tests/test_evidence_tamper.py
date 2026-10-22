"""Genuine evidence integrity / tamper detection tests."""

from __future__ import annotations

import copy
import json

from qproof.evidence import validate_evidence_structure, verify_report_integrity
from qproof.experiment import bell_state_experiment, run_experiment


def _fresh_report() -> dict:
    return run_experiment(bell_state_experiment(shots=0, seed=None)).to_dict()


def test_valid_report_integrity_passes():
    report = _fresh_report()
    ok, detail = verify_report_integrity(report)
    assert ok, detail
    assert report["integrity"]["report_hash"]


def test_tampered_status_without_rehash_fails():
    report = _fresh_report()
    report["status"] = "failed" if report["status"] == "passed" else "passed"
    ok, detail = verify_report_integrity(report)
    assert not ok
    assert "mismatch" in detail.lower() or "inconsistent" in detail.lower() or "report_hash" in detail


def test_tampered_fidelity_fails():
    report = _fresh_report()
    report["results"]["fidelity"] = 0.0
    ok, detail = verify_report_integrity(report)
    assert not ok
    assert "report_hash" in detail


def test_missing_required_field_fails():
    report = _fresh_report()
    del report["checks"]
    ok, detail = verify_report_integrity(report)
    assert not ok
    assert "checks" in detail


def test_unsupported_schema_fails():
    report = _fresh_report()
    report["schema_version"] = "9.9.9"
    # structure fails even before hash
    errs = validate_evidence_structure(report)
    assert any("schema" in e for e in errs)


def test_invalid_check_status_fails():
    report = _fresh_report()
    report["checks"][0]["status"] = "maybe"
    errs = validate_evidence_structure(report)
    assert any("status" in e for e in errs)


def test_ui_demo_corruption_is_detectable_by_hash():
    """Mirrors frontend UI-only demo mutation: hash must fail."""
    report = _fresh_report()
    demo = copy.deepcopy(report)
    demo["status"] = "failed"
    demo["results"]["fidelity"] = 0.5
    for c in demo["checks"]:
        if c["name"] in ("amplitudes", "fidelity"):
            c["status"] = "failed"
            c["detail"] = "UI-ONLY DEMO"
    ok, _ = verify_report_integrity(demo)
    assert not ok
