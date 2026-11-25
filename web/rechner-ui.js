import * as G from "./geldmodus.js";
const $ = (id) => document.getElementById(id);
const E = window.OrbitronCalculatorEngine;

let mode = location.hash === "#wiss" ? "wiss" : "geld";
let winkel = "deg";
let frisch = false;   // gerade mit "=" ausgewertet
let verlauf = [];     // {e, v, exakt}
let letzter = null;   // letztes gültiges Ergebnis (Text)

const FUNKTIONEN = [
  ["netto", "netto(", "netto(Brutto;Satz) z. B. netto(119;19)"], ["USt", "ust(", "ust(Brutto;Satz) = enthaltene Umsatzsteuer"],
  ["Zins", "zins(", "zins(Kapital;Satz;Tage), act/365"], ["AfA", "afa(", "afa(Anschaffungskosten;Jahre;Monate)"],
  ["runde", "runde(", "runde(Wert;Stellen)"], ["Σ", "summe(", "summe(a;b;c)"], ["min", "min(", "min(a;b;…)"], ["max", "max(", "max(a;b;…)"], [";", ";", "Argumente trennt man mit ;"],
];
const SCI = [["sin", "sin("], ["cos", "cos("], ["tan", "tan("], ["ln", "ln("], ["log", "log("], ["√", "sqrt("], ["^", "^"], ["π", "pi"], ["e", "e"], ["!", "!"], ["abs", "abs("], ["exp", "exp("], ["x²", "^2"], ["∛", "cbrt("]];
const TASTEN = [
  ["C", "clr", "clr"], ["⌫", "back", "op"], ["(", "(", "op"], [")", ")", "op"],
  ["7"], ["8"], ["9"], ["÷", "÷", "op"],
  ["4"], ["5"], ["6"], ["×", "×", "op"],
  ["1"], ["2"], ["3"], ["−", "−", "op"],
  ["0"], [","], ["%", "%", "op"], ["+", "+", "op"],
  ["=", "eq", "eq"],
];

const ein = $("expr");

function einfuegen(text) {
  if (frisch) {
    if (/^[+×÷−%^!]/.test(text) && letzter != null) ein.value = letzter; else if (!/^[+×÷−%^!]/.test(text)) ein.value = "";
    frisch = false; ein.setSelectionRange(ein.value.length, ein.value.length);
  }
  const a = ein.selectionStart ?? ein.value.length, b = ein.selectionEnd ?? a;
  ein.value = ein.value.slice(0, a) + text + ein.value.slice(b);
  const pos = a + text.length; ein.setSelectionRange(pos, pos);
  live(false);
}
function loesche() { ein.value = ""; frisch = false; live(false); }
function zurueck() {
  const a = ein.selectionStart ?? ein.value.length, b = ein.selectionEnd ?? a;
  if (a !== b) ein.value = ein.value.slice(0, a) + ein.value.slice(b);
  else if (a > 0) { ein.value = ein.value.slice(0, a - 1) + ein.value.slice(a); ein.setSelectionRange(a - 1, a - 1); }
  frisch = false; live(false);
}

function zeigeHinweis(text, warn) { const h = $("hint"); h.textContent = text || ""; h.className = "hint" + (warn ? " warn" : ""); }
function zeigeErgebnis(text, fehler) { const r = $("res"); r.textContent = text; r.className = "res" + (fehler ? " err" : ""); }

// Auswertung: liefert {v, exakt} oder null; mit melden=true wird ein Fehler sichtbar angezeigt
function rechne(melden) {
  const s = ein.value.trim();
  if (!s) { zeigeErgebnis(mode === "geld" ? "0," + "0".repeat(+$("nk").value) : "0"); zeigeHinweis(""); return null; }
  if (mode === "geld") {
    const r = G.bewerte(s, { nachkomma: +$("nk").value });
    if (!r.ok) { if (melden) zeigeErgebnis(r.fehler, true); return null; }
    zeigeErgebnis(r.gerundet);
    if (r.hinweise.length) zeigeHinweis("Achtung: " + r.hinweise.join("; "), true);
    else zeigeHinweis(r.istExakt ? "exakt" : "gerundet, exakter Wert " + (r.exakt || r.bruch));
    return { v: r.gerundet, exakt: r.istExakt };
  }
  try {
    const r = E.calculate(s, { angle: winkel });
    const t = r.text.replace(".", ",");
    zeigeErgebnis(t);
    zeigeHinweis(r.approximate ? "Näherung (Fließkomma). Für Geldbeträge den Geldmodus benutzen." : "", r.approximate);
    return { v: t, exakt: !r.approximate };
  } catch (e) { if (melden) zeigeErgebnis(e.message, true); return null; }
}
function live(melden) { const r = rechne(melden); if (r) letzter = r.v; return r; }

