/**
 * Client evidence checks using QProofCanonical (matches Python).
 * Missing report_hash => integrity unverified (never PASS).
 */
(function (global) {
  "use strict";
  var SUPPORTED_SCHEMA = { "1.0.0": 1, "1.1.0": 1 };
  var REQUIRED = ["schema_version","experiment_id","status","checks","circuit","execution","results","verification"];
  var STATUSES = { passed: 1, failed: 1, inconclusive: 1 };

  function validateStructure(report) {
    var errors = [];
    if (!report || typeof report !== "object") return ["report must be a JSON object"];
    for (var i = 0; i < REQUIRED.length; i++) {
      if (!(REQUIRED[i] in report)) errors.push("missing required field: " + REQUIRED[i]);
    }
    if (report.schema_version && !SUPPORTED_SCHEMA[report.schema_version]) {
      errors.push("unsupported schema_version: " + report.schema_version);
    }
    if (report.status && !STATUSES[report.status]) errors.push("invalid status: " + report.status);
    if (report.checks != null) {
      if (!Array.isArray(report.checks)) errors.push("checks must be an array");
      else {
        for (var c = 0; c < report.checks.length; c++) {
          var ch = report.checks[c];
          if (!ch || typeof ch !== "object") { errors.push("checks[" + c + "] must be an object"); continue; }
          ["name","status","detail"].forEach(function (k) {
            if (!(k in ch)) errors.push("checks[" + c + "] missing " + k);
          });
          if (ch.status && !STATUSES[ch.status]) errors.push("checks[" + c + "] invalid status");
        }
      }
    }
    if (report.circuit && typeof report.circuit === "object") {
      if (!("n_qubits" in report.circuit)) errors.push("circuit.n_qubits missing");
      if (!("spec" in report.circuit)) errors.push("circuit.spec missing");
    }
    return errors;
  }

  function verifyReportIntegrity(report) {
    var errors = validateStructure(report);
    if (errors.length) {
      return Promise.resolve({ ok: false, hash_verified: false, integrity: "failed", structure: "invalid", detail: errors.join("; "), client_side: true });
    }
    var integrity = report.integrity || {};
    var declared = integrity.report_hash;
    var C = global.QProofCanonical;
    if (!declared) {
      return Promise.resolve({ ok: false, hash_verified: false, integrity: "unverified", structure: "valid",
        detail: "structure valid; report_hash absent - integrity unverified (legacy or incomplete)", client_side: true });
    }
    if (!C) {
      return Promise.resolve({ ok: false, hash_verified: false, integrity: "unverified", structure: "valid",
        detail: "QProofCanonical not loaded - cannot recompute hash", client_side: true });
    }
    if (integrity.circuit_hash) {
      var ch = C.circuitHash(report.circuit);
      if (ch !== integrity.circuit_hash) {
        return Promise.resolve({ ok: false, hash_verified: false, integrity: "failed", structure: "valid", detail: "circuit_hash mismatch", client_side: true });
      }
    }
    var recomputed = C.reportHash(report);
    if (recomputed !== declared) {
      return Promise.resolve({ ok: false, hash_verified: false, integrity: "failed", structure: "valid",
        detail: "report_hash mismatch: declared " + declared + ", recomputed " + recomputed, client_side: true });
    }
    return Promise.resolve({ ok: true, hash_verified: true, integrity: "verified", structure: "valid",
      detail: "structure valid; report_hash matches", client_side: true });
  }

  var api = { validateStructure: validateStructure, verifyReportIntegrity: verifyReportIntegrity };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.QProofEvidence = api;
})(typeof window !== "undefined" ? window : globalThis);
