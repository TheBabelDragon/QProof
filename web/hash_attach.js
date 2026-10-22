/**
 * Post-load hook: attach canonical hashes to browser reports.
 * ASCII-normalizes em/en-dashes so JS and Python canonical dumps match.
 * Must load after simulator.js and canonical_hash.js.
 */
(function (global) {
  "use strict";
  var S = global.QProofSimulator;
  var C = global.QProofCanonical;
  if (!S || !C || !S.buildBrowserReport) return;

  function asciiNormalize(obj) {
    if (typeof obj === "string") {
      return obj
        .replace(/\u2014/g, "-")
        .replace(/\u2013/g, "-")
        .replace(/\u2212/g, "-");
    }
    if (Array.isArray(obj)) return obj.map(asciiNormalize);
    if (obj && typeof obj === "object") {
      var out = {};
      Object.keys(obj).forEach(function (k) {
        out[k] = asciiNormalize(obj[k]);
      });
      return out;
    }
    return obj;
  }

  var orig = S.buildBrowserReport;
  S.buildBrowserReport = function (spec, result, meta) {
    var report = asciiNormalize(orig(spec, result, meta));
    if (!report.integrity || typeof report.integrity !== "object") {
      report.integrity = {};
    }
    report.integrity.canonicalization = "qproof-canonical-v1";
    try {
      report.integrity.circuit_hash = C.circuitHash(report.circuit);
      report.integrity.input_hash = C.canonicalHash({
        experiment_id: report.experiment_id,
        circuit: report.circuit.spec,
        shots: report.execution.shots,
        seed: report.execution.seed,
        tolerances: report.verification.tolerances,
      });
      // report_hash last: body must be final (report_hash field null during hash)
      report.integrity.report_hash = C.reportHash(report);
    } catch (e) {
      report.integrity.report_hash = null;
      report.integrity.circuit_hash = report.integrity.circuit_hash || null;
      report.integrity.hash_error = String(e && e.message ? e.message : e);
    }
    return report;
  };
})(typeof window !== "undefined" ? window : globalThis);
