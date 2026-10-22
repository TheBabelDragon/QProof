"""Experiment runner and evidence reports."""

import json

import numpy as np
import pytest

from qproof import Circuit, Experiment, ExperimentStatus, run_experiment
from qproof.experiment import bell_state_experiment, global_phase_experiment
from qproof.reference import bell_expected_amplitudes, verify_amplitudes


def test_bell_passes():
    report = run_experiment(bell_state_experiment(shots=256, seed=7))
    assert report.status == ExperimentStatus.PASSED
    assert report.schema_version in ("1.0.0", "1.1.0")
    assert report.fidelity == pytest.approx(1.0, abs=1e-10)
    assert report.report_hash
    data = json.loads(report.to_json())
    assert data["integrity"]["report_hash"].startswith("sha256:")


def test_bell_reproducible_with_seed():
    r1 = run_experiment(bell_state_experiment(shots=100, seed=99))
    r2 = run_experiment(bell_state_experiment(shots=100, seed=99))
    assert r1.measurement_counts == r2.measurement_counts


def test_global_phase_passes():
    report = run_experiment(global_phase_experiment())
    assert report.status == ExperimentStatus.PASSED
    assert report.fidelity == pytest.approx(1.0)


def test_independent_reference_differs_from_simulator_path():
    analytic = bell_expected_amplitudes()
    sim = Circuit(2).h(0).cx(0, 1).run().amplitudes
    assert np.allclose(analytic, sim)
    import qproof.reference as ref

    assert not hasattr(ref, "Circuit")


def test_negative_wrong_expected_fails():
    circ = Circuit(2).h(0).cx(0, 1)
    wrong = np.array([1.0, 0, 0, 0], dtype=np.complex128)
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


def test_negative_orthogonal_expected_fails():
    """Expected |01> while circuit prepares Bell - must FAIL."""
    exp = bell_state_experiment(shots=0)
    exp.expected_amplitudes = np.array([0, 1, 0, 0], dtype=np.complex128)
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
