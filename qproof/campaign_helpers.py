"""Campaign helpers (v1.1): fixtures, validation, digests, comparison."""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from . import __software_id__
from .circuit import Circuit
from .gates import CNOT, CZ, H, RX, RY, RZ, S, T, X, Y, Z
from .invariants import amplitudes_match, probabilities_match, run_invariant_suite
from .mutations import MUTATION_CATALOG, list_mutations
from .oracle import ORACLE_ID, OracleGate, run_oracle, supported_gates

CAMPAIGN_SCHEMA_ID = "qproof.adversarial_campaign"
CAMPAIGN_SCHEMA_VERSION = "1.1.0"
CAMPAIGN_ENGINE_ID = f"qproof-campaign/{CAMPAIGN_SCHEMA_VERSION}"
CANONICALIZATION_VERSION = "qproof-campaign-canonical-v1"
DIGEST_ALGORITHM = "sha256"
PRODUCTION_ENGINE_ID = __software_id__

_S2 = 1.0 / math.sqrt(2.0)

_GATE_BUILDERS = {
    "H": lambda qs, th: H(qs[0]),
    "X": lambda qs, th: X(qs[0]),
    "Y": lambda qs, th: Y(qs[0]),
    "Z": lambda qs, th: Z(qs[0]),
    "S": lambda qs, th: S(qs[0]),
    "T": lambda qs, th: T(qs[0]),
    "RX": lambda qs, th: RX(qs[0], th),
    "RY": lambda qs, th: RY(qs[0], th),
    "RZ": lambda qs, th: RZ(qs[0], th),
    "CNOT": lambda qs, th: CNOT(qs[0], qs[1]),
    "CZ": lambda qs, th: CZ(qs[0], qs[1]),
}


class CampaignInputError(ValueError):
    """Invalid campaign configuration."""


def _stable_seed(master: int, *parts: Any) -> int:
    payload = str(int(master))
    for p in parts:
        payload += "|" + str(p)
    digest = hashlib.sha256(payload.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") % (2**31 - 1)


def generate_random_circuit(seed: int, n_qubits: int, n_gates: int) -> List[OracleGate]:
    rng = np.random.default_rng(seed)
    singles = ["H", "X", "Y", "Z", "S", "T"]
    rotations = ["RX", "RY", "RZ"]
    gates: List[OracleGate] = []
    for _ in range(n_gates):
        choice = int(rng.integers(0, 10))
        if choice < 5:
            name = singles[int(rng.integers(0, len(singles)))]
            q = int(rng.integers(0, n_qubits))
            gates.append(OracleGate(name=name, qubits=(q,)))
        elif choice < 7:
            name = rotations[int(rng.integers(0, len(rotations)))]
            q = int(rng.integers(0, n_qubits))
            theta = float(rng.uniform(0, 2 * np.pi))
            gates.append(OracleGate(name=name, qubits=(q,), theta=theta))
        elif n_qubits >= 2:
            c = int(rng.integers(0, n_qubits))
            t = int(rng.integers(0, n_qubits))
            while t == c:
                t = int(rng.integers(0, n_qubits))
            name = "CNOT" if rng.random() < 0.7 else "CZ"
            gates.append(OracleGate(name=name, qubits=(c, t)))
        else:
            gates.append(OracleGate(name="H", qubits=(0,)))
    return gates


def analytic_fixtures() -> List[Dict[str, Any]]:
    return [
        {
            "fixture_id": "analytic/h0",
            "n_qubits": 1,
            "gates": [OracleGate("H", (0,))],
            "note": "H|0> = (|0>+|1>)/sqrt(2)",
            "analytic_amplitudes": np.array([_S2, _S2], dtype=np.complex128),
        },
        {
            "fixture_id": "analytic/bell",
            "n_qubits": 2,
            "gates": [OracleGate("H", (0,)), OracleGate("CNOT", (0, 1))],
            "note": "Bell Phi+",
            "analytic_amplitudes": np.array([_S2, 0.0, 0.0, _S2], dtype=np.complex128),
        },
        {
            "fixture_id": "analytic/xx_identity",
            "n_qubits": 1,
            "gates": [OracleGate("X", (0,)), OracleGate("X", (0,))],
            "note": "X X |0> = |0>",
            "analytic_amplitudes": np.array([1.0 + 0j, 0.0 + 0j], dtype=np.complex128),
        },
        {
            "fixture_id": "analytic/hh_identity",
            "n_qubits": 1,
            "gates": [OracleGate("H", (0,)), OracleGate("H", (0,))],
            "note": "H H |0> = |0>",
            "analytic_amplitudes": np.array([1.0 + 0j, 0.0 + 0j], dtype=np.complex128),
        },
    ]


@dataclass
class CaseResult:
    case_id: str
    case_type: str
    mutation_id: Optional[str]
    detected_fault: Optional[bool]
    expected_detectable: Optional[bool]
    status: str
    checks: List[Dict[str, Any]] = field(default_factory=list)
    detail: str = ""
    circuit: Optional[List[Dict[str, Any]]] = None
    oracle_id: Optional[str] = None
    production_engine_id: Optional[str] = None
    exercised: Optional[bool] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "case_id": self.case_id,
            "case_type": self.case_type,
            "mutation_id": self.mutation_id,
            "detected_fault": self.detected_fault,
            "expected_detectable": self.expected_detectable,
            "status": self.status,
            "checks": self.checks,
            "detail": self.detail,
            "circuit": self.circuit,
            "oracle_id": self.oracle_id,
            "production_engine_id": self.production_engine_id,
            "exercised": self.exercised,
        }


