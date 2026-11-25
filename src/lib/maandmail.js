// Maandelijkse nieuwsmail van Rover & Co (beslist door Pieter, 25 nov 2026):
// - blokken: Nieuw op het platform (eigen tekst), Activiteiten + kalender, Zoekertjes (4 tegels), Blog, Kampvuur, Landy's (4 tegels)
// - naar alle actieve accounts; wie zich afmeldt (leden.maandmail = 0) krijgt niets meer
// - op de 1ste van de maand krijgt Pieter een testmail; versturen pas na zijn klik op /beheer/maandmail
// - de inhoud wordt bij het klaarzetten vastgelegd (instellingen.maandmail_editie), zodat iedereen dezelfde mail krijgt
// - versturen gebeurt druppelsgewijs via de wachtrij (campagne "maandmail" in beheer-versturen.js)
import { esc } from "./mail.js";
import { verstuur } from "./mail.js";
import { pagina } from "./beheer.js";
import { komendeKalender } from "./aanbod.js";
import { afmeldLink } from "./leden.js";
import BLOG from "../../data/blog-nieuws.json";

const SITE = "https://roverandco.be";
const TESTADRES = "pieter@susconsult.be";
const GROEN = "#1F3B2A", GROEN3 = "#3E7350", LICHTGROEN = "#9FC5A8", ZACHT = "#F6F3EA", ZAND2 = "#DED5BF", INKT = "#141815", GRIJS = "#5B625C";
const FONT = "Inter,'Helvetica Neue',Arial,sans-serif";
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const slugify = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const voornaam = (n) => { const v = String(n || "").trim().split(/\s+/)[0] || ""; return v ? v[0].toUpperCase() + v.slice(1) : ""; };
const nuBrussel = () => {
  const d = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { jaar: +d.year, maand: +d.month, dag: +d.day, uur: +d.hour % 24 };
};
// De mail van begin december gaat over november: we noemen de vorige maand.
export function editieNu() {
  const { jaar, maand } = nuBrussel();
  const vj = maand === 1 ? jaar - 1 : jaar, vm = maand === 1 ? 12 : maand - 1;
  return { code: `${jaar}-${String(maand).padStart(2, "0")}`, maandNaam: MAANDEN[vm - 1], jaarVan: vj };
}

let kolomKlaar = false;
export async function zorgKolom(env) {
  if (kolomKlaar) return;
  await env.SHOP_DB.prepare("ALTER TABLE leden ADD COLUMN maandmail INTEGER").run().catch(() => {});
  kolomKlaar = true;
}
const instelling = async (env, k) => (await env.SHOP_DB.prepare("SELECT waarde FROM instellingen WHERE sleutel = ?").bind(k).first().catch(() => null))?.waarde ?? null;
const zet = (env, k, v) => env.SHOP_DB.prepare("INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde").bind(k, v).run();

/* ---------- inhoud verzamelen ---------- */

const MAANDKORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const datumKort = (iso) => { const [, m, d] = String(iso).split("-").map(Number); return `${d} ${MAANDKORT[m - 1]}`; };
const prijsTekst = (z) => z.prijs_soort === "gratis" ? "Gratis" : z.prijs_soort === "bod" ? (z.prijs ? `Bod vanaf € ${Number(z.prijs).toLocaleString("nl-BE")}` : "Bod") : z.prijs != null ? `€ ${Number(z.prijs).toLocaleString("nl-BE")}` : "Prijs op aanvraag";

