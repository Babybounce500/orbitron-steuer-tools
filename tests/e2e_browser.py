"""Browser-Test der fertigen Einzeldateien in dist/ (file://, wie beim Kunden) mit Edge/Chrome headless.
Aufruf: python tests/e2e_browser.py   (braucht Edge oder Chrome, sonst übersprungen mit Exit 0)"""
import base64
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
PDF = ROOT / "tests" / "fixtures" / "kontoauszug-synthetisch.pdf"
class TempDir:
    """Temporäres Verzeichnis; Browser-Profildateien sind unter Windows oft noch gesperrt, Fehler beim Löschen sind egal."""
    def __enter__(self):
        self.p = tempfile.mkdtemp()
        return self.p

    def __exit__(self, *a):
        shutil.rmtree(self.p, ignore_errors=True)


BROWSER = [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
           r"C:\Program Files\Google\Chrome\Application\chrome.exe"]

EXTRACTOR_TEST = """
var out = {};
window.addEventListener('error', (e) => { out.jsError = String(e.message); });
const $ = (i) => document.getElementById(i);
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  try {
    const bin = Uint8Array.from(atob('%s'), (c) => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bin], 'x.pdf', { type: 'application/pdf' }));
    $('pdf').files = dt.files; $('pdf').dispatchEvent(new Event('change'));
    for (let i = 0; i < 100 && $('ergebnis').hidden; i++) await warte(100);
    out.status = $('stat').textContent; out.rohLen = $('roh').value.length; out.sichtbar = !$('ergebnis').hidden;
    out.kpi = $('kpi').textContent; out.zeilen = $('tab').rows.length - 1; out.anon = $('anon').textContent;
    out.gelernt = $('gelernt').textContent; out.phSpans = $('anon').querySelectorAll('.ph').length;
    out.schritt = document.querySelector('#steps li.on').dataset.s;
    // eigener Name per Chip, Ergebnis wird automatisch neu berechnet
    $('namenIn').value = 'Max Mustermann, Muster Handels GmbH'; $('namenIn').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await warte(700);
    out.chips = $('chips').textContent; out.anon2 = $('anon').textContent;
    out.copyVor = $('e-copy').disabled; $('frei').checked = true; $('frei').dispatchEvent(new Event('change'));
    out.copyNach = $('e-copy').disabled; out.csvNach = $('e-csv').disabled; out.schritt2 = document.querySelector('#steps li.on').dataset.s;
    $('antwort').value = 'PERSON_01 hat IBAN_01 genutzt'; $('reid').click(); out.reid = $('klar').textContent;
  } catch (e) { out.fehler = String(e && e.stack || e); }
  const p = document.createElement('pre'); p.id = 'e2e'; p.textContent = JSON.stringify(out); document.body.appendChild(p);
})();
"""
RECHNER_TEST = """
var out = {};
const $ = (i) => document.getElementById(i);
const taste = (t) => Array.from(document.querySelectorAll('#keys button')).find((b) => b.textContent === t);
const eingabe = (s) => { $('expr').value = s; $('expr').dispatchEvent(new Event('input')); return $('res').textContent; };
(async () => {
try {
  out.start = $('res').textContent;
  out.summe = eingabe('0,1+0,2'); out.mwst = eingabe('1.234.567,89*0,19'); out.netto = eingabe('netto(119;19)'); out.proz = eingabe('100+10%');
  out.tausend = eingabe('1.000+1'); out.tausendHint = $('hint').textContent;
  eingabe('1/0'); taste('=').click(); out.fehler = $('res').textContent; out.fehlerKlasse = $('res').className;
  eingabe('2+3'); taste('=').click(); out.fuenf = $('res').textContent; out.logAnz = document.querySelectorAll('#log li').length;
  taste('×').click(); out.nachOp = $('expr').value;
  eingabe('2+3'); taste('=').click(); taste('7').click(); out.neu = $('expr').value;
  eingabe('2.000,00'); out.gross = $('res').textContent;
  $('m-wiss').click(); out.modus = $('m-wiss').getAttribute('aria-selected'); out.sciTasten = document.querySelectorAll('#sci button').length;
  out.sin = eingabe('sin(30)'); out.komma = eingabe('2,5+1'); out.hintWiss = $('hint').textContent;
  $('m-geld').click(); out.zurueck = $('m-geld').getAttribute('aria-selected');
  out.funcs = document.querySelectorAll('#funcs button').length;
} catch (e) { out.jsFehler = String(e && e.stack || e); }
const p = document.createElement('pre'); p.id = 'e2e'; p.textContent = JSON.stringify(out); document.body.appendChild(p);
})();
"""
STARTSEITE_TEST = """
var out = {};
out.links = Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
out.nav = Array.from(document.querySelectorAll('.nav a')).map((a) => a.textContent);
out.extern = Array.from(document.querySelectorAll('[src],[href]')).map((e) => e.getAttribute('src') || e.getAttribute('href')).filter((u) => /^https?:/.test(u));
const p = document.createElement('pre'); p.id = 'e2e'; p.textContent = JSON.stringify(out); document.body.appendChild(p);
"""


