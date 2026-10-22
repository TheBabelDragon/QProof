/**
 * Regression: live reference verification end-to-end.
 * Exercises resolveSelectedReference + buildBrowserReport (browser-facing path).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const web = path.join(__dirname, "..");
const roots = [web, path.join(web, "web"), path.join(__dirname)];
function load(name) {
  for (const r of roots) {
    const p = path.join(r, name);
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  const p = path.join(__dirname, name);
  return fs.readFileSync(p, "utf8");
}

global.window = global;
global.document = {
  querySelector: function () { return null; },
  createElement: function () { return {}; },
};

let refMode = "";
let refTol = "1e-10";
let refAmps = "";
let nQubits = "1";
const elements = {};
global.document.querySelector = function (sel) {
  if (sel === "#ref-mode") return {
    get value() { return refMode; },
    set value(v) { refMode = v; },
    addEventListener: function () {},
  };
  if (sel === "#ref-tol") return { value: refTol, addEventListener: function () {} };
  if (sel === "#ref-amps") return { value: refAmps, addEventListener: function () {} };
  if (sel === "#n-qubits") return {
    get value() { return nQubits; },
    set value(v) { nQubits = String(v); },
    addEventListener: function () {},
  };
  if (sel === "#template-select") return { value: "", addEventListener: function () {} };
  if (!elements[sel]) {
    elements[sel] = {
      textContent: "",
      className: "",
      innerHTML: "",
      value: "",
      addEventListener: function () {},
      style: {},
    };
  }
  return elements[sel];
};

eval(load("canonical_hash.js"));
eval(load("simulator.js"));
if (fs.existsSync(path.join(__dirname, "claims_patch.js")) ||
    fs.existsSync(path.join(web, "claims_patch.js")) ||
    fs.existsSync(path.join(web, "web", "claims_patch.js"))) {
  eval(load("claims_patch.js"));
}

const appSrc = process.env.QPROOF_APP_JS
  ? fs.readFileSync(process.env.QPROOF_APP_JS, "utf8")
  : load("app.js");
eval(appSrc);

const App = global.QProofApp;
const S = global.QProofSimulator;
if (!App || !S) {
  console.error("FAIL: QProofApp or QProofSimulator missing");
  process.exit(1);
}

let failed = 0;
function pass(name) { console.log("PASS", name); }
function fail(name, msg) {
  console.error("FAIL", name, msg || "");
  failed++;
}

const s = 1 / Math.sqrt(2);

// 1. Hadamard vs independent expected
{
  refMode = "analytic-h";
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0, seed: 42 });
  const resolved = App.resolveSelectedReference(spec, result);
  if (resolved.error) fail("hadamard-resolve", resolved.error);
  else if (!resolved.meta.expected_amplitudes) fail("hadamard-resolve", "no expected amps");
  else {
    const report = S.buildBrowserReport(spec, result, Object.assign({ experiment_id: "t-h" }, resolved.meta));
    if (report.status !== "passed") fail("hadamard-report", report.status + " " + JSON.stringify(report.checks));
    else if (!report.results.expected_amplitudes) fail("hadamard-report", "missing expected in results");
    else if (!report.integrity || !report.integrity.report_hash) fail("hadamard-hash", "missing hash");
    else pass("hadamard-independent-expected");
  }
}

// 2. Bell vs independent expected
{
  refMode = "analytic-bell";
  const spec = { n_qubits: 2, gates: [{ gate: "H", qubits: [0] }, { gate: "CNOT", qubits: [0, 1] }] };
  const result = S.runCircuit(spec, { shots: 0, seed: 42 });
  const resolved = App.resolveSelectedReference(spec, result);
  const report = S.buildBrowserReport(spec, result, Object.assign({ experiment_id: "t-b" }, resolved.meta));
  if (report.status !== "passed") fail("bell-report", report.status);
  else if (!report.integrity.report_hash) fail("bell-hash");
  else pass("bell-independent-expected");
}

// 3. Template auto-selects reference
{
  App.applyTemplate("hadamard");
  if (refMode !== "analytic-h") fail("template-auto-ref", "got " + refMode);
  else pass("template-auto-selects-ref");
  App.applyTemplate("bell");
  if (refMode !== "analytic-bell") fail("template-bell-ref", "got " + refMode);
  else pass("template-bell-auto-ref");
}

// 4. Manual reference selection
{
  refMode = "analytic-h";
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0, seed: 1 });
  const resolved = App.resolveSelectedReference(spec, result);
  if (resolved.refId !== "analytic/hadamard-v1" || !resolved.meta.expected_amplitudes) {
    fail("manual-ref", JSON.stringify(resolved));
  } else pass("manual-reference-selection");
}

// 5. No reference → honest inconclusive
{
  refMode = "";
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0, seed: 1 });
  const resolved = App.resolveSelectedReference(spec, result);
  const report = S.buildBrowserReport(spec, result, Object.assign({ experiment_id: "t-n" }, resolved.meta));
  if (report.status !== "inconclusive") fail("no-ref-status", report.status);
  else {
    const amp = report.checks.find((c) => c.name === "amplitudes");
    if (!amp || amp.status !== "inconclusive") fail("no-ref-amp");
    else pass("no-reference-inconclusive");
  }
}

// 6. Incorrect reference (same dim, wrong values) → failed
{
  refMode = "paste";
  refAmps = JSON.stringify([[0, 0], [1, 0]]);
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0, seed: 1 });
  const resolved = App.resolveSelectedReference(spec, result);
  const report = S.buildBrowserReport(spec, result, Object.assign({ experiment_id: "t-wrong" }, resolved.meta));
  if (report.status !== "failed") fail("wrong-ref-status", report.status + " " + JSON.stringify(report.checks));
  else pass("incorrect-reference-fails");
}

// 7. Dimensionally incompatible reference → inconclusive
{
  refMode = "analytic-bell";
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0, seed: 1 });
  const resolved = App.resolveSelectedReference(spec, result);
  if (resolved.meta.precondition_status !== "inconclusive") {
    fail("incompat-precond", JSON.stringify(resolved.meta));
  } else if (resolved.meta.expected_amplitudes != null) {
    fail("incompat-amps-should-be-null");
  } else {
    const report = S.buildBrowserReport(spec, result, Object.assign({ experiment_id: "t-dim" }, resolved.meta));
    if (report.status !== "inconclusive") fail("incompat-status", report.status);
    else pass("incompatible-dim-inconclusive");
  }
}

// 8. Malformed paste
{
  refMode = "paste";
  refAmps = "not-json";
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0, seed: 1 });
  const resolved = App.resolveSelectedReference(spec, result);
  if (!resolved.error) fail("malformed-should-error");
  else pass("malformed-paste-error");
}

// 9. Template switch clears incompatible ref
{
  App.applyTemplate("hadamard");
  if (refMode !== "analytic-h") fail("switch-1");
  App.applyTemplate("rx-pi");
  if (refMode !== "") fail("switch-clear", "got " + refMode);
  else pass("template-switch-clears-ref");
}

// 10. Verify-claim path preserves reference semantics
{
  refMode = "analytic-h";
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0, seed: 7 });
  const r1 = App.resolveSelectedReference(spec, result);
  const report1 = S.buildBrowserReport(spec, result, Object.assign({ experiment_id: "v1" }, r1.meta));
  const r2 = App.resolveSelectedReference(spec, result);
  const report2 = S.buildBrowserReport(spec, result, Object.assign({ experiment_id: "v1" }, r2.meta));
  if (report1.status !== report2.status) fail("verify-preserve-status");
  else if (report1.status !== "passed") fail("verify-status", report1.status);
  else pass("verify-claim-preserves-ref");
}

// 11. Expected values independent of result
{
  refMode = "analytic-h";
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0, seed: 1 });
  const resolved = App.resolveSelectedReference(spec, result);
  const exp = resolved.meta.expected_amplitudes;
  result.amplitudes[0][0] = 0;
  const resolved2 = App.resolveSelectedReference(spec, result);
  if (resolved2.meta.expected_amplitudes[0][0] !== exp[0][0]) {
    fail("independence");
  } else pass("expected-independent-of-result");
}

if (failed) {
  console.error(failed + " failure(s)");
  process.exit(1);
}
console.log("All live-reference-verification checks passed.");
