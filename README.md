# Steuer-Vorbereitung: Starter (Claude Code und Replit, ohne Einrichtung)

Prüft Zahlen für Buchhaltung, Abschluss und Steuererklärung **deterministisch und doppelt gerechnet**. Beispieldaten sind frei erfunden. Keine Steuerberatung, kein Einreichen.

## Claude Code (3 Schritte)
1. Ordner öffnen: `cd steuer-starter && claude`
2. `python3 run_all.py` ausführen lassen (erwartet: "alles grün").
3. `/pruefen` eingeben. Claude führt die Prüfung aus und erklärt jeden Befund.

## Replit (3 Schritte)
1. Neues Repl: **Import** (ZIP hochladen oder GitHub), Sprache egal.
2. **Run** drücken (`.replit` ist vorbereitet, Port 5000).
3. Oberfläche öffnet sich: Beispiel wählen, Engine A gegen Engine B vergleichen. Tests: im Shell-Tab `python3 run_all.py`.

Nur Python (Standardbibliothek) und Node ohne Pakete. Keine `pip install`, kein `npm install`.

## Was du siehst
- **Muster GmbH:** zwölf Prüfungen grün, eine Warnung (offene Annahme).
- **Fehler-Injektion:** vier absichtliche Fehler werden gefunden (Cent-Abweichung zwischen Beschluss und E-Bilanz, vergessene Gesellschafterzahlung, falsche PLZ, IBAN-Zahlendreher).
- **Zwei Rechenwege:** Python `Decimal` und JavaScript `BigInt`. Weichen sie ab, steht "✗ prüfen".

## Mit echten Daten arbeiten
Nie im Repo. Lege pro Fall einen Ordner **außerhalb** an (`cases/<kürzel>/`), anonymisiere vor jeder KI-Nutzung (`/anonym-check`), arbeite mit `facts.json` und `journal.csv` im Format der Beispiele. Mapping der Pseudonyme bleibt lokal.

## Inhalt
`engine/` Rechen- und Prüflogik · `web/` Oberfläche + Engine B · `tools/` Fixtures, Fristen · `fixtures/` Beispieldaten · `tests/` Tests · `docs/` Review und Pläne · `.claude/` Befehle und Schutzregeln · `CLAUDE.md` und `replit.md` Regeln für die KI.

## Die Werkzeuge (Oberfläche)
Alle Seiten teilen ein Design (`web/app.css`, Kopfzeile `web/shell.js`), sind für Handy und Desktop gebaut und laufen offline.
- **Start** (`web/index.html`): Ablauf in fünf Schritten, Datenschutz-Hinweise.
- **Anonymisieren** (`web/extractor.html`, Logik in `extractor-core.js`, Oberfläche in `extractor-ui.js`): PDF ziehen, automatische Auswertung, Kennzahlen (Buchungen, Summencheck auf den Cent, Restrisiko), Namen als Chips ergänzen, anonymisierter Text mit markierten Platzhaltern, Namens-Kandidaten zum Anklicken, Freigabe, Kopieren/Speichern, Rückübersetzung der KI-Antwort (auch mit gespeicherter Zuordnung). Formate: Qonto, Revolut, deutsche Auszüge; andere Dokumente werden nur anonymisiert.
- **Rechner** (`web/rechner.html`, `geldmodus.js`, `rechner-ui.js`, `calculator-engine.js`): Reiter Geld (exakte Bruchrechnung, netto, USt, Zins act/365, AfA, runde, Σ) und Wissenschaft. Live-Ergebnis, Protokoll mit CSV, Hinweis bei Tausenderpunkt.
- **Auswerten** (`web/agent.html`, `agent-core.js`, `agent-ui.js`): KI-Agent mit Gemini 3.5 Flash-Lite über den eigenen Proxy. Online, nur nach Freigabe (Details unten).
- **E-Rechnung** (`web/erechnung.html`, `erechnung-core.js`, `erechnung-ui.js`): XRechnung 3.0 (UBL) aus einem Formular, Beträge als BigInt, 19 %, 7 %, steuerfrei und Reverse Charge, lesbare Druckansicht, Firmenprofil als Datei. Offline. Nicht abgedeckt: ZUGFeRD, Gutschrift/Storno, Rabatte, Anzahlungen, andere Währungen. Prüfung am 26.11.2026 mit dem KoSIT-Validator 1.6.3 (Konfiguration XRechnung 3.0.2 vom 31.08.2026): sechs erfundene Beispielfälle aus `tests/erechnung-faelle.mjs` akzeptiert; nach Änderungen am XML erneut prüfen (`ERECHNUNG_AUSGABE=<Ordner> node --test tests/erechnung.test.mjs`).
- Entwickler-Ansicht: `web/pruefbericht.html` (Prüfregeln, zwei Rechenwege).

