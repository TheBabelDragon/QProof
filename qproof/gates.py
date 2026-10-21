"""Gate definitions and matrix constructions.

All single-qubit gates are 2×2 complex128 matrices.
Two-qubit gates are applied via controlled operations on the state vector
(not by building a full 4×4 tensor each time for efficiency).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional, Tuple

import numpy as np

# --- Elementary matrices -----------------------------------------------------

_I = np.eye(2, dtype=np.complex128)
_X = np.array([[0, 1], [1, 0]], dtype=np.complex128)
_Y = np.array([[0, -1j], [1j, 0]], dtype=np.complex128)
_Z = np.array([[1, 0], [0, -1]], dtype=np.complex128)
_H = np.array([[1, 1], [1, -1]], dtype=np.complex128) / np.sqrt(2)
_S = np.array([[1, 0], [0, 1j]], dtype=np.complex128)
_T = np.array([[1, 0], [0, np.exp(1j * np.pi / 4)]], dtype=np.complex128)


def _rx(theta: float) -> np.ndarray:
    c, s = np.cos(theta / 2), np.sin(theta / 2)
    return np.array([[c, -1j * s], [-1j * s, c]], dtype=np.complex128)


def _ry(theta: float) -> np.ndarray:
    c, s = np.cos(theta / 2), np.sin(theta / 2)
    return np.array([[c, -s], [s, c]], dtype=np.complex128)


def _rz(theta: float) -> np.ndarray:
    return np.array(
        [[np.exp(-1j * theta / 2), 0], [0, np.exp(1j * theta / 2)]],
        dtype=np.complex128,
    )


class GateKind(str, Enum):
    I = "I"
    X = "X"
    Y = "Y"
    Z = "Z"
    H = "H"
    S = "S"
    T = "T"
    RX = "RX"
    RY = "RY"
    RZ = "RZ"
    CNOT = "CNOT"
    CZ = "CZ"


@dataclass(frozen=True)
class Gate:
    """A gate application in a circuit.

    For single-qubit gates: ``qubits = (target,)``.
    For two-qubit gates: ``qubits = (control, target)``.
    """

    kind: GateKind
    qubits: Tuple[int, ...]
    theta: Optional[float] = None  # rotation angle (radians)

    def label(self) -> str:
        if self.kind in (GateKind.RX, GateKind.RY, GateKind.RZ) and self.theta is not None:
            return f"{self.kind.value}({self.theta:.4g})"
        return self.kind.value


def gate_matrix(kind: GateKind, theta: Optional[float] = None) -> np.ndarray:
    """Return the 2×2 matrix for a single-qubit gate."""
    if kind == GateKind.I:
        return _I.copy()
    if kind == GateKind.X:
        return _X.copy()
    if kind == GateKind.Y:
        return _Y.copy()
    if kind == GateKind.Z:
        return _Z.copy()
    if kind == GateKind.H:
        return _H.copy()
    if kind == GateKind.S:
        return _S.copy()
    if kind == GateKind.T:
        return _T.copy()
    if kind == GateKind.RX:
        if theta is None:
            raise ValueError("RX requires theta")
        return _rx(theta)
    if kind == GateKind.RY:
        if theta is None:
            raise ValueError("RY requires theta")
        return _ry(theta)
    if kind == GateKind.RZ:
        if theta is None:
            raise ValueError("RZ requires theta")
        return _rz(theta)
    raise ValueError(f"{kind} is not a single-qubit gate")


# Convenience constructors ----------------------------------------------------

def I(q: int) -> Gate:
    return Gate(GateKind.I, (q,))


def X(q: int) -> Gate:
    return Gate(GateKind.X, (q,))


def Y(q: int) -> Gate:
    return Gate(GateKind.Y, (q,))


def Z(q: int) -> Gate:
    return Gate(GateKind.Z, (q,))


def H(q: int) -> Gate:
    return Gate(GateKind.H, (q,))


def S(q: int) -> Gate:
    return Gate(GateKind.S, (q,))


def T(q: int) -> Gate:
    return Gate(GateKind.T, (q,))


def RX(q: int, theta: float) -> Gate:
    return Gate(GateKind.RX, (q,), theta)


def RY(q: int, theta: float) -> Gate:
    return Gate(GateKind.RY, (q,), theta)


def RZ(q: int, theta: float) -> Gate:
    return Gate(GateKind.RZ, (q,), theta)


def CNOT(control: int, target: int) -> Gate:
    if control == target:
        raise ValueError("CNOT control and target must differ")
    return Gate(GateKind.CNOT, (control, target))


def CZ(control: int, target: int) -> Gate:
    if control == target:
        raise ValueError("CZ control and target must differ")
    return Gate(GateKind.CZ, (control, target))
