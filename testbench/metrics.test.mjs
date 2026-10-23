import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { quadIoU, cornerError, aspectError, parseEntry, bestMatch, candidates, rotatePct, selfIntersects, halves, foldInfo, foldOrder, orderCorners } = require('./lib/metrics.js');

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const rect = (x0, y0, x1, y1) => ({
  tl: { x: x0, y: y0 }, tr: { x: x1, y: y0 }, br: { x: x1, y: y1 }, bl: { x: x0, y: y1 }
});

test('quadIoU di due quadrilateri uguali vale 1', () => {
  const q = { tl: { x: 10, y: 12 }, tr: { x: 88, y: 8 }, br: { x: 90, y: 85 }, bl: { x: 7, y: 90 } };
  close(quadIoU(q, q), 1, 1e-9);
});

test('quadIoU di due quadrati sfalsati di metà vale 1/3', () => {
  close(quadIoU(rect(0, 0, 100, 100), rect(50, 0, 150, 100)), 1 / 3, 1e-9);
});

test('quadIoU di quadrilateri disgiunti vale 0', () => {
  assert.equal(quadIoU(rect(0, 0, 10, 10), rect(50, 50, 60, 60)), 0);
});

test('quadIoU è simmetrica e non dipende dal verso dei vertici', () => {
  const a = rect(0, 0, 100, 100);
  const b = { tl: { x: 20, y: 10 }, tr: { x: 120, y: 30 }, br: { x: 110, y: 130 }, bl: { x: 10, y: 100 } };
  const inv = (q) => ({ tl: q.bl, tr: q.br, br: q.tr, bl: q.tl });
  const v = quadIoU(a, b);
  assert.ok(v > 0 && v < 1);
  close(quadIoU(b, a), v, 1e-12);
  close(quadIoU(inv(a), b), v, 1e-12);
  close(quadIoU(a, inv(b)), v, 1e-12);
});

test("quadIoU con un quadrilatero contenuto nell'altro è il rapporto delle aree", () => {
  close(quadIoU(rect(0, 0, 100, 100), rect(25, 25, 75, 75)), 0.25, 1e-9);
});

test('quadIoU di un rombo inscritto in un quadrato vale 1/2', () => {
  const rombo = { tl: { x: 50, y: 0 }, tr: { x: 100, y: 50 }, br: { x: 50, y: 100 }, bl: { x: 0, y: 50 } };
  close(quadIoU(rect(0, 0, 100, 100), rombo), 0.5, 1e-9);
});

test('quadIoU con un quadrilatero degenere vale 0', () => {
  const p = { x: 40, y: 40 };
  assert.equal(quadIoU(rect(0, 0, 100, 100), { tl: p, tr: p, br: p, bl: p }), 0);
});

test('cornerError di un quadrilatero con se stesso vale 0', () => {
  const q = rect(5, 5, 95, 90);
  assert.equal(cornerError(q, q), 0);
});

test('cornerError con uno spostamento di 1 punto su x per tutti gli angoli vale 1', () => {
  close(cornerError(rect(5, 5, 95, 90), rect(6, 5, 96, 90)), 1, 1e-12);
});

test('cornerError è la media delle distanze euclidee', () => {
  const a = rect(0, 0, 100, 100);
  const b = { tl: { x: 3, y: 4 }, tr: { x: 100, y: 0 }, br: { x: 100, y: 100 }, bl: { x: 0, y: 100 } };
  close(cornerError(a, b), 5 / 4, 1e-12);
});

test('aspectError di 856x540 contro ID-1 è sotto 0.001', () => {
  assert.ok(aspectError(856, 540, 'ID-1') < 0.001);
});

test('aspectError ordina i lati: 540x856 da lo stesso valore di 856x540', () => {
  assert.equal(aspectError(540, 856, 'ID-1'), aspectError(856, 540, 'ID-1'));
});

test('aspectError di ID-3 usa 125/88', () => {
  close(aspectError(1250, 880, 'ID-3'), 0, 1e-12);
  close(aspectError(1586, 1000, 'ID-1'), 0, 1e-12);
});

test('aspectError rifiuta il tipo sconosciuto e le misure non positive', () => {
  assert.throws(() => aspectError(100, 60, 'A4'), RangeError);
  assert.throws(() => aspectError(0, 60, 'ID-1'), RangeError);
  assert.throws(() => aspectError(100, NaN, 'ID-1'), RangeError);
});

