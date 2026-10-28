/**
 * Wire independent browser oracle into QProofApp.resolveSelectedReference.
 * Load after app.js and oracle.js. Does not modify production simulator evolution.
 */
(function (global) {
  "use strict";
  if (global.__qproof_oracle_wire) return;
  global.__qproof_oracle_wire = true;

  function install() {
    var App = global.QProofApp;
    var O = global.QProofOracle;
    if (!App || !O || typeof App.resolveSelectedReference !== "function") {
      return false;
    }
    if (App.__oracle_wired) return true;
    var orig = App.resolveSelectedReference.bind(App);

    App.resolveSelectedReference = function (spec, result) {
      var $ = function (s) {
        return document.querySelector(s);
      };
      var mode = ($("#ref-mode") && $("#ref-mode").value) || "";
      var resolved = orig(spec, result);
      if (resolved && resolved.error) return resolved;

      var hasExp =
        resolved &&
        resolved.meta &&
        resolved.meta.has_expected_amplitudes &&
        resolved.meta.expected_amplitudes &&
        resolved.meta.expected_amplitudes.length;

      var wantOracle = mode === "oracle" || mode === "" || mode === "none" || !mode;
      if (hasExp && mode !== "oracle") {
        return resolved;
      }
      if (!wantOracle && hasExp) {
        return resolved;
      }

      try {
        var initEl = document.querySelector("#run-init");
        var initIdx = initEl ? parseInt(initEl.value, 10) || 0 : 0;
        var exp = O.expectedState(spec, { initialIndex: initIdx });
        resolved.meta = resolved.meta || {};
        resolved.meta.expected_amplitudes = exp.amplitudes;
        resolved.meta.expected_probabilities = exp.probabilities;
        resolved.meta.reference_id = exp.oracle_id || O.ORACLE_ID;
        resolved.meta.has_expected_amplitudes = true;
        resolved.meta.has_expected_probabilities = true;
        resolved.meta.reference_inferred = !mode || mode === "" || mode === "none";
        resolved.meta.tolerance =
          resolved.meta.tolerance != null ? resolved.meta.tolerance : 1e-10;
        delete resolved.meta.precondition_status;
        delete resolved.meta.precondition_reason;
        resolved.refId = resolved.meta.reference_id;
        resolved.preconditionReason = null;
        resolved.inferred = resolved.meta.reference_inferred;
      } catch (e) {
        return {
          error: "Oracle reference failed: " + (e && e.message ? e.message : e),
        };
      }
      return resolved;
    };

    App.__oracle_wired = true;
    return true;
  }

  function tryInstall() {
    if (install()) return;
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
          setTimeout(install, 0);
        });
      } else {
        setTimeout(install, 0);
      }
    }
  }

  tryInstall();
})(typeof window !== "undefined" ? window : globalThis);