export async function verzamel(env, sinds) {
  const db = env.SHOP_DB;
  const q = async (sql, ...b) => ((await db.prepare(sql).bind(...b).all().catch(() => ({ results: [] }))).results || []);

  const kal = (await komendeKalender(env, 60).catch(() => [])).slice(0, 6).map((k) => ({
    titel: k.titel, datum: k.einde && k.einde !== k.datum ? `${datumKort(k.datum)} – ${datumKort(k.einde)}` : datumKort(k.datum),
    plaats: String(k.plaats || "").split(" · ")[0], ons: !!k.ons, link: /^https?:/.test(k.link || "") ? k.link : SITE + (k.link || "/kalender"),
  }));

  const zk = (await q(`SELECT id, soort, titel, prijs, prijs_soort, plaats, fotos FROM zoekertjes WHERE status = 'actief' ORDER BY aangemaakt DESC LIMIT 4`)).map((z) => {
    let f = ""; try { f = (JSON.parse(z.fotos || "[]").find((u) => /^\/media\/\d+$/.test(u)) || ""); } catch {}
    return { titel: z.titel, sub: z.soort === "zoek" ? "Gezocht" : prijsTekst(z), foto: f ? SITE + f : "", link: `${SITE}/zoekertjes/${z.id}-${slugify(z.titel) || "zoekertje"}` };
  });

  const vuur = (await q(`SELECT t.id, t.titel, c.naam cnaam, COUNT(b.id) n FROM forum_berichten b JOIN forum_topics t ON t.id = b.topic_id
      JOIN forum_categorieen c ON c.id = t.categorie_id JOIN leden l ON l.id = b.lid_id
      WHERE b.aangemaakt >= ? AND b.verwijderd = 0 AND t.verwijderd = 0 AND COALESCE(l.geblokkeerd, 0) = 0
      GROUP BY t.id ORDER BY n DESC, MAX(b.id) DESC LIMIT 4`, sinds)).map((t) => ({
    titel: t.titel, sub: `${t.cnaam} · ${t.n} ${t.n === 1 ? "bericht" : "berichten"} deze maand`, link: `${SITE}/forum/t/${t.id}-${slugify(t.titel)}`,
  }));

  const landys = (await q(`SELECT w.id, w.naam, w.type, w.bouwjaar, w.foto_id, l.gebruikersnaam FROM lid_wagens w JOIN leden l ON l.id = w.lid_id
      WHERE w.foto_id IS NOT NULL AND l.verwijderd_op IS NULL AND COALESCE(l.geblokkeerd, 0) = 0 ORDER BY w.id DESC LIMIT 4`)).map((w) => ({
    titel: w.naam || w.type, sub: `${w.naam ? w.type + " · " : ""}van ${w.gebruikersnaam || "een lid"}`, foto: `${SITE}/forum/foto/${w.foto_id}`,
    link: `${SITE}/forum/lid/${encodeURIComponent(w.gebruikersnaam || "")}#wagen-${w.id}`,
  }));

  // Blog: de 4 nieuwste artikels (data/blog-nieuws.json, gemaakt door bouw/build.py).
  const blog = BLOG.slice(0, 4).map((b) => ({ titel: b.titel, sub: `${b.rubriek} · ${b.datum}`, foto: b.foto ? `${SITE}/assets/img/${b.foto}-s.webp` : "", link: `${SITE}/blog/${b.slug}` }));

  return { kal, zk, vuur, landys, blog };
}

/* ---------- de mail ---------- */

const kopje = (t) => `<div style="font-family:${FONT};font-size:12px;letter-spacing:2px;font-weight:700;color:${GROEN3};text-transform:uppercase;margin:0 0 10px">${esc(t)}</div>`;
const meer = (t, href) => `<div style="text-align:right;margin:2px 0 24px"><a href="${esc(href)}" style="font-family:${FONT};font-size:14px;font-weight:700;color:${GROEN3};text-decoration:none">${esc(t)} &rarr;</a></div>`;