AGENT_TEST = """
var out = { gesendet: [] };
window.addEventListener('error', (e) => { out.jsError = String(e.message); });
const $ = (i) => document.getElementById(i);
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const antwort = (parts) => ({ status: 200, json: { candidates: [{ content: { role: 'model', parts } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } } });
window.ORBITRON_TRANSPORT = async (body) => {
  out.gesendet.push(JSON.stringify(body));
  const namen = body.tools && body.tools[0].functionDeclarations.map((d) => d.name);
  if (namen && namen.includes('kategorien_setzen')) return antwort([{ functionCall: { name: 'kategorien_setzen', args: { zuordnungen: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, kategorie: 'Sonstiges', unsicher: i === 7 })) } } }]);
  if (namen) return antwort([{ functionCall: { name: 'bericht_abschliessen', args: { zusammenfassung: 'Einnahmen 5.285,00 EUR. Erfunden 123.456,78 EUR. <img src=x onerror=alert(1)>', hinweise: [] } } }]);
  return antwort([{ text: JSON.stringify({ dokumenttyp: 'Darlehen', zusammenfassung: 'Darlehen.', daten: [], betraege: [{ betrag: '1.000,00 EUR', bedeutung: 'Summe', zitat: 'Betrag 1.000,00 EUR' }] }) }]);
};
(async () => {
  try {
    out.startAus = $('start').disabled; $('beispiel').click();
    out.vorschau = $('vorschau').textContent.split('\\n').length; out.startOhneHaken = $('start').disabled; out.anfragenVorher = out.gesendet.length;
    $('freigabe').checked = true; $('freigabe').dispatchEvent(new Event('change')); $('start').click();
    for (let i = 0; i < 50 && $('ergebnis').hidden; i++) await warte(100);
    await warte(100);
    out.stoppWeg = getComputedStyle($('stopp')).display === 'none'; out.kpi = $('kpi').textContent; out.ki = $('ki').textContent; out.bilder = $('ki').querySelectorAll('img').length; out.zeilen = $('buchTab').rows.length - 1;
    const sel = $('buchTab').querySelector('select'); sel.value = 'Werbung'; sel.dispatchEvent(new Event('change'));
    out.nachAenderung = $('katTab').textContent; out.hinweisAlt = $('ki').textContent.includes('von Hand geändert');
    // Sperre: Klarname und IBAN dürfen nicht gesendet werden
    const n = out.gesendet.length;
    $('eingabe').value = 'Vertrag. Erika Beispiel, IBAN DE89 3704 0044 0532 0130 00'; $('uebernehmen').click();
    out.sperre = $('sperre').textContent; out.sperrHaken = $('freigabe').disabled; $('start').click(); await warte(200); out.nichtsGesendet = out.gesendet.length === n;
    $('eingabe').value = 'PERSON_01 leiht PERSON_02 den Betrag 1.000,00 EUR.'; $('uebernehmen').click();
    $('freigabe').checked = true; $('freigabe').dispatchEvent(new Event('change')); $('start').click();
    for (let i = 0; i < 50 && $('ergebnis').hidden; i++) await warte(100);
    out.dok = $('dok').textContent; out.badge = document.querySelector('.badge').textContent;
  } catch (e) { out.fehler = String(e && e.stack || e); }
  out.gesendetAnz = out.gesendet.length; delete out.gesendet;
  const p = document.createElement('pre'); p.id = 'e2e'; p.textContent = JSON.stringify(out); document.body.appendChild(p);
})();
"""


