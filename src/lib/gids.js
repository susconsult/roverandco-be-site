// De bedrijvengids op /gids: Land Rover-garages, accessoires en onderdelen in België en Nederland.
// - /gids                    : overzicht met kaart (Leaflet + OpenStreetMap), postcode → dichtstbij, filters op soort en regio
// - /gids/<slug>             : eigen pagina per zaak (contact, kaartje, foto's, openingsuren, ervaringen, Kampvuur-topics)
// - /gids/voorstellen        : een lid stelt een zaak voor (komt in /beheer/gids › Aanvragen)
// - /gids/<slug>/claim       : "Is dit jouw zaak?" (lid vraagt de pagina aan; Pieter keurt goed)
// - /gids/<slug>/ervaring    : ervaring van een lid (één per lid per zaak)
// - /api/gids/klik           : telt kliks op bel/route/website/mail/meer info (geen cookies, geen persoonsgegevens)
// - /account/zaak[/<slug>]   : de eigenaar past zijn eigen pagina aan
// Gegevens: tabellen gids_* in SHOP_DB (bouw/db/schema-gids.sql). Beheer: src/lib/beheer-gids.js.
import { esc as e, pagina, banner, naar, eigenOrigin, ico } from "./sjabloon.js";
import { huidigLid } from "./leden.js";
import { verstuur } from "./mail.js";

export const CATEGORIEEN = { garage: "Garage", accessoires: "Accessoires en ombouw", onderdelen: "Onderdelen" };
export const SOORTEN = ["bekeken", "bel", "route", "website", "mail", "meerinfo", "zoek"];
const CSS = '<link rel="stylesheet" href="/assets/vendor/leaflet/leaflet.css"><link rel="stylesheet" href="/assets/css/gids.css?v=2">';
const JS = '<script src="/assets/vendor/leaflet/leaflet.js" defer></script><script src="/assets/js/gids.js?v=2" defer></script>';
const vandaag = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
const maand = () => vandaag().slice(0, 7);
const nu = () => new Date().toISOString();
const tekst = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const lees = (r) => { try { return JSON.parse(r.data); } catch { return {}; } };
const beheerders = (env) => (env.BEHEER_EMAILS || "pieter@roverandco.be").split(",").map((x) => x.trim()).filter(Boolean);
const isBot = (request) => /bot|crawl|spider|slurp|preview|facebookexternalhit|monitor/i.test(request.headers.get("user-agent") || "");

/* ---------------- gegevens ---------------- */

export function vanRij(x) {
  const d = lees(x);
  return { ...d, slug: x.slug, naam: x.naam, lat: x.lat, lon: x.lon, zichtbaar: !!x.zichtbaar, volgorde: x.volgorde, eigenaar_lid_id: x.eigenaar_lid_id || null, bijgewerkt: x.bijgewerkt };
}
export const isSponsor = (z, dag = vandaag()) => !!(z.sponsor?.van && z.sponsor?.tot && z.sponsor.van <= dag && dag <= z.sponsor.tot);

export async function zaken(env, { ookVerborgen = false } = {}) {
  const r = (await env.SHOP_DB.prepare(`SELECT * FROM gids_zaken ${ookVerborgen ? "" : "WHERE zichtbaar = 1"} ORDER BY volgorde, naam`).all()).results || [];
  return r.map(vanRij);
}
export async function zaak(env, slug) {
  const x = await env.SHOP_DB.prepare("SELECT * FROM gids_zaken WHERE slug = ?").bind(slug).first();
  return x ? vanRij(x) : null;
}
// Sponsors eerst (onderling willekeurig), daarna de rest op naam.
const volgorde = (lijst) => {
  const sp = lijst.filter((z) => isSponsor(z)).sort(() => Math.random() - 0.5);
  const rest = lijst.filter((z) => !isSponsor(z)).sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  return [...sp, ...rest];
};

export async function tel(env, slug, soort) {
  if (!SOORTEN.includes(soort)) return;
  await env.SHOP_DB.prepare("INSERT INTO gids_kliks (slug, soort, maand, aantal) VALUES (?, ?, ?, 1) ON CONFLICT(slug, soort, maand) DO UPDATE SET aantal = aantal + 1")
    .bind(slug, soort, maand()).run().catch(() => {});
}

/* ---------------- stukjes ---------------- */

