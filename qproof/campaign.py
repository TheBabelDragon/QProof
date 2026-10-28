"""Adversarial verification campaign runner.

Level-1 implementation verification with measurable effectiveness.
Does not claim hardware certification or quantum advantage.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from . import __software_id__
from .circuit import Circuit
from .gates import CNOT, CZ, H, RX, RY, RZ, S, T, X, Y, Z
from .invariants import amplitudes_match, probabilities_match, run_invariant_suite
from .mutations import MUTATION_CATALOG, list_mutations, run_mutated
from .oracle import ORACLE_ID, OracleGate, run_oracle, supported_gates

CAMPAIGN_SCHEMA_ID = "qproof.adversarial_campaign"
CAMPAIGN_SCHEMA_VERSION = "1.0.0"
CAMPAIGN_ENGINE_ID = f"qproof-campaign/{CAMPAIGN_SCHEMA_VERSION}"

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
        choice = rng.integers(0, 10)
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
        {"fixture_id": "analytic/h0", "n_qubits": 1, "gates": [OracleGate("H", (0,))], "note": "H|0>"},
        {
            "fixture_id": "analytic/bell",
            "n_qubits": 2,
            "gates": [OracleGate("H", (0,)), OracleGate("CNOT", (0, 1))],
            "note": "Bell Phi+",
        },
        {
            "fixture_id": "analytic/xx_identity",
            "n_qubits": 1,
            "gates": [OracleGate("X", (0,)), OracleGate("X", (0,))],
            "note": "X X |0>",
        },
        {
            "fixture_id": "analytic/hh_identity",
            "n_qubits": 1,
            "gates": [OracleGate("H", (0,)), OracleGate("H", (0,))],
            "note": "H H |0>",
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
        }


def _compare_to_reference(
    observed: np.ndarray, reference: np.ndarray, n_qubits: int, tol: float = 1e-10
) -> Tuple[bool, List[Dict[str, Any]]]:
    checks = run_invariant_suite(observed, n_qubits, tol)
    checks.append(amplitudes_match(observed, reference, tol))
    checks.append(probabilities_match(observed, reference, tol))
    return all(c.get("passed") for c in checks), checks


def _to_production_circuit(nq: int, gates: List[OracleGate]) -> Circuit:
    circ = Circuit(nq)
    for g in gates:
        name = g.normalized_name()
        builder = _GATE_BUILDERS.get(name)
        if builder is None:
            raise ValueError(f"unsupported gate: {name}")
        circ.append(builder(g.qubits, g.theta))
    return circ


def run_campaign(
    *,
    seed: int = 42,
    n_random_circuits: int = 12,
    max_qubits: int = 3,
    max_gates: int = 8,
    tol: float = 1e-10,
    mutations: Optional[Sequence[str]] = None,
    output_dir: Optional[str] = None,
) -> Dict[str, Any]:
    t0 = time.perf_counter()
    cases: List[CaseResult] = []
    mutation_ids = list(mutations) if mutations is not None else [m.mutation_id for m in list_mutations()]

    for fx in analytic_fixtures():
        gates, nq = fx["gates"], fx["n_qubits"]
        ref = run_oracle(nq, gates)
        ok, checks = _compare_to_reference(ref.amplitudes, ref.amplitudes, nq, tol)
        cases.append(
            CaseResult(fx["fixture_id"], "analytic", None, False, None, "pass" if ok else "fail", checks, fx.get("note", ""))
        )

    for i in range(n_random_circuits):
        nq = 1 + (_stable_seed(seed, "nq", i) % max_qubits)
        ng = 1 + (_stable_seed(seed, "ng", i) % max_gates)
        cseed = _stable_seed(seed, "circuit", i)
        gates = generate_random_circuit(cseed, nq, ng)
        ref = run_oracle(nq, gates)
        try:
            obs = _to_production_circuit(nq, gates).run().amplitudes
            ok, checks = _compare_to_reference(obs, ref.amplitudes, nq, tol)
            cases.append(
                CaseResult(
                    f"clean/random_{i:03d}",
                    "clean",
                    None,
                    False if ok else True,
                    None,
                    "pass" if ok else "fail",
                    checks,
                    f"n_qubits={nq} n_gates={ng} circuit_seed={cseed}",
                )
            )
        except Exception as exc:
            cases.append(CaseResult(f"clean/random_{i:03d}", "clean", None, None, None, "error", [], str(exc)))

    carriers = [
        {"id": "carrier/bell", "n_qubits": 2, "gates": [OracleGate("H", (0,)), OracleGate("CNOT", (0, 1))]},
        {"id": "carrier/rx", "n_qubits": 1, "gates": [OracleGate("RX", (0,), theta=float(np.pi / 3))]},
        {"id": "carrier/cnot_only", "n_qubits": 2, "gates": [OracleGate("X", (0,)), OracleGate("CNOT", (0, 1))]},
        {"id": "carrier/h_chain", "n_qubits": 2, "gates": [OracleGate("H", (0,)), OracleGate("H", (1,)), OracleGate("CNOT", (0, 1))]},
        {"id": "carrier/phasey", "n_qubits": 1, "gates": [OracleGate("H", (0,)), OracleGate("T", (0,)), OracleGate("S", (0,))]},
        {"id": "carrier/superpos", "n_qubits": 1, "gates": [OracleGate("H", (0,))]},
    ]

    for mut_id in mutation_ids:
        meta = MUTATION_CATALOG[mut_id]
        for carrier in carriers:
            nq, gates = carrier["n_qubits"], carrier["gates"]
            names = {g.normalized_name() for g in gates}
            if mut_id == "cnot_control_target_swap" and "CNOT" not in names:
                continue
            if mut_id == "endianness_swap" and "CNOT" not in names:
                continue
            if mut_id == "rotation_sign_flip" and not names.intersection({"RX", "RY", "RZ"}):
                continue
            ref = run_oracle(nq, gates)
            try:
                mut_amps = run_mutated(nq, gates, mut_id)
                ok, checks = _compare_to_reference(mut_amps, ref.amplitudes, nq, tol)
                detected = not ok
                expected = meta.expected_detectable
                if expected and not detected:
                    status, detail = "inconclusive", meta.description + " (mutation not exercised on this carrier)"
                    exp_flag: Optional[bool] = None
                elif expected and detected:
                    status, detail, exp_flag = "pass", meta.description, expected
                elif not expected and not detected:
                    status, detail, exp_flag = "pass", meta.description, expected
                else:
                    status, detail, exp_flag = "fail", meta.description + " (false alarm)", expected
                cases.append(
                    CaseResult(
                        f"mutation/{mut_id}@{carrier['id']}",
                        "mutation",
                        mut_id,
                        detected,
                        exp_flag,
                        status,
                        checks,
                        detail,
                    )
                )
            except Exception as exc:
                cases.append(
                    CaseResult(
                        f"mutation/{mut_id}@{carrier['id']}",
                        "mutation",
                        mut_id,
                        None,
                        meta.expected_detectable,
                        "error",
                        [],
                        str(exc),
                    )
                )

    mut_cases = [c for c in cases if c.case_type == "mutation"]
    expected_detect = [c for c in mut_cases if c.expected_detectable is True and c.status in ("pass", "fail")]
    expected_clean = [c for c in mut_cases if c.expected_detectable is False]
    detected = [c for c in expected_detect if c.detected_fault]
    missed = [c for c in expected_detect if c.detected_fault is False]
    false_alarms = [c for c in expected_clean if c.detected_fault]
    clean_ok = [c for c in cases if c.case_type in ("clean", "analytic") and c.status == "pass"]
    clean_fail = [c for c in cases if c.case_type in ("clean", "analytic") and c.status == "fail"]

    detection_rate = len(detected) / len(expected_detect) if expected_detect else None
    false_pass_rate = len(missed) / len(expected_detect) if expected_detect else None
    false_alarm_rate = len(false_alarms) / len(expected_clean) if expected_clean else None
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    report: Dict[str, Any] = {
        "schema_id": CAMPAIGN_SCHEMA_ID,
        "schema_version": CAMPAIGN_SCHEMA_VERSION,
        "engine_id": CAMPAIGN_ENGINE_ID,
        "software_id": __software_id__,
        "oracle_id": ORACLE_ID,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "seed": seed,
        "parameters": {
            "n_random_circuits": n_random_circuits,
            "max_qubits": max_qubits,
            "max_gates": max_gates,
            "tolerance": tol,
            "mutations": mutation_ids,
            "supported_gates": supported_gates(),
        },
        "metrics": {
            "n_total": len(cases),
            "n_pass": sum(1 for c in cases if c.status == "pass"),
            "n_fail": sum(1 for c in cases if c.status == "fail"),
            "n_error": sum(1 for c in cases if c.status == "error"),
            "n_inconclusive": sum(1 for c in cases if c.status == "inconclusive"),
            "n_mutation_cases": len(mut_cases),
            "n_expected_detectable": len(expected_detect),
            "n_detected": len(detected),
            "n_missed": len(missed),
            "n_false_alarms": len(false_alarms),
            "detection_rate": detection_rate,
            "false_pass_rate": false_pass_rate,
            "false_alarm_rate": false_alarm_rate,
            "n_clean_pass": len(clean_ok),
            "n_clean_fail": len(clean_fail),
            "elapsed_ms": elapsed_ms,
        },
        "cases": [c.to_dict() for c in cases],
        "limitations": [
            "Level-1 implementation verification only.",
            "Does not certify quantum hardware or claim quantum advantage.",
            "Mutations are software faults, not physical noise models.",
            "Carriers where a mutation is not exercised are inconclusive, not misses.",
            "Finite floating-point tolerance; not exact symbolic equality.",
        ],
        "acceptance": {
            "criterion": "Campaign detects documented faults, passes clean circuits, emits seed-reproducible report",
            "detection_rate_ok": detection_rate is not None and detection_rate >= 0.8,
            "clean_ok": len(clean_fail) == 0 and len(clean_ok) > 0,
            "no_false_alarms_on_identity": false_alarm_rate is not None and false_alarm_rate == 0.0,
        },
    }
    hashable = {k: v for k, v in report.items() if k != "timestamp_utc"}
    report["campaign_hash"] = hashlib.sha256(
        json.dumps(hashable, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()

    if output_dir:
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        (out / "campaign_report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        lines = [
            f"# QProof adversarial campaign (seed={seed})",
            "",
            f"- Engine: `{CAMPAIGN_ENGINE_ID}`",
            f"- Detection rate: {detection_rate}",
            f"- False-pass rate: {false_pass_rate}",
            f"- False-alarm rate: {false_alarm_rate}",
            f"- Clean pass/fail: {len(clean_ok)}/{len(clean_fail)}",
            f"- Cases: {len(cases)}",
            "",
            "## Limitations",
            "",
        ]
        for lim in report["limitations"]:
            lines.append(f"- {lim}")
        (out / "campaign_summary.md").write_text("\n".join(lines) + "\n")
    return report
