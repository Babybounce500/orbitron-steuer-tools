// Dateien lokal lesen: PDF mit Textebene, gescannte PDFs und Bilder per Texterkennung (Tesseract im Browser).
// Nichts wird gesendet. "gruppiere" ist gruppiereZeilen aus extractor-core.js; pdfjsLib kommt als globale Bibliothek.

export const MAX_OCR_SEITEN = 30;
const BILD = /\.(png|jpe?g|webp|bmp|gif)$/i;
export const istPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
export const istBild = (f) => /^image\/(png|jpe?g|webp|bmp|gif)$/.test(f.type || "") || BILD.test(f.name || "");

let arbeiter = null; // Versprechen auf den Tesseract-Worker (einmal pro Seite)
let schlange = Promise.resolve(); // Leseaufträge laufen nacheinander
let ladeVersprechen = null;
function ladePaket() {
  if (window.ORBITRON_OCR) return Promise.resolve();
  if (!ladeVersprechen) ladeVersprechen = new Promise((ok, fehler) => {
    const s = document.createElement("script");
    s.src = window.ORBITRON_OCR_URL || "vendor/ocr-paket.js";
    s.onload = () => (window.ORBITRON_OCR ? ok() : fehler(new Error("OCR-Paket unvollständig")));
    s.onerror = () => { ladeVersprechen = null; fehler(new Error("Die Datei ocr-paket.js fehlt. Sie muss im selben Ordner wie die Seite liegen.")); };
    document.head.append(s);
  });
  return ladeVersprechen;
}
function holeArbeiter(melde) {
  if (!arbeiter) arbeiter = starteArbeiter(melde).catch((e) => { arbeiter = null; throw e; });
  return arbeiter;
}
async function starteArbeiter(melde) {
  melde("Texterkennung wird geladen (einmalig) …");
  await ladePaket();
  const P = window.ORBITRON_OCR;
  const url = URL.createObjectURL(new Blob([P.core, "\n;\n", P.worker], { type: "text/javascript" }));
  const deu = Uint8Array.from(atob(P.deu), (c) => c.charCodeAt(0));
  const w = await window.Tesseract.createWorker([{ code: "deu", data: deu }], 1, {
    workerPath: url, workerBlobURL: false, corePath: "eingebaut", cacheMethod: "none", gzip: true,
    errorHandler: (e) => console.error("OCR:", e),
  });
  // Seitenmodus 4 (eine Spalte mit unterschiedlichen Schriftgrößen) hält Beträge samt Vorzeichen in der Zeile
  await w.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "4" });
  return w;
}

