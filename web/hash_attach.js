/**
 * Compatibility shim: buildBrowserReport already finalizes hashes via
 * QProofSimulator.finalizeReport when QProofCanonical is available.
 * Re-run finalization only if hashes are still missing (load-order edge case).
 */
(function (global) {
  "use strict";
  var S = global.QProofSimulator;
  var C = global.QProofCanonical;
  if (!S || !C || !S.buildBrowserReport) return;
  if (S.__qproof_hash_shim) return;
  S.__qproof_hash_shim = true;
  var orig = S.buildBrowserReport;
  S.buildBrowserReport = function (spec, result, meta) {
    var report = orig(spec, result, meta);
    if (
      report &&
      report.integrity &&
      !report.integrity.report_hash &&
      typeof S.finalizeReport === "function"
    ) {
      return S.finalizeReport(report);
    }
    return report;
  };
})(typeof window !== "undefined" ? window : globalThis);
