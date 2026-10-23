// Elenco delle voci pubbliche che ScanForge deve esporre (API versione 1).
// Fonte unica per i test di contratto: se cambia il contratto, cambia qui,
// in dist/scanforge.d.ts e in testbench/api.html.
window.SF_API_MANIFEST = [
  { path: 'version', type: 'string' },
  { path: 'apiVersion', type: 'number' },
  { path: 'convert', type: 'function' },
  { path: 'detectDocument', type: 'function' },
  { path: 'classifyDocument', type: 'function' },
  { path: 'process', type: 'function' },
  { path: 'defaultSettings', type: 'function' },
  { path: 'presets', type: 'object' },
  { path: 'io.loadImage', type: 'function' },
  { path: 'io.buildPdf', type: 'function' },
  { path: 'io.encodeJpeg', type: 'function' },
  { path: 'io.encodePng', type: 'function' },
  { path: 'io.serializeProject', type: 'function' },
  { path: 'io.parseProject', type: 'function' },
  { path: 'io.projectFromPdf', type: 'function' },
  { path: 'io.checkSettings', type: 'function' },
  { path: 'io.normalizeCorners', type: 'function' },
  { path: 'io.createOps', type: 'function' },
  { path: 'io.slugify', type: 'function' },
  { path: 'io.fileName', type: 'function' },
  { path: 'io.assignDefaultDocGroups', type: 'function' }
];
