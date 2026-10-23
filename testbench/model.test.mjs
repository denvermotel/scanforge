import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModel } from './lib/load-core.mjs';

const m = loadModel();
const { TYPES } = m;

function pratica(unassigned, documents = []) {
  return { cognome: '', nome: '', documents, unassigned };
}

test('TYPES: tipi predefiniti congelati con famiglia e sigla', () => {
  assert.ok(Object.isFrozen(TYPES));
  assert.ok(TYPES.every((t) => Object.isFrozen(t)));
  const sigle = Object.fromEntries(TYPES.map((t) => [t.id, t.sigla]));
  assert.deepEqual(sigle, {
    cie: 'CIE', patente: 'Patente', ts: 'TS', passaporto: 'Passaporto', pds: 'PdS',
    contratto: 'Contratto', fattura: 'Fattura', bolletta: 'Bolletta', scontrino: 'Scontrino',
    generico: 'Documento'
  });
  assert.equal(m.familyOf('cie'), 'tessera');
  assert.equal(m.familyOf('generico'), 'foglio');
  assert.equal(m.familyOf('inesistente'), 'foglio');
});

test('newPractice: pratica vuota', () => {
  assert.deepEqual(m.newPractice(), { title: '', cognome: '', nome: '', documents: [], unassigned: [] });
});

test('createDocument: toglie le pagine da unassigned e non modifica l\'input', () => {
  const pr = m.addPages(m.newPractice(), ['a', 'b', 'c']);
  const prima = structuredClone(pr);
  const { practice, docId } = m.createDocument(pr, ['b', 'a'], 'contratto');
  assert.deepEqual(pr, prima);
  const doc = practice.documents.find((d) => d.id === docId);
  assert.deepEqual(doc.pageIds, ['b', 'a']);
  assert.equal(doc.mode, null);
  assert.equal(doc.typeId, 'contratto');
  assert.deepEqual(practice.unassigned, ['c']);
});

test('createDocument: ids deterministici', () => {
  let pr = m.addPages(m.newPractice(), ['a', 'b']);
  const r1 = m.createDocument(pr, ['a'], 'generico');
  const r2 = m.createDocument(r1.practice, ['b'], 'generico');
  assert.equal(r1.docId, 'd1');
  assert.equal(r2.docId, 'd2');
});

test('createDocument: errori in italiano', () => {
  const pr = m.addPages(m.newPractice(), ['a', 'b', 'c']);
  assert.throws(() => m.createDocument(pr, ['a', 'b', 'c'], 'cie'), TypeError);
  assert.throws(() => m.createDocument(pr, ['a'], 'boh'), TypeError);
  const { practice } = m.createDocument(pr, ['a'], 'generico');
  assert.throws(() => m.createDocument(practice, ['a'], 'generico'), TypeError);
});

test('removeDocument: le pagine tornano in testa a unassigned nell\'ordine', () => {
  let pr = m.addPages(m.newPractice(), ['a', 'b', 'c']);
  const { practice, docId } = m.createDocument(pr, ['b', 'a'], 'contratto');
  const r = m.removeDocument(practice, docId);
  assert.deepEqual(r.documents, []);
  assert.deepEqual(r.unassigned, ['b', 'a', 'c']);
  assert.throws(() => m.removeDocument(practice, 'zzz'), TypeError);
});

test('swapFrontBack: scambia solo una tessera di due pagine', () => {
  let pr = m.addPages(m.newPractice(), ['f', 'r', 'x']);
  const c = m.createDocument(pr, ['f', 'r'], 'cie');
  const s = m.swapFrontBack(c.practice, c.docId);
  assert.deepEqual(s.documents[0].pageIds, ['r', 'f']);
  const u = m.createDocument(c.practice, ['x'], 'patente');
  const s1 = m.swapFrontBack(u.practice, u.docId);
  assert.deepEqual(s1.documents[1].pageIds, ['x']);
});

