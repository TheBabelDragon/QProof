/**
 * Client-side evidence structure + integrity checks.
 * Mirrors Python qproof.evidence canonical hash rules (sort_keys, separators).
 * Not a trust boundary against a malicious client — use Python CLI for independent verification.
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
    if (!report || typeof report !== "object") {
      return ["report must be a JSON object"];
    }
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
          if (!("name" in ch)) errors.push("checks[" + c + "] missing name");
          if (!("status" in ch)) errors.push("checks[" + c + "] missing status");
          if (!("detail" in ch)) errors.push("checks[" + c + "] missing detail");
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
    // Overall status consistency with checks
    if (Array.isArray(report.checks) && report.status) {
      var anyFail = report.checks.some(function (x) {
        return x.status === "failed";
      });
      var anyInc = report.checks.some(function (x) {
        return x.status === "inconclusive";
      });
      var expected = "passed";
      if (anyFail) expected = "failed";
      else if (anyInc || !report.checks.length) expected = "inconclusive";
      if (report.status !== expected && report.checks.length) {
        // soft: record but do not force fail of structure-only path
        errors.push(
          "status inconsistent with checks: declared " +
            report.status +
            ", aggregate would be " +
            expected
        );
      }
    }
    return errors;
  }

  /** Canonical JSON matching Python: sort_keys=True, separators=(',', ':') */
  function canonicalStringify(obj) {
    return JSON.stringify(sortKeysDeep(obj));
  }

  function sortKeysDeep(v) {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(sortKeysDeep);
    var keys = Object.keys(v).sort();
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = sortKeysDeep(v[keys[i]]);
    }
    return out;
  }

  function sha256Hex(str) {
    // Synchronous path requires SubtleCrypto async — provide both.
    if (typeof crypto !== "undefined" && crypto.subtle) {
      return crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(str))
        .then(function (buf) {
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
    // Status-consistency errors are informational for integrity path;
    // treat structural required-field / schema / invalid status as hard fail.
    var hard = errors.filter(function (e) {
      return e.indexOf("status inconsistent") !== 0;
    });
    if (hard.length) {
      return Promise.resolve({
        ok: false,
        detail: hard.join("; "),
        structure_errors: errors,
        client_side: true,
      });
    }
    var integrity = report.integrity || {};
    var declared = integrity.report_hash;
    if (!declared) {
      return Promise.resolve({
        ok: true,
        detail:
          "structure valid; no report_hash to recompute" +
          (errors.length ? " (" + errors.join("; ") + ")" : ""),
        structure_errors: errors,
        client_side: true,
      });
    }
    var body = JSON.parse(JSON.stringify(report));
    if (!body.integrity) body.integrity = {};
    body.integrity.report_hash = null;
    var canon = canonicalStringify(body);
    // Python uses separators without spaces — JSON.stringify of sorted object is space-free for defaults
    return sha256Hex(canon).then(function (hex) {
      var recomputed = "sha256:" + hex;
      if (recomputed !== declared) {
        return {
          ok: false,
          detail:
            "report_hash mismatch: declared " +
            declared +
            ", recomputed " +
            recomputed,
          structure_errors: errors,
          client_side: true,
        };
      }
      return {
        ok: true,
        detail:
          "structure valid; report_hash matches" +
          (errors.length ? " (" + errors.join("; ") + ")" : ""),
        structure_errors: errors,
        client_side: true,
      };
    });
  }

  var api = {
    validateStructure: validateStructure,
    verifyReportIntegrity: verifyReportIntegrity,
    canonicalStringify: canonicalStringify,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.QProofEvidence = api;
})(typeof window !== "undefined" ? window : globalThis);
