// Hartjes onder blogartikels (keuze Pieter 20 nov 2026): iedereen mag liken, één hartje per browser
// (cookie rc_bz), aantal zichtbaar in het artikel en op de blogkaartjes, de schrijver krijgt een melding
// in het belletje (hoogstens één per artikel per dag). Welke artikels er zijn: data/blog-index.json
// (gemaakt door bouw/build.py). Schrijver → lid: D1 instellingen sleutel "blog_auteurs" = {"pieter": 1, ...}.
//   GET  /api/blog/likes?s=slug1,slug2  → { n: { slug: aantal }, mijn: [slug, ...] }
//   POST /api/blog/like   { slug }       → { ok, n, mijn }
import ARTIKELS from "../../data/blog-index.json";
import { eigenOrigin, sha, willekeurig } from "./sjabloon.js";
import { huidigLid } from "./leden.js";
import { meld } from "./forum-extra.js";

const COOKIE = "rc_bz";
const json = (d, status = 200, extra = {}) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
const bezoekerVan = (request) => ((request.headers.get("cookie") || "").match(/(?:^|;\s*)rc_bz=([a-f0-9]{32})/) || [])[1] || "";

// Ook Land Rovers van leden kunnen een hartje krijgen (wens Pieter 20 nov 2026): sleutel "wagen-<id>".
const WAGEN = /^wagen-(\d{1,9})$/;
async function info(env, sleutel) {
  if (ARTIKELS[sleutel]) return { soort: "blog", ...ARTIKELS[sleutel] };
  const m = sleutel.match(WAGEN);
  if (!m) return null;
  const w = await env.SHOP_DB.prepare("SELECT w.id, w.naam, w.type, w.lid_id, l.gebruikersnaam FROM lid_wagens w JOIN leden l ON l.id = w.lid_id WHERE w.id = ?").bind(Number(m[1])).first();
  return w ? { soort: "wagen", titel: w.naam || w.type, eigenaar: w.lid_id, link: `/forum/lid/${encodeURIComponent(w.gebruikersnaam || "")}#wagen-${w.id}` } : null;
}

export async function blogLikes(request, env, url) {
  const p = url.pathname;
  if (p !== "/api/blog/likes" && p !== "/api/blog/like") return null;
  const db = env.SHOP_DB;
  const bz = bezoekerVan(request);

  if (p === "/api/blog/likes" && request.method === "GET") {
    const slugs = [...new Set((url.searchParams.get("s") || "").split(",").map((x) => x.trim()))].filter((x) => ARTIKELS[x] || WAGEN.test(x)).slice(0, 60);
    if (!slugs.length) return json({ n: {}, mijn: [] });
    const q = slugs.map(() => "?").join(",");
    const rij = (await db.prepare(`SELECT slug, COUNT(*) n FROM blog_likes WHERE slug IN (${q}) GROUP BY slug`).bind(...slugs).all()).results || [];
    const mijn = bz ? ((await db.prepare(`SELECT slug FROM blog_likes WHERE bezoeker = ? AND slug IN (${q})`).bind(bz, ...slugs).all()).results || []).map((r) => r.slug) : [];
    return json({ n: Object.fromEntries(rij.map((r) => [r.slug, r.n])), mijn });
  }

  if (p === "/api/blog/like" && request.method === "POST") {
    if (!eigenOrigin(request, url)) return json({ ok: false }, 403);
    let b = {}; try { b = await request.json(); } catch {}
    const slug = String(b.slug || "");
    const art = await info(env, slug);
    if (!art) return json({ ok: false, fout: "Onbekend." }, 404);
    const nieuweBz = bz || willekeurig(16);
    const cookie = bz ? {} : { "set-cookie": `${COOKIE}=${nieuweBz}; Path=/; Max-Age=${2 * 365 * 86400}; HttpOnly; Secure; SameSite=Lax` };
    const nu = new Date().toISOString();
    const had = await db.prepare("SELECT 1 FROM blog_likes WHERE slug = ? AND bezoeker = ?").bind(slug, nieuweBz).first();
    let lid = null;
    if (had) await db.prepare("DELETE FROM blog_likes WHERE slug = ? AND bezoeker = ?").bind(slug, nieuweBz).run();
    else {
      // Tegen misbruik: hoogstens 60 hartjes per uur vanaf hetzelfde netwerk.
      const ip = await sha("ip:" + (env.TURNSTILE_SECRET || env.RESEND_API_KEY || "") + ":" + (request.headers.get("cf-connecting-ip") || ""));
      const recent = await db.prepare("SELECT COUNT(*) n FROM blog_likes WHERE ip_hash = ? AND aangemaakt > ?").bind(ip, new Date(Date.now() - 3600_000).toISOString()).first();
      if (recent.n >= 60) return json({ ok: false, fout: "Even rustig aan." }, 429, cookie);
      lid = await huidigLid(request, env).catch(() => null);
      await db.prepare("INSERT OR IGNORE INTO blog_likes (slug, bezoeker, lid_id, ip_hash, aangemaakt) VALUES (?, ?, ?, ?, ?)").bind(slug, nieuweBz, lid?.id || null, ip, nu).run();
      await meldSchrijver(env, slug, art, lid).catch(() => {});
    }
    const n = (await db.prepare("SELECT COUNT(*) n FROM blog_likes WHERE slug = ?").bind(slug).first()).n;
    return json({ ok: true, n, mijn: !had }, 200, cookie);
  }
  return json({ ok: false }, 405);
}

async function meldSchrijver(env, slug, art, liker) {
  let auteurId = art.eigenaar, link = art.link;
  if (art.soort === "blog") {
    const r = await env.SHOP_DB.prepare("SELECT waarde FROM instellingen WHERE sleutel = 'blog_auteurs'").first();
    let map = {}; try { map = JSON.parse(r?.waarde || "{}"); } catch {}
    auteurId = map[art.auteur]; link = `/blog/${slug}`;
  }
  if (!auteurId || liker?.id === auteurId) return;
  const al = await env.SHOP_DB.prepare("SELECT 1 FROM lid_meldingen WHERE lid_id = ? AND link = ? AND tekst LIKE '%hartje%' AND aangemaakt > ?")
    .bind(auteurId, link, new Date(Date.now() - 86400_000).toISOString()).first();
  if (al) return;
  const wie = liker?.gebruikersnaam || "Iemand";
  await meld(env, [auteurId], art.soort === "wagen" ? `${wie} gaf een hartje aan je Land Rover "${art.titel}"` : `${wie} gaf een hartje aan je artikel "${art.titel}"`, link);
}
