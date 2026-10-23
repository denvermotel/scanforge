// Metriche di qualità dell'immagine per il banco: bianchezza del fondo, contrasto, scarto di
// colore, blocchettatura, nitidezza, bordi neri. Funziona in Node (require) e nel browser
// (window.Quality). Le immagini sono { data: Uint8ClampedArray RGBA, width, height }.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
  else root.Quality = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // Luminanza con i pesi usati da ScanForge (0..255, in virgola mobile).
  function lumaOf(img) {
    var d = img.data, n = img.width * img.height, out = new Float32Array(n);
    for (var i = 0, p = 0; i < n; i++, p += 4) out[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    return out;
  }

  // Percentile p (0-100) con interpolazione lineare sui valori ordinati.
  function pct(sorted, p) {
    var pos = Math.min(Math.max(p, 0), 100) / 100 * (sorted.length - 1);
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function percentileLuma(img, p) {
    var l = lumaOf(img);
    l.sort();
    return pct(l, p);
  }

  function paperLevel(img) { return percentileLuma(img, 90); }

  function contrastSpread(img) {
    var l = lumaOf(img);
    l.sort();
    return pct(l, 95) - pct(l, 5);
  }

  function stessaDimensione(a, b) {
    if (a.width !== b.width || a.height !== b.height) throw new Error('immagini di dimensioni diverse');
  }

  function rmseLuma(a, b) {
    stessaDimensione(a, b);
    var la = lumaOf(a), lb = lumaOf(b), s = 0;
    for (var i = 0; i < la.length; i++) { var d = la[i] - lb[i]; s += d * d; }
    return Math.sqrt(s / la.length);
  }

  // sRGB 0-255 -> a*, b* di CIELAB (D65).
  var LIN = new Float32Array(256);
  for (var k = 0; k < 256; k++) {
    var c = k / 255;
    LIN[k] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function f(t) { return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116; }
  function lab(r, g, b, out) {
    var R = LIN[r], G = LIN[g], B = LIN[b];
    var fx = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047);
    var fy = f(0.2126729 * R + 0.7151522 * G + 0.0721750 * B);
    var fz = f((0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883);
    out[0] = 500 * (fx - fy);
    out[1] = 200 * (fy - fz);
  }

  // Media della distanza nel piano a*b* (la luminosità non conta: misura la tinta).
  function deltaEab(a, b) {
    stessaDimensione(a, b);
    var da = a.data, db = b.data, n = a.width * a.height, s = 0, pa = [0, 0], pb = [0, 0];
    for (var i = 0, p = 0; i < n; i++, p += 4) {
      lab(da[p], da[p + 1], da[p + 2], pa);
      lab(db[p], db[p + 1], db[p + 2], pb);
      var x = pa[0] - pb[0], y = pa[1] - pb[1];
      s += Math.sqrt(x * x + y * y);
    }
    return s / n;
  }

  // Salto medio sui bordi della griglia 8x8 diviso il salto medio dentro i blocchi: vale circa 1
  // su un'immagine liscia e cresce con le tessere tipiche della compressione JPEG.
  function blockiness(img) {
    var w = img.width, h = img.height, l = lumaOf(img);
    var bs = 0, bn = 0, is = 0, inn = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var v = l[y * w + x];
        if (x > 0) {
          var dx = Math.abs(v - l[y * w + x - 1]);
          if (x % 8 === 0) { bs += dx; bn++; } else { is += dx; inn++; }
        }
        if (y > 0) {
          var dy = Math.abs(v - l[(y - 1) * w + x]);
          if (y % 8 === 0) { bs += dy; bn++; } else { is += dy; inn++; }
        }
      }
    }
    var eps = 1e-6;
    return ((bn ? bs / bn : 0) + eps) / ((inn ? is / inn : 0) + eps);
  }

  // Media del modulo del gradiente sul 10% di pixel con il gradiente più alto (i bordi del testo).
  function sharpnessIndex(img) {
    var w = img.width, h = img.height, l = lumaOf(img);
    if (w < 2 || h < 2) return 0;
    var g = new Float32Array((w - 1) * (h - 1)), n = 0;
    for (var y = 0; y < h - 1; y++) {
      for (var x = 0; x < w - 1; x++) {
        var v = l[y * w + x], dx = l[y * w + x + 1] - v, dy = l[(y + 1) * w + x] - v;
        g[n++] = Math.sqrt(dx * dx + dy * dy);
      }
    }
    g.sort();
    var top = Math.max(1, Math.round(n * 0.1)), s = 0;
    for (var i = n - top; i < n; i++) s += g[i];
    return s / top;
  }

  // Pixel scuri (luminanza < 30) entro marginPx dal bordo: i fili neri lasciati da un ritaglio.
  function darkBorderPixels(img, marginPx) {
    var w = img.width, h = img.height, d = img.data, n = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (x >= marginPx && x < w - marginPx && y >= marginPx && y < h - marginPx) continue;
        var p = (y * w + x) * 4;
        if (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2] < 30) n++;
      }
    }
    return n;
  }

  return {
    lumaOf: lumaOf, percentileLuma: percentileLuma, paperLevel: paperLevel,
    contrastSpread: contrastSpread, rmseLuma: rmseLuma, deltaEab: deltaEab,
    blockiness: blockiness, sharpnessIndex: sharpnessIndex, darkBorderPixels: darkBorderPixels
  };
});
