/* QProof workbench — precomputed evidence only; capabilities from registry JSON. */
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
    I: "Identity — no change to the target qubit.",
    X: "Pauli-X (NOT) — flips |0⟩↔|1⟩.",
    Y: "Pauli-Y.",
    Z: "Pauli-Z — phase −1 on |1⟩.",
    H: "Hadamard — |0⟩→(|0⟩+|1⟩)/√2.",
    S: "S gate — phase +i on |1⟩.",
    T: "T gate — phase e^{iπ/4} on |1⟩.",
    RX: "Rotation about X by theta radians.",
    RY: "Rotation about Y by theta radians.",
    RZ: "Rotation about Z by theta radians.",
    CNOT: "Controlled-NOT — flip target if control is |1⟩.",
    CZ: "Controlled-Z — phase −1 if both qubits are |1⟩.",
  };

  let currentReport = null;
  let capabilities = null;

  const $ = (sel) => document.querySelector(sel);

  function basisLabel(i, n) {
    return "|" + i.toString(2).padStart(n, "0") + "⟩";
  }

  function setStatus(el, text, cls) {
    el.textContent = text;
    el.className = "runner-status" + (cls ? " " + cls : "");
  }

  function renderCapabilities(cap) {
    capabilities = cap;
    const sim = cap.simulator || {};
    const modes = (cap.execution_modes || [])
      .map((m) => m.id + (m.available ? " ✓" : " ✗"))
      .join(", ");
    $("#cap-summary").innerHTML = [
      ["Software", cap.software],
      ["Max qubits", sim.max_qubits],
      ["Ordering", sim.qubit_ordering],
      ["Evidence schema", (cap.evidence_schema || {}).version],
      ["Modes", modes],
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
      btn.title = (meta.params || []).length ? name + "(theta)" : name;
      btn.addEventListener("click", () => explainGate(name));
      palette.appendChild(btn);
    });
    $("#cap-raw").textContent = JSON.stringify(cap, null, 2);

    const gal = $("#gallery-list");
    gal.innerHTML = "";
    (cap.examples || []).forEach((ex) => {
      const div = document.createElement("div");
      div.className = "meta-item";
      div.innerHTML = `<span class="k">${ex.id}</span><span class="v">${ex.role}</span>`;
      gal.appendChild(div);
    });
  }

  function renderCircuit(spec, nQubits) {
    const host = $("#circuit-viz");
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
        const gate = g.gate;
        if (gate !== "CNOT" && gate !== "CZ" && g.qubits[0] === q) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "gate-box";
          btn.textContent = gate + (g.theta != null ? "(θ)" : "");
          btn.addEventListener("click", () => explainGate(gate));
          line.appendChild(btn);
        } else if (gate === "CNOT" && g.qubits[0] === q) {
          const d = document.createElement("span");
          d.className = "ctrl-dot";
          d.tabIndex = 0;
          d.addEventListener("click", () => explainGate("CNOT"));
          line.appendChild(d);
        } else if (gate === "CNOT" && g.qubits[1] === q) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "gate-box cnot";
          btn.textContent = "⊕";
          btn.addEventListener("click", () => explainGate("CNOT"));
          line.appendChild(btn);
        } else if (gate === "CZ" && g.qubits.includes(q)) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "gate-box";
          btn.textContent = "CZ";
          btn.addEventListener("click", () => explainGate("CZ"));
          line.appendChild(btn);
        }
      });
      row.appendChild(lab);
      row.appendChild(line);
      host.appendChild(row);
    }
  }

  function explainGate(name) {
    $("#gate-explain").textContent = GATE_HELP[name] || "Gate: " + name;
  }

  function renderMeta(report) {
    const c = report.circuit;
    $("#circuit-meta").innerHTML = [
      ["Qubits", c.n_qubits],
      ["Gates", c.gate_count],
      ["Depth", c.depth],
      ["Shots", report.execution.shots],
      ["Seed", report.execution.seed ?? "—"],
      ["Mode", report.execution.mode],
    ]
      .map(
        ([k, v]) =>
          `<div class="meta-item"><span class="k">${k}</span><span class="v">${v}</span></div>`
      )
      .join("");
  }

  function renderAmplitudes(report) {
    const n = report.circuit.n_qubits;
    const tbody = $("#amp-table tbody");
    tbody.innerHTML = "";
    const obs = report.results.observed_amplitudes || [];
    const probs = report.results.observed_probabilities || [];
    obs.forEach((a, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${basisLabel(i, n)}</td><td>${a[0].toFixed(6)}</td><td>${a[1].toFixed(6)}</td><td>${(probs[i] ?? 0).toFixed(6)}</td>`;
      tbody.appendChild(tr);
    });
  }

  function renderProbs(report) {
    const host = $("#prob-bars");
    host.innerHTML = "";
    const n = report.circuit.n_qubits;
    const expected = report.results.expected_probabilities || [];
    const counts = report.results.measurement_counts || {};
    const shots = report.execution.shots || 0;
    expected.forEach((p, i) => {
      const bit = i.toString(2).padStart(n, "0");
      const obs = shots ? (counts[bit] || 0) / shots : p;
      const row = document.createElement("div");
      row.className = "prob-row";
      row.innerHTML = `
        <span class="bar-label">|${bit}⟩</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(p, obs) * 100}%"></div></div>
        <span class="bar-label">p=${p.toFixed(3)}${shots ? " · n=" + (counts[bit] || 0) : ""}</span>`;
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
      tr.innerHTML = `<td>${c.name}</td><td class="${cls}">${c.status.toUpperCase()}</td><td>${c.detail}</td><td>${c.tolerance != null ? c.tolerance : "—"}</td>`;
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
      ["Hash", ((report.integrity || {}).report_hash || "").slice(0, 20) + "…"],
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
    badge.textContent = report.status.toUpperCase();
    badge.className =
      "badge " +
      (report.status === "passed"
        ? "pass"
        : report.status === "failed"
          ? "fail"
          : "inconclusive");
    $("#badge-experiment").textContent = report.experiment_id;
    $("#badge-experiment").className = "badge";
    $("#badge-fidelity").textContent =
      "F = " + Number(report.results.fidelity).toFixed(12);
    $("#badge-fidelity").className = "badge";
    $("#circuit-caption").textContent =
      report.experiment_id + " — " + (report.description || "");
  }

  function applyReport(report, note) {
    if (!report || !report.schema_version || !report.checks) {
      throw new Error("Malformed evidence: missing schema_version or checks");
    }
    currentReport = report;
    renderSummary(report);
    renderCircuit(report.circuit.spec, report.circuit.n_qubits);
    renderMeta(report);
    renderAmplitudes(report);
    renderProbs(report);
    renderChecks(report);
    renderEvidence(report);
    setStatus(
      $("#runner-status"),
      note ||
        "Precomputed verified report (classical simulation). Not live browser execution; not hardware.",
      report.status === "passed" ? "ok" : "error"
    );
    $("#evidence-error").hidden = true;
  }

  function corruptForDemo(report) {
    const clone = JSON.parse(JSON.stringify(report));
    clone.status = "failed";
    clone.results.fidelity = 0.5;
    clone.checks = clone.checks.map((c) =>
      c.name === "amplitudes" || c.name === "fidelity"
        ? {
            ...c,
            status: "failed",
            detail: "DEMO: deliberately corrupted (UI only)",
          }
        : c
    );
    clone.experiment_id = report.experiment_id + " (failure demo)";
    return clone;
  }

  async function loadEvidence(url) {
    setStatus($("#runner-status"), "Loading evidence…");
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status + " loading " + url);
      applyReport(await res.json());
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
        "<p class=\"error\">Could not load capabilities.json: " +
        err.message +
        "</p>";
    }
  }

  $("#btn-load").addEventListener("click", () =>
    loadEvidence($("#exp-select").value)
  );
  $("#btn-fail").addEventListener("click", () => {
    if (!currentReport) {
      setStatus($("#runner-status"), "Load a report first.", "error");
      return;
    }
    applyReport(
      corruptForDemo(currentReport),
      "DEMO failure path (UI corruption only). Real verifier rejects hash mismatches."
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
          "Imported local evidence file (not re-executed in browser)."
        );
      } catch (err) {
        setStatus($("#runner-status"), "Import failed: " + err.message, "error");
      }
    };
    reader.readAsText(file);
  });

  loadCapabilities();
  loadEvidence($("#exp-select").value);
})();
