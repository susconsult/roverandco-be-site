/* CB-chat: berichten ophalen (elke 4 s, trager als het tabblad verborgen is), zenden, melden. */
(function () {
  var radio = document.querySelector(".cb-radio");
  if (!radio) return;
  var nr = radio.dataset.nr, mod = radio.dataset.mod === "1", ik = (radio.dataset.ik || "").toLowerCase();
  var logEl = document.getElementById("cb-log"), rx = document.getElementById("cb-rx");
  var laatste = 0, bezig = false;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function uur(iso) { return new Date(iso).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }); }
  function opmaak(t) {
    return esc(t).replace(/@([A-Za-z0-9._-]{3,20})/g, function (m, n) { return '<b class="cb-roep' + (n.toLowerCase() === ik ? " ik" : "") + '">@' + n + "</b>"; });
  }
  function onderaan() { return logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 80; }
  function toon(lijst) {
    if (!lijst.length) return;
    var stil = logEl.querySelector(".cb-stil"); if (stil) stil.remove();
    var vast = onderaan();
    lijst.forEach(function (b) {
      if (b.id <= laatste || document.getElementById("c" + b.id)) return;
      laatste = Math.max(laatste, b.id);
      var d = document.createElement("div");
      d.className = "cb-bericht" + (b.eigen ? " eigen" : "");
      d.id = "c" + b.id;
      d.innerHTML = (b.av ? '<img class="cb-av" src="/forum/foto/' + b.av + '" alt="">' : '<span class="cb-av">' + esc(b.naam.slice(0, 1).toUpperCase()) + "</span>") +
        '<div><span class="cb-wie"><b>' + esc(b.naam) + "</b> <time>" + uur(b.t) + "</time></span><p>" + opmaak(b.tekst) + "</p>" +
        '<span class="cb-acties">' + (b.eigen ? "" : '<button type="button" data-meld="' + b.id + '">Melden</button>') + (mod ? '<button type="button" data-weg="' + b.id + '">Verwijderen</button>' : "") + "</span></div>";
      logEl.appendChild(d);
    });
    if (vast) logEl.scrollTop = logEl.scrollHeight;
    if (rx) { rx.classList.add("aan"); setTimeout(function () { rx.classList.remove("aan"); }, 700); }
  }
  function meter(n) {
    var bars = document.querySelectorAll("#cb-bars i");
    for (var i = 0; i < bars.length; i++) bars[i].className = i < Math.min(9, n) ? "aan" : "";
    var o = document.getElementById("cb-online"); if (o) o.textContent = n + " op de CB";
  }
  function badges(o) {
    document.querySelectorAll(".cb-kanaal").forEach(function (a) {
      var k = a.getAttribute("href").split("/").pop(), em = a.querySelector("em");
      if (o[k]) { if (!em) { em = document.createElement("em"); a.appendChild(em); } em.textContent = o[k] > 99 ? "99+" : o[k]; }
      else if (em) em.remove();
    });
  }

  try { toon(JSON.parse(document.getElementById("cb-data").textContent)); } catch (e) {}
  logEl.scrollTop = logEl.scrollHeight;

  function haal() {
    if (bezig) return; bezig = true;
    fetch("/api/cb/" + nr + "?na=" + laatste, { credentials: "same-origin" }).then(function (r) {
      if (r.status === 401) { location.href = "/account/inloggen?terug=/cb/" + nr; return null; }
      return r.json();
    }).then(function (d) { if (d) { toon(d.berichten || []); meter(d.online || 0); badges(d.ongelezen || {}); } })
      .catch(function () {}).then(function () { bezig = false; });
  }
  (function lus() { setTimeout(function () { haal(); lus(); }, document.hidden ? 20000 : 4000); })();
  document.addEventListener("visibilitychange", function () { if (!document.hidden) haal(); });

  var form = document.getElementById("cb-zend"), veld = document.getElementById("cb-tekst");
  if (form && veld) form.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = veld.value.trim(); if (!t) return;
    var knop = form.querySelector("button"); knop.disabled = true; knop.classList.add("zendt");
    fetch("/api/cb/" + nr, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ tekst: t }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) { veld.value = ""; toon([d.bericht]); logEl.scrollTop = logEl.scrollHeight; }
        else alert(d.fout || "Zenden lukte niet.");
      }).catch(function () { alert("Zenden lukte niet. Controleer je verbinding."); })
      .then(function () { knop.disabled = false; knop.classList.remove("zendt"); veld.focus(); });
  });

  logEl.addEventListener("click", function (e) {
    var m = e.target.closest("[data-meld]"), w = e.target.closest("[data-weg]");
    if (m && confirm("Dit bericht melden bij de beheerder?")) {
      fetch("/api/cb/meld/" + m.dataset.meld, { method: "POST", credentials: "same-origin" }).then(function () { m.textContent = "Gemeld"; m.disabled = true; });
    }
    if (w && confirm("Dit bericht verwijderen?")) {
      fetch("/api/cb/weg/" + w.dataset.weg, { method: "POST", credentials: "same-origin" }).then(function (r) { if (r.ok) document.getElementById("c" + w.dataset.weg).remove(); });
    }
  });
  document.querySelectorAll("form[data-bevestig]").forEach(function (f) {
    f.addEventListener("submit", function (e) { if (!confirm(f.dataset.bevestig)) e.preventDefault(); });
  });
})();
