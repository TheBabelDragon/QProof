"""Circuit builder and state-vector execution engine."""

from __future__ import annotations

from typing import List, Optional, Sequence

import numpy as np

from .gates import Gate, GateKind, gate_matrix
from .statevector import MAX_QUBITS, StateVector


class Circuit:
    """Ordered sequence of gates on *n_qubits* qubits.

    Fluent API::

        circ = Circuit(2).h(0).cx(0, 1)
        state = circ.run()
    """

    def __init__(self, n_qubits: int) -> None:
        if n_qubits < 1 or n_qubits > MAX_QUBITS:
            raise ValueError(f"n_qubits must be in [1, {MAX_QUBITS}]")
        self.n_qubits = n_qubits
        self._gates: List[Gate] = []

    # --- fluent builders -----------------------------------------------------

    def append(self, gate: Gate) -> "Circuit":
        for q in gate.qubits:
            if q < 0 or q >= self.n_qubits:
                raise ValueError(f"qubit {q} out of range for {self.n_qubits}-qubit circuit")
        self._gates.append(gate)
        return self

    def i(self, q: int) -> "Circuit":
        from .gates import I
        return self.append(I(q))

    def x(self, q: int) -> "Circuit":
        from .gates import X
        return self.append(X(q))

    def y(self, q: int) -> "Circuit":
        from .gates import Y
        return self.append(Y(q))

    def z(self, q: int) -> "Circuit":
        from .gates import Z
        return self.append(Z(q))

    def h(self, q: int) -> "Circuit":
        from .gates import H
        return self.append(H(q))

    def s(self, q: int) -> "Circuit":
        from .gates import S
        return self.append(S(q))

    def t(self, q: int) -> "Circuit":
        from .gates import T
        return self.append(T(q))

    def rx(self, q: int, theta: float) -> "Circuit":
        from .gates import RX
        return self.append(RX(q, theta))

    def ry(self, q: int, theta: float) -> "Circuit":
        from .gates import RY
        return self.append(RY(q, theta))

    def rz(self, q: int, theta: float) -> "Circuit":
        from .gates import RZ
        return self.append(RZ(q, theta))

    def cx(self, control: int, target: int) -> "Circuit":
        from .gates import CNOT
        return self.append(CNOT(control, target))

    def cz(self, control: int, target: int) -> "Circuit":
        from .gates import CZ
        return self.append(CZ(control, target))

    @property
    def gates(self) -> Sequence[Gate]:
        return tuple(self._gates)

    @property
    def gate_count(self) -> int:
        return len(self._gates)

    @property
    def depth(self) -> int:
        """Naive depth: number of sequential layers (no parallelization)."""
        return len(self._gates)

    def to_spec(self) -> list:
        """Machine-readable circuit specification."""
        return [
            {
                "gate": g.kind.value,
                "qubits": list(g.qubits),
                **({"theta": g.theta} if g.theta is not None else {}),
            }
            for g in self._gates
        ]

    # --- execution -----------------------------------------------------------

    def run(self, initial: Optional[StateVector] = None) -> StateVector:
        """Apply all gates to *initial* (default |0…0⟩) and return the final state."""
        if initial is None:
            state = StateVector.zero(self.n_qubits)
        else:
            if initial.n_qubits != self.n_qubits:
                raise ValueError(
                    f"initial state has {initial.n_qubits} qubits, circuit has {self.n_qubits}"
                )
            state = initial.copy()

        amps = state.amplitudes.copy()
        for gate in self._gates:
            amps = _apply_gate(amps, gate, self.n_qubits)
        return StateVector(amps, n_qubits=self.n_qubits, normalize=False)

    def __repr__(self) -> str:
        labels = [g.label() for g in self._gates]
        return f"Circuit({self.n_qubits}q, gates={labels})"


def _apply_gate(amps: np.ndarray, gate: Gate, n: int) -> np.ndarray:
    """Apply a single gate in-place-style (returns new array)."""
    kind = gate.kind
    if kind in (
        GateKind.I, GateKind.X, GateKind.Y, GateKind.Z,
        GateKind.H, GateKind.S, GateKind.T,
        GateKind.RX, GateKind.RY, GateKind.RZ,
    ):
        mat = gate_matrix(kind, gate.theta)
        return _apply_1q(amps, mat, gate.qubits[0], n)
    if kind == GateKind.CNOT:
        return _apply_cnot(amps, gate.qubits[0], gate.qubits[1], n)
    if kind == GateKind.CZ:
        return _apply_cz(amps, gate.qubits[0], gate.qubits[1], n)
    raise ValueError(f"unsupported gate: {kind}")


def _apply_1q(amps: np.ndarray, mat: np.ndarray, target: int, n: int) -> np.ndarray:
    """Apply a 2×2 matrix to *target* qubit (little-endian)."""
    out = amps.copy()
    stride = 1 << target
    for base in range(0, 1 << n, stride * 2):
        for offset in range(stride):
            i0 = base + offset
            i1 = i0 + stride
            a0, a1 = amps[i0], amps[i1]
            out[i0] = mat[0, 0] * a0 + mat[0, 1] * a1
            out[i1] = mat[1, 0] * a0 + mat[1, 1] * a1
    return out


def _apply_cnot(amps: np.ndarray, control: int, target: int, n: int) -> np.ndarray:
    """CNOT: flip target when control is |1⟩."""
    out = amps.copy()
    c_bit = 1 << control
    t_bit = 1 << target
    for i in range(1 << n):
        if i & c_bit:
            j = i ^ t_bit
            if i < j:  # swap once
                out[i], out[j] = amps[j], amps[i]
    return out


def _apply_cz(amps: np.ndarray, control: int, target: int, n: int) -> np.ndarray:
    """CZ: phase −1 when both control and target are |1⟩."""
    out = amps.copy()
    mask = (1 << control) | (1 << target)
    for i in range(1 << n):
        if (i & mask) == mask:
            out[i] = -amps[i]
    return out
