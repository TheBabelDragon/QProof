"""Versioned experiment schema, runner, and evidence reports."""

from __future__ import annotations

import hashlib
import json
import platform
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

import numpy as np

from . import __software_id__, __version__
from .circuit import Circuit
from .fidelity import pure_state_fidelity
from .measurement import measure
from .reference import (
    bell_expected_amplitudes,
    bell_expected_probabilities,
    verify_amplitudes,
    verify_normalization,
    verify_probabilities,
    verify_shot_consistency,
)
from .statevector import StateVector

SCHEMA_VERSION = "1.0.0"


class ExperimentStatus(str, Enum):
    PASSED = "passed"
    FAILED = "failed"
    INCONCLUSIVE = "inconclusive"


@dataclass
class CheckResult:
    name: str
    status: ExperimentStatus
    detail: str
    observed: Optional[Any] = None
    expected: Optional[Any] = None
    tolerance: Optional[float] = None

    def to_dict(self) -> dict:
        d: dict = {
            "name": self.name,
            "status": self.status.value,
            "detail": self.detail,
        }
        if self.observed is not None:
            d["observed"] = self.observed
        if self.expected is not None:
            d["expected"] = self.expected
        if self.tolerance is not None:
            d["tolerance"] = self.tolerance
        return d


@dataclass
class Experiment:
    """Definition of a falsifiable experiment.

    expected_* come from an independent reference or a documented supplied
    expected state — not from re-running the production gate path for the
    claim under test.
    """

    experiment_id: str
    description: str
    claim: str
    circuit: Circuit
    expected_amplitudes: np.ndarray
    expected_probabilities: np.ndarray
    shots: int = 0
    seed: Optional[int] = None
    amplitude_tol: float = 1e-10
    probability_tol: float = 1e-10
    fidelity_tol: float = 1e-10
    reference_id: str = "supplied/expected-v1"
    limitations: List[str] = field(default_factory=list)
    initial_state: Optional[StateVector] = None


@dataclass
class ExperimentReport:
    schema_version: str
    experiment_id: str
    description: str
    claim: str
    status: ExperimentStatus
    checks: List[CheckResult]
    circuit_spec: list
    n_qubits: int
    gate_count: int
    depth: int
    shots: int
    seed: Optional[int]
    observed_amplitudes: List[List[float]]
    observed_probabilities: List[float]
    expected_amplitudes: List[List[float]]
    expected_probabilities: List[float]
    fidelity: float
    measurement_counts: Dict[str, int]
    simulator_id: str
    reference_id: str
    tolerances: Dict[str, float]
    runtime_ms: float
    environment: Dict[str, str]
    limitations: List[str]
    execution_mode: str
    input_hash: Optional[str] = None
    report_hash: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "schema_version": self.schema_version,
            "experiment_id": self.experiment_id,
            "description": self.description,
            "claim": self.claim,
            "status": self.status.value,
            "checks": [c.to_dict() for c in self.checks],
            "circuit": {
                "spec": self.circuit_spec,
                "n_qubits": self.n_qubits,
                "gate_count": self.gate_count,
                "depth": self.depth,
            },
            "execution": {
                "shots": self.shots,
                "seed": self.seed,
                "mode": self.execution_mode,
                "runtime_ms": self.runtime_ms,
            },
            "results": {
                "observed_amplitudes": self.observed_amplitudes,
                "observed_probabilities": self.observed_probabilities,
                "expected_amplitudes": self.expected_amplitudes,
                "expected_probabilities": self.expected_probabilities,
                "fidelity": self.fidelity,
                "measurement_counts": self.measurement_counts,
            },
            "verification": {
                "simulator_id": self.simulator_id,
                "reference_id": self.reference_id,
                "tolerances": self.tolerances,
            },
            "environment": self.environment,
            "limitations": self.limitations,
            "integrity": {
                "input_hash": self.input_hash,
                "report_hash": self.report_hash,
            },
        }

    def to_json(self, *, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, sort_keys=True)


def _amp_list(amps: np.ndarray) -> List[List[float]]:
    return [[float(a.real), float(a.imag)] for a in amps]


