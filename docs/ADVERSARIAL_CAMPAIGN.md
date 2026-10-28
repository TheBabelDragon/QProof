# Adversarial Verification Campaign (v1.1)

**Level-1 implementation verification** with measurable effectiveness.

## Promise

QProof can automatically generate a seeded verification campaign that:

1. Runs analytic fixtures and random circuits through the **production** simulator
2. Compares production amplitudes to the **independent oracle** (and explicit analytic vectors for H/Bell)
3. Injects a documented software-fault catalog
4. Reports detection / false-pass / false-alarm rates with explicit denominators
5. Emits a portable JSON report with a **deterministic digest** (excluding runtime metadata)

## Trust boundary

| Comparison | What it tests |
|------------|---------------|
| Production vs independent oracle | Shared defects are less likely to pass both paths |
| Production vs explicit analytic amplitudes (H, Bell, XX, HH) | Third reference independent of both engines |
| Mutated path vs oracle | Whether the verifier notices known software faults |

A matching `campaign_hash` proves **byte-stable report content under the documented canonicalization**, not scientific correctness of quantum physics or hardware.

## Metric definitions

| Metric | Definition | Denominator |
|--------|------------|-------------|
| `detection_rate` | Exercised expected-detectable mutations with `detected_fault=true` | `n_detected + n_missed` (exercised only) |
| `false_pass_rate` | Exercised expected-detectable mutations with `detected_fault=false` | same as detection |
| `false_alarm_rate` | Identity/no-op cases with `detected_fault=true` | identity control cases |

- **Unexercised** (mutation does not change the reference state on a carrier) → `status=inconclusive`, **not** counted as a miss.
- **Errors** on expected-detectable mutations → acceptance fails; they cannot inflate detection rate.
- **Undefined rates** (denominator 0) are `null`, never fabricated `0.0`.
- Clean/analytic **errors or failures** fail `clean_ok`.

Acceptance requires `overall_ok`: analytic fixtures present, detection rate ≥ 0.8 on exercised faults, clean_ok, and zero identity false alarms.

## Deterministic digest

- Algorithm: SHA-256 (`digest_algorithm`)
- Canonicalization: `qproof-campaign-canonical-v1` — `json.dumps(..., sort_keys=True, separators=(',', ':'))` with finite floats via `%.15g`
- **Included:** schema/engine/oracle IDs, seed, parameters, metrics (except `elapsed_ms`), cases, acceptance, limitations
- **Excluded:** `timestamp_utc`, `elapsed_ms`, output paths

## Fault catalog

| ID | Description | Expected detectable |
|----|-------------|---------------------|
| `cnot_control_target_swap` | Swap CNOT control/target | yes |
| `rotation_sign_flip` | Flip RX/RY/RZ off-diagonals | yes |
| `endianness_swap` | MSB-first CNOT indices | yes |
| `phase_collapse` | Drop complex phases | yes |
| `l1_renormalize` | L1 instead of L2 norm | yes |
| `identity_noop` | No change (negative control) | no |

## Run

```bash
# Full local campaign
qproof campaign --seed 42 --out artifacts/campaign

# CI smoke
qproof campaign --seed 42 --circuits 6 --max-qubits 2 --max-gates 5

pytest tests/test_campaign.py -q
```

## Non-claims

- Hardware certification
- Quantum advantage
- Physical noise validation
- Formal verification of arbitrary quantum programs
