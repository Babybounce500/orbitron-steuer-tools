import * as K from "./extractor-core.js";
import * as G from "./geldmodus.js";
import * as A from "./agent-core.js";
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const pill = (t, k) => el("span", "pill " + k, t);

const h = { fmt: K.fmtCent, rechne: (a) => { const r = G.bewerte(a); return r.ok ? { ok: true, text: r.gerundet, cent: r.skaliert } : r; } };
let quelle = null;   // {typ, rows, text, meta, tabelle, herkunft}
let lauf = null;     // {z, erg, dok, protokoll}
let abbruch = null;

function schritt(n) { document.querySelectorAll("#steps li").forEach((li) => { const s = +li.dataset.s; li.className = s < n ? "done" : s === n ? "on" : ""; }); }
function status(t, fehler) { const s = $("stat"); s.textContent = t || ""; s.className = "status" + (fehler ? " err" : ""); }

// ---------- Daten laden ----------
function ausText(text, herkunft) {
  const csv = A.leseCsv(text);
  const rows = csv || (() => { const z = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean); return K.parseBuchungen(z).map((r) => ({ datum: r.datum, text: r.text, cent: r.cent })); })();
  return { typ: rows.length >= 2 ? "buchungen" : "dokument", rows, text: csv ? "" : text, meta: {}, tabelle: null, herkunft };
}
function setzeQuelle(q) {
  quelle = q; lauf = null;
  $("ergebnis").hidden = true; $("freigabe").checked = false;
  $("artWahl").hidden = false;
  $("artB").disabled = !q.rows.length; $("artD").disabled = !q.text;
  $("artB").checked = q.typ === "buchungen"; $("artD").checked = q.typ === "dokument";
  zeigeVorschau();
}
function sendeText() { return quelle.typ === "buchungen" ? quelle.rows.map((r, i) => A.buchungsZeile({ id: i + 1, datum: r.datum, text: r.text, cent: r.cent }, h)).join("\n") : quelle.text; }
function zeigeVorschau() {
  const text = sendeText();
  $("quelle").textContent = `${quelle.herkunft}: ${quelle.rows.length} Buchungen erkannt.` + (quelle.meta.hinweis ? " " + quelle.meta.hinweis : "");
  $("pruefen").hidden = false; $("vorschau").textContent = text;
  $("sendInfo").textContent = quelle.typ === "buchungen" ? `${quelle.rows.length} Buchungszeilen (Nummer, Datum, Text, Betrag). Es wird nichts anderes mitgeschickt.` : `Der gesamte Text des Dokuments (${text.length.toLocaleString("de-DE")} Zeichen, in ${A.teileText(text).length} Teil(en)).`;
  // ";" zwischen den Zeilen verhindert, dass die Prüfung Funde über zwei Buchungen hinweg bildet
  const klartext = quelle.typ === "buchungen" ? quelle.rows.map((r) => r.text).join("\n;\n") : text;
  const p = A.pruefeSendung(klartext, K.restrisiko, K.pseudonymisiere);
  if (!text.trim()) { p.ok = false; p.gruende.push("Kein Text vorhanden"); }
  if (text.length > 400000) { p.ok = false; p.gruende.push("Zu groß, bitte aufteilen"); }
  $("sperre").textContent = p.ok ? "" : "Senden gesperrt: " + p.gruende.join("; ") + ". Anonymisiere den Text erneut oder ergänze die Namen im Anonymisierer.";
  $("freigabe").disabled = !p.ok; if (!p.ok) $("freigabe").checked = false;
  $("start").disabled = !$("freigabe").checked; status(""); schritt(2);
}
["artB", "artD"].forEach((i) => ($(i).onchange = () => { quelle.typ = $(i).value; $("freigabe").checked = false; $("ergebnis").hidden = true; zeigeVorschau(); }));
$("freigabe").onchange = () => ($("start").disabled = !$("freigabe").checked);
$("datei").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 2 * 1024 * 1024) { $("quelle").textContent = "Datei größer als 2 MB."; return; } setzeQuelle(ausText(await f.text(), "Datei geladen")); };
$("uebernehmen").onclick = () => { if ($("eingabe").value.trim()) setzeQuelle(ausText($("eingabe").value, "Eingefügter Text")); };
$("beispiel").onclick = () => setzeQuelle({ typ: "buchungen", herkunft: "Beispieldaten (erfunden)", tabelle: null, text: "", meta: {}, rows: [
  ["2025-01-02", "Lastschrift Stadtwerke Teststadt", -8550], ["2025-01-05", "Eingang FIRMA_01 Rechnung 2025-001", 250000], ["2025-01-15", "Dauerauftrag Büromiete ADRESSE_01", -95000], ["2025-01-20", "REPLIT, INC.", -5109],
  ["2025-01-31", "Qonto Abonnement", -900], ["2025-02-03", "MEDIAMARKT Notebook", -89900], ["2025-02-07", "Eingang PERSON_01 Gesellschafterdarlehen", 100000], ["2025-02-14", "Restaurant Sonne", -6420],
  ["2025-02-20", "Finanzamt Teststadt Umsatzsteuer", -28500], ["2025-02-28", "Eingang FIRMA_02 Rechnung 2025-002", 178500], ["2025-02-28", "Qonto Abonnement", -900], ["2025-02-28", "Qonto Abonnement", -900],
].map(([datum, text, c]) => ({ datum, text, cent: BigInt(c) })) });

