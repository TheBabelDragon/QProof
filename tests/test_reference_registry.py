"""Independent reference registry: preconditions, expected values, mismatch."""

from __future__ import annotations

import numpy as np
import pytest

from qproof.circuit import Circuit
from qproof.experiment import run_experiment
from qproof.reference_registry import (
    circuit_matches_reference,
    get_reference,
    list_references,
    resolve_reference,
)
from qproof.registry import get_experiment


def test_hadamard_reference_exists_and_has_derivation():
    ref = resolve_reference("analytic/hadamard-v1")
    assert ref.n_qubits == 1
    assert ref.version == "1.0.0"
    assert "H" in ref.derivation or "sqrt" in ref.derivation
    amps = ref.amplitudes_array()
    assert amps.shape == (2,)
    assert np.isclose(np.linalg.norm(amps), 1.0)
    assert np.allclose(ref.probabilities_array(), [0.5, 0.5])


def test_bell_reference_exists():
    ref = resolve_reference("analytic/bell-v1")
    assert ref.n_qubits == 2
    amps = ref.amplitudes_array()
    assert amps.shape == (4,)
    assert np.isclose(abs(amps[0]), 1 / np.sqrt(2))
    assert abs(amps[1]) < 1e-15
    assert abs(amps[2]) < 1e-15
    assert np.isclose(abs(amps[3]), 1 / np.sqrt(2))


def test_unknown_reference_raises():
    with pytest.raises(KeyError):
        resolve_reference("analytic/does-not-exist-v9")


def test_list_references_sorted():
    ids = list_references()
    assert "analytic/hadamard-v1" in ids
    assert "analytic/bell-v1" in ids
    assert ids == sorted(ids)


def test_circuit_matches_hadamard():
    ref = resolve_reference("analytic/hadamard-v1")
    ok, detail = circuit_matches_reference(
        1, [{"gate": "H", "qubits": [0]}], ref
    )
    assert ok, detail


def test_circuit_mismatch_wrong_gate():
    ref = resolve_reference("analytic/hadamard-v1")
    ok, detail = circuit_matches_reference(
        1, [{"gate": "X", "qubits": [0]}], ref
    )
    assert not ok
    assert "gate" in detail.lower() or "X" in detail


def test_circuit_mismatch_wrong_n_qubits():
    ref = resolve_reference("analytic/hadamard-v1")
    ok, detail = circuit_matches_reference(
        2, [{"gate": "H", "qubits": [0]}], ref
    )
    assert not ok


def test_live_simulator_matches_independent_hadamard_reference():
    report = run_experiment(get_experiment("hadamard")).to_dict()
    ref = resolve_reference("analytic/hadamard-v1")
    assert report["status"] == "passed"
    assert report["verification"]["reference_id"] == ref.reference_id
    obs = np.array(
        [complex(a[0], a[1]) for a in report["results"]["observed_amplitudes"]]
    )
    assert np.allclose(np.abs(obs), np.abs(ref.amplitudes_array()), atol=1e-10)


def test_live_simulator_matches_independent_bell_reference():
    report = run_experiment(get_experiment("bell")).to_dict()
    ref = resolve_reference("analytic/bell-v1")
    assert report["status"] == "passed"
    obs = np.array(
        [complex(a[0], a[1]) for a in report["results"]["observed_amplitudes"]]
    )
    exp = ref.amplitudes_array()
    from qproof.fidelity import pure_state_fidelity
    from qproof.statevector import StateVector

    f = pure_state_fidelity(StateVector(obs, normalize=False), StateVector(exp, normalize=False))
    assert abs(f - 1.0) < 1e-10


def test_deliberately_wrong_circuit_fails_reference_check():
    from qproof.experiment import Experiment

    ref = resolve_reference("analytic/hadamard-v1")
    circ = Circuit(1).x(0)
    exp = Experiment(
        experiment_id="wrong-vs-hadamard",
        description="X vs H reference",
        claim="should fail",
        circuit=circ,
        expected_amplitudes=ref.amplitudes_array(),
        expected_probabilities=ref.probabilities_array(),
        shots=0,
        reference_id=ref.reference_id,
    )
    report = run_experiment(exp).to_dict()
    assert report["status"] == "failed"
    assert any(
        c["status"] == "failed"
        for c in report["checks"]
        if c["name"] in ("amplitudes", "fidelity")
    )