// 2 x 2 kleine tegels (zoekertjes, Landy's). Foto's houden hun eigen verhouding: Gmail kent geen object-fit.
function tegels(items) {
  const cel = (x) => !x ? `<td width="50%" style="padding:5px"></td>` : `<td width="50%" valign="top" style="padding:5px">
<a href="${esc(x.link)}" style="text-decoration:none;color:${INKT}">${x.foto ? `<img src="${esc(x.foto)}" width="240" alt="${esc(x.titel)}" style="display:block;border:0;width:100%;max-width:240px;height:auto;border-radius:8px;background:${ZACHT}">`
    : `<div style="background:${ZACHT};border-radius:8px;padding:30px 8px;text-align:center;font-family:${FONT};font-size:12px;color:${GRIJS}">Geen foto</div>`}
<div style="font-family:${FONT};font-size:14px;font-weight:700;line-height:1.3;color:${INKT};margin:6px 0 1px">${esc(x.titel)}</div>
<div style="font-family:${FONT};font-size:12px;color:${GROEN3}">${esc(x.sub)}</div></a></td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" >
<tr>${cel(items[0])}${cel(items[1])}</tr>${items.length > 2 ? `<tr>${cel(items[2])}${cel(items[3])}</tr>` : ""}</table>`;
}
const rijen = (items, metFoto = false) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT}">` + items.map((x) =>
  `<tr>${metFoto && x.foto ? `<td width="76" style="padding:8px 12px 8px 0;vertical-align:middle"><a href="${esc(x.link)}"><img src="${esc(x.foto)}" width="64" height="64" alt="" style="display:block;border:0;width:64px;height:64px;border-radius:8px"></a></td>` : ""}
<td style="padding:9px 0;vertical-align:middle;border-bottom:1px solid ${ZAND2}"><a href="${esc(x.link)}" style="font-size:15px;font-weight:700;color:${INKT};text-decoration:none">${esc(x.titel)}</a>
<div style="font-size:13px;color:${GROEN3};margin-top:2px">${esc(x.sub)}</div></td></tr>`).join("") + `</table>`;
const kalRijen = (items) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT}">` + items.map((k) =>
  `<tr><td width="92" style="padding:8px 12px 8px 0;vertical-align:middle"><div style="background:${k.ons ? GROEN : ZACHT};color:${k.ons ? "#ffffff" : GROEN};border-radius:8px;padding:7px 4px;text-align:center;font-size:13px;font-weight:700;white-space:nowrap">${esc(k.datum)}</div></td>
<td style="padding:8px 0;vertical-align:middle;border-bottom:1px solid ${ZAND2}"><a href="${esc(k.link)}" style="font-size:15px;font-weight:700;color:${INKT};text-decoration:none">${esc(k.titel)}</a>
<div style="font-size:13px;color:${GRIJS};margin-top:2px">${k.ons ? `<b style="color:${GROEN3}">Rover &amp; Co</b>${k.plaats ? " · " : ""}` : ""}${esc(k.plaats)}</div></td></tr>`).join("") + `</table>`;

// lid = { naam, gebruikersnaam }; editie = { maandNaam, intro, data }
export function maandMail(lid, editie, { afmeld = "", test = false } = {}) {
  const { kal = [], zk = [], vuur = [], landys = [], blog = [] } = editie.data || {};
  const vn = voornaam(lid.naam) || lid.gebruikersnaam || "";
  const intro = String(editie.intro || "").trim();
  const titel = `Nieuws van ${editie.maandNaam}`;
  const voorkop = [zk.length && "nieuwe zoekertjes", landys.length && "Landy's van leden", kal.length && "wat er op de kalender staat"].filter(Boolean).join(", ") || "Het nieuws van de maand";

  const blokken = [
    intro && `${kopje("Nieuw op het platform")}<div style="background:${ZACHT};border-radius:12px;padding:16px 18px;margin:0 0 24px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INKT}">${intro.split(/\n{2,}/).map((a) => `<p style="margin:0 0 8px">${esc(a).replace(/\n/g, "<br>")}</p>`).join("")}</div>`,
    kal.length && `${kopje("Op de kalender")}${kalRijen(kal)}${meer("Hele kalender", SITE + "/kalender")}`,
    zk.length && `${kopje("Nieuwste zoekertjes")}${tegels(zk)}${meer("Alle zoekertjes", SITE + "/zoekertjes")}`,
    blog.length && `${kopje("Op de blog")}${rijen(blog, true)}${meer("Alle artikels", SITE + "/blog")}`,
    vuur.length && `${kopje("Rond het Kampvuur")}${rijen(vuur)}${meer("Naar het Kampvuur", SITE + "/forum")}`,
    landys.length && `${kopje("Nieuwe Landy's")}${tegels(landys)}${meer("Alle Landy's", SITE + "/landys")}`,
  ].filter(Boolean).join("");

  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(titel)}</title></head>
