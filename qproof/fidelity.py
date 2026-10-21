"""Pure-state fidelity.

Convention
----------
For two pure states |ψ⟩ and |φ⟩ the **squared fidelity** is

    F = |⟨ψ|φ⟩|²

This is the convention used throughout QProof.  It is phase-invariant:
multiplying either state by a global complex phase of unit modulus leaves
F unchanged.  F ∈ [0, 1] for normalized states; F = 1 iff the states are
equal up to a global phase.
"""

from __future__ import annotations

import numpy as np

from .statevector import StateVector


def pure_state_fidelity(psi: StateVector, phi: StateVector) -> float:
    """Compute squared fidelity F = |⟨ψ|φ⟩|² between two pure states.

    Both states must have the same number of qubits.  The function does
    **not** re-normalize; callers should ensure states are normalized
    (StateVector construction already enforces this by default).
    """
    if psi.n_qubits != phi.n_qubits:
        raise ValueError(
            f"qubit count mismatch: {psi.n_qubits} vs {phi.n_qubits}"
        )
    overlap = np.vdot(psi.amplitudes, phi.amplitudes)
    return float(np.abs(overlap) ** 2)
