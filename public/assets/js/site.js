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

  /* ---------- lightbox ---------- */
  var lb = document.getElementById("lightbox");
  function closeLightbox() { if (lb) lb.classList.remove("open"); }
  document.querySelectorAll("[data-full]").forEach(function (b) {
    b.addEventListener("click", function () {
      lb.querySelector("img").src = b.dataset.full;
      lb.querySelector("img").alt = b.querySelector("img").alt;
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
        bestelnummer: nr,
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
          if (res && res.ok === true) {
            cart = []; save();
            try { sessionStorage.removeItem("rc-bestelnr"); sessionStorage.setItem("rc-laatste", res.bestelnummer); } catch (x) {}
            location.href = "/bedankt";
          } else {
            foutEl.textContent = (res && res.fout) || "Er ging iets mis. Probeer opnieuw.";
            knop.disabled = false; knop.textContent = "Bestelling plaatsen";
          }
        })
        .catch(function () { foutEl.textContent = "Geen verbinding. Probeer opnieuw."; knop.disabled = false; knop.textContent = "Bestelling plaatsen"; });
    });
    toon();
  }
  var bnr = document.getElementById("bedankt-nr");
  if (bnr) { try { bnr.textContent = sessionStorage.getItem("rc-laatste") || "–"; } catch (x) {} }

  render();
})();