<body style="margin:0;padding:0;background:#ECE6D6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ECE6D6">${esc(voorkop[0].toUpperCase() + voorkop.slice(1))}.&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ECE6D6"><tr><td align="center" style="padding:24px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td align="center" style="background:${GROEN};padding:18px 20px 20px;font-family:${FONT}"><a href="${SITE}"><img src="cid:rc-logo" width="70" height="70" alt="Rover &amp; Co" style="display:block;border:0;width:70px;height:70px;margin:0 auto 10px"></a>
<div style="font-size:12px;letter-spacing:2px;font-weight:700;color:${LICHTGROEN};text-transform:uppercase">Maandnieuws</div>
<h1 style="margin:4px 0 6px;font-size:26px;line-height:1.2;color:#ffffff;font-weight:800">${esc(titel)}</h1>
<div style="font-size:15px;color:#ffffff">${vn ? `Hoi ${esc(vn)}, dit` : "Dit"} gebeurde er op roverandco.be.</div></td></tr>
<tr><td style="padding:26px 24px 4px">${blokken}</td></tr>
<tr><td align="center" style="background:${GROEN};padding:18px 20px 6px;font-family:${FONT}">
<a href="https://www.facebook.com/roverandcobe/" style="display:inline-block;margin:0 5px 8px;padding:9px 16px;border:1px solid ${LICHTGROEN};border-radius:8px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">Facebook</a>
<a href="https://www.instagram.com/roverandco.be/" style="display:inline-block;margin:0 5px 8px;padding:9px 16px;border:1px solid ${LICHTGROEN};border-radius:8px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">Instagram</a></td></tr>
<tr><td align="center" style="background:${GROEN};padding:8px 24px 20px;font-family:${FONT};font-size:13px;line-height:1.7;color:#ffffff">Vragen? Antwoord op deze mail of mail naar <a href="mailto:info@roverandco.be" style="color:#ffffff">info@roverandco.be</a>.<br>
${afmeld ? `Geen maandnieuws meer? <a href="${esc(afmeld)}" style="color:#ffffff;font-weight:700">Schrijf je hier uit</a>.<br>` : ""}<span style="color:${LICHTGROEN};font-size:12px">Rover &amp; Co VZW &middot; Je krijgt deze mail omdat je een account hebt op roverandco.be.</span></td></tr>
</table></td></tr></table></body></html>`;

  const lijst = (t, items, link) => items.length ? [t + ":", ...items.map((x) => `- ${x.titel}${x.datum ? ` (${x.datum})` : x.sub ? ` (${x.sub})` : ""}: ${x.link}`), `Meer: ${link}`, ""] : [];
  const tekst = [
    `${vn ? `Hoi ${vn}, dit` : "Dit"} gebeurde er in ${editie.maandNaam} op roverandco.be.`, "",
    ...(intro ? ["Nieuw op het platform:", intro, ""] : []),
    ...lijst("Op de kalender", kal, SITE + "/kalender"),
    ...lijst("Nieuwste zoekertjes", zk, SITE + "/zoekertjes"),
    ...lijst("Op de blog", blog, SITE + "/blog"),
    ...lijst("Rond het Kampvuur", vuur, SITE + "/forum"),
    ...lijst("Nieuwe Landy's", landys, SITE + "/landys"),
    "Facebook: https://www.facebook.com/roverandcobe/", "Instagram: https://www.instagram.com/roverandco.be/", "",
    "Vragen? Antwoord op deze mail of mail naar info@roverandco.be.", "Rover & Co VZW",
    ...(afmeld ? ["", `Geen maandnieuws meer? Schrijf je hier uit: ${afmeld}`] : []),
  ].join("\n");

  return {
    onderwerp: `${test ? "[TEST] " : ""}Rover & Co: ${titel.toLowerCase()}`,
    tekst, html, bijlagen: [],
    headers: afmeld ? { "List-Unsubscribe": `<${afmeld}&klik=1>, <mailto:info@roverandco.be?subject=Afmelden>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
  };
}

/* ---------- editie: concept (live) of vastgelegd ---------- */

async function vorigeVerzending(env) {
  const v = await instelling(env, "maandmail_editie");
  try { return v ? JSON.parse(v) : null; } catch { return null; }
}
// Het concept van deze maand: inhoud live verzameld sinds de vorige editie (of 31 dagen).
export async function concept(env) {
  const e = editieNu();
  const vorige = await vorigeVerzending(env);
  const sinds = vorige?.code !== e.code && vorige?.vastgelegd ? vorige.vastgelegd : new Date(Date.now() - 31 * 86400000).toISOString();
  return { ...e, intro: (await instelling(env, "maandmail_intro")) || "", data: await verzamel(env, sinds) };
}

