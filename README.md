# ScanForge

[English](#english) | [Italiano](#italiano)

## English

ScanForge turns phone photos of ID cards, documents and receipts into clean PDFs. It is a
single self-contained HTML file: no install, no account, no dependencies, and it works
offline, even from `file://`. Everything is processed locally in the browser; no file ever
leaves your computer.

**Features**
- Input from file, drag and drop, clipboard or camera.
- Automatic edge detection and perspective crop, with four handles for manual correction.
- Straighten: fine rotation and vertical/horizontal keystone.
- Shadow removal, contrast, brightness, sharpness, black and white.
- Presets for documents, photos, ID cards and receipts.
- Multiple pages, A4 layout with front and back side by side, PDF export.
- Save and reopen the work as a JSON project.
- Scriptable API: `ScanForge.convert(input, options)` returns a PDF, JPEG, PNG or project
  file plus a per-page report (types in `dist/scanforge.d.ts`).

**Usage:** download `index.html` and open it in a recent browser.

**Status:** 0.2 beta. Version 0.3 (image quality modes for ID cards and sheets) is in
development.

**License:** AGPL-3.0.

## Italiano

ScanForge trasforma in PDF puliti le foto di documenti d'identità, fogli e scontrini fatte col
cellulare. È un unico file HTML autocontenuto: niente installazione, niente account, nessuna
dipendenza, e funziona anche offline, anche da `file://`. Tutta l'elaborazione avviene nel
browser: i file non escono mai dal computer.

**Funzioni**
- Input da file, trascinamento, appunti o fotocamera.
- Rilevazione automatica dei bordi e ritaglio prospettico, con quattro maniglie per la
  correzione a mano.
- Raddrizza: rotazione fine e keystone verticale e orizzontale.
- Rimozione ombre, contrasto, luminosità, nitidezza, bianco e nero.
- Preset per documenti, foto, documenti di riconoscimento e scontrini.
- Pagine multiple, layout A4 con fronte e retro affiancati, esportazione in PDF.
- Salvataggio e riapertura del lavoro come progetto JSON.
- API programmabile: `ScanForge.convert(input, opzioni)` restituisce un PDF, JPEG, PNG o
  progetto e un report per pagina (tipi in `dist/scanforge.d.ts`).

**Uso:** scaricare `index.html` e aprirlo in un browser recente.

**Stato:** 0.2 beta. La versione 0.3 (modalità di qualità dell'immagine per documenti
d'identità e fogli) è in sviluppo.

**Licenza:** AGPL-3.0.
