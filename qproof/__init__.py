"""
QProof — Independent Quantum State-Vector Simulator + Falsifiable Experiment Core.

A transparent reference state-vector simulator with independently testable
gate semantics, deterministic experiment execution, and machine-readable
evidence reports.

This package does not claim quantum advantage. It provides a classical
reference simulator for reproducible, falsifiable quantum experiments.
"""

from __future__ import annotations

__version__ = "0.1.0"
__software_id__ = f"qproof/{__version__}"

from .statevector import StateVector, MAX_QUBITS, memory_estimate_bytes
from .gates import (
    Gate,
    I,
    X,
    Y,
    Z,
    H,
    S,
    T,
    RX,
    RY,
    RZ,
    CNOT,
    CZ,
    gate_matrix,
)
from .circuit import Circuit
from .measurement import MeasurementResult, measure
from .fidelity import pure_state_fidelity
from .experiment import (
    Experiment,
    ExperimentReport,
    ExperimentStatus,
    run_experiment,
    SCHEMA_VERSION,
)

__all__ = [
    "__version__",
    "__software_id__",
    "StateVector",
    "MAX_QUBITS",
    "memory_estimate_bytes",
    "Gate",
    "I",
    "X",
    "Y",
    "Z",
    "H",
    "S",
    "T",
    "RX",
    "RY",
    "RZ",
    "CNOT",
    "CZ",
    "gate_matrix",
    "Circuit",
    "MeasurementResult",
    "measure",
    "pure_state_fidelity",
    "Experiment",
    "ExperimentReport",
    "ExperimentStatus",
    "run_experiment",
    "SCHEMA_VERSION",
]
