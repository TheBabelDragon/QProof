/**
 * Browser evidence structure + integrity verification.
 * Integrity is independent of scientific status.
 */
(function (global) {
  "use strict";

  var REQUIRED = [
    "schema_version",
    "experiment_id",
    "status",
    "circuit",
    "execution",
    "results",
    "verification",
    "environment",
    "limitations",
    "integrity",
    "checks",
  ];
  var SUPPORTED_SCHEMA = { "1.0.0": true, "1.1.0": true };
  var STATUSES = { passed: true, failed: true, inconclusive: true };

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
          if (!ch || typeof ch !== "object") {
            errors.push("checks[" + c + "] must be an object");
            continue;
          }
          ["name", "status", "detail"].forEach(function (k) {
            if (!(k in ch)) errors.push("checks[" + c + "] missing " + k);
          });
          if (ch.status && !STATUSES[ch.status]) {
            errors.push("checks[" + c + "] invalid status: " + ch.status);
          }
        }
      }
    }
    return errors;
  }

  function verifyReportIntegrity(report) {
    var errors = validateStructure(report);
    var sci = report && report.status != null ? report.status : null;
    if (errors.length) {
      return Promise.resolve({
        ok: false,
        hash_verified: false,
        integrity: "failed",
        structure: "invalid",
        scientific_checks: sci,
        detail: errors.join("; "),
        client_side: true,
      });
    }
    var integrity = report.integrity || {};
    var declared = integrity.report_hash;
    var C = global.QProofCanonical;
    if (!declared) {
      return Promise.resolve({
        ok: false,
        hash_verified: false,
        integrity: "unverified",
        structure: "valid",
        scientific_checks: sci,
        detail:
          "structure valid; report_hash absent - integrity unverified (legacy or incomplete report)",
        client_side: true,
      });
    }
    if (!C) {
      return Promise.resolve({
        ok: false,
        hash_verified: false,
        integrity: "unverified",
        structure: "valid",
        scientific_checks: sci,
        detail: "QProofCanonical not loaded - cannot recompute hash",
        client_side: true,
      });
    }
    if (integrity.circuit_hash) {
      var ch = C.circuitHash(report.circuit);
      if (ch !== integrity.circuit_hash) {
        return Promise.resolve({
          ok: false,
          hash_verified: false,
          integrity: "failed",
          structure: "valid",
          scientific_checks: sci,
          detail: "circuit_hash mismatch",
          client_side: true,
        });
      }
    }
    var recomputed = C.reportHash(report);
    if (recomputed !== declared) {
      var canon =
        (report.integrity && report.integrity.canonicalization) ||
        "qproof-canonical-v1 (assumed)";
      return Promise.resolve({
        ok: false,
        hash_verified: false,
        integrity: "failed",
        structure: "valid",
        scientific_checks: sci,
        detail:
          "report_hash mismatch at verification stage using " +
          canon +
          "; declared " +
          declared +
          ", recomputed " +
          recomputed +
          " (report_hash field is excluded from the hash input; any other field change or non-canonical serialization will diverge)",
        declared_hash: declared,
        recomputed_hash: recomputed,
        canonicalization: canon,
        client_side: true,
      });
    }
    return Promise.resolve({
      ok: true,
      hash_verified: true,
      integrity: "verified",
      structure: "valid",
      scientific_checks: sci,
      detail:
        "structure valid; report_hash matches" +
        (integrity.circuit_hash ? "; circuit_hash matches" : ""),
      client_side: true,
    });
  }

  var api = { validateStructure: validateStructure, verifyReportIntegrity: verifyReportIntegrity };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.QProofEvidence = api;
})(typeof window !== "undefined" ? window : globalThis);
