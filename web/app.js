/* QProof capability-first workbench: Lab → Claim → Evidence */
(function () {
  "use strict";

  const CAP_URL = "capabilities.json";
  const TEMPLATES = {
    hadamard: { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] },
    bell: {
      n_qubits: 2,
      gates: [
        { gate: "H", qubits: [0] },
        { gate: "CNOT", qubits: [0, 1] },
      ],
    },
    "rx-pi": { n_qubits: 1, gates: [{ gate: "RX", qubits: [0], theta: Math.PI }] },
    phase: {
      n_qubits: 1,
      gates: [
        { gate: "X", qubits: [0] },
        { gate: "Z", qubits: [0] },
      ],
    },
  };

  let capabilities = null;
  /** @type {{n_qubits:number, gates:Array}} */
  let builder = { n_qubits: 1, gates: [] };
  let lastRun = null;
  let currentReport = null;
  let provenance = "none";

  const $ = (s) => document.querySelector(s);

  function setStatus(el, text, cls) {
    if (!el) return;
    el.textContent = text;
    el.className = "runner-status" + (cls ? " " + cls : "");
  }

  function depthOf(gates) {
    return window.QProofDepth ? QProofDepth.circuitDepth(gates) : gates.length;
  }

  function renderGateList() {
    const host = $("#gate-list");
    host.innerHTML = "";
    if (!builder.gates.length) {
      host.innerHTML = '<p class="muted">Empty circuit - add gates or load a template.</p>';
      return;
    }
    builder.gates.forEach((g, i) => {
      const row = document.createElement("div");
      row.className = "gate-list-item";
      const label =
        g.gate +
        " [" +
        g.qubits.join(",") +
        "]" +
        (g.theta != null ? " theta=" + g.theta : "");
      row.innerHTML =
        '<span class="mono">' +
        (i + 1) +
        ". " +
        label +
        '</span> <button type="button" data-i="' +
        i +
        '" class="btn btn-tiny btn-del">x</button>';
      host.appendChild(row);
    });
    host.querySelectorAll(".btn-del").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.getAttribute("data-i"), 10);
        builder.gates.splice(i, 1);
        refreshBuilder();
      });
    });
  }

  function renderCircuit(spec, n) {
    const host = $("#circuit-viz");
    host.innerHTML = "";
    for (let q = 0; q < n; q++) {
      const row = document.createElement("div");
      row.className = "wire-row";
      const lab = document.createElement("span");
      lab.className = "wire-label";
      lab.textContent = "q" + q;
      const line = document.createElement("div");
      line.className = "wire-line";
      (spec || []).forEach((g) => {
        const gate = String(g.gate).toUpperCase();
        const isCx = gate === "CNOT" || gate === "CX";
        if (!isCx && gate !== "CZ" && g.qubits[0] === q) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "gate-box";
          b.textContent = gate + (g.theta != null ? "(th)" : "");
          line.appendChild(b);
        } else if (isCx && g.qubits[0] === q) {
          const d = document.createElement("span");
          d.className = "ctrl-dot";
          line.appendChild(d);
        } else if (isCx && g.qubits[1] === q) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "gate-box cnot";
          b.textContent = "+";
          line.appendChild(b);
        } else if (gate === "CZ" && g.qubits.includes(q)) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "gate-box";
          b.textContent = "CZ";
          line.appendChild(b);
        }
      });
      row.appendChild(lab);
      row.appendChild(line);
      host.appendChild(row);
    }
  }

  function refreshBuilder() {
    builder.n_qubits = parseInt($("#n-qubits").value, 10) || 1;
    renderGateList();
    renderCircuit(builder.gates, builder.n_qubits);
    $("#circuit-meta").innerHTML = [
      ["Qubits", builder.n_qubits],
      ["Gates", builder.gates.length],
      ["Depth", depthOf(builder.gates)],
    ]
      .map(
        ([k, v]) =>
          `<div class="meta-item"><span class="k">${k}</span><span class="v">${v}</span></div>`
      )
      .join("");
  }

  function specFromBuilder() {
    return {
      format_version: "1.0.0",
      n_qubits: builder.n_qubits,
      gates: builder.gates.slice(),
      initial_state: { type: "zero" },
    };
  }

  function populateGateSelect(cap) {
    const sel = $("#gate-pick");
    sel.innerHTML = "";
    const gates = (cap && cap.gates) || {
      H: {},
      X: {},
      CNOT: {},
    };
    Object.keys(gates)
      .filter((n) => !gates[n].alias_of)
      .sort()
      .forEach((name) => {
        const o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        sel.appendChild(o);
      });
  }

  function renderCapabilities(cap) {
    capabilities = cap;
    populateGateSelect(cap);
    const sim = cap.simulator || {};
    $("#cap-summary").innerHTML = [
      ["Software", cap.software],
      ["Python max qubits", sim.max_qubits],
      ["Browser max qubits", (window.QProofSimulator && QProofSimulator.MAX_QUBITS_BROWSER) || 12],
      ["Ordering", sim.qubit_ordering],
      ["Evidence schema", (cap.evidence_schema || {}).version],
    ]
      .map(
        ([k, v]) =>
          `<div class="meta-item"><span class="k">${k}</span><span class="v">${v}</span></div>`
      )
      .join("");
    const palette = $("#gate-palette");
    palette.innerHTML = "";
    Object.keys(cap.gates || {}).forEach((name) => {
      if (cap.gates[name].alias_of) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gate-box";
      btn.textContent = name;
      btn.addEventListener("click", () => {
        $("#gate-pick").value = name;
      });
      palette.appendChild(btn);
    });
    $("#cap-raw").textContent = JSON.stringify(cap, null, 2);
  }

  function showAmplitudes(report) {
    const n = report.circuit.n_qubits;
    const tbody = $("#amp-table tbody");
    tbody.innerHTML = "";
    const obs = report.results.observed_amplitudes || [];
    const probs = report.results.observed_probabilities || [];
    obs.forEach((a, i) => {
      const tr = document.createElement("tr");
      const bit = "|" + i.toString(2).padStart(n, "0") + ">";
      tr.innerHTML = `<td>${bit}</td><td>${Number(a[0]).toFixed(6)}</td><td>${Number(a[1]).toFixed(6)}</td><td>${Number(probs[i] || 0).toFixed(6)}</td>`;
      tbody.appendChild(tr);
    });
    const host = $("#prob-bars");
    host.innerHTML = "";
    const counts = report.results.measurement_counts || {};
    const shots = (report.execution && report.execution.shots) || 0;
    probs.forEach((p, i) => {
      const bit = i.toString(2).padStart(n, "0");
      const row = document.createElement("div");
      row.className = "prob-row";
      row.innerHTML = `
        <span class="bar-label">|${bit}></span>
        <div class="bar-track"><div class="bar-fill" style="width:${p * 100}%"></div></div>
        <span class="bar-label">p=${Number(p).toFixed(3)}${shots ? " n=" + (counts[bit] || 0) : ""}</span>`;
      host.appendChild(row);
    });
  }

  function showChecks(report) {
    const tbody = $("#check-table tbody");
    tbody.innerHTML = "";
    (report.checks || []).forEach((c) => {
      const tr = document.createElement("tr");
      const cls =
        c.status === "passed"
          ? "status-pass"
          : c.status === "failed"
            ? "status-fail"
            : "status-inconclusive";
      tr.innerHTML = `<td>${c.name}</td><td class="${cls}">${String(c.status).toUpperCase()}</td><td>${c.detail}</td><td>${c.tolerance != null ? c.tolerance : "-"}</td>`;
      tbody.appendChild(tr);
    });
  }

  function applyReport(report, note, prov) {
    currentReport = report;
    provenance = prov || "unknown";
    const badge = $("#badge-status");
    badge.textContent = String(report.status || "-").toUpperCase();
    badge.className =
      "badge " +
      (report.status === "passed"
        ? "pass"
        : report.status === "failed"
          ? "fail"
          : "inconclusive");
    $("#badge-mode").textContent = provenance;
    $("#badge-experiment").textContent = report.experiment_id || "";
    const fid = report.results && report.results.fidelity;
    $("#badge-fidelity").textContent =
      fid != null && report.status !== "inconclusive"
        ? "F=" + Number(fid).toFixed(8)
        : "";
    if (report.circuit) showAmplitudes(report);
    showChecks(report);
    const hashStr = ((report.integrity || {}).report_hash || "absent").toString();
    $("#evidence-meta").innerHTML = [
      ["Schema", report.schema_version],
      ["Experiment", report.experiment_id],
      ["Scientific status", report.status],
      ["Simulator", (report.verification || {}).simulator_id],
      ["Reference", (report.verification || {}).reference_id],
      ["Mode", (report.execution || {}).mode],
      ["Provenance", provenance],
      ["report_hash", hashStr.length > 28 ? hashStr.slice(0, 28) + "..." : hashStr],
    ]
      .map(
        ([k, v]) =>
          `<div class="meta-item"><span class="k">${k}</span><span class="v">${v}</span></div>`
      )
      .join("");
    $("#evidence-raw").textContent = JSON.stringify(report, null, 2);
    setStatus($("#runner-status"), note || provenance, report.status === "failed" ? "error" : "ok");
  }

  function runLive() {
    if (!window.QProofSimulator) {
      setStatus($("#builder-status"), "Simulator not loaded", "error");
      return;
    }
    const spec = specFromBuilder();
    const v = QProofSimulator.validateCircuit(spec);
    if (!v.ok) {
      setStatus($("#builder-status"), "Invalid: " + v.errors.join("; "), "error");
      $("#badge-status").textContent = "INVALID";
      $("#badge-status").className = "badge fail";
      return;
    }
    const shots = parseInt($("#run-shots").value, 10) || 0;
    const seed = parseInt($("#run-seed").value, 10);
    const init = parseInt($("#run-init").value, 10) || 0;
    try {
      const result = QProofSimulator.runCircuit(spec, {
        shots,
        seed: Number.isFinite(seed) ? seed : 42,
        initialIndex: init > 0 ? init : undefined,
      });
      result.depth = depthOf(spec.gates);
      const report = QProofSimulator.buildBrowserReport(spec, result, {
        experiment_id: "lab-" + Date.now(),
        reference_id: "none",
      });
      lastRun = { spec, result, report };
      applyReport(
        report,
        "Live browser execution - claim checks inconclusive until you supply a reference.",
        "browser_live"
      );
      setStatus(
        $("#builder-status"),
        "Executed · " + result.runtime_ms + " ms · depth=" + result.depth,
        "ok"
      );
    } catch (err) {
      setStatus($("#builder-status"), String(err.message || err), "error");
    }
  }

  function analyticRef(mode) {
    const s = 1 / Math.sqrt(2);
    if (mode === "analytic-bell") {
      return {
        amps: [
          [s, 0],
          [0, 0],
          [0, 0],
          [s, 0],
        ],
        probs: [0.5, 0, 0, 0.5],
        id: "analytic/bell-v1",
      };
    }
    if (mode === "analytic-h") {
      return {
        amps: [
          [s, 0],
          [s, 0],
        ],
        probs: [0.5, 0.5],
        id: "analytic/hadamard-v1",
      };
    }
    return null;
  }

  function verifyClaim() {
    if (!lastRun) {
      setStatus($("#claim-status"), "Run a circuit in the Lab first.", "error");
      return;
    }
    const mode = $("#ref-mode").value;
    const tol = parseFloat($("#ref-tol").value) || 1e-10;
    let expectedAmps = null;
    let expectedProbs = null;
    let refId = "none";
    if (mode === "paste") {
      try {
        expectedAmps = JSON.parse($("#ref-amps").value);
        expectedProbs = expectedAmps.map((a) => a[0] * a[0] + a[1] * a[1]);
        refId = "supplied/paste-v1";
      } catch (e) {
        setStatus($("#claim-status"), "Invalid amplitude JSON", "error");
        return;
      }
    } else {
      const ref = analyticRef(mode);
      if (ref) {
        expectedAmps = ref.amps;
        expectedProbs = ref.probs;
        refId = ref.id;
      }
    }
    const report = QProofSimulator.buildBrowserReport(lastRun.spec, lastRun.result, {
      experiment_id: lastRun.report.experiment_id,
      expected_amplitudes: expectedAmps,
      expected_probabilities: expectedProbs,
      reference_id: refId,
      tolerance: tol,
    });
    lastRun.report = report;
    applyReport(report, "Claim verification against " + refId, "browser_live+claim");
    setStatus(
      $("#claim-status"),
      "Scientific checks: " + report.status.toUpperCase() + " (independent of hash integrity)",
      report.status === "passed" ? "ok" : report.status === "failed" ? "error" : ""
    );
  }

  async function verifyIntegrity(report) {
    if (!window.QProofEvidence) {
      setStatus($("#integrity-status"), "Verifier not loaded", "error");
      return;
    }
    const r = await QProofEvidence.verifyReportIntegrity(report);
    const integ = r.integrity || (r.hash_verified ? "verified" : "unverified");
    let label;
    let cls;
    if (integ === "verified") {
      label = "Integrity verified";
      cls = "ok";
    } else if (integ === "failed") {
      label = "Integrity failed";
      cls = "error";
    } else {
      label = "Integrity unverified";
      cls = "";
    }
    setStatus(
      $("#integrity-status"),
      label + ": " + r.detail + " [client]",
      cls
    );
  }

  $("#btn-add-gate").addEventListener("click", () => {
    const name = $("#gate-pick").value.toUpperCase();
    const qs = $("#gate-qubits")
      .value.split(/[,\s]+/)
      .filter(Boolean)
      .map((x) => parseInt(x, 10));
    const entry = { gate: name, qubits: qs };
    if (name === "RX" || name === "RY" || name === "RZ") {
      const th = parseFloat($("#gate-theta").value);
      if (!Number.isFinite(th)) {
        setStatus($("#builder-status"), "Rotation needs finite theta", "error");
        return;
      }
      entry.theta = th;
    }
    builder.gates.push(entry);
    refreshBuilder();
  });
  $("#btn-remove-last").addEventListener("click", () => {
    builder.gates.pop();
    refreshBuilder();
  });
  $("#btn-move-up").addEventListener("click", () => {
    if (builder.gates.length < 2) return;
    const a = builder.gates.pop();
    builder.gates.splice(builder.gates.length - 1, 0, a);
    refreshBuilder();
  });
  $("#btn-blank").addEventListener("click", () => {
    builder = { n_qubits: parseInt($("#n-qubits").value, 10) || 1, gates: [] };
    refreshBuilder();
    setStatus($("#builder-status"), "Blank circuit", "ok");
  });
  $("#btn-apply-template").addEventListener("click", () => {
    const id = $("#template-select").value;
    if (!id || !TEMPLATES[id]) return;
    const t = TEMPLATES[id];
    builder = { n_qubits: t.n_qubits, gates: t.gates.map((g) => ({ ...g, qubits: g.qubits.slice() })) };
    $("#n-qubits").value = t.n_qubits;
    refreshBuilder();
  });
  $("#n-qubits").addEventListener("change", refreshBuilder);
  $("#btn-validate").addEventListener("click", () => {
    const v = QProofSimulator.validateCircuit(specFromBuilder());
    setStatus(
      $("#builder-status"),
      v.ok ? "Circuit valid" : "Invalid: " + v.errors.join("; "),
      v.ok ? "ok" : "error"
    );
  });
  $("#btn-run-live").addEventListener("click", runLive);
  $("#btn-export-circ").addEventListener("click", () => {
    const blob = new Blob([QProofSimulator.serializeCircuit(specFromBuilder())], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "circuit.json";
    a.click();
  });
  $("#file-circuit").addEventListener("change", (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        const gates = data.gates || (data.circuit && data.circuit.spec) || [];
        const n = data.n_qubits || (data.circuit && data.circuit.n_qubits) || 1;
        builder = { n_qubits: n, gates };
        $("#n-qubits").value = n;
        refreshBuilder();
        setStatus($("#builder-status"), "Imported circuit", "ok");
      } catch (e) {
        setStatus($("#builder-status"), "Import failed: " + e.message, "error");
      }
    };
    r.readAsText(f);
  });
  $("#btn-verify-claim").addEventListener("click", verifyClaim);
  $("#btn-load").addEventListener("click", async () => {
    const url = $("#exp-select").value;
    if (!url) {
      setStatus($("#runner-status"), "Select a fixture or import evidence.", "error");
      return;
    }
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      applyReport(
        await res.json(),
        "Precomputed Python fixture (integrity unverified by design if report_hash absent)",
        "precomputed_python"
      );
    } catch (e) {
      setStatus($("#runner-status"), String(e.message || e), "error");
    }
  });
  $("#btn-use-live").addEventListener("click", () => {
    if (!lastRun) {
      setStatus($("#runner-status"), "No live run yet - run a circuit in the Lab first.", "error");
      return;
    }
    applyReport(lastRun.report, "Last live browser report", "browser_live");
  });
  $("#btn-verify-integrity").addEventListener("click", () => {
    if (!currentReport) {
      setStatus($("#integrity-status"), "Load or run a report first.", "error");
      return;
    }
    verifyIntegrity(currentReport);
  });
  $("#btn-tamper-test").addEventListener("click", async () => {
    if (!currentReport) {
      setStatus($("#integrity-status"), "Load a report first.", "error");
      return;
    }
    const clone = JSON.parse(JSON.stringify(currentReport));
    clone.status = clone.status === "passed" ? "failed" : "passed";
    if (clone.results) clone.results.fidelity = 0.111;
    const r = await QProofEvidence.verifyReportIntegrity(clone);
    setStatus(
      $("#integrity-status"),
      r.hash_verified
        ? "Unexpected: tamper not detected"
        : "Tamper detected (expected): " + r.detail,
      r.hash_verified ? "error" : "ok"
    );
  });
  $("#btn-ui-demo").addEventListener("click", () => {
    if (!currentReport) {
      setStatus($("#runner-status"), "Load a report first.", "error");
      return;
    }
    const clone = JSON.parse(JSON.stringify(currentReport));
    clone.status = "failed";
    clone.experiment_id = (clone.experiment_id || "exp") + " (ui-demo)";
    (clone.checks || []).forEach((c) => {
      if (c.name === "fidelity" || c.name === "amplitudes") {
        c.status = "failed";
        c.detail = "UI-ONLY DEMO - display mutated; not a verifier result";
      }
    });
    applyReport(
      clone,
      "UI-ONLY display demo. Does not run the integrity verifier.",
      "ui_display_demo"
    );
  });
  $("#btn-download").addEventListener("click", () => {
    if (!currentReport) return;
    const blob = new Blob([JSON.stringify(currentReport, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (currentReport.experiment_id || "evidence") + ".json";
    a.click();
  });
  $("#file-import").addEventListener("change", (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        applyReport(JSON.parse(r.result), "Imported evidence file", "imported");
      } catch (e) {
        setStatus($("#runner-status"), "Import failed: " + e.message, "error");
      }
    };
    r.readAsText(f);
  });

  fetch(CAP_URL, { cache: "no-store" })
    .then((r) => r.json())
    .then(renderCapabilities)
    .catch((e) => {
      $("#cap-summary").innerHTML = "<p class=\"error\">" + e.message + "</p>";
      populateGateSelect(null);
    });

  refreshBuilder();
})();