def _canonical_hash(obj: dict) -> str:
    raw = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def run_experiment(exp: Experiment) -> ExperimentReport:
    """Execute *exp*, verify against independent/supplied reference, return report."""
    checks: List[CheckResult] = []
    t0 = time.perf_counter()

    initial = exp.initial_state
    if initial is None:
        initial = getattr(exp, "_initial_state", None)

    try:
        state = exp.circuit.run(initial=initial)
        amps = state.amplitudes.copy()
        probs = state.probabilities()
        meas = measure(state, shots=exp.shots, seed=exp.seed)
    except Exception as exc:
        t1 = time.perf_counter()
        checks.append(
            CheckResult(
                name="execution",
                status=ExperimentStatus.FAILED,
                detail=f"simulator raised: {exc}",
            )
        )
        return _build_report(
            exp,
            checks,
            status=ExperimentStatus.FAILED,
            amps=np.array([]),
            probs=np.array([]),
            fidelity=0.0,
            counts={},
            runtime_ms=(t1 - t0) * 1000,
        )

    t1 = time.perf_counter()
    runtime_ms = (t1 - t0) * 1000

    expected_dim = 1 << exp.circuit.n_qubits
    if amps.size != expected_dim:
        checks.append(
            CheckResult(
                "dimension",
                ExperimentStatus.FAILED,
                f"got {amps.size}, expected {expected_dim}",
            )
        )
    else:
        checks.append(
            CheckResult("dimension", ExperimentStatus.PASSED, f"dim={amps.size}")
        )

    if np.all(np.isfinite(amps)):
        checks.append(
            CheckResult("finite", ExperimentStatus.PASSED, "all amplitudes finite")
        )
    else:
        checks.append(
            CheckResult("finite", ExperimentStatus.FAILED, "non-finite amplitudes")
        )

    ok, detail = verify_normalization(amps, tol=exp.amplitude_tol)
    checks.append(
        CheckResult(
            "normalization",
            ExperimentStatus.PASSED if ok else ExperimentStatus.FAILED,
            detail,
            tolerance=exp.amplitude_tol,
        )
    )

    ok, detail = verify_amplitudes(amps, exp.expected_amplitudes, tol=exp.amplitude_tol)
    checks.append(
        CheckResult(
            "amplitudes",
            ExperimentStatus.PASSED if ok else ExperimentStatus.FAILED,
            detail,
            tolerance=exp.amplitude_tol,
        )
    )

    ok, detail = verify_probabilities(
        probs, exp.expected_probabilities, tol=exp.probability_tol
    )
    checks.append(
        CheckResult(
            "probabilities",
            ExperimentStatus.PASSED if ok else ExperimentStatus.FAILED,
            detail,
            tolerance=exp.probability_tol,
        )
    )

    ref_state = StateVector(exp.expected_amplitudes, normalize=False)
    fid = pure_state_fidelity(state, ref_state)
    fid_ok = abs(fid - 1.0) <= exp.fidelity_tol
    checks.append(
        CheckResult(
            "fidelity",
            ExperimentStatus.PASSED if fid_ok else ExperimentStatus.FAILED,
            f"F={fid:.12f}",
            observed=fid,
            expected=1.0,
            tolerance=exp.fidelity_tol,
        )
    )

    if exp.shots > 0:
        ok, detail = verify_shot_consistency(
            meas.counts,
            exp.expected_probabilities,
            exp.shots,
            n_qubits=exp.circuit.n_qubits,
        )
        checks.append(
            CheckResult(
                "shot_consistency",
                ExperimentStatus.PASSED if ok else ExperimentStatus.FAILED,
                detail,
            )
        )
    else:
        checks.append(
            CheckResult(
                "shot_consistency",
                ExperimentStatus.PASSED,
                "no shots requested — exact probabilities only",
            )
        )

    statuses = [c.status for c in checks]
    if any(s == ExperimentStatus.FAILED for s in statuses):
        status = ExperimentStatus.FAILED
    elif any(s == ExperimentStatus.INCONCLUSIVE for s in statuses):
        status = ExperimentStatus.INCONCLUSIVE
    else:
        status = ExperimentStatus.PASSED

    return _build_report(
        exp,
        checks,
        status=status,
        amps=amps,
        probs=probs,
        fidelity=fid,
        counts=meas.counts,
        runtime_ms=runtime_ms,
    )


