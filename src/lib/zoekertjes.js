// Zoekertjes: te koop / gezocht tussen leden (wens Pieter 23 nov 2026).
// - /zoekertjes                 : overzicht met filters (te koop/gezocht, soort) en "Dichtst bij mij"
// - /zoekertjes/<id>-<slug>     : detail met foto's, prijs, plaats en contact (telefoon/mail alleen voor ingelogde leden)
// - /zoekertjes/nieuw           : plaatsen (elk lid met account), /zoekertjes/<id>/bewerken, POST /zoekertjes/<id>/status
// - POST /api/zoekertjes/foto   : foto opladen (in de browser verkleind) → media-tabel
// Blijft staan tot de verkoper het afsluit (verkocht/gevonden); afgesloten zoekertjes blijven nog 14 dagen grijs zichtbaar.
import { esc as e, pagina, banner, naar, ico } from "./sjabloon.js";
import { huidigLid } from "./leden.js";
import { log } from "./log.js";

export const SOORT = { koop: "Te koop", zoek: "Gezocht" };
export const CAT = { onderdelen: "Onderdelen", wagens: "Wagens", uitrusting: "Uitrusting" };
const MODELLEN = ["Series", "Defender", "Discovery", "Range Rover", "Freelander", "Andere", "Alle modellen"];
const PRIJS = { vast: "Prijs", bod: "Bod", gratis: "Gratis" };
const CSS = '<link rel="stylesheet" href="/assets/css/gids.css?v=5"><link rel="stylesheet" href="/assets/css/zoekertjes.css?v=2">';
const JS = '<script src="/assets/js/zoekertjes.js?v=1" defer></script>';
const nu = () => new Date().toISOString();
const tekst = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "zoekertje";
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const mediaOk = (u) => /^\/media\/\d{1,10}$/.test(u || "");
const ZICHTBAAR = "(z.status = 'actief' OR (z.status IN ('verkocht','gevonden') AND z.afgesloten_op > ?))";
const grens = () => new Date(Date.now() - 14 * 86400000).toISOString();

let tabelKlaar = false;
async function tabel(env) {
  if (tabelKlaar) return;
  await env.SHOP_DB.prepare(`CREATE TABLE IF NOT EXISTS zoekertjes (id INTEGER PRIMARY KEY AUTOINCREMENT, lid_id INTEGER NOT NULL, soort TEXT NOT NULL, titel TEXT NOT NULL,
    prijs INTEGER, prijs_soort TEXT NOT NULL DEFAULT 'vast', categorie TEXT NOT NULL, model TEXT, postcode TEXT, land TEXT, plaats TEXT, lat REAL, lon REAL, tekst TEXT,
    fotos TEXT NOT NULL DEFAULT '[]', telefoon TEXT, toon_tel INTEGER NOT NULL DEFAULT 0, toon_mail INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'actief',
    bekeken INTEGER NOT NULL DEFAULT 0, aangemaakt TEXT NOT NULL, bijgewerkt TEXT, afgesloten_op TEXT)`).run();
  await env.SHOP_DB.prepare("CREATE INDEX IF NOT EXISTS idx_zoekertjes_status ON zoekertjes(status, aangemaakt)").run();
  tabelKlaar = true;
}

const prijsTekst = (z) => z.prijs_soort === "gratis" ? "Gratis" : z.prijs_soort === "bod" ? (z.prijs ? `Bod vanaf € ${z.prijs.toLocaleString("nl-BE")}` : "Bod") : z.prijs != null ? `€ ${Number(z.prijs).toLocaleString("nl-BE")}` : "Prijs op aanvraag";
const fotosVan = (z) => { try { return JSON.parse(z.fotos || "[]").filter(mediaOk); } catch { return []; } };
const leeftijd = (iso) => { const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000); return d < 1 ? "vandaag" : d === 1 ? "gisteren" : `${d} d`; };
const link = (z) => `/zoekertjes/${z.id}-${slug(z.titel)}`;
const label = (z) => z.status === "verkocht" ? ["Verkocht", "zk-dicht"] : z.status === "gevonden" ? ["Gevonden", "zk-dicht"] : z.soort === "zoek" ? ["Gezocht", "zk-zoek"] : ["Te koop", "zk-koop"];