test('movePage: tra documenti, verso unassigned, con indice', () => {
  let pr = m.addPages(m.newPractice(), ['a', 'b', 'c']);
  const k = m.createDocument(pr, ['a', 'b'], 'contratto');
  const prima = structuredClone(k.practice);
  const r = m.movePage(k.practice, 'c', k.docId, 1);
  assert.deepEqual(k.practice, prima);
  assert.deepEqual(r.documents[0].pageIds, ['a', 'c', 'b']);
  assert.deepEqual(r.unassigned, []);
  const r2 = m.movePage(r, 'a', null, 0);
  assert.deepEqual(r2.unassigned, ['a']);
  assert.deepEqual(r2.documents[0].pageIds, ['c', 'b']);
  // riordino nello stesso documento
  const r3 = m.movePage(r, 'a', k.docId, 2);
  assert.deepEqual(r3.documents[0].pageIds, ['c', 'b', 'a']);
  // tessera piena
  const t = m.createDocument(m.addPages(m.newPractice(), ['f', 'r', 'x']), ['f', 'r'], 'cie');
  assert.throws(() => m.movePage(t.practice, 'x', t.docId, 0), TypeError);
  assert.throws(() => m.movePage(t.practice, 'x', 'zzz', 0), TypeError);
  assert.throws(() => m.movePage(t.practice, 'nope', null, 0), TypeError);
});

test('setType e setMode', () => {
  const k = m.createDocument(m.addPages(m.newPractice(), ['a', 'b', 'c']), ['a', 'b', 'c'], 'contratto');
  assert.throws(() => m.setType(k.practice, k.docId, 'cie'), TypeError);
  assert.throws(() => m.setType(k.practice, k.docId, 'boh'), TypeError);
  assert.equal(m.setType(k.practice, k.docId, 'fattura').documents[0].typeId, 'fattura');
  assert.equal(m.setMode(k.practice, k.docId, 'bw').documents[0].mode, 'bw');
  assert.equal(k.practice.documents[0].mode, null);
});

test('removePage: toglie la pagina ovunque', () => {
  const k = m.createDocument(m.addPages(m.newPractice(), ['a', 'b', 'c']), ['a', 'b'], 'contratto');
  const r = m.removePage(k.practice, 'a');
  assert.deepEqual(r.documents[0].pageIds, ['b']);
  assert.deepEqual(m.removePage(r, 'c').unassigned, []);
});

test('types facoltativo e tipi propri', () => {
  const propri = [...TYPES, { id: 'libretto', label: 'Libretto', family: 'tessera', sigla: 'Libretto' }];
  const pr = m.addPages(m.newPractice(), ['a', 'b']);
  assert.throws(() => m.createDocument(pr, ['a'], 'libretto'), TypeError);
  assert.equal(m.createDocument(pr, ['a'], 'libretto', propri).practice.documents[0].typeId, 'libretto');
  assert.equal(m.familyOf('libretto', propri), 'tessera');
});

test('exportPlan: senza documenti un solo generico, a4 false', () => {
  const pr = m.addPages(m.newPractice(), ['a', 'b']);
  const piano = m.exportPlan(pr, TYPES, false);
  assert.equal(piano.length, 1);
  assert.equal(piano[0].items.length, 2);
  assert.ok(piano[0].items.every((i) => i.a4 === false && i.docGroup === null && i.docSide === 'fronte'));
  assert.equal(m.exportPlan(m.newPractice(), TYPES, true).length, 0);
});

function praticaMista() {
  let pr = m.addPages(m.newPractice(), ['c1', 'c2', 'c3', 'c4', 'f', 'r', 'u']);
  const a = m.createDocument(pr, ['c1', 'c2', 'c3', 'c4'], 'contratto');
  const b = m.createDocument(a.practice, ['f', 'r'], 'cie');
  return b.practice;
}

test('exportPlan: contratto, CIE e pagina non assegnata', () => {
  const pr = praticaMista();
  const uno = m.exportPlan(pr, TYPES, false);
  assert.equal(uno.length, 1);
  assert.equal(uno[0].items.length, 7);
  const tre = m.exportPlan(pr, TYPES, true);
  assert.equal(tre.length, 3);
  assert.deepEqual(tre.map((g) => g.items.map((i) => i.pageId)), [['c1', 'c2', 'c3', 'c4'], ['f', 'r'], ['u']]);
  const cie = tre[1].items;
  assert.ok(cie.every((i) => i.a4 === true && i.docGroup === 1));
  assert.deepEqual(cie.map((i) => i.docSide), ['fronte', 'retro']);
  assert.ok(tre[0].items.every((i) => i.a4 === false && i.docGroup === null));
  assert.ok(tre[2].items.every((i) => i.a4 === false));
});

