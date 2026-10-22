/* QProof workbench — live reference verification end-to-end */
(function () {
  "use strict";

  const TEMPLATES = {
    hadamard: { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }], ref: "analytic-h" },
    bell: {
      n_qubits: 2,
      gates: [{ gate: "H", qubits: [0] }, { gate: "CNOT", qubits: [0, 1] }],
      ref: "analytic-bell",
    },
    "rx-pi": { n_qubits: 1, gates: [{ gate: "RX", qubits: [0], theta: Math.PI }], ref: null },
    phase: {
      n_qubits: 1,
      gates: [{ gate: "X", qubits: [0] }, { gate: "Z", qubits: [0] }],
      ref: null,
    },
  };

  let builder = { n_qubits: 1, gates: [] };
  let lastRun = null;
  let currentReport = null;
  let reportStale = false;

  const $ = (s) => document.querySelector(s);

  function setStatus(el, text, cls) {
    if (!el) return;
    el.textContent = text;
    el.className = "runner-status" + (cls ? " " + cls : "");
  }

  function depthOf(gates) {
    return window.QProofDepth ? QProofDepth.circuitDepth(gates) : gates.length;
  }

  function analyticRef(mode) {
    const s = 1 / Math.sqrt(2);
    if (mode === "analytic-bell") {
      return {
        id: "analytic/bell-v1",
        n_qubits: 2,
        circuit_gates: [{ gate: "H", qubits: [0] }, { gate: "CNOT", qubits: [0, 1] }],
        amps: [[s, 0], [0, 0], [0, 0], [s, 0]],
        probs: [0.5, 0, 0, 0.5],
      };
    }
    if (mode === "analytic-h") {
      return {
        id: "analytic/hadamard-v1",
        n_qubits: 1,
        circuit_gates: [{ gate: "H", qubits: [0] }],
        amps: [[s, 0], [s, 0]],
        probs: [0.5, 0.5],
      };
    }
    return null;
  }

  function circuitMatchesRef(spec, result, ref) {
    if (!ref) return { ok: false, reason: "no reference" };
    if (result.n_qubits !== ref.n_qubits) {
      return { ok: false, reason: "n_qubits mismatch (circuit=" + result.n_qubits + " ref=" + ref.n_qubits + ")" };
    }
    const gates = (spec && spec.gates) || [];
    if (gates.length !== ref.circuit_gates.length) {
      return { ok: false, reason: "gate_count mismatch (circuit=" + gates.length + " ref=" + ref.circuit_gates.length + ")" };
    }
    for (let i = 0; i < gates.length; i++) {
      let gn = String(gates[i].gate || "").toUpperCase();
      if (gn === "CX") gn = "CNOT";
      let en = String(ref.circuit_gates[i].gate || "").toUpperCase();
      if (en === "CX") en = "CNOT";
      if (gn !== en || JSON.stringify(gates[i].qubits) !== JSON.stringify(ref.circuit_gates[i].qubits)) {
        return { ok: false, reason: "gate mismatch at index " + i };
      }
    }
    return { ok: true, reason: "ok" };
  }

  /**
   * Single explicit reference-resolution path.
   * Returns { meta, preconditionReason, refId, error? }.
   * Expected values are independent of the circuit result.
   */
  function resolveSelectedReference(spec, result) {
    const mode = ($("#ref-mode") && $("#ref-mode").value) || "";
    const tol = parseFloat(($("#ref-tol") && $("#ref-tol").value) || "1e-10") || 1e-10;
    let expectedAmps = null;
    let expectedProbs = null;
    let refId = "none";
    let preconditionStatus = null;
    let preconditionReason = null;

    if (mode === "paste") {
      try {
        const raw = ($("#ref-amps") && $("#ref-amps").value) || "";
        expectedAmps = JSON.parse(raw);
        if (!Array.isArray(expectedAmps) || !expectedAmps.length) {
          return { error: "Paste reference must be a non-empty JSON array of [re, im] pairs" };
        }
        for (let i = 0; i < expectedAmps.length; i++) {
          const a = expectedAmps[i];
          if (!Array.isArray(a) || a.length !== 2 || !Number.isFinite(a[0]) || !Number.isFinite(a[1])) {
            return { error: "Paste reference entry " + i + " is not a finite [re, im] pair" };
          }
        }
        expectedProbs = expectedAmps.map(function (a) {
          return a[0] * a[0] + a[1] * a[1];
        });
        refId = "supplied/paste-v1";
        if (result && expectedAmps.length !== 1 << result.n_qubits) {
          preconditionStatus = "inconclusive";
          preconditionReason =
            "Paste reference dimension " + expectedAmps.length + " incompatible with circuit dim " + (1 << result.n_qubits);
          expectedAmps = null;
          expectedProbs = null;
        }
      } catch (e) {
        return { error: "Invalid amplitude JSON: " + (e && e.message ? e.message : e) };
      }
    } else if (mode && mode !== "none") {
      const ref = analyticRef(mode);
      if (!ref) {
        return { error: "Unknown reference mode: " + mode };
      }
      refId = ref.id;
      const match = circuitMatchesRef(spec, result, ref);
      if (!match.ok) {
        preconditionStatus = "inconclusive";
        preconditionReason = "Reference " + ref.id + " preconditions not met: " + match.reason;
      } else {
        // Independent expected values (not derived from result)
        expectedAmps = ref.amps.map(function (a) {
          return [a[0], a[1]];
        });
        expectedProbs = ref.probs.slice();
      }
    }

    const meta = {
      expected_amplitudes: expectedAmps,
      expected_probabilities: expectedProbs,
      reference_id: refId,
      tolerance: tol,
    };
    if (preconditionStatus) {
      meta.precondition_status = preconditionStatus;
      meta.precondition_reason = preconditionReason;
    }
    return { meta: meta, preconditionReason: preconditionReason, refId: refId };
  }

  function applyReport(report, note) {
    currentReport = report;
    reportStale = false;
    const badge = $("#badge-status");
    if (badge) {
      badge.textContent = String(report.status || "-").toUpperCase();
      badge.className =
        "badge " +
        (report.status === "passed" ? "pass" : report.status === "failed" ? "fail" : "inconclusive");
    }
    const raw = $("#evidence-raw");
    if (raw) raw.textContent = JSON.stringify(report, null, 2);
    const checks = $("#checks-list");
    if (checks && report.checks) {
      checks.innerHTML = report.checks
        .map(function (c) {
          return (
            '<div class="check-item ' +
            c.status +
            '"><strong>' +
            c.name +
            "</strong>: " +
            c.status.toUpperCase() +
            (c.detail ? " — " + c.detail : "") +
            "</div>"
          );
        })
        .join("");
    }
    setStatus($("#runner-status"), note || "", report.status === "failed" ? "error" : "ok");
  }

  function markStale(reason) {
    if (!lastRun && !currentReport) return;
    reportStale = true;
    setStatus(
      $("#claim-status"),
      "Configuration changed" + (reason ? " (" + reason + ")" : "") + " — re-run to refresh scientific checks.",
      ""
    );
  }

  function setReferenceMode(mode) {
    const el = $("#ref-mode");
    if (el) el.value = mode || "";
  }

  function getReferenceMode() {
    return ($("#ref-mode") && $("#ref-mode").value) || "";
  }

  /** Apply template and select/clear compatible analytic reference. */
  function applyTemplate(id) {
    const t = TEMPLATES[id];
    if (!t) return;
    builder = {
      n_qubits: t.n_qubits,
      gates: t.gates.map(function (g) {
        const o = { gate: g.gate, qubits: g.qubits.slice() };
        if (g.theta != null) o.theta = g.theta;
        return o;
      }),
    };
    if ($("#n-qubits")) $("#n-qubits").value = builder.n_qubits;
    if (t.ref) {
      setReferenceMode(t.ref);
      setStatus($("#claim-status"), "Compatible reference selected: " + t.ref, "ok");
    } else {
      setReferenceMode("");
      setStatus($("#claim-status"), "No analytic reference for this template — checks will be inconclusive.", "");
    }
    markStale("template");
    refreshBuilder();
  }

  function runLive() {
    if (!window.QProofSimulator) {
      setStatus($("#builder-status"), "Simulator not loaded", "error");
      return;
    }
    const spec = {
      format_version: "1.0.0",
      n_qubits: builder.n_qubits,
      gates: builder.gates.slice(),
      initial_state: { type: "zero" },
    };
    const v = QProofSimulator.validateCircuit(spec);
    if (!v.ok) {
      setStatus($("#builder-status"), "Invalid: " + v.errors.join("; "), "error");
      return;
    }
    const shots = parseInt(($("#run-shots") || {}).value, 10) || 0;
    const seed = parseInt(($("#run-seed") || {}).value, 10);
    try {
      const result = QProofSimulator.runCircuit(spec, {
        shots: shots,
        seed: Number.isFinite(seed) ? seed : 42,
      });
      result.depth = depthOf(spec.gates);
      const resolved = resolveSelectedReference(spec, result);
      if (resolved.error) {
        setStatus($("#builder-status"), resolved.error, "error");
        return;
      }
      const report = QProofSimulator.buildBrowserReport(
        spec,
        result,
        Object.assign({ experiment_id: "lab-" + Date.now() }, resolved.meta)
      );
      lastRun = { spec: spec, result: result, report: report, refId: resolved.refId, meta: resolved.meta };
      const note =
        resolved.refId === "none"
          ? "Simulation complete — no scientific claim evaluated."
          : resolved.preconditionReason ||
            "Live execution + automatic claim verification against " + resolved.refId;
      applyReport(report, note);
      setStatus(
        $("#builder-status"),
        "Executed \u00b7 " + result.runtime_ms + " ms \u00b7 ref=" + resolved.refId,
        "ok"
      );
      setStatus(
        $("#claim-status"),
        "Scientific checks: " + report.status.toUpperCase() +
          (resolved.preconditionReason ? " — " + resolved.preconditionReason : ""),
        report.status === "passed" ? "ok" : report.status === "failed" ? "error" : ""
      );
      if (window.QProofEvidence && report.integrity && report.integrity.report_hash) {
        QProofEvidence.verifyReportIntegrity(report).then(function (r) {
          setStatus(
            $("#integrity-status"),
            (r.integrity || "unverified") + ": " + r.detail,
            r.hash_verified ? "ok" : ""
          );
        });
      }
    } catch (err) {
      setStatus($("#builder-status"), String(err.message || err), "error");
    }
  }

  function verifyClaim() {
    if (!lastRun) {
      setStatus($("#claim-status"), "Run a circuit in the Lab first.", "error");
      return;
    }
    const resolved = resolveSelectedReference(lastRun.spec, lastRun.result);
    if (resolved.error) {
      setStatus($("#claim-status"), resolved.error, "error");
      return;
    }
    const report = QProofSimulator.buildBrowserReport(
      lastRun.spec,
      lastRun.result,
      Object.assign(
        { experiment_id: (lastRun.report && lastRun.report.experiment_id) || "lab-verify" },
        resolved.meta
      )
    );
    lastRun.report = report;
    lastRun.refId = resolved.refId;
    lastRun.meta = resolved.meta;
    applyReport(
      report,
      resolved.preconditionReason || "Claim verification against " + resolved.refId
    );
    setStatus(
      $("#claim-status"),
      "Scientific checks: " + report.status.toUpperCase() +
        (resolved.preconditionReason ? " — " + resolved.preconditionReason : ""),
      report.status === "passed" ? "ok" : report.status === "failed" ? "error" : ""
    );
  }

  function refreshBuilder() {
    builder.n_qubits = parseInt(($("#n-qubits") || {}).value, 10) || 1;
    const host = $("#gate-list");
    if (host) {
      host.innerHTML = builder.gates.length
        ? builder.gates
            .map(function (g, i) {
              return (
                '<div class="gate-list-item"><span class="mono">' +
                (i + 1) +
                ". " +
                g.gate +
                " [" +
                g.qubits.join(",") +
                "]</span></div>"
              );
            })
            .join("")
        : '<p class="muted">Empty circuit — load a template (Hadamard/Bell) to auto-select a compatible reference.</p>';
    }
  }

  function wire(id, fn) {
    const el = $("#" + id);
    if (el) el.addEventListener("click", fn);
  }

  wire("btn-run-live", runLive);
  wire("btn-verify-claim", verifyClaim);
  wire("btn-blank", function () {
    builder = { n_qubits: parseInt(($("#n-qubits") || {}).value, 10) || 1, gates: [] };
    setReferenceMode("");
    markStale("blank");
    refreshBuilder();
  });
  wire("btn-apply-template", function () {
    const id = ($("#template-select") || {}).value;
    if (id) applyTemplate(id);
  });
  wire("btn-add-gate", function () {
    const name = (($("#gate-pick") || {}).value || "H").toUpperCase();
    const qs = (($("#gate-qubits") || {}).value || "0")
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(function (x) {
        return parseInt(x, 10);
      });
    const entry = { gate: name, qubits: qs };
    if (name === "RX" || name === "RY" || name === "RZ") {
      entry.theta = parseFloat(($("#gate-theta") || {}).value);
    }
    builder.gates.push(entry);
    markStale("gate");
    refreshBuilder();
  });
  wire("btn-verify-integrity", function () {
    if (!currentReport || !window.QProofEvidence) return;
    QProofEvidence.verifyReportIntegrity(currentReport).then(function (r) {
      setStatus(
        $("#integrity-status"),
        (r.integrity || "unverified") + ": " + r.detail,
        r.hash_verified ? "ok" : "error"
      );
    });
  });
  wire("btn-use-last", function () {
    if (lastRun) applyReport(lastRun.report, "Last live report");
  });
  wire("btn-export-report", function () {
    if (!currentReport) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(currentReport, null, 2)], { type: "application/json" })
    );
    a.download = (currentReport.experiment_id || "evidence") + ".json";
    a.click();
  });

  if ($("#ref-mode")) {
    $("#ref-mode").addEventListener("change", function () {
      markStale("reference");
    });
  }
  if ($("#n-qubits")) {
    $("#n-qubits").addEventListener("change", function () {
      markStale("qubits");
      refreshBuilder();
    });
  }

  // Useful initial workflow: Hadamard template + compatible analytic reference
  applyTemplate("hadamard");
  if ($("#template-select")) $("#template-select").value = "hadamard";

  // Export for tests
  window.QProofApp = {
    resolveSelectedReference: resolveSelectedReference,
    analyticRef: analyticRef,
    circuitMatchesRef: circuitMatchesRef,
    applyTemplate: applyTemplate,
    TEMPLATES: TEMPLATES,
  };
})();
