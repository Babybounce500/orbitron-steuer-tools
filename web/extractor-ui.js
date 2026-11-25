import * as K from "./extractor-core.js";
import * as L from "./leser.js";
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

let namen = [];          // vom Anwender ergänzte Namen
let ergebnis = null;     // letztes Auswertungsergebnis
let geladeneTabelle = null; // aus Datei geladene Zuordnung (zum Zurückübersetzen)
let timer = null;
let ocrInfo = null;     // Angaben zur Texterkennung (null = Text kam direkt aus dem PDF)

if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

async function pdfZuZeilen(file) {
  return (await L.pdfLesen(file, K.gruppiereZeilen, status)).zeilen;
}

function status(text, fehler) { const s = $("stat"); s.textContent = text || ""; s.className = "status" + (fehler ? " err" : ""); }
function schritt(n) {
  document.querySelectorAll("#steps li").forEach((li) => {
    const s = +li.dataset.s;
    li.className = s < n ? "done" : s === n ? "on" : "";
  });
}

// ---------- Eingabe ----------
const drop = $("drop");
drop.addEventListener("click", () => $("pdf").click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("pdf").click(); } });
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => ladeDateien(e.dataTransfer.files));
$("pdf").addEventListener("change", (e) => ladeDateien(e.target.files));

async function ladeDateien(fileList) {
  const files = [...fileList].filter((f) => L.istPdf(f) || L.istBild(f));
  if (!files.length) return status("Bitte eine PDF- oder Bilddatei wählen (PNG, JPG, WEBP).", true);
  status("Lese " + files.length + " Datei(en) …");
  $("go").disabled = true;
  $("frei").checked = false; aktualisiereFreigabe(); // alte Freigabe gilt nicht für die neue Datei
  try {
    const r = await L.liesDateien(files, K.gruppiereZeilen, status);
    if (!r.text.trim()) return status("Kein Text gefunden. Ist das Bild scharf und gut beleuchtet?", true);
    ocrInfo = r.ocr;
    $("roh").value = r.text;
    status(files.map((f) => f.name).join(", ") + " gelesen. Dateinamen werden nicht weitergegeben.");
    auswerten();
  } catch (err) { status("Datei nicht lesbar: " + (err && err.message ? err.message : err), true); }
  finally { $("go").disabled = false; $("pdf").value = ""; }
}
// Screenshot aus der Zwischenablage (Strg+V)
document.addEventListener("paste", (e) => {
  const bilder = [...((e.clipboardData && e.clipboardData.files) || [])].filter(L.istBild);
  if (bilder.length) { e.preventDefault(); ladeDateien(bilder); }
});
$("roh").addEventListener("input", () => { ocrInfo = null; });

// ---------- Namen als Chips ----------
function zeichneChips() {
  const box = $("chips"); box.textContent = "";
  namen.forEach((n, i) => {
    const c = el("span", "chip"); c.append(n);
    const b = el("button", null, "×"); b.type = "button"; b.setAttribute("aria-label", n + " entfernen");
    b.onclick = () => { namen.splice(i, 1); zeichneChips(); neuBerechnen(); };
    c.append(b); box.append(c);
  });
}
function addNamen(text) {
  let neu = false;
  for (const n of String(text).split(",").map((s) => s.trim()).filter(Boolean)) if (!namen.includes(n)) { namen.push(n); neu = true; }
  if (neu) { zeichneChips(); neuBerechnen(); }
}
function neuBerechnen() { if (!ergebnis) return; clearTimeout(timer); timer = setTimeout(auswerten, 250); }
$("namenIn").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addNamen($("namenIn").value); $("namenIn").value = ""; }
  else if (e.key === "Backspace" && !$("namenIn").value && namen.length) { namen.pop(); zeichneChips(); neuBerechnen(); }
});
$("namenIn").addEventListener("blur", () => { if ($("namenIn").value.trim()) { addNamen($("namenIn").value); $("namenIn").value = ""; } });
$("chipbox").addEventListener("click", () => $("namenIn").focus());
$("refs").addEventListener("change", neuBerechnen);

// ---------- Auswertung ----------
const PH = /\b(?:IBAN|BIC|PERSON|FIRMA|EMAIL|TEL|REF|STNR|STEUERID|ADRESSE|PLZORT|GEBDATUM|NACHNAME|VORNAME|URL)_\d{2,}\b/g;
function zeigeText(pre, text) {
  pre.textContent = "";
  let last = 0;
  for (const m of text.matchAll(PH)) { pre.append(text.slice(last, m.index)); pre.append(el("span", "ph", m[0])); last = m.index + m[0].length; }
  pre.append(text.slice(last));
}
const pill = (text, kind) => el("span", "pill " + kind, text);

