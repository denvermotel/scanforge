#!/usr/bin/env python3
"""Genera testbench/reference/ref02.js estraendo dal commit 1d28524 (ScanForge 0.2)
le funzioni di elaborazione, SENZA riscriverle: il riferimento deve restare il
codice 0.2 inalterato, e' il termine di paragone del banco.

Uso (dalla radice del repository): python testbench/tools/make_ref02.py
"""
import subprocess
import sys
from pathlib import Path

COMMIT = '1d28524'
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'testbench' / 'reference' / 'ref02.js'

# Ordine di emissione: dipendenze prima, così il file si legge dall'alto in basso.
FUNCTIONS = [
    'solveLinearSystem', 'computeHomography', 'applyH', 'bilinearSample',
    'warpPerspective', 'applyKeystone', 'applyFineRotation', 'removeShadows',
    'enhanceCanvas', 'applySharpening', 'processPage', 'autoDetectCorners',
    'defaultSettings', 'defaultCorners', 'slugifyProjectName', 'buildPdf',
    'serializeProject', 'canvasToJpegBytes', 'groupPagesForA4', 'drawContain',
    'composeA4Page',
]


def git_show():
    out = subprocess.run(['git', 'show', COMMIT + ':scanforge.html'], cwd=ROOT,
                         capture_output=True, check=True)
    return out.stdout.decode('utf-8')


def find_block_end(src, open_idx):
    """Indice del carattere subito dopo la graffa che chiude quella aperta in open_idx.
    Salta commenti, stringhe e template literal, altrimenti una graffa dentro una
    stringa falserebbe il conteggio."""
    i, n = open_idx, len(src)
    # pila di contesti: 'code' conta le graffe, 'tpl' e' dentro un template literal
    stack = [['code', 0]]
    while i < n:
        mode, depth = stack[-1]
        c = src[i]
        if mode == 'code':
            two = src[i:i + 2]
            if two == '//':
                i = src.index('\n', i)
                continue
            if two == '/*':
                i = src.index('*/', i) + 2
                continue
            if c in '\'"':
                j = i + 1
                while src[j] != c:
                    j += 2 if src[j] == '\\' else 1
                i = j + 1
                continue
            if c == '`':
                stack.append(['tpl', 0])
                i += 1
                continue
            if c == '{':
                stack[-1][1] += 1
            elif c == '}':
                stack[-1][1] -= 1
                if stack[-1][1] == 0 and len(stack) == 1:
                    return i + 1
                if stack[-1][1] < 0:
                    # chiude un ${ ... } di un template: si torna nel template
                    stack.pop()
            i += 1
        else:  # dentro un template literal
            if c == '\\':
                i += 2
                continue
            if c == '`':
                stack.pop()
                i += 1
                continue
            if src[i:i + 2] == '${':
                stack.append(['code', 0])
                i += 2
                continue
            i += 1
    raise ValueError('graffa non chiusa')


def extract_function(src, name):
    # la funzione inizia a inizio riga: "function name(" oppure "async function name("
    marker = '\nfunction ' + name + '('
    k = src.find(marker)
    if k < 0:
        raise ValueError('funzione non trovata: ' + name)
    start = k + 1
    open_idx = src.index('{', src.index(')', start))
    end = find_block_end(src, open_idx)
    text = src[start:end]
    # controllo di sanita': la graffa di chiusura sta a inizio riga
    if not text.rstrip().endswith('\n}'):
        raise ValueError('estrazione sospetta per ' + name)
    return text


def extract_presets(src):
    start = src.index('\nconst PRESETS = {') + 1
    end = src.index('\n};', start) + 3
    return src[start:end]


HEADER = """// generato dal commit {commit}: non modificare
// Riferimento ScanForge 0.2: il codice qui sotto e' copiato alla lettera da
// scanforge.html del commit {commit} (script testbench/tools/make_ref02.py).
// Serve al banco come termine di paragone dell'elaborazione 0.2.
"""

PRELUDE = """  // Stub locali: il codice 0.2 li chiama ma nel riferimento non fanno nulla
  // di grafico. showToast e' agganciato da Ref02.detect per sapere quando
  // autoDetectCorners ha finito (successo o rifiuto).
  const state = {pages: [], currentIdx: 0, projectName: '', a4Compose: false};
  let toastHook = null;
  function showToast() { if (toastHook) toastHook(); }
  function positionHandles() {}
  function renderPreview() {}
  function setMode() {}
"""

API = """
  // ---- API del riferimento (unico codice scritto a mano, fuori dal 0.2) ----
  window.Ref02 = {
    // Rileva gli angoli con autoDetectCorners 0.2. Risolve con page.corners
    // quando lo stub showToast viene chiamato: oggetto in caso di successo,
    // null se il documento non e' stato rilevato.
    detect(src) {
      return new Promise(resolve => {
        const page = {originalSrc: src, corners: null, settings: defaultSettings()};
        state.pages = [page];
        state.currentIdx = 0;
        toastHook = () => { toastHook = null; resolve(page.corners); };
        autoDetectCorners();
      });
    },
    process(page) { return processPage(page); },
    buildPdf(images) { return buildPdf(images); },
    serializeProject(st) {
      state.projectName = st.projectName || '';
      state.a4Compose = !!st.a4Compose;
      state.pages = st.pages || [];
      return serializeProject();
    },
    slugify(name) {
      state.projectName = name;
      return slugifyProjectName();
    },
    PRESETS,
    defaultSettings,
    defaultCorners,
    composeA4Page,
    groupPagesForA4,
    canvasToJpegBytes,
  };
"""


def main():
    src = git_show()
    parts = [HEADER.format(commit=COMMIT), '(function () {\n', PRELUDE, '\n']
    for name in FUNCTIONS:
        parts.append(extract_function(src, name) + '\n\n')
    parts.append(extract_presets(src) + '\n')
    parts.append(API)
    parts.append('})();\n')
    text = ''.join(parts)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding='utf-8', newline='\n')
    print('scritto', OUT.relative_to(ROOT), len(text), 'byte')
    bad = [c for c in (chr(0x2013), chr(0x2014)) if c in text]
    if bad:
        print('attenzione: nel riferimento restano trattini lunghi:', [hex(ord(c)) for c in bad])


if __name__ == '__main__':
    sys.exit(main())
