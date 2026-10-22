/* QProof workbench — live browser execution + precomputed evidence + integrity checks. */
(function () {
  "use strict";

  const CAP_URL = "capabilities.json";
  const REPRO_CMDS = {
    "bell-state-v1": "qproof run bell --shots 1024 --seed 42 --out report.json",
    "hadamard-v1": "qproof run hadamard --out report.json",
    "rx-pi-v1": "qproof run rx-pi --out report.json",
    "global-phase-v1": "qproof run phase --out report.json",
  };

  const GATE_HELP = {
    I: "Identity",
    X: "Pauli-X (NOT)",
    Y: "Pauli-Y",
    Z: "Pauli-Z",
    H: "Hadamard",
    S: "S phase",
    T: "T phase",
    RX: "Rotation about X (theta radians)",
    RY: "Rotation about Y",
    RZ: "Rotation about Z",
    CNOT: "Controlled-NOT (control, target)",
    CZ: "Controlled-Z",
  };

  let currentReport = null;
  let capabilities = null;
  /** @type {{n_qubits:number, gates:Array}} */
  let builderSpec = { n_qubits: 2, gates: [] };
  let lastProvenance = "none"; // browser_live | precomputed_python | import | ui_demo

  const $ = (sel) => document.querySelector(sel);

  function basisLabel(i, n) {
    return "|" + i.toString(2).padStart(n, "0") + "⟩";
  }

  function setStatus(el, text, cls) {
    el.textContent = text;
    el.className = "runner-status" + (cls ? " " + cls : "");
  }

  function setModeBadge(text) {
    const b = $("#badge-mode");
    if (b) b.textContent = text;
  }

  function renderCapabilities(cap) {
    capabilities = cap;
    const sim = cap.simulator || {};
    $("#cap-summary").innerHTML = [
      ["Software", cap.software],
      ["Max qubits (Python)", sim.max_qubits],
      ["Max qubits (browser)", (window.QProofSimulator && QProofSimulator.MAX_QUBITS_BROWSER) || 12],
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
      const meta = cap.gates[name];
      if (meta.alias_of) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gate-box";
      btn.textContent = name;
      btn.title = GATE_HELP[name] || name;
      btn.addEventListener("click", () => {
        $("#gate-pick").value = name;
        $("#gate-explain") && ($("#gate-explain").textContent = GATE_HELP[name] || name);
      });
      palette.appendChild(btn);
    });
    $("#cap-raw").textContent = JSON.stringify(cap, null, 2);
  }

  function renderBuilderList() {
    $("#builder-gates").textContent = JSON.stringify(builderSpec.gates, null, 2);
    renderCircuit(builderSpec.gates, builderSpec.n_qubits);
    $("#circuit-meta").innerHTML = [
      ["Qubits", builderSpec.n_qubits],
      ["Gates", builderSpec.gates.length],
      ["Depth", builderSpec.gates.length],
    ]
      .map(
        ([k, v]) =>
          `<div class="meta-item"><span class="k">${k}</span><span class="v">${v}</span></div>`
      )
      .join("");
  }

  function renderCircuit(spec, nQubits) {
    const host = $("#circuit-viz");
    if (!host) return;
    host.innerHTML = "";
    for (let q = 0; q < nQubits; q++) {
      const row = document.createElement("div");
      row.className = "wire-row";
      const lab = document.createElement("span");
      lab.className = "wire-label";
      lab.textContent = "q" + q;
      const line = document.createElement("div");
      line.className = "wire-line";
      (spec || []).forEach((g) => {
        const gate = String(g.gate).toUpperCase();
        if (gate !== "CNOT" && gate !== "CZ" && gate !== "CX" && g.qubits[0] === q) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "gate-box";
          btn.textContent = gate + (g.theta != null ? "(θ)" : "");
          line.appendChild(btn);
        } else if ((gate === "CNOT" || gate === "CX") && g.qubits[0] === q) {
          const d = document.createElement("span");
          d.className = "ctrl-dot";
          line.appendChild(d);
        } else if ((gate === "CNOT" || gate === "CX") && g.qubits[1] === q) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "gate-box cnot";
          btn.textContent = "⊕";
          line.appendChild(btn);
        } else if (gate === "CZ" && g.qubits.includes(q)) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "gate-box";
          btn.textContent = "CZ";
          line.appendChild(btn);
        }
      });
      row.appendChild(lab);
      row.appendChild(line);
      host.appendChild(row);
    }
  }

  function renderAmplitudes(report) {
    const n = report.circuit.n_qubits;
    const tbody = $("#amp-table tbody");
    tbody.innerHTML = "";
    const obs = report.results.observed_amplitudes || [];
    const probs = report.results.observed_probabilities || [];
    obs.forEach((a, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${basisLabel(i, n)}</td><td>${Number(a[0]).toFixed(6)}</td><td>${Number(a[1]).toFixed(6)}</td><td>${Number(probs[i] ?? 0).toFixed(6)}</td>`;
      tbody.appendChild(tr);
    });
  }

  function renderProbs(report) {
    const host = $("#prob-bars");
    host.innerHTML = "";
    const n = report.circuit.n_qubits;
    const probs = report.results.observed_probabilities || [];
    const expected = report.results.expected_probabilities || probs;
    const counts = report.results.measurement_counts || {};
    const shots = (report.execution && report.execution.shots) || 0;
    probs.forEach((p, i) => {
      const bit = i.toString(2).padStart(n, "0");
      const exp = expected[i] != null ? expected[i] : p;
      const obs = shots ? (counts[bit] || 0) / shots : p;
      const row = document.createElement("div");
      row.className = "prob-row";
      row.innerHTML = `
        <span class="bar-label">|${bit}⟩</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(exp, obs) * 100}%"></div></div>
        <span class="bar-label">p=${Number(p).toFixed(3)}${shots ? " · n=" + (counts[bit] || 0) : ""}</span>`;
      host.appendChild(row);
    });
  }

  function renderChecks(report) {
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
      tr.innerHTML = `<td>${c.name}</td><td class="${cls}">${String(c.status).toUpperCase()}</td><td>${c.detail}</td><td>${c.tolerance != null ? c.tolerance : "—"}</td>`;
      tbody.appendChild(tr);
    });
  }

  function renderEvidence(report) {
    $("#evidence-meta").innerHTML = [
      ["Schema", report.schema_version],
      ["Experiment", report.experiment_id],
      ["Status", report.status],
      ["Simulator", (report.verification || {}).simulator_id],
      ["Reference", (report.verification || {}).reference_id],
      ["Mode", (report.execution || {}).mode],
      ["Hash", ((report.integrity || {}).report_hash || "—").toString().slice(0, 24)],
    ]
      .map(
        ([k, v]) =>
          `<div class="meta-item"><span class="k">${k}</span><span class="v">${v}</span></div>`
      )
      .join("");
    $("#evidence-raw").textContent = JSON.stringify(report, null, 2);
  }

  function renderSummary(report) {
    const badge = $("#badge-status");
    badge.textContent = String(report.status).toUpperCase();
    badge.className =
      "badge " +
      (report.status === "passed"
        ? "pass"
        : report.status === "failed"
          ? "fail"
          : "inconclusive");
    $("#badge-experiment").textContent = report.experiment_id;
    const fid = report.results && report.results.fidelity;
    $("#badge-fidelity").textContent =
      fid != null ? "F = " + Number(fid).toFixed(12) : "";
  }

  function applyReport(report, note, provenance) {
    if (!report || !report.schema_version || !report.checks) {
      throw new Error("Malformed evidence: missing schema_version or checks");
    }
    currentReport = report;
    lastProvenance = provenance || "unknown";
    renderSummary(report);
    if (report.circuit && report.circuit.spec) {
      renderCircuit(report.circuit.spec, report.circuit.n_qubits);
    }
    renderAmplitudes(report);
    renderProbs(report);
    renderChecks(report);
    renderEvidence(report);
    const modeLabel =
      lastProvenance === "browser_live"
        ? "live browser execution"
        : lastProvenance === "precomputed_python"
          ? "precomputed Python evidence"
          : lastProvenance === "ui_demo"
            ? "UI-only demo (not real verification)"
            : lastProvenance === "import"
              ? "imported evidence"
              : lastProvenance;
    setModeBadge(modeLabel);
    setStatus(
      $("#runner-status"),
      note || modeLabel,
      report.status === "passed" ? "ok" : report.status === "failed" ? "error" : ""
    );
    $("#evidence-error").hidden = true;
  }

  function corruptForUiDemo(report) {
    const clone = JSON.parse(JSON.stringify(report));
    clone.status = "failed";
    if (clone.results) clone.results.fidelity = 0.5;
    clone.checks = (clone.checks || []).map((c) =>
      c.name === "amplitudes" || c.name === "fidelity"
        ? {
            ...c,
            status: "failed",
            detail: "UI-ONLY DEMO: display corrupted — not a verifier result",
          }
        : c
    );
    clone.experiment_id = (report.experiment_id || "exp") + " (ui-demo)";
    return clone;
  }

  async function loadEvidence(url) {
    setStatus($("#runner-status"), "Loading evidence…");
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status + " loading " + url);
      applyReport(
        await res.json(),
        "Precomputed Python-verified report. Not a live browser run.",
        "precomputed_python"
      );
    } catch (err) {
      setStatus($("#runner-status"), "Failed: " + err.message, "error");
      $("#evidence-error").hidden = false;
      $("#evidence-error").textContent = String(err);
      $("#badge-status").textContent = "ERROR";
      $("#badge-status").className = "badge fail";
    }
  }

  async function loadCapabilities() {
    try {
      const res = await fetch(CAP_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      renderCapabilities(await res.json());
    } catch (err) {
      $("#cap-summary").innerHTML =
        "<p class=\"error\">Could not load capabilities.json: " + err.message + "</p>";
    }
  }

  function currentBuilderSpec() {
    const n = parseInt($("#n-qubits").value, 10) || 2;
    builderSpec.n_qubits = n;
    return {
      format_version: "1.0.0",
      n_qubits: n,
      gates: builderSpec.gates.slice(),
      initial_state: { type: "zero" },
    };
  }

  function addGateFromForm() {
    const name = $("#gate-pick").value.toUpperCase();
    const qs = $("#gate-qubits")
      .value.split(/[,\s]+/)
      .filter(Boolean)
      .map((x) => parseInt(x, 10));
    const entry = { gate: name, qubits: qs };
    if (name === "RX" || name === "RY" || name === "RZ") {
      const th = parseFloat($("#gate-theta").value);
      if (!Number.isFinite(th)) {
        setStatus($("#builder-status"), "Rotation gates need finite theta", "error");
        return;
      }
      entry.theta = th;
    }
    builderSpec.gates.push(entry);
    renderBuilderList();
    setStatus($("#builder-status"), "Added " + name, "ok");
  }

  function runLive() {
    if (!window.QProofSimulator) {
      setStatus($("#builder-status"), "Simulator not loaded", "error");
      return;
    }
    const spec = currentBuilderSpec();
    const v = QProofSimulator.validateCircuit(spec);
    if (!v.ok) {
      setStatus($("#builder-status"), "Invalid: " + v.errors.join("; "), "error");
      return;
    }
    const shots = parseInt($("#run-shots").value, 10) || 0;
    const seed = parseInt($("#run-seed").value, 10);
    try {
      const result = QProofSimulator.runCircuit(spec, {
        shots: shots,
        seed: Number.isFinite(seed) ? seed : 42,
      });
      // Analytic expectations for known small patterns
      let expectedAmps = null;
      let expectedProbs = null;
      let refId = "none";
      const gstr = JSON.stringify(spec.gates);
      if (
        spec.n_qubits === 2 &&
        gstr === JSON.stringify([{ gate: "H", qubits: [0] }, { gate: "CNOT", qubits: [0, 1] }])
      ) {
        const s = 1 / Math.sqrt(2);
        expectedAmps = [
          [s, 0],
          [0, 0],
          [0, 0],
          [s, 0],
        ];
        expectedProbs = [0.5, 0, 0, 0.5];
        refId = "analytic/bell-v1";
      } else if (
        spec.n_qubits === 1 &&
        spec.gates.length === 1 &&
        String(spec.gates[0].gate).toUpperCase() === "H"
      ) {
        const s = 1 / Math.sqrt(2);
        expectedAmps = [
          [s, 0],
          [s, 0],
        ];
        expectedProbs = [0.5, 0.5];
        refId = "analytic/hadamard-v1";
      }
      const report = QProofSimulator.buildBrowserReport(spec, result, {
        experiment_id: "browser-live-" + Date.now(),
        expected_amplitudes: expectedAmps,
        expected_probabilities: expectedProbs,
        reference_id: refId,
      });
      applyReport(
        report,
        "Live browser execution (" +
          result.backend +
          "). " +
          (expectedAmps
            ? "Compared to analytic reference."
            : "No analytic reference — claim checks may be INCONCLUSIVE."),
        "browser_live"
      );
      setStatus($("#builder-status"), "Executed in browser · " + result.runtime_ms + " ms", "ok");
    } catch (err) {
      setStatus($("#builder-status"), String(err.message || err), "error");
    }
  }

  async function verifyIntegrity(report) {
    if (!window.QProofEvidence) {
      setStatus($("#integrity-status"), "Evidence verifier not loaded", "error");
      return;
    }
    const r = await QProofEvidence.verifyReportIntegrity(report);
    setStatus(
      $("#integrity-status"),
      (r.ok ? "Integrity OK: " : "Integrity FAIL: ") +
        r.detail +
        (r.client_side ? " [client-side check]" : ""),
      r.ok ? "ok" : "error"
    );
    return r;
  }

  // --- events ---
  $("#btn-add-gate").addEventListener("click", addGateFromForm);
  $("#btn-clear-gates").addEventListener("click", () => {
    builderSpec.gates = [];
    renderBuilderList();
  });
  $("#btn-load-bell").addEventListener("click", () => {
    $("#n-qubits").value = 2;
    builderSpec = {
      n_qubits: 2,
      gates: [
        { gate: "H", qubits: [0] },
        { gate: "CNOT", qubits: [0, 1] },
      ],
    };
    renderBuilderList();
  });
  $("#btn-load-h").addEventListener("click", () => {
    $("#n-qubits").value = 1;
    builderSpec = { n_qubits: 1, gates: [{ gate: "H", qubits: [0] }] };
    renderBuilderList();
  });
  $("#n-qubits").addEventListener("change", () => {
    builderSpec.n_qubits = parseInt($("#n-qubits").value, 10) || 2;
    renderBuilderList();
  });
  $("#btn-validate").addEventListener("click", () => {
    const v = QProofSimulator.validateCircuit(currentBuilderSpec());
    setStatus(
      $("#builder-status"),
      v.ok ? "Circuit valid" : "Invalid: " + v.errors.join("; "),
      v.ok ? "ok" : "error"
    );
  });
  $("#btn-run-live").addEventListener("click", runLive);
  $("#btn-export-circ").addEventListener("click", () => {
    const text = QProofSimulator.serializeCircuit(currentBuilderSpec());
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "circuit.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#file-circuit").addEventListener("change", (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const gates = data.gates || (data.circuit && data.circuit.spec) || data.spec || [];
        const n = data.n_qubits || (data.circuit && data.circuit.n_qubits) || 1;
        builderSpec = { n_qubits: n, gates: gates };
        $("#n-qubits").value = n;
        renderBuilderList();
        setStatus($("#builder-status"), "Imported circuit", "ok");
      } catch (err) {
        setStatus($("#builder-status"), "Import failed: " + err.message, "error");
      }
    };
    reader.readAsText(file);
  });

  $("#btn-load").addEventListener("click", () => loadEvidence($("#exp-select").value));
  $("#btn-fail").addEventListener("click", () => {
    if (!currentReport) {
      setStatus($("#runner-status"), "Load a report first.", "error");
      return;
    }
    applyReport(
      corruptForUiDemo(currentReport),
      "UI-ONLY failure demo: display mutated. This is NOT the evidence verifier.",
      "ui_demo"
    );
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
    // Tamper without updating hash
    clone.status = clone.status === "passed" ? "failed" : "passed";
    if (clone.results) clone.results.fidelity = 0.123456;
    const r = await QProofEvidence.verifyReportIntegrity(clone);
    setStatus(
      $("#integrity-status"),
      r.ok
        ? "Unexpected: tampered report still OK (" + r.detail + ")"
        : "Tamper detected (expected): " + r.detail,
      r.ok ? "error" : "ok"
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
    URL.revokeObjectURL(a.href);
  });
  $("#btn-copy-cmd").addEventListener("click", async () => {
    const id = (currentReport && currentReport.experiment_id) || "bell-state-v1";
    const cmd = REPRO_CMDS[id] || "qproof run bell --out report.json";
    try {
      await navigator.clipboard.writeText(cmd);
      setStatus($("#runner-status"), "Copied: " + cmd, "ok");
    } catch {
      setStatus($("#runner-status"), cmd);
    }
  });
  $("#btn-toggle-cap").addEventListener("click", () => {
    const el = $("#cap-raw");
    el.hidden = !el.hidden;
  });
  $("#file-import").addEventListener("change", (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        applyReport(
          JSON.parse(reader.result),
          "Imported local evidence (not re-executed).",
          "import"
        );
      } catch (err) {
        setStatus($("#runner-status"), "Import failed: " + err.message, "error");
      }
    };
    reader.readAsText(file);
  });

  loadCapabilities();
  builderSpec = {
    n_qubits: 2,
    gates: [
      { gate: "H", qubits: [0] },
      { gate: "CNOT", qubits: [0, 1] },
    ],
  };
  renderBuilderList();
  loadEvidence($("#exp-select").value);
})();
