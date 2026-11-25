// Orbitron Extractor v6: Kernfunktionen (rein, ohne DOM, in Node testbar). Alles lokal, nichts wird gesendet.
// Geld nur als BigInt-Cent. Pseudonymisierung mit lokaler Zuordnungstabelle.

const BUCHST = "A-Za-zÄÖÜäöüß";
const WG = "(?<![\\wäöüÄÖÜß])"; // Wortanfang
const WE = "(?![\\wäöüÄÖÜß])"; // Wortende
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- Zeilen aus pdf.js-Textelementen (spaltenbewusst, Lücken statt Pauschal-Leerzeichen) ----------
export function gruppiereZeilen(items, toleranz = 3) {
  const alle = items.filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str.trim(), x: i.x, y: i.y, w: i.w, h: i.h }));
  // Manche PDFs legen denselben Text mehrfach übereinander (Schatten, Formularebene): Doppelte verwerfen
  const gesehen = new Map(), el = [];
  for (const e of alle) {
    const liste = gesehen.get(e.s) || [];
    if (liste.some((o) => Math.abs(o.x - e.x) <= 1.5 && Math.abs(o.y - e.y) <= 1.5)) continue;
    liste.push(e); gesehen.set(e.s, liste); el.push(e);
  }
  el.sort((a, b) => b.y - a.y || a.x - b.x);
  const zeilen = [];
  for (const e of el) {
    const z = zeilen.find((z) => Math.abs(z.y - e.y) <= toleranz);
    if (z) z.teile.push(e); else zeilen.push({ y: e.y, teile: [e] });
  }
  zeilen.sort((a, b) => b.y - a.y);
  return zeilen.map((z) => {
    const t = z.teile.sort((a, b) => a.x - b.x);
    let out = "";
    t.forEach((e, i) => {
      if (i) {
        const p = t[i - 1];
        const hat = p.w != null && e.x != null && p.x != null;
        const luecke = hat ? e.x - (p.x + p.w) : null;
        const schrift = Math.max(p.h || 0, e.h || 0) || 10;
        if (!hat || luecke > schrift * 0.18) out += " ";
      }
      out += e.s;
    });
    return out.replace(/\s+/g, " ").trim();
  });
}

// ---------- Beträge und Daten ----------
// Ein Betrag endet mit genau zwei Nachkommastellen (Komma oder Punkt). Alles davor sind Tausenderzeichen.
const AMT = "(\\d{1,3}(?:[ \\u00a0.,']\\d{3})+|\\d+)[.,](\\d{2})(?!\\d)";
const BETRAG = new RegExp(`(?<![\\d.,])([+\\-−])?\\s?(?:€\\s?)?${AMT}\\s*(?:€|EUR)?\\s*([+\\-]|[SH])?(?=\\s|$)`);
const cent = (g, k) => BigInt(g.replace(/\D/g, "") + k);
export function parseBetrag(text) {
  const m = BETRAG.exec(text);
  if (!m) return null;
  const c = cent(m[2], m[3]);
  const minus = m[1] === "-" || m[1] === "−" || m[4] === "-" || m[4] === "S";
  return { cent: minus ? -c : c, roh: m[0], index: m.index };
}
export function fmtCent(c) {
  const neg = c < 0n, a = (neg ? -c : c).toString().padStart(3, "0");
  return (neg ? "-" : "") + a.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + a.slice(-2);
}
const DATUM = /^(\d{2})\.(\d{2})\.(\d{4}|\d{2})\b/;
export function parseDatum(s) {
  const m = DATUM.exec(s);
  if (!m) return null;
  const t = +m[1], mo = +m[2], j = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  if (mo < 1 || mo > 12 || t < 1 || t > new Date(j, mo, 0).getDate()) return null;
  return { iso: `${j}-${m[2]}-${m[1]}`, roh: m[0] };
}
const MONAT3 = { jan: 1, feb: 2, mär: 3, mar: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12 };
const monat = (w) => MONAT3[w.slice(0, 3).toLowerCase()];
const MONATSWORT = "(?:Jan|Feb|Mär|Mae|Mar|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)[a-zäA-Z]*\\.?";
const pad = (n) => String(n).padStart(2, "0");

// ---------- Format 1: deutsche Bank/Sparkasse: Datum 01.02.2025 am Anfang, Betrag am Ende ----------
const ENDBETRAG = new RegExp(`(?<![\\d.,])([+\\-−]?\\s?${AMT})\\s*(?:€|EUR)?\\s*([+\\-]|[SH])?\\s*$`);
function parseGenerisch(zeilen) {
  const rows = [];
  let cur = null;
  for (const z of zeilen) {
    const d = parseDatum(z);
    const m = ENDBETRAG.exec(z);
    if (d && m) {
      let rest = z.slice(d.roh.length, m.index).trim();
      const d2 = parseDatum(rest); // zweite Datumsspalte (Wertstellung)
      if (d2) rest = rest.slice(d2.roh.length).trim();
      const b = parseBetrag(m[0]);
      cur = { datum: d.iso, text: rest, cent: b.cent };
      rows.push(cur);
    } else if (cur && !d && !ENDBETRAG.test(z) && !/saldo|kontostand|seite \d/i.test(z)) {
      cur.text = (cur.text + " " + z).trim();
    } else if (!d) { cur = cur && /saldo|kontostand/i.test(z) ? null : cur; }
  }
  return rows;
}

