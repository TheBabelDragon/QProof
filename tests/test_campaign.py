"""Adversarial verification campaign tests."""

from __future__ import annotations

import json

from qproof.campaign import generate_random_circuit, run_campaign
from qproof.mutations import MUTATION_CATALOG, list_mutations, run_mutated
from qproof.oracle import OracleGate, run_oracle
from qproof.invariants import global_phase_invariant_distance


def test_campaign_runs_and_detects():
    report = run_campaign(seed=42, n_random_circuits=6, max_qubits=2, max_gates=5)
    assert report["schema_id"] == "qproof.adversarial_campaign"
    m = report["metrics"]
    assert m["n_total"] > 0
    assert m["detection_rate"] is not None
    assert m["detection_rate"] >= 0.8
    assert m["n_clean_fail"] == 0
    assert m["n_clean_pass"] > 0
    assert report["acceptance"]["detection_rate_ok"] is True
    assert report["acceptance"]["clean_ok"] is True


def test_campaign_seed_reproducible():
    a = run_campaign(seed=7, n_random_circuits=4, max_qubits=2, max_gates=4)
    b = run_campaign(seed=7, n_random_circuits=4, max_qubits=2, max_gates=4)
    for r in (a, b):
        r.pop("timestamp_utc", None)
        r.pop("campaign_hash", None)
        r["metrics"].pop("elapsed_ms", None)
    assert a["metrics"]["n_detected"] == b["metrics"]["n_detected"]
    assert a["metrics"]["detection_rate"] == b["metrics"]["detection_rate"]
    assert len(a["cases"]) == len(b["cases"])
    for ca, cb in zip(a["cases"], b["cases"]):
        assert ca["case_id"] == cb["case_id"]
        assert ca["status"] == cb["status"]
        assert ca["detected_fault"] == cb["detected_fault"]


def test_identity_mutation_not_false_alarm():
    report = run_campaign(
        seed=1,
        n_random_circuits=2,
        max_qubits=2,
        max_gates=3,
        mutations=["identity_noop"],
    )
    mut = [c for c in report["cases"] if c["mutation_id"] == "identity_noop"]
    assert mut
    assert all(c["detected_fault"] is False for c in mut)
    assert all(c["status"] == "pass" for c in mut)


def test_cnot_swap_detected():
    gates = [OracleGate("H", (0,)), OracleGate("CNOT", (0, 1))]
    ref = run_oracle(2, gates)
    mut = run_mutated(2, gates, "cnot_control_target_swap")
    dist = global_phase_invariant_distance(ref.amplitudes, mut)
    assert dist > 1e-6


def test_mutation_catalog_complete():
    ids = {m.mutation_id for m in list_mutations()}
    assert "cnot_control_target_swap" in ids
    assert "identity_noop" in ids
    assert MUTATION_CATALOG["identity_noop"].expected_detectable is False


def test_random_circuit_deterministic():
    a = generate_random_circuit(99, 2, 5)
    b = generate_random_circuit(99, 2, 5)
    assert [(g.name, g.qubits, g.theta) for g in a] == [
        (g.name, g.qubits, g.theta) for g in b
    ]


def test_campaign_writes_artifacts(tmp_path):
    report = run_campaign(
        seed=3, n_random_circuits=3, max_qubits=2, max_gates=3, output_dir=str(tmp_path)
    )
    assert (tmp_path / "campaign_report.json").exists()
    assert (tmp_path / "campaign_summary.md").exists()
    data = json.loads((tmp_path / "campaign_report.json").read_text())
    assert data["seed"] == 3
    assert data["metrics"]["n_total"] == report["metrics"]["n_total"]