test('exportPlan: docGroup consecutivi tra tessere e docIds', () => {
  let pr = m.addPages(m.newPractice(), ['a', 'b', 'c', 'd']);
  const x = m.createDocument(pr, ['a', 'b'], 'cie');
  const y = m.createDocument(x.practice, ['c', 'd'], 'patente');
  const piano = m.exportPlan(y.practice, TYPES, true);
  assert.deepEqual(piano.map((g) => g.items[0].docGroup), [1, 2]);
  assert.deepEqual(piano.map((g) => g.docIds), [[x.docId], [y.docId]]);
  assert.deepEqual(m.exportPlan(y.practice, TYPES, false)[0].docIds, [x.docId, y.docId]);
});

test('legacyFields: docGroup e docSide per ogni pagina', () => {
  const f = m.legacyFields(praticaMista(), TYPES);
  assert.deepEqual(f.get('f'), { docGroup: 1, docSide: 'fronte' });
  assert.deepEqual(f.get('r'), { docGroup: 1, docSide: 'retro' });
  assert.deepEqual(f.get('c1'), { docGroup: null, docSide: 'fronte' });
  assert.deepEqual(f.get('u'), { docGroup: null, docSide: 'fronte' });
  assert.equal(f.size, 7);
});

test('fromLegacy: docGroup e docSide diventano tessere', () => {
  const pr = m.fromLegacy([
    { id: 'p0', docGroup: 1, docSide: 'retro' },
    { id: 'p1', docGroup: 1, docSide: 'fronte' },
    { id: 'p2', docGroup: 2, docSide: 'fronte' }
  ], TYPES);
  assert.equal(pr.documents.length, 2);
  assert.ok(pr.documents.every((d) => d.typeId === 'cie' && d.mode === null));
  assert.deepEqual(pr.documents[0].pageIds, ['p1', 'p0']);
  assert.deepEqual(pr.documents[1].pageIds, ['p2']);
  assert.deepEqual(pr.unassigned, []);
});

test('fromLegacy: docGroup null in un solo generico; id mancante = p + indice', () => {
  const pr = m.fromLegacy([{ docGroup: null, docSide: 'fronte' }, { id: 'x', docGroup: null, docSide: 'fronte' }]);
  assert.equal(pr.documents.length, 1);
  assert.equal(pr.documents[0].typeId, 'generico');
  assert.deepEqual(pr.documents[0].pageIds, ['p0', 'x']);
});

test('fromLegacy: progetto vuoto, gruppo di oltre 2 pagine', () => {
  assert.deepEqual(m.fromLegacy([], TYPES), m.newPractice());
  const pr = m.fromLegacy([
    { id: 'a', docGroup: 3, docSide: 'retro' },
    { id: 'b', docGroup: 3, docSide: 'fronte' },
    { id: 'c', docGroup: 3, docSide: 'fronte' }
  ], TYPES);
  assert.deepEqual(pr.documents[0].pageIds, ['b', 'c']);
  assert.deepEqual(pr.unassigned, ['a']);
});

// --- fileNames ---
function dueDoc(tipi) {
  let pr = m.addPages(m.newPractice(), tipi.flatMap((_, i) => ['p' + i + 'a', 'p' + i + 'b']));
  tipi.forEach((t, i) => { pr = m.createDocument(pr, ['p' + i + 'a', 'p' + i + 'b'], t).practice; });
  return pr;
}
function nomi(pr, schema, cognome, nome, split = true, extra = {}) {
  const groups = m.exportPlan(pr, TYPES, split);
  return m.fileNames(groups, { schema, cognome, nome, date: new Date(2026, 9, 22, 12), practice: pr, ...extra });
}

test('SCHEMAS: congelato con i due schemi', () => {
  assert.ok(Object.isFrozen(m.SCHEMAS));
  assert.deepEqual({ ...m.SCHEMAS }, { unico: '{Cognome}_{Nome}', separati: '{Cognome}_{Nome} - {Tipo}' });
});

