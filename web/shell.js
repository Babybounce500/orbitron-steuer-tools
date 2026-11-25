// Gemeinsame Kopfzeile und Farbschema-Schalter (klassisches Skript, läuft auch per Doppelklick).
(function () {
  var L = window.ORBITRON_LINKS || { start: "index.html", extractor: "extractor.html", rechner: "rechner.html", agent: "agent.html" };
  var cur = document.body.getAttribute("data-page") || "";
  var seiten = [["start", "Start"], ["extractor", "Anonymisieren"], ["agent", "Auswerten"], ["rechner", "Rechner"]];
  var logo = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="5" fill="currentColor" style="color:var(--accent)"/><ellipse cx="16" cy="16" rx="13" ry="6" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-25 16 16)" style="color:var(--accent)"/></svg>';
  var nav = seiten.map(function (s) { return '<a href="' + L[s[0]] + '"' + (s[0] === cur ? ' aria-current="page"' : "") + ">" + s[1] + "</a>"; }).join("");
  var host = document.getElementById("shell");
  if (!host) return;
  host.innerHTML = '<header class="top"><div class="top-in"><a class="brand" href="' + L.start + '">' + logo + 'Orbitron</a><nav class="nav" aria-label="Hauptmenü">' + nav +
    '</nav>' + (cur === "agent"
      ? '<span class="badge online" title="Nach Freigabe wird Text über den Proxy an Google Gemini gesendet.">● Online<span class="lang">, sendet nach Freigabe</span></span>'
      : '<span class="badge" title="Diese Seite lädt nichts aus dem Internet und sendet nichts ab.">● Offline<span class="lang">, nichts wird gesendet</span></span>') +
    '<button class="theme" id="themeBtn" type="button" aria-label="Hell oder dunkel umschalten">◐</button></div></header>';
  var root = document.documentElement;
  try { var t = localStorage.getItem("orbitron-theme"); if (t) root.setAttribute("data-theme", t); } catch (e) {}
  document.getElementById("themeBtn").addEventListener("click", function () {
    var dunkel = root.getAttribute("data-theme") === "dark" || (!root.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var neu = dunkel ? "light" : "dark";
    root.setAttribute("data-theme", neu);
    try { localStorage.setItem("orbitron-theme", neu); } catch (e) {}
  });
})();
