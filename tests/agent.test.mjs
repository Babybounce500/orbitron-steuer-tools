// Agent mit nachgestelltem Modell (kein Netz): Werkzeuge, Prüfungen, Fehlerfälle. Erfundene Daten.
import test from "node:test";
import assert from "node:assert/strict";
import * as A from "../web/agent-core.js";
import { fmtCent, restrisiko } from "../web/extractor-core.js";
import { bewerte } from "../web/geldmodus.js";

const h = { fmt: fmtCent, rechne: (a) => { const r = bewerte(a); return r.ok ? { ok: true, text: r.gerundet, cent: r.skaliert } : r; } };
const ROWS = [
  { datum: "2025-01-02", text: "Lastschrift Stadtwerke Teststadt", cent: -8550n },
  { datum: "2025-01-05", text: "Eingang FIRMA_01 Rechnung 7", cent: 250000n },
  { datum: "2025-01-15", text: "Dauerauftrag ADRESSE_01", cent: -95000n },
  { datum: "2025-01-20", text: "REPLIT, INC.", cent: -5109n },
  { datum: "2025-02-01", text: "Qonto Abonnement", cent: -900n },
  { datum: "2025-02-01", text: "Qonto Abonnement", cent: -900n },
];
const antwort = (parts) => ({ status: 200, json: { candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } } });
const ruf = (name, args) => ({ functionCall: { name, args, id: "c1" } });

