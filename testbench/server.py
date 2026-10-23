#!/usr/bin/env python3
"""Server locale del banco di prova di ScanForge.

Ascolta solo su 127.0.0.1, senza cache, così il banco rilegge sempre i file appena
modificati. Ogni richiesta (GET compresi) deve avere un Host locale (localhost,
127.0.0.1, [::1]), altrimenti 400: difesa da DNS rebinding.

GET: solo una allowlist, tutto il resto e' 404 (anche .git, dev/ fuori dal banco,
.superpowers, .claude, AGENTS.md):
  /index.html, /testbench/..., /dist/...,
  /dev/materiale/banco/...   (ground-truth.json, risultati/ e le foto in foto/)
  /favicon.ico               (204 senza contenuto)
  /dev/materiale/banco/foto-elenco   (unico endpoint calcolato, vedi sotto)
Niente elenco delle cartelle e niente index.html automatico: i file si servono solo
richiesti per nome. Le foto da annotare vanno messe a mano in dev/materiale/banco/foto/.

GET /dev/materiale/banco/foto-elenco risponde con un array JSON dei nomi dei file
.jpg/.jpeg/.png presenti in dev/materiale/banco/foto/, ordinati, solo nomi semplici (mai
percorsi) e senza aprire i file; cartella assente = []. Non accetta parametri (la query si
ignora) ed e' soggetto allo stesso controllo Host degli altri GET. Serve all'annotatore.

Tre soli POST, tutti con corpo JSON, che scrivono dentro dev/materiale/banco/:
  POST /save                    -> dev/materiale/banco/ground-truth.json (forma vecchia o
                                   nuova con riquadri, rotazione e piega: vedi
                                   validate_ground_truth)
  POST /save-result?name=X.json -> dev/materiale/banco/risultati/X.json
  POST /save-giudizi            -> dev/materiale/banco/giudizi.json, i giudizi dati dall'utente
                                   nella pagina giudizio.html: {giudizi: [{file, modo, voto,
                                   nota?}]} (vedi validate_giudizi)
Ogni altro percorso, nome file non semplice, corpo oltre 1 MB o JSON non valido
viene rifiutato con 400. Le foto non si scrivono mai da qui.

Uso: python testbench/server.py [porta]   (default 8765)
"""
import json
import math
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'dev' / 'materiale' / 'banco'
GROUND_TRUTH = BASE / 'ground-truth.json'
RESULTS = BASE / 'risultati'
FOTO = BASE / 'foto'
GIUDIZI = BASE / 'giudizi.json'
FOTO_ELENCO = '/dev/materiale/banco/foto-elenco'
FOTO_EXT = ('.jpg', '.jpeg', '.png')

MAX_BODY = 1024 * 1024
MAX_DRAIN = 8 * 1024 * 1024
# Solo lettere, cifre, trattino e sottolineatura: niente punti, quindi niente "..".
RESULT_NAME = re.compile(r'[A-Za-z0-9_-]{1,80}\.json')
# Nomi riservati di Windows: aprirli come file darebbe un errore o scriverebbe su un dispositivo.
RESERVED = {'con', 'prn', 'aux', 'nul'} | {'com%d' % i for i in range(1, 10)} | {'lpt%d' % i for i in range(1, 10)}
TIPI = ('cie', 'patente', 'ts', 'passaporto')
ROTAZIONI = (0, 90, 180, 270)
MAX_RIQUADRI = 6
CORNER_KEYS = ('tl', 'tr', 'br', 'bl')
# Intervallo ammesso per gli angoli annotati, in percentuale (un po' di margine fuori cornice).
CORNER_MIN, CORNER_MAX = -10, 110
MODI = ('colori', 'grigi', 'bn', 'originale')
VOTI = ('ok', 'no')
MAX_NOTA = 500
MAX_GIUDIZI = 2000
LOCAL_HOSTS = ('localhost', '127.0.0.1', '[::1]')

# Cartelle e file serviti in GET.
GET_ROOTS = [ROOT / 'testbench', ROOT / 'dist', BASE]
GET_FILES = [ROOT / 'index.html']


class BadRequest(Exception):
    pass


def _num(v):
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return False
    try:
        return math.isfinite(v) and CORNER_MIN <= v <= CORNER_MAX
    except OverflowError:  # intero troppo grande per un float
        return False


