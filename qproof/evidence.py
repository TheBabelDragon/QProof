"""Evidence schema validation and independent integrity verification.

Hashes prove integrity of a report body, not scientific truth.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional, Tuple

from .experiment import ExperimentStatus, SCHEMA_VERSION

# Accept 1.0.0 reports; 1.1.0 adds optional capability declarations
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
    raw = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


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


def verify_report_integrity(report: Dict[str, Any]) -> Tuple[bool, str]:
    """Recompute report_hash if present; validate structure.

    Returns (ok, detail). Structural failure or hash mismatch ⇒ not ok.
    Missing hash is allowed but noted (inconclusive integrity).
    """
    errors = validate_evidence_structure(report)
    if errors:
        return False, "; ".join(errors)

    integrity = report.get("integrity") or {}
    declared = integrity.get("report_hash")
    if not declared:
        return True, "structure valid; no report_hash to recompute"

    body = json.loads(json.dumps(report))  # deep copy via JSON
    if "integrity" not in body:
        body["integrity"] = {}
    body["integrity"]["report_hash"] = None
    recomputed = _canonical_hash(body)
    if recomputed != declared:
        return False, f"report_hash mismatch: declared {declared}, recomputed {recomputed}"
    return True, "structure valid; report_hash matches"


def verify_evidence_file(path: str) -> Dict[str, Any]:
    """Load JSON from path and run integrity verification."""
    with open(path, encoding="utf-8") as f:
        report = json.load(f)
    ok, detail = verify_report_integrity(report)
    return {
        "path": path,
        "ok": ok,
        "detail": detail,
        "declared_status": report.get("status"),
        "experiment_id": report.get("experiment_id"),
        "schema_version": report.get("schema_version"),
    }


def aggregate_status(check_statuses: List[str]) -> str:
    """Aggregate per-check statuses. FAIL beats INCONCLUSIVE beats PASS."""
    if any(s == ExperimentStatus.FAILED.value for s in check_statuses):
        return ExperimentStatus.FAILED.value
    if any(s == ExperimentStatus.INCONCLUSIVE.value for s in check_statuses):
        return ExperimentStatus.INCONCLUSIVE.value
    if not check_statuses:
        return ExperimentStatus.INCONCLUSIVE.value
    return ExperimentStatus.PASSED.value
