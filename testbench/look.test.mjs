import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadLook, loadCore } from './lib/load-core.mjs';

const require = createRequire(import.meta.url);
const Q = require('./lib/quality.js');
const { degrade } = require('./lib/degrade.js');
const Synth = require('./lib/synth.js');

const look = loadLook();

function immagine(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = (x * 7 + y * 3) % 256; data[i + 1] = (x * 5 + y * 11) % 256;
      data[i + 2] = (x + y) % 256; data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

// ops di prova: la rotazione registra gli angoli e restituisce l'immagine com'è
function opsDiProva() {
  const ops = { rotazioni: [] };
  ops.scale = () => { throw new Error('scale non usata'); };
  ops.rotate = (img, deg) => { ops.rotazioni.push(deg); return img; };
  return ops;
}

const angoli = (a, b) => ({ tl: { x: a, y: a }, tr: { x: b, y: a }, br: { x: b, y: b }, bl: { x: a, y: b } });
const base = (extra) => Object.assign({ mode: 'originale', sharpen: 0, contrast: 0, brightness: 0, perspective: true,
  rotFine: 0, keystoneV: 0, keystoneH: 0 }, extra);
const senzaAlfaZero = (img) => { for (let i = 3; i < img.data.length; i += 4) if (img.data[i] === 0) return false; return true; };

test('originale: warp 200x100 con angoli 5/95 dà 180x90 senza alfa 0', () => {
  const out = look.process(immagine(200, 100), { corners: angoli(5, 95), settings: base() }, opsDiProva());
  assert.equal(out.width, 180);
  assert.equal(out.height, 90);
  assert.ok(senzaAlfaZero(out));
});

test('originale: bordi trasparenti dopo il warp diventano bianchi opachi', () => {
  // angolo al 100%: l'ultima colonna campiona fuori dalla sorgente e il warp la lascia trasparente
  const out = look.process(immagine(200, 100), { corners: angoli(5, 100), settings: base() }, opsDiProva());
  assert.ok(senzaAlfaZero(out));
  const x = out.width - 1;
  for (let y = 0; y < out.height; y++) {
    const i = (y * out.width + x) * 4;
    assert.deepEqual(Array.from(out.data.slice(i, i + 4)), [255, 255, 255, 255]);
  }
});

test('originale: senza prospettiva mantiene dimensioni e dati', () => {
  const src = immagine(40, 30);
  const out = look.process(src, { corners: angoli(5, 95), settings: base({ perspective: false }) }, opsDiProva());
  assert.equal(out.width, 40);
  assert.equal(out.height, 30);
  assert.deepEqual(Array.from(out.data), Array.from(src.data));
});

test('originale: non modifica l\'input e restituisce una copia', () => {
  const src = immagine(40, 30);
  const copia = Array.from(src.data);
  const out = look.process(src, { corners: null, settings: base() }, opsDiProva());
  assert.notEqual(out, src);
  assert.notEqual(out.data, src.data);
  assert.deepEqual(Array.from(src.data), copia);
});

test('originale: l\'input con alfa 0 non viene toccato, la copia sì', () => {
  const src = { width: 2, height: 1, data: new Uint8ClampedArray([9, 9, 9, 0, 1, 2, 3, 255]) };
  const out = look.process(src, { corners: null, settings: base({ perspective: false }) }, opsDiProva());
  assert.deepEqual(Array.from(src.data), [9, 9, 9, 0, 1, 2, 3, 255]);
  assert.deepEqual(Array.from(out.data), [255, 255, 255, 255, 1, 2, 3, 255]);
});

test('originale: onStage emette warp, keystone e rotate nell\'ordine', () => {
  const visti = [];
  const ops = opsDiProva();
  look.process(immagine(200, 100), {
    corners: angoli(5, 95), settings: base({ keystoneV: 3, rotFine: 2 }),
    onStage: (nome, ms) => { assert.equal(typeof ms, 'number'); visti.push(nome); }
  }, ops);
  assert.deepEqual(visti, ['warp', 'keystone', 'rotate']);
  assert.deepEqual(ops.rotazioni, [2]);
});

test('originale: senza correzioni non emette stadi inutili', () => {
  const visti = [];
  look.process(immagine(20, 20), { corners: null, settings: base(), onStage: (n) => visti.push(n) }, opsDiProva());
  assert.deepEqual(visti, []);
});

test('mode non valida lancia TypeError', () => {
  assert.throws(() => look.process(immagine(8, 8), { corners: null, settings: base({ mode: 'xyz' }) }, opsDiProva()),
    (e) => e instanceof TypeError && /mode non valida/.test(e.message));
});

test('dal Task 10 ogni modalità è implementata con ogni docType; docType non valido lancia TypeError', () => {
  for (const mode of ['colori', 'grigi', 'bn']) {
    for (const extra of [{}, { docType: 'foglio' }, { docType: 'identita' }]) {
      const out = look.process(immagine(8, 8), { corners: null, settings: base(Object.assign({ mode }, extra)) }, opsDiProva());
      assert.equal(out.width, 8);
    }
    assert.throws(() => look.process(immagine(8, 8), { corners: null, settings: base({ mode, docType: 'abc' }) }, opsDiProva()),
      (e) => e instanceof TypeError && /docType non valido/.test(e.message));
  }
});

test('fillOutside: alfa 0 diventa bianco opaco, sul posto', () => {
  const img = { width: 2, height: 1, data: new Uint8ClampedArray([0, 0, 0, 0, 10, 20, 30, 255]) };
  const out = look.fillOutside(img);
  assert.equal(out, img);
  assert.deepEqual(Array.from(img.data), [255, 255, 255, 255, 10, 20, 30, 255]);
});

// ---- strumenti di filtraggio (look.tools) ----
const T = look.tools;
const costante = (w, h, v) => new Float32Array(w * h).fill(v);
const somma = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };

test('reflectIndex: riflessione ai margini', () => {
  assert.equal(T.reflectIndex(-1, 10), 0);
  assert.equal(T.reflectIndex(10, 10), 9);
  assert.equal(T.reflectIndex(-3, 10), 2);
  assert.equal(T.reflectIndex(12, 10), 7);
  assert.equal(T.reflectIndex(4, 10), 4);
  assert.equal(T.reflectIndex(5, 1), 0);
  assert.equal(T.reflectIndex(-7, 1), 0);
  // indici molto fuori: periodo 2n
  assert.equal(T.reflectIndex(25, 10), T.reflectIndex(5, 10));
  assert.equal(T.reflectIndex(-25, 10), T.reflectIndex(-5, 10));
});

test('lumaOf: Rec.601 su RGBA, lunghezza w*h', () => {
  const img = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 255, 255]) };
  const l = T.lumaOf(img);
  assert.ok(l instanceof Float32Array);
  assert.equal(l.length, 2);
  assert.ok(Math.abs(l[0] - 0.299 * 255) < 1e-3);
  assert.ok(Math.abs(l[1] - 255) < 1e-3);
});

test('boxBlur: costante resta costante, anche con raggio più grande dell\'immagine', () => {
  for (const r of [0, 1, 3, 50]) {
    const out = T.boxBlur(costante(25, 19, 137), 25, 19, r);
    assert.equal(out.length, 25 * 19);
    for (let i = 0; i < out.length; i++) assert.ok(Math.abs(out[i] - 137) < 1e-3, 'r=' + r);
  }
});

test('boxBlur: un impulso conserva la somma (riflessione compresa, impulso al centro)', () => {
  const w = 41, h = 33, src = new Float32Array(w * h);
  src[16 * w + 20] = 1000;
  const out = T.boxBlur(src, w, h, 4);
  assert.ok(Math.abs(somma(out) - 1000) < 1e-3);
  // il massimo è diffuso: nessun valore supera 1000 / 81 (un po' di tolleranza)
  let max = 0; for (const v of out) if (v > max) max = v;
  assert.ok(max <= 1000 / 81 + 1e-3);
});

test('boxBlur: ai margini non scende a zero (riflessione)', () => {
  const w = 30, h = 20, out = T.boxBlur(costante(w, h, 200), w, h, 7);
  assert.ok(out[0] > 199.99 && out[w - 1] > 199.99 && out[(h - 1) * w] > 199.99 && out[w * h - 1] > 199.99);
  // gradiente: l'angolo non viene trascinato verso zero
  const g = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = 100 + x;
  const og = T.boxBlur(g, w, h, 5);
  assert.ok(og[0] > 100 && og[w - 1] < 100 + w);
});

test('boxBlur: raggio 0 restituisce una copia identica', () => {
  const src = Float32Array.from({ length: 12 }, (_, i) => i * 3);
  const out = T.boxBlur(src, 4, 3, 0);
  assert.notEqual(out, src);
  assert.deepEqual(Array.from(out), Array.from(src));
});

test('boxBlur: non modifica la sorgente', () => {
  const src = Float32Array.from({ length: 20 }, (_, i) => i);
  const copia = Array.from(src);
  T.boxBlur(src, 5, 4, 2);
  assert.deepEqual(Array.from(src), copia);
});

test('boxBlur: tempo indipendente dal raggio (2 vs 200 su 1000x1000, entro un fattore 3)', () => {
  const w = 1000, h = 1000, src = new Float32Array(w * h);
  for (let i = 0; i < src.length; i++) src[i] = (i * 31) % 255;
  const tempo = (r) => {
    // mediana di 5 ripetizioni, dopo un giro di riscaldamento, per non dipendere dal rumore del sistema
    T.boxBlur(src, w, h, r);
    const t = [];
    for (let k = 0; k < 5; k++) { const t0 = performance.now(); T.boxBlur(src, w, h, r); t.push(performance.now() - t0); }
    t.sort((a, b) => a - b);
    return t[2];
  };
  const piccolo = tempo(2), grande = tempo(200);
  assert.ok(grande <= piccolo * 3, `raggio 200: ${grande.toFixed(1)} ms, raggio 2: ${piccolo.toFixed(1)} ms`);
});

test('boxBlur: immagini minime senza eccezioni', () => {
  assert.deepEqual(Array.from(T.boxBlur(Float32Array.of(7), 1, 1, 5)), [7]);
  const q = T.boxBlur(Float32Array.of(0, 100, 100, 0), 2, 2, 3);
  assert.equal(q.length, 4);
  for (const v of q) assert.ok(Number.isFinite(v));
  assert.equal(T.boxBlur(new Float32Array(0), 0, 0, 2).length, 0);
});

test('percentileGrid: p=90 con un pixel nero in un mare di 200 dà 200', () => {
  const w = 16, h = 16, src = costante(w, h, 200);
  src[5 * w + 5] = 0;
  const r = T.percentileGrid(src, w, h, 8, 90);
  assert.equal(r.gw, 2);
  assert.equal(r.gh, 2);
  assert.equal(r.grid.length, 4);
  for (const v of r.grid) assert.equal(v, 200);
});

test('percentileGrid: p=0 e p=100 danno minimo e massimo; blocchi parziali ai bordi', () => {
  const w = 10, h = 7, src = new Float32Array(w * h);
  for (let i = 0; i < src.length; i++) src[i] = i;
  const mn = T.percentileGrid(src, w, h, 4, 0), mx = T.percentileGrid(src, w, h, 4, 100);
  assert.equal(mn.gw, 3);
  assert.equal(mn.gh, 2);
  assert.equal(mn.grid[0], 0);
  assert.equal(mx.grid[0], 3 * w + 3);
  // ultimo blocco: colonne 8-9, righe 4-6
  assert.equal(mn.grid[5], 4 * w + 8);
  assert.equal(mx.grid[5], 6 * w + 9);
});

test('percentileGrid: immagini minime senza eccezioni', () => {
  const a = T.percentileGrid(Float32Array.of(42), 1, 1, 16, 90);
  assert.equal(a.gw, 1); assert.equal(a.gh, 1); assert.equal(a.grid[0], 42);
  const b = T.percentileGrid(Float32Array.of(1, 2, 3, 4), 2, 2, 1, 50);
  assert.equal(b.gw, 2); assert.equal(b.gh, 2);
});

test('resizeBilinear: valori costanti restano costanti, in ingrandimento e riduzione', () => {
  for (const [nw, nh] of [[50, 40], [7, 5], [25, 19], [1, 1]]) {
    const out = T.resizeBilinear(costante(25, 19, 90), 25, 19, nw, nh);
    assert.equal(out.length, nw * nh);
    for (const v of out) assert.ok(Math.abs(v - 90) < 1e-3);
  }
});

test('resizeBilinear: il valore medio si conserva entro 1%', () => {
  const w = 60, h = 40, src = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) src[y * w + x] = 100 + 80 * Math.sin(x / 9) + 40 * Math.cos(y / 7);
  const media = (a) => somma(a) / a.length;
  const m0 = media(src);
  for (const [nw, nh] of [[120, 80], [30, 20], [90, 55]]) {
    const m1 = media(T.resizeBilinear(src, w, h, nw, nh));
    assert.ok(Math.abs(m1 - m0) / m0 < 0.01, `${nw}x${nh}: ${m1} contro ${m0}`);
  }
});

test('resizeBilinear: stesse dimensioni restituisce una copia; 1x1 e 2x2 senza eccezioni', () => {
  const src = Float32Array.of(1, 2, 3, 4);
  const out = T.resizeBilinear(src, 2, 2, 2, 2);
  assert.notEqual(out, src);
  assert.deepEqual(Array.from(out), [1, 2, 3, 4]);
  assert.deepEqual(Array.from(T.resizeBilinear(Float32Array.of(5), 1, 1, 3, 3)), Array(9).fill(5));
  const g = T.resizeBilinear(src, 2, 2, 5, 5);
  assert.equal(g.length, 25);
  for (const v of g) assert.ok(v >= 1 - 1e-6 && v <= 4 + 1e-6);
});

test('strumenti in cascata su 25x19 senza eccezioni', () => {
  const w = 25, h = 19;
  const l = T.lumaOf(immagine(w, h));
  const b = T.boxBlur(l, w, h, 40);
  const p = T.percentileGrid(b, w, h, 8, 90);
  const r = T.resizeBilinear(p.grid, p.gw, p.gh, w, h);
  assert.equal(r.length, w * h);
  for (const v of r) assert.ok(Number.isFinite(v));
});

// ---- illuminazione e guadagno ----
const copiaImg = (img) => ({ data: img.data.slice(), width: img.width, height: img.height });
const lumaPx = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const tinta = (w, h, r, g, b) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
  return { data, width: w, height: h };
};

// RMSE della luminanza sui soli pixel che nella verità sono fondo bianco puro.
function rmseFondo(img, verita) {
  const a = img.data, v = verita.data;
  let s = 0, n = 0;
  for (let i = 0; i < v.length; i += 4) {
    if (v[i] === 255 && v[i + 1] === 255 && v[i + 2] === 255) { const d = lumaPx(a, i) - 255; s += d * d; n++; }
  }
  return Math.sqrt(s / n);
}

// Rapporto tra la luminanza dell'immagine e quella della verità sui pixel scelti da "scegli":
// media e coefficiente di variazione (un'illuminazione uniforme dà un rapporto costante).
function rapporto(img, verita, scegli) {
  const a = img.data, v = verita.data, w = verita.width;
  let s = 0, s2 = 0, n = 0;
  for (let i = 0; i < v.length; i += 4) {
    const p = i / 4;
    if (!scegli(p % w, Math.floor(p / w), i)) continue;
    const r = lumaPx(a, i) / Math.max(1, lumaPx(v, i));
    s += r; s2 += r * r; n++;
  }
  const m = s / n;
  return { media: m, cv: Math.sqrt(Math.max(0, s2 / n - m * m)) / m };
}

// Colore più frequente della verità: il fondo pastello della tessera.
function coloreDiFondo(img) {
  const conta = new Map();
  let migliore = 0, chiave = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const k = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    const c = (conta.get(k) || 0) + 1;
    conta.set(k, c);
    if (c > migliore) { migliore = c; chiave = k; }
  }
  return chiave;
}

const foglio = (w, h, ombra) => {
  const t = Synth.truth('sheet', { w, h, seed: 1 });
  return { t, d: degrade(t, { shadow: ombra, shadowDepth: 0.4, noise: 0, blocks: 0, seed: 1 }) };
};
const tessera = (ombra) => {
  const t = Synth.truth('card', { w: 640, h: Math.round(640 / 1.586), seed: 1 });
  return { t, d: degrade(t, { shadow: ombra, shadowDepth: 0.4, noise: 0, blocks: 0, seed: 1 }) };
};
const sulColore = (t, k) => (x, y, i) => ((t.data[i] << 16) | (t.data[i + 1] << 8) | t.data[i + 2]) === k;

test('foglio con ombra diagonale: fondo a bianco e scarto sul fondo ridotto', () => {
  const { t, d } = foglio(600, 424, 'diagonal');
  const prima = rmseFondo(d, t);
  const illum = look.estimateIllumination(d, 'sheet');
  assert.ok(illum instanceof Float32Array);
  assert.equal(illum.length, 600 * 424);
  const out = look.applyGain(copiaImg(d), illum, { target: 255, maxGain: 4 });
  const dopo = rmseFondo(out, t);
  assert.ok(Q.paperLevel(out) >= 252, 'paperLevel ' + Q.paperLevel(out));
  assert.ok(dopo < prima, `rmse fondo ${dopo.toFixed(2)} contro ${prima.toFixed(2)} senza correzione`);
  assert.ok(dopo < prima * 0.2, `rmse fondo ${dopo.toFixed(2)}: correzione insufficiente (prima ${prima.toFixed(2)})`);
});

