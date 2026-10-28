"""Fault-injection catalog for adversarial verification campaigns.

Each mutation deliberately corrupts a correct execution path so the
verifier's detection power can be measured. Mutations never claim to
model physical noise — they are software faults.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Sequence

import numpy as np

from .oracle import OracleGate, zero_state


@dataclass(frozen=True)
class Mutation:
    mutation_id: str
    description: str
    expected_detectable: bool = True


def _apply_cnot_swapped(amps: np.ndarray, control: int, target: int, n: int) -> np.ndarray:
    out = amps.copy()
    c_bit = 1 << target
    t_bit = 1 << control
    dim = 1 << n
    for i in range(dim):
        if i & c_bit:
            j = i ^ t_bit
            if i < j:
                out[i], out[j] = amps[j], amps[i]
    return out


def _apply_1q_sign_flip(amps: np.ndarray, mat: np.ndarray, target: int, n: int) -> np.ndarray:
    bad = mat.copy()
    bad[0, 1] = -bad[0, 1]
    bad[1, 0] = -bad[1, 0]
    out = amps.copy()
    stride = 1 << target
    dim = 1 << n
    for base in range(0, dim, stride * 2):
        for offset in range(stride):
            i0 = base + offset
            i1 = i0 + stride
            a0, a1 = amps[i0], amps[i1]
            out[i0] = bad[0, 0] * a0 + bad[0, 1] * a1
            out[i1] = bad[1, 0] * a0 + bad[1, 1] * a1
    return out


def _cnot_remapped(amps: np.ndarray, control: int, target: int, n: int) -> np.ndarray:
    c = n - 1 - control
    t = n - 1 - target
    out = amps.copy()
    c_bit = 1 << c
    t_bit = 1 << t
    dim = 1 << n
    for i in range(dim):
        if i & c_bit:
            j = i ^ t_bit
            if i < j:
                out[i], out[j] = amps[j], amps[i]
    return out


def _apply_phase_drop(amps: np.ndarray, gate: OracleGate, n: int) -> np.ndarray:
    from .oracle import apply_gate as correct_apply

    out = correct_apply(amps, gate, n)
    return np.abs(out).astype(np.complex128)


def _apply_prob_renorm_bug(amps: np.ndarray) -> np.ndarray:
    s = float(np.sum(np.abs(amps)))
    if s <= 0:
        return amps
    return amps / s


MUTATION_CATALOG: Dict[str, Mutation] = {
    "cnot_control_target_swap": Mutation(
        "cnot_control_target_swap",
        "Swap control and target roles of CNOT",
        expected_detectable=True,
    ),
    "rotation_sign_flip": Mutation(
        "rotation_sign_flip",
        "Flip sign of RX/RY/RZ off-diagonal elements",
        expected_detectable=True,
    ),
    "endianness_swap": Mutation(
        "endianness_swap",
        "Interpret qubit indices as MSB-first for CNOT",
        expected_detectable=True,
    ),
    "phase_collapse": Mutation(
        "phase_collapse",
        "Replace complex amplitudes with magnitudes after each gate",
        expected_detectable=True,
    ),
    "l1_renormalize": Mutation(
        "l1_renormalize",
        "Renormalize state with L1 norm instead of L2",
        expected_detectable=True,
    ),
    "identity_noop": Mutation(
        "identity_noop",
        "No-op mutation (negative control: should NOT be detected as fault)",
        expected_detectable=False,
    ),
}


def run_mutated(
    n_qubits: int,
    gates: Sequence[OracleGate],
    mutation_id: str,
) -> np.ndarray:
    if mutation_id not in MUTATION_CATALOG:
        raise ValueError(f"unknown mutation: {mutation_id}")
    amps = zero_state(n_qubits)
    if mutation_id == "identity_noop":
        from .oracle import apply_gate

        for g in gates:
            amps = apply_gate(amps, g, n_qubits)
        return amps

    from .oracle import _SINGLE_QUBIT, apply_gate

    for g in gates:
        name = g.normalized_name()
        if mutation_id == "cnot_control_target_swap" and name == "CNOT":
            amps = _apply_cnot_swapped(amps, g.qubits[0], g.qubits[1], n_qubits)
        elif mutation_id == "endianness_swap" and name == "CNOT":
            amps = _cnot_remapped(amps, g.qubits[0], g.qubits[1], n_qubits)
        elif mutation_id == "rotation_sign_flip" and name in ("RX", "RY", "RZ"):
            mat = _SINGLE_QUBIT[name](g.theta if g.theta is not None else 0.0)
            amps = _apply_1q_sign_flip(amps, mat, g.qubits[0], n_qubits)
        elif mutation_id == "phase_collapse":
            amps = _apply_phase_drop(amps, g, n_qubits)
        else:
            amps = apply_gate(amps, g, n_qubits)

    if mutation_id == "l1_renormalize":
        amps = _apply_prob_renorm_bug(amps)
    else:
        norm = float(np.linalg.norm(amps))
        if norm > 0 and abs(norm - 1.0) > 1e-14:
            amps = amps / norm
    return amps


def list_mutations() -> List[Mutation]:
    return list(MUTATION_CATALOG.values())
