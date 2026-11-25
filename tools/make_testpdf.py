"""Erzeugt tests/fixtures/kontoauszug-synthetisch.pdf (erfundene Daten) mit Edge/Chrome headless."""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "fixtures" / "kontoauszug-synthetisch.pdf"
BROWSER = [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
           r"C:\Program Files\Google\Chrome\Application\chrome.exe"]

ZEILEN = [
    ("02.01.2025", "Lastschrift Stadtwerke Duesseldorf", "-85,50"),
    ("", "Kundennr 4711", ""),
    ("05.01.2025", "Gehalt Muster Handels GmbH", "+2.500,00"),
    ("15.01.2025", "Miete Wohnung Hauptstrasse 5", "-950,00"),
    ("31.01.2025", "Ueberweisung an Erika Beispiel DE89370400440532013000", "-400,00"),
]
HTML = """<!doctype html><meta charset="utf-8"><style>body{font:12px Arial;margin:30px}td{padding:3px 12px}.r{text-align:right}</style>
<h3>Kontoauszug Januar 2025 (synthetisch, erfundene Daten)</h3>
<div>Kontoinhaber: Max Mustermann</div><div>IBAN DE89 3704 0044 0532 0130 00</div>
<div>E-Mail max@example.de</div><div>Tel. 0211 1234567</div><br>
<table><tr><td>Anfangssaldo</td><td></td><td class="r">1.000,00 &euro;</td></tr>
%s
<tr><td>Endsaldo</td><td></td><td class="r">2.064,50 &euro;</td></tr></table>"""


def main():
    zeilen = "\n".join(f"<tr><td>{d}</td><td>{t}</td><td class='r'>{b}</td></tr>" for d, t, b in ZEILEN)
    br = next((b for b in BROWSER if Path(b).exists()), shutil.which("msedge") or shutil.which("chrome"))
    if not br:
        sys.exit("Kein Edge/Chrome gefunden")
    with tempfile.TemporaryDirectory() as t:
        h = Path(t) / "a.html"
        h.write_text(HTML % zeilen, encoding="utf-8")
        OUT.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([br, "--headless", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={OUT}", h.as_uri()],
                       check=True, timeout=60, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(OUT, OUT.stat().st_size, "Byte")
    # Bildschirmfoto (hell und dunkel) und "Scan": PDF, das nur das Bild enthält
    hell = OUT.with_name("auszug-screenshot.png")
    dunkel = OUT.with_name("auszug-screenshot-dunkel.png")
    scan = OUT.with_name("auszug-scan.pdf")
    stil_hell = "<style>body{font:19px Arial;background:#fff;color:#111}</style>"
    stil_dunkel = "<style>body{font:19px Arial;background:#14181d;color:#e8eaed}</style>"
    with tempfile.TemporaryDirectory() as t:
        for ziel, stil in ((hell, stil_hell), (dunkel, stil_dunkel)):
            h = Path(t) / (ziel.stem + ".html")
            h.write_text(HTML % zeilen + stil, encoding="utf-8")
            subprocess.run([br, "--headless", "--disable-gpu", "--hide-scrollbars", "--window-size=1000,520", f"--screenshot={ziel}", h.as_uri()],
                           check=True, timeout=60, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        h = Path(t) / "scan.html"
        h.write_text(f"<!doctype html><style>@page{{margin:10mm}}body{{margin:0}}img{{width:100%}}</style><img src='{hell.as_uri()}'>", encoding="utf-8")
        subprocess.run([br, "--headless", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={scan}", h.as_uri()],
                       check=True, timeout=60, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    misch = OUT.with_name("auszug-scan-mit-kopfzeile.pdf")
    with tempfile.TemporaryDirectory() as t:
        h = Path(t) / "misch.html"
        h.write_text(f"<!doctype html><style>@page{{margin:10mm}}body{{margin:0;font:12px Arial}}img{{width:100%}}</style><div>Eingescannt am 03.02.2025, Seite 1 von 1</div><img src='{hell.as_uri()}'>", encoding="utf-8")
        subprocess.run([br, "--headless", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={misch}", h.as_uri()],
                       check=True, timeout=60, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for p in (hell, dunkel, scan, misch):
        print(p, p.stat().st_size, "Byte")


if __name__ == "__main__":
    main()
