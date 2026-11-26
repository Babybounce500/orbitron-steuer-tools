// Orbitron E-Rechnung: XRechnung 3.0 (UBL 2.1) erzeugen. Alle Beträge als BigInt, nie Fließkommazahlen.
// ES-Modul (Browser und Node). Umfang: Rechnung (Typ 380) in EUR, Steuerfälle 19 %, 7 %, steuerfrei, Reverse Charge.

export const EINHEITEN = [["C62", "Stück"], ["HUR", "Stunde"], ["DAY", "Tag"], ["MON", "Monat"], ["LS", "pauschal"]];
export const STEUERFAELLE = {
  s19: { text: "19 %", id: "S", satz: 19n },
  s7: { text: "7 %", id: "S", satz: 7n },
  frei: { text: "steuerfrei", id: "E", satz: 0n },
  rc: { text: "Reverse Charge", id: "AE", satz: 0n },
};
export const RC_HINWEIS = "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)";

// ---------- Zahlen ----------
// Deutsche Eingabe "1.234,56" -> BigInt mit fester Zahl von Nachkommastellen. Mehrdeutiges wird abgelehnt.
export function parseZahl(text, stellen) {
  const s = String(text ?? "").replace(/[\s€]/g, "");
  const m = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/.exec(s);
  if (!m) return null;
  const nach = m[3] || "";
  if (nach.length > stellen) return null;
  const wert = BigInt(m[2].replace(/\./g, "") + nach.padEnd(stellen, "0"));
  return m[1] ? -wert : wert;
}
// kaufmännisch: Halbe weg von null
function teile(z, n) {
  const neg = (z < 0n) !== (n < 0n);
  const a = z < 0n ? -z : z, b = n < 0n ? -n : n;
  const q = (a * 2n + b) / (b * 2n);
  return neg ? -q : q;
}
export function dezimal(wert, stellen, minStellen = stellen) {
  const neg = wert < 0n;
  let s = (neg ? -wert : wert).toString().padStart(stellen + 1, "0");
  let ganz = s.slice(0, s.length - stellen), nach = s.slice(s.length - stellen);
  while (nach.length > minStellen && nach.endsWith("0")) nach = nach.slice(0, -1);
  return (neg ? "-" : "") + ganz + (nach ? "." + nach : "");
}
export function deutsch(wert, stellen = 2, minStellen = stellen) {
  const [g, n] = dezimal(wert, stellen, minStellen).split(".");
  return g.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (n ? "," + n : "");
}
export const datumDe = (iso) => (iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "");

// ---------- Prüfungen ----------
export function ibanOk(iban) {
  const s = String(iban || "").replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s) || (s.startsWith("DE") && s.length !== 22)) return false;
  const num = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  return BigInt(num) % 97n === 1n;
}
function datumOk(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return false;
  const d = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}
const t = (v) => String(v ?? "").trim();
const mailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t(v));
const ustIdOk = (v) => /^[A-Z]{2}[A-Z0-9+*]{2,12}$/.test(t(v).replace(/\s/g, ""));

// ---------- Rechnen ----------
export function rechne(r) {
  const posten = (r.positionen || []).map((p, i) => {
    const menge = parseZahl(p.menge, 3), preis = parseZahl(p.preis, 4), fall = STEUERFAELLE[p.steuer];
    const netto = menge !== null && preis !== null ? teile(menge * preis, 100000n) : null; // 10^3 * 10^4 -> Cent
    return { nr: i + 1, text: t(p.text), einheit: p.einheit || "C62", menge, preis, netto, fall, steuer: p.steuer };
  });
  const gruppen = new Map();
  for (const p of posten) {
    if (p.netto === null || !p.fall) continue;
    const k = p.fall.id + "|" + p.fall.satz;
    const g = gruppen.get(k) || { id: p.fall.id, satz: p.fall.satz, basis: 0n };
    g.basis += p.netto;
    gruppen.set(k, g);
  }
  const steuern = [...gruppen.values()].map((g) => ({ ...g, steuer: teile(g.basis * g.satz, 100n) }));
  const netto = steuern.reduce((s, g) => s + g.basis, 0n);
  const ust = steuern.reduce((s, g) => s + g.steuer, 0n);
  return { posten, steuern, netto, ust, brutto: netto + ust };
}

