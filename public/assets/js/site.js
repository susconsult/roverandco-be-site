(function () {
  var hdr = document.querySelector("header.site");
  var hasHero = !document.body.classList.contains("no-hero");
  function onScroll() { if (hdr && hasHero) hdr.classList.toggle("solid", window.scrollY > 40); }
  window.addEventListener("scroll", onScroll); onScroll();

  var burger = document.querySelector(".burger");
  var menu = document.getElementById("menu");
  if (burger && menu) burger.addEventListener("click", function () {
    var open = menu.classList.toggle("open");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  });

  /* ---------- mandje ---------- */
  var KEY = "rc-mandje";
  var cart = [];
  try { cart = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { cart = []; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} }
  function eur(n) { return "€" + n.toFixed(2).replace(".", ","); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function render() {
    var count = cart.reduce(function (a, l) { return a + l.aantal; }, 0);
    document.querySelectorAll(".cart-count").forEach(function (el) { el.textContent = count; });
    var lines = document.getElementById("lines");
    if (!lines) return;
    lines.innerHTML = cart.length ? cart.map(function (l, i) {
      return '<div class="line"><span>' + esc(l.naam) + (l.opties ? "<small>" + esc(l.opties) + "</small>" : "") +
        "<small>" + l.aantal + " × " + eur(l.prijs) + '</small><button type="button" data-remove="' + i + '">Verwijderen</button></span><b>' + eur(l.prijs * l.aantal) + "</b></div>";
    }).join("") : "<p style='color:#5B625C'>Je mandje is leeg.</p>";
    document.getElementById("total").textContent = eur(cart.reduce(function (a, l) { return a + l.prijs * l.aantal; }, 0));
  }
  document.addEventListener("click", function (e) {
    var r = e.target.closest("[data-remove]");
    if (r) { cart.splice(+r.dataset.remove, 1); save(); render(); }
  });

  function toggleCart(open) { document.body.classList.toggle("open-cart", open); }
  document.querySelectorAll("[data-open-cart]").forEach(function (b) { b.addEventListener("click", function () { toggleCart(true); }); });
  document.querySelectorAll("[data-close-cart]").forEach(function (b) { b.addEventListener("click", function () { toggleCart(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { toggleCart(false); closeLightbox(); } });

  var tt;
  function toast(t) {
    var el = document.getElementById("toast"); if (!el) return;
    el.textContent = t; el.classList.add("show"); clearTimeout(tt);
    tt = setTimeout(function () { el.classList.remove("show"); }, 2800);
  }

  /* ---------- productpagina ---------- */
  var form = document.getElementById("product-form");
  if (form) {
    var basis = parseFloat(form.dataset.prijs);
    var prijsEl = document.getElementById("prijs");
    function huidigePrijs() {
      var p = basis;
      form.querySelectorAll("input:checked").forEach(function (i) { p += parseFloat(i.dataset.meer || 0); });
      return p;
    }
    form.addEventListener("change", function () {
      prijsEl.textContent = eur(huidigePrijs());
      form.querySelectorAll(".err").forEach(function (e) { e.textContent = ""; });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = true, keuzes = [], keuzeObj = {};
      form.querySelectorAll("fieldset[data-optie]").forEach(function (fs) {
        var c = fs.querySelector("input:checked");
        if (!c && fs.dataset.verplicht === "true") { fs.querySelector(".err").textContent = "Kies eerst een " + fs.dataset.optie.toLowerCase(); ok = false; }
        if (c) { keuzes.push(fs.dataset.optie + ": " + c.value); keuzeObj[fs.dataset.optie] = c.value; }
      });
      var aantal = Math.max(1, parseInt(document.getElementById("aantal").value, 10) || 1);
      if (!ok) return;
      var opties = keuzes.join(", ");
      var bestaand = cart.find(function (l) { return l.id === form.dataset.id && l.opties === opties; });
      if (bestaand) bestaand.aantal += aantal; else cart.push({ id: form.dataset.id, naam: form.dataset.naam, opties: opties, keuzes: keuzeObj, prijs: huidigePrijs(), aantal: aantal });
      save(); render(); toast(form.dataset.naam + " zit in je mandje");
    });
  }
  var main = document.getElementById("pdp-main");
  document.querySelectorAll(".thumbs button").forEach(function (b) {
    b.addEventListener("click", function () {
      main.src = b.dataset.src; main.alt = b.dataset.alt || main.alt;
      document.querySelectorAll(".thumbs button").forEach(function (x) { x.setAttribute("aria-current", x === b ? "true" : "false"); });
    });
  });

  /* ---------- gemelde garagefoto: meldformulier openen ---------- */
  if (/^#wagen-\d+$/.test(location.hash)) { var wm = document.querySelector(location.hash + " .wagen-meld"); if (wm && !/gemeld/.test(location.search)) wm.open = true; }

  /* ---------- ⋯-menu: sluiten, delen, bewaren ---------- */
  document.addEventListener("click", function (e) {
    document.querySelectorAll("details.drie[open]").forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
    var deel = e.target.closest("[data-deel]");
    if (deel) {
      var url = location.origin + deel.dataset.deel, titel = deel.dataset.titel || document.title;
      if (navigator.share) navigator.share({ title: titel, url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { deel.textContent = "Link gekopieerd"; setTimeout(function () { deel.textContent = "Delen"; }, 2000); });
      else prompt("Kopieer deze link:", url);
      var d1 = deel.closest("details"); if (d1 && navigator.share) d1.open = false;
    }
    var bw = e.target.closest("[data-bewaar]");
    if (bw) {
      var p = bw.dataset.bewaar.split(":");
      fetch("/api/bewaar", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ soort: p[0], id: p[1] }) })
        .then(function (r) { return r.json(); }).then(function (d) {
          if (d.ok) { bw.textContent = d.bewaard ? "Bewaard" : "Bewaren"; bw.setAttribute("aria-pressed", d.bewaard ? "true" : "false"); }
          else if (d.fout) alert(d.fout);
        });
    }
    if (e.target.closest(".drie-menu [data-citeer]")) { var d2 = e.target.closest("details"); if (d2) d2.open = false; }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") document.querySelectorAll("details.drie[open]").forEach(function (d) { d.open = false; }); });

  /* ---------- lightbox ---------- */
  var lb = document.getElementById("lightbox");
  function closeLightbox() { if (lb) lb.classList.remove("open"); }
  document.querySelectorAll("[data-full]").forEach(function (b) {
    b.addEventListener("click", function () {
      lb.querySelector("img").src = b.dataset.full;
      lb.querySelector("img").alt = b.querySelector("img").alt;
      var cap = lb.querySelector(".lb-onderschrift");
      if (!cap) { cap = document.createElement("p"); cap.className = "lb-onderschrift"; lb.appendChild(cap); }
      cap.textContent = b.dataset.onderschrift || "";
      if (b.dataset.link) { var a = document.createElement("a"); a.href = b.dataset.link; a.textContent = "Bekijk garage"; cap.appendChild(document.createTextNode(" · ")); cap.appendChild(a); }
      cap.hidden = !b.dataset.onderschrift;
      lb.classList.add("open");
    });
  });
  if (lb) lb.addEventListener("click", function (e) { if (e.target === lb || e.target.tagName === "BUTTON") closeLightbox(); });

  /* ---------- afrekenen ---------- */
  var co = document.getElementById("checkout-form");
  if (co) {
    var VERZEND = parseFloat(co.dataset.verzendkost), GRATIS = parseFloat(co.dataset.gratisVanaf);
    var r2 = function (n) { return Math.round(n * 100) / 100; };
    function waarde(n) { var el = co.elements[n]; return el ? (el.value || "").trim() : ""; }
    function gekozen(n) { var el = co.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : ""; }
    function bereken() {
      var sub = r2(cart.reduce(function (a, l) { return a + l.prijs * l.aantal; }, 0));
      var verz = gekozen("levering") === "verzenden" && sub < GRATIS ? VERZEND : 0;
      var d = gekozen("donatie"), don = 0;
      if (d === "10") don = r2(sub * 0.1); else if (d === "15") don = r2(sub * 0.15);
      else if (d === "eigen") don = r2(Math.max(0, parseFloat(waarde("donatie_bedrag").replace(",", ".")) || 0));
      return { sub: sub, verz: verz, don: don, tot: r2(sub + verz + don) };
    }
    function toon() {
      co.querySelectorAll("[data-toon]").forEach(function (el) {
        var k = el.dataset.toon;
        el.hidden = !(gekozen("levering") === k || gekozen("donatie") === k);
      });
      var b = bereken();
      document.getElementById("co-lijnen").innerHTML = cart.map(function (l) {
        return '<div class="co-lijn"><span>' + l.aantal + " × " + esc(l.naam) + (l.opties ? "<small>" + esc(l.opties) + "</small>" : "") + "</span><b>" + eur(l.prijs * l.aantal) + "</b></div>";
      }).join("");
      document.getElementById("co-subtotaal").textContent = eur(b.sub);
      document.getElementById("co-verzending").textContent = gekozen("levering") === "verzenden" ? (b.verz ? eur(b.verz) : "Gratis") : "Gratis (ophalen)";
      document.getElementById("co-donatie").textContent = eur(b.don);
      document.getElementById("co-totaal").textContent = eur(b.tot);
      var leeg = !cart.length;
      document.getElementById("co-leeg").hidden = !leeg;
      co.querySelectorAll(".co-blok").forEach(function (f) { f.hidden = leeg; });
      document.getElementById("co-knop").disabled = leeg;
    }
    function fout(veld, msg) {
      var el = co.querySelector('.err[data-voor="' + veld + '"]'); if (el) el.textContent = msg;
      var inp = co.elements[veld]; if (inp && inp.setAttribute) inp.setAttribute("aria-invalid", "true");
    }
    co.addEventListener("input", function (e) {
      var el = co.querySelector('.err[data-voor="' + e.target.name + '"]'); if (el) el.textContent = "";
      if (e.target.removeAttribute) e.target.removeAttribute("aria-invalid");
      toon();
    });
    co.addEventListener("change", toon);
    co.addEventListener("submit", function (e) {
      e.preventDefault();
      co.querySelectorAll(".err").forEach(function (x) { x.textContent = ""; });
      var ok = true, lev = gekozen("levering");
      if (waarde("naam").length < 2) { fout("naam", "Vul je naam in"); ok = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(waarde("email"))) { fout("email", "Vul een geldig e-mailadres in"); ok = false; }
      if (waarde("telefoon").replace(/\D/g, "").length < 8) { fout("telefoon", "Vul een geldig telefoonnummer in"); ok = false; }
      if (lev === "activiteit" && !waarde("activiteit")) { fout("activiteit", "Kies een activiteit"); ok = false; }
      if (lev === "verzenden") {
        if (waarde("straat").length < 3) { fout("straat", "Vul straat en nummer in"); ok = false; }
        if (waarde("postcode").length < 4) { fout("postcode", "Vul een postcode in"); ok = false; }
        if (waarde("gemeente").length < 2) { fout("gemeente", "Vul een gemeente in"); ok = false; }
      }
      if (gekozen("donatie") === "eigen" && !(parseFloat(waarde("donatie_bedrag")) > 0)) { fout("donatie_bedrag", "Vul een bedrag in"); ok = false; }
      if (!document.getElementById("akkoord").checked) { fout("akkoord", "Vink dit aan om te bestellen"); ok = false; }
      if (!ok) { var eerste = co.querySelector(".err:not(:empty)"); if (eerste) eerste.scrollIntoView({ block: "center", behavior: "smooth" }); return; }

      var nr; try { nr = sessionStorage.getItem("rc-bestelnr"); } catch (x) {}
      if (!nr) {
        var d = new Date(), a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", rnd = "";
        for (var i = 0; i < 5; i++) rnd += a[Math.floor(Math.random() * a.length)];
        nr = "RC-" + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + "-" + rnd;
        try { sessionStorage.setItem("rc-bestelnr", nr); } catch (x) {}
      }
      var payload = {
        nummer: nr,
        klant: { naam: waarde("naam"), email: waarde("email"), telefoon: waarde("telefoon") },
        artikels: cart.map(function (l) { return { id: l.id, keuzes: l.keuzes || {}, aantal: l.aantal }; }),
        levering: { type: lev, activiteit: waarde("activiteit"), straat: waarde("straat"), postcode: waarde("postcode"), gemeente: waarde("gemeente"), land: waarde("land") },
        donatie: { type: gekozen("donatie"), bedrag: waarde("donatie_bedrag") },
        opmerking: waarde("opmerking"), akkoord: true, website: waarde("website")
      };
      var knop = document.getElementById("co-knop"), foutEl = document.getElementById("co-fout");
      knop.disabled = true; knop.textContent = "Bezig…"; foutEl.textContent = "";
      fetch("/api/bestelling", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (res) {
          if (res && res.ok === true && res.betalen) {
            try { sessionStorage.setItem("rc-terug", "/afrekenen"); } catch (x) {}
            location.href = res.betalen; // naar Viva; het mandje blijft staan tot de betaling gelukt is
          } else if (res && res.ok === true) {
            location.href = "/bedankt?nr=" + encodeURIComponent(res.nummer) + "&soort=bestelling" + (res.test ? "&test=1" : "");
          } else {
            foutEl.textContent = (res && res.fout) || "Er ging iets mis. Probeer opnieuw.";
            knop.disabled = false; knop.textContent = "Verder naar betalen";
          }
        })
        .catch(function () { foutEl.textContent = "Geen verbinding. Probeer opnieuw."; knop.disabled = false; knop.textContent = "Verder naar betalen"; });
    });
    toon();
  }
  /* ---------- inschrijven ---------- */
  var ins = document.getElementById("inschrijf-form");
  if (ins) {
    var slug = ins.dataset.slug, NRKEY = "rc-nr-" + slug;
    var iw = function (n) { var el = ins.elements[n]; return el ? (el.value || "").trim() : ""; };
    function rijen() { return Array.prototype.slice.call(ins.querySelectorAll(".ins-rij")); }
    function aantal(r) { var i = r.querySelector("input"); var n = parseInt(i.value, 10) || 0; return Math.min(parseInt(i.max, 10) || 20, Math.max(0, n)); }
    function itoon() {
      var tot = 0, html = "";
      rijen().forEach(function (r) {
        var n = aantal(r), p = parseFloat(r.dataset.prijs);
        if (n > 0) { tot += n * p; html += '<div class="co-lijn"><span>' + n + " × " + esc(r.querySelector("b").textContent) + "</span><b>" + eur(n * p) + "</b></div>"; }
        var slot = ins.querySelector('[data-slot-voor="' + r.dataset.onderdeel + '"]'); if (slot) slot.hidden = n === 0;
      });
      document.getElementById("co-lijnen").innerHTML = html;
      document.getElementById("co-totaal").textContent = eur(Math.round(tot * 100) / 100);
      document.getElementById("co-knop").textContent = tot > 0 ? "Verder naar betalen" : "Inschrijven";
    }
    function ifout(veld, msg) { var el = ins.querySelector('.err[data-voor="' + veld + '"]'); if (el) el.textContent = msg; }
    ins.addEventListener("click", function (e) {
      var b = e.target.closest("[data-min],[data-plus]"); if (!b) return;
      var i = b.parentNode.querySelector("input"), n = parseInt(i.value, 10) || 0;
      i.value = Math.min(parseInt(i.max, 10) || 20, Math.max(0, n + (b.hasAttribute("data-plus") ? 1 : -1)));
      var er = ins.querySelector('.err[data-voor="aantal"]'); if (er) er.textContent = "";
      itoon();
    });
    ins.addEventListener("input", function (e) { var el = ins.querySelector('.err[data-voor="' + e.target.name + '"]'); if (el) el.textContent = ""; itoon(); });
    ins.addEventListener("change", itoon);
    ins.addEventListener("submit", function (e) {
      e.preventDefault();
      ins.querySelectorAll(".err").forEach(function (x) { x.textContent = ""; });
      var ok = true;
      if (iw("naam").length < 2) { ifout("naam", "Vul je naam in"); ok = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(iw("email"))) { ifout("email", "Vul een geldig e-mailadres in"); ok = false; }
      if (iw("telefoon").replace(/\D/g, "").length < 8) { ifout("telefoon", "Vul een geldig telefoonnummer in"); ok = false; }
      var aantallen = {}, iets = false;
      rijen().forEach(function (r) { var n = aantal(r); aantallen[r.dataset.onderdeel] = n; if (n > 0) iets = true; });
      if (!iets) { ifout("aantal", "Kies minstens één onderdeel"); ok = false; }
      var slotVak = ins.querySelector("[data-slot-voor]");
      if (slotVak && !slotVak.hidden && !iw("tijdslot")) { ifout("tijdslot", "Kies een tijdslot"); ok = false; }
      if (!document.getElementById("akkoord").checked) { ifout("akkoord", "Vink dit aan om in te schrijven"); ok = false; }
      if (!ok) { var eerste = ins.querySelector(".err:not(:empty)"); if (eerste) eerste.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      var nr = ""; try { nr = sessionStorage.getItem(NRKEY) || ""; } catch (x) {}
      var payload = {
        nummer: nr, activiteit: slug,
        klant: { naam: iw("naam"), email: iw("email"), telefoon: iw("telefoon") },
        aantallen: aantallen, tijdslot: slotVak && !slotVak.hidden ? iw("tijdslot") : "",
        wagen: iw("wagen"), opmerking: iw("opmerking"), akkoord: true, website: iw("website")
      };
      var knop = document.getElementById("co-knop"), foutEl = document.getElementById("co-fout"), label = knop.textContent;
      knop.disabled = true; knop.textContent = "Bezig…";
      fetch("/api/inschrijving", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (res) {
          if (res && res.ok === true) {
            try { sessionStorage.setItem(NRKEY, res.nummer); sessionStorage.setItem("rc-terug", location.pathname); } catch (x) {}
            if (res.betalen) { location.href = res.betalen; return; }
            location.href = "/bedankt?nr=" + encodeURIComponent(res.nummer) + "&soort=inschrijving" + (res.test ? "&test=1" : res.gratis ? "&gratis=1" : "");
          } else {
            foutEl.textContent = (res && res.fout) || "Er ging iets mis. Probeer opnieuw.";
            (res && res.velden || []).forEach(function (v) { if (v === "tijdslot") ifout("tijdslot", "Kies een ander tijdslot"); if (v === "aantal" && res.fout) ifout("aantal", res.fout); });
            knop.disabled = false; knop.textContent = label;
          }
        })
        .catch(function () { foutEl.textContent = "Geen verbinding. Probeer opnieuw."; knop.disabled = false; knop.textContent = label; });
    });
    itoon();
  }

  /* ---------- bedankt / betaling mislukt ---------- */
  var bd = document.getElementById("bedankt");
  if (bd) {
    var q = new URLSearchParams(location.search), bnr = q.get("nr") || "", soort = q.get("soort");
    var staat = q.get("test") ? "test" : q.get("gratis") ? "bevestigd" : q.get("status") === "verwerking" ? "verwerking" : bnr ? "betaald" : "verwerking";
    bd.querySelectorAll("[data-toon-als]").forEach(function (el) { el.hidden = el.dataset.toonAls !== staat; });
    bd.querySelectorAll(".bedankt-nr").forEach(function (el) { el.textContent = bnr || "–"; });
    bd.querySelectorAll("[data-met-nr]").forEach(function (el) { el.hidden = !bnr; });
    if (staat !== "verwerking") {
      try {
        if (soort === "bestelling") { cart = []; save(); sessionStorage.removeItem("rc-bestelnr"); }
        if (soort === "inschrijving") Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf("rc-nr-") === 0) sessionStorage.removeItem(k); });
        sessionStorage.removeItem("rc-terug");
      } catch (x) {}
    }
  }
  var opn = document.getElementById("opnieuw");
  if (opn) { try { var t = sessionStorage.getItem("rc-terug"); if (t && t.charAt(0) === "/") opn.href = t; } catch (x) {} }

  /* ---------- gratis-account-band op home verbergen voor wie al een account heeft ---------- */
  if (/(^|; )rc_lid_aan=1/.test(document.cookie)) document.querySelectorAll("[data-gast]").forEach(function (el) { el.hidden = true; });

  /* ---------- ingelogd? belletje met meldingen + gegevens invullen in afrekenen en inschrijven ---------- */
  var formulieren = ["checkout-form", "inschrijf-form"].map(function (id) { return document.getElementById(id); }).filter(Boolean);
  if (/(^|; )rc_lid_aan=1/.test(document.cookie) || formulieren.length) {
    fetch("/api/account/ik", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (ik) {
      if (!ik || !ik.ingelogd) return;
      var acc = document.querySelector(".acct-btn");
      if (acc) {
        acc.classList.add("ingelogd");
        if (ik.meldingen) {
          acc.href = "/account/meldingen";
          acc.setAttribute("aria-label", ik.meldingen + " nieuwe meldingen");
          var tel = document.createElement("span"); tel.className = "cart-count bel-count"; tel.textContent = ik.meldingen > 99 ? "99+" : ik.meldingen; acc.append(tel);
        }
      }
      formulieren.forEach(function (f) {
        ["naam", "email", "telefoon"].forEach(function (n) { var el = f.elements[n]; if (el && !el.value && ik[n]) el.value = ik[n]; });
      });
    }).catch(function () {});
  }

  render();
})();
