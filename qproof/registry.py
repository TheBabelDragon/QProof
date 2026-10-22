"""Experiment registry — fixtures are examples, not the capability boundary."""

from __future__ import annotations

from typing import Callable, Dict, List, Optional

import numpy as np

from .circuit import Circuit
from .experiment import Experiment
from .reference import (
    bell_expected_amplitudes,
    bell_expected_probabilities,
)


def _hadamard_expected() -> np.ndarray:
    from .reference_registry import resolve_reference
    return resolve_reference("analytic/hadamard-v1").amplitudes_array()


def _rx_pi_expected() -> np.ndarray:
    # RX(π)|0⟩ = -i|1⟩
    return np.array([0.0, -1j], dtype=np.complex128)


def hadamard_experiment() -> Experiment:
    circ = Circuit(1).h(0)
    exp_amps = _hadamard_expected()
    return Experiment(
        experiment_id="hadamard-v1",
        description="Apply H to |0⟩; expect (|0⟩+|1⟩)/√2.",
        claim=(
            "Classical simulation of H on |0⟩ matches the analytic superposition "
            "(|0⟩+|1⟩)/√2 under little-endian ordering."
        ),
        circuit=circ,
        expected_amplitudes=exp_amps,
        expected_probabilities=np.abs(exp_amps) ** 2,
        shots=0,
        reference_id="analytic/hadamard-v1",
        limitations=[
            "Classical simulation only.",
            "Single-qubit analytic fixture — not a capability boundary.",
        ],
    )


def rx_pi_experiment() -> Experiment:
    circ = Circuit(1).rx(0, float(np.pi))
    exp_amps = _rx_pi_expected()
    return Experiment(
        experiment_id="rx-pi-v1",
        description="Apply RX(π) to |0⟩; expect −i|1⟩.",
        claim=(
            "Classical simulation of RX(π) on |0⟩ matches analytic −i|1⟩ "
            "(fidelity to |1⟩ is 1 under phase-invariant definition)."
        ),
        circuit=circ,
        expected_amplitudes=exp_amps,
        expected_probabilities=np.abs(exp_amps) ** 2,
        shots=0,
        reference_id="analytic/rx-pi-v1",
        limitations=[
            "Classical simulation only.",
            "Parameterized rotation fixture.",
        ],
    )


def experiment_from_spec(
    *,
    experiment_id: str,
    description: str,
    claim: str,
    circuit_dict: dict,
    expected_amplitudes: list,
    shots: int = 0,
    seed: Optional[int] = None,
    reference_id: str = "supplied/expected-v1",
    limitations: Optional[List[str]] = None,
    amplitude_tol: float = 1e-10,
    probability_tol: float = 1e-10,
    fidelity_tol: float = 1e-10,
) -> Experiment:
    n = int(circuit_dict["n_qubits"])
    circ = Circuit(n)
    for g in circuit_dict.get("gates") or circuit_dict.get("spec") or []:
        name = str(g["gate"]).upper()
        qs = list(g["qubits"])
        if name == "H":
            circ = circ.h(qs[0])
        elif name == "X":
            circ = circ.x(qs[0])
        elif name == "Y":
            circ = circ.y(qs[0])
        elif name == "Z":
            circ = circ.z(qs[0])
        elif name == "S":
            circ = circ.s(qs[0])
        elif name == "T":
            circ = circ.t(qs[0])
        elif name == "RX":
            circ = circ.rx(qs[0], float(g["theta"]))
        elif name == "RY":
            circ = circ.ry(qs[0], float(g["theta"]))
        elif name == "RZ":
            circ = circ.rz(qs[0], float(g["theta"]))
        elif name in ("CNOT", "CX"):
            circ = circ.cx(qs[0], qs[1])
        elif name == "CZ":
            circ = circ.cz(qs[0], qs[1])
        else:
            raise ValueError(f"unsupported gate in circuit_dict: {name}")
    amps = np.array(
        [complex(a[0], a[1]) for a in expected_amplitudes], dtype=np.complex128
    )
    return Experiment(
        experiment_id=experiment_id,
        description=description,
        claim=claim,
        circuit=circ,
        expected_amplitudes=amps,
        expected_probabilities=np.abs(amps) ** 2,
        shots=shots,
        seed=seed,
        reference_id=reference_id,
        limitations=list(limitations or []),
        amplitude_tol=amplitude_tol,
        probability_tol=probability_tol,
        fidelity_tol=fidelity_tol,
    )


BUILTIN_FACTORIES: Dict[str, Callable[[], Experiment]] = {
    "hadamard": hadamard_experiment,
    "rx-pi": rx_pi_experiment,
}


def get_experiment(name: str) -> Experiment:
    from .experiment import bell_state_experiment, global_phase_experiment

    aliases = {
        "bell": "bell",
        "bell-state": "bell",
        "bell-state-v1": "bell",
        "phase": "phase",
        "global-phase": "phase",
        "global-phase-v1": "phase",
    }
    key = aliases.get(name, name)
    if key == "bell":
        return bell_state_experiment(shots=0, seed=None)
    if key == "phase":
        return global_phase_experiment()
    if key not in BUILTIN_FACTORIES:
        raise KeyError(f"unknown experiment {name!r}; known: {[e['name'] for e in list_experiments()]}")
    return BUILTIN_FACTORIES[key]()


def list_experiments() -> List[dict]:
    return [
        {"name": "bell", "experiment_id": "bell-state-v1", "role": "smoke / onboarding"},
        {"name": "phase", "experiment_id": "global-phase-v1", "role": "phase fixture"},
        {"name": "hadamard", "experiment_id": "hadamard-v1", "role": "1q analytic"},
        {"name": "rx-pi", "experiment_id": "rx-pi-v1", "role": "parameterized rotation"},
    ]