export function zkKaart(z) {
  const f = fotosVan(z)[0];
  const [lt, lk] = label(z);
  return `<a class="zk-kaart${z.status !== "actief" ? " zk-af" : ""}" href="${link(z)}" data-cat="${e(z.categorie)}" data-soort="${e(z.soort)}" data-lat="${z.lat ?? ""}" data-lon="${z.lon ?? ""}">
    <div class="zk-foto">${f ? `<img src="${e(f)}" alt="" loading="lazy">` : `<span class="zk-geenfoto">${ico(z.categorie === "wagens" ? "auto" : "tag")}</span>`}<span class="zk-label ${lk}">${lt}</span></div>
    <div class="zk-b"><b class="zk-prijs">${e(prijsTekst(z))}</b><span class="zk-titel">${e(z.titel)}</span><small>${e([z.model, z.plaats].filter(Boolean).join(" · "))} · ${leeftijd(z.aangemaakt)}<span class="zk-afstand" hidden></span></small></div></a>`;
}

// Voor de zijbalk op /forum (Community).
export async function laatsteZoekertjes(env, n = 4) {
  try {
    await tabel(env);
    return (await env.SHOP_DB.prepare(`SELECT z.* FROM zoekertjes z WHERE z.status = 'actief' ORDER BY z.aangemaakt DESC LIMIT ?`).bind(n).all()).results || [];
  } catch { return []; }
}

async function postcodeNaar(env, request, pc, land) {
  try {
    const r = await env.ASSETS.fetch(new Request(new URL("/assets/data/postcodes.json", request.url)));
    const d = await r.json();
    const k = (String(pc).match(/\d{4}/) || [])[0];
    const hit = k && ((d[land] || {})[k] || (d[land === "NL" ? "BE" : "NL"] || {})[k]);
    return hit ? { lat: hit[0], lon: hit[1], plaats: hit[2] } : null;
  } catch { return null; }
}

/* ---------------- overzicht ---------------- */

async function overzicht(env, request, url, lid) {
  await tabel(env);
  const lijst = (await env.SHOP_DB.prepare(`SELECT z.* FROM zoekertjes z WHERE ${ZICHTBAAR} ORDER BY z.status = 'actief' DESC, z.aangemaakt DESC LIMIT 300`).bind(grens()).all()).results || [];
  const chip = (attr, w, t, i) => `<button type="button" class="gd-chip" data-${attr}="${e(w)}" aria-pressed="${i === 0}">${e(t)}</button>`;
  return pagina(env, request, {
    titel: "Te koop / gezocht: Land Rover-onderdelen, wagens en uitrusting", pad: "/zoekertjes",
    desc: "Zoekertjes van Land Rover-rijders: onderdelen, wagens en uitrusting te koop of gezocht, in België en Nederland.",
    inhoud: CSS + banner("Community", "Te koop / gezocht", "Onderdelen, wagens en uitrusting tussen Land Rover-rijders. Plaatsen is gratis voor leden.", [["Community", "/forum"], ["Te koop / gezocht"]])
      + `<section class="wrap zk-sec"><div class="zk-balk">
    <div class="gd-chips" role="group" aria-label="Te koop of gezocht">${[["", "Alles"], ["koop", "Te koop"], ["zoek", "Gezocht"]].map(([w, t], i) => chip("soort", w, t, i)).join("")}</div>
    <div class="gd-chips" role="group" aria-label="Soort">${[["", "Alle soorten"], ...Object.entries(CAT)].map(([w, t], i) => chip("cat", w, t, i)).join("")}</div>
    <button type="button" class="zk-hier" id="zk-hier">${ico("locatie")}Dichtst bij mij</button>
    <a class="btn btn-solid zk-plaats" href="${lid ? "/zoekertjes/nieuw" : "/account/inloggen?terug=/zoekertjes/nieuw"}">${ico("plus")}Plaats een zoekertje</a></div>
  <p class="gd-fout" id="zk-fout" hidden></p>
  ${lijst.length ? `<div class="zk-raster" id="zk-raster">${lijst.map(zkKaart).join("")}</div><p class="zk-leeg" id="zk-leeg" hidden>Niets gevonden voor deze keuze.</p>`
    : `<div class="zk-leeg-groot"><h2>Nog geen zoekertjes</h2><p>Zoek je een onderdeel of wil je iets verkopen? Plaats als eerste een zoekertje.</p><a class="btn btn-solid" href="${lid ? "/zoekertjes/nieuw" : "/account/inloggen?terug=/zoekertjes/nieuw"}">Plaats een zoekertje</a></div>`}
  <p class="gd-klein">Rover &amp; Co is geen partij bij de verkoop: je maakt zelf afspraken met de verkoper. Zie je iets wat hier niet hoort? Mail <a href="mailto:info@roverandco.be">info@roverandco.be</a>.</p>
</section>` + JS,
  });
}

