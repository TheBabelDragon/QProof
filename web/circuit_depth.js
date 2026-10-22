/** Parallel-aware circuit depth: gates sharing a qubit cannot share a layer. */
(function (global) {
  "use strict";

  function circuitDepth(gates) {
    if (!gates || !gates.length) return 0;
    // qubit -> last layer index occupied
    var last = {};
    var maxLayer = 0;
    for (var i = 0; i < gates.length; i++) {
      var qs = gates[i].qubits || [];
      var layer = 0;
      for (var j = 0; j < qs.length; j++) {
        var q = qs[j];
        if (last[q] != null) layer = Math.max(layer, last[q] + 1);
      }
      for (var k = 0; k < qs.length; k++) last[qs[k]] = layer;
      maxLayer = Math.max(maxLayer, layer);
    }
    return maxLayer + 1;
  }

  var api = { circuitDepth: circuitDepth };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.QProofDepth = api;
})(typeof window !== "undefined" ? window : globalThis);
