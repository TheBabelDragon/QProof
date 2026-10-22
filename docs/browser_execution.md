# Live browser execution

The GitHub Pages site includes a **classical** JavaScript state-vector simulator
(`web/simulator.js`) that implements the same gate set and little-endian
conventions as the Python engine.

## Supported in browser

- Gates: I, X, Y, Z, H, S, T, RX, RY, RZ, CNOT/CX, CZ
- Max qubits: **12** (hard limit in browser to avoid UI freezes; Python allows more)
- Exact amplitudes and probabilities
- Seeded finite-shot sampling (Mulberry32 PRNG — not identical to NumPy RNG)
- Circuit JSON format version `1.0.0` shared with Python

## Not supported

- Quantum hardware, GPU acceleration, noise models
- Gates outside the capability registry (SWAP, Toffoli, …)
- Cryptographic attestation of browser results

## Provenance labels

| Label | Meaning |
|-------|---------|
| live browser execution | Computed now by `simulator.js` |
| precomputed Python evidence | Loaded fixture from CI / `qproof run` |
| imported evidence | User-supplied JSON |
| UI-only demo | Display mutation only — **not** a verifier result |

## Evidence integrity

- Python: `qproof verify-evidence report.json` (authoritative)
- Browser: client-side structure + hash recompute via Web Crypto (convenience only)

Hashes prove integrity of the hashed body, not scientific truth.

## Cross-check

Run Node unit tests (no browser):

```bash
node web/test_simulator.mjs
```

Python regression suite remains the primary gate for claim verification fixtures.
