// Meldpagina (/melden), bewaren (/api/bewaar) en "Bewaard" in je account (/account/bewaard).
import { esc, banner, pagina, naar, eigenOrigin, mail, sha, datum } from "./sjabloon.js";
import { huidigLid } from "./leden.js";
import { log } from "./log.js";

const nu = () => new Date().toISOString();
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const slug = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const topicLink = (tid, titel, bid) => `/forum/t/${tid}-${slug(titel)}${bid ? `#b${bid}` : ""}`;

export const REDENEN = [
  ["ongepast", "Ongepast of naakt"],
  ["beledigend", "Beledigend of kwetsend"],
  ["spam", "Spam of reclame"],
  ["plek", "Staat op de verkeerde plek"],
  ["anders", "Iets anders"],
];

/* ⋯-menu: één knop, daaronder de acties. Items zijn kant-en-klare <a>/<button>/<form>. */
export const drieMenu = (items) => {
  const i = items.filter(Boolean);
  return i.length ? `<details class="drie"><summary aria-label="Meer opties"><span aria-hidden="true">⋯</span></summary><div class="drie-menu">${i.join("")}</div></details>` : "";
};
export const deelKnop = (pad, titel = "") => `<button type="button" data-deel="${esc(pad)}" data-titel="${esc(titel)}">Delen</button>`;
export const bewaarKnop = (soort, id, aan) => `<button type="button" data-bewaar="${soort}:${id}" aria-pressed="${aan ? "true" : "false"}">${aan ? "Bewaard" : "Bewaren"}</button>`;
export const meldLink = (soort, id) => `<a href="/melden?soort=${soort}&id=${id}">Melden</a>`;

export async function bewaardSet(env, lid, soort, ids) {
  if (!lid || !ids.length) return new Set();
  const r = (await env.SHOP_DB.prepare(`SELECT sleutel FROM lid_bewaard WHERE lid_id = ? AND soort = ? AND sleutel IN (${ids.map(() => "?").join(",")})`).bind(lid.id, soort, ...ids.map(String)).all()).results || [];
  return new Set(r.map((x) => +x.sleutel));
}

/* ---------------- wat wordt er gemeld? ---------------- */

async function item(env, soort, id) {
  const db = env.SHOP_DB;
  if (soort === "bericht") {
    const b = await db.prepare("SELECT b.id, b.tekst, b.lid_id, t.id tid, t.titel, l.gebruikersnaam FROM forum_berichten b JOIN forum_topics t ON t.id = b.topic_id LEFT JOIN leden l ON l.id = b.lid_id WHERE b.id = ? AND b.verwijderd = 0 AND t.verwijderd = 0").bind(id).first();
    return b && { lidId: b.lid_id, naam: b.gebruikersnaam, wat: `een bericht in "${b.titel}"`, terug: topicLink(b.tid, b.titel, b.id), voorbeeld: `<p>${esc(String(b.tekst).slice(0, 600))}</p>`, mailTekst: String(b.tekst).slice(0, 1500), kolom: "bericht_id" };
  }
  if (soort === "wagen") {
    const w = await db.prepare("SELECT w.*, l.gebruikersnaam FROM lid_wagens w JOIN leden l ON l.id = w.lid_id WHERE w.id = ? AND w.foto_id IS NOT NULL").bind(id).first();
    return w && { lidId: w.lid_id, naam: w.gebruikersnaam, wat: "een foto van een Land Rover", terug: `/forum/lid/${encodeURIComponent(w.gebruikersnaam || "")}#wagen-${w.id}`, voorbeeld: `<img src="/forum/foto/${w.foto_id}" alt="" style="max-width:280px;border-radius:10px">`, mailTekst: `Foto: /forum/foto/${w.foto_id} (${w.type})`, kolom: "wagen_id" };
  }
  if (soort === "cb") {
    const c = await db.prepare("SELECT c.*, l.gebruikersnaam FROM cb_berichten c JOIN leden l ON l.id = c.lid_id WHERE c.id = ? AND c.verwijderd = 0").bind(id).first();
    return c && { lidId: c.lid_id, naam: c.nr === 1 ? "Albert" : c.gebruikersnaam, echteNaam: c.gebruikersnaam, wat: `een bericht op CB-kanaal ${c.nr}`, terug: `/cb/${c.nr}`, alleenLeden: true,
      voorbeeld: c.audio_id ? `<audio controls preload="none" src="/cb/audio/${c.audio_id}"></audio>` : `<p>${esc(c.tekst)}</p>`, mailTekst: c.audio_id ? `(spraakbericht) /cb/audio/${c.audio_id}` : c.tekst, kolom: "cb_id" };
  }
  return null;
}

