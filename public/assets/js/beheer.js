/* /beheer: bewerkschermen voor producten en activiteiten.
   Elke lijst staat als JSON in een verborgen veld; dit script tekent er knoppen en rijen van en schrijft bij elke wijziging terug. */
(function () {
  var form = document.querySelector("[data-beheer-form]");
  if (!form) return;
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.append(c); });
    return n;
  }
  function knop(tekst, fn, cls) { return el("button", { type: "button", class: "knop klein " + (cls || "grijs"), text: tekst, onclick: fn }); }
  function verklein(bestand, max) {
    return new Promise(function (ok, nok) {
      var img = new Image(), url = URL.createObjectURL(bestand);
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { if (b && b.type === "image/webp") return ok(b); c.toBlob(function (j) { j ? ok(j) : nok(); }, "image/jpeg", 0.86); }, "image/webp", 0.84);
      };
      img.onerror = function () { URL.revokeObjectURL(url); nok(); };
      img.src = url;
    });
  }
  function oplaad(bestand) {
    return verklein(bestand, 1600).then(function (b) {
      return fetch("/beheer/media", { method: "POST", headers: { "content-type": b.type, "x-bestandsnaam": encodeURIComponent(bestand.name || "") }, body: b, credentials: "same-origin" });
    }).then(function (r) { return r.json(); }).then(function (d) { if (!d.ok) throw new Error(d.fout || "Opladen mislukt"); return d.url; });
  }
  function bezig(aan) { form.querySelectorAll("button[type=submit]").forEach(function (b) { b.disabled = aan; }); }

  /* ---- editor met opmaak ---- */
  form.querySelectorAll("[data-editor]").forEach(function (ed) {
    var ta = form.querySelector('textarea[name="' + ed.dataset.editor + '"]');
    var balk = ed.previousElementSibling;
    function bewaar() { ta.value = ed.innerHTML; }
    ed.addEventListener("input", bewaar);
    balk.querySelectorAll("[data-cmd]").forEach(function (b) {
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });
      b.addEventListener("click", function () {
        var cmd = b.dataset.cmd, arg = b.dataset.arg || null;
        if (cmd === "createLink") { arg = prompt("Link (https://…)"); if (!arg) return; }
        document.execCommand(cmd, false, arg); bewaar();
      });
    });
  });

  /* ---- één foto kiezen ---- */
  form.querySelectorAll("[data-fotoveld]").forEach(function (v) {
    var inp = v.querySelector('input[type=hidden]'), pre = v.querySelector("img"), file = v.querySelector("input[type=file]"), wis = v.querySelector("[data-wis]");
    file.addEventListener("change", function () {
      if (!file.files[0]) return; bezig(true);
      oplaad(file.files[0]).then(function (u) { inp.value = u; pre.src = u; pre.hidden = false; })
        .catch(function (e) { alert(e.message); }).then(function () { bezig(false); file.value = ""; });
    });
    if (wis) wis.addEventListener("click", function () { inp.value = ""; pre.hidden = true; wis.remove(); });
  });

  /* ---- productfoto's: [{klein, groot, alt}] ---- */
  var fl = form.querySelector("[data-fotolijst]");
  if (fl) {
    var fi = fl.querySelector("input"), fotos = JSON.parse(fi.value || "[]"), fbox = el("div", { class: "fotos" });
    fl.append(fbox);
    var tekenF = function () {
      fi.value = JSON.stringify(fotos); fbox.textContent = "";
      fotos.forEach(function (f, i) {
        fbox.append(el("div", { class: "foto" }, [el("img", { src: f.klein || f.groot, alt: "" }),
          el("div", { class: "acties" }, [
            el("button", { type: "button", text: "←", title: "Naar voren", onclick: function () { if (i) { fotos.splice(i - 1, 0, fotos.splice(i, 1)[0]); tekenF(); } } }),
            el("button", { type: "button", text: "Weg", onclick: function () { fotos.splice(i, 1); tekenF(); } }),
            el("button", { type: "button", text: "→", title: "Naar achteren", onclick: function () { if (i < fotos.length - 1) { fotos.splice(i + 1, 0, fotos.splice(i, 1)[0]); tekenF(); } } })])]));
      });
      var f = el("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
      f.addEventListener("change", function () {
        var l = Array.prototype.slice.call(f.files); bezig(true);
        l.reduce(function (p, b) { return p.then(function () { return oplaad(b).then(function (u) { fotos.push({ klein: u, groot: u, alt: "" }); }); }); }, Promise.resolve())
          .catch(function (e) { alert(e.message); }).then(function () { bezig(false); tekenF(); });
      });
      fbox.append(el("label", { class: "foto", style: "display:grid;place-items:center;height:118px;cursor:pointer" }, [document.createTextNode("+ Foto's"), f]));
    };
    tekenF();
  }

  /* ---- galerij activiteit: [[adres, alt]] ---- */
  var gl = form.querySelector("[data-galerij]");
  if (gl) {
    var gi = gl.querySelector("input"), gal = JSON.parse(gi.value || "[]"), gbox = el("div", { class: "fotos" });
    gl.append(gbox);
    var src = function (n) { return n.charAt(0) === "/" ? n : "/assets/img/" + n + "-s.webp"; };
    var tekenG = function () {
      gi.value = JSON.stringify(gal); gbox.textContent = "";
      gal.forEach(function (g, i) {
        var alt = el("input", { value: g[1] || "", placeholder: "Wat staat erop?" });
        alt.addEventListener("input", function () { g[1] = alt.value; gi.value = JSON.stringify(gal); });
        gbox.append(el("div", { class: "foto" }, [el("img", { src: src(g[0]), alt: "" }),
          el("div", { class: "acties" }, [
            el("button", { type: "button", text: "←", onclick: function () { if (i) { gal.splice(i - 1, 0, gal.splice(i, 1)[0]); tekenG(); } } }),
            el("button", { type: "button", text: "Weg", onclick: function () { gal.splice(i, 1); tekenG(); } }),
            el("button", { type: "button", text: "→", onclick: function () { if (i < gal.length - 1) { gal.splice(i + 1, 0, gal.splice(i, 1)[0]); tekenG(); } } })]), alt]));
      });
      var f = el("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
      f.addEventListener("change", function () {
        var l = Array.prototype.slice.call(f.files); bezig(true);
        l.reduce(function (p, b) { return p.then(function () { return oplaad(b).then(function (u) { gal.push([u, ""]); }); }); }, Promise.resolve())
          .catch(function (e) { alert(e.message); }).then(function () { bezig(false); tekenG(); });
      });
      gbox.append(el("label", { class: "foto", style: "display:grid;place-items:center;height:118px;cursor:pointer" }, [document.createTextNode("+ Foto's"), f]));
    };
    tekenG();
  }

  /* ---- opties: [{naam, verplicht, waarden:[{waarde, meerprijs, standaard, uit}]}] ---- */
  var ol = form.querySelector("[data-optielijst]");
  if (ol) {
    var oi = ol.querySelector("input"), opties = JSON.parse(oi.value || "[]"), obox = el("div");
    ol.append(obox);
    var schrijfO = function () { oi.value = JSON.stringify(opties); };
    var tekenO = function () {
      schrijfO(); obox.textContent = "";
      opties.forEach(function (o, i) {
        var naam = el("input", { value: o.naam || "", placeholder: "Naam van de optie, bv. Maat" });
        naam.addEventListener("input", function () { o.naam = naam.value; schrijfO(); });
        var verpl = el("input", { type: "checkbox" }); verpl.checked = !!o.verplicht;
        verpl.addEventListener("change", function () { o.verplicht = verpl.checked; schrijfO(); });
        var rijen = el("div");
        (o.waarden = o.waarden || []).forEach(function (w, j) {
          var wa = el("input", { value: w.waarde || "", placeholder: "Waarde, bv. M" });
          wa.addEventListener("input", function () { w.waarde = wa.value; schrijfO(); });
          var mp = el("input", { class: "smal", value: w.meerprijs || "", placeholder: "+ €", inputmode: "decimal" });
          mp.addEventListener("input", function () { w.meerprijs = mp.value; schrijfO(); });
          var st = el("input", { type: "radio", name: "std-" + i }); st.checked = !!w.standaard;
          st.addEventListener("change", function () { o.waarden.forEach(function (x) { x.standaard = false; }); w.standaard = true; schrijfO(); });
          var aan = el("input", { type: "checkbox" }); aan.checked = !w.uit;
          aan.addEventListener("change", function () { w.uit = !aan.checked; schrijfO(); });
          rijen.append(el("div", { class: "rij" }, [wa, mp, el("label", {}, [st, document.createTextNode(" standaard")]), el("label", {}, [aan, document.createTextNode(" beschikbaar")]),
            knop("↑", function () { if (j) { o.waarden.splice(j - 1, 0, o.waarden.splice(j, 1)[0]); tekenO(); } }),
            knop("×", function () { o.waarden.splice(j, 1); tekenO(); })]));
        });
        obox.append(el("div", { class: "groep" }, [
          el("div", { class: "rij" }, [naam, el("label", {}, [verpl, document.createTextNode(" klant moet kiezen")]), knop("Optie weg", function () { if (confirm("Optie " + (o.naam || "") + " verwijderen?")) { opties.splice(i, 1); tekenO(); } }, "rood")]),
          rijen, knop("+ Waarde", function () { o.waarden.push({ waarde: "", meerprijs: 0 }); tekenO(); })]));
      });
      obox.append(knop("+ Optie toevoegen", function () { opties.push({ naam: "", verplicht: true, waarden: [{ waarde: "", meerprijs: 0 }] }); tekenO(); }, ""));
    };
    tekenO();
  }

  /* ---- onderdelen inschrijving ---- */
  var ul = form.querySelector("[data-onderdelen]");
  if (ul) {
    var ui = ul.querySelector("input"), ond = JSON.parse(ui.value || "[]"), ubox = el("div");
    ul.append(ubox);
    var schrijfU = function () { ui.value = JSON.stringify(ond); };
    var veldU = function (o, k, ph, cls, type) {
      var v = el("input", { value: o[k] == null ? "" : o[k], placeholder: ph, class: cls || "", type: type || "text", title: ph });
      v.addEventListener("input", function () { o[k] = v.value; schrijfU(); });
      return el("label", { style: "display:flex;flex-direction:column;font-size:12px" + (cls ? "" : ";flex:1") }, [document.createTextNode(ph), v]);
    };
    var tekenU = function () {
      schrijfU(); ubox.textContent = "";
      ond.forEach(function (o, i) {
        var per = el("select", {}, ["persoon", "wagen", "stuk"].map(function (p) { var x = el("option", { value: p, text: "per " + p }); if (o.per === p) x.selected = true; return x; }));
        per.addEventListener("change", function () { o.per = per.value; schrijfU(); });
        var bep = el("input", { type: "checkbox" }); bep.checked = !!o.beperkt;
        bep.addEventListener("change", function () { o.beperkt = bep.checked; schrijfU(); });
        ubox.append(el("div", { class: "groep" }, [
          el("div", { class: "rij" }, [veldU(o, "naam", "Naam (bv. Roadbook zaterdag)"), veldU(o, "prijs", "Prijs €", "smal"), el("label", { style: "display:flex;flex-direction:column;font-size:12px" }, [document.createTextNode("Per"), per])]),
          el("div", { class: "rij" }, [veldU(o, "max", "Max. per inschrijving", "smal", "number"), veldU(o, "capaciteit", "Volzet bij", "smal", "number"), veldU(o, "melding_vanaf", "Mail mij bij", "smal", "number"),
            veldU(o, "id", "Code", "smal"), el("label", {}, [bep, document.createTextNode(" toon 'beperkte plaatsen'")])]),
          el("div", { class: "rij" }, [veldU(o, "uitleg", "Uitleg (optioneel)"), knop("↑", function () { if (i) { ond.splice(i - 1, 0, ond.splice(i, 1)[0]); tekenU(); } }), knop("Weg", function () { if (confirm("Onderdeel " + (o.naam || "") + " verwijderen?")) { ond.splice(i, 1); tekenU(); } }, "rood")])]));
      });
      ubox.append(knop("+ Onderdeel toevoegen", function () { ond.push({ naam: "", prijs: 0, per: "persoon", max: 20 }); tekenU(); }, ""));
    };
    tekenU();
  }

  form.querySelectorAll("[data-bevestig]").forEach(function (b) {
    b.addEventListener("click", function (e) { if (!confirm(b.dataset.bevestig)) e.preventDefault(); });
  });
  form.addEventListener("submit", function () {
    form.querySelectorAll("[data-editor]").forEach(function (ed) { form.querySelector('textarea[name="' + ed.dataset.editor + '"]').value = ed.innerHTML; });
  });
})();
