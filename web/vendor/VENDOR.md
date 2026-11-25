# Mitgelieferte Fremdbibliothek
pdf.js 2.16.105 (Mozilla), Lizenz Apache-2.0, Quelle cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/
- pdf.min.js (286899 Byte) sha256 beginnt mit 1fc294eefda602e5
- pdf.worker.min.js (1066087 Byte) sha256 beginnt mit 99732130603cd498
Lokal eingebunden, damit der Extractor ohne Internet läuft (CSP connect-src 'none').

# OCR (ocr-paket.js)
Tesseract.js 5.1.1 und tesseract.js-core 5.1.1 (Apache-2.0), deutsches Modell @tesseract.js-data/deu 1.0.0.
Eine Korrektur in worker.min.js (Sprachkürzel statt Sprachdaten in initialize), siehe tools/make_ocr_paket.py.
Quelle cdn.jsdelivr.net/npm, sha256 der unveränderten Originale (Anfang):
- tesseract.min.js: a8e29918d098b2b0 (66695 Byte)
- core-simd.wasm.js: ce20eda9533cbed1 (3938657 Byte)
- worker.min.js: aca1229639fc9907 (123724 Byte)
- deu.traineddata.gz: 306c4280d0cbed46 (1333102 Byte)

Sicherheit: pdf.js 2.16.105 ist von CVE-2024-4367 betroffen, sofern eval erlaubt ist. Deshalb `isEvalSupported: false` in `web/leser.js` und keine Freigabe von `unsafe-eval` in der Sicherheitsrichtlinie. Ein Wechsel auf pdf.js 4.x steht aus.
