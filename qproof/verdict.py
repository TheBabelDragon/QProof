"""Evidence-backed verdict system for QProof verification.

Statuses
--------
PASS            Declared check ran, had a valid independent reference, met criteria.
FAIL            Valid check ran and violated an acceptance criterion.
INCONCLUSIVE    Required evidence or independent reference is missing.
NOT_APPLICABLE  Metric does not apply to the backend or test.
ERROR           Execution or verification failed unexpectedly.

Aggregate verdicts never convert missing coverage into success.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class CheckStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    INCONCLUSIVE = "INCONCLUSIVE"
    NOT_APPLICABLE = "NOT_APPLICABLE"
    ERROR = "ERROR"

    @classmethod
    def from_legacy(cls, value: str) -> "CheckStatus":
        v = value.lower().strip()
        mapping = {
            "passed": cls.PASS,
            "pass": cls.PASS,
            "failed": cls.FAIL,
            "fail": cls.FAIL,
            "inconclusive": cls.INCONCLUSIVE,
            "not_applicable": cls.NOT_APPLICABLE,
            "n/a": cls.NOT_APPLICABLE,
            "error": cls.ERROR,
        }
        return mapping.get(v, cls.INCONCLUSIVE)

    def to_legacy(self) -> str:
        return {
            CheckStatus.PASS: "passed",
            CheckStatus.FAIL: "failed",
            CheckStatus.INCONCLUSIVE: "inconclusive",
            CheckStatus.NOT_APPLICABLE: "not_applicable",
            CheckStatus.ERROR: "error",
        }[self]


@dataclass
class MetricResult:
    """Single check with full evidence provenance."""

    test_id: str
    status: CheckStatus
    reference_source: str
    detail: str = ""
    tolerance: Optional[float] = None
    observed: Optional[Any] = None
    expected: Optional[Any] = None
    metrics: Dict[str, Any] = field(default_factory=dict)
    failure_reason: Optional[str] = None
    circuit: Optional[Any] = None
    backend: Optional[str] = None
    reproducibility: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        d: dict = {
            "test_id": self.test_id,
            "status": self.status.value,
            "reference_source": self.reference_source,
            "detail": self.detail,
        }
        if self.tolerance is not None:
            d["tolerance"] = self.tolerance
        if self.observed is not None:
            d["observed"] = self.observed
        if self.expected is not None:
            d["expected"] = self.expected
        if self.metrics:
            d["metrics"] = self.metrics
        if self.failure_reason:
            d["failure_reason"] = self.failure_reason
        if self.backend:
            d["backend"] = self.backend
        if self.reproducibility:
            d["reproducibility"] = self.reproducibility
        return d


@dataclass
class SuiteVerdict:
    """Aggregate verdict over a set of MetricResults."""

    overall: CheckStatus
    checks: List[MetricResult]
    summary: str
    oracle_id: str = ""
    seed: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "overall": self.overall.value,
            "summary": self.summary,
            "oracle_id": self.oracle_id,
            "seed": self.seed,
            "checks": [c.to_dict() for c in self.checks],
            "counts": self.status_counts(),
            "metadata": self.metadata,
        }

    def status_counts(self) -> Dict[str, int]:
        counts: Dict[str, int] = {s.value: 0 for s in CheckStatus}
        for c in self.checks:
            counts[c.status.value] = counts.get(c.status.value, 0) + 1
        return counts


def aggregate_verdict(
    checks: List[MetricResult],
    *,
    oracle_id: str = "",
    seed: Optional[int] = None,
    require_all_pass: bool = True,
    metadata: Optional[Dict[str, Any]] = None,
) -> SuiteVerdict:
    """Aggregate check results without hiding failures or inventing success.

    Priority: ERROR > FAIL > INCONCLUSIVE > NOT_APPLICABLE > PASS
    (worst status wins).  A suite with only NOT_APPLICABLE / empty checks
    is INCONCLUSIVE, never PASS.
    """
    meta = dict(metadata or {})
    if not checks:
        return SuiteVerdict(
            overall=CheckStatus.INCONCLUSIVE,
            checks=[],
            summary="no checks executed",
            oracle_id=oracle_id,
            seed=seed,
            metadata=meta,
        )

    statuses = [c.status for c in checks]
    if any(s == CheckStatus.ERROR for s in statuses):
        overall = CheckStatus.ERROR
        summary = "one or more checks raised ERROR"
    elif any(s == CheckStatus.FAIL for s in statuses):
        overall = CheckStatus.FAIL
        n = sum(1 for s in statuses if s == CheckStatus.FAIL)
        summary = f"{n} check(s) FAILED"
    elif any(s == CheckStatus.INCONCLUSIVE for s in statuses):
        overall = CheckStatus.INCONCLUSIVE
        summary = "one or more checks INCONCLUSIVE (missing independent reference)"
    elif all(s == CheckStatus.NOT_APPLICABLE for s in statuses):
        overall = CheckStatus.INCONCLUSIVE
        summary = "all checks NOT_APPLICABLE — no applicable evidence"
    elif all(s in (CheckStatus.PASS, CheckStatus.NOT_APPLICABLE) for s in statuses):
        n_pass = sum(1 for s in statuses if s == CheckStatus.PASS)
        if n_pass == 0:
            overall = CheckStatus.INCONCLUSIVE
            summary = "no PASS checks; only NOT_APPLICABLE"
        else:
            overall = CheckStatus.PASS
            summary = f"all applicable checks PASSED ({n_pass})"
    else:
        overall = CheckStatus.INCONCLUSIVE
        summary = "mixed non-failing statuses"

    return SuiteVerdict(
        overall=overall,
        checks=list(checks),
        summary=summary,
        oracle_id=oracle_id,
        seed=seed,
        metadata=meta,
    )