export function pruefe(r) {
  const f = [];
  const v = r.verkaeufer || {}, k = r.kaeufer || {};
  const muss = (wert, name) => { if (!t(wert)) f.push(`${name} fehlt.`); };
  for (const [w, n] of [[v.name, "Eigener Firmenname"], [v.strasse, "Eigene Straße"], [v.plz, "Eigene PLZ"], [v.ort, "Eigener Ort"], [v.kontakt, "Ansprechperson"], [v.telefon, "Eigene Telefonnummer"]]) muss(w, n);
  if (!mailOk(v.email)) f.push("Eigene E-Mail-Adresse fehlt oder ist ungültig.");
  if (!t(v.ustid) && !t(v.steuernummer)) f.push("USt-IdNr. oder Steuernummer ist nötig.");
  if (t(v.ustid) && !ustIdOk(v.ustid)) f.push("Eigene USt-IdNr. hat nicht das richtige Format.");
  if (!ibanOk(v.iban)) f.push("IBAN fehlt oder die Prüfziffer stimmt nicht.");
  for (const [w, n] of [[k.name, "Name des Kunden"], [k.strasse, "Straße des Kunden"], [k.plz, "PLZ des Kunden"], [k.ort, "Ort des Kunden"]]) muss(w, n);
  if (!mailOk(k.email)) f.push("E-Mail-Adresse des Kunden fehlt oder ist ungültig (elektronische Adresse, Pflicht in der XRechnung).");
  if (!/^[A-Z]{2}$/.test(t(k.land) || "DE")) f.push("Ländercode des Kunden: zwei Großbuchstaben, z. B. DE.");
  if (t(k.ustid) && !ustIdOk(k.ustid)) f.push("USt-IdNr. des Kunden hat nicht das richtige Format (z. B. DE123456789) – oder Feld leer lassen.");
  muss(r.nummer, "Rechnungsnummer");
  muss(r.referenz, "Käuferreferenz (Leitweg-ID, Bestellnummer oder Kundennummer)");
  if (!datumOk(r.datum)) f.push("Rechnungsdatum fehlt.");
  if (!datumOk(r.leistungVon)) f.push("Leistungsdatum fehlt.");
  if (t(r.leistungBis) && (!datumOk(r.leistungBis) || r.leistungBis < r.leistungVon)) f.push("Ende des Leistungszeitraums liegt vor dem Beginn oder ist ungültig.");
  if (!datumOk(r.faellig)) f.push("Fälligkeitsdatum fehlt.");
  else if (datumOk(r.datum) && r.faellig < r.datum) f.push("Fälligkeit liegt vor dem Rechnungsdatum.");
  const sum = rechne(r);
  if (!sum.posten.length) f.push("Mindestens eine Position ist nötig.");
  for (const p of sum.posten) {
    if (!p.text) f.push(`Position ${p.nr}: Beschreibung fehlt.`);
    if (p.menge === null || p.menge <= 0n) f.push(`Position ${p.nr}: Menge als Zahl größer 0, höchstens 3 Nachkommastellen (z. B. 1,5).`);
    if (p.preis === null || p.preis < 0n) f.push(`Position ${p.nr}: Einzelpreis netto, höchstens 4 Nachkommastellen (z. B. 1.234,50).`);
    if (!p.fall) f.push(`Position ${p.nr}: Steuerfall fehlt.`);
  }
  if (sum.posten.some((p) => p.steuer === "frei") && !t(r.befreiung)) f.push("Grund der Steuerbefreiung fehlt (z. B. § 4 Nr. 11 UStG oder § 19 UStG).");
  if (sum.posten.some((p) => p.steuer === "rc")) {
    if (!ustIdOk(v.ustid)) f.push("Reverse Charge braucht deine USt-IdNr.");
    if (!ustIdOk(k.ustid)) f.push("Reverse Charge braucht die USt-IdNr. des Kunden.");
  }
  return f;
}

// ---------- XML ----------
const esc = (s) => String(s).replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// el(Name, Inhalt, Attribute): leere Inhalte entfallen, Arrays sind Kindelemente
function el(name, inhalt, attr = {}) {
  const a = Object.entries(attr).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
  if (Array.isArray(inhalt)) {
    const kinder = inhalt.filter(Boolean).join("");
    return kinder ? `<${name}${a}>${kinder}</${name}>` : "";
  }
  const s = t(inhalt);
  return s ? `<${name}${a}>${esc(s)}</${name}>` : "";
}
const geld = (name, wert) => el(name, dezimal(wert, 2), { currencyID: "EUR" });
const vat = () => el("cac:TaxScheme", [el("cbc:ID", "VAT")]);