test('fileNames: schema separati con sigla del tipo', () => {
  assert.deepEqual(nomi(dueDoc(['cie', 'contratto']), m.SCHEMAS.separati, 'Rossi', 'Mario'),
    ['Rossi_Mario - CIE', 'Rossi_Mario - Contratto']);
  assert.deepEqual(nomi(dueDoc(['cie']), m.SCHEMAS.unico, 'Rossi', 'Mario', false), ['Rossi_Mario']);
});

test('fileNames: doppioni con numero in coda o al posto di {N}', () => {
  assert.deepEqual(nomi(dueDoc(['cie', 'cie', 'cie']), m.SCHEMAS.separati, 'Rossi', 'Mario'),
    ['Rossi_Mario - CIE', 'Rossi_Mario - CIE 2', 'Rossi_Mario - CIE 3']);
  assert.deepEqual(nomi(dueDoc(['cie', 'cie']), '{Cognome}_{Nome} - {Tipo} {N}', 'Rossi', 'Mario'),
    ['Rossi_Mario - CIE', 'Rossi_Mario - CIE 2']);
  assert.deepEqual(nomi(dueDoc(['cie', 'cie']), '{N}_{Tipo}', 'Rossi', 'Mario'), ['CIE', '2_CIE']);
});

test('fileNames: gruppo senza documenti usa generico; tipi personalizzati', () => {
  const pr = m.addPages(m.newPractice(), ['a']);
  assert.deepEqual(nomi(pr, m.SCHEMAS.separati, 'Rossi', 'Mario'), ['Rossi_Mario - Documento']);
  const types = TYPES.map((t) => (t.id === 'cie' ? { ...t, sigla: 'Carta' } : t));
  assert.deepEqual(nomi(dueDoc(['cie']), m.SCHEMAS.separati, 'Rossi', 'Mario', true, { types }),
    ['Rossi_Mario - Carta']);
});

test('fileNames: segnaposto vuoti tolti con un separatore', () => {
  assert.deepEqual(nomi(dueDoc(['cie']), m.SCHEMAS.separati, '', 'Mario'), ['Mario - CIE']);
  assert.deepEqual(nomi(dueDoc(['cie']), m.SCHEMAS.separati, 'Rossi', ''), ['Rossi - CIE']);
  assert.deepEqual(nomi(dueDoc(['cie']), m.SCHEMAS.separati, '', ''), ['CIE']);
  assert.deepEqual(nomi(dueDoc(['cie']), m.SCHEMAS.unico, 'Rossi', ''), ['Rossi']);
  assert.deepEqual(nomi(dueDoc(['cie']), m.SCHEMAS.unico, '', 'Mario', false), ['Mario']);
  assert.deepEqual(nomi(dueDoc(['cie']), m.SCHEMAS.unico, '', '', false), ['ScanForge_2026-10-22']);
  assert.deepEqual(nomi(dueDoc(['cie']), '{Data} {Cognome}', '', '', false), ['2026-10-22']);
});

// --- nome del progetto ---
test('newPractice e copia portano title vuoto', () => {
  assert.equal(m.newPractice().title, '');
  const pr = { ...m.newPractice(), title: 'Contratto Casa Milano' };
  assert.equal(m.addPages(pr, ['a']).title, 'Contratto Casa Milano');
});

test('proposedTitle: etichetta del tipo del primo documento, altrimenti Progetto', () => {
  assert.equal(m.proposedTitle(dueDoc(['cie', 'contratto'])), 'Carta d\'identità');
  assert.equal(m.proposedTitle(dueDoc(['contratto'])), 'Contratto');
  assert.equal(m.proposedTitle(m.newPractice()), 'Progetto');
  assert.equal(m.proposedTitle(m.addPages(m.newPractice(), ['a'])), 'Progetto');
  const sconosciuto = { ...m.newPractice(), documents: [{ id: 'd1', typeId: 'xyz', mode: null, pageIds: [] }] };
  assert.equal(m.proposedTitle(sconosciuto), 'Progetto');
  const types = TYPES.map((t) => (t.id === 'contratto' ? { ...t, label: 'Accordo' } : t));
  assert.equal(m.proposedTitle(dueDoc(['contratto']), types), 'Accordo');
});

