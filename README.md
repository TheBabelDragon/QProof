# QProof

**Capability-first classical state-vector simulation + falsifiable verification**

QProof verifies claims about circuits it can simulate. The Bell-state experiment is a **smoke test / onboarding fixture**, not the architectural boundary.

> Does **not** claim quantum advantage, quantum hardware execution, or experimental physics validation.

**Live site:** https://thebabeldragon.github.io/QProof/

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
| Qubits | 1…20 (soft limit) |
| Measurement | Exact probabilities; shots + deterministic seed |
| Verification | Normalization, finite amps, amplitude match (global-phase invariant), probabilities, fidelity, shot z-score, evidence integrity |
| Input | Versioned circuit JSON + generic experiment JSON |
| Backends | Classical state-vector; precomputed evidence on Pages |

**Not supported:** quantum hardware, noise, mid-circuit measurement, SWAP/Toffoli/U-gates, density matrices.

## Python API

```python
from qproof import Circuit, capability_manifest, get_experiment, run_experiment
from qproof import circuit_from_dict, experiment_from_spec

print(capability_manifest()["gates"].keys())
report = run_experiment(get_experiment("hadamard"))
assert report.status.value == "passed"
```

## Evidence

Schema `1.0.0` (compatible path toward `1.1.0`). Hashes bind report integrity — they do not prove scientific truth.

```bash
qproof verify-evidence report.json
```

## Tests

```bash
pytest -q
```

## Pages

Static workbench under `web/`. Loads **precomputed** verified reports and the capability registry. Authoritative runs use the Python CLI.

## License

MIT
