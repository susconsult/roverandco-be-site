// "Nieuw op het forum" (wens Pieter 20 nov 2026): de laatste berichten uitgelicht, één per topic,
// met foto, stukje tekst, wie en wanneer. Op /forum als strook boven de categorieën en op de startpagina.
import { esc } from "./sjabloon.js";
import { avatar } from "./leden.js";

const slugify = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const PER_PAGINA = 20; // gelijk aan PER_PAGINA_BERICHTEN in forum.js

export const CAT_FOTO = { series: "870", defender: "5577", "discovery-range-rover": "959", "elektriciteit-ombouw": "900", "samen-rijden": "977",
  ritten: "968", vakantiekiekjes: "leden-daktent-rivier", "te-koop": "905", cafe: "leden-vuur-hond" };

const fotoUit = (t) => (String(t || "").match(/\[foto=(\d{1,10})\]/i) || [])[1];

// Ruwe forumtekst naar een kort stukje platte tekst, zonder citaten, opmaakcodes en foto's.
export function stukje(ruw, max = 120) {
  let t = String(ruw || "");
  for (let i = 0; i < 6; i++) { const v = t.replace(/\[quote(?:=[^\]]*)?\](?:(?!\[quote)[\s\S])*?\[\/quote\]/i, " "); if (v === t) break; t = v; }
  t = t.replace(/\[foto=\d+\]/gi, " ").replace(/\[\/?(b|i)\]/gi, "").replace(/https?:\/\/\S+/g, "(link)").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, "") + "…" : t;
}

export function geleden(iso, nu = Date.now()) {
  const s = Math.max(0, (nu - new Date(iso).getTime()) / 1000);
  if (s < 90) return "zonet";
  if (s < 3600) return `${Math.round(s / 60)} min geleden`;
  if (s < 86400) return `${Math.round(s / 3600)} u geleden`;
  if (s < 172800) return "gisteren";
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} dagen geleden`;
  return new Date(iso).toLocaleDateString("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short" });
}

export async function nieuwsteBerichten(env, n = 8) {
  try {
    const rijen = (await env.SHOP_DB.prepare(`SELECT b.id, b.tekst, b.aangemaakt, b.topic_id,
      (SELECT COUNT(*) FROM forum_berichten x WHERE x.topic_id = b.topic_id AND x.verwijderd = 0 AND x.parent_id IS NULL AND x.id <= COALESCE(b.parent_id, b.id)) plek, t.titel, t.berichten, c.naam cnaam, c.slug cslug, l.gebruikersnaam, l.avatar_id
      FROM forum_berichten b JOIN forum_topics t ON t.id = b.topic_id JOIN forum_categorieen c ON c.id = t.categorie_id JOIN leden l ON l.id = b.lid_id
      WHERE b.id IN (SELECT MAX(id) FROM forum_berichten WHERE verwijderd = 0 GROUP BY topic_id) AND t.verwijderd = 0 AND COALESCE(l.geblokkeerd, 0) = 0
      ORDER BY b.id DESC LIMIT ?`).bind(n).all()).results || [];
    // Geen foto in het laatste bericht: neem de laatste foto uit hetzelfde topic.
    const zonder = rijen.filter((r) => !fotoUit(r.tekst)).map((r) => r.topic_id);
    const topicFoto = {};
    if (zonder.length) {
      const f = (await env.SHOP_DB.prepare(`SELECT topic_id, tekst FROM forum_berichten WHERE verwijderd = 0 AND tekst LIKE '%[foto=%' AND topic_id IN (${zonder.map(() => "?").join(",")}) ORDER BY id DESC`).bind(...zonder).all()).results || [];
      for (const r of f) if (!topicFoto[r.topic_id]) topicFoto[r.topic_id] = fotoUit(r.tekst);
    }
    return rijen.map((r) => {
      const id = fotoUit(r.tekst) || topicFoto[r.topic_id];
      const pag = Math.max(1, Math.ceil(r.plek / PER_PAGINA));
      return { ...r, foto: id ? `/forum/foto/${id}` : `/assets/img/${CAT_FOTO[r.cslug] || "968"}-s.webp`, eigenFoto: !!id,
        link: `/forum/t/${r.topic_id}-${slugify(r.titel)}${pag > 1 ? `?p=${pag}` : ""}#b${r.id}`, tekstje: stukje(r.tekst), eerste: r.berichten <= 1 };
    });
  } catch { return []; }
}

const kaart = (b, nu) => `<a class="fn-kaart" href="${b.link}">
  <span class="fn-foto"><img src="${b.foto}" alt="" loading="lazy"><em>${esc(b.cnaam)}</em></span>
  <span class="fn-b"><b>${esc(b.titel)}</b>${b.tekstje ? `<q>${esc(b.tekstje)}</q>` : ""}
  <small>${avatar({ gebruikersnaam: b.gebruikersnaam, avatar_id: b.avatar_id }, 22)}<span>${esc(b.gebruikersnaam)} ${b.eerste ? "startte dit" : "reageerde"} · ${geleden(b.aangemaakt, nu)}</span></small></span></a>`;

// Strook voor /forum: horizontale kaarten.
export function nieuwStrook(berichten) {
  if (!berichten.length) return "";
  const nu = Date.now();
  return `<div class="fn-strook"><div class="fn-kop"><h2>Nieuw op het forum</h2><a href="/forum/nieuw">Alles wat nieuw is →</a></div>
    <div class="fn-rij">${berichten.map((b) => kaart(b, nu)).join("")}</div></div>`;
}

// Lijst voor de startpagina (donkere sectie): compacte rijen met fotootje.
export function nieuwLijst(berichten, n = 4) {
  const nu = Date.now();
  return berichten.slice(0, n).map((b) => `<a class="forum-rij fn-mini" href="${b.link}"><img src="${b.foto}" alt="" loading="lazy">
    <span><span class="fn-t">${esc(b.titel)}</span>${b.tekstje ? `<q>${esc(b.tekstje)}</q>` : ""}<small>${esc(b.gebruikersnaam)} ${b.eerste ? "startte dit" : "reageerde"} · ${geleden(b.aangemaakt, nu)} · ${esc(b.cnaam)}</small></span></a>`).join("");
}