def _reject_constant(name):
    # json.loads accetta NaN e Infinity: non sono JSON valido.
    raise BadRequest('valore non valido: ' + name)


def _check_quad(c, where, name='corners'):
    if not isinstance(c, dict):
        raise BadRequest(where + name + ' mancante')
    for k in CORNER_KEYS:
        p = c.get(k)
        if not (isinstance(p, dict) and _num(p.get('x')) and _num(p.get('y'))):
            raise BadRequest(where + 'angolo %s non valido (numeri tra %d e %d)' % (k, CORNER_MIN, CORNER_MAX))


def _check_point(p):
    return isinstance(p, dict) and _num(p.get('x')) and _num(p.get('y'))


def _check_box(q, where):
    """Un riquadro: {tipo, corners}; solo per il passaporto aperto anche piega
    {top: {x, y}, bottom: {x, y}} (i due capi della piega, in alto e in basso)."""
    if not isinstance(q, dict):
        raise BadRequest(where + 'non e un oggetto')
    if q.get('tipo') not in TIPI:
        raise BadRequest(where + 'tipo non valido')
    _check_quad(q.get('corners'), where)
    if 'piega' in q:
        if q['tipo'] != 'passaporto':
            raise BadRequest(where + 'piega ammessa solo per il passaporto')
        pg = q['piega']
        if not (isinstance(pg, dict) and _check_point(pg.get('top')) and _check_point(pg.get('bottom'))):
            raise BadRequest(where + 'piega non valida (top e bottom con numeri tra %d e %d)' % (CORNER_MIN, CORNER_MAX))


def validate_ground_truth(data):
    """Lista di voci, una per foto. Due forme, entrambe valide:
      vecchia  {file, tipo, corners}            un solo riquadro, foto non ruotata
      nuova    {file, rotazione?, riquadri: [..]}  da 1 a 6 riquadri
    rotazione (facoltativa, anche nella forma vecchia): 0, 90, 180 o 270 gradi in senso orario
    da applicare alla foto per vederla dritta; gli angoli sono percentuali dell'immagine gia'
    ruotata. Un riquadro e' {tipo, corners}; il passaporto aperto (un solo documento, lo
    spread con le due pagine affiancate) ha in piu' piega {top: {x, y}, bottom: {x, y}}, i
    due capi della piega: corners sono i quattro angoli esterni dello spread. Senza piega il
    passaporto vale una pagina sola. piega e' vietata per gli altri tipi. Un quadrilatero e'
    {tl, tr, br, bl}, ciascuno {x, y} con numeri finiti tra -10 e 110. La forma vecchia e
    'riquadri' insieme non sono ammessi nella stessa voce."""
    if not isinstance(data, list):
        raise BadRequest('ground-truth deve essere una lista')
    for i, e in enumerate(data):
        where = 'voce %d: ' % i
        if not isinstance(e, dict):
            raise BadRequest(where + 'non e un oggetto')
        f = e.get('file')
        if (not isinstance(f, str) or not f or f.startswith('.')
                or '/' in f or '\\' in f or '\0' in f):
            raise BadRequest(where + 'file non valido')
        if 'rotazione' in e:
            r = e['rotazione']
            if isinstance(r, bool) or not isinstance(r, int) or r not in ROTAZIONI:
                raise BadRequest(where + 'rotazione non valida (0, 90, 180 o 270)')
        if 'riquadri' in e:
            if 'tipo' in e or 'corners' in e:
                raise BadRequest(where + 'usare tipo e corners oppure riquadri')
            rq = e['riquadri']
            if not isinstance(rq, list) or not rq:
                raise BadRequest(where + 'riquadri deve essere una lista non vuota')
            if len(rq) > MAX_RIQUADRI:
                raise BadRequest(where + 'al massimo %d riquadri' % MAX_RIQUADRI)
            for j, q in enumerate(rq):
                _check_box(q, where + 'riquadro %d: ' % (j + 1))
        else:
            _check_box({'tipo': e.get('tipo'), 'corners': e.get('corners')}, where)


