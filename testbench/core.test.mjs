import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, loadCoreDetailed } from './lib/load-core.mjs';

const api = loadCore();
const core = api.core;
const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('solveLinearSystem risolve un sistema 2x2', () => {
  const x = core.solveLinearSystem([[2, 1], [1, 3]], [3, 5]);
  close(x[0], 0.8, 1e-9);
  close(x[1], 1.4, 1e-9);
});

test('computeHomography porta i punti sorgente su quelli di destinazione', () => {
  const src = [{ x: 10, y: 10 }, { x: 90, y: 12 }, { x: 88, y: 95 }, { x: 8, y: 90 }];
  const dst = [{ x: 0, y: 0 }, { x: 99, y: 0 }, { x: 99, y: 99 }, { x: 0, y: 99 }];
  const H = core.computeHomography(src, dst);
  for (let i = 0; i < 4; i++) {
    const p = core.applyH(H, src[i].x, src[i].y);
    close(p.x, dst[i].x, 1e-6);
    close(p.y, dst[i].y, 1e-6);
  }
});

test('bilinearSample interpola al centro e restituisce 4 valori', () => {
  const data = new Uint8ClampedArray(16);
  [0, 100, 100, 200].forEach((v, i) => { data[i * 4] = v; data[i * 4 + 3] = 255; });
  const r = core.bilinearSample(data, 2, 2, 0.5, 0.5);
  assert.equal(r.length, 4);
  close(r[0], 100, 1e-9);
});

test('normalizeAlpha azzera RGB dove A è 0 e restituisce lo stesso oggetto', () => {
  const img = { width: 2, height: 1, data: new Uint8ClampedArray([50, 60, 70, 0, 50, 60, 70, 255]) };
  const out = core.normalizeAlpha(img);
  assert.equal(out, img);
  assert.deepEqual(Array.from(img.data), [0, 0, 0, 0, 50, 60, 70, 255]);
});

test('version e apiVersion sono esposte', () => {
  assert.equal(api.version, '0.3.1');
  assert.equal(api.apiVersion, 1);
});

const pt = (x, y) => ({ x, y });

test('outputSize usa il lato più lungo tra opposti', () => {
  const c = { tl: pt(10, 10), tr: pt(90, 10), br: pt(90, 90), bl: pt(10, 90) };
  assert.deepEqual(core.outputSize(c, 1000, 500), { w: 800, h: 400 });
});

function immagine8x8() {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = (y * 8 + x) * 4;
      data[i] = x + 8 * y; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
    }
  }
  return { width: 8, height: 8, data };
}

test('warp copia i pixel interni e lascia trasparente il bordo fuori immagine', () => {
  const img = immagine8x8();
  const c = { tl: pt(0, 0), tr: pt(87.5, 0), br: pt(87.5, 87.5), bl: pt(0, 87.5) };
  const out = core.warp(img, c, 8, 8);
  assert.equal(out.width, 8);
  assert.equal(out.height, 8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = (y * 8 + x) * 4;
      if (x < 7 && y < 7) {
        for (let k = 0; k < 4; k++) assert.equal(out.data[i + k], img.data[i + k], `pixel ${x},${y} canale ${k}`);
      } else {
        assert.deepEqual(Array.from(out.data.slice(i, i + 4)), [0, 0, 0, 0], `pixel ${x},${y}`);
      }
    }
  }
});

test('keystone senza correzioni restituisce lo stesso oggetto, con correzione mantiene le dimensioni', () => {
  const img = immagine8x8();
  assert.equal(core.keystone(img, 0, 0), img);
  const out = core.keystone(img, 10, 0);
  assert.equal(out.width, 8);
  assert.equal(out.height, 8);
});

function immagine5x5() {
  const data = new Uint8ClampedArray(5 * 5 * 4);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const i = (y * 5 + x) * 4;
      const v = (x * 37 + y * 11) % 256;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { width: 5, height: 5, data };
}

const zero = { contrast: 0, brightness: 0, bw: false, autoEnhance: false, sharpen: 0 };

test('sharpen lascia identici i 16 pixel di bordo e restituisce un nuovo oggetto', () => {
  const img = immagine5x5();
  const copia = Uint8ClampedArray.from(img.data);
  const out = core.sharpen(img, 5);
  assert.notEqual(out, img);
  assert.deepEqual(Array.from(img.data), Array.from(copia));
  let bordi = 0;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (x > 0 && x < 4 && y > 0 && y < 4) {
        assert.equal(out.data[(y * 5 + x) * 4 + 3], 255);
        continue;
      }
      bordi++;
      const i = (y * 5 + x) * 4;
      for (let k = 0; k < 4; k++) assert.equal(out.data[i + k], img.data[i + k], `bordo ${x},${y} canale ${k}`);
    }
  }
  assert.equal(bordi, 16);
});

