// Orbitron Geldmodus: exakte Rechnung mit Brüchen aus BigInt. Keine Fließkommazahlen.
// Eingabe deutsch: 1.234,56  ·  Argumente mit ;  ·  Rundung nur am Ende, kaufmännisch (Halbe weg von null).
// ES-Modul (Browser und Node). Funktionen: runde, abs, min, max, summe, netto, ust, zins, afa.

export class GeldFehler extends Error { constructor(m) { super(m); this.name = "GeldFehler"; } }

const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const R = (n, d = 1n) => {
  if (d === 0n) throw new GeldFehler("Division durch null");
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
};
const add = (a, b) => R(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a, b) => R(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => R(a.n * b.n, a.d * b.d);
const div = (a, b) => { if (b.n === 0n) throw new GeldFehler("Division durch null"); return R(a.n * b.d, a.d * b.n); };
const neg = (a) => R(-a.n, a.d);
const cmp = (a, b) => { const x = a.n * b.d, y = b.n * a.d; return x < y ? -1 : x > y ? 1 : 0; };
const p10 = (k) => 10n ** BigInt(k);

function powInt(b, k) {
  if (k < 0n) { if (b.n === 0n) throw new GeldFehler("0 hoch negativer Exponent"); return powInt(div(R(1n), b), -k); }
  let res = R(1n), base = b, e = k;
  while (e > 0n) { if (e & 1n) res = mul(res, base); base = mul(base, base); e >>= 1n; }
  return res;
}

// ---------- Tokenizer ----------
function tokenize(src, opt) {
  const s = String(src).replace(/−/g, "-").replace(/[×·]/g, "*").replace(/[÷:]/g, "/");
  const en = !!opt.englisch;
  const numRe = en ? /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?/ : /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?/;
  const toks = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const rest = s.slice(i);
    if (/\d/.test(c)) {
      const m = numRe.exec(rest);
      const ganz = m[1].replace(en ? /,/g : /\./g, ""), frac = m[2] || "";
      toks.push({ t: "num", v: R(BigInt(ganz + frac), p10(frac.length)) });
      if (opt._h && m[1].includes(en ? "," : ".") && !m[2]) opt._h.push(`${m[0]} wird als ${ganz} gelesen (${en ? "Komma" : "Punkt"} = Tausendertrenner)`);
      i += m[0].length;
      const nx = s[i] || "", nn = s[i + 1] || "";
      if (!en && nx === "." && /\d/.test(nn)) throw new GeldFehler("Punkt ist Tausendertrenner (1.234,56). Dezimalkomma benutzen, z. B. 1,5");
      if (en && nx === "," && /\d/.test(nn)) throw new GeldFehler("Komma ist Tausendertrenner (1,234.56). Dezimalpunkt benutzen");
      if (/\d/.test(nx)) throw new GeldFehler("Ungültige Tausendergruppe in der Zahl");
      continue;
    }
    if (/[a-zA-ZäöüÄÖÜ_]/.test(c)) { const m = /^[a-zA-ZäöüÄÖÜ_]+/.exec(rest); toks.push({ t: "id", v: m[0].toLowerCase() }); i += m[0].length; continue; }
    if ("+-*/^()%;".includes(c)) { toks.push({ t: c }); i++; continue; }
    if (c === ",") throw new GeldFehler("Komma nur als Dezimaltrenner innerhalb einer Zahl. Argumente mit ; trennen");
    throw new GeldFehler(`Unbekanntes Zeichen "${c}" an Position ${i + 1}`);
  }
  return toks;
}

// ---------- Parser (Vorrang: Klammer, %, ^, Vorzeichen, * /, + -) ----------
function parse(toks) {
  let p = 0;
  const peek = () => toks[p];
  const eat = (t) => (toks[p] && toks[p].t === t ? toks[p++] : null);
  function expr() {
    let l = term();
    for (;;) {
      const t = peek();
      if (!t || (t.t !== "+" && t.t !== "-")) break;
      p++;
      const r = term();
      // Taschenrechner-Konvention: a + b%  =  a + a*b/100
      l = r.k === "pct" ? { k: "addpct", op: t.t, l, p: r.e } : { k: "bin", op: t.t, l, r };
    }
    return l;
  }
  function term() {
    let l = unary();
    for (;;) {
      const t = peek();
      if (!t || (t.t !== "*" && t.t !== "/")) break;
      p++;
      l = { k: "bin", op: t.t, l, r: unary() };
    }
    return l;
  }
  function unary() {
    const t = peek();
    if (t && (t.t === "-" || t.t === "+")) { p++; const e = unary(); return t.t === "-" ? { k: "neg", e } : e; }
    return power();
  }
  function power() { const b = postfix(); if (eat("^")) return { k: "pow", b, e: unary() }; return b; }
  function postfix() { let e = primary(); if (eat("%")) e = { k: "pct", e }; return e; }
  function primary() {
    const t = toks[p++];
    if (!t) throw new GeldFehler("Ausdruck unvollständig");
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "(") { const e = expr(); if (!eat(")")) throw new GeldFehler("Schließende Klammer ) fehlt"); return e; }
    if (t.t === "id") {
      if (!eat("(")) throw new GeldFehler(`Nach "${t.v}" fehlt eine öffnende Klammer`);
      const args = [];
      if (!eat(")")) for (;;) {
        args.push(expr());
        if (eat(")")) break;
        if (!eat(";")) throw new GeldFehler("Argumente mit ; trennen, Klammer ) fehlt");
      }
      return { k: "fn", name: t.v, args };
    }
    throw new GeldFehler(`Unerwartetes Zeichen "${t.t}"`);
  }
  const e = expr();
  if (p < toks.length) throw new GeldFehler(toks[p].t === "num" ? "Operator zwischen zwei Zahlen fehlt" : `Unerwartetes Zeichen "${toks[p].t}"`);
  return e;
}