def validate_giudizi(data):
    """{giudizi: [{file, modo, voto, nota?}]}: file senza percorso, modo tra colori, grigi, bn e
    originale, voto 'ok' o 'no', nota facoltativa di al massimo 500 caratteri. Nessun altro campo
    e nessun giudizio doppio per la stessa coppia (file, modo). Restituisce l'oggetto ripulito."""
    if not isinstance(data, dict) or list(data.keys()) != ['giudizi'] or not isinstance(data['giudizi'], list):
        raise BadRequest('serve un oggetto con la sola lista giudizi')
    if len(data['giudizi']) > MAX_GIUDIZI:
        raise BadRequest('troppi giudizi')
    out = []
    seen = set()
    for i, g in enumerate(data['giudizi']):
        where = 'giudizio %d: ' % i
        if not isinstance(g, dict) or not set(g.keys()) <= {'file', 'modo', 'voto', 'nota'}:
            raise BadRequest(where + 'campi non validi')
        f = g.get('file')
        if (not isinstance(f, str) or not f or f.startswith('.')
                or '/' in f or '\\' in f or '\0' in f):
            raise BadRequest(where + 'file non valido')
        if g.get('modo') not in MODI:
            raise BadRequest(where + 'modo non valido')
        if g.get('voto') not in VOTI:
            raise BadRequest(where + 'voto non valido')
        if (f, g['modo']) in seen:
            raise BadRequest(where + 'giudizio ripetuto')
        seen.add((f, g['modo']))
        e = {'file': f, 'modo': g['modo'], 'voto': g['voto']}
        if 'nota' in g:
            n = g['nota']
            if not isinstance(n, str) or len(n) > MAX_NOTA or '\0' in n:
                raise BadRequest(where + 'nota non valida (testo di al massimo %d caratteri)' % MAX_NOTA)
            if n:
                e['nota'] = n
        out.append(e)
    return {'giudizi': out}


def validate_result(data):
    if not isinstance(data, dict):
        raise BadRequest('il risultato deve essere un oggetto')


def list_photos():
    """Nomi dei file immagine in FOTO, ordinati. Non apre i file e non segue i collegamenti simbolici."""
    names = []
    try:
        with os.scandir(FOTO) as it:
            for e in it:
                n = e.name
                if (n.startswith('.') or not n.lower().endswith(FOTO_EXT) or '\0' in n
                        or '/' in n or '\\' in n):
                    continue
                try:
                    if e.is_file(follow_symlinks=False):
                        names.append(n)
                except OSError:
                    continue
    except OSError:  # cartella assente o non leggibile
        return []
    return sorted(names)


def reserved_name(name):
    return name.split('.', 1)[0].lower() in RESERVED


def _norm(p):
    return os.path.normcase(str(p))


