# CLAUDE.md: Steuer-Vorbereitung (Buchhaltung und Steuererklärung, Sichtung der Zahlen)

Dieses Projekt bereitet Zahlen für Buchhaltung, Jahresabschluss und Steuererklärungen auf und **prüft sie deterministisch**. Es berät nicht, reicht nichts ein und ersetzt keinen Steuerberater. Der **Kunde** sendet selbst in Mein ELSTER ab und verantwortet den Inhalt.

## Start in 30 Sekunden
```sh
python3 run_all.py     # Fixtures, Prüfberichte, 11 Python-Tests, Node-Tests. Erwartet: "alles grün"
python3 serve.py       # Oberfläche auf http://localhost:5000 (Replit: Run-Knopf)
```
Slash-Befehle (siehe `.claude/commands/`): `/pruefen`, `/maske`, `/bescheid`, `/anonym-check`.

## Verbindliche Regeln
1. **Das Sprachmodell entscheidet nichts Finanzielles.** Zahlen und Prüfergebnisse kommen aus `engine/` mit Regel-ID, Eingabe-Quelle und Rechenbeleg. Du erklärst, strukturierst, fragst nach.
2. **Geld nur in ganzen Cent** (`engine/money.py`, `web/engine_b.js`). Nie `float`/`Number` für Beträge. Rundung kaufmännisch und dokumentiert.
3. **Zwei Rechenwege.** Engine A (Python `Decimal`) und Engine B (BigInt) müssen für jede gemeinsame Prüfung dasselbe Ergebnis liefern. Weicht etwas ab, ist das ein Fehler, kein Rundungsrauschen.
4. **Nichts raten.** Fehlt ein Wert oder ist er unklar, frage nach oder markiere ihn im Annahmenregister (`facts.json`, Feld `annahmen`). Erfinde keine Nummern, IBANs, Beträge oder Daten.
5. **Datenschutz.** Dieses Repo enthält nur erfundene Beispieldaten (`fixtures/`). Echte Mandantendaten liegen **außerhalb** des Repos in `cases/<kürzel>/` und werden nur **anonymisiert** gelesen (`/anonym-check` vorher). Keine Zugangsdaten, Zertifikate, Passwörter, Ausweisdaten.
6. **Quelle der Wahrheit** ist `facts.json` (plus `journal.csv`). Dokumente und Werteblätter werden daraus erzeugt, nicht von Hand gepflegt. Ändere nie dieselbe Zahl an zwei Stellen.
7. **Fristen und Daten:** Nie zurückdatieren. Daten, Fristen und Zahlungen immer mit Quelle (Schreiben, Bescheid) und mit dem Hinweis "am Original prüfen".
8. **Statisch bleiben.** Veröffentlicht wird nur `web/`. Kein Backend, keine externen Skripte oder Schriften, keine Fremd-APIs ohne Rückfrage. Einzige Ausnahme: `web/agent.html` sendet nach Freigabe an den eigenen Proxy (siehe README, Abschnitt KI-Agent); alle anderen Seiten bleiben ohne Netz.
9. **Ehrlich berichten.** Melde einen Test nur als bestanden, wenn du ihn ausgeführt und die Ausgabe gelesen hast. Nenne offene Punkte und Risiken.

## Projektkarte
- `engine/money.py` Cent-Arithmetik, IBAN-Prüfziffer, Vorsteuer je Beleg. `engine/checks.py` Regelkatalog (C01 bis C12). `engine/run_checks.py` Kommandozeile.
- `web/index.html` + `web/engine_b.js` Prüfbericht im Browser mit zweitem Rechenweg. `web/data/` wird von `run_all.py` erzeugt.
- `tools/make_fixtures.py` erzeugt die Beispieldaten. `tools/fristen.py` Einspruchsfrist (Feiertage nicht berücksichtigt).
- `fixtures/muster-gmbh` (sauber, eine offene Annahme) und `fixtures/fehler-injektion` (vier absichtliche Fehler: Cent-Abweichung im Beschluss, falsch kategorisierte Gesellschafterzahlung, PLZ-Abweichung, IBAN-Zahlendreher).
- `docs/` Review, Pläne, Spezifikationen.

## Neue Prüfregel hinzufügen
1. Quelle und Gültigkeitszeitraum notieren (Gesetz, Verwaltungsanweisung, ELSTER-Handbuch).
2. In `engine/checks.py` als `C..` mit Rechenbeleg. Wenn möglich auch in `web/engine_b.js`.
3. Test in `tests/test_engine.py` (grün **und** ein Fehlerfall in `tools/make_fixtures.py`).
4. `python3 run_all.py`. Erst bei "alles grün" fertig.

## Grenzen (nicht versprechen)
Kein Anspruch auf rechtliche Vollständigkeit. Nicht abgedeckt: Zinsen-Zweitrechnung in Engine B, Feiertage, Konsolidierung, Umsatzsteuer-Sonderfälle. Jede neue Steuerart ist ein eigenes Modul mit eigener Quelle.

## Laufzeiten ohne Installation
- Windows: `runtime\python\python.exe` und `runtime\node\node.exe` (portabel, nur Standardbibliothek). `start.cmd` setzt den PATH und startet `run_all.py`; `start.cmd serve.py` startet die Oberfläche.
- Auf diesem Rechner ist `python`/`python3` im PATH nur ein Store-Platzhalter: immer `runtime\python\python.exe` benutzen.
- Fertige Einzeldateien für Kunden (Doppelklick, ohne Python/Node): `dist/`, gebaut mit `python tools/build_dist.py`.
