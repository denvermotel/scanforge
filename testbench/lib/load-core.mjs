// Carica in Node il blocco sf-core di index.html senza DOM.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function codiceCore() {
  const html = readFileSync(join(radice, 'index.html'), 'utf8');
  const m = html.match(/<script id="sf-core">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('blocco sf-core non trovato in index.html');
  return m[1];
}

// Esegue il blocco e restituisce quello che espone: module.exports (se il chiamante passa
// un "module") e globalThis.ScanForge. Il globale si ripristina com'era, per non contaminare.
// preesistente: oggetto gia presente in globalThis.ScanForge prima del caricamento.
// conModule: false simula un host senza "module" (pagina del browser).
export function loadCoreDetailed(conModule = true, preesistente = undefined) {
  const codice = codiceCore();
  const previo = Object.getOwnPropertyDescriptor(globalThis, 'ScanForge');
  delete globalThis.ScanForge;
  if (preesistente !== undefined) globalThis.ScanForge = preesistente;
  let exportato = null;
  try {
    if (conModule) {
      const module = { exports: {} };
      new Function('module', 'exports', codice)(module, module.exports);
      exportato = module.exports;
    } else {
      new Function(codice)();
    }
    return { exports: exportato, globale: globalThis.ScanForge };
  } finally {
    delete globalThis.ScanForge;
    if (previo) Object.defineProperty(globalThis, 'ScanForge', previo);
  }
}

export function loadCore() {
  return loadCoreDetailed(true).exports;
}

// Carica sf-look (che si appoggia al core) e restituisce il suo module.exports.
// Il globale ScanForge si ripristina com'era, come per il core.
export function loadLook() {
  const html = readFileSync(join(radice, 'index.html'), 'utf8');
  const m = html.match(/<script id="sf-look">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('blocco sf-look non trovato in index.html');
  const previo = Object.getOwnPropertyDescriptor(globalThis, 'ScanForge');
  delete globalThis.ScanForge;
  try {
    // loadCoreDetailed ripristina il globale: lo rimetto con il core caricato, per il blocco look
    globalThis.ScanForge = loadCoreDetailed(false).globale;
    const module = { exports: {} };
    new Function('module', 'exports', m[1])(module, module.exports);
    return module.exports;
  } finally {
    delete globalThis.ScanForge;
    if (previo) Object.defineProperty(globalThis, 'ScanForge', previo);
  }
}

// Carica sf-model (puro, non richiede il core) e restituisce il suo module.exports.
export function loadModel() {
  const html = readFileSync(join(radice, 'index.html'), 'utf8');
  const m = html.match(/<script id="sf-model">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('blocco sf-model non trovato in index.html');
  const previo = Object.getOwnPropertyDescriptor(globalThis, 'ScanForge');
  delete globalThis.ScanForge;
  try {
    const module = { exports: {} };
    new Function('module', 'exports', m[1])(module, module.exports);
    return module.exports;
  } finally {
    delete globalThis.ScanForge;
    if (previo) Object.defineProperty(globalThis, 'ScanForge', previo);
  }
}
