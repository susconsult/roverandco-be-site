// Gids (/gids, /gids/<slug>, /account/zaak/<slug>): kaart, postcode → dichtstbij, filters, kliktellers, foto's opladen.
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  /* ---- kliks tellen (geen cookies, geen persoonsgegevens) ---- */
  function tel(slug, soort) {
    var b = JSON.stringify({ s: slug, k: soort });
    try { if (navigator.sendBeacon && navigator.sendBeacon("/api/gids/klik", new Blob([b], { type: "application/json" }))) return; } catch (e) {}
    try { fetch("/api/gids/klik", { method: "POST", body: b, headers: { "content-type": "application/json" }, keepalive: true }); } catch (e) {}
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("[data-klik]");
    if (!a) return;
    var box = a.closest("[data-slug]");
    if (box) tel(box.getAttribute("data-slug"), a.getAttribute("data-klik"));
  });

  var groen = "#1F3B2A";
  function pin(sponsor) {
    return window.L.divIcon({ className: "gd-pin" + (sponsor ? " gd-pin-sp" : ""), html: "<span></span>", iconSize: [22, 22], iconAnchor: [11, 11] });
  }
  function tegels(kaart) {
    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(kaart);
  }

  /* ---- detailpagina: kleine kaart ---- */
  var mk = $("#gd-minikaart");
  if (mk && window.L && mk.dataset.lat) {
    var ll = [+mk.dataset.lat, +mk.dataset.lon];
    var k1 = window.L.map(mk, { scrollWheelZoom: false }).setView(ll, mk.dataset.benadering === "1" ? 12 : 15);
    tegels(k1);
    if (mk.dataset.benadering === "1") window.L.circle(ll, { radius: 1500, color: groen, weight: 1, fillOpacity: 0.12 }).addTo(k1);
    else window.L.marker(ll, { icon: pin(false), title: mk.dataset.naam }).addTo(k1);
  } else if (mk) mk.hidden = true;

  /* ---- overzicht ---- */
  var lijstEl = $("#gd-lijst");
  if (lijstEl) {
    var items = $$(".gd-item", lijstEl);
    var punten = [];
    try { punten = JSON.parse($("#gd-punten").textContent); } catch (e) {}
    var kaart = null, markers = {}, eigen = null, start = null;
    var stand = { cat: "", regio: "" };

    if (window.L && $("#gd-kaart")) {
      kaart = window.L.map("gd-kaart", { scrollWheelZoom: false }).setView([51.0, 4.6], 7);
      tegels(kaart);
      punten.forEach(function (p) {
        var m = window.L.marker([p.la, p.lo], { icon: pin(p.sp), title: p.n }).addTo(kaart);
        var el = document.createElement("div");
        el.innerHTML = "<b></b><br><small></small><br><a>Meer info</a>";
        el.querySelector("b").textContent = p.n; el.querySelector("small").textContent = p.g;
        var a = el.querySelector("a"); a.href = "/gids/" + p.s; a.setAttribute("data-klik", "meerinfo");
        var wrap = document.createElement("div"); wrap.setAttribute("data-slug", p.s); wrap.appendChild(el);
        m.bindPopup(wrap);
        markers[p.s] = m;
      });
      var groep = window.L.featureGroup(Object.keys(markers).map(function (k) { return markers[k]; }));
      if (punten.length) kaart.fitBounds(groep.getBounds(), { padding: [20, 20] });
    }

    function km(a, b, c, d) {
      var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
      return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
    }
    function toepassen() {
      var zichtbaar = [];
      items.forEach(function (li) {
        var ok = (!stand.cat || li.dataset.cat.split(" ").indexOf(stand.cat) >= 0)
          && (!stand.regio || (stand.regio === "NL" ? li.dataset.land === "NL" : li.dataset.regio === stand.regio && li.dataset.land === "BE"));
        li.hidden = !ok;
        var m = markers[li.dataset.slug];
        if (m && kaart) { if (ok) m.addTo(kaart); else m.remove(); }
        if (ok) zichtbaar.push(li);
      });
      if (eigen) {
        zichtbaar.forEach(function (li) { li._km = li.dataset.lat ? km(eigen[0], eigen[1], +li.dataset.lat, +li.dataset.lon) : 99999; });
        var sp = zichtbaar.filter(function (li) { return li.classList.contains("gd-sponsor"); }).sort(function (a, b) { return a._km - b._km; });
        var rest = zichtbaar.filter(function (li) { return !li.classList.contains("gd-sponsor"); }).sort(function (a, b) { return a._km - b._km; });
        sp.concat(rest).forEach(function (li) {
          var s = li.querySelector(".gd-afstand"); s.hidden = false; s.textContent = (li._km < 1 ? "< 1" : Math.round(li._km)) + " km";
          lijstEl.appendChild(li);
        });
      }
      $("#gd-leeg").hidden = zichtbaar.length > 0;
      var n = zichtbaar.length;
      $("#gd-telling").textContent = n + (n === 1 ? " adres" : " adressen") + (eigen ? ", dichtstbij " + (stand.van || "jou") + " eerst" : "");
    }
    $$(".gd-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        stand.cat = b.getAttribute("data-cat");
        $$(".gd-chip").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        toepassen();
      });
    });
    var regio = $("#gd-regio");
    if (regio) regio.addEventListener("change", function () { stand.regio = regio.value; toepassen(); if (kaart) passend(); });
    function passend() {
      var l = items.filter(function (li) { return !li.hidden && li.dataset.lat; }).map(function (li) { return [+li.dataset.lat, +li.dataset.lon]; });
      if (l.length) kaart.fitBounds(window.L.latLngBounds(l), { padding: [24, 24], maxZoom: 11 });
    }
    /* lijst of kaart (op gsm) */
    var indeling = $(".gd-indeling");
    $$("[data-weergave]", $(".gd-wissel") || document.createElement("div")).forEach(function (b) {
      b.addEventListener("click", function () {
        indeling.setAttribute("data-weergave", b.dataset.weergave);
        $$(".gd-wissel [data-weergave]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        if (kaart && b.dataset.weergave === "kaart") setTimeout(function () {
          kaart.invalidateSize(false);
          if (eigen) {
            var d = $$(".gd-item", lijstEl).filter(function (li) { return !li.hidden && li.dataset.lat; }).slice(0, 5).map(function (li) { return [+li.dataset.lat, +li.dataset.lon]; });
            kaart.fitBounds(window.L.latLngBounds(d.concat([eigen])), { padding: [30, 30], maxZoom: 11 });
          } else passend();
        }, 120);
      });
    });

    var postcodes = null;
    function laadPostcodes() {
      if (postcodes) return Promise.resolve(postcodes);
      return fetch("/assets/data/postcodes.json").then(function (r) { return r.json(); }).then(function (d) { postcodes = d; return d; });
    }
    var form = $("#gd-zoek"), fout = $("#gd-fout"), invoer = $("#gd-pc"), land = $("#gd-land");
    invoer.addEventListener("input", function () {
      if (/^\d{4}\s?[a-z]{1,2}$/i.test(invoer.value.trim())) land.value = "NL";
      fout.hidden = true;
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var pc = (invoer.value.match(/\d{4}/) || [])[0];
      if (!pc) { fout.textContent = "Vul een postcode van 4 cijfers in."; fout.hidden = false; return; }
      laadPostcodes().then(function (d) {
        var hit = (d[land.value] || {})[pc] || (d[land.value === "BE" ? "NL" : "BE"] || {})[pc];
        if (!hit) { fout.textContent = "Deze postcode kennen we niet. Kies het juiste land en probeer opnieuw."; fout.hidden = false; return; }
        stand.van = invoer.value.trim().toUpperCase();
        try { localStorage.setItem("rc-gids-pc", JSON.stringify({ pc: invoer.value.trim(), land: land.value })); } catch (e) {}
        vanaf([hit[0], hit[1]], "Jouw postcode");
      }).catch(function () { fout.textContent = "De postcodes konden niet geladen worden. Probeer het later opnieuw."; fout.hidden = false; });
    });
    function vanaf(punt, label) {
        eigen = punt;
        tel("_gids", "zoek");
        toepassen();
        if (kaart) {
          if (start) start.remove();
          start = window.L.circleMarker(eigen, { radius: 8, color: "#B3261E", weight: 3, fillOpacity: 0.9 }).addTo(kaart).bindTooltip(label);
          var dichtste = $$(".gd-item", lijstEl).filter(function (li) { return !li.hidden && li.dataset.lat; }).slice(0, 5).map(function (li) { return [+li.dataset.lat, +li.dataset.lon]; });
          kaart.fitBounds(window.L.latLngBounds(dichtste.concat([eigen])), { padding: [30, 30], maxZoom: 11 });
        }
        var balk = $(".gd-balk"); if (balk) balk.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    var hier = $("#gd-hier");
    if (hier) {
      if (/[?&]hier=1/.test(location.search) && navigator.geolocation) setTimeout(function () { hier.click(); }, 300);
      if (!navigator.geolocation) hier.hidden = true;
      hier.addEventListener("click", function () {
        fout.hidden = true; hier.classList.add("bezig");
        navigator.geolocation.getCurrentPosition(function (pos) {
          hier.classList.remove("bezig"); stand.van = "jou";
          vanaf([pos.coords.latitude, pos.coords.longitude], "Jij bent hier");
        }, function () {
          hier.classList.remove("bezig");
          fout.textContent = "Je locatie kon niet bepaald worden. Vul je postcode in."; fout.hidden = false;
        }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
      });
    }
    try {
      var bewaard = JSON.parse(localStorage.getItem("rc-gids-pc") || "null");
      if (bewaard && bewaard.pc) { invoer.value = bewaard.pc; land.value = bewaard.land === "NL" ? "NL" : "BE"; }
    } catch (e) {}
    if (window.matchMedia && window.matchMedia("(hover: hover)").matches) lijstEl.addEventListener("mouseover", function (ev) {
      var li = ev.target.closest && ev.target.closest(".gd-item");
      if (li && markers[li.dataset.slug] && li !== lijstEl._aan) { lijstEl._aan = li; markers[li.dataset.slug].openPopup(); }
    });
  }

  /* ---- eigen zaak: foto's ---- */
  var zf = $("[data-zaakform]");
  if (zf) {
    var veld = zf.querySelector('input[name="fotos"]'), box = zf.querySelector("[data-fotolijst]"), kies = zf.querySelector("[data-fotokies]");
    var fotos = []; try { fotos = JSON.parse(veld.value || "[]"); } catch (e) {}
    var teken = function () {
      veld.value = JSON.stringify(fotos); box.textContent = "";
      fotos.forEach(function (u, i) {
        var d = document.createElement("div"); d.className = "gd-foto";
        var im = document.createElement("img"); im.src = u; im.alt = "";
        var x = document.createElement("button"); x.type = "button"; x.textContent = "Weg"; x.onclick = function () { fotos.splice(i, 1); teken(); };
        d.appendChild(im); d.appendChild(x); box.appendChild(d);
      });
    };
    var verklein = function (file) {
      return new Promise(function (ok, nok) {
        var img = new Image(); img.onload = function () {
          var s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(function (b) { b ? ok(b) : nok(); }, "image/jpeg", 0.85);
        }; img.onerror = nok; img.src = URL.createObjectURL(file);
      });
    };
    kies.addEventListener("change", function () {
      var l = [].slice.call(kies.files).slice(0, 6 - fotos.length);
      l.reduce(function (p, f) {
        return p.then(function () { return verklein(f); }).then(function (b) { return fetch("/account/zaak/foto", { method: "POST", body: b, headers: { "content-type": "image/jpeg" } }); })
          .then(function (r) { return r.json(); }).then(function (d) { if (d.ok) { fotos.push(d.url); teken(); } else alert(d.fout || "Opladen mislukt."); });
      }, Promise.resolve()).catch(function () { alert("Opladen mislukt."); }).then(function () { kies.value = ""; });
    });
    teken();
  }

  /* ---- logo en omslagfoto (eigen zaak en /beheer/gids) ---- */
  [].forEach.call(document.querySelectorAll("[data-enkel]"), function (blok) {
    var soort = blok.dataset.enkel, veld = blok.querySelector('input[type="hidden"]'), kies = blok.querySelector("[data-enkelkies]"),
      weg = blok.querySelector("[data-enkelweg]"), vb = blok.querySelector(".gd-enkel-voorbeeld");
    var toon = function (u) {
      veld.value = u || ""; vb.textContent = "";
      if (u) { var im = document.createElement("img"); im.src = u; im.alt = ""; vb.appendChild(im); }
      else { var sp = document.createElement("span"); sp.textContent = "Nog geen " + (soort === "logo" ? "logo" : "omslagfoto"); vb.appendChild(sp); }
      weg.hidden = !u;
    };
    weg.addEventListener("click", function () { toon(""); });
    kies.addEventListener("change", function () {
      var f = kies.files[0]; if (!f) return;
      var png = soort === "logo" && /png|svg|webp|gif/.test(f.type), max = soort === "logo" ? 600 : 1920;
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * s) || max; c.height = Math.round(img.height * s) || max;
        var g = c.getContext("2d"); if (!png) { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
        g.drawImage(img, 0, 0, c.width, c.height);
        var type = png ? "image/png" : "image/jpeg";
        c.toBlob(function (b) {
          if (!b) return alert("Opladen mislukt.");
          vb.classList.add("bezig");
          fetch(blok.dataset.opladen, { method: "POST", body: b, headers: { "content-type": type }, credentials: "same-origin" })
            .then(function (r) { return r.json(); })
            .then(function (d) { if (d.ok) toon(d.url); else alert(d.fout || "Opladen mislukt."); })
            .catch(function () { alert("Opladen mislukt."); })
            .then(function () { vb.classList.remove("bezig"); kies.value = ""; });
        }, type, 0.85);
      };
      img.onerror = function () { alert("Dit bestand kan niet als foto gelezen worden."); };
      img.src = URL.createObjectURL(f);
    });
  });
})();
