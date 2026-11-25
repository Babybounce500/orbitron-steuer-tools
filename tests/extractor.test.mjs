import test from "node:test";
import assert from "node:assert/strict";
import { gruppiereZeilen, parseBetrag, parseDatum, parseBuchungen, findeSalden, summencheck, ibanGueltig, pseudonymisiere, reidentifiziere, restrisiko, alsCsv, fmtCent } from "../web/extractor-core.js";

test("Beträge als BigInt-Cent", () => {
  assert.equal(parseBetrag("-1.234,56 €").cent, -123456n);
  assert.equal(parseBetrag("12,00 S").cent, -1200n);
  assert.equal(parseBetrag("+0,01").cent, 1n);
  assert.equal(parseBetrag("kein Betrag"), null);
  assert.equal(fmtCent(-5n), "-0,05");
});
test("Datum prüft Kalender", () => {
  assert.equal(parseDatum("31.12.2025 x").iso, "2025-12-31");
  assert.equal(parseDatum("31.02.2025"), null);
});
test("Zeilen werden spaltenbewusst gruppiert", () => {
  const z = gruppiereZeilen([{ str: "-9,00", x: 400, y: 700 }, { str: "01.03.2025", x: 20, y: 701 }, { str: "Kaffee", x: 100, y: 700 }, { str: "Folge", x: 100, y: 680 }]);
  assert.deepEqual(z, ["01.03.2025 Kaffee -9,00", "Folge"]);
});

const AUSZUG = [
  "Kontoinhaber: Max Mustermann",
  "Anfangssaldo 1.000,00 €",
  "02.01.2025 03.01.2025 Lastschrift Stadtwerke Duesseldorf -85,50",
  "Kundennr 4711",
  "05.01.2025 Gehalt Muster Handels GmbH +2.500,00",
  "31.01.2025 Überweisung an DE89 3704 0044 0532 0130 00 -400,00",
  "Endsaldo 3.014,50 €",
];
test("Buchungen, Folgezeilen und Summencheck", () => {
  const rows = parseBuchungen(AUSZUG);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].text, "Lastschrift Stadtwerke Duesseldorf Kundennr 4711");
  const s = summencheck(rows, findeSalden(AUSZUG));
  assert.equal(s.summe, 201450n);
  assert.equal(s.status, "ok");
  assert.equal(s.abweichung, 0n);
});
test("Summencheck meldet 1 Cent Abweichung", () => {
  const rows = parseBuchungen(AUSZUG);
  const s = summencheck(rows, { anfang: 100000n, ende: 301451n });
  assert.equal(s.status, "abweichung");
  assert.equal(s.abweichung, -1n);
});
test("IBAN-Prüfsumme", () => {
  assert.equal(ibanGueltig("DE89 3704 0044 0532 0130 00"), true);
  assert.equal(ibanGueltig("DE89 3704 0044 0532 0130 01"), false);
});
test("Pseudonymisierung und Re-Identifikation", () => {
  const roh = AUSZUG.join("\n") + "\nKontakt max@example.de, Tel 0211 1234567, Herr Peter Schmidt";
  const r = pseudonymisiere(roh, { eigeneNamen: ["Max Mustermann"] });
  assert.ok(!/Mustermann|Muster Handels|max@example|DE89|Schmidt|1234567/.test(r.text), r.text);
  assert.match(r.text, /PERSON_01/);
  assert.match(pseudonymisiere("Zahlung an Muster Handels GmbH", { eigeneNamen: ["Muster Handels GmbH"] }).text, /FIRMA_01/);
  assert.match(r.text, /IBAN_01/);
  assert.match(r.text, /Stadtwerke/); // Whitelist bleibt im Klartext
  assert.equal(reidentifiziere(r.text, r.tabelle).includes("Max Mustermann"), true);
  assert.equal(reidentifiziere(r.text, r.tabelle).includes("DE89370400440532013000"), true);
});
test("Gleiche Person bekommt gleiche ID", () => {
  const r = pseudonymisiere("Herr Peter Schmidt zahlt. Herr Peter Schmidt mahnt.");
  assert.equal((r.text.match(/PERSON_01/g) || []).length, 2);
  assert.ok(!/PERSON_02/.test(r.text));
});
test("Restrisiko findet übrig gebliebene Namen", () => {
  assert.equal(restrisiko("Zahlung an Karl Heinz Meier erhalten").stufe, "hoch"); // bekannter Vorname
  assert.equal(restrisiko("Beratung Musterfeld erhalten").stufe, "mittel"); // unbekannter Name: nur Kandidat
  assert.equal(restrisiko("PERSON_01 zahlt Miete").stufe, "niedrig");
});
test("CSV", () => {
  assert.match(alsCsv(parseBuchungen(AUSZUG)), /^Datum;Text;Betrag\r\n2025-01-02;"[^"]+";-85,50/);
});

