# QProof Independent Verification Guide

## What QProof verifies

QProof is a **classical state-vector** workbench. Verification answers:

> Does the production simulator’s output match an **independent** reference
> for a declared circuit, within documented numerical tolerances?

It does **not** prove quantum advantage, hardware correctness, cryptographic
soundness, or universal correctness for all possible circuits.

## Architecture

```
Analytical golden corpus  ──┐
                            ├──► metrics (amplitude / probability / fidelity)
Independent oracle engine ──┘              │
                                           ▼
                              evidence-backed verdict (PASS/FAIL/…)
                                           │
Production simulator (under test) ─────────┘
```

### Independent oracle (`qproof.oracle`)

* Complex128 state vectors, little-endian qubit 0 = LSB.
* Gate matrices and apply routines are **re-implemented** here; they do not
  call `qproof.circuit._apply_*` or `qproof.gates.gate_matrix` for evolution.
* Supported gates: I, X, Y, Z, H, S, T, RX, RY, RZ, CNOT, CZ.
* Version string: `qproof-oracle/<ORACLE_VERSION>`.

### Golden analytical circuits (`qproof.golden`)

Hand-derived expected amplitudes and probabilities, version-controlled.
Examples: identity, X|0⟩, H|0⟩, H|1⟩, H², X², S²=Z, T²=S, Bell, GHZ₃,
RX/RY/RZ at 0, π/2, π.

Each golden records: circuit, initial state, expected state vector,
probability distribution, tolerances, and derivation text.

### Metrics

| Metric | Definition | Notes |
|--------|------------|-------|
| Amplitude max error | max \|αᵢ − βᵢ\| | Raw or global-phase aligned |
| L2 error | ‖α − β‖₂ | |
| Probability max error | max \|pᵢ − qᵢ\| | |
| Total variation | ½ ∑ \|pᵢ − qᵢ\| | |
| Forbidden leakage | ∑ pᵢ over bins with qᵢ=0 | |
| Fidelity | F = \|⟨ψ_ref\|ψ_act⟩\|² | Pure-state squared fidelity |

Global-phase alignment is used only when phase is physically irrelevant.
Relative-phase claims (S vs Z, T²=S, RX(π)=−i|1⟩) use **phase-sensitive**
comparison.

### Verdict statuses

| Status | Meaning |
|--------|---------|
| **PASS** | Check ran, independent reference present, criteria met |
| **FAIL** | Check ran and violated criteria |
| **INCONCLUSIVE** | Missing independent reference or required evidence |
| **NOT_APPLICABLE** | Metric does not apply to this backend |
| **ERROR** | Unexpected execution/verification failure |

Missing references **never** produce PASS. Aggregate verdict takes the
worst status among executed checks.

## Statistical (shot) validation

For finite-shot sampling, QProof uses a Pearson χ² goodness-of-fit (or TVD
fallback in the low-count regime) against **ideal** probabilities from the
golden/oracle — not against the production simulator’s own reported
probabilities.

A finite sample compatible with the reference distribution is **statistical
agreement**, not a proof that the implementation is correct.

## Negative controls

The suite deliberately injects faults (wrong gate, reversed CNOT, dropped
imaginary part, bad normalization, omitted outcomes, …) and asserts that
the verifier **detects** them. Known-good circuits must still PASS.

## Reproduction

```bash
# Full independent suite
PYTHONPATH=. python -m qproof.cli verify-suite --seed 42 --random-cases 24

# Or via pytest
PYTHONPATH=. python -m pytest tests/test_oracle_verifier.py -q

# Existing tests must keep passing
PYTHONPATH=. python -m pytest -q
```

## Backend capability boundaries

* Python production simulator: amplitudes available, exact probabilities.
* Browser simulator: amplitudes available (≤12 qubits), exact or shot mode.
* Shot-only backends: amplitude and pure-state fidelity checks are
  **NOT_APPLICABLE**; report distribution metrics separately — do not label
  classical histogram similarity as quantum-state fidelity.

## Tolerances (defaults)

* Amplitude / probability / fidelity: `1e-10` (analytical / differential).
* Randomized differential: `1e-9` (accumulates floating-point over depth).
* Shot GOF: significance level `0.001` (configurable, fixed before the run).

## Limitations (explicit non-claims)

1. Classical simulation only — no quantum hardware.
2. Does not demonstrate quantum advantage.
3. Randomized tests sample a finite space; they do not prove universal correctness.
4. Statistical shot agreement ≠ implementation proof.
5. Hash integrity of evidence packages ≠ scientific truth of claims.
