"""Independent reference quantum engine for QProof verification.

This module is deliberately isolated from the production simulator path
(``qproof.circuit._apply_*``, ``qproof.gates.gate_matrix`` application).
Gate matrices and state evolution are re-derived from first principles so
that a shared defect cannot silently pass verification.

Conventions
-----------
* Little-endian qubit ordering: qubit 0 is the least-significant bit (LSB).
* Complex128 state vectors, Born-rule probabilities.
* Global phase is irrelevant for physical comparison unless a test
  explicitly asserts relative-phase structure.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple, Union

import numpy as np

ORACLE_VERSION = "1.0.0"
ORACLE_ID = f"qproof-oracle/{ORACLE_VERSION}"
ORACLE_MAX_QUBITS = 12

_S2 = 1.0 / np.sqrt(2.0)
_MAT_I = np.array([[1, 0], [0, 1]], dtype=np.complex128)
_MAT_X = np.array([[0, 1], [1, 0]], dtype=np.complex128)
_MAT_Y = np.array([[0, -1j], [1j, 0]], dtype=np.complex128)
_MAT_Z = np.array([[1, 0], [0, -1]], dtype=np.complex128)
_MAT_H = np.array([[_S2, _S2], [_S2, -_S2]], dtype=np.complex128)
_MAT_S = np.array([[1, 0], [0, 1j]], dtype=np.complex128)
_MAT_T = np.array([[1, 0], [0, np.exp(1j * np.pi / 4)]], dtype=np.complex128)

def _mat_rx(theta: float) -> np.ndarray:
    c, s = np.cos(theta / 2), np.sin(theta / 2)
    return np.array([[c, -1j * s], [-1j * s, c]], dtype=np.complex128)

def _mat_ry(theta: float) -> np.ndarray:
    c, s = np.cos(theta / 2), np.sin(theta / 2)
    return np.array([[c, -s], [s, c]], dtype=np.complex128)

def _mat_rz(theta: float) -> np.ndarray:
    return np.array([[np.exp(-1j * theta / 2), 0], [0, np.exp(1j * theta / 2)]], dtype=np.complex128)

_SINGLE_QUBIT = {
    "I": lambda _t: _MAT_I.copy(),
    "X": lambda _t: _MAT_X.copy(),
    "Y": lambda _t: _MAT_Y.copy(),
    "Z": lambda _t: _MAT_Z.copy(),
    "H": lambda _t: _MAT_H.copy(),
    "S": lambda _t: _MAT_S.copy(),
    "T": lambda _t: _MAT_T.copy(),
    "RX": _mat_rx,
    "RY": _mat_ry,
    "RZ": _mat_rz,
}

@dataclass(frozen=True)
class OracleGate:
    name: str
    qubits: Tuple[int, ...]
    theta: Optional[float] = None
    def normalized_name(self) -> str:
        n = self.name.upper()
        return "CNOT" if n == "CX" else n

@dataclass
class OracleResult:
    amplitudes: np.ndarray
    probabilities: np.ndarray
    n_qubits: int
    oracle_id: str = ORACLE_ID
    normalized: bool = True
    seed: Optional[int] = None
    metadata: Dict = field(default_factory=dict)
    def check_invariants(self, tol: float = 1e-10) -> List[str]:
        issues: List[str] = []
        if self.amplitudes.size != (1 << self.n_qubits):
            issues.append(f"dimension {self.amplitudes.size} != 2^{self.n_qubits}")
        if not np.all(np.isfinite(self.amplitudes)):
            issues.append("non-finite amplitudes")
        norm = float(np.linalg.norm(self.amplitudes))
        if abs(norm - 1.0) > tol:
            issues.append(f"norm={norm:.6e} (expected 1)")
        psum = float(np.sum(self.probabilities))
        if abs(psum - 1.0) > tol:
            issues.append(f"probability sum={psum:.6e}")
        if np.any(self.probabilities < -tol):
            issues.append("negative probabilities")
        if np.any(self.probabilities > 1.0 + tol):
            issues.append("probability > 1")
        return issues

def zero_state(n_qubits: int) -> np.ndarray:
    if n_qubits < 0 or n_qubits > ORACLE_MAX_QUBITS:
        raise ValueError(f"n_qubits must be in [0, {ORACLE_MAX_QUBITS}]")
    amps = np.zeros(1 << n_qubits, dtype=np.complex128)
    amps[0] = 1.0
    return amps

def basis_state(n_qubits: int, index: int) -> np.ndarray:
    dim = 1 << n_qubits
    if index < 0 or index >= dim:
        raise ValueError(f"index {index} out of range for {n_qubits} qubits")
    amps = np.zeros(dim, dtype=np.complex128)
    amps[index] = 1.0
    return amps

def _apply_1q(amps: np.ndarray, mat: np.ndarray, target: int, n: int) -> np.ndarray:
    out = amps.copy()
    stride = 1 << target
    dim = 1 << n
    for base in range(0, dim, stride * 2):
        for offset in range(stride):
            i0 = base + offset
            i1 = i0 + stride
            a0, a1 = amps[i0], amps[i1]
            out[i0] = mat[0, 0] * a0 + mat[0, 1] * a1
            out[i1] = mat[1, 0] * a0 + mat[1, 1] * a1
    return out

def _apply_cnot(amps: np.ndarray, control: int, target: int, n: int) -> np.ndarray:
    out = amps.copy()
    c_bit = 1 << control
    t_bit = 1 << target
    dim = 1 << n
    for i in range(dim):
        if i & c_bit:
            j = i ^ t_bit
            if i < j:
                out[i], out[j] = amps[j], amps[i]
    return out

def _apply_cz(amps: np.ndarray, control: int, target: int, n: int) -> np.ndarray:
    out = amps.copy()
    mask = (1 << control) | (1 << target)
    dim = 1 << n
    for i in range(dim):
        if (i & mask) == mask:
            out[i] = -amps[i]
    return out

def apply_gate(amps: np.ndarray, gate: OracleGate, n: int) -> np.ndarray:
    name = gate.normalized_name()
    qs = gate.qubits
    for q in qs:
        if q < 0 or q >= n:
            raise ValueError(f"qubit {q} out of range for {n}-qubit system")
    if name in _SINGLE_QUBIT:
        if len(qs) != 1:
            raise ValueError(f"{name} requires exactly 1 qubit")
        mat = _SINGLE_QUBIT[name](gate.theta if gate.theta is not None else 0.0)
        if name in ("RX", "RY", "RZ") and gate.theta is None:
            raise ValueError(f"{name} requires theta")
        return _apply_1q(amps, mat, qs[0], n)
    if name == "CNOT":
        if len(qs) != 2 or qs[0] == qs[1]:
            raise ValueError("CNOT requires distinct control and target")
        return _apply_cnot(amps, qs[0], qs[1], n)
    if name == "CZ":
        if len(qs) != 2 or qs[0] == qs[1]:
            raise ValueError("CZ requires distinct control and target")
        return _apply_cz(amps, qs[0], qs[1], n)
    raise ValueError(f"unsupported oracle gate: {name}")

def run_oracle(
    n_qubits: int,
    gates: Sequence[Union[OracleGate, dict]],
    *,
    initial: Optional[np.ndarray] = None,
    initial_index: Optional[int] = None,
    seed: Optional[int] = None,
) -> OracleResult:
    if n_qubits < 1 or n_qubits > ORACLE_MAX_QUBITS:
        raise ValueError(f"n_qubits must be in [1, {ORACLE_MAX_QUBITS}]")
    if initial is not None:
        amps = np.asarray(initial, dtype=np.complex128).ravel().copy()
        if amps.size != (1 << n_qubits):
            raise ValueError("initial amplitude dimension mismatch")
    elif initial_index is not None:
        amps = basis_state(n_qubits, initial_index)
    else:
        amps = zero_state(n_qubits)
    parsed: List[OracleGate] = []
    for g in gates:
        if isinstance(g, OracleGate):
            parsed.append(g)
        else:
            name = str(g.get("gate", "")).upper()
            qs = tuple(int(q) for q in (g.get("qubits") or []))
            theta = g.get("theta")
            if theta is not None:
                theta = float(theta)
            parsed.append(OracleGate(name=name, qubits=qs, theta=theta))
    for gate in parsed:
        amps = apply_gate(amps, gate, n_qubits)
    norm = float(np.linalg.norm(amps))
    if abs(norm - 1.0) > 1e-14 and norm > 0:
        amps = amps / norm
    probs = np.abs(amps) ** 2
    return OracleResult(amplitudes=amps, probabilities=probs, n_qubits=n_qubits, oracle_id=ORACLE_ID, seed=seed, metadata={"gate_count": len(parsed)})

def probabilities_from_amplitudes(amps: np.ndarray) -> np.ndarray:
    return np.abs(np.asarray(amps, dtype=np.complex128)) ** 2

def supported_gates() -> List[str]:
    return sorted(list(_SINGLE_QUBIT.keys()) + ["CNOT", "CZ"])