test('foglio con ombra di mano: scarto sul fondo ridotto', () => {
  const { t, d } = foglio(600, 424, 'hand');
  const prima = rmseFondo(d, t);
  const out = look.applyGain(copiaImg(d), look.estimateIllumination(d, 'sheet'), { target: 255, maxGain: 4 });
  const dopo = rmseFondo(out, t);
  assert.ok(dopo < prima * 0.3, `rmse fondo ${dopo.toFixed(2)} contro ${prima.toFixed(2)}`);
});

test('foglio: l\'evidenziatore giallo non viene scambiato per ombra', () => {
  const { t, d } = foglio(600, 424, 'diagonal');
  const out = look.applyGain(copiaImg(d), look.estimateIllumination(d, 'sheet'), { target: 255, maxGain: 4 });
  // pixel gialli della verità (255, 238, 0): la luminanza resta vicina a quella vera (circa 216)
  const giallo = rapporto(out, t, sulColore(t, (255 << 16) | (238 << 8)));
  assert.ok(Math.abs(giallo.media - 1) < 0.05, 'rapporto sul giallo ' + giallo.media.toFixed(3));
});

test('foglio: la stima a metà risoluzione somiglia a quella piena (parametri relativi al lato lungo)', () => {
  const piena = look.estimateIllumination(foglio(1200, 848, 'diagonal').d, 'sheet');
  const bozza = look.estimateIllumination(foglio(600, 424, 'diagonal').d, 'sheet');
  let s = 0;
  for (let y = 0; y < 424; y++) {
    for (let x = 0; x < 600; x++) {
      const i = 2 * y * 1200 + 2 * x;
      const p = (piena[i] + piena[i + 1] + piena[i + 1200] + piena[i + 1201]) / 4;
      s += Math.abs(p - bozza[y * 600 + x]) / bozza[y * 600 + x];
    }
  }
  assert.ok(s / (600 * 424) < 0.02, 'scarto relativo medio ' + (s / (600 * 424)).toFixed(4));
});

test('tessera con ombra diagonale: tinta conservata e illuminazione equalizzata', () => {
  const { t, d } = tessera('diagonal');
  const illum = look.estimateIllumination(d, 'card');
  const out = look.applyGain(copiaImg(d), illum, { target: 'mean' });
  // deltaEab guarda solo a*b*, che scalano con la luminosità: con target 'mean' il livello medio
  // resta quello della foto in ombra, quindi lo scarto non scende molto; l'uniformità sì.
  const dE = Q.deltaEab(out, t);
  assert.ok(dE < 3, 'deltaEab ' + dE.toFixed(2));
  const suFondo = sulColore(t, coloreDiFondo(t));
  const r0 = rapporto(d, t, suFondo), r1 = rapporto(out, t, suFondo);
  assert.ok(r1.cv < r0.cv * 0.25, `cv sul fondo ${r1.cv.toFixed(4)} contro ${r0.cv.toFixed(4)}`);
});

test('tessera: la fotografia non viene schiarita come se fosse ombra', () => {
  const { t, d } = tessera('diagonal');
  const out = look.applyGain(copiaImg(d), look.estimateIllumination(d, 'card'), { target: 'mean' });
  const w = t.width, h = t.height;
  const foto = (x, y) => x >= w * 0.08 && x < w * 0.34 && y >= h * 0.28 && y < h * 0.7;
  const rf = rapporto(out, t, foto).media, rb = rapporto(out, t, sulColore(t, coloreDiFondo(t))).media;
  assert.ok(Math.abs(rf / rb - 1) < 0.06, `fotografia ${rf.toFixed(3)}, fondo ${rb.toFixed(3)}`);
});

// Per scelta (spec 5.2) sulle tessere si stima solo il gradiente lento: un'ombra di mano
// localizzata si confonde con la fotografia e resta quasi tutta. Qui si controlla che non peggiori.
test('tessera con ombra di mano: non peggiora uniformità e tinta', () => {
  const { t, d } = tessera('hand');
  const out = look.applyGain(copiaImg(d), look.estimateIllumination(d, 'card'), { target: 'mean' });
  const suFondo = sulColore(t, coloreDiFondo(t));
  const r0 = rapporto(d, t, suFondo), r1 = rapporto(out, t, suFondo);
  assert.ok(r1.cv <= r0.cv, `cv sul fondo ${r1.cv.toFixed(4)} contro ${r0.cv.toFixed(4)}`);
  assert.ok(Q.deltaEab(out, t) < 3);
});

test('immagini piatte: nessun NaN, con target mean e lit l\'uscita è uguale all\'ingresso', () => {
  for (const kind of ['sheet', 'card']) {
    for (const [r, g, b] of [[255, 255, 255], [0, 0, 0], [180, 120, 60]]) {
      const src = tinta(40, 30, r, g, b);
      const illum = look.estimateIllumination(src, kind);
      for (const v of illum) assert.ok(Number.isFinite(v) && v > 0, `${kind} ${r},${g},${b}: ${v}`);
      for (const target of ['mean', 'lit']) {
        const out = look.applyGain(copiaImg(src), illum, { target });
        assert.deepEqual(Array.from(out.data), Array.from(src.data), `${kind} ${target} ${r},${g},${b}`);
      }
    }
  }
});

// ---- target 'lit' e trasparenza (fix round 1) ----
const tesseraRumorosa = (seed) => {
  const t = Synth.truth('card', { w: 856, h: 540, seed });
  return { t, d: degrade(t, { shadow: 'diagonal', shadowDepth: 0.4, noise: 6, blocks: 5, seed }) };
};
function statFondo(img, scegli) {
  const a = img.data, w = img.width;
  let s = 0, s2 = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    const p = i / 4;
    if (!scegli(p % w, Math.floor(p / w), i)) continue;
    const l = lumaPx(a, i); s += l; s2 += l * l; n++;
  }
  const m = s / n;
  return { media: m, cv: Math.sqrt(Math.max(0, s2 / n - m * m)) / m };
}

test('tessera con target lit: fondo entro 6 livelli dalla verità, uniforme, mai scurito (5 semi)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { t, d } = tesseraRumorosa(seed);
    const suFondo = sulColore(t, coloreDiFondo(t));
    const out = look.applyGain(copiaImg(d), look.estimateIllumination(d, 'card'), { target: 'lit', maxGain: 3 });
    const v = statFondo(t, suFondo), prima = statFondo(d, suFondo), dopo = statFondo(out, suFondo);
    assert.ok(Math.abs(dopo.media - v.media) < 6, `seme ${seed}: fondo ${dopo.media.toFixed(1)}, verità ${v.media.toFixed(1)}`);
    assert.ok(dopo.cv < prima.cv * 0.5, `seme ${seed}: cv ${dopo.cv.toFixed(4)} contro ${prima.cv.toFixed(4)}`);
    for (let i = 0; i < d.data.length; i += 4) {
      if (lumaPx(out.data, i) < lumaPx(d.data, i) - 1) assert.fail(`seme ${seed}: pixel ${i / 4} scurito`);
    }
  }
});

// Il massimo non deve inseguire il rumore o la forma dell'ombra: il fondo corretto non supera
// la verità di più di 8 livelli, con ombra di mano o diagonale e rumore forte.
test('tessera con target lit: ombra di mano e rumore forte non gonfiano il massimo (5 semi)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const t = Synth.truth('card', { w: 856, h: 540, seed });
    const suFondo = sulColore(t, coloreDiFondo(t));
    const v = statFondo(t, suFondo).media;
    for (const [ombra, noise, blocks] of [['hand', 6, 5], ['hand', 14, 8], ['diagonal', 14, 8], ['none', 14, 8]]) {
      const d = degrade(t, { shadow: ombra, shadowDepth: 0.4, noise, blocks, seed });
      const out = look.applyGain(copiaImg(d), look.estimateIllumination(d, 'card'), { target: 'lit', maxGain: 3 });
      const f = statFondo(out, suFondo).media;
      assert.ok(f <= v + 8, `seme ${seed} ${ombra} rumore ${noise}: fondo ${f.toFixed(1)}, verità ${v.toFixed(1)}`);
    }
  }
});

test('tessera non degradata con target lit: praticamente invariata', () => {
  for (const seed of [1, 3, 5]) {
    const t = Synth.truth('card', { w: 856, h: 540, seed });
    const out = look.applyGain(copiaImg(t), look.estimateIllumination(t, 'card'), { target: 'lit', maxGain: 3 });
    const e = Q.rmseLuma(out, t);
    assert.ok(e < 1, `seme ${seed}: rmse ${e.toFixed(3)}`);
  }
});

test('applyGain lit: massimo della stima sui soli pixel opachi, guadagno mai sotto 1', () => {
  // 100 pixel con stima 101..200: il target è 200; il pixel più chiaro resta com'era
  const n = 100, img = tinta(n, 1, 100, 100, 100), illum = new Float32Array(n);
  for (let i = 0; i < n; i++) illum[i] = 101 + i;
  look.applyGain(img, illum, { target: 'lit', maxGain: 4 });
  assert.equal(img.data[(n - 1) * 4], 100);
  assert.equal(img.data[0], Math.round(100 * 200 / 101));
  assert.equal(img.data[50 * 4], Math.round(100 * 200 / 151));
  // maxGain limita anche 'lit'
  const img4 = tinta(2, 1, 100, 100, 100);
  look.applyGain(img4, Float32Array.of(240, 40), { target: 'lit', maxGain: 3 });
  assert.equal(img4.data[0], 100);
  assert.equal(img4.data[4], 255);
  assert.equal(look.applyGain(tinta(2, 1, 50, 50, 50), Float32Array.of(240, 40), { target: 'lit', maxGain: 3 }).data[4], 150);
  // i pixel trasparenti con stima altissima non spostano il target
  const img2 = tinta(4, 1, 100, 100, 100);
  img2.data[3] = 0; img2.data[7] = 0;
  look.applyGain(img2, Float32Array.of(250, 250, 100, 50), { target: 'lit', maxGain: 4 });
  assert.equal(img2.data[8], 100);
  assert.equal(img2.data[12], 200);
  const img3 = tinta(4, 1, 100, 100, 100);
  img3.data[3] = 0;
  look.applyGain(img3, Float32Array.of(250, 100, 100, 100), { target: 'mean', maxGain: 4 });
  assert.deepEqual(Array.from(img3.data.slice(4)), Array.from(tinta(3, 1, 100, 100, 100).data));
});

// Toglie una parte dell'immagine come fa il warp fuori dal quadrilatero: alfa 0 e RGB 0.
function conTrasparenza(img, tipo) {
  const o = copiaImg(img), w = img.width, h = img.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // angolo: triangolo in alto a sinistra con area pari al 25%; striscia: 20% a sinistra
      const via = tipo === 'angolo' ? x / w + y / h < Math.SQRT1_2 : x < w * 0.2;
      if (via) o.data.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 4);
    }
  }
  return o;
}

// Il confronto usa un target fisso (255): con 'mean' e 'lit' il target si calcola sui soli
// pixel visibili e cambia di proposito quando sparisce una parte del documento.
test('trasparenza da warp: sui pixel visibili stima e uscita restano quelle dell\'immagine piena', () => {
  for (const kind of ['card', 'sheet']) {
    const [w, h] = kind === 'card' ? [856, 540] : [600, 849];
    const t = Synth.truth(kind, { w, h, seed: 3 });
    for (const ombra of ['diagonal', 'hand']) {
      const d = degrade(t, { shadow: ombra, shadowDepth: 0.4, noise: 0, blocks: 0, seed: 3 });
      const illumPiena = look.estimateIllumination(d, kind);
      const piena = look.applyGain(copiaImg(d), illumPiena, { target: 255, maxGain: 3 });
      for (const tipo of ['angolo', 'striscia']) {
        const td = conTrasparenza(d, tipo);
        const illum = look.estimateIllumination(td, kind);
        for (const v of illum) assert.ok(Number.isFinite(v) && v > 0);
        const out = look.applyGain(copiaImg(td), illum, { target: 255, maxGain: 3 });
        let s = 0, si = 0, n = 0, grandi = 0;
        for (let i = 0, p = 0; i < td.data.length; i += 4, p++) {
          if (td.data[i + 3] === 0) continue;
          const e = Math.abs(lumaPx(out.data, i) - lumaPx(piena.data, i));
          s += e; si += Math.abs(illum[p] - illumPiena[p]); n++; if (e > 10) grandi++;
        }
        const tag = `${kind} ${ombra} ${tipo}`;
        assert.ok(si / n < 3, `${tag}: scarto medio della stima ${(si / n).toFixed(2)}`);
        assert.ok(s / n < 3, `${tag}: scarto medio dell'uscita ${(s / n).toFixed(2)}`);
        assert.ok(grandi / n < 0.005, `${tag}: quota oltre 10 livelli ${(100 * grandi / n).toFixed(2)}%`);
      }
    }
  }
});

test('immagine tutta trasparente: nessuna eccezione, nessun NaN, uscita invariata', () => {
  const src = tinta(30, 20, 0, 0, 0);
  for (let i = 3; i < src.data.length; i += 4) src.data[i] = 0;
  for (const kind of ['sheet', 'card']) {
    const illum = look.estimateIllumination(src, kind);
    for (const v of illum) assert.ok(Number.isFinite(v) && v > 0);
    for (const target of [255, 'mean', 'lit']) {
      const out = look.applyGain(copiaImg(src), illum, { target });
      assert.deepEqual(Array.from(out.data), Array.from(src.data));
    }
  }
});

test('immagini piatte con target 255: bianco invariato, nero resta nero, guadagno limitato da maxGain', () => {
  const bianco = tinta(40, 30, 255, 255, 255);
  assert.deepEqual(Array.from(look.applyGain(copiaImg(bianco), look.estimateIllumination(bianco, 'sheet'),
    { target: 255, maxGain: 4 }).data), Array.from(bianco.data));
  const nero = tinta(40, 30, 0, 0, 0);
  assert.deepEqual(Array.from(look.applyGain(copiaImg(nero), look.estimateIllumination(nero, 'sheet'),
    { target: 255, maxGain: 4 }).data), Array.from(nero.data));
  // luminanza circa 21: il guadagno pieno sarebbe circa 12, limitato a 4 (e a 3 se richiesto)
  const scuro = tinta(40, 30, 30, 20, 10);
  const o4 = look.applyGain(copiaImg(scuro), look.estimateIllumination(scuro, 'sheet'), { target: 255, maxGain: 4 });
  assert.deepEqual(Array.from(o4.data.slice(0, 4)), [120, 80, 40, 255]);
  const o3 = look.applyGain(copiaImg(scuro), look.estimateIllumination(scuro, 'card'), { target: 255, maxGain: 3 });
  assert.deepEqual(Array.from(o3.data.slice(0, 4)), [90, 60, 30, 255]);
  // maxGain predefinito: 4
  const od = look.applyGain(copiaImg(scuro), look.estimateIllumination(scuro, 'sheet'), { target: 255 });
  assert.deepEqual(Array.from(od.data.slice(0, 4)), [120, 80, 40, 255]);
});

test('applyGain: sul posto, stesso guadagno sui tre canali, alfa intatta', () => {
  const img = { width: 2, height: 1, data: new Uint8ClampedArray([100, 50, 20, 128, 40, 80, 120, 0]) };
  const ref = img.data;
  const out = look.applyGain(img, Float32Array.of(200, 100), { target: 200, maxGain: 4 });
  assert.equal(out, img);
  assert.equal(out.data, ref);
  // guadagni 1 e 2
  assert.deepEqual(Array.from(img.data), [100, 50, 20, 128, 80, 160, 240, 0]);
});

test('applyGain con target numerico non scurisce dove la stima supera il target', () => {
  const img = { width: 1, height: 1, data: new Uint8ClampedArray([250, 240, 230, 255]) };
  look.applyGain(img, Float32Array.of(245), { target: 230, maxGain: 4 });
  assert.deepEqual(Array.from(img.data), [250, 240, 230, 255]);
});

test('illuminazione su immagini minime senza eccezioni', () => {
  for (const [w, h] of [[25, 19], [1, 1], [2, 2], [3, 40], [40, 3]]) {
    const src = immagine(w, h);
    for (const kind of ['sheet', 'card']) {
      const illum = look.estimateIllumination(src, kind);
      assert.equal(illum.length, w * h);
      for (const v of illum) assert.ok(Number.isFinite(v) && v > 0, `${w}x${h} ${kind}: ${v}`);
      for (const target of [255, 'mean', 'lit']) {
        const out = look.applyGain(copiaImg(src), illum, { target, maxGain: 4 });
        assert.equal(out.data.length, w * h * 4);
        for (const v of out.data) assert.ok(Number.isFinite(v));
      }
    }
  }
});

test('estimateIllumination: tipo sconosciuto lancia TypeError', () => {
  assert.throws(() => look.estimateIllumination(immagine(8, 8), 'altro'),
    (e) => e instanceof TypeError && /tipo di documento non valido/.test(e.message));
});

// ---- rumore, blocchi e nitidezza (Task 7) ----
function casuale(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Rumore gaussiano grigio (uguale sui tre canali): la luminanza ha la stessa sigma.
function conRumoreGrigio(img, sigma, seed) {
  const r = casuale(seed), o = copiaImg(img);
  for (let i = 0; i < o.data.length; i += 4) {
    const n = Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r()) * sigma;
    o.data[i] += n; o.data[i + 1] += n; o.data[i + 2] += n;
  }
  return o;
}

// Sfumatura lenta e colorata, lontana dalla saturazione.
function liscia(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = 70 + 90 * x / w; data[i + 1] = 90 + 60 * y / h; data[i + 2] = 110 + 40 * (x + y) / (w + h); data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

function ritaglio(img, x0, y0, cw, ch) {
  const o = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) o.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + cw) * 4), y * cw * 4);
  return { data: o, width: cw, height: ch };
}