// Bild für die Erkennung vorbereiten: vergrößern, Graustufen, dunkle Bildschirmfotos umkehren
function bereite(quelle, breite, hoehe) {
  let f = 1;
  if (breite < 2000) f = Math.min(3, 2000 / breite);
  if (breite * f > 3500) f = 3500 / breite;
  if (breite * f * hoehe * f > 24e6) f = Math.sqrt(24e6 / (breite * hoehe));
  const c = document.createElement("canvas"); c.width = Math.round(breite * f); c.height = Math.round(hoehe * f);
  const x = c.getContext("2d", { willReadFrequently: true });
  x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  x.imageSmoothingQuality = "high"; x.drawImage(quelle, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  let summe = 0;
  for (let i = 0; i < p.length; i += 4) { const g = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000; p[i] = p[i + 1] = p[i + 2] = g; summe += g; }
  const dunkel = summe / (p.length / 4) < 115;
  if (dunkel) for (let i = 0; i < p.length; i += 4) p[i] = p[i + 1] = p[i + 2] = 255 - p[i];
  // Kontrast spreizen: Hintergrund (häufigster Hellwert) wird reinweiß, dünne Zeichen wie Minus bleiben sichtbar
  const hist = new Uint32Array(256);
  for (let i = 0; i < p.length; i += 4) hist[p[i]]++;
  let grund = 255; for (let v = 128; v < 256; v++) if (hist[v] > hist[grund] || hist[grund] === 0) grund = v;
  let tief = 0, n = 0; const grenze = p.length / 4 * 0.005; while (tief < 120 && (n += hist[tief]) < grenze) tief++;
  const oben = Math.max(tief + 60, grund - 6);
  for (let i = 0; i < p.length; i += 4) p[i] = p[i + 1] = p[i + 2] = Math.max(0, Math.min(255, (p[i] - tief) * 255 / (oben - tief)));
  x.putImageData(d, 0, 0);
  return c;
}

async function erkenne(canvas, gruppiere, melde) {
  const w = await holeArbeiter(melde);
  const { data } = await w.recognize(canvas);
  // Wörter nach ihrer Position zu Zeilen zusammensetzen (hält Tabellenzeilen zusammen)
  // Vorzeichen werden oft einzeln und mit niedriger Sicherheit erkannt: nie wegfiltern
  const woerter = (data.words || []).filter((x) => x.text && x.text.trim() && (x.confidence > 0 || /^[+\-−–]/.test(x.text.trim())));
  const hoehen = woerter.map((x) => x.bbox.y1 - x.bbox.y0).sort((a, b) => a - b);
  const h = hoehen[Math.floor(hoehen.length / 2)] || 20;
  const items = woerter.map((x) => ({ str: x.text, x: x.bbox.x0, y: -(x.bbox.y0 + x.bbox.y1) / 2 }));
  return { zeilen: gruppiere(items, h * 0.6), konfidenz: data.confidence || 0, woerter: woerter.length };
}

export async function bildZuZeilen(datei, gruppiere, melde = () => {}) {
  const bild = await createImageBitmap(datei);
  try {
    melde("Erkenne Text im Bild …");
    return await erkenne(bereite(bild, bild.width, bild.height), gruppiere, melde);
  } finally { bild.close(); }
}

export async function pdfLesen(datei, gruppiere, melde = () => {}) {
  if (!window.pdfjsLib) throw new Error("pdf.js fehlt");
  const buf = await datei.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf, disableFontFace: true, isEvalSupported: false }) /* CVE-2024-4367: nie eval für PDF-Inhalte */.promise;
  const zeilen = []; const konfidenzen = []; let ocrSeiten = 0, ausgelassen = 0;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const zeichen = tc.items.reduce((a, i) => a + i.str.trim().length, 0);
    const ausText = () => gruppiere(tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height })));
    // Wenig Text kann nur eine Kopfzeile über einem Scan sein: dann auf Bilder prüfen
    const mitBild = zeichen >= 20 && zeichen < 200 && (await page.getOperatorList()).fnArray.some((f) => f === window.pdfjsLib.OPS.paintImageXObject || f === window.pdfjsLib.OPS.paintJpegXObject);
    if (zeichen >= 20 && !mitBild) { zeilen.push(...ausText()); continue; }
    // Seite ohne Textebene (Scan oder Foto): als Bild darstellen und erkennen
    if (ocrSeiten >= MAX_OCR_SEITEN) { ausgelassen++; continue; }
    melde(`Seite ${p} von ${pdf.numPages} ist ein Bild, Texterkennung läuft …`);
    const basis = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(3, 2200 / basis.width) });
    const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    const r = await erkenne(bereite(c, c.width, c.height), gruppiere, melde);
    ocrSeiten++;
    if (r.zeilen.join("").replace(/\s/g, "").length < zeichen) { zeilen.push(...ausText()); continue; } // Textebene war vollständiger
    if (r.woerter) { zeilen.push(...r.zeilen); konfidenzen.push(r.konfidenz); }
  }
  return { zeilen, ocrSeiten, ausgelassen, konfidenz: konfidenzen.length ? konfidenzen.reduce((a, b) => a + b, 0) / konfidenzen.length : null };
}

// Mehrere Dateien: gibt Text und Angaben zur Texterkennung zurück
export function liesDateien(dateien, gruppiere, melde = () => {}) {
  const auftrag = schlange.then(() => liesNacheinander(dateien, gruppiere, melde));
  schlange = auftrag.catch(() => {});
  return auftrag;
}
async function liesNacheinander(dateien, gruppiere, melde) {
  const teile = []; let ocrSeiten = 0, ausgelassen = 0; const k = [];
  for (const f of dateien) {
    if (f.size > 25 * 1024 * 1024) throw new Error("Eine Datei ist größer als 25 MB.");
    if (istPdf(f)) {
      const r = await pdfLesen(f, gruppiere, melde);
      teile.push(r.zeilen.join("\n")); ocrSeiten += r.ocrSeiten; ausgelassen += r.ausgelassen; if (r.konfidenz != null) k.push(r.konfidenz);
    } else if (istBild(f)) {
      const r = await bildZuZeilen(f, gruppiere, melde);
      teile.push(r.zeilen.join("\n")); ocrSeiten++; if (r.woerter) k.push(r.konfidenz);
    } else throw new Error("Nur PDF oder Bild (PNG, JPG, WEBP) möglich.");
  }
  const konfidenz = k.length ? Math.round(k.reduce((a, b) => a + b, 0) / k.length) : null;
  const ocr = ocrSeiten ? { seiten: ocrSeiten, konfidenz, ausgelassen } : null;
  return { text: teile.join("\n"), ocr };
}
export function ocrHinweis(ocr) {
  if (!ocr) return "";
  return `Texterkennung auf ${ocr.seiten} Seite(n)/Bild(ern)${ocr.konfidenz != null ? `, geschätzte Sicherheit ${ocr.konfidenz} %` : ""}. Erkennungsfehler sind möglich: Namen und Beträge im Text prüfen.` +
    (ocr.ausgelassen ? ` ${ocr.ausgelassen} Seite(n) wurden ausgelassen (Grenze ${MAX_OCR_SEITEN}).` : "");
}
