import json
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from engine.checks import zinsen_act365  # noqa: E402
from engine.money import fmt, iban_valid, netto_aus_brutto, to_cents  # noqa: E402
from engine.run_checks import pruefe  # noqa: E402
from tools.fristen import einspruchsfrist  # noqa: E402


class Geld(unittest.TestCase):
    def test_cent_exakt_statt_float(self):
        self.assertEqual(to_cents("0.10") + to_cents("0.20"), to_cents("0.30"))
        self.assertEqual(to_cents("-12.34"), -1234)

    def test_float_verboten(self):
        with self.assertRaises(TypeError):
            to_cents(0.1)

    def test_drei_nachkommastellen_verboten(self):
        with self.assertRaises(ValueError):
            to_cents("1.234")

    def test_format_deutsch(self):
        self.assertEqual(fmt(123456789), "1.234.567,89")
        self.assertEqual(fmt(-5), "-0,05")

    def test_vorsteuer_je_beleg(self):
        self.assertEqual(to_cents("119.00") - netto_aus_brutto(to_cents("119.00"), "0.19"), 1900)
        self.assertEqual(netto_aus_brutto(to_cents("29.75"), "0.19"), 2500)

    def test_iban(self):
        self.assertTrue(iban_valid("DE89 3704 0044 0532 0130 00"))
        self.assertFalse(iban_valid("DE89 3704 0044 0532 0130 01"))
        self.assertFalse(iban_valid("DE02 1203 0000 0000 2020 15"))

    def test_zinsen_ein_jahr_ohne_bewegung(self):
        z = zinsen_act365(100000, [], date(2025, 1, 1), date(2025, 12, 31), "0.05")
        self.assertEqual(z, 5000)  # 1.000,00 * 5 % * 365/365


class Pruefungen(unittest.TestCase):
    def test_muster_alles_gruen_ausser_offener_annahme(self):
        erg = {r["id"]: r["status"] for r in pruefe(ROOT / "fixtures" / "muster-gmbh")}
        self.assertEqual([k for k, v in erg.items() if v == "fail"], [])
        self.assertEqual(erg["C12"], "warn")

    def test_fehler_injektion_findet_genau_vier_fehler(self):
        erg = {r["id"]: r["status"] for r in pruefe(ROOT / "fixtures" / "fehler-injektion")}
        self.assertEqual(sorted(k for k, v in erg.items() if v == "fail"), ["C04", "C06", "C06b", "C08", "C09"])

    def test_c04_erkennt_ein_cent(self):
        erg = {r["id"]: r for r in pruefe(ROOT / "fixtures" / "fehler-injektion")}
        self.assertEqual(abs(erg["C04"]["differenz_cent"]), 1)


class Fristen(unittest.TestCase):
    def test_einspruchsfrist_vierter_tag_und_wochenende(self):
        # Aufgabe zur Post Do 05.11.2026 -> Bekanntgabe 09.11. -> Fristende 09.12.2026 (Mittwoch)
        self.assertEqual(einspruchsfrist(date(2026, 11, 5)), date(2026, 12, 9))
        # Fristende am Wochenende wandert auf Montag
        self.assertEqual(einspruchsfrist(date(2026, 10, 24)).weekday(), 0)


if __name__ == "__main__":
    unittest.main()
