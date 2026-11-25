"""Baut dist/: Einzeldateien für Kunden, per Doppelklick offen (file://), ohne Python/Node, ohne Internet.
Aufruf: python tools/build_dist.py"""
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB, DIST = ROOT / "web", ROOT / "dist"
CSP = ("default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; "
       "worker-src blob:; img-src data: blob:; font-src data:")
LINKS = {"start": "index.html", "extractor": "Orbitron-Extractor.html", "rechner": "Orbitron-Rechner.html", "agent": "Orbitron-Agent.html"}
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
    h = h.replace('href="extractor.html"', f'href="{LINKS["extractor"]}"').replace('href="rechner.html"', f'href="{LINKS["rechner"]}"').replace('href="agent.html"', f'href="{LINKS["agent"]}"')
    return h


def extractor():
    h = seite("extractor.html")
    pdfjs = lies(WEB / "vendor" / "pdf.min.js")
    worker = base64.b64encode((WEB / "vendor" / "pdf.worker.min.js").read_bytes()).decode()
    ui = ohne_import(lies(WEB / "extractor-ui.js"))
    a = 'if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";'
    assert a in ui
    ui = ui.replace(a, 'if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([Uint8Array.from(atob(PDF_WORKER_B64), (c) => c.charCodeAt(0))], { type: "text/javascript" })));')
    h = h.replace('<script src="vendor/pdf.min.js"></script>', skript(pdfjs))
    h = h.replace('<script type="module" src="extractor-ui.js"></script>',
                  skript(f'const PDF_WORKER_B64 = "{worker}";') + "\n" + skript(iife(lies(WEB / "extractor-core.js"), "K")) + "\n" + skript(ui))
    return h


def rechner():
    h = seite("rechner.html")
    h = h.replace('<script src="calculator-engine.js"></script>', skript(lies(WEB / "calculator-engine.js")))
    h = h.replace('<script type="module" src="rechner-ui.js"></script>',
                  skript(iife(lies(WEB / "geldmodus.js"), "G")) + "\n" + skript(ohne_import(lies(WEB / "rechner-ui.js"))))
    return h


def agent():
    h = seite("agent.html")
    h = h.replace(CSP, f"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src {PROXY}")
    module = "\n".join(skript(iife(lies(WEB / q), n)) for q, n in (("extractor-core.js", "K"), ("geldmodus.js", "G"), ("agent-core.js", "A")))
    return h.replace('<script type="module" src="agent-ui.js"></script>', module + "\n" + skript(ohne_import(lies(WEB / "agent-ui.js"))))


def start():
    return seite("index.html")


def weiterleitung(ziel):
    return (f'<!doctype html><html lang="de"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url={ziel}">'
            f'<title>Weiterleitung</title><a href="{ziel}">Weiter zum Rechner</a></html>')


def main():
    DIST.mkdir(exist_ok=True)
    for alt in ("Orbitron-Geldrechner.html", "Orbitron-Taschenrechner.html"):
        (DIST / alt).unlink(missing_ok=True)
    dateien = {"index.html": start, "Orbitron-Extractor.html": extractor, "Orbitron-Rechner.html": rechner, "Orbitron-Agent.html": agent}
    for name, f in dateien.items():
        (DIST / name).write_text(f(), encoding="utf-8")
        print(name, (DIST / name).stat().st_size // 1024, "KB")
    # alte Adressen weiter nutzbar
    (DIST / "Orbitron-Geldrechner.html").write_text(weiterleitung("Orbitron-Rechner.html#geld"), encoding="utf-8")
    (DIST / "Orbitron-Taschenrechner.html").write_text(weiterleitung("Orbitron-Rechner.html#wiss"), encoding="utf-8")


if __name__ == "__main__":
    main()
