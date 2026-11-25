"""Lokaler Leck-Test: lässt dist/Orbitron-Extractor.html (Edge/Chrome) über echte PDFs laufen und sucht in der
anonymisierten Ausgabe nach bekannten sensiblen Begriffen. Nichts wird hochgeladen; der Bericht enthält nur Trefferzahlen.

  python tools/real_docs_check.py --wahrheit wahrheit.json --out bericht.json  datei1.pdf datei2.pdf ...
wahrheit.json: {"begriffe": ["Nachname", "Straße 12", ...], "namen": ["Vorname Nachname"]}  (bleibt lokal, nicht ins Repo!)
"""
import argparse
import http.server
import json
import re
import subprocess
import sys
import shutil
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
class TempDir:
    """Temporäres Verzeichnis; Browser-Profildateien sind unter Windows oft noch gesperrt, Fehler beim Löschen sind egal."""
    def __enter__(self):
        self.p = tempfile.mkdtemp()
        return self.p

    def __exit__(self, *a):
        shutil.rmtree(self.p, ignore_errors=True)


BROWSER = [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
           r"C:\Program Files\Google\Chrome\Application\chrome.exe"]

TEST_JS = """
{
  const base = '%(base)s';
  (async () => {
    const liste = await (await fetch(base + '/list')).json();
    for (let i = 0; i < liste.length; i++) {
      const res = { i, name: liste[i] };
      try {
        const buf = await (await fetch(base + '/pdf/' + i)).arrayBuffer();
        const t0 = performance.now();
        const typ = /pdf$/i.test(liste[i]) ? 'application/pdf' : 'image/png';
        const gelesen = await L.liesDateien([new File([buf], liste[i], { type: typ })], K.gruppiereZeilen);
        const zeilen = gelesen.text.split('\\n').filter(Boolean); res.ocr = gelesen.ocr;
        const roh = zeilen.join('\\n');
        const rows = K.parseBuchungen(zeilen);
        const sc = K.summencheck(rows, K.findeSalden(zeilen));
        const an = K.pseudonymisiere(roh, { eigeneNamen: %(eigene)s });
        const rest = K.restrisiko(an.text);
        res.zeilen = zeilen.length; res.zeichen = roh.length; res.buchungen = rows.length; res.quote = K.qualitaet(zeilen, rows);
        res.summencheck = sc.status; res.abw = sc.abweichung == null ? null : String(sc.abweichung);
        res.gelernt = an.gelernt.length; res.platzhalter = Object.keys(an.tabelle).length; res.rest = rest.stufe; res.moegliche = rest.moeglicheNamen.length;
        res.ms = Math.round(performance.now() - t0); res.anon = an.text; res.roh = roh;
      } catch (e) { res.fehler = String(e && e.message || e); }
      await fetch(base + '/result', { method: 'POST', body: JSON.stringify(res) });
    }
    await fetch(base + '/fertig', { method: 'POST', body: '1' });
  })();
}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wahrheit", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--eigene", default="", help="Eigene Namen, durch | getrennt (wie im Eingabefeld)")
    ap.add_argument("dateien", nargs="+")
    a = ap.parse_args()
    wahrheit = json.loads(Path(a.wahrheit).read_text(encoding="utf-8"))
    dateien = [Path(d) for d in a.dateien]
    browser = next((b for b in BROWSER if Path(b).exists()), None)
    if not browser:
        sys.exit("Kein Edge/Chrome")
    ergebnisse, fertig = [], threading.Event()

    class H(http.server.BaseHTTPRequestHandler):
        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "*")

        def do_OPTIONS(self):
            self.send_response(204); self._cors(); self.end_headers()

        def do_GET(self):
            if self.path == "/list":
                body = json.dumps([d.name for d in dateien]).encode()
            else:
                body = dateien[int(self.path.rsplit("/", 1)[1])].read_bytes()
            self.send_response(200); self._cors(); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

        def do_POST(self):
            n = self.rfile.read(int(self.headers["Content-Length"])).decode("utf-8")
            if self.path == "/result":
                ergebnisse.append(json.loads(n))
            else:
                fertig.set()
            self.send_response(204); self._cors(); self.end_headers()

        def log_message(self, *x):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    html = (ROOT / "dist" / "Orbitron-Extractor.html").read_text(encoding="utf-8")
    html = html.replace("connect-src ", f"connect-src {base} ", 1)
    eigene = json.dumps([x for x in a.eigene.split("|") if x])
    html = html.replace("</body>", "<script>\n" + TEST_JS % {"base": base, "eigene": eigene} + "\n</script></body>")
    with TempDir() as t:
        p = Path(t) / "t.html"
        p.write_text(html, encoding="utf-8")
        shutil.copyfile(ROOT / "dist" / "ocr-paket.js", Path(t) / "ocr-paket.js")
        proc = subprocess.Popen([browser, "--headless", "--disable-gpu", f"--user-data-dir={t}/profil", p.as_uri()],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            ende = time.time() + 60 + 150 * len(dateien)
            while not fertig.is_set() and time.time() < ende:
                time.sleep(0.5)
        finally:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
            srv.shutdown()

    begriffe = [b for b in wahrheit.get("begriffe", []) if b]
    generisch = {
        "IBAN": re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b"),
        "E-Mail": re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"),
        "Telefon": re.compile(r"(?<![\d.,])(?:\+49|0049|0)\s?\(?\d{2,5}\)?[\s/-]?\d{3,}[\d\s/-]{2,}\d(?!\d)"),
        "Geburtsdatum": re.compile(r"geboren(?: am)?\s*\d{2}\.\d{2}\.\d{4}|geb\.\s*\d{2}\.\d{2}\.\d{4}", re.I),
        "PLZ+Ort": re.compile(r"(?<![\d.,])\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+"),
        "11-stellige Nr": re.compile(r"(?<!\d)\d{11}(?!\d)"),
    }
    bericht = []
    for r in sorted(ergebnisse, key=lambda x: x["i"]):
        z = {k: r.get(k) for k in ["name", "fehler", "zeilen", "zeichen", "buchungen", "quote", "summencheck", "abw", "gelernt", "platzhalter", "rest", "moegliche", "ms", "ocr"]}
        if "anon" in r:
            low = r["anon"].lower()
            z["leck_begriffe"] = {b: low.count(b.lower()) for b in begriffe if b.lower() in low}
            z["vorher_begriffe"] = sum(1 for b in begriffe if b.lower() in r["roh"].lower())
            z["leck_generisch"] = {k: len(rx.findall(r["anon"])) for k, rx in generisch.items() if rx.search(r["anon"])}
            z["roh_generisch"] = {k: len(rx.findall(r["roh"])) for k, rx in generisch.items() if rx.search(r["roh"])}
        bericht.append(z)
    Path(a.out).write_text(json.dumps(bericht, ensure_ascii=False, indent=1), encoding="utf-8")
    # Kopie der anonymisierten Texte für die manuelle Stichprobe (lokal)
    anon_dir = Path(a.out).with_suffix("")
    anon_dir.mkdir(exist_ok=True)
    for r in ergebnisse:
        if "anon" in r:
            (anon_dir / (Path(r["name"]).stem[:60] + ".anon.txt")).write_text(r["anon"], encoding="utf-8")
            (anon_dir / (Path(r["name"]).stem[:60] + ".roh.txt")).write_text(r["roh"], encoding="utf-8")
    print(len(ergebnisse), "von", len(dateien), "Dateien verarbeitet ->", a.out)


if __name__ == "__main__":
    main()
