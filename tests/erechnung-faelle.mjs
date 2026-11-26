// Erfundene Beispielrechnungen (Beispiel-IBAN aus der Dokumentation, keine echten Personen oder Firmen).
export const basis = {
  nummer: "TEST-001", referenz: "KUNDE-42", datum: "2026-03-02", leistungVon: "2026-02-28", leistungBis: "", faellig: "2026-03-16", hinweis: "", befreiung: "",
  verkaeufer: { name: "Beispiel Software GmbH", strasse: "Musterweg 1", plz: "12345", ort: "Beispielstadt", land: "DE", ustid: "DE123456789", steuernummer: "", register: "HRB 99999",
    rechtsangaben: "Amtsgericht Beispielstadt, Geschäftsführung: Erika Beispiel", kontakt: "Erika Beispiel", telefon: "+49 30 000000", email: "rechnung@example.org", iban: "DE89370400440532013000", bic: "COBADEFFXXX", kontoinhaber: "" },
  kaeufer: { name: "Muster Handel AG", strasse: "Testallee 7", plz: "54321", ort: "Musterhausen", land: "DE", email: "eingang@example.com", ustid: "" },
  positionen: [{ text: "Beratung", menge: "10", einheit: "HUR", preis: "95,00", steuer: "s19" }],
};
const mit = (aenderung) => { const r = structuredClone(basis); aenderung(r); return r; };
export const faelle = {
  "standard-19": basis,
  "gemischt-rundung-zeitraum": mit((r) => { r.nummer = "TEST-002"; r.leistungVon = "2026-02-01"; r.leistungBis = "2026-02-28"; r.hinweis = "Vielen Dank.";
    r.positionen = [{ text: "Lizenz", menge: "3", einheit: "C62", preis: "0,3333", steuer: "s19" }, { text: "Handbuch", menge: "2,5", einheit: "C62", preis: "10,01", steuer: "s7" }, { text: "Einrichtung & Test", menge: "1", einheit: "LS", preis: "1.234,56", steuer: "s19" }]; }),
  "steuerfrei-nur-steuernummer": mit((r) => { r.nummer = "TEST-003"; r.verkaeufer.ustid = ""; r.verkaeufer.steuernummer = "12/345/67890"; r.befreiung = "Steuerfrei nach § 4 Nr. 11 UStG";
    r.positionen = [{ text: "Vermittlungsleistung", menge: "1", einheit: "LS", preis: "500", steuer: "frei" }]; }),
  "kleinunternehmer-ohne-register": mit((r) => { r.nummer = "TEST-006"; Object.assign(r.verkaeufer, { name: "Erika Beispiel", ustid: "", register: "", rechtsangaben: "", steuernummer: "12/345/67890" });
    r.befreiung = "Kein Ausweis von Umsatzsteuer nach § 19 UStG"; r.positionen = [{ text: "Nachhilfe", menge: "3", einheit: "HUR", preis: "25,00", steuer: "frei" }]; }),
  "reverse-charge-ausland": mit((r) => { r.nummer = "TEST-004"; r.kaeufer.land = "AT"; r.kaeufer.plz = "1010"; r.kaeufer.ort = "Wien"; r.kaeufer.ustid = "ATU12345678";
    r.positionen = [{ text: "Entwicklung", menge: "4", einheit: "DAY", preis: "800,00", steuer: "rc" }]; }),
  "gemischt-steuerpflichtig-und-frei": mit((r) => { r.nummer = "TEST-005"; r.befreiung = "Steuerfrei nach § 4 Nr. 21 UStG";
    r.positionen = [{ text: "Software", menge: "1", einheit: "C62", preis: "100,00", steuer: "s19" }, { text: "Kurs", menge: "1", einheit: "C62", preis: "50,00", steuer: "frei" }]; }),
};
