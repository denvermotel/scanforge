// Design system della 1.0 (spec, appendice A): token dei due temi, contrasti WCAG 2.1,
// caratteri di sistema, sprite delle icone e logo. Legge il testo di index.html.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';

// Appendice A.1, copiata alla lettera: [chiaro, scuro]
const A1 = {
  '--bg': ['#F7F6F2', '#141615'],
  '--surface': ['#FFFFFF', '#1B1E1D'],
  '--surface-2': ['#ECEAE3', '#252928'],
  '--canvas': ['#E3E1D9', '#0B0C0C'],
  '--border': ['#E2E0D8', '#2C302E'],
  '--border-strong': ['#8C887E', '#727874'],
  '--text': ['#1F2328', '#E8E9E6'],
  '--muted': ['#5E636B', '#9AA09C'],
  '--accent': ['#0F766E', '#2DD4BF'],
  '--accent-hover': ['#0B5F58', '#5EEAD4'],
  '--on-accent': ['#FFFFFF', '#0B1514'],
  '--accent-soft': ['#D5EBE7', '#123B37'],
  '--warn-bg': ['#FBEBD0', '#3A2A10'],
  '--warn': ['#8A4B08', '#F5C46B'],
  '--danger': ['#B42318', '#F97066'],
  '--success': ['#1F7A3A', '#4ADE80'],
};

const ICONE = ['scatta', 'galleria', 'incolla', 'aggiungi', 'menu', 'indietro', 'avanti',
  'chiudi', 'ruota', 'prima-dopo', 'regola', 'elimina', 'scambia', 'esporta', 'stampa',
  'condividi', 'conferma', 'avviso', 'info', 'trascina', 'tessera', 'passaporto', 'contratto',
  'fattura', 'bolletta', 'scontrino', 'documento-generico'];

function variabili(corpo) {
  const out = {};
  for (const m of corpo.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim();
  return out;
}

function blocco(re, nome) {
  const m = css.match(re);
  assert.ok(m, 'blocco mancante: ' + nome);
  return variabili(m[1]);
}

// :root semplice (non seguito da [ o :), all'inizio del CSS o dopo una regola chiusa
const chiaro = () => blocco(/(?:^|[\s}]):root\s*\{([^}]*)\}/, ':root');
const scuroMedia = () => blocco(
  /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/,
  '@media dark');
const scuroScelto = () => blocco(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/, ':root[data-theme="dark"]');

// WCAG 2.1: luminanza relativa con linearizzazione sRGB
function luminanza(hex) {
  const n = hex.replace('#', '');
  const c = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrasto(a, b) {
  const [l1, l2] = [luminanza(a), luminanza(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

test('la formula WCAG dà i valori noti', () => {
  assert.equal(Math.round(contrasto('#000000', '#FFFFFF') * 10) / 10, 21);
  assert.equal(contrasto('#777777', '#777777'), 1);
});

test('tema chiaro: i token sono quelli dell\'appendice A.1', () => {
  const v = chiaro();
  for (const [k, [l]] of Object.entries(A1)) assert.equal(v[k]?.toUpperCase(), l, k);
});

test('tema scuro: i due blocchi sono identici e uguali all\'appendice A.1', () => {
  const a = scuroMedia(), b = scuroScelto();
  assert.deepEqual(a, b);
  for (const [k, [, d]] of Object.entries(A1)) assert.equal(a[k]?.toUpperCase(), d, k);
});

for (const [nome, leggi] of [['chiaro', chiaro], ['scuro', scuroMedia]]) {
  test(`contrasti del tema ${nome}`, () => {
    const v = leggi();
    const c = (fg, bg) => contrasto(v[fg], v[bg]);
    const almeno = (fg, bg, min) => assert.ok(c(fg, bg) >= min,
      `${fg} su ${bg}: ${c(fg, bg).toFixed(2)} < ${min}`);
    for (const bg of ['--bg', '--surface', '--surface-2']) {
      almeno('--text', bg, 4.5);
      almeno('--muted', bg, 4.5);
    }
    almeno('--on-accent', '--accent', 4.5);
    almeno('--border-strong', '--bg', 3);
    almeno('--border-strong', '--surface', 3);
    almeno('--warn', '--warn-bg', 4.5);
    almeno('--danger', '--surface', 4.5);
    almeno('--success', '--surface', 4.5);
    almeno('--accent-hover', '--accent-soft', 4.5);
  });
}

test('hover del pulsante testuale: colore --accent-hover sul fondo --accent-soft', () => {
  const r = (css.match(/\.btn-text:hover, \.btn-text:active\s*\{([^}]*)\}/) || [])[1] || '';
  assert.match(r, /background:\s*var\(--accent-soft\)/);
  assert.match(r, /color:\s*var\(--accent-hover\)/);
});

test('interruttore spento: pallino a contrasto 3:1 sul binario in entrambi i temi', () => {
  const sw = (css.match(/\.switch\s*\{([^}]*)\}/) || [])[1] || '';
  const dopo = (css.match(/\.switch::after\s*\{([^}]*)\}/) || [])[1] || '';
  const binario = (sw.match(/background:\s*var\((--[a-z0-9-]+)\)/) || [])[1];
  const pallino = (dopo.match(/background:\s*var\((--[a-z0-9-]+)\)/) || [])[1];
  assert.ok(binario && pallino, 'colori dell\'interruttore');
  for (const [nome, v] of [['chiaro', chiaro()], ['scuro', scuroMedia()]]) {
    const c = contrasto(v[pallino], v[binario]);
    assert.ok(c >= 3, `${nome}: ${pallino} su ${binario} ${c.toFixed(2)} < 3`);
  }
});

test('manici: area di tocco di 44 px', () => {
  const base = (css.match(/\.corner-handle\s*\{([^}]*)\}/) || [])[1] || '';
  const prima = (css.match(/\.corner-handle::before\s*\{([^}]*)\}/) || [])[1] || '';
  const lato = Number((base.match(/width:\s*([\d.]+)px/) || [])[1]);
  const bordo = Number((base.match(/border:\s*([\d.]+)px/) || [])[1]);
  assert.match(base, /height:\s*([\d.]+)px/);
  assert.equal(lato, 20);
  // ::before assoluto parte dal riquadro interno al bordo (box-sizing: border-box)
  const m = prima.match(/inset:\s*calc\(\s*-([\d.]+)px\s*-\s*([\d.]+)px\s*\)|inset:\s*-([\d.]+)px/);
  assert.ok(m, 'inset di ::before');
  const fuori = m[3] !== undefined ? Number(m[3]) : Number(m[1]) + Number(m[2]);
  assert.equal(lato - 2 * bordo + 2 * fuori, 44);
});