const telLink = (t) => "tel:" + String(t).replace(/[^\d+]/g, "");
const googleRoute = (z) => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent([z.adres, z.postcode, z.gemeente.replace(/\s*\(.*\)/, ""), z.land === "NL" ? "Nederland" : "België"].filter(Boolean).join(", "));
const domein = (u) => String(u || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
const catLabels = (z) => (z.categorieen || []).map((c) => `<span class="gd-cat gd-cat-${e(c)}">${e(CATEGORIEEN[c] || c)}</span>`).join("");
const plaats = (z) => `${e(z.gemeente)}${z.provincie ? " · " + e(z.provincie) : ""}${z.land === "NL" ? " (NL)" : ""}`;

const mediaOk = (u) => (/^\/media\/\d{1,10}$/.test(u || "") ? u : "");
export const ENKELE_FOTO = { logo: "Logo", omslag: "Omslagfoto" };
// Zolang een zaak geen eigen logo of omslagfoto heeft: initialen als logo en een willekeurige foto van de site als omslag.
const omslagVan = (z) => mediaOk(z.omslag) || null;
const initialen = (naam) => (String(naam).replace(/\(.*?\)/g, "").match(/[A-Za-z0-9À-ÿ&]+/g) || ["?"]).filter((w) => !/^(de|het|van|der|en|the|bv|b\.v\.|nv|bvba)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
const logoHtml = (z, klas) => mediaOk(z.logo) ? `<img class="${klas}" src="${e(z.logo)}" alt="Logo ${e(z.naam)}" loading="lazy">` : `<span class="${klas} gd-logo-dummy" aria-hidden="true">${e(initialen(z.naam))}</span>`;

function kaartItem(z) {
  const sp = isSponsor(z);
  return `<li class="gd-item${sp ? " gd-sponsor" : ""} met-logo" data-slug="${e(z.slug)}" data-lat="${z.lat ?? ""}" data-lon="${z.lon ?? ""}" data-cat="${e((z.categorieen || []).join(" "))}" data-regio="${e(z.provincie || "")}" data-land="${e(z.land || "")}">
  ${logoHtml(z, "gd-logo-klein")}<a class="gd-titel" href="/gids/${e(z.slug)}" data-klik="meerinfo">${e(z.naam)}</a>${sp ? '<span class="gd-label">Gesponsord</span>' : ""}<span class="gd-afstand" hidden></span>
  <div class="gd-plaats">${plaats(z)}</div><div class="gd-cats">${catLabels(z)}</div>
  <div class="gd-acties">${z.telefoon ? `<a href="${e(telLink(z.telefoon))}" data-klik="bel">${ico("telefoon")}Bel</a>` : ""}${z.website ? `<a href="${e(z.website)}" target="_blank" rel="noopener" data-klik="website">${ico("wereld")}Website</a>` : ""}<a href="${e(googleRoute(z))}" target="_blank" rel="noopener" data-klik="route">${ico("route")}Route</a><a href="/gids/${e(z.slug)}" data-klik="meerinfo">Meer info</a></div></li>`;
}

/* ---------------- /gids ---------------- */

async function overzicht(env, request) {
  const lijst = volgorde(await zaken(env));
  if (!isBot(request)) await tel(env, "_gids", "bekeken");
  const regios = [...new Set(lijst.filter((z) => z.land === "BE").map((z) => z.provincie).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nl"));
  const punten = lijst.filter((z) => z.lat != null).map((z) => ({ s: z.slug, n: z.naam, la: z.lat, lo: z.lon, g: z.gemeente, sp: isSponsor(z) ? 1 : 0 }));
  const chips = (naam, opties) => `<div class="gd-chips" role="group" aria-label="${e(naam)}">${opties.map(([w, t], i) => `<button type="button" class="gd-chip" data-${naam}="${e(w)}" aria-pressed="${i === 0}">${e(t)}</button>`).join("")}</div>`;
  return pagina(env, request, {
    titel: "Gids: Land Rover-garages, accessoires en onderdelen", pad: "/gids",
    desc: "Onafhankelijke Land Rover-garages, accessoirezaken en onderdelenhandels in België en Nederland. Vul je postcode in en zie wie het dichtst bij is.",
    inhoud: CSS + banner("Gids", "Land Rover-adressen", "Onafhankelijke garages, accessoires en onderdelen in België en Nederland. Vul je postcode in en zie wie het dichtst bij is.", [["Gids"]])
      + `<section class="wrap gd-sec">
  <form class="gd-zoek" id="gd-zoek" autocomplete="off"><label for="gd-pc">Jouw postcode</label>
    <div class="gd-zoekrij"><input id="gd-pc" name="pc" inputmode="numeric" placeholder="3945 of 5071 EA" maxlength="7"><select id="gd-land" aria-label="Land"><option value="BE">België</option><option value="NL">Nederland</option></select><button class="btn btn-solid" type="submit">Zoek dichtstbij</button></div>
    <p class="gd-fout" id="gd-fout" hidden></p></form>
  ${chips("cat", [["", "Alles"], ["garage", "Garages"], ["accessoires", "Accessoires en ombouw"], ["onderdelen", "Onderdelen"]])}
  ${chips("regio", [["", "Alle regio's"], ...regios.map((r) => [r, r]), ["NL", "Nederland"]])}
  <div class="gd-indeling"><div class="gd-kaart" id="gd-kaart" aria-label="Kaart met alle adressen"></div>
  <ol class="gd-lijst" id="gd-lijst">${lijst.map(kaartItem).join("")}</ol></div>
  <p class="gd-leeg" id="gd-leeg" hidden>Geen adressen voor deze keuze.</p>
  <div class="gd-voet"><p><b>Mist er een adres?</b> Stel het voor, dan zetten we het erbij na een korte controle.</p><a class="btn" href="/gids/voorstellen">Stel een zaak voor</a></div>
  <p class="gd-klein">Afstanden zijn hemelsbreed vanaf het midden van je postcode. Gesponsorde adressen staan bovenaan. Kaart © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-bijdragers.</p>
</section><script type="application/json" id="gd-punten">${JSON.stringify(punten).replace(/</g, "\\u003c")}</script>` + JS,
  });
}

/* ---------------- /gids/<slug> ---------------- */

async function topicsOver(env, z) {
  const termen = [...new Set([z.naam.replace(/\s*\(.*\)\s*/g, "").trim(), ...(z.zoektermen || [])].filter((t) => t && t.length >= 4))].slice(0, 4);
  if (!termen.length) return [];
  const w = termen.map(() => "(t.titel LIKE ? OR b.tekst LIKE ?)").join(" OR ");
  const args = termen.flatMap((t) => [`%${t}%`, `%${t}%`]);
  try {
    return (await env.SHOP_DB.prepare(`SELECT DISTINCT t.id, t.titel, t.laatste_op FROM forum_topics t JOIN forum_berichten b ON b.topic_id = t.id
      WHERE t.verwijderd = 0 AND b.verwijderd = 0 AND (${w}) ORDER BY t.laatste_op DESC LIMIT 5`).bind(...args).all()).results || [];
  } catch { return []; }
}
const topicSlug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

async function detail(env, request, url, slug) {
  const z = await zaak(env, slug);
  if (!z || !z.zichtbaar) return null;
  if (!isBot(request)) await tel(env, slug, "bekeken");
  const [lid, ervaringen, topics] = await Promise.all([
    huidigLid(request, env).catch(() => null),
    env.SHOP_DB.prepare(`SELECT g.id, g.tekst, g.aangemaakt, g.lid_id, l.gebruikersnaam FROM gids_ervaringen g JOIN leden l ON l.id = g.lid_id
      WHERE g.slug = ? AND g.verborgen = 0 AND l.verwijderd_op IS NULL AND COALESCE(l.geblokkeerd, 0) = 0 ORDER BY g.aangemaakt DESC LIMIT 50`).bind(slug).all().then((r) => r.results || []).catch(() => []),
    topicsOver(env, z),
  ]);
  const eigen = lid ? ervaringen.find((x) => x.lid_id === lid.id) : null;
  const eigenaar = lid && z.eigenaar_lid_id === lid.id;
  const m = url.searchParams;
  const melding = m.has("claim") ? '<div class="melding melding-ok">Bedankt. We bekijken je aanvraag en laten je iets weten via mail.</div>'
    : m.has("ervaring") ? '<div class="melding melding-ok">Bedankt voor je ervaring.</div>'
    : m.has("bewaard") ? '<div class="melding melding-ok">Je pagina is bijgewerkt.</div>' : "";
  const rij = (ic, label, html) => html ? `<div class="gd-info-rij">${ico(ic)}<div><small>${label}</small>${html}</div></div>` : "";
  const adres = [z.adres, [z.postcode, z.gemeente.replace(/\s*\(.*\)/, "")].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const fotos = (z.fotos || []).filter((f) => /^\/(media|assets)\//.test(f)).slice(0, 6);
  const ld = { "@context": "https://schema.org", "@type": (z.categorieen || []).includes("garage") ? "AutoRepair" : "AutoPartsStore", name: z.naam, url: `https://roverandco.be/gids/${z.slug}`,
    ...(z.telefoon ? { telephone: z.telefoon } : {}), ...(z.website ? { sameAs: z.website } : {}),
    address: { "@type": "PostalAddress", ...(z.adres ? { streetAddress: z.adres } : {}), ...(z.postcode ? { postalCode: z.postcode } : {}), addressLocality: z.gemeente.replace(/\s*\(.*\)/, ""), addressCountry: z.land },
    ...(z.lat != null && z.locatie_bron !== "postcode" ? { geo: { "@type": "GeoCoordinates", latitude: z.lat, longitude: z.lon } } : {}) };
  const ervaringForm = !lid ? `<p class="gd-klein"><a href="/account/inloggen?terug=${encodeURIComponent("/gids/" + slug + "#ervaringen")}">Log in</a> om je ervaring te delen.</p>`
    : !lid.gebruikersnaam ? `<p class="gd-klein">Kies eerst een gebruikersnaam in <a href="/account/gegevens">je account</a> om je ervaring te delen.</p>`
    : `<form method="post" action="/gids/${e(slug)}/ervaring" class="gd-form"><label for="erv">${eigen ? "Pas je ervaring aan" : "Jouw ervaring met " + e(z.naam)}</label>
      <textarea id="erv" name="tekst" rows="3" maxlength="1000" required placeholder="Wat liet je doen, hoe was het?">${e(eigen?.tekst || "")}</textarea>
      <button class="btn btn-solid" type="submit">${eigen ? "Bewaren" : "Delen"}</button>${eigen ? ' <button class="linkknop" name="weg" value="1" type="submit">Verwijderen</button>' : ""}</form>`;
  return pagina(env, request, {
    titel: `${z.naam}, ${z.gemeente.replace(/\s*\(.*\)/, "")}`, pad: `/gids/${slug}`,
    desc: `${z.naam} in ${z.gemeente}: ${(z.categorieen || []).map((c) => CATEGORIEEN[c]).join(", ").toLowerCase()} voor Land Rover. ${z.omschrijving || ""}`.slice(0, 300),
    inhoud: CSS + banner("Gids", z.naam, `${z.gemeente}${z.provincie ? " · " + z.provincie : ""}${z.land === "NL" ? " · Nederland" : ""}`, [["Gids", "/gids"], [z.naam]], omslagVan(z))
      + `<section class="wrap gd-sec gd-detail" data-slug="${e(slug)}">
  <div class="gd-detail-kop">${logoHtml(z, "gd-logo")}${melding}<div class="gd-cats">${catLabels(z)}${isSponsor(z) ? '<span class="gd-label">Gesponsord</span>' : ""}</div>
  ${z.omschrijving ? `<p class="gd-oms">${e(z.omschrijving)}</p>` : ""}
  <div class="gd-knoppen">${z.telefoon ? `<a class="btn btn-solid" href="${e(telLink(z.telefoon))}" data-klik="bel">${ico("telefoon")} Bel</a>` : ""}<a class="btn" href="${e(googleRoute(z))}" target="_blank" rel="noopener" data-klik="route">${ico("route")} Route</a>${z.website ? `<a class="btn" href="${e(z.website)}" target="_blank" rel="noopener" data-klik="website">${ico("wereld")} Website</a>` : ""}${z.email ? `<a class="btn" href="mailto:${e(z.email)}" data-klik="mail">${ico("mail")} Mail</a>` : ""}</div></div>
  <div class="gd-detail-grid"><div class="gd-info">
    ${rij("pin", "Adres", adres ? `<a href="${e(googleRoute(z))}" target="_blank" rel="noopener" data-klik="route">${e(adres)}</a>` : "")}
    ${rij("telefoon", "Telefoon", z.telefoon ? `<a href="${e(telLink(z.telefoon))}" data-klik="bel">${e(z.telefoon)}</a>` : "")}
    ${rij("mail", "Mail", z.email ? `<a href="mailto:${e(z.email)}" data-klik="mail">${e(z.email)}</a>` : "")}
    ${rij("wereld", "Website", z.website ? `<a href="${e(z.website)}" target="_blank" rel="noopener" data-klik="website">${e(domein(z.website))}</a>` : "")}
    ${rij("klok", "Openingsuren", z.openingsuren ? e(z.openingsuren) : "")}
  </div><div class="gd-minikaart" id="gd-minikaart" data-lat="${z.lat ?? ""}" data-lon="${z.lon ?? ""}" data-naam="${e(z.naam)}" data-benadering="${z.locatie_bron === "postcode" ? 1 : 0}"></div></div>
  ${fotos.length ? `<div class="gd-fotos">${fotos.map((f) => `<a href="${e(f)}" target="_blank" rel="noopener"><img src="${e(f)}" alt="${e(z.naam)}" loading="lazy"></a>`).join("")}</div>` : ""}
  <h2 class="gd-h2" id="ervaringen">Ervaringen van leden</h2>
  ${ervaringen.length ? `<ul class="gd-ervaringen">${ervaringen.map((x) => `<li><p>${e(x.tekst)}</p><small>${e(x.gebruikersnaam || "lid")} · ${e(new Date(x.aangemaakt).toLocaleDateString("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", year: "numeric" }))}</small></li>`).join("")}</ul>` : '<p class="gd-klein">Nog geen ervaringen. Was je hier al? Deel het met de andere leden.</p>'}
  ${ervaringForm}
  ${topics.length ? `<h2 class="gd-h2">Op het Kampvuur</h2><ul class="gd-topics">${topics.map((t) => `<li><a href="/forum/t/${t.id}-${topicSlug(t.titel)}">${e(t.titel)}</a></li>`).join("")}</ul>` : ""}
  <div class="gd-claim">${eigenaar ? `<p>Dit is jouw zaak. <a class="btn" href="/account/zaak/${e(slug)}">Pagina aanpassen</a></p>`
    : `<details><summary>Is dit jouw zaak?</summary>${claimForm(z, lid)}</details>`}</div>
  <p class="gd-klein"><a href="/gids">← Terug naar de gids</a>${z.locatie_bron === "postcode" ? " · Het punt op de kaart is het midden van de postcode." : ""} Klopt er iets niet? Mail <a href="mailto:info@roverandco.be">info@roverandco.be</a>.</p>
</section><script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` + JS,
  });
}

function claimForm(z, lid) {
  if (!lid) return `<p>Beheer je deze zaak? Dan kan je deze pagina zelf aanpassen: omschrijving, foto's, openingsuren en contactgegevens. Het is gratis.</p>
    <p><a class="btn btn-solid" href="/account/inloggen?terug=${encodeURIComponent("/gids/" + z.slug + "#claim")}">Log in om je zaak te claimen</a> <a class="btn" href="/account/registreren">Gratis account maken</a></p>`;
  return `<form method="post" action="/gids/${e(z.slug)}/claim" class="gd-form" id="claim"><p>Beheer je deze zaak? Na onze controle kan je deze pagina zelf aanpassen: omschrijving, foto's, openingsuren en contactgegevens. Het is gratis.</p>
    <label>Je naam<input name="naam" required maxlength="120" value="${e(lid.naam || "")}"></label>
    <label>Je rol in de zaak<input name="rol" required maxlength="80" placeholder="Zaakvoerder, medewerker …"></label>
    <label>Telefoon (zodat we kunnen nakijken)<input name="telefoon" required maxlength="40" value="${e(lid.telefoon || "")}"></label>
    <label>Bericht (niet verplicht)<textarea name="bericht" rows="2" maxlength="600"></textarea></label>
    <button class="btn btn-solid" type="submit">Claim aanvragen</button><small>We controleren elke aanvraag, bijvoorbeeld via het nummer of het mailadres van de zaak.</small></form>`;
}

/* ---------------- acties van leden ---------------- */

async function meldBeheer(env, onderwerp, regels, link) {
  for (const aan of beheerders(env)) await verstuur(env, { aan, onderwerp, tekst: `${regels.join("\n")}\n\nBekijk: ${link}`, sleutel: `gids-${onderwerp}-${Date.now()}-${aan}` }).catch(() => {});
}

async function claim(request, env, url, slug) {
  const z = await zaak(env, slug);
  if (!z) return null;
  const lid = await huidigLid(request, env);
  if (!lid) return naar(`/account/inloggen?terug=${encodeURIComponent("/gids/" + slug)}`);
  const f = await request.formData();
  const d = { naam: tekst(f.get("naam"), 120), rol: tekst(f.get("rol"), 80), telefoon: tekst(f.get("telefoon"), 40), bericht: tekst(f.get("bericht"), 600), email: lid.email };
  if (d.naam.length < 2 || d.telefoon.replace(/\D/g, "").length < 8) return naar(`/gids/${slug}#claim`);
  const open = await env.SHOP_DB.prepare("SELECT id FROM gids_aanvragen WHERE soort = 'claim' AND slug = ? AND lid_id = ? AND status = 'open'").bind(slug, lid.id).first();
  if (!open) {
    await env.SHOP_DB.prepare("INSERT INTO gids_aanvragen (soort, slug, lid_id, data, status, aangemaakt) VALUES ('claim', ?, ?, ?, 'open', ?)").bind(slug, lid.id, JSON.stringify(d), nu()).run();
    await meldBeheer(env, `Gids: claim voor ${z.naam}`, [`${d.naam} (${d.rol}) vraagt de pagina van ${z.naam} aan.`, `Account: ${lid.email}`, `Telefoon: ${d.telefoon}`, d.bericht ? `Bericht: ${d.bericht}` : ""].filter(Boolean), `${url.origin}/beheer/gids/aanvragen`);
  }
  return naar(`/gids/${slug}?claim=1`);
}

async function ervaring(request, env, url, slug) {
  const z = await zaak(env, slug);
  if (!z || !z.zichtbaar) return null;
  const lid = await huidigLid(request, env);
  if (!lid) return naar(`/account/inloggen?terug=${encodeURIComponent("/gids/" + slug + "#ervaringen")}`);
  if (!lid.gebruikersnaam) return naar("/account/gegevens");
  const f = await request.formData();
  if (f.get("weg")) {
    await env.SHOP_DB.prepare("DELETE FROM gids_ervaringen WHERE slug = ? AND lid_id = ?").bind(slug, lid.id).run();
    return naar(`/gids/${slug}#ervaringen`);
  }
  const t = tekst(f.get("tekst"), 1000);
  if (t.length < 3) return naar(`/gids/${slug}#ervaringen`);
  await env.SHOP_DB.prepare(`INSERT INTO gids_ervaringen (slug, lid_id, tekst, aangemaakt) VALUES (?, ?, ?, ?)
    ON CONFLICT(slug, lid_id) DO UPDATE SET tekst = excluded.tekst, bewerkt_op = excluded.aangemaakt`).bind(slug, lid.id, t, nu()).run();
  await env.SHOP_DB.prepare("INSERT INTO lid_log (lid_id, soort, tekst, link, aangemaakt) VALUES (?, 'gids', ?, ?, ?)").bind(lid.id, `Ervaring bij ${z.naam}`, `/gids/${slug}`, nu()).run().catch(() => {});
  return naar(`/gids/${slug}?ervaring=1#ervaringen`);
}

async function voorstellen(request, env, url) {
  const lid = await huidigLid(request, env).catch(() => null);
  if (request.method === "POST") {
    if (!lid) return naar("/account/inloggen?terug=/gids/voorstellen");
    const f = await request.formData();
    const d = { naam: tekst(f.get("naam"), 120), gemeente: tekst(f.get("gemeente"), 80), website: tekst(f.get("website"), 200), categorie: tekst(f.get("categorie"), 20), waarom: tekst(f.get("waarom"), 800), email: lid.email };
    if (d.naam.length < 2 || d.gemeente.length < 2) return naar("/gids/voorstellen?fout=1");
    await env.SHOP_DB.prepare("INSERT INTO gids_aanvragen (soort, slug, lid_id, data, status, aangemaakt) VALUES ('voorstel', NULL, ?, ?, 'open', ?)").bind(lid.id, JSON.stringify(d), nu()).run();
    await meldBeheer(env, `Gids: voorstel ${d.naam}`, [`${lid.gebruikersnaam || lid.email} stelt ${d.naam} (${d.gemeente}) voor.`, d.website ? `Website: ${d.website}` : "", d.waarom ? `Waarom: ${d.waarom}` : ""].filter(Boolean), `${url.origin}/beheer/gids/aanvragen`);
    return naar("/gids/voorstellen?ok=1");
  }
  const ok = url.searchParams.has("ok");
  return pagina(env, request, {
    titel: "Stel een zaak voor", pad: "/gids/voorstellen", noindex: true,
    inhoud: CSS + banner("Gids", "Stel een zaak voor", "Ken je een goede garage, accessoirezaak of onderdelenhandel voor Land Rovers die nog niet in de gids staat?", [["Gids", "/gids"], ["Voorstellen"]])
      + `<section class="wrap gd-sec gd-smal">${ok ? '<div class="melding melding-ok">Bedankt! We kijken het na en zetten de zaak erbij.</div>' : ""}
  ${!lid ? `<p>Log in met je Rover & Co-account om een zaak voor te stellen.</p><p><a class="btn btn-solid" href="/account/inloggen?terug=/gids/voorstellen">Inloggen</a> <a class="btn" href="/account/registreren">Gratis account maken</a></p>`
    : `<form method="post" class="gd-form"><label>Naam van de zaak<input name="naam" required maxlength="120"></label><label>Gemeente<input name="gemeente" required maxlength="80"></label>
    <label>Website of Facebook (niet verplicht)<input name="website" maxlength="200" inputmode="url"></label>
    <label>Soort<select name="categorie"><option value="garage">Garage</option><option value="accessoires">Accessoires en ombouw</option><option value="onderdelen">Onderdelen</option></select></label>
    <label>Waarom raad je ze aan? (niet verplicht)<textarea name="waarom" rows="3" maxlength="800"></textarea></label><button class="btn btn-solid" type="submit">Voorstellen</button></form>`}
  <p class="gd-klein"><a href="/gids">← Terug naar de gids</a></p></section>`,
  });
}

/* ---------------- /account/zaak: de eigenaar past zijn pagina aan ---------------- */

async function mijnZaken(env, lid) {
  return ((await env.SHOP_DB.prepare("SELECT * FROM gids_zaken WHERE eigenaar_lid_id = ? ORDER BY naam").bind(lid.id).all()).results || []).map(vanRij);
}
export async function aantalEigenZaken(env, lidId) {
  try { return (await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM gids_zaken WHERE eigenaar_lid_id = ?").bind(lidId).first())?.n || 0; } catch { return 0; }
}

// Adres opzoeken bij OpenStreetMap (Nominatim, max 1 per seconde; enkel vanuit beheer of bij een adreswijziging).
export async function zoekLocatie(z) {
  const q = [z.adres, z.postcode, z.gemeente.replace(/\s*\(.*\)/, ""), z.land === "NL" ? "Nederland" : "België"].filter(Boolean).join(", ");
  if (!z.adres) return null;
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=" + (z.land === "NL" ? "nl" : "be") + "&q=" + encodeURIComponent(q),
      { headers: { "user-agent": "roverandco.be gids (info@roverandco.be)", "accept-language": "nl" } });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.[0] ? { lat: Math.round(+d[0].lat * 1e6) / 1e6, lon: Math.round(+d[0].lon * 1e6) / 1e6 } : null;
  } catch { return null; }
}

async function zaakBewerken(request, env, url, lid, slug) {
  const z = await zaak(env, slug);
  if (!z || z.eigenaar_lid_id !== lid.id) return naar("/account/zaak");
  if (request.method === "POST") {
    const f = await request.formData();
    const oudAdres = [z.adres, z.postcode, z.gemeente].join("|");
    const web = tekst(f.get("website"), 200);
    const nieuw = { ...z,
      omschrijving: tekst(f.get("omschrijving"), 1200), telefoon: tekst(f.get("telefoon"), 40), email: tekst(f.get("email"), 160),
      website: web && !/^https?:\/\//.test(web) ? "https://" + web : web, openingsuren: tekst(f.get("openingsuren"), 300),
      adres: tekst(f.get("adres"), 160), postcode: tekst(f.get("postcode"), 10), gemeente: tekst(f.get("gemeente"), 80) || z.gemeente,
      fotos: (() => { try { return JSON.parse(f.get("fotos") || "[]").filter((x) => /^\/media\/\d{1,10}$/.test(x)).slice(0, 6); } catch { return z.fotos || []; } })(),
      logo: mediaOk(tekst(f.get("logo"), 20)), omslag: mediaOk(tekst(f.get("omslag"), 20)) };
    let { lat, lon } = z;
    if ([nieuw.adres, nieuw.postcode, nieuw.gemeente].join("|") !== oudAdres) {
      const loc = await zoekLocatie(nieuw);
      if (loc) { lat = loc.lat; lon = loc.lon; nieuw.locatie_bron = "adres"; }
    }
    const data = { ...nieuw }; for (const k of ["slug", "naam", "lat", "lon", "zichtbaar", "volgorde", "eigenaar_lid_id", "bijgewerkt"]) delete data[k];
    await env.SHOP_DB.prepare("UPDATE gids_zaken SET data = ?, lat = ?, lon = ?, bijgewerkt = ? WHERE slug = ?").bind(JSON.stringify(data), lat, lon, nu(), slug).run();
    await env.SHOP_DB.prepare("INSERT INTO lid_log (lid_id, soort, tekst, link, aangemaakt) VALUES (?, 'gids', ?, ?, ?)").bind(lid.id, `Pagina ${z.naam} aangepast`, `/gids/${slug}`, nu()).run().catch(() => {});
    return naar(`/gids/${slug}?bewaard=1`);
  }
  const v = (k, label, extra = "") => `<label>${label}<input name="${k}" value="${e(z[k] || "")}" ${extra}></label>`;
  return pagina(env, request, {
    titel: `${z.naam} aanpassen`, pad: "/account", noindex: true,
    inhoud: CSS + banner("Mijn account", z.naam, "Pas de pagina van je zaak in de gids aan. Wat je bewaart, staat meteen online.", [["Mijn account", "/account"], ["Mijn zaak", "/account/zaak"], [z.naam]])
      + `<section class="wrap gd-sec gd-smal"><form method="post" class="gd-form" data-zaakform>
  <label>Omschrijving<textarea name="omschrijving" rows="5" maxlength="1200">${e(z.omschrijving || "")}</textarea><small>Wat doen jullie voor Land Rover-rijders? Kort en concreet.</small></label>
  ${v("telefoon", "Telefoon", 'maxlength="40"')}${v("email", "Mail", 'type="email" maxlength="160"')}${v("website", "Website", 'maxlength="200"')}
  <label>Openingsuren<textarea name="openingsuren" rows="2" maxlength="300">${e(z.openingsuren || "")}</textarea></label>
  ${v("adres", "Straat en nummer", 'maxlength="160"')}<div class="gd-twee">${v("postcode", "Postcode", 'maxlength="10"')}${v("gemeente", "Gemeente", 'maxlength="80"')}</div>
  ${enkeleFoto("logo", z.logo, "/account/zaak/foto", "Vierkant of liggend, liefst met een witte of doorzichtige achtergrond. Staat naast je naam op je pagina en in de lijst.")}
  ${enkeleFoto("omslag", z.omslag, "/account/zaak/foto", "Een brede foto van je zaak of werkplaats (liggend). Komt bovenaan je pagina, achter je naam.")}
  <div class="gd-fotoveld"><b>Foto's (max. 6)</b><div class="gd-fotolijst" data-fotolijst></div><input type="hidden" name="fotos" value="${e(JSON.stringify((z.fotos || []).filter((f) => /^\/media\/\d+$/.test(f))))}">
  <label class="btn">+ Foto toevoegen<input type="file" accept="image/*" multiple hidden data-fotokies></label><small>Foto's worden in je browser verkleind voor ze worden opgeladen.</small></div>
  <div class="gd-knoppen"><button class="btn btn-solid" type="submit">Bewaren</button><a class="btn" href="/gids/${e(slug)}">Bekijk je pagina</a></div></form></section>` + JS,
  });
}

// Eén foto (logo of omslagfoto) met voorbeeld, opladen en weghalen. Ook gebruikt in /beheer/gids (met een ander opladen-adres).
export function enkeleFoto(soort, waarde, opladen, hulp) {
  const u = mediaOk(waarde);
  return `<div class="gd-fotoveld gd-enkel" data-enkel="${soort}" data-opladen="${e(opladen)}"><b>${ENKELE_FOTO[soort]}</b>
  <div class="gd-enkel-voorbeeld gd-enkel-${soort}">${u ? `<img src="${e(u)}" alt="">` : "<span>Nog geen " + ENKELE_FOTO[soort].toLowerCase() + "</span>"}</div>
  <input type="hidden" name="${soort}" value="${e(u)}">
  <div class="gd-enkel-knoppen"><label class="btn knop klein">${u ? "Vervangen" : "Kiezen"}<input type="file" accept="image/*" hidden data-enkelkies></label><button type="button" class="linkknop" data-enkelweg${u ? "" : " hidden"}>Weghalen</button></div>
  <small>${hulp}</small></div>`;
}

async function zaakFoto(request, env, lid) {
  if (!(await aantalEigenZaken(env, lid.id))) return json({ ok: false }, 403);
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!["image/jpeg", "image/webp", "image/png"].includes(type)) return json({ ok: false, fout: "Alleen foto's (JPG, PNG of WebP)." }, 415);
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > 1_900_000) return json({ ok: false, fout: "Deze foto is te groot." }, 413);
  const r = await env.SHOP_DB.prepare("INSERT INTO media (type, data, grootte, naam, aangemaakt) VALUES (?, ?, ?, ?, ?)").bind(type, data, data.byteLength, `gids lid ${lid.id}`, nu()).run();
  return json({ ok: true, url: `/media/${r.meta.last_row_id}` });
}

async function account(request, env, url) {
  const lid = await huidigLid(request, env);
  if (!lid) return naar("/account/inloggen?terug=" + encodeURIComponent(url.pathname));
  if (url.pathname === "/account/zaak/foto" && request.method === "POST") return zaakFoto(request, env, lid);
  const m = url.pathname.match(/^\/account\/zaak\/([a-z0-9-]{1,80})$/);
  if (m) return zaakBewerken(request, env, url, lid, m[1]);
  const lijst = await mijnZaken(env, lid);
  if (lijst.length === 1) return naar(`/account/zaak/${lijst[0].slug}`);
  return pagina(env, request, {
    titel: "Mijn zaak", pad: "/account", noindex: true,
    inhoud: CSS + banner("Mijn account", "Mijn zaak", "De zaken in de gids die jij beheert.", [["Mijn account", "/account"], ["Mijn zaak"]])
      + `<section class="wrap gd-sec gd-smal">${lijst.length ? `<ul class="gd-topics">${lijst.map((z) => `<li><a href="/account/zaak/${e(z.slug)}">${e(z.naam)}</a> · ${e(z.gemeente)}</li>`).join("")}</ul>`
        : '<p>Je beheert nog geen zaak. Zoek je zaak in <a href="/gids">de gids</a> en klik op "Is dit jouw zaak?".</p>'}</section>`,
  });
}

/* ---------------- router ---------------- */

export async function gids(request, env, url) {
  const p = url.pathname.replace(/\/$/, "") || "/";
  if (!env.SHOP_DB) return null;
  if (!(p === "/gids" || p.startsWith("/gids/") || p === "/api/gids/klik" || p === "/account/zaak" || p.startsWith("/account/zaak/"))) return null;
  const post = request.method === "POST";
  if (post && !eigenOrigin(request, url)) return new Response("Geweigerd.", { status: 403 });
  if (p === "/api/gids/klik") {
    if (!post) return json({ ok: false }, 405);
    let d = {};
    try { d = JSON.parse(await request.text()); } catch {}
    const slug = tekst(d.s, 80);
    if (!isBot(request) && /^([a-z0-9-]{1,80}|_gids)$/.test(slug) && SOORTEN.includes(d.k) && d.k !== "bekeken") {
      if (slug === "_gids" || (await env.SHOP_DB.prepare("SELECT 1 FROM gids_zaken WHERE slug = ?").bind(slug).first())) await tel(env, slug, d.k);
    }
    return new Response(null, { status: 204 });
  }
  if (p === "/account/zaak" || p.startsWith("/account/zaak/")) return account(request, env, url);
  if (p === "/gids") return post ? null : overzicht(env, request);
  if (p === "/gids/voorstellen") return voorstellen(request, env, url);
  let m;
  if ((m = p.match(/^\/gids\/([a-z0-9-]{1,80})\/claim$/)) && post) return claim(request, env, url, m[1]);
  if ((m = p.match(/^\/gids\/([a-z0-9-]{1,80})\/ervaring$/)) && post) return ervaring(request, env, url, m[1]);
  if ((m = p.match(/^\/gids\/([a-z0-9-]{1,80})$/)) && !post) return detail(env, request, url, m[1]);
  return null;
}

// Voor de sitemap.
export async function gidsAdressen(env) {
  try { return ["/gids", ...(await zaken(env)).map((z) => `/gids/${z.slug}`)]; } catch { return []; }
}
