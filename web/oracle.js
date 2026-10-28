/**
 * QProof independent browser oracle.
 * Separate gate matrices and apply path from simulator.js production evolution.
 * Conventions: little-endian qubit 0 = LSB; complex amplitudes as [re, im].
 */
(function (global) {
  "use strict";

  var ORACLE_ID = "qproof-oracle-js/1.0.0";
  var ORACLE_VERSION = "1.0.0";
  var MAX_QUBITS = 12;
  var SQRT2_INV = 1 / Math.sqrt(2);

  function c(re, im) { return [re, im || 0]; }
  function cadd(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function cmul(a, b) {
    return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  }
  function cscale(a, s) { return [a[0] * s, a[1] * s]; }
  function cabs2(a) { return a[0] * a[0] + a[1] * a[1]; }

  var MAT = {
    I: [[c(1), c(0)], [c(0), c(1)]],
    X: [[c(0), c(1)], [c(1), c(0)]],
    Y: [[c(0), c(0, -1)], [c(0, 1), c(0)]],
    Z: [[c(1), c(0)], [c(0), c(-1)]],
    H: [[c(SQRT2_INV), c(SQRT2_INV)], [c(SQRT2_INV), c(-SQRT2_INV)]],
    S: [[c(1), c(0)], [c(0), c(0, 1)]],
    T: [[c(1), c(0)], [c(0), c(Math.cos(Math.PI / 4), Math.sin(Math.PI / 4))]],
  };

  function rx(theta) {
    var h = theta / 2, cos = Math.cos(h), sin = Math.sin(h);
    return [[c(cos), c(0, -sin)], [c(0, -sin), c(cos)]];
  }
  function ry(theta) {
    var h = theta / 2, cos = Math.cos(h), sin = Math.sin(h);
    return [[c(cos), c(-sin)], [c(sin), c(cos)]];
  }
  function rz(theta) {
    var h = theta / 2;
    return [
      [c(Math.cos(-h), Math.sin(-h)), c(0)],
      [c(0), c(Math.cos(h), Math.sin(h))],
    ];
  }

  function gateMatrix(name, theta) {
    if (MAT[name]) return MAT[name];
    if (name === "RX") return rx(theta);
    if (name === "RY") return ry(theta);
    if (name === "RZ") return rz(theta);
    throw new Error("oracle: unsupported single-qubit gate " + name);
  }

  function apply1q(amps, mat, target, n) {
    var out = amps.slice();
    var stride = 1 << target;
    var dim = 1 << n;
    for (var base = 0; base < dim; base += stride * 2) {
      for (var offset = 0; offset < stride; offset++) {
        var i0 = base + offset, i1 = i0 + stride;
        var a0 = amps[i0], a1 = amps[i1];
        out[i0] = cadd(cmul(mat[0][0], a0), cmul(mat[0][1], a1));
        out[i1] = cadd(cmul(mat[1][0], a0), cmul(mat[1][1], a1));
      }
    }
    return out;
  }

  function applyCnot(amps, control, target, n) {
    var out = amps.slice();
    var cBit = 1 << control, tBit = 1 << target, dim = 1 << n;
    for (var i = 0; i < dim; i++) {
      if (i & cBit) {
        var j = i ^ tBit;
        if (i < j) { out[i] = amps[j]; out[j] = amps[i]; }
      }
    }
    return out;
  }

  function applyCz(amps, control, target, n) {
    var out = amps.slice();
    var mask = (1 << control) | (1 << target), dim = 1 << n;
    for (var i = 0; i < dim; i++) {
      if ((i & mask) === mask) out[i] = cscale(amps[i], -1);
    }
    return out;
  }

  function zeroState(n) {
    var dim = 1 << n, amps = new Array(dim);
    for (var i = 0; i < dim; i++) amps[i] = c(0);
    amps[0] = c(1);
    return amps;
  }

  function basisState(n, index) {
    var dim = 1 << n;
    if (index < 0 || index >= dim) throw new Error("oracle: basis index out of range");
    var amps = new Array(dim);
    for (var i = 0; i < dim; i++) amps[i] = c(0);
    amps[index] = c(1);
    return amps;
  }

  function normalizeName(name) {
    name = String(name).toUpperCase();
    return name === "CX" ? "CNOT" : name;
  }

  var SUPPORTED = {
    I: 1, X: 1, Y: 1, Z: 1, H: 1, S: 1, T: 1,
    RX: 1, RY: 1, RZ: 1, CNOT: 2, CX: 2, CZ: 2,
  };
  var NEEDS_THETA = { RX: 1, RY: 1, RZ: 1 };

  function validateCircuit(spec) {
    var errors = [];
    if (!spec || typeof spec !== "object") {
      return { ok: false, errors: ["circuit must be an object"] };
    }
    var n = spec.n_qubits;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
      errors.push("n_qubits must be a positive integer");
      return { ok: false, errors: errors };
    }
    if (n > MAX_QUBITS) {
      errors.push("n_qubits=" + n + " exceeds oracle MAX_QUBITS=" + MAX_QUBITS);
    }
    var gates = spec.gates;
    if (!Array.isArray(gates)) {
      errors.push("gates must be an array");
      return { ok: false, errors: errors };
    }
    for (var i = 0; i < gates.length; i++) {
      var g = gates[i];
      var p = "gates[" + i + "]";
      if (!g || typeof g !== "object") { errors.push(p + ": must be an object"); continue; }
      var name = normalizeName(g.gate || "");
      if (!(name in SUPPORTED)) {
        errors.push(p + ": unsupported gate " + g.gate);
        continue;
      }
      var arity = SUPPORTED[name];
      var qs = g.qubits;
      if (!Array.isArray(qs) || qs.length !== arity) {
        errors.push(p + ": " + name + " requires " + arity + " qubit(s)");
        continue;
      }
      for (var qi = 0; qi < qs.length; qi++) {
        var q = qs[qi];
        if (typeof q !== "number" || !Number.isInteger(q) || q < 0 || q >= n) {
          errors.push(p + ": qubit index " + q + " out of range");
        }
      }
      if (arity === 2 && qs[0] === qs[1]) {
        errors.push(p + ": control and target must differ");
      }
      if (NEEDS_THETA[name]) {
        var th = g.theta != null ? g.theta : g.params && g.params.theta != null ? g.params.theta : null;
        if (typeof th !== "number" || !Number.isFinite(th)) {
          errors.push(p + ": " + name + " requires finite theta");
        }
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function runOracle(spec, options) {
    options = options || {};
    var v = validateCircuit(spec);
    if (!v.ok) {
      var err = new Error("Oracle invalid circuit: " + v.errors.join("; "));
      err.validation = v;
      throw err;
    }
    var n = spec.n_qubits;
    var amps =
      options.initialIndex != null
        ? basisState(n, options.initialIndex)
        : zeroState(n);
    var gates = spec.gates || [];
    for (var gi = 0; gi < gates.length; gi++) {
      var g = gates[gi];
      var name = normalizeName(g.gate);
      var qs = g.qubits;
      if (name === "CNOT") amps = applyCnot(amps, qs[0], qs[1], n);
      else if (name === "CZ") amps = applyCz(amps, qs[0], qs[1], n);
      else {
        var th =
          g.theta != null
            ? g.theta
            : g.params && g.params.theta != null
              ? g.params.theta
              : 0;
        amps = apply1q(amps, gateMatrix(name, th), qs[0], n);
      }
    }
    var norm = 0;
    for (var i = 0; i < amps.length; i++) norm += cabs2(amps[i]);
    norm = Math.sqrt(norm);
    if (norm > 0 && Math.abs(norm - 1) > 1e-14) {
      for (var j = 0; j < amps.length; j++) amps[j] = cscale(amps[j], 1 / norm);
      norm = 1;
    }
    var probs = amps.map(cabs2);
    for (var k = 0; k < amps.length; k++) {
      if (!Number.isFinite(amps[k][0]) || !Number.isFinite(amps[k][1])) {
        throw new Error("oracle: non-finite amplitude at index " + k);
      }
    }
    return {
      amplitudes: amps.map(function (a) { return [a[0], a[1]]; }),
      probabilities: probs,
      n_qubits: n,
      oracle_id: ORACLE_ID,
      oracle_version: ORACLE_VERSION,
      normalized: Math.abs(norm - 1) <= 1e-10,
      norm: norm,
      supported_gates: supportedGates(),
    };
  }

  function supportedGates() {
    return ["I", "X", "Y", "Z", "H", "S", "T", "RX", "RY", "RZ", "CNOT", "CZ"];
  }

  function pureFidelity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    var dot = c(0);
    for (var i = 0; i < a.length; i++) {
      var x = a[i], y = b[i];
      dot = cadd(dot, [x[0] * y[0] + x[1] * y[1], x[0] * y[1] - x[1] * y[0]]);
    }
    return cabs2(dot);
  }

  function maxAlignedAmpError(obs, exp) {
    if (!obs || !exp || obs.length !== exp.length) return Infinity;
    var dot = c(0);
    for (var i = 0; i < obs.length; i++) {
      var e = exp[i], o = obs[i];
      dot = cadd(dot, [e[0] * o[0] + e[1] * o[1], e[0] * o[1] - e[1] * o[0]]);
    }
    var phase = Math.atan2(dot[1], dot[0]);
    var cos = Math.cos(phase), sin = Math.sin(phase);
    var maxd = 0;
    for (var j = 0; j < obs.length; j++) {
      var ee = exp[j];
      var re = cos * ee[0] - sin * ee[1];
      var im = sin * ee[0] + cos * ee[1];
      var dr = obs[j][0] - re, di = obs[j][1] - im;
      maxd = Math.max(maxd, Math.sqrt(dr * dr + di * di));
    }
    return maxd;
  }

  function expectedState(spec, options) {
    var r = runOracle(spec, options);
    return {
      amplitudes: r.amplitudes,
      probabilities: r.probabilities,
      oracle_id: r.oracle_id,
      oracle_version: r.oracle_version,
      n_qubits: r.n_qubits,
      normalized: r.normalized,
      norm: r.norm,
    };
  }

  var api = {
    ORACLE_ID: ORACLE_ID,
    ORACLE_VERSION: ORACLE_VERSION,
    MAX_QUBITS: MAX_QUBITS,
    validateCircuit: validateCircuit,
    runOracle: runOracle,
    expectedState: expectedState,
    supportedGates: supportedGates,
    pureFidelity: pureFidelity,
    maxAlignedAmpError: maxAlignedAmpError,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.QProofOracle = api;
})(typeof window !== "undefined" ? window : globalThis);
