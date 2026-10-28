# QProof

**Capability-first classical state-vector experiment workbench**

Build arbitrary supported circuits, execute them in the browser or Python, verify claims against independent references, and inspect evidence integrity.

> Does **not** claim quantum advantage, quantum hardware, or experimental physics validation.

**Live site:** https://thebabeldragon.github.io/QProof/  
*(updates after merge to `main` + Pages deploy)*

## Quick start — blank experiment (browser)

1. Open the Pages workbench.
2. **Experiment Lab** starts blank (or reset with “Reset blank”).
3. Set qubits, add gates from the registry palette, **Validate**, **Run in browser**.
4. Optionally open **Claim Verification** and attach an analytic or pasted reference.
5. **Evidence Inspector** → verify integrity / export JSON.

## Install & Python CLI

```bash
git clone https://github.com/TheBabelDragon/QProof.git
cd QProof
pip install -e ".[dev]"

qproof capabilities
qproof run hadamard --out report.json
qproof verify-evidence report.json
qproof run-json experiment.json
```

## Supported gates (tested)

I, X, Y, Z, H, S, T, RX, RY, RZ, CNOT/CX, CZ  
Little-endian qubit 0 = LSB. Python max 20 qubits; browser max **12**.

## Workspaces

| Workspace | Role |
|-----------|------|
| Experiment Lab | Blank-first circuit editor, live browser execution, amplitudes & shots |
| Claim Verification | Reference-based scientific checks (passed / failed / inconclusive) |
| Evidence Inspector | Import, integrity, tamper test, export |

Fixtures (Bell, H, …) are **optional templates**, not architectural special cases.

## Independent browser oracle

Supported circuits are verified against `web/oracle.js` — an independent
state-vector reference that does **not** share the production simulator’s
gate-application path. Analytic Hadamard/Bell fixtures and pasted amplitudes
remain optional overrides. Missing references yield INCONCLUSIVE/ERROR, never
a fabricated PASS.

```bash
node web/test_oracle.mjs
```

## Evidence integrity

- Canonical hash: `json.dumps(..., sort_keys=True, separators=(',', ':'))` then SHA-256.
- **Missing `report_hash` cannot be labeled hash-verified.**
- Hash match ≠ scientific truth.
- Authoritative verifier: `qproof verify-evidence`.

## Tests

```bash
pytest -q
node web/test_simulator.mjs
node web/test_oracle.mjs
```

## License

MIT