/* ---------------- detail ---------------- */

async function detail(env, request, url, lid, id) {
  await tabel(env);
  const z = await env.SHOP_DB.prepare(`SELECT z.*, l.gebruikersnaam, l.email lid_email FROM zoekertjes z JOIN leden l ON l.id = z.lid_id WHERE z.id = ? AND z.status != 'weg'`).bind(id).first();
  if (!z) return null;
  const juist = link(z);
  if (url.pathname !== juist) return new Response(null, { status: 301, headers: { location: juist + url.search } });
  const eigen = lid && (lid.id === z.lid_id);
  if (!eigen) await env.SHOP_DB.prepare("UPDATE zoekertjes SET bekeken = bekeken + 1 WHERE id = ?").bind(id).run().catch(() => {});
  const fotos = fotosVan(z);
  const [lt, lk] = label(z);
  const m = url.searchParams;
  const melding = m.has("nieuw") ? '<div class="melding melding-ok">Je zoekertje staat online.</div>' : m.has("bewaard") ? '<div class="melding melding-ok">Bewaard.</div>' : "";
  const contact = !lid
    ? `<p>Log in om de verkoper te contacteren.</p><a class="btn btn-solid" href="/account/inloggen?terug=${encodeURIComponent(juist)}">Inloggen</a> <a class="btn" href="/account/registreren?terug=${encodeURIComponent(juist)}">Gratis account</a>`
    : `${z.toon_tel && z.telefoon ? `<a class="btn btn-solid" href="tel:${e(z.telefoon.replace(/[^\d+]/g, ""))}">${ico("telefoon")}${e(z.telefoon)}</a>` : ""}
       ${z.toon_mail ? `<a class="btn" href="mailto:${e(z.lid_email)}?subject=${encodeURIComponent("Je zoekertje op Rover & Co: " + z.titel)}">${ico("mail")}Mail ${e(z.gebruikersnaam || "de verkoper")}</a>` : ""}
       ${!(z.toon_tel && z.telefoon) && !z.toon_mail ? "<p>De verkoper gaf geen contactgegevens op.</p>" : ""}`;
  const beheer = eigen || lid?.beheerder ? `<div class="zk-eigen"><b>${eigen ? "Jouw zoekertje" : "Beheer"}</b> · ${z.bekeken} keer bekeken
    <div class="zk-eigen-knoppen">${eigen ? `<a class="btn" href="/zoekertjes/${z.id}/bewerken">Aanpassen</a>` : ""}
    <form method="post" action="/zoekertjes/${z.id}/status">${z.status === "actief"
      ? `<button class="btn btn-solid" name="status" value="${z.soort === "zoek" ? "gevonden" : "verkocht"}">${z.soort === "zoek" ? "Gevonden" : "Verkocht"}</button>`
      : '<button class="btn" name="status" value="actief">Terug online zetten</button>'}
      <button class="linkknop" name="status" value="weg" onclick="return confirm('Dit zoekertje verwijderen?')">Verwijderen</button></form></div></div>` : "";
  return pagina(env, request, {
    titel: `${z.titel} (${SOORT[z.soort]})`, pad: juist,
    desc: `${SOORT[z.soort]}: ${z.titel}. ${prijsTekst(z)}${z.plaats ? ", " + z.plaats : ""}. ${String(z.tekst || "").slice(0, 160)}`,
    noindex: z.status !== "actief",
    inhoud: CSS + `<section class="wrap zk-detail">${melding}
  <nav class="kruimel" aria-label="Kruimelpad"><a href="/">Home</a><span aria-hidden="true">›</span><a href="/forum">Community</a><span aria-hidden="true">›</span><a href="/zoekertjes">Te koop / gezocht</a></nav>
  <div class="zk-detail-grid"><div class="zk-fotos">${fotos.length ? fotos.map((f, i) => `<button type="button" class="zk-dfoto${i === 0 ? " groot" : ""}" data-full="${e(f)}" data-groep="zk" data-onderschrift="${e(z.titel)}"><img src="${e(f)}" alt="${e(z.titel)}"${i ? ' loading="lazy"' : ""}></button>`).join("") : `<div class="zk-geenfoto groot">${ico("tag")}</div>`}</div>
  <div class="zk-info"><span class="zk-label ${lk}">${lt}</span><h1>${e(z.titel)}</h1><p class="zk-dprijs">${e(prijsTekst(z))}</p>
    <ul class="zk-feiten"><li><small>Soort</small>${e(CAT[z.categorie] || z.categorie)}</li>${z.model ? `<li><small>Model</small>${e(z.model)}</li>` : ""}${z.plaats ? `<li><small>Plaats</small>${e(z.plaats)}${z.land === "NL" ? " (NL)" : ""}</li>` : ""}<li><small>Geplaatst</small>${e(new Date(z.aangemaakt).toLocaleDateString("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "long" }))} door <a href="/forum/lid/${encodeURIComponent(z.gebruikersnaam || "")}">${e(z.gebruikersnaam || "lid")}</a></li></ul>
    ${z.tekst ? `<div class="zk-tekst">${e(z.tekst).replace(/\n/g, "<br>")}</div>` : ""}
    ${z.status === "actief" ? `<div class="zk-contact"><h2>Contact</h2>${contact}</div>` : `<p class="zk-gesloten">Dit zoekertje is afgesloten.</p>`}
    ${beheer}</div></div>
  <p class="gd-klein">Rover &amp; Co is geen partij bij de verkoop. Spreek af op een veilige plek en betaal nooit vooraf aan iemand die je niet kent.</p>
</section>`,
  });
}

