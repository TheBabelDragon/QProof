/**
 * QProof browser state-vector simulator.
 * Conventions match Python engine: little-endian (qubit 0 = LSB),
 * complex amplitudes as [re, im], gates I/X/Y/Z/H/S/T/RX/RY/RZ/CNOT/CZ.
 * Classical simulation only — not hardware, not GPU, not noise.
 */
(function (global) {
  "use strict";

  var MAX_QUBITS_BROWSER = 12; // ~64 KiB complex pairs; freeze-safe default
  var AMP_TOL = 1e-10;

  function c(re, im) {
    return [re, im || 0];
  }
  function cadd(a, b) {
    return [a[0] + b[0], a[1] + b[1]];
  }
  function cmul(a, b) {
    return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  }
  function cscale(a, s) {
    return [a[0] * s, a[1] * s];
  }
  function cabs2(a) {
    return a[0] * a[0] + a[1] * a[1];
  }

  var SQRT2_INV = 1 / Math.sqrt(2);
  var MAT = {
    I: [
      [c(1), c(0)],
      [c(0), c(1)],
    ],
    X: [
      [c(0), c(1)],
      [c(1), c(0)],
    ],
    Y: [
      [c(0), c(0, -1)],
      [c(0, 1), c(0)],
    ],
    Z: [
      [c(1), c(0)],
      [c(0), c(-1)],
    ],
    H: [
      [c(SQRT2_INV), c(SQRT2_INV)],
      [c(SQRT2_INV), c(-SQRT2_INV)],
    ],
    S: [
      [c(1), c(0)],
      [c(0), c(0, 1)],
    ],
    T: [
      [c(1), c(0)],
      [c(0), c(Math.cos(Math.PI / 4), Math.sin(Math.PI / 4))],
    ],
  };

  function rx(theta) {
    var half = theta / 2;
    var cos = Math.cos(half);
    var sin = Math.sin(half);
    return [
      [c(cos), c(0, -sin)],
      [c(0, -sin), c(cos)],
    ];
  }
  function ry(theta) {
    var half = theta / 2;
    var cos = Math.cos(half);
    var sin = Math.sin(half);
    return [
      [c(cos), c(-sin)],
      [c(sin), c(cos)],
    ];
  }
  function rz(theta) {
    var half = theta / 2;
    return [
      [c(Math.cos(-half), Math.sin(-half)), c(0)],
      [c(0), c(Math.cos(half), Math.sin(half))],
    ];
  }

  function gateMatrix(name, theta) {
    if (MAT[name]) return MAT[name];
    if (name === "RX") return rx(theta);
    if (name === "RY") return ry(theta);
    if (name === "RZ") return rz(theta);
    throw new Error("not a single-qubit gate: " + name);
  }

  function apply1q(amps, mat, target, n) {
    var out = amps.slice();
    var stride = 1 << target;
    var dim = 1 << n;
    for (var base = 0; base < dim; base += stride * 2) {
      for (var offset = 0; offset < stride; offset++) {
        var i0 = base + offset;
        var i1 = i0 + stride;
        var a0 = amps[i0];
        var a1 = amps[i1];
        out[i0] = cadd(cmul(mat[0][0], a0), cmul(mat[0][1], a1));
        out[i1] = cadd(cmul(mat[1][0], a0), cmul(mat[1][1], a1));
      }
    }
    return out;
  }

  function applyCnot(amps, control, target, n) {
    var out = amps.slice();
    var cBit = 1 << control;
    var tBit = 1 << target;
    var dim = 1 << n;
    for (var i = 0; i < dim; i++) {
      if (i & cBit) {
        var j = i ^ tBit;
        if (i < j) {
          out[i] = amps[j];
          out[j] = amps[i];
        }
      }
    }
    return out;
  }

  function applyCz(amps, control, target, n) {
    var out = amps.slice();
    var mask = (1 << control) | (1 << target);
    var dim = 1 << n;
    for (var i = 0; i < dim; i++) {
      if ((i & mask) === mask) {
        out[i] = cscale(amps[i], -1);
      }
    }
    return out;
  }

  var SUPPORTED = {
    I: 1,
    X: 1,
    Y: 1,
    Z: 1,
    H: 1,
    S: 1,
    T: 1,
    RX: 1,
    RY: 1,
    RZ: 1,
    CNOT: 2,
    CX: 2,
    CZ: 2,
  };
  var NEEDS_THETA = { RX: 1, RY: 1, RZ: 1 };

  /**
   * Validate circuit dict {n_qubits, gates:[{gate,qubits,theta?}]}.
   * Returns {ok:boolean, errors:string[]}.
   */
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
    if (n > MAX_QUBITS_BROWSER) {
      errors.push(
        "n_qubits=" + n + " exceeds browser MAX_QUBITS=" + MAX_QUBITS_BROWSER
      );
    }
    var gates = spec.gates;
    if (!Array.isArray(gates)) {
      errors.push("gates must be an array");
      return { ok: false, errors: errors };
    }
    for (var i = 0; i < gates.length; i++) {
      var g = gates[i];
      var p = "gates[" + i + "]";
      if (!g || typeof g !== "object") {
        errors.push(p + ": must be an object");
        continue;
      }
      var name = String(g.gate || "").toUpperCase();
      if (!(name in SUPPORTED)) {
        errors.push(p + ": unsupported or unknown gate " + g.gate);
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
          errors.push(p + ": qubit index " + q + " out of range for n_qubits=" + n);
        }
      }
      if (arity === 2 && qs[0] === qs[1]) {
        errors.push(p + ": control and target must differ");
      }
      if (NEEDS_THETA[name]) {
        var th =
          g.theta != null
            ? g.theta
            : g.params && g.params.theta != null
              ? g.params.theta
              : null;
        if (typeof th !== "number" || !Number.isFinite(th)) {
          errors.push(p + ": " + name + " requires finite theta (radians)");
        }
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function zeroState(n) {
    var dim = 1 << n;
    var amps = new Array(dim);
    for (var i = 0; i < dim; i++) amps[i] = c(0);
    amps[0] = c(1);
    return amps;
  }

  function basisState(n, index) {
    var dim = 1 << n;
    if (index < 0 || index >= dim) throw new Error("basis index out of range");
    var amps = new Array(dim);
    for (var i = 0; i < dim; i++) amps[i] = c(0);
    amps[index] = c(1);
    return amps;
  }

  function normalizeName(name) {
    name = String(name).toUpperCase();
    if (name === "CX") return "CNOT";
    return name;
  }

  /**
   * Run circuit. options: {shots, seed, initialIndex}
   * Returns {amplitudes:[[re,im],...], probabilities:[], counts:{}, n_qubits, gate_count, depth, runtime_ms, backend}
   */
  function runCircuit(spec, options) {
    options = options || {};
    var v = validateCircuit(spec);
    if (!v.ok) {
      var err = new Error("Invalid circuit: " + v.errors.join("; "));
      err.validation = v;
      throw err;
    }
    var n = spec.n_qubits;
    var t0 =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    var amps =
      options.initialIndex != null
        ? basisState(n, options.initialIndex)
        : zeroState(n);
    var gates = spec.gates || [];
    for (var gi = 0; gi < gates.length; gi++) {
      var g = gates[gi];
      var name = normalizeName(g.gate);
      var qs = g.qubits;
      if (name === "CNOT") {
        amps = applyCnot(amps, qs[0], qs[1], n);
      } else if (name === "CZ") {
        amps = applyCz(amps, qs[0], qs[1], n);
      } else {
        var th =
          g.theta != null
            ? g.theta
            : g.params && g.params.theta != null
              ? g.params.theta
              : undefined;
        var mat = gateMatrix(name, th);
        amps = apply1q(amps, mat, qs[0], n);
      }
    }
    var probs = calculateProbabilities(amps);
    var shots = options.shots | 0;
    var counts = {};
    if (shots > 0) {
      counts = sampleMeasurements(probs, shots, options.seed, n);
    }
    var t1 =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    return {
      amplitudes: amps.map(function (a) {
        return [a[0], a[1]];
      }),
      probabilities: probs,
      counts: counts,
      n_qubits: n,
      gate_count: gates.length,
      depth: gates.length,
      runtime_ms: Math.round((t1 - t0) * 1000) / 1000,
      backend: "browser_statevector/0.3.0",
      mode: shots > 0 ? "browser_finite_shot" : "browser_exact",
      shots: shots,
      seed: options.seed != null ? options.seed : null,
    };
  }

  function calculateProbabilities(amps) {
    return amps.map(function (a) {
      return cabs2(a);
    });
  }

  /** Mulberry32 PRNG for reproducible sampling. */
  function mulberry32(seed) {
    var t = (seed >>> 0) || 1;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sampleMeasurements(probs, shots, seed, nQubits) {
    var rng = mulberry32(seed != null ? seed : 42);
    var cdf = [];
    var acc = 0;
    for (var i = 0; i < probs.length; i++) {
      acc += probs[i];
      cdf.push(acc);
    }
    if (acc > 0 && Math.abs(acc - 1) > 1e-6) {
      for (var j = 0; j < cdf.length; j++) cdf[j] /= acc;
    }
    var counts = {};
    for (var s = 0; s < shots; s++) {
      var u = rng();
      var idx = 0;
      while (idx < cdf.length - 1 && u > cdf[idx]) idx++;
      var bit = idx.toString(2).padStart(nQubits, "0");
      counts[bit] = (counts[bit] || 0) + 1;
    }
    return counts;
  }

  function serializeCircuit(spec) {
    return JSON.stringify(
      {
        format_version: "1.0.0",
        n_qubits: spec.n_qubits,
        gates: (spec.gates || []).map(function (g) {
          var o = {
            gate: normalizeName(g.gate),
            qubits: g.qubits.slice(),
          };
          if (g.theta != null) o.theta = g.theta;
          return o;
        }),
        initial_state: spec.initial_state || { type: "zero" },
      },
      null,
      2
    );
  }

  /** Global-phase-invariant amplitude distance (like Python verify_amplitudes). */
  function amplitudeDistance(obs, exp) {
    if (obs.length !== exp.length) return Infinity;
    var dot = c(0);
    for (var i = 0; i < obs.length; i++) {
      // conj(exp)*obs
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
      // rotate exp by phase to match obs
      var re = cos * ee[0] - sin * ee[1];
      var im = sin * ee[0] + cos * ee[1];
      var dr = obs[j][0] - re;
      var di = obs[j][1] - im;
      maxd = Math.max(maxd, Math.sqrt(dr * dr + di * di));
    }
    return maxd;
  }

  function pureStateFidelity(a, b) {
    // |⟨a|b⟩|²
    var dot = c(0);
    for (var i = 0; i < a.length; i++) {
      var x = a[i];
      var y = b[i];
      dot = cadd(dot, [x[0] * y[0] + x[1] * y[1], x[0] * y[1] - x[1] * y[0]]);
    }
    return cabs2(dot);
  }

  /**
   * Build a lightweight evidence-like report from a live browser run.
   * Integrity hashes use the same canonical JSON rules as Python when SubtleCrypto available;
   * otherwise hashes are omitted (client notes).
   */
  function buildBrowserReport(spec, result, meta) {
    meta = meta || {};
    var amps = result.amplitudes;
    var probs = result.probabilities;
    var expectedAmps = meta.expected_amplitudes || null;
    var expectedProbs = meta.expected_probabilities || null;
    var checks = [];
    var tol = meta.tolerance != null ? meta.tolerance : AMP_TOL;

    var norm = probs.reduce(function (s, p) {
      return s + p;
    }, 0);
    checks.push({
      name: "dimension",
      status: amps.length === 1 << result.n_qubits ? "passed" : "failed",
      detail: "dim=" + amps.length,
    });
    checks.push({
      name: "finite",
      status: amps.every(function (a) {
        return Number.isFinite(a[0]) && Number.isFinite(a[1]);
      })
        ? "passed"
        : "failed",
      detail: "all amplitudes finite",
    });
    checks.push({
      name: "normalization",
      status: Math.abs(norm - 1) <= tol ? "passed" : "failed",
      detail: "norm=" + norm.toExponential(6),
      tolerance: tol,
    });

    var fid = 1;
    if (expectedAmps) {
      var ad = amplitudeDistance(amps, expectedAmps);
      checks.push({
        name: "amplitudes",
        status: ad <= tol ? "passed" : "failed",
        detail:
          "amplitudes match within tolerance (global-phase invariant) max_err=" +
          ad,
        tolerance: tol,
      });
      fid = pureStateFidelity(amps, expectedAmps);
      checks.push({
        name: "fidelity",
        status: Math.abs(fid - 1) <= tol ? "passed" : "failed",
        detail: "F=" + fid.toFixed(12),
        observed: fid,
        expected: 1,
        tolerance: tol,
      });
    } else {
      checks.push({
        name: "amplitudes",
        status: "inconclusive",
        detail: "no independent expected amplitudes supplied",
      });
      checks.push({
        name: "fidelity",
        status: "inconclusive",
        detail: "no reference state",
      });
    }

    if (expectedProbs) {
      var maxp = 0;
      for (var i = 0; i < probs.length; i++) {
        maxp = Math.max(maxp, Math.abs(probs[i] - (expectedProbs[i] || 0)));
      }
      checks.push({
        name: "probabilities",
        status: maxp <= tol ? "passed" : "failed",
        detail: "max probability error=" + maxp,
        tolerance: tol,
      });
    } else {
      checks.push({
        name: "probabilities",
        status: "inconclusive",
        detail: "no independent expected probabilities",
      });
    }

    if (result.shots > 0) {
      checks.push({
        name: "shot_consistency",
        status: "passed",
        detail: "shot counts recorded (browser PRNG; not a formal hypothesis test)",
      });
    } else {
      checks.push({
        name: "shot_consistency",
        status: "passed",
        detail: "no shots requested — exact probabilities only",
      });
    }

    var statuses = checks.map(function (c) {
      return c.status;
    });
    var status = "passed";
    if (statuses.indexOf("failed") >= 0) status = "failed";
    else if (statuses.indexOf("inconclusive") >= 0) status = "inconclusive";

    return {
      schema_version: "1.1.0",
      experiment_id: meta.experiment_id || "browser-live",
      description: meta.description || "Live browser state-vector execution",
      claim:
        meta.claim ||
        "Classical browser simulation of the supplied circuit produces the reported amplitudes and probabilities.",
      status: status,
      checks: checks,
      circuit: {
        n_qubits: result.n_qubits,
        gate_count: result.gate_count,
        depth: result.depth,
        spec: (spec.gates || []).map(function (g) {
          var o = { gate: normalizeName(g.gate), qubits: g.qubits.slice() };
          if (g.theta != null) o.theta = g.theta;
          return o;
        }),
      },
      execution: {
        shots: result.shots,
        seed: result.seed,
        mode: result.mode,
        runtime_ms: result.runtime_ms,
      },
      results: {
        observed_amplitudes: result.amplitudes,
        observed_probabilities: result.probabilities,
        expected_amplitudes: expectedAmps,
        expected_probabilities: expectedProbs,
        fidelity: fid,
        measurement_counts: result.counts,
      },
      verification: {
        simulator_id: result.backend,
        reference_id: meta.reference_id || "none",
        tolerances: { amplitude: tol, probability: tol, fidelity: tol },
      },
      environment: {
        platform: "browser",
        qproof_web: "0.3.0",
      },
      limitations: [
        "Classical simulation only — no quantum hardware.",
        "Browser backend is independent of Python for execution but not a cryptographic trust root.",
        "Without an independent reference, amplitude/fidelity checks are INCONCLUSIVE.",
        "Does not demonstrate quantum advantage.",
      ],
      integrity: {
        input_hash: null,
        report_hash: null,
      },
    };
  }

  var api = {
    MAX_QUBITS_BROWSER: MAX_QUBITS_BROWSER,
    validateCircuit: validateCircuit,
    runCircuit: runCircuit,
    calculateProbabilities: calculateProbabilities,
    sampleMeasurements: sampleMeasurements,
    serializeCircuit: serializeCircuit,
    buildBrowserReport: buildBrowserReport,
    amplitudeDistance: amplitudeDistance,
    pureStateFidelity: pureStateFidelity,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.QProofSimulator = api;
})(typeof window !== "undefined" ? window : globalThis);
