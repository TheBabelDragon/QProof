"""Experiment runner and evidence schema tests."""

import json

import numpy as np
import pytest

from qproof import Circuit, ExperimentStatus, run_experiment
from qproof.experiment import Experiment, bell_state_experiment, global_phase_experiment
from qproof.reference import (
    bell_expected_amplitudes,
    bell_expected_probabilities,
    verify_amplitudes,
)


def test_bell_passes():
    exp = bell_state_experiment(shots=512, seed=42)
    report = run_experiment(exp)
    assert report.status == ExperimentStatus.PASSED
    assert report.fidelity == pytest.approx(1.0, abs=1e-10)
    assert report.schema_version == "1.0.0"
    assert report.experiment_id == "bell-state-v1"
    assert report.input_hash and report.input_hash.startswith("sha256:")
    assert report.report_hash and report.report_hash.startswith("sha256:")


def test_bell_json_roundtrip():
    report = run_experiment(bell_state_experiment(shots=100, seed=7))
    data = json.loads(report.to_json())
    assert data["status"] == "passed"
    assert data["circuit"]["n_qubits"] == 2
    assert len(data["checks"]) >= 5
    assert data["results"]["fidelity"] == pytest.approx(1.0, abs=1e-10)


def test_phase_experiment_passes():
    report = run_experiment(global_phase_experiment())
    assert report.status == ExperimentStatus.PASSED
    # Fidelity is phase-invariant → 1.0 even though amplitude has a minus sign
    assert report.fidelity == pytest.approx(1.0)


def test_independent_reference_differs_from_simulator_path():
    """Reference amplitudes come from analytic formula, not circuit.run()."""
    analytic = bell_expected_amplitudes()
    sim = Circuit(2).h(0).cx(0, 1).run().amplitudes
    assert np.allclose(analytic, sim)
    # But the reference module never imported circuit application
    import qproof.reference as ref
    assert not hasattr(ref, "Circuit")


def test_negative_wrong_expected_fails():
    """Deliberately wrong expected amplitudes must produce FAILED."""
    circ = Circuit(2).h(0).cx(0, 1)
    wrong = np.array([1.0, 0, 0, 0], dtype=np.complex128)  # |00⟩ instead of Bell
    exp = Experiment(
        experiment_id="negative-wrong-expected",
        description="Negative test",
        claim="Should fail",
        circuit=circ,
        expected_amplitudes=wrong,
        expected_probabilities=np.abs(wrong) ** 2,
        shots=0,
    )
    report = run_experiment(exp)
    assert report.status == ExperimentStatus.FAILED
    failed_names = [c.name for c in report.checks if c.status == ExperimentStatus.FAILED]
    assert "amplitudes" in failed_names or "fidelity" in failed_names


def test_negative_corrupted_tolerance_fails():
    exp = bell_state_experiment(shots=0)
    exp.amplitude_tol = 1e-30  # impossibly tight after any FP noise — still should pass for Bell
    # Actually Bell is exact in FP for this circuit; use wrong expected instead
    exp.expected_amplitudes = exp.expected_amplitudes * 0.99
    exp.expected_probabilities = np.abs(exp.expected_amplitudes) ** 2
    # Renormalize expected for fairness
    exp.expected_amplitudes = exp.expected_amplitudes / np.linalg.norm(exp.expected_amplitudes)
    exp.expected_probabilities = np.abs(exp.expected_amplitudes) ** 2
    report = run_experiment(exp)
    assert report.status == ExperimentStatus.FAILED


def test_verify_amplitudes_global_phase():
    expected = bell_expected_amplitudes()
    phased = expected * np.exp(1j * 1.234)
    ok, _ = verify_amplitudes(phased, expected)
    assert ok


def test_all_checks_have_status():
    report = run_experiment(bell_state_experiment(shots=64, seed=0))
    for c in report.checks:
        assert c.status in (
            ExperimentStatus.PASSED,
            ExperimentStatus.FAILED,
            ExperimentStatus.INCONCLUSIVE,
        )
        assert c.name
        assert c.detail
