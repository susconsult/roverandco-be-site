// Forum van Rover & Co, old school: categorieën -> topics -> berichten.
// Lezen kan iedereen; posten met een account (zie src/leden.js). Moderatie: alleen beheerders (BEHEER_EMAILS).
// Opmaak in berichten: [b]vet[/b], [i]schuin[/i], [quote=naam]...[/quote], [foto=123], links worden klikbaar.
// Foto's worden in de browser verkleind (public/assets/js/forum.js) en in D1 bewaard (tabel forum_fotos).
import { esc, datum, banner, pagina, naar, eigenOrigin, sha, mail } from "./sjabloon.js";
import { huidigLid, avatar } from "./leden.js";

const PER_PAGINA_TOPICS = 30;
const PER_PAGINA_BERICHTEN = 20;
const MAX_FOTO = 1_600_000;
const nu = () => new Date().toISOString();
const tekst = (v, max) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
const slugify = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const topicUrl = (t, pag = 1) => `/forum/t/${t.id}-${slugify(t.titel)}${pag > 1 ? `?p=${pag}` : ""}`;
const lidLink = (naam) => naam ? `<a class="f-lid" href="/forum/lid/${encodeURIComponent(naam)}">${esc(naam)}</a>` : "<span class=\"f-lid\">onbekend</span>";
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const ICONEN = {
  tool: '<path d="M7 10h3V7L6.5 3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1-3 3l-6-6a6 6 0 0 1-8-8z"/>',
  bolt: '<path d="M13 3v7h6l-8 11v-7H5z"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>',
  tag: '<path d="M7.5 7.5h.01M3 6v5.2a2 2 0 0 0 .6 1.4l7.8 7.8a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8L11.6 4.6A2 2 0 0 0 10.2 4H5a2 2 0 0 0-2 2z"/>',
  message: '<path d="M8 9h8M8 13h6M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-5l-5 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z"/>',
};
const icoon = (n) => `<svg class="f-icoon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONEN[n] || ICONEN.message}</svg>`;

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
  h = h.replace(/\[foto=(\d{1,10})\]/gi, (_, id) => `<a class="f-foto" href="/forum/foto/${id}" target="_blank"><img src="/forum/foto/${id}" alt="Foto" loading="lazy"></a>`);
  h = h.replace(/(^|[\s>(])(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, (_, voor, u) => `${voor}<a href="${u}" rel="nofollow ugc noopener" target="_blank">${u.length > 60 ? u.slice(0, 57) + "…" : u}</a>`);
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

const kruimel = (...delen) => `<nav class="f-kruimel" aria-label="Kruimelpad"><a href="/forum">Forum</a>${delen.map((d) => ` <span>›</span> ${d}`).join("")}</nav>`;

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
      <label class="f-fotoknop" title="Foto toevoegen">Foto<input type="file" accept="image/*" multiple data-foto hidden></label>
      <span class="f-status" aria-live="polite"></span>
    </div>
    <textarea name="${naam}" rows="8" required maxlength="20000" ${extra}>${esc(waarde)}</textarea>
  </div>`;

/* ---------------- pagina's ---------------- */

async function index(request, env, url, lid) {
  const cats = await categorieen(env);
  const ids = cats.map((c) => c.laatste_topic).filter(Boolean);
  const laatste = ids.length ? Object.fromEntries(((await env.SHOP_DB.prepare(
    `SELECT t.id, t.titel, t.laatste_op, t.berichten, l.gebruikersnaam FROM forum_topics t LEFT JOIN leden l ON l.id = t.laatste_lid_id WHERE t.id IN (${ids.map(() => "?").join(",")})`
  ).bind(...ids).all()).results || []).map((t) => [t.id, t])) : {};
  const gelezen = await gelezenMap(env, lid, ids);
  const stats = await env.SHOP_DB.prepare(`SELECT
      (SELECT COUNT(*) FROM forum_topics WHERE verwijderd = 0) topics,
      (SELECT COUNT(*) FROM forum_berichten WHERE verwijderd = 0) berichten,
      (SELECT COUNT(*) FROM leden WHERE gebruikersnaam IS NOT NULL AND geblokkeerd = 0) leden,
      (SELECT gebruikersnaam FROM leden WHERE gebruikersnaam IS NOT NULL AND geblokkeerd = 0 ORDER BY id DESC LIMIT 1) nieuwste`).first();

  let groep = "", rijen = "";
  for (const c of cats) {
    if (c.groep !== groep) { groep = c.groep; rijen += `<tr class="f-groep"><th colspan="4">${esc(groep)}</th></tr>`; }
    const t = laatste[c.laatste_topic];
    const nieuw = t && isNieuw(lid, t, gelezen);
    rijen += `<tr${nieuw ? ' class="f-nieuw"' : ""}><td class="f-cat">${icoon(c.icoon)}<div><a class="f-titel" href="/forum/c/${c.slug}">${esc(c.naam)}</a><small>${esc(c.omschrijving || "")}</small></div></td>
      <td class="f-num">${c.topics}</td><td class="f-num">${c.berichten}</td>
      <td class="f-laatste">${t ? `<a href="${topicUrl(t, Math.ceil(t.berichten / PER_PAGINA_BERICHTEN))}#laatste">${esc(t.titel)}</a><small>door ${lidLink(t.gebruikersnaam)} · ${datum(t.laatste_op)}</small>` : "<small>Nog geen berichten</small>"}</td></tr>`;
  }
  return pagina(env, request, {
    titel: "Forum", pad: "/forum", desc: "Het forum van Rover & Co: techniek, onderdelen, ritten en alles over Land Rover. Lezen kan iedereen, posten met een gratis account.",
    inhoud: banner("Rover & Co", "Forum", "Techniek, onderdelen, ritten en praat over Land Rover. Lezen kan iedereen, posten met een gratis account.") + `<section class="wrap f-sectie">
      ${balk(lid, "/forum")}
      <table class="f-tabel"><thead><tr><th>Forum</th><th class="f-num">Topics</th><th class="f-num">Berichten</th><th class="f-laatste">Laatste bericht</th></tr></thead><tbody>${rijen}</tbody></table>
      <p class="f-stats">${stats.leden} leden · ${stats.topics} topics · ${stats.berichten} berichten${stats.nieuwste ? ` · Nieuwste lid: ${lidLink(stats.nieuwste)}` : ""}</p>
      ${lid ? "" : `<div class="f-oproep"><p><b>Zelf iets vragen of vertellen?</b> Maak een gratis account. Met hetzelfde account bestel je in de shop en schrijf je je in voor activiteiten.</p><a class="btn btn-solid" href="/account/registreren?terug=/forum">Account maken</a></div>`}
    </section>`,
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
    return `<tr${nieuw ? ' class="f-nieuw"' : ""}><td class="f-cat"><div>${t.vast ? '<span class="f-label">Vast</span> ' : ""}${t.gesloten ? '<span class="f-label grijs">Gesloten</span> ' : ""}<a class="f-titel" href="${topicUrl(t)}">${esc(t.titel)}</a>${nieuw ? ' <span class="f-label nieuw">Nieuw</span>' : ""}<small>door ${lidLink(t.auteur)} · ${datum(t.aangemaakt, true)}${paginas > 1 ? ` · pagina ${Array.from({ length: Math.min(paginas, 5) }, (_, i) => `<a href="${topicUrl(t, i + 1)}">${i + 1}</a>`).join(" ")}${paginas > 5 ? " …" : ""}` : ""}</small></div></td>
      <td class="f-num">${Math.max(0, t.berichten - 1)}</td>
      <td class="f-laatste"><a href="${topicUrl(t, paginas)}#laatste">${datum(t.laatste_op)}</a><small>door ${lidLink(t.laatste)}</small></td></tr>`;
  }).join("");
  const nieuwKnop = lid ? `<a class="btn btn-solid" href="/forum/c/${c.slug}/nieuw">Nieuw topic</a>` : `<a class="btn btn-solid" href="/account/inloggen?terug=${encodeURIComponent(`/forum/c/${c.slug}/nieuw`)}">Log in om een topic te starten</a>`;
  return pagina(env, request, {
    titel: `${c.naam} – Forum`, pad: `/forum/c/${c.slug}${pag > 1 ? `?p=${pag}` : ""}`, desc: `${c.naam}: ${c.omschrijving || ""} Op het forum van Rover & Co.`,
    inhoud: banner("Forum", c.naam, c.omschrijving || "") + `<section class="wrap f-sectie">
      ${balk(lid, `/forum/c/${c.slug}`)}${kruimel(esc(c.naam))}
      <div class="f-kop">${nieuwKnop}${paginering(pag, Math.ceil(totaal / PER_PAGINA_TOPICS), (i) => `/forum/c/${c.slug}?p=${i}`)}</div>
      ${topics.length ? `<table class="f-tabel"><thead><tr><th>Topic</th><th class="f-num">Antwoorden</th><th class="f-laatste">Laatste bericht</th></tr></thead><tbody>${rijen}</tbody></table>`
        : `<div class="f-leeg"><p>Hier staat nog niets. Start jij het eerste topic?</p>${nieuwKnop}</div>`}
      <div class="f-kop">${paginering(pag, Math.ceil(totaal / PER_PAGINA_TOPICS), (i) => `/forum/c/${c.slug}?p=${i}`)}</div>
    </section>`,
  });
}

async function topic(request, env, url, lid, id) {
  const t = await env.SHOP_DB.prepare("SELECT t.*, c.slug AS cslug, c.naam AS cnaam FROM forum_topics t JOIN forum_categorieen c ON c.id = t.categorie_id WHERE t.id = ? AND t.verwijderd = 0").bind(id).first();
  if (!t) return null;
  const totaal = t.berichten;
  const paginas = Math.max(1, Math.ceil(totaal / PER_PAGINA_BERICHTEN));
  const pag = Math.min(paginas, Math.max(1, parseInt(url.searchParams.get("p"), 10) || 1));
  const berichten = (await env.SHOP_DB.prepare(`SELECT b.*, l.gebruikersnaam, l.avatar_id, l.aangemaakt AS lid_sinds, l.landrover, l.woonplaats, l.geblokkeerd
      FROM forum_berichten b LEFT JOIN leden l ON l.id = b.lid_id WHERE b.topic_id = ? AND b.verwijderd = 0 ORDER BY b.id LIMIT ? OFFSET ?`
  ).bind(t.id, PER_PAGINA_BERICHTEN, (pag - 1) * PER_PAGINA_BERICHTEN).all()).results || [];
  const auteurs = [...new Set(berichten.map((b) => b.lid_id))];
  const tellers = auteurs.length ? Object.fromEntries(((await env.SHOP_DB.prepare(
    `SELECT lid_id, COUNT(*) n FROM forum_berichten WHERE verwijderd = 0 AND lid_id IN (${auteurs.map(() => "?").join(",")}) GROUP BY lid_id`
  ).bind(...auteurs).all()).results || []).map((r) => [r.lid_id, r.n])) : {};
  const eersteId = (await env.SHOP_DB.prepare("SELECT MIN(id) id FROM forum_berichten WHERE topic_id = ? AND verwijderd = 0").bind(t.id).first())?.id;

  if (lid) await env.SHOP_DB.prepare("INSERT INTO forum_gelezen (lid_id, topic_id, op) VALUES (?, ?, ?) ON CONFLICT(lid_id, topic_id) DO UPDATE SET op = excluded.op").bind(lid.id, t.id, nu()).run();

  const kan = (b) => lid && (lid.beheerder || (b.lid_id === lid.id && !t.gesloten));
  const posts = berichten.map((b, i) => `
    <article class="f-post" id="b${b.id}"${i === berichten.length - 1 ? ' data-laatste' : ""}>
      ${i === berichten.length - 1 ? '<a id="laatste"></a>' : ""}
      <aside class="f-auteur">${avatar({ gebruikersnaam: b.gebruikersnaam, avatar_id: b.avatar_id }, 56)}
        <div>${lidLink(b.gebruikersnaam)}${b.geblokkeerd ? ' <span class="f-label grijs">Geblokkeerd</span>' : ""}
        <small>${tellers[b.lid_id] || 0} berichten<br>Lid sinds ${datum(b.lid_sinds, true)}${b.landrover ? `<br>${esc(b.landrover)}` : ""}</small></div></aside>
      <div class="f-inhoud">
        <div class="f-meta"><a href="#b${b.id}">${datum(b.aangemaakt)}</a>${b.bewerkt_op ? ` <small>(bewerkt ${datum(b.bewerkt_op)})</small>` : ""}</div>
        <div class="f-tekst">${opmaak(b.tekst)}</div>
        <div class="f-acties">
          ${lid && !t.gesloten ? `<button type="button" class="linkknop" data-citeer="${esc(b.gebruikersnaam || "")}" data-ruw="${esc(b.tekst)}">Citeren</button>` : ""}
          ${kan(b) ? `<a href="/forum/b/${b.id}/bewerk">Bewerken</a>` : ""}
          <details class="f-meld"><summary>Melden</summary><form method="post" action="/forum/b/${b.id}/meld"><input name="reden" maxlength="300" placeholder="Wat is er mis met dit bericht?" required><button class="btn" type="submit">Verstuur</button></form></details>
          ${lid?.beheerder ? `<form method="post" action="/forum/mod" class="f-mod" data-bevestig="${b.id === eersteId ? "Het hele topic verwijderen?" : "Dit bericht verwijderen?"}"><input type="hidden" name="actie" value="${b.id === eersteId ? "verwijder-topic" : "verwijder-bericht"}"><input type="hidden" name="id" value="${b.id === eersteId ? t.id : b.id}"><button class="linkknop rood" type="submit">Verwijderen</button></form>
            ${b.lid_id !== lid.id && !b.geblokkeerd ? `<form method="post" action="/forum/mod" class="f-mod" data-bevestig="${esc(b.gebruikersnaam || "")} blokkeren? Die kan dan niet meer inloggen."><input type="hidden" name="actie" value="blokkeer"><input type="hidden" name="id" value="${b.lid_id}"><button class="linkknop rood" type="submit">Lid blokkeren</button></form>` : ""}` : ""}
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
    inhoud: banner(t.cnaam, t.titel) + `<section class="wrap f-sectie">
      ${balk(lid, topicUrl(t, pag))}${kruimel(`<a href="/forum/c/${t.cslug}">${esc(t.cnaam)}</a>`, esc(t.titel))}${m}${mod}
      <div class="f-kop">${t.gesloten ? '<span class="f-label grijs">Gesloten</span>' : lid ? '<a class="btn btn-solid" href="#antwoord">Antwoorden</a>' : ""}${pg}</div>
      ${posts}
      <div class="f-kop">${pg}</div>
      ${antwoord}
    </section><script src="/assets/js/forum.js" defer></script>`,
  });
}

