/**
 * Client-side evidence structure + integrity checks.
 * Missing report_hash ⇒ structure may be ok, but NOT hash-verified.
 */
(function (global) {
  "use strict";

  var SUPPORTED_SCHEMA = { "1.0.0": 1, "1.1.0": 1 };
  var REQUIRED = [
    "schema_version",
    "experiment_id",
    "status",
    "checks",
    "circuit",
    "execution",
    "results",
    "verification",
  ];
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
    if (report.status && !STATUSES[report.status]) {
      errors.push("invalid status: " + report.status);
    }
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
            errors.push("checks[" + c + "] invalid status");
          }
        }
      }
    }
    if (report.circuit && typeof report.circuit === "object") {
      if (!("n_qubits" in report.circuit)) errors.push("circuit.n_qubits missing");
      if (!("spec" in report.circuit)) errors.push("circuit.spec missing");
    }
    return errors;
  }

  function sortKeysDeep(v) {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(sortKeysDeep);
    var keys = Object.keys(v).sort();
    var out = {};
    for (var i = 0; i < keys.length; i++) out[keys[i]] = sortKeysDeep(v[keys[i]]);
    return out;
  }

  function canonicalStringify(obj) {
    return JSON.stringify(sortKeysDeep(obj));
  }

  function sha256Hex(str) {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)).then(function (buf) {
        return Array.from(new Uint8Array(buf))
          .map(function (b) {
            return b.toString(16).padStart(2, "0");
          })
          .join("");
      });
    }
    return Promise.reject(new Error("SubtleCrypto unavailable"));
  }

  function verifyReportIntegrity(report) {
    var errors = validateStructure(report);
    if (errors.length) {
      return Promise.resolve({
        ok: false,
        hash_verified: false,
        integrity: "n/a",
        detail: errors.join("; "),
        structure_errors: errors,
        client_side: true,
      });
    }
    var integrity = report.integrity || {};
    var declared = integrity.report_hash;
    if (!declared) {
      return Promise.resolve({
        ok: false,
        hash_verified: false,
        integrity: "absent",
        detail:
          "structure valid; report_hash absent — cannot claim integrity verification",
        structure_errors: [],
        client_side: true,
      });
    }
    var body = JSON.parse(JSON.stringify(report));
    if (!body.integrity) body.integrity = {};
    body.integrity.report_hash = null;
    return sha256Hex(canonicalStringify(body)).then(function (hex) {
      var recomputed = "sha256:" + hex;
      if (recomputed !== declared) {
        return {
          ok: false,
          hash_verified: false,
          integrity: "mismatch",
          detail:
            "report_hash mismatch: declared " + declared + ", recomputed " + recomputed,
          structure_errors: [],
          client_side: true,
        };
      }
      return {
        ok: true,
        hash_verified: true,
        integrity: "verified",
        detail: "structure valid; report_hash matches",
        structure_errors: [],
        client_side: true,
      };
    });
  }

  var api = {
    validateStructure: validateStructure,
    verifyReportIntegrity: verifyReportIntegrity,
    canonicalStringify: canonicalStringify,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.QProofEvidence = api;
})(typeof window !== "undefined" ? window : globalThis);
