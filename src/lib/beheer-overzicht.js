// /beheer/activiteiten/<slug>/overzicht: alles van één activiteit op één pagina.
// Kerncijfers, aantallen per onderdeel, bezetting per tijdslot, deelnemers per tijdslot (zoeken, CSV, printen),
// niet-betaalde inschrijvingen apart onderaan, en een knop die een korte update voor WhatsApp kopieert.
// Inschrijvingen uit Ecwid (EC-...) hebben geen onderdeel-id's: hun keuzes staan als tekst in lijnen[].opties.
import { pagina, esc } from "./beheer.js";
import { activiteit, eur } from "./aanbod.js";

const BETAALD = (st) => st === "Betaald" || String(st).startsWith("Bevestigd");
const PER = { persoon: ["persoon", "personen"], wagen: ["wagen", "wagens"], stuk: ["stuk", "stuks"] };
const meer = (n, per) => `${n} ${(PER[per] || ["", ""])[n === 1 ? 0 : 1]}`.trim();

// Zet één inschrijving om naar [{ id, naam, per, aantal }] volgens de onderdelen van de activiteit.
function lijnenVan(d, onderdelen, ts) {
  const uit = [];
  for (const l of d.lijnen || []) {
    if (l.id) { uit.push({ id: l.id, naam: l.naam, per: l.per, aantal: Number(l.aantal) || 0 }); continue; }
    const opties = l.opties || [];
    if (!opties.length) { uit.push({ id: "ecwid:zonder", naam: "Ecwid-inschrijving zonder keuze", per: "stuk", aantal: Number(l.aantal) || 0 }); continue; }
    for (const o of opties) {
      const zoek = (re) => onderdelen.find((x) => re.test(x.id) || re.test(x.naam));
      let doel = null;
      if (/roadbook/i.test(o)) doel = zoek(/roadbook/i);
      else if (/kerkbezoek|toren/i.test(o)) doel = onderdelen.find((x) => x.id === ts?.onderdeel) || zoek(/toren/i);
      const aantal = Number(l.aantal) || 1;
      uit.push(doel ? { id: doel.id, naam: doel.naam, per: doel.per, aantal } : { id: "ecwid:" + o, naam: o, per: "stuk", aantal: Number(l.aantal) || 1 });
    }
  }
  return uit;
}

