/**
 * Post-load hook: attach canonical hashes to browser reports.
 * Load after simulator.js and canonical_hash.js.
 */
(function (global) {
  "use strict";
  var S = global.QProofSimulator;
  var C = global.QProofCanonical;
  if (!S || !C || !S.buildBrowserReport) return;
  var orig = S.buildBrowserReport;
  S.buildBrowserReport = function (spec, result, meta) {
    var report = orig(spec, result, meta);
    if (!report.integrity) report.integrity = {};
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
      report.integrity.report_hash = C.reportHash(report);
    } catch (e) {
      report.integrity.report_hash = null;
      report.integrity.hash_error = String(e && e.message ? e.message : e);
    }
    return report;
  };
})(typeof window !== "undefined" ? window : globalThis);
