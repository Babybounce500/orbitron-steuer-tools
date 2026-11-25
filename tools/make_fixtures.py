"""Erzeugt die synthetischen Beispieldaten (keine echten Personen, Firmen, IBANs).
Aufruf:  python3 tools/make_fixtures.py
Schreibt fixtures/muster-gmbh (alles stimmt, eine Annahme offen) und
fixtures/fehler-injektion (vier absichtliche Fehler)."""
import copy
import csv
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from engine.checks import gesellschafterkonto_erwartet, lade_journal  # noqa: E402
from engine.money import fmt, netto_aus_brutto, to_cents  # noqa: E402

JOURNAL = [  # Datum; Gegenpartei; Verwendungszweck; Betrag; Kategorie
    ("2025-01-15", "Beispiel Rechtsanwaelte", "Honorar Januar", "-1000.00", "Rechtsberatung"),
    ("2025-02-10", "Gesellschafter A", "Rueckzahlung Darlehen", "300.00", "Gesellschafter-Darlehen"),
    ("2025-03-20", "Beispiel Rechtsanwaelte", "Honorar Maerz", "-800.00", "Rechtsberatung"),
    ("2025-06-30", "Gesellschafter A", "Darlehen zu 5 Prozent", "-200.00", "Gesellschafter-Darlehen"),
    ("2025-09-30", "Musterbank", "Kontofuehrung", "-150.00", "Bankgebuehren"),
    ("2025-11-05", "Bueroservice Muster", "Sonstiger Aufwand", "-450.00", "Sonstiges"),
    ("2025-12-31", "Gesellschafter A", "Zinsen Darlehen", "20.00", "Gesellschafter-Zins"),
]
BELEGE = [("119.00", "0.19"), ("238.00", "0.19"), ("59.50", "0.19"), ("357.00", "0.19"),
          ("29.75", "0.19"), ("11.90", "0.19")]


def schreibe_journal(pfad, zeilen):
    with open(pfad, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Datum", "Gegenpartei", "Verwendungszweck", "Betrag", "Kategorie"])
        w.writerows(zeilen)


def baue():
    facts = {
        "stammdaten": {
            "firma": "Muster Beispiel GmbH", "sitz": "Musterstadt", "plz": "12345",
            "steuernummer": "123/456/78901",
            "wirtschaftsjahr": {"von": "2025-01-01", "bis": "2025-12-31"},
            "ibans": ["DE89 3704 0044 0532 0130 00", "DE02 1203 0000 0000 2020 51"],
            "adressen_in_dokumenten": {"beschluss": "12345", "anschreiben": "12345", "bilanz": "12345"},
        },
        "vorjahr": {"verlustvortrag": "0.00", "jahresergebnis": "-3000.00"},
        "eroeffnung": {"verlustvortrag": "-3000.00"},
        "gesellschafterkonto": {"kapital_start": "1000.00", "zinsen_offen_vorjahr": "20.00",
                                "zinssatz": "0.05", "zinsen_gebucht": "0.00", "bilanzposten": "0.00"},
        "bank": {"anfangssaldo": "8000.00", "endsaldo": "0.00"},
        "ust": {"belege": [{"brutto": b, "satz": s} for b, s in BELEGE], "vorsteuer_erklaert": "0.00"},
        "daten": {"verkauf": "2025-11-18", "vertrag_erstellt": "2025-11-19",
                  "ueberweisung": "2025-11-20", "unterschrift": "2025-11-20"},
        "annahmen": [
            {"id": "A1", "text": "Genussrechte als Verbindlichkeit ausgewiesen", "status": "entschieden", "auswirkung": "0.00"},
            {"id": "A2", "text": "Vorauszahlungssoll aus Bankeingaengen abgeleitet", "status": "offen", "auswirkung": "250.00"},
        ],
    }
    journal_pfad = ROOT / "fixtures" / "muster-gmbh" / "journal.csv"
    schreibe_journal(journal_pfad, JOURNAL)
    journal = lade_journal(journal_pfad)
    summe = sum(z["betrag"] for z in journal)
    facts["bank"]["endsaldo"] = fmt_punkt(to_cents(facts["bank"]["anfangssaldo"]) + summe)
    _, zins, posten = gesellschafterkonto_erwartet(facts, journal)
    facts["gesellschafterkonto"]["zinsen_gebucht"] = fmt_punkt(zins)
    facts["gesellschafterkonto"]["bilanzposten"] = fmt_punkt(posten)
    vs = sum(to_cents(b) - netto_aus_brutto(to_cents(b), s) for b, s in BELEGE)
    facts["ust"]["vorsteuer_erklaert"] = fmt_punkt(vs)

    aufwand = {"rechtsberatung": "1800.00", "abschreibung": "1000.00", "bankgebuehren": "150.00", "sonstiges": "450.00"}
    ergebnis = zins - sum(to_cents(v) for v in aufwand.values())
    facts["guv"] = {"ertraege": {"zinsertrag": fmt_punkt(zins)}, "aufwand": aufwand}
    aktiva = {"software": "4000.00", "forderung_gesellschafter": fmt_punkt(posten),
              "bank": facts["bank"]["endsaldo"], "wertpapiere": "12000.00"}
    ek = {"gezeichnetes_kapital": "25000.00", "nicht_eingefordert": "-12500.00", "kapitalruecklage": "100.00",
          "verlustvortrag": "-3000.00", "jahresergebnis": fmt_punkt(ergebnis)}
    verb = sum(to_cents(v) for v in aktiva.values()) - sum(to_cents(v) for v in ek.values())
    passiva = dict(ek, verbindlichkeiten=fmt_punkt(verb))
    facts["bilanz"] = {"aktiva": aktiva, "passiva": passiva}
    facts["dokumente"] = {"e_bilanz": fmt_punkt(ergebnis), "beschluss": fmt_punkt(ergebnis), "excel": fmt_punkt(ergebnis)}
    return facts


def fmt_punkt(cents):
    s = f"{abs(cents) // 100}.{abs(cents) % 100:02d}"
    return ("-" if cents < 0 else "") + s


def main():
    facts = baue()
    ordner = ROOT / "fixtures" / "muster-gmbh"
    (ordner / "facts.json").write_text(json.dumps(facts, ensure_ascii=False, indent=2), encoding="utf-8")

    # Fehler-Injektion: vier realistische Fehler (siehe Review: Cent-Drift, vergessene Zahlung, PLZ, IBAN)
    bad = copy.deepcopy(facts)
    bad["dokumente"]["beschluss"] = fmt_punkt(to_cents(bad["dokumente"]["beschluss"]) + 1)   # C04
    bad["stammdaten"]["adressen_in_dokumenten"]["anschreiben"] = "12354"                      # C09
    bad["stammdaten"]["ibans"][1] = "DE02 1203 0000 0000 2020 15"                             # C08 Zahlendreher
    bad_zeilen = [(d, g, t, b, "Sonstiges" if t.startswith("Darlehen zu") else k) for d, g, t, b, k in JOURNAL]  # C06
    out = ROOT / "fixtures" / "fehler-injektion"
    (out / "facts.json").write_text(json.dumps(bad, ensure_ascii=False, indent=2), encoding="utf-8")
    schreibe_journal(out / "journal.csv", bad_zeilen)
    print("Fixtures geschrieben:", ordner, out)


if __name__ == "__main__":
    main()