def gates_to_spec(gates: Sequence[OracleGate]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for g in gates:
        d: Dict[str, Any] = {"gate": g.normalized_name(), "qubits": list(g.qubits)}
        if g.theta is not None:
            d["theta"] = float(g.theta)
        out.append(d)
    return out


def _compare_to_reference(
    observed: np.ndarray, reference: np.ndarray, n_qubits: int, tol: float = 1e-10
) -> Tuple[bool, List[Dict[str, Any]]]:
    checks = run_invariant_suite(observed, n_qubits, tol)
    checks.append(amplitudes_match(observed, reference, tol))
    checks.append(probabilities_match(observed, reference, tol))
    return all(bool(c.get("passed")) for c in checks), checks


def _to_production_circuit(nq: int, gates: List[OracleGate]) -> Circuit:
    circ = Circuit(nq)
    for g in gates:
        name = g.normalized_name()
        builder = _GATE_BUILDERS.get(name)
        if builder is None:
            raise ValueError(f"unsupported gate: {name}")
        circ.append(builder(g.qubits, g.theta))
    return circ


def validate_campaign_args(
    *,
    seed: Any,
    n_random_circuits: Any,
    max_qubits: Any,
    max_gates: Any,
    tol: Any,
    mutations: Optional[Sequence[str]],
) -> Tuple[int, int, int, int, float, List[str]]:
    if not isinstance(seed, (int, np.integer)) or isinstance(seed, bool):
        raise CampaignInputError(f"seed must be an integer, got {type(seed).__name__}")
    seed_i = int(seed)
    if seed_i < 0 or seed_i >= 2**63:
        raise CampaignInputError(f"seed out of supported range [0, 2^63): {seed_i}")
    if not isinstance(n_random_circuits, (int, np.integer)) or isinstance(n_random_circuits, bool):
        raise CampaignInputError("n_random_circuits must be a non-negative integer")
    n_rand = int(n_random_circuits)
    if n_rand < 0:
        raise CampaignInputError("n_random_circuits must be >= 0")
    if not isinstance(max_qubits, (int, np.integer)) or isinstance(max_qubits, bool):
        raise CampaignInputError("max_qubits must be an integer >= 1")
    mq = int(max_qubits)
    if mq < 1:
        raise CampaignInputError("max_qubits must be >= 1")
    if not isinstance(max_gates, (int, np.integer)) or isinstance(max_gates, bool):
        raise CampaignInputError("max_gates must be an integer >= 1")
    mg = int(max_gates)
    if mg < 1:
        raise CampaignInputError("max_gates must be >= 1")
    if not isinstance(tol, (int, float, np.floating)) or isinstance(tol, bool):
        raise CampaignInputError("tol must be a finite non-negative float")
    tol_f = float(tol)
    if not math.isfinite(tol_f) or tol_f < 0:
        raise CampaignInputError("tol must be a finite non-negative float")
    if mutations is None:
        mut_ids = [m.mutation_id for m in list_mutations()]
    else:
        if not isinstance(mutations, (list, tuple)):
            raise CampaignInputError("mutations must be a sequence of mutation IDs")
        mut_ids = list(mutations)
        for mid in mut_ids:
            if not isinstance(mid, str):
                raise CampaignInputError(f"mutation ID must be str, got {type(mid).__name__}")
            if mid not in MUTATION_CATALOG:
                raise CampaignInputError(
                    f"unknown mutation ID: {mid!r}; known: {sorted(MUTATION_CATALOG)}"
                )
    return seed_i, n_rand, mq, mg, tol_f, mut_ids


def _json_default(obj: Any) -> Any:
    if isinstance(obj, (np.floating, float)):
        v = float(obj)
        if not math.isfinite(v):
            return str(v)
        return float(f"{v:.15g}")
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, complex):
        return [float(f"{obj.real:.15g}"), float(f"{obj.imag:.15g}")]
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def canonical_campaign_payload(report: Dict[str, Any]) -> Dict[str, Any]:
    metrics = report.get("metrics") or {}
    det_metrics = {k: v for k, v in metrics.items() if k not in ("elapsed_ms",)}
    return {
        "schema_id": report.get("schema_id"),
        "schema_version": report.get("schema_version"),
        "engine_id": report.get("engine_id"),
        "software_id": report.get("software_id"),
        "oracle_id": report.get("oracle_id"),
        "production_engine_id": report.get("production_engine_id"),
        "seed": report.get("seed"),
        "parameters": report.get("parameters"),
        "metrics": det_metrics,
        "cases": report.get("cases"),
        "acceptance": report.get("acceptance"),
        "limitations": report.get("limitations"),
        "canonicalization_version": CANONICALIZATION_VERSION,
        "digest_algorithm": DIGEST_ALGORITHM,
    }


def compute_campaign_digest(report: Dict[str, Any]) -> str:
    payload = canonical_campaign_payload(report)
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=_json_default)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
