"""Versioned circuit JSON format: parse, validate, and build Circuit objects.

Format version 1.0.0
--------------------
{
  "format_version": "1.0.0",
  "n_qubits": 2,
  "gates": [
    {"gate": "H", "qubits": [0]},
    {"gate": "CNOT", "qubits": [0, 1]}
  ],
  "initial_state": {"type": "zero"}   // optional
}
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from .capabilities import GATE_CATALOG, UNSUPPORTED_GATES
from .circuit import Circuit
from .gates import (
    CNOT,
    CZ,
    H,
    I,
    RX,
    RY,
    RZ,
    S,
    T,
    X,
    Y,
    Z,
    GateKind,
)
from .statevector import MAX_QUBITS, StateVector

CIRCUIT_FORMAT_VERSION = "1.0.0"

_SINGLE = {
    "I": I,
    "X": X,
    "Y": Y,
    "Z": Z,
    "H": H,
    "S": S,
    "T": T,
}
_ROT = {"RX": RX, "RY": RY, "RZ": RZ}


class CircuitSpecError(ValueError):
    """Raised when a circuit specification is invalid."""


def validate_circuit_dict(data: Dict[str, Any]) -> List[str]:
    """Return a list of validation error messages (empty ⇒ valid)."""
    errors: List[str] = []
    if not isinstance(data, dict):
        return ["circuit spec must be a JSON object"]

    ver = data.get("format_version", CIRCUIT_FORMAT_VERSION)
    if ver not in (CIRCUIT_FORMAT_VERSION, "1.0", "1.0.0"):
        errors.append(f"unsupported format_version: {ver!r}")

    n = data.get("n_qubits")
    if not isinstance(n, int) or isinstance(n, bool):
        errors.append("n_qubits must be a positive integer")
        return errors
    if n < 1:
        errors.append("n_qubits must be >= 1")
    if n > MAX_QUBITS:
        errors.append(f"n_qubits={n} exceeds MAX_QUBITS={MAX_QUBITS}")

    gates = data.get("gates")
    if not isinstance(gates, list):
        errors.append("gates must be an array")
        return errors

    for i, g in enumerate(gates):
        errors.extend(_validate_gate_entry(g, n if isinstance(n, int) else 0, i))

    init = data.get("initial_state")
    if init is not None:
        errors.extend(_validate_initial(init, n if isinstance(n, int) else 0))

    return errors


def _validate_gate_entry(g: Any, n: int, index: int) -> List[str]:
    errs: List[str] = []
    prefix = f"gates[{index}]"
    if not isinstance(g, dict):
        return [f"{prefix}: must be an object"]
    name = g.get("gate")
    if not isinstance(name, str):
        return [f"{prefix}: 'gate' must be a string"]
    name_u = name.upper()
    if name_u == "CX":
        name_u = "CNOT"
    if name_u in UNSUPPORTED_GATES:
        errs.append(f"{prefix}: gate {name_u} is not supported")
        return errs
    meta = GATE_CATALOG.get(name_u)
    if meta is None:
        errs.append(f"{prefix}: unknown gate {name!r}")
        return errs
    if meta.get("alias_of"):
        name_u = meta["alias_of"]
        meta = GATE_CATALOG[name_u]

    qubits = g.get("qubits")
    if not isinstance(qubits, list) or len(qubits) != meta["arity"]:
        errs.append(
            f"{prefix}: {name_u} requires {meta['arity']} qubit(s), got {qubits!r}"
        )
        return errs
    for q in qubits:
        if not isinstance(q, int) or isinstance(q, bool) or q < 0 or q >= n:
            errs.append(f"{prefix}: qubit index {q!r} out of range for n_qubits={n}")
    if meta["arity"] == 2 and len(set(qubits)) < 2:
        errs.append(f"{prefix}: control and target must differ")

    params = meta.get("params") or []
    if "theta" in params:
        theta = g.get("theta", g.get("params", {}).get("theta") if isinstance(g.get("params"), dict) else None)
        if theta is None:
            errs.append(f"{prefix}: {name_u} requires theta (radians)")
        elif not isinstance(theta, (int, float)) or isinstance(theta, bool):
            errs.append(f"{prefix}: theta must be a finite number")
        elif not math.isfinite(float(theta)):
            errs.append(f"{prefix}: theta must be finite")
    return errs


def _validate_initial(init: Any, n: int) -> List[str]:
    errs: List[str] = []
    if not isinstance(init, dict):
        return ["initial_state must be an object"]
    t = init.get("type")
    if t == "zero":
        return errs
    if t == "basis_index":
        idx = init.get("index", 0)
        if not isinstance(idx, int) or isinstance(idx, bool) or idx < 0 or idx >= (1 << n):
            errs.append(f"initial_state.index {idx!r} out of range for {n} qubits")
        return errs
    errs.append(f"unsupported initial_state.type: {t!r}")
    return errs


def circuit_from_dict(data: Dict[str, Any]) -> Tuple[Circuit, Optional[StateVector]]:
    """Validate and build a Circuit (and optional initial state).

    Raises CircuitSpecError on the first validation failure.
    """
    errors = validate_circuit_dict(data)
    if errors:
        raise CircuitSpecError("; ".join(errors))

    n = int(data["n_qubits"])
    circ = Circuit(n)
    for g in data["gates"]:
        name = g["gate"].upper()
        if name == "CX":
            name = "CNOT"
        qubits = list(g["qubits"])
        if name in _SINGLE:
            circ.append(_SINGLE[name](qubits[0]))
        elif name in _ROT:
            theta = g.get("theta")
            if theta is None and isinstance(g.get("params"), dict):
                theta = g["params"].get("theta")
            circ.append(_ROT[name](qubits[0], float(theta)))
        elif name == "CNOT":
            circ.append(CNOT(qubits[0], qubits[1]))
        elif name == "CZ":
            circ.append(CZ(qubits[0], qubits[1]))
        else:
            raise CircuitSpecError(f"unhandled gate {name}")

    initial: Optional[StateVector] = None
    init = data.get("initial_state") or {"type": "zero"}
    if init.get("type") == "basis_index":
        initial = StateVector.from_basis(n, int(init.get("index", 0)))
    # "zero" → None means Circuit.run uses |0…0⟩

    return circ, initial


def circuit_to_dict(circ: Circuit, *,
                    initial_state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Serialize a Circuit to the versioned JSON format."""
    out: Dict[str, Any] = {
        "format_version": CIRCUIT_FORMAT_VERSION,
        "n_qubits": circ.n_qubits,
        "gates": circ.to_spec(),
    }
    if initial_state is not None:
        out["initial_state"] = initial_state
    else:
        out["initial_state"] = {"type": "zero"}
    return out