// ---------- Format 2: Qonto: "02/05 Name + 10.00 EUR", Jahr aus dem Kopf "Vom 01/05/2025 bis ..." ----------
const QONTO_KOPF = /^(Vom \d|Abrechnungstag|Kontoauszüge|IBAN:|BIC:|Eingänge|Ausgänge|Kontostand am)|\s\d+\/\d+$/;
function parseQonto(zeilen) {
  const kopf = zeilen.map((z) => /Vom\s+\d{2}\/\d{2}\/(\d{4})\s+bis/.exec(z)).find(Boolean);
  if (!kopf) return [];
  const jahr = kopf[1];
  const rowRe = new RegExp(`^(\\d{2})/(\\d{2})\\s+(.*?)\\s*([+\\-−])\\s*${AMT}\\s*EUR\\s*$`);
  const rows = [];
  let cur = null;
  for (const z of zeilen) {
    const m = rowRe.exec(z);
    if (m) {
      const c = cent(m[5], m[6]);
      cur = { datum: `${jahr}-${m[2]}-${m[1]}`, text: m[3], cent: m[4] === "+" ? c : -c };
      rows.push(cur);
    } else if (cur && !/^\d{2}\/\d{2}\s/.test(z) && !QONTO_KOPF.test(z)) {
      cur.text = (cur.text + " " + z).trim();
    } else if (QONTO_KOPF.test(z)) cur = null;
  }
  return rows;
}

// ---------- Format 3: Revolut: "31 März 2026 Text €10.00 €1 000.00" (Betrag, Guthaben); Vorzeichen aus den Guthaben ----------
const EUROTOK = "€\\s?\\d{1,3}(?:[ \\u00a0]\\d{3})*[.,]\\d{2}(?!\\d)|€\\s?\\d+[.,]\\d{2}(?!\\d)";
function parseRevolut(zeilen, salden) {
  const rowRe = new RegExp(`^(\\d{1,2})\\.? (${MONATSWORT}) (\\d{4}) (.+?)((?:\\s*(?:${EUROTOK})){1,2})\\s*$`, "i");
  const rows = [];
  let cur = null;
  for (const z of zeilen) {
    const m = rowRe.exec(z);
    if (m) {
      const toks = m[5].match(new RegExp(EUROTOK, "g")).map((x) => { const g = /(\d[\d  ]*)[.,](\d{2})$/.exec(x); return cent(g[1], g[2]); });
      cur = { datum: `${m[3]}-${pad(monat(m[2]))}-${pad(+m[1])}`, text: m[4].trim(), betrag: toks[0], saldo: toks.length > 1 ? toks[1] : null };
      rows.push(cur);
    } else if (cur && !/^(Datum|Transaktionen|Seite|Revolut|Kontoauszug)/i.test(z) && !new RegExp(`^\\d{1,2}\\.? ${MONATSWORT} \\d{4}`, "i").test(z)) {
      cur.text = (cur.text + " " + z).trim();
    }
  }
  if (!rows.length || rows.some((r) => r.saldo == null)) return rows.map((r) => ({ datum: r.datum, text: r.text, cent: r.betrag, unsicher: true }));
  // Reihenfolge erkennen (neueste zuerst oder älteste zuerst), Vorzeichen = Differenz der Guthaben
  const absteigend = rows.length < 2 || rows[0].datum >= rows[rows.length - 1].datum;
  const chron = absteigend ? [...rows].reverse() : rows;
  let vor = salden && salden.anfang != null ? salden.anfang : null;
  for (const r of chron) {
    if (vor != null) {
      r.cent = r.saldo - vor;
      const a = r.cent < 0n ? -r.cent : r.cent;
      if (a !== r.betrag) r.inkonsistent = true;
    } else r.cent = r.betrag;
    vor = r.saldo;
  }
  return rows.map((r) => ({ datum: r.datum, text: r.text, cent: r.cent, inkonsistent: !!r.inkonsistent }));
}

export function parseBuchungen(zeilen) {
  const salden = findeSalden(zeilen);
  const kandidaten = [["qonto", parseQonto(zeilen)], ["revolut", parseRevolut(zeilen, salden)], ["generisch", parseGenerisch(zeilen)]];
  kandidaten.sort((a, b) => b[1].length - a[1].length);
  const [format, rows] = kandidaten[0];
  rows.format = rows.length ? format : "unbekannt";
  return rows;
}

// ---------- Salden und Summencheck ----------
export function findeSalden(zeilen) {
  const text = zeilen.join("\n");
  // Qonto: "Kontostand am 01/05 + 10.00 EUR" (frühestes Datum = Anfang, spätestes = Ende)
  const q = [...text.matchAll(new RegExp(`Kontostand am (\\d{2})/(\\d{2})\\s*([+\\-−])\\s*${AMT}\\s*EUR`, "g"))]
    .map((m) => ({ k: m[2] + m[1], c: (m[3] === "+" ? 1n : -1n) * cent(m[4], m[5]) })).sort((a, b) => (a.k < b.k ? -1 : 1));
  if (q.length >= 2) return { anfang: q[0].c, ende: q[q.length - 1].c };
  // Revolut
  const eur = (re) => { const m = new RegExp(re + `\\s*(-?\\s?)(${EUROTOK})`, "i").exec(text); if (!m) return null; const g = /(\d[\d  ]*)[.,](\d{2})$/.exec(m[2]); return (m[1].includes("-") ? -1n : 1n) * cent(g[1], g[2]); };
  const ra = eur("Eröffnungsguthaben"), re_ = eur("Schlussguthaben");
  if (ra != null && re_ != null) return { anfang: ra, ende: re_ };
  const find = (re) => { for (const z of zeilen) if (re.test(z)) { const b = parseBetrag(z.replace(re, "")); if (b) return b.cent; } return null; };
  return {
    anfang: find(/(anfangssaldo|alter kontostand|saldo vortrag|kontostand am \d{2}\.\d{2}\.\d{4} \(alt\))/i),
    ende: find(/(endsaldo|neuer kontostand|saldo zum|schlusssaldo)/i),
  };
}
export function summencheck(rows, salden) {
  const summe = rows.reduce((a, r) => a + r.cent, 0n);
  const res = { summe, anzahl: rows.length, status: "unbekannt", abweichung: null, inkonsistent: rows.filter((r) => r.inkonsistent).length, format: rows.format || "" };
  if (salden.anfang != null && salden.ende != null) {
    res.abweichung = salden.anfang + summe - salden.ende;
    res.status = res.abweichung === 0n && !res.inkonsistent ? "ok" : "abweichung";
  } else if (res.inkonsistent) res.status = "abweichung";
  return res;
}
export function qualitaet(zeilen, rows) {
  const kand = zeilen.filter((z) => parseDatum(z) || /^\d{2}\/\d{2}\s/.test(z) || new RegExp(`^\\d{1,2}\\.? ${MONATSWORT} \\d{4}`, "i").test(z)).length;
  return kand ? Math.min(1, rows.length / kand) : 0;
}

