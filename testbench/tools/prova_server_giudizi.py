#!/usr/bin/env python3
"""Prova di POST /save-giudizi con richieste grezze, da lanciare SOLO su un'istanza di prova.

Uso: python testbench/tools/prova_server_giudizi.py PORTA RADICE
  PORTA   porta dell'istanza di prova (non quella normale, 8765)
  RADICE  radice dell'istanza (la cartella che contiene dev/materiale/banco/): serve a
          controllare che il file sia stato scritto e che fuori dal banco non cambi nulla.
Il programma rifiuta la porta 8765 e una radice che coincide con il repository.
"""
import http.client
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def raw(port, path, body, headers=None, method='POST'):
    h = {'Host': '127.0.0.1:%d' % port, 'Content-Type': 'application/json'}
    if headers:
        h.update(headers)
    h = {k: v for k, v in h.items() if v is not None}
    c = http.client.HTTPConnection('127.0.0.1', port, timeout=10)
    c.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
    data = body if isinstance(body, bytes) else json.dumps(body).encode('utf-8')
    for k, v in h.items():
        c.putheader(k, v)
    c.putheader('Content-Length', str(len(data)))
    c.endheaders(data)
    r = c.getresponse()
    out = r.status, r.read().decode('utf-8', 'replace')
    c.close()
    return out


def snapshot(root):
    """Elenco (percorso, dimensione, data) dei file della radice, esclusi giudizi.json e i .log."""
    snap = {}
    for p in Path(root).rglob('*'):
        if p.is_file() and p.name != 'giudizi.json' and p.suffix != '.log':
            st = p.stat()
            snap[str(p)] = (st.st_size, st.st_mtime_ns)
    return snap


def main():
    port, root = int(sys.argv[1]), Path(sys.argv[2]).resolve()
    if port == 8765 or root == REPO:
        sys.exit('rifiutato: usare un\'istanza di prova')
    target = root / 'dev' / 'materiale' / 'banco' / 'giudizi.json'
    if target.exists():
        target.unlink()
    before = snapshot(root)
    ok = {'giudizi': [
        {'file': 'a.jpg', 'modo': 'colori', 'voto': 'ok'},
        {'file': 'a.jpg', 'modo': 'grigi', 'voto': 'no', 'nota': 'troppo scura'},
        {'file': 'b.png', 'modo': 'originale', 'voto': 'ok', 'nota': ''},
    ]}
    fails = []

    def check(nome, got, want, extra=None):
        good = got[0] == want and (extra is None or extra(got))
        print(('OK   ' if good else 'FAIL ') + nome + ' -> ' + str(got[0]) + ' ' + got[1][:90])
        if not good:
            fails.append(nome)

    check('forma valida', raw(port, '/save-giudizi', ok), 200)
    check('file creato', (200 if target.is_file() else 0, ''), 200)
    saved = json.loads(target.read_text(encoding='utf-8'))
    check('contenuto', (200 if saved == {'giudizi': [
        {'file': 'a.jpg', 'modo': 'colori', 'voto': 'ok'},
        {'file': 'a.jpg', 'modo': 'grigi', 'voto': 'no', 'nota': 'troppo scura'},
        {'file': 'b.png', 'modo': 'originale', 'voto': 'ok'}]} else 0, ''), 200)
    check('lista vuota', raw(port, '/save-giudizi', {'giudizi': []}), 200)

    def one(**kw):
        g = {'file': 'a.jpg', 'modo': 'colori', 'voto': 'ok'}
        g.update(kw)
        return {'giudizi': [g]}

    check('voto forse', raw(port, '/save-giudizi', one(voto='forse')), 400)
    check('modo xx', raw(port, '/save-giudizi', one(modo='xx')), 400)
    check('nota 500', raw(port, '/save-giudizi', one(nota='x' * 500)), 200)
    check('nota 501', raw(port, '/save-giudizi', one(nota='x' * 501)), 400)
    check('nota non testo', raw(port, '/save-giudizi', one(nota=5)), 400)
    check('file ../x', raw(port, '/save-giudizi', one(file='../x')), 400)
    check('file con barra', raw(port, '/save-giudizi', one(file='a/b.jpg')), 400)
    check('file con barra inversa', raw(port, '/save-giudizi', one(file='a\\b.jpg')), 400)
    check('file vuoto', raw(port, '/save-giudizi', one(file='')), 400)
    check('file nascosto', raw(port, '/save-giudizi', one(file='.x.jpg')), 400)
    check('campo in piu', raw(port, '/save-giudizi', one(extra=1)), 400)
    check('giudizio doppio', raw(port, '/save-giudizi', {'giudizi': one()['giudizi'] * 2}), 400)
    check('giudizi non lista', raw(port, '/save-giudizi', {'giudizi': {}}), 400)
    check('radice non oggetto', raw(port, '/save-giudizi', []), 400)
    check('chiave in piu', raw(port, '/save-giudizi', {'giudizi': [], 'x': 1}), 400)
    big = b'{"giudizi":[],"x":"' + b'a' * int(1.2 * 1024 * 1024) + b'"}'
    check('corpo 1,2 MB', raw(port, '/save-giudizi', big), 400)
    check('Host non locale', raw(port, '/save-giudizi', ok, {'Host': 'example.com'}), 400)
    check('Origin non locale', raw(port, '/save-giudizi', ok, {'Origin': 'http://example.com'}), 400)
    check('Content-Type errato', raw(port, '/save-giudizi', ok, {'Content-Type': 'text/plain'}), 400)
    check('JSON non valido', raw(port, '/save-giudizi', b'{"giudizi": ['), 400)
    check('NaN', raw(port, '/save-giudizi', b'{"giudizi": [], "n": NaN}'), 400)
    check('con parametri', raw(port, '/save-giudizi?x=1', ok), 400)
    check('GET non e un POST', raw(port, '/save-giudizi', b'', method='GET'), 404)

    # Dopo le prove sbagliate il file deve essere ancora quello dell'ultimo salvataggio valido (nota di 500).
    last = json.loads(target.read_text(encoding='utf-8'))
    check('file dopo i rifiuti', (200 if len(last['giudizi']) == 1 and len(last['giudizi'][0].get('nota', '')) == 500 else 0, ''), 200)
    check('nessun .tmp rimasto', (200 if not list(root.rglob('*.tmp')) else 0, ''), 200)
    after = snapshot(root)
    check('nulla di altro modificato', (200 if before == after else 0, ''), 200)

    print('\nFALLITE: %s' % fails if fails else '\nTutte le prove sono riuscite.')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
