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
  var checkout = document.getElementById("checkout");
  if (checkout) checkout.addEventListener("click", function () {
    if (!cart.length) { toast("Je mandje is nog leeg"); return; }
    toast("Online betalen via Viva komt binnenkort. Bestellen kan nu via info@roverandco.be.");
  });

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
      var ok = true, keuzes = [];
      form.querySelectorAll("fieldset[data-optie]").forEach(function (fs) {
        var c = fs.querySelector("input:checked");
        if (!c && fs.dataset.verplicht === "true") { fs.querySelector(".err").textContent = "Kies eerst een " + fs.dataset.optie.toLowerCase(); ok = false; }
        if (c) keuzes.push(fs.dataset.optie + ": " + c.value);
      });
      var aantal = Math.max(1, parseInt(document.getElementById("aantal").value, 10) || 1);
      if (!ok) return;
      var opties = keuzes.join(", ");
      var bestaand = cart.find(function (l) { return l.id === form.dataset.id && l.opties === opties; });
      if (bestaand) bestaand.aantal += aantal; else cart.push({ id: form.dataset.id, naam: form.dataset.naam, opties: opties, prijs: huidigePrijs(), aantal: aantal });
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

  render();
})();
