"""Aufruf:  python3 -m engine.run_checks fixtures/muster-gmbh  [--json report.json]"""
import json
import sys
from pathlib import Path

from .checks import lade_journal, run

SYM = {"ok": "OK  ", "warn": "WARN", "fail": "FEHL"}


def pruefe(ordner):
    ordner = Path(ordner)
    facts = json.loads((ordner / "facts.json").read_text(encoding="utf-8"))
    journal = lade_journal(ordner / "journal.csv")
    return run(facts, journal)


def main(argv):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if not argv:
        print(__doc__)
        return 2
    erg = pruefe(argv[0])
    for r in erg:
        zeile = f"{SYM[r['status']]} {r['id']:<4} {r['name']}"
        if r["erwartet"] is not None:
            zeile += f"   erwartet {r['erwartet']}  ist {r['tatsaechlich']}"
        print(zeile)
        if r["status"] != "ok" and r["hinweis"]:
            print(f"       -> {r['hinweis']}")
    if "--json" in argv:
        pfad = argv[argv.index("--json") + 1]
        Path(pfad).write_text(json.dumps(erg, ensure_ascii=False, indent=2), encoding="utf-8")
    return 1 if any(r["status"] == "fail" for r in erg) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