function auswerten() {
  clearTimeout(timer);
  if ($("namenIn").value.trim()) { namen.push(...$("namenIn").value.split(",").map((s) => s.trim()).filter((s) => s && !namen.includes(s))); $("namenIn").value = ""; zeichneChips(); }
  const roh = $("roh").value;
  if (!roh.trim()) { status("Bitte zuerst eine PDF wählen oder Text einfügen.", true); return; }
  status("");
  const zeilen = roh.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  const rows = K.parseBuchungen(zeilen);
  const salden = K.findeSalden(zeilen);
  const sc = K.summencheck(rows, salden);
  const q = K.qualitaet(zeilen, rows);
  const an = K.pseudonymisiere(roh, { eigeneNamen: namen, referenzenMaskieren: $("refs").checked });
  const rest = K.restrisiko(an.text);
  if (ocrInfo && rest.stufe === "niedrig") rest.stufe = "mittel"; // erkannter Text kann Lesefehler enthalten
  const anRows = K.parseBuchungen(an.text.split(String.fromCharCode(10)).map((z) => z.trim()).filter(Boolean));
  const vorher = ergebnis;
  ergebnis = { rows, anRows, salden, sc, an, rest, q };
  zeigeNurReid(false);
  $("ergebnis").hidden = false;
  $("ocrWarn").hidden = !ocrInfo; $("ocrWarn").textContent = L.ocrHinweis(ocrInfo);
  zeichneKpi(); zeichneBuchungen(); zeichneNamenTab();
  zeigeText($("anon"), an.text);
  $("frei").checked = false; aktualisiereFreigabe();
  schritt(2);
  if (!vorher) $("kpi").scrollIntoView({ behavior: "smooth", block: "start" });
  if (rest.stufe === "hoch") aktiviere("p-namen");
}

function zeichneKpi() {
  const { rows, sc, an, rest, q } = ergebnis;
  const kpi = $("kpi"); kpi.textContent = "";
  // 1) Zahlen
  const a = el("div", "card kpi"); a.append(el("h3", null, "Zahlen"), el("div", "big", rows.length ? rows.length + " Buchungen" : "Keine Buchungen"));
  if (!rows.length) a.append(pill("Kein Kontoauszug erkannt (bei Verträgen normal)", "neu"));
  else if (sc.status === "ok") a.append(pill("Summe stimmt auf den Cent", "ok"));
  else if (sc.status === "abweichung") a.append(pill((sc.abweichung != null && sc.abweichung !== 0n ? "Abweichung " + K.fmtCent(sc.abweichung) + " €" : "") + (sc.inkonsistent ? " " + sc.inkonsistent + " Zeile(n) passen nicht zum Guthaben" : "") + ". Auszug prüfen", "bad"));
  else a.append(pill("Anfangs-/Endsaldo nicht gefunden: Summe nicht prüfbar", "warn"));
  if (rows.length) { const s = el("p", "muted", "Format: " + (rows.format || "unbekannt") + " · Summe " + K.fmtCent(sc.summe) + " €" + (q < 0.9 ? " · nur " + Math.round(q * 100) + " % der Datumszeilen erkannt" : "")); s.style.marginTop = "8px"; a.append(s); }
  // 2) Anonymisierung
  const b = el("div", "card kpi"); b.append(el("h3", null, "Anonymisierung"), el("div", "big", Object.keys(an.tabelle).length + " Platzhalter"));
  b.append(pill(an.gelernt.length + " Namen automatisch erkannt", an.gelernt.length ? "ok" : "neu"));
  // 3) Restrisiko
  const c = el("div", "card kpi"); c.append(el("h3", null, "Restrisiko"));
  c.append(el("div", "big", rest.stufe === "niedrig" ? "Niedrig" : rest.stufe === "mittel" ? "Mittel" : "Hoch"));
  c.append(pill(rest.stufe === "niedrig" ? "Nichts Auffälliges" : rest.stufe === "mittel" ? "Bitte Text prüfen" : "Export gesperrt", rest.stufe === "niedrig" ? "ok" : rest.stufe === "mittel" ? "warn" : "bad"));
  const t = el("p", "muted", rest.stufe === "hoch" ? "Ein bekannter Vorname mit Nachnamen steht noch im Text. Siehe Reiter „Namen prüfen“."
    : rest.stufe === "mittel" ? (rest.anzahlKandidaten ? (rest.anzahlKandidaten === 1 ? "1 möglicher Name" : rest.anzahlKandidaten + " mögliche Namen") + " (meist Substantive)" : "Lange Zahlen oder Zeilen im Text") + ". Siehe Reiter „Namen prüfen“." : "");
  t.style.marginTop = "8px"; c.append(t);
  kpi.append(a, b, c);
}

