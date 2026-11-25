"""Ein Befehl für alles:  python3 run_all.py
1) Fixtures erzeugen  2) Prüfberichte (Engine A) bauen  3) Python-Tests  4) Node-Tests (Engine B), falls Node da ist.
Nur Standardbibliothek, keine Installation nötig."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from engine.run_checks import pruefe  # noqa: E402

FIXTURES = ["muster-gmbh", "fehler-injektion"]


def baue_web():
    """Schreibt web/data/<name>/{facts.json,journal.csv,report.json}."""
    for name in FIXTURES:
        quelle = ROOT / "fixtures" / name
        ziel = ROOT / "web" / "data" / name
        ziel.mkdir(parents=True, exist_ok=True)
        for datei in ("facts.json", "journal.csv"):
            shutil.copyfile(quelle / datei, ziel / datei)
        (ziel / "report.json").write_text(
            json.dumps(pruefe(quelle), ensure_ascii=False, indent=2), encoding="utf-8")
    # fertige Einzeldateien mit veröffentlichen (Replit-Deployment liefert nur web/ aus)
    dist = ROOT / "dist"
    if dist.exists():
        (ROOT / "web" / "dist").mkdir(exist_ok=True)
        for f in dist.glob("*.html"):
            shutil.copyfile(f, ROOT / "web" / "dist" / f.name)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    subprocess.run([sys.executable, str(ROOT / "tools" / "make_fixtures.py")], check=True)
    baue_web()
    print("Prüfbericht Muster GmbH:")
    subprocess.run([sys.executable, "-m", "engine.run_checks", "fixtures/muster-gmbh"], cwd=ROOT)
    print("\nPython-Tests:")
    r1 = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"], cwd=ROOT)
    node = shutil.which("node")
    r2 = None
    if node:
        # Erwartungswerte für den Geldmodus unabhängig in Python erzeugen, dann in JS prüfen
        subprocess.run([sys.executable, str(ROOT / "tools" / "make_geldfaelle.py")], check=True)
        print("\nNode-Tests (Engine B, Geldmodus):")
        r2 = subprocess.run([node, "--test", "tests/engine_b.test.mjs", "tests/geldmodus.test.mjs", "tests/extractor.test.mjs", "tests/agent.test.mjs"], cwd=ROOT)
    else:
        print("\nNode nicht gefunden: Node-Tests übersprungen.")
    print("\nEinzeldateien für Kunden bauen (dist/):")
    subprocess.run([sys.executable, str(ROOT / "tools" / "build_dist.py")], check=True)
    baue_web()  # neue Einzeldateien nach web/dist kopieren
    print("\nBrowser-Test der Einzeldateien (Edge/Chrome, echtes PDF):")
    r3 = subprocess.run([sys.executable, str(ROOT / "tests" / "e2e_browser.py")], cwd=ROOT)
    ok = r1.returncode == 0 and (r2 is None or r2.returncode == 0) and r3.returncode == 0
    print("\nERGEBNIS:", "alles grün" if ok else "FEHLER")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
