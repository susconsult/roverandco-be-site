// Kassa: QR-tickets scannen met de camera (BarcodeDetector waar het kan, anders jsQR).
(() => {
  const $ = (s) => document.querySelector(s);
  const act = $("#act"), video = $("#video"), info = $("#caminfo"), uit = $("#uitslag"), doek = $("#doek");
  const ctx = doek.getContext("2d", { willReadFrequently: true });
  let stroom = null, bezig = false, laatst = "", laatstTijd = 0, detector = null;

  try { const k = localStorage.getItem("kassa-act"); if (k && [...act.options].some((o) => o.value === k)) act.value = k; } catch {}
  act.addEventListener("change", () => { try { localStorage.setItem("kassa-act", act.value); } catch {} stand(); });

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const uur = (iso) => iso ? new Date(iso).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }) : "";

  async function stand() {
    if (!act.value) return;
    try {
      const d = await (await fetch(`/api/kassa/stand?act=${encodeURIComponent(act.value)}`)).json();
      $("#binnen").textContent = d.binnen; $("#totaal").textContent = d.totaal;
      $("#pers").textContent = d.personen ? `${d.personen_binnen} / ${d.personen} personen` : "";
    } catch {}
  }

  function piep(goed) {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
      o.frequency.value = goed ? 880 : 220; g.gain.value = 0.15; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + (goed ? 0.15 : 0.45));
    } catch {}
    if (navigator.vibrate) navigator.vibrate(goed ? 80 : [120, 80, 120]);
  }

  function toon(d, code) {
    const kop = { ok: "Geldig", al: "Al gescand", "niet-betaald": "Niet betaald", ongeldig: "Ongeldig", andere: "Andere activiteit" }[d.status] || "Fout";
    let h = `<h1>${kop}</h1>`;
    if (d.naam) h += `<div class="naam">${esc(d.naam)}</div>`;
    if (d.lijnen?.length) h += `<ul>${d.lijnen.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    if (d.tijdslot) h += `<p>Tijdslot: <b>${esc(d.tijdslot)}</b></p>`;
    if (d.wagen) h += `<p>Land Rover: ${esc(d.wagen)}</p>`;
    if (d.opmerking) h += `<p>Opmerking: ${esc(d.opmerking)}</p>`;
    if (d.status === "al") h += `<p>Gescand om <b>${uur(d.gescand_op)}</b>${d.door ? ` door ${esc(d.door)}` : ""}.</p>`;
    if (d.status === "andere") h += `<p>Dit ticket is voor <b>${esc(d.titel)}</b>.</p>`;
    if (d.reden) h += `<p>${esc(d.reden)}</p>`;
    if (d.test) h += `<p><b>Testinschrijving, er is niet betaald.</b></p>`;
    if (d.nummer) h += `<p class="binnen">${esc(d.nummer)}</p>`;
    h += `<button class="knop" data-a="verder">Volgende</button>`;
    if (d.status === "andere") h += `<button class="knop licht" data-a="toch">Toch binnenlaten</button>`;
    if (d.status === "ok" || d.status === "al") h += `<button class="knop licht" data-a="terug">Scan terugdraaien</button>`;
    uit.className = d.status; uit.innerHTML = h; uit.style.display = "flex";
    piep(d.status === "ok");
    uit.onclick = async (e) => {
      const a = e.target.closest("button")?.dataset.a;
      if (!a) return;
      if (a === "toch") return verwerk(code, true);
      if (a === "terug") {
        if (!confirm("Deze scan terugdraaien? Het ticket kan dan opnieuw gescand worden.")) return;
        await fetch("/api/kassa/ongedaan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nummer: d.nummer }) });
      }
      uit.style.display = "none"; bezig = false; laatst = ""; stand();
    };
    stand();
  }

  async function verwerk(code, toch = false) {
    bezig = true;
    try {
      const r = await fetch("/api/kassa/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, activiteit: act.value, toch }) });
      toon(await r.json(), code);
    } catch { toon({ status: "ongeldig", reden: "Geen verbinding. Probeer opnieuw." }, code); }
  }

  async function lees() {
    if (!stroom) return;
    if (!bezig && video.readyState >= 2) {
      let code = "";
      try {
        if (detector) { const r = await detector.detect(video); code = r[0]?.rawValue || ""; }
        else {
          const w = 480, h = Math.round(w * video.videoHeight / video.videoWidth) || w;
          doek.width = w; doek.height = h; ctx.drawImage(video, 0, 0, w, h);
          const r = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
          code = r?.data || "";
        }
      } catch {}
      // Dezelfde code niet meteen opnieuw versturen.
      if (code && !(code === laatst && Date.now() - laatstTijd < 4000)) { laatst = code; laatstTijd = Date.now(); verwerk(code); }
    }
    setTimeout(() => requestAnimationFrame(lees), 120);
  }

  $("#start").addEventListener("click", async () => {
    if (stroom) { stroom.getTracks().forEach((t) => t.stop()); stroom = null; $("#start").textContent = "Start camera"; info.textContent = "Camera staat uit"; return; }
    try {
      stroom = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      video.srcObject = stroom; await video.play();
      if ("BarcodeDetector" in window) { try { if ((await BarcodeDetector.getSupportedFormats()).includes("qr_code")) detector = new BarcodeDetector({ formats: ["qr_code"] }); } catch {} }
      $("#start").textContent = "Stop camera"; info.textContent = "Houd de QR-code in het kader";
      lees();
    } catch { info.textContent = "Geen toegang tot de camera. Geef toestemming in je browser."; }
  });

  let zoekTimer;
  $("#q").addEventListener("input", () => {
    clearTimeout(zoekTimer);
    zoekTimer = setTimeout(async () => {
      const q = $("#q").value.trim(), ul = $("#resultaten");
      if (q.length < 2) { ul.innerHTML = ""; return; }
      const d = await (await fetch(`/api/kassa/zoek?act=${encodeURIComponent(act.value)}&q=${encodeURIComponent(q)}`)).json();
      ul.innerHTML = d.lijst.length ? d.lijst.map((x) => `<li><div><b>${esc(x.naam)}</b><small>${esc(x.lijnen.join(", "))}${x.tijdslot ? " · " + esc(x.tijdslot) : ""}</small>${x.gescand_op ? `<small>Binnen om ${uur(x.gescand_op)}</small>` : ""}</div><button data-nr="${esc(x.nummer)}">${x.gescand_op ? "Bekijk" : "Inchecken"}</button></li>`).join("") : "<li>Niets gevonden.</li>";
    }, 250);
  });
  $("#resultaten").addEventListener("click", (e) => { const b = e.target.closest("button[data-nr]"); if (b) verwerk(b.dataset.nr); });

  stand(); setInterval(stand, 20000);
})();
