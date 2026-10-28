"""Mathematical invariants checked without requiring a full expected state."""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np


def check_normalization(amps: np.ndarray, tol: float = 1e-10) -> Dict[str, Any]:
    norm = float(np.linalg.norm(amps))
    ok = abs(norm - 1.0) <= tol
    return {"name": "normalization", "passed": ok, "norm": norm, "tolerance": tol}


def check_finite(amps: np.ndarray) -> Dict[str, Any]:
    ok = bool(np.all(np.isfinite(amps)))
    return {"name": "finite", "passed": ok}


def check_probability_consistency(amps: np.ndarray, tol: float = 1e-10) -> Dict[str, Any]:
    probs = np.abs(amps) ** 2
    psum = float(np.sum(probs))
    ok = abs(psum - 1.0) <= tol and bool(np.all(probs >= -tol))
    return {"name": "probability_consistency", "passed": ok, "prob_sum": psum, "tolerance": tol}


def check_dimension(amps: np.ndarray, n_qubits: int) -> Dict[str, Any]:
    expected = 1 << n_qubits
    ok = amps.size == expected
    return {"name": "dimension", "passed": ok, "size": int(amps.size), "expected": expected}


def global_phase_invariant_distance(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.complex128).ravel()
    b = np.asarray(b, dtype=np.complex128).ravel()
    if a.size != b.size:
        return float("inf")
    inner = np.vdot(a, b)
    if abs(inner) < 1e-30:
        return float(np.linalg.norm(a - b))
    phase = inner / abs(inner)
    return float(np.linalg.norm(a - phase * b))


def amplitudes_match(a: np.ndarray, b: np.ndarray, tol: float = 1e-10) -> Dict[str, Any]:
    dist = global_phase_invariant_distance(a, b)
    return {
        "name": "amplitudes_global_phase_invariant",
        "passed": dist <= tol,
        "distance": dist,
        "tolerance": tol,
    }


def probabilities_match(a: np.ndarray, b: np.ndarray, tol: float = 1e-10) -> Dict[str, Any]:
    pa = np.abs(np.asarray(a)) ** 2
    pb = np.abs(np.asarray(b)) ** 2
    tvd = 0.5 * float(np.sum(np.abs(pa - pb)))
    return {
        "name": "probability_tvd",
        "passed": tvd <= tol,
        "tvd": tvd,
        "tolerance": tol,
    }


def run_invariant_suite(amps: np.ndarray, n_qubits: int, tol: float = 1e-10) -> List[Dict[str, Any]]:
    return [
        check_dimension(amps, n_qubits),
        check_finite(amps),
        check_normalization(amps, tol),
        check_probability_consistency(amps, tol),
    ]