// Sfocatura a scatola di raggio r su R, G, B (alfa invariato).
function sfocata(img, r) {
  const w = img.width, h = img.height, n = w * h, o = copiaImg(img);
  for (let c = 0; c < 3; c++) {
    const ch = new Float32Array(n);
    for (let p = 0; p < n; p++) ch[p] = img.data[p * 4 + c];
    const b = T.boxBlur(ch, w, h, r);
    for (let p = 0; p < n; p++) o.data[p * 4 + c] = b[p];
  }
  return o;
}

function devStd(img) {
  let s = 0, s2 = 0;
  const n = img.width * img.height;
  for (let i = 0; i < img.data.length; i += 4) { const l = lumaPx(img.data, i); s += l; s2 += l * l; }
  return Math.sqrt(Math.max(0, s2 / n - (s / n) * (s / n)));
}

// Croma nel senso di YCbCr: con lo stesso scarto sommato a R, G, B, R-G e B-G non cambiano
// (a meno dell'arrotondamento) dove nessun canale è saturo.
function cromaInvariato(out, src, tag) {
  let peggiore = 0;
  for (let i = 0; i < src.data.length; i += 4) {
    const o = out.data;
    if (Math.min(o[i], o[i + 1], o[i + 2]) <= 0 || Math.max(o[i], o[i + 1], o[i + 2]) >= 255) continue;
    const e = Math.max(Math.abs((o[i] - o[i + 1]) - (src.data[i] - src.data[i + 1])),
      Math.abs((o[i + 2] - o[i + 1]) - (src.data[i + 2] - src.data[i + 1])));
    if (e > peggiore) peggiore = e;
  }
  assert.ok(peggiore <= 1, `${tag}: R-G o B-G cambiato di ${peggiore}`);
}

function alfaInvariato(out, src, tag) {
  for (let i = 3; i < src.data.length; i += 4) if (out.data[i] !== src.data[i]) assert.fail(`${tag}: alfa cambiato al pixel ${(i - 3) / 4}`);
}

const SEMI = [1, 2, 3];
const foglioRumoroso = (seed, noise = 8, blocks = 6) => {
  const t = Synth.truth('sheet', { w: 600, h: 849, seed });
  return { t, d: degrade(t, { noise, blocks, seed }) };
};

test('estimateNoise: immagine liscia sigma < 1, nessuna blocchettatura', () => {
  const e = look.estimateNoise(liscia(400, 300));
  assert.ok(e.sigma < 1, 'sigma ' + e.sigma);
  assert.ok(e.blockiness < 1.05, 'blockiness ' + e.blockiness);
  for (const seed of SEMI) {
    const t = Synth.truth('card', { w: 856, h: 540, seed });
    const et = look.estimateNoise(t);
    assert.ok(et.sigma < 1, `tessera pulita, seme ${seed}: sigma ${et.sigma}`);
    assert.ok(et.blockiness < 1.05, `tessera pulita, seme ${seed}: blockiness ${et.blockiness}`);
    const ef = look.estimateNoise(Synth.truth('sheet', { w: 600, h: 849, seed }));
    assert.ok(ef.sigma < 1 && ef.blockiness < 1.05, `foglio pulito, seme ${seed}: ${JSON.stringify(ef)}`);
  }
});

test('estimateNoise: rumore sigma 10 stimato tra 6 e 14 (grigio e per canale, 3 semi)', () => {
  for (const seed of SEMI) {
    const g = look.estimateNoise(conRumoreGrigio(liscia(400, 300), 10, seed));
    assert.ok(g.sigma > 6 && g.sigma < 14, `grigio, seme ${seed}: sigma ${g.sigma.toFixed(2)}`);
    assert.ok(g.blockiness < 1.05, `grigio, seme ${seed}: blockiness ${g.blockiness.toFixed(3)}`);
    // rumore indipendente per canale (degrade): sulla luminanza la sigma è circa 0,67 x 10
    const t = Synth.truth('card', { w: 856, h: 540, seed });
    const c = look.estimateNoise(degrade(t, { noise: 10, blocks: 0, seed }));
    assert.ok(c.sigma > 6 && c.sigma < 14, `tessera, seme ${seed}: sigma ${c.sigma.toFixed(2)}`);
  }
});

test('estimateNoise: blocchettatura rilevata con la fase della griglia, anche su un ritaglio', () => {
  for (const seed of SEMI) {
    const { t, d } = foglioRumoroso(seed);
    const e = look.estimateNoise(d);
    assert.ok(e.blockiness >= 1.1, `seme ${seed}: blockiness ${e.blockiness.toFixed(3)}`);
    assert.equal(e.gridX, 0);
    assert.equal(e.gridY, 0);
    // solo rumore: niente blocchi
    const n = look.estimateNoise(degrade(t, { noise: 8, blocks: 0, seed }));
    assert.ok(n.blockiness < 1.05, `seme ${seed}, solo rumore: blockiness ${n.blockiness.toFixed(3)}`);
    // ritaglio che parte da (5, 2): i bordi dei blocchi cadono a x = 3 e y = 6 modulo 8
    const r = look.estimateNoise(ritaglio(d, 5, 2, 500, 700));
    assert.ok(r.blockiness >= 1.1, `seme ${seed}, ritaglio: blockiness ${r.blockiness.toFixed(3)}`);
    assert.equal(r.gridX, 3);
    assert.equal(r.gridY, 6);
  }
});

test('denoise su foglio con rumore 8 e blocchi 6: blocchi ridotti, più vicino alla verità, testo conservato (3 semi)', () => {
  // L'indice di blocchettatura vale circa 1 su un'immagine senza blocchi e il testo del foglio
  // lo tiene vicino a 1 anche con i blocchi: si misura la parte dovuta ai blocchi, cioè
  // l'eccesso rispetto alla verità (foglio intero) e rispetto a 1 (zona bianca senza testo).
  for (const seed of SEMI) {
    const { t, d } = foglioRumoroso(seed);
    const out = look.denoise(copiaImg(d), look.estimateNoise(d));
    const bt = Q.blockiness(t), bd = Q.blockiness(d), bo = Q.blockiness(out);
    assert.ok(bo - bt <= 0.5 * (bd - bt), `seme ${seed}: blockiness ${bo.toFixed(3)}, degradata ${bd.toFixed(3)}, verità ${bt.toFixed(3)}`);
    const zona = (img) => ritaglio(img, 0, 640, 296, 200);
    const zd = Q.blockiness(zona(d)), zo = Q.blockiness(zona(out));
    assert.ok(zo - 1 <= 0.5 * (zd - 1), `seme ${seed}: zona bianca ${zo.toFixed(3)} contro ${zd.toFixed(3)}`);
    const ed = Q.rmseLuma(d, t), eo = Q.rmseLuma(out, t);
    assert.ok(eo < ed * 0.9, `seme ${seed}: rmse ${eo.toFixed(2)} contro ${ed.toFixed(2)}`);
    const sd = Q.sharpnessIndex(d), so = Q.sharpnessIndex(out), st = Q.sharpnessIndex(t);
    assert.ok(so >= 0.75 * sd && so >= 0.75 * st, `seme ${seed}: nitidezza ${so.toFixed(1)}, degradata ${sd.toFixed(1)}, verità ${st.toFixed(1)}`);
    alfaInvariato(out, d, 'seme ' + seed);
    cromaInvariato(out, d, 'seme ' + seed);
    assert.ok(Q.deltaEab(out, d) < 0.5, `seme ${seed}: deltaEab ${Q.deltaEab(out, d).toFixed(3)}`);
  }
});

test('denoise su tessera con rumore e blocchi: più vicina alla verità, croma e disegno conservati (3 semi)', () => {
  for (const seed of SEMI) {
    const t = Synth.truth('card', { w: 856, h: 540, seed });
    for (const [noise, blocks] of [[8, 6], [4, 3], [0, 6]]) {
      const d = degrade(t, { noise, blocks, seed });
      const out = look.denoise(copiaImg(d), look.estimateNoise(d));
      const tag = `seme ${seed} rumore ${noise} blocchi ${blocks}`;
      assert.ok(Q.rmseLuma(out, t) < Q.rmseLuma(d, t) * 0.9, `${tag}: rmse ${Q.rmseLuma(out, t).toFixed(2)} contro ${Q.rmseLuma(d, t).toFixed(2)}`);
      assert.ok(Q.sharpnessIndex(out) >= 0.75 * Q.sharpnessIndex(t), `${tag}: nitidezza ${Q.sharpnessIndex(out).toFixed(1)}`);
      cromaInvariato(out, d, tag);
      assert.ok(Q.deltaEab(out, d) < 0.5, `${tag}: deltaEab ${Q.deltaEab(out, d).toFixed(3)}`);
    }
  }
});

test('denoise: sotto soglia e su immagini pulite non fa nulla; sul posto', () => {
  const src = conRumoreGrigio(liscia(120, 90), 0.4, 7);
  const out = look.denoise(copiaImg(src), { sigma: 0.5, blockiness: 1 });
  assert.deepEqual(Array.from(out.data), Array.from(src.data));
  for (const seed of SEMI) {
    for (const t of [Synth.truth('card', { w: 856, h: 540, seed }), Synth.truth('sheet', { w: 600, h: 849, seed })]) {
      const o = look.denoise(copiaImg(t), look.estimateNoise(t));
      assert.deepEqual(Array.from(o.data), Array.from(t.data), 'verità pulita, seme ' + seed);
    }
  }
  const img = copiaImg(foglioRumoroso(1).d), ref = img.data;
  const r = look.denoise(img, { sigma: 4, blockiness: 1.3 });
  assert.equal(r, img);
  assert.equal(r.data, ref);
});

test('trasparenza: i pixel con alfa 0 non entrano nelle stime e non cambiano', () => {
  for (const seed of SEMI) {
    const { d } = foglioRumoroso(seed);
    const td = conTrasparenza(d, 'striscia');
    const ep = look.estimateNoise(d), et = look.estimateNoise(td);
    assert.ok(Math.abs(et.sigma - ep.sigma) < 0.15 * ep.sigma, `seme ${seed}: sigma ${et.sigma.toFixed(2)} contro ${ep.sigma.toFixed(2)}`);
    assert.ok(et.blockiness >= 1.1, `seme ${seed}: blockiness ${et.blockiness.toFixed(3)}`);
    const piena = look.denoise(copiaImg(d), ep);
    const out = look.denoise(copiaImg(td), ep);
    let grandi = 0, n = 0;
    for (let i = 0; i < td.data.length; i += 4) {
      if (td.data[i + 3] === 0) {
        assert.deepEqual(Array.from(out.data.slice(i, i + 4)), [0, 0, 0, 0]);
        continue;
      }
      n++;
      if (Math.abs(lumaPx(out.data, i) - lumaPx(piena.data, i)) > 10) grandi++;
    }
    assert.ok(grandi / n < 0.005, `seme ${seed}: quota oltre 10 livelli ${(100 * grandi / n).toFixed(2)}%`);
    alfaInvariato(out, td, 'seme ' + seed);
  }
  // Su una sfumatura lenta non c'è nulla da affilare né da filtrare: la zona trasparente (RGB 0)
  // non deve creare un alone sul bordo del documento, quindi i pixel visibili restano uguali.
  for (const tipo of ['striscia', 'angolo']) {
    const src = conTrasparenza(liscia(300, 200), tipo);
    const u = look.unsharp(copiaImg(src), { amount: 8, radiusFrac: 0.01, threshold: 2 });
    assert.deepEqual(Array.from(u.data), Array.from(src.data), 'unsharp ' + tipo);
    const dn = look.denoise(copiaImg(src), { sigma: 3, blockiness: 1.3 });
    let peggiore = 0;
    for (let i = 0; i < src.data.length; i += 4) peggiore = Math.max(peggiore, Math.abs(lumaPx(dn.data, i) - lumaPx(src.data, i)));
    assert.ok(peggiore <= 1, `denoise ${tipo}: scarto massimo ${peggiore.toFixed(2)}`);
  }
});

test('unsharp con amount 5: nitidezza su testo sfocato +20% o più (3 semi), amount 0 non modifica', () => {
  for (const seed of SEMI) {
    const s = sfocata(Synth.truth('sheet', { w: 600, h: 849, seed }), 1);
    const prima = Q.sharpnessIndex(s);
    const out = look.unsharp(copiaImg(s), { amount: 5, radiusFrac: 0.002, threshold: 4 });
    const dopo = Q.sharpnessIndex(out);
    assert.ok(dopo >= prima * 1.2, `seme ${seed}: nitidezza ${dopo.toFixed(1)} contro ${prima.toFixed(1)}`);
    alfaInvariato(out, s, 'seme ' + seed);
    cromaInvariato(out, s, 'seme ' + seed);
    const zero = look.unsharp(copiaImg(s), { amount: 0, radiusFrac: 0.002, threshold: 4 });
    assert.deepEqual(Array.from(zero.data), Array.from(s.data));
  }
  const img = copiaImg(immagine(30, 20)), ref = img.data;
  const r = look.unsharp(img, { amount: 3, radiusFrac: 0.05, threshold: 2 });
  assert.equal(r, img);
  assert.equal(r.data, ref);
});

test('unsharp: la soglia non affila il rumore (sigma 3, deviazione entro il 10%), senza soglia sì', () => {
  for (const seed of SEMI) {
    const src = conRumoreGrigio(tinta(400, 300, 128, 128, 128), 3, seed);
    const prima = devStd(src);
    const out = look.unsharp(copiaImg(src), { amount: 5, radiusFrac: 0.002, threshold: 10 });
    const dopo = devStd(out);
    assert.ok(Math.abs(dopo / prima - 1) <= 0.1, `seme ${seed}: deviazione ${dopo.toFixed(2)} contro ${prima.toFixed(2)}`);
    // controprova: senza soglia la stessa quantità amplifica il rumore
    const senza = devStd(look.unsharp(copiaImg(src), { amount: 5, radiusFrac: 0.002, threshold: 0 }));
    assert.ok(senza > prima * 1.3, `seme ${seed}: senza soglia ${senza.toFixed(2)}`);
  }
});

test('unsharp su tessera: croma e alfa invariati, deltaEab trascurabile', () => {
  for (const seed of SEMI) {
    const t = Synth.truth('card', { w: 856, h: 540, seed });
    const out = look.unsharp(copiaImg(t), { amount: 3, radiusFrac: 0.0015, threshold: 4 });
    cromaInvariato(out, t, 'seme ' + seed);
    alfaInvariato(out, t, 'seme ' + seed);
    assert.ok(Q.deltaEab(out, t) < 0.5, `seme ${seed}: deltaEab ${Q.deltaEab(out, t).toFixed(3)}`);
  }
});

test('rumore e nitidezza: immagini piatte invariate, immagini minime senza eccezioni né NaN', () => {
  for (const [r, g, b] of [[255, 255, 255], [0, 0, 0], [180, 120, 60]]) {
    const src = tinta(40, 30, r, g, b);
    const e = look.estimateNoise(src);
    assert.ok(Number.isFinite(e.sigma) && Number.isFinite(e.blockiness), JSON.stringify(e));
    assert.ok(e.sigma < 1 && e.blockiness < 1.05, JSON.stringify(e));
    assert.deepEqual(Array.from(look.denoise(copiaImg(src), { sigma: 6, blockiness: 2 }).data), Array.from(src.data));
    assert.deepEqual(Array.from(look.unsharp(copiaImg(src), { amount: 10, radiusFrac: 0.01, threshold: 0 }).data), Array.from(src.data));
  }
  for (const [w, h] of [[25, 19], [1, 1], [2, 2], [3, 40], [40, 3]]) {
    for (const src of [immagine(w, h), conRumoreGrigio(immagine(w, h), 8, w + h)]) {
      const e = look.estimateNoise(src);
      assert.ok(Number.isFinite(e.sigma) && e.sigma >= 0, `${w}x${h}: sigma ${e.sigma}`);
      assert.ok(Number.isFinite(e.blockiness) && e.blockiness > 0, `${w}x${h}: blockiness ${e.blockiness}`);
      for (const opts of [e, { sigma: 6, blockiness: 2 }]) {
        const o = look.denoise(copiaImg(src), opts);
        assert.equal(o.data.length, w * h * 4);
        alfaInvariato(o, src, `${w}x${h}`);
      }
      const u = look.unsharp(copiaImg(src), { amount: 10, radiusFrac: 0.05, threshold: 2 });
      assert.equal(u.data.length, w * h * 4);
    }
  }
  // valori non validi: nessuna azione
  const src = immagine(30, 20);
  for (const opts of [{}, { sigma: NaN, blockiness: NaN }, { sigma: -3, blockiness: -1 }]) {
    assert.deepEqual(Array.from(look.denoise(copiaImg(src), opts).data), Array.from(src.data));
  }
  for (const opts of [{}, { amount: NaN }, { amount: -2 }, { amount: 5, radiusFrac: NaN, threshold: NaN }]) {
    const o = look.unsharp(copiaImg(src), opts);
    assert.equal(o.data.length, src.data.length);
  }
});

// ---- documenti d'identità: Colori e Grigi, angoli arrotondati (Task 8) ----
const core = loadCore();
const preset = (nome, extra) => Object.assign(core.defaultSettings(), core.presets[nome], extra);
const tutto = { tl: { x: 0, y: 0 }, tr: { x: 100, y: 0 }, br: { x: 100, y: 100 }, bl: { x: 0, y: 100 } };
const tesseraDegradata = (seed) => {
  const t = Synth.truth('card', { w: 856, h: 540, seed });
  return { t, d: degrade(t, { shadow: 'diagonal', shadowDepth: 0.4, noise: 6, blocks: 5, seed }) };
};
// Zona della fotografia della tessera sintetica (vedi truthCard), un po' rientrata dai bordi.
const zonaFoto = (w, h) => (x, y) => x >= w * 0.07 && x < w * 0.35 && y >= h * 0.27 && y < h * 0.71;
const SEMI_ID = [1, 2, 3, 4, 5];
// Obiettivo del fondo delle tessere dopo la taratura del Task 8b: un po' più chiaro della verità
// (circa 12 livelli, CARD_LIFT), con le scritte che restano nere.
const SCHIARITO = 12;

