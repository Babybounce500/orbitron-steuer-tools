"""Startet die Oberfläche:  python3 serve.py   (Replit: Run-Knopf, Port 5000)
Baut zuerst die Prüfberichte, liefert dann den Ordner web/ aus. Keine Abhängigkeiten."""
import functools
import http.server
import os
import socketserver
from pathlib import Path

from run_all import ROOT, baue_web

PORT = int(os.environ.get("PORT", "5000"))


def main():
    baue_web()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(Path(ROOT) / "web"))
    with socketserver.TCPServer(("0.0.0.0", PORT), handler) as httpd:
        print(f"Oberfläche: http://localhost:{PORT}  (Strg+C beendet)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
