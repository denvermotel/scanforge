import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Q = require('./lib/quality.js');
const { degrade } = require('./lib/degrade.js');
const Synth = require('./lib/synth.js');

// Immagine RGBA opaca; f(x, y) restituisce [r, g, b].
function img(w, h, f) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = f(x, y), i = (y * w + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}
const grigio = (w, h, v) => img(w, h, () => [v, v, v]);
const uguali = (a, b) => a.width === b.width && a.height === b.height && Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;

test('paperLevel: tutta 255 vale 255, tutta 100 vale 100', () => {
  assert.equal(Q.paperLevel(grigio(32, 32, 255)), 255);
  assert.equal(Q.paperLevel(grigio(32, 32, 100)), 100);
});

test('lumaOf usa i pesi 0,299/0,587/0,114', () => {
  const l = Q.lumaOf(img(1, 1, () => [255, 0, 0]));
  assert.ok(Math.abs(l[0] - 76.245) < 1e-3);
});

test('contrastSpread di metà 0 e metà 255 vale 255', () => {
  assert.equal(Q.contrastSpread(img(20, 20, (x) => (x < 10 ? [0, 0, 0] : [255, 255, 255]))), 255);
});

test('rmseLuma di un\'immagine con se stessa vale 0', () => {
  const a = img(16, 16, (x, y) => [x * 10, y * 10, 50]);
  assert.equal(Q.rmseLuma(a, a), 0);
  assert.ok(Q.rmseLuma(a, grigio(16, 16, 0)) > 0);
});

test('deltaEab: 0 con se stessa, > 3 con la tinta spostata', () => {
  const a = img(16, 16, () => [128, 128, 128]);
  const b = img(16, 16, () => [150, 128, 110]);
  assert.equal(Q.deltaEab(a, a), 0);
  assert.ok(Q.deltaEab(a, b) > 3);
});

test('blockiness: con offset per blocchi 8x8 è almeno 2 volte quello della liscia', () => {
  const liscia = img(64, 64, (x, y) => { const v = 60 + x * 0.5 + y * 0.3; return [v, v, v]; });
  const blocchi = degrade(liscia, { shadow: 'none', shadowDepth: 0, noise: 0, blocks: 6, seed: 3 });
  assert.ok(Q.blockiness(blocchi) >= 2 * Q.blockiness(liscia));
});

test('sharpnessIndex: nitida > sfocata (box 3x3)', () => {
  const nitida = img(48, 48, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? [230, 230, 230] : [20, 20, 20]);
  const l = Q.lumaOf(nitida), w = 48, h = 48;
  const sfocata = img(w, h, (x, y) => {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += l[yy * w + xx]; n++; }
    }
    const v = s / n; return [v, v, v];
  });
  assert.ok(Q.sharpnessIndex(nitida) > Q.sharpnessIndex(sfocata));
});

test('darkBorderPixels: una colonna nera al bordo vale h', () => {
  const h = 40;
  const a = img(30, h, (x) => (x === 0 ? [0, 0, 0] : [220, 220, 220]));
  assert.equal(Q.darkBorderPixels(a, 4), h);
  assert.equal(Q.darkBorderPixels(grigio(30, h, 220), 4), 0);
});

test('degrade è deterministica: stesso seme stessi byte, semi diversi byte diversi', () => {
  const t = Synth.truth('sheet', { w: 200, h: 283, seed: 1 });
  const s = { shadow: 'diagonal', shadowDepth: 0.3, noise: 6, blocks: 4, seed: 7 };
  const a = degrade(t, s), b = degrade(t, s), c = degrade(t, Object.assign({}, s, { seed: 8 }));
  assert.ok(uguali(a, b));
  assert.ok(!uguali(a, c));
});

test('degrade con shadow none, noise 0, blocks 0 restituisce una copia identica', () => {
  const t = Synth.truth('card', { w: 240, h: 151, seed: 2 });
  const d = degrade(t, { shadow: 'none', shadowDepth: 0, noise: 0, blocks: 0, seed: 5 });
  assert.ok(uguali(d, t));
  assert.notEqual(d.data, t.data);
});

test('degrade: l\'ombra scurisce, il rumore e i blocchi cambiano i pixel', () => {
  const t = grigio(64, 64, 200);
  const ombra = degrade(t, { shadow: 'diagonal', shadowDepth: 0.5, noise: 0, blocks: 0, seed: 1 });
  assert.ok(Q.paperLevel(ombra) < 200);
  const mano = degrade(t, { shadow: 'hand', shadowDepth: 0.5, noise: 0, blocks: 0, seed: 1 });
  assert.ok(Q.percentileLuma(mano, 5) < 200);
  assert.ok(Q.rmseLuma(degrade(t, { shadow: 'none', shadowDepth: 0, noise: 8, blocks: 0, seed: 1 }), t) > 2);
});

test('Synth.truth sheet: rosso saturo, fondo bianco, testo scuro, macchia gialla, opaca', () => {
  const s = Synth.truth('sheet', { w: 600, h: 849, seed: 4 });
  assert.equal(s.width, 600);
  assert.equal(s.height, 849);
  let rosso = 0, giallo = 0, scuri = 0, opaca = true;
  for (let i = 0; i < s.data.length; i += 4) {
    const r = s.data[i], g = s.data[i + 1], b = s.data[i + 2];
    if (r > 200 && g < 60) rosso++;
    if (r > 240 && g > 220 && b < 80) giallo++;
    if (0.299 * r + 0.587 * g + 0.114 * b < 80 && Math.abs(r - g) < 20) scuri++;
    if (s.data[i + 3] !== 255) opaca = false;
  }
  assert.ok(rosso > 0);
  assert.ok(giallo > 0);
  assert.ok(scuri > 0);
  assert.ok(opaca);
  assert.ok(Q.paperLevel(s) >= 250);
});

test('Synth.truth card: pastello con testo scuro, deterministica, semi diversi diversi', () => {
  const a = Synth.truth('card', { w: 640, h: 404, seed: 3 });
  const b = Synth.truth('card', { w: 640, h: 404, seed: 3 });
  const c = Synth.truth('card', { w: 640, h: 404, seed: 4 });
  assert.ok(uguali(a, b));
  assert.ok(!uguali(a, c));
  assert.ok(Q.paperLevel(a) > 150 && Q.paperLevel(a) < 250);
  assert.ok(Q.percentileLuma(a, 2) < 80);
});

test('Synth.truth rifiuta un tipo sconosciuto', () => {
  assert.throws(() => Synth.truth('altro', { w: 10, h: 10, seed: 1 }));
});