// Vertrag/Anzeige ohne Kontoauszug-Struktur (erfundene Personen, gleiche Struktur wie ein echter Schenkungsentwurf)
const ANZEIGE = `Paul Beispiel · Hinter den Gärten 12 · 12345 Teststadt
Finanzamt (Erbschaft- und Schenkungsteuer)
Anzeige einer Schenkung nach § 30 ErbStG
Schenkerin Anna Beispiel, geboren am 02.03.1950
Anschrift: Beispielstraße 54, 54321 Teststadt
Steuer-Identifikationsnummer:
Beschenkter Paul Beispiel, geboren am 04.05.1980
Anschrift: Hinter den Gärten 12, 12345 Teststadt
Zeitpunkt der Schenkung 15.06.2025
Gegenstand und Wert Geldbetrag von 10.000,00 EUR
Persönliches Verhältnis Eltern und Kind
Unterschrift Beschenkter Unterschrift Schenkerin
Paul Beispiel Anna Beispiel`;
test("Vertrag: Namen, Anschriften und Geburtsdaten werden ohne Eingabe erkannt", () => {
  const r = pseudonymisiere(ANZEIGE);
  for (const v of ["Paul", "Anna", "Beispiel", "Gärten", "Beispielstraße", "12345", "54321", "02.03.1950", "04.05.1980"]) assert.ok(!r.text.includes(v), `${v} noch im Text:\n${r.text}`);
  assert.deepEqual(r.gelernt.sort(), ["Anna Beispiel", "Paul Beispiel"]);
  assert.match(r.text, /10\.000,00 EUR/); // Beträge bleiben
  assert.match(r.text, /Finanzamt/); // Institution bleibt
  assert.ok(!restrisiko(r.text).moeglicheNamen.some((n) => /Paul|Anna|Beispiel/.test(n)), "Namen übrig");
  assert.ok(reidentifiziere(r.text, r.tabelle).includes("Hinter den Gärten 12"));
});
test("Keine falschen Treffer bei Zeitangaben", () => {
  const r = pseudonymisiere("Im Jahr 2025 zahlte Am Montag 5 Personen. Rechnung 12345 Euro, Datum 01.02.2025");
  assert.equal(r.text, "Im Jahr 2025 zahlte Am Montag 5 Personen. Rechnung 12345 Euro, Datum 01.02.2025");
});

