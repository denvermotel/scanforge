// Immagini sintetiche deterministiche per il banco: una "tessera" (documento) ruotata
// su uno sfondo, con angoli veri noti. Stesso spec = stessi byte, così i confronti
// tra versioni non dipendono da foto reali.
//
// spec = { w, h, angleDeg, bg: 'chiaro'|'scuro', shadow: boolean, cardW, cardH, seed,
//          shadowK?, cxF?, cyF?, book?, extra? }
//   cardW, cardH: dimensioni della tessera come frazione di w e h (0..1).
//   shadowK (facoltativo): scurimento massimo dell'ombra, default 0.35.
//   cxF, cyF (facoltativi): centro della tessera come frazione di w e h, default 0.5.
//   book (facoltativo): invece di una tessera disegna due pagine con una piega (passaporto
//     aperto); cardW e cardH sono le dimensioni del libro intero. true = pagine affiancate,
//     piega verticale; 'v' = pagine una sopra l'altra, piega orizzontale.
//   extra (facoltativo): altre tessere nella stessa immagine, ognuna con
//     { cxF, cyF, cardW, cardH, angleDeg }.
// make(spec) -> { canvas, dataUrl, corners, extra, pages? } con corners = angoli veri in
// percentuale ({tl,tr,br,bl}, ciascuno {x,y}), calcolati dalla geometria e non dal
// rilevamento; extra = angoli delle altre tessere; pages = [sinistra, destra] per il libro
// (corners e' allora il quadrilatero esterno, pages sono le due meta in alto/sinistra e in
// basso/destra) e fold = {top, bottom} gli estremi della piega, con la convenzione del
// ground-truth (top e l'estremo in alto con la piega verticale, a sinistra con la orizzontale).
(function () {
  // Generatore pseudocasuale con seme (mulberry32): rapido e riproducibile.
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

  function rgb(r, g, b) { return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')'; }

  // Disegna il contenuto della tessera nel suo sistema locale (origine al centro).
  function drawCard(ctx, cw, ch, rand) {
    var x0 = -cw / 2, y0 = -ch / 2;
    // carta quasi bianca
    ctx.fillStyle = rgb(246, 244, 238);
    ctx.fillRect(x0, y0, cw, ch);

    // rettangolo colorato in testa (intestazione)
    ctx.fillStyle = rgb(40 + rand() * 120, 60 + rand() * 120, 90 + rand() * 120);
    ctx.fillRect(x0 + cw * 0.06, y0 + ch * 0.06, cw * 0.88, ch * 0.14);

    // "fotografia" a blocchi (griglia 4x3 di colori casuali)
    var px = x0 + cw * 0.06, py = y0 + ch * 0.26, pw = cw * 0.34, ph = ch * 0.34;
    var cols = 4, rows = 3;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        ctx.fillStyle = rgb(30 + rand() * 200, 30 + rand() * 200, 30 + rand() * 200);
        ctx.fillRect(px + c * pw / cols, py + r * ph / rows, pw / cols + 0.5, ph / rows + 0.5);
      }
    }

    // righe di testo: barre grigie di lunghezza variabile
    var lines = 7;
    var tx = x0 + cw * 0.46, tw = cw * 0.48;
    for (var i = 0; i < lines; i++) {
      var len = tw * (0.55 + rand() * 0.45);
      var ty = y0 + ch * 0.27 + i * ch * 0.05;
      ctx.fillStyle = rgb(70 + rand() * 40, 70 + rand() * 40, 70 + rand() * 40);
      ctx.fillRect(tx, ty, len, Math.max(1, ch * 0.022));
    }
    // righe lunghe sotto la fotografia
    for (var j = 0; j < 6; j++) {
      var len2 = cw * 0.88 * (0.6 + rand() * 0.4);
      var ty2 = y0 + ch * 0.68 + j * ch * 0.045;
      ctx.fillStyle = rgb(70 + rand() * 40, 70 + rand() * 40, 70 + rand() * 40);
      ctx.fillRect(x0 + cw * 0.06, ty2, len2, Math.max(1, ch * 0.02));
    }
  }

  function make(spec) {
    var w = spec.w, h = spec.h;
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    var rand = rng(spec.seed);

    // sfondo: tinta unita con un po' di grana per non essere piatto
    var chiaro = spec.bg === 'chiaro';
    var base = chiaro ? [172, 168, 160] : [34, 38, 44];
    ctx.fillStyle = rgb(base[0], base[1], base[2]);
    ctx.fillRect(0, 0, w, h);
    var grains = Math.round(w * h / 400);
    for (var g = 0; g < grains; g++) {
      var d = (rand() - 0.5) * (chiaro ? 24 : 16);
      ctx.fillStyle = rgb(base[0] + d, base[1] + d, base[2] + d);
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3);
    }

    // tessera ruotata attorno al suo centro (di norma quello dell'immagine)
    var cw = spec.cardW * w, ch = spec.cardH * h;
    var cx = (spec.cxF == null ? 0.5 : spec.cxF) * w, cy = (spec.cyF == null ? 0.5 : spec.cyF) * h;
    var ang = spec.angleDeg * Math.PI / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    if (spec.book === 'v') {
      // due pagine una sopra l'altra e una piega scura al centro
      ctx.save(); ctx.translate(0, -ch / 4); drawCard(ctx, cw, ch / 2, rand); ctx.restore();
      ctx.save(); ctx.translate(0, ch / 4); drawCard(ctx, cw, ch / 2, rand); ctx.restore();
      var foldV = ctx.createLinearGradient(0, -ch * 0.03, 0, ch * 0.03);
      foldV.addColorStop(0, 'rgba(0,0,0,0)');
      foldV.addColorStop(0.5, 'rgba(0,0,0,0.45)');
      foldV.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = foldV;
      ctx.fillRect(-cw / 2, -ch * 0.03, cw, ch * 0.06);
    } else if (spec.book) {
      // due pagine affiancate e una piega scura al centro
      ctx.save(); ctx.translate(-cw / 4, 0); drawCard(ctx, cw / 2, ch, rand); ctx.restore();
      ctx.save(); ctx.translate(cw / 4, 0); drawCard(ctx, cw / 2, ch, rand); ctx.restore();
      var fold = ctx.createLinearGradient(-cw * 0.03, 0, cw * 0.03, 0);
      fold.addColorStop(0, 'rgba(0,0,0,0)');
      fold.addColorStop(0.5, 'rgba(0,0,0,0.45)');
      fold.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fold;
      ctx.fillRect(-cw * 0.03, -ch / 2, cw * 0.06, ch);
    } else {
      drawCard(ctx, cw, ch, rand);
    }
    ctx.restore();

    // altre tessere nella stessa immagine
    var extraCards = (spec.extra || []).map(function (e) {
      var ecw = e.cardW * w, ech = e.cardH * h, ecx = e.cxF * w, ecy = e.cyF * h;
      var ea = e.angleDeg * Math.PI / 180;
      ctx.save();
      ctx.translate(ecx, ecy);
      ctx.rotate(ea);
      drawCard(ctx, ecw, ech, rand);
      ctx.restore();
      return { cw: ecw, ch: ech, cx: ecx, cy: ecy, ang: ea };
    });

    // ombra: gradiente diagonale scuro dall'angolo in alto a sinistra (nullo) a
    // quello in basso a destra (massimo), su tutta la scena
    if (spec.shadow) {
      var k = spec.shadowK == null ? 0.35 : spec.shadowK;
      var grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.4, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,' + k + ')');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // angoli veri: i quattro vertici della tessera dopo la rotazione, in percentuale
    function quadOf(ox, oy, a, x0, y0, x1, y1) {
      var cos = Math.cos(a), sin = Math.sin(a);
      function pt(lx, ly) {
        return {
          x: (ox + lx * cos - ly * sin) / w * 100,
          y: (oy + lx * sin + ly * cos) / h * 100
        };
      }
      return { tl: pt(x0, y0), tr: pt(x1, y0), br: pt(x1, y1), bl: pt(x0, y1) };
    }
    var corners = quadOf(cx, cy, ang, -cw / 2, -ch / 2, cw / 2, ch / 2);
    var out = { canvas: canvas, dataUrl: canvas.toDataURL('image/png'), corners: corners };
    if (spec.book === 'v') {
      out.pages = [
        quadOf(cx, cy, ang, -cw / 2, -ch / 2, cw / 2, 0),
        quadOf(cx, cy, ang, -cw / 2, 0, cw / 2, ch / 2)
      ];
      out.fold = { top: out.pages[0].bl, bottom: out.pages[0].br };
    } else if (spec.book) {
      out.pages = [
        quadOf(cx, cy, ang, -cw / 2, -ch / 2, 0, ch / 2),
        quadOf(cx, cy, ang, 0, -ch / 2, cw / 2, ch / 2)
      ];
      out.fold = { top: out.pages[0].tr, bottom: out.pages[0].br };
    }
    out.extra = extraCards.map(function (e) {
      return quadOf(e.cx, e.cy, e.ang, -e.cw / 2, -e.ch / 2, e.cw / 2, e.ch / 2);
    });
    return out;
  }

  // ---- Verità note: immagini RGBA opache senza canvas (anche in Node) ----

  function nuova(w, h, r, g, b) {
    var data = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
    return { data: data, width: w, height: h };
  }

  function rettangolo(img, x, y, rw, rh, c) {
    var x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    var x1 = Math.min(img.width, Math.round(x + rw)), y1 = Math.min(img.height, Math.round(y + rh));
    for (var yy = y0; yy < y1; yy++) {
      for (var xx = x0; xx < x1; xx++) {
        var p = (yy * img.width + xx) * 4;
        img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2];
      }
    }
  }

  // Una riga di testo fatta di parole di glifi stilizzati (steli e barre) alta rh, larga al
  // massimo rw: i bordi sono netti come in un testo stampato, senza usare font.
  function rigaTesto(img, x, y, rw, rh, c, rand) {
    var t = Math.max(1, Math.round(rh * 0.2));
    var gw = Math.max(3, Math.round(rh * 0.55)), pos = x, fine = x + rw;
    while (pos < fine) {
      var glifi = 2 + Math.floor(rand() * 6);
      for (var k = 0; k < glifi && pos < fine; k++) {
        var tipo = Math.floor(rand() * 4), w = Math.min(gw, fine - pos);
        if (tipo === 0) rettangolo(img, pos, y, t, rh, c);
        else if (tipo === 1) {
          rettangolo(img, pos, y + rh * 0.3, t, rh * 0.7, c);
          rettangolo(img, pos + w - t, y + rh * 0.3, t, rh * 0.7, c);
          rettangolo(img, pos, y + rh * 0.3, w, t, c);
        } else if (tipo === 2) {
          rettangolo(img, pos, y + rh * 0.3, w, t, c);
          rettangolo(img, pos, y + rh - t, w, t, c);
          rettangolo(img, pos, y + rh * 0.3, t, rh * 0.7, c);
          rettangolo(img, pos + w - t, y + rh * 0.3, t, rh * 0.7, c);
        } else {
          rettangolo(img, pos, y, t, rh, c);
          rettangolo(img, pos, y + rh * 0.5, w, t, c);
          rettangolo(img, pos, y + rh - t, w, t, c);
        }
        pos += gw + t + 1;
      }
      pos += Math.round(rh * 0.7);
    }
  }

  // Ellisse piena: serve per il ritratto e il timbro.
  function ellisse(img, cx, cy, rx, ry, c) {
    for (var yy = Math.max(0, Math.floor(cy - ry)); yy <= Math.min(img.height - 1, Math.ceil(cy + ry)); yy++) {
      for (var xx = Math.max(0, Math.floor(cx - rx)); xx <= Math.min(img.width - 1, Math.ceil(cx + rx)); xx++) {
        var dx = (xx - cx) / rx, dy = (yy - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          var p = (yy * img.width + xx) * 4;
          img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2];
        }
      }
    }
  }

  function anello(img, cx, cy, r, spessore, c) {
    for (var yy = Math.max(0, Math.floor(cy - r)); yy <= Math.min(img.height - 1, Math.ceil(cy + r)); yy++) {
      for (var xx = Math.max(0, Math.floor(cx - r)); xx <= Math.min(img.width - 1, Math.ceil(cx + r)); xx++) {
        var d = Math.sqrt((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy));
        if (d <= r && d > r - spessore) {
          var p = (yy * img.width + xx) * 4;
          img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2];
        }
      }
    }
  }

  // Tessera a colori (rapporto 1,586 se h = w / 1,586): fondo pastello con disegno
  // ripetitivo fine, fotografia a blocchi con un ritratto scuro, righe di testo scuro.
  function truthCard(w, h, rand) {
    var pastelli = [[208, 228, 214], [226, 214, 232], [236, 226, 200], [205, 222, 238]];
    var base = pastelli[Math.floor(rand() * pastelli.length)];
    var img = nuova(w, h, base[0], base[1], base[2]);
    var u = w / 640;
    var passo = Math.max(3, Math.round(5 * u));
    var d = img.data;
    // Disegno fine ripetuto: due famiglie di diagonali appena più scure del fondo.
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if ((x + y) % passo === 0 || ((x - y) % passo + passo) % passo === 0) {
          var p = (y * w + x) * 4;
          d[p] = base[0] - 14; d[p + 1] = base[1] - 14; d[p + 2] = base[2] - 10;
        }
      }
    }
    // Fascia dell'intestazione, più satura, con il titolo in testo scuro.
    rettangolo(img, 0, h * 0.05, w, h * 0.13, [base[0] - 55, base[1] - 45, base[2] - 40]);
    var scuro = [38, 38, 46];
    rigaTesto(img, w * 0.06, h * 0.085, w * 0.5, Math.max(4, h * 0.07), scuro, rand);
    // Fotografia a blocchi: 6x8 celle di sfondo, poi capelli e viso.
    var fx = w * 0.06, fy = h * 0.26, fw = w * 0.3, fh = h * 0.46;
    var cols = 6, rows = 8;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var t = 70 + rand() * 60;
        rettangolo(img, fx + c * fw / cols, fy + r * fh / rows, fw / cols + 1, fh / rows + 1, [t * 0.9, t * 1.1, t * 1.35]);
      }
    }
    ellisse(img, fx + fw / 2, fy + fh * 0.42, fw * 0.3, fh * 0.34, [44, 34, 30]);
    ellisse(img, fx + fw / 2, fy + fh * 0.48, fw * 0.24, fh * 0.28, [205, 160, 130]);
    rettangolo(img, fx + fw * 0.15, fy + fh * 0.82, fw * 0.7, fh * 0.18, [60, 70, 110]);
    // Righe di testo scuro a destra della fotografia e sotto.
    var rh = Math.max(4, Math.round(h * 0.032));
    for (var i = 0; i < 7; i++) {
      rigaTesto(img, w * 0.42, h * 0.27 + i * rh * 1.7, w * 0.52 * (0.6 + rand() * 0.4), rh, scuro, rand);
    }
    for (var j = 0; j < 3; j++) {
      rigaTesto(img, w * 0.06, h * 0.76 + j * rh * 1.6, w * 0.88 * (0.55 + rand() * 0.45), rh, scuro, rand);
    }
    return img;
  }

  // Foglio bianco 1:1,414 (w x h scelti dal chiamante): righe di testo nero, una riga di
  // testo rosso saturo, una macchia gialla (evidenziatore) sotto due righe e un timbro rosso.
  function truthSheet(w, h, rand) {
    var img = nuova(w, h, 255, 255, 255);
    var nero = [10, 10, 12], rosso = [225, 20, 25], giallo = [255, 238, 0];
    var rh = Math.max(5, Math.round(h * 0.0125));
    var passo = rh * 1.9, mx = w * 0.1, y0 = h * 0.09;
    var righe = Math.floor((h * 0.7 - y0) / passo);
    // La macchia prima del testo, così le lettere restano nere sopra il giallo.
    rettangolo(img, mx, y0 + 8 * passo - rh * 0.4, w * 0.45, passo * 2, giallo);
    for (var i = 0; i < righe; i++) {
      var largo = i === 0 ? 0.4 : 0.8 * (i % 7 === 6 ? 0.5 : 0.9 + rand() * 0.1);
      var rigaH = i === 0 ? rh * 1.5 : rh;
      rigaTesto(img, mx, y0 + i * passo, w * largo, rigaH, i === 14 ? rosso : nero, rand);
    }
    // Timbro: doppio anello con due barre di testo rosso, sotto il testo.
    var cx = w * 0.7, cy = h * 0.84, r = w * 0.09, s = Math.max(2, Math.round(w * 0.008));
    var rossoTimbro = [205, 28, 38];
    anello(img, cx, cy, r, s, rossoTimbro);
    anello(img, cx, cy, r * 0.8, Math.max(1, Math.round(s * 0.6)), rossoTimbro);
    rigaTesto(img, cx - r * 0.55, cy - rh * 0.8, r * 1.1, rh, rossoTimbro, rand);
    rigaTesto(img, cx - r * 0.55, cy + rh * 0.4, r * 1.1, rh, rossoTimbro, rand);
    return img;
  }

  // Verità nota deterministica: kind 'card' o 'sheet', spec { w, h, seed }. L'immagine e'
  // tutto il documento, senza sfondo: serve a misurare il trattamento, non il rilevamento.
  function truth(kind, spec) {
    var rand = rng(spec.seed);
    if (kind === 'card') return truthCard(spec.w, spec.h, rand);
    if (kind === 'sheet') return truthSheet(spec.w, spec.h, rand);
    throw new Error('tipo di verita sconosciuto: ' + kind);
  }

  var api = {
    make: make,
    truth: truth,
    cases: {
      'A-ombra':   { w: 800,  h: 600,  angleDeg: 8,   bg: 'chiaro', shadow: true,  cardW: 0.62, cardH: 0.74, seed: 1 },
      'B-scuro':   { w: 800,  h: 600,  angleDeg: -12, bg: 'scuro',  shadow: false, cardW: 0.62, cardH: 0.74, seed: 2 },
      'C-piccola': { w: 25,   h: 19,   angleDeg: 0,   bg: 'chiaro', shadow: false, cardW: 0.70, cardH: 0.70, seed: 3 },
      'D-wa':      { w: 1600, h: 1200, angleDeg: 5,   bg: 'chiaro', shadow: true,  cardW: 0.62, cardH: 0.74, seed: 4, shadowK: 0.15 },
      // Oltre i 2000 px: la riduzione per la rilevazione deve partire dall'immagine decodificata come nella 0.2
      'E-grande':  { w: 2400, h: 1800, angleDeg: 6,   bg: 'chiaro', shadow: true,  cardW: 0.62, cardH: 0.74, seed: 5, shadowK: 0.2 },
      'F-enorme':  { w: 3000, h: 2250, angleDeg: -7,  bg: 'scuro',  shadow: false, cardW: 0.62, cardH: 0.74, seed: 6 },
      // Sotto i 400 px la rilevazione non riduce e non deve ingrandire
      'G-media':   { w: 300,  h: 225,  angleDeg: 4,   bg: 'chiaro', shadow: false, cardW: 0.62, cardH: 0.74, seed: 7 },
      // Passaporto aperto: due pagine affiancate con una piega (make().pages ha le due pagine)
      'P-libro':   { w: 1200, h: 800,  angleDeg: 3,   bg: 'chiaro', shadow: false, cardW: 0.8,  cardH: 0.85, seed: 8, book: true },
      // Passaporto aperto con le pagine una sopra l'altra: piega orizzontale, foto in verticale
      'P-libro-v': { w: 800,  h: 1200, angleDeg: 3,   bg: 'chiaro', shadow: false, cardW: 0.85, cardH: 0.8,  seed: 10, book: 'v' },
      // Due tessere nella stessa foto (make().extra ha gli angoli della seconda)
      'D2-doppio': { w: 1200, h: 800,  angleDeg: -4,  bg: 'scuro',  shadow: false, cardW: 0.38, cardH: 0.36, seed: 9, cxF: 0.27, cyF: 0.5,
                     extra: [{ cxF: 0.73, cyF: 0.5, cardW: 0.38, cardH: 0.36, angleDeg: 6 }] }
    }
  };
  if (typeof window !== 'undefined') window.Synth = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})();
