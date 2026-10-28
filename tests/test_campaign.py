"""Adversarial verification campaign tests (v1.1 integrity)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from qproof.campaign import (
    CampaignInputError,
    compute_campaign_digest,
    generate_random_circuit,
    run_campaign,
    validate_campaign_args,
)
from qproof.invariants import global_phase_invariant_distance
from qproof.mutations import MUTATION_CATALOG, list_mutations, run_mutated
from qproof.oracle import OracleGate, run_oracle


def test_analytic_fixtures_use_production_vs_oracle():
    report = run_campaign(seed=1, n_random_circuits=0, mutations=["identity_noop"])
    analytic = [c for c in report["cases"] if c["case_type"] == "analytic"]
    assert len(analytic) >= 4
    for c in analytic:
        assert c["oracle_id"]
        assert c["production_engine_id"]
        assert c["status"] == "pass"
        assert c["circuit"] is not None


def test_analytic_hadamard_and_bell_third_reference():
    report = run_campaign(seed=1, n_random_circuits=0, mutations=["identity_noop"])
    by_id = {c["case_id"]: c for c in report["cases"]}
    assert by_id["analytic/h0"]["status"] == "pass"
    assert by_id["analytic/bell"]["status"] == "pass"
    h_names = {ch["name"] for ch in by_id["analytic/h0"]["checks"]}
    assert any(n.startswith("analytic_") for n in h_names)


def test_faulty_production_runner_detected():
    def bad_runner(nq, gates):
        amps = np.zeros(1 << nq, dtype=np.complex128)
        amps[0] = 1.0
        return amps

    report = run_campaign(
        seed=1,
        n_random_circuits=0,
        mutations=["identity_noop"],
        production_runner=bad_runner,
    )
    analytic = [c for c in report["cases"] if c["case_type"] == "analytic"]
    failed = [c for c in analytic if c["status"] == "fail"]
    assert len(failed) >= 2
    assert report["acceptance"]["clean_ok"] is False
    assert report["acceptance"]["overall_ok"] is False


def test_campaign_runs_and_detects():
    report = run_campaign(seed=42, n_random_circuits=6, max_qubits=2, max_gates=5)
    m = report["metrics"]
    assert m["n_total"] > 0
    assert m["detection_rate"] is not None
    assert m["detection_rate"] >= 0.8
    assert m["n_clean_fail"] == 0
    assert m["n_clean_error"] == 0
    assert m["n_clean_pass"] > 0
    assert report["acceptance"]["overall_ok"] is True
    assert "n_mutation_attempted" in m
    assert "n_exercised_detectable" in m
    assert "n_unexercised_detectable" in m
    assert "detection_rate_denominator" in m


def test_mutations_classified():
    report = run_campaign(seed=3, n_random_circuits=2, max_qubits=2, max_gates=3)
    mut = [c for c in report["cases"] if c["case_type"] == "mutation"]
    assert mut
    for c in mut:
        if c["status"] == "inconclusive":
            assert c["exercised"] is False
        elif c["status"] == "pass" and c.get("expected_detectable") is True:
            assert c["detected_fault"] is True
            assert c["exercised"] is True


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
    assert report["metrics"]["false_alarm_rate"] == 0.0


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


def test_digest_ignores_runtime_metadata():
    a = run_campaign(seed=7, n_random_circuits=3, max_qubits=2, max_gates=3)
    b = run_campaign(seed=7, n_random_circuits=3, max_qubits=2, max_gates=3)
    assert a["campaign_hash"] == b["campaign_hash"]
    a2 = dict(a)
    a2["timestamp_utc"] = "2099-01-01T00:00:00+00:00"
    a2["metrics"] = dict(a["metrics"])
    a2["metrics"]["elapsed_ms"] = 999999.0
    assert compute_campaign_digest(a2) == a["campaign_hash"]


def test_digest_changes_on_material_difference():
    a = run_campaign(seed=7, n_random_circuits=3, max_qubits=2, max_gates=3)
    b = run_campaign(seed=8, n_random_circuits=3, max_qubits=2, max_gates=3)
    assert a["campaign_hash"] != b["campaign_hash"]


def test_undefined_denominator_is_none_not_zero():
    report = run_campaign(seed=1, n_random_circuits=0, mutations=["identity_noop"])
    assert report["metrics"]["detection_rate"] is None
    assert report["metrics"]["false_pass_rate"] is None
    assert report["acceptance"]["detection_rate_ok"] is False


def test_invalid_args_rejected():
    with pytest.raises(CampaignInputError):
        run_campaign(max_qubits=0)
    with pytest.raises(CampaignInputError):
        run_campaign(max_gates=0)
    with pytest.raises(CampaignInputError):
        run_campaign(n_random_circuits=-1)
    with pytest.raises(CampaignInputError):
        run_campaign(tol=float("nan"))
    with pytest.raises(CampaignInputError):
        run_campaign(tol=-1e-5)
    with pytest.raises(CampaignInputError):
        run_campaign(mutations=["not_a_real_mutation"])
    with pytest.raises(CampaignInputError):
        validate_campaign_args(
            seed="x",
            n_random_circuits=1,
            max_qubits=1,
            max_gates=1,
            tol=1e-10,
            mutations=None,
        )


def test_artifact_roundtrip_digest(tmp_path: Path):
    report = run_campaign(
        seed=3, n_random_circuits=2, max_qubits=2, max_gates=3, output_dir=str(tmp_path)
    )
    path = tmp_path / "campaign_report.json"
    data = json.loads(path.read_text())
    assert data["campaign_hash"] == report["campaign_hash"]
    assert compute_campaign_digest(data) == report["campaign_hash"]


def test_cli_acceptance_uses_overall_ok(monkeypatch):
    from qproof import cli as cli_mod

    fake = {
        "seed": 1,
        "engine_id": "x",
        "metrics": {
            "detection_rate": None,
            "false_pass_rate": None,
            "false_alarm_rate": 0.0,
            "n_clean_pass": 0,
            "n_clean_fail": 1,
            "n_total": 1,
        },
        "acceptance": {
            "detection_rate_ok": False,
            "clean_ok": False,
            "no_false_alarms_on_identity": True,
            "overall_ok": False,
        },
        "campaign_hash": "abc",
    }

    def fake_run(**kwargs):
        return fake

    monkeypatch.setattr(cli_mod, "run_campaign", fake_run)
    assert cli_mod.main(["campaign", "--seed", "1"]) == 1