test('projectTitle: il nome scritto vince, spazi soli = automatico', () => {
  const pr = dueDoc(['contratto']);
  assert.equal(m.projectTitle({ ...pr, title: '  Contratto Casa Milano ' }), 'Contratto Casa Milano');
  assert.equal(m.projectTitle({ ...pr, title: '   ' }), 'Contratto');
  assert.equal(m.projectTitle({ ...pr, title: '' }), 'Contratto');
  assert.equal(m.projectTitle(pr), 'Contratto');
});

test('fileNames: segnaposto {Progetto}', () => {
  const pr = dueDoc(['contratto']);
  const prog = { progetto: 'Contratto Casa Milano' };
  assert.deepEqual(nomi(pr, '{Progetto} - {Cognome}', 'Del Vecchio', '', false, prog), ['Contratto Casa Milano - Del Vecchio']);
  assert.deepEqual(nomi(pr, '{Progetto} - {Cognome}', '', '', false, prog), ['Contratto Casa Milano']);
  assert.deepEqual(nomi(pr, '{Cognome} {Progetto}', 'Del Vecchio', '', false, { progetto: '' }), ['Del Vecchio']);
});

test('fileNames: senza nomi si usa il nome del progetto, poi ScanForge_data', () => {
  const pr = dueDoc(['contratto']);
  assert.deepEqual(nomi(pr, m.SCHEMAS.unico, '', '', false, { progetto: 'Contratto Casa Milano' }), ['Contratto Casa Milano']);
  assert.deepEqual(nomi(pr, m.SCHEMAS.unico, '', '', false, { progetto: 'Casa/Milano: "x"' }), ['Casa-Milano- -x-']);
  assert.deepEqual(nomi(pr, m.SCHEMAS.unico, '', '', false, { progetto: '' }), ['ScanForge_2026-10-22']);
  assert.deepEqual(nomi(pr, m.SCHEMAS.unico, '', '', false, { progetto: '. .' }), ['ScanForge_2026-10-22']);
  // gli schemi predefiniti non cambiano e con i nomi presenti il progetto non compare
  assert.deepEqual(nomi(pr, m.SCHEMAS.unico, 'Rossi', 'Mario', false, { progetto: 'Contratto Casa Milano' }), ['Rossi_Mario']);
});

test('fileNames: caratteri vietati, spazi finali, punti finali', () => {
  const [n] = nomi(dueDoc(['cie']), m.SCHEMAS.unico, 'D\'Angelo/Bianchi: "x"', 'Nicolò', false);
  assert.equal(n, 'D\'Angelo-Bianchi- -x-_Nicolò');
  const [p] = nomi(dueDoc(['cie']), '{Cognome}', 'Rossi. .', '', false);
  assert.equal(p, 'Rossi');
  const [c] = nomi(dueDoc(['cie']), '{Cognome}', 'Ro\u0000ssi\u001f', '', false);
  assert.equal(c, 'Rossi');
  const [t] = nomi(dueDoc(['cie']), '{Cognome}', 'a\\b|c<d>e*f?g', '', false);
  assert.equal(t, 'a-b-c-d-e-f-g');
});

test('fileNames: troncato a 120 caratteri', () => {
  const [n] = nomi(dueDoc(['cie']), m.SCHEMAS.unico, 'R'.repeat(200), 'Mario', false);
  assert.equal(n.length, 120);
  const [q] = nomi(dueDoc(['cie']), '{Cognome}', 'R'.repeat(119) + ' x', '', false);
  assert.equal(q, 'R'.repeat(119));
});

test('fileNames: doppioni senza distinzione tra maiuscole e minuscole', () => {
  const pr = dueDoc(['cie', 'cie']);
  const piano = m.exportPlan(pr, TYPES, true);
  const r = m.fileNames(piano, { schema: '{Cognome}', cognome: 'Rossi', nome: '', date: new Date(2026, 9, 22), practice: pr });
  assert.deepEqual(r, ['Rossi', 'Rossi 2']);
});