/* ---------------- plaatsen / bewerken ---------------- */

function formulier(env, request, lid, z, fout = "") {
  const nieuw = !z.id;
  const opt = (naam, opties, w) => opties.map(([k, t]) => `<label class="zk-keuze"><input type="radio" name="${naam}" value="${e(k)}"${w === k ? " checked" : ""} required><span>${e(t)}</span></label>`).join("");
  const fotos = fotosVan(z);
  return pagina(env, request, {
    titel: nieuw ? "Zoekertje plaatsen" : "Zoekertje aanpassen", pad: "/zoekertjes", noindex: true,
    inhoud: CSS + banner("Te koop / gezocht", nieuw ? "Plaats een zoekertje" : "Zoekertje aanpassen", "Gratis voor leden. Je zoekertje blijft staan tot je het zelf afsluit.", [["Community", "/forum"], ["Te koop / gezocht", "/zoekertjes"], [nieuw ? "Plaatsen" : "Aanpassen"]])
      + `<section class="wrap zk-sec zk-smal">${fout ? `<div class="melding melding-fout">${e(fout)}</div>` : ""}
  <form method="post" class="zk-form" data-zkform>
    <fieldset><legend>Wat wil je?</legend><div class="zk-keuzes">${opt("soort", Object.entries(SOORT), z.soort || "koop")}</div></fieldset>
    <label>Titel<input name="titel" value="${e(z.titel || "")}" maxlength="90" required placeholder="Bv. Galvanized chassis Defender 90"></label>
    <fieldset><legend>Soort</legend><div class="zk-keuzes">${opt("categorie", Object.entries(CAT), z.categorie || "onderdelen")}</div></fieldset>
    <label>Model<select name="model"><option value="">Kies…</option>${MODELLEN.map((m) => `<option${z.model === m ? " selected" : ""}>${m}</option>`).join("")}</select></label>
    <fieldset><legend>Prijs</legend><div class="zk-keuzes">${opt("prijs_soort", Object.entries(PRIJS), z.prijs_soort || "vast")}</div>
      <label class="zk-prijsveld">Bedrag in euro<input name="prijs" type="number" min="0" max="9999999" step="1" inputmode="numeric" value="${z.prijs ?? ""}" placeholder="450"></label></fieldset>
    <label>Beschrijving<textarea name="tekst" rows="6" maxlength="3000" placeholder="Staat, wat erbij hoort, verzenden of ophalen…">${e(z.tekst || "")}</textarea></label>
    <div class="gd-fotoveld"><b>Foto's (max. 6)</b><div class="gd-fotolijst" data-fotolijst></div><input type="hidden" name="fotos" value="${e(JSON.stringify(fotos))}">
      <label class="btn">+ Foto toevoegen<input type="file" accept="image/*" multiple hidden data-fotokies></label><small>De eerste foto is de hoofdfoto. Foto's worden in je browser verkleind.</small></div>
    <div class="zk-twee"><label>Postcode<input name="postcode" value="${e(z.postcode || "")}" maxlength="7" required placeholder="3945"></label>
      <label>Land<select name="land"><option value="BE"${z.land !== "NL" ? " selected" : ""}>België</option><option value="NL"${z.land === "NL" ? " selected" : ""}>Nederland</option></select></label></div>
    <fieldset><legend>Hoe mogen leden je contacteren?</legend><p class="zk-uitleg">Alleen ingelogde leden zien je gegevens.</p>
      <label class="zk-vink"><input type="checkbox" name="toon_tel" value="1"${z.toon_tel || nieuw ? " checked" : ""}> Telefoon tonen</label>
      <label>Telefoon<input name="telefoon" value="${e(z.telefoon ?? lid.telefoon ?? "")}" maxlength="30" inputmode="tel"></label>
      <label class="zk-vink"><input type="checkbox" name="toon_mail" value="1"${z.toon_mail ? " checked" : ""}> Mailknop tonen (naar ${e(lid.email)})</label></fieldset>
    <div class="gd-knoppen"><button class="btn btn-solid" type="submit">${nieuw ? "Zoekertje plaatsen" : "Bewaren"}</button><a class="btn" href="${nieuw ? "/zoekertjes" : link(z)}">Annuleren</a></div>
  </form></section>` + JS,
  });
}

