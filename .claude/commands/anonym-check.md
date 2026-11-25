---
description: Anonymisierte Extraktion auf übrig gebliebene personenbezogene Daten prüfen
---
Lies **nur** die Datei `$ARGUMENTS` (anonymisierter Text oder CSV). Lies nichts aus `cases/`.

Suche und gib **nur Zeilennummern und die Art des Fundes** zurück, nie den gefundenen Wert selbst:
- Klarnamen (auch Vornamen in Verwendungszwecken, "Rückzahlung an ...")
- IBAN, BIC, Kontonummern, Kartennummern
- Adressen, PLZ mit Ort, Telefonnummern, E-Mail
- Steuer-ID, Steuernummer, USt-IdNr., Geburtsdaten
- Auffällig lange Freitexte (über 60 Zeichen) und Rechnungsnummern mit Personenbezug

Am Ende: **Freigabe nur, wenn 0 Funde.** Sonst die Datei nicht weiterverarbeiten, sondern manuell nachschwärzen lassen.
