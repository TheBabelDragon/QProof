/**
 * Canonical serialization + SHA-256 matching qproof.canonical.
 * Numbers: float(format(x, '.15g')) semantics via Number(n.toPrecision(15)) then JSON.
 */
(function (global) {
  "use strict";

  /* Minimal SHA-256 (public domain style) */
  function sha256(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = "length";
    var i, j;
    var result = "";
    var words = [];
    var asciiBitLength = ascii[lengthProperty] * 8;
    var hash = (sha256.h = sha256.h || []);
    var k = (sha256.k = sha256.k || []);
    var primeCounter = k[lengthProperty];
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += "\x80";
    while ((ascii[lengthProperty] % 64) - 56) ascii += "\x00";
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return; // ASCII only for our JSON subset
      words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength;
    for (j = 0; j < words[lengthProperty]; ) {
      var w = words.slice(j, (j += 16));
      var oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15],
          w2 = w[i - 2];
        var a = hash[0],
          e = hash[4];
        var temp1 =
          hash[7] +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & hash[5]) ^ (~e & hash[6])) +
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                  w[i - 7] +
                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                0);
        var temp2 =
          (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
        hash.pop();
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? "0" : "") + b.toString(16);
      }
    }
    return result;
  }

  function normalize(obj) {
    if (obj === null || typeof obj === "string" || typeof obj === "boolean") return obj;
    if (typeof obj === "number") {
      if (!Number.isFinite(obj)) throw new Error("non-finite number");
      // Match Python float(format(x, '.15g'))
      return parseFloat(obj.toPrecision(15));
    }
    if (Array.isArray(obj)) return obj.map(normalize);
    if (typeof obj === "object") {
      var keys = Object.keys(obj).sort();
      var out = {};
      for (var i = 0; i < keys.length; i++) out[keys[i]] = normalize(obj[keys[i]]);
      return out;
    }
    throw new Error("unsupported type");
  }

  function canonicalDumps(obj) {
    return JSON.stringify(normalize(obj));
  }

  function canonicalHash(obj) {
    var raw = canonicalDumps(obj);
    // JSON.stringify produces ASCII for our payloads
    return "sha256:" + sha256(raw);
  }

  function circuitHash(circuit) {
    return canonicalHash({
      n_qubits: circuit.n_qubits,
      spec: circuit.spec || circuit.gates || [],
    });
  }

  function reportHash(report) {
    var body = JSON.parse(JSON.stringify(report));
    if (!body.integrity || typeof body.integrity !== "object") body.integrity = {};
    body.integrity.report_hash = null;
    return canonicalHash(body);
  }

  var api = {
    canonicalDumps: canonicalDumps,
    canonicalHash: canonicalHash,
    circuitHash: circuitHash,
    reportHash: reportHash,
    sha256hex: sha256,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.QProofCanonical = api;
})(typeof window !== "undefined" ? window : globalThis);