test('enhance con impostazioni a zero lascia i dati identici e restituisce lo stesso oggetto', () => {
  const img = immagine5x5();
  const copia = Uint8ClampedArray.from(img.data);
  const out = core.enhance(img, zero);
  assert.equal(out, img);
  assert.deepEqual(Array.from(img.data), Array.from(copia));
});

test('enhance con bw rende R=G=B su ogni pixel', () => {
  const img = immagine5x5();
  for (let i = 0; i < img.data.length; i += 4) { img.data[i + 1] = (i * 7) % 256; img.data[i + 2] = (i * 13) % 256; }
  core.enhance(img, { ...zero, bw: true });
  for (let i = 0; i < img.data.length; i += 4) {
    assert.equal(img.data[i], img.data[i + 1]);
    assert.equal(img.data[i + 1], img.data[i + 2]);
  }
});

test('enhance con autoEnhance su immagine piatta non modifica i dati', () => {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = 120; data[i + 1] = 120; data[i + 2] = 120; data[i + 3] = 255; }
  const img = { width: 4, height: 4, data };
  const copia = Uint8ClampedArray.from(data);
  core.enhance(img, { ...zero, autoEnhance: true });
  assert.deepEqual(Array.from(img.data), Array.from(copia));
});

test('enhance con luminosita su un pixel trasparente lo lascia a zero', () => {
  const img = { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 0]) };
  core.enhance(img, { ...zero, brightness: 50 });
  assert.deepEqual(Array.from(img.data), [0, 0, 0, 0]);
});

test('enhance con nitidezza modifica sul posto e restituisce lo stesso oggetto', () => {
  const img = immagine5x5();
  const atteso = core.sharpen({ width: 5, height: 5, data: Uint8ClampedArray.from(img.data) }, 3);
  const dati = img.data;
  const out = core.enhance(img, { ...zero, sharpen: 3 });
  assert.equal(out, img);
  assert.equal(out.data, dati);
  assert.deepEqual(Array.from(out.data), Array.from(atteso.data));
});

// ops di prova: scala a vicino più prossimo e conta le chiamate
function opsDiProva() {
  const chiamate = [];
  return {
    chiamate,
    scale(img, w, h, quality) {
      chiamate.push([img.width, img.height, w, h, quality]);
      const out = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        const sy = Math.min(img.height - 1, Math.floor((y + 0.5) * img.height / h));
        for (let x = 0; x < w; x++) {
          const sx = Math.min(img.width - 1, Math.floor((x + 0.5) * img.width / w));
          for (let c = 0; c < 4; c++) out[(y * w + x) * 4 + c] = img.data[(sy * img.width + sx) * 4 + c];
        }
      }
      return { data: out, width: w, height: h };
    },
    rotate() { throw new Error('rotate non usata'); }
  };
}

function immagineUniforme(w, h, lum) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = lum; data[i + 1] = lum; data[i + 2] = lum; data[i + 3] = 255; }
  return { data, width: w, height: h };
}

test('detectDocument trova gli angoli di un rettangolo chiaro su sfondo scuro', () => {
  const img = immagineUniforme(100, 80, 20);
  for (let y = 15; y <= 64; y++) for (let x = 20; x <= 79; x++) {
    const i = (y * 100 + x) * 4;
    img.data[i] = 230; img.data[i + 1] = 230; img.data[i + 2] = 230;
  }
  const ops = opsDiProva();
  const r = api.detectDocument(img, ops);
  assert.equal(r.method, 'otsu-v0');
  assert.equal(r.confidence, null);
  assert.equal(ops.chiamate.length, 0);
  const atteso = { tl: [20, 15], tr: [79, 15], br: [79, 64], bl: [20, 64] };
  for (const k of Object.keys(atteso)) {
    close(r.corners[k].x, atteso[k][0] / 99 * 100, 2);
    close(r.corners[k].y, atteso[k][1] / 79 * 100, 2);
  }
});

test('detectDocument è esposta anche in core', () => {
  assert.equal(core.detectDocument, api.detectDocument);
});

test('detectDocument su immagine uniforme restituisce corners null', () => {
  const r = api.detectDocument(immagineUniforme(100, 80, 100), opsDiProva());
  assert.equal(r.corners, null);
  assert.equal(r.confidence, null);
  assert.equal(r.method, 'otsu-v0');
});

