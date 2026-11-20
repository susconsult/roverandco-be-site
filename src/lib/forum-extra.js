// Forum: garage, likes, volgen (categorie, topic, hashtag), hashtags en meldingen (het belletje).
import { esc, ico } from "./sjabloon.js";
import { drieMenu, deelKnop, bewaarKnop, meldLink } from "./melden.js";

const nu = () => new Date().toISOString();

/* ---------------- hashtags ---------------- */

const TAG = /(^|[\s>(.,!?])#([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9_-]{1,29})/g;
export function tagsUit(tekst) {
  const s = new Set();
  for (const m of String(tekst).replace(/\[quote[\s\S]*?\[\/quote\]/gi, "").matchAll(TAG)) s.add(m[2].toLowerCase());
  return [...s].slice(0, 15);
}
// In al ge-escapete HTML: #tag -> link
export const tagLinks = (h) => h.replace(TAG, (_, voor, t) => `${voor}<a class="f-tag" href="/forum/tag/${encodeURIComponent(t.toLowerCase())}">#${t}</a>`);

export async function bewaarTags(env, berichtId, topicId, tekst) {
  await env.SHOP_DB.prepare("DELETE FROM forum_tags WHERE bericht_id = ?").bind(berichtId).run();
  const tags = tagsUit(tekst);
  if (tags.length) await env.SHOP_DB.batch(tags.map((t) => env.SHOP_DB.prepare("INSERT OR IGNORE INTO forum_tags (bericht_id, topic_id, tag) VALUES (?, ?, ?)").bind(berichtId, topicId, t)));
  return tags;
}

/* ---------------- volgen ---------------- */

export async function volgt(env, lid, soort, sleutel) {
  if (!lid) return false;
  return !!(await env.SHOP_DB.prepare("SELECT 1 FROM forum_volgen WHERE lid_id = ? AND soort = ? AND sleutel = ?").bind(lid.id, soort, String(sleutel)).first());
}
export async function zetVolgen(env, lidId, soort, sleutel, aan) {
  if (aan) await env.SHOP_DB.prepare("INSERT OR IGNORE INTO forum_volgen (lid_id, soort, sleutel, aangemaakt) VALUES (?, ?, ?, ?)").bind(lidId, soort, String(sleutel), nu()).run();
  else await env.SHOP_DB.prepare("DELETE FROM forum_volgen WHERE lid_id = ? AND soort = ? AND sleutel = ?").bind(lidId, soort, String(sleutel)).run();
}
export function volgKnop(lid, soort, sleutel, aan, terug, label) {
  if (!lid) return `<a class="btn f-volg" href="/account/inloggen?terug=${encodeURIComponent(terug)}">${ico("bel")} ${esc(label)} volgen</a>`;
  return `<form method="post" action="/forum/volg" class="f-volgform"><input type="hidden" name="soort" value="${soort}"><input type="hidden" name="sleutel" value="${esc(sleutel)}"><input type="hidden" name="aan" value="${aan ? "0" : "1"}"><input type="hidden" name="terug" value="${esc(terug)}">
    <button class="btn f-volg${aan ? " aan" : ""}" type="submit" title="${aan ? "Je krijgt een melding bij nieuwe berichten. Klik om te stoppen." : "Krijg een melding bij nieuwe berichten"}">${aan ? ico("vink") + " Je volgt " : ico("bel") + " Volg "}${esc(label)}</button></form>`;
}

/* ---------------- meldingen ---------------- */

export async function meld(env, lidIds, tekst, link) {
  const ids = [...new Set(lidIds)].filter(Boolean).slice(0, 500);
  if (!ids.length) return;
  const t = nu();
  for (let i = 0; i < ids.length; i += 50)
    await env.SHOP_DB.batch(ids.slice(i, i + 50).map((id) => env.SHOP_DB.prepare("INSERT INTO lid_meldingen (lid_id, tekst, link, aangemaakt) VALUES (?, ?, ?, ?)").bind(id, tekst.slice(0, 200), link, t)));
}

// Nieuw bericht: iedereen die het topic, de categorie of een hashtag volgt krijgt één melding (behalve de schrijver).
export async function meldNieuwBericht(env, { topic, catSlug, catNaam, auteur, tags, link, nieuwTopic }) {
  const voorw = ["(soort = 'topic' AND sleutel = ?)", "(soort = 'cat' AND sleutel = ?)"];
  const p = [String(topic.id), catSlug];
  if (tags.length) { voorw.push(`(soort = 'tag' AND sleutel IN (${tags.map(() => "?").join(",")}))`); p.push(...tags); }
  const r = (await env.SHOP_DB.prepare(`SELECT DISTINCT v.lid_id FROM forum_volgen v JOIN leden l ON l.id = v.lid_id WHERE (${voorw.join(" OR ")}) AND v.lid_id <> ? AND l.geblokkeerd = 0
    UNION SELECT t.lid_id FROM forum_topics t JOIN leden l ON l.id = t.lid_id WHERE t.id = ? AND t.lid_id <> ? AND l.geblokkeerd = 0`)
    .bind(...p, auteur.id, topic.id, auteur.id).all()).results || [];
  const tekst = nieuwTopic ? `${auteur.gebruikersnaam} startte "${topic.titel}" in ${catNaam}` : `${auteur.gebruikersnaam} reageerde in "${topic.titel}"`;
  await meld(env, r.map((x) => x.lid_id), tekst, link);
}

export async function aantalOngelezen(env, lidId) {
  return (await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM lid_meldingen WHERE lid_id = ? AND gelezen = 0").bind(lidId).first())?.n || 0;
}

/* ---------------- likes ---------------- */

export async function likes(env, lid, berichtIds) {
  if (!berichtIds.length) return { aantal: {}, mijn: new Set() };
  const q = berichtIds.map(() => "?").join(",");
  const a = (await env.SHOP_DB.prepare(`SELECT bericht_id, COUNT(*) n FROM forum_likes WHERE bericht_id IN (${q}) GROUP BY bericht_id`).bind(...berichtIds).all()).results || [];
  const m = lid ? (await env.SHOP_DB.prepare(`SELECT bericht_id FROM forum_likes WHERE lid_id = ? AND bericht_id IN (${q})`).bind(lid.id, ...berichtIds).all()).results || [] : [];
  return { aantal: Object.fromEntries(a.map((x) => [x.bericht_id, x.n])), mijn: new Set(m.map((x) => x.bericht_id)) };
}
export function likeKnop(lid, berichtId, n, mijn) {
  const tekst = `${ico("hart")} <span>${n || ""}</span>`;
  if (!lid) return `<span class="f-like" title="Log in om te liken">${tekst}</span>`;
  return `<form method="post" action="/forum/b/${berichtId}/like" class="f-likeform"><button type="submit" class="f-like${mijn ? " aan" : ""}" aria-pressed="${mijn}" title="${mijn ? "Niet meer leuk" : "Leuk"}">${tekst}</button></form>`;
}

/* ---------------- garage ---------------- */

export async function garages(env, lidIds) {
  const ids = [...new Set(lidIds)].filter(Boolean);
  if (!ids.length) return {};
  const r = (await env.SHOP_DB.prepare(`SELECT * FROM lid_wagens WHERE lid_id IN (${ids.map(() => "?").join(",")}) ORDER BY volgorde, id`).bind(...ids).all()).results || [];
  const m = {};
  for (const w of r) (m[w.lid_id] ||= []).push(w);
  return m;
}
export const wagenNaam = (w) => [w.type, w.bouwjaar].filter(Boolean).join(", ") + (w.naam ? ` "${w.naam}"` : "");
export function garageKaarten(wagens, o = {}) {
  return `<div class="garage">${wagens.map((w) => `<figure class="wagen" id="wagen-${w.id}">${w.foto_id ? `<button type="button" data-full="/forum/foto/${w.foto_id}" class="wagen-foto" aria-label="Foto groot bekijken"><img src="/forum/foto/${w.foto_id}" alt="${esc(wagenNaam(w))}" loading="lazy"></button>` : `<div class="wagen-foto leeg" aria-hidden="true">${ico("auto")}</div>`}
    ${w.foto_id ? `<button type="button" class="f-like wagen-like" data-like="wagen-${w.id}" aria-pressed="false" title="Geef een hartje">${ico("hart")} <span></span></button>` : ""}<figcaption><b>${esc(w.naam || w.type)}</b>${w.naam ? `<small>${esc(w.type)}</small>` : ""}${o.profiel ? drieMenu([
      o.eigen ? `<a href="/account/garage">Bewerken</a>` : "",
      deelKnop(`${o.profiel}#wagen-${w.id}`, wagenNaam(w)),
      o.lid && !o.eigen && w.foto_id ? bewaarKnop("wagen", w.id, o.bewaard?.has(w.id)) : "",
      !o.eigen && w.foto_id ? meldLink("wagen", w.id) : "",
      o.mod && w.foto_id ? `<hr><form method="post" action="/forum/mod" class="f-mod" data-bevestig="Deze foto verwijderen?"><input type="hidden" name="actie" value="verwijder-wagenfoto"><input type="hidden" name="id" value="${w.id}"><button class="rood" type="submit">Foto verwijderen</button></form>` : "",
    ]) : ""}</figcaption></figure>`).join("")}</div>`;
}