test('identita-colori su tessera degradata: colore, fondo, ritratto, blocchi (5 semi)', () => {
  for (const seed of SEMI_ID) {
    const { t, d } = tesseraDegradata(seed);
    const copia = Array.from(d.data);
    const out = look.process(d, { corners: null, settings: preset('identita-colori', { perspective: false }) }, opsDiProva());
    const tag = 'seme ' + seed;
    assert.deepEqual(Array.from(d.data), copia, tag + ': input modificato');
    assert.equal(out.width, 856);
    assert.equal(out.height, 540);
    const dEo = Q.deltaEab(out, t), dEd = Q.deltaEab(d, t);
    assert.ok(dEo < 3 && dEo < dEd, `${tag}: deltaEab ${dEo.toFixed(2)}, ingresso ${dEd.toFixed(2)}`);
    // il fondo pastello resta, un po' più chiaro (nessun fondo forzato a bianco), e le scritte
    // scure non si schiariscono
    const suFondo = sulColore(t, coloreDiFondo(t));
    const fv = statFondo(t, suFondo).media, fo = statFondo(out, suFondo).media;
    assert.ok(fo - fv >= 8 && fo - fv <= 16 && Math.abs(fo - fv - SCHIARITO) < 6, `${tag}: fondo ${fo.toFixed(1)}, verità ${fv.toFixed(1)}`);
    assert.ok(Q.paperLevel(out) < 250, `${tag}: paperLevel ${Q.paperLevel(out).toFixed(1)}`);
    const testo = (x, y, i) => lumaPx(t.data, i) < 80;
    const sv = statFondo(t, testo).media, so = statFondo(out, testo).media;
    assert.ok(so <= sv + 6, `${tag}: testo ${so.toFixed(1)}, verità ${sv.toFixed(1)}`);
    // ritratto non più scuro della verità di oltre il 10%
    const foto = zonaFoto(t.width, t.height);
    const lv = statFondo(t, foto).media, lo = statFondo(out, foto).media;
    assert.ok(lo >= 0.9 * lv, `${tag}: fotografia ${lo.toFixed(1)}, verità ${lv.toFixed(1)}`);
    // blocchi: l'eccesso sulla verità (che vale già più di 1 per il disegno) cala almeno della metà
    const bt = Q.blockiness(t), bd = Q.blockiness(d), bo = Q.blockiness(out);
    assert.ok(bo - bt <= 0.5 * (bd - bt), `${tag}: blockiness ${bo.toFixed(3)}, ingresso ${bd.toFixed(3)}, verità ${bt.toFixed(3)}`);
    // il rumore sul fondo non cresce: il rapporto con la verità sul fondo è più uniforme dell'ingresso
    const r0 = rapporto(d, t, suFondo), r1 = rapporto(out, t, suFondo);
    assert.ok(r1.cv < r0.cv, `${tag}: cv del fondo ${r1.cv.toFixed(4)} contro ${r0.cv.toFixed(4)}`);
  }
});

// Ombra di mano sulla scena, non sulla sola tessera: la tessera sta dentro una foto più grande e
// l'ombra ne copre il lato sinistro. La superficie di secondo grado supera il fondo vero sul lato
// destro e il solo massimo della stima ('lit') portava tutta la tessera 16 livelli sopra il fondo.
// Dal Task 8b il fondo sale di proposito di circa SCHIARITO livelli: il margine di 8 vale sopra
// quell'obiettivo.
test('identita-colori con ombra di mano sulla scena: il fondo non sale oltre quello vero (3 semi)', () => {
  for (const seed of SEMI) {
    const t = Synth.truth('card', { w: 856, h: 540, seed });
    const W = 1200, H = 900, ox = 172, oy = 180;
    const scena = tinta(W, H, 45, 45, 45);
    for (let y = 0; y < 540; y++) scena.data.set(t.data.subarray(y * 856 * 4, (y + 1) * 856 * 4), ((oy + y) * W + ox) * 4);
    const ds = degrade(scena, { shadow: 'hand', shadowDepth: 0.35, noise: 4, blocks: 3, seed });
    const d = ritaglio(ds, ox, oy, 856, 540);
    const out = look.process(d, { corners: null, settings: preset('identita-colori', { perspective: false }) }, opsDiProva());
    const k = coloreDiFondo(t);
    const lato = (x0, x1) => (x, y, i) => x >= x0 && x < x1 && sulColore(t, k)(x, y, i);
    const v = statFondo(t, sulColore(t, k)).media;
    const destra = statFondo(out, lato(600, 856)).media, sinistraIn = statFondo(d, lato(0, 250)).media, sinistra = statFondo(out, lato(0, 250)).media;
    assert.ok(destra <= v + SCHIARITO + 8, `seme ${seed}: fondo a destra ${destra.toFixed(1)}, verità ${v.toFixed(1)}`);
    assert.ok(Math.abs(sinistra - v) < Math.abs(sinistraIn - v), `seme ${seed}: fondo in ombra ${sinistra.toFixed(1)}, ingresso ${sinistraIn.toFixed(1)}`);
  }
});

test('identita-grigi: R = G = B su ogni pixel, fondo grigio chiaro vicino all\'obiettivo (3 semi)', () => {
  for (const seed of SEMI) {
    const { t, d } = tesseraDegradata(seed);
    for (const extra of [{ perspective: false }, { contrast: 30, brightness: -10 }]) {
      const out = look.process(d, { corners: angoli(3, 97), settings: preset('identita-grigi', extra) }, opsDiProva());
      const o = out.data;
      for (let i = 0; i < o.length; i += 4) {
        if (o[i] !== o[i + 1] || o[i] !== o[i + 2]) assert.fail(`seme ${seed} ${JSON.stringify(extra)}: pixel ${i / 4} non grigio`);
        assert.equal(o[i + 3], 255);
      }
    }
    const out = look.process(d, { corners: null, settings: preset('identita-grigi', { perspective: false }) }, opsDiProva());
    const suFondo = sulColore(t, coloreDiFondo(t));
    const fv = statFondo(t, suFondo).media, fo = statFondo(out, suFondo).media;
    assert.ok(Math.abs(fo - fv - SCHIARITO) < 6, `seme ${seed}: fondo ${fo.toFixed(1)}, verità ${fv.toFixed(1)}`);
  }
});

test('identità: con angoliArrotondati e un warp gli angoli sono bianchi e il centro non cambia', () => {
  const { d } = tesseraDegradata(3);
  for (const modo of ['identita-colori', 'identita-grigi']) {
    const con = look.process(d, { corners: angoli(2, 98), settings: preset(modo) }, opsDiProva());
    const senza = look.process(d, { corners: angoli(2, 98), settings: preset(modo, { angoliArrotondati: false }) }, opsDiProva());
    assert.equal(con.width, senza.width);
    const w = con.width, h = con.height;
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [3, 3], [w - 4, h - 4]]) {
      const i = (y * w + x) * 4;
      assert.deepEqual(Array.from(con.data.slice(i, i + 4)), [255, 255, 255, 255], `${modo}: angolo ${x},${y}`);
    }
    // fuori dalle quattro zone d'angolo nulla cambia
    const r = Math.ceil(0.037 * w) + 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if ((x < r || x >= w - r) && (y < r || y >= h - r)) continue;
        const i = (y * w + x) * 4;
        if (con.data[i] !== senza.data[i] || con.data[i + 1] !== senza.data[i + 1] || con.data[i + 2] !== senza.data[i + 2]) {
          assert.fail(`${modo}: pixel ${x},${y} cambiato dalla maschera`);
        }
      }
    }
  }
});

test('identità: senza warp la maschera degli angoli non fa nulla', () => {
  const { d } = tesseraDegradata(2);
  for (const opts of [{ corners: null, extra: {} }, { corners: angoli(5, 95), extra: { perspective: false } }]) {
    const con = look.process(d, { corners: opts.corners, settings: preset('identita-colori', opts.extra) }, opsDiProva());
    const senza = look.process(d, { corners: opts.corners, settings: preset('identita-colori', Object.assign({ angoliArrotondati: false }, opts.extra)) }, opsDiProva());
    assert.deepEqual(Array.from(con.data), Array.from(senza.data));
  }
});

test('identità: nessun filo nero ai margini dopo un warp con zona trasparente', () => {
  for (const seed of SEMI) {
    const { d } = tesseraDegradata(seed);
    for (const modo of ['identita-colori', 'identita-grigi']) {
      for (const arrotondati of [true, false]) {
        // angoli fino al 100%: l'ultima riga e l'ultima colonna campionano fuori dalla sorgente
        const out = look.process(d, { corners: tutto, settings: preset(modo, { angoliArrotondati: arrotondati }) }, opsDiProva());
        assert.equal(Q.darkBorderPixels(out, 3), 0, `seme ${seed} ${modo} arrotondati ${arrotondati}`);
        assert.ok(senzaAlfaZero(out));
      }
    }
  }
});

// Ritaglio un po' largo su uno sfondo scuro: ai margini resta una striscia di sfondo (luminanza
// circa 45) che la nitidezza non deve trasformare in un filo nero.
test('identità: una striscia di sfondo scuro ai margini non diventa un filo nero (3 semi)', () => {
  for (const seed of SEMI) {
    const t = Synth.truth('card', { w: 856, h: 540, seed });
    const W = 1000, H = 700, ox = 72, oy = 80;
    const scena = tinta(W, H, 45, 45, 45);
    for (let y = 0; y < 540; y++) scena.data.set(t.data.subarray(y * 856 * 4, (y + 1) * 856 * 4), ((oy + y) * W + ox) * 4);
    const d = degrade(scena, { noise: 4, blocks: 3, seed });
    // 2 pixel di sfondo per lato dentro il quadrilatero
    const pc = (x, y) => ({ x: x / W * 100, y: y / H * 100 });
    const corners = { tl: pc(ox - 2, oy - 2), tr: pc(ox + 858, oy - 2), br: pc(ox + 858, oy + 542), bl: pc(ox - 2, oy + 542) };
    for (const modo of ['identita-colori', 'identita-grigi']) {
      const out = look.process(d, { corners, settings: preset(modo, { sharpen: 5 }) }, opsDiProva());
      assert.equal(Q.darkBorderPixels(out, 3), 0, `seme ${seed} ${modo}`);
    }
  }
});

test('unsharp con limit: niente aloni oltre limit livelli, nessuno entro 3 pixel dal bordo', () => {
  // gradino verticale scuro/chiaro e una striscia scura di 2 pixel sul bordo sinistro
  const w = 60, h = 40, src = tinta(w, h, 200, 200, 200);
  for (let y = 0; y < h; y++) {
    for (const x of [0, 1, 30, 31, 32, 33, 34, 35]) { const i = (y * w + x) * 4; src.data[i] = src.data[i + 1] = src.data[i + 2] = 50; }
  }
  const senza = look.unsharp(copiaImg(src), { amount: 10, radiusFrac: 0.03, threshold: 0 });
  const con = look.unsharp(copiaImg(src), { amount: 10, radiusFrac: 0.03, threshold: 0, limit: 12 });
  const y = 20, at = (img, x) => img.data[(y * w + x) * 4];
  assert.ok(at(senza, 0) < 40 && at(senza, 29) > 225, `senza limite: ${at(senza, 0)}, ${at(senza, 29)}`);
  assert.ok(at(con, 0) >= 50 && at(con, 1) >= 50, `bordo: ${at(con, 0)}, ${at(con, 1)}`);
  for (let x = 3; x < w - 3; x++) assert.ok(at(con, x) >= 50 - 12 && at(con, x) <= 200 + 12, `x ${x}: ${at(con, x)}`);
  // limit non valido: come senza limite
  assert.deepEqual(Array.from(look.unsharp(copiaImg(src), { amount: 10, radiusFrac: 0.03, threshold: 0, limit: NaN }).data), Array.from(senza.data));
});

test('identità: onStage emette gli stadi nell\'ordine effettivo, solo quelli eseguiti', () => {
  const { d } = tesseraDegradata(1);
  const visti = [], ops = opsDiProva();
  look.process(d, {
    corners: angoli(5, 95), settings: preset('identita-colori', { keystoneV: 3, rotFine: 2 }),
    onStage: (nome, ms) => { assert.equal(typeof ms, 'number'); visti.push(nome); }
  }, ops);
  assert.deepEqual(visti, ['denoise', 'warp', 'keystone', 'rotate', 'illumination', 'tone', 'sharpen', 'mask']);
  assert.deepEqual(ops.rotazioni, [2]);
  const pochi = [];
  look.process(d, { corners: null, settings: preset('identita-grigi', { sharpen: 0 }), onStage: (n) => pochi.push(n) }, opsDiProva());
  assert.deepEqual(pochi, ['denoise', 'illumination', 'tone']);
});

test('identità: immagini minime e piatte senza eccezioni, dimensioni invariate, input intatto', () => {
  const casi = [immagine(25, 19), tinta(40, 30, 180, 120, 60), tinta(40, 30, 255, 255, 255), tinta(40, 30, 0, 0, 0),
    immagine(1, 1), immagine(3, 40)];
  for (const src of casi) {
    const copia = Array.from(src.data);
    for (const modo of ['identita-colori', 'identita-grigi']) {
      for (const corners of [null, angoli(5, 95)]) {
        const out = look.process(src, { corners, settings: preset(modo, { sharpen: 10, contrast: 50, brightness: 20 }) }, opsDiProva());
        assert.notEqual(out.data, src.data);
        assert.ok(senzaAlfaZero(out));
        if (!corners || src.width < 20) {
          assert.equal(out.width, src.width);
          assert.equal(out.height, src.height);
        }
      }
    }
    assert.deepEqual(Array.from(src.data), copia);
  }
  // una tinta piatta resta piatta (nessun disegno inventato)
  const piatta = look.process(tinta(40, 30, 180, 120, 60), { corners: null, settings: preset('identita-colori') }, opsDiProva());
  for (let i = 4; i < piatta.data.length; i += 4) {
    for (let c = 0; c < 3; c++) assert.equal(piatta.data[i + c], piatta.data[c]);
  }
});

test('identità: contrasto e luminosità come ritocco dopo la curva, sulla stessa scala della 0.2', () => {
  const { d } = tesseraDegradata(1);
  const s = (extra) => look.process(d, { corners: null, settings: preset('identita-colori', Object.assign({ perspective: false, sharpen: 0 }, extra)) }, opsDiProva());
  const zero = s({}), luce = s({ brightness: 20 }), contr = s({ contrast: 40 });
  const media = (img) => { let m = 0; for (let i = 0; i < img.data.length; i += 4) m += lumaPx(img.data, i); return m / (img.data.length / 4); };
  assert.ok(media(luce) > media(zero) + 10, `luminosità: ${media(luce).toFixed(1)} contro ${media(zero).toFixed(1)}`);
  // Con il fondo più chiaro del Task 8b, p95 - p5 arriva già a 255 con contrasto 40 (tagli a 0 e
  // 255): si controlla la formula della 0.2 pixel per pixel, fuori dai tagli, a meno degli
  // arrotondamenti; più ampio dell'ingresso resta vero.
  const f = 1 + 2 * 0.4;
  for (let i = 0; i < zero.data.length; i++) {
    if ((i & 3) === 3) continue;
    const atteso = f * (zero.data[i] - 128) + 128;
    if (atteso < 3 || atteso > 252) continue;
    assert.ok(Math.abs(contr.data[i] - atteso) <= 2, `contrasto, canale ${i}: ${contr.data[i]} contro ${atteso.toFixed(1)}`);
  }
  assert.ok(Q.contrastSpread(contr) > Q.contrastSpread(zero), `contrasto: ${Q.contrastSpread(contr).toFixed(1)} contro ${Q.contrastSpread(zero).toFixed(1)}`);
});

// ---- taratura dopo il primo giudizio sulle foto vere (Task 8b) ----

// Tessera con una fascia d'intestazione scura (luminanza circa 90) larga tutto il lato lungo e alta
// il 18%, in cima, con l'ombra diagonale del Task 8: la fascia riempie una riga intera di blocchi
// della stima 'card'. Prima della taratura la superficie la seguiva e la fascia passava da 79 a 160.
const tesseraConFascia = (seed, colore = [45, 115, 75]) => {
  const t = Synth.truth('card', { w: 856, h: 540, seed });
  const y1 = Math.round(0.18 * 540);
  for (let y = 0; y < y1; y++) {
    for (let x = 0; x < 856; x++) { const i = (y * 856 + x) * 4; t.data[i] = colore[0]; t.data[i + 1] = colore[1]; t.data[i + 2] = colore[2]; }
  }
  return { t, y1, d: degrade(t, { shadow: 'diagonal', shadowDepth: 0.4, noise: 6, blocks: 5, seed }) };
};