function zeichneBuchungen() {
  const { rows, anRows } = ergebnis;
  const t = $("tab"); t.textContent = "";
  $("buchInfo").textContent = anRows.length ? "Anonymisierte Buchungen (so gehen sie in den CSV-Export)." : "In diesem Dokument wurden keine Kontoauszug-Buchungen erkannt. Das ist bei Verträgen und Formularen normal.";
  if (!anRows.length) return;
  const h = t.createTHead().insertRow();
  [["Datum", ""], ["Text", ""], ["Betrag in €", "r"]].forEach(([x, k]) => { const th = el("th", k, x); h.append(th); });
  const body = t.createTBody();
  for (const r of anRows) {
    const tr = body.insertRow();
    tr.insertCell().textContent = r.datum; tr.insertCell().textContent = r.text;
    const c = tr.insertCell(); c.className = "r" + (r.cent < 0n ? " neg" : ""); c.textContent = K.fmtCent(r.cent);
  }
}

function zeichneNamenTab() {
  const { rest, an } = ergebnis;
  const r = $("rest"); r.textContent = "";
  r.append(pill("Restrisiko: " + rest.stufe, rest.stufe === "niedrig" ? "ok" : rest.stufe === "mittel" ? "warn" : "bad"));
  const zeile = (txt, fett) => { const p = el("p", fett ? "" : "muted", txt); p.style.margin = "8px 0 0"; if (fett) p.style.fontWeight = "700"; r.append(p); };
  if (rest.verdaechtig.length) zeile("Noch im Text (bekannter Vorname): " + rest.verdaechtig.join(", ") + ". Markiere sie unten oder trage sie oben bei „Weitere Namen“ ein.", true);
  if (rest.langeZeilen) zeile(rest.langeZeilen + " sehr lange Zeile(n): Freitext prüfen.");
  if (rest.langeZahlen) zeile(rest.langeZahlen + " lange Zahl(en): evtl. Konto- oder Kundennummer. Mit der Einstellung „Referenznummern maskieren“ werden sie ersetzt.");
  const g = $("gelernt"); g.textContent = "";
  if (!an.gelernt.length) g.append(el("small", "muted", "Nichts erkannt. Das ist bei reinen Kontoauszügen normal."));
  an.gelernt.forEach((n) => g.append(el("span", "chip auto", n)));
  const kl = $("kand"); kl.textContent = "";
  if (rest.moeglicheNamen.length) {
    const h = el("h3", null, "Mögliche Namen"); h.style.marginTop = "16px"; kl.append(h);
    kl.append(el("small", "muted", rest.anzahlKandidaten + " Großwort-Paare gefunden, meist deutsche Substantive. Markiere, was wirklich ein Name ist:"));
    const grid = el("div", "cands");
    for (const n of rest.moeglicheNamen) {
      const lab = el("label", "check"); const cb = document.createElement("input"); cb.type = "checkbox"; cb.value = n;
      lab.append(cb, document.createTextNode(n)); grid.append(lab);
    }
    kl.append(grid);
    const bt = el("button", "btn", "Markierte als Namen ersetzen"); bt.type = "button";
    bt.onclick = () => { const m = [...kl.querySelectorAll("input:checked")].map((x) => x.value); if (m.length) addNamen(m.join(",")); };
    kl.append(bt);
  }
}