test('fileNames: nomi sempre diversi anche con taglio a 120 caratteri', () => {
  const lungo = 'R'.repeat(200);
  const pr = dueDoc(['cie', 'cie', 'cie']);
  for (const schema of ['{Cognome}', '{Cognome} {N}', '{N} {Cognome}', '{Cognome}_{Tipo} {N}']) {
    const r = nomi(pr, schema, lungo, '');
    assert.equal(new Set(r.map((x) => x.toLowerCase())).size, 3, schema);
    assert.ok(r.every((x) => x.length <= 120 && x.length > 0), schema);
  }
  assert.equal(nomi(pr, '{Cognome}', lungo, '')[1].slice(-2), ' 2');
  assert.equal(nomi(pr, '{Cognome} {N}', lungo, '')[2].slice(-2), ' 3');
});

test('fileNames: il numero non collide con un nome già presente', () => {
  const pr = dueDoc(['cie', 'cie', 'cie']);
  const types = TYPES.map((t) => (t.id === 'cie' ? { ...t, sigla: 'A' } : t));
  let p = pr;
  p = m.setType(p, p.documents[2].id, 'generico');
  const types2 = TYPES.map((t) => (t.id === 'generico' ? { ...t, sigla: 'A 2' } : t.id === 'cie' ? { ...t, sigla: 'A' } : t));
  const groups = m.exportPlan(p, types2, true);
  const r = m.fileNames(groups, { schema: '{Tipo}', cognome: '', nome: '', date: new Date(2026, 9, 22), types: types2, practice: p });
  assert.equal(new Set(r.map((x) => x.toLowerCase())).size, 3);
  assert.deepEqual(r.slice(0, 2), ['A', 'A 2']);
  void types;
});

// ---- Task 3: zip e allegato del PDF ----

const enc = new TextEncoder();
const lat = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const unisci = (...parti) => {
  const tot = parti.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(tot);
  let o = 0;
  for (const p of parti) { out.set(p, o); o += p.length; }
  return out;
};

// PDF minimo con allegato incorporato, nella forma che scrive buildPdf.
function pdfConAllegato(dati, { nome = 'scanforge-progetto.json', extra = '', length = dati.length } = {}) {
  const testa = lat(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(' + nome + ') 4 0 R] >> >> >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n' +
    '4 0 obj\n<< /Type /Filespec /F (' + nome + ') /UF (' + nome + ') /EF << /F 5 0 R >> >>\nendobj\n' +
    '5 0 obj\n<< /Type /EmbeddedFile ' + extra + '/Length ' + length + ' >>\nstream\n');
  const coda = lat('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n0\n%%EOF\n');
  return unisci(testa, dati, coda);
}

test('crc32: valori noti', () => {
  assert.equal(m.crc32(enc.encode('123456789')), 0xCBF43926);
  assert.equal(m.crc32(new Uint8Array(0)), 0);
});

// Lettore minimo di zip senza compressione, solo per il test.
function leggiZip(z) {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  const fine = z.length - 22;
  assert.equal(dv.getUint32(fine, true), 0x06054b50);
  const n = dv.getUint16(fine + 10, true);
  let p = dv.getUint32(fine + 16, true);
  const out = [];
  for (let i = 0; i < n; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const crc = dv.getUint32(p + 16, true);
    const dim = dv.getUint32(p + 24, true);
    const ln = dv.getUint16(p + 28, true);
    const lx = dv.getUint16(p + 30, true);
    const lc = dv.getUint16(p + 32, true);
    const lo = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(z.subarray(p + 46, p + 46 + ln));
    assert.equal(dv.getUint32(lo, true), 0x04034b50);
    const ln2 = dv.getUint16(lo + 26, true);
    const lx2 = dv.getUint16(lo + 28, true);
    const ini = lo + 30 + ln2 + lx2;
    out.push({ nome, crc, bytes: z.slice(ini, ini + dim), flags: dv.getUint16(p + 8, true), metodo: dv.getUint16(p + 10, true) });
    p += 46 + ln + lx + lc;
  }
  return out;
}

