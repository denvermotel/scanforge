# ScanForge

[English](#english) | [Italiano](#italiano)

## English

ScanForge turns phone photos of ID cards, documents and receipts into clean PDFs. It is a
single self-contained HTML file: no install, no account, no dependencies, and it works
offline, even from `file://`. Everything is processed locally in the browser; no file ever
leaves your computer.

**Features**
- Input from file, drag and drop, clipboard or camera.
- Projects made of documents (ID cards with front and back, sheets), with the type suggested
  automatically.
- Automatic edge detection and perspective crop, with four handles for manual correction.
- Straighten: fine rotation, keystone and mirror.
- Colors, Grays, B/W or Original mode per document; shadow removal, contrast, brightness,
  sharpness.
- Multiple pages, A4 layout with front and back side by side, one PDF or one per document,
  print.
- Save and reopen the work as a JSON project or an editable PDF.
- Scriptable API: `ScanForge.convert(input, options)` returns a PDF, JPEG, PNG or project
  file plus a per-page report (types in `dist/scanforge.d.ts`).

**Usage:** download `index.html` and open it in a recent browser, or use the online version at
https://denvermotel.github.io/scanforge/ from a desktop or mobile browser.

**Status:** 0.3.1 beta.

**License:** AGPL-3.0.

## Italiano

ScanForge trasforma in PDF puliti le foto di documenti d'identità, fogli e scontrini fatte col
cellulare. È un unico file HTML autocontenuto: niente installazione, niente account, nessuna
dipendenza, e funziona anche offline, anche da `file://`. Tutta l'elaborazione avviene nel
browser: i file non escono mai dal computer.

**Funzioni**
- Input da file, trascinamento, appunti o fotocamera.
- Progetti fatti di documenti (carte d'identità con fronte e retro, fogli), con il tipo
  proposto in automatico.
- Rilevazione automatica dei bordi e ritaglio prospettico, con quattro maniglie per la
  correzione a mano.
- Raddrizza: rotazione fine, keystone e specchio.
- Modalità Colori, Grigi, B/N od Originale per documento; rimozione ombre, contrasto,
  luminosità, nitidezza.
- Pagine multiple, layout A4 con fronte e retro affiancati, un PDF unico o uno per documento,
  stampa.
- Salvataggio e riapertura del lavoro come progetto JSON o PDF modificabile.
- API programmabile: `ScanForge.convert(input, opzioni)` restituisce un PDF, JPEG, PNG o
  progetto e un report per pagina (tipi in `dist/scanforge.d.ts`).

**Uso:** scaricare `index.html` e aprirlo in un browser recente, oppure usare la versione online su
https://denvermotel.github.io/scanforge/ da un browser desktop o mobile.

**Stato:** 0.3.1 beta.

**Licenza:** AGPL-3.0.
