# Canonical evidence hash contract (qproof-canonical-v1)

Browser (`web/canonical_hash.js`) and Python (`qproof.canonical`) implement the same rules.

## Serialization

1. **Objects**: keys sorted lexicographically; values normalized recursively.
2. **Arrays**: order preserved; elements normalized.
3. **Numbers**: finite only (reject NaN / ±Inf). Format with 15 significant digits
   (`format(x, '.15g')` in Python; `Number.toPrecision(15)` in JS). Integral values
   in range `(-2^53, 2^53)` become JSON integers (`1` not `1.0`).
4. **Strings / bools / null**: standard JSON.
5. **Separators**: `(',', ':')` — no spaces.
6. **Encoding**: UTF-8. Python uses `ensure_ascii=True` (non-ASCII → `\uXXXX`).
   Browser report bodies must use ASCII hyphens in hashed strings (or apply
   ascii-normalize before hashing) so dumps match.

## Hash fields

| Field | Input | Rule |
|-------|--------|------|
| `circuit_hash` | `{n_qubits, spec}` | SHA-256 of canonical circuit object |
| `input_hash` | experiment id, circuit spec, shots, seed, tolerances | SHA-256 of that object |
| `report_hash` | full report | Set `integrity.report_hash` to `null`, then SHA-256 of canonical body |

Hash string form: `sha256:` + lowercase hex digest.

## Lifecycle

1. Finalize the report body (all checks, results, metadata).
2. Compute `circuit_hash` and `input_hash`.
3. Compute `report_hash` over the body with `report_hash` null.
4. Attach hashes under `integrity`.
5. **Never mutate** any hashed field afterward. Any change requires regenerating the report and hashes.

## Integrity outcomes

| Outcome | Meaning |
|---------|---------|
| `verified` | Structure valid; declared `report_hash` matches recomputation |
| `failed` | Structure valid but hash mismatch or circuit_hash mismatch |
| `unverified` | Structure valid but `report_hash` absent (legacy / incomplete) |

Missing `report_hash` is never treated as a pass.

## Shared test vectors

See `tests/test_canonical_contract.py` and `web/test_canonical_vectors.cjs`.
