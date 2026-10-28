/**
 * Independent browser oracle unit + differential tests.
 * Run: node web/test_oracle.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const O = require("./oracle.js");
const S = require("./simulator.js");

let passed = 0;
let failed = 0;
const TOL = 1e-10;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("FAIL:", msg);
  }
}

function nearly(a, b, tol = TOL) {
  return Math.abs(a - b) <= tol;
}

// --- Individual gates ---
{
  const r = O.runOracle({ n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] });
  const s = 1 / Math.sqrt(2);
  assert(nearly(r.amplitudes[0][0], s) && nearly(r.amplitudes[1][0], s), "H|0>");
  assert(r.oracle_id.startsWith("qproof-oracle-js"), "oracle id");
}

{
  const r = O.runOracle({ n_qubits: 1, gates: [{ gate: "X", qubits: [0] }] });
  assert(nearly(r.amplitudes[0][0], 0) && nearly(r.amplitudes[1][0], 1), "X|0>");
}

{
  const r = O.runOracle({ n_qubits: 1, gates: [{ gate: "Y", qubits: [0] }] });
  assert(nearly(r.amplitudes[1][1], 1) || nearly(r.amplitudes[1][0], 0), "Y|0> imag");
  assert(nearly(r.probabilities[1], 1), "Y|0> prob");
}

{
  const r = O.runOracle(
    { n_qubits: 1, gates: [{ gate: "Z", qubits: [0] }] },
    { initialIndex: 1 }
  );
  assert(nearly(r.amplitudes[1][0], -1), "Z|1>");
}

{
  const r = O.runOracle(
    { n_qubits: 1, gates: [{ gate: "S", qubits: [0] }] },
    { initialIndex: 1 }
  );
  assert(nearly(r.amplitudes[1][1], 1), "S|1> = i|1>");
}

{
  const r = O.runOracle({
    n_qubits: 1,
    gates: [{ gate: "RX", qubits: [0], theta: Math.PI }],
  });
  assert(nearly(r.probabilities[1], 1), "RX(pi)|0> prob");
  assert(nearly(r.amplitudes[1][1], -1), "RX(pi)|0> = -i|1>");
}

// Bell
{
  const r = O.runOracle({
    n_qubits: 2,
    gates: [
      { gate: "H", qubits: [0] },
      { gate: "CNOT", qubits: [0, 1] },
    ],
  });
  const s = 1 / Math.sqrt(2);
  assert(nearly(r.amplitudes[0][0], s) && nearly(r.amplitudes[3][0], s), "Bell amps");
  assert(nearly(r.probabilities[0], 0.5) && nearly(r.probabilities[3], 0.5), "Bell probs");
  assert(nearly(r.probabilities[1], 0) && nearly(r.probabilities[2], 0), "Bell zero");
}

// GHZ-3
{
  const r = O.runOracle({
    n_qubits: 3,
    gates: [
      { gate: "H", qubits: [0] },
      { gate: "CNOT", qubits: [0, 1] },
      { gate: "CNOT", qubits: [0, 2] },
    ],
  });
  const s = 1 / Math.sqrt(2);
  assert(nearly(r.amplitudes[0][0], s) && nearly(r.amplitudes[7][0], s), "GHZ amps");
}

// Identity / inverse
{
  const r = O.runOracle({
    n_qubits: 1,
    gates: [
      { gate: "H", qubits: [0] },
      { gate: "H", qubits: [0] },
    ],
  });
  assert(nearly(r.amplitudes[0][0], 1), "H;H = I");
}

// Differential: oracle vs production simulator
const cases = [
  { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] },
  { n_qubits: 1, gates: [{ gate: "X", qubits: [0] }, { gate: "Y", qubits: [0] }] },
  {
    n_qubits: 2,
    gates: [
      { gate: "H", qubits: [0] },
      { gate: "CNOT", qubits: [0, 1] },
    ],
  },
  {
    n_qubits: 2,
    gates: [
      { gate: "H", qubits: [1] },
      { gate: "CZ", qubits: [0, 1] },
    ],
  },
  {
    n_qubits: 1,
    gates: [{ gate: "RY", qubits: [0], theta: Math.PI / 3 }],
  },
];

for (const spec of cases) {
  const o = O.runOracle(spec);
  const s = S.runCircuit(spec, { shots: 0 });
  const err = O.maxAlignedAmpError(s.amplitudes, o.amplitudes);
  const fid = O.pureFidelity(s.amplitudes, o.amplitudes);
  assert(err <= 1e-9, "diff max err " + err + " for " + JSON.stringify(spec.gates));
  assert(nearly(fid, 1, 1e-9), "diff fidelity " + fid);
}

// Negative: corrupted production must FAIL differential
{
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const o = O.runOracle(spec);
  const bad = {
    amplitudes: [
      [1, 0],
      [0, 0],
    ],
    probabilities: [1, 0],
  };
  const err = O.maxAlignedAmpError(bad.amplitudes, o.amplitudes);
  assert(err > 0.1, "corrupted production detected");
}

// Malformed / unsupported
{
  let threw = false;
  try {
    O.runOracle({ n_qubits: 1, gates: [{ gate: "FOO", qubits: [0] }] });
  } catch (e) {
    threw = true;
  }
  assert(threw, "unsupported gate throws");
}

{
  let threw = false;
  try {
    O.runOracle({ n_qubits: 1, gates: [{ gate: "CNOT", qubits: [0, 0] }] });
  } catch (e) {
    threw = true;
  }
  assert(threw, "invalid CNOT throws");
}

// Validation API
{
  const v = O.validateCircuit({ n_qubits: 2, gates: [{ gate: "H", qubits: [0] }] });
  assert(v.ok, "valid circuit ok");
  const bad = O.validateCircuit({ n_qubits: 1, gates: [{ gate: "CNOT", qubits: [0, 1] }] });
  assert(!bad.ok, "out of range qubit not ok");
}

// Global phase invariance of fidelity
{
  const a = [
    [1 / Math.sqrt(2), 0],
    [1 / Math.sqrt(2), 0],
  ];
  const b = [
    [-1 / Math.sqrt(2), 0],
    [-1 / Math.sqrt(2), 0],
  ];
  assert(nearly(O.pureFidelity(a, b), 1), "global phase fidelity");
}

console.log(
  "oracle tests: " + passed + " passed, " + failed + " failed"
);
process.exit(failed ? 1 : 0);