// ---- Formate echter Fintech-Auszüge (erfundene Daten, gleiche Struktur) ----
import { steuerIdGueltig, parseBuchungen as pb, findeSalden as fs2, summencheck as sc2 } from "../web/extractor-core.js";
const QONTO = [
  "Kontoauszüge", "Vom 01/05/2025 bis zum 31/05/2025", "Beispiel Handel GmbH",
  "Kontostand am 01/05 + 500.00 EUR", "Eingänge + 300.00 EUR", "Ausgänge - 100.50 EUR",
  "IBAN: DE89 3704 0044 0532 0130 00", "BIC: COBADEFFXXX Kontostand am 31/05 + 700.23 EUR",
  "Abrechnungstag Transaktionen Belastung Gutschrift",
  "02/05 STEUERVERWALTUNG NRW + 300.00 EUR", "StNr 123/456/78901 Umsatzsteuer 4.Vj 24 300,00",
  "05/05 Google ADS0000000001 - 0.25 EUR", "Karte **0000",
  "14/05 OPENAI - 4.00 EUR", "1.10000000000000 USD = 1.00 EUR - 4.40 USD", "Karte **0000",
  "Vom 01/05/2025 bis zum 31/05/2025", "Beispiel Handel GmbH (DE89 3704 0044 0532 0130 00) 1/2", "Abrechnungstag Transaktionen Belastung Gutschrift",
  "20/05 Qonto - 95.52 EUR", "Abonnement / Zusatzgebühren",
];
test("Qonto: Zeilen, Jahr aus dem Kopf, Vorzeichen, Summencheck", () => {
  const rows = pb(QONTO);
  assert.equal(rows.format, "qonto");
  assert.equal(rows.length, 4, rows.map((r) => r.text).join(" | "));
  assert.equal(rows[0].datum, "2025-05-02"); assert.equal(rows[0].cent, 30000n); assert.equal(rows[1].cent, -25n);
  assert.match(rows[2].text, /1\.10000000000000 USD/); // Kursangaben bleiben Text, sind keine Beträge
  const s = sc2(rows, fs2(QONTO));
  assert.equal(s.status, "ok", String(s.abweichung) + " " + s.status);
});
const REVOLUT = [
  "Kontoauszug", "Eröffnungsguthaben €41.00", "Geldeingang €1 000.00", "Geldausgang - €150.00", "Schlussguthaben €891.00",
  "Datum (UTC) Beschreibung Geldausgang Geldeingang Guthaben",
  "31 März 2026 CAR Beispielmarkt €100.00 €891.00",
  "30 März 2026 MOA Geld eingezahlt von ERIKA BEISPIEL • €1 000.00 €991.00", "Darlehen",
  "12 März 2026 MOS An Ihk Beispielstadt • 20000000000 €50.00 €41.00".replace("€41.00", "€-9.00"),
];
test("Revolut: Vorzeichen aus Guthaben, Monatsnamen, Tausenderleerzeichen", () => {
  const z = ["Eröffnungsguthaben €41.00", "Schlussguthaben €941.00", "31 März 2026 CAR Beispielmarkt €100.00 €941.00", "30 März 2026 MOA Geld eingezahlt von ERIKA BEISPIEL • €1 000.00 €1 041.00", "Darlehen"];
  const rows = pb(z);
  assert.equal(rows.format, "revolut");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].cent, -10000n); assert.equal(rows[1].cent, 100000n);
  assert.equal(sc2(rows, fs2(z)).status, "ok");
  const falsch = pb(z.map((x) => x.replace("€1 000.00 €1 041.00", "€900.00 €1 041.00")));
  assert.equal(sc2(falsch, fs2(z)).status, "abweichung"); // Betrag passt nicht zur Guthabenänderung
  assert.match(rows[1].text, /Darlehen$/);
});
test("Zeichenweise zerlegte Textstücke werden zu Wörtern, echte Lücken bleiben", () => {
  const g = (s, x0) => [...s].map((c, i) => ({ str: c, x: x0 + i * 6, y: 100, w: 6, h: 10 }));
  const z = gruppiereZeilen([...g("Konto", 0), ...g("auszug", 40)]);
  assert.deepEqual(z, ["Konto auszug"]); // 40 - 30 = 10 > Lücke
  assert.deepEqual(gruppiereZeilen(g("Kontoauszug", 0)), ["Kontoauszug"]);
});
test("Whitelist arbeitet mit Wortgrenzen: 'Henning Müller' enthält kein ING", () => {
  const r = pseudonymisiere("Zahlung an Henning Müller GmbH und ING Bank", {});
  assert.ok(!r.text.includes("Henning"), r.text);
  assert.ok(r.text.includes("ING Bank"));
  assert.ok(restrisiko("Karl Henning Meier").moeglicheNamen.length === 1);
});
test("Name in GROSSBUCHSTABEN wird über die Schreibweise anderer Stellen erkannt", () => {
  const r = pseudonymisiere("Schenkerin Erika Beispiel, geboren am 01.01.1950\nGeld eingezahlt von ERIKA BEISPIEL • €10.00");
  assert.ok(!/erika|beispiel/i.test(r.text), r.text);
});
test("Firma wird gelernt und in anderer Schreibweise (O.P.N / GMBH) ersetzt", () => {
  const r = pseudonymisiere("Muster O. P. N GmbH\n10/05 MUSTER O.P.N GMBH - 1.00 EUR");
  assert.ok(!/muster/i.test(r.text), r.text);
  assert.equal((r.text.match(/FIRMA_01/g) || []).length, 2);
});
test("IBAN wird auch mit Anhang erkannt, ungültige nicht", () => {
  assert.ok(!pseudonymisiere("IBAN: DE89 3704 0044 0532 0130 00 BIC COBADEFFXXX", { autoNamen: false }).text.includes("DE89"));
  assert.ok(pseudonymisiere("Ref DE89 3704 0044 0532 0130 01", { autoNamen: false }).text.includes("DE89"));
});
test("Steuer-ID-Prüfziffer (ISO 7064)", () => {
  assert.equal(steuerIdGueltig("65929970489"), true); // Beispiel-ID aus der amtlichen Doku
  assert.equal(steuerIdGueltig("20000000000"), false);
});

