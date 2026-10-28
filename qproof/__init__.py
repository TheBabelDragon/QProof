"""
QProof — Independent Quantum State-Vector Simulator + Falsifiable Experiment Core.

Capability-first verification framework. The Bell-state experiment is a smoke
test and onboarding fixture — not the architectural boundary.

This package does not claim quantum advantage or hardware execution.
"""

from __future__ import annotations

__version__ = "0.2.0"
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
from .capabilities import capability_manifest
from .circuit_spec import (
    CIRCUIT_FORMAT_VERSION,
    CircuitSpecError,
    circuit_from_dict,
    circuit_to_dict,
    validate_circuit_dict,
)
from .registry import get_experiment, list_experiments, experiment_from_spec
from .evidence import validate_evidence_structure, verify_report_integrity

try:
    from .oracle import ORACLE_ID, ORACLE_VERSION, run_oracle, supported_gates
    from .verdict import CheckStatus, MetricResult, SuiteVerdict, aggregate_verdict
except ImportError:  # pragma: no cover - partial checkout
    ORACLE_ID = ORACLE_VERSION = None  # type: ignore
    run_oracle = supported_gates = None  # type: ignore
    CheckStatus = MetricResult = SuiteVerdict = aggregate_verdict = None  # type: ignore

try:
    from .golden import GOLDEN_CORPUS_VERSION, list_goldens, get_golden, corpus_public
except ImportError:  # pragma: no cover
    GOLDEN_CORPUS_VERSION = list_goldens = get_golden = corpus_public = None  # type: ignore

try:
    from .verifier import (
        verify_golden,
        verify_all_goldens,
        verify_differential,
        run_randomized_suite,
        run_negative_controls,
        run_full_suite,
        VERIFIER_VERSION,
    )
except ImportError:  # pragma: no cover
    verify_golden = verify_all_goldens = verify_differential = None  # type: ignore
    run_randomized_suite = run_negative_controls = run_full_suite = None  # type: ignore
    VERIFIER_VERSION = None  # type: ignore

try:
    from .campaign import CAMPAIGN_ENGINE_ID, run_campaign
except ImportError:  # pragma: no cover
    CAMPAIGN_ENGINE_ID = run_campaign = None  # type: ignore

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
    "capability_manifest",
    "CIRCUIT_FORMAT_VERSION",
    "CircuitSpecError",
    "circuit_from_dict",
    "circuit_to_dict",
    "validate_circuit_dict",
    "get_experiment",
    "list_experiments",
    "experiment_from_spec",
    "validate_evidence_structure",
    "verify_report_integrity",
    "ORACLE_ID",
    "ORACLE_VERSION",
    "run_oracle",
    "supported_gates",
    "GOLDEN_CORPUS_VERSION",
    "list_goldens",
    "get_golden",
    "corpus_public",
    "CheckStatus",
    "MetricResult",
    "SuiteVerdict",
    "aggregate_verdict",
    "verify_golden",
    "verify_all_goldens",
    "verify_differential",
    "run_randomized_suite",
    "run_negative_controls",
    "run_full_suite",
    "VERIFIER_VERSION",
    "run_campaign",
    "CAMPAIGN_ENGINE_ID",
]