// ---------- Prüfziffern ----------
export function ibanGueltig(s) {
  const t = s.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(t)) return false;
  if (t.startsWith("DE") && t.length !== 22) return false;
  const r = (t.slice(4) + t.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
  let rem = 0n;
  for (let i = 0; i < r.length; i += 7) rem = BigInt(String(rem) + r.slice(i, i + 7)) % 97n;
  return rem === 1n;
}
export function steuerIdGueltig(s) {
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const d = s.split("").map(Number), z = {};
  d.slice(0, 10).forEach((x) => (z[x] = (z[x] || 0) + 1));
  const mehr = Object.values(z).filter((n) => n > 1);
  if (mehr.length !== 1 || mehr[0] > 3) return false;
  let p = 10;
  for (let i = 0; i < 10; i++) { let sum = (d[i] + p) % 10; if (sum === 0) sum = 10; p = (sum * 2) % 11; }
  let k = 11 - p; if (k === 10) k = 0;
  return k === d[10];
}

export const STANDARD_WHITELIST = [
  "Finanzamt", "Steuerverwaltung", "Bundeszentralamt", "Bundeskasse", "Deutsche Bank", "Commerzbank", "Sparkasse", "Volksbank", "Raiffeisenbank",
  "Postbank", "ING", "N26", "Qonto", "Revolut", "PayPal", "Amazon", "Telekom", "Vodafone", "Stadtwerke", "Krankenkasse",
  "Elster", "DATEV", "Lastschrift", "Überweisung", "Gutschrift", "Dauerauftrag", "Kartenzahlung", "Entgelt", "Miete", "Gehalt",
  "Google", "OpenAI", "Interactive Brokers", "Handelsregister", "Unternehmensregister", "Bundesanzeiger", "IHK",
];
const wlRegex = (wl) => wl.map((w) => new RegExp(WG + esc(w) + WE, "i"));
const inWl = (text, regs) => regs.some((r) => r.test(text));

// ---------- Vornamen (Hinweis auf "Vorname Nachname") ----------
const VORNAMEN = new Set(("daniel marija kerstin anna maria marie sophie sofia laura julia lisa lena sarah sandra nicole stefanie katharina christina claudia petra sabine monika susanne andrea birgit heike ute karin renate ingrid " +
  "michael thomas andreas stefan christian markus martin peter hans jürgen klaus wolfgang uwe frank bernd dieter jörg ralf rainer matthias tobias sebastian alexander florian jens oliver patrick dirk holger " +
  "paul max felix lukas luca leon jonas tim tom ben finn noah elias david simon philipp fabian nico niklas moritz julian marcel kevin dennis sven timo marco mario carsten torsten axel erik eric lars nils henrik henning " +
  "ali mehmet mustafa ahmet hasan hüseyin ibrahim ismail yusuf murat emre can burak cem serkan fatma ayşe ayse emine zeynep elif hatice merve selin leyla " +
  "ivan marko stefan nikola luka milan goran zoran dragan branko ante josip mirko ivana ana maja jelena marina tanja natalija katarina " +
  "john james robert william richard joseph charles thomas mary jennifer linda elizabeth barbara susan jessica karen nancy " +
  "erika hanna hannah emma mia emilia lea leonie johanna charlotte clara greta frieda ida ella nora helga gerda brigitte gisela " +
  "marc mark marcus manuel manfred norbert olaf otto ole oskar pascal philip rolf roland ronald rudolf samuel siegfried stephan steffen sven theodor thorsten till tilo udo ulf ulrich uwe valentin viktor vincent volker walter werner wilhelm willi winfried wolf yannick yannik " +
  "adam adrian albert alfred alois anton arnold arthur benjamin benedikt bastian bruno carl karl carlo christoph christopher claus conrad konrad cornelius dominik dominic eberhard eduard emil enrico ernst eugen fabio ferdinand franz fritz gabriel georg gerald gerd gerhard gregor günter günther gustav harald hartmut heinz heinrich helmut helmuth herbert hermann horst hubert hugo igor immanuel ingo jakob jacob jannik jannis joachim jochen johannes johann jonathan josef joseph julius kai kurt lothar ludwig luis lutz maik malte manuel marius mathias mattias maximilian melvin michel mike milo nick nikolaus norman oliver orlando patrik pierre rafael ralph raphael reinhard reinhold rene rené richard robin rocco roman ruben rüdiger sascha sepp silas stephen sönke thilo tilman timm tino tobi toni torben ulli urs vitali waldemar wendelin xaver " +
  "agnes alexandra alina alice amelie anika anja anke annabelle anne annette annika antje astrid barbara beate bettina bianca birte carina carla carmen caroline cathrin cecilia celine christa christiane cornelia dana daniela denise diana doris dorothea edith elena eleonora elisabeth elke ellen elvira eva evelyn fabienne felicitas finja franziska frauke gabriele gabi gaby gesine gudrun hanne hannelore heidi helen helena helene henrike hilde hildegard ilona ina inga inge irene irina iris isabel isabella isabelle jana janina janine jasmin jessika joanna jolanta jutta kai kaja karolina katja katrin kathrin kerstin kirsten klara kristina kristin larissa lara leah lilli lilly lina liselotte lotte louisa luise luisa madeleine magdalena maike manuela margarete margit mareike marianne marion marlene marta martha martina mathilde meike melanie melina melissa michaela miriam nadine nadja natascha nele nina olga paula pauline petra pia ramona rebecca regina renate rita romy rosa rosemarie ruth sabrina sandy saskia selina silke silvia simone sina sonja stella stephanie svenja sylvia tamara tatjana theresa tina ulrike ursula uta valerie vanessa vera verena veronika viktoria viola waltraud wiebke yvonne zoe " +
  "ahmed aleksandar alexei andrej andrzej anton bogdan boris damir darko denis dimitri dmitri dusan emir enes fatih goran gregor hakan haris hamza igor ilija jovan kemal kenan klemens kristian krzysztof lazar leonid lukasz marcin mateusz miguel miroslav mohamed mohammad muhammad nenad nikita omar oleg pavel petar piotr rade rafal ramin sasa saša sergej sergey slobodan stanislav tomas tomasz tihomir toni vedran vladimir vlado wojciech yasin zlatko zoran " +
  "alice alicia amanda amy angela anita ashley beth betty brenda carol catherine christine cynthia deborah debra diane donna dorothy emily frances gloria helen janet janice jean joan joyce judith julie kathleen kelly kimberly laura lori margaret marilyn martha megan michelle pamela patricia rachel rebecca rose ruth samantha sharon shirley stephanie teresa theresa virginia " +
  "adrian alan albert andrew anthony arthur austin benjamin bradley brian bruce bryan carl chris christopher craig daniel dennis donald douglas edward eric ethan frank gary gerald gregory harold harry henry howard jack jacob jeffrey jeremy jerry jesse joe jonathan joshua justin keith kenneth kevin larry lawrence logan mathew matthew nathan nicholas patrick paul peter philip ralph randy raymond roger ronald roy russell ryan samuel scott sean stephen steven terry timothy tyler walter wayne zachary").split(" "));