// Übergabe aus dem Anonymisierer
try {
  const roh = sessionStorage.getItem("orbitron-uebergabe");
  if (roh) {
    const u = JSON.parse(roh);
    const rows = (u.rows || []).map((r) => ({ datum: r.datum, text: r.text, cent: BigInt(r.cent) }));
    const hinweis = u.verloren ? `Achtung: ${u.verloren} Buchung(en) fehlen in der anonymisierten Liste.` : "";
    setzeQuelle({ typ: rows.length >= 2 ? "buchungen" : "dokument", rows, text: u.text || "", tabelle: u.tabelle || null, herkunft: "Aus dem Anonymisierer übernommen", meta: { summencheck: u.summencheck || "unbekannt", hinweis } });
  }
} catch (e) { /* Speicher nicht verfügbar: Datei oder Text benutzen */ }

// ---------- Auswerten ----------
async function transport(body) {
  if (window.ORBITRON_TRANSPORT) return window.ORBITRON_TRANSPORT(body);
  abbruch = abbruch || new AbortController();
  const zeit = AbortSignal.timeout && AbortSignal.any ? AbortSignal.any([abbruch.signal, AbortSignal.timeout(90000)]) : abbruch.signal;
  let res;
  try {
    res = await fetch(`${A.PROXY}/gemini/models/${A.MODELL}/generateContent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: zeit, referrerPolicy: "no-referrer", credentials: "omit" });
  } catch (e) { throw new Error(abbruch.signal.aborted ? "Abgebrochen." : "Proxy nicht erreichbar (Internet oder Replit prüfen)."); }
  let json = {}; try { json = await res.json(); } catch (e) {}
  return { status: res.status, json };
}
$("stopp").onclick = () => abbruch && abbruch.abort();
$("start").onclick = async () => {
  if (!$("freigabe").checked) return;
  abbruch = new AbortController();
  $("start").disabled = true; $("stopp").hidden = false; $("ergebnis").hidden = true;
  const melde = (t) => status(t);
  try {
    if (quelle.typ === "buchungen") {
      const z = A.zustand(quelle.rows, quelle.meta);
      lauf = { z, erg: null, dok: null };
      await A.kategorisiere(z, transport, h, melde);
      lauf.erg = await A.analysiere(z, transport, h, melde);
    } else {
      const protokoll = [];
      const dok = await A.analysiereDokument(quelle.text, transport, melde, protokoll);
      lauf = { z: null, erg: null, dok, protokoll };
    }
    status("Fertig."); zeichne(); schritt(3); $("ergebnis").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    // Teilergebnis (lokale Summen, bisherige Zuordnungen) bleibt nutzbar
    status(e.message + (lauf && lauf.z ? " Die lokalen Summen und bisherigen Zuordnungen siehst du unten." : ""), true);
    if (lauf && lauf.z) zeichne();
  } finally { $("start").disabled = !$("freigabe").checked; $("stopp").hidden = true; abbruch = null; }
};

// ---------- Anzeige ----------
function tabelle(t, kopf, zeilen) {
  t.textContent = "";
  const tr = t.createTHead().insertRow(); kopf.forEach(([x, k]) => tr.append(el("th", k || "", x)));
  const b = t.createTBody();
  zeilen.forEach((z) => { const r = b.insertRow(); z.forEach((v, i) => { const c = r.insertCell(); c.className = kopf[i][1] || ""; if (v instanceof Node) c.append(v); else c.textContent = v; }); });
}
function liste(titel, eintraege) { const d = el("div"); d.append(el("h3", null, titel)); const ul = el("ul"); (eintraege.length ? eintraege : ["Keine."]).forEach((x) => ul.append(el("li", null, x))); d.append(ul); return d; }
function warnZahlen(l) { return el("p", "status err", "Diese Zahlen im KI-Text ließen sich nicht nachrechnen, bitte nicht übernehmen: " + l.join(", ")); }
function zeichne() {
  $("ergebnis").hidden = false;
  const buch = !!lauf.z;
  ["auffKarte", "katKarte", "buchKarte"].forEach((i) => ($(i).hidden = !buch)); $("dokKarte").hidden = buch; $("x-csv").hidden = !buch;
  $("klarWrap").hidden = !quelle.tabelle;
  const ki = $("ki"); ki.textContent = "";
  const erg = buch ? lauf.erg : lauf.dok;
  if (erg && erg.zusammenfassung) {
    erg.zusammenfassung.split(/\n+/).filter(Boolean).forEach((p) => ki.append(el("p", null, p)));
    if (buch && erg.hinweise.length) ki.append(liste("Hinweise", erg.hinweise));
    ki.append(erg.ungeprueft.length ? warnZahlen(erg.ungeprueft) : pill(buch ? "Alle Beträge im Text stimmen mit den berechneten Werten überein" : "Alle Beträge im Text kommen im Dokument vor", "ok"));
  } else ki.append(el("p", "muted", "Keine Zusammenfassung vorhanden."));
  if (buch) zeichneBuchungen(); else zeichneDokument();
  const proto = buch ? lauf.z.protokoll : lauf.protokoll;
  const ein = proto.reduce((a, x) => a + x.ein, 0), aus = proto.reduce((a, x) => a + x.aus, 0);
  $("verbrauch").textContent = `${proto.length} Anfragen · ${ein.toLocaleString("de-DE")} Eingabe- und ${aus.toLocaleString("de-DE")} Ausgabe-Token · geschätzt ${((ein * 0.3 + aus * 2.5) / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 4, minimumFractionDigits: 4 })} US-Dollar (Listenpreis Gemini 3.5 Flash-Lite)`;
}
function zeichneBuchungen() {
  const z = lauf.z, s = A.summen(z, h), a = A.auffaelligkeiten(z, h);
  const kpi = $("kpi"); kpi.textContent = "";
  const karte = (titel, gross, unten) => { const d = el("div", "card kpi"); d.append(el("h3", null, titel), el("div", "big", gross), unten); return d; };
  kpi.append(karte("Einnahmen", s.einnahmen.summe + " €", pill(s.anzahl + " Buchungen", "neu")), karte("Ausgaben", s.ausgaben.summe + " €", pill("Saldo " + s.saldo.summe + " €", "neu")),
    karte("Zu prüfen", String(a.reduce((n, x) => n + (x.art === "Privat prüfen" || x.art === "KI unsicher" || x.art === "Ohne Kategorie" ? x.ids.length : 1), 0)), pill(z.meta.summencheck === "ok" ? "Auszug: Summe stimmt" : "Auszug: Summe " + (z.meta.summencheck === "abweichung" ? "weicht ab" : "nicht geprüft"), z.meta.summencheck === "ok" ? "ok" : z.meta.summencheck === "abweichung" ? "bad" : "warn")));
  const au = $("auff"); au.textContent = "";
  au.append(liste("Auffälligkeiten (lokal geprüft)", a.map((x) => `${x.art}: ${x.text} (Nr. ${x.ids.slice(0, 15).join(", ")})`)), liste("Offene Fragen (von der KI)", z.fragen.map((f) => f.frage + (f.ids.length ? ` (Nr. ${f.ids.join(", ")})` : ""))));
  tabelle($("katTab"), [["Kategorie"], ["Anzahl", "r"], ["Summe €", "r"]], s.kategorien.map((k) => [k.name, String(k.anzahl), k.summe]));
  tabelle($("monTab"), [["Monat"], ["Anzahl", "r"], ["Summe €", "r"]], s.monate.map((m) => [m.name, String(m.anzahl), m.summe]));
  tabelle($("buchTab"), [["Nr.", "r"], ["Datum"], ["Text"], ["Betrag €", "r"], ["Kategorie"], ["Herkunft"]], z.buchungen.map((b) => {
    const sel = el("select"); sel.setAttribute("aria-label", "Kategorie für Buchung " + b.id);
    sel.style.cssText = "font:inherit;padding:4px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink)";
    ["", ...A.KATEGORIEN].forEach((k) => { const o = el("option", null, k || "– offen –"); o.value = k; sel.append(o); });
    sel.value = b.kategorie || "";
    sel.onchange = () => {
      b.kategorie = sel.value || null; b.quelle = "manuell"; b.unsicher = false;
      if (lauf.erg && !lauf.veraltet) { lauf.veraltet = true; lauf.erg.hinweise.push("Kategorien wurden nach dieser Einschätzung von Hand geändert. Die Summen sind aktuell, der KI-Text beschreibt den früheren Stand."); }
      zeichne();
    };
    return [String(b.id), b.datum, b.text, h.fmt(b.cent), sel, b.unsicher ? pill("KI unsicher", "warn") : (b.quelle || "")];
  }));
}
function zeichneDokument() {
  const d = lauf.dok;
  const kpi = $("kpi"); kpi.textContent = "";
  const alle = [...d.betraege, ...d.daten, ...d.fristen], ok = alle.filter((x) => x.belegt).length;
  const karte = (titel, gross, unten) => { const c = el("div", "card kpi"); c.append(el("h3", null, titel), el("div", "big", gross), unten); return c; };
  kpi.append(karte("Dokumenttyp", d.dokumenttyp || "unbekannt", pill("von der KI bestimmt", "neu")), karte("Belegstellen", ok + " / " + alle.length, pill(ok === alle.length ? "Alle wörtlich belegt" : (alle.length - ok) + " nicht belegt", ok === alle.length ? "ok" : "bad")), karte("Offene Fragen", String(d.offene_fragen.length), pill("siehe unten", "neu")));
  const box = $("dok"); box.textContent = "";
  const block = (titel, eintraege, feld) => {
    box.append(el("h3", null, titel));
    if (!eintraege.length) { box.append(el("p", "muted", "Keine.")); return; }
    const w = el("div", "tablewrap"), t = el("table"); w.append(t); box.append(w); w.style.marginBottom = "14px";
    tabelle(t, [["Wert"], ["Bedeutung"], ["Belegstelle"], ["Geprüft"]], eintraege.map((e) => [e[feld], e.bedeutung, e.zitat, e.belegt ? pill("belegt", "ok") : pill("nicht belegt", "bad")]));
  };
  block("Beträge", d.betraege, "betrag"); block("Daten", d.daten, "datum"); block("Fristen", d.fristen, "frist");
  box.append(liste("Parteien", d.parteien.map((p) => `${p.name}: ${p.rolle}`)), liste("Offene Fragen", d.offene_fragen));
}

// ---------- Speichern ----------
function mitKlarnamen(text) { return $("klar").checked && quelle.tabelle ? K.reidentifiziere(text, quelle.tabelle) : text; }
function speichern(name, text, typ, bom) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([(bom ? "﻿" : "") + text], { type: typ + ";charset=utf-8" })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function dokBericht(d) {
  const t = (titel, l, f) => ["", "## " + titel, "", ...(l.length ? l.map((e) => `- ${e[f]}: ${e.bedeutung} ${e.belegt ? "(belegt: „" + e.zitat + "“)" : "(NICHT BELEGT)"}`) : ["- keine"])];
  return ["# Dokument-Auswertung (Vorbereitung, keine Rechtsberatung)", "", "Typ: " + d.dokumenttyp, "", d.zusammenfassung, ...(d.ungeprueft.length ? ["", "**Nicht im Dokument gefundene Zahlen:** " + d.ungeprueft.join(", ")] : []),
    ...t("Beträge", d.betraege, "betrag"), ...t("Daten", d.daten, "datum"), ...t("Fristen", d.fristen, "frist"), "", "## Parteien", "", ...d.parteien.map((p) => `- ${p.name}: ${p.rolle}`), "", "## Offene Fragen", "", ...(d.offene_fragen.length ? d.offene_fragen.map((x) => "- " + x) : ["- keine"])].join("\n");
}
$("x-md").onclick = () => speichern("auswertung.md", mitKlarnamen(lauf.z ? A.berichtMarkdown(lauf.z, lauf.erg, h) : dokBericht(lauf.dok)), "text/markdown", false);
$("x-csv").onclick = () => speichern("buchungen-kategorisiert.csv", mitKlarnamen(A.buchungenCsv(lauf.z, h)), "text/csv", true);
$("x-druck").onclick = () => window.print();
