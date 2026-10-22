"""Canonical evidence hashing contract: shared vectors, exclusion rules, mismatch."""

from __future__ import annotations

import copy
import json
import math
from pathlib import Path

import pytest

from qproof.canonical import (
    canonical_dumps,
    canonical_hash,
    circuit_hash,
    report_hash,
)
from qproof.evidence import verify_evidence_detailed, verify_report_integrity
from qproof.experiment import run_experiment
from qproof.registry import get_experiment

# Shared test vectors (must agree with web/test_canonical_vectors.cjs)
VECTORS = [
    ({"a": 1, "b": 1.0}, "int-float-collapse"),
    ({"x": 0.5, "y": 1 / math.sqrt(2)}, "sqrt2"),
    ({"detail": "no shots requested - exact probabilities only"}, "ascii-hyphen"),
    ({"n": 1e-10}, "small-float"),
    (
        {"arr": [[0.7071067811865475, 0.0], [0.7071067811865475, 0.0]]},
        "amplitude-pair",
    ),
    ({"z": None, "ok": True, "s": "hi"}, "null-bool-str"),
    ({"nested": {"b": 2, "a": 1}}, "key-order"),
]


def test_shared_vectors_are_deterministic():
    for obj, name in VECTORS:
        h1 = canonical_hash(obj)
        h2 = canonical_hash(copy.deepcopy(obj))
        assert h1 == h2, name
        assert h1.startswith("sha256:")
        assert len(h1) == len("sha256:") + 64


def test_non_finite_rejected():
    with pytest.raises(ValueError):
        canonical_hash({"x": float("nan")})
    with pytest.raises(ValueError):
        canonical_hash({"x": float("inf")})


def test_unicode_emdash_escapes_in_python_dumps():
    d = canonical_dumps({"detail": "no shots requested \u2014 exact"})
    assert "\\u2014" in d


def test_report_hash_excludes_only_report_hash_field():
    report = run_experiment(get_experiment("hadamard")).to_dict()
    declared = report["integrity"]["report_hash"]
    assert declared
    assert report_hash(report) == declared
    assert report["integrity"]["circuit_hash"]
    body = json.loads(json.dumps(report))
    body["integrity"]["report_hash"] = None
    assert canonical_hash(body) == declared


def test_missing_report_hash_is_unverified():
    """Regression: original missing-hash failure class."""
    report = run_experiment(get_experiment("hadamard")).to_dict()
    report["integrity"]["report_hash"] = None
    d = verify_evidence_detailed(report)
    assert d["structure"] == "valid"
    assert d["integrity"] == "unverified"
    assert d["hash_verified"] is False
    ok, detail = verify_report_integrity(report)
    assert not ok
    assert "unverified" in detail.lower() or "absent" in detail.lower()


def test_hash_mismatch_after_post_hash_mutation():
    """Regression: declared hash differs from recomputed after mutation.

    Captures the failure class exemplified by:
      declared   sha256:c6c41b36...
      recomputed sha256:99e2f1e2...
    """
    report = run_experiment(get_experiment("hadamard")).to_dict()
    original = report["integrity"]["report_hash"]
    report["results"]["fidelity"] = 0.42
    report["status"] = "failed"
    recomputed = report_hash(report)
    assert recomputed != original
    d = verify_evidence_detailed(report)
    assert d["integrity"] == "failed"
    assert d["hash_verified"] is False
    assert "mismatch" in d["detail"]
    assert original in d["detail"]
    assert recomputed in d["detail"]


def test_export_import_preserves_hash(tmp_path: Path):
    report = run_experiment(get_experiment("hadamard")).to_dict()
    path = tmp_path / "evidence.json"
    path.write_text(json.dumps(report, indent=2))
    loaded = json.loads(path.read_text())
    ok, detail = verify_report_integrity(loaded)
    assert ok, detail
    assert loaded["integrity"]["report_hash"] == report["integrity"]["report_hash"]


def test_circuit_content_tamper_breaks_circuit_hash():
    report = run_experiment(get_experiment("hadamard")).to_dict()
    original_ch = report["integrity"]["circuit_hash"]
    report["circuit"]["spec"] = [{"gate": "X", "qubits": [0]}]
    assert circuit_hash(report["circuit"]) != original_ch


def test_post_hash_status_mutation_fails_integrity():
    report = run_experiment(get_experiment("hadamard")).to_dict()
    report["status"] = "failed" if report["status"] == "passed" else "passed"
    ok, detail = verify_report_integrity(report)
    assert not ok
    assert "mismatch" in detail


def test_scientific_fail_with_valid_hash_keeps_dimensions_independent():
    report = run_experiment(get_experiment("hadamard")).to_dict()
    report["status"] = "failed"
    report["results"]["fidelity"] = 0.0
    for c in report["checks"]:
        if c["name"] == "fidelity":
            c["status"] = "failed"
            c["detail"] = "deliberate"
    report["integrity"]["report_hash"] = report_hash(report)
    d = verify_evidence_detailed(report)
    assert d["hash_verified"] is True
    assert d["integrity"] == "verified"
    assert d["scientific_checks"] == "failed"
