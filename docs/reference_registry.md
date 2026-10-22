# Independent reference registry

Scientific claim checks must compare live simulator output to **independently
derived** expected values. The production gate applicator is never used to
generate its own expected answers.

## Identifiers

| ID | Version | Circuit | Expected |
|----|---------|---------|----------|
| `analytic/hadamard-v1` | 1.0.0 | H on qubit 0, |0⟩ | ((1/√2),(1/√2)) amps; (1/2,1/2) probs |
| `analytic/bell-v1` | 1.0.0 | H(0); CNOT(0,1) on |00⟩ | Bell amps; (1/2,0,0,1/2) probs |

Little-endian: qubit 0 = LSB. Index order |00⟩, |01⟩, |10⟩, |11⟩ for two qubits.

## API

**Python**: `qproof.reference_registry`

- `resolve_reference(id)` → `ReferenceSpec` or raises `KeyError`
- `circuit_matches_reference(n_qubits, gates, ref)` → `(ok, detail)`
- `registry_public()` → JSON-serializable registry

**Browser**: `web/references.json` (exported from the same registry).

## Claim evaluation rules

1. Resolve the named reference (or reject as unsupported → INCONCLUSIVE).
2. Validate circuit / initial-state preconditions.
3. Compare amplitudes (global-phase invariant), probabilities, fidelity within
   documented tolerances.
4. Without expected amplitudes / probabilities / reference state → INCONCLUSIVE
   for those checks (not a pass).
5. A valid integrity hash cannot upgrade an inconclusive or failed scientific
   result to passed.

Each passing check records reference id/version, method, tolerance, observed,
expected, and outcome in the evidence report.
