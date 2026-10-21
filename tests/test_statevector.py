"""StateVector unit tests."""

import numpy as np
import pytest

from qproof import StateVector, MAX_QUBITS


def test_zero_state():
    s = StateVector.zero(2)
    assert s.n_qubits == 2
    assert s.dim == 4
    assert abs(s.amplitudes[0] - 1.0) < 1e-15
    assert s.is_normalized()


def test_from_basis():
    s = StateVector.from_basis(3, 5)  # |101⟩ little-endian
    assert abs(s.amplitudes[5] - 1.0) < 1e-15
    assert np.sum(np.abs(s.amplitudes) ** 2) == pytest.approx(1.0)


def test_normalize():
    raw = [3.0, 4.0, 0.0, 0.0]
    s = StateVector(raw, n_qubits=2)
    assert s.norm() == pytest.approx(1.0)
    assert abs(s.amplitudes[0] - 0.6) < 1e-12
    assert abs(s.amplitudes[1] - 0.8) < 1e-12


def test_rejects_non_power_of_two():
    with pytest.raises(ValueError):
        StateVector([1, 0, 0])


def test_rejects_non_finite():
    with pytest.raises(ValueError):
        StateVector([1.0, np.nan])


def test_max_qubits_guard():
    with pytest.raises(ValueError):
        StateVector.zero(MAX_QUBITS + 1)


def test_probabilities_sum_to_one():
    s = StateVector([1, 1j, -1, -1j], n_qubits=2)
    assert s.probabilities().sum() == pytest.approx(1.0)
