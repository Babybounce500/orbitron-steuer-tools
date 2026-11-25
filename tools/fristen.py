"""Fristenhilfe (Auszug). Keine Rechtsberatung: Feiertage sind NICHT berücksichtigt,
Ergebnis immer am Bescheid prüfen. Aufruf:  python3 tools/fristen.py 2026-11-05"""
import sys
from calendar import monthrange
from datetime import date, timedelta


def bekanntgabe(aufgabe: date) -> date:
    """Bekanntgabe per einfachem Brief: vierter Tag nach Aufgabe zur Post (so steht es in den Bescheiden)."""
    return aufgabe + timedelta(days=4)


def einspruchsfrist(aufgabe: date) -> date:
    """Ein Monat ab Bekanntgabe. Fällt das Ende auf Sa/So, endet die Frist am nächsten Montag."""
    b = bekanntgabe(aufgabe)
    jahr, monat = (b.year, b.month + 1) if b.month < 12 else (b.year + 1, 1)
    ende = date(jahr, monat, min(b.day, monthrange(jahr, monat)[1]))
    while ende.weekday() >= 5:
        ende += timedelta(days=1)
    return ende


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    a = date.fromisoformat(sys.argv[1])
    print("Bekanntgabe:", bekanntgabe(a), " Einspruchsfrist bis:", einspruchsfrist(a))