test('nessun carattere scaricato', () => {
  assert.ok(!html.includes('fonts.googleapis'), 'fonts.googleapis');
  assert.ok(!html.includes('Syne'), 'Syne');
  assert.ok(!html.includes('Space Mono'), 'Space Mono');
  assert.match(css, /system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif/);
});

test('focus visibile e movimento ridotto', () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\);\s*outline-offset:\s*2px/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('lo sprite ha un simbolo per ogni icona dell\'appendice A.5', () => {
  const sprite = (html.match(/<body>\s*<svg[^>]*aria-hidden="true"[^>]*>([\s\S]*?)<\/svg>/) || [])[1];
  assert.ok(sprite, 'sprite subito dopo <body>');
  for (const n of ICONE) assert.match(sprite, new RegExp(`<symbol id="i-${n}" viewBox="0 0 24 24"`), n);
  const simboli = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(simboli).size, simboli.length, 'id duplicati');
});

test('favicon e logo Mirino', () => {
  const m = html.match(/<link rel="icon" href="data:image\/svg\+xml,([^"]+)"/);
  assert.ok(m, 'favicon SVG inline');
  const svg = decodeURIComponent(m[1]);
  assert.match(svg, /viewBox="0 0 96 96"/);
  assert.match(svg, /<rect width="96" height="96" rx="22" fill="#0F766E"\/>/);
  assert.match(svg, /<path d="M35 31h19l9 9v25H35z" fill="#F7F6F2"\/>/);
});

test('Impostazioni e Informazioni: pulsanti in ordine, finestra, collegamenti e icone', () => {
  const ordine = ['hdr-menu', 'hdr-info', 'hdr-print', 'hdr-export'].map((id) => html.indexOf('id="' + id + '"'));
  assert.ok(ordine.every((i) => i > 0), 'pulsanti assenti: ' + ordine);
  assert.deepEqual([...ordine].sort((a, b) => a - b), ordine, 'ordine: Impostazioni, Informazioni, Stampa, Esporta');
  assert.match(html, /id="hdr-menu"[^>]*aria-label="Impostazioni"/);
  assert.match(html, /id="hdr-info"[^>]*aria-label="Informazioni"/);
  assert.match(html, /id="ov-informazioni"/);
  assert.doesNotMatch(html, /id === 'informazioni'/, 'senza caso speciale: l\'id dell\'elemento segue quello dell\'overlay');
  assert.doesNotMatch(html, /id="pref-info-title"/, 'la sezione Informazioni esce dalle Impostazioni');
  assert.match(html, /<symbol id="i-impostazioni"/);
  assert.match(html, /<symbol id="i-info"/);
  assert.ok(html.includes('Dalla foto al PDF pulito, pronto da stampare. Senza account e senza inviare nulla.'));
  for (const url of ['https://denvermotel.github.io/scanforge/', 'https://github.com/denvermotel/scanforge']) {
    assert.ok(html.includes(url), url);
  }
  const link = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map((m) => m[0]);
  assert.ok(link.length >= 2, 'collegamenti esterni assenti');
  link.forEach((tag) => assert.match(tag, /rel="noopener noreferrer"/, tag));
});