test('identita-colori: una fascia scura in testa non sbiadisce, l\'ombra sul resto si toglie (5 semi)', () => {
  for (const seed of SEMI_ID) {
    for (const colore of [[45, 115, 75], [90, 170, 130]]) {
      const { t, y1, d } = tesseraConFascia(seed, colore);
      const out = look.process(d, { corners: null, settings: preset('identita-colori', { perspective: false }) }, opsDiProva());
      const tag = `seme ${seed} fascia ${colore}`;
      const fascia = (x, y) => y >= 4 && y < y1 - 4;
      const suFondo = sulColore(t, coloreDiFondo(t));
      const sotto = (x, y, i) => y >= y1 + 2 && y < y1 + 40 && suFondo(x, y, i);
      // la fascia scura resta com'è nell'originale non corretto (qui l'ingresso stesso); quella più
      // chiara (luminanza 141) sale di più perché anche su di lei l'ombra si toglie davvero, ma non
      // oltre la verità (prima della taratura: 184 con verità 141)
      const fd = statFondo(d, fascia).media, fo = statFondo(out, fascia).media, fv = statFondo(t, fascia).media;
      if (fv < 100) assert.ok(Math.abs(fo - fd) <= 6, `${tag}: fascia ${fo.toFixed(1)}, originale ${fd.toFixed(1)}`);
      else assert.ok(fo <= fv + 6, `${tag}: fascia ${fo.toFixed(1)}, verità ${fv.toFixed(1)}`);
      // e non perde contrasto rispetto al fondo che ha sotto
      const cd = statFondo(d, sotto).media - fd, co = statFondo(out, sotto).media - fo;
      assert.ok(co >= cd, `${tag}: contrasto ${co.toFixed(1)}, originale ${cd.toFixed(1)}`);
      // sul resto del fondo l'ombra diagonale si toglie
      const r0 = rapporto(d, t, suFondo), r1 = rapporto(out, t, suFondo);
      assert.ok(r1.cv <= 0.5 * r0.cv, `${tag}: cv del fondo ${r1.cv.toFixed(4)} contro ${r0.cv.toFixed(4)}`);
      // Il fondo va al livello del fondo più chiaro che esiste: qui l'angolo senza ombra sta sotto
      // la fascia e il fondo visibile più chiaro è già al 95-96% della verità, quindi resta 7-8
      // livelli sotto l'obiettivo delle altre tessere (compromesso dichiarato nel report del 8b).
      const bv = statFondo(t, suFondo).media, bo = statFondo(out, suFondo).media;
      assert.ok(bo - bv >= 2 && Math.abs(bo - bv - SCHIARITO) < 9, `${tag}: fondo ${bo.toFixed(1)}, verità ${bv.toFixed(1)}`);
    }
  }
});

// Distanza dal neutro del colore medio dei pixel scelti, in a*b* (il rumore residuo non conta).
function cromaMedia(img, scegli) {
  const a = img.data, w = img.width, m = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    const p = i / 4;
    if (!scegli(p % w, Math.floor(p / w), i)) continue;
    m[0] += a[i]; m[1] += a[i + 1]; m[2] += a[i + 2]; n++;
  }
  const c = m.map((v) => Math.round(v / n)), y = Math.round(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]);
  return Q.deltaEab({ data: Uint8ClampedArray.from([c[0], c[1], c[2], 255]), width: 1, height: 1 },
    { data: Uint8ClampedArray.from([y, y, y, 255]), width: 1, height: 1 });
}
const conDominante = (img, fr, fb) => {
  const o = copiaImg(img);
  for (let i = 0; i < o.data.length; i += 4) { o.data[i] *= fr; o.data[i + 2] *= fb; }
  return o;
};
// Come in processCard: il bilanciamento lavora sulla copia già ripulita dal rumore.
const ripulita = (img) => {
  const o = copiaImg(img), n = look.estimateNoise(o);
  look.denoise(o, n);
  look.denoiseChroma(o, n);
  return o;
};
const tinteAzzurre = (testo) => {
  const img = tinta(856, 540, 205, 222, 238);
  if (testo) {
    for (let y = 300; y < 480; y++) {
      for (let x = 100; x < 800; x++) if (y % 30 < 12 && x % 9 < 4) { const i = (y * 856 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 38; }
    }
  }
  return img;
};

// Tessera di Synth con fondo, disegno del fondo e testo ricolorati (null: invariato). Il testo di
// Synth è nero bluastro (38,38,46): per le prove di dominante serve anche un nero neutro.
const ricolora = (seed, fondo, testo) => {
  const t = Synth.truth('card', { w: 856, h: 540, seed });
  const k = coloreDiFondo(t), b = [k >> 16, (k >> 8) & 255, k & 255];
  for (let i = 0; i < t.data.length; i += 4) {
    const r = t.data[i], g = t.data[i + 1], bb = t.data[i + 2];
    if (fondo && r === b[0] && g === b[1] && bb === b[2]) t.data.set(fondo, i);
    else if (fondo && r === b[0] - 14 && g === b[1] - 14 && bb === b[2] - 10) t.data.set([fondo[0] - 14, fondo[1] - 14, fondo[2] - 10], i);
    else if (testo && r === 38 && g === 38 && bb === 46) t.data.set(testo, i);
  }
  return t;
};
const NEUTRO = [232, 232, 230];
const suNeutro = (t) => sulColore(t, (NEUTRO[0] << 16) | (NEUTRO[1] << 8) | NEUTRO[2]);
const degradaId = (t, seed) => degrade(t, { shadow: 'diagonal', shadowDepth: 0.4, noise: 6, blocks: 5, seed });
const processaId = (d) => look.process(d, { corners: null, settings: preset('identita-colori', { perspective: false }) }, opsDiProva());

test('whiteBalance: la dominante blu su fondo neutro con testo nero si riduce almeno della metà (5 semi)', () => {
  for (const seed of SEMI_ID) {
    const t = ricolora(seed, NEUTRO, [38, 38, 38]), suFondo = suNeutro(t);
    const tc = conDominante(t, 0.92, 1.18);
    for (const [nome, src] of [['pulita', tc], ['degradata', ripulita(degradaId(tc, seed))]]) {
      const out = look.whiteBalance(copiaImg(src));
      const c0 = cromaMedia(src, suFondo), c1 = cromaMedia(out, suFondo);
      assert.ok(c1 <= 0.5 * c0, `seme ${seed} ${nome}: distanza dal neutro ${c1.toFixed(2)} contro ${c0.toFixed(2)}`);
      // i guadagni restano tra 0,88 e 1,12
      for (let i = 0; i < src.data.length; i += 4097) {
        for (let c = 0; c < 3; c++) {
          if (src.data[i + c] < 40 || src.data[i + c] > 230) continue;
          const g = out.data[i + c] / src.data[i + c];
          assert.ok(g > 0.87 && g < 1.13, `seme ${seed} ${nome}: guadagno ${g.toFixed(3)}`);
        }
      }
    }
    // e la tessera intera esce meno blu
    const dc = degradaId(tc, seed), out = processaId(dc);
    assert.ok(cromaMedia(out, suFondo) < 0.7 * cromaMedia(dc, suFondo), `seme ${seed}: processo ${cromaMedia(out, suFondo).toFixed(2)} contro ${cromaMedia(dc, suFondo).toFixed(2)}`);
  }
});

// Comportamento dichiarato: dove fondo e testo non si spostano insieme la dominante non si
// distingue da un colore proprio e il bilanciamento non scatta. Il beige di Synth sotto la luce blu
// diventa un azzurro chiaro (spostamento B/G 0,04) mentre il suo testo bluastro si sposta di 0,3;
// il fondo neutro con il testo bluastro di Synth: il testo sotto la dominante è troppo saturo per
// il nucleo del testo (0,35) e manca la conferma. Una dominante su un solo asse (qui B x1,10 con R
// fermo) non si corregge: serve lo spostamento confermato di R/G e di B/G insieme.
test('whiteBalance: dominante non confermata dal testo, nessuna correzione (5 semi)', () => {
  for (const seed of SEMI_ID) {
    const casi = [['beige di Synth', Synth.truth('card', { w: 856, h: 540, seed }), 0.92, 1.18], ['neutro, testo bluastro', ricolora(seed, NEUTRO, null), 0.92, 1.18],
      ['neutro, solo B', ricolora(seed, NEUTRO, [38, 38, 38]), 1, 1.1]];
    for (const [nome, t, fr, fb] of casi) {
      const src = ripulita(degradaId(conDominante(t, fr, fb), seed));
      assert.equal(Q.deltaEab(look.whiteBalance(copiaImg(src)), src), 0, `seme ${seed} ${nome}`);
    }
  }
});

test('whiteBalance in process: i colori propri non si falsano, anche con testo blu (5 semi)', () => {
  const casi = [
    ['azzurro chiaro, testo blu', [235, 240, 250], [25, 35, 80]],
    ['grigio-azzurro', [150, 160, 170], null],
    ['fondo di Synth, testo blu', null, [25, 35, 80]],
    ['azzurro, testo nero', [205, 222, 238], [38, 38, 38]],
    ['lilla, testo nero', [226, 214, 232], [38, 38, 38]],
    // azzurri con R circa uguale a G: con il testo bluastro di Synth si sposta solo B/G
    ['azzurro R = G (225,225,247)', [225, 225, 247], null],
    ['azzurro R = G (215,215,235)', [215, 215, 235], null],
    ['azzurro (220,225,245)', [220, 225, 245], null]
  ];
  for (const seed of SEMI_ID) {
    for (const [nome, fondo, testo] of casi) {
      const t = ricolora(seed, fondo, testo), suFondo = sulColore(t, coloreDiFondo(t));
      const d = degradaId(t, seed);
      // il passo da solo non fa nulla
      const dp = ripulita(d);
      assert.ok(Q.deltaEab(look.whiteBalance(copiaImg(dp)), dp) < 1, `seme ${seed} ${nome}: whiteBalance`);
      // e in process il croma del fondo non perde più del 30%
      const cv = cromaMedia(t, suFondo), co = cromaMedia(processaId(d), suFondo);
      assert.ok(co >= 0.7 * cv, `seme ${seed} ${nome}: croma ${co.toFixed(2)}, verità ${cv.toFixed(2)}`);
    }
  }
});

test('whiteBalance: nessun effetto senza dominante e sui colori propri della tessera', () => {
  // tessere senza dominante (fondo beige e azzurro, testo e ritratto), pulite e degradate
  for (const seed of SEMI_ID) {
    const t = Synth.truth('card', { w: 856, h: 540, seed });
    const dp = ripulita(degrade(t, { shadow: 'diagonal', shadowDepth: 0.4, noise: 6, blocks: 5, seed }));
    for (const [nome, src] of [['verità', t], ['degradata', dp]]) {
      const dE = Q.deltaEab(look.whiteBalance(copiaImg(src)), src);
      assert.ok(dE < 1, `seme ${seed} ${nome}: deltaEab ${dE.toFixed(3)}`);
    }
  }
  // fondo azzurro proprio uniforme, da solo o con testo nero: il croma resta
  for (const testo of [false, true]) {
    const a = tinteAzzurre(testo), azzurro = (x, y, i) => a.data[i] === 205;
    const o = look.whiteBalance(copiaImg(a));
    assert.ok(cromaMedia(o, azzurro) >= 0.7 * cromaMedia(a, azzurro), `azzurro, testo ${testo}: ${cromaMedia(o, azzurro).toFixed(2)} contro ${cromaMedia(a, azzurro).toFixed(2)}`);
    const d = degrade(a, { shadow: 'diagonal', shadowDepth: 0.4, noise: 6, blocks: 5, seed: 1 });
    const op = look.process(d, { corners: null, settings: preset('identita-colori', { perspective: false }) }, opsDiProva());
    assert.ok(cromaMedia(op, azzurro) >= 0.7 * cromaMedia(a, azzurro), `azzurro in process, testo ${testo}: ${cromaMedia(op, azzurro).toFixed(2)}`);
  }
});

test('whiteBalance: sul posto, trasparenza intatta, immagini minime e piatte senza eccezioni', () => {
  const t = conDominante(ricolora(1, NEUTRO, [38, 38, 38]), 0.92, 1.18);
  const td = conTrasparenza(t, 'angolo'), ref = td.data;
  const o = look.whiteBalance(td);
  assert.equal(o, td);
  assert.equal(o.data, ref);
  const prima = conTrasparenza(t, 'angolo');
  alfaInvariato(o, prima, 'whiteBalance');
  for (let i = 0; i < ref.length; i += 4) if (prima.data[i + 3] === 0) assert.deepEqual(Array.from(ref.slice(i, i + 4)), [0, 0, 0, 0]);
  assert.ok(Q.deltaEab(o, prima) > 0.5, 'la dominante non è stata corretta con la zona trasparente');
  for (const src of [immagine(25, 19), immagine(1, 1), immagine(3, 40), tinta(40, 30, 255, 255, 255), tinta(40, 30, 0, 0, 0), tinta(40, 30, 180, 200, 240)]) {
    const c = copiaImg(src);
    look.whiteBalance(c);
    for (const v of c.data) assert.ok(Number.isFinite(v));
  }
  // una tinta piatta non ha testo che confermi la dominante: resta com'è
  const piatta = tinta(40, 30, 180, 200, 240);
  assert.deepEqual(Array.from(look.whiteBalance(copiaImg(piatta)).data), Array.from(piatta.data));
});

test('roundedMask: angoli bianchi opachi, bordo sfumato di un pixel, interno invariato, sul posto', () => {
  const src = tinta(200, 126, 40, 90, 160);
  const img = copiaImg(src), ref = img.data;
  const out = look.roundedMask(img, 0.037);
  assert.equal(out, img);
  assert.equal(out.data, ref);
  const w = 200, h = 126, r = 0.037 * w;
  let sfumati = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, px = x + 0.5, py = y + 0.5;
      const cx = Math.min(Math.max(px, r), w - r), cy = Math.min(Math.max(py, r), h - r);
      const dist = Math.hypot(px - cx, py - cy);
      const pix = Array.from(out.data.slice(i, i + 4));
      if (dist <= r - 0.5) assert.deepEqual(pix, [40, 90, 160, 255], `interno ${x},${y}`);
      else if (dist >= r + 0.5) assert.deepEqual(pix, [255, 255, 255, 255], `esterno ${x},${y}`);
      else { sfumati++; assert.equal(pix[3], 255); assert.ok(pix[0] >= 40 && pix[0] <= 255); }
    }
  }
  assert.ok(sfumati > 0);
  // raggio non valido: nessuna azione; immagini minime senza eccezioni
  for (const f of [0, -1, NaN, undefined]) assert.deepEqual(Array.from(look.roundedMask(copiaImg(src), f).data), Array.from(src.data));
  for (const [mw, mh] of [[1, 1], [2, 2], [3, 40], [25, 19]]) look.roundedMask(tinta(mw, mh, 1, 2, 3), 0.5);
  // un pixel trasparente nella sfumatura diventa bianco, non grigio
  const tr = tinta(100, 60, 0, 0, 0);
  for (let i = 3; i < tr.data.length; i += 4) tr.data[i] = 0;
  look.roundedMask(tr, 0.1);
  for (let i = 0; i < tr.data.length; i += 4) if (tr.data[i + 3] === 255) assert.deepEqual(Array.from(tr.data.slice(i, i + 3)), [255, 255, 255]);
});

test('estimateNoise.chroma: circa 0 con rumore grigio, alto con rumore per canale (3 semi)', () => {
  for (const seed of SEMI) {
    const g = look.estimateNoise(conRumoreGrigio(liscia(400, 300), 8, seed));
    assert.ok(g.chroma < 1, `grigio, seme ${seed}: chroma ${g.chroma.toFixed(2)}`);
    const t = Synth.truth('card', { w: 856, h: 540, seed });
    assert.ok(look.estimateNoise(t).chroma < 1, 'verità pulita, seme ' + seed);
    const c = look.estimateNoise(degrade(t, { noise: 6, blocks: 0, seed }));
    assert.ok(c.chroma > 4 && c.chroma < 10, `per canale, seme ${seed}: chroma ${c.chroma.toFixed(2)}`);
  }
});

test('denoiseChroma: rumore di colore ridotto, luminanza e bordi conservati, trasparenza intatta (3 semi)', () => {
  for (const seed of SEMI) {
    const t = Synth.truth('card', { w: 856, h: 540, seed });
    const d = degrade(t, { noise: 6, blocks: 0, seed });
    const out = look.denoiseChroma(copiaImg(d), look.estimateNoise(d));
    const tag = 'seme ' + seed;
    assert.ok(Q.deltaEab(out, t) < 0.5 * Q.deltaEab(d, t), `${tag}: deltaEab ${Q.deltaEab(out, t).toFixed(2)} contro ${Q.deltaEab(d, t).toFixed(2)}`);
    assert.ok(Q.rmseLuma(out, d) < 0.5, `${tag}: luminanza cambiata, rmse ${Q.rmseLuma(out, d).toFixed(3)}`);
    // su un'immagine pulita, con la sigma di un'immagine rumorosa, i colori veri restano
    const p = look.denoiseChroma(copiaImg(t), { sigma: 5, chroma: 7 });
    assert.ok(Q.deltaEab(p, t) < 0.5, `${tag}: pulita deltaEab ${Q.deltaEab(p, t).toFixed(3)}`);
    const f = Synth.truth('sheet', { w: 600, h: 849, seed });
    assert.deepEqual(Array.from(look.denoiseChroma(copiaImg(f), { sigma: 5, chroma: 7 }).data), Array.from(f.data), tag + ': foglio pulito');
    const td = conTrasparenza(d, 'angolo');
    const o2 = look.denoiseChroma(copiaImg(td), look.estimateNoise(td));
    alfaInvariato(o2, td, tag);
    for (let i = 0; i < td.data.length; i += 4) if (td.data[i + 3] === 0) assert.deepEqual(Array.from(o2.data.slice(i, i + 4)), [0, 0, 0, 0]);
  }
  const src = immagine(30, 20);
  for (const opts of [{}, { chroma: 1 }, { chroma: NaN }, { chroma: -4 }]) {
    assert.deepEqual(Array.from(look.denoiseChroma(copiaImg(src), opts).data), Array.from(src.data));
  }
  const img = copiaImg(src), ref = img.data;
  assert.equal(look.denoiseChroma(img, { sigma: 3, chroma: 1e9 }), img);
  assert.equal(img.data, ref);
  for (const [w, h] of [[1, 1], [2, 2], [3, 40], [40, 3], [25, 19]]) {
    assert.equal(look.denoiseChroma(immagine(w, h), { sigma: 3, chroma: 5 }).data.length, w * h * 4);
  }
});