const piegaLibro = { top: { x: 50, y: 0 }, bottom: { x: 50, y: 100 } };

test('parseEntry legge la forma vecchia come un solo riquadro senza rotazione', () => {
  const r = parseEntry({ file: 'a.jpg', tipo: 'ts', corners: rect(10, 10, 90, 60) });
  assert.equal(r.error, undefined);
  assert.equal(r.rotazione, 0);
  assert.equal(r.riquadri.length, 1);
  assert.equal(r.riquadri[0].tipo, 'ts');
  assert.equal(r.riquadri[0].piega, null);
  assert.equal(r.riquadri[0].meta, null);
  assert.deepEqual(r.riquadri[0].quad, rect(10, 10, 90, 60));
});

test('parseEntry accetta le voci vecchie reali: nomi con zeri, cifre e punti', () => {
  const q = rect(10, 10, 90, 60);
  for (const [file, tipo] of [['ci-01.jpg', 'cie'], ['doc-08.png', 'patente'], ['ts-06.jpg', 'ts'],
    ['pass-01.jpg', 'passaporto'], ['doc-10.JPEG', 'cie'], ['a b.c.png', 'ts']]) {
    const r = parseEntry({ file, tipo, corners: q });
    assert.equal(r.error, undefined, file);
    assert.equal(r.file, file);
  }
});

test('parseEntry rifiuta file con percorso, vuoto, con punto iniziale o non stringa e dice il campo', () => {
  const q = rect(10, 10, 90, 60);
  for (const file of ['a/b.jpg', 'a\\b.jpg', '', '.hidden.jpg', 'a\0b.jpg', 5, null, undefined, ['a.jpg']]) {
    const r = parseEntry({ file, tipo: 'ts', corners: q });
    assert.ok(r.error && r.error.startsWith('file:'), String(file) + ' -> ' + r.error);
  }
});

test('parseEntry legge riquadri, rotazione e passaporto con piega: metà derivate', () => {
  const r = parseEntry({
    file: 'b.png', rotazione: 270,
    riquadri: [
      { tipo: 'cie', corners: rect(5, 5, 45, 45) },
      { tipo: 'passaporto', corners: rect(0, 0, 100, 100), piega: piegaLibro }
    ]
  });
  assert.equal(r.error, undefined);
  assert.equal(r.rotazione, 270);
  assert.equal(r.riquadri.length, 2);
  assert.deepEqual(r.riquadri[1].quad, rect(0, 0, 100, 100));
  assert.deepEqual(r.riquadri[1].meta[0], rect(0, 0, 50, 100));
  assert.deepEqual(r.riquadri[1].meta[1], rect(50, 0, 100, 100));
});

test('parseEntry rifiuta rotazione, tipi, piega e riquadri non validi', () => {
  const q = rect(10, 10, 90, 60);
  assert.match(parseEntry({ file: 'a.jpg', rotazione: 45, tipo: 'ts', corners: q }).error, /^rotazione/);
  assert.match(parseEntry({ file: 'a.jpg', riquadri: [] }).error, /^riquadri/);
  assert.match(parseEntry({ file: 'a.jpg', riquadri: Array(7).fill({ tipo: 'ts', corners: q }) }).error, /^riquadri/);
  assert.match(parseEntry({ file: 'a.jpg', riquadri: [{ tipo: 'ts', corners: q, piega: piegaLibro }] }).error, /piega/);
  assert.match(parseEntry({ file: 'a.jpg', riquadri: [{ tipo: 'passaporto', corners: q, piega: { top: { x: 1, y: 1 } } }] }).error, /piega/);
  assert.match(parseEntry({ file: 'a.jpg', tipo: 'xx', corners: q }).error, /tipo/);
  assert.match(parseEntry({ file: 'a.jpg', tipo: 'ts', corners: { tl: { x: 1, y: 1 } } }).error, /corners/);
  assert.match(parseEntry({ file: 'a.jpg', tipo: 'ts' }).error, /corners/);
});

