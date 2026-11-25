// Engine B (BigInt, Browser/Node) muss mit Engine A (Python, Decimal) übereinstimmen.
// Voraussetzung: python3 run_all.py hat web/data/* geschrieben (macht run_all.py selbst).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runChecks, toCents, fmt, ibanValid } from "../web/engine_b.js";

const lade = (n, f) => readFileSync(new URL(`../web/data/${n}/${f}`, import.meta.url), "utf8");

for (const name of ["muster-gmbh", "fehler-injektion"]) {
  test(`Engine B stimmt mit Engine A überein: ${name}`, () => {
    const facts = JSON.parse(lade(name, "facts.json"));
    const a = Object.fromEntries(JSON.parse(lade(name, "report.json")).map(r => [r.id, r]));
    const b = runChecks(facts, lade(name, "journal.csv"));
    assert.ok(b.length >= 7);
    for (const x of b) {
      assert.equal(x.status, a[x.id].status, `${x.id} Status`);
      assert.equal(x.erwartet, a[x.id].erwartet, `${x.id} erwartet`);
      assert.equal(x.tatsaechlich, a[x.id].tatsaechlich, `${x.id} tatsächlich`);
    }
  });
}

test("BigInt-Cent statt Fließkomma", () => {
  assert.equal(toCents("0.10") + toCents("0.20"), toCents("0.30"));
  assert.equal(fmt(toCents("1234567.89")), "1.234.567,89");
  assert.equal(0.1 + 0.2 === 0.3, false); // zur Erinnerung: genau deshalb kein Number für Geld
});

test("IBAN-Prüfziffer", () => {
  assert.equal(ibanValid("DE89 3704 0044 0532 0130 00"), true);
  assert.equal(ibanValid("DE02 1203 0000 0000 2020 15"), false);
});
