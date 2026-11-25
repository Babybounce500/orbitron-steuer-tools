// Geldmodus gegen unabhängig mit Python berechnete Erwartungswerte (tests/geld-faelle.json).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bewerte } from "../web/geldmodus.js";

const faelle = JSON.parse(readFileSync(new URL("./geld-faelle.json", import.meta.url), "utf8"));

for (const f of faelle) {
  test(`Geldmodus: ${f.ausdruck}`, () => {
    const r = bewerte(f.ausdruck);
    if (f.fehler) { assert.equal(r.ok, false, "Fehler erwartet, aber Ergebnis " + r.gerundet); assert.ok(r.fehler.length > 3); return; }
    assert.equal(r.ok, true, r.fehler);
    assert.equal(r.gerundet, f.erwartet);
    assert.equal(r.istExakt, f.exakt);
  });
}

test("Fließkomma-Beispiele sind im Geldmodus exakt", () => {
  assert.equal(bewerte("0,1+0,2").exakt, "0,3");
  assert.equal(bewerte("0,07*100").bruch, "7");
  assert.equal(bewerte("1.234.567,89*0,19").exakt, "234.567,8991");
  assert.equal(bewerte("100/3").bruch, "100/3");
});

test("Englische Schreibweise nur mit Option", () => {
  assert.equal(bewerte("1.5+1").ok, false);
  assert.equal(bewerte("1,234.56*2", { englisch: true }).gerundet, "2.469,12");
});

test("Beleg-Text für den Prüfbericht", () => {
  assert.equal(bewerte("24931,20-24931,19").beleg, "24931,20-24931,19 = 0,01");
  assert.match(bewerte("100/3").beleg, /\(gerundet\)$/);
});

test("Tausenderpunkt ohne Dezimalstellen wird gemeldet", () => {
  assert.deepEqual(bewerte("1.000+1").hinweise.length, 1);
  assert.match(bewerte("1.000+1").hinweise[0], /1000 gelesen/);
  assert.deepEqual(bewerte("1.234,56").hinweise, []);
});
