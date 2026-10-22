"""Canonical serialization for evidence integrity hashes.

Both Python and web/canonical_hash.js implement the same rules:

* Objects: keys sorted lexicographically
* Arrays: order preserved
* Numbers: finite only; formatted with 15 significant digits via format(x, '.15g')
  Integral values become int so JSON matches JS (1 not 1.0).
* Strings/bools/null: standard JSON (ensure_ascii)
* Separators: (',', ':') — no spaces
* report_hash field is set to null before hashing the report body
* circuit_hash is SHA-256 of the canonical circuit object only

Hash string form: ``sha256:`` + hex digest.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def _normalize(obj: Any) -> Any:
    if obj is None or isinstance(obj, (str, bool)):
        return obj
    if isinstance(obj, int) and not isinstance(obj, bool):
        return obj
    if isinstance(obj, float):
        if not (obj == obj) or obj in (float("inf"), float("-inf")):
            raise ValueError("non-finite float in canonical payload")
        f = float(format(obj, ".15g"))
        if f.is_integer() and abs(f) < 2**53:
            return int(f)
        return f
    if isinstance(obj, dict):
        return {k: _normalize(obj[k]) for k in sorted(obj.keys())}
    if isinstance(obj, (list, tuple)):
        return [_normalize(x) for x in obj]
    raise TypeError(f"unsupported type for canonicalization: {type(obj)!r}")


def canonical_dumps(obj: Any) -> str:
    normalized = _normalize(obj)
    return json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def canonical_hash(obj: Any) -> str:
    raw = canonical_dumps(obj).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def circuit_hash(circuit_obj: dict) -> str:
    payload = {
        "n_qubits": circuit_obj.get("n_qubits"),
        "spec": circuit_obj.get("spec") or circuit_obj.get("gates") or [],
    }
    return canonical_hash(payload)


def report_hash(report: dict) -> str:
    body = json.loads(json.dumps(report))
    integ = body.get("integrity")
    if not isinstance(integ, dict):
        body["integrity"] = {"report_hash": None, "circuit_hash": None}
    else:
        body["integrity"] = dict(integ)
        body["integrity"]["report_hash"] = None
    return canonical_hash(body)
