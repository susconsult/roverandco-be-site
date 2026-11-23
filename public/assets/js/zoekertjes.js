// Zoekertjes (/zoekertjes): filters, dichtst bij mij, foto's opladen bij plaatsen.
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  /* ---- overzicht ---- */
  var raster = $("#zk-raster");
  if (raster) {
    var kaarten = $$(".zk-kaart", raster), stand = { soort: "", cat: "" }, eigen = null;
    function km(a, b, c, d) {
      var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
      return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
    }
    function toepassen() {
      var n = 0;
      kaarten.forEach(function (k) {
        var ok = (!stand.soort || k.dataset.soort === stand.soort) && (!stand.cat || k.dataset.cat === stand.cat);
        k.hidden = !ok; if (ok) n++;
      });
      if (eigen) {
        kaarten.forEach(function (k) { k._km = k.dataset.lat ? km(eigen[0], eigen[1], +k.dataset.lat, +k.dataset.lon) : 99999; var s = $(".zk-afstand", k); if (s && k.dataset.lat) { s.hidden = false; s.textContent = " · " + (k._km < 1 ? "< 1" : Math.round(k._km)) + " km"; } });
        kaarten.slice().sort(function (a, b) { return (b.classList.contains("zk-af") ? 0 : 1) - (a.classList.contains("zk-af") ? 0 : 1) || a._km - b._km; }).forEach(function (k) { raster.appendChild(k); });
      }
      $("#zk-leeg").hidden = n > 0;
    }
    $$(".gd-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        var soort = b.hasAttribute("data-soort") ? "soort" : "cat";
        stand[soort] = b.getAttribute("data-" + soort);
        $$(".gd-chip[data-" + soort + "]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        toepassen();
      });
    });
    var hier = $("#zk-hier"), fout = $("#zk-fout");
    if (hier) {
      if (!navigator.geolocation) hier.hidden = true;
      hier.addEventListener("click", function () {
        fout.hidden = true; hier.classList.add("bezig");
        navigator.geolocation.getCurrentPosition(function (pos) {
          hier.classList.remove("bezig"); eigen = [pos.coords.latitude, pos.coords.longitude]; hier.setAttribute("aria-pressed", "true"); toepassen();
        }, function () { hier.classList.remove("bezig"); fout.textContent = "Je locatie kon niet bepaald worden."; fout.hidden = false; }, { timeout: 10000, maximumAge: 600000 });
      });
    }
  }

  /* ---- plaatsen / aanpassen ---- */
  var form = $("[data-zkform]");
  if (form) {
    var prijs = $(".zk-prijsveld", form);
    var zetPrijs = function () { var g = $('input[name="prijs_soort"]:checked', form); prijs.hidden = g && g.value === "gratis"; };
    $$('input[name="prijs_soort"]', form).forEach(function (r) { r.addEventListener("change", zetPrijs); }); zetPrijs();
    var veld = $('input[name="fotos"]', form), box = $("[data-fotolijst]", form), kies = $("[data-fotokies]", form);
    var fotos = []; try { fotos = JSON.parse(veld.value || "[]"); } catch (e) {}
    var teken = function () {
      veld.value = JSON.stringify(fotos); box.textContent = "";
      fotos.forEach(function (u, i) {
        var d = document.createElement("div"); d.className = "gd-foto";
        var im = document.createElement("img"); im.src = u; im.alt = "";
        var x = document.createElement("button"); x.type = "button"; x.textContent = "Weg"; x.onclick = function () { fotos.splice(i, 1); teken(); };
        d.appendChild(im); d.appendChild(x);
        if (i > 0) { var h = document.createElement("button"); h.type = "button"; h.textContent = "Hoofdfoto"; h.onclick = function () { fotos.unshift(fotos.splice(i, 1)[0]); teken(); }; d.appendChild(h); }
        box.appendChild(d);
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
        return p.then(function () { return verklein(f); }).then(function (b) { return fetch("/api/zoekertjes/foto", { method: "POST", body: b, headers: { "content-type": "image/jpeg" }, credentials: "same-origin" }); })
          .then(function (r) { return r.json(); }).then(function (d) { if (d.ok) { fotos.push(d.url); teken(); } else alert(d.fout || "Opladen mislukt."); });
      }, Promise.resolve()).catch(function () { alert("Opladen mislukt."); }).then(function () { kies.value = ""; });
    });
    teken();
  }
})();