function postFormulier(env, request, { titel, kop, actie, toonTitel, w = {}, m = "", terug }) {
  return pagina(env, request, {
    titel, noindex: true,
    inhoud: banner("Forum", kop) + `<section class="wrap f-sectie">${terug}
      ${m ? `<div class="melding melding-fout" role="alert">${esc(m)}</div>` : ""}
      <form class="f-antwoord" method="post" action="${actie}">
        ${toonTitel ? `<div class="veld"><label for="f-titel">Titel</label><input id="f-titel" name="titel" maxlength="120" minlength="5" required value="${esc(w.titel || "")}"></div>` : ""}
        ${editor("tekst", w.tekst || "")}
        <button class="btn btn-solid" type="submit">Plaatsen</button>
      </form>
      <p class="f-hulp">Opmaak: [b]vet[/b], [i]schuin[/i], [quote=naam]citaat[/quote]. Links worden vanzelf klikbaar. Foto's voeg je toe met de knop Foto.</p>
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
  const toon = (m, w) => postFormulier(env, request, { titel: "Nieuw topic", kop: `Nieuw topic in ${c.naam}`, actie: `/forum/c/${c.slug}/nieuw`, toonTitel: true, w, m,
    terug: kruimel(`<a href="/forum/c/${c.slug}">${esc(c.naam)}</a>`, "Nieuw topic") });
  if (request.method !== "POST") return toon();
  const f = await request.formData();
  const w = { titel: tekst(f.get("titel"), 120).replace(/\s+/g, " "), tekst: tekst(f.get("tekst"), 20000) };
  if (w.titel.length < 5) return toon("Geef je topic een titel van minstens 5 tekens.", w);
  if (w.tekst.length < 2) return toon("Schrijf eerst je bericht.", w);
  const snel = await teSnel(env, lid, true);
  if (snel) return toon(snel, w);
  const t = nu();
  const r = await env.SHOP_DB.prepare("INSERT INTO forum_topics (categorie_id, titel, lid_id, aangemaakt, laatste_op, laatste_lid_id, berichten) VALUES (?, ?, ?, ?, ?, ?, 1)")
    .bind(c.id, w.titel, lid.id, t, t, lid.id).run();
  const id = r.meta.last_row_id;
  await env.SHOP_DB.prepare("INSERT INTO forum_berichten (topic_id, lid_id, tekst, aangemaakt) VALUES (?, ?, ?, ?)").bind(id, lid.id, w.tekst, t).run();
  return naar(topicUrl({ id, titel: w.titel }));
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
  const r = await env.SHOP_DB.prepare("INSERT INTO forum_berichten (topic_id, lid_id, tekst, aangemaakt) VALUES (?, ?, ?, ?)").bind(t.id, lid.id, w.tekst, nu()).run();
  await herbereken(env, t.id);
  const n = (await env.SHOP_DB.prepare("SELECT berichten FROM forum_topics WHERE id = ?").bind(t.id).first()).berichten;
  return naar(`${topicUrl(t, Math.ceil(n / PER_PAGINA_BERICHTEN))}#b${r.meta.last_row_id}`);
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
  if (eerste) await env.SHOP_DB.prepare("UPDATE forum_topics SET titel = ? WHERE id = ?").bind(w.titel, b.tid).run();
  const pos = (await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM forum_berichten WHERE topic_id = ? AND verwijderd = 0 AND id <= ?").bind(b.tid, b.id).first()).n;
  return naar(`${topicUrl({ id: b.tid, titel: eerste ? w.titel : b.titel }, Math.ceil(pos / PER_PAGINA_BERICHTEN))}#b${b.id}`);
}

async function meld(request, env, url, lid, id) {
  const b = await env.SHOP_DB.prepare("SELECT b.*, t.titel, l.gebruikersnaam FROM forum_berichten b JOIN forum_topics t ON t.id = b.topic_id LEFT JOIN leden l ON l.id = b.lid_id WHERE b.id = ?").bind(id).first();
  if (!b) return null;
  const f = await request.formData();
  const reden = tekst(f.get("reden"), 300);
  const ip = await sha("ip:" + (request.headers.get("cf-connecting-ip") || ""));
  const recent = await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM forum_meldingen WHERE (ip_hash = ? OR lid_id = ?) AND aangemaakt > ?").bind(ip, lid?.id || -1, new Date(Date.now() - 3600_000).toISOString()).first();
  const terug = topicUrl({ id: b.topic_id, titel: b.titel });
  if (recent.n >= 5) return naar(`${terug}?gemeld=1#b${b.id}`);
  await env.SHOP_DB.prepare("INSERT INTO forum_meldingen (bericht_id, lid_id, ip_hash, reden, aangemaakt) VALUES (?, ?, ?, ?, ?)").bind(b.id, lid?.id || null, ip, reden, nu()).run();
  const aan = (env.BEHEER_EMAILS || "pieter@roverandco.be").split(",")[0].trim();
  await mail(env, {
    aan, onderwerp: `Melding op het forum: ${b.titel}`,
    tekst: `Er werd een bericht gemeld op het forum.\n\nTopic: ${b.titel}\nBericht van: ${b.gebruikersnaam || "?"}\nGemeld door: ${lid?.gebruikersnaam || "bezoeker zonder account"}\nReden: ${reden || "(geen reden)"}\n\nBericht:\n${String(b.tekst).slice(0, 1500)}\n\nBekijk het hier (log in om te modereren):\n${url.origin}${terug}#b${b.id}`,
  });
  return naar(`${terug}?gemeld=1#b${b.id}`);
}

async function moderatie(request, env, url, lid) {
  if (!lid?.beheerder) return new Response("Geen toegang.", { status: 403 });
  const f = await request.formData();
  const actie = String(f.get("actie") || "");
  const id = parseInt(f.get("id"), 10) || 0;
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
    titel: "Recente berichten – Forum", noindex: true,
    inhoud: banner("Forum", "Recente berichten") + `<section class="wrap f-sectie">${balk(lid, "/forum/nieuw")}${kruimel("Recente berichten")}
      ${topics.length ? `<table class="f-tabel"><thead><tr><th>Topic</th><th class="f-num">Antwoorden</th><th class="f-laatste">Laatste bericht</th></tr></thead><tbody>${rijen}</tbody></table>` : `<div class="f-leeg"><p>Nog geen berichten.</p></div>`}
    </section>`,
  });
}

async function profiel(request, env, url, lid, naam) {
  const p = await env.SHOP_DB.prepare("SELECT id, gebruikersnaam, aangemaakt, woonplaats, landrover, avatar_id, geblokkeerd FROM leden WHERE gebruikersnaam = ?").bind(naam).first();
  if (!p) return null;
  const n = (await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM forum_berichten WHERE lid_id = ? AND verwijderd = 0").bind(p.id).first()).n;
  const laatste = (await env.SHOP_DB.prepare(`SELECT DISTINCT t.id, t.titel, t.laatste_op FROM forum_berichten b JOIN forum_topics t ON t.id = b.topic_id
      WHERE b.lid_id = ? AND b.verwijderd = 0 AND t.verwijderd = 0 ORDER BY t.laatste_op DESC LIMIT 10`).bind(p.id).all()).results || [];
  return pagina(env, request, {
    titel: `${p.gebruikersnaam} – Forum`, noindex: true,
    inhoud: banner("Forum", p.gebruikersnaam) + `<section class="wrap f-sectie">${balk(lid, url.pathname)}${kruimel("Leden", esc(p.gebruikersnaam))}
      <div class="acc-kaart f-profiel">${avatar(p, 96)}<dl class="acc-dl"><dt>Lid sinds</dt><dd>${datum(p.aangemaakt, true)}</dd><dt>Berichten</dt><dd>${n}</dd>
        ${p.woonplaats ? `<dt>Woonplaats</dt><dd>${esc(p.woonplaats)}</dd>` : ""}${p.landrover ? `<dt>Land Rover</dt><dd>${esc(p.landrover)}</dd>` : ""}${p.geblokkeerd ? "<dt>Status</dt><dd>Geblokkeerd</dd>" : ""}</dl></div>
      <h2 class="f-h2">Laatst actief in</h2>
      ${laatste.length ? `<ul class="f-lijst">${laatste.map((t) => `<li><a href="${topicUrl(t)}">${esc(t.titel)}</a> <small>${datum(t.laatste_op)}</small></li>`).join("")}</ul>` : "<p>Nog geen berichten.</p>"}
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
  if (request.method === "POST" && !eigenOrigin(request, url)) return new Response("Geweigerd.", { status: 403 });
  const lid = await huidigLid(request, env);
  const post = request.method === "POST";
  const moetLid = () => naar(`/account/inloggen?terug=${encodeURIComponent(p)}`);
  const moetNaam = () => naar("/account/gegevens");
  let res = null;

  if (p === "/forum") res = await index(request, env, url, lid);
  else if (p === "/forum/nieuw") res = await recent(request, env, url, lid);
  else if (p === "/forum/foto" && post) res = lid ? await fotoOpladen(request, env, lid) : json({ ok: false, fout: "Log eerst in." }, 401);
  else if (p === "/forum/mod" && post) res = await moderatie(request, env, url, lid);
  else if ((m = p.match(/^\/forum\/c\/([a-z0-9-]+)$/))) res = await categorie(request, env, url, lid, m[1]);
  else if ((m = p.match(/^\/forum\/c\/([a-z0-9-]+)\/nieuw$/))) res = !lid ? moetLid() : !lid.gebruikersnaam ? moetNaam() : await nieuwTopic(request, env, url, lid, m[1]);
  else if ((m = p.match(/^\/forum\/t\/(\d{1,10})(?:-[a-z0-9-]*)?$/))) res = await topic(request, env, url, lid, m[1]);
  else if ((m = p.match(/^\/forum\/t\/(\d{1,10})\/antwoord$/)) && post) res = !lid ? moetLid() : !lid.gebruikersnaam ? moetNaam() : await antwoorden(request, env, url, lid, m[1]);
  else if ((m = p.match(/^\/forum\/b\/(\d{1,10})\/bewerk$/))) res = !lid ? moetLid() : await bewerk(request, env, url, lid, m[1]);
  else if ((m = p.match(/^\/forum\/b\/(\d{1,10})\/meld$/)) && post) res = await meld(request, env, url, lid, m[1]);
  else if ((m = p.match(/^\/forum\/lid\/([^/]{1,40})$/))) res = await profiel(request, env, url, lid, decodeURIComponent(m[1]));

  return res || pagina(env, request, { titel: "Niet gevonden", noindex: true, status: 404,
    inhoud: banner("Forum", "Niet gevonden") + `<section class="narrow acc-sectie"><div class="acc-kaart"><p>Deze pagina bestaat niet (meer).</p><a class="btn btn-solid" href="/forum">Naar het forum</a></div></section>` });
}
