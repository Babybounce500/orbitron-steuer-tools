// Alle Daten erfunden.
import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { parseZahl, dezimal, deutsch, ibanOk, rechne, pruefe, xrechnung, dateiname } from "../web/erechnung-core.js";
import { faelle, basis } from "./erechnung-faelle.mjs";

test("Zahlen: deutsch, exakt, Mehrdeutiges abgelehnt", () => {
  assert.equal(parseZahl("1.234,56", 2), 123456n);
  assert.equal(parseZahl("0,1", 4), 1000n);
  assert.equal(parseZahl("1.000", 3), 1000000n);
  assert.equal(parseZahl("12,50 €", 2), 1250n);
  for (const s of ["1.5", "1,234.56", "abc", "", "1,2345 5", "1e3"]) assert.equal(parseZahl(s, 3), null, s);
  assert.equal(parseZahl("1,2345", 3), null);
  assert.equal(dezimal(5n, 2), "0.05");
  assert.equal(dezimal(-123456n, 2), "-1234.56");
  assert.equal(dezimal(1500n, 3, 0), "1.5");
  assert.equal(dezimal(2000n, 3, 0), "2");
  assert.equal(deutsch(123456789n), "1.234.567,89");
});

test("IBAN-Prüfziffer", () => {
  assert.equal(ibanOk("DE89 3704 0044 0532 0130 00"), true);
  assert.equal(ibanOk("DE88370400440532013000"), false);
  assert.equal(ibanOk(""), false);
});

test("Summen: Rundung je Zeile und je Steuersatz", () => {
  const s = rechne({ positionen: [
    { menge: "3", preis: "0,3333", steuer: "s19" },   // 0,9999 -> 1,00
    { menge: "1", preis: "0,025", steuer: "s19" },    // 0,025 -> 0,03
    { menge: "2,5", preis: "10,01", steuer: "s7" },   // 25,025 -> 25,03
  ] });
  assert.deepEqual(s.posten.map((p) => p.netto), [100n, 3n, 2503n]);
  assert.deepEqual(s.steuern.map((g) => [g.satz, g.basis, g.steuer]), [[19n, 103n, 20n], [7n, 2503n, 175n]]);
  assert.equal(s.netto, 2606n);
  assert.equal(s.ust, 195n);
  assert.equal(s.brutto, 2801n);
});

test("vollständige Fälle sind fehlerfrei und die XML-Summen passen", () => {
  for (const [name, r] of Object.entries(faelle)) {
    assert.deepEqual(pruefe(r), [], name);
    const xml = xrechnung(r), s = rechne(r);
    assert.ok(xml.includes(`<cbc:PayableAmount currencyID="EUR">${dezimal(s.brutto, 2)}</cbc:PayableAmount>`), name);
    assert.ok(xml.includes("xrechnung_3.0"), name);
    assert.ok(!xml.includes("<cbc:Note></cbc:Note>") && !/<(cbc:\w+)[^>]*\/>/.test(xml), name);
  }
});

test("Pflichtangaben werden verlangt", () => {
  const r = structuredClone(basis);
  r.verkaeufer.iban = "DE00"; r.verkaeufer.ustid = ""; r.verkaeufer.steuernummer = ""; r.kaeufer.email = "x"; r.referenz = ""; r.leistungVon = "";
  r.faellig = "2026-01-01"; r.positionen[0].preis = "1.5";
  const f = pruefe(r).join(" | ");
  for (const wort of ["IBAN", "Steuernummer", "E-Mail-Adresse des Kunden", "Käuferreferenz", "Leistungsdatum", "Fälligkeit", "Einzelpreis"]) assert.ok(f.includes(wort), wort);
  assert.throws(() => xrechnung(r));
  const rc = structuredClone(basis); rc.positionen[0].steuer = "rc";
  assert.ok(pruefe(rc).some((x) => x.includes("USt-IdNr. des Kunden")));
  const frei = structuredClone(basis); frei.positionen[0].steuer = "frei";
  assert.ok(pruefe(frei).some((x) => x.includes("Steuerbefreiung")));
  const kv = structuredClone(basis); kv.kaeufer.ustid = "123";
  assert.ok(pruefe(kv).some((x) => x.includes("USt-IdNr. des Kunden")));
  assert.ok(xrechnung(faelle["kleinunternehmer-ohne-register"]).includes("<cac:PartyIdentification><cbc:ID>12/345/67890</cbc:ID>"));
  assert.ok(!xrechnung(basis).includes("PartyIdentification"));
  assert.ok(pruefe({ ...basis, datum: "2026-02-30" }).some((x) => x.includes("Rechnungsdatum")));
});

test("Eingaben können das XML nicht aufbrechen", () => {
  const r = structuredClone(basis);
  r.positionen[0].text = 'A & B <x attr="1"> ]]> \u0000\u0008 Ende';
  r.kaeufer.name = "</cbc:RegistrationName><böse/>";
  const xml = xrechnung(r);
  assert.ok(xml.includes("A &amp; B &lt;x attr=&quot;1&quot;&gt; ]]&gt;  Ende"));
  assert.ok(!xml.includes("<böse/>"));
  assert.ok(!/[\u0000\u0008]/.test(xml));
  assert.equal(dateiname({ nummer: "../a b/1" }), "Rechnung_..-a-b-1.xml");
});

// Für die externe Prüfung mit dem KoSIT-Validator: ERECHNUNG_AUSGABE=<Ordner> setzen
if (process.env.ERECHNUNG_AUSGABE) {
  mkdirSync(process.env.ERECHNUNG_AUSGABE, { recursive: true });
  for (const [name, r] of Object.entries(faelle)) writeFileSync(`${process.env.ERECHNUNG_AUSGABE}/${name}.xml`, xrechnung(r), "utf8");
}
