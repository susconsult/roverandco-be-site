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
  var albert = radio.dataset.albert === "1";
  function menu(b) {
    var items = "";
    if (!b.eigen && !albert) items += '<button type="button" data-antwoord="' + esc(b.naam) + '">Antwoorden</button>';
    if (!b.eigen) items += '<a href="/melden?soort=cb&id=' + b.id + '">Melden</a>';
    if (mod) items += (items ? "<hr>" : "") + '<button type="button" class="rood" data-weg="' + b.id + '">Verwijderen</button>';
    return items ? '<details class="drie"><summary aria-label="Meer opties"><span aria-hidden="true">⋯</span></summary><div class="drie-menu">' + items + "</div></details>" : "";
  }
  var IC = {
    hart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
    lach: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4 4 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/>',
    duim: '<path d="M7 11v9H4v-9h3Z"/><path d="M7 11l4-7c1.5 0 2.3 1 2 2.5L12.5 10H18a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/>'
  };
  var LABEL = { hart: "Hartje", lach: "Lach", duim: "Duim omhoog" };
  function reactieBalk(id, r) {
    r = r || {};
    return ["hart", "lach", "duim"].map(function (k) {
      var x = r[k] || [0, 0];
      return '<button type="button" class="cb-re' + (x[1] ? " mijn" : "") + (x[0] ? " heeft" : "") + '" data-re="' + k + '" data-id="' + id + '" aria-label="' + LABEL[k] + (x[0] ? " (" + x[0] + ")" : "") + '" aria-pressed="' + (x[1] ? "true" : "false") + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + IC[k] + "</svg>" + (x[0] ? "<span>" + x[0] + "</span>" : "") + "</button>";
    }).join("");
  }
  function zetReacties(map) {
    document.querySelectorAll(".cb-bericht").forEach(function (el) {
      var id = el.id.slice(1), balk = el.querySelector(".cb-reacties");
      if (balk) balk.innerHTML = reactieBalk(id, map[id]);
    });
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
        '<div><span class="cb-wie"><b>' + esc(b.naam) + "</b> <time>" + uur(b.t) + "</time></span>" + (b.audio ? '<p class="cb-audio"><audio controls preload="none" src="/cb/audio/' + b.audio + '"></audio>' + (b.duur ? "<small>" + b.duur + " s</small>" : "") + "</p>" : "<p>" + opmaak(b.tekst) + "</p>") +
        '<span class="cb-reacties">' + reactieBalk(b.id) + "</span></div>" + menu(b);
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
  function badges(lijst) {
    var nav = document.getElementById("cb-lijst"); if (!nav || !lijst) return;
    lijst.forEach(function (k) {
      var a = nav.querySelector('[data-nr="' + k.nr + '"]');
      if (!a) { a = document.createElement("a"); a.className = "cb-rij"; a.href = "/cb/" + k.nr; a.dataset.nr = k.nr; a.innerHTML = '<i class="cb-lamp"></i><b>' + String(k.nr).padStart(2, "0") + "</b><span>" + esc(k.naam) + "</span>"; nav.appendChild(a); }
      a.querySelector(".cb-lamp").className = "cb-lamp " + (k.lamp || "");
      var em = a.querySelector("em");
      if (k.ongelezen) { if (!em) { em = document.createElement("em"); a.appendChild(em); } em.textContent = k.ongelezen > 99 ? "99+" : k.ongelezen; }
      else if (em) em.remove();
    });
  }

  try { toon(JSON.parse(document.getElementById("cb-data").textContent)); zetReacties(JSON.parse(document.getElementById("cb-reacties").textContent)); } catch (e) {}
  logEl.scrollTop = logEl.scrollHeight;

  function haal() {
    if (bezig) return; bezig = true;
    fetch("/api/cb/" + nr + "?na=" + laatste, { credentials: "same-origin" }).then(function (r) {
      if (r.status === 401) { location.href = "/account/inloggen?terug=/cb/" + nr; return null; }
      return r.json();
    }).then(function (d) { if (d) { toon(d.berichten || []); if (d.reacties) zetReacties(d.reacties); meter(d.online || 0); badges(d.kanalen); } })
      .catch(function () {}).then(function () { bezig = false; });
  }
  (function lus() { setTimeout(function () { haal(); lus(); }, document.hidden ? 20000 : 4000); })();
  document.addEventListener("visibilitychange", function () { if (!document.hidden) haal(); });

  var form = document.getElementById("cb-zend"), veld = document.getElementById("cb-tekst");
  var ptt = document.getElementById("cb-ptt"), hint = document.getElementById("cb-hint");
  function zegHint(t, fout) { if (hint) { hint.textContent = t; hint.classList.toggle("fout", !!fout); } }
  function zendTekst() {
    var t = veld.value.trim();
    if (!t) { zegHint("Typ een bericht, of houd PTT ingedrukt om te praten."); return; }
    var knop = ptt; knop.disabled = true; knop.classList.add("zendt");
    fetch("/api/cb/" + nr, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ tekst: t }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) { veld.value = ""; toon([d.bericht]); logEl.scrollTop = logEl.scrollHeight; }
        else alert(d.fout || "Zenden lukte niet.");
      }).catch(function () { alert("Zenden lukte niet. Controleer je verbinding."); })
      .then(function () { knop.disabled = false; knop.classList.remove("zendt"); veld.focus(); });
  }
  if (form && veld) form.addEventListener("submit", function (e) { e.preventDefault(); zendTekst(); });

  /* ---------- PTT: ingedrukt houden = spraakbericht ---------- */
  var kanOpnemen = !!(navigator.mediaDevices && window.MediaRecorder);
  var houd = null, rec = null, stuks = [], start = 0, klok = null, losgelaten = false, mime = "";
  if (kanOpnemen) ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].some(function (m) { if (MediaRecorder.isTypeSupported(m)) { mime = m; return true; } });
  function lcd(t) { var n = document.querySelector(".cb-naam"); if (n) { if (!n.dataset.oud) n.dataset.oud = n.textContent; n.textContent = t || n.dataset.oud; } }
  function stopOpname() {
    clearInterval(klok); ptt.classList.remove("tx"); lcd("");
    if (rec && rec.state === "recording") rec.stop();
  }
  function begin() {
    losgelaten = false;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      if (losgelaten) { stream.getTracks().forEach(function (t) { t.stop(); }); zegHint("Microfoon staat klaar. Houd PTT nu opnieuw ingedrukt om te praten."); return; }
      stuks = []; rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = function (e) { if (e.data.size) stuks.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        var duur = Math.round((Date.now() - start) / 1000);
        if (Date.now() - start < 800) { zegHint("Te kort. Houd PTT ingedrukt zolang je praat."); return; }
        var type = (rec.mimeType || mime || "audio/webm").split(";")[0];
        var blob = new Blob(stuks, { type: type });
        zegHint("Bezig met zenden…");
        fetch("/api/cb/" + nr + "/audio?duur=" + duur, { method: "POST", credentials: "same-origin", headers: { "content-type": type }, body: blob })
          .then(function (r) { return r.json(); })
          .then(function (d) { if (d.ok) { toon([d.bericht]); logEl.scrollTop = logEl.scrollHeight; zegHint("Verzonden. Houd PTT opnieuw in voor een volgend bericht."); } else zegHint(d.fout || "Zenden lukte niet.", true); })
          .catch(function () { zegHint("Zenden lukte niet. Controleer je verbinding.", true); });
      };
      rec.start(); start = Date.now(); ptt.classList.add("tx");
      zegHint("Je zendt… laat PTT los om te versturen.");
      klok = setInterval(function () {
        var s = Math.floor((Date.now() - start) / 1000); lcd("TX 0:" + String(s).padStart(2, "0"));
        if (s >= 20) stopOpname();
      }, 250);
    }).catch(function () { zegHint("Geen toegang tot je microfoon. Sta die toe in je browser om te praten.", true); });
  }
  if (ptt) {
    ptt.type = "button";
    ptt.addEventListener("click", function (e) { e.preventDefault(); if (ptt.dataset.lang) { delete ptt.dataset.lang; return; } zendTekst(); });
    if (kanOpnemen) {
      ptt.addEventListener("pointerdown", function (e) {
        if (veld.value.trim()) return; // er staat tekst: gewoon zenden bij loslaten
        e.preventDefault(); ptt.setPointerCapture && ptt.setPointerCapture(e.pointerId);
        houd = setTimeout(function () { houd = null; ptt.dataset.lang = "1"; begin(); }, 250);
      });
      var los = function () {
        losgelaten = true;
        if (houd) { clearTimeout(houd); houd = null; return; }
        if (rec && rec.state === "recording") stopOpname();
      };
      ptt.addEventListener("pointerup", los); ptt.addEventListener("pointercancel", los);
      ptt.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    } else zegHint("Typ een bericht en druk op PTT. Spraak werkt niet in deze browser.");
  }

  logEl.addEventListener("click", function (e) {
    var re = e.target.closest("[data-re]");
    if (re) {
      fetch("/api/cb/reactie/" + re.dataset.id, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ soort: re.dataset.re }) })
        .then(function (r) { return r.json(); }).then(function (d) { if (d.ok) { var balk = re.parentNode; var m = {}; m[re.dataset.id] = d.reacties; balk.innerHTML = reactieBalk(re.dataset.id, d.reacties); } else if (d.fout) alert(d.fout); });
      return;
    }
    var w = e.target.closest("[data-weg]"), an = e.target.closest("[data-antwoord]");
    if (an && veld) { veld.value = "@" + an.dataset.antwoord + " " + veld.value.replace(/^@\S+\s*/, ""); veld.focus(); var dd = an.closest("details"); if (dd) dd.open = false; }
    if (w && confirm("Dit bericht verwijderen?")) {
      fetch("/api/cb/weg/" + w.dataset.weg, { method: "POST", credentials: "same-origin" }).then(function (r) { if (r.ok) document.getElementById("c" + w.dataset.weg).remove(); });
    }
  });
  document.querySelectorAll("form[data-bevestig]").forEach(function (f) {
    f.addEventListener("submit", function (e) { if (!confirm(f.dataset.bevestig)) e.preventDefault(); });
  });
})();
