---
description: Bescheid oder ELSTER-Vergleich gegen die eigenen Zahlen abgleichen und Fristen setzen
---
Vergleiche den Bescheid bzw. das ELSTER-Vergleichs-PDF (`$ARGUMENTS`, anonymisiert) mit `facts.json`.

1. Liste **Abweichungen** je Position (erklärt gegen festgesetzt, Differenz in Cent).
2. Berechne die **Einspruchsfrist** mit `python3 tools/fristen.py <Aufgabe-Datum>` (vierter Tag nach Aufgabe zur Post, ein Monat). Feiertage sind nicht berücksichtigt, weise darauf hin.
3. Liste **Zahlungen** (Betrag, Fälligkeit, Verwendungszweck) und prüfe jede IBAN mit `engine/money.py:iban_valid`. Erkläre, ob eine **Verrechnung** zwischen Jahren stattgefunden hat oder ausgezahlt wurde.
4. Nenne, ob **ein Einspruch sinnvoll** wäre, formuliere das als Hinweis zur Prüfung durch den Kunden bzw. Steuerberater, nicht als Rat.