test('bestMatch con un solo riquadro coincide con quadIoU e cornerError', () => {
  const gt = rect(10, 10, 90, 60), det = rect(12, 11, 88, 62);
  const m = bestMatch(det, parseEntry({ file: 'a.jpg', tipo: 'ts', corners: gt }).riquadri);
  assert.equal(m.iou, quadIoU(det, gt));
  assert.equal(m.cornerError, cornerError(det, gt));
  assert.equal(m.minCornerError, cornerError(det, gt));
  assert.equal(m.riquadro, 0);
  assert.equal(m.parte, 'riquadro');
});

test('bestMatch sceglie il riquadro piu vicino tra due documenti', () => {
  const r = parseEntry({
    file: 'a.jpg',
    riquadri: [{ tipo: 'ts', corners: rect(0, 0, 40, 40) }, { tipo: 'cie', corners: rect(55, 50, 95, 95) }]
  }).riquadri;
  const m = bestMatch(rect(56, 51, 94, 94), r);
  assert.equal(m.riquadro, 1);
  assert.ok(m.iou > 0.8);
  assert.equal(m.all.length, 2);
  assert.equal(m.all[0].iou, 0);
});

test('bestMatch del passaporto con piega confronta contorno esterno e metà', () => {
  const r = parseEntry({ file: 'p.jpg', riquadri: [{ tipo: 'passaporto', corners: rect(0, 0, 100, 100), piega: piegaLibro }] }).riquadri;
  assert.deepEqual(candidates(r).map((c) => c.parte), ['esterno', 'metà 1', 'metà 2']);
  const tutto = bestMatch(rect(0, 0, 100, 100), r);
  assert.equal(tutto.parte, 'esterno');
  close(tutto.iou, 1, 1e-9);
  const sx = bestMatch(rect(0, 0, 50, 100), r);
  assert.equal(sx.parte, 'metà 1');
  close(sx.iou, 1, 1e-9);
  close(sx.all[0].iou, 0.5, 1e-9);
});

test('bestMatch senza rilevazione vale null', () => {
  assert.equal(bestMatch(null, [{ tipo: 'ts', quad: rect(0, 0, 10, 10), meta: null }]), null);
});

test('aspectError PASS-SPREAD: due pagine ID-3 affiancate danno rapporto 176/125', () => {
  close(aspectError(1760, 1250, 'PASS-SPREAD'), 0, 1e-12);
  close(aspectError(1250, 1760, 'PASS-SPREAD'), 0, 1e-12);
  assert.ok(aspectError(1000, 1000, 'PASS-SPREAD') > 0.2);   // un quadrato non e uno spread
});

test('selfIntersects vede la X dei vertici scambiati e non segnala un quadrilatero normale', () => {
  const q = rect(10, 10, 90, 90);
  assert.equal(selfIntersects(q), false);
  assert.equal(selfIntersects({ tl: q.tl, tr: q.tr, br: q.bl, bl: q.br }), true);   // bl e br scambiati
  assert.equal(selfIntersects({ tl: q.tr, tr: q.tl, br: q.br, bl: q.bl }), true);   // tl e tr scambiati
  const storto = { tl: { x: 12, y: 8 }, tr: { x: 88, y: 14 }, br: { x: 84, y: 90 }, bl: { x: 9, y: 82 } };
  assert.equal(selfIntersects(storto), false);
});

test('rotatePct ruota in senso orario e quattro giri tornano al punto di partenza', () => {
  assert.deepEqual(rotatePct({ x: 0, y: 0 }, 90), { x: 100, y: 0 });
  assert.deepEqual(rotatePct({ x: 100, y: 0 }, 90), { x: 100, y: 100 });
  assert.deepEqual(rotatePct({ x: 10, y: 20 }, 180), { x: 90, y: 80 });
  assert.deepEqual(rotatePct({ x: 0, y: 0 }, 270), { x: 0, y: 100 });
  let p = { x: 12, y: 34 };
  for (let i = 0; i < 4; i++) p = rotatePct(p, 90);
  assert.deepEqual(p, { x: 12, y: 34 });
  assert.deepEqual(rotatePct(rotatePct({ x: 7, y: 9 }, 90), 270), { x: 7, y: 9 });
});

