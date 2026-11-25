// Engine B: zweiter, unabhängiger Rechenweg mit BigInt-Cent (keine Number-Arithmetik für Geld).
// Läuft im Browser und in Node (ES-Modul). Deckt C01, C02, C04, C05, C07, C08, C09 ab.

export function toCents(s) {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(s).trim());
  if (!m) throw new Error("Kein Betrag: " + s);
  const cents = BigInt(m[2]) * 100n + BigInt((m[3] || "").padEnd(2, "0") || "0");
  return m[1] ? -cents : cents;
}

export function fmt(c) {
  const neg = c < 0n; const a = neg ? -c : c;
  const euro = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + euro + "," + (a % 100n).toString().padStart(2, "0");
}

const roundDiv = (a, b) => (2n * a + b) / (2n * b); // a, b > 0, kaufmännisch

export function nettoAusBrutto(brutto, satz) {
  const p = BigInt(Math.round(Number(satz) * 100)); // satz ist nur ein Prozent-Label, kein Geld
  return roundDiv(brutto * 100n, 100n + p);
}

export function ibanValid(iban) {
  const s = String(iban).replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (s.startsWith("DE") && s.length !== 22) return false;
  const digits = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55));
  let rest = 0n;
  for (const ch of digits) rest = (rest * 10n + BigInt(ch)) % 97n;
  return rest === 1n;
}

export function parseJournal(text) {
  const lines = text.replace(/\r/g, "").trim().split("\n").slice(1);
  return lines.map(l => { const c = l.split(";"); return { datum: c[0], betrag: toCents(c[3]), kategorie: c[4] }; });
}

const sum = (obj) => Object.values(obj).reduce((a, v) => a + toCents(v), 0n);
const res = (id, ok, erwartet, ist, beleg) => ({
  id, status: ok ? "ok" : "fail",
  erwartet: erwartet == null ? null : fmt(erwartet), tatsaechlich: ist == null ? null : fmt(ist), beleg,
});

export function runChecks(facts, journalText) {
  const out = [];
  const akt = sum(facts.bilanz.aktiva), pas = sum(facts.bilanz.passiva);
  out.push(res("C01", akt === pas, akt, pas, `Aktiva ${fmt(akt)} gegen Passiva ${fmt(pas)}`));

  const erg = sum(facts.guv.ertraege) - sum(facts.guv.aufwand);
  const je = toCents(facts.bilanz.passiva.jahresergebnis);
  out.push(res("C02", erg === je, erg, je, `Ergebnis ${fmt(erg)}`));

  const abw = Object.values(facts.dokumente).filter(v => toCents(v) !== je);
  out.push(res("C04", abw.length === 0, je, abw.length ? toCents(abw[0]) : je, "Dokumente verglichen"));

  const j = parseJournal(journalText);
  const bankSum = j.reduce((a, z) => a + z.betrag, 0n);
  const endIst = toCents(facts.bank.anfangssaldo) + bankSum;
  out.push(res("C05", endIst === toCents(facts.bank.endsaldo), toCents(facts.bank.endsaldo), endIst, "Anfangssaldo + Buchungen"));

  let vs = 0n;
  for (const b of facts.ust.belege) { const br = toCents(b.brutto); vs += br - nettoAusBrutto(br, b.satz); }
  out.push(res("C07", vs === toCents(facts.ust.vorsteuer_erklaert), vs, toCents(facts.ust.vorsteuer_erklaert), "Vorsteuer je Beleg gerundet"));

  const ibans = facts.stammdaten.ibans, bad = ibans.filter(i => !ibanValid(i));
  out.push(res("C08", bad.length === 0, BigInt(ibans.length) * 100n, BigInt(ibans.length - bad.length) * 100n, `${ibans.length} IBAN`));

  const plz = facts.stammdaten.plz;
  const falsch = Object.values(facts.stammdaten.adressen_in_dokumenten).filter(v => v !== plz);
  out.push({ id: "C09", status: falsch.length ? "fail" : "ok", erwartet: null, tatsaechlich: null, beleg: "Soll " + plz });
  return out;
}
