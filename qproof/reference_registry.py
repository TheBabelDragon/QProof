"""Versioned independent scientific references for claim verification.

References are derived from first principles and never call the production
simulator under test.  Browser and Python resolve the same identifiers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

REGISTRY_VERSION = "1.0.0"


@dataclass(frozen=True)
class ReferenceSpec:
    """One independently derived expected outcome."""

    reference_id: str
    version: str
    description: str
    n_qubits: int
    # Circuit preconditions: ordered gate list that must match (gate + qubits;
    # theta compared within tol when present).
    circuit_gates: Tuple[Dict[str, Any], ...]
    initial_state: str  # "zero" | "basis:<index>"
    expected_amplitudes: Tuple[Tuple[float, float], ...]  # (re, im) pairs
    expected_probabilities: Tuple[float, ...]
    amplitude_tol: float = 1e-10
    probability_tol: float = 1e-10
    fidelity_tol: float = 1e-10
    derivation: str = ""
    comparison_methods: Tuple[str, ...] = (
        "global_phase_invariant_amplitudes",
        "exact_probabilities",
        "pure_state_fidelity",
        "normalization",
    )

    def amplitudes_array(self) -> np.ndarray:
        return np.array(
            [complex(re, im) for re, im in self.expected_amplitudes],
            dtype=np.complex128,
        )

    def probabilities_array(self) -> np.ndarray:
        return np.array(self.expected_probabilities, dtype=np.float64)

    def to_public_dict(self) -> Dict[str, Any]:
        return {
            "reference_id": self.reference_id,
            "version": self.version,
            "description": self.description,
            "n_qubits": self.n_qubits,
            "circuit_gates": list(self.circuit_gates),
            "initial_state": self.initial_state,
            "expected_amplitudes": [list(p) for p in self.expected_amplitudes],
            "expected_probabilities": list(self.expected_probabilities),
            "amplitude_tol": self.amplitude_tol,
            "probability_tol": self.probability_tol,
            "fidelity_tol": self.fidelity_tol,
            "derivation": self.derivation,
            "comparison_methods": list(self.comparison_methods),
        }


def _s() -> float:
    return float(1.0 / np.sqrt(2.0))


def _hadamard_v1() -> ReferenceSpec:
    s = _s()
    return ReferenceSpec(
        reference_id="analytic/hadamard-v1",
        version="1.0.0",
        description="H|0> = (|0>+|1>)/sqrt(2) under little-endian ordering.",
        n_qubits=1,
        circuit_gates=({"gate": "H", "qubits": (0,)},),
        initial_state="zero",
        expected_amplitudes=((s, 0.0), (s, 0.0)),
        expected_probabilities=(0.5, 0.5),
        derivation=(
            "H = (1/sqrt(2)) * [[1,1],[1,-1]]. "
            "H|0> = (1/sqrt(2))(|0>+|1>). "
            "Basis index 0 = |0>, index 1 = |1>."
        ),
    )


def _bell_v1() -> ReferenceSpec:
    s = _s()
    return ReferenceSpec(
        reference_id="analytic/bell-v1",
        version="1.0.0",
        description=(
            "Bell state (|00>+|11>)/sqrt(2) via H(0); CNOT(0,1) on |00>, "
            "little-endian (qubit 0 = LSB)."
        ),
        n_qubits=2,
        circuit_gates=(
            {"gate": "H", "qubits": (0,)},
            {"gate": "CNOT", "qubits": (0, 1)},
        ),
        initial_state="zero",
        expected_amplitudes=((s, 0.0), (0.0, 0.0), (0.0, 0.0), (s, 0.0)),
        expected_probabilities=(0.5, 0.0, 0.0, 0.5),
        derivation=(
            "|00> --H(0)--> (|00>+|01>)/sqrt(2) "
            "--CNOT(0,1)--> (|00>+|11>)/sqrt(2). "
            "Index layout: 0=|00>, 1=|01>, 2=|10>, 3=|11>."
        ),
    )


_REGISTRY: Dict[str, ReferenceSpec] = {
    "analytic/hadamard-v1": _hadamard_v1(),
    "analytic/bell-v1": _bell_v1(),
}


def list_references() -> List[str]:
    return sorted(_REGISTRY.keys())


def get_reference(reference_id: str) -> Optional[ReferenceSpec]:
    return _REGISTRY.get(reference_id)


def resolve_reference(reference_id: str) -> ReferenceSpec:
    ref = get_reference(reference_id)
    if ref is None:
        raise KeyError(
            f"unsupported reference_id {reference_id!r}; "
            f"known: {list_references()}"
        )
    return ref


def _norm_gate(g: Dict[str, Any]) -> Dict[str, Any]:
    name = str(g.get("gate", "")).upper()
    if name == "CX":
        name = "CNOT"
    out: Dict[str, Any] = {
        "gate": name,
        "qubits": tuple(int(q) for q in (g.get("qubits") or [])),
    }
    if g.get("theta") is not None:
        out["theta"] = float(g["theta"])
    return out


def circuit_matches_reference(
    n_qubits: int,
    gates: List[Dict[str, Any]],
    ref: ReferenceSpec,
    *,
    theta_tol: float = 1e-12,
) -> Tuple[bool, str]:
    """Validate executed circuit against reference preconditions."""
    if n_qubits != ref.n_qubits:
        return False, f"n_qubits={n_qubits} != reference {ref.n_qubits}"
    if len(gates) != len(ref.circuit_gates):
        return (
            False,
            f"gate_count={len(gates)} != reference {len(ref.circuit_gates)}",
        )
    for i, (got, exp) in enumerate(zip(gates, ref.circuit_gates)):
        g = _norm_gate(got)
        e = _norm_gate(exp)
        if g["gate"] != e["gate"]:
            return False, f"gates[{i}]: got {g['gate']}, expected {e['gate']}"
        if g["qubits"] != e["qubits"]:
            return (
                False,
                f"gates[{i}]: qubits {g['qubits']} != expected {e['qubits']}",
            )
        if "theta" in e:
            if "theta" not in g or abs(g["theta"] - e["theta"]) > theta_tol:
                return False, f"gates[{i}]: theta mismatch"
    return True, "circuit matches reference preconditions"


def registry_public() -> Dict[str, Any]:
    return {
        "registry_version": REGISTRY_VERSION,
        "references": {k: v.to_public_dict() for k, v in _REGISTRY.items()},
    }
