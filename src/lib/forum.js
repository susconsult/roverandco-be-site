// Forum van Rover & Co, old school: categorieën -> topics -> berichten.
// Lezen kan iedereen; posten met een account (zie src/leden.js). Moderatie: alleen beheerders (BEHEER_EMAILS).
// Opmaak in berichten: [b]vet[/b], [i]schuin[/i], [quote=naam]...[/quote], [foto=123], links worden klikbaar.
// Foto's worden in de browser verkleind (public/assets/js/forum.js) en in D1 bewaard (tabel forum_fotos).
import { esc, ico, bannerFoto, kruimel as hoofdKruimel, datum, banner as sjabloonBanner, pagina, naar, eigenOrigin, sha, mail, metVlag } from "./sjabloon.js";
import { huidigLid, avatar } from "./leden.js";
import { nieuwsteBerichten, nieuwStrook, CAT_FOTO } from "./forum-nieuw.js";
import BLOG_NIEUWS from "../../data/blog-nieuws.json";
import { wagenKaart, WAGEN_BASIS, komendeKalender } from "./aanbod.js";
import { log } from "./log.js";
import { drieMenu, deelKnop, bewaarKnop, meldLink, bewaardSet } from "./melden.js";
import { tagLinks, bewaarTags, volgt, zetVolgen, volgKnop, meld as stuurMelding, meldNieuwBericht, likes, likeKnop, garages, wagenNaam, garageKaarten } from "./forum-extra.js";

