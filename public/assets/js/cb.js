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
        '<div><span class="cb-wie"><b>' + esc(b.naam) + "</b> <time>" + uur(b.t) + "</time></span>" + (b.audio ? '<p class="cb-audio"><audio controls preload="none" src="/cb/audio/' + b.audio + '"></audio>' + (b.duur ? "<small>" + b.duur + " s</small>" : "") + "</p>" : "<p>" + opmaak(b.tekst) + "</p>") +
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
