"""State-vector representation and basic operations.

Convention
----------
Little-endian qubit ordering: qubit 0 is the least-significant bit.
Amplitudes are complex128.  States are normalized on construction unless
``normalize=False`` is explicitly requested (used only by internal tests).
"""

from __future__ import annotations

from typing import Optional, Sequence, Union

import numpy as np

MAX_QUBITS = 20  # soft limit ~16 MiB complex128


def memory_estimate_bytes(n_qubits: int) -> int:
    """Estimate memory for a complex128 state vector of *n_qubits*."""
    if n_qubits < 0:
        raise ValueError("n_qubits must be non-negative")
    return (1 << n_qubits) * 16  # complex128 = 16 bytes


class StateVector:
    """Pure-state amplitude vector of dimension 2^n."""

    def __init__(
        self,
        amplitudes: Union[np.ndarray, Sequence[complex]],
        *,
        n_qubits: Optional[int] = None,
        normalize: bool = True,
        tol: float = 1e-12,
    ) -> None:
        amps = np.asarray(amplitudes, dtype=np.complex128).ravel()
        if n_qubits is None:
            dim = amps.size
            if dim == 0 or (dim & (dim - 1)) != 0:
                raise ValueError(
                    f"amplitude length {dim} is not a power of 2; "
                    "specify n_qubits explicitly or pad"
                )
            n_qubits = int(np.log2(dim))
        else:
            if n_qubits < 0:
                raise ValueError("n_qubits must be non-negative")
            if n_qubits > MAX_QUBITS:
                raise ValueError(
                    f"n_qubits={n_qubits} exceeds MAX_QUBITS={MAX_QUBITS} "
                    f"(~{memory_estimate_bytes(n_qubits) / (1024 * 1024):.1f} MiB)"
                )
            expected = 1 << n_qubits
            if amps.size != expected:
                raise ValueError(
                    f"expected {expected} amplitudes for {n_qubits} qubits, got {amps.size}"
                )

        if not np.all(np.isfinite(amps)):
            raise ValueError("amplitudes contain non-finite values")

        if normalize:
            norm = np.linalg.norm(amps)
            if norm < tol:
                raise ValueError("cannot normalize near-zero state vector")
            amps = amps / norm

        self._amps = amps
        self._n = n_qubits

    @classmethod
    def zero(cls, n_qubits: int) -> "StateVector":
        """Return |0…0⟩."""
        if n_qubits < 0 or n_qubits > MAX_QUBITS:
            raise ValueError(f"n_qubits must be in [0, {MAX_QUBITS}]")
        amps = np.zeros(1 << n_qubits, dtype=np.complex128)
        amps[0] = 1.0
        return cls(amps, n_qubits=n_qubits, normalize=False)

    @classmethod
    def from_basis(cls, n_qubits: int, index: int) -> "StateVector":
        """Return computational-basis state |index⟩ (little-endian)."""
        if index < 0 or index >= (1 << n_qubits):
            raise ValueError(f"index {index} out of range for {n_qubits} qubits")
        amps = np.zeros(1 << n_qubits, dtype=np.complex128)
        amps[index] = 1.0
        return cls(amps, n_qubits=n_qubits, normalize=False)

    @property
    def n_qubits(self) -> int:
        return self._n

    @property
    def dim(self) -> int:
        return self._amps.size

    @property
    def amplitudes(self) -> np.ndarray:
        """Read-only view of amplitudes."""
        return self._amps.view()

    def copy(self) -> "StateVector":
        return StateVector(self._amps.copy(), n_qubits=self._n, normalize=False)

    def probabilities(self) -> np.ndarray:
        """Exact |amp|² for each computational-basis state."""
        return np.abs(self._amps) ** 2

    def norm(self) -> float:
        return float(np.linalg.norm(self._amps))

    def is_normalized(self, tol: float = 1e-10) -> bool:
        return abs(self.norm() - 1.0) <= tol

    def __repr__(self) -> str:
        return f"StateVector(n_qubits={self._n}, norm={self.norm():.6g})"
