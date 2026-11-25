"""Erzeugt tests/geld-faelle.json: Ausdruck -> erwartetes Ergebnis, berechnet mit Python
(Fraction und Decimal, also unabhängig vom JavaScript-Modul). Aufruf: python3 tools/make_geldfaelle.py"""
import json
from decimal import Decimal, ROUND_HALF_UP, getcontext
from fractions import Fraction as F
from pathlib import Path

getcontext().prec = 80
ROOT = Path(__file__).resolve().parent.parent


def de(d: Decimal, k=2) -> str:
    """Decimal -> deutsches Format mit k Nachkommastellen, kaufmännisch gerundet."""
    q = d.quantize(Decimal(1).scaleb(-k), rounding=ROUND_HALF_UP)
    s = f"{abs(q):,.{k}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("-" if q < 0 else "") + s


def val(fr: F) -> Decimal:
    return Decimal(fr.numerator) / Decimal(fr.denominator)


def exakt(fr: F) -> bool:
    return val(fr) == val(fr).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# (Ausdruck, erwarteter Wert als Fraction)
FAELLE = [
    ("0,1+0,2", F(1, 10) + F(2, 10)),
    ("1.234.567,89*0,19", F("1234567.89") * F("0.19")),
    ("100/3", F(100, 3)),
    ("1/3*3", F(1)),
    ("runde(2,675)", F("2.68")),
    ("runde(-2,675)", F("-2.68")),
    ("runde(2,5;0)", F(3)),
    ("runde(-2,5;0)", F(-3)),
    ("100+10%", F(110)),
    ("100-10%", F(90)),
    ("50%", F(1, 2)),
    ("200*10%", F(20)),
    ("100+10%+10%", F(121)),
    ("-2^2", F(-4)),
    ("2^-2", F(1, 4)),
    ("2^10", F(1024)),
    ("(2+3)*4", F(20)),
    ("2^3^2", F(512)),
    ("9007199254740993+2", F(9007199254740995)),
    ("123456789*987654321", F(123456789 * 987654321)),
    ("12345678901,23+0,01", F("12345678901.24")),
    ("24931,20-24931,19", F("0.01")),
    ("9956,05-9956,06", F("-0.01")),
    ("netto(119;19)", F(100)),
    ("ust(119;19)", F(19)),
    ("runde(netto(29,75;19))", F("25.00")),
    ("ust(29,75;19)", F("29.75") - F("29.75") / F("1.19")),
    ("zins(1000;5;365)", F(50)),
    ("zins(900;5;73)", F(9)),
    ("zins(1000;5;100)", F(1000) * F(5, 100) * 100 / 365),
    ("afa(5000;5;12)", F(1000)),
    ("afa(2345,67;5;6)", F("2345.67") / 5 * 6 / 12),
    ("min(3;2;5)", F(2)),
    ("max(3;2;5)", F(5)),
    ("summe(1,10;2,20;3,30)", F("6.60")),
    ("abs(-5,5)", F("5.5")),
    ("1.000,50*3", F("3001.50")),
    ("0,07*100", F(7)),
    ("19%*100", F(19)),
]
FEHLER = ["1/0", "1+", "2 3", "1.5+1", "foo(1)", "runde(1;2;3)", "2^0,5", "(1+2", "1,5,5", "1.2345", "5 %%", "sin(1)"]


def main():
    out = []
    for expr, fr in FAELLE:
        out.append({"ausdruck": expr, "erwartet": de(val(fr)), "exakt": exakt(fr)})
    for expr in FEHLER:
        out.append({"ausdruck": expr, "fehler": True})
    (ROOT / "tests" / "geld-faelle.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(len(out), "Fälle geschrieben")


if __name__ == "__main__":
    main()
