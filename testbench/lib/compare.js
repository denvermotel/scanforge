// Confronto pixel per pixel tra due ImageData. Un pixel e' diverso se un qualunque
// canale RGBA differisce: nessuna tolleranza, il banco decide poi cosa e' accettabile.
(function () {
  // diff(a, b) -> { same, sizeMismatch, diffPixels, maxDelta }
  // maxDelta: massima differenza assoluta su un singolo canale (0..255).
  // Con dimensioni diverse non si confrontano i pixel: diffPixels e' -1 e maxDelta 255.
  function diff(a, b) {
    if (a.width !== b.width || a.height !== b.height) {
      return { same: false, sizeMismatch: true, diffPixels: -1, maxDelta: 255 };
    }
    var da = a.data, db = b.data, n = da.length;
    var diffPixels = 0, maxDelta = 0;
    for (var i = 0; i < n; i += 4) {
      var d0 = da[i] - db[i], d1 = da[i + 1] - db[i + 1];
      var d2 = da[i + 2] - db[i + 2], d3 = da[i + 3] - db[i + 3];
      if (d0 || d1 || d2 || d3) {
        diffPixels++;
        if (d0 < 0) d0 = -d0; if (d1 < 0) d1 = -d1;
        if (d2 < 0) d2 = -d2; if (d3 < 0) d3 = -d3;
        var m = d0 > d1 ? d0 : d1;
        if (d2 > m) m = d2;
        if (d3 > m) m = d3;
        if (m > maxDelta) maxDelta = m;
      }
    }
    return { same: diffPixels === 0, sizeMismatch: false, diffPixels: diffPixels, maxDelta: maxDelta };
  }

  function canvasToImageData(canvas) {
    return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  }

  window.Compare = { diff: diff, canvasToImageData: canvasToImageData };
})();
