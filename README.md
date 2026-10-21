# QProof

**Independent Quantum State-Vector Simulator + Falsifiable Experiment Core**

QProof is an experiment-first classical state-vector framework with independently testable gate semantics, deterministic execution, and machine-readable evidence reports.

> QProof does **not** claim quantum advantage, quantum hardware execution, or experimental physics validation. Classical simulation demonstrates correctness of the modelled circuit only.

**Live demo (after Pages deploy):** https://thebabeldragon.github.io/QProof/

## Install

```bash
git clone https://github.com/TheBabelDragon/QProof.git
cd QProof
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

Requires Python ≥ 3.10 and NumPy ≥ 1.22.

## Primary experiment — Bell state

```bash
qproof run bell --shots 1024 --seed 42 --out report.json
```

Circuit: `H(0); CNOT(0,1)` on `|00⟩` → `(|00⟩+|11⟩)/√2` (little-endian).

Verification compares the simulator output to an **analytic reference** that does not reuse the production gate path. Status is `passed` / `failed` / `inconclusive`. Exit code is non-zero on failure.

```python
from qproof import Circuit, measure, run_experiment
from qproof.experiment import bell_state_experiment

circ = Circuit(2).h(0).cx(0, 1)
state = circ.run()
print(state.probabilities())  # ≈ [0.5, 0, 0, 0.5]

report = run_experiment(bell_state_experiment(shots=1024, seed=42))
print(report.status, report.fidelity)
```

## Features (v0.1)

| Feature | Status |
|---------|--------|
| Single-qubit: I, X, Y, Z, H, S, T, RX, RY, RZ | ✓ |
| Two-qubit: CNOT, CZ | ✓ |
| Computational-basis measurement (shots + seed) | ✓ |
| Exact probabilities + pure-state fidelity | ✓ |
| Versioned JSON evidence schema | ✓ |
| Independent analytic reference (Bell) | ✓ |
| Negative tests for incorrect claims | ✓ |
| Static GitHub Pages experiment explorer | ✓ |

## Limitations

- Classical state-vector only (no GPU, no tensor networks, no hardware).
- Soft limit `MAX_QUBITS = 20`.
- No noise model.
- Pages UI loads **precomputed** verified reports (not a browser quantum runtime).

## Tests & CI

```bash
pytest -q
```

GitHub Actions runs the suite, regenerates the Bell report, exercises a deliberate failure path, and deploys `web/` to GitHub Pages.

## Frontend

Static site in `web/`. Preview:

```bash
cd web && python -m http.server 8000
```

## Documentation

- [Experiment schema](docs/experiment_schema.md)
- [Hackathon demo guide](docs/hackathon.md)

## License

MIT
