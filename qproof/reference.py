"""Independent classical reference for the Bell-state experiment.

This module deliberately avoids importing the production gate application
path.  Expected amplitudes are derived from first principles so that a
shared defect in the simulator cannot silently pass verification.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np


def bell_expected_amplitudes() -> np.ndarray:
    """Analytic Bell state (|00⟩ + |11⟩)/√2 under little-endian ordering.

    Circuit: H(0); CNOT(0, 1) on |00⟩.

    Derivation
    ----------
    |00⟩  --H(0)-->  (|00⟩ + |01⟩)/√2
          --CNOT-->  (|00⟩ + |11⟩)/√2

    Index layout (little-endian, qubit 0 = LSB):
        index 0 = |00⟩  →  1/√2
        index 1 = |01⟩  →  0
        index 2 = |10⟩  →  0
        index 3 = |11⟩  →  1/√2
    """
    s = 1.0 / np.sqrt(2.0)
    return np.array([s, 0.0, 0.0, s], dtype=np.complex128)


def bell_expected_probabilities() -> np.ndarray:
    """Exact measurement probabilities for the Bell state."""
    return np.abs(bell_expected_amplitudes()) ** 2


def bell_circuit_spec() -> List[dict]:
    """Canonical circuit specification matching the analytic derivation."""
    return [
        {"gate": "H", "qubits": [0]},
        {"gate": "CNOT", "qubits": [0, 1]},
    ]


def verify_amplitudes(
    observed: np.ndarray,
    expected: np.ndarray,
    *,
    tol: float = 1e-10,
) -> Tuple[bool, str]:
    """Compare amplitude vectors up to global phase.

    Returns (ok, reason).
    """
    if observed.shape != expected.shape:
        return False, f"shape mismatch: {observed.shape} vs {expected.shape}"
    if not np.all(np.isfinite(observed)):
        return False, "observed amplitudes contain non-finite values"

    # Align global phase using first component where both are non-negligible
    obs = np.asarray(observed, dtype=np.complex128)
    exp = np.asarray(expected, dtype=np.complex128)
    phase = 1.0 + 0j
    for i in range(len(exp)):
        if abs(exp[i]) > tol and abs(obs[i]) > tol:
            phase = obs[i] / exp[i]
            phase = phase / abs(phase)  # unit modulus
            break
    aligned = obs / phase
    diff = float(np.max(np.abs(aligned - exp)))
    if diff > tol:
        return False, f"max amplitude deviation {diff:.3e} exceeds tol {tol:.3e}"
    return True, "amplitudes match within tolerance (global-phase invariant)"


def verify_probabilities(
    observed: np.ndarray,
    expected: np.ndarray,
    *,
    tol: float = 1e-10,
) -> Tuple[bool, str]:
    if observed.shape != expected.shape:
        return False, f"shape mismatch: {observed.shape} vs {expected.shape}"
    if not np.all(np.isfinite(observed)):
        return False, "observed probabilities contain non-finite values"
    if abs(float(observed.sum()) - 1.0) > 1e-8:
        return False, f"probabilities sum to {observed.sum():.6f}, not 1"
    diff = float(np.max(np.abs(observed - expected)))
    if diff > tol:
        return False, f"max probability deviation {diff:.3e} exceeds tol {tol:.3e}"
    return True, "probabilities match within tolerance"


def verify_normalization(
    amps: np.ndarray,
    *,
    tol: float = 1e-10,
) -> Tuple[bool, str]:
    norm = float(np.linalg.norm(amps))
    if abs(norm - 1.0) > tol:
        return False, f"norm={norm:.6e}, expected 1.0 ± {tol}"
    return True, f"normalized (norm={norm:.6e})"


def verify_shot_consistency(
    counts: Dict[str, int],
    expected_probs: np.ndarray,
    shots: int,
    *,
    n_qubits: int = 2,
    z_threshold: float = 5.0,
) -> Tuple[bool, str]:
    """Crude statistical consistency check via per-bin z-score.

    Not a formal hypothesis test; flags gross sampling errors.
    """
    if shots <= 0:
        return True, "no shots — skipped statistical check"
    for idx, p in enumerate(expected_probs):
        bitstr = format(idx, f"0{n_qubits}b")
        observed = counts.get(bitstr, 0)
        expected_count = p * shots
        var = shots * p * (1.0 - p)
        if var < 1e-12:
            if observed != 0 and p == 0.0:
                return False, f"unexpected counts for {bitstr}: {observed} (p=0)"
            continue
        z = abs(observed - expected_count) / np.sqrt(var)
        if z > z_threshold:
            return (
                False,
                f"shot counts for {bitstr}: z={z:.2f} exceeds threshold {z_threshold}",
            )
    return True, f"shot counts consistent (z ≤ {z_threshold})"