def write_atomic(target, data):
    """Scrive in un file temporaneo e lo sostituisce, solo dentro BASE."""
    target = Path(target)
    base = BASE.resolve()
    parent = target.parent.resolve()
    if parent != base and base not in parent.parents:
        raise BadRequest('percorso fuori da dev/materiale/banco')
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.name + '.tmp')
    tmp.write_bytes(data)
    os.replace(tmp, target)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        # Su ogni risposta (GET, POST, errori): niente sniffing del tipo e nessun uso da altre origini
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))

    # ---- Host e GET ----
    def _host_ok(self):
        host = (self.headers.get('Host') or '').strip().lower()
        if host.startswith('['):
            name = host[:host.find(']') + 1]
        else:
            name = host.split(':', 1)[0]
        return name in LOCAL_HOSTS

    def _get_allowed(self):
        """True se il file si può servire, False se 404, None per /favicon.ico."""
        path = unquote(urlsplit(self.path).path)
        if '\0' in path or '\\' in path:
            return False
        if path == '/favicon.ico':
            return None
        try:
            real = Path(self.translate_path(self.path)).resolve()
        except (OSError, RuntimeError, ValueError):
            return False
        # Le cartelle non si servono: ne' elenco ne' index.html automatico.
        if not real.is_file():
            return False
        if any(_norm(real) == _norm(f.resolve()) for f in GET_FILES):
            return True
        # Percorso risolto: un collegamento simbolico non può uscire dalle cartelle ammesse.
        return any(_norm(real).startswith(_norm(r.resolve()) + os.sep) for r in GET_ROOTS)

    def _send_photo_list(self, head):
        body = json.dumps(list_photos(), ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def _guarded(self, serve, head=False):
        if not self._host_ok():
            self.close_connection = True
            self._reply(400, {'ok': False, 'error': 'host non ammesso'})
            return
        if urlsplit(self.path).path == FOTO_ELENCO:
            self._send_photo_list(head)
            return
        ok = self._get_allowed()
        if ok is None:
            self.send_response(204)
            self.end_headers()
            return
        if not ok:
            self.send_error(404, 'Not Found')
            return
        serve()

    def do_GET(self):
        self._guarded(super().do_GET)

    def do_HEAD(self):
        self._guarded(super().do_HEAD, head=True)

    # ---- POST ----
    def _reply(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _check_origin(self):
        # Una pagina web qualunque non deve poter scrivere sul banco: Host e Origin
        # devono essere locali, e il Content-Type JSON impedisce l'invio senza preflight.
        if not self._host_ok():
            raise BadRequest('host non ammesso')
        origin = self.headers.get('Origin')
        if origin is not None:
            try:
                h = urlsplit(origin).hostname
            except ValueError:
                h = None
            if h not in ('localhost', '127.0.0.1', '::1'):
                raise BadRequest('origine non ammessa')
        ctype = (self.headers.get('Content-Type') or '').split(';')[0].strip().lower()
        if ctype != 'application/json':
            raise BadRequest('Content-Type deve essere application/json')

    def _read_body(self):
        raw = self.headers.get('Content-Length')
        if raw is None or not (raw.isascii() and raw.isdigit()):
            raise BadRequest('Content-Length mancante o non valido')
        try:
            length = int(raw)
        except ValueError:  # troppe cifre
            raise BadRequest('Content-Length non valido')
        if length > MAX_BODY:
            # Si scarta il corpo (entro un limite) per far arrivare la risposta al client.
            remaining = min(length, MAX_DRAIN)
            while remaining > 0:
                chunk = self.rfile.read(min(65536, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
            self.close_connection = True
            raise BadRequest('corpo oltre 1 MB')
        body = self.rfile.read(length)
        try:
            return json.loads(body.decode('utf-8'), parse_constant=_reject_constant)
        except (UnicodeDecodeError, ValueError, RecursionError):
            raise BadRequest('JSON non valido')

    def do_POST(self):
        try:
            parts = urlsplit(self.path)
            if parts.path == '/save':
                if parts.query:
                    raise BadRequest('parametri non ammessi')
                self._check_origin()
                data = self._read_body()
                validate_ground_truth(data)
                target = GROUND_TRUTH
            elif parts.path == '/save-giudizi':
                if parts.query:
                    raise BadRequest('parametri non ammessi')
                self._check_origin()
                data = validate_giudizi(self._read_body())
                target = GIUDIZI
            elif parts.path == '/save-result':
                try:
                    q = parse_qs(parts.query, keep_blank_values=True, strict_parsing=True)
                except ValueError:
                    raise BadRequest('serve ?name=NOME.json')
                names = q.get('name') or []
                if (list(q.keys()) != ['name'] or len(names) != 1
                        or not RESULT_NAME.fullmatch(names[0]) or reserved_name(names[0])):
                    raise BadRequest('nome del risultato non valido')
                self._check_origin()
                data = self._read_body()
                validate_result(data)
                target = RESULTS / names[0]
            else:
                # Corpo non letto: si chiude la connessione dopo la risposta.
                self.close_connection = True
                raise BadRequest('percorso non ammesso')
            # allow_nan=False: un 1e999 nel risultato darebbe un file JSON non valido.
            out = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False).encode('utf-8')
            write_atomic(target, out)
        except BadRequest as e:
            self.close_connection = True
            self._reply(400, {'ok': False, 'error': str(e)})
            return
        except (ValueError, RecursionError):
            self.close_connection = True
            self._reply(400, {'ok': False, 'error': 'JSON non valido'})
            return
        except OSError as e:
            self._reply(500, {'ok': False, 'error': 'scrittura non riuscita: %s' % e.strerror})
            return
        self._reply(200, {'ok': True, 'file': str(target.relative_to(ROOT)).replace('\\', '/')})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = partial(Handler, directory=str(ROOT))
    server = ThreadingHTTPServer(('127.0.0.1', port), handler)
    print('Banco ScanForge su http://localhost:%d (radice: %s)' % (port, ROOT), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
