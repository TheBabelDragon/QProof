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
    """Build an Experiment from a validated circuit dict + expected amplitudes."""
    from .circuit_spec import circuit_from_dict

    circ, initial = circuit_from_dict(circuit_dict)
    amps = np.asarray(expected_amplitudes, dtype=np.complex128).ravel()
    if amps.size != (1 << circ.n_qubits):
        raise ValueError(
            f"expected_amplitudes length {amps.size} != 2^{circ.n_qubits}"
        )
    norm = np.linalg.norm(amps)
    if norm == 0:
        raise ValueError("expected_amplitudes is the zero vector")
    amps = amps / norm
    exp = Experiment(
        experiment_id=experiment_id,
        description=description,
        claim=claim,
        circuit=circ,
        expected_amplitudes=amps,
        expected_probabilities=np.abs(amps) ** 2,
        shots=shots,
        seed=seed,
        amplitude_tol=amplitude_tol,
        probability_tol=probability_tol,
        fidelity_tol=fidelity_tol,
        reference_id=reference_id,
        limitations=list(limitations or [
            "Classical simulation only.",
            "Expected state supplied by caller; independence depends on how it was derived.",
        ]),
    )
    exp._initial_state = initial  # type: ignore[attr-defined]
    return exp


def _bell(**kwargs) -> Experiment:
    from .experiment import bell_state_experiment
    return bell_state_experiment(**kwargs)


def _phase(**kwargs) -> Experiment:
    from .experiment import global_phase_experiment
    return global_phase_experiment()


BUILTIN_FACTORIES: Dict[str, Callable[..., Experiment]] = {
    "bell": _bell,
    "phase": _phase,
    "hadamard": hadamard_experiment,
    "rx-pi": rx_pi_experiment,
}


def list_experiments() -> List[dict]:
    return [
        {"name": "bell", "experiment_id": "bell-state-v1", "role": "smoke / onboarding"},
        {"name": "phase", "experiment_id": "global-phase-v1", "role": "phase fixture"},
        {"name": "hadamard", "experiment_id": "hadamard-v1", "role": "1q analytic"},
        {"name": "rx-pi", "experiment_id": "rx-pi-v1", "role": "parameterized rotation"},
    ]


def get_experiment(name: str, **kwargs) -> Experiment:
    key = name.lower().strip()
    if key not in BUILTIN_FACTORIES:
        raise KeyError(
            f"unknown experiment {name!r}; choose from {sorted(BUILTIN_FACTORIES)}"
        )
    factory = BUILTIN_FACTORIES[key]
    if key == "bell":
        return factory(**kwargs)
    return factory()