test("Regeln ordnen eindeutige Fälle ohne KI zu", () => {
  const z = A.zustand(ROWS);
  assert.deepEqual(z.buchungen.map((b) => b.kategorie), ["Energie", null, null, "Software und Cloud", "Bankgebühren", "Bankgebühren"]);
  assert.equal(A.regelKategorie("Google Ads 123", -100n), "Werbung");
});
test("Summen sind exakt und Doppelbuchung wird gefunden", () => {
  const z = A.zustand(ROWS), s = A.summen(z, h);
  assert.equal(s.einnahmen.summe, "2.500,00"); 
  assert.equal(s.ausgaben.cent, -(8550n + 95000n + 5109n + 900n + 900n));
  assert.equal(s.saldo.cent, 250000n + s.ausgaben.cent);
  assert.ok(A.auffaelligkeiten(z, h).some((a) => a.art === "Mögliche Doppelbuchung" && a.ids.join() === "5,6"));
});
test("Kategorisieren: nur offene Buchungen, fremde IDs und Kategorien werden verworfen", async () => {
  const z = A.zustand(ROWS);
  let gesendet;
  await A.kategorisiere(z, async (body) => { gesendet = body; return antwort([ruf("kategorien_setzen", { zuordnungen: [{ id: 2, kategorie: "Erlöse", unsicher: false }, { id: 3, kategorie: "Miete und Raum", unsicher: true }, { id: 1, kategorie: "Werbung", unsicher: false }, { id: 99, kategorie: "Erlöse", unsicher: false }, { id: 2, kategorie: "Erfunden", unsicher: false }] })]); }, h);
  assert.equal(z.buchungen[0].kategorie, "Energie"); // von Regel, Modell darf sie nicht überschreiben
  assert.equal(z.buchungen[1].kategorie, "Erlöse"); assert.equal(z.buchungen[2].unsicher, true);
  const text = gesendet.contents[0].parts[0].text;
  assert.ok(text.includes("2 | 2025-01-05") && !text.includes("Stadtwerke"), "nur offene Zeilen werden gesendet");
});
test("Analyse: Werkzeuge laufen lokal, erfundene Zahlen werden markiert", async () => {
  const z = A.zustand(ROWS);
  const antworten = [
    antwort([ruf("summen", {})]),
    antwort([ruf("rechnen", { ausdruck: "netto(2.500,00;19)" }), ruf("frage_notieren", { frage: "Ist ADRESSE_01 die Betriebsstätte?", ids: [3, 77] })]),
    antwort([ruf("bericht_abschliessen", { zusammenfassung: "Einnahmen 2.500,00 EUR, netto 2.100,84 EUR, am 05.01.2025. Gewinn 9.999,99 EUR.", hinweise: ["USt 19 % prüfen"] })]),
  ];
  const bodies = [];
  const e = await A.analysiere(z, async (b) => { bodies.push(JSON.parse(JSON.stringify(b))); return antworten.shift(); }, h);
  assert.deepEqual(e.ungeprueft, ["9.999,99"]);
  assert.deepEqual(z.fragen, [{ frage: "Ist ADRESSE_01 die Betriebsstätte?", ids: [3] }]);
  const resp = bodies[1].contents.at(-1).parts[0].functionResponse;
  assert.equal(resp.id, "c1"); assert.equal(resp.response.einnahmen, "2.500,00");
});
test("Analyse endet auch, wenn das Modell nie abschließt", async () => {
  const z = A.zustand(ROWS);
  let n = 0, letzteConfig;
  await A.analysiere(z, async (b) => { n++; letzteConfig = b.toolConfig; return antwort([ruf("summen", {})]); }, h, () => {}, 3);
  assert.equal(n, 3); assert.deepEqual(letzteConfig.functionCallingConfig.allowedFunctionNames, ["bericht_abschliessen"]);
});
test("Proxy-Fehler: 429 wird wiederholt, 400 sofort gemeldet", async () => {
  let n = 0;
  const r = await A.ruf(async () => (++n < 2 ? { status: 429, json: {} } : antwort([{ text: "ok" }])), {}, async () => {});
  assert.equal(r.parts[0].text, "ok"); assert.equal(n, 2);
  n = 0;
  await assert.rejects(A.ruf(async () => { n++; return { status: 400, json: { error: "zu groß" } }; }, {}, async () => {}), /HTTP 400/);
  assert.equal(n, 1);
});
test("Dokument: nur wörtlich belegte Angaben gelten als belegt", async () => {
  const text = "PERSON_01 leiht PERSON_02 am 05.01.2025 den Betrag 1.000,00 EUR.\nZinssatz 5 %.";
  const json = { dokumenttyp: "Darlehen", zusammenfassung: "Darlehen über 1.000,00 EUR, Gebühr 50,00 EUR.", daten: [{ datum: "05.01.2025", bedeutung: "Auszahlung", zitat: "am 05.01.2025" }], betraege: [{ betrag: "1.000,00 EUR", bedeutung: "Darlehen", zitat: "Betrag 1.000,00 EUR" }, { betrag: "2.000,00 EUR", bedeutung: "falsch", zitat: "Betrag 1.000,00 EUR" }, { betrag: "50,00 EUR", bedeutung: "erfunden", zitat: "Gebühr 50,00 EUR" }] };
  const d = await A.analysiereDokument(text, async () => antwort([{ text: JSON.stringify(json) }]));
  assert.deepEqual(d.betraege.map((b) => b.belegt), [true, false, false]);
  assert.equal(d.daten[0].belegt, true); assert.deepEqual(d.ungeprueft, ["50,00"]);
});
test("Sendeprüfung blockiert IBAN, E-Mail und bekannte Namen", () => {
  assert.equal(A.pruefeSendung("DE89 3704 0044 0532 0130 00", restrisiko).ok, false);
  assert.equal(A.pruefeSendung("a@b.de", restrisiko).ok, false);
  assert.equal(A.pruefeSendung("Zahlung an Erika Beispiel", restrisiko).ok, false);
  assert.equal(A.pruefeSendung("1 | 2025-01-05 | Eingang FIRMA_01 | 2.500,00", restrisiko).ok, true);
});
test("CSV vom Extractor lesen, eigene CSV entschärft Formeln", () => {
  const rows = A.leseCsv('﻿Datum;Text;Betrag\r\n2025-01-02;"a ""b""; c";-1.085,50\r\nkaputt');
  assert.deepEqual(rows, [{ datum: "2025-01-02", text: 'a "b"; c', cent: -108550n }]);
  assert.equal(A.leseCsv("irgendwas"), null);
  const z = A.zustand([{ datum: "2025-01-01", text: "=HYPERLINK(1)", cent: 1n }]);
  assert.ok(A.buchungenCsv(z, h).includes('"\'=HYPERLINK(1)"'));
  assert.match(A.berichtMarkdown(z, null, h), /## Buchungen/);
});

test("Sende-Sperre erkennt unanonymisierte Angaben, lässt anonymisierte durch", async () => {
  const { pseudonymisiere } = await import("../web/extractor-core.js");
  const p = (t) => A.pruefeSendung(t, restrisiko, pseudonymisiere);
  for (const t of ["Herr Muster wohnt Musterstraße 12, 12345 Teststadt", "geboren am 01.02.1980", "Rückfragen an 0999 1234567", "Steuer-ID 65929970489", "Vertrag mit Beispiel Handel GmbH"]) assert.equal(p(t).ok, false, t);
  const anon = pseudonymisiere("Kontoinhaber: Erika Beispiel\n02.01.2025 Miete Beispielstraße 5 -950,00\nGehalt Muster Handels GmbH, erika@example.de").text;
  assert.deepEqual(p(anon), { ok: true, gruende: [] }, anon);
});
test("Lange Dokumente: abgeschnittene Antwort wird in kleineren Teilen wiederholt", async () => {
  const text = "PERSON_01 zahlt 100,00 EUR.\n".repeat(700);
  const laengen = [];
  const d = await A.analysiereDokument(text, async (b) => {
    const t = b.contents[0].parts[0].text; laengen.push(t.length);
    return antwort([{ text: t.length > 6000 ? '{"dokumenttyp": "abgeschn' : JSON.stringify({ dokumenttyp: "Liste", zusammenfassung: "ok", daten: [], betraege: [] }) }]);
  });
  assert.equal(d.dokumenttyp, "Liste"); assert.ok(Math.max(...laengen) <= A.TEIL + 200); assert.ok(laengen.length > 3);
});
test("CSV des Anonymisierers entschärft Formeln", async () => {
  const { alsCsv } = await import("../web/extractor-core.js");
  assert.ok(alsCsv([{ datum: "2025-01-01", text: "=cmd()", cent: 1n }]).includes('"\'=cmd()"'));
});
