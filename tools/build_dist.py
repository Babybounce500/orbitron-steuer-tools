"""Baut dist/: Einzeldateien für Kunden, per Doppelklick offen (file://), ohne Python/Node, ohne Internet.
Aufruf: python tools/build_dist.py"""
import base64
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB, DIST = ROOT / "web", ROOT / "dist"
CSP = ("default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; "
       "worker-src blob:; img-src data: blob:; font-src data:")
# Seiten mit Texterkennung: ocr-paket.js aus demselben Ordner, WebAssembly, nur data:/blob: als Verbindungen (kein Netz)
CSP_OCR = ("default-src 'none'; script-src 'self' file: 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; "
           "worker-src blob:; img-src data: blob:; font-src data:; connect-src data: blob:")
LINKS = {"start": "index.html", "extractor": "Orbitron-Extractor.html", "rechner": "Orbitron-Rechner.html", "agent": "Orbitron-Agent.html", "erechnung": "Orbitron-ERechnung.html"}
PROXY = "https://glow-up-gemini.replit.app"  # einzige Adresse, mit der die Agent-Seite sprechen darf


def lies(p):
    return Path(p).read_text(encoding="utf-8")


def iife(quelle, name):
    """ES-Modul -> klassisches Skript: const NAME = (() => {...; return {...}})();"""
    namen = re.findall(r"^export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)", quelle, re.M)
    koerper = re.sub(r"^export\s+", "", quelle, flags=re.M)
    return f"const {name} = (() => {{\n{koerper}\nreturn {{ {', '.join(namen)} }};\n}})();"


def skript(code):
    return "<script>\n" + code.replace("</script", "<\\/script") + "\n</script>"


def ohne_import(code):
    out = re.sub(r"^import .*?;\s*\n", "", code, flags=re.M)
    assert not re.search(r"^import ", out, re.M), "Import übrig"
    return out


def seite(name, ersetzungen=None):
    """Gemeinsame Umwandlung: CSS und Kopfzeile einbetten, CSP setzen, Links auf die Einzeldateien richten."""
    h = lies(WEB / name)
    h = re.sub(r'(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")', lambda m: m.group(1) + CSP + m.group(2), h)
    h = h.replace('<link rel="stylesheet" href="app.css">', "<style>\n" + lies(WEB / "app.css") + "\n</style>")
    links = "window.ORBITRON_LINKS = " + str(LINKS).replace("'", '"') + ";"
    h = h.replace('<script src="shell.js"></script>', skript(links + "\n" + lies(WEB / "shell.js")))
    h = h.replace('href="extractor.html"', f'href="{LINKS["extractor"]}"').replace('href="rechner.html"', f'href="{LINKS["rechner"]}"').replace('href="agent.html"', f'href="{LINKS["agent"]}"').replace('href="erechnung.html"', f'href="{LINKS["erechnung"]}"')
    return h


def pdf_und_ocr(h):
    """pdf.js samt Worker einbetten; das große OCR-Paket bleibt eine eigene Datei daneben und lädt nur bei Bedarf."""
    pdfjs = lies(WEB / "vendor" / "pdf.min.js")
    worker = base64.b64encode((WEB / "vendor" / "pdf.worker.min.js").read_bytes()).decode()
    return h.replace('<script src="vendor/pdf.min.js"></script>', skript('window.ORBITRON_OCR_URL = "ocr-paket.js";') + "\n" + skript(pdfjs) + "\n" + skript(f'const PDF_WORKER_B64 = "{worker}";'))


WORKER_ZEILE = 'pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";'
WORKER_NEU = 'pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([Uint8Array.from(atob(PDF_WORKER_B64), (c) => c.charCodeAt(0))], { type: "text/javascript" })));'


def module(*paare):
    return "\n".join(skript(iife(lies(WEB / q), n)) for q, n in paare)


def mit_ui(name):
    ui = ohne_import(lies(WEB / name))
    assert WORKER_ZEILE in ui, name
    return ui.replace(WORKER_ZEILE, WORKER_NEU)


def extractor():
    h = pdf_und_ocr(seite("extractor.html").replace(CSP, CSP_OCR))
    return h.replace('<script type="module" src="extractor-ui.js"></script>',
                     module(("extractor-core.js", "K"), ("leser.js", "L")) + "\n" + skript(mit_ui("extractor-ui.js")))


def rechner():
    h = seite("rechner.html")
    h = h.replace('<script src="calculator-engine.js"></script>', skript(lies(WEB / "calculator-engine.js")))
    h = h.replace('<script type="module" src="rechner-ui.js"></script>',
                  skript(iife(lies(WEB / "geldmodus.js"), "G")) + "\n" + skript(ohne_import(lies(WEB / "rechner-ui.js"))))
    return h


def agent():
    h = pdf_und_ocr(seite("agent.html").replace(CSP, CSP_OCR.replace("connect-src ", f"connect-src {PROXY} ")))
    return h.replace('<script type="module" src="agent-ui.js"></script>',
                     module(("extractor-core.js", "K"), ("geldmodus.js", "G"), ("agent-core.js", "A"), ("leser.js", "L")) + "\n" + skript(mit_ui("agent-ui.js")))


def erechnung():
    h = seite("erechnung.html")
    return h.replace('<script type="module" src="erechnung-ui.js"></script>',
                     module(("erechnung-core.js", "E")) + "\n" + skript("const { EINHEITEN, STEUERFAELLE, RC_HINWEIS, rechne, pruefe, xrechnung, dateiname, deutsch, datumDe } = E;\n" + ohne_import(lies(WEB / "erechnung-ui.js"))))


def start():
    return seite("index.html")


def weiterleitung(ziel):
    return (f'<!doctype html><html lang="de"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url={ziel}">'
            f'<title>Weiterleitung</title><a href="{ziel}">Weiter zum Rechner</a></html>')


def main():
    DIST.mkdir(exist_ok=True)
    for alt in ("Orbitron-Geldrechner.html", "Orbitron-Taschenrechner.html"):
        (DIST / alt).unlink(missing_ok=True)
    dateien = {"index.html": start, "Orbitron-Extractor.html": extractor, "Orbitron-Rechner.html": rechner, "Orbitron-Agent.html": agent, "Orbitron-ERechnung.html": erechnung}
    for name, f in dateien.items():
        (DIST / name).write_text(f(), encoding="utf-8")
        print(name, (DIST / name).stat().st_size // 1024, "KB")
    shutil.copyfile(WEB / "vendor" / "ocr-paket.js", DIST / "ocr-paket.js")
    # alte Adressen weiter nutzbar
    (DIST / "Orbitron-Geldrechner.html").write_text(weiterleitung("Orbitron-Rechner.html#geld"), encoding="utf-8")
    (DIST / "Orbitron-Taschenrechner.html").write_text(weiterleitung("Orbitron-Rechner.html#wiss"), encoding="utf-8")


if __name__ == "__main__":
    main()
