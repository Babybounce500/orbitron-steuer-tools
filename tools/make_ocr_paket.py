"""Packt Tesseract.js (lokale Texterkennung) in eine einzige Datei web/vendor/ocr-paket.js, die auch per file:// lädt.
Aufruf: python tools/make_ocr_paket.py <ordner mit tesseract.min.js worker.min.js core-simd.wasm.js deu.traineddata.gz>
Quellen (feste Versionen, cdn.jsdelivr.net/npm): tesseract.js@5.1.1, tesseract.js-core@5.1.1, @tesseract.js-data/deu@1.0.0 (4.0.0_best_int)"""
import base64
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    q = Path(sys.argv[1])
    namen = ["tesseract.min.js", "core-simd.wasm.js", "worker.min.js", "deu.traineddata.gz"]
    daten = {n: (q / n).read_bytes() for n in namen}
    lib = daten["tesseract.min.js"].decode("utf-8")
    # Fehler in 5.1.1: initialize() setzt bei eingebetteten Sprachdaten die Daten statt des Kürzels ein
    worker = daten["worker.min.js"].decode("utf-8")
    fehler = '"string"==typeof t?t:t.data}'
    assert worker.count(fehler) == 1, "worker.min.js hat sich geändert"
    worker = worker.replace(fehler, '"string"==typeof t?t:t.code}')
    paket = ("/* Orbitron OCR-Paket: Tesseract.js 5.1.1 (Apache-2.0), erzeugt von tools/make_ocr_paket.py */\n" + lib +
             "\n;window.ORBITRON_OCR={core:" + json.dumps(daten["core-simd.wasm.js"].decode("utf-8")) +
             ",worker:" + json.dumps(worker) +
             ',deu:"' + base64.b64encode(daten["deu.traineddata.gz"]).decode() + '"};\n')
    ziel = ROOT / "web" / "vendor" / "ocr-paket.js"
    ziel.write_text(paket, encoding="utf-8", newline="\n")
    notiz = ["", "# OCR (ocr-paket.js)", "Tesseract.js 5.1.1 und tesseract.js-core 5.1.1 (Apache-2.0), deutsches Modell @tesseract.js-data/deu 1.0.0.",
             "Eine Korrektur in worker.min.js (Sprachkürzel statt Sprachdaten in initialize), siehe tools/make_ocr_paket.py.",
             "Quelle cdn.jsdelivr.net/npm, sha256 der unveränderten Originale (Anfang):"] + [f"- {n}: {hashlib.sha256(daten[n]).hexdigest()[:16]} ({len(daten[n])} Byte)" for n in namen]
    v = ROOT / "web" / "vendor" / "VENDOR.md"
    text = v.read_text(encoding="utf-8").split("\n# OCR (ocr-paket.js)")[0].rstrip() + "\n"
    v.write_text(text + "\n".join(notiz) + "\n", encoding="utf-8")
    print(ziel, ziel.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
