// Terreinplanner op /planner (achter login, niet geïndexeerd).
// - /planner            : de planner zelf (public/planner/index.html), enkel met geldige sessie
// - /planner/login      : inlogscherm (GET) en inloggen (POST)
// - /planner/afmelden   : sessie wissen
// - /planner/*          : bestanden van de planner (kaart.jpg), enkel met geldige sessie
// - /api/planner/...    : gegevens (D1-database PLANNER_DB), enkel met geldige sessie
// Gebruikers staan in de tabel users (PBKDF2-SHA256-hash, nooit het wachtwoord zelf).

const COOKIE = "planner_sessie";
const SESSIE_DAGEN = 365;
const ROBOTS = { "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" };

const pjson = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...ROBOTS } });

function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function unb64(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

async function pbkdf2(wachtwoord, salt, iter) {
  const sleutel = await crypto.subtle.importKey("raw", new TextEncoder().encode(wachtwoord), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, sleutel, 256));
}
function gelijk(a, b) { if (a.length !== b.length) return false; let v = 0; for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i); return v === 0; }

function leesCookie(request) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}
async function sessie(request, env) {
  const t = leesCookie(request);
  if (!t) return null;
  const r = await env.PLANNER_DB.prepare("SELECT user, expires FROM sessions WHERE token = ?").bind(t).first();
  if (!r || r.expires < Date.now()) return null;
  return r.user;
}