OCR_TEST = """
var out = { fehlerListe: [] };
window.addEventListener('error', (e) => out.fehlerListe.push(String(e.message)));
document.addEventListener('securitypolicyviolation', (e) => out.fehlerListe.push('CSP ' + e.violatedDirective + ' ' + e.blockedURI));
const $ = (i) => document.getElementById(i);
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const datei = (b64, name, typ) => new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type: typ });
(async () => {
  try {
    out.faelle = [];
    for (const [b64, name, typ, weg] of %s) {
      const dt = new DataTransfer(); dt.items.add(datei(b64, name, typ));
      $('roh').value = ''; $('ergebnis').hidden = true; $('stat').textContent = '';
      const t0 = performance.now();
      if (weg === 'einfuegen') document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
      else { $('pdf').files = dt.files; $('pdf').dispatchEvent(new Event('change')); }
      for (let i = 0; i < 900 && $('ergebnis').hidden && !$('stat').classList.contains('err'); i++) await warte(100);
      out.faelle.push({ name, sek: Math.round((performance.now() - t0) / 100) / 10, status: $('stat').textContent, kpi: $('kpi').textContent, anon: $('anon').textContent, roh: $('roh').value, warnung: $('ocrWarn').hidden ? '' : $('ocrWarn').textContent });
    }
  } catch (e) { out.fehler = String(e && e.stack || e); }
  const p = document.createElement('pre'); p.id = 'e2e'; p.textContent = JSON.stringify(out); document.body.appendChild(p);
})();
"""
AGENT_OCR_TEST = """
var out = { gesendet: 0 };
const $ = (i) => document.getElementById(i);
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
window.ORBITRON_TRANSPORT = async () => { out.gesendet++; return { status: 500, json: {} }; };
(async () => {
  try {
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob('%s'), (c) => c.charCodeAt(0))], 'a.png', { type: 'image/png' }));
    $('namen').value = 'Max Mustermann, Muster Handels GmbH';
    $('doku').files = dt.files; $('doku').dispatchEvent(new Event('change'));
    for (let i = 0; i < 900 && $('pruefen').hidden && !$('leseStat').classList.contains('err'); i++) await warte(100);
    out.status = $('leseStat').textContent; out.quelle = $('quelle').textContent; out.vorschau = $('vorschau').textContent; out.sperre = $('sperre').textContent; out.start = $('start').disabled;
  } catch (e) { out.fehler = String(e && e.stack || e); }
  const p = document.createElement('pre'); p.id = 'e2e'; p.textContent = JSON.stringify(out); document.body.appendChild(p);
})();
"""


ERECHNUNG_TEST = """
var out = { fehlerJs: [] };
window.addEventListener('error', (e) => { out.fehlerJs.push(String(e.message)); });
document.addEventListener('securitypolicyviolation', (e) => { out.fehlerJs.push('CSP ' + e.violatedDirective); });
const $ = (i) => document.getElementById(i);
const setz = (sel, wert) => { const e = document.querySelector(sel); e.value = wert; e.dispatchEvent(new Event('input', { bubbles: true })); };
(async () => {
try {
  window.confirm = () => true;
  $('xmlSpeichern').click(); out.leerFehler = $('fehler').children.length; out.leerAnsicht = $('ansicht').hidden;
  const v = { name: 'Beispiel Software GmbH', strasse: 'Musterweg 1', plz: '12345', ort: 'Beispielstadt', ustid: 'DE123456789', kontakt: 'Erika Beispiel', telefon: '+49 30 000000', email: 'rechnung@example.org', iban: 'DE89370400440532013000' };
  for (const k in v) setz(`[data-v="${k}"]`, v[k]);
  const k = { name: '<img src=x onerror=alert(1)> AG', strasse: 'Testallee 7', plz: '54321', ort: 'Musterhausen', email: 'eingang@example.com' };
  for (const n in k) setz(`[data-k="${n}"]`, k[n]);
  setz('[data-r="nummer"]', 'TEST-001'); setz('[data-r="referenz"]', 'KUNDE-42'); setz('[data-r="leistungVon"]', '2026-02-28');
  setz('[data-p="text"]', 'Beratung'); setz('[data-p="menge"]', '10'); setz('[data-p="preis"]', '95,00');
  out.summen = $('summen').textContent;
  $('xmlSpeichern').click(); out.fehler = $('fehler').textContent; out.status = $('stat').textContent; out.xml = $('xmlOut').textContent;
  out.blatt = $('blatt').textContent; out.bilder = $('blatt').querySelectorAll('img').length; out.druck = $('drucken').disabled;
  setz('[data-p="preis"]', '96,00'); out.nachAenderung = $('ansicht').hidden && $('drucken').disabled;
  $('posNeu').click(); out.positionen = $('positionen').children.length;
  const s = document.querySelectorAll('[data-p="steuer"]')[1]; s.value = 'frei'; s.dispatchEvent(new Event('change', { bubbles: true })); out.befreiungSichtbar = !$('befreiungFeld').hidden;
} catch (e) { out.jsFehler = String(e && e.stack || e); }
const p = document.createElement('pre'); p.id = 'e2e'; p.textContent = JSON.stringify(out); document.body.appendChild(p);
})();
"""