// ---------- Reiter ----------
function aktiviere(panel) {
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.t === panel)));
  document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== panel; });
}
$("tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) aktiviere(b.dataset.t); });

// ---------- Freigabe und Export ----------
function aktualisiereFreigabe() {
  const hoch = ergebnis && ergebnis.rest.stufe === "hoch";
  $("frei").disabled = !!hoch;
  const an = !!ergebnis && $("frei").checked && !hoch;
  ["e-copy", "e-agent", "e-txt", "e-csv", "e-map", "e-prot"].forEach((i) => ($(i).disabled = !an));
  $("e-csv").disabled = !an || !ergebnis.anRows.length;
  $("freiMsg").textContent = hoch ? "Gesperrt: Der Text enthält noch erkennbare Namen. Ersetze sie im Reiter „Namen prüfen“."
    : an ? "Freigegeben. Du kannst den Text jetzt kopieren oder speichern." : "Haken setzen, dann werden Kopieren und Speichern freigeschaltet.";
  if (an) schritt(3); else if (ergebnis) schritt(2);
}
$("frei").addEventListener("change", aktualisiereFreigabe);

async function kopiere(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e2) {} ta.remove(); return ok;
  }
}
function speichern(name, text, typ, bom) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([(bom ? "﻿" : "") + text], { type: typ + ";charset=utf-8" }));
  a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$("e-copy").onclick = async () => {
  const ok = await kopiere(ergebnis.an.text);
  $("freiMsg").textContent = ok ? "Anonymisierter Text kopiert. Jetzt in die KI einfügen." : "Kopieren nicht möglich. Markiere den Text im Reiter und kopiere ihn von Hand.";
};
$("e-agent").onclick = () => {
  const e = ergebnis;
  try {
    // bleibt in diesem Browser-Tab; gesendet wird erst auf der nächsten Seite nach erneuter Freigabe
    sessionStorage.setItem("orbitron-uebergabe", JSON.stringify({
      text: e.an.text, rows: e.anRows.map((r) => ({ datum: r.datum, text: r.text, cent: String(r.cent) })),
      summencheck: e.sc.status, hinweis: L.ocrHinweis(ocrInfo), verloren: Math.max(0, e.rows.length - e.anRows.length), tabelle: e.an.tabelle,
    }));
    location.href = (window.ORBITRON_LINKS || { agent: "agent.html" }).agent;
  } catch (err) { $("freiMsg").textContent = "Übergabe nicht möglich. Speichere die CSV oder den Text und lade ihn unter „Auswerten“."; }
};
$("e-txt").onclick = () => speichern("auszug-anonym.txt", ergebnis.an.text, "text/plain", false);
$("e-csv").onclick = () => speichern("buchungen-anonym.csv", K.alsCsv(ergebnis.anRows), "text/csv", true);
$("e-map").onclick = () => speichern("zuordnung-LOKAL-BEHALTEN.json", JSON.stringify(ergebnis.an.tabelle, null, 2), "application/json", false);
$("e-prot").onclick = () => {
  const e = ergebnis;
  speichern("protokoll.txt", [
    "Orbitron Anonymisierung, Protokoll", "Erstellt: " + new Date().toLocaleString("de-DE"),
    "Buchungen: " + e.rows.length + (e.rows.length ? " (Format " + e.rows.format + ")" : ""), "Summe: " + K.fmtCent(e.sc.summe),
    "Summencheck: " + e.sc.status + (e.sc.abweichung != null ? " (" + K.fmtCent(e.sc.abweichung) + ")" : ""),
    "Platzhalter: " + Object.keys(e.an.tabelle).length, "Automatisch erkannte Namen: " + e.an.gelernt.length, "Restrisiko: " + e.rest.stufe,
    "Freigabe durch Anwender bestätigt: ja", "Hinweis: Pseudonymisierte Daten bleiben personenbezogene Daten.",
  ].join("\r\n"), "text/plain", false);
};

// ---------- Zurückübersetzen ----------
function zeigeNurReid(an) {
  ["t-text", "t-buch", "t-namen"].forEach((i) => ($(i).hidden = an));
  $("kpi").hidden = an; $("release").hidden = an;
  if (an) { $("ergebnis").hidden = false; aktiviere("p-reid"); } else { $("t-reid").hidden = false; }
}
$("nurReid").onclick = () => { zeigeNurReid(true); $("ergebnis").scrollIntoView({ behavior: "smooth" }); };
$("mapIn").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    if (!obj || typeof obj !== "object" || Object.values(obj).some((v) => typeof v !== "string")) throw new Error("Datei hat nicht das erwartete Format");
    geladeneTabelle = obj; $("mapStat").textContent = Object.keys(obj).length + " Platzhalter geladen.";
  } catch (err) { $("mapStat").textContent = "Konnte die Zuordnung nicht lesen: " + err.message; }
});
$("reid").onclick = () => {
  const tabelle = geladeneTabelle || (ergebnis && ergebnis.an.tabelle);
  const o = $("klar");
  if (!tabelle) { $("mapStat").textContent = "Keine Zuordnung vorhanden. Lade die gespeicherte Zuordnung oder werte zuerst ein Dokument aus."; return; }
  o.hidden = false; o.textContent = K.reidentifiziere($("antwort").value, tabelle); $("kopKlar").hidden = false;
};
$("kopKlar").onclick = async () => { const ok = await kopiere($("klar").textContent); $("mapStat").textContent = ok ? "Kopiert." : "Kopieren nicht möglich."; };

$("go").onclick = auswerten;
zeichneChips();
