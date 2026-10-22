"""Regressions for live browser report lifecycle, comparisons, and preconditions."""

from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

from qproof.canonical import circuit_hash, report_hash
from qproof.evidence import verify_evidence_detailed, verify_report_integrity
from qproof.reference_registry import (
    circuit_matches_reference,
    get_reference,
    resolve_reference,
)

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


def _node_build_report(spec: dict, meta: dict) -> dict:
    """Produce a browser report via Node using the real web modules."""
    script = f"""
globalThis.window = globalThis;
require({json.dumps(str(WEB / "canonical_hash.js"))});
require({json.dumps(str(WEB / "simulator.js"))});
require({json.dumps(str(WEB / "claims_patch.js"))});
const S = globalThis.QProofSimulator;
const spec = {json.dumps(spec)};
const meta = {json.dumps(meta)};
const result = S.runCircuit(spec, {{ shots: 0, seed: 42 }});
result.depth = result.gate_count;
const report = S.buildBrowserReport(spec, result, meta);
process.stdout.write(JSON.stringify(report));
"""
    out = subprocess.check_output(
        ["node", "-e", script],
        cwd=str(ROOT),
    )
    return json.loads(out)


def test_browser_report_has_valid_hashes():
    s = 1 / (2**0.5)
    report = _node_build_report(
        {"n_qubits": 1, "gates": [{"gate": "H", "qubits": [0]}]},
        {
            "experiment_id": "pipeline-h",
            "expected_amplitudes": [[s, 0], [s, 0]],
            "expected_probabilities": [0.5, 0.5],
            "reference_id": "analytic/hadamard-v1",
        },
    )
    assert report["integrity"]["report_hash"]
    assert report["integrity"]["circuit_hash"]
    assert report["integrity"]["report_hash"].startswith("sha256:")
    assert report["status"] == "passed"


def test_browser_report_passes_python_integrity():
    s = 1 / (2**0.5)
    report = _node_build_report(
        {"n_qubits": 1, "gates": [{"gate": "H", "qubits": [0]}]},
        {
            "experiment_id": "pipeline-h2",
            "expected_amplitudes": [[s, 0], [s, 0]],
            "expected_probabilities": [0.5, 0.5],
            "reference_id": "analytic/hadamard-v1",
        },
    )
    ok, detail = verify_report_integrity(report)
    assert ok, detail
    d = verify_evidence_detailed(report)
    assert d["integrity"] == "verified"
    assert d["hash_verified"] is True


def test_tamper_fails_integrity():
    s = 1 / (2**0.5)
    report = _node_build_report(
        {"n_qubits": 1, "gates": [{"gate": "H", "qubits": [0]}]},
        {
            "experiment_id": "pipeline-tamper",
            "expected_amplitudes": [[s, 0], [s, 0]],
            "expected_probabilities": [0.5, 0.5],
            "reference_id": "analytic/hadamard-v1",
        },
    )
    assert report["integrity"]["report_hash"]
    tampered = copy.deepcopy(report)
    tampered["status"] = "failed"
    d = verify_evidence_detailed(tampered)
    assert d["integrity"] == "failed"
    assert d["hash_verified"] is False


def test_dim_mismatch_report_is_inconclusive():
    """One-qubit state vs two-qubit reference → inconclusive, not Infinity/zero."""
    s = 1 / (2**0.5)
    report = _node_build_report(
        {"n_qubits": 1, "gates": [{"gate": "H", "qubits": [0]}]},
        {
            "experiment_id": "pipeline-dim",
            "expected_amplitudes": [[s, 0], [0, 0], [0, 0], [s, 0]],
            "expected_probabilities": [0.5, 0, 0, 0.5],
            "reference_id": "analytic/bell-v1",
        },
    )
    assert report["status"] == "inconclusive"
    amp = next(c for c in report["checks"] if c["name"] == "amplitudes")
    fid = next(c for c in report["checks"] if c["name"] == "fidelity")
    assert amp["status"] == "inconclusive"
    assert fid["status"] == "inconclusive"
    assert "dimension" in amp["detail"].lower() or "incompatible" in amp["detail"].lower()
    assert report["integrity"]["report_hash"]
    ok, _ = verify_report_integrity(report)
    assert ok


def test_scientific_failure_with_valid_hash():
    s = 1 / (2**0.5)
    report = _node_build_report(
        {"n_qubits": 1, "gates": []},
        {
            "experiment_id": "pipeline-sci-fail",
            "expected_amplitudes": [[s, 0], [s, 0]],
            "expected_probabilities": [0.5, 0.5],
            "reference_id": "analytic/hadamard-v1",
        },
    )
    assert report["status"] == "failed"
    d = verify_evidence_detailed(report)
    assert d["integrity"] == "verified"
    assert d["scientific_checks"] == "failed"


def test_missing_reference_inconclusive():
    report = _node_build_report(
        {"n_qubits": 1, "gates": [{"gate": "H", "qubits": [0]}]},
        {"experiment_id": "pipeline-noref", "reference_id": "none"},
    )
    assert report["status"] == "inconclusive"
    amp = next(c for c in report["checks"] if c["name"] == "amplitudes")
    assert amp["status"] == "inconclusive"
