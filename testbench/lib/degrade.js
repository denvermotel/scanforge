// Degrada un'immagine di verità con ombra, rumore e blocchettatura note, per misurare quanto
// il trattamento recupera l'originale. Funziona in Node (require) e nel browser (window.Degrade).
// Deterministico: stesso seme, stessi byte.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
  else root.Degrade = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function rng(seed) {
    var a = (seed | 0) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Fattore moltiplicativo dell'ombra (1 = nessuna ombra) alla posizione normalizzata (u, v).
  function ombra(kind, depth, u, v) {
    if (kind === 'diagonal') return 1 - depth * (u + v) / 2;
    if (kind === 'hand') {
      // Macchia morbida in alto a sinistra, come l'ombra di una mano o del telefono.
      var dx = (u - 0.3) / 0.45, dy = (v - 0.3) / 0.35;
      var t = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      return 1 - depth * t * t * (3 - 2 * t);
    }
    return 1;
  }

  function degrade(truth, spec) {
    var w = truth.width, h = truth.height, src = truth.data;
    var out = new Uint8ClampedArray(src.length);
    var kind = spec.shadow || 'none', depth = spec.shadowDepth || 0;
    var sigma = spec.noise || 0, amp = spec.blocks || 0;
    var rand = rng(spec.seed);
    var gauss = function () {
      var u = Math.max(rand(), 1e-12), v = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    // Un offset costante per blocco 8x8, uguale sui tre canali.
    var bw = Math.ceil(w / 8), bh = Math.ceil(h / 8), off = new Float32Array(bw * bh);
    if (amp) for (var i = 0; i < off.length; i++) off[i] = (rand() * 2 - 1) * amp;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var p = (y * w + x) * 4;
        var f = ombra(kind, depth, w > 1 ? x / (w - 1) : 0, h > 1 ? y / (h - 1) : 0);
        var o = off[(y >> 3) * bw + (x >> 3)];
        for (var c = 0; c < 3; c++) {
          var val = src[p + c] * f + o;
          if (sigma) val += gauss() * sigma;
          out[p + c] = val;
        }
        out[p + 3] = src[p + 3];
      }
    }
    return { data: out, width: w, height: h };
  }

  degrade.degrade = degrade;
  return degrade;
});