test('denoise: sigma enorme limitata, nessuna eccezione', () => {
  const src = conRumoreGrigio(liscia(60, 40), 8, 1);
  const out = look.denoise(copiaImg(src), { sigma: 1e9, blockiness: 1 });
  assert.equal(out.data.length, src.data.length);
});

// ---- fogli: Colori e Grigi (Task 9) ----

const foglioDegradato = (seed, ombra = 'diagonal', w = 600, h = 849, ritocca) => {
  const t = Synth.truth('sheet', { w, h, seed });
  if (ritocca) ritocca(t);
  return { t, d: degrade(t, { shadow: ombra, shadowDepth: 0.4, noise: 6, blocks: 5, seed }) };
};
const ROSSO = (225 << 16) | (20 << 8) | 25, TIMBRO = (205 << 16) | (28 << 8) | 38, GIALLO = (255 << 16) | (238 << 8) | 0;
const BIANCO = 0xffffff;
const processaFoglio = (d, modo, extra, corners = null) =>
  look.process(d, { corners, settings: preset(modo, Object.assign({ perspective: false }, extra)) }, opsDiProva());
// Mediana per canale dei pixel scelti: il colore tipico di un tratto, senza dipendere da un pixel di bordo.
function medianaColore(img, scegli) {
  const c = [[], [], []], a = img.data, w = img.width;
  for (let i = 0; i < a.length; i += 4) {
    const p = i / 4;
    if (scegli(p % w, Math.floor(p / w), i)) for (let k = 0; k < 3; k++) c[k].push(a[i + k]);
  }
  return c.map((v) => { v.sort((x, y) => x - y); return v[v.length >> 1]; });
}
// Carta (bianco della verità) lontana almeno 3 pixel da ogni segno: lì il fondo deve essere bianco.
function cartaLontana(t, r = 3) {
  const w = t.width, h = t.height, d = t.data, ok = new Uint8Array(w * h);
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      let tutto = true;
      for (let dy = -r; dy <= r && tutto; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const i = ((y + dy) * w + x + dx) * 4;
          if (d[i] !== 255 || d[i + 1] !== 255 || d[i + 2] < 240) { tutto = false; break; }
        }
      }
      ok[y * w + x] = tutto ? 1 : 0;
    }
  }
  return (x, y) => ok[y * w + x] === 1;
}

test('foglio-grigi: fondo bianco, R = G = B, testo non più sfocato, blocchi ridotti (3 semi, ombra diagonale e di mano)', () => {
  for (const seed of SEMI) {
    for (const ombra of ['diagonal', 'hand']) {
      const { t, d } = foglioDegradato(seed, ombra);
      const copia = Array.from(d.data);
      const out = processaFoglio(d, 'foglio-grigi');
      const tag = `seme ${seed} ${ombra}`;
      assert.deepEqual(Array.from(d.data), copia, tag + ': input modificato');
      assert.equal(out.width, 600);
      assert.equal(out.height, 849);
      const o = out.data;
      for (let i = 0; i < o.length; i += 4) {
        if (o[i] !== o[i + 1] || o[i] !== o[i + 2]) assert.fail(`${tag}: pixel ${i / 4} non grigio`);
      }
      assert.ok(Q.paperLevel(out) >= 252, `${tag}: paperLevel ${Q.paperLevel(out).toFixed(1)}`);
      // la carta lontana dal testo è bianca (spec: entro 3 livelli dal bianco), anche nell'ombra
      const carta = statFondo(out, cartaLontana(t));
      assert.ok(carta.media >= 252, `${tag}: carta ${carta.media.toFixed(1)}`);
      const sd = Q.sharpnessIndex(d), so = Q.sharpnessIndex(out);
      assert.ok(so >= sd, `${tag}: nitidezza ${so.toFixed(1)}, ingresso ${sd.toFixed(1)}`);
      // come nei Task 7 e 8: l'eccesso di blocchettatura sulla verità (che vale più di 1 per il
      // testo) cala almeno della metà
      const bt = Q.blockiness(t), bd = Q.blockiness(d), bo = Q.blockiness(out);
      assert.ok(bo - bt <= 0.5 * (bd - bt), `${tag}: blockiness ${bo.toFixed(3)}, ingresso ${bd.toFixed(3)}, verità ${bt.toFixed(3)}`);
      // il testo nero resta scuro
      const testo = statFondo(out, (x, y, i) => lumaPx(t.data, i) < 20);
      assert.ok(testo.media < 90, `${tag}: testo ${testo.media.toFixed(1)}`);
    }
  }
});

test('foglio-colori: fondo bianco, rosso del testo e del timbro e giallo dell\'evidenziatore conservati (3 semi)', () => {
  for (const seed of SEMI) {
    const { t, d } = foglioDegradato(seed);
    const out = processaFoglio(d, 'foglio-colori');
    const tag = 'seme ' + seed;
    assert.ok(Q.paperLevel(out) >= 252, `${tag}: paperLevel ${Q.paperLevel(out).toFixed(1)}`);
    const carta = statFondo(out, cartaLontana(t));
    assert.ok(carta.media >= 252, `${tag}: carta ${carta.media.toFixed(1)}`);
    const [r1, g1, b1] = medianaColore(out, sulColore(t, ROSSO));
    assert.ok(r1 > 180 && g1 < 90 && b1 < 90, `${tag}: testo rosso ${r1},${g1},${b1}`);
    const [r2, g2, b2] = medianaColore(out, sulColore(t, TIMBRO));
    assert.ok(r2 > 180 && g2 < 90 && b2 < 90, `${tag}: timbro ${r2},${g2},${b2}`);
    const [r3, g3, b3] = medianaColore(out, sulColore(t, GIALLO));
    assert.ok(r3 > 200 && g3 > 200 && b3 < 120, `${tag}: evidenziatore ${r3},${g3},${b3}`);
    const sd = Q.sharpnessIndex(d), so = Q.sharpnessIndex(out);
    assert.ok(so >= sd, `${tag}: nitidezza ${so.toFixed(1)}, ingresso ${sd.toFixed(1)}`);
    const bt = Q.blockiness(t), bd = Q.blockiness(d), bo = Q.blockiness(out);
    assert.ok(bo - bt <= 0.5 * (bd - bt), `${tag}: blockiness ${bo.toFixed(3)}, ingresso ${bd.toFixed(3)}, verità ${bt.toFixed(3)}`);
    // la differenza con Grigi resta visibile sui colori vivi
    const grigi = processaFoglio(d, 'foglio-grigi');
    const [rg, gg] = medianaColore(grigi, sulColore(t, ROSSO));
    assert.ok(r1 - g1 > 100 && Math.abs(rg - gg) === 0, `${tag}: rosso ${r1},${g1} contro grigi ${rg},${gg}`);
  }
});

test('foglio-colori: una carta giallina (tinta 8 su B) diventa bianca neutra entro 3 livelli (3 semi)', () => {
  const giallina = (t) => { for (let i = 0; i < t.data.length; i += 4) if (t.data[i] === 255 && t.data[i + 1] === 255 && t.data[i + 2] === 255) t.data[i + 2] = 247; };
  for (const seed of SEMI) {
    const { t, d } = foglioDegradato(seed, 'diagonal', 600, 849, giallina);
    const out = processaFoglio(d, 'foglio-colori');
    const tag = 'seme ' + seed, scegli = cartaLontana(t);
    let sr = 0, sb = 0, sp = 0, n = 0;
    for (let i = 0; i < out.data.length; i += 4) {
      const p = i / 4;
      if (!scegli(p % 600, Math.floor(p / 600))) continue;
      const o = out.data;
      sr += o[i]; sb += o[i + 2]; sp += Math.max(o[i], o[i + 1], o[i + 2]) - Math.min(o[i], o[i + 1], o[i + 2]); n++;
    }
    assert.ok(Math.abs(sr - sb) / n <= 3 && sp / n <= 3, `${tag}: R - B ${((sr - sb) / n).toFixed(2)}, escursione ${(sp / n).toFixed(2)}`);
    assert.ok(Q.paperLevel(out) >= 252, `${tag}: paperLevel ${Q.paperLevel(out).toFixed(1)}`);
    // il rosso resta rosso anche sulla carta giallina
    const [r1, g1, b1] = medianaColore(out, sulColore(t, ROSSO));
    assert.ok(r1 > 180 && g1 < 90 && b1 < 90, `${tag}: testo rosso ${r1},${g1},${b1}`);
  }
});

test('fogli: nessun filo nero ai margini dopo un warp con zona trasparente (3 semi)', () => {
  for (const seed of SEMI) {
    const { d } = foglioDegradato(seed);
    for (const modo of ['foglio-colori', 'foglio-grigi']) {
      const out = look.process(d, { corners: tutto, settings: preset(modo) }, opsDiProva());
      assert.equal(Q.darkBorderPixels(out, 3), 0, `seme ${seed} ${modo}`);
      assert.ok(senzaAlfaZero(out));
    }
  }
});

// Dal Task 10 docType assente passa da classifyDocument: il foglio degradato è riconosciuto come
// foglio, quindi l'uscita resta quella con docType 'foglio'.
test('fogli: docType assente, il foglio è riconosciuto come foglio; onStage emette gli stadi eseguiti, senza maschera', () => {
  const { d } = foglioDegradato(1, 'diagonal', 300, 424);
  const conTipo = processaFoglio(d, 'foglio-colori');
  const senzaTipo = look.process(d, { corners: null, settings: Object.assign(preset('foglio-colori', { perspective: false }), { docType: undefined }) }, opsDiProva());
  assert.deepEqual(Array.from(senzaTipo.data), Array.from(conTipo.data));
  const visti = [], ops = opsDiProva();
  look.process(d, {
    corners: angoli(5, 95), settings: preset('foglio-colori', { keystoneV: 3, rotFine: 2 }),
    onStage: (nome, ms) => { assert.equal(typeof ms, 'number'); visti.push(nome); }
  }, ops);
  assert.deepEqual(visti, ['denoise', 'warp', 'keystone', 'rotate', 'illumination', 'tone', 'sharpen']);
  assert.deepEqual(ops.rotazioni, [2]);
  const pochi = [];
  look.process(d, { corners: null, settings: preset('foglio-grigi', { sharpen: 0 }), onStage: (n) => pochi.push(n) }, opsDiProva());
  assert.deepEqual(pochi, ['denoise', 'illumination', 'tone']);
});

test('fogli: immagini minime e piatte senza eccezioni, bianco resta bianco, nero resta nero, input intatto', () => {
  const casi = [immagine(25, 19), tinta(40, 30, 255, 255, 255), tinta(40, 30, 0, 0, 0), tinta(40, 30, 180, 120, 60),
    immagine(1, 1), immagine(3, 40)];
  for (const src of casi) {
    const copia = Array.from(src.data);
    for (const modo of ['foglio-colori', 'foglio-grigi']) {
      for (const corners of [null, angoli(5, 95)]) {
        const out = look.process(src, { corners, settings: preset(modo, { sharpen: 10, contrast: 50, brightness: 20 }) }, opsDiProva());
        assert.notEqual(out.data, src.data);
        assert.ok(senzaAlfaZero(out));
        if (!corners || src.width < 20) {
          assert.equal(out.width, src.width);
          assert.equal(out.height, src.height);
        }
      }
    }
    assert.deepEqual(Array.from(src.data), copia);
  }
  for (const modo of ['foglio-colori', 'foglio-grigi']) {
    const bianca = processaFoglio(tinta(40, 30, 255, 255, 255), modo);
    assert.ok(bianca.data.every((v) => v === 255), modo + ': bianca');
    const nera = processaFoglio(tinta(40, 30, 0, 0, 0), modo);
    for (let i = 0; i < nera.data.length; i += 4) assert.deepEqual(Array.from(nera.data.slice(i, i + 4)), [0, 0, 0, 255], modo + ': nera');
  }
});

test('fogli: contrasto e luminosità come ritocco dopo la curva', () => {
  const { d } = foglioDegradato(2);
  const zero = processaFoglio(d, 'foglio-grigi', { sharpen: 0 }), scura = processaFoglio(d, 'foglio-grigi', { sharpen: 0, brightness: -30 });
  const media = (img) => { let m = 0; for (let i = 0; i < img.data.length; i += 4) m += lumaPx(img.data, i); return m / (img.data.length / 4); };
  assert.ok(media(scura) < media(zero) - 20, `luminosità: ${media(scura).toFixed(1)} contro ${media(zero).toFixed(1)}`);
});

test('fogli: la bozza a metà risoluzione somiglia alla piena (parametri relativi al lato lungo)', () => {
  // la bozza è la stessa foto ridotta a metà (media 2x2), come nell'app
  const { d } = foglioDegradato(1, 'diagonal', 1200, 1696);
  const meta = (img) => {
    const w = img.width >> 1, h = img.height >> 1, o = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 4; c++) {
          let s = 0;
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += img.data[((2 * y + dy) * img.width + 2 * x + dx) * 4 + c];
          o[(y * w + x) * 4 + c] = s / 4;
        }
      }
    }
    return { data: o, width: w, height: h };
  };
  const piena = meta(processaFoglio(d, 'foglio-colori')), bozza = processaFoglio(meta(d), 'foglio-colori');
  // confronto della luminanza media su blocchi di 24 pixel della bozza
  const w = 600, h = 848, b = 24;
  let peggiore = 0;
  for (let by = 0; by + b <= h; by += b) {
    for (let bx = 0; bx + b <= w; bx += b) {
      let sp = 0, sb = 0;
      for (let y = by; y < by + b; y++) {
        for (let x = bx; x < bx + b; x++) { sb += lumaPx(bozza.data, (y * w + x) * 4); sp += lumaPx(piena.data, (y * w + x) * 4); }
      }
      peggiore = Math.max(peggiore, Math.abs(sp - sb) / (b * b));
    }
  }
  assert.ok(peggiore < 8, `scarto massimo per blocco ${peggiore.toFixed(1)}`);
});

// ---- bianco e nero (Sauvola) e riconoscimento del tipo di documento (Task 10) ----

// Quote sulla verità del foglio: testo = luminanza sotto 128 (nero, rosso, timbro), fondo = bianco
// puro; l'evidenziatore non conta. eInk(p) dice se il pixel p è inchiostro nel risultato.
function quoteBn(t, eInk) {
  const v = t.data;
  let nt = 0, tt = 0, nf = 0, ff = 0;
  for (let p = 0, i = 0; i < v.length; p++, i += 4) {
    if (lumaPx(v, i) < 128) { nt++; if (eInk(p)) tt++; }
    else if (v[i] === 255 && v[i + 1] === 255 && v[i + 2] === 255) { nf++; if (!eInk(p)) ff++; }
  }
  return { testo: tt / nt, fondo: ff / nf };
}
const nero = (out) => (p) => out.data[p * 4] === 0;
// Confronto byte per byte senza il diff di assert.deepEqual, che su array grandi esaurisce la memoria.
const stessiByte = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const ottavo = (w, h) => Math.round(Math.min(w, h) / 8);
// Ogni pixel nero o bianco, grigio, opaco.
function soloBiancoNero(out) {
  const o = out.data;
  for (let i = 0; i < o.length; i += 4) {
    if ((o[i] !== 0 && o[i] !== 255) || o[i + 1] !== o[i] || o[i + 2] !== o[i] || o[i + 3] !== 255) return false;
  }
  return true;
}
// Componenti connessi (8 vicini) dei pixel scelti, nelle righe da y0 a y1 escluso.
function componenti(scegli, w, y0, y1) {
  const visto = new Uint8Array(w * (y1 - y0)), coda = [];
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const k = (y - y0) * w + x;
      if (visto[k] || !scegli(y * w + x)) continue;
      n++; visto[k] = 1; coda.push(x, y);
      while (coda.length) {
        const cy = coda.pop(), cx = coda.pop();
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= w || ny < y0 || ny >= y1) continue;
            const kk = (ny - y0) * w + nx;
            if (!visto[kk] && scegli(ny * w + nx)) { visto[kk] = 1; coda.push(nx, ny); }
          }
        }
      }
    }
  }
  return n;
}

test('sauvola: sul foglio degradato con ombra il testo è inchiostro e il fondo no (3 semi, ombra diagonale e di mano)', () => {
  for (const seed of SEMI) {
    for (const ombra of ['diagonal', 'hand']) {
      const { t, d } = foglioDegradato(seed, ombra);
      const Y = T.lumaOf(d), copia = Float32Array.from(Y);
      const mask = look.sauvola(Y, 600, 849, { window: ottavo(600, 849), k: 0.25 });
      assert.ok(mask instanceof Uint8Array && mask.length === 600 * 849);
      assert.deepEqual(Y, copia, 'Y modificata');
      assert.ok(mask.every((v) => v === 0 || v === 1));
      const q = quoteBn(t, (p) => mask[p] === 1), tag = `seme ${seed} ${ombra}`;
      assert.ok(q.testo >= 0.9, `${tag}: testo ${(100 * q.testo).toFixed(2)}%`);
      assert.ok(q.fondo >= 0.99, `${tag}: fondo ${(100 * q.fondo).toFixed(2)}%`);
    }
  }
});

