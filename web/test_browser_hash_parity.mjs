/**
 * Node regression: browser report hashes must verify under Python qproof.canonical.
 * Run: node web/test_browser_hash_parity.mjs
 */
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

// Load pure JS modules the same way the browser does (globalThis).
globalThis.window = globalThis;
require("./canonical_hash.js");
require("./simulator.js");
require("./hash_attach.js");

const C = globalThis.QProofCanonical;
const S = globalThis.QProofSimulator;

if (!C || !S || !S.buildBrowserReport) {
  console.error("FAIL: QProofCanonical or QProofSimulator not loaded");
  process.exit(1);
}

function runCase(name, spec, meta, expectScientific) {
  const result = S.runCircuit(spec, { shots: 0, seed: 42 });
  result.depth = result.gate_count;
  const report = S.buildBrowserReport(spec, result, meta);
  if (!report.integrity || !report.integrity.report_hash) {
    console.error(name + ": FAIL missing report_hash after hash_attach");
    process.exit(1);
  }
  if (report.status !== expectScientific) {
    console.error(
      name +
        ": FAIL scientific status=" +
        report.status +
        " expected=" +
        expectScientific
    );
    process.exit(1);
  }

  const tmp = path.join(
    require("os").tmpdir(),
    "qproof-parity-" + name + ".json"
  );
  fs.writeFileSync(tmp, JSON.stringify(report));

  // Prefer in-process Python if available
  const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.resolve(__dirname, ".."))})
from qproof.evidence import verify_evidence_detailed
r = json.load(open(${JSON.stringify(tmp)}))
d = verify_evidence_detailed(r)
print(d["integrity"])
print(d["hash_verified"])
print(d["scientific_checks"])
print("OK" if d["hash_verified"] and d["structure_ok"] else "BAD")
`;
  let out;
  try {
    out = execFileSync("python3", ["-c", py], { encoding: "utf8" });
  } catch (e) {
    console.error(name + ": Python verify failed", e.stderr || e.message);
    process.exit(1);
  }
  const lines = out.trim().split("\n");
  const integrity = lines[0];
  const hashVerified = lines[1] === "True";
  const scientific = lines[2];
  const ok = lines[3] === "OK";
  if (!ok || !hashVerified) {
    console.error(name + ": FAIL Python integrity", integrity, out);
    process.exit(1);
  }
  if (scientific !== expectScientific) {
    console.error(
      name + ": FAIL scientific_checks", scientific, "expected", expectScientific
    );
    process.exit(1);
  }
  console.log(
    "PASS",
    name,
    "integrity=" + integrity,
    "scientific=" + scientific
  );
  return report;
}

const s = 1 / Math.sqrt(2);

// Matching Hadamard
runCase(
  "hadamard-match",
  { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] },
  {
    experiment_id: "parity-h",
    expected_amplitudes: [
      [s, 0],
      [s, 0],
    ],
    expected_probabilities: [0.5, 0.5],
    reference_id: "analytic/hadamard-v1",
    tolerance: 1e-10,
  },
  "passed"
);

// Blank vs hadamard reference -> scientific failed, integrity still verified
runCase(
  "blank-vs-hadamard-fail",
  { n_qubits: 1, gates: [] },
  {
    experiment_id: "parity-blank",
    expected_amplitudes: [
      [s, 0],
      [s, 0],
    ],
    expected_probabilities: [0.5, 0.5],
    reference_id: "analytic/hadamard-v1",
    tolerance: 1e-10,
  },
  "failed"
);

// Tamper detection
{
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0 });
  result.depth = 1;
  const report = S.buildBrowserReport(spec, result, {
    experiment_id: "parity-tamper",
    expected_amplitudes: [
      [s, 0],
      [s, 0],
    ],
    expected_probabilities: [0.5, 0.5],
    reference_id: "analytic/hadamard-v1",
  });
  report.results.fidelity = 0.42;
  const recomputed = C.reportHash(report);
  if (recomputed === report.integrity.report_hash) {
    console.error("FAIL tamper: hash unexpectedly still matches");
    process.exit(1);
  }
  console.log("PASS tamper-detected integrity=failed");
}

// Missing hash -> unverified
{
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0 });
  result.depth = 1;
  const report = S.buildBrowserReport(spec, result, { experiment_id: "parity-miss" });
  report.integrity.report_hash = null;
  const tmp = path.join(require("os").tmpdir(), "qproof-parity-miss.json");
  fs.writeFileSync(tmp, JSON.stringify(report));
  const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.resolve(__dirname, ".."))})
from qproof.evidence import verify_evidence_detailed
r = json.load(open(${JSON.stringify(tmp)}))
d = verify_evidence_detailed(r)
assert d["integrity"] == "unverified"
assert d["hash_verified"] is False
print("PASS missing-hash integrity=unverified")
`;
  execFileSync("python3", ["-c", py], { encoding: "utf8", stdio: "inherit" });
}

console.log("All browser-Python parity checks passed.");
