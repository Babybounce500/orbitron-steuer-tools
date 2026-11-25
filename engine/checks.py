"""Regelkatalog (Auszug). Jede Prüfung liefert: id, name, status (ok/warn/fail),
erwartet, tatsaechlich, differenz (Cent) und einen Rechenbeleg als Text."""
import csv
import re
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from .money import fmt, iban_valid, netto_aus_brutto, to_cents


def _res(cid, name, status, erwartet=None, ist=None, beleg="", hinweis=""):
    diff = None if erwartet is None or ist is None else ist - erwartet
    return {
        "id": cid, "name": name, "status": status,
        "erwartet": None if erwartet is None else fmt(erwartet),
        "tatsaechlich": None if ist is None else fmt(ist),
        "differenz_cent": diff, "beleg": beleg, "hinweis": hinweis,
    }


def _vergleich(cid, name, erwartet, ist, beleg, hinweis=""):
    return _res(cid, name, "ok" if erwartet == ist else "fail", erwartet, ist, beleg, hinweis)


def lade_journal(pfad):
    zeilen = []
    with open(pfad, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            zeilen.append({
                "datum": date.fromisoformat(r["Datum"]),
                "gegenpartei": r["Gegenpartei"], "text": r["Verwendungszweck"],
                "betrag": to_cents(r["Betrag"]), "kategorie": r["Kategorie"],
            })
    return zeilen


def zinsen_act365(start_cents, bewegungen, von, bis, satz):
    """Zinsen auf den laufenden Bestand, taggenau act/365. bewegungen: [(date, cents)]."""
    ev = {}
    for d, c in bewegungen:
        ev[d] = ev.get(d, 0) + c
    bestand, total, tag, rate = start_cents, Decimal(0), von, Decimal(satz)
    while tag <= bis:
        bestand += ev.get(tag, 0)
        total += Decimal(bestand) * rate / Decimal(365)
        tag += timedelta(days=1)
    return int(total.quantize(Decimal(1), ROUND_HALF_UP))


def gesellschafterkonto_erwartet(facts, journal):
    """Aus den Bankzeilen abgeleitet: (Kapital Ende, Zinsen berechnet, erwarteter Bilanzposten)."""
    gk = facts["gesellschafterkonto"]
    wj = facts["stammdaten"]["wirtschaftsjahr"]
    # Bank an Gesellschafter (Minus) erhöht die Forderung, Eingang (Plus) senkt sie.
    bew = [(z["datum"], -z["betrag"]) for z in journal if z["kategorie"] == "Gesellschafter-Darlehen"]
    kapital_ende = to_cents(gk["kapital_start"]) + sum(c for _, c in bew)
    zins = zinsen_act365(to_cents(gk["kapital_start"]), bew,
                         date.fromisoformat(wj["von"]), date.fromisoformat(wj["bis"]), gk["zinssatz"])
    zahlungen = sum(z["betrag"] for z in journal if z["kategorie"] == "Gesellschafter-Zins")
    posten = kapital_ende + to_cents(gk["zinsen_offen_vorjahr"]) + zins - zahlungen
    return kapital_ende, zins, posten


def run(facts, journal):
    out = []
    b, g = facts["bilanz"], facts["guv"]
    akt = sum(to_cents(v) for v in b["aktiva"].values())
    pas = sum(to_cents(v) for v in b["passiva"].values())
    out.append(_vergleich("C01", "Bilanz: Summe Aktiva = Summe Passiva", akt, pas,
                          f"Aktiva {fmt(akt)} gegen Passiva {fmt(pas)}"))

    ertraege = sum(to_cents(v) for v in g["ertraege"].values())
    aufwand = sum(to_cents(v) for v in g["aufwand"].values())
    ergebnis = ertraege - aufwand
    out.append(_vergleich("C02", "GuV: Erträge minus Aufwand = Jahresergebnis der Bilanz", ergebnis,
                          to_cents(b["passiva"]["jahresergebnis"]),
                          f"{fmt(ertraege)} - {fmt(aufwand)} = {fmt(ergebnis)}"))

    vj, er = facts["vorjahr"], facts["eroeffnung"]
    erwartet = to_cents(vj["verlustvortrag"]) + to_cents(vj["jahresergebnis"])
    out.append(_vergleich("C03", "Vorjahr: Schlussbilanz = Eröffnung (Verlustvortrag)", erwartet,
                          to_cents(er["verlustvortrag"]),
                          f"{vj['verlustvortrag']} + ({vj['jahresergebnis']}) = {fmt(erwartet)}"))

    je = to_cents(b["passiva"]["jahresergebnis"])
    abw = {k: to_cents(v) for k, v in facts["dokumente"].items() if to_cents(v) != je}
    out.append(_res("C04", "Dokumente: Jahresergebnis überall identisch (Cent)",
                    "ok" if not abw else "fail", je, je if not abw else next(iter(abw.values())),
                    "geprüft: " + ", ".join(facts["dokumente"]),
                    "" if not abw else "Abweichend: " + ", ".join(f"{k}={fmt(v)}" for k, v in abw.items())))

    bk = facts["bank"]
    summe = sum(z["betrag"] for z in journal)
    out.append(_vergleich("C05", "Bank: Anfangssaldo + Buchungen = Endsaldo", to_cents(bk["endsaldo"]),
                          to_cents(bk["anfangssaldo"]) + summe,
                          f"{bk['anfangssaldo']} + {fmt(summe)} = {fmt(to_cents(bk['anfangssaldo']) + summe)}"))

    kap, zins, posten = gesellschafterkonto_erwartet(facts, journal)
    gk = facts["gesellschafterkonto"]
    out.append(_vergleich("C06", "Gesellschafterkonto: Bilanzposten = Kapital + Zinsen aus den Bankzeilen",
                          posten, to_cents(gk["bilanzposten"]),
                          f"Kapital {fmt(kap)} + Zinsen offen {gk['zinsen_offen_vorjahr']} + Zinsen {fmt(zins)}"
                          f" - Zinszahlung = {fmt(posten)}"))
    out.append(_vergleich("C06b", "Gesellschafterkonto: gebuchte Zinsen = act/365 berechnet", zins,
                          to_cents(gk["zinsen_gebucht"]),
                          f"{fmt(kap)} Kapital, Satz {gk['zinssatz']}, taggenau, Ergebnis {fmt(zins)}"))

    vs = 0
    for beleg in facts["ust"]["belege"]:
        br = to_cents(beleg["brutto"])
        vs += br - netto_aus_brutto(br, beleg["satz"])
    out.append(_vergleich("C07", "USt: Vorsteuer je Beleg gerundet = erklärte Vorsteuer", vs,
                          to_cents(facts["ust"]["vorsteuer_erklaert"]),
                          f"{len(facts['ust']['belege'])} Belege, je Beleg Netto = Brutto/1,19 gerundet"))

    ibans = facts["stammdaten"]["ibans"]
    schlecht = [i for i in ibans if not iban_valid(i)]
    out.append(_res("C08", "IBAN-Prüfziffer (mod 97) aller Zahlungsdaten", "ok" if not schlecht else "fail",
                    len(ibans) * 100, (len(ibans) - len(schlecht)) * 100,
                    f"{len(ibans)} IBAN geprüft", "" if not schlecht else "Ungültig: " + ", ".join(schlecht)))

    plz = facts["stammdaten"]["plz"]
    falsch = {k: v for k, v in facts["stammdaten"]["adressen_in_dokumenten"].items() if v != plz}
    out.append(_res("C09", "Stammdaten: PLZ in allen Dokumenten gleich", "ok" if not falsch else "fail",
                    None, None, f"Soll {plz}", "" if not falsch else "Abweichend: " + ", ".join(f"{k}={v}" for k, v in falsch.items())))

    d = {k: date.fromisoformat(v) for k, v in facts["daten"].items()}
    ok = d["verkauf"] <= d["ueberweisung"] <= d["unterschrift"] and d["vertrag_erstellt"] <= d["unterschrift"]
    out.append(_res("C10", "Datumslogik: Verkauf <= Überweisung <= Unterschrift, kein Rückdatieren",
                    "ok" if ok else "fail", None, None, ", ".join(f"{k} {v}" for k, v in facts["daten"].items())))

    sn = facts["stammdaten"]["steuernummer"]
    out.append(_res("C11", "Steuernummer: Format", "ok" if re.fullmatch(r"\d{2,3}/\d{3,4}/\d{4,5}", sn) else "fail",
                    None, None, sn))

    offen = [a for a in facts["annahmen"] if a["status"] == "offen"]
    wert = sum(to_cents(a["auswirkung"]) for a in offen)
    out.append(_res("C12", "Annahmenregister: offene Annahmen mit Auswirkung", "ok" if not offen else "warn",
                    None, None, f"{len(offen)} offen, Auswirkung {fmt(wert)}",
                    "; ".join(a["text"] for a in offen)))
    return out
