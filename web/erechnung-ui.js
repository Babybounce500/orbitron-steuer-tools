import { EINHEITEN, STEUERFAELLE, RC_HINWEIS, rechne, pruefe, xrechnung, dateiname, deutsch, datumDe } from "./erechnung-core.js";

const $ = (i) => document.getElementById(i);
const PROFIL = "orbitron-erechnung-profil", ENTWURF = "orbitron-erechnung-entwurf", NUMMERN = "orbitron-erechnung-nummern";
const lese = (k, leer) => { try { return JSON.parse(localStorage.getItem(k)) ?? leer; } catch (e) { return leer; } };
const merke = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ohne Speicher weiterarbeiten */ } };

// Texte kommen aus Eingaben: nur über textContent ins Dokument
function h(tag, attr = {}, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attr)) e.setAttribute(k, v);
  for (const k of kinder) if (k !== null && k !== undefined && k !== false) e.append(k);
  return e;
}
const felder = (art) => Array.from(document.querySelectorAll(`[data-${art}]`));
const sammle = (art) => Object.fromEntries(felder(art).map((e) => [e.dataset[art], e.value]));
const fuelle = (art, werte) => felder(art).forEach((e) => { const w = werte?.[e.dataset[art]]; if (typeof w === "string") e.value = w; });

const heute = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const plusTage = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function position(werte = {}) {
  const wahl = (liste, wert, name) => {
    const s = h("select", { "data-p": name }, ...liste.map(([v, t]) => h("option", { value: v }, t)));
    s.value = wert; return s;
  };
  const feld = (titel, element, klasse) => h("label", klasse ? { class: klasse } : {}, h("span", {}, titel), element);
  const eingabe = (name, wert, extra = {}) => { const i = h("input", { type: "text", "data-p": name, ...extra }); i.value = wert; return i; };
  const weg = h("button", { type: "button", class: "btn small ghost", "aria-label": "Position entfernen" }, "✕");
  const zeile = h("div", { class: "pos" },
    feld("Beschreibung", eingabe("text", werte.text || ""), "text"),
    feld("Menge", eingabe("menge", werte.menge || "1", { inputmode: "decimal" })),
    feld("Einheit", wahl(EINHEITEN, werte.einheit || "C62", "einheit")),
    feld("Einzelpreis €", eingabe("preis", werte.preis || "", { inputmode: "decimal" })),
    feld("Steuer", wahl(Object.entries(STEUERFAELLE).map(([k, v]) => [k, v.text]), werte.steuer || "s19", "steuer")),
    weg, h("output", {}));
  weg.addEventListener("click", () => { zeile.remove(); if (!$("positionen").children.length) position(); aktualisiere(); });
  $("positionen").append(zeile);
}

function rechnung() {
  return {
    ...sammle("r"), verkaeufer: sammle("v"), kaeufer: sammle("k"),
    positionen: Array.from($("positionen").children).map((z) => Object.fromEntries(Array.from(z.querySelectorAll("[data-p]")).map((e) => [e.dataset.p, e.value]))),
  };
}

function summenBlock(sum) {
  const z = (a, b, k) => h("div", k ? { class: k } : {}, h("span", {}, a), h("span", {}, b + " €"));
  return [z("Netto", deutsch(sum.netto)), ...sum.steuern.map((g) => z(g.id === "S" ? `USt ${g.satz} % auf ${deutsch(g.basis)}` : g.id === "AE" ? "Reverse Charge" : "Steuerfrei", deutsch(g.steuer))), z("Zu zahlen", deutsch(sum.brutto), "gesamt")];
}

let ausgegeben = "";
function aktualisiere() {
  const r = rechnung(), sum = rechne(r);
  Array.from($("positionen").children).forEach((z, i) => { z.querySelector("output").textContent = sum.posten[i].netto === null ? "Menge oder Preis prüfen" : "Netto " + deutsch(sum.posten[i].netto) + " €"; });
  $("summen").replaceChildren(...summenBlock(sum));
  $("befreiungFeld").hidden = !r.positionen.some((p) => p.steuer === "frei");
  // geänderte Eingaben machen die letzte Ausgabe ungültig
  if (ausgegeben && JSON.stringify(r) !== ausgegeben) { ausgegeben = ""; $("ansicht").hidden = true; $("drucken").disabled = true; $("stat").textContent = "Eingaben geändert. Bitte neu speichern."; }
  $("fehler").replaceChildren();
  merke(PROFIL, r.verkaeufer);
  const { verkaeufer, ...rest } = r;
  merke(ENTWURF, rest);
}