// ---------- Namen automatisch lernen ----------
const ROLLEN = "Schenker|Beschenkte|Erblasser|Erbe|Vermieter|Mieter|Käufer|Verkäufer|Arbeitgeber|Arbeitnehmer|Auftraggeber|Auftragnehmer|Inhaber|Kontoinhaber|Antragsteller|Steuerpflichtige|Ehepartner|Ehegatte|Gesellschafter|Geschäftsführer|Bevollmächtigte|Herr|Frau|Name|Unterschrift|Zeuge|Notar|Vollmachtgeber|Darlehensgeber|Darlehensnehmer|Lizenzgeber|Lizenznehmer|Borrower|Lender|Director|Officer|Stockholder|Shareholder|Founder|President|Secretary";
const STOP = new Set(("schenker schenkerin beschenkte beschenkter beschenkten erblasser erblasserin erbe erbin vermieter vermieterin mieter mieterin käufer käuferin verkäufer verkäuferin arbeitgeber arbeitnehmer " +
  "auftraggeber auftragnehmer inhaber inhaberin kontoinhaber antragsteller steuerpflichtige ehepartner ehegatte gesellschafter geschäftsführer bevollmächtigte herr frau name unterschrift anschrift steuer beruf geboren geburtsdatum " +
  "datum anlagen anlage finanzamt sehr geehrte geehrter damen herren konto vertrag betrag schenkung rechtsgrund gegenstand wert zeitpunkt herkunft persönliches verhältnis frühere zuwendungen mit freundlichen grüßen die der das und von an bei " +
  "zeuge notar vollmachtgeber identifikationsnummer steueridentifikationsnummer darlehensgeber darlehensnehmer lizenzgeber lizenznehmer borrower lender director officer stockholder shareholder founder president secretary the and of inc llc ltd").split(" "));
const WORT = "[A-ZÄÖÜ][a-zäöüß\\-]{1,}";
const NAME_KANDIDAT = `(?:Dr\\.[ \\t]+|Prof\\.[ \\t]+)?${WORT}(?:[ \\t]+${WORT}){1,2}`;
const RE_ROLLE = new RegExp(`${WG}(?:${ROLLEN})(?:in|r|n|s|e)?[ \\t]*[:\\-]?[ \\t]+(${NAME_KANDIDAT})`, "g");
const RE_INITIAL = new RegExp(`${WG}(?:${ROLLEN})(?:in|r|n|s|e)?[ \\t]*[:\\-]?[ \\t]+([A-ZÄÖÜ]\\.[ \\t]*${WORT})`, "g");
const RE_GEBOREN = new RegExp(`(${NAME_KANDIDAT}),?[ \\t]+(?:geboren|geb\\.)`, "g");
const RE_BRIEFKOPF = new RegExp(`^[ \\t]*(${NAME_KANDIDAT})[ \\t]*[·|•]`);
// "Geld eingezahlt von MAX MUSTERMANN •": Name zwischen von/an und dem Trennpunkt (Revolut)
const RE_VONPUNKT = new RegExp(`${WG}(?:von|an|from|to)[ \\t]+([A-ZÄÖÜ][${BUCHST}\\-]+(?:[ \\t]+[A-ZÄÖÜ][${BUCHST}\\-]+){1,2})[ \\t]*•`, "g");
const RE_FIRMA = /(?<![\wäöüÄÖÜß])((?:[A-ZÄÖÜ][\wäöüß&.\-]*\s+){1,6}(?:GmbH(?:\s*&\s*Co\.?\s*KG)?|UG(?:\s*\(haftungsbeschränkt\))?|AG|KG|OHG|GbR|e\.\s?V\.|SE|Ltd\.?|Inc\.?|LLC|Limited))(?![\wäöüß])/gi;
// Lookahead, damit auch überlappende Paare gefunden werden ("Genussrechte Marc Beispielmann" enthält "Marc Beispielmann")
const NAMTOK = "(?:[A-ZÄÖÜ][a-zäöüß\\-]{2,}|[A-ZÄÖÜ]{3,})";
const RE_VORNAME_NACHNAME = new RegExp(`${WG}(?=(${NAMTOK})(?![a-zäöüß])[ \\t]+(${NAMTOK})(?![a-zäöüß]))`, "g");
// "Anna und Paul Beispiel": beide Vornamen gehören zum Nachnamen
const RE_UND = new RegExp(`${WG}(${NAMTOK})(?![a-zäöüß])[ \\t]+und[ \\t]+(${NAMTOK})(?![a-zäöüß])[ \\t]+(${NAMTOK})(?![a-zäöüß])`, "g");