async function meldPagina(request, env, url, lid) {
  const soort = url.searchParams.get("soort"), id = parseInt(url.searchParams.get("id"), 10) || 0;
  const it = await item(env, soort, id);
  const kader = (inhoud) => pagina(env, request, { titel: "Melden", noindex: true, pad: "/melden",
    inhoud: banner("Melden", "Iets melden", "Zie je iets wat hier niet hoort? Laat het ons weten. We bekijken elke melding.", [["Melden"]], "leden-defender-spiegel-detail") + `<section class="narrow acc-sectie"><div class="acc-kaart">${inhoud}</div></section>` });
  if (!it) return kader(`<p>Dit bericht of deze foto bestaat niet meer. Misschien werd het al verwijderd.</p><p><a class="btn" href="/community">Naar het forum</a></p>`);
  if (it.alleenLeden && !lid) return naar(`/account/inloggen?terug=${encodeURIComponent(url.pathname + url.search)}`);
  if (url.searchParams.has("ok")) return kader(`<h2>Bedankt</h2><p>Je melding is doorgestuurd. We bekijken ze zo snel mogelijk.</p><p><a class="btn btn-solid" href="${esc(it.terug)}">Terug</a></p>`);
  return kader(`<h2>Je meldt ${esc(it.wat)}${it.naam ? ` van ${esc(it.naam)}` : ""}</h2>
    <div class="meld-voorbeeld">${it.voorbeeld}</div>
    <form method="post" action="/melden" class="meld-form">
      <input type="hidden" name="soort" value="${esc(soort)}"><input type="hidden" name="id" value="${id}">
      <fieldset><legend>Wat is er mis?</legend>${REDENEN.map(([k, l], i) => `<label class="keuze"><input type="radio" name="reden" value="${k}"${i === 0 ? " required" : ""}> ${l}</label>`).join("")}</fieldset>
      <div class="veld"><label for="toelichting">Toelichting <small>(optioneel)</small></label><textarea id="toelichting" name="toelichting" rows="3" maxlength="300"></textarea></div>
      <button class="btn btn-solid" type="submit">Melding versturen</button> <a class="btn" href="${esc(it.terug)}">Annuleren</a>
    </form><p class="hulp"><small>Wie het bericht schreef, ziet niet wie het meldde.</small></p>`);
}

