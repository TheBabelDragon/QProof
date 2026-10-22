"""Machine-readable capability registry for QProof.

Describes *tested* behavior only. Aspirational features are listed under
unsupported / deferred, never as supported.
"""

from __future__ import annotations

from typing import Any, Dict, List

from .statevector import MAX_QUBITS
from . import __version__

CAPABILITY_SCHEMA_VERSION = "1.0.0"

# Gate catalog: arity, whether theta is required, notes
GATE_CATALOG: Dict[str, Dict[str, Any]] = {
    "I": {"arity": 1, "params": [], "status": "supported"},
    "X": {"arity": 1, "params": [], "status": "supported"},
    "Y": {"arity": 1, "params": [], "status": "supported"},
    "Z": {"arity": 1, "params": [], "status": "supported"},
    "H": {"arity": 1, "params": [], "status": "supported"},
    "S": {"arity": 1, "params": [], "status": "supported"},
    "T": {"arity": 1, "params": [], "status": "supported"},
    "RX": {"arity": 1, "params": ["theta"], "status": "supported"},
    "RY": {"arity": 1, "params": ["theta"], "status": "supported"},
    "RZ": {"arity": 1, "params": ["theta"], "status": "supported"},
    "CNOT": {"arity": 2, "params": [], "status": "supported", "roles": ["control", "target"]},
    "CX": {"arity": 2, "params": [], "status": "supported", "alias_of": "CNOT", "roles": ["control", "target"]},
    "CZ": {"arity": 2, "params": [], "status": "supported", "roles": ["control", "target"]},
}

UNSUPPORTED_GATES = [
    "SWAP", "CCNOT", "TOFFOLI", "U", "U1", "U2", "U3", "ISWAP", "RXX", "RYY", "RZZ",
]


def capability_manifest() -> Dict[str, Any]:
    """Return the full capability registry as a JSON-serializable dict."""
    return {
        "schema_version": CAPABILITY_SCHEMA_VERSION,
        "software": f"qproof/{__version__}",
        "simulator": {
            "backend": "classical_statevector",
            "dtype": "complex128",
            "qubit_ordering": "little-endian (qubit 0 = LSB)",
            "max_qubits": MAX_QUBITS,
            "memory_note": f"~16 bytes × 2^n; soft fail above {MAX_QUBITS} qubits",
            "noise_model": False,
            "hardware_backends": [],
        },
        "gates": {
            name: {k: v for k, v in meta.items()}
            for name, meta in GATE_CATALOG.items()
        },
        "unsupported_gates": UNSUPPORTED_GATES,
        "initial_states": {
            "supported": ["zero", "basis_index"],
            "unsupported": ["arbitrary_unnormalized", "mixed_density_matrix"],
        },
        "measurement": {
            "basis": "computational",
            "exact_probabilities": True,
            "shots": True,
            "deterministic_seed": True,
            "mid_circuit": False,
        },
        "verification": {
            "methods": [
                "normalization",
                "finite_amplitudes",
                "amplitude_match_global_phase_invariant",
                "probability_match",
                "pure_state_fidelity",
                "shot_consistency_zscore",
                "evidence_schema",
                "integrity_hash",
            ],
            "reference_strategies": [
                "analytic_closed_form",
                "invariant_only",
                "supplied_expected_state",
            ],
            "outcomes": ["passed", "failed", "inconclusive"],
        },
        "circuit_format": {
            "version": "1.0.0",
            "media_type": "application/json",
            "description": "Versioned circuit + experiment JSON (see docs/circuit_format.md)",
        },
        "evidence_schema": {
            "version": "1.1.0",
            "backward_compatible_with": ["1.0.0"],
        },
        "execution_modes": [
            {
                "id": "classical_statevector",
                "available": True,
                "description": "Exact pure-state simulation in Python/NumPy",
            },
            {
                "id": "precomputed_evidence",
                "available": True,
                "description": "Load previously generated verified JSON reports",
            },
            {
                "id": "quantum_hardware",
                "available": False,
                "description": "No hardware backend is integrated",
            },
        ],
        "limitations": [
            "Classical simulation only — does not claim quantum advantage.",
            "No noise, error correction, or open-system dynamics.",
            "No mid-circuit measurement or classical feed-forward.",
            "Comparing two software paths does not prove hardware correctness.",
            "Shot z-score checks are consistency filters, not formal hypothesis tests.",
        ],
        "examples": [
            {"id": "bell-state-v1", "role": "smoke_test / onboarding fixture"},
            {"id": "global-phase-v1", "role": "phase semantics fixture"},
            {"id": "hadamard-v1", "role": "single-qubit analytic fixture"},
            {"id": "rx-pi-v1", "role": "parameterized rotation fixture"},
        ],
    }


def supported_gate_names() -> List[str]:
    return sorted(
        name
        for name, meta in GATE_CATALOG.items()
        if meta.get("status") == "supported" and not meta.get("alias_of")
    )
