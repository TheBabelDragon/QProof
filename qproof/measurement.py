"""Computational-basis measurement with configurable shots and seed."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

import numpy as np

from .statevector import StateVector


@dataclass
class MeasurementResult:
    """Result of a computational-basis measurement.

    Attributes
    ----------
    counts : dict mapping bitstring (MSB leftmost) to observed count
    probabilities_exact : exact |amp|^2 distribution (length 2^n)
    shots : number of samples drawn
    seed : RNG seed used (None if no sampling performed)
    n_qubits : number of qubits
    """

    counts: Dict[str, int]
    probabilities_exact: np.ndarray
    shots: int
    seed: Optional[int]
    n_qubits: int

    def observed_probabilities(self) -> Dict[str, float]:
        if self.shots == 0:
            return {}
        return {k: v / self.shots for k, v in self.counts.items()}


def measure(
    state: StateVector,
    shots: int = 0,
    seed: Optional[int] = None,
) -> MeasurementResult:
    """Measure *state* in the computational basis.

    Parameters
    ----------
    state : StateVector
    shots : int
        Number of samples.  If 0, only exact probabilities are returned
        (counts will be empty).
    seed : int or None
        Seed for the NumPy Generator.  When provided, sampling is
        deterministic for a given state and shot count.

    Returns
    -------
    MeasurementResult
    """
    if shots < 0:
        raise ValueError("shots must be non-negative")

    probs = state.probabilities()
    # Guard against tiny negative values from floating-point noise
    probs = np.clip(probs, 0.0, None)
    total = probs.sum()
    if abs(total - 1.0) > 1e-10:
        probs_norm = probs / total if total > 0 else probs
    else:
        probs_norm = probs

    counts: Dict[str, int] = {}
    if shots > 0:
        rng = np.random.default_rng(seed)
        outcomes = rng.choice(state.dim, size=shots, p=probs_norm)
        n = state.n_qubits
        for idx in outcomes:
            bitstr = format(int(idx), f"0{n}b")
            counts[bitstr] = counts.get(bitstr, 0) + 1

    return MeasurementResult(
        counts=counts,
        probabilities_exact=probs.copy(),
        shots=shots,
        seed=seed,
        n_qubits=state.n_qubits,
    )
