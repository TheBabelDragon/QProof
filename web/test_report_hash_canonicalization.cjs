/**
 * Regression: report_hash must be stable across JS create / JS verify / Python verify.
 * Unicode, key order, export/import, mutation detection.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const dir = __dirname;

function load(name) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) throw new Error("missing " + p);
  return fs.readFileSync(p, "utf8");
}

global.window = global;
eval(load("canonical_hash.js"));
eval(load("simulator.js"));
try { eval(load("claims_patch.js")); } catch (e) {}
eval(load("evidence_verify.js"));

const C = global.QProofCanonical;
const S = global.QProofSimulator;
const E = global.QProofEvidence;

let failed = 0;
function pass(n) { console.log("PASS", n); }
function fail(n, m) { console.error("FAIL", n, m || ""); failed++; }

function pyVerify(report) {
  const tmp = path.join(require("os").tmpdir(), "qproof-hash-reg-" + Date.now() + ".json");
  fs.writeFileSync(tmp, JSON.stringify(report));
  const repo = path.resolve(dir, "..");
  const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(repo)})
from qproof.canonical import report_hash, canonical_dumps
from qproof.evidence import verify_evidence_detailed
r = json.load(open(${JSON.stringify(tmp)}))
d = verify_evidence_detailed(r)
print(d["integrity"])
print(d["hash_verified"])
print(report_hash(r))
print(r.get("integrity",{}).get("report_hash"))
`;
  try {
    const out = execFileSync("python3", ["-c", py], { encoding: "utf8" }).trim().split("\n");
    return { integrity: out[0], hash_verified: out[1] === "True", py_hash: out[2], declared: out[3] };
  } catch (e) {
    return { error: String(e.stderr || e.message) };
  }
}

const s = 1 / Math.sqrt(2);

function makeHadamardReport(extraChecks) {
  const spec = { format_version: "1.0.0", n_qubits: 1, gates: [{ gate: "H", qubits: [0] }], initial_state: { type: "zero" } };
  const result = S.runCircuit(spec, { shots: 0, seed: 42 });
  let report = S.buildBrowserReport(spec, result, {
    experiment_id: "hash-reg-h",
    expected_amplitudes: [[s, 0], [s, 0]],
    expected_probabilities: [0.5, 0.5],
    reference_id: "analytic/hadamard-v1",
    tolerance: 1e-10,
  });
  if (extraChecks && extraChecks.length) {
    report.checks = report.checks.concat(extraChecks);
    if (typeof S.finalizeReport === "function") report = S.finalizeReport(report);
    else {
      report.integrity.report_hash = null;
      report.integrity.report_hash = C.reportHash(report);
    }
  }
  return report;
}

{
  const report = makeHadamardReport();
  if (!report.integrity.report_hash) fail("fresh-has-hash");
  else if (C.reportHash(report) !== report.integrity.report_hash) fail("fresh-js-recompute");
  else pass("fresh-js-self-verify");
  E.verifyReportIntegrity(report).then((r) => {
    if (!r.hash_verified) fail("fresh-js-api", r.detail);
    else pass("fresh-js-api-verified");
  });
}

{
  const report = makeHadamardReport();
  const imported = JSON.parse(JSON.stringify(report));
  if (C.reportHash(imported) !== imported.integrity.report_hash) fail("export-import-hash");
  else pass("export-import-preserves-hash");
}

{
  const report = makeHadamardReport();
  const body = JSON.parse(JSON.stringify(report));
  body.integrity.report_hash = null;
  const h1 = C.canonicalHash(body);
  const scrambled = {};
  Object.keys(body).reverse().forEach((k) => { scrambled[k] = body[k]; });
  const h2 = C.canonicalHash(scrambled);
  if (h1 !== h2) fail("key-order", h1 + " vs " + h2);
  else pass("key-order-stable");
}

{
  const report = makeHadamardReport();
  const tampered = JSON.parse(JSON.stringify(report));
  tampered.status = "failed";
  if (C.reportHash(tampered) === tampered.integrity.report_hash) fail("tamper-status-should-mismatch");
  else pass("tamper-status-detected");
}

{
  const report = makeHadamardReport();
  const bad = JSON.parse(JSON.stringify(report));
  bad.integrity.report_hash = "sha256:" + "0".repeat(64);
  E.verifyReportIntegrity(bad).then((r) => {
    if (r.hash_verified || r.integrity === "verified") fail("bad-declared-accepted");
    else pass("bad-declared-rejected");
  });
}

{
  const report = makeHadamardReport();
  const mutated = JSON.parse(JSON.stringify(report));
  mutated.checks.push({ name: "extra", status: "passed", detail: "appended after hash" });
  if (C.reportHash(mutated) === mutated.integrity.report_hash) fail("post-hash-mutation-missed");
  else pass("post-hash-mutation-detected");
}

{
  const report = makeHadamardReport([
    { name: "shot_consistency", status: "passed", detail: "shot counts consistent (z \u2264 5.0)" },
  ]);
  const body = JSON.parse(JSON.stringify(report));
  body.integrity.report_hash = null;
  const dumps = C.canonicalDumps(body);
  if (!dumps.includes("\\u2264") && dumps.includes("\u2264")) {
    fail("unicode-ensure-ascii", "dumps still contains raw <=");
  } else {
    pass("unicode-ensure-ascii-in-dumps");
  }
  const py = pyVerify(report);
  if (py.error) fail("unicode-py-error", py.error);
  else if (!py.hash_verified) {
    fail("unicode-py-verify", "integrity=" + py.integrity + " js=" + report.integrity.report_hash + " py=" + py.py_hash);
  } else {
    pass("unicode-js-python-parity");
  }
}

{
  const report = makeHadamardReport();
  const a = C.reportHash(report);
  const b = JSON.parse(JSON.stringify(report));
  b.integrity.report_hash = "sha256:deadbeef";
  if (C.reportHash(b) !== a) fail("report-hash-not-excluded");
  else pass("report-hash-field-excluded");
}

{
  const d = C.canonicalDumps({ detail: "no shots requested \u2014 exact" });
  if (!d.includes("\\u2014")) fail("emdash-escape", d);
  else pass("emdash-escape");
}

setTimeout(() => {
  if (failed) {
    console.error(failed + " failure(s)");
    process.exit(1);
  }
  console.log("All report-hash-canonicalization checks passed.");
}, 50);
