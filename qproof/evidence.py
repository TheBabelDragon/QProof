"""Evidence schema validation and independent integrity verification.

Hashes prove integrity of a report body, not scientific truth or authorship.
Missing report_hash ⇒ integrity unverified (never PASS).
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from .canonical import circuit_hash, report_hash as compute_report_hash
from .experiment import ExperimentStatus, SCHEMA_VERSION

SUPPORTED_SCHEMA_VERSIONS = {"1.0.0", "1.1.0"}

REQUIRED_TOP = [
    "schema_version",
    "experiment_id",
    "status",
    "checks",
    "circuit",
    "execution",
    "results",
    "verification",
]


def validate_evidence_structure(report: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if not isinstance(report, dict):
        return ["report must be a JSON object"]
    for key in REQUIRED_TOP:
        if key not in report:
            errors.append(f"missing required field: {key}")
    ver = report.get("schema_version")
    if ver is not None and ver not in SUPPORTED_SCHEMA_VERSIONS:
        errors.append(f"unsupported schema_version: {ver!r}")
    status = report.get("status")
    if status is not None and status not in (
        ExperimentStatus.PASSED.value,
        ExperimentStatus.FAILED.value,
        ExperimentStatus.INCONCLUSIVE.value,
    ):
        errors.append(f"invalid status: {status!r}")
    checks = report.get("checks")
    if checks is not None:
        if not isinstance(checks, list):
            errors.append("checks must be an array")
        else:
            for i, c in enumerate(checks):
                if not isinstance(c, dict):
                    errors.append(f"checks[{i}] must be an object")
                    continue
                for k in ("name", "status", "detail"):
                    if k not in c:
                        errors.append(f"checks[{i}] missing {k}")
                if c.get("status") not in (
                    ExperimentStatus.PASSED.value,
                    ExperimentStatus.FAILED.value,
                    ExperimentStatus.INCONCLUSIVE.value,
                    None,
                ):
                    errors.append(f"checks[{i}] invalid status")
    circuit = report.get("circuit")
    if isinstance(circuit, dict):
        if "n_qubits" not in circuit:
            errors.append("circuit.n_qubits missing")
        if "spec" not in circuit:
            errors.append("circuit.spec missing")
    return errors


def aggregate_status(check_statuses: List[str]) -> str:
    if any(s == ExperimentStatus.FAILED.value for s in check_statuses):
        return ExperimentStatus.FAILED.value
    if any(s == ExperimentStatus.INCONCLUSIVE.value for s in check_statuses):
        return ExperimentStatus.INCONCLUSIVE.value
    if not check_statuses:
        return ExperimentStatus.INCONCLUSIVE.value
    return ExperimentStatus.PASSED.value


def status_consistent_with_checks(report: Dict[str, Any]) -> Optional[str]:
    checks = report.get("checks")
    status = report.get("status")
    if not isinstance(checks, list) or status is None:
        return None
    statuses = [c.get("status") for c in checks if isinstance(c, dict)]
    expected = aggregate_status([s for s in statuses if isinstance(s, str)])
    if status != expected:
        return f"status inconsistent with checks: declared {status!r}, aggregate {expected!r}"
    return None


def verify_evidence_detailed(report: Dict[str, Any]) -> Dict[str, Any]:
    """Layered: structure / integrity / scientific_status (declared only)."""
    structure_errors = validate_evidence_structure(report)
    status_err = None if structure_errors else status_consistent_with_checks(report)

    result: Dict[str, Any] = {
        "structure": "invalid" if structure_errors else "valid",
        "structure_ok": len(structure_errors) == 0,
        "structure_errors": structure_errors,
        "status_consistency_error": status_err,
        "integrity": "unverified",
        "hash_verified": False,
        "circuit_hash_ok": None,
        "detail": "",
        "ok": False,
        "scientific_checks": report.get("status") if isinstance(report, dict) else None,
        "note": (
            "Hash verification establishes consistency with hashed content, "
            "not authorship or scientific truth. Scientific status is taken from "
            "the report's own checks and is independent of integrity."
        ),
    }

    if structure_errors:
        result["detail"] = "; ".join(structure_errors)
        result["integrity"] = "unverified"
        return result

    integrity = report.get("integrity") or {}
    declared = integrity.get("report_hash") if isinstance(integrity, dict) else None
    declared_ch = integrity.get("circuit_hash") if isinstance(integrity, dict) else None

    if declared_ch and isinstance(report.get("circuit"), dict):
        recomputed_ch = circuit_hash(report["circuit"])
        result["circuit_hash_ok"] = recomputed_ch == declared_ch
        if not result["circuit_hash_ok"]:
            result["integrity"] = "failed"
            result["detail"] = (
                f"circuit_hash mismatch: declared {declared_ch}, recomputed {recomputed_ch}"
            )
            result["ok"] = False
            return result

    if not declared:
        result["integrity"] = "unverified"
        result["detail"] = (
            "structure valid; report_hash absent — integrity unverified "
            "(legacy or incomplete report)"
        )
        if status_err:
            result["detail"] += "; " + status_err
        result["ok"] = False
        return result

    recomputed = compute_report_hash(report)
    if recomputed != declared:
        result["integrity"] = "failed"
        result["detail"] = (
            f"report_hash mismatch: declared {declared}, recomputed {recomputed}"
        )
        result["ok"] = False
        return result

    result["integrity"] = "verified"
    result["hash_verified"] = True
    result["detail"] = "structure valid; report_hash matches"
    if declared_ch and result["circuit_hash_ok"]:
        result["detail"] += "; circuit_hash matches"
    if status_err:
        result["detail"] += "; " + status_err
        result["ok"] = False
    else:
        result["ok"] = True
    return result


def verify_report_integrity(report: Dict[str, Any]) -> Tuple[bool, str]:
    detailed = verify_evidence_detailed(report)
    return detailed["ok"] and detailed["hash_verified"], detailed["detail"]


def verify_evidence_file(path: str) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        report = json.load(f)
    detailed = verify_evidence_detailed(report)
    return {
        "path": path,
        "ok": detailed["ok"] and detailed["hash_verified"],
        "hash_verified": detailed["hash_verified"],
        "integrity": detailed["integrity"],
        "structure": detailed["structure"],
        "scientific_checks": detailed["scientific_checks"],
        "detail": detailed["detail"],
        "structure_ok": detailed["structure_ok"],
        "structure_errors": detailed["structure_errors"],
        "declared_status": report.get("status"),
        "experiment_id": report.get("experiment_id"),
        "schema_version": report.get("schema_version"),
        "note": detailed["note"],
    }
