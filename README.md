# QProof

**Capability-first classical state-vector simulation + falsifiable verification**

QProof verifies claims about circuits it can simulate. The Bell-state experiment is a **smoke test / onboarding fixture**, not the architectural boundary.

> Does **not** claim quantum advantage, quantum hardware execution, or experimental physics validation.

**Live site:** https://thebabeldragon.github.io/QProof/  
*(feature branch work for live browser execution ships via PR; site updates after merge to `main`.)*

## Install

```bash
git clone https://github.com/TheBabelDragon/QProof.git
cd QProof
pip install -e ".[dev]"
```

## CLI

```bash
qproof capabilities          # machine-readable capability registry
qproof list                  # built-in fixtures (examples, not the limit)
qproof run bell --shots 1024 --seed 42 --out report.json
qproof run hadamard
qproof run rx-pi
qproof run phase
qproof validate-circuit circuit.json
qproof run-json experiment.json --out report.json
qproof verify-evidence report.json
```

Exit code is 0 only when experiment status is `passed` (unless `--expect-fail`).

## Supported today (tested)

| Area | Support |
|------|---------|
| Gates | I, X, Y, Z, H, S, T, RX, RY, RZ, CNOT/CX, CZ |
| Qubits (Python) | 1…20 (soft limit) |
| Qubits (browser) | 1…12 (freeze-safe) |
| Measurement | Exact probabilities; shots + seed |
| Verification | Normalization, finite amps, amplitude match (global-phase invariant), probabilities, fidelity, shot consistency, evidence integrity |
| Input | Versioned circuit JSON + generic experiment JSON |
| Backends | Python classical state-vector; **browser** classical state-vector (`web/simulator.js`); precomputed fixtures on Pages |

**Not supported:** quantum hardware, noise, mid-circuit measurement, SWAP/Toffoli/U-gates, density matrices, GPU.

## Live browser workbench

Under `web/`:

1. Build or import a circuit (shared JSON format).
2. **Run in browser** — amplitudes and probabilities computed at runtime (not a precomputed table).
3. Load precomputed Python evidence for independent comparison.
4. **Verify evidence integrity** — client-side structure/hash checks; authoritative path is `qproof verify-evidence`.
5. **UI-only failure demo** — mutates displayed status only; it is **not** a scientific or integrity failure.
6. **Tamper + re-verify** — alters a report without rehashing; real verifier must reject.

See [docs/browser_execution.md](docs/browser_execution.md).

## Python API

```python
from qproof import Circuit, capability_manifest, get_experiment, run_experiment
from qproof import circuit_from_dict, experiment_from_spec

print(capability_manifest()["gates"].keys())
report = run_experiment(get_experiment("hadamard"))
assert report.status.value == "passed"
```

## Evidence

Schema `1.0.0` / `1.1.0`. Hashes bind report integrity — they do **not** prove scientific truth.

```bash
qproof verify-evidence report.json
```

## Tests

```bash
pytest -q
node web/test_simulator.mjs   # browser simulator unit tests (Node)
```

## License

MIT
