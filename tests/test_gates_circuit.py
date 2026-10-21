"""Gate and circuit tests."""

import numpy as np
import pytest

from qproof import Circuit, StateVector, H, X, CNOT, pure_state_fidelity


def test_hadamard_on_zero():
    s = Circuit(1).h(0).run()
    expected = np.array([1, 1], dtype=np.complex128) / np.sqrt(2)
    assert np.allclose(s.amplitudes, expected)


def test_x_gate():
    s = Circuit(1).x(0).run()
    assert abs(s.amplitudes[1] - 1.0) < 1e-15


def test_bell_state():
    s = Circuit(2).h(0).cx(0, 1).run()
    inv = 1 / np.sqrt(2)
    expected = np.array([inv, 0, 0, inv], dtype=np.complex128)
    assert np.allclose(s.amplitudes, expected)
    probs = s.probabilities()
    assert probs[0] == pytest.approx(0.5)
    assert probs[3] == pytest.approx(0.5)
    assert probs[1] == pytest.approx(0.0)
    assert probs[2] == pytest.approx(0.0)


def test_cnot_control_zero_noop():
    # |00⟩ CNOT → |00⟩
    s = Circuit(2).cx(0, 1).run()
    assert abs(s.amplitudes[0] - 1.0) < 1e-15


def test_cnot_control_one_flips():
    # |01⟩ (qubit0=1) CNOT → |11⟩
    init = StateVector.from_basis(2, 1)
    s = Circuit(2).cx(0, 1).run(init)
    assert abs(s.amplitudes[3] - 1.0) < 1e-15


def test_cz_phase():
    init = StateVector.from_basis(2, 3)  # |11⟩
    s = Circuit(2).cz(0, 1).run(init)
    assert abs(s.amplitudes[3] + 1.0) < 1e-15


def test_circuit_spec():
    circ = Circuit(2).h(0).cx(0, 1)
    spec = circ.to_spec()
    assert spec == [
        {"gate": "H", "qubits": [0]},
        {"gate": "CNOT", "qubits": [0, 1]},
    ]
    assert circ.gate_count == 2
    assert circ.depth == 2


def test_fidelity_identical():
    a = Circuit(2).h(0).cx(0, 1).run()
    b = a.copy()
    assert pure_state_fidelity(a, b) == pytest.approx(1.0)


def test_fidelity_phase_invariant():
    a = Circuit(1).h(0).run()
    phased = StateVector(a.amplitudes * np.exp(1j * 0.7), normalize=False)
    assert pure_state_fidelity(a, phased) == pytest.approx(1.0)


def test_unsupported_qubit_raises():
    with pytest.raises(ValueError):
        Circuit(2).h(5)
