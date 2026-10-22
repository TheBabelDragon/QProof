/* QProof UI handlers — wires controls declared in index.html; load after app.js */
(function (global) {
  "use strict";
  if (global.__qproof_ui_handlers) return;
  global.__qproof_ui_handlers = true;
  var $ = function (s) { return document.querySelector(s); };
  function App() { return global.QProofApp; }
  function setStatus(el, text, cls) {
    var A = App();
    if (A && A.setStatus) A.setStatus(el, text, cls);
    else if (el) { el.textContent = text; el.className = "runner-status" + (cls ? " " + cls : ""); }
  }
  function downloadJSON(obj, filename) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    a.download = filename || "export.json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function removeLastGate() {
    var A = App(); if (!A) return;
    var b = A.getBuilder();
    if (!b.gates.length) { setStatus($("#builder-status"), "No gates to remove.", ""); return; }
    b.gates.pop();
    A.setBuilder(b);
    A.markStale("remove-gate");
    setStatus($("#builder-status"), "Removed last gate \u00b7 " + b.gates.length + " remaining", "ok");
  }
  function moveLastGateUp() {
    var A = App(); if (!A) return;
    var b = A.getBuilder();
    if (b.gates.length < 2) {
      setStatus($("#builder-status"), b.gates.length === 0 ? "No gates to move." : "Need at least two gates to reorder.", "");
      return;
    }
    var n = b.gates.length, tmp = b.gates[n - 1];
    b.gates[n - 1] = b.gates[n - 2];
    b.gates[n - 2] = tmp;
    A.setBuilder(b);
    A.markStale("reorder");
    setStatus($("#builder-status"), "Moved last gate up one position.", "ok");
  }
  function validateCurrentCircuit() {
    var A = App(); if (!A || !global.QProofSimulator) { setStatus($("#builder-status"), "Simulator not loaded", "error"); return; }
    var b = A.getBuilder();
    var v = QProofSimulator.validateCircuit({ format_version: "1.0.0", n_qubits: b.n_qubits, gates: b.gates, initial_state: { type: "zero" } });
    setStatus($("#builder-status"), v.ok ? ("Circuit valid \u00b7 " + b.n_qubits + "q \u00b7 " + b.gates.length + "g") : ("Invalid: " + (v.errors || []).join("; ")), v.ok ? "ok" : "error");
  }
  function exportCircuit() {
    var A = App(); if (!A) return;
    var b = A.getBuilder();
    var spec = { format_version: "1.0.0", n_qubits: b.n_qubits, gates: b.gates, initial_state: { type: "zero" } };
    if (global.QProofSimulator) {
      var v = QProofSimulator.validateCircuit(spec);
      if (!v.ok) { setStatus($("#builder-status"), "Cannot export invalid circuit: " + (v.errors || []).join("; "), "error"); return; }
    }
    downloadJSON(spec, "circuit-" + b.n_qubits + "q-" + b.gates.length + "g.json");
    setStatus($("#builder-status"), "Circuit exported.", "ok");
  }
  function importCircuitFile(file) {
    if (!file) return;
    var A = App(); if (!A) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || typeof data !== "object") throw new Error("circuit must be a JSON object");
        if (typeof data.n_qubits !== "number" || !Number.isInteger(data.n_qubits) || data.n_qubits < 1) throw new Error("n_qubits must be a positive integer");
        if (!Array.isArray(data.gates)) throw new Error("gates must be an array");
        if (global.QProofSimulator) {
          var v = QProofSimulator.validateCircuit(data);
          if (!v.ok) throw new Error((v.errors || []).join("; "));
        }
        A.setBuilder({ n_qubits: data.n_qubits, gates: data.gates });
        A.markStale("import-circuit");
        setStatus($("#builder-status"), "Imported circuit \u00b7 " + data.n_qubits + "q \u00b7 " + data.gates.length + " gates", "ok");
      } catch (e) {
        setStatus($("#builder-status"), "Import failed: " + (e && e.message ? e.message : e), "error");
      }
    };
    reader.onerror = function () { setStatus($("#builder-status"), "Import failed: could not read file", "error"); };
    reader.readAsText(file);
  }
  function importEvidenceFile(file) {
    if (!file) return;
    var A = App();
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (global.QProofEvidence && QProofEvidence.validateStructure) {
          var errs = QProofEvidence.validateStructure(data);
          if (errs && errs.length) { setStatus($("#runner-status"), "Import failed: " + errs.join("; "), "error"); return; }
        } else if (!data || typeof data !== "object" || !data.status) {
          setStatus($("#runner-status"), "Import failed: not a valid evidence report object", "error"); return;
        }
        if (A && A.applyReport) A.applyReport(data, "Imported evidence file");
        else { var raw = $("#evidence-raw"); if (raw) raw.textContent = JSON.stringify(data, null, 2); }
        setStatus($("#runner-status"), "Evidence imported \u00b7 status=" + String(data.status).toUpperCase(), "ok");
      } catch (e) {
        setStatus($("#runner-status"), "Import failed: " + (e && e.message ? e.message : e), "error");
      }
    };
    reader.onerror = function () { setStatus($("#runner-status"), "Import failed: could not read file", "error"); };
    reader.readAsText(file);
  }
  function loadFixture() {
    var path = ($("#exp-select") && $("#exp-select").value) || "";
    if (!path) { setStatus($("#runner-status"), "Select a fixture first.", "error"); return; }
    var A = App();
    setStatus($("#runner-status"), "Loading fixture\u2026", "");
    fetch(path, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status + " for " + path); return r.json(); })
      .then(function (data) {
        if (global.QProofEvidence && QProofEvidence.validateStructure) {
          var errs = QProofEvidence.validateStructure(data);
          if (errs && errs.length) throw new Error(errs.join("; "));
        }
        if (A && A.applyReport) A.applyReport(data, "Loaded fixture " + path);
        else { var raw = $("#evidence-raw"); if (raw) raw.textContent = JSON.stringify(data, null, 2); }
        setStatus($("#runner-status"), "Fixture loaded \u00b7 status=" + String(data.status).toUpperCase(), "ok");
      })
      .catch(function (e) { setStatus($("#runner-status"), "Fixture load failed: " + (e && e.message ? e.message : e), "error"); });
  }
  function addGateSafe() {
    var A = App(); if (!A) return;
    var b = A.getBuilder();
    var name = (($("#gate-pick") || {}).value || "H").toUpperCase();
    var rawQs = (($("#gate-qubits") || {}).value || "0").trim();
    if (!rawQs) { setStatus($("#builder-status"), "Qubit index required.", "error"); return; }
    var qs = rawQs.split(/[,\s]+/).filter(Boolean).map(function (x) { return parseInt(x, 10); });
    if (qs.some(function (q) { return !Number.isInteger(q) || q < 0; })) { setStatus($("#builder-status"), "Invalid qubit index.", "error"); return; }
    if (qs.some(function (q) { return q >= b.n_qubits; })) { setStatus($("#builder-status"), "Qubit index out of range for n_qubits=" + b.n_qubits, "error"); return; }
    var entry = { gate: name, qubits: qs };
    if (name === "RX" || name === "RY" || name === "RZ") {
      var th = parseFloat(($("#gate-theta") || {}).value);
      if (!Number.isFinite(th)) { setStatus($("#builder-status"), "Rotation gate requires a finite \u03b8 (radians).", "error"); return; }
      entry.theta = th;
    }
    if ((name === "CNOT" || name === "CX" || name === "CZ") && qs.length !== 2) { setStatus($("#builder-status"), name + " requires exactly two qubit indices.", "error"); return; }
    if ((name === "CNOT" || name === "CX" || name === "CZ") && qs[0] === qs[1]) { setStatus($("#builder-status"), name + " control and target must differ.", "error"); return; }
    b.gates.push(entry);
    A.setBuilder(b);
    A.markStale("gate");
    setStatus($("#builder-status"), "Added " + name + " [" + qs.join(",") + "]", "ok");
  }
  function on(id, evt, fn) { var el = $("#" + id); if (el) el.addEventListener(evt, fn); }
  function wire() {
    on("btn-remove-last", "click", removeLastGate);
    on("btn-move-up", "click", moveLastGateUp);
    on("btn-validate", "click", validateCurrentCircuit);
    on("btn-export-circ", "click", exportCircuit);
    on("btn-load-fixture", "click", loadFixture);
    on("file-circuit", "change", function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (f) importCircuitFile(f);
      ev.target.value = "";
    });
    on("file-import", "change", function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (f) importEvidenceFile(f);
      ev.target.value = "";
    });
    on("btn-add-gate", "click", function () { addGateSafe(); });
    var A = App();
    if (A) {
      A.removeLastGate = removeLastGate;
      A.moveLastGateUp = moveLastGateUp;
      A.validateCurrentCircuit = validateCurrentCircuit;
      A.exportCircuit = exportCircuit;
      A.importCircuitFile = importCircuitFile;
      A.importEvidenceFile = importEvidenceFile;
      A.loadFixture = loadFixture;
      A.addGateSafe = addGateSafe;
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})(typeof window !== "undefined" ? window : globalThis);
