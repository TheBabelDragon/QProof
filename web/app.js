/* QProof workbench - automatic claim verification on Run */
(function () {
  "use strict";
  const TEMPLATES = {
    hadamard: { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] },
    bell: { n_qubits: 2, gates: [{ gate: "H", qubits: [0] }, { gate: "CNOT", qubits: [0, 1] }] },
  };
  let builder = { n_qubits: 1, gates: [] };
  let lastRun = null;
  let currentReport = null;
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
    if (mode === "analytic-bell")
      return { id: "analytic/bell-v1", n_qubits: 2, circuit_gates: [{ gate: "H", qubits: [0] }, { gate: "CNOT", qubits: [0, 1] }], amps: [[s, 0], [0, 0], [0, 0], [s, 0]], probs: [0.5, 0, 0, 0.5] };
    if (mode === "analytic-h")
      return { id: "analytic/hadamard-v1", n_qubits: 1, circuit_gates: [{ gate: "H", qubits: [0] }], amps: [[s, 0], [s, 0]], probs: [0.5, 0.5] };
    return null;
  }
  function circuitMatchesRef(spec, result, ref) {
    if (!ref) return { ok: false, reason: "no reference" };
    if (result.n_qubits !== ref.n_qubits) return { ok: false, reason: "n_qubits mismatch" };
    const gates = (spec && spec.gates) || [];
    if (gates.length !== ref.circuit_gates.length) return { ok: false, reason: "gate_count mismatch" };
    for (let i = 0; i < gates.length; i++) {
      let gn = String(gates[i].gate || "").toUpperCase(); if (gn === "CX") gn = "CNOT";
      let en = String(ref.circuit_gates[i].gate || "").toUpperCase(); if (en === "CX") en = "CNOT";
      if (gn !== en || JSON.stringify(gates[i].qubits) !== JSON.stringify(ref.circuit_gates[i].qubits))
        return { ok: false, reason: "gate mismatch at " + i };
    }
    return { ok: true, reason: "ok" };
  }
  function resolveSelectedReference(spec, result) {
    const mode = ($("#ref-mode") && $("#ref-mode").value) || "";
    const tol = parseFloat(($("#ref-tol") && $("#ref-tol").value) || "1e-10") || 1e-10;
    let expectedAmps = null, expectedProbs = null, refId = "none";
    let preconditionStatus = null, preconditionReason = null;
    if (mode === "paste") {
      try {
        expectedAmps = JSON.parse($("#ref-amps").value);
        expectedProbs = expectedAmps.map((a) => a[0] * a[0] + a[1] * a[1]);
        refId = "supplied/paste-v1";
      } catch (e) { return { error: "Invalid amplitude JSON" }; }
    } else if (mode && mode !== "none") {
      const ref = analyticRef(mode);
      if (ref) {
        refId = ref.id;
        const match = circuitMatchesRef(spec, result, ref);
        if (!match.ok) {
          preconditionStatus = "inconclusive";
          preconditionReason = "Reference " + ref.id + " preconditions not met: " + match.reason;
        } else { expectedAmps = ref.amps; expectedProbs = ref.probs; }
      }
    }
    const meta = { expected_amplitudes: expectedAmps, expected_probabilities: expectedProbs, reference_id: refId, tolerance: tol };
    if (preconditionStatus) { meta.precondition_status = preconditionStatus; meta.precondition_reason = preconditionReason; }
    return { meta, preconditionReason, refId };
  }
  function applyReport(report, note) {
    currentReport = report;
    const badge = $("#badge-status");
    if (badge) {
      badge.textContent = String(report.status || "-").toUpperCase();
      badge.className = "badge " + (report.status === "passed" ? "pass" : report.status === "failed" ? "fail" : "inconclusive");
    }
    const raw = $("#evidence-raw");
    if (raw) raw.textContent = JSON.stringify(report, null, 2);
    setStatus($("#runner-status"), note || "", report.status === "failed" ? "error" : "ok");
  }
  function runLive() {
    if (!window.QProofSimulator) { setStatus($("#builder-status"), "Simulator not loaded", "error"); return; }
    const spec = { n_qubits: builder.n_qubits, gates: builder.gates.slice() };
    const v = QProofSimulator.validateCircuit(spec);
    if (!v.ok) { setStatus($("#builder-status"), "Invalid: " + v.errors.join("; "), "error"); return; }
    const shots = parseInt(($("#run-shots") || {}).value, 10) || 0;
    const seed = parseInt(($("#run-seed") || {}).value, 10);
    try {
      const result = QProofSimulator.runCircuit(spec, { shots, seed: Number.isFinite(seed) ? seed : 42 });
      result.depth = depthOf(spec.gates);
      const resolved = resolveSelectedReference(spec, result);
      if (resolved.error) { setStatus($("#builder-status"), resolved.error, "error"); return; }
      const report = QProofSimulator.buildBrowserReport(spec, result, Object.assign({ experiment_id: "lab-" + Date.now() }, resolved.meta));
      lastRun = { spec, result, report, refId: resolved.refId };
      const note = resolved.refId === "none"
        ? "Simulation complete — no scientific claim evaluated."
        : (resolved.preconditionReason || ("Live execution + automatic claim verification against " + resolved.refId));
      applyReport(report, note);
      setStatus($("#builder-status"), "Executed · " + result.runtime_ms + " ms · ref=" + resolved.refId, "ok");
      setStatus($("#claim-status"), "Scientific checks: " + report.status.toUpperCase(), report.status === "passed" ? "ok" : report.status === "failed" ? "error" : "");
      if (window.QProofEvidence && report.integrity && report.integrity.report_hash) {
        QProofEvidence.verifyReportIntegrity(report).then(function (r) {
          setStatus($("#integrity-status"), (r.integrity || "unverified") + ": " + r.detail, r.hash_verified ? "ok" : "");
        });
      }
    } catch (err) { setStatus($("#builder-status"), String(err.message || err), "error"); }
  }
  function verifyClaim() {
    if (!lastRun) { setStatus($("#claim-status"), "Run a circuit in the Lab first.", "error"); return; }
    const resolved = resolveSelectedReference(lastRun.spec, lastRun.result);
    if (resolved.error) { setStatus($("#claim-status"), resolved.error, "error"); return; }
    const report = QProofSimulator.buildBrowserReport(lastRun.spec, lastRun.result, Object.assign({ experiment_id: lastRun.report.experiment_id }, resolved.meta));
    lastRun.report = report;
    applyReport(report, resolved.preconditionReason || ("Claim verification against " + resolved.refId));
    setStatus($("#claim-status"), "Scientific checks: " + report.status.toUpperCase(), report.status === "passed" ? "ok" : report.status === "failed" ? "error" : "");
  }
  function refreshBuilder() {
    builder.n_qubits = parseInt(($("#n-qubits") || {}).value, 10) || 1;
    const host = $("#gate-list");
    if (host) {
      host.innerHTML = builder.gates.length ? builder.gates.map((g, i) => '<div class="gate-list-item"><span class="mono">' + (i + 1) + ". " + g.gate + " [" + g.qubits.join(",") + "]</span></div>').join("") : '<p class="muted">Empty circuit</p>';
    }
  }
  function wire(id, fn) { const el = $("#" + id); if (el) el.addEventListener("click", fn); }
  wire("btn-run-live", runLive);
  wire("btn-verify-claim", verifyClaim);
  wire("btn-blank", function () { builder = { n_qubits: parseInt(($("#n-qubits") || {}).value, 10) || 1, gates: [] }; refreshBuilder(); });
  wire("btn-apply-template", function () {
    const id = ($("#template-select") || {}).value;
    if (id && TEMPLATES[id]) { builder = { n_qubits: TEMPLATES[id].n_qubits, gates: TEMPLATES[id].gates.map((g) => ({ gate: g.gate, qubits: g.qubits.slice() })) }; if ($("#n-qubits")) $("#n-qubits").value = builder.n_qubits; refreshBuilder(); }
  });
  wire("btn-add-gate", function () {
    const name = (($("#gate-pick") || {}).value || "H").toUpperCase();
    const qs = (($("#gate-qubits") || {}).value || "0").split(/[,\s]+/).filter(Boolean).map((x) => parseInt(x, 10));
    const entry = { gate: name, qubits: qs };
    if (name === "RX" || name === "RY" || name === "RZ") entry.theta = parseFloat(($("#gate-theta") || {}).value);
    builder.gates.push(entry);
    refreshBuilder();
  });
  wire("btn-verify-integrity", function () {
    if (!currentReport || !window.QProofEvidence) return;
    QProofEvidence.verifyReportIntegrity(currentReport).then(function (r) {
      setStatus($("#integrity-status"), (r.integrity || "unverified") + ": " + r.detail, r.hash_verified ? "ok" : "error");
    });
  });
  wire("btn-use-last", function () { if (lastRun) applyReport(lastRun.report, "Last live report"); });
  wire("btn-export-report", function () {
    if (!currentReport) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(currentReport, null, 2)], { type: "application/json" }));
    a.download = (currentReport.experiment_id || "evidence") + ".json";
    a.click();
  });
  refreshBuilder();
})();