// ---------- Auswertung ----------
function skaliert(r, k) { // kaufmännisch runden: Halbe weg von null; Ergebnis als ganze Zahl der Größe 10^-k
  const num = r.n * p10(k), neg = num < 0n, a = neg ? -num : num;
  const q = (2n * a + r.d) / (2n * r.d);
  return neg ? -q : q;
}
const ganzArg = (r, name, lo, hi) => {
  if (r.d !== 1n || r.n < BigInt(lo) || r.n > BigInt(hi)) throw new GeldFehler(`${name}: ganze Zahl zwischen ${lo} und ${hi} erwartet`);
  return Number(r.n);
};
function fn(name, a) {
  const arity = (lo, hi = lo) => { if (a.length < lo || a.length > hi) throw new GeldFehler(`${name}() erwartet ${lo === hi ? lo : lo + " bis " + hi} Argument(e)`); };
  switch (name) {
    case "runde": { arity(1, 2); const k = a.length === 2 ? ganzArg(a[1], "runde", 0, 8) : 2; return R(skaliert(a[0], k), p10(k)); }
    case "abs": arity(1); return a[0].n < 0n ? neg(a[0]) : a[0];
    case "min": arity(1, 99); return a.reduce((x, y) => (cmp(y, x) < 0 ? y : x));
    case "max": arity(1, 99); return a.reduce((x, y) => (cmp(y, x) > 0 ? y : x));
    case "summe": arity(1, 99); return a.reduce(add);
    case "netto": arity(2); return div(a[0], add(R(1n), div(a[1], R(100n)))); // brutto / (1 + satz/100)
    case "ust": arity(2); return sub(a[0], fn("netto", a)); // Brutto minus Netto
    case "zins": arity(3); return div(mul(div(mul(a[0], a[1]), R(100n)), a[2]), R(365n)); // act/365
    case "afa": arity(3); return div(mul(div(a[0], a[1]), a[2]), R(12n)); // AK / Jahre * Monate / 12
    default: throw new GeldFehler(`Unbekannte Funktion "${name}"`);
  }
}
function ev(n) {
  switch (n.k) {
    case "num": return n.v;
    case "neg": return neg(ev(n.e));
    case "pct": return div(ev(n.e), R(100n));
    case "addpct": { const l = ev(n.l), d = mul(l, div(ev(n.p), R(100n))); return n.op === "+" ? add(l, d) : sub(l, d); }
    case "bin": { const l = ev(n.l), r = ev(n.r); return n.op === "+" ? add(l, r) : n.op === "-" ? sub(l, r) : n.op === "*" ? mul(l, r) : div(l, r); }
    case "pow": { const b = ev(n.b), e = ev(n.e); if (e.d !== 1n) throw new GeldFehler("Nur ganzzahlige Exponenten im Geldmodus"); if (e.n > 1000n || e.n < -1000n) throw new GeldFehler("Exponent zu groß"); return powInt(b, e.n); }
    case "fn": return fn(n.name, n.args.map(ev));
  }
  throw new GeldFehler("Interner Fehler");
}

// ---------- Ausgabe ----------
export function formatSkaliert(s, k) {
  const neg = s < 0n, a = (neg ? -s : s).toString().padStart(k + 1, "0");
  const ganz = a.slice(0, a.length - k).replace(/\B(?=(\d{3})+(?!\d))/g, "."), frac = k ? "," + a.slice(a.length - k) : "";
  return (neg ? "-" : "") + ganz + frac;
}
function exaktDezimal(r) { // Dezimaldarstellung, falls der Bruch abbricht (Nenner nur 2 und 5), sonst null
  let d = r.d, a = 0, b = 0;
  while (d % 2n === 0n) { d /= 2n; a++; }
  while (d % 5n === 0n) { d /= 5n; b++; }
  if (d !== 1n) return null;
  const k = Math.max(a, b), s = r.n * p10(k) / r.d;
  let t = formatSkaliert(s, k);
  if (k) t = t.replace(/0+$/, "").replace(/,$/, "");
  return t;
}

export function bewerte(ausdruck, opt = {}) {
  const k = opt.nachkomma ?? 2;
  try {
    const hinweise = [];
    const r = ev(parse(tokenize(ausdruck, { ...opt, _h: hinweise })));
    const s = skaliert(r, k);
    return {
      ok: true,
      hinweise,
      gerundet: formatSkaliert(s, k),
      exakt: exaktDezimal(r),
      bruch: r.d === 1n ? r.n.toString() : `${r.n}/${r.d}`,
      istExakt: cmp(R(s, p10(k)), r) === 0,
      skaliert: s, nachkomma: k,
      beleg: `${String(ausdruck).trim()} = ${formatSkaliert(s, k)}${cmp(R(s, p10(k)), r) === 0 ? "" : " (gerundet)"}`,
    };
  } catch (e) {
    if (e instanceof GeldFehler) return { ok: false, fehler: e.message };
    throw e;
  }
}
