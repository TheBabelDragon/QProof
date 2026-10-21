/* QProof frontend — loads verified evidence; no fabricated results. */
(function () {
  "use strict";

  const EVIDENCE_URL = "evidence/bell-state-v1.json";
  const REPRO_CMD = 'qproof run bell --shots 1024 --seed 42 --out report.json';

  const GATE_HELP = {
    H: "Hadamard maps |0⟩ → (|0⟩+|1⟩)/√2 and |1⟩ → (|0⟩−|1⟩)/√2. Creates superposition on the target qubit.",
    CNOT: "Controlled-NOT flips the target when the control is |1⟩. Entangles the two qubits after H on the control.",
  };

  let currentReport = null;

  const $ = (sel) => document.querySelector(sel);

  function basisLabel(i, n) {
    return "|" + i.toString(2).padStart(n, "0") + "⟩";
  }

  function setStatus(el, text, cls) {
    el.textContent = text;
    el.className = "runner-status" + (cls ? " " + cls : "");
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
      spec.forEach((g, idx) => {
        if (g.qubits[0] === q && g.gate !== "CNOT" && g.gate !== "CZ") {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "gate-box";
          btn.textContent = g.gate;
          btn.addEventListener("click", () => explainGate(g.gate));
          line.appendChild(btn);
        } else if (g.gate === "CNOT" && g.qubits[0] === q) {
          const d = document.createElement("span");
          d.className = "ctrl-dot";
          d.title = "CNOT control";
          d.tabIndex = 0;
          d.addEventListener("click", () => explainGate("CNOT"));
          line.appendChild(d);
        } else if (g.gate === "CNOT" && g.qubits[1] === q) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "gate-box cnot";
          btn.textContent = "⊕";
          btn.title = "CNOT target";
          btn.addEventListener("click", () => explainGate("CNOT"));
          line.appendChild(btn);
        }
      });
      row.appendChild(lab);
      row.appendChild(line);
      host.appendChild(row);
    }
  }

  function explainGate(name) {
    $("#gate-explain").textContent = GATE_HELP[name] || ("Gate: " + name);
  }

  function renderMeta(report) {
    const c = report.circuit;
    const items = [
      ["Qubits", c.n_qubits],
      ["Gates", c.gate_count],
      ["Depth", c.depth],
      ["Shots", report.execution.shots],
      ["Seed", report.execution.seed ?? "—"],
      ["Runtime", report.execution.runtime_ms + " ms"],
    ];
    $("#circuit-meta").innerHTML = items
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
    for (let i = 0; i < obs.length; i++) {
      const re = obs[i][0];
      const im = obs[i][1];
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${basisLabel(i, n)}</td><td>${re.toFixed(6)}</td><td>${im.toFixed(6)}</td><td>${(probs[i] ?? 0).toFixed(6)}</td>`;
      tbody.appendChild(tr);
    }
  }

  function renderProbs(report) {
    const host = $("#prob-bars");
    host.innerHTML = "";
    const n = report.circuit.n_qubits;
    const expected = report.results.expected_probabilities || [];
    const counts = report.results.measurement_counts || {};
    const shots = report.execution.shots || 0;
    for (let i = 0; i < expected.length; i++) {
      const bit = i.toString(2).padStart(n, "0");
      const p = expected[i];
      const obs = shots ? (counts[bit] || 0) / shots : p;
      const row = document.createElement("div");
      row.className = "prob-row";
      row.innerHTML = `
        <span class="bar-label">|${bit}⟩</span>
        <div class="bar-track" title="expected ${p.toFixed(4)}, observed ${obs.toFixed(4)}">
          <div class="bar-fill" style="width:${Math.max(p, obs) * 100}%"></div>
        </div>
        <span class="bar-label">p=${p.toFixed(3)}${shots ? ` · n=${counts[bit] || 0}` : ""}</span>`;
      host.appendChild(row);
    }
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
      ["Simulator", report.verification.simulator_id],
      ["Reference", report.verification.reference_id],
      ["Input hash", (report.integrity.input_hash || "").slice(0, 18) + "…"],
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
    explainGate("H");
    setStatus(
      $("#runner-status"),
      note ||
        "Loaded precomputed verified report (classical simulation). Not a live browser execution.",
      report.status === "passed" ? "ok" : "error"
    );
    $("#evidence-error").hidden = true;
  }

  function corruptForDemo(report) {
    const clone = JSON.parse(JSON.stringify(report));
    clone.status = "failed";
    clone.results.observed_amplitudes = [
      [1, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ];
    clone.results.fidelity = 0.5;
    clone.checks = clone.checks.map((c) => {
      if (c.name === "amplitudes" || c.name === "fidelity") {
        return {
          ...c,
          status: "failed",
          detail: "DEMO: deliberately corrupted amplitudes (not a real run)",
        };
      }
      return c;
    });
    clone.experiment_id = report.experiment_id + " (failure demo)";
    return clone;
  }

  async function loadEvidence() {
    setStatus($("#runner-status"), "Loading evidence…");
    try {
      const res = await fetch(EVIDENCE_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status + " loading " + EVIDENCE_URL);
      const data = await res.json();
      applyReport(data);
    } catch (err) {
      setStatus($("#runner-status"), "Failed to load evidence: " + err.message, "error");
      $("#evidence-error").hidden = false;
      $("#evidence-error").textContent = String(err);
      $("#badge-status").textContent = "ERROR";
      $("#badge-status").className = "badge fail";
    }
  }

  $("#btn-load").addEventListener("click", loadEvidence);
  $("#btn-fail").addEventListener("click", () => {
    if (!currentReport) {
      setStatus($("#runner-status"), "Load a report first.", "error");
      return;
    }
    applyReport(
      corruptForDemo(currentReport),
      "DEMO failure path: amplitudes intentionally corrupted in the UI only. Real verifier would reject this."
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
    try {
      await navigator.clipboard.writeText(REPRO_CMD);
      setStatus($("#runner-status"), "Copied: " + REPRO_CMD, "ok");
    } catch {
      setStatus($("#runner-status"), REPRO_CMD);
    }
  });

  loadEvidence();
})();