async function meldVersturen(request, env, url, lid) {
  const f = await request.formData();
  const soort = String(f.get("soort") || ""), id = parseInt(f.get("id"), 10) || 0;
  const it = await item(env, soort, id);
  if (!it) return naar("/community");
  if (it.alleenLeden && !lid) return naar("/account/inloggen");
  const r = REDENEN.find(([k]) => k === f.get("reden"));
  const toel = String(f.get("toelichting") || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const reden = (r ? r[1] : "Iets anders") + (toel ? `: ${toel}` : "");
  const terugOk = `/melden?soort=${soort}&id=${id}&ok=1`;
  const ip = await sha("ip:" + (env.TURNSTILE_SECRET || env.RESEND_API_KEY || "") + ":" + (request.headers.get("cf-connecting-ip") || ""));
  const recent = await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM forum_meldingen WHERE (ip_hash = ? OR lid_id = ?) AND aangemaakt > ?").bind(ip, lid?.id || -1, new Date(Date.now() - 3600_000).toISOString()).first();
  if (recent.n >= 5) return naar(terugOk);
  await env.SHOP_DB.prepare(`INSERT INTO forum_meldingen (bericht_id, ${it.kolom === "bericht_id" ? "" : it.kolom + ", "}lid_id, ip_hash, reden, aangemaakt) VALUES (${it.kolom === "bericht_id" ? "?" : "0, ?"}, ?, ?, ?, ?)`)
    .bind(id, lid?.id || null, ip, reden, nu()).run();
  const aan = (env.BEHEER_EMAILS || "pieter@roverandco.be").split(",")[0].trim();
  await mail(env, {
    aan, onderwerp: `Melding: ${it.wat}`,
    tekst: `Er werd ${it.wat} gemeld.\n\nVan: ${it.echteNaam || it.naam || "?"}${it.echteNaam && it.echteNaam !== it.naam ? ` (toont als ${it.naam})` : ""}\nGemeld door: ${lid?.gebruikersnaam || "bezoeker zonder account"}\nReden: ${reden}\n\n${it.mailTekst.replace(/(^|\s)\/(forum|cb)\//g, `$1${url.origin}/$2/`)}\n\nBekijken: ${url.origin}${it.terug}\nAfhandelen: ${url.origin}/beheer/meldingen`,
  });
  if (lid) await log(env, lid.id, soort === "cb" ? "cb" : "forum", `Meldde ${it.wat} (${r ? r[1] : "iets anders"})`, it.terug);
  if (it.lidId) await log(env, it.lidId, soort === "wagen" ? "garage" : soort === "cb" ? "cb" : "forum", `Werd gemeld: ${it.wat} (${reden})`, it.terug);
  return naar(terugOk);
}

/* ---------------- bewaren ---------------- */

async function bewaar(request, env, lid) {
  if (!lid) return json({ ok: false, fout: "Log in om te bewaren." }, 401);
  let d = {}; try { d = await request.json(); } catch { /* leeg */ }
  const soort = d.soort === "wagen" ? "wagen" : d.soort === "bericht" ? "bericht" : "";
  const id = parseInt(d.id, 10) || 0;
  if (!soort || !id) return json({ ok: false }, 400);
  const had = await env.SHOP_DB.prepare("SELECT 1 FROM lid_bewaard WHERE lid_id = ? AND soort = ? AND sleutel = ?").bind(lid.id, soort, String(id)).first();
  if (had) await env.SHOP_DB.prepare("DELETE FROM lid_bewaard WHERE lid_id = ? AND soort = ? AND sleutel = ?").bind(lid.id, soort, String(id)).run();
  else await env.SHOP_DB.prepare("INSERT OR IGNORE INTO lid_bewaard (lid_id, soort, sleutel, aangemaakt) VALUES (?, ?, ?, ?)").bind(lid.id, soort, String(id), nu()).run();
  return json({ ok: true, bewaard: !had });
}

async function bewaardPagina(request, env, lid) {
  const db = env.SHOP_DB;
  const berichten = (await db.prepare(`SELECT b.id, b.tekst, b.aangemaakt, t.id tid, t.titel, l.gebruikersnaam FROM lid_bewaard s JOIN forum_berichten b ON b.id = CAST(s.sleutel AS INTEGER) JOIN forum_topics t ON t.id = b.topic_id LEFT JOIN leden l ON l.id = b.lid_id
    WHERE s.lid_id = ? AND s.soort = 'bericht' AND b.verwijderd = 0 AND t.verwijderd = 0 ORDER BY s.aangemaakt DESC LIMIT 200`).bind(lid.id).all()).results || [];
  const wagens = (await db.prepare(`SELECT w.*, l.gebruikersnaam FROM lid_bewaard s JOIN lid_wagens w ON w.id = CAST(s.sleutel AS INTEGER) JOIN leden l ON l.id = w.lid_id
    WHERE s.lid_id = ? AND s.soort = 'wagen' AND w.foto_id IS NOT NULL ORDER BY s.aangemaakt DESC LIMIT 200`).bind(lid.id).all()).results || [];
  return pagina(env, request, {
    titel: "Bewaard", noindex: true, pad: "/account/bewaard",
    inhoud: banner("Mijn account", "Bewaard", "Alles wat je via ⋯ › Bewaren opzij legde: berichten en foto's om later terug te vinden.", [["Mijn account", "/account"], ["Bewaard"]]) + `<section class="narrow acc-sectie">
      ${!berichten.length && !wagens.length ? `<div class="acc-kaart"><p>Nog niets bewaard. Tik bij een bericht of foto op ⋯ en kies <b>Bewaren</b>.</p><p><a class="btn btn-solid" href="/community">Naar het forum</a></p></div>` : ""}
      ${wagens.length ? `<div class="acc-kaart"><h2>Foto's</h2><div class="garage">${wagens.map((w) => `<figure class="wagen"><a class="wagen-foto" href="/forum/lid/${encodeURIComponent(w.gebruikersnaam)}#wagen-${w.id}"><img src="/forum/foto/${w.foto_id}" alt="" loading="lazy"></a><figcaption><b>${esc(w.naam || w.type)}</b><small>van ${esc(w.gebruikersnaam)}</small></figcaption></figure>`).join("")}</div></div>` : ""}
      ${berichten.length ? `<div class="acc-kaart"><h2>Berichten</h2><ul class="bewaard-lijst">${berichten.map((b) => `<li><a href="${topicLink(b.tid, b.titel, b.id)}"><b>${esc(b.titel)}</b></a><small>${esc(b.gebruikersnaam || "")} · ${datum(b.aangemaakt)}</small><p>${esc(String(b.tekst).replace(/\[[^\]]*\]/g, "").slice(0, 180))}</p></li>`).join("")}</ul></div>` : ""}
      <p><a href="/account">← Terug naar mijn account</a></p></section>`,
  });
}

export async function melden(request, env, url) {
  const p = url.pathname;
  if (p !== "/melden" && p !== "/api/bewaar" && p !== "/account/bewaard") return null;
  if (request.method === "POST" && !eigenOrigin(request, url)) return new Response("Geweigerd.", { status: 403 });
  const lid = await huidigLid(request, env);
  if (p === "/api/bewaar") return request.method === "POST" ? bewaar(request, env, lid) : json({ ok: false }, 405);
  if (p === "/account/bewaard") return lid ? bewaardPagina(request, env, lid) : naar("/account/inloggen?terug=/account/bewaard");
  return request.method === "POST" ? meldVersturen(request, env, url, lid) : meldPagina(request, env, url, lid);
}