async function bewaar(env, request, lid, oud) {
  const f = await request.formData();
  const g = (k, m) => tekst(f.get(k), m);
  const z = {
    ...(oud || {}),
    soort: SOORT[f.get("soort")] ? f.get("soort") : "koop", titel: g("titel", 90), categorie: CAT[f.get("categorie")] ? f.get("categorie") : "onderdelen",
    model: MODELLEN.includes(f.get("model")) ? f.get("model") : "", prijs_soort: PRIJS[f.get("prijs_soort")] ? f.get("prijs_soort") : "vast",
    tekst: g("tekst", 3000), postcode: g("postcode", 7).toUpperCase(), land: f.get("land") === "NL" ? "NL" : "BE",
    telefoon: g("telefoon", 30), toon_tel: f.get("toon_tel") ? 1 : 0, toon_mail: f.get("toon_mail") ? 1 : 0,
    fotos: (() => { try { return JSON.stringify(JSON.parse(f.get("fotos") || "[]").filter(mediaOk).slice(0, 6)); } catch { return "[]"; } })(),
  };
  const p = parseInt(String(f.get("prijs") || "").replace(/\D/g, ""), 10);
  z.prijs = z.prijs_soort === "gratis" || !Number.isFinite(p) ? null : p;
  if (z.titel.length < 3) return formulier(env, request, lid, z, "Geef je zoekertje een titel.");
  if (z.toon_tel && z.telefoon.replace(/\D/g, "").length < 8) return formulier(env, request, lid, z, "Vul een geldig telefoonnummer in, of vink 'Telefoon tonen' uit.");
  if (!z.toon_tel && !z.toon_mail) return formulier(env, request, lid, z, "Kies minstens één manier waarop leden je kunnen contacteren.");
  const loc = await postcodeNaar(env, request, z.postcode, z.land);
  if (!loc) return formulier(env, request, lid, z, "Deze postcode kennen we niet. Kies het juiste land en probeer opnieuw.");
  Object.assign(z, loc);
  const velden = [z.soort, z.titel, z.prijs, z.prijs_soort, z.categorie, z.model, z.postcode, z.land, z.plaats, z.lat, z.lon, z.tekst, z.fotos, z.telefoon, z.toon_tel, z.toon_mail];
  if (oud) {
    await env.SHOP_DB.prepare(`UPDATE zoekertjes SET soort=?, titel=?, prijs=?, prijs_soort=?, categorie=?, model=?, postcode=?, land=?, plaats=?, lat=?, lon=?, tekst=?, fotos=?, telefoon=?, toon_tel=?, toon_mail=?, bijgewerkt=? WHERE id=?`)
      .bind(...velden, nu(), oud.id).run();
    return naar(link({ ...z, id: oud.id }) + "?bewaard=1");
  }
  const r = await env.SHOP_DB.prepare(`INSERT INTO zoekertjes (soort, titel, prijs, prijs_soort, categorie, model, postcode, land, plaats, lat, lon, tekst, fotos, telefoon, toon_tel, toon_mail, lid_id, aangemaakt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...velden, lid.id, nu()).run();
  const id = r.meta.last_row_id;
  await log(env, lid.id, "forum", `Zoekertje geplaatst: ${z.titel}`, `/zoekertjes/${id}`).catch(() => {});
  return naar(link({ ...z, id }) + "?nieuw=1");
}

async function foto(env, request, lid) {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!["image/jpeg", "image/webp", "image/png"].includes(type)) return json({ ok: false, fout: "Alleen foto's (JPG, PNG of WebP)." }, 415);
  const recent = await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM media WHERE naam = ? AND aangemaakt > ?").bind(`zoekertje lid ${lid.id}`, new Date(Date.now() - 3600000).toISOString()).first();
  if ((recent?.n || 0) >= 40) return json({ ok: false, fout: "Te veel foto's op korte tijd. Probeer het later opnieuw." }, 429);
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > 1_900_000) return json({ ok: false, fout: "Deze foto is te groot." }, 413);
  const r = await env.SHOP_DB.prepare("INSERT INTO media (type, data, grootte, naam, aangemaakt) VALUES (?, ?, ?, ?, ?)").bind(type, data, data.byteLength, `zoekertje lid ${lid.id}`, nu()).run();
  return json({ ok: true, url: `/media/${r.meta.last_row_id}` });
}

/* ---------------- router ---------------- */

export async function zoekertjes(request, env, url) {
  const p = url.pathname.replace(/\/$/, "");
  if (p !== "/zoekertjes" && !p.startsWith("/zoekertjes/") && p !== "/api/zoekertjes/foto") return null;
  if (!env.SHOP_DB) return null;
  await tabel(env);
  const post = request.method === "POST";
  const lid = await huidigLid(request, env).catch(() => null);
  const login = () => naar("/account/inloggen?terug=" + encodeURIComponent(p));
  if (p === "/api/zoekertjes/foto" && post) return lid ? foto(env, request, lid) : json({ ok: false, fout: "Log eerst in." }, 401);
  if (p === "/zoekertjes") return overzicht(env, request, url, lid);
  if (p === "/zoekertjes/nieuw") {
    if (!lid) return login();
    if (!lid.gebruikersnaam) return naar("/account/gegevens");
    return post ? bewaar(env, request, lid, null) : formulier(env, request, lid, {});
  }
  let m;
  if ((m = p.match(/^\/zoekertjes\/(\d{1,9})\/bewerken$/))) {
    if (!lid) return login();
    const z = await env.SHOP_DB.prepare("SELECT * FROM zoekertjes WHERE id = ? AND status != 'weg'").bind(m[1]).first();
    if (!z || z.lid_id !== lid.id) return naar("/zoekertjes");
    return post ? bewaar(env, request, lid, z) : formulier(env, request, lid, z);
  }
  if ((m = p.match(/^\/zoekertjes\/(\d{1,9})\/status$/)) && post) {
    if (!lid) return login();
    const z = await env.SHOP_DB.prepare("SELECT * FROM zoekertjes WHERE id = ?").bind(m[1]).first();
    if (!z || (z.lid_id !== lid.id && !lid.beheerder)) return naar("/zoekertjes");
    const s = (await request.formData()).get("status");
    if (!["actief", "verkocht", "gevonden", "weg"].includes(s)) return naar(link(z));
    await env.SHOP_DB.prepare("UPDATE zoekertjes SET status = ?, afgesloten_op = ?, bijgewerkt = ? WHERE id = ?").bind(s, s === "actief" ? null : nu(), nu(), z.id).run();
    await log(env, lid.id, z.lid_id === lid.id ? "forum" : "beheer", `Zoekertje ${s}: ${z.titel}`, `/zoekertjes/${z.id}`).catch(() => {});
    return naar(s === "weg" ? "/zoekertjes" : link(z));
  }
  if ((m = p.match(/^\/zoekertjes\/(\d{1,9})(?:-[a-z0-9-]*)?$/))) return detail(env, request, url, lid, +m[1]);
  return null;
}
