"""Measurement tests."""

import pytest

from qproof import Circuit, measure


def test_exact_probs_no_shots():
    s = Circuit(2).h(0).cx(0, 1).run()
    r = measure(s, shots=0)
    assert r.shots == 0
    assert r.counts == {}
    assert r.probabilities_exact[0] == pytest.approx(0.5)
    assert r.probabilities_exact[3] == pytest.approx(0.5)


def test_deterministic_seed():
    s = Circuit(2).h(0).cx(0, 1).run()
    a = measure(s, shots=256, seed=123)
    b = measure(s, shots=256, seed=123)
    assert a.counts == b.counts


def test_different_seeds_differ():
    s = Circuit(2).h(0).cx(0, 1).run()
    a = measure(s, shots=256, seed=1)
    b = measure(s, shots=256, seed=2)
    # Extremely unlikely to be identical
    assert a.counts != b.counts or a.shots < 10


def test_observed_probabilities():
    s = Circuit(1).h(0).run()
    r = measure(s, shots=1000, seed=0)
    obs = r.observed_probabilities()
    total = sum(obs.values())
    assert total == pytest.approx(1.0)
