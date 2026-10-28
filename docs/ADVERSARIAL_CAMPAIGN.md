# Adversarial Verification Campaign

**Level-1 implementation verification** with measurable effectiveness.

## Promise

QProof can automatically generate a seeded verification campaign that:

1. Builds analytic fixtures and random circuits
2. Compares the production simulator to the **independent oracle**
3. Injects a documented software-fault catalog
4. Reports detection rate, false-pass rate, false-alarm rate
5. Emits a portable JSON report another machine can re-run from the seed

## What it does not claim

- Quantum hardware certification
- Quantum advantage
- That integrity hashes imply scientific truth
- That mutations model physical noise

## Fault catalog

| ID | Description | Expected detectable |
|----|-------------|---------------------|
| `cnot_control_target_swap` | Swap CNOT control/target | yes |
| `rotation_sign_flip` | Flip RX/RY/RZ off-diagonals | yes |
| `endianness_swap` | MSB-first CNOT indices | yes |
| `phase_collapse` | Drop complex phases | yes |
| `l1_renormalize` | L1 instead of L2 norm | yes |
| `identity_noop` | No change (negative control) | no |

Carriers where a mutation does not change the reference state are marked
`inconclusive` (not exercised) and excluded from the detection-rate denominator.

## Run

```python
from qproof.campaign import run_campaign
report = run_campaign(seed=42, output_dir="artifacts/campaign")
print(report["metrics"])
```

## Acceptance (seed=42, local)

- detection_rate = 1.0 on exercised faults
- false_alarm_rate = 0.0 on identity_noop
- all clean random circuits pass vs independent oracle
