# replit.md (Anweisungen für den Replit-Agent)

Lies zuerst `CLAUDE.md`. Es gelten dieselben Regeln. Kurzfassung:

- **Start:** Run-Knopf (`python3 serve.py`, Port 5000). Tests: `python3 run_all.py`. Keine Installation nötig, nur Standardbibliothek (Python) und Node ohne Pakete.
- **Geld nur als ganze Cent.** Python: `engine/money.py`. Browser: `web/engine_b.js` (BigInt). Niemals `float` oder JS-`Number` für Beträge.
- **Zwei Rechenwege:** Engine A (Python) und Engine B (JavaScript) müssen für jede gemeinsame Prüfung identisch sein (`tests/engine_b.test.mjs`).
- **Keine echten Daten.** Nur `fixtures/` (frei erfunden). Echte Mandantendaten gehören nie in dieses Projekt, nie in Prompts, nie in Commits. Keine API-Schlüssel, keine Zugangsdaten.
- **Statisch bleiben.** Veröffentlicht wird nur `web/` (statisches Deployment). Kein Backend, keine Datenbank, keine externen CDNs, keine Fremd-APIs ohne Rückfrage. Einzige Ausnahme: `web/agent.html` spricht nach Freigabe mit dem eigenen Proxy (`glow-up-gemini.replit.app`).
- **Das Ergebnis ist eine Vorbereitung, keine Steuerberatung.** Neue Regeln brauchen Quelle, Gültigkeitszeitraum und einen Test.
- Vor Änderungen den Ist-Stand lesen. Nach Änderungen `python3 run_all.py` ausführen und das Ergebnis wahrheitsgemäß berichten.