def lauf(browser, datei, test_js, warte=60):
    """Lädt eine Kopie der Einzeldatei per file:// im Browser, führt test_js aus und holt das Ergebnis (#e2e)
    über einen lokalen Mini-Server ab. Einzige Änderung an der Kopie: connect-src für diesen Server."""
    import http.server
    import threading
    import time
    ergebnis = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            ergebnis["text"] = self.rfile.read(int(self.headers["Content-Length"])).decode("utf-8")
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.end_headers()

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    html = datei.read_text(encoding="utf-8")
    # Seiten mit eigenem connect-src (OCR, Agent) bekommen den Testserver dort ergänzt, sonst gilt nur die erste Angabe
    if "connect-src " in html.split("</head>")[0]:
        html = html.replace("connect-src ", f"connect-src http://127.0.0.1:{port} ", 1)
    else:
        html = html.replace("default-src 'none';", f"default-src 'none'; connect-src http://127.0.0.1:{port};", 1)
    sender = ("setInterval(()=>{const p=document.getElementById('e2e');if(p&&!window.__s){window.__s=1;"
              f"fetch('http://127.0.0.1:{port}/',{{method:'POST',body:p.textContent}});}}}},200);")
    html = html.replace("</body>", "<script>\n{\n" + test_js + "\n}\n" + sender + "\n</script></body>")
    with TempDir() as t:
        p = Path(t) / "t.html"
        p.write_text(html, encoding="utf-8")
        if (DIST / "ocr-paket.js").exists():
            shutil.copyfile(DIST / "ocr-paket.js", Path(t) / "ocr-paket.js")
        proc = subprocess.Popen([browser, "--headless", "--disable-gpu", f"--user-data-dir={t}/profil", "--enable-logging=stderr", "--v=0", p.as_uri()],
                                stdout=subprocess.DEVNULL, stderr=open(Path(t) / "log.txt", "wb"))
        try:
            ende = time.time() + warte
            while "text" not in ergebnis and time.time() < ende:
                time.sleep(0.2)
        finally:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
            srv.shutdown()
            time.sleep(0.5)
            try:
                log = (Path(t) / "log.txt").read_text(encoding="utf-8", errors="replace")
            except OSError:
                log = ""
    if "text" not in ergebnis:
        konsole = " | ".join(l[-300:] for l in log.splitlines() if "CONSOLE" in l)[:1500]
        raise AssertionError("Test lieferte kein Ergebnis " + datei.name + " " + konsole)
    return json.loads(ergebnis["text"])


def pruefe(bed, text):
    if not bed:
        raise AssertionError(text)
    print("  ok:", text)