// Wie krijgt de maandmail: alle actieve accounts, behalve wie zich afmeldde (maandmail = 0).
async function ontvangers(env) {
  await zorgKolom(env);
  return ((await env.SHOP_DB.prepare(`SELECT id, email, naam, gebruikersnaam FROM leden WHERE verwijderd_op IS NULL AND COALESCE(geblokkeerd, 0) = 0
    AND COALESCE(maandmail, 1) = 1 AND email LIKE '%_@_%' AND email NOT LIKE '%@kmoshops.%' ORDER BY id`).all()).results || []);
}

// Voor de wachtrij (beheer-versturen.js): mail voor één ontvanger uit de vastgelegde editie.
export async function maandMailVoor(env, rij) {
  const editie = await vorigeVerzending(env);
  if (!editie || !rij.sleutel.startsWith(editie.code + "-")) throw new Error("editie niet gevonden");
  const lid = await env.SHOP_DB.prepare("SELECT id, naam, gebruikersnaam, maandmail FROM leden WHERE id = ? AND verwijderd_op IS NULL").bind(rij.lid_id).first();
  if (!lid) throw new Error("lid niet gevonden");
  if (lid.maandmail === 0) throw new Error("afgemeld");
  const afmeld = await afmeldLink(env, SITE, lid.id);
  return metMeting(env, maandMail(lid, editie, { afmeld }), rij.id, afmeld);
}

