# QProof

**Independent Quantum State-Vector Simulator + Falsifiable Experiment Core**

QProof is an experiment-first quantum computing research framework. Its initial
deliverable is a small, transparent reference state-vector simulator with
independently testable gate semantics, deterministic experiment execution where
configured, and machine-readable evidence reports.

> QProof does **not** claim quantum advantage. Any such claim requires a
> separately specified workload and a defensible classical comparison.

## Install

```bash
git clone https://github.com/TheBabelDragon/QProof.git
cd QProof
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
```

Requires Python ≥ 3.10 and NumPy ≥ 1.22. No other runtime dependencies.

## Quick start

```python
from qproof import Circuit, measure

# Bell state
circ = Circuit(2).h(0).cx(0, 1)
state = circ.run()
print(state.probabilities())   # ≈ [0.5, 0, 0, 0.5]

result = measure(state, shots=1024, seed=42)
print(result.counts)
```

### CLI

```bash
qproof run bell --shots 1024 --seed 42 --out report.json
qproof run phase
```

Exit code is 0 only when the experiment status is `passed`.

## Supported features (v0.1)

| Feature | Status |
|---------|--------|
| Single-qubit gates: I, X, Y, Z, H, S, T, RX, RY, RZ | ✓ |
| Two-qubit gates: CNOT, CZ | ✓ |
| Arbitrary gate composition | ✓ |
| Computational-basis measurement (shots + seed) | ✓ |
| Exact probability distributions | ✓ |
| Pure-state fidelity (phase-invariant) | ✓ |
| Versioned experiment schema + JSON evidence reports | ✓ |
| Independent correctness oracles | ✓ |
| Deterministic reproducibility (same seed) | ✓ |

## Limitations

- Classical state-vector only (no tensor networks, no GPU, no distributed sim).
- Soft qubit limit: `MAX_QUBITS = 20` (~16 MiB). Higher counts fail predictably.
- No noise model, error correction, or hardware backends.
- No quantum advantage claims.

See [docs/architecture.md](docs/architecture.md) for repository boundaries
relative to MetaField and TensorGate.

## Numerical conventions

- **Little-endian** qubit ordering (qubit 0 = least-significant bit).
- Complex double precision (`complex128`).
- Fidelity: `F = |⟨ψ|φ⟩|²` (phase-invariant).

Full details: [docs/numerical_conventions.md](docs/numerical_conventions.md).

## Experiment schema

Reports distinguish exact probabilities, finite-shot samples, tolerances, and
status (`passed` / `failed` / `inconclusive`). A failed assertion yields a
non-zero exit code.

See [docs/experiment_schema.md](docs/experiment_schema.md).

## Tests

```bash
pytest -q
```

## License

MIT