def main():
    browser = next((b for b in BROWSER if Path(b).exists()), None) or shutil.which("msedge") or shutil.which("chrome")
    if not browser:
        print("Kein Edge/Chrome gefunden: Browser-Test übersprungen")
        return 0
    if not PDF.exists() or not (DIST / "Orbitron-Extractor.html").exists():
        sys.exit("PDF oder dist/ fehlt: erst tools/make_testpdf.py und tools/build_dist.py")
    b64 = base64.b64encode(PDF.read_bytes()).decode()

    print("Startseite:")
    s = lauf(browser, DIST / "index.html", STARTSEITE_TEST)
    pruefe(s["nav"] == ["Start", "Anonymisieren", "Auswerten", "Rechner", "E-Rechnung"], "Menü: " + str(s["nav"]))
    pruefe("Orbitron-Extractor.html" in s["links"] and "Orbitron-Rechner.html" in s["links"], "Links auf die Einzeldateien")
    pruefe(not s["extern"], "keine externen Adressen " + str(s["extern"]))

    print("Anonymisieren (echtes PDF):")
    e = lauf(browser, DIST / "Orbitron-Extractor.html", EXTRACTOR_TEST % b64)
    pruefe("fehler" not in e and "jsError" not in e, "kein Skriptfehler " + str(e.get("fehler", e.get("jsError", ""))))
    pruefe(e["rohLen"] > 100 and e["sichtbar"], f"PDF gelesen ({e['rohLen']} Zeichen) und automatisch ausgewertet")
    pruefe("4 Buchungen" in e["kpi"] and "Summe stimmt auf den Cent" in e["kpi"], "Kennzahlen: 4 Buchungen, Summe stimmt")
    pruefe(e["zeilen"] == 4, f"Buchungstabelle hat 4 Zeilen (gefunden {e['zeilen']})")
    pruefe("Erika Beispiel" in e["gelernt"], "Name ohne Eingabe automatisch erkannt: " + e["gelernt"])
    for verboten in ["Mustermann", "max@example", "DE89", "1234567", "Muster Handels", "Erika", "Beispiel"]:
        pruefe(verboten not in e["anon2"], f"'{verboten}' nicht mehr im anonymisierten Text")
    pruefe("Stadtwerke" in e["anon2"], "Institution (Stadtwerke) bleibt lesbar")
    pruefe(e["phSpans"] >= 4, f"Platzhalter sind markiert ({e['phSpans']})")
    pruefe("Max Mustermann" in e["chips"], "Eigener Name als Chip: " + e["chips"])
    pruefe(e["copyVor"] is True and e["copyNach"] is False and e["csvNach"] is False, "Kopieren/Export erst nach Freigabe")
    pruefe(e["schritt"] == "2" and e["schritt2"] == "3", "Schrittanzeige 2 nach Auswertung, 3 nach Freigabe")
    pruefe("DE89370400440532013000" in e["reid"] and "Max Mustermann" in e["reid"] or "PERSON_01" not in e["reid"], "Rückübersetzung: " + e["reid"])

    print("Rechner:")
    r = lauf(browser, DIST / "Orbitron-Rechner.html", RECHNER_TEST)
    pruefe("jsFehler" not in r, "kein Skriptfehler " + r.get("jsFehler", ""))
    pruefe(r["start"] == "0,00", "Startanzeige " + r["start"])
    pruefe(r["summe"] == "0,30", "0,1+0,2 = " + r["summe"])
    pruefe(r["mwst"] == "234.567,90", "1.234.567,89*0,19 = " + r["mwst"])
    pruefe(r["netto"] == "100,00", "netto(119;19) = " + r["netto"])
    pruefe(r["proz"] == "110,00", "100+10% = " + r["proz"])
    pruefe(r["tausend"] == "1.001,00" and "1000 gelesen" in r["tausendHint"], "Tausenderpunkt-Warnung: " + r["tausendHint"])
    pruefe("durch null" in r["fehler"] and "err" in r["fehlerKlasse"], "Fehler sichtbar: " + r["fehler"])
    pruefe(r["fuenf"] == "5,00" and r["logAnz"] >= 1, "= übernimmt ins Protokoll")
    pruefe(r["nachOp"] == "5,00×", "Operator nach Ergebnis setzt damit fort: " + r["nachOp"])
    pruefe(r["neu"] == "7", "Ziffer nach Ergebnis beginnt neu: " + r["neu"])
    pruefe(r["gross"] == "2.000,00", "Anzeige " + r["gross"])
    pruefe(r["modus"] == "true" and r["sciTasten"] >= 14, "Wissenschaft-Modus mit Zusatztasten")
    pruefe(r["sin"] == "0,5" and r["komma"] == "3,5", f"sin(30)={r['sin']}, 2,5+1={r['komma']}")
    pruefe(r["zurueck"] == "true" and r["funcs"] >= 8, "Zurück zum Geldmodus mit Funktionstasten")
    print("Auswerten (nachgestelltes Modell, kein Netz):")
    g = lauf(browser, DIST / "Orbitron-Agent.html", AGENT_TEST)
    pruefe("fehler" not in g and "jsError" not in g, "kein Skriptfehler " + str(g.get("fehler", g.get("jsError", ""))))
    pruefe(g["startAus"] and g["startOhneHaken"] and g["anfragenVorher"] == 0, "ohne Freigabe wird nichts gesendet")
    pruefe(g["vorschau"] == 12 and g["zeilen"] == 12, "Vorschau und Tabelle zeigen 12 Buchungen")
    pruefe(g["stoppWeg"], "Abbrechen-Knopf ist nach dem Lauf wirklich unsichtbar")
    pruefe("5.285,00" in g["kpi"], "Einnahmen lokal berechnet: " + g["kpi"][:60])
    pruefe("123.456,78" in g["ki"].split("nachrechnen")[-1], "erfundene Zahl wird als nicht nachrechenbar markiert")
    pruefe(g["bilder"] == 0, "KI-Text wird nicht als HTML ausgeführt")
    pruefe("Werbung" in g["nachAenderung"] and g["hinweisAlt"], "Kategorie ändern rechnet neu und markiert KI-Text als alt")
    pruefe("IBAN" in g["sperre"] and g["sperrHaken"] and g["nichtsGesendet"], "Klarname/IBAN sperren das Senden: " + g["sperre"][:90])
    pruefe("belegt" in g["dok"] and "1.000,00" in g["dok"], "Dokument-Modus mit Belegstelle")
    pruefe(g["badge"].startswith("● Online"), "Seite zeigt ehrlich 'Online'")
    print("Texterkennung (lokal, echte Bilder und Scan-PDF):")
    fx = ROOT / "tests" / "fixtures"
    faelle = [[base64.b64encode((fx / n).read_bytes()).decode(), n, typ, weg] for n, typ, weg in
              (("auszug-screenshot.png", "image/png", "einfuegen"), ("auszug-screenshot-dunkel.png", "image/png", "wahl"), ("auszug-scan.pdf", "application/pdf", "wahl"), ("auszug-scan-mit-kopfzeile.pdf", "application/pdf", "wahl"))]
    o = lauf(browser, DIST / "Orbitron-Extractor.html", OCR_TEST % json.dumps(faelle), warte=240)
    pruefe("fehler" not in o and not o["fehlerListe"], "kein Skript- oder CSP-Fehler " + str(o.get("fehler", o["fehlerListe"][:3])))
    for f in o["faelle"]:
        print(f"    {f['name']}: {f['sek']} s")
        pruefe("4 Buchungen" in f["kpi"] and "stimmt auf den Cent" in f["kpi"], f"{f['name']}: 4 Buchungen, Summe stimmt ({f['kpi'][:70] or f['status']})")
        for verboten in ["Mustermann", "max@example", "DE89", "1234567", "Muster Handels", "Erika"]:
            if verboten in f["anon"]:
                raise AssertionError(f"{f['name']}: '{verboten}' noch im anonymisierten Text: {f['anon']}")
        pruefe("Texterkennung" in f["warnung"], f"{f['name']}: Warnhinweis zur Texterkennung, keine Klarnamen")
    g = lauf(browser, DIST / "Orbitron-Agent.html", AGENT_OCR_TEST % faelle[0][0], warte=180)
    pruefe("fehler" not in g and "4 Buchungen" in g.get("quelle", ""), "Agent liest Screenshot selbst: " + g.get("quelle", g.get("fehler", g.get("status", "")))[:100])
    pruefe(not any(v in g["vorschau"] for v in ["Mustermann", "DE89", "Muster Handels", "Erika"]), "Vorschau ist anonymisiert")
    pruefe(g["gesendet"] == 0 and g["start"], "nichts gesendet, Freigabe nötig " + g["sperre"][:80])
    print("E-Rechnung:")
    x = lauf(browser, DIST / "Orbitron-ERechnung.html", ERECHNUNG_TEST)
    pruefe("jsFehler" not in x and not x["fehlerJs"], "kein Skript- oder CSP-Fehler " + str(x.get("jsFehler", x["fehlerJs"][:3])))
    pruefe(x["leerFehler"] > 8 and x["leerAnsicht"], f"leeres Formular zeigt {x['leerFehler']} Pflichtangaben")
    pruefe("1.130,50" in x["summen"], "Summe 950,00 + 19 % = 1.130,50")
    pruefe(not x["fehler"] and "Gespeichert" in x["status"], "gespeichert: " + x["status"] + x["fehler"])
    pruefe('<cbc:PayableAmount currencyID="EUR">1130.50</cbc:PayableAmount>' in x["xml"] and "&lt;img" in x["xml"], "XML mit Betrag, Eingaben maskiert")
    pruefe("Beratung" in x["blatt"] and x["bilder"] == 0 and x["druck"] is False, "lesbare Ansicht, kein HTML aus Eingaben")
    pruefe("false" not in x["blatt"] and "undefined" not in x["blatt"] and "null" not in x["blatt"], "Ansicht ohne Platzhaltertext wie 'false'")
    pruefe(x["nachAenderung"], "Änderung macht alte Ausgabe ungültig")
    pruefe(x["positionen"] == 2 and x["befreiungSichtbar"], "zweite Position, Befreiungsgrund erscheint")
    print("BROWSER-TEST: alles grün")
    return 0


if __name__ == "__main__":
    sys.exit(main())
