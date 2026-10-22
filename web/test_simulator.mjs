/**
 * Node unit tests for web/simulator.js (no browser required).
 * Run: node web/test_simulator.mjs
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Load CommonJS-style IIFE by evaluating with a fake global
import { readFileSync } from "fs";
const src = readFileSync(join(__dirname, "simulator.js"), "utf8");
const sandbox = { module: { exports: {} }, globalThis: {} };
const fn = new Function("module", "globalThis", "exports", src + "\n; return module.exports || globalThis.QProofSimulator;");
const S = fn(sandbox.module, sandbox.globalThis, sandbox.module.exports);

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("FAIL:", msg);
  }
}
function nearly(a, b, tol = 1e-9) {
  return Math.abs(a - b) <= tol;
}

// Validation
{
  const bad = S.validateCircuit({ n_qubits: 0, gates: [] });
  assert(!bad.ok, "reject n_qubits=0");
  const unk = S.validateCircuit({ n_qubits: 1, gates: [{ gate: "FOO", qubits: [0] }] });
  assert(!unk.ok, "reject unknown gate");
  const ok = S.validateCircuit({
    n_qubits: 2,
    gates: [
      { gate: "H", qubits: [0] },
      { gate: "CNOT", qubits: [0, 1] },
    ],
  });
  assert(ok.ok, "accept Bell circuit");
  const rot = S.validateCircuit({
    n_qubits: 1,
    gates: [{ gate: "RX", qubits: [0] }],
  });
  assert(!rot.ok, "RX without theta fails");
}

// Hadamard
{
  const r = S.runCircuit({ n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] });
  const s = 1 / Math.sqrt(2);
  assert(nearly(r.probabilities[0], 0.5) && nearly(r.probabilities[1], 0.5), "H probs");
  assert(nearly(r.amplitudes[0][0], s) && nearly(r.amplitudes[1][0], s), "H amps");
}

// X
{
  const r = S.runCircuit({ n_qubits: 1, gates: [{ gate: "X", qubits: [0] }] });
  assert(nearly(r.probabilities[0], 0) && nearly(r.probabilities[1], 1), "X |1>");
}

// Bell
{
  const r = S.runCircuit({
    n_qubits: 2,
    gates: [
      { gate: "H", qubits: [0] },
      { gate: "CNOT", qubits: [0, 1] },
    ],
  });
  assert(nearly(r.probabilities[0], 0.5) && nearly(r.probabilities[3], 0.5), "Bell probs");
  assert(nearly(r.probabilities[1], 0) && nearly(r.probabilities[2], 0), "Bell zeros");
}

// RX(pi) ≈ X
{
  const r = S.runCircuit({
    n_qubits: 1,
    gates: [{ gate: "RX", qubits: [0], theta: Math.PI }],
  });
  assert(nearly(r.probabilities[1], 1, 1e-8), "RX(pi) → |1>");
}

// CZ phase on |11>
{
  const r = S.runCircuit({
    n_qubits: 2,
    gates: [
      { gate: "X", qubits: [0] },
      { gate: "X", qubits: [1] },
      { gate: "CZ", qubits: [0, 1] },
    ],
  });
  // |11> gets -1 phase; probability still 1 on index 3
  assert(nearly(r.probabilities[3], 1), "CZ keeps |11| prob");
  assert(nearly(r.amplitudes[3][0], -1) || nearly(r.amplitudes[3][0], 1), "CZ phase ±1");
  // should be -1
  assert(nearly(r.amplitudes[3][0], -1), "CZ amplitude -1");
}

// Seeded shots reproducibility
{
  const spec = {
    n_qubits: 1,
    gates: [{ gate: "H", qubits: [0] }],
  };
  const a = S.runCircuit(spec, { shots: 500, seed: 7 });
  const b = S.runCircuit(spec, { shots: 500, seed: 7 });
  assert(JSON.stringify(a.counts) === JSON.stringify(b.counts), "seeded shots reproducible");
}

// Serialization round-trip shape
{
  const text = S.serializeCircuit({
    n_qubits: 2,
    gates: [{ gate: "H", qubits: [0] }],
  });
  const parsed = JSON.parse(text);
  assert(parsed.format_version === "1.0.0", "format version");
  assert(parsed.gates[0].gate === "H", "gate name");
}

// Resource limit
{
  const big = S.validateCircuit({ n_qubits: 20, gates: [] });
  assert(!big.ok, "reject large n_qubits in browser");
}

console.log(`browser simulator tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
