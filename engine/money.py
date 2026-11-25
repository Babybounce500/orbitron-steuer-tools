"""Geld als ganze Cent. Keine Fließkommazahlen im Rechenpfad."""
import re
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

CENT = Decimal("0.01")


def to_cents(value) -> int:
    """'1234.56' oder Decimal -> 123456. float und bool sind verboten."""
    if isinstance(value, (float, bool)):
        raise TypeError("Geld nie als float angeben, sondern als String wie '12.34'")
    try:
        d = Decimal(str(value))
    except InvalidOperation as e:
        raise ValueError(f"Kein Betrag: {value!r}") from e
    if d != d.quantize(CENT):
        raise ValueError(f"Mehr als 2 Nachkommastellen: {value!r}")
    return int((d * 100).to_integral_value())


def fmt(cents: int) -> str:
    """123456 -> '1.234,56' (deutsch)."""
    sign = "-" if cents < 0 else ""
    euro, ct = divmod(abs(cents), 100)
    return f"{sign}{euro:,}".replace(",", ".") + f",{ct:02d}"


def round_div(a: int, b: int) -> int:
    """a/b kaufmännisch auf ganze Zahlen runden (Halbe weg von null)."""
    return int((Decimal(a) / Decimal(b)).quantize(Decimal(1), ROUND_HALF_UP))


def netto_aus_brutto(brutto_cents: int, satz: str) -> int:
    """Netto je Beleg, kaufmännisch gerundet. satz z. B. '0.19'."""
    p = int((Decimal(satz) * 100).to_integral_value())
    return round_div(brutto_cents * 100, 100 + p)


def iban_valid(iban: str) -> bool:
    """IBAN-Prüfziffer (mod 97) und Grundformat."""
    s = re.sub(r"\s", "", str(iban)).upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", s):
        return False
    if s.startswith("DE") and len(s) != 22:
        return False
    num = "".join(str(int(c, 36)) for c in s[4:] + s[:4])
    return int(num) % 97 == 1