// Register, Bescheide: "Beispiel, Paul, Teststadt" (Nachname, Vorname)
const RE_NACHVOR = new RegExp(`${WG}([A-ZÄÖÜ][a-zäöüß\\-]{2,}),[ \\t]+([A-ZÄÖÜ][a-zäöüß\\-]{2,})(?=[ \\t]*(?:,|$|\\*))`, "gm");

export function lerneNamen(text, whitelist = STANDARD_WHITELIST) {
  const wl = wlRegex(whitelist);
  const gefunden = new Map(); // schlüssel (klein) -> Schreibweise
  const nimm = (roh, vonVorne) => {
    let w = roh.replace(/^(?:Dr\.|Prof\.)\s+/, "").split(/\s+/);
    if (vonVorne) { while (w.length && STOP.has(w[0].toLowerCase())) w.shift(); }
    else { const i = w.findIndex((x) => STOP.has(x.toLowerCase())); if (i >= 0) w = w.slice(0, i); }
    if (w.length < 2 || w.some((x) => STOP.has(x.toLowerCase())) || inWl(w.join(" "), wl)) return;
    const k = w.join(" ").toLowerCase();
    if (!gefunden.has(k)) gefunden.set(k, w.join(" "));
  };
  let m;
  RE_ROLLE.lastIndex = 0; while ((m = RE_ROLLE.exec(text))) nimm(m[1], false);
  RE_GEBOREN.lastIndex = 0; while ((m = RE_GEBOREN.exec(text))) nimm(m[1], true);
  RE_INITIAL.lastIndex = 0; while ((m = RE_INITIAL.exec(text))) { const k = m[1].trim().toLowerCase(); if (!gefunden.has(k) && !STOP.has(m[1].split(/\s+/).pop().toLowerCase())) gefunden.set(k, m[1].trim()); }
  RE_VONPUNKT.lastIndex = 0; while ((m = RE_VONPUNKT.exec(text))) nimm(m[1], false);
  const erste = text.split(/\r?\n/).find((z) => z.trim());
  if (erste && (m = RE_BRIEFKOPF.exec(erste))) nimm(m[1], true);
  // "Vorname Nachname" mit bekanntem Vornamen, auch GROSSGESCHRIEBEN
  RE_NACHVOR.lastIndex = 0;
  while ((m = RE_NACHVOR.exec(text))) {
    if (VORNAMEN.has(m[2].toLowerCase()) && !VORNAMEN.has(m[1].toLowerCase())) nimm(m[2] + " " + m[1], false);
  }
  RE_UND.lastIndex = 0;
  while ((m = RE_UND.exec(text))) {
    if (VORNAMEN.has(m[1].toLowerCase()) || VORNAMEN.has(m[2].toLowerCase())) { nimm(m[1] + " " + m[3], false); nimm(m[2] + " " + m[3], false); }
  }
  RE_VORNAME_NACHNAME.lastIndex = 0;
  while ((m = RE_VORNAME_NACHNAME.exec(text))) {
    if (m.index === RE_VORNAME_NACHNAME.lastIndex) RE_VORNAME_NACHNAME.lastIndex++;
    if (VORNAMEN.has(m[1].toLowerCase()) && !STOP.has(m[2].toLowerCase())) nimm(m[1] + " " + m[2], false);
  }
  return [...gefunden.values()];
}
export function lerneFirmen(text, whitelist = STANDARD_WHITELIST) {
  const wl = wlRegex(whitelist);
  const gef = new Map();
  RE_FIRMA.lastIndex = 0;
  let m;
  while ((m = RE_FIRMA.exec(text))) {
    // führende Allerweltswörter (Gehalt, Überweisung ...) abschneiden
    let w = m[1].trim().split(/\s+/);
    while (w.length > 2 && (inWl(w[0], wl) || STOP.has(w[0].toLowerCase()))) w.shift();
    const name = w.join(" ");
    if (w.length < 2 || inWl(name, wl)) continue;
    const k = name.toLowerCase().replace(/[\s.]+/g, "");
    if (!gef.has(k)) gef.set(k, name);
  }
  return [...gef.values()];
}

// Name → Regex: Groß/Klein egal, Leerzeichen/Punkte/Unterstriche flexibel ("O. P. N" = "O.P.N").
// Ende: kein Kleinbuchstabe danach (so trifft "Beispiel" nicht "Beispiele", aber "BeispielTel" aus verklebten Textebenen)
function nameRegex(n, mitHausnummer = false) {
  const tok = n.split(/[\s._\-]+/).filter(Boolean).map((t) => [...t].map((c) => (/[A-Za-zÄÖÜäöüß]/.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : esc(c))).join(""));
  const ende = "(?:[’']?s)?(?![a-zäöüß])(?![A-ZÄÖÜ](?![a-zäöüß]))";
  return new RegExp("(?<![A-Za-zÄÖÜäöüß])" + tok.join("[\\s._\\-]*") + ende + (mitHausnummer ? "(?:\\.?[ \\t]*\\d{1,3}[a-z]?(?![\\d]))?" : ""), "g");
}

const IBAN_KAND = /(?<![\wäöüß])[A-Z]{2}\d{2}(?:[  ]?[A-Z0-9]){11,31}/g;
function ersetzeIbans(t, id) {
  return t.replace(IBAN_KAND, (m) => {
    const pos = []; // Index der alphanumerischen Zeichen
    for (let i = 0; i < m.length; i++) if (/[A-Z0-9]/.test(m[i])) pos.push(i);
    for (let len = Math.min(34, pos.length); len >= 15; len--) {
      const cand = pos.slice(0, len).map((i) => m[i]).join("");
      if (ibanGueltig(cand)) return id("IBAN", cand) + m.slice(pos[len - 1] + 1);
    }
    return m;
  });
}