function blatt(r) {
  const v = r.verkaeufer, k = r.kaeufer, sum = rechne(r);
  const zeilen = (...l) => h("div", {}, ...l.filter(Boolean).map((x) => h("div", {}, x)));
  const einheit = Object.fromEntries(EINHEITEN);
  const zeitraum = r.leistungBis && r.leistungBis !== r.leistungVon ? `Leistungszeitraum ${datumDe(r.leistungVon)} bis ${datumDe(r.leistungBis)}` : `Leistungsdatum ${datumDe(r.leistungVon)}`;
  const tab = h("table", {},
    h("thead", {}, h("tr", {}, ...["Pos.", "Beschreibung", "Menge", "Einzelpreis", "Steuer", "Netto"].map((x, i) => h("th", i > 1 && i !== 4 ? { class: "r" } : {}, x)))),
    h("tbody", {}, ...sum.posten.map((p) => h("tr", {}, h("td", {}, String(p.nr)), h("td", {}, p.text), h("td", { class: "r" }, deutsch(p.menge, 3, 0) + " " + einheit[p.einheit]),
      h("td", { class: "r" }, deutsch(p.preis, 4, 2) + " €"), h("td", {}, p.fall.text), h("td", { class: "r" }, deutsch(p.netto) + " €")))));
  const teile = [
    h("div", { class: "zwei" }, zeilen(v.name, v.strasse, `${v.plz} ${v.ort}`), zeilen(`Rechnung ${r.nummer}`, `Datum ${datumDe(r.datum)}`, zeitraum, `Referenz ${r.referenz}`)),
    h("div", { class: "zwei" }, zeilen(k.name, k.strasse, `${k.plz} ${k.ort}`, k.land !== "DE" && k.land, k.ustid && `USt-IdNr. ${k.ustid}`)),
    h("h3", {}, "Rechnung"),
    r.hinweis && h("p", {}, r.hinweis),
    tab,
    h("div", { class: "summen" }, ...summenBlock(sum)),
    sum.steuern.some((g) => g.id === "AE") && h("p", {}, RC_HINWEIS),
    sum.steuern.some((g) => g.id === "E") && h("p", {}, r.befreiung),
    h("p", {}, `Zahlbar bis ${datumDe(r.faellig)} ohne Abzug auf IBAN ${v.iban}${v.bic ? ", BIC " + v.bic : ""}. Verwendungszweck: ${r.nummer}.`),
    h("p", { class: "klein" }, [v.kontakt, v.telefon, v.email, v.register, v.rechtsangaben, v.ustid && "USt-IdNr. " + v.ustid, v.steuernummer && "Steuernummer " + v.steuernummer].filter(Boolean).join(" · ")),
  ];
  // leere Bedingungen nicht als Text "false" ins Dokument schreiben
  $("blatt").replaceChildren(...teile.filter(Boolean));
}

function lade(name, inhalt, typ) {
  const a = h("a", { download: name });
  a.href = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("xmlSpeichern").addEventListener("click", () => {
  const r = rechnung(), fehler = pruefe(r);
  $("fehler").replaceChildren(...fehler.map((f) => h("li", {}, f)));
  if (fehler.length) { $("stat").textContent = `Noch ${fehler.length} Punkt(e) offen:`; $("ansicht").hidden = true; $("drucken").disabled = true; return; }
  const xml = xrechnung(r);
  // dieselbe Nummer mit anderem Inhalt nur nach Rückfrage
  const nummern = lese(NUMMERN, {});
  const nr = r.nummer.trim();
  if (nummern[nr] && nummern[nr] !== xml && !window.confirm(`Die Rechnungsnummer ${nr} wurde in diesem Browser schon mit anderem Inhalt gespeichert. Trotzdem speichern? Nur sinnvoll, wenn die alte Datei nicht verschickt wurde.`)) {
    $("stat").textContent = "Abgebrochen. Vergib eine neue Rechnungsnummer."; return;
  }
  nummern[nr] = xml; merke(NUMMERN, nummern);
  $("xmlOut").textContent = xml;
  blatt(r);
  $("ansicht").hidden = false; $("drucken").disabled = false;
  ausgegeben = JSON.stringify(r);
  lade(dateiname(r), xml, "application/xml");
  $("stat").textContent = `Gespeichert: ${dateiname(r)}. Die XML-Datei an den Kunden senden und aufbewahren.`;
});
$("drucken").addEventListener("click", () => window.print());
$("posNeu").addEventListener("click", () => { position(); aktualisiere(); });
$("neu").addEventListener("click", () => {
  if (!window.confirm("Kunde und Rechnung leeren? Deine Firmendaten bleiben.")) return;
  felder("k").forEach((e) => { e.value = e.dataset.k === "land" ? "DE" : ""; });
  felder("r").forEach((e) => { e.value = ""; });
  $("positionen").replaceChildren(); position(); standard(); ausgegeben = ""; $("ansicht").hidden = true; $("drucken").disabled = true; $("stat").textContent = ""; aktualisiere();
});
$("profilSpeichern").addEventListener("click", () => lade("orbitron-firmenprofil.json", JSON.stringify(sammle("v"), null, 1), "application/json"));
$("profilLaden").addEventListener("click", () => $("profilDatei").click());
$("profilDatei").addEventListener("change", async (ev) => {
  const datei = ev.target.files[0];
  if (!datei) return;
  try {
    const p = JSON.parse(await datei.text());
    if (!p || typeof p !== "object" || typeof p.name !== "string") throw new Error("kein Profil");
    felder("v").forEach((e) => { e.value = typeof p[e.dataset.v] === "string" ? p[e.dataset.v] : ""; });
    aktualisiere(); $("stat").textContent = "Firmenprofil geladen.";
  } catch (e) { $("stat").textContent = "Die Datei ist kein gültiges Firmenprofil."; }
  ev.target.value = "";
});

function standard() {
  const d = document.querySelector('[data-r="datum"]'), f = document.querySelector('[data-r="faellig"]');
  if (!d.value) d.value = heute();
  if (!f.value) f.value = plusTage(d.value, 14);
}

fuelle("v", lese(PROFIL, {}));
const entwurf = lese(ENTWURF, null);
if (entwurf) { fuelle("k", entwurf.kaeufer); fuelle("r", entwurf); }
(entwurf?.positionen?.length ? entwurf.positionen : [{}]).forEach(position);
standard();
if (document.querySelector('[data-v="name"]').value) $("profilBox").open = false;
document.querySelector("main").addEventListener("input", aktualisiere);
document.querySelector("main").addEventListener("change", aktualisiere);
aktualisiere();