test('makeZip: struttura, nomi UTF-8, CRC e ripetibilita', () => {
  const files = [{ name: 'a.pdf', bytes: Uint8Array.from([1, 2, 3]) }, { name: 'Nicolò.pdf', bytes: new Uint8Array(0) }];
  const z = m.makeZip(files);
  assert.deepEqual([...z.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  assert.equal(dv.getUint32(z.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(z.length - 12, true), 2);
  const r = leggiZip(z);
  assert.deepEqual(r.map((x) => x.nome), ['a.pdf', 'Nicolò.pdf']);
  assert.deepEqual([...r[0].bytes], [1, 2, 3]);
  assert.equal(r[1].bytes.length, 0);
  assert.equal(r[0].crc, m.crc32(files[0].bytes));
  assert.equal(r[1].crc, 0);
  assert.ok(r.every((x) => x.metodo === 0 && (x.flags & 0x800) === 0x800));
  assert.deepEqual([...m.makeZip(files)], [...z]);
});

test('makeZip: oltre i limiti zip32 TypeError', () => {
  assert.throws(() => m.makeZip(new Array(65536).fill({ name: 'a', bytes: new Uint8Array(0) })), TypeError);
});

test('ATTACHMENT_NAME', () => {
  assert.equal(m.ATTACHMENT_NAME, 'scanforge-progetto.json');
});

test('readPdfAttachment: legge i byte esatti', () => {
  const dati = enc.encode('{"a":"endstream\\n"}\r\n\x00\xff');
  const r = m.readPdfAttachment(pdfConAllegato(dati));
  assert.ok(r instanceof Uint8Array);
  assert.deepEqual([...r], [...dati]);
});

test('readPdfAttachment: usa l\'ultima definizione dell\'oggetto', () => {
  const vecchio = pdfConAllegato(enc.encode('vecchio'));
  const nuovo = lat('12 0 obj\n<< >>\nendobj\n5 0 obj\n<< /Type /EmbeddedFile /Length 5 >>\nstream\r\nnuovo\nendstream\nendobj\n');
  const r = m.readPdfAttachment(unisci(vecchio, nuovo));
  assert.equal(new TextDecoder().decode(r), 'nuovo');
});

test('readPdfAttachment: null nei casi non validi', () => {
  const dati = enc.encode('{}');
  assert.equal(m.readPdfAttachment(lat('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF')), null);
  assert.equal(m.readPdfAttachment(pdfConAllegato(dati, { nome: 'altro.json' })), null);
  assert.equal(m.readPdfAttachment(pdfConAllegato(dati, { extra: '/Filter /FlateDecode ' })), null);
  assert.equal(m.readPdfAttachment(pdfConAllegato(dati, { length: 99999 })), null);
  assert.equal(m.readPdfAttachment(pdfConAllegato(dati, { length: 200000001 })), null);
  assert.equal(m.readPdfAttachment(pdfConAllegato(dati, { length: '6 0 R' })), null);
  assert.equal(m.readPdfAttachment(new Uint8Array(0)), null);
  assert.equal(m.readPdfAttachment(enc.encode('testo qualsiasi')), null);
  assert.equal(m.readPdfAttachment('stringa'), null);
  assert.equal(m.readPdfAttachment(null), null);
});

test('readPdfAttachment: file ostili da circa 5 MB restano lineari', () => {
  const grande = (frammento) => lat(frammento.repeat(Math.ceil(5000000 / frammento.length)));
  const casi = [
    ' /Type /Filespec ',
    '/F (scanforge-progetto.json) ',
    '0 obj ',
    'stream\n',
    '5 0 obj << /EF << /F 5 0 R >> (scanforge-progetto.json) '
  ];
  for (const c of casi) {
    const dati = grande(c);
    const t0 = performance.now();
    const r = m.readPdfAttachment(dati);
    const dt = performance.now() - t0;
    assert.equal(r, null, c);
    assert.ok(dt < 1000, 'troppo lento (' + Math.round(dt) + ' ms): ' + c);
  }
});

// PDF con tabella xref vera (offset esatti), come quelli scritti da buildPdf.
function pdfConXref(dati, { startxref } = {}) {
  const parti = [];
  let off = 0;
  const offs = {};
  const push = (x) => { const b = typeof x === 'string' ? lat(x) : x; parti.push(b); off += b.length; };
  const obj = (n) => { offs[n] = off; push(n + ' 0 obj\n'); };
  push('%PDF-1.4\n');
  obj(1); push('<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(scanforge-progetto.json) 4 0 R] >> >> >>\nendobj\n');
  obj(2); push('<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n');
  obj(3); push('<< /Altro true >>\nendobj\n');
  obj(4); push('<< /Type /Filespec /F (scanforge-progetto.json) /UF (scanforge-progetto.json) /EF << /F 5 0 R >> >>\nendobj\n');
  obj(5); push('<< /Type /EmbeddedFile /Length ' + dati.length + ' >>\nstream\n');
  push(dati);
  push('\nendstream\nendobj\n');
  const xrefStart = off;
  push('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i < 6; i++) push(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
  push('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + (startxref === undefined ? xrefStart : startxref) + '\n%%EOF');
  return unisci(...parti);
}

test('readPdfAttachment: con la xref prende l\'oggetto dagli offset, non dal testo dell\'allegato', () => {
  // L'allegato contiene a capo veri e un finto oggetto 5: la scansione del testo prenderebbe quello
  const dati = enc.encode('{"a":1}\n5 0 obj\n<< /Length 3 >>\nstream\nXXX\nendstream\nendobj\n');
  const r = m.readPdfAttachment(pdfConXref(dati));
  assert.ok(r instanceof Uint8Array);
  assert.deepEqual([...r], [...dati]);
});

test('readPdfAttachment: xref non valida, si ricade sulla scansione del testo', () => {
  const dati = enc.encode('{"b":2}');
  assert.deepEqual([...m.readPdfAttachment(pdfConXref(dati, { startxref: 3 }))], [...dati]);
  assert.deepEqual([...m.readPdfAttachment(pdfConXref(dati, { startxref: 99999999 }))], [...dati]);
});

test('readPdfAttachment: un nome con "5 0 obj" nel JSON non copre l\'oggetto vero', () => {
  const dati = enc.encode('{"cognome":"5 0 obj << /Length 2 >> stream x"}');
  const r = m.readPdfAttachment(pdfConAllegato(dati));
  assert.ok(r instanceof Uint8Array);
  assert.deepEqual([...r], [...dati]);
});

test('readPdfAttachment: nome ed /EF in oggetti diversi danno null', () => {
  const pdf = lat(
    '%PDF-1.4\n4 0 obj\n<< /Type /Filespec /F (scanforge-progetto.json) >>\nendobj\n' +
    '6 0 obj\n<< /Altro << /EF << /F 5 0 R >> >> >>\nendobj\n' +
    '5 0 obj\n<< /Length 2 >>\nstream\n{}\nendstream\nendobj\n%%EOF\n');
  assert.equal(m.readPdfAttachment(pdf), null);
});

test('readPdfAttachment: oggetto senza stream non prende lo stream di un altro', () => {
  const pdf = lat(
    '%PDF-1.4\n4 0 obj\n<< /Type /Filespec /F (scanforge-progetto.json) /EF << /F 5 0 R >> >>\nendobj\n' +
    '5 0 obj\n<< /Type /EmbeddedFile /Length 2 >>\nendobj\n' +
    '7 0 obj\n<< /Length 2 >>\nstream\n{}\nendstream\nendobj\n%%EOF\n');
  assert.equal(m.readPdfAttachment(pdf), null);
});

test('readPdfAttachment: /Length con più spazi', () => {
  const pdf = lat(
    '%PDF-1.4\n4 0 obj\n<< /F (scanforge-progetto.json) /EF << /F 5 0 R >> >>\nendobj\n' +
    '5 0 obj\n<< /Type /EmbeddedFile /Length    2   >>\nstream\r\n{}\nendstream\nendobj\n%%EOF\n');
  assert.equal(new TextDecoder().decode(m.readPdfAttachment(pdf)), '{}');
});

test('readPdfAttachment: 12 0 obj non e 2 0 obj', () => {
  const pdf = lat(
    '%PDF-1.4\n4 0 obj\n<< /F (scanforge-progetto.json) /EF << /F 2 0 R >> >>\nendobj\n' +
    '12 0 obj\n<< /Length 2 >>\nstream\n{}\nendstream\nendobj\n%%EOF\n');
  assert.equal(m.readPdfAttachment(pdf), null);
});
