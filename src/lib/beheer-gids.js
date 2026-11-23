// /beheer/gids: de bedrijvengids beheren (alleen voor wie in /beheer mag).
// - /beheer/gids              : alle zaken, met kliks deze maand, sponsor en eigenaar
// - /beheer/gids/nieuw, /<slug>: zaak toevoegen of aanpassen (gegevens, locatie, sponsor + checklist, eigenaar)
// - /beheer/gids/aanvragen    : claims ("dit is mijn zaak") en voorstellen van leden goedkeuren of afwijzen
// - /beheer/gids/ervaringen   : ervaringen van leden verbergen of terugzetten
// - /beheer/gids/cijfers      : bezoeken en kliks per zaak en per maand (intern)
// - /beheer/gids/locaties     : adressen opzoeken bij OpenStreetMap voor zaken die nog op het midden van hun postcode staan
import { hoofdTabs } from "./beheer-leden.js";
import { pagina, esc } from "./beheer.js";
import { STIJL } from "./beheer-aanbod.js";
import { zaken, zaak, isSponsor, CATEGORIEEN, zoekLocatie, enkeleFoto } from "./gids.js";
import { verstuur } from "./mail.js";

const nu = () => new Date().toISOString();
const vandaag = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
const tekst = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const naar = (pad) => new Response(null, { status: 303, headers: { location: pad, "cache-control": "no-store" } });
const slugify = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " en ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const datumOk = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : "");
const TAKEN = [["events", "Vermeld in communicatie rond events"], ["nieuwsbrief", "In de nieuwsbrief"], ["blog", "Blogartikel (rubriek Partners)"], ["social", "Post op sociale media"]];
const SOORT_LABEL = { bekeken: "Bekeken", meerinfo: "Meer info", bel: "Bel", route: "Route", website: "Website", mail: "Mail", zoek: "Postcode gezocht" };

const subTabs = (aan, open) => `<p class="rij">${[["zaken", "Zaken", "/beheer/gids"], ["aanvragen", `Aanvragen${open ? ` (${open})` : ""}`, "/beheer/gids/aanvragen"], ["ervaringen", "Ervaringen", "/beheer/gids/ervaringen"], ["cijfers", "Cijfers", "/beheer/gids/cijfers"]]
  .map(([k, t, h]) => `<a class="knop klein${k === aan ? "" : " grijs"}" href="${h}">${t}</a>`).join("")} <a class="knop klein grijs" href="/gids" target="_blank" rel="noopener">Gids bekijken ↗</a></p>`;