function auswerten() {
  const r = rechne(true);
  if (!r) return;
  letzter = r.v;
  verlauf.unshift({ e: ein.value.trim(), v: r.v, exakt: r.exakt });
  frisch = true; zeichneVerlauf();
}

function zeichneVerlauf() {
  const ol = $("log"); ol.textContent = "";
  verlauf.slice(0, 60).forEach((x) => {
    const li = document.createElement("li"); li.tabIndex = 0; li.setAttribute("role", "button"); li.title = "Ausdruck übernehmen";
    const e = document.createElement("span"); e.className = "e"; e.textContent = x.e;
    const v = document.createElement("span"); v.className = "v"; v.textContent = (x.exakt ? "= " : "≈ ") + x.v;
    li.append(e, v);
    const nimm = () => { ein.value = x.e; frisch = false; live(false); };
    li.onclick = nimm; li.onkeydown = (ev) => { if (ev.key === "Enter") nimm(); };
    ol.append(li);
  });
  $("logEmpty").hidden = verlauf.length > 0;
}

function zeichneTasten() {
  const k = $("keys"); k.textContent = "";
  for (const [label, wert, klasse] of TASTEN) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (klasse) b.className = klasse;
    b.onclick = () => (wert === "clr" ? loesche() : wert === "back" ? zurueck() : wert === "eq" ? auswerten() : einfuegen(wert || label));
    k.append(b);
  }
  const f = $("funcs"); f.textContent = "";
  const sci = $("sci"); sci.textContent = "";
  if (mode === "geld") {
    for (const [label, wert, hilfe] of FUNKTIONEN) {
      const b = document.createElement("button"); b.type = "button"; b.className = "btn small"; b.textContent = label;
      b.onclick = () => { einfuegen(wert); zeigeHinweis("Syntax: " + hilfe); }; f.append(b);
    }
  } else {
    const raster = document.createElement("div"); raster.className = "keys sci";
    for (const [label, wert] of SCI) {
      const b = document.createElement("button"); b.type = "button"; b.className = "op"; b.textContent = label; b.onclick = () => einfuegen(wert); raster.append(b);
    }
    const w = document.createElement("button"); w.type = "button"; w.textContent = winkel.toUpperCase(); w.title = "Winkelmodus umschalten";
    w.onclick = () => { winkel = winkel === "deg" ? "rad" : "deg"; w.textContent = winkel.toUpperCase(); live(false); };
    raster.append(w); sci.append(raster);
  }
  $("nkWrap").hidden = mode !== "geld";
}

function setzeModus(m) {
  mode = m; frisch = false;
  $("m-geld").setAttribute("aria-selected", String(m === "geld")); $("m-wiss").setAttribute("aria-selected", String(m === "wiss"));
  try { history.replaceState(null, "", m === "wiss" ? "#wiss" : "#geld"); } catch (e) {}
  ein.placeholder = m === "geld" ? "z. B. 1.234,56 × 0,19" : "z. B. sin(30) + 2^10";
  zeichneTasten(); live(false);
}
$("m-geld").onclick = () => setzeModus("geld");
$("m-wiss").onclick = () => setzeModus("wiss");
$("nk").onchange = () => live(false);

ein.addEventListener("input", () => { frisch = false; live(false); });
ein.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); auswerten(); }
  else if (e.key === "Escape") { e.preventDefault(); loesche(); }
});
window.addEventListener("hashchange", () => setzeModus(location.hash === "#wiss" ? "wiss" : "geld"));

$("copyRes").onclick = async () => {
  const t = $("res").classList.contains("err") ? "" : $("res").textContent;
  try { await navigator.clipboard.writeText(t); zeigeHinweis("Ergebnis kopiert."); } catch (e) { zeigeHinweis("Kopieren nicht möglich."); }
};
$("logClear").onclick = () => { verlauf = []; zeichneVerlauf(); };
$("logCsv").onclick = () => {
  if (!verlauf.length) return;
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const csv = "Ausdruck;Ergebnis;Exakt\r\n" + [...verlauf].reverse().map((x) => [q(x.e), q(x.v), x.exakt ? "ja" : "nein"].join(";")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = "rechner-protokoll.csv"; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

setzeModus(mode);
zeichneVerlauf();
