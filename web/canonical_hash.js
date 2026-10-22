/**
 * Canonical serialization + SHA-256 matching qproof.canonical.
 *
 * Rules (shared with Python):
 * - Objects: keys sorted lexicographically (manual dumps; do not rely on
 *   JSON.stringify key order — engines reorder integer-index keys).
 * - Arrays: order preserved
 * - Numbers: finite only; 15 significant digits; integral |x|<2^53 as int
 * - Strings: ensure_ascii (non-ASCII as \\uXXXX)
 * - report_hash is set to null before hashing the report body
 * - Hash form: sha256: + lowercase hex
 */
(function (global) {
  "use strict";

  function sha256(ascii) {
    if (typeof process !== "undefined" && process.versions && process.versions.node) {
      try {
        var req = typeof require !== "undefined" ? require : null;
        if (req) {
          return req("crypto").createHash("sha256").update(ascii, "utf8").digest("hex");
        }
      } catch (e) {}
    }
    function toBytes(str) {
      var out = [];
      for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) {
          out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        } else {
          out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        }
      }
      return out;
    }
    function rotr(n, x) {
      return (x >>> n) | (x << (32 - n));
    }
    var K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var bytes = toBytes(ascii);
    var l = bytes.length;
    var bitLen = l * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (var i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);
    for (var off = 0; off < bytes.length; off += 64) {
      var w = new Array(64);
      for (var t = 0; t < 16; t++) {
        var j = off + t * 4;
        w[t] = (bytes[j] << 24) | (bytes[j+1] << 16) | (bytes[j+2] << 8) | bytes[j+3];
      }
      for (t = 16; t < 64; t++) {
        var s0 = rotr(7, w[t-15]) ^ rotr(18, w[t-15]) ^ (w[t-15] >>> 3);
        var s1 = rotr(17, w[t-2]) ^ rotr(19, w[t-2]) ^ (w[t-2] >>> 10);
        w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
        var S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var hex = "";
    for (var i = 0; i < 8; i++) {
      var v = H[i] >>> 0;
      hex += ("00000000" + v.toString(16)).slice(-8);
    }
    return hex;
  }

  function normalizeNumber(obj) {
    if (!Number.isFinite(obj)) throw new Error("non-finite number");
    if (Number.isInteger(obj) && Math.abs(obj) < Math.pow(2, 53)) {
      return obj;
    }
    var f = parseFloat(Number(obj).toPrecision(15));
    if (Number.isInteger(f) && Math.abs(f) < Math.pow(2, 53)) return f;
    return f;
  }

  function normalize(obj) {
    if (obj === null || typeof obj === "string" || typeof obj === "boolean") return obj;
    if (typeof obj === "number") return normalizeNumber(obj);
    if (Array.isArray(obj)) return obj.map(normalize);
    if (typeof obj === "object") {
      var keys = Object.keys(obj).sort();
      var out = {};
      for (var i = 0; i < keys.length; i++) out[keys[i]] = normalize(obj[keys[i]]);
      return out;
    }
    throw new Error("unsupported type");
  }

  function escapeString(str) {
    var out = "";
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c === 0x22) out += '\\"';
      else if (c === 0x5c) out += "\\\\";
      else if (c === 0x08) out += "\\b";
      else if (c === 0x0c) out += "\\f";
      else if (c === 0x0a) out += "\\n";
      else if (c === 0x0d) out += "\\r";
      else if (c === 0x09) out += "\\t";
      else if (c < 0x20) {
        var h = c.toString(16);
        out += "\\u" + "0000".slice(h.length) + h;
      } else if (c >= 0x7f) {
        var hx = c.toString(16);
        out += "\\u" + "0000".slice(hx.length) + hx;
      } else {
        out += str.charAt(i);
      }
    }
    return out;
  }

  function dumpsNormalized(obj) {
    if (obj === null) return "null";
    if (typeof obj === "boolean") return obj ? "true" : "false";
    if (typeof obj === "number") {
      if (!Number.isFinite(obj)) throw new Error("non-finite number");
      if (Object.is(obj, -0)) return "0";
      return String(obj);
    }
    if (typeof obj === "string") return '"' + escapeString(obj) + '"';
    if (Array.isArray(obj)) {
      var parts = [];
      for (var i = 0; i < obj.length; i++) parts.push(dumpsNormalized(obj[i]));
      return "[" + parts.join(",") + "]";
    }
    if (typeof obj === "object") {
      var keys = Object.keys(obj).sort();
      var items = [];
      for (var k = 0; k < keys.length; k++) {
        items.push('"' + escapeString(keys[k]) + '":' + dumpsNormalized(obj[keys[k]]));
      }
      return "{" + items.join(",") + "}";
    }
    throw new Error("unsupported type");
  }

  function canonicalDumps(obj) {
    return dumpsNormalized(normalize(obj));
  }

  function canonicalHash(obj) {
    return "sha256:" + sha256(canonicalDumps(obj));
  }

  function circuitHash(circuit) {
    return canonicalHash({
      n_qubits: circuit.n_qubits,
      spec: circuit.spec || circuit.gates || [],
    });
  }

  function reportHash(report) {
    var body = JSON.parse(JSON.stringify(report));
    if (!body.integrity || typeof body.integrity !== "object") {
      body.integrity = { report_hash: null };
    } else {
      body.integrity = Object.assign({}, body.integrity);
      body.integrity.report_hash = null;
    }
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