const openAanvragen = async (env) => (await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM gids_aanvragen WHERE status = 'open'").first().catch(() => ({ n: 0 })))?.n || 0;

/* ---------------- lijst ---------------- */

async function lijst(env, email, url) {
  const [alle, kliks, open, eigenaars] = await Promise.all([
    zaken(env, { ookVerborgen: true }),
    env.SHOP_DB.prepare("SELECT slug, SUM(aantal) n FROM gids_kliks WHERE maand = ? AND soort != 'bekeken' GROUP BY slug").bind(vandaag().slice(0, 7)).all().then((r) => Object.fromEntries((r.results || []).map((x) => [x.slug, x.n]))),
    openAanvragen(env),
    env.SHOP_DB.prepare("SELECT g.slug, l.email, l.gebruikersnaam FROM gids_zaken g JOIN leden l ON l.id = g.eigenaar_lid_id").all().then((r) => Object.fromEntries((r.results || []).map((x) => [x.slug, x.gebruikersnaam || x.email]))),
  ]);
  const q = (url.searchParams.get("q") || "").toLowerCase().trim();
  const toon = alle.filter((z) => !q || `${z.naam} ${z.gemeente} ${z.provincie}`.toLowerCase().includes(q));
  const benaderd = alle.filter((z) => z.locatie_bron === "postcode" && z.adres).length;
  const m = url.searchParams.get("ok") ? '<div class="melding">Bewaard. De gids is meteen bijgewerkt.</div>' : url.searchParams.get("weg") ? '<div class="melding">Zaak verwijderd.</div>'
    : url.searchParams.has("loc") ? `<div class="melding">${esc(url.searchParams.get("loc"))} locatie(s) gevonden.</div>` : "";
  return pagina("Gids", `${STIJL}${hoofdTabs("g")}${subTabs("zaken", open)}${m}
  <form class="rij"><input name="q" value="${esc(q)}" placeholder="Zoek op naam of gemeente"><button>Zoeken</button>
  <a class="knop" href="/beheer/gids/nieuw">+ Nieuwe zaak</a></form>
  ${benaderd ? `<form method="post" action="/beheer/gids/locaties" class="melding" style="background:#fbefd5;color:#633806">${benaderd} zaak/zaken staan op de kaart nog op het midden van hun postcode. <button class="knop klein">Adressen opzoeken (8 per klik)</button></form>` : ""}
  <table class="lijst"><thead><tr><th>Zaak</th><th>Soort</th><th>Gemeente</th><th>Kliks deze maand</th><th>Sponsor</th><th>Eigenaar</th><th>In de gids</th></tr></thead><tbody>
  ${toon.map((z) => `<tr class="${z.zichtbaar ? "" : "uit"}"><td><a href="/beheer/gids/${esc(z.slug)}">${esc(z.naam)}</a>${z.locatie_bron === "postcode" ? "<br><small>locatie = postcode</small>" : ""}</td>
    <td><small>${(z.categorieen || []).map((c) => esc(CATEGORIEEN[c] || c)).join(", ")}</small></td><td>${esc(z.gemeente)}${z.land === "NL" ? " (NL)" : ""}</td>
    <td>${kliks[z.slug] || 0}</td><td>${isSponsor(z) ? `<b>Ja</b>, tot ${esc(z.sponsor.tot)}` : z.sponsor?.tot ? `<small>was tot ${esc(z.sponsor.tot)}</small>` : "–"}</td>
    <td><small>${esc(eigenaars[z.slug] || "–")}</small></td><td>${z.zichtbaar ? "Ja" : "Verborgen"}</td></tr>`).join("") || '<tr><td colspan="7">Geen zaken.</td></tr>'}
  </tbody></table><p><small>${alle.length} zaken, ${alle.filter((z) => z.zichtbaar).length} zichtbaar.</small></p>`, email);
}

/* ---------------- formulier ---------------- */

const veld = (naam, label, waarde = "", { type = "text", hulp = "", breed = false, extra = "" } = {}) =>
  `<div class="veld${breed ? " breed" : ""}"><label for="v-${naam}">${label}</label><input id="v-${naam}" name="${naam}" type="${type}" value="${esc(waarde ?? "")}" ${extra}>${hulp ? `<small>${hulp}</small>` : ""}</div>`;
const vink = (naam, label, aan) => `<label class="rij"><input type="checkbox" name="${naam}" value="1"${aan ? " checked" : ""}> ${label}</label>`;

async function formulier(env, z, email, melding = "") {
  const nieuw = !z.slug;
  const eig = z.eigenaar_lid_id ? await env.SHOP_DB.prepare("SELECT email, gebruikersnaam FROM leden WHERE id = ?").bind(z.eigenaar_lid_id).first().catch(() => null) : null;
  const sp = z.sponsor || {};
  return pagina(nieuw ? "Nieuwe zaak" : z.naam, `${STIJL}${hoofdTabs("g")}${subTabs("zaken", 0)}${melding}
  <p><a href="/beheer/gids">← Alle zaken</a>${nieuw ? "" : ` · <a href="/gids/${esc(z.slug)}" target="_blank" rel="noopener">Bekijken in de gids ↗</a>`}</p>
  <form method="post"><div class="kaart"><h3>Gegevens</h3><div class="form-grid">
    ${veld("naam", "Naam", z.naam, { extra: "required maxlength=120" })}
    <div class="veld"><label>Soort</label>${Object.entries(CATEGORIEEN).map(([k, t]) => vink(`cat_${k}`, t, (z.categorieen || []).includes(k))).join("")}</div>
    <div class="veld breed"><label for="v-oms">Omschrijving</label><textarea id="v-oms" name="omschrijving" rows="3" maxlength="1200">${esc(z.omschrijving || "")}</textarea></div>
    ${veld("telefoon", "Telefoon", z.telefoon)}${veld("email", "Mail", z.email, { type: "email" })}
    ${veld("website", "Website", z.website, { hulp: "Met https://" })}${veld("openingsuren", "Openingsuren", z.openingsuren)}
    ${veld("adres", "Straat en nummer", z.adres)}${veld("postcode", "Postcode", z.postcode)}
    ${veld("gemeente", "Gemeente", z.gemeente, { extra: "required", hulp: "Deelgemeente mag tussen haakjes: Hoepertingen (Borgloon)" })}
    ${veld("provincie", "Provincie", z.provincie, { hulp: "Voor de regiofilter. In Nederland: de provincie" })}
    <div class="veld"><label for="v-land">Land</label><select id="v-land" name="land"><option value="BE"${z.land !== "NL" ? " selected" : ""}>België</option><option value="NL"${z.land === "NL" ? " selected" : ""}>Nederland</option></select></div>
    ${veld("zoektermen", "Zoektermen voor het Kampvuur", (z.zoektermen || []).join(", "), { hulp: "Andere namen waaronder leden de zaak noemen, met komma's. De naam zelf zoekt altijd mee." })}
    <div class="veld breed"><link rel="stylesheet" href="/assets/css/gids.css?v=2"><div class="gd-twee-foto">${enkeleFoto("logo", z.logo, "/beheer/gids/foto", "Staat naast de naam op de pagina en in de lijst. Leeg = initialen.")}
      ${enkeleFoto("omslag", z.omslag, "/beheer/gids/foto", "Bovenaan de pagina. Leeg = een willekeurige foto van de site.")}</div><script src="/assets/js/gids.js?v=2" defer></script></div>
    <div class="veld breed"><label>Foto's</label><small>${(z.fotos || []).length} foto('s). De eigenaar laadt ze op via Mijn account › Mijn zaak.</small>${(z.fotos || []).map((f) => `<img src="${esc(f)}" alt="" style="width:80px;height:60px;object-fit:cover;border-radius:6px;margin:4px 4px 0 0">`).join("")}
      <input type="hidden" name="fotos" value="${esc(JSON.stringify(z.fotos || []))}">${(z.fotos || []).length ? vink("fotos_weg", "Alle foto's weghalen", false) : ""}</div>
  </div></div>
  <div class="kaart"><h3>Locatie op de kaart</h3><div class="form-grid">
    ${veld("lat", "Breedtegraad", z.lat ?? "", { hulp: z.locatie_bron === "postcode" ? "Nu: midden van de postcode" : "Nu: op adres" })}${veld("lon", "Lengtegraad", z.lon ?? "")}
    <div class="veld breed">${vink("locatie_zoeken", "Locatie opnieuw opzoeken op adres bij het bewaren (OpenStreetMap)", nieuw)}</div></div></div>
  <div class="kaart"><h3>Sponsor</h3><p><small>Gesponsorde zaken staan bovenaan in de gids, met het label "Gesponsord". Leeg = geen sponsor.</small></p><div class="form-grid">
    ${veld("sponsor_van", "Van", sp.van, { type: "date" })}${veld("sponsor_tot", "Tot en met", sp.tot, { type: "date" })}
    <div class="veld breed"><label>Wat hoort bij de sponsoring (vink af wat gedaan is)</label>${TAKEN.map(([k, t]) => vink(`taak_${k}`, t, sp.taken?.[k])).join("")}</div>
    ${veld("sponsor_notitie", "Notitie (intern)", sp.notitie, { breed: true, hulp: "Bv. bedrag, afspraken, contactpersoon" })}</div></div>
  <div class="kaart"><h3>Eigenaar en zichtbaarheid</h3><div class="form-grid">
    ${veld("eigenaar", "Eigenaar (mailadres van zijn account)", eig?.email || "", { hulp: eig ? `Nu: ${esc(eig.gebruikersnaam || eig.email)}. Leeg maken = niemand.` : "Meestal via een goedgekeurde claim." })}
    ${veld("volgorde", "Volgorde", z.volgorde ?? 0, { type: "number" })}
    <div class="veld breed">${vink("zichtbaar", "Zichtbaar in de gids", z.zichtbaar !== false)}</div></div></div>
  <div class="knoppen"><button type="submit">Bewaren</button><a class="knop grijs" href="/beheer/gids">Annuleren</a>
  ${nieuw ? "" : '<button type="submit" name="actie" value="verwijder" class="knop rood" onclick="return confirm(\'Deze zaak definitief verwijderen? Ervaringen en cijfers blijven bewaard.\')">Verwijderen</button>'}</div></form>`, email);
}

async function bewaar(request, env, slugOud, email) {
  const f = await request.formData();
  const oud = slugOud ? await zaak(env, slugOud) : null;
  if (slugOud && !oud) return naar("/beheer/gids");
  if (f.get("actie") === "verwijder" && oud) {
    await env.SHOP_DB.prepare("DELETE FROM gids_zaken WHERE slug = ?").bind(oud.slug).run();
    return naar("/beheer/gids?weg=1");
  }
  const g = (k, m = 300) => tekst(f.get(k), m);
  const naam = g("naam", 120);
  const web = g("website", 200);
  const z = {
    ...(oud || {}),
    naam, categorieen: Object.keys(CATEGORIEEN).filter((k) => f.get(`cat_${k}`)), omschrijving: g("omschrijving", 1200),
    telefoon: g("telefoon", 40), email: g("email", 160), website: web && !/^https?:\/\//.test(web) ? "https://" + web : web, openingsuren: g("openingsuren", 300),
    adres: g("adres", 160), postcode: g("postcode", 10), gemeente: g("gemeente", 80), provincie: g("provincie", 60), land: f.get("land") === "NL" ? "NL" : "BE",
    zoektermen: g("zoektermen", 300).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 6),
    fotos: f.get("fotos_weg") ? [] : (oud?.fotos || []),
    logo: /^\/media\/\d{1,10}$/.test(f.get("logo") || "") ? f.get("logo") : "",
    omslag: /^\/media\/\d{1,10}$/.test(f.get("omslag") || "") ? f.get("omslag") : "",
    sponsor: { van: datumOk(g("sponsor_van", 10)), tot: datumOk(g("sponsor_tot", 10)), notitie: g("sponsor_notitie", 500), taken: Object.fromEntries(TAKEN.map(([k]) => [k, !!f.get(`taak_${k}`)])) },
    locatie_bron: oud?.locatie_bron || "handmatig",
  };
  if (naam.length < 2 || z.gemeente.length < 2 || !z.categorieen.length) return formulier(env, { ...z, slug: slugOud }, email, '<div class="melding fout">Naam, gemeente en minstens één soort zijn nodig.</div>');
  let lat = parseFloat(String(f.get("lat")).replace(",", ".")), lon = parseFloat(String(f.get("lon")).replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) { lat = null; lon = null; }
  if (oud && (lat !== oud.lat || lon !== oud.lon) && lat != null) z.locatie_bron = "handmatig";
  let locFout = "";
  if (f.get("locatie_zoeken")) {
    const loc = await zoekLocatie(z);
    if (loc) { lat = loc.lat; lon = loc.lon; z.locatie_bron = "adres"; } else locFout = "Adres niet gevonden bij OpenStreetMap; de locatie bleef ongewijzigd.";
  }
  let eigenaar = null;
  const em = g("eigenaar", 160).toLowerCase();
  if (em) {
    const l = await env.SHOP_DB.prepare("SELECT id FROM leden WHERE email = ? COLLATE NOCASE AND verwijderd_op IS NULL").bind(em).first();
    if (!l) return formulier(env, { ...z, slug: slugOud, lat, lon }, email, '<div class="melding fout">Geen account gevonden met dat mailadres.</div>');
    eigenaar = l.id;
  }
  const data = { ...z }; for (const k of ["slug", "naam", "lat", "lon", "zichtbaar", "volgorde", "eigenaar_lid_id", "bijgewerkt"]) delete data[k];
  const zichtbaar = f.get("zichtbaar") ? 1 : 0, volgorde = parseInt(f.get("volgorde"), 10) || 0;
  let slug = oud?.slug;
  if (!slug) {
    slug = slugify(naam) || "zaak";
    for (let i = 2; await env.SHOP_DB.prepare("SELECT 1 FROM gids_zaken WHERE slug = ?").bind(slug).first(); i++) slug = `${slugify(naam)}-${i}`;
    await env.SHOP_DB.prepare("INSERT INTO gids_zaken (slug, naam, data, lat, lon, zichtbaar, volgorde, eigenaar_lid_id, bijgewerkt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(slug, naam, JSON.stringify(data), lat, lon, zichtbaar, volgorde, eigenaar, nu()).run();
  } else {
    await env.SHOP_DB.prepare("UPDATE gids_zaken SET naam = ?, data = ?, lat = ?, lon = ?, zichtbaar = ?, volgorde = ?, eigenaar_lid_id = ?, bijgewerkt = ? WHERE slug = ?")
      .bind(naam, JSON.stringify(data), lat, lon, zichtbaar, volgorde, eigenaar, nu(), slug).run();
  }
  await env.SHOP_DB.prepare("INSERT INTO lid_log (lid_id, soort, tekst, link, aangemaakt) VALUES (0, 'beheer', ?, ?, ?)").bind(`Gids: ${naam} bewaard door ${email}`, `/gids/${slug}`, nu()).run().catch(() => {});
  if (locFout) return formulier(env, await zaak(env, slug), email, `<div class="melding fout">Bewaard. ${locFout}</div>`);
  return naar("/beheer/gids?ok=1");
}

async function locaties(env) {
  const todo = (await zaken(env, { ookVerborgen: true })).filter((z) => z.locatie_bron === "postcode" && z.adres).slice(0, 8);
  let n = 0;
  for (const [i, z] of todo.entries()) {
    if (i) await new Promise((r) => setTimeout(r, 1100)); // OpenStreetMap: max 1 vraag per seconde
    const loc = await zoekLocatie(z);
    const data = { ...z, locatie_bron: loc ? "adres" : "postcode-gezocht" };
    for (const k of ["slug", "naam", "lat", "lon", "zichtbaar", "volgorde", "eigenaar_lid_id", "bijgewerkt"]) delete data[k];
    await env.SHOP_DB.prepare("UPDATE gids_zaken SET data = ?, lat = ?, lon = ? WHERE slug = ?").bind(JSON.stringify(data), loc ? loc.lat : z.lat, loc ? loc.lon : z.lon, z.slug).run();
    if (loc) n++;
  }
  return naar(`/beheer/gids?loc=${n}`);
}

/* ---------------- aanvragen ---------------- */

async function aanvragen(env, email, url) {
  const r = (await env.SHOP_DB.prepare(`SELECT a.*, l.email lid_email, l.gebruikersnaam, g.naam zaak_naam, g.eigenaar_lid_id FROM gids_aanvragen a
    LEFT JOIN leden l ON l.id = a.lid_id LEFT JOIN gids_zaken g ON g.slug = a.slug ORDER BY a.status = 'open' DESC, a.aangemaakt DESC LIMIT 100`).all()).results || [];
  const open = r.filter((x) => x.status === "open").length;
  const m = url.searchParams.get("ok") ? `<div class="melding">${esc(url.searchParams.get("ok"))}</div>` : "";
  const kaart = (a) => {
    const d = (() => { try { return JSON.parse(a.data); } catch { return {}; } })();
    const wie = `${esc(a.gebruikersnaam || "")} &lt;${esc(a.lid_email || "?")}&gt;`;
    const inhoud = a.soort === "claim"
      ? `<b>Claim</b> voor <a href="/beheer/gids/${esc(a.slug)}">${esc(a.zaak_naam || a.slug)}</a><br>${esc(d.naam)} (${esc(d.rol)}), tel. ${esc(d.telefoon)} · account ${wie}${d.bericht ? `<br><i>${esc(d.bericht)}</i>` : ""}${a.eigenaar_lid_id && a.eigenaar_lid_id !== a.lid_id ? '<br><b style="color:#a32d2d">Let op: deze zaak heeft al een andere eigenaar.</b>' : ""}`
      : `<b>Voorstel</b>: ${esc(d.naam)}, ${esc(d.gemeente)} (${esc(CATEGORIEEN[d.categorie] || d.categorie)})${d.website ? ` · <a href="${esc(/^https?:/.test(d.website) ? d.website : "https://" + d.website)}" target="_blank" rel="noopener">${esc(d.website)}</a>` : ""}<br>door ${wie}${d.waarom ? `<br><i>${esc(d.waarom)}</i>` : ""}`;
    const knoppen = a.status !== "open" ? `<small>${a.status === "goed" ? "Goedgekeurd" : "Afgewezen"} op ${esc(String(a.behandeld_op || "").slice(0, 10))}</small>`
      : `<form method="post" class="rij"><input type="hidden" name="id" value="${a.id}"><button name="actie" value="goed">${a.soort === "claim" ? "Goedkeuren (wordt eigenaar)" : "Toevoegen aan de gids"}</button><button class="knop grijs" name="actie" value="af">Afwijzen</button></form>`;
    return `<div class="kaart${a.status === "open" ? "" : " uit"}"><small>${esc(String(a.aangemaakt).slice(0, 16).replace("T", " "))}</small><p>${inhoud}</p>${knoppen}</div>`;
  };
  return pagina("Gids: aanvragen", `${STIJL}${hoofdTabs("g")}${subTabs("aanvragen", open)}${m}
  <p><small>Kijk een claim na voor je goedkeurt, bv. door de zaak te bellen op het nummer uit de gids of te mailen naar het adres van de zaak.</small></p>
  ${r.map(kaart).join("") || '<p class="leeg">Nog geen aanvragen.</p>'}`, email);
}

async function aanvraagActie(request, env, url, email) {
  const f = await request.formData();
  const a = await env.SHOP_DB.prepare("SELECT * FROM gids_aanvragen WHERE id = ? AND status = 'open'").bind(parseInt(f.get("id"), 10) || 0).first();
  if (!a) return naar("/beheer/gids/aanvragen");
  const d = (() => { try { return JSON.parse(a.data); } catch { return {}; } })();
  const lid = await env.SHOP_DB.prepare("SELECT id, email, gebruikersnaam FROM leden WHERE id = ?").bind(a.lid_id).first();
  const goed = f.get("actie") === "goed";
  await env.SHOP_DB.prepare("UPDATE gids_aanvragen SET status = ?, behandeld_op = ? WHERE id = ?").bind(goed ? "goed" : "af", nu(), a.id).run();
  if (a.soort === "claim") {
    const z = await zaak(env, a.slug);
    if (goed && z && lid) {
      await env.SHOP_DB.prepare("UPDATE gids_zaken SET eigenaar_lid_id = ?, bijgewerkt = ? WHERE slug = ?").bind(lid.id, nu(), a.slug).run();
      await env.SHOP_DB.prepare("INSERT INTO lid_meldingen (lid_id, tekst, link, aangemaakt) VALUES (?, ?, ?, ?)").bind(lid.id, `Je beheert nu de pagina van ${z.naam} in de gids.`, `/account/zaak/${a.slug}`, nu()).run().catch(() => {});
      await verstuur(env, { aan: lid.email, onderwerp: `Je beheert nu ${z.naam} in de gids van Rover & Co`, sleutel: `gids-claim-${a.id}`,
        tekst: `Dag ${d.naam || ""},\n\nJe aanvraag is goedgekeurd: je kan de pagina van ${z.naam} in de gids van Rover & Co nu zelf aanpassen. Vul gerust een omschrijving, openingsuren en foto's in.\n\nPagina aanpassen: ${url.origin}/account/zaak/${a.slug}\nJe pagina bekijken: ${url.origin}/gids/${a.slug}\n\nVragen? Mail naar info@roverandco.be.` }).catch(() => {});
    }
    return naar(`/beheer/gids/aanvragen?ok=${encodeURIComponent(goed ? "Claim goedgekeurd. Het lid kreeg een mail en een melding." : "Claim afgewezen.")}`);
  }
  if (goed) {
    const naam = tekst(d.naam, 120);
    let slug = slugify(naam) || "zaak";
    for (let i = 2; await env.SHOP_DB.prepare("SELECT 1 FROM gids_zaken WHERE slug = ?").bind(slug).first(); i++) slug = `${slugify(naam)}-${i}`;
    const web = tekst(d.website, 200);
    const data = { categorieen: CATEGORIEEN[d.categorie] ? [d.categorie] : ["garage"], gemeente: tekst(d.gemeente, 80), provincie: "", land: "BE", telefoon: "", email: "",
      website: web && !/^https?:\/\//.test(web) ? "https://" + web : web, adres: "", postcode: "", openingsuren: "", omschrijving: "", fotos: [], zoektermen: [], locatie_bron: "handmatig", sponsor: {} };
    await env.SHOP_DB.prepare("INSERT INTO gids_zaken (slug, naam, data, lat, lon, zichtbaar, volgorde, bijgewerkt) VALUES (?, ?, ?, NULL, NULL, 0, 999, ?)").bind(slug, naam, JSON.stringify(data), nu()).run();
    if (lid) await env.SHOP_DB.prepare("INSERT INTO lid_meldingen (lid_id, tekst, link, aangemaakt) VALUES (?, ?, ?, ?)").bind(lid.id, `Bedankt: ${naam} komt in de gids.`, "/gids", nu()).run().catch(() => {});
    return naar(`/beheer/gids/${slug}`); // verborgen tot de gegevens aangevuld en bewaard zijn
  }
  return naar(`/beheer/gids/aanvragen?ok=${encodeURIComponent("Voorstel afgewezen.")}`);
}

/* ---------------- ervaringen ---------------- */

async function ervaringen(request, env, url, email) {
  if (request.method === "POST") {
    const f = await request.formData();
    await env.SHOP_DB.prepare("UPDATE gids_ervaringen SET verborgen = ? WHERE id = ?").bind(f.get("actie") === "verberg" ? 1 : 0, parseInt(f.get("id"), 10) || 0).run();
    return naar("/beheer/gids/ervaringen");
  }
  const r = (await env.SHOP_DB.prepare(`SELECT g.*, l.gebruikersnaam, l.email, z.naam zaak_naam FROM gids_ervaringen g LEFT JOIN leden l ON l.id = g.lid_id LEFT JOIN gids_zaken z ON z.slug = g.slug ORDER BY g.aangemaakt DESC LIMIT 200`).all()).results || [];
  return pagina("Gids: ervaringen", `${STIJL}${hoofdTabs("g")}${subTabs("ervaringen", await openAanvragen(env))}
  <table class="lijst"><thead><tr><th>Zaak</th><th>Ervaring</th><th>Lid</th><th></th></tr></thead><tbody>
  ${r.map((x) => `<tr class="${x.verborgen ? "uit" : ""}"><td><a href="/gids/${esc(x.slug)}#ervaringen" target="_blank" rel="noopener">${esc(x.zaak_naam || x.slug)}</a><br><small>${esc(String(x.aangemaakt).slice(0, 10))}</small></td>
    <td>${esc(x.tekst)}</td><td><small>${esc(x.gebruikersnaam || x.email || "?")}</small></td>
    <td><form method="post"><input type="hidden" name="id" value="${x.id}"><button class="knop klein${x.verborgen ? "" : " grijs"}" name="actie" value="${x.verborgen ? "toon" : "verberg"}">${x.verborgen ? "Terugzetten" : "Verbergen"}</button></form></td></tr>`).join("") || '<tr><td colspan="4">Nog geen ervaringen.</td></tr>'}
  </tbody></table>`, email);
}

/* ---------------- cijfers ---------------- */

async function cijfers(env, email, url) {
  const maanden = ((await env.SHOP_DB.prepare("SELECT DISTINCT maand FROM gids_kliks ORDER BY maand DESC LIMIT 24").all()).results || []).map((x) => x.maand);
  const deze = vandaag().slice(0, 7);
  if (!maanden.includes(deze)) maanden.unshift(deze);
  const gekozen = maanden.includes(url.searchParams.get("maand")) || url.searchParams.get("maand") === "alles" ? url.searchParams.get("maand") : deze;
  const rijen = (await env.SHOP_DB.prepare(`SELECT slug, soort, SUM(aantal) n FROM gids_kliks ${gekozen === "alles" ? "" : "WHERE maand = ?"} GROUP BY slug, soort`).bind(...(gekozen === "alles" ? [] : [gekozen])).all()).results || [];
  const per = {};
  for (const x of rijen) (per[x.slug] ||= {})[x.soort] = x.n;
  const namen = Object.fromEntries((await zaken(env, { ookVerborgen: true })).map((z) => [z.slug, z.naam]));
  const kols = ["bekeken", "meerinfo", "bel", "route", "website", "mail"];
  const totaal = (s) => kols.slice(1).reduce((t, k) => t + (per[s]?.[k] || 0), 0);
  const slugs = Object.keys(namen).sort((a, b) => totaal(b) - totaal(a) || (per[b]?.bekeken || 0) - (per[a]?.bekeken || 0));
  const g = per._gids || {};
  return pagina("Gids: cijfers", `${STIJL}${hoofdTabs("g")}${subTabs("cijfers", await openAanvragen(env))}
  <form class="rij"><label>Periode <select name="maand" onchange="this.form.submit()">${maanden.map((m) => `<option${m === gekozen ? " selected" : ""}>${m}</option>`).join("")}<option value="alles"${gekozen === "alles" ? " selected" : ""}>Alles</option></select></label></form>
  <div class="som"><div><small>Gids bekeken</small><b>${g.bekeken || 0}</b></div><div><small>Postcode gezocht</small><b>${g.zoek || 0}</b></div><div><small>Kliks naar zaken</small><b>${slugs.reduce((t, s) => t + totaal(s), 0)}</b></div></div>
  <p><small>Intern: alleen jij ziet dit. Geteld zonder cookies of persoonsgegevens; zoekrobots tellen niet mee. "Meer info" = klik vanuit de lijst of kaart naar de pagina van de zaak.</small></p>
  <table class="lijst"><thead><tr><th>Zaak</th>${kols.map((k) => `<th>${SOORT_LABEL[k]}</th>`).join("")}<th>Kliks totaal</th></tr></thead><tbody>
  ${slugs.map((s) => `<tr><td><a href="/beheer/gids/${esc(s)}">${esc(namen[s])}</a></td>${kols.map((k) => `<td>${per[s]?.[k] || 0}</td>`).join("")}<td><b>${totaal(s)}</b></td></tr>`).join("")}
  </tbody></table>`, email);
}

async function foto(request, env, email) {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  const antw = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (!["image/jpeg", "image/webp", "image/png"].includes(type)) return antw({ ok: false, fout: "Alleen foto's (JPG, PNG of WebP)." }, 415);
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > 1_900_000) return antw({ ok: false, fout: "Deze foto is te groot." }, 413);
  const r = await env.SHOP_DB.prepare("INSERT INTO media (type, data, grootte, naam, aangemaakt) VALUES (?, ?, ?, ?, ?)").bind(type, data, data.byteLength, `gids beheer ${email}`, nu()).run();
  return antw({ ok: true, url: `/media/${r.meta.last_row_id}` });
}

/* ---------------- router ---------------- */

export async function gidsTeller(env) { return openAanvragen(env); }

export async function beheerGids(request, env, url, email) {
  const p = url.pathname.replace(/\/$/, "");
  if (p !== "/beheer/gids" && !p.startsWith("/beheer/gids/")) return null;
  const post = request.method === "POST";
  if (p === "/beheer/gids") return lijst(env, email, url);
  if (p === "/beheer/gids/locaties" && post) return locaties(env);
  if (p === "/beheer/gids/foto" && post) return foto(request, env, email);
  if (p === "/beheer/gids/aanvragen") return post ? aanvraagActie(request, env, url, email) : aanvragen(env, email, url);
  if (p === "/beheer/gids/ervaringen") return ervaringen(request, env, url, email);
  if (p === "/beheer/gids/cijfers") return cijfers(env, email, url);
  if (p === "/beheer/gids/nieuw") return post ? bewaar(request, env, null, email) : formulier(env, { zichtbaar: true, land: "BE", categorieen: ["garage"] }, email);
  const m = p.match(/^\/beheer\/gids\/([a-z0-9-]{1,80})$/);
  if (m) {
    if (post) return bewaar(request, env, m[1], email);
    const z = await zaak(env, m[1]);
    return z ? formulier(env, z, email) : naar("/beheer/gids");
  }
  return null;
}