function partei(p, verkaeufer) {
  const ustid = t(p.ustid).replace(/\s/g, "");
  return el("cac:Party", [
    el("cbc:EndpointID", p.email, { schemeID: "EM" }),
    // BR-CO-26: ohne USt-IdNr. und Registernummer braucht der Verkäufer eine andere Kennung
    verkaeufer && !ustid && !t(p.register) && el("cac:PartyIdentification", [el("cbc:ID", p.steuernummer)]),
    el("cac:PostalAddress", [el("cbc:StreetName", p.strasse), el("cbc:CityName", p.ort), el("cbc:PostalZone", p.plz), el("cac:Country", [el("cbc:IdentificationCode", t(p.land) || "DE")])]),
    ustid && el("cac:PartyTaxScheme", [el("cbc:CompanyID", ustid), vat()]),
    verkaeufer && t(p.steuernummer) && el("cac:PartyTaxScheme", [el("cbc:CompanyID", p.steuernummer), el("cac:TaxScheme", [el("cbc:ID", "FC")])]),
    el("cac:PartyLegalEntity", [el("cbc:RegistrationName", p.name), verkaeufer && el("cbc:CompanyID", p.register), verkaeufer && el("cbc:CompanyLegalForm", p.rechtsangaben)]),
    verkaeufer && el("cac:Contact", [el("cbc:Name", p.kontakt), el("cbc:Telephone", p.telefon), el("cbc:ElectronicMail", p.email)]),
  ]);
}

function kategorie(name, g, grund) {
  return el(name, [
    el("cbc:ID", g.id), el("cbc:Percent", g.satz.toString()),
    grund && g.id === "AE" && el("cbc:TaxExemptionReasonCode", "VATEX-EU-AE"),
    grund && g.id === "AE" && el("cbc:TaxExemptionReason", RC_HINWEIS),
    grund && g.id === "E" && el("cbc:TaxExemptionReason", grund),
    vat(),
  ]);
}

export function xrechnung(r) {
  const fehler = pruefe(r);
  if (fehler.length) throw new Error(fehler.join("\n"));
  const v = r.verkaeufer, sum = rechne(r);
  const zeitraum = t(r.leistungBis) && r.leistungBis !== r.leistungVon;
  const inhalt = [
    el("cbc:CustomizationID", "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0"),
    el("cbc:ProfileID", "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"),
    el("cbc:ID", r.nummer), el("cbc:IssueDate", r.datum), el("cbc:DueDate", r.faellig), el("cbc:InvoiceTypeCode", "380"),
    el("cbc:Note", r.hinweis), el("cbc:DocumentCurrencyCode", "EUR"), el("cbc:BuyerReference", r.referenz),
    zeitraum && el("cac:InvoicePeriod", [el("cbc:StartDate", r.leistungVon), el("cbc:EndDate", r.leistungBis)]),
    el("cac:AccountingSupplierParty", [partei(v, true)]),
    el("cac:AccountingCustomerParty", [partei(r.kaeufer, false)]),
    !zeitraum && el("cac:Delivery", [el("cbc:ActualDeliveryDate", r.leistungVon)]),
    el("cac:PaymentMeans", [
      el("cbc:PaymentMeansCode", "58"), el("cbc:PaymentID", r.nummer),
      el("cac:PayeeFinancialAccount", [el("cbc:ID", t(v.iban).replace(/\s/g, "").toUpperCase()), el("cbc:Name", v.kontoinhaber || v.name),
        t(v.bic) && el("cac:FinancialInstitutionBranch", [el("cbc:ID", t(v.bic).toUpperCase())])]),
    ]),
    el("cac:PaymentTerms", [el("cbc:Note", `Zahlbar bis ${datumDe(r.faellig)} ohne Abzug.`)]),
    el("cac:TaxTotal", [geld("cbc:TaxAmount", sum.ust), ...sum.steuern.map((g) => el("cac:TaxSubtotal", [
      geld("cbc:TaxableAmount", g.basis), geld("cbc:TaxAmount", g.steuer), kategorie("cac:TaxCategory", g, g.id === "S" ? "" : r.befreiung || "x"),
    ]))]),
    el("cac:LegalMonetaryTotal", [geld("cbc:LineExtensionAmount", sum.netto), geld("cbc:TaxExclusiveAmount", sum.netto), geld("cbc:TaxInclusiveAmount", sum.brutto), geld("cbc:PayableAmount", sum.brutto)]),
    ...sum.posten.map((p) => el("cac:InvoiceLine", [
      el("cbc:ID", String(p.nr)), el("cbc:InvoicedQuantity", dezimal(p.menge, 3, 0), { unitCode: p.einheit }), geld("cbc:LineExtensionAmount", p.netto),
      el("cac:Item", [el("cbc:Name", p.text), kategorie("cac:ClassifiedTaxCategory", p.fall, "")]),
      el("cac:Price", [el("cbc:PriceAmount", dezimal(p.preis, 4, 2), { currencyID: "EUR" })]),
    ])),
  ].filter(Boolean).join("\n");
  return '<?xml version="1.0" encoding="UTF-8"?>\n<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ' +
    'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ' +
    'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">\n' + inhalt + "\n</ubl:Invoice>\n";
}

export function dateiname(r) {
  return "Rechnung_" + (t(r.nummer).replace(/[^A-Za-z0-9ÄÖÜäöüß._-]+/g, "-").slice(0, 60) || "ohne-Nummer") + ".xml";
}
