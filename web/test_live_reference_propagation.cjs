/**
 * Regression: Hadamard/Bell live path must supply independent expected values
 * and produce scientific comparisons — not the three reported inconclusives.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const dir = __dirname;
function load(name) {
  for (const p of [path.join(dir, name), path.join(dir, "..", name), path.join(dir, "web", name)]) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  throw new Error("missing " + name);
}
global.window = global;
let refMode = "";
let nQubits = "1";
const els = {};
function makeEl(id) {
  if (els[id]) return els[id];
  const o = {
    _t: "",
    className: "",
    innerHTML: "",
    value: "",
    addEventListener() {},
    style: {},
    get textContent() { return this._t; },
    set textContent(v) { this._t = v; },
  };
  if (id === "ref-mode") {
    Object.defineProperty(o, "value", { get() { return refMode; }, set(v) { refMode = v; }, configurable: true });
  }
  if (id === "n-qubits") {
    Object.defineProperty(o, "value", { get() { return nQubits; }, set(v) { nQubits = String(v); }, configurable: true });
  }
  if (id === "ref-tol") o.value = "1e-10";
  if (id === "run-shots") o.value = "0";
  if (id === "run-seed") o.value = "42";
  if (id === "template-select") o.value = "hadamard";
  els[id] = o;
  return o;
}
global.document = {
  querySelector(sel) {
    const id = sel.startsWith("#") ? sel.slice(1) : sel;
    return makeEl(id);
  },
  createElement() { return { click() {}, style: {} }; },
  readyState: "complete",
  addEventListener() {},
};
global.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
global.Blob = function () {};

eval(load("canonical_hash.js"));
eval(load("simulator.js"));
try { eval(load("claims_patch.js")); } catch (e) {}
const appSrc = process.env.QPROOF_APP_JS ? fs.readFileSync(process.env.QPROOF_APP_JS, "utf8") : load("app.js");
eval(appSrc);

const App = global.QProofApp;
const S = global.QProofSimulator;
if (!App || !S) { console.error("missing App/S"); process.exit(1); }

let failed = 0;
function pass(n) { console.log("PASS", n); }
function fail(n, m) { console.error("FAIL", n, m || ""); failed++; }

let lastMeta = null;
const origBuild = S.buildBrowserReport.bind(S);
S.buildBrowserReport = function (spec, result, meta) {
  lastMeta = meta;
  return origBuild(spec, result, meta);
};

if (refMode !== "analytic-h") fail("boot-ref-mode", "got " + JSON.stringify(refMode));
else pass("boot-selects-analytic-h");

{
  const b = App.getBuilder();
  const spec = { format_version: "1.0.0", n_qubits: b.n_qubits, gates: b.gates.slice(), initial_state: { type: "zero" } };
  const result = S.runCircuit(spec, { shots: 0, seed: 42 });
  const resolved = App.resolveSelectedReference(spec, result);
  if (!resolved.meta || !resolved.meta.expected_amplitudes) {
    fail("hadamard-meta-expected", JSON.stringify(resolved));
  } else if (resolved.meta.reference_id !== "analytic/hadamard-v1") {
    fail("hadamard-ref-id", resolved.meta.reference_id);
  } else {
    const report = S.buildBrowserReport(spec, result, Object.assign({ experiment_id: "h" }, resolved.meta));
    if (!lastMeta || !lastMeta.expected_amplitudes) fail("hadamard-builder-meta");
    else if (report.status !== "passed") fail("hadamard-status", report.status);
    else if (!report.results.expected_amplitudes) fail("hadamard-results-expected");
    else {
      const amp = report.checks.find((c) => c.name === "amplitudes");
      const fid = report.checks.find((c) => c.name === "fidelity");
      const pr = report.checks.find((c) => c.name === "probabilities");
      if (!amp || amp.status === "inconclusive") fail("hadamard-amp", amp && amp.detail);
      else if (!fid || fid.status === "inconclusive") fail("hadamard-fid", fid && fid.detail);
      else if (!pr || pr.status === "inconclusive") fail("hadamard-pr", pr && pr.detail);
      else pass("hadamard-scientific-passed");
    }
  }
}

{
  refMode = "";
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }], initial_state: { type: "zero" } };
  const result = S.runCircuit(spec, { shots: 0, seed: 1 });
  const resolved = App.resolveSelectedReference(spec, result);
  if (!resolved.meta.expected_amplitudes) fail("infer-expected");
  else if (resolved.meta.reference_id !== "analytic/hadamard-v1") fail("infer-id", resolved.meta.reference_id);
  else pass("infer-from-circuit-when-dropdown-empty");
}

{
  App.applyTemplate("bell");
  const b = App.getBuilder();
  const spec = { n_qubits: b.n_qubits, gates: b.gates.slice(), initial_state: { type: "zero" } };
  const result = S.runCircuit(spec, { shots: 0, seed: 2 });
  const resolved = App.resolveSelectedReference(spec, result);
  const report = S.buildBrowserReport(spec, result, Object.assign({ experiment_id: "b" }, resolved.meta));
  if (report.status !== "passed") fail("bell-status", report.status);
  else if (!report.results.expected_amplitudes) fail("bell-expected");
  else pass("bell-scientific-passed");
}

{
  refMode = "";
  const spec = { n_qubits: 1, gates: [{ gate: "X", qubits: [0] }], initial_state: { type: "zero" } };
  const result = S.runCircuit(spec, { shots: 0, seed: 3 });
  const resolved = App.resolveSelectedReference(spec, result);
  const report = S.buildBrowserReport(spec, result, Object.assign({ experiment_id: "x" }, resolved.meta));
  if (report.status !== "inconclusive") fail("no-ref-x", report.status);
  else pass("arbitrary-circuit-honest-inconclusive");
}

{
  const spec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0, seed: 4 });
  const report = S.buildBrowserReport(spec, result, {
    experiment_id: "wrong",
    expected_amplitudes: [[1, 0], [0, 0]],
    expected_probabilities: [1, 0],
    reference_id: "supplied/wrong",
    tolerance: 1e-10,
  });
  if (report.status !== "failed") fail("wrong-ref", report.status);
  else pass("wrong-reference-fails");
}

{
  refMode = "";
  const spec = { n_qubits: 2, gates: [{ gate: "H", qubits: [0] }] };
  const result = S.runCircuit(spec, { shots: 0, seed: 5 });
  const resolved = App.resolveSelectedReference(spec, result);
  if (resolved.meta.expected_amplitudes) fail("no-false-infer", resolved.meta.reference_id);
  else {
    const report = S.buildBrowserReport(spec, result, Object.assign({ experiment_id: "inc" }, resolved.meta));
    const amp = report.checks.find((c) => c.name === "amplitudes");
    if (!amp || amp.status !== "inconclusive") fail("repro-inconclusive");
    else pass("reproduced-inconclusive-without-compatible-ref");
  }
}

if (failed) { console.error(failed + " failure(s)"); process.exit(1); }
console.log("All live-reference-propagation checks passed.");
