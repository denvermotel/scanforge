// Metriche per confrontare il rilevamento con gli angoli annotati a mano.
// Funziona in Node (require) e nel browser (window.Metrics). Gli angoli sono
// {tl,tr,br,bl}, ciascuno {x,y}, in percentuale dell'immagine come in ScanForge.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
  else root.Metrics = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var KEYS = ['tl', 'tr', 'br', 'bl'];

  function toPoly(q) {
    return KEYS.map(function (k) { return { x: q[k].x, y: q[k].y }; });
  }

  // Area con segno (formula dei lacci): positiva in un verso, negativa nell'altro.
  function signedArea(p) {
    var s = 0;
    for (var i = 0; i < p.length; i++) {
      var a = p[i], b = p[(i + 1) % p.length];
      s += a.x * b.y - b.x * a.y;
    }
    return s / 2;
  }

  // Il taglio di Sutherland-Hodgman richiede lo stesso verso in tutti e due i poligoni.
  function orient(p) {
    return signedArea(p) < 0 ? p.slice().reverse() : p;
  }

  // Taglia il poligono subject con il poligono convesso clip (entrambi con area >= 0).
  function clip(subject, clipPoly) {
    var out = subject;
    for (var i = 0; i < clipPoly.length && out.length; i++) {
      var a = clipPoly[i], b = clipPoly[(i + 1) % clipPoly.length];
      var input = out;
      out = [];
      // Il lato interno e quello a sinistra di a->b (poligono con area positiva).
      var side = function (p) { return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); };
      for (var j = 0; j < input.length; j++) {
        var cur = input[j], prev = input[(j + input.length - 1) % input.length];
        var sc = side(cur), sp = side(prev);
        if (sc >= 0) {
          if (sp < 0) out.push(cross(prev, cur, sp, sc));
          out.push(cur);
        } else if (sp >= 0) {
          out.push(cross(prev, cur, sp, sc));
        }
      }
    }
    return out;
  }

  function cross(p, q, sp, sq) {
    var t = sp / (sp - sq);
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  }

  // Intersezione su unione di due quadrilateri convessi. 0 se uno dei due e degenere.
  function quadIoU(a, b) {
    var pa = orient(toPoly(a)), pb = orient(toPoly(b));
    var areaA = signedArea(pa), areaB = signedArea(pb);
    if (!(areaA > 0) || !(areaB > 0)) return 0;
    var inter = clip(pa, pb);
    var areaI = inter.length >= 3 ? Math.abs(signedArea(inter)) : 0;
    var union = areaA + areaB - areaI;
    return union > 0 ? areaI / union : 0;
  }

  // Media delle distanze euclidee tra gli angoli corrispondenti, nelle unita del
  // piano 100x100 (un punto percentuale = 1).
  function cornerError(a, b) {
    var s = 0;
    KEYS.forEach(function (k) {
      s += Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y);
    });
    return s / 4;
  }

  // PASS-SPREAD: passaporto aperto, le due pagine ID-3 affiancate (176 x 125 mm)
  var RATIO = { 'ID-1': 1.586, 'ID-3': 125 / 88, 'PASS-SPREAD': 176 / 125 };

  // Errore relativo del rapporto lato lungo / lato corto contro quello del formato.
  function aspectError(w, h, kind) {
    if (!Object.prototype.hasOwnProperty.call(RATIO, kind)) throw new RangeError('formato sconosciuto: ' + kind);
    if (!(w > 0) || !(h > 0) || !isFinite(w) || !isFinite(h)) throw new RangeError('misure non valide');
    var r = RATIO[kind];
    return Math.abs(Math.max(w, h) / Math.min(w, h) - r) / r;
  }

  // ---- voci del ground-truth ----
  var TIPI = ['cie', 'patente', 'ts', 'passaporto'];
  var ROTAZIONI = [0, 90, 180, 270];

  function okNum(v) { return typeof v === 'number' && isFinite(v); }
  function okPoint(p) { return !!p && typeof p === 'object' && okNum(p.x) && okNum(p.y); }
  function okQuad(q) {
    return !!q && typeof q === 'object' && KEYS.every(function (k) { return okPoint(q[k]); });
  }

  // Nome file semplice: stringa non vuota, senza separatori di percorso, NUL o punto iniziale.
  // Risponde '' se va bene, altrimenti il motivo.
  function fileProblem(f) {
    if (typeof f !== 'string') return 'file: non è una stringa';
    if (!f) return 'file: vuoto';
    if (f.charAt(0) === '.') return 'file: inizia con un punto';
    if (f.indexOf('/') >= 0 || f.indexOf('\\') >= 0 || f.indexOf('\0') >= 0) return 'file: contiene un percorso';
    return '';
  }

  // I quattro angoli messi in un ordine qualsiasi (come li ha cliccati chi annota) nell'ordine
  // del file [tl, tr, br, bl]: senso orario, a partire dal punto più in alto a sinistra di come
  // la foto è vista (somma x + y minima, a parità il più alto). Ordinando per angolo attorno al
  // baricentro il quadrilatero non si incrocia, qualunque sia l'ordine dei clic.
  function orderCorners(pts) {
    var cx = 0, cy = 0;
    pts.forEach(function (p) { cx += p.x / pts.length; cy += p.y / pts.length; });
    var ring = pts.slice().sort(function (a, b) {
      return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);   // y verso il basso: orario
    });
    var start = 0;
    ring.forEach(function (p, i) {
      var q = ring[start], d = (p.x + p.y) - (q.x + q.y);
      if (d < -1e-9 || (Math.abs(d) <= 1e-9 && p.y < q.y)) start = i;
    });
    return ring.map(function (_, i) { return ring[(i + start) % ring.length]; });
  }

  // ---- piega del passaporto aperto ----
  // La piega è il segmento fra due punti liberi, senza ruoli fissi: può essere verticale
  // (le pagine affiancate, i due estremi vicino ai lati superiore e inferiore del contorno)
  // oppure orizzontale (una pagina sopra l'altra, estremi vicino ai lati sinistro e destro).
  // L'orientamento non si salva: si deriva dalla geometria assegnando ogni estremo al lato del
  // contorno esterno più vicino; i due lati devono essere opposti, altrimenti la piega non è
  // valida. Nel file le chiavi sono piega.top e piega.bottom: top e l'estremo più vicino al
  // lato superiore (piega verticale) o sinistro (orizzontale) di come la foto è vista e
  // bottom l'altro. Le voci con la piega verticale già salvate (top in alto, bottom in basso)
  // restano valide. halves non si affida ai nomi top e bottom: usa i lati.

  function distSeg(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    var t = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  // Lato del contorno più vicino al punto: T (tl-tr), R (tr-br), B (br-bl), L (bl-tl).
  // A parità di distanza vale l'ordine T, R, B, L.
  function nearestSide(c, p) {
    var sides = [['T', c.tl, c.tr], ['R', c.tr, c.br], ['B', c.br, c.bl], ['L', c.bl, c.tl]];
    var best = null, bd = Infinity;
    sides.forEach(function (s) {
      var d = distSeg(p, s[1], s[2]);
      if (d < bd) { bd = d; best = s[0]; }
    });
    return best;
  }

  var OPPOSITE = { T: 'B', B: 'T', L: 'R', R: 'L' };

  // { ok, orient, a, b }: orient 'v' (piega verticale, a sul lato superiore e b sull'inferiore)
  // oppure 'h' (orizzontale, a sul sinistro e b sul destro). Se i due estremi non stanno su
  // lati opposti ok è false e orient, a e b sono null.
  function foldInfo(c, piega) {
    var s1 = nearestSide(c, piega.top), s2 = nearestSide(c, piega.bottom);
    if (OPPOSITE[s1] !== s2) return { ok: false, orient: null, a: null, b: null };
    var first = s1 === 'T' || s1 === 'L';   // l'estremo top è sul lato superiore/sinistro
    var a = first ? piega.top : piega.bottom, b = first ? piega.bottom : piega.top;
    return { ok: true, orient: s1 === 'T' || s1 === 'B' ? 'v' : 'h', a: a, b: b };
  }

  // Dai due estremi in un ordine qualsiasi alla coppia {top, bottom} del file. Se la piega non
  // è valida l'ordine si sceglie sulla direzione prevalente (y per una piega più verticale che
  // orizzontale, altrimenti x).
  function foldOrder(c, p1, p2) {
    var info = foldInfo(c, { top: p1, bottom: p2 });
    if (info.ok) return { ok: true, orient: info.orient, top: info.a, bottom: info.b };
    var vertical = Math.abs(p2.y - p1.y) >= Math.abs(p2.x - p1.x);
    var swap = vertical ? p2.y < p1.y : p2.x < p1.x;
    return { ok: false, orient: null, top: swap ? p2 : p1, bottom: swap ? p1 : p2 };
  }

  // Le due metà derivate del passaporto aperto, ciascuna un quadrilatero (tl, tr, br, bl) che
  // non può incrociarsi: con la piega verticale sinistra e destra, con la orizzontale sopra e
  // sotto. null se la piega non unisce due lati opposti.
  function halves(c, piega) {
    var f = foldInfo(c, piega);
    if (!f.ok) return null;
    if (f.orient === 'v') {
      return [
        { tl: c.tl, tr: f.a, br: f.b, bl: c.bl },
        { tl: f.a, tr: c.tr, br: c.br, bl: f.b }
      ];
    }
    return [
      { tl: c.tl, tr: c.tr, br: f.b, bl: f.a },
      { tl: f.a, tr: f.b, br: c.br, bl: c.bl }
    ];
  }

  // Una voce nella forma vecchia {file, tipo, corners} o nuova {file, rotazione?, riquadri}.
  // Un riquadro è {tipo, corners} e, solo per il passaporto aperto (un documento solo, lo
  // spread con le due pagine), anche piega { top, bottom }: i due estremi della piega, vedi
  // sopra. Risponde { error } con il campo invalido, oppure
  // { file, rotazione, riquadri: [{ tipo, quad, piega, meta, orient }] }: quad sono gli angoli
  // esterni, piega è null oppure i due estremi, meta è null oppure le due metà derivate (null
  // anche con una piega che non unisce due lati opposti), orient è 'v', 'h' oppure null.
  function parseEntry(e) {
    if (!e || typeof e !== 'object') return { error: 'voce: non è un oggetto' };
    var fp = fileProblem(e.file);
    if (fp) return { error: fp };
    var rot = 0;
    if (e.rotazione !== undefined) {
      if (ROTAZIONI.indexOf(e.rotazione) < 0) return { error: 'rotazione: valore non ammesso (' + e.rotazione + ')' };
      rot = e.rotazione;
    }
    var list;
    if (e.riquadri !== undefined) {
      if (!Array.isArray(e.riquadri) || !e.riquadri.length || e.riquadri.length > 6) {
        return { error: 'riquadri: serve una lista da 1 a 6 elementi' };
      }
      list = e.riquadri;
    } else {
      list = [{ tipo: e.tipo, corners: e.corners }];
    }
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var q = list[i], w = list.length > 1 || e.riquadri !== undefined ? 'riquadro ' + (i + 1) + ': ' : '';
      if (!q || typeof q !== 'object') return { error: w + 'non è un oggetto' };
      if (TIPI.indexOf(q.tipo) < 0) return { error: w + 'tipo: valore non ammesso (' + q.tipo + ')' };
      if (!okQuad(q.corners)) return { error: w + 'corners: servono tl, tr, br, bl con x e y numeri' };
      var piega = null, meta = null, orient = null;
      if (q.piega !== undefined) {
        if (q.tipo !== 'passaporto') return { error: w + 'piega: ammessa solo per il passaporto' };
        if (!q.piega || !okPoint(q.piega.top) || !okPoint(q.piega.bottom)) {
          return { error: w + 'piega: servono top e bottom con x e y numeri' };
        }
        piega = { top: q.piega.top, bottom: q.piega.bottom };
        meta = halves(q.corners, piega);
        orient = foldInfo(q.corners, piega).orient;
      }
      out.push({ tipo: q.tipo, quad: q.corners, piega: piega, meta: meta, orient: orient });
    }
    return { file: e.file, rotazione: rot, riquadri: out };
  }

  // Tutti i quadrilateri con cui confrontare una rilevazione: il riquadro, oppure per il
  // passaporto aperto il contorno esterno e le due metà (solo il contorno se la piega non è valida).
  function candidates(riquadri) {
    var out = [];
    riquadri.forEach(function (r, i) {
      if (r.piega) {
        out.push({ riquadro: i, parte: 'esterno', tipo: r.tipo, quad: r.quad });
        (r.meta || []).forEach(function (p, j) {
          out.push({ riquadro: i, parte: 'metà ' + (j + 1), tipo: r.tipo, quad: p });
        });
      } else {
        out.push({ riquadro: i, parte: 'riquadro', tipo: r.tipo, quad: r.quad });
      }
    });
    return out;
  }

  // Rilevazione contro tutti i riquadri: l'IoU migliore con il riquadro e la parte a cui
  // corrisponde, l'errore angoli minimo e il dettaglio di ogni confronto. null senza rilevazione.
  function bestMatch(det, riquadri) {
    if (!det) return null;
    var all = candidates(riquadri).map(function (c) {
      return {
        riquadro: c.riquadro, parte: c.parte, tipo: c.tipo,
        iou: quadIoU(det, c.quad), cornerError: cornerError(det, c.quad)
      };
    });
    if (!all.length) return null;
    var best = all[0], minErr = all[0].cornerError;
    for (var i = 1; i < all.length; i++) {
      if (all[i].iou > best.iou) best = all[i];
      if (all[i].cornerError < minErr) minErr = all[i].cornerError;
    }
    return {
      iou: best.iou, riquadro: best.riquadro, parte: best.parte, tipo: best.tipo,
      cornerError: best.cornerError, minCornerError: minErr, all: all
    };
  }

  function segCross(a, b, c, d) {
    function o(p, q, r) { return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); }
    var d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  // Vero se i lati opposti del quadrilatero (tl,tr,br,bl) si incrociano: vertici in ordine
  // sbagliato, le linee formano una X.
  function selfIntersects(q) {
    return segCross(q.tl, q.tr, q.br, q.bl) || segCross(q.tr, q.br, q.bl, q.tl);
  }

  // Punto in percentuale dopo una rotazione oraria di deg (0, 90, 180, 270) dell'immagine.
  function rotatePct(p, deg) {
    switch (((deg % 360) + 360) % 360) {
      case 90: return { x: 100 - p.y, y: p.x };
      case 180: return { x: 100 - p.x, y: 100 - p.y };
      case 270: return { x: p.y, y: 100 - p.x };
      default: return { x: p.x, y: p.y };
    }
  }

  return {
    quadIoU: quadIoU, cornerError: cornerError, aspectError: aspectError,
    parseEntry: parseEntry, bestMatch: bestMatch, candidates: candidates, rotatePct: rotatePct,
    selfIntersects: selfIntersects, halves: halves, foldInfo: foldInfo, foldOrder: foldOrder, orderCorners: orderCorners
  };
});
