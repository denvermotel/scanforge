// Simula il passaggio di una foto da WhatsApp: lato lungo ridotto a 1600 px e JPEG a
// qualita 0,65 (e a quella qualità il browser campiona i colori in 4:2:0, come l'app).
// Serve a provare il rilevamento su immagini degradate come quelle che arrivano ai clienti.
(function () {
  var MAX_SIDE = 1600;
  var QUALITY = 0.65;

  // Riduce (mai ingrandisce), comprime in JPEG e decodifica il risultato in un canvas nuovo.
  function degrade(canvas) {
    var w = canvas.width, h = canvas.height, tw = w, th = h;
    if (Math.max(w, h) > MAX_SIDE) {
      // Il lato lungo e esattamente 1600: il rapporto si applica solo all'altro.
      if (w >= h) { tw = MAX_SIDE; th = Math.max(1, Math.round(h * MAX_SIDE / w)); }
      else { th = MAX_SIDE; tw = Math.max(1, Math.round(w * MAX_SIDE / h)); }
    }
    var work = document.createElement('canvas');
    work.width = tw; work.height = th;
    var ctx = work.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, tw, th);

    return new Promise(function (resolve, reject) {
      work.toBlob(function (blob) {
        if (!blob) { reject(new Error('toBlob fallito')); return; }
        var url = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function () {
          var out = document.createElement('canvas');
          out.width = img.naturalWidth; out.height = img.naturalHeight;
          out.getContext('2d').drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          resolve(out);
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('decodifica del JPEG fallita'));
        };
        img.src = url;
      }, 'image/jpeg', QUALITY);
    });
  }

  // Legge misure e campionamento della luminanza dal marker SOF di un JPEG.
  // ySampling e fattore orizzontale x verticale della prima componente ('2x2' = 4:2:0).
  function jpegInfo(bytes) {
    var n = bytes.length;
    if (n < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) throw new Error('non è un JPEG');
    var i = 2;
    while (i < n) {
      if (bytes[i] !== 0xFF) throw new Error('marker JPEG non valido alla posizione ' + i);
      while (i < n && bytes[i] === 0xFF) i++;   // byte di riempimento prima del marker
      var m = bytes[i++];
      // Marker senza lunghezza: TEM, RSTn, SOI, EOI
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD8)) continue;
      if (m === 0xD9 || m === 0xDA) break;      // fine immagine o inizio dati: nessun SOF prima
      if (i + 2 > n) break;
      var len = (bytes[i] << 8) | bytes[i + 1];
      // SOF0..SOF15 tranne DHT (C4), JPG (C8) e DAC (CC)
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        if (len < 11 || i + 10 > n) throw new Error('segmento SOF troncato');
        var h = (bytes[i + 3] << 8) | bytes[i + 4];
        var w = (bytes[i + 5] << 8) | bytes[i + 6];
        var comps = bytes[i + 7];
        if (!comps || i + 8 + 3 > n) throw new Error('segmento SOF senza componenti');
        var hv = bytes[i + 9];
        return { w: w, h: h, ySampling: (hv >> 4) + 'x' + (hv & 15) };
      }
      i += len;
    }
    throw new Error('marker SOF non trovato');
  }

  window.Whatsapp = { degrade: degrade, jpegInfo: jpegInfo };
})();
