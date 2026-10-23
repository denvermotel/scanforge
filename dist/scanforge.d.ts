// Contratto pubblico di ScanForge, API versione 1 (app 0.3.x).
// Bozza: descrive solo le firme del §5 della spec. Una modifica incompatibile
// alza apiVersion e va riportata qui e nei test di contratto (testbench/api.html).

/** Immagine RGBA a 8 bit, 4 byte per pixel, righe consecutive. */
export interface Img {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Quattro angoli del documento, in percentuale (0-100) della larghezza e altezza. */
export interface Corners {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export interface Settings {
  contrast: number;
  brightness: number;
  sharpen: number;
  bw: boolean;
  autoEnhance: boolean;
  shadows: boolean;
  perspective: boolean;
  rotFine: number;
  keystoneV: number;
  keystoneH: number;
  /**
   * Opzionali, assenti in `defaultSettings()`. Senza `mode` l'elaborazione è quella della 0.2;
   * con `mode` bw, autoEnhance e shadows sono ignorati.
   */
  mode?: Mode;
  /** Con `mode` e senza docType, `process` usa quello proposto da `classifyDocument`. */
  docType?: DocType;
  /** Sensibilità del bianco e nero (k di Sauvola), da 0,1 a 0,5: più basso, più inchiostro. */
  inchiostro?: number;
  /** Angoli arrotondati dopo il warp (per le tessere). */
  angoliArrotondati?: boolean;
  /** Specchia il risultato in orizzontale (per esempio una foto fatta con la fotocamera frontale). Ultimo passo, vale per ogni modalità. */
  flipH?: boolean;
  /** Specchia il risultato in verticale. */
  flipV?: boolean;
  /** Con `mode` 'colori' sulle tessere: `false` spegne il bilanciamento del bianco (predefinito: acceso). */
  bilanciaBianco?: boolean;
}

/** Modalità di resa: assente = percorso della 0.2. */
export type Mode = 'colori' | 'grigi' | 'bn' | 'originale';

/** Tipo di documento: tessera/documento d'identità o foglio. */
export type DocType = 'identita' | 'foglio';

/** Operazioni non pure iniettate nel core (canvas in pagina, versioni di test in Node). */
export interface Ops {
  /** Riduzione o riespansione. */
  scale(img: Img, w: number, h: number, quality?: 'low' | 'high'): Img;
  /** Rotazione fine con fondo bianco. */
  rotate(img: Img, deg: number): Img;
}

export type Preset =
  | 'document' | 'photo' | 'id' | 'receipt'
  | 'identita-colori' | 'identita-grigi' | 'foglio-grigi' | 'foglio-colori' | 'foglio-bn' | 'originale';

export type InputSource =
  | File
  | Blob
  | ArrayBuffer
  | Uint8Array
  | string; // URL

/** Un progetto (oggetto con `pages`, o stringa JSON che inizia per `{`) non si combina con altri input. */
export type ConvertInput = InputSource | InputSource[] | ProjectState | ProjectState[];

export interface ConvertOptions {
  preset?: Preset;
  /**
   * Sovrascritture parziali dei valori del preset. Tipi sbagliati o valori fuori intervallo
   * (contrast e brightness -100..100, sharpen 0..100, rotFine -45..45, keystoneV e keystoneH
   * -100..100, inchiostro 0,1..0,5; mode e docType tra i valori elencati) danno 'bad-input'.
   */
  settings?: Partial<Settings>;
  /** Modalità di resa; sovrascrive quella del preset, ma non `settings.mode`. Valore sconosciuto: 'bad-input'. */
  mode?: Mode;
  /** Tipo di documento; sovrascrive quello del preset, ma non `settings.docType`. Valore sconosciuto: 'bad-input'. */
  docType?: DocType;
  /**
   * 'auto' (predefinito) rileva il documento; oppure quattro punti in percentuale, come oggetto
   * o array [tl, tr, br, bl]. Coordinate finite tra -100 e 200, altrimenti 'bad-input'.
   */
  corners?: 'auto' | Corners | [Point, Point, Point, Point];
  output?: 'pdf' | 'jpeg' | 'png' | 'project';
  /** Fronte/retro su A4. Senza docGroup le pagine si accoppiano in sequenza. */
  a4Compose?: boolean;
  projectName?: string;
  /** Qualità JPEG, da 0 (escluso) a 1. */
  quality?: number;
  /** Lato massimo in pixel dopo la decodifica, non inferiore a 1 (predefinito 3000; ignorato con output 'project'). */
  maxDim?: number;
}

export interface PageReport {
  name: string;
  corners: Corners;
  /** Null finché non arriva la misura (sotto-progetto 2). */
  confidence: number | null;
  method: 'otsu-v0' | 'default' | 'given' | 'project';
  ms: { detect: number; process: number; encode: number };
  /** 'only-first-page': output jpeg o png con più pagine, restituita solo la prima. */
  warning?: string;
  /** Solo con una modalità (`mode`); senza, il report resta quello della 0.2. */
  mode?: Mode;
  /** Tipo usato; assente con `mode` 'originale'. */
  docType?: DocType;
  /** Solo quando il tipo l'ha proposto `classifyDocument` (0-1). */
  docTypeConfidence?: number;
}

export interface ConvertResult {
  bytes: Uint8Array;
  mime: string;
  fileName: string;
  pages: number;
  report: PageReport[];
}

/** Codici stabili; 'no-document' è riservato e non viene ancora emesso. */
export type SfErrorCode =
  | 'bad-input'
  | 'bad-image'
  | 'no-document'
  | 'too-large'
  | 'internal';

export interface SfError {
  code: SfErrorCode;
  message: string;
}

export interface DetectResult {
  /** Null se la zona chiara è troppo piccola e la rilevazione non è affidabile. */
  corners: Corners | null;
  confidence: number | null;
  method: string;
}

/** Tipo di documento proposto e confidenza (0-1): sotto 0,6 la scelta è prudente ('identita'). */
export interface ClassifyResult {
  docType: DocType;
  confidence: number;
}

export interface ProcessOptions {
  /** Senza angoli (o con perspective false) non c'è correzione prospettica. */
  corners: Corners | null;
  settings: Settings;
  /** Diagnostica: nome del passo eseguito e durata in millisecondi. Non influisce sui calcoli. */
  onStage?: (stage: string, ms: number) => void;
}

export interface PdfPage {
  /** JPEG già codificato. */
  bytes: Uint8Array;
  width: number;
  height: number;
  /** Dimensioni della pagina in punti; senza, si usano width e height a 96 dpi. */
  ptW?: number;
  ptH?: number;
}

export type DocSide = 'fronte' | 'retro';

export interface ProjectPage {
  /** Identificatore della pagina; parseProject assegna 'p' + posizione. */
  id?: string;
  originalSrc: string;
  name: string;
  settings: Settings;
  corners: Corners;
  width: number;
  height: number;
  docGroup: number | string | null;
  docSide: DocSide;
}

export type PracticeMode = 'colori' | 'grigi' | 'bn' | 'originale';

export interface PracticeDocument {
  id: string;
  typeId: string;
  mode: PracticeMode | null;
  /** Id delle pagine; al più due per una tessera. */
  pageIds: string[];
}

export interface Practice {
  cognome: string;
  nome: string;
  documents: PracticeDocument[];
  unassigned: string[];
  /** Definizioni dei tipi propri usati dai documenti (mai i predefiniti). */
  types?: PracticeType[];
}

export interface PracticeType {
  id: string;
  /** 1-60 caratteri. */
  label: string;
  /** 1-20 caratteri, pulita come un nome di file. */
  sigla: string;
  family: 'tessera' | 'foglio';
}

export interface ProjectState {
  projectName: string;
  a4Compose: boolean;
  /** Pratica: documenti e pagine non assegnate. parseProject la ricava dal file o da docGroup/docSide. */
  practice?: Practice;
  pages: ProjectPage[];
  /** Solo per serializeProject: tipi disponibili (predefiniti e propri) da cui ricavare practice.types. */
  types?: PracticeType[];
}

export interface BuildPdfOptions {
  /** File incorporato nel PDF: solo il progetto di ScanForge. */
  attachment?: { name: 'scanforge-progetto.json'; bytes: Uint8Array };
}

export interface A4Group {
  gid: number | string;
  sidesMap: { fronte: HTMLCanvasElement | null; retro: HTMLCanvasElement | null };
}

export interface ScanForgeIo {
  loadImage(source: InputSource, opts?: { maxDim?: number; maxPixels?: number }): Promise<Img>;
  buildPdf(pages: PdfPage[], opts?: BuildPdfOptions): Uint8Array;
  encodeJpeg(img: Img | HTMLCanvasElement, quality?: number): Promise<Uint8Array>;
  encodePng(img: Img | HTMLCanvasElement): Promise<Uint8Array>;
  /** Stringa JSON del progetto, compatibile con i file della 0.2. */
  serializeProject(state: ProjectState): string;
  /** Rifiuta con { code: 'bad-input' } se il testo non è un progetto. */
  parseProject(json: string): ProjectState;
  /** Testo JSON del progetto incorporato in un PDF di ScanForge, oppure null. Non lancia. */
  projectFromPdf(bytes: Uint8Array): string | null;
  /** Controlla le chiavi presenti di settings; rifiuta con { code: 'bad-input' } i valori fuori intervallo. */
  checkSettings(settings: Partial<Settings> | null | undefined, where: string): void;
  /** Copia di quattro angoli ({tl,tr,br,bl} o array), percentuali tra -100 e 200; rifiuta con { code: 'bad-input' }. */
  normalizeCorners(corners: Corners | [Point, Point, Point, Point]): Corners;
  /** Crea le operazioni canvas per il core. */
  createOps(): Ops;
  imageToCanvas(img: Img): HTMLCanvasElement;
  /** Slug sicuro per nome file: senza accenti, minuscolo, trattini. Vuoto se il nome è vuoto. */
  slugify(name: string): string;
  /** Nome file dal nome progetto, oppure `scanforge-AAAA-MM-GG-hh-mm` (UTC). */
  fileName(projectName: string, ext: string, now?: Date): string;
  groupPagesForA4(pages: { page: { docGroup: number | string | null; docSide: DocSide }; canvas: HTMLCanvasElement }[]): A4Group[];
  drawContain(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, x: number, y: number, w: number, h: number): void;
  composeA4Page(groups: A4Group[]): { canvas: HTMLCanvasElement; ptW: number; ptH: number };
  /** Coppie fronte/retro in sequenza per le pagine senza docGroup (sul posto). */
  assignDefaultDocGroups(pages: { docGroup: number | string | null; docSide: DocSide }[]): void;
}

export interface ScanForgeApi {
  readonly version: string;
  readonly apiVersion: 1;
  convert(input: ConvertInput, opts?: ConvertOptions): Promise<ConvertResult>;
  /** Senza `ops` usa le operazioni canvas di `io.createOps()`. */
  detectDocument(img: Img, ops?: Ops): DetectResult;
  /**
   * Propone il tipo di documento dal rapporto d'aspetto del quadrilatero (solo con angoli diversi
   * da quelli di default) e dal contenuto; se gli indizi non concordano o sono deboli, 'identita'.
   * `process` lo usa quando `settings.docType` manca.
   */
  classifyDocument(img: Img, corners: Corners | null): ClassifyResult;
  /** Senza `ops` usa le operazioni canvas di `io.createOps()`. */
  process(img: Img, opts: ProcessOptions, ops?: Ops): Img;
  defaultSettings(): Settings;
  presets: Record<Preset, Partial<Settings>>;
  core: { defaultCorners(): Corners };
  io: ScanForgeIo;
}

declare const ScanForge: ScanForgeApi;
export default ScanForge;
