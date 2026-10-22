/**
 * Live report pipeline regression: comparisons, hashes, preconditions, Python round-trip.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

function load(name, extra) {
  const code = fs.readFileSync(path.join(__dirname, name), "utf8");
  const sandbox = Object.assign(
    {
      module: { exports: {} },
      exports: {},
      console,
      globalThis: {},
    },
    extra || {}
  );
  sandbox.window = sandbox.globalThis;
  sandbox.global = sandbox.globalThis;
  vm.runInNewContext(code, sandbox, { filename: name });
  return sandbox;
}

const cSand = load("canonical_hash.js");
const C =
  cSand.globalThis.QProofCanonical ||
  cSand.QProofCanonical ||
  cSand.module.exports;
const sSand = load("simulator.js");
sSand.globalThis.QProofCanonical = C;
sSand.QProofCanonical = C;
const S =
  sSand.globalThis.QProofSimulator ||
  sSand.QProofSimulator ||
  sSand.module.exports;

vm.runInNewContext(fs.readFileSync(path.join(__dirname, "hash_attach.js"), "utf8"), {
  window: sSand.globalThis,
  globalThis: sSand.globalThis,
  QProofSimulator: S,
  QProofCanonical: C,
});

const s = 1 / Math.sqrt(2);
const root = path.resolve(__dirname, "..");
let failed = 0;

function ok(name, cond, extra) {
  if (cond) console.log("PASS", name);
  else {
    console.error("FAIL", name, extra || "");
    failed++;
  }
}

{
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0 });
  result.depth = 1;
  const report = S.buildBrowserReport(spec, result, { experiment_id: "hash-test" });
  ok("live-report-has-report_hash", !!(report.integrity && report.integrity.report_hash));
  ok("live-report-has-circuit_hash", !!(report.integrity && report.integrity.circuit_hash));
}

{
  const r = S.compareAmplitudes([[1, 0]], [[s, 0], [s, 0]], 1e-10);
  ok("amp-dim-mismatch-inconclusive", r.status === "inconclusive", r);
  ok("amp-dim-mismatch-not-infinity", r.value == null, r);
}

{
  const r = S.compareFidelity([[1, 0]], [[s, 0], [s, 0]], 1e-10);
  ok("fid-dim-mismatch-inconclusive", r.status === "inconclusive", r);
  ok("fid-dim-mismatch-not-zero", r.value == null, r);
}

{
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0 });
  result.depth = 1;
  const report = S.buildBrowserReport(spec, result, {
    experiment_id: "h-match",
    expected_amplitudes: [[s, 0], [s, 0]],
    expected_probabilities: [0.5, 0.5],
    reference_id: "analytic/hadamard-v1",
  });
  ok("hadamard-scientific-passed", report.status === "passed", report.status);
  ok("hadamard-has-hash", !!report.integrity.report_hash);
}

{
  const spec = {
    n_qubits: 2,
    gates: [
      { gate: "H", qubits: [0] },
      { gate: "CNOT", qubits: [0, 1] },
    ],
  };
  const result = S.runCircuit(spec, { shots: 0 });
  result.depth = 2;
  const report = S.buildBrowserReport(spec, result, {
    experiment_id: "bell-match",
    expected_amplitudes: [[s, 0], [0, 0], [0, 0], [s, 0]],
    expected_probabilities: [0.5, 0, 0, 0.5],
    reference_id: "analytic/bell-v1",
  });
  ok("bell-scientific-passed", report.status === "passed", report.status);
}

{
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0 });
  result.depth = 1;
  const report = S.buildBrowserReport(spec, result, {
    experiment_id: "precond-fail",
    expected_amplitudes: null,
    reference_id: "analytic/bell-v1",
    precondition_ok: false,
    precondition_detail: "n_qubits=1 does not match reference 2",
  });
  ok("precond-inconclusive", report.status === "inconclusive", report.status);
  const amp = report.checks.find((c) => c.name === "amplitudes");
  ok("precond-amp-inconclusive", amp && amp.status === "inconclusive", amp);
}

{
  const spec = { n_qubits: 1, gates: [{ gate: "X", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0 });
  result.depth = 1;
  const report = S.buildBrowserReport(spec, result, {
    experiment_id: "wrong-h",
    expected_amplitudes: [[s, 0], [s, 0]],
    expected_probabilities: [0.5, 0.5],
    reference_id: "analytic/hadamard-v1",
  });
  ok("wrong-circuit-failed", report.status === "failed", report.status);
}

{
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0 });
  result.depth = 1;
  const report = S.buildBrowserReport(spec, result, { experiment_id: "no-ref" });
  ok("no-ref-inconclusive", report.status === "inconclusive", report.status);
}

{
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0 });
  result.depth = 1;
  const report = S.buildBrowserReport(spec, result, {
    experiment_id: "py-roundtrip",
    expected_amplitudes: [[s, 0], [s, 0]],
    expected_probabilities: [0.5, 0.5],
    reference_id: "analytic/hadamard-v1",
  });
  const tmp = path.join(require("os").tmpdir(), "qproof-live-rt.json");
  fs.writeFileSync(tmp, JSON.stringify(report));
  const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(root)})
from qproof.evidence import verify_evidence_detailed
r = json.load(open(${JSON.stringify(tmp)}))
d = verify_evidence_detailed(r)
assert d["hash_verified"] is True, d
assert d["integrity"] == "verified", d
r["results"]["fidelity"] = 0.0
d2 = verify_evidence_detailed(r)
assert d2["integrity"] == "failed", d2
print("OK")
`;
  try {
    const out = execFileSync("python3", ["-c", py], { encoding: "utf8" });
    ok("python-roundtrip-and-tamper", out.trim().endsWith("OK"), out);
  } catch (e) {
    ok("python-roundtrip-and-tamper", false, e.stderr || e.message);
  }
}

{
  const r = S.compareProbabilities([0.5, 0.5], [0.5, 0, 0, 0.5], 1e-10);
  ok("prob-dim-mismatch-inconclusive", r.status === "inconclusive", r);
}

{
  const r = S.compareFidelity([[1, 0], [0, 0]], [[0, 0], [1, 0]], 1e-10);
  ok("orthogonal-fid-failed", r.status === "failed" && r.value != null && r.value < 0.01, r);
}

if (failed) {
  console.error(failed, "failures");
  process.exit(1);
}
console.log("All live pipeline checks passed.");