/* ---------- eigen meting: opens (pixel) en kliks (doorverwijzing), alleen in de maandmail ---------- */
// Elke link wordt /m/k/<wachtrij-id>/<handtekening>?u=<doel>; de handtekening (HMAC) maakt van /m/k geen open doorverwijzer.
// Opens zijn een schatting: Apple Mail laadt afbeeldingen vooraf, andere mailprogramma's blokkeren ze.
async function sleutel(env) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode("maandmail|" + (env.RESEND_API_KEY || "rc")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function teken(env, tekst) {
  const s = await crypto.subtle.sign("HMAC", await sleutel(env), new TextEncoder().encode(tekst));
  return [...new Uint8Array(s)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function metMeting(env, m, id, afmeld) {
  const urls = [...new Set([...m.html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, "&")))].filter((u) => u !== afmeld);
  const kaart = {};
  for (const u of urls) kaart[u] = `${SITE}/m/k/${id}/${await teken(env, id + "|" + u)}?u=${encodeURIComponent(u)}`;
  m.html = m.html.replace(/href="(https?:\/\/[^"]+)"/g, (h, u) => { const k = kaart[u.replace(/&amp;/g, "&")]; return k ? `href="${esc(k)}"` : h; })
    .replace("</body>", `<img src="${SITE}/m/o/${id}/${await teken(env, id + "|open")}.gif" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px"></body>`);
  return m;
}
const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
let metingKlaar = false;
async function zorgMeting(env) {
  if (metingKlaar) return;
  await env.SHOP_DB.prepare("CREATE TABLE IF NOT EXISTS mail_meting (id INTEGER PRIMARY KEY, wachtrij_id INTEGER NOT NULL, soort TEXT NOT NULL, link TEXT, op TEXT NOT NULL)").run();
  await env.SHOP_DB.prepare("CREATE INDEX IF NOT EXISTS idx_mail_meting ON mail_meting(wachtrij_id, soort)").run();
  metingKlaar = true;
}
// Route /m/o/<id>/<sig>.gif en /m/k/<id>/<sig>?u=... (in src/worker.ts vóór de onderhoudspoort).
export async function meting(request, env, url) {
  const m = url.pathname.match(/^\/m\/(o|k)\/(\d{1,10})\/([0-9a-f]{24})(\.gif)?$/);
  if (!m) return null;
  const [, soort, id, sig] = m;
  const doel = soort === "k" ? url.searchParams.get("u") || "" : "";
  const geldig = sig === (await teken(env, id + "|" + (soort === "o" ? "open" : doel)));
  if (geldig) {
    try {
      await zorgMeting(env);
      // Per ontvanger hoogstens 1 open per uur en 1 klik per link per minuut in de tabel (dubbele laadbeurten).
      const grens = new Date(Date.now() - (soort === "o" ? 3600000 : 60000)).toISOString();
      const dubbel = await env.SHOP_DB.prepare("SELECT 1 FROM mail_meting WHERE wachtrij_id = ? AND soort = ? AND COALESCE(link, '') = ? AND op > ?").bind(+id, soort === "o" ? "open" : "klik", doel, grens).first();
      if (!dubbel) await env.SHOP_DB.prepare("INSERT INTO mail_meting (wachtrij_id, soort, link, op) VALUES (?, ?, ?, ?)").bind(+id, soort === "o" ? "open" : "klik", doel || null, new Date().toISOString()).run();
    } catch {}
  }
  if (soort === "o") return new Response(GIF, { headers: { "content-type": "image/gif", "cache-control": "no-store, private" } });
  return Response.redirect(geldig && /^https?:\/\//.test(doel) ? doel : SITE, 302);
}

async function cijfers(env, code) {
  await zorgMeting(env);
  const db = env.SHOP_DB, pat = code + "-%";
  const een = async (sql) => (await db.prepare(sql).bind(pat).first())?.n || 0;
  const verzonden = await een("SELECT COUNT(*) n FROM mail_wachtrij WHERE campagne = 'maandmail' AND sleutel LIKE ? AND status = 'verzonden'");
  const open = await een("SELECT COUNT(DISTINCT m.wachtrij_id) n FROM mail_meting m JOIN mail_wachtrij w ON w.id = m.wachtrij_id WHERE w.campagne = 'maandmail' AND w.sleutel LIKE ? AND m.soort = 'open'");
  const klik = await een("SELECT COUNT(DISTINCT m.wachtrij_id) n FROM mail_meting m JOIN mail_wachtrij w ON w.id = m.wachtrij_id WHERE w.campagne = 'maandmail' AND w.sleutel LIKE ? AND m.soort = 'klik'");
  const kliks = await een("SELECT COUNT(*) n FROM mail_meting m JOIN mail_wachtrij w ON w.id = m.wachtrij_id WHERE w.campagne = 'maandmail' AND w.sleutel LIKE ? AND m.soort = 'klik'");
  const links = ((await db.prepare(`SELECT m.link, COUNT(*) n, COUNT(DISTINCT m.wachtrij_id) mensen FROM mail_meting m JOIN mail_wachtrij w ON w.id = m.wachtrij_id
    WHERE w.campagne = 'maandmail' AND w.sleutel LIKE ? AND m.soort = 'klik' GROUP BY m.link ORDER BY n DESC LIMIT 10`).bind(pat).all()).results) || [];
  return { verzonden, open, klik, kliks, links };
}

export async function stuurTest(env, editie, aan = TESTADRES) {
  const m = maandMail({ naam: "Pieter" }, editie, { afmeld: `${SITE}/account/afmelden?t=test`, test: true });
  m.html = m.html.replace(`<tr><td style="padding:26px 24px 4px">`, `<tr><td style="background:#FFF4D6;padding:12px 24px;font-family:${FONT};font-size:14px;color:${INKT}"><b>Testmail.</b> Pas aan en verstuur op <a href="${SITE}/beheer/maandmail" style="color:${GROEN3};font-weight:700">roverandco.be/beheer/maandmail</a>. Er gaat niets naar de leden zolang jij niet op Versturen klikt.</td></tr><tr><td style="padding:26px 24px 4px">`);
  m.tekst = `TESTMAIL. Pas aan en verstuur op ${SITE}/beheer/maandmail\n\n` + m.tekst;
  return verstuur(env, { aan, ...m, headers: undefined });
}

// Cron: op de 1ste van de maand vanaf 9 u één testmail naar Pieter.
export async function maandmailCron(env) {
  const { dag, uur } = nuBrussel();
  if (dag !== 1 || uur < 9) return;
  const e = editieNu();
  if ((await instelling(env, "maandmail_test")) === e.code) return;
  await zet(env, "maandmail_test", e.code);
  const r = await stuurTest(env, await concept(env));
  await env.SHOP_DB.prepare("INSERT INTO lid_log (lid_id, soort, tekst, link, aangemaakt) VALUES (0, 'beheer', ?, '/beheer/maandmail', ?)")
    .bind(r.ok ? `Maandmail ${e.code}: testmail naar ${TESTADRES}` : `Maandmail ${e.code}: testmail mislukt (${r.fout || r.status})`, new Date().toISOString()).run().catch(() => {});
}

/* ---------- /beheer/maandmail ---------- */

const STIJL = `<style>.mm-rij{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}.mm-voorbeeld{width:100%;max-width:620px;height:900px;border:1px solid #DED5BF;border-radius:12px;background:#ECE6D6}
.mm-kaart{background:#fff;border:1px solid #DED5BF;border-radius:12px;padding:16px 18px;margin:0 0 16px;max-width:620px}.mm-kaart textarea{width:100%;min-height:110px;font:inherit;padding:10px;border:1px solid #cfc6b0;border-radius:8px;box-sizing:border-box}
.mm-cijfers{display:flex;gap:16px;flex-wrap:wrap;margin:8px 0 0;font-size:14px}.mm-cijfers b{font-size:20px;display:block}.mm-ok{background:#E6F2E8;color:#1F3B2A;padding:10px 14px;border-radius:8px}.mm-fout{background:#FBE9E7;color:#8A1F11;padding:10px 14px;border-radius:8px}</style>`;

const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "–");
async function statsHtml(env, code, editie) {
  const c = await cijfers(env, code);
  const afgemeld = (await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM lid_log WHERE tekst IN ('Afgemeld voor nieuwsmails', 'Afgemeld voor maandnieuws') AND aangemaakt >= ?").bind(editie.vastgelegd).first().catch(() => null))?.n || 0;
  const titels = {};
  const d = editie.data || {};
  for (const x of [...(d.kal || []), ...(d.zk || []), ...(d.blog || []), ...(d.vuur || []), ...(d.landys || [])]) titels[x.link] = x.titel;
  const naam = (u) => titels[u] || u.replace(/^https?:\/\/(www\.)?/, "").replace(/^roverandco\.be/, "") || "/";
  return `<div class="mm-cijfers" style="margin-top:14px"><span><b>${pct(c.open, c.verzonden)}</b>open rate (${c.open})</span><span><b>${pct(c.klik, c.verzonden)}</b>CTR (${c.klik})</span>
<span><b>${pct(c.klik, c.open)}</b>klik na openen</span><span><b>${c.kliks}</b>kliks totaal</span><span><b>${afgemeld}</b>afgemeld</span></div>
${c.links.length ? `<table style="width:100%;font-size:14px;margin-top:12px;border-collapse:collapse"><tr><th style="text-align:left">Meest geklikt</th><th>kliks</th><th>mensen</th></tr>${c.links.map((l) => `<tr style="border-top:1px solid #DED5BF"><td style="padding:5px 0">${esc(naam(l.link))}</td><td style="text-align:center">${l.n}</td><td style="text-align:center">${l.mensen}</td></tr>`).join("")}</table>` : ""}
<p style="font-size:12px;color:#5B625C">Open rate is een schatting: Apple Mail opent mails vooraf (te hoog), andere programma's blokkeren afbeeldingen (te laag). CTR = unieke klikkers / verzonden.</p>`;
}

export async function beheerMaandmail(request, env, url, email) {
  if (url.pathname !== "/beheer/maandmail") return null;
  await zorgKolom(env);
  const e = editieNu();
  let melding = "";
  if (request.method === "POST") {
    const f = await request.formData();
    const actie = String(f.get("actie") || "");
    if (f.has("intro")) await zet(env, "maandmail_intro", String(f.get("intro") || "").slice(0, 2000));
    if (actie === "test") {
      const r = await stuurTest(env, await concept(env));
      melding = r.ok ? `Testmail verstuurd naar ${TESTADRES}.` : `!Testmail mislukt: ${r.fout || r.status}`;
    } else if (actie === "versturen") {
      const vorige = await vorigeVerzending(env);
      if (vorige?.code === e.code) melding = "!De maandmail van deze maand staat al klaar of is al verstuurd.";
      else {
        const c = await concept(env);
        const lijst = await ontvangers(env);
        await zet(env, "maandmail_editie", JSON.stringify({ ...c, vastgelegd: new Date().toISOString(), door: email, ontvangers: lijst.length }));
        const st = env.SHOP_DB.prepare("INSERT OR IGNORE INTO mail_wachtrij (campagne, sleutel, lid_id, email, naam) VALUES ('maandmail', ?, ?, ?, ?)");
        for (let i = 0; i < lijst.length; i += 50) await env.SHOP_DB.batch(lijst.slice(i, i + 50).map((l) => st.bind(`${e.code}-${l.id}`, l.id, l.email, l.gebruikersnaam || l.naam || "")));
        await zet(env, "maandmail_intro", "");
        await env.SHOP_DB.prepare("INSERT INTO lid_log (lid_id, soort, tekst, link, aangemaakt) VALUES (0, 'beheer', ?, '/beheer/maandmail', ?)")
          .bind(`Maandmail ${e.code} klaargezet voor ${lijst.length} leden door ${email}`, new Date().toISOString()).run().catch(() => {});
        melding = `Klaargezet voor ${lijst.length} leden. De mails vertrekken automatisch, elk kwartier een paar, tussen 8 en 21 u.`;
      }
    } else melding = "Tekst bewaard.";
  }

  const vorige = await vorigeVerzending(env);
  const al = vorige?.code === e.code;
  const telling = al ? Object.fromEntries((((await env.SHOP_DB.prepare("SELECT status, COUNT(*) n FROM mail_wachtrij WHERE campagne = 'maandmail' AND sleutel LIKE ? GROUP BY status").bind(e.code + "-%").all()).results) || []).map((r) => [r.status, r.n])) : {};
  const ed = al ? vorige : await concept(env);
  const aantal = al ? vorige.ontvangers : (await ontvangers(env)).length;
  const voorbeeld = maandMail({ naam: "Pieter" }, ed, { afmeld: `${SITE}/account/afmelden` }).html.replace(/cid:rc-logo/g, "/assets/img/logo-licht.webp");
  const ms = melding ? `<p class="${melding.startsWith("!") ? "mm-fout" : "mm-ok"}">${esc(melding.replace(/^!/, ""))}</p>` : "";

  const inhoud = `<!--aan:maandmail-->${STIJL}${ms}
<div class="mm-kaart">${al
    ? `<b>Maandnieuws van ${esc(ed.maandNaam)}: klaargezet</b> op ${esc(new Date(vorige.vastgelegd).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" }))}.
<div class="mm-cijfers"><span><b>${telling.verzonden || 0}</b>verzonden</span><span><b>${(telling.wacht || 0) + (telling.bezig || 0)}</b>wachten</span><span><b>${telling.fout || 0}</b>mislukt</span><span><b>${aantal}</b>ontvangers</span></div>
${await statsHtml(env, e.code, vorige)}
<p style="font-size:14px;color:#5B625C">De mails vertrekken automatisch via de wachtrij (elk kwartier een paar, tussen 8 en 21 u). Mislukte mails zet je opnieuw klaar op <a href="/beheer/versturen">Versturen</a>.</p>`
    : `<form method="post"><label for="intro"><b>Nieuw op het platform</b> <small>(mag leeg blijven, dan valt het blok weg)</small></label>
<textarea id="intro" name="intro" maxlength="2000" placeholder="Bijvoorbeeld: Vanaf nu kan je zoekertjes plaatsen.">${esc(ed.intro)}</textarea>
<div class="mm-rij"><button class="btn" name="actie" value="bewaar">Bewaren</button><button class="btn" name="actie" value="test">Testmail naar mij</button>
<button class="btn btn-solid" name="actie" value="versturen" onclick="return confirm('Maandnieuws van ${esc(ed.maandNaam)} versturen naar ${aantal} leden?')">Versturen naar ${aantal} leden</button></div>
<p style="font-size:14px;color:#5B625C;margin:0">Gaat naar alle actieve accounts, behalve wie zich afmeldde. Op de 1ste van elke maand krijg je automatisch een testmail op ${TESTADRES}.</p></form>`}</div>
<iframe class="mm-voorbeeld" title="Voorbeeld van de maandmail" sandbox srcdoc="${esc(voorbeeld)}"></iframe>`;
  return pagina(`Maandmail`, inhoud, email);
}