test("Namen in Dateipfaden, im Genitiv und als Kurzname der Firma", () => {
  const r = pseudonymisiere("Schenkerin Erika Beispiel, geboren am 01.01.1950\nDatei CV_Erika_Beispiel_DE.html\nErikas Konto bei Beispiel Handel GmbH, kurz Beispiel Handel\nGeschäftsführer Paul Beispiel (*04.05.1980), am 04.05.1980 geboren");
  assert.ok(!/erika|paul|beispiel|13\.09\.1985/i.test(r.text), r.text);
});
test("Anschrift über Zeilenumbruch, in Großbuchstaben und ohne Hausnummer", () => {
  const r = pseudonymisiere("Darlehensgeber: Paul Beispiel, Hinter den Gärten 12, 12345 Teststadt\nKarte DUSSELDORF HINTER DEN\nGAERTEN 12 12345 DE\nwohnhaft Hinter den Gärten, Teststadt");
  assert.ok(!/gärten|garten|gaerten|12345/i.test(r.text), r.text);
});
test("Webadressen und Profile werden maskiert, Institutionen nicht", () => {
  const r = pseudonymisiere("Portfolio paulbeispiel.com, Replit replit.com/@paulbeispiel und https://github.com/paulbeispiel/x, Konto bei qonto.com", { autoNamen: false });
  assert.ok(!/paulbeispiel/i.test(r.text), r.text);
});
test("Revolut: abgekürzte Monate (Feb.) erzeugen keine verschluckten Zeilen", () => {
  const z = ["Eröffnungsguthaben €10.00", "Schlussguthaben €40.00", "03 März 2026 CAR Laden €20.00 €40.00", "23 Feb. 2026 FEE Gebühr €10.00 €20.00", "20 Feb. 2026 MOA Einzahlung €20.00 €30.00"];
  z[1] = "Schlussguthaben €40.00"; z[3] = "23 Feb. 2026 FEE Gebühr €10.00 €20.00";
  const rows = pb(z);
  assert.equal(rows.length, 3);
});

test("Name direkt hinter einem Großwort (überlappendes Paar) wird gelernt", () => {
  const r = pseudonymisiere("Genussrechte Marc Beispielmann halten 10 Stück. Rendite Beispielmann 5 %.");
  assert.ok(!/Marc|Beispielmann/.test(r.text), r.text);
});
test("Monatskürzel Jan ist kein Vorname-Treffer", () => {
  assert.equal(restrisiko("Monatsauszüge Jan Feb").stufe === "hoch", false);
});

// Formular mit übereinanderliegenden Textebenen (erfundene Daten, gleiche Struktur wie eine Honorarabrechnung)
const FORMULAR = [
  "Honorarabrechnung Beispielgasse 39",
  "Tel.: (09999) 123 45 67", "Fax: (09999) 123 45 68Musterweg. 16", "team-beispiel@x-nachhilfe.de23456 Teststadt",
  "Inhaber: F. Muster", "Anna und Paul BeispielTel.: (08888) 765 43 21", "f.muster@x-franchise.de",
  "Copyright by X, Musterweg. 16, 23456 Teststadt",
].join("\n");
test("Formular: Telefon mit Klammer, angeklebte PLZ/Namen, 'A und B Nachname', Initial + Nachname", () => {
  const r = pseudonymisiere(FORMULAR);
  for (const v of ["09999", "08888", "Anna", "Paul", "Beispiel", "Muster", "23456", "@"]) assert.ok(!r.text.includes(v), `${v} noch im Text:\n${r.text}`);
});
test("Doppelte Textebenen werden verworfen, Nachbarn bleiben", () => {
  const it = (s, x, y) => ({ str: s, x, y, w: 40, h: 10 });
  assert.deepEqual(gruppiereZeilen([it("Honorar", 10, 100), it("Honorar", 10.4, 100.3), it("2025", 80, 100)]), ["Honorar 2025"]);
  assert.deepEqual(gruppiereZeilen([it("Summe", 10, 100), it("Summe", 10, 130)]), ["Summe", "Summe"]);
});

test("Straße ersetzt nur Name und Hausnummer, das Leerzeichen danach bleibt", () => {
  const r = pseudonymisiere("15.01.2025 Miete Wohnung Beispielstraße 5 -950,00", { autoNamen: false });
  assert.match(r.text, /ADRESSE_01 -950,00$/, r.text);
  assert.equal(parseBuchungen(r.text.split("\n")).length, 1);
});