const PER_PAGINA_TOPICS = 30;
const PER_PAGINA_BERICHTEN = 20;
const MAX_FOTO = 1_600_000;
const nu = () => new Date().toISOString();
const tekst = (v, max) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
const slugify = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
// @gebruikersnaam in een bericht: die leden krijgen een melding in hun bel.
async function meldGenoemden(env, tekstRuw, auteur, titel, link) {
  const namen = [...new Set((String(tekstRuw).match(/(?:^|[\s(])@([A-Za-z0-9._-]{3,20})/g) || []).map((x) => x.trim().replace(/^[(]/, "").slice(1).toLowerCase()))].slice(0, 15);
  if (!namen.length) return;
  const ids = ((await env.SHOP_DB.prepare(`SELECT id FROM leden WHERE lower(gebruikersnaam) IN (${namen.map(() => "?").join(",")}) AND id <> ? AND geblokkeerd = 0`).bind(...namen, auteur.id).all()).results || []).map((x) => x.id);
  if (ids.length) await stuurMelding(env, ids, `${auteur.gebruikersnaam} noemde je in "${titel}"`, link);
}

// Op welke pagina staat een bericht? Pagina's tellen alleen de hoofdberichten; antwoorden staan bij hun hoofdbericht.
async function paginaVan(env, topicId, berichtId) {
  const b = await env.SHOP_DB.prepare("SELECT COALESCE(parent_id, id) root FROM forum_berichten WHERE id = ?").bind(berichtId).first();
  const n = (await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM forum_berichten WHERE topic_id = ? AND verwijderd = 0 AND parent_id IS NULL AND id <= ?").bind(topicId, b?.root || berichtId).first()).n;
  return Math.max(1, Math.ceil(n / PER_PAGINA_BERICHTEN));
}
const topicUrl = (t, pag = 1) => `/forum/t/${t.id}-${slugify(t.titel)}${pag > 1 ? `?p=${pag}` : ""}`;
const lidLink = (naam) => naam ? `<a class="f-lid" href="/forum/lid/${encodeURIComponent(naam)}">${esc(naam)}</a>` : "<span class=\"f-lid\">onbekend</span>";
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const ICONEN = {
  tool: '<path d="M7 10h3V7L6.5 3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1-3 3l-6-6a6 6 0 0 1-8-8z"/>',
  bolt: '<path d="M13 3v7h6l-8 11v-7H5z"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>',
  tag: '<path d="M7.5 7.5h.01M3 6v5.2a2 2 0 0 0 .6 1.4l7.8 7.8a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8L11.6 4.6A2 2 0 0 0 10.2 4H5a2 2 0 0 0-2 2z"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-8a3.5 3.5 0 0 1 0-7H12"/>',
  camera: '<path d="M5 7h1a2 2 0 0 0 2-2 1 1 0 0 1 1-1h6a1 1 0 0 1 1 1 2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2"/><circle cx="12" cy="13" r="3"/>',
  message: '<path d="M8 9h8M8 13h6M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-5l-5 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z"/>',
};
const icoon = (n) => `<svg class="f-icoon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONEN[n] || ICONEN.message}</svg>`;

// "2026-12-05T09:30" -> "za 5 dec 2026, 09:30"
const ritDatum = (v) => {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/);
  if (!m) return esc(v || "");
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return `${["zo", "ma", "di", "wo", "do", "vr", "za"][d.getUTCDay()]} ${+m[3]} ${["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"][+m[2] - 1]} ${m[1]}, ${m[4]}`;
};

/* ---------------- opmaak van berichten ---------------- */

export function opmaak(ruw) {
  let h = esc(ruw);
  for (let i = 0; i < 6; i++) {
    const v = h.replace(/\[quote(?:=([^\]\[\n]{1,40}))?\]((?:(?!\[quote)[\s\S])*?)\[\/quote\]/i,
      (_, wie, binnen) => `<blockquote class="f-citaat">${wie ? `<cite>${wie} schreef:</cite>` : ""}${binnen.trim()}</blockquote>`);
    if (v === h) break;
    h = v;
  }
  h = h.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "<b>$1</b>").replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "<i>$1</i>");
  // Foto's die na elkaar staan (alleen witruimte ertussen) worden één galerij.
  h = h.replace(/\[foto=\d{1,10}\](?:\s*\[foto=\d{1,10}\])*/gi, (blok) => {
    const ids = [...blok.matchAll(/\[foto=(\d{1,10})\]/gi)].map((m) => m[1]);
    const n = ids.length;
    return `<div class="f-galerij f-g${Math.min(n, 5)}" data-aantal="${n}">${ids.map((id, i) => `<button type="button" class="f-foto" data-full="/forum/foto/${id}" data-groep="g${ids[0]}" aria-label="Foto ${i + 1} van ${n} groot bekijken"><img src="/forum/foto/${id}" alt="" loading="lazy"></button>`).join("")}</div>`;
  });
  h = h.replace(/(^|[\s>(])(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, (_, voor, u) => `${voor}<a href="${u}" rel="nofollow ugc noopener" target="_blank">${u.length > 60 ? u.slice(0, 57) + "…" : u}</a>`);
  h = tagLinks(h);
  h = h.replace(/(^|[\s>(])@([A-Za-z0-9._-]{3,20})/g, (_, voor, n) => `${voor}<a class="f-noem" href="/forum/lid/${encodeURIComponent(n)}">@${n}</a>`);
  return h.replace(/\n/g, "<br>").replace(/<br>\s*(<\/?blockquote)/g, "$1").replace(/(<\/blockquote>)<br>/g, "$1");
}

/* ---------------- gegevens ---------------- */

async function categorieen(env) {
  return (await env.SHOP_DB.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM forum_topics t WHERE t.categorie_id = c.id AND t.verwijderd = 0) AS topics,
      (SELECT COALESCE(SUM(berichten), 0) FROM forum_topics t WHERE t.categorie_id = c.id AND t.verwijderd = 0) AS berichten,
      (SELECT id FROM forum_topics t WHERE t.categorie_id = c.id AND t.verwijderd = 0 ORDER BY laatste_op DESC LIMIT 1) AS laatste_topic
    FROM forum_categorieen c ORDER BY volgorde`).all()).results || [];
}

async function herbereken(env, topicId) {
  await env.SHOP_DB.prepare(`UPDATE forum_topics SET
      berichten = (SELECT COUNT(*) FROM forum_berichten WHERE topic_id = ?1 AND verwijderd = 0),
      laatste_op = COALESCE((SELECT MAX(aangemaakt) FROM forum_berichten WHERE topic_id = ?1 AND verwijderd = 0), laatste_op),
      laatste_lid_id = (SELECT lid_id FROM forum_berichten WHERE topic_id = ?1 AND verwijderd = 0 ORDER BY id DESC LIMIT 1)
    WHERE id = ?1`).bind(topicId).run();
}

async function gelezenMap(env, lid, ids) {
  if (!lid || !ids.length) return {};
  const r = (await env.SHOP_DB.prepare(`SELECT topic_id, op FROM forum_gelezen WHERE lid_id = ? AND topic_id IN (${ids.map(() => "?").join(",")})`).bind(lid.id, ...ids).all()).results || [];
  return Object.fromEntries(r.map((x) => [x.topic_id, x.op]));
}
const isNieuw = (lid, t, gelezen) => !!lid && t.laatste_op > (gelezen[t.id] || lid.aangemaakt);

/* ---------------- stukjes opmaak ---------------- */

const banner = (a, b, c = "") => sjabloonBanner(a, b, c, "slot"); // forum heeft zijn eigen kruimelpad onder de banner
const kruimel = (...delen) => `<nav class="f-kruimel" aria-label="Kruimelpad"><a href="/">Home</a> <span>›</span> <a href="/forum">Kampvuur</a>${delen.map((d) => ` <span>›</span> ${d}`).join("")}</nav>`;

function balk(lid, pad) {
  const rechts = lid
    ? `Ingelogd als ${lidLink(lid.gebruikersnaam)} · <a href="/account">Mijn account</a> · <a href="/account/uitloggen">Uitloggen</a>`
    : `<a href="/account/inloggen?terug=${encodeURIComponent(pad)}">Inloggen</a> · <a href="/account/registreren?terug=${encodeURIComponent(pad)}">Registreren</a>`;
  return `<div class="f-balk"><a href="/forum/nieuw">Recente berichten</a><span>${rechts}</span></div>`;
}

function paginering(huidig, totaal, maakUrl) {
  if (totaal <= 1) return "";
  const n = [];
  for (let i = 1; i <= totaal; i++) {
    if (i === 1 || i === totaal || Math.abs(i - huidig) <= 2) n.push(i === huidig ? `<span class="aan">${i}</span>` : `<a href="${maakUrl(i)}">${i}</a>`);
    else if (n[n.length - 1] !== "…") n.push("…");
  }
  return `<nav class="f-pag" aria-label="Pagina's">Pagina ${n.join(" ")}</nav>`;
}

const editor = (naam, waarde = "", extra = "") => `
  <div class="f-editor">
    <div class="f-tools" role="toolbar" aria-label="Opmaak">
      <button type="button" data-tag="b" title="Vet"><b>B</b></button>
      <button type="button" data-tag="i" title="Schuin"><i>I</i></button>
      <button type="button" data-tag="quote" title="Citaat">“ ”</button>
      <button type="button" class="f-emojiknop" data-emoji title="Emoji toevoegen" aria-label="Emoji toevoegen" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4 4 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/></svg></button>
      <label class="f-fotoknop" title="Foto's toevoegen"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10.5" r="1.8"/><path d="M21 16l-5-5-8 8"/></svg>Foto's<input type="file" accept="image/*" multiple data-foto hidden></label>
      <span class="f-status" aria-live="polite"></span>
    </div>
    <textarea name="${naam}" rows="8" required maxlength="20000" ${extra}>${esc(waarde)}</textarea>
    <div class="f-fotos-preview" aria-label="Toegevoegde foto's"></div>
    <p class="f-sleep">Sleep foto's hierheen of plak ze, tot 10 tegelijk.</p>
  </div>`;

/* ---------------- pagina's ---------------- */

// /forum = Community (wens Pieter 23 nov 2026): kop met cijfers en acties, Landy's van leden bovenaan,
// dan het Kampvuur (nieuwe berichten + categorieën) met ernaast CB, kalender en gids, onderaan de blog.
const MAANDEN_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
async function index(request, env, url, lid) {
  const db = env.SHOP_DB;
  const etmaal = new Date(Date.now() - 86400000).toISOString();
  const cats = await categorieen(env);
  const ids = cats.map((c) => c.laatste_topic).filter(Boolean);
  const [laatste, gelezen, stats, nieuwste, wagens, cbLive, kal, gidsN] = await Promise.all([
    ids.length ? db.prepare(`SELECT t.id, t.titel, t.laatste_op, t.berichten, l.gebruikersnaam FROM forum_topics t LEFT JOIN leden l ON l.id = t.laatste_lid_id WHERE t.id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids).all().then((r) => Object.fromEntries((r.results || []).map((t) => [t.id, t]))) : {},
    gelezenMap(env, lid, ids),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM forum_topics WHERE verwijderd = 0) topics,
      (SELECT COUNT(*) FROM leden WHERE gebruikersnaam IS NOT NULL AND geblokkeerd = 0 AND verwijderd_op IS NULL) leden,
      (SELECT gebruikersnaam FROM leden WHERE gebruikersnaam IS NOT NULL AND geblokkeerd = 0 ORDER BY id DESC LIMIT 1) nieuwste`).first(),
    nieuwsteBerichten(env, 8),
    (async () => {
      try {
        const n = await db.prepare(`${WAGEN_BASIS} ORDER BY w.aangemaakt DESC LIMIT 3`).all().then((r) => r.results || []);
        const nids = n.map((w) => w.id);
        const r = await db.prepare(`${WAGEN_BASIS}${nids.length ? ` AND w.id NOT IN (${nids.map(() => "?").join(",")})` : ""} ORDER BY RANDOM() LIMIT 3`).bind(...nids).all().then((x) => x.results || []);
        const tot = (await db.prepare(`SELECT COUNT(*) n FROM (${WAGEN_BASIS})`).first())?.n || 0;
        return { lijst: [...n, ...r], tot };
      } catch { return { lijst: [], tot: 0 }; }
    })(),
    db.prepare(`SELECT b.nr, k.naam, COUNT(*) n, MAX(b.aangemaakt) laatst FROM cb_berichten b LEFT JOIN cb_kanalen k ON k.nr = b.nr
      WHERE b.verwijderd = 0 AND b.aangemaakt > ? GROUP BY b.nr ORDER BY laatst DESC LIMIT 3`).bind(etmaal).all().then((r) => r.results || []).catch(() => []),
    komendeKalender(env, 92).catch(() => []),
    db.prepare("SELECT COUNT(*) n FROM gids_zaken WHERE zichtbaar = 1").first().then((r) => r?.n || 0).catch(() => 0),
  ]);

  let groep = "", kaarten = "";
  for (const c of cats) {
    if (c.groep !== groep) { if (groep) kaarten += "</div>"; groep = c.groep; kaarten += `<h2 class="fc-groep">${esc(groep)}</h2><div class="fc-grid">`; }
    const t = laatste[c.laatste_topic];
    const nieuw = t && isNieuw(lid, t, gelezen);
    kaarten += `<a class="fc" href="/forum/c/${c.slug}"><img src="/assets/img/${CAT_FOTO[c.slug] || "968"}-s.webp" alt="" loading="lazy">
      <div class="fc-b">${nieuw ? '<span class="tegel-label" style="position:static;display:inline-block;margin-bottom:8px">Nieuw</span>' : ""}<b>${esc(c.naam)}</b><span>${esc(c.omschrijving || "")}</span>
      <small>${c.topics} ${c.topics === 1 ? "topic" : "topics"} · ${c.berichten} ${c.berichten === 1 ? "bericht" : "berichten"}${t ? ` · laatst: ${esc(t.titel)}` : ""}</small></div></a>`;
  }
  if (groep) kaarten += "</div>";

  const getal = (n, een, veel) => `<div><b>${n}</b><span>${n === 1 ? een : veel}</span></div>`;
  const kop = `<div class="wrap com-kop"><div class="com-cijfers">${getal(stats.leden || 0, "lid", "leden")}${getal(stats.topics || 0, "topic", "topics")}${getal(wagens.tot, "Landy", "Landy's")}${getal(cbLive.length, "kanaal live op de CB", "kanalen live op de CB")}</div>
    <div class="com-acties"><a class="btn btn-solid" href="${lid ? "#kampvuur" : "/account/registreren?terug=/forum"}">${ico("plus")}${lid ? "Nieuw topic" : "Doe mee"}</a><a class="btn" href="/account/garage">${ico("auto")}Zet je Landy erbij</a><a class="btn" href="/cb">${ico("cb")}Op de CB</a></div></div>`;

  const landys = wagens.lijst.length ? `<section class="wrap com-landys"><div class="com-sec-kop"><h2>Landy's van leden</h2><a href="/landys">Bekijk alle ${wagens.tot} →</a></div>
    <div class="com-landys-rij">${wagens.lijst.map(wagenKaart).join("")}</div></section>` : "";

  const cbKaart = `<div class="zij-kaart"><h3>${ico("cb")} Op de CB</h3>${cbLive.length
    ? `<ul class="com-lijst">${cbLive.map((k) => `<li><a href="/cb"><b>Kanaal ${k.nr}</b>${k.naam ? ` · ${esc(k.naam)}` : ""}</a><small>${k.n} ${k.n === 1 ? "bericht" : "berichten"} vandaag</small></li>`).join("")}</ul>`
    : "<p>Stil op de CB. Zet de eerste stap en roep een kanaal op.</p>"}<a class="zij-meer" href="/cb">Naar de CB →</a></div>`;

  const dag = (d) => { const [, m, dd] = d.split("-"); return `<span class="com-dag"><b>${+dd}</b>${MAANDEN_KORT[+m - 1]}</span>`; };
  const kalKaart = `<div class="zij-kaart"><h3>${ico("kalender")} De komende maanden</h3>${kal.length
    ? `<ul class="com-kal">${kal.slice(0, 6).map((k, i) => `<li class="${k.ons ? "ons" : ""}${i === 0 ? " eerst" : ""}"><a href="${esc(k.link || "/kalender")}"${k.ons ? "" : ' target="_blank" rel="noopener"'}>${dag(k.datum)}<span><b>${esc(k.titel)}</b><small>${k.ons ? "Rover &amp; Co" : esc(k.club || "")}${k.plaats ? " · " + esc(String(k.plaats).split(" · ")[0]) : ""}</small></span></a></li>`).join("")}</ul>`
    : "<p>Nog niets gepland.</p>"}<a class="zij-meer" href="/kalender">Hele kalender →</a></div>`;

  const gidsKaart = `<div class="zij-kaart com-gids"><h3>${ico("pin")} Garage nodig?</h3><p>${gidsN} onafhankelijke Land Rover-garages, onderdelen en ombouw in België en Nederland.</p>
    <a class="btn btn-solid" href="/gids?hier=1">${ico("locatie")}Dichtst bij mij</a><a class="zij-meer" href="/gids">Naar de gids →</a></div>`;

  const blog = BLOG_NIEUWS.length ? `<section class="wrap com-blog"><div class="com-sec-kop"><h2>Uit de blog</h2><a href="/blog">Alle artikels →</a></div>
    <div class="com-blog-rij">${BLOG_NIEUWS.slice(0, 4).map((n) => `<a href="/blog/${n.slug}"><img src="/assets/img/${n.foto}-s.webp" alt="" loading="lazy"><small>${esc(n.rubriek)} · ${esc(n.datum)}</small><b>${esc(n.titel)}</b></a>`).join("")}</div></section>` : "";

  const waarom = lid ? "" : `<div class="wrap waarom-kaarten">
      <div><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m6.5 6.5 11 11"/></svg><b>Geen algoritme, geen reclame</b><span>Niemand verdient aan jouw foto's. Gewoon delen en elkaar helpen.</span></div>
      <div>${ico("pin")}<b>Spreek af om samen te rijden</b><span>Zin in een roadbook zaterdag? Post het, wie meewil reageert.</span></div>
      <div><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><b>Je berichten blijven van jou</b><span>Zet je Land Rovers bij <a href="/account/garage">Mijn Landy</a>, volg topics en #hashtags.</span></div>
    </div>`;

  return pagina(env, request, {
    titel: "Community: Kampvuur, Landy's en CB van Rover & Co", pad: "/forum", desc: "De community van Rover & Co: het Kampvuur (forum), Land Rovers van leden, de CB, de kalender en de gids met Land Rover-garages. Lezen kan iedereen, meedoen met een gratis account.",
    inhoud: sjabloonBanner("Rover & Co", "Community", "Het Kampvuur, de Landy's van leden, de CB en wat er de komende maanden te doen is. Lezen kan iedereen, meedoen met een gratis account.", [["Community"]], "leden-lightweight-110")
      + kop + landys + `
    <section class="wrap f-sectie forum-layout com-midden">
      <div><div class="com-sec-kop" id="kampvuur"><h2>Het Kampvuur</h2><a href="/forum/nieuw">Alles wat nieuw is →</a></div>${balk(lid, "/forum")}${nieuwStrook(nieuwste)}${kaarten}</div>
      <aside class="forum-zij">${cbKaart}${kalKaart}${gidsKaart}
        ${stats.nieuwste ? `<p class="f-stats">Nieuwste lid: ${lidLink(stats.nieuwste)}</p>` : ""}</aside>
    </section>` + blog + waarom,
  });
}

async function categorie(request, env, url, lid, slug) {
  const c = await env.SHOP_DB.prepare("SELECT * FROM forum_categorieen WHERE slug = ?").bind(slug).first();
  if (!c) return null;
  const pag = Math.max(1, parseInt(url.searchParams.get("p"), 10) || 1);
  const totaal = (await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM forum_topics WHERE categorie_id = ? AND verwijderd = 0").bind(c.id).first()).n;
  const topics = (await env.SHOP_DB.prepare(`SELECT t.*, a.gebruikersnaam AS auteur, l.gebruikersnaam AS laatste FROM forum_topics t
      LEFT JOIN leden a ON a.id = t.lid_id LEFT JOIN leden l ON l.id = t.laatste_lid_id
      WHERE t.categorie_id = ? AND t.verwijderd = 0 ORDER BY t.vast DESC, t.laatste_op DESC LIMIT ? OFFSET ?`
  ).bind(c.id, PER_PAGINA_TOPICS, (pag - 1) * PER_PAGINA_TOPICS).all()).results || [];
  const gelezen = await gelezenMap(env, lid, topics.map((t) => t.id));
  const rijen = topics.map((t) => {
    const nieuw = isNieuw(lid, t, gelezen);
    const paginas = Math.ceil(t.berichten / PER_PAGINA_BERICHTEN);
    return `<tr${nieuw ? ' class="f-nieuw"' : ""}><td class="f-cat"><div>${t.vast ? '<span class="f-label">Vast</span> ' : ""}${t.gesloten ? '<span class="f-label grijs">Gesloten</span> ' : ""}<a class="f-titel" href="${topicUrl(t)}">${esc(t.titel)}</a>${nieuw ? ' <span class="f-label nieuw">Nieuw</span>' : ""}${t.rit_datum ? `<span class="f-rit">${ico("kalender")} ${ritDatum(t.rit_datum)}${t.rit_plaats ? ` · ${ico("pin")} ` + esc(t.rit_plaats) : ""}</span>` : ""}<small>door ${lidLink(t.auteur)} · ${datum(t.aangemaakt, true)}${paginas > 1 ? ` · pagina ${Array.from({ length: Math.min(paginas, 5) }, (_, i) => `<a href="${topicUrl(t, i + 1)}">${i + 1}</a>`).join(" ")}${paginas > 5 ? " …" : ""}` : ""}</small></div></td>
      <td class="f-num">${Math.max(0, t.berichten - 1)}</td>
      <td class="f-laatste"><a href="${topicUrl(t, paginas)}#laatste">${datum(t.laatste_op)}</a><small>door ${lidLink(t.laatste)}</small></td></tr>`;
  }).join("");
  const volgCat = volgKnop(lid, "cat", c.slug, await volgt(env, lid, "cat", c.slug), `/forum/c/${c.slug}`, c.naam);
  const nieuwKnop = lid ? `<a class="btn btn-solid" href="/forum/c/${c.slug}/nieuw">Nieuw topic</a>` : `<a class="btn btn-solid" href="/account/inloggen?terug=${encodeURIComponent(`/forum/c/${c.slug}/nieuw`)}">Log in om een topic te starten</a>`;
  return pagina(env, request, {
    titel: `${c.naam} – Kampvuur`, pad: `/forum/c/${c.slug}${pag > 1 ? `?p=${pag}` : ""}`, desc: `${c.naam}: ${c.omschrijving || ""} Op het forum van Rover & Co.`,
    inhoud: banner("Kampvuur", c.naam, c.omschrijving || "") + `<section class="wrap f-sectie">
      ${balk(lid, `/forum/c/${c.slug}`)}${kruimel(esc(c.naam))}
      <div class="f-kop"><div class="f-knoppen">${nieuwKnop}${volgCat}</div>${paginering(pag, Math.ceil(totaal / PER_PAGINA_TOPICS), (i) => `/forum/c/${c.slug}?p=${i}`)}</div>
      ${topics.length ? `<table class="f-tabel"><thead><tr><th>Topic</th><th class="f-num">Antwoorden</th><th class="f-laatste">Laatste bericht</th></tr></thead><tbody>${rijen}</tbody></table>`
        : `<div class="f-leeg"><p>Hier staat nog niets. Start jij het eerste topic?</p>${nieuwKnop}</div>`}
      <div class="f-kop">${paginering(pag, Math.ceil(totaal / PER_PAGINA_TOPICS), (i) => `/forum/c/${c.slug}?p=${i}`)}</div>
    </section>`,
  });
}

async function topic(request, env, url, lid, id) {
  const t = await env.SHOP_DB.prepare("SELECT t.*, c.slug AS cslug, c.naam AS cnaam FROM forum_topics t JOIN forum_categorieen c ON c.id = t.categorie_id WHERE t.id = ? AND t.verwijderd = 0").bind(id).first();
  if (!t) return null;
  const alle = (await env.SHOP_DB.prepare(`SELECT b.*, l.gebruikersnaam, l.avatar_id, l.aangemaakt AS lid_sinds, l.landrover, l.woonplaats, l.geblokkeerd
      FROM forum_berichten b LEFT JOIN leden l ON l.id = b.lid_id WHERE b.topic_id = ? AND b.verwijderd = 0 ORDER BY b.id LIMIT 2000`).bind(t.id).all()).results || [];
  const ids = new Set(alle.map((b) => b.id));
  const hoofd = alle.filter((b) => !b.parent_id || !ids.has(b.parent_id));
  const kinderen = {};
  for (const b of alle) if (b.parent_id && ids.has(b.parent_id)) (kinderen[b.parent_id] ||= []).push(b);
  const paginas = Math.max(1, Math.ceil(hoofd.length / PER_PAGINA_BERICHTEN));
  const pag = Math.min(paginas, Math.max(1, parseInt(url.searchParams.get("p"), 10) || 1));
  const berichten = hoofd.slice((pag - 1) * PER_PAGINA_BERICHTEN, pag * PER_PAGINA_BERICHTEN).flatMap((b) => [b, ...(kinderen[b.id] || []).map((k) => ({ ...k, isAntwoord: true, op: b }))]);
  const laatsteId = Math.max(0, ...berichten.map((b) => b.id));
  const auteurs = [...new Set(berichten.map((b) => b.lid_id))];
  const tellers = auteurs.length ? Object.fromEntries(((await env.SHOP_DB.prepare(
    `SELECT lid_id, COUNT(*) n FROM forum_berichten WHERE verwijderd = 0 AND lid_id IN (${auteurs.map(() => "?").join(",")}) GROUP BY lid_id`
  ).bind(...auteurs).all()).results || []).map((r) => [r.lid_id, r.n])) : {};
  const eersteId = (await env.SHOP_DB.prepare("SELECT MIN(id) id FROM forum_berichten WHERE topic_id = ? AND verwijderd = 0").bind(t.id).first())?.id;

  if (lid) await env.SHOP_DB.prepare("INSERT INTO forum_gelezen (lid_id, topic_id, op) VALUES (?, ?, ?) ON CONFLICT(lid_id, topic_id) DO UPDATE SET op = excluded.op").bind(lid.id, t.id, nu()).run();

  const lk = await likes(env, lid, berichten.map((b) => b.id));
  const bw = await bewaardSet(env, lid, "bericht", berichten.map((b) => b.id));
  const gar = await garages(env, auteurs);
  const volgT = volgKnop(lid, "topic", t.id, await volgt(env, lid, "topic", t.id), topicUrl(t, pag), "dit topic");
  const kan = (b) => lid && (lid.beheerder || (b.lid_id === lid.id && !t.gesloten));
  const posts = berichten.map((b) => `
    <article class="f-post${b.isAntwoord ? " f-antw" : ""}" id="b${b.id}"${b.id === laatsteId ? ' data-laatste' : ""}>
      ${b.id === laatsteId ? '<span id="laatste" class="f-anker" aria-hidden="true"></span>' : ""}
      <aside class="f-auteur">${avatar({ gebruikersnaam: b.gebruikersnaam, avatar_id: b.avatar_id }, 56)}
        <div>${lidLink(b.gebruikersnaam)}${b.geblokkeerd ? ' <span class="f-label grijs">Geblokkeerd</span>' : ""}
        ${(gar[b.lid_id] || []).length ? `<a class="f-auteur-wagen" href="/forum/lid/${encodeURIComponent(b.gebruikersnaam)}#garage">${gar[b.lid_id][0].foto_id ? `<img src="/forum/foto/${gar[b.lid_id][0].foto_id}" alt="" loading="lazy">` : ico("auto")}<span>${esc(wagenNaam(gar[b.lid_id][0]))}${gar[b.lid_id].length > 1 ? ` <em>+${gar[b.lid_id].length - 1}</em>` : ""}</span></a>` : b.landrover ? `<small>${esc(b.landrover)}</small>` : ""}</div></aside>
      <div class="f-inhoud">
        <div class="f-meta"><a href="#b${b.id}">${datum(b.aangemaakt)}</a>${b.bewerkt_op ? ` <small>(bewerkt ${datum(b.bewerkt_op)})</small>` : ""}</div>
        <div class="f-tekst">${opmaak(b.tekst)}</div>
        <div class="f-acties">
          ${likeKnop(lid, b.id, lk.aantal[b.id], lk.mijn.has(b.id))}
          ${lid && !t.gesloten ? `<button type="button" class="linkknop f-reageer" data-reageer="${b.isAntwoord ? b.op.id : b.id}" data-naam="${esc(b.gebruikersnaam || "")}" data-bij="${b.id}">Antwoorden</button>` : ""}
          ${drieMenu([
            lid && !t.gesloten ? `<button type="button" data-citeer="${esc(b.gebruikersnaam || "")}" data-ruw="${esc(b.tekst)}">Citeren</button>` : "",
            kan(b) && b.lid_id === lid?.id ? `<a href="/forum/b/${b.id}/bewerk">Bewerken</a>` : "",
            deelKnop(`${topicUrl(t)}#b${b.id}`, t.titel),
            lid && b.lid_id !== lid.id ? bewaarKnop("bericht", b.id, bw.has(b.id)) : "",
            b.lid_id !== lid?.id ? meldLink("bericht", b.id) : "",
            lid?.beheerder ? `<hr>${b.lid_id !== lid.id ? `<a href="/forum/b/${b.id}/bewerk">Bewerken (moderator)</a>` : ""}<form method="post" action="/forum/mod" class="f-mod" data-bevestig="${b.id === eersteId ? "Het hele topic verwijderen?" : "Dit bericht verwijderen?"}"><input type="hidden" name="actie" value="${b.id === eersteId ? "verwijder-topic" : "verwijder-bericht"}"><input type="hidden" name="id" value="${b.id === eersteId ? t.id : b.id}"><button class="rood" type="submit">Verwijderen</button></form>
            ${b.lid_id !== lid.id && !b.geblokkeerd ? `<form method="post" action="/forum/mod" class="f-mod" data-bevestig="${esc(b.gebruikersnaam || "")} blokkeren? Die kan dan niet meer inloggen."><input type="hidden" name="actie" value="blokkeer"><input type="hidden" name="id" value="${b.lid_id}"><button class="rood" type="submit">Lid blokkeren</button></form>` : ""}` : "",
          ])}
        </div>
      </div>
    </article>`).join("");

  const mod = lid?.beheerder ? `<div class="f-modbalk"><b>Moderatie:</b>
      <form method="post" action="/forum/mod" class="f-mod"><input type="hidden" name="actie" value="vast"><input type="hidden" name="id" value="${t.id}"><button class="linkknop" type="submit">${t.vast ? "Losmaken" : "Vastzetten"}</button></form>
      <form method="post" action="/forum/mod" class="f-mod"><input type="hidden" name="actie" value="sluit"><input type="hidden" name="id" value="${t.id}"><button class="linkknop" type="submit">${t.gesloten ? "Heropenen" : "Sluiten"}</button></form></div>` : "";

  const antwoord = t.gesloten ? `<div class="f-leeg"><p>Dit topic is gesloten. Er kan niet meer op gereageerd worden.</p></div>`
    : lid ? `<form class="f-antwoord" method="post" action="/forum/t/${t.id}/antwoord" id="antwoord"><h2>Antwoorden</h2>${editor("tekst")}<button class="btn btn-solid" type="submit">Plaatsen</button></form>`
    : `<div class="f-leeg"><p>Wil je reageren? Log in of maak een gratis account.</p><a class="btn btn-solid" href="/account/inloggen?terug=${encodeURIComponent(topicUrl(t, paginas))}">Inloggen</a> <a class="btn" href="/account/registreren?terug=${encodeURIComponent(topicUrl(t, paginas))}">Registreren</a></div>`;
  const pg = paginering(pag, paginas, (i) => topicUrl(t, i));
  const m = url.searchParams.has("gemeld") ? `<div class="melding melding-ok">Bedankt, je melding is doorgestuurd.</div>` : "";
  return pagina(env, request, {
    titel: `${t.titel} – ${t.cnaam}`, pad: topicUrl(t, pag), desc: String(berichten[0]?.tekst || t.titel).replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").slice(0, 155),
    inhoud: banner(t.cnaam, t.titel, `Een topic in ${t.cnaam} · ${t.berichten} ${t.berichten === 1 ? "bericht" : "berichten"}`) + `<section class="wrap f-sectie">
      ${balk(lid, topicUrl(t, pag))}${kruimel(`<a href="/forum/c/${t.cslug}">${esc(t.cnaam)}</a>`, esc(t.titel))}${m}${mod}
      ${t.rit_datum ? `<div class="f-ritblok"><b>Samen rijden</b><span>${ico("kalender")} ${ritDatum(t.rit_datum)}</span>${t.rit_plaats ? `<span>${ico("pin")} ${esc(t.rit_plaats)}</span>` : ""}<small>Rij je mee? Reageer hieronder.</small></div>` : ""}
      <div class="f-kop"><div class="f-knoppen">${t.gesloten ? '<span class="f-label grijs">Gesloten</span>' : lid ? '<a class="btn btn-solid" href="#antwoord">Antwoorden</a>' : ""}${volgT}</div>${pg}</div>
      ${posts}
      <div class="f-kop">${pg}</div>
      ${antwoord}
    </section><script src="/assets/js/forum.js" defer></script>`,
  });
}

function postFormulier(env, request, { titel, kop, actie, toonTitel, w = {}, m = "", terug, rit = false }) {
  return pagina(env, request, {
    titel, noindex: true,
    inhoud: banner("Kampvuur", kop, "Schrijf je bericht hieronder. Foto's toevoegen kan met de knop Foto.") + `<section class="wrap f-sectie">${terug}
      ${m ? `<div class="melding melding-fout" role="alert">${esc(m)}</div>` : ""}
      <form class="f-antwoord" method="post" action="${actie}">
        ${toonTitel ? `<div class="veld"><label for="f-titel">Titel</label><input id="f-titel" name="titel" maxlength="120" minlength="5" required value="${esc(w.titel || "")}"></div>` : ""}
        ${rit ? `<div class="veld2"><div class="veld"><label for="f-ritdatum">Wanneer? <small>(optioneel)</small></label><input id="f-ritdatum" name="rit_datum" type="datetime-local" value="${esc(w.rit_datum || "")}"></div>
          <div class="veld"><label for="f-ritplaats">Vertrekplaats <small>(optioneel)</small></label><input id="f-ritplaats" name="rit_plaats" maxlength="100" value="${esc(w.rit_plaats || "")}" placeholder="Bv. Kerk van Oostham"></div></div>` : ""}
        ${editor("tekst", w.tekst || "")}
        <button class="btn btn-solid" type="submit">Plaatsen</button>
      </form>
      <p class="f-hulp">Opmaak: [b]vet[/b], [i]schuin[/i], [quote=naam]citaat[/quote]. Links worden vanzelf klikbaar. Met #hashtags (bv. #td5 of #roadbook) vinden anderen je bericht terug. Foto's voeg je toe met de knop Foto.</p>
    </section><script src="/assets/js/forum.js" defer></script>`,
  });
}

/* ---------------- posten ---------------- */

async function teSnel(env, lid, topicsOok) {
  const r = await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM forum_berichten WHERE lid_id = ? AND aangemaakt > ?").bind(lid.id, new Date(Date.now() - 60_000).toISOString()).first();
  if (r.n >= 4) return "Je post heel snel na elkaar. Wacht even en probeer opnieuw.";
  if (topicsOok) {
    const t = await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM forum_topics WHERE lid_id = ? AND aangemaakt > ?").bind(lid.id, new Date(Date.now() - 3600_000).toISOString()).first();
    if (t.n >= 5) return "Je startte het afgelopen uur al 5 topics. Probeer later opnieuw.";
  }
  return "";
}

async function nieuwTopic(request, env, url, lid, slug) {
  const c = await env.SHOP_DB.prepare("SELECT * FROM forum_categorieen WHERE slug = ?").bind(slug).first();
  if (!c) return null;
  const rit = c.slug === "samen-rijden";
  const toon = (m, w) => postFormulier(env, request, { titel: "Nieuw topic", kop: `Nieuw topic in ${c.naam}`, actie: `/forum/c/${c.slug}/nieuw`, toonTitel: true, w, m, rit,
    terug: kruimel(`<a href="/forum/c/${c.slug}">${esc(c.naam)}</a>`, "Nieuw topic") });
  if (request.method !== "POST") return toon();
  const f = await request.formData();
  const w = { titel: tekst(f.get("titel"), 120).replace(/\s+/g, " "), tekst: tekst(f.get("tekst"), 20000),
    rit_datum: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(tekst(f.get("rit_datum"), 20)) ? tekst(f.get("rit_datum"), 20) : "", rit_plaats: tekst(f.get("rit_plaats"), 100) };
  if (w.titel.length < 5) return toon("Geef je topic een titel van minstens 5 tekens.", w);
  if (w.tekst.length < 2) return toon("Schrijf eerst je bericht.", w);
  const snel = await teSnel(env, lid, true);
  if (snel) return toon(snel, w);
  const t = nu();
  const r = await env.SHOP_DB.prepare("INSERT INTO forum_topics (categorie_id, titel, lid_id, aangemaakt, laatste_op, laatste_lid_id, berichten, rit_datum, rit_plaats) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
    .bind(c.id, w.titel, lid.id, t, t, lid.id, rit && w.rit_datum ? w.rit_datum : null, rit && w.rit_plaats ? w.rit_plaats : null).run();
  const id = r.meta.last_row_id;
  const b = await env.SHOP_DB.prepare("INSERT INTO forum_berichten (topic_id, lid_id, tekst, aangemaakt) VALUES (?, ?, ?, ?)").bind(id, lid.id, w.tekst, t).run();
  const tags = await bewaarTags(env, b.meta.last_row_id, id, w.tekst);
  await zetVolgen(env, lid.id, "topic", id, true); // je volgt je eigen topic
  const link = topicUrl({ id, titel: w.titel });
  await meldNieuwBericht(env, { topic: { id, titel: w.titel }, catSlug: c.slug, catNaam: c.naam, auteur: lid, tags, link, nieuwTopic: true });
  await meldGenoemden(env, w.tekst, lid, w.titel, link);
  await log(env, lid.id, "forum", `Nieuw topic in ${c.naam}: ${w.titel}`, link);
  return naar(link);
}

async function antwoorden(request, env, url, lid, id) {
  const t = await env.SHOP_DB.prepare("SELECT * FROM forum_topics WHERE id = ? AND verwijderd = 0").bind(id).first();
  if (!t) return null;
  if (t.gesloten && !lid.beheerder) return naar(topicUrl(t));
  const f = await request.formData();
  const w = { tekst: tekst(f.get("tekst"), 20000) };
  const terug = kruimel(`<a href="${topicUrl(t)}">${esc(t.titel)}</a>`, "Antwoorden");
  if (w.tekst.length < 2) return postFormulier(env, request, { titel: "Antwoorden", kop: t.titel, actie: `/forum/t/${t.id}/antwoord`, w, m: "Schrijf eerst je bericht.", terug });
  const snel = await teSnel(env, lid, false);
  if (snel) return postFormulier(env, request, { titel: "Antwoorden", kop: t.titel, actie: `/forum/t/${t.id}/antwoord`, w, m: snel, terug });
  let ouder = null;
  const pid = parseInt(f.get("parent"), 10) || 0;
  if (pid) {
    ouder = await env.SHOP_DB.prepare("SELECT id, parent_id, lid_id FROM forum_berichten WHERE id = ? AND topic_id = ? AND verwijderd = 0").bind(pid, t.id).first();
    if (ouder) ouder.root = ouder.parent_id || ouder.id; // één niveau: antwoord op een antwoord komt bij hetzelfde hoofdbericht
  }
  const r = await env.SHOP_DB.prepare("INSERT INTO forum_berichten (topic_id, lid_id, tekst, aangemaakt, parent_id) VALUES (?, ?, ?, ?, ?)").bind(t.id, lid.id, w.tekst, nu(), ouder?.root || null).run();
  await herbereken(env, t.id);
  const link = `${topicUrl(t, await paginaVan(env, t.id, r.meta.last_row_id))}#b${r.meta.last_row_id}`;
  const bij = parseInt(f.get("bij"), 10) || 0;
  const aan = bij && bij !== pid ? await env.SHOP_DB.prepare("SELECT lid_id FROM forum_berichten WHERE id = ? AND topic_id = ?").bind(bij, t.id).first() : ouder;
  if (aan?.lid_id && aan.lid_id !== lid.id) await stuurMelding(env, [aan.lid_id], `${lid.gebruikersnaam} antwoordde op je bericht in "${t.titel}"`, link);
  const tags = await bewaarTags(env, r.meta.last_row_id, t.id, w.tekst);
  if (f.get("volg") !== "0") await zetVolgen(env, lid.id, "topic", t.id, true); // wie reageert, volgt het topic
  const c = await env.SHOP_DB.prepare("SELECT slug, naam FROM forum_categorieen WHERE id = ?").bind(t.categorie_id).first();
  await meldNieuwBericht(env, { topic: t, catSlug: c?.slug || "", catNaam: c?.naam || "", auteur: lid, tags, link, nieuwTopic: false });
  await meldGenoemden(env, w.tekst, lid, t.titel, link);
  await log(env, lid.id, "forum", `Reactie op: ${t.titel}`, link);
  return naar(link);
}

async function bewerk(request, env, url, lid, id) {
  const b = await env.SHOP_DB.prepare("SELECT b.*, t.titel, t.gesloten, t.id AS tid FROM forum_berichten b JOIN forum_topics t ON t.id = b.topic_id WHERE b.id = ? AND b.verwijderd = 0 AND t.verwijderd = 0").bind(id).first();
  if (!b) return null;
  if (!(lid.beheerder || (b.lid_id === lid.id && !b.gesloten))) return naar(topicUrl({ id: b.tid, titel: b.titel }));
  const eerste = (await env.SHOP_DB.prepare("SELECT MIN(id) id FROM forum_berichten WHERE topic_id = ? AND verwijderd = 0").bind(b.tid).first()).id === b.id;
  const toon = (m, w) => postFormulier(env, request, { titel: "Bericht bewerken", kop: "Bericht bewerken", actie: `/forum/b/${b.id}/bewerk`, toonTitel: eerste, w, m,
    terug: kruimel(`<a href="${topicUrl({ id: b.tid, titel: b.titel })}">${esc(b.titel)}</a>`, "Bewerken") });
  if (request.method !== "POST") return toon("", { titel: b.titel, tekst: b.tekst });
  const f = await request.formData();
  const w = { titel: tekst(f.get("titel"), 120).replace(/\s+/g, " "), tekst: tekst(f.get("tekst"), 20000) };
  if (w.tekst.length < 2) return toon("Je bericht is leeg.", w);
  if (eerste && w.titel.length < 5) return toon("Geef je topic een titel van minstens 5 tekens.", w);
  await env.SHOP_DB.prepare("UPDATE forum_berichten SET tekst = ?, bewerkt_op = ? WHERE id = ?").bind(w.tekst, nu(), b.id).run();
  await bewaarTags(env, b.id, b.tid, w.tekst);
  if (eerste) await env.SHOP_DB.prepare("UPDATE forum_topics SET titel = ? WHERE id = ?").bind(w.titel, b.tid).run();
  await log(env, lid.id, "forum", `Bericht bewerkt in: ${eerste ? w.titel : b.titel}`, `${topicUrl({ id: b.tid, titel: eerste ? w.titel : b.titel })}#b${b.id}`);
  return naar(`${topicUrl({ id: b.tid, titel: eerste ? w.titel : b.titel }, await paginaVan(env, b.tid, b.id))}#b${b.id}`);
}

async function meld(request, env, url, lid, id) {
  const b = await env.SHOP_DB.prepare("SELECT b.*, t.titel, l.gebruikersnaam FROM forum_berichten b JOIN forum_topics t ON t.id = b.topic_id LEFT JOIN leden l ON l.id = b.lid_id WHERE b.id = ?").bind(id).first();
  if (!b) return null;
  const f = await request.formData();
  const reden = tekst(f.get("reden"), 300);
  const ip = await sha("ip:" + (env.TURNSTILE_SECRET || env.RESEND_API_KEY || "") + ":" + (request.headers.get("cf-connecting-ip") || ""));
  const recent = await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM forum_meldingen WHERE (ip_hash = ? OR lid_id = ?) AND aangemaakt > ?").bind(ip, lid?.id || -1, new Date(Date.now() - 3600_000).toISOString()).first();
  const terug = topicUrl({ id: b.topic_id, titel: b.titel });
  if (recent.n >= 5) return naar(`${terug}?gemeld=1#b${b.id}`);
  await env.SHOP_DB.prepare("INSERT INTO forum_meldingen (bericht_id, lid_id, ip_hash, reden, aangemaakt) VALUES (?, ?, ?, ?, ?)").bind(b.id, lid?.id || null, ip, reden, nu()).run();
  if (lid) await log(env, lid.id, "forum", `Bericht gemeld van ${b.gebruikersnaam || "?"} in: ${b.titel}`, `${terug}#b${b.id}`);
  if (b.lid_id) await log(env, b.lid_id, "forum", `Bericht van dit lid werd gemeld in: ${b.titel}${reden ? ` (${reden})` : ""}`, `${terug}#b${b.id}`);
  const aan = (env.BEHEER_EMAILS || "pieter@roverandco.be").split(",")[0].trim();
  await mail(env, {
    aan, onderwerp: `Melding op het forum: ${b.titel}`,
    tekst: `Er werd een bericht gemeld op het forum.\n\nTopic: ${b.titel}\nBericht van: ${b.gebruikersnaam || "?"}\nGemeld door: ${lid?.gebruikersnaam || "bezoeker zonder account"}\nReden: ${reden || "(geen reden)"}\n\nBericht:\n${String(b.tekst).slice(0, 1500)}\n\nBekijk het hier (log in om te modereren):\n${url.origin}${terug}#b${b.id}`,
  });
  return naar(`${terug}?gemeld=1#b${b.id}`);
}

async function meldWagen(request, env, url, lid, id) {
  const w = await env.SHOP_DB.prepare("SELECT w.*, l.gebruikersnaam FROM lid_wagens w JOIN leden l ON l.id = w.lid_id WHERE w.id = ? AND w.foto_id IS NOT NULL").bind(id).first();
  if (!w || !w.gebruikersnaam) return null;
  const f = await request.formData();
  const reden = tekst(f.get("reden"), 300);
  const ip = await sha("ip:" + (env.TURNSTILE_SECRET || env.RESEND_API_KEY || "") + ":" + (request.headers.get("cf-connecting-ip") || ""));
  const terug = `/forum/lid/${encodeURIComponent(w.gebruikersnaam)}`;
  const recent = await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM forum_meldingen WHERE (ip_hash = ? OR lid_id = ?) AND aangemaakt > ?").bind(ip, lid?.id || -1, new Date(Date.now() - 3600_000).toISOString()).first();
  if (recent.n >= 5) return naar(`${terug}?gemeld=1#wagen-${w.id}`);
  await env.SHOP_DB.prepare("INSERT INTO forum_meldingen (bericht_id, wagen_id, lid_id, ip_hash, reden, aangemaakt) VALUES (0, ?, ?, ?, ?, ?)").bind(w.id, lid?.id || null, ip, reden, nu()).run();
  if (lid) await log(env, lid.id, "forum", `Land Rover-foto gemeld van ${w.gebruikersnaam}`, `${terug}#wagen-${w.id}`);
  await log(env, w.lid_id, "garage", `Land Rover-foto van dit lid werd gemeld${reden ? ` (${reden})` : ""}`, `${terug}#wagen-${w.id}`);
  const aan = (env.BEHEER_EMAILS || "pieter@roverandco.be").split(",")[0].trim();
  await mail(env, {
    aan, onderwerp: `Melding: Land Rover-foto van ${w.gebruikersnaam}`,
    tekst: `Er werd een foto van een Land Rover gemeld.\n\nLid: ${w.gebruikersnaam}\nWagen: ${wagenNaam(w)}\nGemeld door: ${lid?.gebruikersnaam || "bezoeker zonder account"}\nReden: ${reden || "(geen reden)"}\n\nFoto: ${url.origin}/forum/foto/${w.foto_id}\n\nBekijk en verwijder hem hier (log in als moderator):\n${url.origin}${terug}#wagen-${w.id}`,
  });
  return naar(`${terug}?gemeld=1#wagen-${w.id}`);
}

async function moderatie(request, env, url, lid) {
  if (!lid?.beheerder) return new Response("Geen toegang.", { status: 403 });
  const f = await request.formData();
  const actie = String(f.get("actie") || "");
  const id = parseInt(f.get("id"), 10) || 0;
  if (actie === "verwijder-wagenfoto") {
    const w = await env.SHOP_DB.prepare("SELECT w.foto_id, l.gebruikersnaam FROM lid_wagens w JOIN leden l ON l.id = w.lid_id WHERE w.id = ?").bind(id).first();
    if (!w) return naar("/forum");
    await env.SHOP_DB.prepare("UPDATE lid_wagens SET foto_id = NULL WHERE id = ?").bind(id).run();
    await env.SHOP_DB.prepare("UPDATE forum_meldingen SET afgehandeld = 1 WHERE wagen_id = ?").bind(id).run();
    return naar(`/forum/lid/${encodeURIComponent(w.gebruikersnaam || "")}#garage`);
  }
  if (actie === "verwijder-bericht") {
    const b = await env.SHOP_DB.prepare("SELECT b.topic_id, t.titel FROM forum_berichten b JOIN forum_topics t ON t.id = b.topic_id WHERE b.id = ?").bind(id).first();
    if (!b) return naar("/forum");
    await env.SHOP_DB.prepare("UPDATE forum_berichten SET verwijderd = 1 WHERE id = ?").bind(id).run();
    await env.SHOP_DB.prepare("UPDATE forum_meldingen SET afgehandeld = 1 WHERE bericht_id = ?").bind(id).run();
    await herbereken(env, b.topic_id);
    return naar(topicUrl({ id: b.topic_id, titel: b.titel }));
  }
  const t = await env.SHOP_DB.prepare("SELECT t.*, c.slug FROM forum_topics t JOIN forum_categorieen c ON c.id = t.categorie_id WHERE t.id = ?").bind(id).first();
  if (actie === "verwijder-topic" && t) {
    await env.SHOP_DB.prepare("UPDATE forum_topics SET verwijderd = 1 WHERE id = ?").bind(id).run();
    return naar(`/forum/c/${t.slug}`);
  }
  if (actie === "vast" && t) { await env.SHOP_DB.prepare("UPDATE forum_topics SET vast = 1 - vast WHERE id = ?").bind(id).run(); return naar(topicUrl(t)); }
  if (actie === "sluit" && t) { await env.SHOP_DB.prepare("UPDATE forum_topics SET gesloten = 1 - gesloten WHERE id = ?").bind(id).run(); return naar(topicUrl(t)); }
  if (actie === "blokkeer" && id && id !== lid.id) {
    await env.SHOP_DB.prepare("UPDATE leden SET geblokkeerd = 1 WHERE id = ?").bind(id).run();
    await env.SHOP_DB.prepare("DELETE FROM lid_sessies WHERE lid_id = ?").bind(id).run();
    return naar(request.headers.get("referer")?.startsWith(url.origin) ? request.headers.get("referer") : "/forum");
  }
  return naar("/forum");
}

/* ---------------- foto's ---------------- */

async function fotoOpladen(request, env, lid) {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!["image/jpeg", "image/webp", "image/png"].includes(type)) return json({ ok: false, fout: "Alleen foto's (JPG, PNG of WebP)." }, 415);
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > MAX_FOTO) return json({ ok: false, fout: "Deze foto is te groot." }, 413);
  const dag = await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM forum_fotos WHERE lid_id = ? AND aangemaakt > ?").bind(lid.id, new Date(Date.now() - 86400_000).toISOString()).first();
  if (dag.n >= 40 && !lid.beheerder) return json({ ok: false, fout: "Je laadde vandaag al 40 foto's op. Probeer morgen opnieuw." }, 429);
  const r = await env.SHOP_DB.prepare("INSERT INTO forum_fotos (lid_id, type, data, grootte, aangemaakt) VALUES (?, ?, ?, ?, ?)").bind(lid.id, type, data, data.byteLength, nu()).run();
  return json({ ok: true, id: r.meta.last_row_id });
}

async function fotoTonen(env, id) {
  const f = await env.SHOP_DB.prepare("SELECT type, data FROM forum_fotos WHERE id = ?").bind(id).first();
  if (!f) return new Response("Niet gevonden", { status: 404 });
  const bytes = f.data instanceof ArrayBuffer ? f.data : new Uint8Array(f.data);
  return new Response(bytes, { headers: { "content-type": f.type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
}

/* ---------------- recent en profiel ---------------- */

async function recent(request, env, url, lid) {
  const topics = (await env.SHOP_DB.prepare(`SELECT t.*, c.naam AS cnaam, c.slug AS cslug, l.gebruikersnaam AS laatste FROM forum_topics t
      JOIN forum_categorieen c ON c.id = t.categorie_id LEFT JOIN leden l ON l.id = t.laatste_lid_id
      WHERE t.verwijderd = 0 ORDER BY t.laatste_op DESC LIMIT 40`).all()).results || [];
  const gelezen = await gelezenMap(env, lid, topics.map((t) => t.id));
  const rijen = topics.map((t) => {
    const nieuw = isNieuw(lid, t, gelezen);
    return `<tr${nieuw ? ' class="f-nieuw"' : ""}><td class="f-cat"><div><a class="f-titel" href="${topicUrl(t)}">${esc(t.titel)}</a>${nieuw ? ' <span class="f-label nieuw">Nieuw</span>' : ""}<small>in <a href="/forum/c/${t.cslug}">${esc(t.cnaam)}</a></small></div></td>
      <td class="f-num">${Math.max(0, t.berichten - 1)}</td><td class="f-laatste"><a href="${topicUrl(t, Math.ceil(t.berichten / PER_PAGINA_BERICHTEN))}#laatste">${datum(t.laatste_op)}</a><small>door ${lidLink(t.laatste)}</small></td></tr>`;
  }).join("");
  return pagina(env, request, {
    titel: "Recente berichten – Kampvuur", noindex: true,
    inhoud: banner("Kampvuur", "Recente berichten", "De laatste activiteit op het forum.") + `<section class="wrap f-sectie">${balk(lid, "/forum/nieuw")}${kruimel("Recente berichten")}
      ${topics.length ? `<table class="f-tabel"><thead><tr><th>Topic</th><th class="f-num">Antwoorden</th><th class="f-laatste">Laatste bericht</th></tr></thead><tbody>${rijen}</tbody></table>` : `<div class="f-leeg"><p>Nog geen berichten.</p></div>`}
    </section>`,
  });
}

async function profiel(request, env, url, lid, naam) {
  // Bewust weinig info: enkel gebruikersnaam, avatar en garage. Geen woonplaats, data of activiteit.
  const p = await env.SHOP_DB.prepare("SELECT id, gebruikersnaam, avatar_id FROM leden WHERE gebruikersnaam = ? AND COALESCE(geblokkeerd, 0) = 0").bind(naam).first();
  if (!p) return null;
  const wagens = (await garages(env, [p.id]))[p.id] || [];
  return pagina(env, request, {
    titel: `${p.gebruikersnaam} – Kampvuur`, noindex: true,
    inhoud: sjabloonBanner("Kampvuur", p.gebruikersnaam, "Lid van het Rover & Co-forum.", [["Kampvuur", "/forum"], [p.gebruikersnaam]], wagens.find((w) => w.foto_id) ? `/forum/foto/${wagens.find((w) => w.foto_id).foto_id}` : "leden-vuur-avond") + `<section class="wrap f-sectie">${balk(lid, url.pathname)}
      <div class="f-profielkop">${avatar(p, 72)}<b>${esc(p.gebruikersnaam)}</b></div>
      <h2 class="f-h2" id="garage">Land Rovers</h2>
      ${url.searchParams.has("gemeld") ? `<div class="melding melding-ok">Bedankt, je melding is doorgestuurd.</div>` : ""}
      ${wagens.length ? garageKaarten(wagens, { lid, eigen: lid?.id === p.id, mod: !!lid?.beheerder, bewaard: await bewaardSet(env, lid, "wagen", wagens.map((w) => w.id)), profiel: `/forum/lid/${encodeURIComponent(p.gebruikersnaam)}` }) : `<p>${lid?.id === p.id ? 'Nog leeg. <a href="/account/garage">Voeg je Land Rovers toe</a>.' : "Nog geen Land Rovers."}</p>`}
    </section>`,
  });
}

/* ---------------- volgen, likes, hashtags ---------------- */

async function volgActie(request, env, lid) {
  const f = await request.formData();
  const soort = String(f.get("soort") || "");
  let sleutel = String(f.get("sleutel") || "").toLowerCase().slice(0, 80);
  const terug = String(f.get("terug") || "/forum");
  const veilig = terug.startsWith("/forum") ? terug : "/forum";
  if (!["cat", "topic", "tag"].includes(soort) || !sleutel) return naar(veilig);
  if (soort === "topic" && !/^\d+$/.test(sleutel)) return naar(veilig);
  if (soort === "cat" && !(await env.SHOP_DB.prepare("SELECT 1 FROM forum_categorieen WHERE slug = ?").bind(sleutel).first())) return naar(veilig);
  if (soort === "tag") sleutel = sleutel.replace(/^#/, "").replace(/[^a-zà-ÿ0-9_-]/g, "").slice(0, 30);
  await zetVolgen(env, lid.id, soort, sleutel, f.get("aan") === "1");
  return naar(veilig);
}

async function likeActie(request, env, url, lid, id) {
  const b = await env.SHOP_DB.prepare("SELECT b.id, b.lid_id, b.topic_id, t.titel FROM forum_berichten b JOIN forum_topics t ON t.id = b.topic_id WHERE b.id = ? AND b.verwijderd = 0").bind(id).first();
  if (!b) return json({ ok: false }, 404);
  const had = await env.SHOP_DB.prepare("SELECT 1 FROM forum_likes WHERE bericht_id = ? AND lid_id = ?").bind(b.id, lid.id).first();
  await log(env, lid.id, "forum", `${had ? "Like weggehaald" : "Like gegeven"} in: ${b.titel}`, `${topicUrl({ id: b.topic_id, titel: b.titel })}#b${b.id}`);
  if (had) await env.SHOP_DB.prepare("DELETE FROM forum_likes WHERE bericht_id = ? AND lid_id = ?").bind(b.id, lid.id).run();
  else {
    await env.SHOP_DB.prepare("INSERT OR IGNORE INTO forum_likes (bericht_id, lid_id, aangemaakt) VALUES (?, ?, ?)").bind(b.id, lid.id, nu()).run();
    // Melding naar de schrijver (niet voor je eigen bericht, en hoogstens één per bericht per dag per liker).
    if (b.lid_id !== lid.id) {
      const link = `${topicUrl({ id: b.topic_id, titel: b.titel }, await paginaVan(env, b.topic_id, b.id))}#b${b.id}`;
      const al = await env.SHOP_DB.prepare("SELECT 1 FROM lid_meldingen WHERE lid_id = ? AND link = ? AND tekst LIKE ? AND aangemaakt > ?").bind(b.lid_id, link, `${lid.gebruikersnaam} %`, new Date(Date.now() - 86400_000).toISOString()).first();
      if (!al) await stuurMelding(env, [b.lid_id], `${lid.gebruikersnaam} vindt je bericht in "${b.titel}" leuk`, link);
    }
  }
  const n = (await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM forum_likes WHERE bericht_id = ?").bind(b.id).first()).n;
  if ((request.headers.get("accept") || "").includes("application/json")) return json({ ok: true, aantal: n, mijn: !had });
  return naar((request.headers.get("referer") || "").startsWith(url.origin) ? request.headers.get("referer").replace(/#.*$/, "") + `#b${b.id}` : "/forum");
}

async function tagPagina(request, env, url, lid, tag) {
  tag = tag.toLowerCase().slice(0, 30);
  const topics = (await env.SHOP_DB.prepare(`SELECT t.*, c.naam AS cnaam, c.slug AS cslug, l.gebruikersnaam AS laatste FROM forum_topics t
      JOIN forum_categorieen c ON c.id = t.categorie_id LEFT JOIN leden l ON l.id = t.laatste_lid_id
      WHERE t.verwijderd = 0 AND t.id IN (SELECT ft.topic_id FROM forum_tags ft JOIN forum_berichten b ON b.id = ft.bericht_id WHERE ft.tag = ? AND b.verwijderd = 0)
      ORDER BY t.laatste_op DESC LIMIT 60`).bind(tag).all()).results || [];
  const rijen = topics.map((t) => `<tr><td class="f-cat"><div><a class="f-titel" href="${topicUrl(t)}">${esc(t.titel)}</a><small>in <a href="/forum/c/${t.cslug}">${esc(t.cnaam)}</a></small></div></td>
      <td class="f-num">${Math.max(0, t.berichten - 1)}</td><td class="f-laatste"><a href="${topicUrl(t, Math.ceil(t.berichten / PER_PAGINA_BERICHTEN))}#laatste">${datum(t.laatste_op)}</a><small>door ${lidLink(t.laatste)}</small></td></tr>`).join("");
  const pad = `/forum/tag/${encodeURIComponent(tag)}`;
  return pagina(env, request, {
    titel: `#${tag} – Kampvuur`, pad, noindex: !topics.length,
    inhoud: banner("Kampvuur", `#${tag}`, "Alle topics met deze hashtag.") + `<section class="wrap f-sectie">${balk(lid, pad)}${kruimel(`#${esc(tag)}`)}
      <div class="f-kop"><div class="f-knoppen">${volgKnop(lid, "tag", tag, await volgt(env, lid, "tag", tag), pad, "#" + tag)}</div></div>
      ${topics.length ? `<table class="f-tabel"><thead><tr><th>Topic</th><th class="f-num">Antwoorden</th><th class="f-laatste">Laatste bericht</th></tr></thead><tbody>${rijen}</tbody></table>` : `<div class="f-leeg"><p>Nog geen berichten met #${esc(tag)}. Volg de hashtag en je krijgt een melding zodra iemand hem gebruikt.</p></div>`}
    </section>`,
  });
}

/* ---------------- router ---------------- */

export async function forum(request, env, url) {
  const p = url.pathname.replace(/\/$/, "") || "/";
  if (p !== "/forum" && !p.startsWith("/forum/")) return null;
  if (!env.SHOP_DB) return new Response("Nog niet gekoppeld.", { status: 503 });
  let m;
  if ((m = p.match(/^\/forum\/foto\/(\d{1,10})$/))) return fotoTonen(env, m[1]);
  if (p === "/forum/api/leden") {
    const q = String(url.searchParams.get("q") || "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 20);
    const r = q ? (await env.SHOP_DB.prepare("SELECT gebruikersnaam n, avatar_id a FROM leden WHERE gebruikersnaam LIKE ? AND geblokkeerd = 0 AND verwijderd_op IS NULL ORDER BY laatst_gezien DESC LIMIT 6").bind(q + "%").all()).results || [] : [];
    return json(r);
  }
  if (request.method === "POST" && !eigenOrigin(request, url)) return new Response("Geweigerd.", { status: 403 });
  const lid = await huidigLid(request, env);
  const post = request.method === "POST";
  const moetLid = () => naar(`/account/inloggen?terug=${encodeURIComponent(p)}`);
  const moetNaam = () => naar("/account/gegevens");
  let res = null;

  if (p === "/forum") res = await index(request, env, url, lid);
  else if (p === "/forum/nieuw") res = await recent(request, env, url, lid);
  else if (p === "/forum/foto" && post) res = lid ? await fotoOpladen(request, env, lid) : json({ ok: false, fout: "Log eerst in." }, 401);
  else if ((m = p.match(/^\/forum\/wagen\/(\d{1,10})\/meld$/)) && post) res = await meldWagen(request, env, url, lid, m[1]);
  else if (p === "/forum/mod" && post) res = await moderatie(request, env, url, lid);
  else if ((m = p.match(/^\/forum\/c\/([a-z0-9-]+)$/))) res = await categorie(request, env, url, lid, m[1]);
  else if ((m = p.match(/^\/forum\/c\/([a-z0-9-]+)\/nieuw$/))) res = !lid ? moetLid() : !lid.gebruikersnaam ? moetNaam() : await nieuwTopic(request, env, url, lid, m[1]);
  else if ((m = p.match(/^\/forum\/t\/(\d{1,10})(?:-[a-z0-9-]*)?$/))) res = await topic(request, env, url, lid, m[1]);
  else if ((m = p.match(/^\/forum\/t\/(\d{1,10})\/antwoord$/)) && post) res = !lid ? moetLid() : !lid.gebruikersnaam ? moetNaam() : await antwoorden(request, env, url, lid, m[1]);
  else if ((m = p.match(/^\/forum\/b\/(\d{1,10})\/bewerk$/))) res = !lid ? moetLid() : await bewerk(request, env, url, lid, m[1]);
  else if ((m = p.match(/^\/forum\/b\/(\d{1,10})\/meld$/)) && post) res = await meld(request, env, url, lid, m[1]);
  else if (p === "/forum/volg" && post) res = lid ? await volgActie(request, env, lid) : moetLid();
  else if ((m = p.match(/^\/forum\/b\/(\d{1,10})\/like$/)) && post) res = lid ? await likeActie(request, env, url, lid, m[1]) : json({ ok: false, fout: "Log eerst in." }, 401);
  else if ((m = p.match(/^\/forum\/tag\/([^/]{1,90})$/))) res = await tagPagina(request, env, url, lid, decodeURIComponent(m[1]));
  else if ((m = p.match(/^\/forum\/lid\/([^/]{1,40})$/))) res = await profiel(request, env, url, lid, decodeURIComponent(m[1]));

  if (res) return metVlag(request, res, lid);
  return pagina(env, request, { titel: "Niet gevonden", noindex: true, status: 404,
    inhoud: banner("Kampvuur", "Niet gevonden", "Deze pagina bestaat niet (meer).") + `<section class="narrow acc-sectie"><div class="acc-kaart"><p>Deze pagina bestaat niet (meer).</p><a class="btn btn-solid" href="/forum">Naar het forum</a></div></section>` });
}