def _build_report(
    exp: Experiment,
    checks: List[CheckResult],
    *,
    status: ExperimentStatus,
    amps: np.ndarray,
    probs: np.ndarray,
    fidelity: float,
    counts: Dict[str, int],
    runtime_ms: float,
) -> ExperimentReport:
    env = {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "numpy": np.__version__,
        "qproof": __version__,
    }
    report = ExperimentReport(
        schema_version=SCHEMA_VERSION,
        experiment_id=exp.experiment_id,
        description=exp.description,
        claim=exp.claim,
        status=status,
        checks=checks,
        circuit_spec=exp.circuit.to_spec(),
        n_qubits=exp.circuit.n_qubits,
        gate_count=exp.circuit.gate_count,
        depth=exp.circuit.depth,
        shots=exp.shots,
        seed=exp.seed,
        observed_amplitudes=_amp_list(amps) if amps.size else [],
        observed_probabilities=probs.tolist() if probs.size else [],
        expected_amplitudes=_amp_list(exp.expected_amplitudes),
        expected_probabilities=exp.expected_probabilities.tolist(),
        fidelity=fidelity,
        measurement_counts=dict(counts),
        simulator_id=__software_id__,
        reference_id=exp.reference_id,
        tolerances={
            "amplitude": exp.amplitude_tol,
            "probability": exp.probability_tol,
            "fidelity": exp.fidelity_tol,
        },
        runtime_ms=round(runtime_ms, 3),
        environment=env,
        limitations=list(exp.limitations),
        execution_mode="classical_statevector",
    )
    input_obj = {
        "experiment_id": exp.experiment_id,
        "circuit": exp.circuit.to_spec(),
        "shots": exp.shots,
        "seed": exp.seed,
        "tolerances": report.tolerances,
    }
    report.input_hash = _canonical_hash(input_obj)
    body = report.to_dict()
    body["integrity"]["report_hash"] = None
    report.report_hash = _canonical_hash(body)
    return report


def bell_state_experiment(
    *,
    shots: int = 1024,
    seed: int = 42,
    amplitude_tol: float = 1e-10,
    probability_tol: float = 1e-10,
    fidelity_tol: float = 1e-10,
) -> Experiment:
    """Smoke / onboarding fixture: Bell-state preparation and verification."""
    circ = Circuit(2).h(0).cx(0, 1)
    return Experiment(
        experiment_id="bell-state-v1",
        description=(
            "Prepare the Bell state (|00⟩ + |11⟩)/√2 via H(0); CNOT(0,1) "
            "and verify against an independent analytic reference."
        ),
        claim=(
            "The classical state-vector simulation of H(0); CNOT(0,1) on |00⟩ "
            "produces amplitudes and probabilities matching the analytic Bell "
            "state (|00⟩ + |11⟩)/√2 under little-endian qubit ordering. "
            "This demonstrates correctness of the modelled circuit, not quantum "
            "computational advantage."
        ),
        circuit=circ,
        expected_amplitudes=bell_expected_amplitudes(),
        expected_probabilities=bell_expected_probabilities(),
        shots=shots,
        seed=seed,
        amplitude_tol=amplitude_tol,
        probability_tol=probability_tol,
        fidelity_tol=fidelity_tol,
        reference_id="analytic/bell-v1",
        limitations=[
            "Classical state-vector simulation only — no quantum hardware.",
            "No noise model; ideal gates assumed.",
            "Does not demonstrate quantum advantage.",
            "Shot statistics are a consistency check, not a formal hypothesis test.",
            "Fixture for smoke/onboarding — not the capability boundary.",
        ],
    )


def global_phase_experiment() -> Experiment:
    """Phase fixture: X; Z on |0⟩ → −|1⟩."""
    circ = Circuit(1).x(0).z(0)
    expected = np.array([0.0, -1.0], dtype=np.complex128)
    return Experiment(
        experiment_id="global-phase-v1",
        description="Apply X then Z to |0⟩; result is −|1⟩ (global phase on |1⟩).",
        claim=(
            "X; Z on |0⟩ yields amplitudes [0, −1], demonstrating correct "
            "Z-gate phase. Fidelity to |1⟩ is 1 (phase-invariant)."
        ),
        circuit=circ,
        expected_amplitudes=expected,
        expected_probabilities=np.array([0.0, 1.0]),
        shots=0,
        seed=None,
        reference_id="analytic/phase-v1",
        limitations=[
            "Classical simulation only.",
            "Global phase is unobservable in measurement probabilities.",
        ],
    )