test('sauvola: zone piatte, immagini minime e finestre più grandi dell\'immagine senza eccezioni', () => {
  const bianca = look.sauvola(costante(30, 20, 255), 30, 20, { window: 9, k: 0.25 });
  assert.ok(bianca.every((v) => v === 0), 'bianca');
  const grigia = look.sauvola(costante(30, 20, 128), 30, 20, { window: 9, k: 0.25 });
  assert.ok(grigia.every((v) => v === 0), 'grigio uniforme');
  const nera = look.sauvola(costante(30, 20, 0), 30, 20, { window: 9, k: 0.25 });
  assert.ok(nera.every((v) => v === 1), 'nera');
  for (const [w, h, win] of [[1, 1, 1], [1, 1, 50], [3, 40, 5], [25, 19, 400]]) {
    const m = look.sauvola(costante(w, h, 200), w, h, { window: win, k: 0.25 });
    assert.equal(m.length, w * h);
  }
  assert.equal(look.sauvola(new Float32Array(0), 0, 0, { window: 3, k: 0.25 }).length, 0);
});

test('sauvola: tempo indipendente dalla finestra (3 vs 301 su 1000x1000, entro un fattore 3)', () => {
  const Y = new Float32Array(1000 * 1000);
  for (let i = 0; i < Y.length; i++) Y[i] = (i * 37) % 256;
  const tempo = (win) => { const t0 = performance.now(); look.sauvola(Y, 1000, 1000, { window: win, k: 0.25 }); return performance.now() - t0; };
  tempo(3);
  const a = Math.min(tempo(3), tempo(3)), b = Math.min(tempo(301), tempo(301));
  assert.ok(b < 3 * a + 20 && a < 3 * b + 20, `finestra 3: ${a.toFixed(1)} ms, 301: ${b.toFixed(1)} ms`);
});

test('cleanInk: toglie i puntini sotto minPixels, conserva il resto, ricongiunge i tratti spezzati di un pixel', () => {
  const w = 60, h = 40, m = new Uint8Array(w * h);
  const metti = (x, y) => { m[y * w + x] = 1; };
  // puntino di 3 pixel a L
  metti(5, 5); metti(6, 5); metti(5, 6);
  // blocco 8x5 = 40 pixel
  for (let y = 20; y < 25; y++) for (let x = 10; x < 18; x++) metti(x, y);
  // tratto verticale spezzato da un pixel: due pezzi di 10 pixel, ciascuno sotto minPixels
  for (let y = 5; y < 15; y++) metti(40, y);
  for (let y = 16; y < 26; y++) metti(40, y);
  // "n" con l'occhiello largo un pixel: un solo componente, l'occhiello non si riempie
  for (let y = 20; y < 30; y++) { metti(48, y); metti(50, y); }
  metti(49, 20);
  const copia = m.slice();
  const out = look.cleanInk(m, w, h, 12);
  assert.deepEqual(m, copia, 'maschera di ingresso modificata');
  assert.ok(out instanceof Uint8Array && out.length === w * h);
  const a = (x, y) => out[y * w + x];
  assert.equal(a(5, 5) + a(6, 5) + a(5, 6), 0, 'puntino di 3 pixel');
  for (let y = 20; y < 25; y++) for (let x = 10; x < 18; x++) assert.equal(a(x, y), 1, 'blocco di 40');
  for (let y = 5; y < 26; y++) assert.equal(a(40, y), 1, 'tratto ricongiunto, riga ' + y);
  for (let y = 21; y < 30; y++) assert.equal(a(49, y), 0, 'occhiello della n, riga ' + y);
  let tot = 0;
  for (let i = 0; i < out.length; i++) tot += out[i];
  assert.equal(tot, 40 + 21 + 21);
});

test('cleanInk: con la fascia di bordo toglie i fili che toccano il margine e restano sottili', () => {
  const w = 40, h = 30, m = new Uint8Array(w * h);
  // filo largo 2 pixel lungo tutto il margine sinistro
  for (let y = 0; y < h; y++) { m[y * w] = 1; m[y * w + 1] = 1; }
  // tratto che tocca il margine destro ma entra per 10 pixel
  for (let x = 30; x < 40; x++) { m[15 * w + x] = 1; m[16 * w + x] = 1; }
  // blocco interno
  for (let y = 10; y < 14; y++) for (let x = 15; x < 20; x++) m[y * w + x] = 1;
  const out = look.cleanInk(m, w, h, 1, 3);
  for (let y = 0; y < h; y++) assert.equal(out[y * w] + out[y * w + 1], 0, 'filo sul margine, riga ' + y);
  for (let x = 30; x < 40; x++) assert.equal(out[15 * w + x], 1, 'tratto profondo');
  assert.equal(out[12 * w + 17], 1, 'blocco interno');
  // senza fascia il filo resta
  assert.equal(look.cleanInk(m, w, h, 1)[5 * w], 1);
  // immagini minime
  for (const [ww, hh] of [[1, 1], [3, 40], [0, 0]]) assert.equal(look.cleanInk(new Uint8Array(ww * hh).fill(1), ww, hh, 5, 2).length, ww * hh);
});

test('foglio-bn: solo 0 e 255 opachi, testo nero e fondo bianco, input intatto (3 semi, ombra diagonale e di mano)', () => {
  for (const seed of SEMI) {
    for (const ombra of ['diagonal', 'hand']) {
      const { t, d } = foglioDegradato(seed, ombra);
      const copia = Array.from(d.data);
      const out = processaFoglio(d, 'foglio-bn'), tag = `seme ${seed} ${ombra}`;
      assert.ok(stessiByte(d.data, copia), tag + ': input modificato');
      assert.equal(out.width, 600);
      assert.equal(out.height, 849);
      assert.ok(soloBiancoNero(out), tag + ': valori diversi da 0 e 255');
      const q = quoteBn(t, nero(out));
      assert.ok(q.testo >= 0.9, `${tag}: testo ${(100 * q.testo).toFixed(2)}%`);
      assert.ok(q.fondo >= 0.99, `${tag}: fondo ${(100 * q.fondo).toFixed(2)}%`);
    }
  }
});

test('foglio-bn: ombra di mano profonda (0,6), il fondo resta bianco e il testo nero (3 semi)', () => {
  for (const seed of SEMI) {
    const t = Synth.truth('sheet', { w: 600, h: 849, seed });
    const d = degrade(t, { shadow: 'hand', shadowDepth: 0.6, noise: 6, blocks: 5, seed });
    const q = quoteBn(t, nero(processaFoglio(d, 'foglio-bn')));
    assert.ok(q.testo >= 0.9 && q.fondo >= 0.99, `seme ${seed}: testo ${(100 * q.testo).toFixed(2)}%, fondo ${(100 * q.fondo).toFixed(2)}%`);
  }
});

test('foglio-bn: il testo piccolo con tratti di un pixel non si spezza (3 semi)', () => {
  for (const seed of SEMI) {
    // 283x400: righe alte 5 pixel, tratti di un pixel (vedi truthSheet)
    const t = Synth.truth('sheet', { w: 283, h: 400, seed });
    const d = degrade(t, { shadow: 'diagonal', shadowDepth: 0.4, noise: 6, blocks: 5, seed });
    const out = processaFoglio(d, 'foglio-bn'), tag = 'seme ' + seed;
    const q = quoteBn(t, nero(out));
    assert.ok(q.testo >= 0.9 && q.fondo >= 0.99, `${tag}: testo ${(100 * q.testo).toFixed(2)}%, fondo ${(100 * q.fondo).toFixed(2)}%`);
    // righe di testo (sopra il timbro): i pezzi in uscita non superano di più del 10% quelli della verità
    const y1 = Math.round(400 * 0.72);
    const cv = componenti((p) => lumaPx(t.data, p * 4) < 128, 283, 0, y1), co = componenti(nero(out), 283, 0, y1);
    assert.ok(co <= 1.1 * cv && co >= 0.8 * cv, `${tag}: componenti ${co}, verità ${cv}`);
  }
});

test('foglio-bn: una zona nera più larga della finestra resta nera', () => {
  const t = Synth.truth('sheet', { w: 600, h: 849, seed: 1 });
  for (let y = 300; y < 500; y++) for (let x = 200; x < 400; x++) t.data.set([10, 10, 12], (y * 600 + x) * 4);
  const out = processaFoglio(degrade(t, { shadow: 'diagonal', shadowDepth: 0.4, noise: 6, blocks: 5, seed: 1 }), 'foglio-bn');
  let n = 0, neri = 0;
  for (let y = 303; y < 497; y++) for (let x = 203; x < 397; x++) { n++; if (out.data[(y * 600 + x) * 4] === 0) neri++; }
  assert.ok(neri / n >= 0.98, `zona nera ${(100 * neri / n).toFixed(2)}%`);
});

test('foglio-bn: nessun filo nero ai margini, né dalla zona trasparente né da una striscia di sfondo scuro (3 semi)', () => {
  for (const seed of SEMI) {
    const { d } = foglioDegradato(seed);
    const out = look.process(d, { corners: tutto, settings: preset('foglio-bn') }, opsDiProva());
    assert.equal(Q.darkBorderPixels(out, 3), 0, `seme ${seed}: zona trasparente`);
    assert.ok(senzaAlfaZero(out));
    // ritaglio un po' largo su un tavolo scuro: 2 pixel di sfondo per lato dentro il quadrilatero
    const t = Synth.truth('sheet', { w: 600, h: 849, seed });
    const W = 760, H = 1000, ox = 70, oy = 80;
    const scena = tinta(W, H, 45, 45, 45);
    for (let y = 0; y < 849; y++) scena.data.set(t.data.subarray(y * 600 * 4, (y + 1) * 600 * 4), ((oy + y) * W + ox) * 4);
    const ds = degrade(scena, { noise: 4, blocks: 3, seed });
    const pc = (x, y) => ({ x: x / W * 100, y: y / H * 100 });
    const corners = { tl: pc(ox - 2, oy - 2), tr: pc(ox + 602, oy - 2), br: pc(ox + 602, oy + 851), bl: pc(ox - 2, oy + 851) };
    const os = look.process(ds, { corners, settings: preset('foglio-bn') }, opsDiProva());
    assert.equal(Q.darkBorderPixels(os, 3), 0, `seme ${seed}: striscia di sfondo`);
  }
});

test('foglio-bn: immagini minime e piatte senza eccezioni; bianca resta bianca, nera resta nera', () => {
  const casi = [immagine(25, 19), tinta(40, 30, 255, 255, 255), tinta(40, 30, 0, 0, 0), tinta(40, 30, 180, 120, 60),
    immagine(1, 1), immagine(3, 40)];
  for (const src of casi) {
    const copia = Array.from(src.data);
    for (const docType of ['foglio', 'identita', undefined]) {
      for (const corners of [null, angoli(5, 95)]) {
        const out = look.process(src, { corners, settings: preset('foglio-bn', { docType, sharpen: 10, contrast: 50, brightness: 20 }) }, opsDiProva());
        assert.notEqual(out.data, src.data);
        assert.ok(soloBiancoNero(out), `${src.width}x${src.height} ${docType}`);
        if (!corners || src.width < 20) {
          assert.equal(out.width, src.width);
          assert.equal(out.height, src.height);
        }
      }
    }
    assert.deepEqual(Array.from(src.data), copia);
  }
  assert.ok(processaFoglio(tinta(40, 30, 255, 255, 255), 'foglio-bn').data.every((v) => v === 255), 'bianca');
  const nera = processaFoglio(tinta(40, 30, 0, 0, 0), 'foglio-bn');
  for (let i = 0; i < nera.data.length; i += 4) assert.deepEqual(Array.from(nera.data.slice(i, i + 4)), [0, 0, 0, 255], 'nera');
});

test('bn: contrasto e luminosità non contano, inchiostro sì; stadi e avviso per i documenti d\'identità', () => {
  const { d } = foglioDegradato(2, 'diagonal', 300, 424);
  const zero = processaFoglio(d, 'foglio-bn'), ritocco = processaFoglio(d, 'foglio-bn', { contrast: 60, brightness: -40 });
  assert.ok(stessiByte(ritocco.data, zero.data), 'contrasto e luminosità hanno cambiato il bianco e nero');
  const neri = (img) => { let n = 0; for (let i = 0; i < img.data.length; i += 4) if (img.data[i] === 0) n++; return n; };
  const tanto = processaFoglio(d, 'foglio-bn', { inchiostro: 0.1 }), poco = processaFoglio(d, 'foglio-bn', { inchiostro: 0.5 });
  assert.ok(neri(tanto) > neri(poco), `inchiostro 0,1: ${neri(tanto)} neri, 0,5: ${neri(poco)}`);
  const visti = [], ops = opsDiProva();
  look.process(d, {
    corners: angoli(5, 95), settings: preset('foglio-bn', { keystoneV: 3, rotFine: 2 }),
    onStage: (nome, ms) => { assert.equal(typeof ms, 'number'); visti.push(nome); }
  }, ops);
  assert.deepEqual(visti, ['denoise', 'warp', 'keystone', 'rotate', 'illumination', 'threshold', 'clean']);
  assert.deepEqual(ops.rotazioni, [2]);
  // documento d'identità in bianco e nero: funziona, ma avvisa che il ritratto si perde; niente maschera
  const { d: card } = tesseraDegradata(1);
  const id = [];
  const out = look.process(card, { corners: angoli(2, 98), settings: preset('foglio-bn', { docType: 'identita', angoliArrotondati: true }), onStage: (n) => id.push(n) }, opsDiProva());
  assert.equal(id[0], 'avviso-bn');
  assert.ok(id.indexOf('mask') < 0);
  assert.ok(soloBiancoNero(out));
  assert.equal(Q.darkBorderPixels(out, 3), 0);
});

// Il foglio sintetico ha bordi netti: ridotto a metà ogni bordo diventa un pixel misto, che la
// bozza (soglia verso il 20% di copertura) conta come nero e la piena ridotta (media di 4 pixel
// netti) no. Come nelle foto vere, la verità passa prima da una sfocatura 3x3 dell'ottica.
function sfocatura3(img) {
  const w = img.width, h = img.height, o = new Uint8ClampedArray(img.data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += img.data[(yy * w + xx) * 4 + c]; n++; }
          }
        }
        o[(y * w + x) * 4 + c] = s / n;
      }
    }
  }
  return { data: o, width: w, height: h };
}

test('foglio-bn: la bozza a metà risoluzione somiglia alla piena (parametri relativi al lato lungo)', () => {
  const t = sfocatura3(Synth.truth('sheet', { w: 1200, h: 1696, seed: 1 }));
  const d = degrade(t, { shadow: 'diagonal', shadowDepth: 0.4, noise: 6, blocks: 5, seed: 1 });
  const meta = (img) => {
    const w = img.width >> 1, h = img.height >> 1, o = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 4; c++) {
          let s = 0;
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += img.data[((2 * y + dy) * img.width + 2 * x + dx) * 4 + c];
          o[(y * w + x) * 4 + c] = s / 4;
        }
      }
    }
    return { data: o, width: w, height: h };
  };
  const piena = meta(processaFoglio(d, 'foglio-bn')), bozza = processaFoglio(meta(d), 'foglio-bn');
  // quota di nero per blocchi di 24 pixel della bozza: la piena ridotta conta nero sotto 128
  const w = 600, h = 848, b = 24;
  let peggiore = 0, np = 0, nb = 0, diversi = 0;
  for (let by = 0; by + b <= h; by += b) {
    for (let bx = 0; bx + b <= w; bx += b) {
      let sp = 0, sb = 0;
      for (let y = by; y < by + b; y++) {
        for (let x = bx; x < bx + b; x++) {
          const i = (y * w + x) * 4;
          if (bozza.data[i] === 0) sb++;
          if (piena.data[i] < 128) sp++;
          if ((bozza.data[i] === 0) !== (piena.data[i] < 128)) diversi++;
        }
      }
      np += sp; nb += sb;
      peggiore = Math.max(peggiore, Math.abs(sp - sb) / (b * b));
    }
  }
  assert.ok(peggiore < 0.1, `scarto massimo di nero per blocco ${(100 * peggiore).toFixed(1)}%`);
  assert.ok(Math.abs(np - nb) <= 0.1 * np, `nero: piena ${np}, bozza ${nb}`);
  assert.ok(diversi < 0.01 * w * h, `pixel diversi ${(100 * diversi / (w * h)).toFixed(2)}%`);
});

// Tessera, foglio e scontrino con angoli al bordo dell'immagine (rapporto del quadrilatero =
// rapporto dell'immagine) o di default.
const scontrino = (seed) => Synth.truth('sheet', { w: 300, h: 900, seed });
const degrada = (img, seed, ombra = 'diagonal') => degrade(img, { shadow: ombra, shadowDepth: 0.4, noise: 6, blocks: 5, seed });
const DEFAULT = angoli(5, 95);

test('classifyDocument: tessera con angoli del rapporto 1,586 => identita, foglio 1,414 => foglio (3 semi, anche degradati)', () => {
  for (const seed of SEMI) {
    const card = Synth.truth('card', { w: 856, h: 540, seed }), sheet = Synth.truth('sheet', { w: 600, h: 849, seed });
    for (const [nome, img] of [['tessera', card], ['tessera degradata', degrada(card, seed)], ['tessera ombra di mano', degrada(card, seed, 'hand')]]) {
      const r = look.classifyDocument(img, tutto);
      assert.ok(r.docType === 'identita' && r.confidence >= 0.6, `seme ${seed} ${nome}: ${JSON.stringify(r)}`);
    }
    for (const [nome, img] of [['foglio', sheet], ['foglio degradato', degrada(sheet, seed)], ['foglio ombra di mano', degrada(sheet, seed, 'hand')]]) {
      const r = look.classifyDocument(img, tutto);
      assert.ok(r.docType === 'foglio' && r.confidence >= 0.6, `seme ${seed} ${nome}: ${JSON.stringify(r)}`);
    }
  }
});