// ---- passaporto con piega libera: orientamento derivato dalla geometria ----
// Passaporto aperto 176 x 125 mm (spread) in un piano 1760 x 1250 px, a coordinate percentuali.
const px = (w, h) => (p) => ({ x: p.x * w / 100, y: p.y * h / 100 });
const sideLen = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
// Dimensioni di un quadrilatero in pixel: media dei lati opposti.
function quadSize(q, w, h) {
  const f = px(w, h), p = { tl: f(q.tl), tr: f(q.tr), br: f(q.br), bl: f(q.bl) };
  return { w: (sideLen(p.tl, p.tr) + sideLen(p.bl, p.br)) / 2, h: (sideLen(p.tl, p.bl) + sideLen(p.tr, p.br)) / 2 };
}
// Piega verticale: 176 x 125, estremi a metà dei lati superiore e inferiore.
const spreadV = rect(0, 0, 100, 100), foldV = { top: { x: 50, y: 0 }, bottom: { x: 50, y: 100 } };
// Piega orizzontale: 125 x 176, estremi a metà dei lati sinistro e destro.
const spreadH = rect(0, 0, 100, 100), foldH = { top: { x: 0, y: 50 }, bottom: { x: 100, y: 50 } };

test('piega verticale: orientamento v, metà sinistra e destra con rapporto 125/88 e spread 176/125', () => {
  assert.equal(foldInfo(spreadV, foldV).orient, 'v');
  const m = halves(spreadV, foldV);
  assert.deepEqual(m[0], rect(0, 0, 50, 100));
  assert.deepEqual(m[1], rect(50, 0, 100, 100));
  for (const q of m) {
    const d = quadSize(q, 1760, 1250);   // metà: 880 x 1250
    close(aspectError(d.w, d.h, 'ID-3'), 0, 1e-9);
  }
  const t = quadSize(spreadV, 1760, 1250);
  close(aspectError(t.w, t.h, 'PASS-SPREAD'), 0, 1e-9);
});

test('piega orizzontale: orientamento h, metà sopra e sotto con rapporto 125/88 e spread 176/125', () => {
  assert.equal(foldInfo(spreadH, foldH).orient, 'h');
  const m = halves(spreadH, foldH);
  assert.deepEqual(m[0], rect(0, 0, 100, 50));
  assert.deepEqual(m[1], rect(0, 50, 100, 100));
  for (const q of m) {
    const d = quadSize(q, 1250, 1760);   // metà: 1250 x 880
    close(aspectError(d.w, d.h, 'ID-3'), 0, 1e-9);
  }
  const t = quadSize(spreadH, 1250, 1760);
  close(aspectError(t.w, t.h, 'PASS-SPREAD'), 0, 1e-9);
});

test('i nomi top e bottom non contano: gli estremi scambiati danno le stesse metà', () => {
  assert.deepEqual(halves(spreadV, { top: foldV.bottom, bottom: foldV.top }), halves(spreadV, foldV));
  assert.deepEqual(halves(spreadH, { top: foldH.bottom, bottom: foldH.top }), halves(spreadH, foldH));
});

test('foldOrder mette top in alto (verticale) o a sinistra (orizzontale), in qualsiasi ordine', () => {
  const a = foldOrder(spreadV, foldV.bottom, foldV.top);
  assert.deepEqual([a.top, a.bottom, a.orient, a.ok], [foldV.top, foldV.bottom, 'v', true]);
  const b = foldOrder(spreadH, foldH.bottom, foldH.top);
  assert.deepEqual([b.top, b.bottom, b.orient, b.ok], [foldH.top, foldH.bottom, 'h', true]);
});

test('le metà non si incrociano con la piega storta, verticale o orizzontale', () => {
  const quad = { tl: { x: 8, y: 12 }, tr: { x: 93, y: 6 }, br: { x: 90, y: 88 }, bl: { x: 5, y: 95 } };
  const v = halves(quad, { top: { x: 52, y: 8 }, bottom: { x: 46, y: 92 } });
  const h = halves(quad, { top: { x: 6, y: 52 }, bottom: { x: 92, y: 45 } });
  for (const q of [...v, ...h]) assert.equal(selfIntersects(q), false);
  assert.equal(foldInfo(quad, { top: { x: 52, y: 8 }, bottom: { x: 46, y: 92 } }).orient, 'v');
  assert.equal(foldInfo(quad, { top: { x: 6, y: 52 }, bottom: { x: 92, y: 45 } }).orient, 'h');
});

