/**
 * QProof claims patch — structured comparisons + integrity finalization.
 * Load after simulator.js (and preferably after canonical_hash.js).
 */
(function (global) {
  "use strict";
  var S = global.QProofSimulator;
  if (!S || S.__qproof_claims_patch) return;
  S.__qproof_claims_patch = true;

  function c(re, im) { return [re || 0, im || 0]; }
  function cadd(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function cabs2(a) { return a[0] * a[0] + a[1] * a[1]; }
  var AMP_TOL = 1e-10;

  function _isComplexPair(v) {
    return (
      Array.isArray(v) &&
      v.length === 2 &&
      Number.isFinite(v[0]) &&
      Number.isFinite(v[1])
    );
  }

  function _validateStateVector(vec, expectedDim, label) {
    if (!Array.isArray(vec)) {
      return { ok: false, reason: label + " is not an array" };
    }
    if (expectedDim != null && vec.length !== expectedDim) {
      return {
        ok: false,
        reason:
          label +
          " dimension " +
          vec.length +
          " != expected " +
          expectedDim,
      };
    }
    for (var i = 0; i < vec.length; i++) {
      if (!_isComplexPair(vec[i])) {
        return {
          ok: false,
          reason: label + "[" + i + "] is not a finite complex pair [re,im]",
        };
      }
    }
    var norm = 0;
    for (var j = 0; j < vec.length; j++) {
      norm += cabs2(vec[j]);
    }
    if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-6) {
      return {
        ok: false,
        reason: label + " not normalized (||psi||^2=" + norm + ")",
        norm: norm,
      };
    }
    return { ok: true, norm: norm };
  }

  function _validateProbabilityVector(vec, expectedDim, label) {
    if (!Array.isArray(vec)) {
      return { ok: false, reason: label + " is not an array" };
    }
    if (expectedDim != null && vec.length !== expectedDim) {
      return {
        ok: false,
        reason:
          label +
          " dimension " +
          vec.length +
          " != expected " +
          expectedDim,
      };
    }
    var sum = 0;
    for (var i = 0; i < vec.length; i++) {
      if (!Number.isFinite(vec[i]) || vec[i] < 0) {
        return {
          ok: false,
          reason: label + "[" + i + "] is not a finite non-negative probability",
        };
      }
      sum += vec[i];
    }
    if (!Number.isFinite(sum) || Math.abs(sum - 1) > 1e-6) {
      return {
        ok: false,
        reason: label + " does not sum to 1 (sum=" + sum + ")",
        sum: sum,
      };
    }
    return { ok: true, sum: sum };
  }

  function asciiNormalize(obj) {
    if (obj == null) return obj;
    if (typeof obj === "string") {
      return obj
        .replace(/\u2014/g, "-")
        .replace(/\u2013/g, "-")
        .replace(/\u2018|\u2019/g, "'")
        .replace(/\u201c|\u201d/g, '"');
    }
    if (Array.isArray(obj)) {
      return obj.map(asciiNormalize);
    }
    if (typeof obj === "object") {
      var out = {};
      Object.keys(obj).forEach(function (k) {
        out[k] = asciiNormalize(obj[k]);
      });
      return out;
    }
    return obj;
  }

  function compareAmplitudes(obs, exp, tol) {
    tol = tol != null ? tol : AMP_TOL;
    if (!Array.isArray(obs) || !Array.isArray(exp)) {
      return {
        status: "inconclusive",
        reason: "amplitude vectors missing or not arrays",
        value: null,
        expected: null,
        tolerance: tol,
      };
    }
    if (obs.length !== exp.length) {
      return {
        status: "inconclusive",
        reason:
          "incompatible dimensions: observed=" +
          obs.length +
          " expected=" +
          exp.length,
        value: null,
        expected: null,
        tolerance: tol,
      };
    }
    var vo = _validateStateVector(obs, obs.length, "observed");
    if (!vo.ok) {
      return {
        status: "inconclusive",
        reason: vo.reason,
        value: null,
        expected: null,
        tolerance: tol,
      };
    }
    var ve = _validateStateVector(exp, exp.length, "expected");
    if (!ve.ok) {
      return {
        status: "inconclusive",
        reason: ve.reason,
        value: null,
        expected: null,
        tolerance: tol,
      };
    }
    var dot = c(0);
    for (var i = 0; i < obs.length; i++) {
      var e = exp[i];
      var o = obs[i];
      dot = cadd(dot, [e[0] * o[0] + e[1] * o[1], e[0] * o[1] - e[1] * o[0]]);
    }
    var phase = Math.atan2(dot[1], dot[0]);
    var cos = Math.cos(phase);
    var sin = Math.sin(phase);
    var maxd = 0;
    for (var j = 0; j < obs.length; j++) {
      var ee = exp[j];
      var re = cos * ee[0] - sin * ee[1];
      var im = sin * ee[0] + cos * ee[1];
      var dr = obs[j][0] - re;
      var di = obs[j][1] - im;
      maxd = Math.max(maxd, Math.sqrt(dr * dr + di * di));
    }
    return {
      status: maxd <= tol ? "passed" : "failed",
      reason: maxd <= tol ? "within tolerance" : "exceeds tolerance",
      value: maxd,
      expected: 0,
      tolerance: tol,
    };
  }

  function compareFidelity(a, b, tol) {
    tol = tol != null ? tol : AMP_TOL;
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return {
        status: "inconclusive",
        reason: "state vectors missing or not arrays",
        value: null,
        expected: null,
        tolerance: tol,
      };
    }
    if (a.length !== b.length) {
      return {
        status: "inconclusive",
        reason:
          "incompatible dimensions: observed=" +
          a.length +
          " expected=" +
          b.length,
        value: null,
        expected: null,
        tolerance: tol,
      };
    }
    var va = _validateStateVector(a, a.length, "observed");
    if (!va.ok) {
      return { status: "inconclusive", reason: va.reason, value: null, expected: null, tolerance: tol };
    }
    var vb = _validateStateVector(b, b.length, "expected");
    if (!vb.ok) {
      return { status: "inconclusive", reason: vb.reason, value: null, expected: null, tolerance: tol };
    }
    var dot = c(0);
    for (var i = 0; i < a.length; i++) {
      var x = a[i];
      var y = b[i];
      dot = cadd(dot, [x[0] * y[0] + x[1] * y[1], x[0] * y[1] - x[1] * y[0]]);
    }
    var F = cabs2(dot);
    return {
      status: Math.abs(F - 1) <= tol ? "passed" : "failed",
      reason: Math.abs(F - 1) <= tol ? "within tolerance" : "below tolerance",
      value: F,
      expected: 1,
      tolerance: tol,
    };
  }

  function compareProbabilities(obs, exp, tol) {
    tol = tol != null ? tol : AMP_TOL;
    if (!Array.isArray(obs) || !Array.isArray(exp)) {
      return {
        status: "inconclusive",
        reason: "probability vectors missing or not arrays",
        value: null,
        expected: null,
        tolerance: tol,
      };
    }
    if (obs.length !== exp.length) {
      return {
        status: "inconclusive",
        reason:
          "incompatible dimensions: observed=" +
          obs.length +
          " expected=" +
          exp.length,
        value: null,
        expected: null,
        tolerance: tol,
      };
    }
    var vo = _validateProbabilityVector(obs, obs.length, "observed_probs");
    if (!vo.ok) {
      return { status: "inconclusive", reason: vo.reason, value: null, expected: null, tolerance: tol };
    }
    var ve = _validateProbabilityVector(exp, exp.length, "expected_probs");
    if (!ve.ok) {
      return { status: "inconclusive", reason: ve.reason, value: null, expected: null, tolerance: tol };
    }
    var maxd = 0;
    for (var i = 0; i < obs.length; i++) {
      maxd = Math.max(maxd, Math.abs(obs[i] - exp[i]));
    }
    return {
      status: maxd <= tol ? "passed" : "failed",
      reason: maxd <= tol ? "within tolerance" : "exceeds tolerance",
      value: maxd,
      expected: 0,
      tolerance: tol,
    };
  }

  function finalizeReport(report) {
    report = asciiNormalize(report);
    if (!report.integrity || typeof report.integrity !== "object") {
      report.integrity = {};
    }
    report.integrity.canonicalization = "qproof-canonical-v1";
    report.integrity.report_hash = null;
    var C = global.QProofCanonical;
    if (!C || typeof C.circuitHash !== "function" || typeof C.reportHash !== "function") {
      report.integrity.circuit_hash = null;
      report.integrity.input_hash = null;
      report.integrity.report_hash = null;
      report.integrity.hash_error =
        "QProofCanonical not loaded - cannot compute integrity hashes";
      return report;
    }
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
      delete report.integrity.hash_error;
    } catch (e) {
      report.integrity.report_hash = null;
      report.integrity.circuit_hash = report.integrity.circuit_hash || null;
      report.integrity.hash_error = String(e && e.message ? e.message : e);
    }
    return report;
  }

  var origBuild = S.buildBrowserReport.bind(S);

  S.compareAmplitudes = compareAmplitudes;
  S.compareFidelity = compareFidelity;
  S.compareProbabilities = compareProbabilities;
  S.finalizeReport = finalizeReport;

  S.buildBrowserReport = function (spec, result, meta) {
    meta = meta || {};
    var report = origBuild(spec, result, meta);
    var expectedAmps = meta.expected_amplitudes || null;
    var expectedProbs = meta.expected_probabilities || null;
    var tol = meta.tolerance != null ? meta.tolerance : AMP_TOL;
    var amps = result.amplitudes;
    var probs = result.probabilities;

    var checks = (report.checks || []).filter(function (ch) {
      return ch.name !== "amplitudes" && ch.name !== "fidelity" && ch.name !== "probabilities";
    });
    var fidValue = null;

    if (expectedAmps) {
      var ad = compareAmplitudes(amps, expectedAmps, tol);
      checks.push({
        name: "amplitudes",
        status: ad.status,
        detail: ad.reason + (ad.value != null ? " max_err=" + ad.value : ""),
        observed: ad.value,
        expected: ad.expected,
        tolerance: ad.tolerance,
      });
      var fid = compareFidelity(amps, expectedAmps, tol);
      fidValue = fid.value;
      checks.push({
        name: "fidelity",
        status: fid.status,
        detail: fid.reason + (fid.value != null ? " F=" + fid.value : ""),
        observed: fid.value,
        expected: fid.expected,
        tolerance: fid.tolerance,
      });
    } else {
      checks.push({ name: "amplitudes", status: "inconclusive", detail: "no independent expected amplitudes supplied" });
      checks.push({ name: "fidelity", status: "inconclusive", detail: "no independent expected amplitudes supplied" });
    }

    if (expectedProbs) {
      var pd = compareProbabilities(probs, expectedProbs, tol);
      checks.push({
        name: "probabilities",
        status: pd.status,
        detail: pd.reason + (pd.value != null ? " max_err=" + pd.value : ""),
        observed: pd.value,
        expected: pd.expected,
        tolerance: pd.tolerance,
      });
    } else {
      checks.push({ name: "probabilities", status: "inconclusive", detail: "no independent expected probabilities supplied" });
    }

    if (meta.precondition_status === "inconclusive") {
      report.status = "inconclusive";
      report.checks = checks;
      if (report.results) {
        report.results.expected_amplitudes = expectedAmps;
        report.results.expected_probabilities = expectedProbs;
        report.results.fidelity = fidValue;
      }
      if (report.verification) {
        report.verification.reference_id = meta.reference_id || report.verification.reference_id || "none";
      }
      return finalizeReport(report);
    }

    var failed = checks.some(function (ch) { return ch.status === "failed"; });
    var inconclusive = checks.some(function (ch) { return ch.status === "inconclusive"; });
    report.status = failed ? "failed" : inconclusive ? "inconclusive" : "passed";
    report.checks = checks;
    if (report.results) {
      report.results.expected_amplitudes = expectedAmps;
      report.results.expected_probabilities = expectedProbs;
      report.results.fidelity = fidValue;
    }
    if (report.verification) {
      report.verification.reference_id = meta.reference_id || report.verification.reference_id || "none";
    }
    return finalizeReport(report);
  };
})(typeof window !== "undefined" ? window : globalThis);