test('detectDocument su 800x600 riduce una volta a 400x300 con qualità low', () => {
  const ops = opsDiProva();
  api.detectDocument(immagineUniforme(800, 600, 100), ops);
  assert.equal(ops.chiamate.length, 1);
  assert.deepEqual(ops.chiamate[0].slice(2), [400, 300, 'low']);
});

test('removeShadows porta lo sfondo di due zone a luminanza diversa a 240', () => {
  const img = immagineUniforme(240, 240, 100);
  for (let y = 0; y < 240; y++) for (let x = 120; x < 240; x++) {
    const i = (y * 240 + x) * 4;
    img.data[i] = 200; img.data[i + 1] = 200; img.data[i + 2] = 200;
  }
  const ops = opsDiProva();
  const out = core.removeShadows(img, ops);
  assert.equal(out.width, 240);
  assert.equal(out.height, 240);
  assert.deepEqual(ops.chiamate.map(c => [c[2], c[3], c[4]]), [[10, 10, 'low'], [240, 240, 'high']]);
  for (const [x, y] of [[10, 120], [230, 120]]) {
    const i = (y * 240 + x) * 4;
    for (let c = 0; c < 3; c++) close(out.data[i + c], 240, 1);
    assert.equal(out.data[i + 3], 255);
  }
});

test('removeShadows su un pixel esteso dal max-filter (cella 3) da 120 e restituisce lo stesso oggetto', () => {
  const img = immagineUniforme(240, 240, 100);
  for (let y = 0; y < 240; y++) for (let x = 120; x < 240; x++) {
    const i = (y * 240 + x) * 4;
    img.data[i] = 200; img.data[i + 1] = 200; img.data[i + 2] = 200;
  }
  const out = core.removeShadows(img, opsDiProva());
  assert.equal(out, img);
  // x=90 cade nella cella 3 (luminanza 100): dopo due passate lo sfondo stimato è 200, quindi 100/200*240
  const i = (120 * 240 + 90) * 4;
  for (let c = 0; c < 3; c++) close(out.data[i + c], 120, 1);
});

// --- process, impostazioni e preset ---

const angoliStandard = { tl: pt(5, 5), tr: pt(95, 5), br: pt(95, 95), bl: pt(5, 95) };

function opsConRotate() {
  const ops = opsDiProva();
  ops.rotate = (img, deg) => { ops.rotazioni.push(deg); return img; };
  ops.rotazioni = [];
  return ops;
}

test('defaultSettings, presets e defaultCorners hanno i valori della 0.2', () => {
  assert.deepEqual(api.defaultSettings(), {
    contrast: 0, brightness: 0, sharpen: 0, bw: false, autoEnhance: false, shadows: false,
    perspective: true, rotFine: 0, keystoneV: 0, keystoneH: 0
  });
  assert.notEqual(api.defaultSettings(), api.defaultSettings());
  assert.deepEqual(Object.keys(api.presets).slice(0, 4), ['document', 'photo', 'id', 'receipt']);
  assert.equal(api.presets.document.contrast, 25);
  assert.deepEqual(api.presets.receipt,
    { contrast: 45, brightness: 10, sharpen: 5, bw: true, autoEnhance: true, shadows: true, perspective: true });
  assert.deepEqual(api.presets.photo,
    { contrast: 10, brightness: 0, sharpen: 1, bw: false, autoEnhance: false, shadows: false, perspective: false });
  assert.deepEqual(core.defaultCorners(), angoliStandard);
});

test('i preset delle nuove modalita hanno i valori fissati e i settings di base non cambiano', () => {
  assert.deepEqual(Object.keys(api.presets).slice(4),
    ['identita-colori', 'identita-grigi', 'foglio-grigi', 'foglio-colori', 'foglio-bn', 'originale']);
  assert.deepEqual(api.presets['identita-colori'], { mode: 'colori', docType: 'identita', sharpen: 2, contrast: 0,
    brightness: 0, perspective: true, angoliArrotondati: true });
  assert.deepEqual(api.presets['identita-grigi'], { mode: 'grigi', docType: 'identita', sharpen: 2, contrast: 0,
    brightness: 0, perspective: true, angoliArrotondati: true });
  assert.deepEqual(api.presets['foglio-grigi'], { mode: 'grigi', docType: 'foglio', sharpen: 3, contrast: 0,
    brightness: 0, perspective: true });
  assert.deepEqual(api.presets['foglio-colori'], { mode: 'colori', docType: 'foglio', sharpen: 3, contrast: 0,
    brightness: 0, perspective: true });
  assert.deepEqual(api.presets['foglio-bn'], { mode: 'bn', docType: 'foglio', inchiostro: 0.25, sharpen: 0,
    contrast: 0, brightness: 0, perspective: true });
  assert.deepEqual(api.presets.originale, { mode: 'originale', sharpen: 0, contrast: 0, brightness: 0, perspective: true });
  ['document', 'photo', 'id', 'receipt'].forEach(k => assert.ok(!('mode' in api.presets[k]), k));
  const d = api.defaultSettings();
  ['mode', 'docType', 'inchiostro', 'angoliArrotondati'].forEach(k => assert.ok(!(k in d), k));
});