function loginPagina(fout = "") {
  return new Response(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Terreinplanner · Rover &amp; Co</title>
<style>
@font-face{font-family:"Manrope";font-weight:400;src:url(/assets/fonts/manrope-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"Manrope";font-weight:700;src:url(/assets/fonts/manrope-latin-700-normal.woff2) format("woff2")}
@font-face{font-family:"Big Shoulders Display";font-weight:800;src:url(/assets/fonts/big-shoulders-display-latin-800-normal.woff2) format("woff2")}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{font-family:Manrope,system-ui,sans-serif;background:#1F3B2A;color:#fff;display:grid;place-items:center;padding:20px}
form{width:100%;max-width:360px;display:flex;flex-direction:column;gap:14px}
h1{font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:800;font-size:2.4rem;margin:0 0 4px;letter-spacing:.01em}
p{margin:0 0 6px;opacity:.85}
label{font-weight:700;font-size:1rem}
input{font:inherit;font-size:1.15rem;padding:14px;border-radius:10px;border:2px solid transparent;width:100%;background:#fff;color:#141815}
input:focus{outline:none;border-color:#9FC5A8}
button{font:inherit;font-weight:700;font-size:1.15rem;padding:15px;border-radius:10px;border:0;background:#9FC5A8;color:#1F3B2A;cursor:pointer;margin-top:6px}
.fout{background:#7a2420;padding:10px 12px;border-radius:8px;font-weight:700}
</style></head><body>
<form method="post" action="/planner/login">
<h1>Terreinplanner</h1><p>Wild &amp; Wheels · Rover &amp; Co</p>
${fout ? `<div class="fout" role="alert">${fout}</div>` : ""}
<label for="naam">Naam</label><input id="naam" name="naam" autocomplete="username" autocapitalize="none" required>
<label for="ww">Wachtwoord</label><input id="ww" name="wachtwoord" type="password" autocomplete="current-password" required>
<button type="submit">Inloggen</button>
</form></body></html>`, { status: fout ? 401 : 200, headers: { "content-type": "text/html; charset=utf-8", ...ROBOTS } });
}

async function inloggen(request, env) {
  const f = await request.formData();
  const naam = String(f.get("naam") || "").trim().toLowerCase().slice(0, 60);
  const ww = String(f.get("wachtwoord") || "").slice(0, 200);
  const u = naam && (await env.PLANNER_DB.prepare("SELECT salt, hash, iter FROM users WHERE name = ?").bind(naam).first());
  const ok = u && gelijk(await pbkdf2(ww, unb64(u.salt), u.iter), u.hash);
  if (!ok) { await new Promise((r) => setTimeout(r, 800)); return loginPagina("Naam of wachtwoord klopt niet."); }
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, "0")).join("");
  const exp = Date.now() + SESSIE_DAGEN * 864e5;
  await env.PLANNER_DB.batch([
    env.PLANNER_DB.prepare("DELETE FROM sessions WHERE expires < ?").bind(Date.now()),
    env.PLANNER_DB.prepare("INSERT INTO sessions (token, user, expires) VALUES (?, ?, ?)").bind(token, naam, exp),
  ]);
  return new Response(null, { status: 303, headers: { location: "/planner", "set-cookie": `${COOKIE}=${token}; Path=/; Max-Age=${SESSIE_DAGEN * 86400}; HttpOnly; Secure; SameSite=Lax`, ...ROBOTS } });
}

async function afmelden(request, env) {
  const t = leesCookie(request);
  if (t) await env.PLANNER_DB.prepare("DELETE FROM sessions WHERE token = ?").bind(t).run();
  return new Response(null, { status: 303, headers: { location: "/planner/login", "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`, ...ROBOTS } });
}

const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;
const SETTING_OK = new Set(["mpp", "order"]);

async function api(request, env, pad) {
  const db = env.PLANNER_DB;
  if (pad === "/api/planner/data" && request.method === "GET") {
    const since = parseInt(new URL(request.url).searchParams.get("since") || "0", 10) || 0;
    const nu = Date.now();
    const rijen = since
      ? (await db.prepare("SELECT id, data, deleted FROM items WHERE updated > ?").bind(since).all()).results
      : (await db.prepare("SELECT id, data, deleted FROM items WHERE deleted = 0").all()).results;
    const items = {};
    for (const r of rijen) items[r.id] = r.deleted ? null : JSON.parse(r.data);
    const inst = (await db.prepare("SELECT key, value FROM settings WHERE updated > ?").bind(since).all()).results;
    const settings = {};
    for (const r of inst) settings[r.key] = JSON.parse(r.value);
    return pjson({ ok: true, now: nu - 1500, items, settings });
  }
  const mi = pad.match(/^\/api\/planner\/items\/([^/]+)$/);
  if (mi && ID_OK.test(mi[1])) {
    if (request.method === "PUT") {
      const tekst = await request.text();
      if (tekst.length > 50000) return pjson({ ok: false, fout: "Te groot." }, 413);
      let d; try { d = JSON.parse(tekst); } catch { return pjson({ ok: false }, 400); }
      if (!d || typeof d !== "object" || typeof d.px !== "number") return pjson({ ok: false }, 400);
      await db.prepare("INSERT INTO items (id, data, updated, deleted) VALUES (?, ?, ?, 0) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated = excluded.updated, deleted = 0")
        .bind(mi[1], JSON.stringify(d), Date.now()).run();
      return pjson({ ok: true });
    }
    if (request.method === "DELETE") {
      await db.prepare("UPDATE items SET deleted = 1, updated = ? WHERE id = ?").bind(Date.now(), mi[1]).run();
      return pjson({ ok: true });
    }
  }
  const ms = pad.match(/^\/api\/planner\/settings\/([a-z]+)$/);
  if (ms && SETTING_OK.has(ms[1]) && request.method === "PUT") {
    const tekst = await request.text();
    if (tekst.length > 2000) return pjson({ ok: false }, 413);
    try { JSON.parse(tekst); } catch { return pjson({ ok: false }, 400); }
    await db.prepare("INSERT INTO settings (key, value, updated) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated")
      .bind(ms[1], tekst, Date.now()).run();
    return pjson({ ok: true });
  }
  return pjson({ ok: false, fout: "Onbekend adres." }, 404);
}

// Geeft een Response voor planner-adressen, of null als het adres niet bij de planner hoort.
export async function planner(request, env, url) {
  const p = url.pathname;
  const isApi = p.startsWith("/api/planner/");
  if (!isApi && p !== "/planner" && !p.startsWith("/planner/")) return null;
  if (!env.PLANNER_DB) return pjson({ ok: false, fout: "Database niet gekoppeld." }, 500);
  if (p === "/planner/login") return request.method === "POST" ? inloggen(request, env) : loginPagina();
  if (p === "/planner/afmelden") return afmelden(request, env);
  const wie = await sessie(request, env);
  if (!wie) return isApi ? pjson({ ok: false, fout: "Niet ingelogd." }, 401) : new Response(null, { status: 303, headers: { location: "/planner/login", ...ROBOTS } });
  if (isApi) return api(request, env, p);
  const doel = new URL(url);
  if (p === "/planner" || p === "/planner/" || p === "/planner/index.html") doel.pathname = "/planner/";
  const r = await env.ASSETS.fetch(new Request(doel, request));
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(ROBOTS)) h.set(k, v);
  return new Response(r.body, { status: r.status, headers: h });
}
