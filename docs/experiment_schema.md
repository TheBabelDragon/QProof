# Experiment evidence schema (v1.0.0)

Machine-readable JSON report produced by `run_experiment` / `qproof run`.

## Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `schema_version` | string | Evidence schema version (`1.0.0`) |
| `experiment_id` | string | Stable experiment identifier |
| `description` | string | Human-readable summary |
| `claim` | string | Falsifiable claim under test |
| `status` | string | `passed` \| `failed` \| `inconclusive` |
| `checks` | array | Per-check outcomes |
| `circuit` | object | `spec`, `n_qubits`, `gate_count`, `depth` |
| `execution` | object | `shots`, `seed`, `mode`, `runtime_ms` |
| `results` | object | Observed/expected amplitudes & probabilities, fidelity, counts |
| `verification` | object | `simulator_id`, `reference_id`, `tolerances` |
| `environment` | object | Python / platform / numpy / qproof versions |
| `limitations` | array | Explicit non-claims |
| `integrity` | object | `input_hash`, `report_hash` (sha256 of canonical JSON) |

## Status semantics

- **passed** — every check succeeded within documented tolerances.
- **failed** — at least one mathematical, statistical, or schema check failed.
- **inconclusive** — reserved for missing backends / unsupported ops (not used for Bell).

A valid hash does **not** imply the scientific claim is true; hashes only bind the report body.

## Independent reference

Bell expected amplitudes are computed in `qproof/reference.py` from first principles and never call the production gate applicator. Shared defects cannot pass both paths unnoticed.