test('process con angoli standard su 200x100 produce 180x90', () => {
  const out = api.process(immagineUniforme(200, 100, 128),
    { corners: angoliStandard, settings: api.defaultSettings() }, opsDiProva());
  assert.equal(out.width, 180);
  assert.equal(out.height, 90);
});

test('process con perspective false mantiene le dimensioni della sorgente', () => {
  const s = Object.assign(api.defaultSettings(), { perspective: false });
  const out = api.process(immagineUniforme(200, 100, 128), { corners: angoliStandard, settings: s }, opsDiProva());
  assert.equal(out.width, 200);
  assert.equal(out.height, 100);
});

test('process con angoli degeneri mantiene le dimensioni della sorgente', () => {
  const degeneri = { tl: pt(50, 50), tr: pt(50, 50), br: pt(50, 50), bl: pt(50, 50) };
  const out = api.process(immagineUniforme(200, 100, 128),
    { corners: degeneri, settings: api.defaultSettings() }, opsDiProva());
  assert.equal(out.width, 200);
  assert.equal(out.height, 100);
});

test('process senza angoli non esegue il warp', () => {
  const out = api.process(immagineUniforme(200, 100, 128),
    { corners: null, settings: api.defaultSettings() }, opsDiProva());
  assert.equal(out.width, 200);
  assert.equal(out.height, 100);
});

test('process non modifica l\'immagine in ingresso', () => {
  const img = immagineUniforme(20, 20, 100);
  const copia = Array.from(img.data);
  const s = Object.assign(api.defaultSettings(), { contrast: 30, bw: true });
  api.process(img, { corners: null, settings: s }, opsDiProva());
  assert.deepEqual(Array.from(img.data), copia);
});

test('process chiama ops.rotate solo con rotFine diverso da 0', () => {
  const ops = opsConRotate();
  api.process(immagineUniforme(40, 40, 128), { corners: null, settings: api.defaultSettings() }, ops);
  assert.deepEqual(ops.rotazioni, []);
  const s = Object.assign(api.defaultSettings(), { rotFine: 3 });
  api.process(immagineUniforme(40, 40, 128), { corners: null, settings: s }, ops);
  assert.deepEqual(ops.rotazioni, [3]);
});

test('process chiama ops.scale con low poi high solo con shadows', () => {
  const ops = opsConRotate();
  api.process(immagineUniforme(240, 240, 128), { corners: null, settings: api.defaultSettings() }, ops);
  assert.equal(ops.chiamate.length, 0);
  const s = Object.assign(api.defaultSettings(), { shadows: true });
  api.process(immagineUniforme(240, 240, 128), { corners: null, settings: s }, ops);
  assert.deepEqual(ops.chiamate.map(c => c[4]), ['low', 'high']);
});

test('process notifica i passi eseguiti nell\'ordine fisso e solo quelli', () => {
  const tutti = Object.assign(api.defaultSettings(), { keystoneV: 5, rotFine: 3, shadows: true });
  const visti = [];
  const out = api.process(immagineUniforme(200, 100, 128), {
    corners: angoliStandard, settings: tutti,
    onStage: (nome, ms) => { assert.equal(typeof ms, 'number'); visti.push(nome); }
  }, opsConRotate());
  assert.deepEqual(visti, ['warp', 'keystone', 'rotate', 'shadows', 'enhance']);
  assert.equal(out.width, 180);

  const pochi = [];
  api.process(immagineUniforme(200, 100, 128),
    { corners: null, settings: api.defaultSettings(), onStage: n => pochi.push(n) }, opsDiProva());
  assert.deepEqual(pochi, ['enhance']);
});

test('process dà lo stesso risultato con e senza onStage', () => {
  const img = immagineUniforme(200, 100, 90);
  const s = Object.assign(api.defaultSettings(), { contrast: 20, sharpen: 3, keystoneV: 4 });
  const a = api.process(img, { corners: angoliStandard, settings: s }, opsDiProva());
  const b = api.process(img, { corners: angoliStandard, settings: s, onStage: () => {} }, opsDiProva());
  assert.deepEqual(Array.from(a.data), Array.from(b.data));
});