const ZEITWORT = "Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Jahr|Monat|Tag|Euro|Cent|Stück|Prozent";

export function pseudonymisiere(text, opt = {}) {
  const map = new Map(opt.vorhandeneMap || []);
  const zaehler = {};
  const whitelist = opt.whitelist || STANDARD_WHITELIST;
  const wl = wlRegex(whitelist);
  const id = (typ, wert) => {
    const k = typ + "|" + wert;
    if (!map.has(k)) { zaehler[typ] = (zaehler[typ] || 0) + 1; map.set(k, `${typ}_${String(zaehler[typ]).padStart(2, "0")}`); }
    return map.get(k);
  };
  for (const [k, v] of map) { const t = k.split("|")[0]; const n = +v.split("_")[1]; zaehler[t] = Math.max(zaehler[t] || 0, n); }
  const ersetzen = (typ, wert) => {
    // führende Wörter aus der Whitelist (z. B. "Gehalt") bleiben stehen; ist der Rest eine Institution, bleibt alles
    const w = wert.trim().split(/\s+/);
    let i = 0;
    while (i < w.length - 1 && inWl(w[i], wl)) i++;
    const rest = w.slice(i).join(" ");
    if (inWl(rest, wl)) return wert;
    return (i ? w.slice(0, i).join(" ") + " " : "") + id(typ, rest);
  };
  let t = text;

  // 1) Namen: eigene Eingaben + automatisch gelernte Personen und Firmen (global, ohne Rücksicht auf Groß/Klein)
  const gelernt = opt.autoNamen === false ? [] : [...lerneNamen(text, whitelist), ...lerneFirmen(text, whitelist)];
  const dedup = new Map();
  for (const n of [...(opt.eigeneNamen || []), ...gelernt].map((x) => x.trim()).filter(Boolean)) {
    const k = n.toLowerCase().replace(/[\s.]+/g, "");
    if (!dedup.has(k)) dedup.set(k, n);
  }
  const alle = [...dedup.values()].sort((a, b) => b.length - a.length);
  const typVon = (n) => (/(?<![\wäöüß])(?:GmbH|UG|AG|KG|OHG|GbR|SE|Ltd|Inc|LLC|Limited)(?![\wäöüß])|e\.\s?V\./i.test(n) ? "FIRMA" : "PERSON");
  const ersetzeName = (n, typ, ziel) => { t = t.replace(nameRegex(n), () => id(typ, ziel)); };
  const RECHTSFORM = /[\s.]*(?:GmbH(?:\s*&\s*Co\.?\s*KG)?|UG(?:\s*\(haftungsbeschränkt\))?|AG|KG|OHG|GbR|e\.\s?V\.|SE|Ltd\.?|Inc\.?|LLC|Limited)\s*$/i;
  for (const n of alle) ersetzeName(n, typVon(n), n);
  for (const n of alle) { // Kurzname ("Beispiel Handel" aus "Beispiel Handel GmbH") bekommt dieselbe Kennung
    if (typVon(n) !== "FIRMA") continue;
    const kern = n.replace(RECHTSFORM, "").trim();
    if (kern.length >= 5 && kern !== n && !inWl(kern, wl) && !STOP.has(kern.toLowerCase())) ersetzeName(kern, "FIRMA", n);
  }
  // Nachnamen/Vornamen allein: eindeutig → Kennung der Person, mehrdeutig (Familie) → NACHNAME/VORNAME
  const personen = alle.filter((n) => typVon(n) === "PERSON" && n.split(/\s+/).length >= 2);
  const teil = (n, idx) => { const w = n.split(/\s+/); return idx === 0 ? w[0] : w[w.length - 1]; };
  for (const idx of [1, 0]) {
    const typTeil = idx === 1 ? "NACHNAME" : "VORNAME";
    for (const n of personen) {
      const wort = teil(n, idx);
      if (wort.length < 4 || inWl(wort, wl) || STOP.has(wort.toLowerCase())) continue;
      const gleich = personen.filter((x) => teil(x, idx).toLowerCase() === wort.toLowerCase());
      if (gleich.length > 1) ersetzeName(wort, typTeil, wort.toLowerCase());
      else ersetzeName(wort, "PERSON", n);
    }
  }

  // 2) IBAN (nur prüfsummen-gültige, längster gültiger Anfang) und BIC
  t = ersetzeIbans(t, id);
  t = t.replace(/(?<![\wäöüß])[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?(?![\wäöüß])(?=[ \t]|$)/g, (m, off, s) => (/(?:BIC|SWIFT)[: \t]*$/i.test(s.slice(Math.max(0, off - 12), off)) ? id("BIC", m) : m));
  // 3) Kontaktdaten und Kennungen
  t = t.replace(/[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, (m) => id("EMAIL", m.toLowerCase()));
  t = t.replace(/(?<![\d.,])\(\s?\+?\d{2,6}\s?\)[ \t\/-]*\d[\d \t\/-]{3,}\d(?![\d])/g, (m) => id("TEL", m.replace(/\D/g, "")));
  t = t.replace(/(?<![\wäöüß])(?:Tel|Telefon|Fax|Mobil|Handy|Phone)\.?[ \t]*:?[ \t]*\+?[\d()\/ \t-]{6,}\d(?![\d])/gi, (m) => { const d = m.replace(/^[^\d+(]*/, ""); return m.slice(0, m.length - d.length) + id("TEL", d.replace(/\D/g, "")); });
  t = t.replace(/(?<![\d.,])(?:\+49|0049|0)\s?\(?\d{2,5}\)?[\s\/-]?\d{3,}[\d\s\/-]{2,}\d(?!\d)/g, (m) => id("TEL", m.replace(/\D/g, "")));
  t = t.replace(/(?<![\d.,])\d{11}(?![\d.,])/g, (m) => (steuerIdGueltig(m) ? id("STEUERID", m) : m));
  t = t.replace(/\b(?:Steuer-?ID|IdNr\.?|Identifikationsnummer)\s*[:\-]?\s*(\d{11})\b/gi, (m, n) => m.replace(n, id("STEUERID", n)));
  t = t.replace(/\b\d{2,3}\/\d{3,4}\/\d{4,5}\b/g, (m) => id("STNR", m));
  // 3b) Anschrift, Geburtsdatum (Fundstellen merken, danach überall ersetzen, auch ohne Hausnummer/Ort)
  const strassen = new Set(), plzs = new Set(), gebs = new Set();
  const merkeStr = (m) => { const k = m.replace(/[ \t\r\n]+\d{1,3}[ \t]?[a-z]?\s*$/i, "").trim(); if (k.length >= 8) strassen.add(k); return id("ADRESSE", m.replace(/\s+/g, " ").trim()); };
  const dob = (m, d) => { gebs.add(d); return m.replace(d, id("GEBDATUM", d)); };
  t = t.replace(/(?<![\wäöüß])(?:geboren am|geb\. am|geb\.|Geburtsdatum:?)\s*(\d{2}\.\d{2}\.\d{4})/gi, dob);
  t = t.replace(/\(\*\s?(\d{2}\.\d{2}\.\d{4})\)|(?<![\d.])\*\s?(\d{2}\.\d{2}\.\d{4})/g, (m, a, b) => dob(m, a || b));
  const STR = "(?:[Ss]traße|[Ss]trasse|[Aa]llee|[Pp]latz|[Ww]eg|[Gg]asse|[Rr]ing|[Dd]amm|[Uu]fer)";
  t = t.replace(new RegExp(`${WG}[A-ZÄÖÜ][a-zäöüß\\-]+(?:[ \\t]+${STR}|(?:straße|strasse|str\\.|allee|platz|weg|gasse|ring|damm|ufer)\\.?)\\s*\\d{1,3}(?:[a-z](?![\\wäöüß]))?(?![\\d])`, "g"), merkeStr);
  t = t.replace(new RegExp(`${WG}[A-ZÄÖÜ]{3,}[ \\t]*(?:STRASSE|STRAßE|ALLEE|PLATZ|WEG|GASSE|RING|DAMM|UFER|STR\\.)\\s*\\d{1,3}(?:[A-Z](?![\\wäöüß]))?(?![\\d])`, "g"), merkeStr);
  t = t.replace(new RegExp(`${WG}(?:(?:Hinter|Vor|Auf|An|Unter|In)\\s+(?:dem|der|den)|Am|Im|Zum|Zur)\\s+(?!(?:${ZEITWORT})\\b)[A-ZÄÖÜ][a-zäöüß\\-]+[ \\t]+\\d{1,3}(?:[a-z](?![\\wäöüß]))?(?![\\d])`, "g"), merkeStr);
  t = t.replace(new RegExp(`${WG}(?:(?:HINTER|VOR|AUF|AN|UNTER|IN)\\s+(?:DEM|DER|DEN)|AM|IM|ZUM|ZUR)\\s+[A-ZÄÖÜ]+(?:\\s+[A-ZÄÖÜ]+)?[ \\t]+\\d{1,3}(?:[A-Z](?![\\wäöüß]))?(?![\\d])`, "g"), merkeStr);
  t = t.replace(new RegExp(`(?<![\\d.,])\\b(\\d{5})[,]?[ \\t]+(?!(?:${ZEITWORT})\\b)[A-ZÄÖÜ][a-zäöüß\\-]+(?:[ \\t][A-ZÄÖÜ][a-zäöüß\\-]+)?`, "g"), (m, z) => { plzs.add(z); return id("PLZORT", m.trim()); });
  for (const k of strassen) t = t.replace(nameRegex(k, true), () => id("ADRESSE", k));
  for (const z of plzs) t = t.replace(new RegExp("(?:(?<=_\\d{2})|(?<![\\d.,]))" + z + "(?![\\d.,])", "g"), () => id("PLZORT", z));
  for (const d of gebs) t = t.replace(new RegExp("(?<![\\d.])" + esc(d) + "(?![\\d])", "g"), () => id("GEBDATUM", d));
  // 3c) Adressen im Netz: Webseiten, Profile, lokale Adressen
  t = t.replace(/(?<![\w@.-])(?:https?:\/\/|www\.)[^\s)>\]]+|(?<![\w@.-])(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\/\S*|(?<![\w@.-])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|de|net|org|io|eu|app|dev|me|co|ai|ch|at)(?:\/[^\s)>\]]*)?(?![\w@])/gi,
    (m) => { const pfad = /\/[^\/\s]/.test(m.replace(/^https?:\/\//i, "")); return !pfad && inWl(m, wl) ? m : id("URL", m.replace(/[.,;]+$/, "")); });
  // 4) Anreden und Namensfelder
  t = t.replace(ANREDE, (m, n) => m.replace(n, ersetzen("PERSON", n.trim()) + (n.endsWith(" ") ? " " : "")));
  t = t.replace(NAMENSFELD, (m, n) => m.replace(n, ersetzen("PERSON", n.trim()) + (n.endsWith(" ") ? " " : "")));
  // 5) Referenzen (optional): lange Ziffern-/Buchstabenfolgen
  if (opt.referenzenMaskieren) t = t.replace(/\b(?=[A-Z0-9-]*\d)[A-Z0-9-]{10,}\b/g, (m) => (/^(?:[A-Z]+)_\d+$/.test(m) ? m : id("REF", m)));
  return { text: t, map, gelernt, tabelle: Object.fromEntries([...map].map(([k, v]) => [v, k.split("|").slice(1).join("|")])) };
}
const ANREDE = /(?<![\wäöüß])(?:Herr|Frau|Hr\.|Fr\.|Dr\.|Prof\.)\s+((?:[A-ZÄÖÜ][a-zäöüß\-]+[ \t]?){1,3})/g;
const NAMENSFELD = /(?<![\wäöüß])(?:Name|Inhaber|Auftraggeber|Empfänger|Begünstigter|Zahlungspflichtiger|Kontoinhaber)[ \t]*[:\-][ \t]*((?:(?!(?:PERSON|FIRMA)_)[A-ZÄÖÜ][\wäöüß.\-]+[ \t]?){1,4})/g;

export function reidentifiziere(text, tabelle) {
  return Object.entries(tabelle).sort((a, b) => b[0].length - a[0].length).reduce((t, [pseudo, klar]) => t.split(pseudo).join(klar), text);
}

// ---------- Restrisiko: was könnte noch identifizieren? ----------
const PLATZHALTER = /^(IBAN|BIC|PERSON|FIRMA|EMAIL|TEL|REF|STNR|STEUERID|ADRESSE|PLZORT|GEBDATUM|NACHNAME|VORNAME|URL)_/;
const ARTIKEL = new Set("der die das den dem des ein eine einen einem einer eines dieser diese dieses diesem diesen jede jeder jedes jeden jedem alle allen beide beiden keine kein keinen ihr ihre ihrer ihren ihrem ihres ihnen mein meine meiner meinen unser unsere von mit für bei nach zur zum zwischen wenn sofern sind ist sie wir the this that these those each both all any a an of to in for with by under between per one two our your".split(" "));
const SACHWORT = /(ung|ungen|keit|heit|schaft|schaften|recht|rechte|rechts|kapital|vertrag|vertrags|betrag|beträge|gebühr|gebühren|konto|steuer|zins|zinsen|forderung|verbindlichkeit|vereinbarung|erklärung|beschluss|bilanz|abschluss|auszahlung|zahlung|rechnung|karte|karten|bank|stand|datum|summe|saldo|tag|jahr|jahre|monat|agreement|payment|payments|expense|expenses|date|total|period|summary|notice|rules|stock|shares|share|loan|bond|bonds|party|parties|company|corporation|limited|inc|llc|ltd|schein|titel|werk|buch|buches|seite|formular|formulare|software|domains|lizenz|aktiva|passiva|kosten|ertrag|erträge|aufwand|aufwendungen|vermögen|gewinn|verlust|frist|annahme|risiko|entscheidung|maßnahme|ergebnis|status|quelle|thema|grund)$/i;
const NUR_ORT_ORG = /^(Amtsgericht|Republik|Deutschen|Europäischen|Delaware|United|Salt|Konstitucijos|Stripe|Apple|Anthropic|Claude|Brex|Replit|Gamma|Notion|Google|Microsoft)\b/;
function istSatzbaustein(phrase) {
  const w = phrase.split(/\s+/);
  if (ARTIKEL.has(w[0].toLowerCase())) return true;
  if (NUR_ORT_ORG.test(phrase)) return true;
  return w.every((x) => SACHWORT.test(x) || ARTIKEL.has(x.toLowerCase()));
}
export function restrisiko(text, opt = {}) {
  const wl = wlRegex(opt.whitelist || STANDARD_WHITELIST);
  const fund = new Map();
  const re = /(?<![\wäöüß])[A-ZÄÖÜ][a-zäöüß]{2,}(?:[ \t]+[A-ZÄÖÜ][a-zäöüß]{2,}){1,2}(?![\wäöüß])/g;
  let m;
  while ((m = re.exec(text))) {
    const w = m[0];
    if (PLATZHALTER.test(w) || inWl(w, wl)) continue;
    // Vorname + Großwort ist verdächtig, selbst wenn das Großwort wie ein Substantiv endet
    const bekannt = w.split(/\s+/).some((x) => VORNAMEN.has(x.toLowerCase()));
    if (!bekannt && istSatzbaustein(w)) continue;
    fund.set(w, (fund.get(w) || 0) + 1);
  }
  // GROSSGESCHRIEBENE Namenspaare mit bekanntem Vornamen
  const caps = /(?<![\wäöüß])([A-ZÄÖÜ]{3,})[ \t]+([A-ZÄÖÜ]{3,})(?![\wäöüß])/g;
  while ((m = caps.exec(text))) if (VORNAMEN.has(m[1].toLowerCase()) && !PLATZHALTER.test(m[0])) fund.set(m[0], (fund.get(m[0]) || 0) + 1);
  const lange = text.split(/\r?\n/).filter((z) => z.length > 140).length;
  const ziffern = (text.match(/(?<![\d.,])\d{8,}(?![\d.,])/g) || []).length;
  const namen = [...fund.keys()];
  // hart: ein bekannter Vorname mit Nachnamen steht noch im Text (sollte nie vorkommen) oder viele lange Zahlen
  const verdaechtig = namen.filter((n) => n.split(/\s+/).some((x) => VORNAMEN.has(x.toLowerCase())));
  const stufe = verdaechtig.length > 0 || ziffern > 5 ? "hoch" : namen.length > 0 || ziffern > 0 || lange > 0 ? "mittel" : "niedrig";
  // Reihenfolge: verdächtige zuerst, dann häufige
  const sortiert = [...fund.entries()].sort((x, y) => (verdaechtig.includes(y[0]) ? 1 : 0) - (verdaechtig.includes(x[0]) ? 1 : 0) || y[1] - x[1]).map((e) => e[0]);
  return { stufe, verdaechtig, moeglicheNamen: sortiert.slice(0, 80), anzahlKandidaten: namen.length, langeZeilen: lange, langeZahlen: ziffern };
}

// ---------- Export ----------
export function alsCsv(rows) {
  // Text stammt aus fremden PDFs: führende Formelzeichen für Tabellenprogramme entschärfen
  const q = (s) => { let t = String(s); if (/^[=+\-@\t]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  return "Datum;Text;Betrag\r\n" + rows.map((r) => [r.datum, q(r.text), fmtCent(r.cent)].join(";")).join("\r\n");
}
