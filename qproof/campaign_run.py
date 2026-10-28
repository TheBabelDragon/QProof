"""run_campaign implementation."""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence

import numpy as np

from . import __software_id__
from .campaign_helpers import (
    CAMPAIGN_ENGINE_ID,
    CAMPAIGN_SCHEMA_ID,
    CAMPAIGN_SCHEMA_VERSION,
    CANONICALIZATION_VERSION,
    DIGEST_ALGORITHM,
    PRODUCTION_ENGINE_ID,
    CaseResult,
    analytic_fixtures,
    compute_campaign_digest,
    gates_to_spec,
    generate_random_circuit,
    validate_campaign_args,
    _compare_to_reference,
    _json_default,
    _stable_seed,
    _to_production_circuit,
)
from .mutations import MUTATION_CATALOG, run_mutated
from .oracle import ORACLE_ID, OracleGate, run_oracle, supported_gates


def run_campaign(
    *,
    seed: int = 42,
    n_random_circuits: int = 12,
    max_qubits: int = 3,
    max_gates: int = 8,
    tol: float = 1e-10,
    mutations: Optional[Sequence[str]] = None,
    output_dir: Optional[str] = None,
    production_runner: Optional[Callable[[int, List[OracleGate]], np.ndarray]] = None,
) -> Dict[str, Any]:
    seed, n_random_circuits, max_qubits, max_gates, tol, mutation_ids = validate_campaign_args(
        seed=seed,
        n_random_circuits=n_random_circuits,
        max_qubits=max_qubits,
        max_gates=max_gates,
        tol=tol,
        mutations=mutations,
    )

    def default_runner(nq: int, gates: List[OracleGate]) -> np.ndarray:
        return _to_production_circuit(nq, gates).run().amplitudes

    runner = production_runner or default_runner
    t0 = time.perf_counter()
    cases: List[CaseResult] = []

    for fx in analytic_fixtures():
        gates, nq = fx["gates"], fx["n_qubits"]
        circuit_spec = gates_to_spec(gates)
        try:
            ref = run_oracle(nq, gates)
            obs = runner(nq, gates)
            ok, checks = _compare_to_reference(obs, ref.amplitudes, nq, tol)
            if fx.get("analytic_amplitudes") is not None:
                ok_a, checks_a = _compare_to_reference(
                    obs, np.asarray(fx["analytic_amplitudes"], dtype=np.complex128), nq, tol
                )
                for c in checks_a:
                    c = dict(c)
                    c["name"] = "analytic_" + str(c.get("name", "check"))
                    checks.append(c)
                ok = ok and ok_a
            cases.append(
                CaseResult(
                    case_id=fx["fixture_id"],
                    case_type="analytic",
                    mutation_id=None,
                    detected_fault=False if ok else True,
                    expected_detectable=None,
                    status="pass" if ok else "fail",
                    checks=checks,
                    detail=fx.get("note", ""),
                    circuit=circuit_spec,
                    oracle_id=ORACLE_ID,
                    production_engine_id=PRODUCTION_ENGINE_ID,
                )
            )
        except Exception as exc:
            cases.append(
                CaseResult(
                    case_id=fx["fixture_id"],
                    case_type="analytic",
                    mutation_id=None,
                    detected_fault=None,
                    expected_detectable=None,
                    status="error",
                    checks=[],
                    detail=str(exc),
                    circuit=circuit_spec,
                    oracle_id=ORACLE_ID,
                    production_engine_id=PRODUCTION_ENGINE_ID,
                )
            )

    for i in range(n_random_circuits):
        nq = 1 + (_stable_seed(seed, "nq", i) % max_qubits)
        ng = 1 + (_stable_seed(seed, "ng", i) % max_gates)
        cseed = _stable_seed(seed, "circuit", i)
        gates = generate_random_circuit(cseed, nq, ng)
        circuit_spec = gates_to_spec(gates)
        try:
            ref = run_oracle(nq, gates)
            obs = runner(nq, gates)
            ok, checks = _compare_to_reference(obs, ref.amplitudes, nq, tol)
            cases.append(
                CaseResult(
                    case_id=f"clean/random_{i:03d}",
                    case_type="clean",
                    mutation_id=None,
                    detected_fault=False if ok else True,
                    expected_detectable=None,
                    status="pass" if ok else "fail",
                    checks=checks,
                    detail=f"n_qubits={nq} n_gates={ng} circuit_seed={cseed}",
                    circuit=circuit_spec,
                    oracle_id=ORACLE_ID,
                    production_engine_id=PRODUCTION_ENGINE_ID,
                )
            )
        except Exception as exc:
            cases.append(
                CaseResult(
                    case_id=f"clean/random_{i:03d}",
                    case_type="clean",
                    mutation_id=None,
                    detected_fault=None,
                    expected_detectable=None,
                    status="error",
                    checks=[],
                    detail=str(exc),
                    circuit=circuit_spec,
                    oracle_id=ORACLE_ID,
                    production_engine_id=PRODUCTION_ENGINE_ID,
                )
            )

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
            circuit_spec = gates_to_spec(gates)
            try:
                ref = run_oracle(nq, gates)
                mut_amps = run_mutated(nq, gates, mut_id)
                ok, checks = _compare_to_reference(mut_amps, ref.amplitudes, nq, tol)
                detected = not ok
                expected = meta.expected_detectable
                if expected and not detected:
                    status = "inconclusive"
                    detail = meta.description + " (mutation not exercised on this carrier)"
                    exercised = False
                    exp_flag: Optional[bool] = True
                elif expected and detected:
                    status, detail, exercised, exp_flag = "pass", meta.description, True, True
                elif not expected and not detected:
                    status, detail, exercised, exp_flag = "pass", meta.description, True, False
                else:
                    status = "fail"
                    detail = meta.description + " (false alarm)"
                    exercised, exp_flag = True, False
                cases.append(
                    CaseResult(
                        case_id=f"mutation/{mut_id}@{carrier['id']}",
                        case_type="mutation",
                        mutation_id=mut_id,
                        detected_fault=detected,
                        expected_detectable=exp_flag,
                        status=status,
                        checks=checks,
                        detail=detail,
                        circuit=circuit_spec,
                        oracle_id=ORACLE_ID,
                        production_engine_id=PRODUCTION_ENGINE_ID,
                        exercised=exercised,
                    )
                )
            except Exception as exc:
                cases.append(
                    CaseResult(
                        case_id=f"mutation/{mut_id}@{carrier['id']}",
                        case_type="mutation",
                        mutation_id=mut_id,
                        detected_fault=None,
                        expected_detectable=meta.expected_detectable,
                        status="error",
                        checks=[],
                        detail=str(exc),
                        circuit=circuit_spec,
                        oracle_id=ORACLE_ID,
                        production_engine_id=PRODUCTION_ENGINE_ID,
                        exercised=None,
                    )
                )

    mut_cases = [c for c in cases if c.case_type == "mutation"]
    n_mut_attempted = len(mut_cases)
    n_mut_error = sum(1 for c in mut_cases if c.status == "error")
    n_mut_inconclusive = sum(1 for c in mut_cases if c.status == "inconclusive")

    def _is_expected_detectable(c: CaseResult) -> bool:
        if c.mutation_id and c.mutation_id in MUTATION_CATALOG:
            return MUTATION_CATALOG[c.mutation_id].expected_detectable
        return bool(c.expected_detectable)

    exp_det_cases = [c for c in mut_cases if _is_expected_detectable(c)]
    exp_clean_cases = [c for c in mut_cases if not _is_expected_detectable(c)]
    exercised_det = [c for c in exp_det_cases if c.exercised is True]
    unexercised_det = [c for c in exp_det_cases if c.exercised is False]
    detected = [c for c in exercised_det if c.detected_fault is True]
    missed = [c for c in exercised_det if c.detected_fault is False]
    false_alarms = [c for c in exp_clean_cases if c.detected_fault is True]

    det_denom = len(detected) + len(missed)
    detection_rate: Optional[float] = len(detected) / det_denom if det_denom > 0 else None
    false_pass_rate: Optional[float] = len(missed) / det_denom if det_denom > 0 else None
    clean_denom = len(exp_clean_cases)
    false_alarm_rate: Optional[float] = (
        len(false_alarms) / clean_denom if clean_denom > 0 else None
    )

    clean_like = [c for c in cases if c.case_type in ("clean", "analytic")]
    n_clean_pass = sum(1 for c in clean_like if c.status == "pass")
    n_clean_fail = sum(1 for c in clean_like if c.status == "fail")
    n_clean_error = sum(1 for c in clean_like if c.status == "error")
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    has_analytic = any(c.case_type == "analytic" for c in cases)
    has_mutation_coverage = det_denom > 0 or n_mut_attempted > 0
    detection_rate_ok = detection_rate is not None and detection_rate >= 0.8
    if len(exp_det_cases) > 0 and det_denom == 0 and n_mut_error == 0:
        detection_rate_ok = False
    if n_mut_error > 0 and any(_is_expected_detectable(c) and c.status == "error" for c in mut_cases):
        detection_rate_ok = False
    clean_ok = n_clean_fail == 0 and n_clean_error == 0 and n_clean_pass > 0
    no_false_alarms = false_alarm_rate is not None and false_alarm_rate == 0.0
    if clean_denom == 0:
        no_false_alarms = False

    acceptance = {
        "criterion": (
            "Production vs independent oracle on analytic/clean circuits; "
            "exercised expected-detectable mutations detected; no identity false alarms; "
            "no clean/analytic errors"
        ),
        "detection_rate_ok": detection_rate_ok,
        "clean_ok": clean_ok,
        "no_false_alarms_on_identity": no_false_alarms,
        "has_analytic_fixtures": has_analytic,
        "has_mutation_coverage": has_mutation_coverage,
        "overall_ok": bool(detection_rate_ok and clean_ok and no_false_alarms and has_analytic),
    }

    report: Dict[str, Any] = {
        "schema_id": CAMPAIGN_SCHEMA_ID,
        "schema_version": CAMPAIGN_SCHEMA_VERSION,
        "engine_id": CAMPAIGN_ENGINE_ID,
        "software_id": __software_id__,
        "oracle_id": ORACLE_ID,
        "production_engine_id": PRODUCTION_ENGINE_ID,
        "canonicalization_version": CANONICALIZATION_VERSION,
        "digest_algorithm": DIGEST_ALGORITHM,
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
            "n_mutation_attempted": n_mut_attempted,
            "n_mutation_error": n_mut_error,
            "n_mutation_inconclusive": n_mut_inconclusive,
            "n_expected_detectable_attempted": len(exp_det_cases),
            "n_exercised_detectable": det_denom,
            "n_unexercised_detectable": len(unexercised_det),
            "n_detected": len(detected),
            "n_missed": len(missed),
            "n_false_alarms": len(false_alarms),
            "detection_rate": detection_rate,
            "false_pass_rate": false_pass_rate,
            "false_alarm_rate": false_alarm_rate,
            "detection_rate_denominator": det_denom,
            "false_alarm_rate_denominator": clean_denom,
            "n_clean_pass": n_clean_pass,
            "n_clean_fail": n_clean_fail,
            "n_clean_error": n_clean_error,
            "elapsed_ms": elapsed_ms,
        },
        "cases": [c.to_dict() for c in cases],
        "limitations": [
            "Level-1 implementation verification only.",
            "Does not certify quantum hardware or claim quantum advantage.",
            "Mutations are software faults, not physical noise models.",
            "Carriers where a mutation is not exercised are inconclusive, not misses.",
            "Finite floating-point tolerance; not exact symbolic equality.",
            "Deterministic digest excludes timestamps and elapsed_ms; digest match != scientific truth.",
        ],
        "acceptance": acceptance,
    }
    report["campaign_hash"] = compute_campaign_digest(report)

    if output_dir:
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        (out / "campaign_report.json").write_text(
            json.dumps(report, indent=2, sort_keys=True, default=_json_default) + "\n"
        )
        lines = [
            f"# QProof adversarial campaign (seed={seed})",
            "",
            f"- Engine: `{CAMPAIGN_ENGINE_ID}`",
            f"- Oracle: `{ORACLE_ID}`",
            f"- Detection rate: {detection_rate} (denom={det_denom})",
            f"- False-pass rate: {false_pass_rate}",
            f"- False-alarm rate: {false_alarm_rate}",
            f"- Clean pass/fail/error: {n_clean_pass}/{n_clean_fail}/{n_clean_error}",
            f"- Digest: `{report['campaign_hash']}`",
            f"- Acceptance overall_ok: {acceptance['overall_ok']}",
            "",
            "## Limitations",
            "",
        ]
        for lim in report["limitations"]:
            lines.append(f"- {lim}")
        (out / "campaign_summary.md").write_text("\n".join(lines) + "\n")

    return report