test("UMD: con module l'API va in module.exports e anche in globalThis.ScanForge", () => {
  const prima = globalThis.ScanForge;
  const { exports, globale } = loadCoreDetailed(true);
  assert.ok(exports && exports.core && typeof exports.detectDocument === 'function');
  assert.ok(globale && globale.core, 'globalThis.ScanForge deve avere il core anche con module');
  assert.equal(globale.core, exports.core);
  assert.equal(globale.version, exports.version);
  assert.equal(globalThis.ScanForge, prima, 'il globale si ripristina');
});

test("UMD: senza module l'API va solo in globalThis.ScanForge", () => {
  const { exports, globale } = loadCoreDetailed(false);
  assert.equal(exports, null);
  assert.ok(globale && globale.core && globale.apiVersion === 1);
  assert.equal(globalThis.ScanForge, undefined);
});

test('UMD: un ScanForge preesistente si completa senza perdere le chiavi già presenti', () => {
  const preesistente = { io: { marcatore: 1 } };
  const { globale } = loadCoreDetailed(true, preesistente);
  assert.equal(globale, preesistente);
  assert.equal(globale.io.marcatore, 1);
  assert.ok(globale.core);
});

test('i preset sono congelati: nessuna modifica passa, nemmeno in modalita strict', () => {
  'use strict';
  assert.ok(Object.isFrozen(api.presets));
  Object.keys(api.presets).forEach(k => assert.ok(Object.isFrozen(api.presets[k]), k));
  const prima = JSON.stringify(api.presets);
  assert.throws(() => { api.presets.document.contrast = 99; }, TypeError);
  assert.throws(() => { api.presets.nuovo = {}; }, TypeError);
  assert.throws(() => { delete api.presets.id; }, TypeError);
  assert.equal(JSON.stringify(api.presets), prima);
  // Copiare da un preset (come fa l'app) e modificare la copia non lo tocca
  const copia = Object.assign({}, api.presets.document);
  copia.contrast = 1;
  assert.equal(api.presets.document.contrast, 25);
});

test('il core grezzo richiede ops: detectDocument e process senza ops lanciano', () => {
  const img = immagineUniforme(800, 600, 200);
  assert.throws(() => core.detectDocument(img), TypeError);
  assert.throws(() => api.detectDocument(img), TypeError);
  assert.throws(() => api.process(img, { corners: angoliStandard, settings: Object.assign(api.defaultSettings(), { shadows: true }) }), TypeError);
});


// Immagine non simmetrica: ogni pixel dice dove sta
function gradiente(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = x * 10; data[i + 1] = y * 20; data[i + 2] = (x + y) * 5; data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

test('core.flip: specchia in orizzontale, in verticale o in entrambi, senza toccare l\'input', () => {
  const src = gradiente(5, 3), copia = src.data.slice();
  const px = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
  const h = core.flip(src, true, false), v = core.flip(src, false, true), hv = core.flip(src, true, true);
  assert.deepEqual([h.width, h.height], [5, 3]);
  assert.notEqual(h.data, src.data);
  assert.deepEqual(Array.from(src.data), Array.from(copia));
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 5; x++) {
      assert.deepEqual(px(h, x, y), px(src, 4 - x, y));
      assert.deepEqual(px(v, x, y), px(src, x, 2 - y));
      assert.deepEqual(px(hv, x, y), px(src, 4 - x, 2 - y));
    }
  }
  assert.deepEqual(Array.from(core.flip(h, true, false).data), Array.from(src.data));
  assert.deepEqual(Array.from(core.flip(src, false, false).data), Array.from(src.data));
});

test('process (0.2): flipH e flipV specchiano il risultato e senza di loro nulla cambia', () => {
  const src = gradiente(40, 30);
  const run = (extra) => api.process({ data: src.data.slice(), width: 40, height: 30 },
    { corners: null, settings: Object.assign(api.defaultSettings(), extra) }, { rotate: (img) => img });
  const a = run({});
  assert.deepEqual(Array.from(run({ flipH: false, flipV: false }).data), Array.from(a.data));
  assert.deepEqual(Array.from(run({ flipH: true }).data), Array.from(core.flip(a, true, false).data));
  assert.deepEqual(Array.from(run({ flipV: true }).data), Array.from(core.flip(a, false, true).data));
  assert.deepEqual(Array.from(run({ flipH: true, flipV: true }).data), Array.from(core.flip(a, true, true).data));
  assert.ok(!('flipH' in api.defaultSettings()) && !('flipV' in api.defaultSettings()));
});