Grenzen: Namen werden mit Regeln erkannt (Rollen, Briefkopf, Rechtsform, Vornamenliste), nicht mit KI. Eigene Aliasnamen musst du eintragen, Verträge solltest du nach dem Anonymisieren selbst lesen. Scans ohne Textebene werden nicht gelesen.

## Für Kunden ohne Python und Node: `dist/`
`dist/index.html` per Doppelklick öffnen (Edge/Chrome/Firefox). Einzeldateien mit allem eingebettet, ohne Installation und ohne Internet (Sicherheitsrichtlinie sperrt Netzwerkzugriffe):
`index.html`, `Orbitron-Extractor.html`, `Orbitron-Rechner.html`, `Orbitron-Agent.html`, `Orbitron-ERechnung.html`. (`Orbitron-Geldrechner.html` und `Orbitron-Taschenrechner.html` leiten auf den Rechner weiter.)
Neu bauen: `python tools/build_dist.py`. Browser-Test mit echtem PDF: `python tests/e2e_browser.py`.
Lokaler Leck-Test auf eigenen PDFs: `python tools/real_docs_check.py --wahrheit wahrheit.json --out bericht.json datei.pdf ...` (Begriffsliste bleibt lokal, nicht ins Repo).
Python/Node für die Entwicklung liegen portabel in `runtime/` (nur lokal, nicht im ZIP, 125 MB); `start.cmd` nutzt sie automatisch.

## ELSTER-Leitfaden
`docs/elster/` enthält den KI-Leitfaden für Mein ELSTER und den Startprompt (nicht im öffentlichen Repo). `docs/01_REVIEW_*` enthält Zahlen des Ursprungsfalls und darf nicht an Kunden weitergegeben werden.

## KI-Agent „Auswerten“
- Übergabe aus „Anonymisieren“ (Knopf „Mit KI auswerten“), CSV/TXT laden, Text einfügen oder Beispieldaten.
- Gesendet wird nur der angezeigte Text, erst nach Haken. IBAN, E-Mail oder erkennbare Namen sperren das Senden.
- Buchungen: eindeutige Fälle ordnen lokale Regeln ein, den Rest das Modell (je 40 Zeilen). Danach ruft das Modell lokale Werkzeuge auf (Summen, Auffälligkeiten, Buchungen, Rechner, offene Fragen). Alle Summen rechnet der Code; Beträge im KI-Text werden gegen berechnete Werte geprüft. Kategorien sind von Hand änderbar.
- Dokumente: Eckdaten als JSON; „belegt“ heißt, die Belegstelle steht wörtlich im Text.
- Die Prüfung stellt fest, ob ein Betrag existiert bzw. im Text steht, nicht ob die KI ihn richtig deutet.
- Netz: nur `https://glow-up-gemini.replit.app` (Content-Security-Policy). Konstanten `MODELL` und `PROXY` in `agent-core.js`, die Build-Adresse in `tools/build_dist.py`.
- **Vor dem Einsatz mit echten Daten:** Proxy absichern (derzeit ohne Anmeldung nutzbar), bezahlten Gemini-Schlüssel sicherstellen, Auftragsverarbeitung mit Google und Replit klären.
- Tests: `tests/agent.test.mjs` (nachgestelltes Modell) und Abschnitt „Auswerten“ in `tests/e2e_browser.py`.

## Texterkennung (OCR)
- Anonymisieren und Auswerten lesen PDF (auch gescannte Seiten), PNG, JPG, WEBP und per Strg+V eingefügte Screenshots.
- Die Erkennung läuft lokal im Browser (Tesseract.js, deutsches Modell, `web/vendor/ocr-paket.js`, erzeugt mit `tools/make_ocr_paket.py`). Bilder werden nicht gesendet; an die KI geht nur freigegebener, anonymisierter Text.
- Die Datei `ocr-paket.js` (rund 6 MB) muss neben den HTML-Seiten liegen; sie lädt erst, wenn ein Bild oder Scan erkannt werden muss.
- Erkennungsfehler sind möglich. Bei Kontoauszügen deckt der Summencheck viele auf; Namen mit Lesefehlern kann die Anonymisierung übersehen. Höchstens 30 Bildseiten je PDF.
- Tests: `tests/e2e_browser.py` (Screenshot hell/dunkel, Scan-PDF), Testbilder aus `tools/make_testpdf.py`.
