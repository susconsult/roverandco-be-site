(function () {
  var hdr = document.querySelector("header.site");
  var hasHero = !document.body.classList.contains("no-hero");
  function onScroll() { if (hdr && hasHero) hdr.classList.toggle("solid", window.scrollY > 40); }
  window.addEventListener("scroll", onScroll); onScroll();

  var burger = document.querySelector(".burger");
  var menu = document.getElementById("menu");
  if (burger && menu) {
    var BURGER = burger.innerHTML;
    var KRUIS = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    if (!menu.querySelector(".menu-extra")) {
      var li = document.createElement("li");
      li.className = "menu-extra";
      li.innerHTML = '<a class="btn" href="/account">Mijn account</a><span><a href="https://www.instagram.com/roverandco.be/" target="_blank" rel="noopener">Instagram</a><a href="https://www.facebook.com/roverandcobe/" target="_blank" rel="noopener">Facebook</a></span>';
      menu.appendChild(li);
    }
    var zet = function (open) {
      menu.classList.toggle("open", open);
      document.body.classList.toggle("menu-open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? "Menu sluiten" : "Menu");
      burger.innerHTML = open ? KRUIS : BURGER;
    };
    burger.addEventListener("click", function () { zet(!menu.classList.contains("open")); });
    menu.addEventListener("click", function (ev) { if (ev.target.closest("a")) zet(false); });
    window.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && menu.classList.contains("open")) zet(false); });
  }

  /* ---------- mandje ---------- */
  var KEY = "rc-mandje";
  var cart = [];
  try { cart = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { cart = []; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} }
  function eur(n) { return "€" + n.toFixed(2).replace(".", ","); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // − aantal + per lijn (mandje en afrekenpagina)
  function stapper(i, n) {
    return '<span class="stapper"><button type="button" data-min="' + i + '" aria-label="Eén minder">−</button><b>' + n + '</b><button type="button" data-plus="' + i + '" aria-label="Eén meer">+</button></span>';
  }
  function render() {
    var count = cart.reduce(function (a, l) { return a + l.aantal; }, 0);
    document.querySelectorAll(".cart-count").forEach(function (el) { el.textContent = count; });
    var lines = document.getElementById("lines");
    if (!lines) return;
    lines.innerHTML = cart.length ? cart.map(function (l, i) {
      return '<div class="line"><span>' + esc(l.naam) + (l.opties ? "<small>" + esc(l.opties) + "</small>" : "") +
        "<small>" + eur(l.prijs) + " per stuk</small>" + stapper(i, l.aantal) + '<button type="button" data-remove="' + i + '">Verwijderen</button></span><b>' + eur(l.prijs * l.aantal) + "</b></div>";
    }).join("") + '<a class="btn btn-solid line-naar" href="/afrekenen">Afrekenen</a>' : "<p style='color:#5B625C'>Je mandje is leeg.</p>";
    document.getElementById("total").textContent = eur(cart.reduce(function (a, l) { return a + l.prijs * l.aantal; }, 0));
  }
  document.addEventListener("click", function (e) {
    var r = e.target.closest("[data-remove]");
    if (r) { cart.splice(+r.dataset.remove, 1); save(); render(); document.dispatchEvent(new Event("mandje")); return; }
    var m = e.target.closest("[data-min],[data-plus]");
    if (m) {
      var i = +(m.dataset.min != null ? m.dataset.min : m.dataset.plus), l = cart[i];
      if (!l) return;
      if (m.dataset.plus != null) l.aantal = Math.min(99, l.aantal + 1);
      else if (l.aantal > 1) l.aantal -= 1;
      else if (confirm("Dit artikel uit je mandje halen?")) cart.splice(i, 1);
      save(); render(); document.dispatchEvent(new Event("mandje"));
    }
  });

  function toggleCart(open) { document.body.classList.toggle("open-cart", open); }
  document.querySelectorAll("[data-open-cart]").forEach(function (b) { b.addEventListener("click", function () { toggleCart(true); }); });
  document.querySelectorAll("[data-close-cart]").forEach(function (b) { b.addEventListener("click", function () { toggleCart(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { toggleCart(false); closeLightbox(); } });

  var tt;
  function toast(t, link) {
    var el = document.getElementById("toast"); if (!el) return;
    el.textContent = t;
    if (link) { var a = document.createElement("a"); a.href = link[1]; a.textContent = link[0]; a.className = "toast-knop"; el.append(a); }
    el.classList.add("show"); clearTimeout(tt);
    tt = setTimeout(function () { el.classList.remove("show"); }, link ? 6000 : 2800);
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
      save(); render(); toast(form.dataset.naam + " zit in je mandje", ["Naar winkelmand", "/afrekenen"]);
      var naar = document.getElementById("naar-mandje");
      if (!naar) { naar = document.createElement("a"); naar.id = "naar-mandje"; naar.className = "btn naar-mandje"; naar.href = "/afrekenen"; naar.textContent = "Ga naar winkelmand"; form.querySelector('button[type="submit"]').after(naar); }
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

  /* ---------- @gebruiker taggen: suggesties tijdens het typen ---------- */
  (function () {
    var box = null, veld = null, start = -1, timer = null, keuze = 0, lijst = [];
    function sluit() { if (box) box.remove(); box = null; lijst = []; }
    function zet(n) {
      var v = veld.value, eind = veld.selectionStart;
      veld.value = v.slice(0, start) + "@" + n + " " + v.slice(eind);
      var pos = start + n.length + 2; veld.setSelectionRange(pos, pos); veld.focus(); sluit();
    }
    function toon() {
      sluit(); if (!lijst.length) return;
      box = document.createElement("div"); box.className = "noem-lijst"; box.setAttribute("role", "listbox");
      box.innerHTML = lijst.map(function (x, i) { return '<button type="button" role="option" data-n="' + esc(x.n) + '" class="' + (i === keuze ? "aan" : "") + '">' + (x.a ? '<img src="/forum/foto/' + x.a + '" alt="">' : '<span class="noem-av">' + esc(x.n.slice(0, 1).toUpperCase()) + "</span>") + "@" + esc(x.n) + "</button>"; }).join("");
      var r = veld.getBoundingClientRect();
      box.style.left = (r.left + window.scrollX) + "px"; box.style.width = Math.min(280, r.width) + "px";
      document.body.appendChild(box);
      var h = box.offsetHeight;
      box.style.top = (r.bottom + h + 8 > window.innerHeight ? r.top + window.scrollY - h - 6 : r.bottom + window.scrollY + 6) + "px";
      box.addEventListener("mousedown", function (e) { var b = e.target.closest("[data-n]"); if (b) { e.preventDefault(); zet(b.dataset.n); } });
    }
    document.addEventListener("input", function (e) {
      var el = e.target;
      if (!el.matches || !el.matches('textarea[name="tekst"], #cb-tekst, #mini-tekst')) return;
      veld = el;
      var voor = el.value.slice(0, el.selectionStart), m = voor.match(/(^|[\s(])@([A-Za-z0-9._-]{1,20})$/);
      if (!m) { sluit(); return; }
      start = voor.length - m[2].length - 1;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fetch("/forum/api/leden?q=" + encodeURIComponent(m[2]), { credentials: "same-origin" }).then(function (r) { return r.json(); })
          .then(function (d) { lijst = d || []; keuze = 0; toon(); }).catch(sluit);
      }, 150);
    });
    document.addEventListener("keydown", function (e) {
      if (!box || e.target !== veld) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); keuze = (keuze + (e.key === "ArrowDown" ? 1 : lijst.length - 1)) % lijst.length; toon(); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); zet(lijst[keuze].n); }
      else if (e.key === "Escape") sluit();
    }, true);
    document.addEventListener("click", function (e) { if (box && !box.contains(e.target)) sluit(); });
  })();

  /* ---------- geen pinch-zoom op iPhone (Safari negeert user-scalable=no) ---------- */
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false }); });
  var laatsteTik = 0;
  document.addEventListener("touchend", function (e) { var nu = Date.now(); if (nu - laatsteTik < 300 && !e.target.closest("input,textarea,select,button,a")) e.preventDefault(); laatsteTik = nu; }, { passive: false });

  /* ---------- lightbox (met bladeren binnen een galerij) ---------- */
  var lb = document.getElementById("lightbox"), lbGroep = [], lbI = 0;
  function closeLightbox() { if (lb) lb.classList.remove("open"); }
  function lbToon(b) {
    lb.querySelector("img").src = b.dataset.full;
    lb.querySelector("img").alt = (b.querySelector("img") || {}).alt || "";
    var cap = lb.querySelector(".lb-onderschrift");
    if (!cap) { cap = document.createElement("p"); cap.className = "lb-onderschrift"; lb.appendChild(cap); }
    cap.textContent = b.dataset.onderschrift || (lbGroep.length > 1 ? (lbI + 1) + " / " + lbGroep.length : "");
    if (b.dataset.link) { var a = document.createElement("a"); a.href = b.dataset.link; a.textContent = "Bekijk Land Rovers"; cap.appendChild(document.createTextNode(" · ")); cap.appendChild(a); }
    cap.hidden = !cap.textContent;
    lb.classList.toggle("meer", lbGroep.length > 1);
  }
  function lbStap(d) { if (lbGroep.length < 2) return; lbI = (lbI + d + lbGroep.length) % lbGroep.length; lbToon(lbGroep[lbI]); }
  if (lb && !lb.querySelector(".lb-vorige")) {
    lb.insertAdjacentHTML("beforeend", '<span class="lb-pijl lb-vorige" role="button" tabindex="0" aria-label="Vorige foto">‹</span><span class="lb-pijl lb-volgende" role="button" tabindex="0" aria-label="Volgende foto">›</span>');
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-full]");
    if (!b || !lb) return;
    lbGroep = b.dataset.groep ? Array.prototype.slice.call(document.querySelectorAll('[data-full][data-groep="' + b.dataset.groep + '"]')) : [b];
    lbI = Math.max(0, lbGroep.indexOf(b));
    lbToon(b); lb.classList.add("open");
  });
  if (lb) {
    lb.addEventListener("click", function (e) {
      if (e.target.closest(".lb-vorige")) return lbStap(-1);
      if (e.target.closest(".lb-volgende")) return lbStap(1);
      if (e.target === lb || e.target.closest("button")) closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") closeLightbox(); else if (e.key === "ArrowLeft") lbStap(-1); else if (e.key === "ArrowRight") lbStap(1);
    });
    var x0 = null;
    lb.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) lbStap(dx < 0 ? 1 : -1); x0 = null; });
  }

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
      document.getElementById("co-lijnen").innerHTML = cart.map(function (l, i) {
        return '<div class="co-lijn"><span>' + esc(l.naam) + (l.opties ? "<small>" + esc(l.opties) + "</small>" : "") + "<small>" + eur(l.prijs) + " per stuk</small>" + stapper(i, l.aantal) + '<button type="button" class="co-weg" data-remove="' + i + '">Verwijderen</button></span><b>' + eur(l.prijs * l.aantal) + "</b></div>";
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
    document.addEventListener("mandje", function () { toon(); });
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
      var bt = document.getElementById("ins-balk-tot"); if (bt) bt.textContent = eur(Math.round(tot * 100) / 100);
      var gekozen = rijen().some(function (r) { return aantal(r) > 0; });
      ins.classList.toggle("gekozen", gekozen);
    }
    // Gegevens: ingelogd en alles ingevuld = één regel "Ingeschreven als ..."; anders de velden (pas na een keuze).
    var geg = ins.querySelector("[data-gegevens]");
    function gegevensKort(aan) {
      if (!geg) return;
      var als = geg.querySelector(".ins-als");
      if (aan) { geg.querySelector("[data-als]").textContent = iw("naam") + " (" + iw("email") + ")"; }
      als.hidden = !aan; geg.classList.toggle("kort", !!aan);
    }
    ins.addEventListener("ik-geladen", function () { if (iw("naam") && iw("email") && iw("telefoon")) gegevensKort(true); });
    if (geg) geg.querySelector("[data-wijzig]").addEventListener("click", function () { gegevensKort(false); ins.elements.naam.focus(); });
    // Vaste balk onderaan op gsm zolang de kaart niet in beeld is.
    var balk = document.getElementById("ins-balk"), kaart = document.getElementById("inschrijven");
    if (balk && kaart && "IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { balk.hidden = en[0].isIntersecting; }, { rootMargin: "0px 0px -80px 0px" }).observe(kaart);
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
      if (slotVak && !slotVak.hidden && iw("tijdslot")) {
        var gk = slotVak.querySelector("input:checked"), vrij = gk && gk.dataset.vrij ? parseInt(gk.dataset.vrij, 10) : null;
        var pers = aantallen[slotVak.dataset.slotVoor] || 0;
        if (vrij !== null && pers > vrij) { ifout("tijdslot", "In dit tijdslot zijn nog maar " + vrij + " plaatsen. Kies een ander tijdslot of minder personen."); ok = false; }
      }
      if (!document.getElementById("akkoord").checked) { ifout("akkoord", "Vink dit aan om in te schrijven"); ok = false; }
      if (!ok && geg && geg.classList.contains("kort") && (ins.querySelector('.err[data-voor="naam"]').textContent || ins.querySelector('.err[data-voor="email"]').textContent || ins.querySelector('.err[data-voor="telefoon"]').textContent)) gegevensKort(false);
      if (!ok) { ins.classList.add("gekozen"); var eerste = ins.querySelector(".err:not(:empty)"); if (eerste) eerste.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
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

  /* ---------- accountmenu onder het account-icoon ---------- */
  function accountMenu(acc, ik) {
    if (document.getElementById("acc-menu")) return;
    var I = {
      home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>', bon: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>',
      auto: '<path d="M3 16V9l2-4h9l2 4h4v7H3Z"/><path d="M5 9h11"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
      bewaar: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>', bel: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Z"/><path d="M10 21h4"/>',
      profiel: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', instel: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
      beheer: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
      kassa: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M18 18h3v3h-3z"/>',
      cb: '<rect x="7" y="7" width="10" height="15" rx="2"/><path d="M10 7V2M10 12h4M10 15h4M10 18h4"/>',
      uit: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'
    };
    function item(href, ic, label, extra) { return '<a href="' + href + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + I[ic] + "</svg><span>" + label + "</span>" + (extra || "") + "</a>"; }
    var m = document.createElement("div");
    m.id = "acc-menu"; m.className = "acc-menu"; m.hidden = true; m.setAttribute("role", "menu");
    m.innerHTML = '<div class="acc-menu-kop"><b>' + esc(ik.gebruikersnaam || "Mijn account") + "</b><small>" + esc(ik.email || "") + "</small></div>" +
      item("/account", "home", "Mijn account") + item("/account/bestellingen", "bon", "Bestellingen en inschrijvingen") +
      item("/account/garage", "auto", "Mijn Landy") + item("/account/bewaard", "bewaar", "Bewaard") + item("/cb", "cb", "Op de CB") +
      item("/account/meldingen", "bel", "Meldingen", ik.meldingen ? '<em>' + (ik.meldingen > 99 ? "99+" : ik.meldingen) + "</em>" : "") +
      (ik.gebruikersnaam ? item("/forum/lid/" + encodeURIComponent(ik.gebruikersnaam), "profiel", "Mijn profiel op het forum") : "") +
      item("/account/gegevens", "instel", "Gegevens en wachtwoord") + "<hr>" +
      (ik.kassa ? item("/scan", "kassa", "Scan (tickets)") : "") + (ik.beheerder ? item("/beheer", "beheer", "Beheer") : "") + item("/account/uitloggen", "uit", "Uitloggen");
    acc.parentNode.appendChild(m);
    acc.setAttribute("aria-haspopup", "true"); acc.setAttribute("aria-expanded", "false"); acc.setAttribute("aria-controls", "acc-menu");
    acc.addEventListener("click", function (e) { e.preventDefault(); var open = m.hidden; m.hidden = !open; acc.setAttribute("aria-expanded", open ? "true" : "false"); });
    document.addEventListener("click", function (e) { if (!m.hidden && !m.contains(e.target) && !acc.contains(e.target)) { m.hidden = true; acc.setAttribute("aria-expanded", "false"); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !m.hidden) { m.hidden = true; acc.setAttribute("aria-expanded", "false"); acc.focus(); } });
  }

  var bel = document.querySelector(".bel-btn");
  if (bel && /(^|; )rc_lid_aan=1/.test(document.cookie)) bel.hidden = false;

  /* ---------- ingelogd? belletje met meldingen + gegevens invullen in afrekenen en inschrijven ---------- */
  var formulieren = ["checkout-form", "inschrijf-form"].map(function (id) { return document.getElementById(id); }).filter(Boolean);
  if (/(^|; )rc_lid_aan=1/.test(document.cookie) || formulieren.length) {
    fetch("/api/account/ik", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (ik) {
      if (!ik || !ik.ingelogd) return;
      var acc = document.querySelector(".acct-btn");
      if (acc) {
        acc.classList.add("ingelogd");
        accountMenu(acc, ik);
        if (bel) {
          bel.hidden = false;
          if (ik.meldingen) {
            bel.setAttribute("aria-label", ik.meldingen + " nieuwe meldingen");
            bel.classList.add("nieuw");
            var tel = document.createElement("span"); tel.className = "cart-count bel-count"; tel.textContent = ik.meldingen > 99 ? "99+" : ik.meldingen; bel.append(tel);
          }
        }
      }
      formulieren.forEach(function (f) {
        ["naam", "email", "telefoon", "straat", "postcode", "gemeente", "wagen"].forEach(function (n) { var el = f.elements[n]; if (el && !el.value && ik[n]) el.value = ik[n]; });
        if (f.elements.land && ik.land) f.elements.land.value = ik.land;
        f.dispatchEvent(new Event("ik-geladen"));
      });
    }).catch(function () {});
  }

  /* ---------- hartjes onder blogartikels (zie src/lib/blog-likes.js) ---------- */
  (function () {
    var knoppen = [].slice.call(document.querySelectorAll("[data-like]"));
    var tellers = [].slice.call(document.querySelectorAll("[data-likes]"));
    if (!knoppen.length && !tellers.length) return;
    var slugs = knoppen.map(function (b) { return b.dataset.like; }).concat(tellers.map(function (t) { return t.dataset.likes; }));
    function toon(slug, n, mijn) {
      knoppen.forEach(function (b) {
        if (b.dataset.like !== slug) return;
        b.querySelector("span").textContent = n || "";
        if (mijn !== undefined) { b.classList.toggle("aan", !!mijn); b.setAttribute("aria-pressed", mijn ? "true" : "false"); b.title = mijn ? "Hartje weghalen" : "Geef een hartje"; }
      });
      tellers.forEach(function (t) { if (t.dataset.likes === slug) { t.querySelector("b").textContent = n || ""; t.hidden = !n; } });
    }
    fetch("/api/blog/likes?s=" + encodeURIComponent(slugs.filter(function (s, i) { return slugs.indexOf(s) === i; }).join(",")), { credentials: "same-origin" })
      .then(function (r) { return r.json(); }).then(function (d) {
        slugs.forEach(function (s) { toon(s, (d.n || {})[s] || 0, (d.mijn || []).indexOf(s) >= 0); });
      }).catch(function () {});
    knoppen.forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.disabled) return;
        b.disabled = true;
        fetch("/api/blog/like", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: b.dataset.like }) })
          .then(function (r) { return r.json(); }).then(function (d) { if (d.ok) toon(b.dataset.like, d.n, d.mijn); })
          .catch(function () {}).then(function () { b.disabled = false; });
      });
    });
  })();

  render();

  /* ---------- app op je gsm: service worker + blok op /account met uitleg per toestel ---------- */
  (function () {
    if ("serviceWorker" in navigator) { try { navigator.serviceWorker.register("/sw.js"); } catch (x) {} }
    var blok = document.querySelector("[data-app-blok]");
    var app = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    var gsm = window.matchMedia("(max-width: 880px) and (pointer: coarse)").matches;
    var ua = navigator.userAgent;
    var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var android = /Android/.test(ua);
    var nooit = false; try { nooit = localStorage.getItem("rc-app-nooit") === "1"; } catch (x) {}
    var prompt = null;
    if (!blok || app || !gsm || nooit || (!ios && !android)) return;

    /* welk toestel / welke browser? */
    function soort() {
      if (/FBAN|FBAV|FB_IAB|Instagram|Messenger|Snapchat|TikTok|musical_ly|LinkedInApp|Line\/|Twitter/i.test(ua) || (android && /; wv\)/.test(ua))) return "inapp";
      if (ios) {
        if (/CriOS|EdgiOS/.test(ua)) return "ios-chrome";
        if (/FxiOS|OPiOS|GSA\//.test(ua)) return "inapp";
        var v = (ua.match(/Version\/(\d+)/) || [])[1];
        return v && +v >= 26 ? "ios-26" : "ios-oud";
      }
      if (/SamsungBrowser/.test(ua)) return "samsung";
      if (/Firefox/.test(ua)) return "firefox";
      if (/Chrome/.test(ua)) return "android-chrome";
      return "android-ander";
    }

    var I = {
      deel: '<path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
      drie: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
      menu: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
      plus: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
      lijn: '<path d="M4 7h16M4 12h16M4 17h16"/>',
      neer: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'
    };
    function ico(n) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + I[n] + '</svg>'; }

    var UITLEG = {
      "ios-26": { titel: "Zet Rover & Co op je iPhone", stappen: [
        "Tik onderaan naast de adresbalk op " + ico("drie") + "<small>Zie je dat niet? Tik dan meteen op " + ico("deel") + " <b>Delen</b>.</small>",
        "Tik op " + ico("deel") + " <b>Delen</b>",
        "Scroll naar beneden en tik op " + ico("plus") + " <b>Zet op beginscherm</b>",
        "Tik rechtsboven op <b>Voeg toe</b>. Klaar!"] },
      "ios-oud": { titel: "Zet Rover & Co op je iPhone", stappen: [
        "Tik onderaan op " + ico("deel") + " <b>Delen</b>",
        "Scroll naar beneden en tik op " + ico("plus") + " <b>Zet op beginscherm</b>",
        "Tik rechtsboven op <b>Voeg toe</b>. Klaar!"] },
      "ios-chrome": { titel: "Zet Rover & Co op je iPhone", stappen: [
        "Tik in de adresbalk op " + ico("deel") + " <b>Delen</b><small>Staat de adresbalk onderaan? Dan zit Delen daar.</small>",
        "Scroll naar beneden en tik op " + ico("plus") + " <b>Zet op beginscherm</b>",
        "Tik op <b>Voeg toe</b>. Klaar!"] },
      "android-chrome": { titel: "Zet Rover & Co op je gsm", stappen: [
        "Tik rechtsboven op " + ico("menu"),
        "Kies " + ico("neer") + " <b>App installeren</b> of <b>Toevoegen aan startscherm</b>",
        "Bevestig met <b>Installeren</b>. Klaar!"] },
      "samsung": { titel: "Zet Rover & Co op je gsm", stappen: [
        "Zie je in de adresbalk " + ico("neer") + " het <b>installeer-icoon</b>? Tik erop en bevestig. Klaar!<small>Geen icoon? Ga verder met stap 2.</small>",
        "Tik onderaan op " + ico("lijn") + " <b>menu</b>",
        "Kies <b>Pagina toevoegen aan</b> en dan <b>Startscherm</b>"] },
      "firefox": { titel: "Zet Rover & Co op je gsm", stappen: [
        "Tik op " + ico("menu") + " (boven of onder in je scherm)",
        "Kies <b>Installeren</b> of <b>Toevoegen aan startscherm</b>",
        "Bevestig. Klaar!"] },
      "android-ander": { titel: "Zet Rover & Co op je gsm", stappen: [
        "Open het menu van je browser " + ico("menu"),
        "Kies <b>App installeren</b> of <b>Toevoegen aan startscherm</b>",
        "Bevestig. Klaar!"] },
      "inapp": { titel: "Open eerst je gewone browser", uitleg: "Je bekijkt de site nu vanuit een andere app (zoals Facebook, Instagram of WhatsApp). Daar kan je niet installeren.", stappen: [
        "Tik op " + ico("drie") + " of " + ico("menu") + " en kies <b>Openen in " + (ios ? "Safari" : "browser") + "</b><small>Lukt dat niet? Kopieer de link hieronder en plak hem in " + (ios ? "Safari" : "Chrome") + ".</small>",
        "Ga daar naar <b>Mijn account</b> en tik opnieuw op <b>Installeer als app</b>"], link: true }
    };
    var s = soort();

    function lade() {
      var u = UITLEG[s];
      var knop = (s === "android-chrome" || s === "samsung") && prompt;
      var laag = document.createElement("div");
      laag.className = "app-laag";
      laag.innerHTML = '<div class="app-lade" role="dialog" aria-modal="true" aria-labelledby="app-lade-t">' +
        '<div class="app-greep"></div><button type="button" class="app-x" aria-label="Sluiten">×</button>' +
        '<h3 id="app-lade-t">' + u.titel + '</h3>' +
        '<p class="app-sub">' + (u.uitleg || "Dan open je de site met één tik, zonder adresbalk.") + '</p>' +
        (knop ? '<button type="button" class="btn btn-solid app-ja">Installeren</button><p class="app-of">Werkt de knop niet? Zo doe je het zelf:</p>' : '') +
        '<ol class="app-stappen">' + u.stappen.map(function (t) { return "<li>" + t + "</li>"; }).join("") + '</ol>' +
        (u.link ? '<button type="button" class="btn app-kopie">Kopieer link</button>' : '') +
        '<button type="button" class="btn btn-solid app-ok">Begrepen</button>' +
        '<button type="button" class="app-nooit">Toon dit niet meer</button></div>';
      document.body.appendChild(laag);
      document.documentElement.classList.add("app-open");
      requestAnimationFrame(function () { laag.classList.add("aan"); });
      function weg() { laag.classList.remove("aan"); document.documentElement.classList.remove("app-open"); setTimeout(function () { laag.remove(); }, 250); }
      laag.addEventListener("click", function (e) { if (e.target === laag) weg(); });
      laag.querySelector(".app-x").addEventListener("click", weg);
      laag.querySelector(".app-ok").addEventListener("click", weg);
      laag.querySelector(".app-nooit").addEventListener("click", function () {
        try { localStorage.setItem("rc-app-nooit", "1"); } catch (x) {}
        blok.hidden = true; weg();
      });
      var j = laag.querySelector(".app-ja");
      if (j) j.addEventListener("click", function () {
        prompt.prompt();
        prompt.userChoice.then(function (r) { if (r.outcome === "accepted") { blok.hidden = true; weg(); } prompt = null; });
      });
      var k = laag.querySelector(".app-kopie");
      if (k) k.addEventListener("click", function () {
        var url = location.origin + "/account";
        function ok() { k.textContent = "Link gekopieerd"; }
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, function () { window.prompt("Kopieer deze link:", url); });
        else window.prompt("Kopieer deze link:", url);
      });
      document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { weg(); document.removeEventListener("keydown", esc); } });
    }

    blok.innerHTML = '<img src="/apple-touch-icon.png" alt=""><div><b>Installeer als app</b><span>Tik hier, we tonen je hoe het moet op jouw gsm.</span></div>' +
      '<svg class="ico app-pijl" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    blok.setAttribute("role", "button");
    blok.setAttribute("tabindex", "0");
    blok.hidden = false;
    blok.addEventListener("click", lade);
    blok.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); lade(); } });
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); prompt = e; });
    window.addEventListener("appinstalled", function () { blok.hidden = true; });
  })();
})();
