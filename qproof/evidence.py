"""Evidence schema validation and independent integrity verification.

Hashes prove integrity of a report body, not scientific truth or authorship.
Missing report_hash is structure-ok but NOT integrity-verified.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional, Tuple

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


def _canonical_hash(obj: dict) -> str:
    """Canonical SHA-256: sort_keys, separators=(',', ':'), UTF-8."""
    raw = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def canonical_hash(obj: dict) -> str:
    """Public alias for evidence hash computation."""
    return _canonical_hash(obj)


def validate_evidence_structure(report: Dict[str, Any]) -> List[str]:
    """Structural validation — returns error messages (empty ⇒ ok)."""
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
    """Aggregate per-check statuses. FAIL beats INCONCLUSIVE beats PASS."""
    if any(s == ExperimentStatus.FAILED.value for s in check_statuses):
        return ExperimentStatus.FAILED.value
    if any(s == ExperimentStatus.INCONCLUSIVE.value for s in check_statuses):
        return ExperimentStatus.INCONCLUSIVE.value
    if not check_statuses:
        return ExperimentStatus.INCONCLUSIVE.value
    return ExperimentStatus.PASSED.value


def status_consistent_with_checks(report: Dict[str, Any]) -> Optional[str]:
    """Return error message if overall status contradicts checks."""
    checks = report.get("checks")
    status = report.get("status")
    if not isinstance(checks, list) or status is None:
        return None
    statuses = [c.get("status") for c in checks if isinstance(c, dict)]
    expected = aggregate_status([s for s in statuses if isinstance(s, str)])
    if status != expected:
        return f"status inconsistent with checks: declared {status!r}, aggregate {expected!r}"
    return None


def verify_report_integrity(report: Dict[str, Any]) -> Tuple[bool, str]:
    """Structure + optional hash recompute.

    Returns (ok, detail).
    - Structural failure ⇒ ok=False
    - Hash mismatch ⇒ ok=False
    - Missing report_hash ⇒ ok=False for *integrity* (cannot claim hash-verified).
      Use verify_evidence_detailed for layered outcomes.
    """
    detailed = verify_evidence_detailed(report)
    if not detailed["structure_ok"]:
        return False, "; ".join(detailed["structure_errors"]) or "structure invalid"
    if detailed["integrity"] == "verified":
        return True, detailed["detail"]
    if detailed["integrity"] == "mismatch":
        return False, detailed["detail"]
    # missing hash or status inconsistency treated as not fully verified
    if detailed["integrity"] == "absent":
        return False, detailed["detail"]
    return False, detailed["detail"]


def verify_evidence_detailed(report: Dict[str, Any]) -> Dict[str, Any]:
    """Layered verification result (structure / integrity / status consistency).

    integrity: verified | mismatch | absent | n/a
    Does not evaluate scientific claim truth — only artifact consistency.
    """
    structure_errors = validate_evidence_structure(report)
    status_err = None
    if not structure_errors:
        status_err = status_consistent_with_checks(report)

    result: Dict[str, Any] = {
        "structure_ok": len(structure_errors) == 0,
        "structure_errors": structure_errors,
        "status_consistency_error": status_err,
        "integrity": "n/a",
        "detail": "",
        "ok": False,
        "hash_verified": False,
        "scientific_status": report.get("status") if isinstance(report, dict) else None,
        "note": (
            "Hash verification establishes consistency with hashed content, "
            "not authorship or scientific truth."
        ),
    }

    if structure_errors:
        result["detail"] = "; ".join(structure_errors)
        result["integrity"] = "n/a"
        return result

    integrity = report.get("integrity") or {}
    declared = integrity.get("report_hash") if isinstance(integrity, dict) else None
    if not declared:
        result["integrity"] = "absent"
        result["detail"] = (
            "structure valid; report_hash absent — cannot claim integrity verification"
        )
        if status_err:
            result["detail"] += "; " + status_err
        result["ok"] = False
        return result

    body = json.loads(json.dumps(report))
    if "integrity" not in body:
        body["integrity"] = {}
    body["integrity"]["report_hash"] = None
    recomputed = _canonical_hash(body)
    if recomputed != declared:
        result["integrity"] = "mismatch"
        result["detail"] = (
            f"report_hash mismatch: declared {declared}, recomputed {recomputed}"
        )
        result["ok"] = False
        return result

    result["integrity"] = "verified"
    result["hash_verified"] = True
    result["detail"] = "structure valid; report_hash matches"
    if status_err:
        result["detail"] += "; " + status_err
        result["ok"] = False  # integrity ok but status contradiction
    else:
        result["ok"] = True
    return result


def verify_evidence_file(path: str) -> Dict[str, Any]:
    """Load JSON from path and run detailed integrity verification."""
    with open(path, encoding="utf-8") as f:
        report = json.load(f)
    detailed = verify_evidence_detailed(report)
    return {
        "path": path,
        "ok": detailed["ok"],
        "hash_verified": detailed["hash_verified"],
        "integrity": detailed["integrity"],
        "detail": detailed["detail"],
        "structure_ok": detailed["structure_ok"],
        "structure_errors": detailed["structure_errors"],
        "declared_status": report.get("status"),
        "experiment_id": report.get("experiment_id"),
        "schema_version": report.get("schema_version"),
        "note": detailed["note"],
    }