test('piega fra lati non opposti: non valida, nessuna metà, ordine dalla direzione prevalente', () => {
  const lati = { top: { x: 30, y: 0 }, bottom: { x: 70, y: 0 } };   // entrambi sul lato superiore
  assert.equal(foldInfo(spreadV, lati).ok, false);
  assert.equal(halves(spreadV, lati), null);
  const adiacenti = { top: { x: 50, y: 0 }, bottom: { x: 100, y: 50 } };   // alto e destra
  assert.equal(foldInfo(spreadV, adiacenti).ok, false);
  const o = foldOrder(spreadV, { x: 70, y: 0 }, { x: 30, y: 0 });
  assert.deepEqual([o.top.x, o.bottom.x, o.ok], [30, 70, false]);
});

test('parseEntry: piega verticale, orizzontale e voce vecchia verticale danno le metà giuste', () => {
  const v = parseEntry({ file: 'v.jpg', riquadri: [{ tipo: 'passaporto', corners: spreadV, piega: foldV }] }).riquadri[0];
  assert.equal(v.orient, 'v');
  assert.deepEqual(v.meta[0], rect(0, 0, 50, 100));
  const h = parseEntry({ file: 'h.jpg', riquadri: [{ tipo: 'passaporto', corners: spreadH, piega: foldH }] }).riquadri[0];
  assert.equal(h.orient, 'h');
  assert.deepEqual(h.meta[0], rect(0, 0, 100, 50));
  assert.deepEqual(h.meta[1], rect(0, 50, 100, 100));
  // voce vecchia: tm in alto come top, bm in basso come bottom
  const vecchia = parseEntry({ file: 'old.jpg', rotazione: 90, riquadri: [{ tipo: 'passaporto', corners: rect(4, 6, 96, 94), piega: { top: { x: 50, y: 6 }, bottom: { x: 50, y: 94 } } }] });
  assert.equal(vecchia.error, undefined);
  assert.equal(vecchia.riquadri[0].orient, 'v');
  assert.deepEqual(vecchia.riquadri[0].meta[1], rect(50, 6, 96, 94));
});

test('parseEntry: piega non valida si legge ma senza metà, e bestMatch usa solo il contorno', () => {
  const r = parseEntry({ file: 'x.jpg', riquadri: [{ tipo: 'passaporto', corners: spreadV, piega: { top: { x: 20, y: 0 }, bottom: { x: 80, y: 0 } } }] });
  assert.equal(r.error, undefined);
  assert.equal(r.riquadri[0].meta, null);
  assert.equal(r.riquadri[0].orient, null);
  assert.deepEqual(candidates(r.riquadri).map((c) => c.parte), ['esterno']);
});

test('bestMatch del passaporto con piega orizzontale riconosce la metà di sopra', () => {
  const r = parseEntry({ file: 'h.jpg', riquadri: [{ tipo: 'passaporto', corners: spreadH, piega: foldH }] }).riquadri;
  assert.deepEqual(candidates(r).map((c) => c.parte), ['esterno', 'metà 1', 'metà 2']);
  const su = bestMatch(rect(0, 0, 100, 50), r);
  assert.equal(su.parte, 'metà 1');
  close(su.iou, 1, 1e-9);
  close(su.all[0].iou, 0.5, 1e-9);
});

test('orderCorners mette i quattro angoli in senso orario da in alto a sinistra, in qualsiasi ordine di clic', () => {
  const tl = { x: 10, y: 8 }, tr = { x: 95, y: 12 }, br = { x: 90, y: 91 }, bl = { x: 5, y: 88 };
  const attesi = [tl, tr, br, bl];
  const permutazioni = [[0, 1, 2, 3], [3, 2, 1, 0], [2, 0, 3, 1], [1, 3, 0, 2], [0, 2, 1, 3], [3, 0, 2, 1]];
  for (const perm of permutazioni) {
    assert.deepEqual(orderCorners(perm.map((i) => attesi[i])), attesi, perm.join(''));
  }
  const o = orderCorners([tr, bl, tl, br]);
  assert.equal(selfIntersects({ tl: o[0], tr: o[1], br: o[2], bl: o[3] }), false);
});
