/* Forum en account: opmaakknoppen, foto's verkleinen en opladen, citeren, bevestigen van moderatie. */
(function () {
  function verklein(bestand, max) {
    return new Promise(function (ok, nok) {
      var img = new Image(), url = URL.createObjectURL(bestand);
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (b && b.type === "image/webp") return ok(b);
          c.toBlob(function (j) { j ? ok(j) : nok(); }, "image/jpeg", 0.85);
        }, "image/webp", 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); nok(); };
      img.src = url;
    });
  }
  function oplaad(bestand, max) {
    return verklein(bestand, max).then(function (blob) {
      return fetch("/forum/foto", { method: "POST", headers: { "content-type": blob.type }, body: blob, credentials: "same-origin" });
    }).then(function (r) { return r.json(); });
  }
  function invoegen(ta, voor, na) {
    var a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
    ta.value = v.slice(0, a) + voor + v.slice(a, b) + (na || "") + v.slice(b);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = a + voor.length + (b - a) + (na ? 0 : 0);
  }

  document.querySelectorAll(".f-editor").forEach(function (ed) {
    var ta = ed.querySelector("textarea"), st = ed.querySelector(".f-status");
    ed.querySelectorAll("[data-tag]").forEach(function (k) {
      k.addEventListener("click", function () { var t = k.dataset.tag; invoegen(ta, "[" + t + "]", "[/" + t + "]"); });
    });
    var inp = ed.querySelector("[data-foto]");
    if (inp) inp.addEventListener("change", function () {
      var lijst = Array.prototype.slice.call(inp.files || [], 0, 10), klaar = 0;
      if (!lijst.length) return;
      st.textContent = "Foto's opladen…";
      lijst.reduce(function (p, f) {
        return p.then(function () {
          return oplaad(f, 1600).then(function (d) {
            if (d && d.ok) { invoegen(ta, (ta.value && !/\n$/.test(ta.value) ? "\n" : "") + "[foto=" + d.id + "]\n"); klaar++; }
            else st.textContent = (d && d.fout) || "Opladen mislukt.";
          });
        });
      }, Promise.resolve()).then(function () {
        if (klaar) st.textContent = klaar === 1 ? "Foto toegevoegd." : klaar + " foto's toegevoegd.";
        inp.value = "";
      }).catch(function () { st.textContent = "Opladen mislukt. Probeer een andere foto."; inp.value = ""; });
    });
  });

  document.querySelectorAll("[data-citeer]").forEach(function (k) {
    k.addEventListener("click", function () {
      var ta = document.querySelector("#antwoord textarea");
      if (!ta) return;
      var ruw = k.dataset.ruw.replace(/\[quote(=[^\]]*)?\][\s\S]*?\[\/quote\]\s*/gi, "").trim();
      ta.value += (ta.value ? "\n" : "") + "[quote=" + k.dataset.citeer + "]" + ruw + "[/quote]\n";
      ta.focus();
      ta.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  document.querySelectorAll("form[data-bevestig]").forEach(function (f) {
    f.addEventListener("submit", function (e) { if (!window.confirm(f.dataset.bevestig)) e.preventDefault(); });
  });

  document.querySelectorAll("button[data-bevestig]").forEach(function (b) {
    b.addEventListener("click", function (e) { if (!window.confirm(b.dataset.bevestig)) e.preventDefault(); });
  });

  document.querySelectorAll("[data-wagenfoto]").forEach(function (inp) {
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var vak = inp.closest(".avatar-kies"), knop = vak.querySelector("label");
      knop.firstChild.nodeValue = "Opladen…";
      oplaad(f, 1600).then(function (d) {
        knop.firstChild.nodeValue = "Foto kiezen";
        if (!d || !d.ok) { alert((d && d.fout) || "Opladen mislukt."); return; }
        inp.form.elements.foto_id.value = d.id;
        var oud = vak.querySelector(".wagen-mini"), img = document.createElement("img");
        img.className = "wagen-mini"; img.alt = ""; img.src = "/forum/foto/" + d.id; oud.replaceWith(img);
      }).catch(function () { knop.firstChild.nodeValue = "Foto kiezen"; alert("Opladen mislukt."); });
    });
  });

  document.querySelectorAll(".f-likeform").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var b = f.querySelector("button");
      fetch(f.action, { method: "POST", headers: { accept: "application/json" }, credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d.ok) return;
        b.classList.toggle("aan", d.mijn); b.setAttribute("aria-pressed", d.mijn);
        b.querySelector("span").textContent = d.aantal || "";
      }).catch(function () { f.submit(); });
    });
  });

  var av = document.querySelector("[data-avatar]");
  if (av) av.addEventListener("change", function () {
    var f = av.files && av.files[0]; if (!f) return;
    oplaad(f, 400).then(function (d) {
      if (!d || !d.ok) { alert((d && d.fout) || "Opladen mislukt."); return; }
      av.form.elements.avatar_id.value = d.id;
      var oud = av.parentNode.querySelector(".avatar"), img = document.createElement("img");
      img.className = "avatar"; img.width = 64; img.height = 64; img.alt = ""; img.src = "/forum/foto/" + d.id;
      oud.replaceWith(img);
    });
  });
})();