const csvCel = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function activiteitOverzicht(env, email, slug, url) {
  const a = await activiteit(env, slug);
  if (!a) return null;
  const ins = a.inschrijving || {}, onderdelen = ins.onderdelen || [], ts = ins.tijdsloten;
  const { results } = await env.SHOP_DB.prepare(
    "SELECT nummer, aangemaakt, status, naam, email, telefoon, tijdslot, slot_personen, totaal, test, gescand_op, data FROM registraties WHERE soort = 'inschrijving' AND activiteit = ? AND (test IS NULL OR test = 0) ORDER BY naam COLLATE NOCASE"
  ).bind(slug).all();

  const rijen = (results || []).map((r) => {
    let d = {}; try { d = JSON.parse(r.data) || {}; } catch {}
    return { ...r, d, lijnen: lijnenVan(d, onderdelen, ts), betaald: BETAALD(r.status) };
  });
  const ok = rijen.filter((r) => r.betaald), niet = rijen.filter((r) => !r.betaald);

  // per onderdeel
  const som = new Map();
  for (const o of onderdelen) som.set(o.id, { naam: o.naam, per: o.per, aantal: 0 });
  for (const r of ok) for (const l of r.lijnen) {
    const x = som.get(l.id) || som.set(l.id, { naam: l.naam, per: l.per, aantal: 0 }).get(l.id);
    x.aantal += l.aantal;
  }
  const personen = [...som.values()].filter((x) => x.per === "persoon").reduce((s, x) => s + x.aantal, 0);
  const wagens = [...som.values()].filter((x) => x.per === "wagen").reduce((s, x) => s + x.aantal, 0);
  const omzet = ok.reduce((s, r) => s + (Number(r.totaal) || 0), 0);
  const binnen = ok.filter((r) => r.gescand_op).length;

  // CSV
  if (url.searchParams.get("csv")) {
    const kop = ["Nummer", "Naam", "E-mail", "Telefoon", "Status", "Tijdslot", "Onderdelen", "Totaal", "Gescand", "Opmerking"];
    const lijn = (r) => [r.nummer, r.naam, r.email, r.telefoon, r.status, r.tijdslot || "", r.lijnen.map((l) => `${l.aantal}x ${l.naam}`).join(", "),
      String(Number(r.totaal) || 0).replace(".", ","), r.gescand_op ? "ja" : "", r.d.opmerking || ""].map(csvCel).join(";");
    return new Response("﻿" + [kop.map(csvCel).join(";"), ...rijen.map(lijn)].join("\r\n"), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${slug}-deelnemers.csv"`, "cache-control": "no-store" },
    });
  }

  // tijdsloten
  const max = ts?.max_per_slot || 0;
  const perSlot = new Map((ts?.slots || []).map((s) => [s, 0]));
  for (const r of ok) if (r.tijdslot) perSlot.set(r.tijdslot, (perSlot.get(r.tijdslot) || 0) + (Number(r.slot_personen) || 0));
  const slotHtml = ts ? `<div class="kaart"><h2>Tijdsloten</h2>${[...perSlot].map(([s, n]) => {
    const vol = max && n >= max, pct = max ? Math.min(100, Math.round((n / max) * 100)) : 0;
    return `<div class="ov-slot"><span>${esc(s)}</span><div class="ov-balk"><i style="width:${pct}%" class="${vol ? "vol" : ""}"></i></div><b class="${vol ? "vol" : ""}">${vol ? "volzet" : max ? `${n}/${max}` : n}</b></div>`;
  }).join("")}</div>` : "";

  // deelnemers per tijdslot
  const rij = (r) => `<tr data-zoek="${esc(((r.naam || "") + " " + r.nummer + " " + (r.email || "")).toLowerCase())}"><td><a href="/beheer/r/${esc(r.nummer)}">${esc(r.naam || r.email || "–")}</a><br><small>${esc(r.nummer)}${r.nummer.startsWith("EC-") ? " · Ecwid" : ""}</small></td>
    <td>${esc(r.lijnen.map((l) => `${l.aantal}× ${l.naam}`).join(", "))}${r.d.opmerking ? `<br><small>💬 ${esc(r.d.opmerking)}</small>` : ""}</td>
    <td>${r.betaald ? (r.gescand_op ? '<span class="badge b-betaald">Binnen</span>' : "–") : `<span class="badge">${esc(r.status)}</span>`}</td></tr>`;
  const tabel = (lijst) => `<table class="lijst ov-tabel"><thead><tr><th>Naam</th><th>Onderdelen</th><th>Scan</th></tr></thead><tbody>${lijst.map(rij).join("")}</tbody></table>`;
  let deelnemers = "";
  if (ts) {
    const groepen = [...(ts.slots || []), ""];
    for (const g of groepen) {
      const l = ok.filter((r) => (g ? r.tijdslot === g : !r.tijdslot || !(ts.slots || []).includes(r.tijdslot)));
      if (!l.length) continue;
      const pers = l.reduce((s, r) => s + (Number(r.slot_personen) || 0), 0);
      deelnemers += `<h3 class="ov-groep">${g ? `Tijdslot ${esc(g)} <small>${meer(pers, "persoon")}</small>` : "Zonder tijdslot"}</h3>${tabel(l)}`;
    }
  } else deelnemers = tabel(ok);

  // WhatsApp-update
  const nuTxt = new Date().toLocaleString("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  const wa = [`*${a.titel} – update ${nuTxt}*`, "", `🎟️ ${ok.length} inschrijvingen`];
  if (wagens) wa.push(`🚙 ${meer(wagens, "wagen")}`);
  const persOnd = [...som.values()].filter((x) => x.per === "persoon" && x.aantal);
  if (persOnd.length === 1) wa.push(`🙋 ${meer(personen, "persoon")} voor ${persOnd[0].naam.toLowerCase()}`);
  else if (personen) wa.push(`🙋 ${meer(personen, "persoon")}`);
  const waTekst = wa.join("\n");

  const tegel = (label, waarde) => `<div class="tegel"><small>${label}</small><b>${waarde}</b></div>`;
  const inhoud = `<style>
.ov-kop{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
.ov-slot{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:14px}.ov-slot span{width:48px}.ov-slot b{width:62px;text-align:right;font-weight:600}
.ov-balk{flex:1;height:10px;background:#eee9dd;border-radius:6px;overflow:hidden}.ov-balk i{display:block;height:100%;background:var(--g)}.ov-balk i.vol{background:#a32d2d}b.vol{color:#a32d2d}
.ov-onderdeel{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee9dd}.ov-onderdeel:last-child{border:0}
.ov-groep{font-size:16px;margin:18px 0 6px}.ov-groep small{color:var(--m);font-weight:400}
.ov-tabel td{vertical-align:top}#ov-zoek{width:100%;max-width:360px;padding:9px 12px;border:1px solid #ddd5c3;border-radius:8px;font:inherit;margin-bottom:6px}
@media print{.zb,.ov-kop,#ov-zoek,.ov-geen-print{display:none!important}body{background:#fff}.kaart{padding:0}}
</style>
<p class="ov-geen-print"><a href="/beheer/activiteiten">← Alle activiteiten</a> · <a href="/beheer/activiteiten/${esc(slug)}">Bewerken</a> · <a href="/beheer?soort=inschrijving&amp;activiteit=${esc(slug)}">Inschrijvingenlijst</a></p>
<p style="color:var(--m);margin:-6px 0 14px">${esc([a.datum_lang || a.datum_label, a.locatie].filter(Boolean).join(" · "))}</p>
<div class="ov-kop">
  <button type="button" id="ov-wa">📋 Kopieer WhatsApp-update</button>
  <a class="knop licht" href="?csv=1">CSV downloaden</a>
  <button type="button" class="knop licht" onclick="print()">Afdrukken</button>
  <a class="knop licht" href="/activiteiten/${esc(slug)}/qr" target="_blank">QR-code</a>
</div>
<textarea id="ov-wa-tekst" hidden>${esc(waTekst)}</textarea>
<div class="tegels">${tegel("Inschrijvingen", ok.length)}${personen ? tegel("Personen", personen) : ""}${wagens ? tegel("Wagens", wagens) : ""}${tegel("Omzet", eur(omzet))}${tegel("Binnen (scan)", `${binnen} / ${ok.length}`)}</div>
<div class="kaart"><h2>Per onderdeel</h2>${[...som.values()].map((x) => `<div class="ov-onderdeel"><span>${esc(x.naam)}</span><b>${meer(x.aantal, x.per)}</b></div>`).join("") || "<p>Geen onderdelen.</p>"}</div>
${slotHtml}
<div class="kaart"><h2>Deelnemers</h2><input id="ov-zoek" type="search" placeholder="Zoek op naam, nummer of e-mail">${ok.length ? deelnemers : "<p>Nog geen betaalde inschrijvingen.</p>"}</div>
${niet.length ? `<div class="kaart"><h2>Niet betaald of terugbetaald <small style="color:var(--m);font-weight:400">(${niet.length}, tellen niet mee)</small></h2>${tabel(niet)}</div>` : ""}
<script>
document.getElementById("ov-wa").addEventListener("click", async function () {
  var t = document.getElementById("ov-wa-tekst").value, b = this, oud = b.textContent;
  try { await navigator.clipboard.writeText(t); } catch (e) { var x = document.createElement("textarea"); x.value = t; document.body.appendChild(x); x.select(); document.execCommand("copy"); x.remove(); }
  b.textContent = "✓ Gekopieerd"; setTimeout(function () { b.textContent = oud; }, 2000);
});
document.getElementById("ov-zoek").addEventListener("input", function () {
  var q = this.value.trim().toLowerCase();
  document.querySelectorAll(".ov-tabel tbody tr").forEach(function (tr) { tr.hidden = q && tr.dataset.zoek.indexOf(q) < 0; });
});
</script>`;
  return pagina(`Overzicht ${a.titel}`, inhoud, email);
}