test('classifyDocument: con gli angoli di default o senza angoli decidono i contenuti (3 semi)', () => {
  for (const seed of SEMI) {
    const card = degrada(Synth.truth('card', { w: 856, h: 540, seed }), seed);
    const sheet = degrada(Synth.truth('sheet', { w: 600, h: 849, seed }), seed);
    for (const corners of [DEFAULT, null]) {
      const c = look.classifyDocument(card, corners), s = look.classifyDocument(sheet, corners);
      assert.equal(c.docType, 'identita', `seme ${seed} tessera ${JSON.stringify(c)}`);
      assert.equal(s.docType, 'foglio', `seme ${seed} foglio ${JSON.stringify(s)}`);
    }
    // con gli angoli di default il rapporto non conta: un foglio in una foto 1,586 resta foglio
    const largo = degrada(Synth.truth('sheet', { w: 856, h: 540, seed }), seed);
    assert.equal(look.classifyDocument(largo, DEFAULT).docType, 'foglio', 'seme ' + seed + ' foglio largo');
  }
});

test('classifyDocument: immagini piatte e indizi in disaccordo => identita con confidenza bassa; il passaporto resta identita', () => {
  // 849x600: il solo rapporto A4 non basta per dire foglio (vale anche per il passaporto)
  for (const img of [tinta(400, 300, 255, 255, 255), tinta(400, 300, 128, 128, 128), tinta(300, 400, 220, 210, 190), tinta(50, 50, 0, 0, 0),
    tinta(849, 600, 250, 250, 250)]) {
    for (const corners of [null, DEFAULT, tutto]) {
      const r = look.classifyDocument(img, corners);
      assert.ok(r.docType === 'identita' && r.confidence < 0.6, `piatta ${img.width}x${img.height}: ${JSON.stringify(r)}`);
    }
  }
  for (const seed of SEMI) {
    // contenuto da foglio in un quadrilatero 1,586: gli indizi non concordano
    const r = look.classifyDocument(Synth.truth('sheet', { w: 856, h: 540, seed }), tutto);
    assert.ok(r.docType === 'identita' && r.confidence < 0.6, `seme ${seed} foglio 1,586: ${JSON.stringify(r)}`);
    // passaporto (ID-3, 125/88 = 1,42): il rapporto coincide con l'A4 e spinge poco verso il foglio,
    // senza contare come disaccordo; decide il contenuto, con confidenza un po' più bassa della
    // stessa tessera in un quadrilatero ID-1
    const p = look.classifyDocument(Synth.truth('card', { w: 880, h: 620, seed }), tutto);
    const id1 = look.classifyDocument(Synth.truth('card', { w: 856, h: 540, seed }), tutto);
    assert.ok(p.docType === 'identita' && p.confidence >= 0.6 && p.confidence < id1.confidence, `seme ${seed} passaporto: ${JSON.stringify(p)}, ID-1 ${JSON.stringify(id1)}`);
  }
});

test('classifyDocument: scontrino stretto e lungo (1:3) => foglio, dal rapporto e dai soli contenuti (3 semi)', () => {
  for (const seed of SEMI) {
    for (const [nome, img] of [['pulito', scontrino(seed)], ['degradato', degrada(scontrino(seed), seed)], ['ombra di mano', degrada(scontrino(seed), seed, 'hand')]]) {
      const conAngoli = look.classifyDocument(img, tutto), soloContenuti = look.classifyDocument(img, DEFAULT);
      assert.ok(conAngoli.docType === 'foglio' && conAngoli.confidence >= 0.9, `seme ${seed} ${nome}: ${JSON.stringify(conAngoli)}`);
      assert.equal(soloContenuti.docType, 'foglio', `seme ${seed} ${nome} solo contenuti: ${JSON.stringify(soloContenuti)}`);
    }
  }
});

// Riduzione a metà con media 2x2, come la bozza dell'app.
function dimezza(img) {
  const w = img.width >> 1, h = img.height >> 1, o = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let s = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += img.data[((2 * y + dy) * img.width + 2 * x + dx) * 4 + c];
        o[(y * w + x) * 4 + c] = s / 4;
      }
    }
  }
  return { data: o, width: w, height: h };
}
// La stessa foto a piena risoluzione, a metà, a un quarto, con la sfocatura dell'ottica 3x3 e
// doppia (circa 5x5): il tipo non deve dipendere dall'antialiasing dei bordi del testo.
const variantiFoto = (t, seed) => {
  const d = degrada(t, seed);
  return [['piena', d], ['metà', dimezza(d)], ['un quarto', dimezza(dimezza(d))],
    ['sfocatura 3x3', degrada(sfocatura3(t), seed)], ['sfocatura 5x5', degrada(sfocatura3(sfocatura3(t)), seed)]];
};
// Documento su un tavolo: scena W x H con il documento in (ox, oy).
function suTavolo(doc, W, H, ox, oy, colore, seed) {
  const s = tinta(W, H, colore[0], colore[1], colore[2]);
  for (let y = 0; y < doc.height; y++) s.data.set(doc.data.subarray(y * doc.width * 4, (y + 1) * doc.width * 4), ((oy + y) * W + ox) * 4);
  return degrade(s, { noise: 4, blocks: 3, seed });
}

test('classifyDocument: stesso tipo a piena risoluzione, a metà, a un quarto e con la sfocatura (foglio, testo piccolo, tessera; 3 semi)', () => {
  for (const seed of SEMI) {
    const casi = [['foglio', Synth.truth('sheet', { w: 1200, h: 1696, seed }), 'foglio'],
      ['testo piccolo', Synth.truth('sheet', { w: 566, h: 800, seed }), 'foglio'],
      ['tessera', Synth.truth('card', { w: 1712, h: 1080, seed }), 'identita']];
    for (const [nome, t, tipo] of casi) {
      for (const [v, img] of variantiFoto(t, seed)) {
        for (const corners of [null, DEFAULT]) {
          const r = look.classifyDocument(img, corners);
          assert.ok(r.docType === tipo && r.confidence >= 0.6, `seme ${seed} ${nome} ${v} ${corners ? 'default' : 'null'}: ${JSON.stringify(r)}`);
        }
      }
    }
  }
});

test('classifyDocument: la bozza a 1200 px e la piena danno lo stesso tipo, anche con il documento su un tavolo (3 semi)', () => {
  for (const seed of SEMI) {
    const casi = [['foglio', degrada(Synth.truth('sheet', { w: 1696, h: 2400, seed }), seed), 'foglio'],
      ['tessera', degrada(Synth.truth('card', { w: 2400, h: 1513, seed }), seed), 'identita']];
    for (const [tavolo, colore] of [['scuro', [45, 45, 45]], ['legno', [120, 80, 50]], ['chiaro', [200, 170, 130]]]) {
      casi.push(['scontrino su tavolo ' + tavolo, suTavolo(Synth.truth('sheet', { w: 600, h: 1800, seed }), 1800, 2400, 600, 300, colore, seed), 'foglio']);
      casi.push(['tessera su tavolo ' + tavolo, suTavolo(Synth.truth('card', { w: 1284, h: 810, seed }), 2400, 1800, 250, 270, colore, seed), 'identita']);
    }
    for (const [nome, piena, tipo] of casi) {
      const bozza = dimezza(piena);
      for (const corners of [null, DEFAULT]) {
        const a = look.classifyDocument(piena, corners), b = look.classifyDocument(bozza, corners);
        assert.ok(a.docType === tipo && b.docType === tipo && a.confidence >= 0.6 && b.confidence >= 0.6,
          `seme ${seed} ${nome} ${corners ? 'default' : 'null'}: piena ${JSON.stringify(a)}, bozza ${JSON.stringify(b)}`);
      }
    }
  }
});

test('process: senza prospettiva docType assente classifica l\'immagine intera, non il quadrilatero', () => {
  const d = degrada(Synth.truth('sheet', { w: 600, h: 849, seed: 1 }), 1);
  // quadrilatero 480 x 303 pixel (1,586) dentro il foglio: con quegli angoli il rapporto dice tessera
  const quad = { tl: { x: 10, y: 30 }, tr: { x: 90, y: 30 }, br: { x: 90, y: 30 + 303 / 849 * 100 }, bl: { x: 10, y: 30 + 303 / 849 * 100 } };
  assert.equal(look.classifyDocument(d, quad).docType, 'identita');
  const st = (docType) => Object.assign(preset('foglio-colori', { perspective: false }), { docType });
  const senza = look.process(d, { corners: quad, settings: st(undefined) }, opsDiProva());
  const foglio = look.process(d, { corners: quad, settings: st('foglio') }, opsDiProva());
  assert.ok(stessiByte(senza.data, foglio.data), 'senza prospettiva il tipo viene dall\'immagine intera');
});

test('classifyDocument: input intatto, confidenza tra 0 e 1, angoli degeneri e immagini minime senza eccezioni', () => {
  const img = degrada(Synth.truth('card', { w: 856, h: 540, seed: 1 }), 1), copia = Array.from(img.data);
  const deg = { tl: { x: 50, y: 50 }, tr: { x: 50, y: 50 }, br: { x: 50, y: 50 }, bl: { x: 50, y: 50 } };
  const fuori = { tl: { x: -20, y: -20 }, tr: { x: 120, y: -20 }, br: { x: 120, y: 120 }, bl: { x: -20, y: 120 } };
  for (const corners of [null, DEFAULT, tutto, deg, fuori]) {
    const r = look.classifyDocument(img, corners);
    assert.ok(r.docType === 'identita' || r.docType === 'foglio');
    assert.ok(r.confidence >= 0 && r.confidence <= 1, JSON.stringify(r));
  }
  assert.ok(stessiByte(img.data, copia), 'input modificato');
  // sotto 64 pixel di lato il contenuto non conta: resta il rapporto, che per 3x40 (oltre 1:2,2)
  // esclude un documento d'identità
  const minime = [[immagine(1, 1), 'identita'], [immagine(25, 19), 'identita'], [immagine(3, 40), 'foglio'],
    [{ data: new Uint8ClampedArray(0), width: 0, height: 0 }, 'identita']];
  for (const [src, tipo] of minime) {
    const r = look.classifyDocument(src, tutto);
    assert.ok(r.docType === tipo && r.confidence >= 0 && r.confidence <= 1, src.width + 'x' + src.height + ' ' + JSON.stringify(r));
    assert.equal(look.classifyDocument(src, null).docType, 'identita', src.width + 'x' + src.height + ' senza angoli');
  }
});

test('process: docType assente usa classifyDocument (tessera => identita, foglio => foglio)', () => {
  const card = degrada(Synth.truth('card', { w: 428, h: 270, seed: 1 }), 1);
  const sheet = degrada(Synth.truth('sheet', { w: 300, h: 424, seed: 1 }), 1);
  for (const modo of ['colori', 'grigi', 'bn']) {
    const senza = (img) => look.process(img, { corners: tutto, settings: Object.assign(preset('foglio-colori'), { mode: modo, docType: undefined, angoliArrotondati: true }) }, opsDiProva());
    const con = (img, docType) => look.process(img, { corners: tutto, settings: Object.assign(preset('foglio-colori'), { mode: modo, docType, angoliArrotondati: true }) }, opsDiProva());
    assert.ok(stessiByte(senza(card).data, con(card, 'identita').data), modo + ' tessera');
    assert.ok(stessiByte(senza(sheet).data, con(sheet, 'foglio').data), modo + ' foglio');
  }
});

// Informativo (non bloccante): tempi per passo su 4000x3000. SF_PERF=1 per eseguirlo.
test('prestazioni foglio-bn 4000x3000 e 2000x1500 (informativo)', { skip: !globalThis.process.env.SF_PERF && 'imposta SF_PERF=1' }, () => {
  for (const [w, h] of [[4000, 3000], [2000, 1500]]) {
    const t = Synth.truth('sheet', { w, h, seed: 1 });
    const d = degrade(t, { shadow: 'diagonal', shadowDepth: 0.4, noise: 6, blocks: 5, seed: 1 });
    for (const [nome, corners] of [['senza warp', null], ['warp 5-95%', angoli(5, 95)]]) {
      const passi = [];
      const t0 = performance.now();
      look.process(d, { corners, settings: preset('foglio-bn'), onStage: (n, ms) => passi.push(n + ' ' + Math.round(ms)) }, opsDiProva());
      console.log(`process foglio-bn ${w}x${h} ${nome}: ${Math.round(performance.now() - t0)} ms [${passi.join(', ')}]`);
    }
    const t1 = performance.now();
    look.classifyDocument(d, angoli(5, 95));
    console.log(`classifyDocument ${w}x${h}: ${Math.round(performance.now() - t1)} ms`);
  }
});

// Informativo (non bloccante): tempi per passo su 4000x3000. SF_PERF=1 per eseguirlo.
test('prestazioni foglio 4000x3000 e 2000x1500 (informativo)', { skip: !globalThis.process.env.SF_PERF && 'imposta SF_PERF=1' }, () => {
  for (const [w, h] of [[4000, 3000], [2000, 1500]]) {
    const t = Synth.truth('sheet', { w, h, seed: 1 });
    const d = degrade(t, { shadow: 'diagonal', shadowDepth: 0.4, noise: 6, blocks: 5, seed: 1 });
    for (const modo of ['foglio-colori', 'foglio-grigi']) {
      for (const [nome, corners] of [['senza warp', null], ['warp 5-95%', angoli(5, 95)]]) {
        const passi = [];
        const t0 = performance.now();
        look.process(d, { corners, settings: preset(modo), onStage: (n, ms) => passi.push(n + ' ' + Math.round(ms)) }, opsDiProva());
        console.log(`process ${modo} ${w}x${h} ${nome}: ${Math.round(performance.now() - t0)} ms [${passi.join(', ')}]`);
      }
    }
  }
});

// Informativo (non bloccante): tempi per passo su 4000x3000. SF_PERF=1 per eseguirlo.
test('prestazioni identita-colori 4000x3000 (informativo)', { skip: !globalThis.process.env.SF_PERF && 'imposta SF_PERF=1' }, () => {
  const t = Synth.truth('card', { w: 4000, h: 3000, seed: 1 });
  const d = degrade(t, { shadow: 'diagonal', shadowDepth: 0.4, noise: 6, blocks: 5, seed: 1 });
  for (const [nome, corners] of [['senza warp', null], ['warp 5-95%', angoli(5, 95)]]) {
    const passi = [];
    const t0 = performance.now();
    look.process(d, { corners, settings: preset('identita-colori'), onStage: (n, ms) => passi.push(n + ' ' + Math.round(ms)) }, opsDiProva());
    console.log(`process 4000x3000 ${nome}: ${Math.round(performance.now() - t0)} ms [${passi.join(', ')}]`);
  }
});

test('classifyDocument: con rumore forte (sigma 10-20) la tessera resta identita e il foglio foglio, a piena e a metà (3 semi)', () => {
  for (const seed of SEMI) {
    for (const sigma of [10, 11, 12, 15, 20]) {
      const casi = [['tessera', Synth.truth('card', { w: 856, h: 540, seed }), 'identita'],
        ['tessera grande', Synth.truth('card', { w: 1712, h: 1080, seed }), 'identita'],
        ['foglio', Synth.truth('sheet', { w: 600, h: 849, seed }), 'foglio']];
      for (const [nome, t, tipo] of casi) {
        const piena = degrade(t, { noise: sigma, blocks: 3, seed });
        for (const [v, img] of [['piena', piena], ['metà', dimezza(piena)]]) {
          for (const corners of [null, DEFAULT]) {
            const r = look.classifyDocument(img, corners);
            assert.ok(r.docType === tipo && r.confidence >= 0.6, `seme ${seed} sigma ${sigma} ${nome} ${v} ${corners ? 'default' : 'null'}: ${JSON.stringify(r)}`);
          }
        }
      }
    }
  }
});


test('flipH e flipV: il risultato è quello della modalità, specchiato (tutte le modalità)', () => {
  const girato = (img, h, v) => {
    const out = new Uint8ClampedArray(img.data.length);
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const s = ((v ? img.height - 1 - y : y) * img.width + (h ? img.width - 1 - x : x)) * 4, d = (y * img.width + x) * 4;
        for (let c = 0; c < 4; c++) out[d + c] = img.data[s + c];
      }
    }
    return out;
  };
  for (const nome of ['identita-colori', 'identita-grigi', 'foglio-colori', 'foglio-grigi', 'foglio-bn', 'originale']) {
    const src = immagine(200, 120);
    const run = (extra) => look.process(copiaImg(src), { corners: angoli(5, 95), settings: preset(nome, extra) }, opsDiProva());
    const a = run({});
    assert.ok(Buffer.from(run({ flipH: false, flipV: false }).data).equals(Buffer.from(a.data)), nome + ': flag spenti');
    for (const [h, v] of [[true, false], [false, true], [true, true]]) {
      const b = run({ flipH: h, flipV: v });
      assert.deepEqual([b.width, b.height], [a.width, a.height], nome);
      assert.ok(Buffer.from(b.data).equals(Buffer.from(girato(a, h, v))), `${nome} h=${h} v=${v}`);
    }
  }
});

test('bilanciaBianco: false spegne il bilanciamento della tessera in Colori; vero o assente lo lasciano', () => {
  const seed = SEMI_ID[0];
  const t = ricolora(seed, NEUTRO, [38, 38, 38]), suFondo = suNeutro(t);
  const dc = degradaId(conDominante(t, 0.92, 1.18), seed);
  const run = (extra) => look.process(copiaImg(dc), { corners: null, settings: preset('identita-colori', Object.assign({ perspective: false }, extra)) }, opsDiProva());
  const con = run({}), esplicito = run({ bilanciaBianco: true }), senza = run({ bilanciaBianco: false });
  assert.equal(Q.deltaEab(con, esplicito), 0, 'vero è come assente');
  assert.ok(cromaMedia(senza, suFondo) > 1.3 * cromaMedia(con, suFondo),
    `senza ${cromaMedia(senza, suFondo).toFixed(2)} contro con ${cromaMedia(con, suFondo).toFixed(2)}`);
});
