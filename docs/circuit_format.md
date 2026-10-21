# Circuit JSON format (v1.0.0)

```json
{
  "format_version": "1.0.0",
  "n_qubits": 2,
  "gates": [
    {"gate": "H", "qubits": [0]},
    {"gate": "CNOT", "qubits": [0, 1]},
    {"gate": "RX", "qubits": [0], "theta": 1.5708}
  ],
  "initial_state": {"type": "zero"}
}
```

## Validation

```bash
qproof validate-circuit circuit.json
```

Rejects unknown gates, unsupported gates, out-of-range qubits, identical CNOT control/target, missing `theta` on rotations, non-finite parameters, and `n_qubits > MAX_QUBITS`.

## Generic experiment file

```json
{
  "experiment_id": "custom-v1",
  "description": "…",
  "claim": "…",
  "circuit": { "format_version": "1.0.0", "n_qubits": 1, "gates": [{"gate": "H", "qubits": [0]}] },
  "expected_amplitudes": [[0.7071, 0], [0.7071, 0]],
  "shots": 0,
  "reference_id": "supplied/expected-v1"
}
```

```bash
qproof run-json experiment.json --out report.json
```
