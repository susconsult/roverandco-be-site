// /beheer: bestellingen en inschrijvingen bekijken en afhandelen.
// Login met een code per mail (via Resend): e-mail invullen -> code van 6 cijfers (10 min geldig, max 5 pogingen)
// -> sessie van 30 dagen in een cookie (HttpOnly, Secure, alleen voor /beheer).
// Wie mag: BEHEER_EMAILS (komma-lijst in Cloudflare-variabelen; standaard pieter@roverandco.be).
import { eur, leveringTekst, artikelTekst, lijnTekst, adres } from "./opslag.js";

const html = (body, status = 200, extra = {}) => new Response(body, {
  status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", ...extra },
});
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const datum = (iso) => iso ? new Date(iso).toLocaleString("nl-BE", { timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

/* ---------------- login met code per mail ---------------- */

const COOKIE = "rc_beheer";
const SESSIE_DAGEN = 30;
const toegelaten = (env) => (env.BEHEER_EMAILS || "pieter@roverandco.be").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
async function hash(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function cookie(request, naam) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${naam}=([^;]+)`));
  return m ? m[1] : null;
}

async function wie(request, env) {
  const token = cookie(request, COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const r = await env.SHOP_DB.prepare("SELECT email, verloopt FROM beheer_sessies WHERE token_hash = ?").bind(await hash(token)).first();
  if (!r || r.verloopt < Date.now() || !toegelaten(env).includes(r.email)) return null;
  return { email: r.email };
}

async function stuurCode(env, email, code) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: "Rover & Co VZW <noreply@roverandco.be>", to: [email], subject: `Je code voor het beheer: ${code}`,
      text: `Je code om in te loggen op het beheer van Rover & Co: ${code}\n\nDe code is 10 minuten geldig. Heb je dit niet gevraagd? Dan mag je deze mail negeren.`,
    }),
  });
  return r.ok;
}

const loginPagina = (stap, { email = "", melding = "" } = {}) => html(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Inloggen – Beheer Rover &amp; Co</title><style>${STIJL}
.login{max-width:380px;margin:60px auto}.login input{width:100%;margin:6px 0 12px}.login button{width:100%}</style></head><body>
<header><a href="/beheer">Rover &amp; Co beheer</a></header><main><form class="kaart login" method="post" action="/beheer/login">
<h2>Inloggen</h2>${melding ? `<p>${esc(melding)}</p>` : ""}
${stap === "code"
    ? `<input type="hidden" name="email" value="${esc(email)}"><label>Code uit je mail<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus></label><button>Inloggen</button>
       <p><a href="/beheer/login">Andere e-mail of nieuwe code</a></p>`
    : `<label>E-mailadres<input type="email" name="email" autocomplete="email" required autofocus></label><button>Stuur me een code</button>`}
</form></main></body></html>`);

async function login(request, env, url) {
  if (request.method !== "POST") return loginPagina("email");
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return html("Geweigerd.", 403);
  const f = await request.formData();
  const email = String(f.get("email") || "").trim().toLowerCase().slice(0, 160);
  const code = String(f.get("code") || "").trim();
  const nu = Date.now();

  if (!code) {
    // Stap 1: code sturen. Altijd hetzelfde antwoord, zodat niemand kan afleiden wie toegang heeft.
    if (toegelaten(env).includes(email)) {
      if (!env.RESEND_API_KEY) return loginPagina("email", { melding: "Mails versturen is nog niet ingesteld (RESEND_API_KEY ontbreekt)." });
      const recent = await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM beheer_codes WHERE email = ? AND aangemaakt > ?").bind(email, nu - 15 * 60_000).first();
      if ((recent?.n || 0) < 3) {
        const nieuw = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
        await env.SHOP_DB.prepare("DELETE FROM beheer_codes WHERE verloopt < ?").bind(nu).run();
        await env.SHOP_DB.prepare("INSERT INTO beheer_codes (email, code_hash, aangemaakt, verloopt) VALUES (?, ?, ?, ?)")
          .bind(email, await hash(email + ":" + nieuw), nu, nu + 10 * 60_000).run();
        await stuurCode(env, email, nieuw);
      }
    }
    return loginPagina("code", { email, melding: "Als dit adres toegang heeft, staat er nu een code in je mailbox." });
  }

  // Stap 2: code controleren.
  const rij = await env.SHOP_DB.prepare("SELECT rowid id, code_hash, pogingen FROM beheer_codes WHERE email = ? AND verloopt > ? ORDER BY aangemaakt DESC LIMIT 1").bind(email, nu).first();
  if (!rij || rij.pogingen >= 5) return loginPagina("email", { melding: "De code is verlopen of te vaak fout ingegeven. Vraag een nieuwe code." });
  if (rij.code_hash !== await hash(email + ":" + code)) {
    await env.SHOP_DB.prepare("UPDATE beheer_codes SET pogingen = pogingen + 1 WHERE rowid = ?").bind(rij.id).run();
    return loginPagina("code", { email, melding: "Die code klopt niet." });
  }
  await env.SHOP_DB.prepare("DELETE FROM beheer_codes WHERE email = ?").bind(email).run();
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.SHOP_DB.prepare("DELETE FROM beheer_sessies WHERE verloopt < ?").bind(nu).run();
  await env.SHOP_DB.prepare("INSERT INTO beheer_sessies (token_hash, email, verloopt) VALUES (?, ?, ?)").bind(await hash(token), email, nu + SESSIE_DAGEN * 86400_000).run();
  return new Response(null, { status: 303, headers: {
    location: "/beheer", "cache-control": "no-store",
    "set-cookie": `${COOKIE}=${token}; Path=/beheer; Max-Age=${SESSIE_DAGEN * 86400}; HttpOnly; Secure; SameSite=Lax`,
  } });
}

async function uitloggen(request, env) {
  const token = cookie(request, COOKIE);
  if (token) await env.SHOP_DB.prepare("DELETE FROM beheer_sessies WHERE token_hash = ?").bind(await hash(token)).run();
  return new Response(null, { status: 303, headers: { location: "/beheer/login", "set-cookie": `${COOKIE}=; Path=/beheer; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
}

/* ---------------- opmaak ---------------- */

const STIJL = `
:root{--g:#1F3B2A;--z:#ECE6D6;--i:#141815;--m:#5B625C}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 Manrope,system-ui,sans-serif;color:var(--i);background:#f6f4ee}
header{background:var(--g);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
header a{color:#fff;text-decoration:none;font-weight:700}header small{opacity:.8}
main{max-width:1200px;margin:0 auto;padding:20px}
nav.tabs{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
nav.tabs a{padding:8px 14px;border-radius:8px;background:#fff;color:var(--i);text-decoration:none;border:1px solid #ddd}
nav.tabs a.aan{background:var(--g);color:#fff;border-color:var(--g)}
form.filter{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
input,select,textarea,button{font:inherit;padding:8px 10px;border:1px solid #ccc;border-radius:8px;background:#fff}
button,.knop{background:var(--g);color:#fff;border-color:var(--g);cursor:pointer;text-decoration:none;display:inline-block;padding:8px 14px;border-radius:8px}
.knop.licht{background:#fff;color:var(--g)}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:10px;border-bottom:1px solid #eee;vertical-align:top}th{background:var(--z);font-size:13px}
tr:hover td{background:#fafaf6}td a{color:var(--g);font-weight:600}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600;background:#eee}
.b-betaald{background:#dcefe2;color:#1F3B2A}.b-wacht{background:#fbefd5;color:#7a5200}.b-test{background:#e6e6f6;color:#3c3489}.b-fout{background:#f7dede;color:#791f1f}
.kaart{background:#fff;border-radius:10px;padding:18px;margin-bottom:16px}
.kaart h2{margin:0 0 10px;font-size:18px}dl{display:grid;grid-template-columns:160px 1fr;gap:6px 12px;margin:0}dt{color:var(--m)}
pre{white-space:pre-wrap;font:inherit;margin:0}
.som{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}.som div{background:#fff;border-radius:10px;padding:12px 16px}.som b{display:block;font-size:20px}
.leeg{padding:30px;text-align:center;color:var(--m)}
@media(max-width:700px){dl{grid-template-columns:1fr}th.mob,td.mob{display:none}}`;

const pagina = (titel, inhoud, email) => html(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(titel)} – Beheer Rover &amp; Co</title><style>${STIJL}</style></head><body>
<header><a href="/beheer">Rover &amp; Co beheer</a><small>${esc(email || "")} · <a href="/beheer/uitloggen" style="font-weight:400">Uitloggen</a></small></header><main>${inhoud}</main></body></html>`);

function badge(status) {
  const s = String(status);
  const k = s === "Betaald" ? "b-betaald" : s.startsWith("Wacht") ? "b-wacht" : s.startsWith("Test") ? "b-test" : s.startsWith("Bedrag") || s.startsWith("Geannuleerd") ? "b-fout" : s.startsWith("Bevestigd") ? "b-betaald" : "";
  return `<span class="badge ${k}">${esc(s)}</span>`;
}

/* ---------------- lijst ---------------- */

const FILTERS = {
  echt: "status IN ('Betaald') OR status LIKE 'Bevestigd%'",
  wacht: "status = 'Wacht op betaling'",
  test: "test = 1",
  open: "(status = 'Betaald' OR status LIKE 'Bevestigd%') AND afgehandeld = 0",
  alle: "1=1",
};

async function lijst(url, env, email) {
  const soort = url.searchParams.get("soort") === "inschrijving" ? "inschrijving" : "bestelling";
  const filter = FILTERS[url.searchParams.get("filter")] ? url.searchParams.get("filter") : "echt";
  const zoek = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const act = (url.searchParams.get("activiteit") || "").slice(0, 80);

  let sql = `SELECT nummer, aangemaakt, status, naam, email, totaal, activiteit, afgehandeld, test, data FROM registraties WHERE soort = ? AND (${FILTERS[filter]})`;
  const p = [soort];
  if (zoek) { sql += " AND (naam LIKE ? OR email LIKE ? OR nummer LIKE ? OR telefoon LIKE ?)"; p.push(...Array(4).fill(`%${zoek}%`)); }
  if (act) { sql += " AND activiteit = ?"; p.push(act); }
  sql += " ORDER BY aangemaakt DESC LIMIT 500";
  const { results: rijen = [] } = await env.SHOP_DB.prepare(sql).bind(...p).all();
  const { results: acts = [] } = await env.SHOP_DB.prepare("SELECT DISTINCT activiteit FROM registraties WHERE soort = ? AND activiteit IS NOT NULL ORDER BY activiteit").bind(soort).all();

  const totaal = rijen.reduce((s, r) => s + Number(r.totaal || 0), 0);
  const q = (extra) => "/beheer?" + new URLSearchParams({ soort, filter, ...(zoek ? { q: zoek } : {}), ...(act ? { activiteit: act } : {}), ...extra });

  const lijnen = rijen.map((r) => {
    let d = {}; try { d = JSON.parse(r.data); } catch {}
    const wat = soort === "bestelling"
      ? esc((d.artikels || []).map((a) => `${a.aantal}× ${a.naam}`).join(", ")) + `<br><small>${esc(leveringTekst(d.levering || {}))}${d.levering?.activiteit ? " – " + esc(d.levering.activiteit) : ""}</small>`
      : esc((d.lijnen || []).map((l) => `${l.aantal}× ${l.naam}`).join(", ")) + (d.tijdslot ? `<br><small>Tijdslot ${esc(d.tijdslot)}</small>` : "");
    return `<tr><td>${datum(r.aangemaakt)}</td><td><a href="/beheer/r/${esc(r.nummer)}">${esc(r.nummer)}</a></td>
      <td>${esc(r.naam)}<br><small class="mob">${esc(r.email)}</small></td>${soort === "inschrijving" ? `<td class="mob">${esc(d.activiteit_titel || r.activiteit)}</td>` : ""}
      <td class="mob">${wat}</td><td>${eur(r.totaal)}</td><td>${badge(r.status)}${r.afgehandeld ? ' <span class="badge">afgehandeld</span>' : ""}</td></tr>`;
  }).join("");

  const tab = (s, label) => `<a class="${soort === s ? "aan" : ""}" href="/beheer?soort=${s}">${label}</a>`;
  const ftab = (f, label) => `<a class="${filter === f ? "aan" : ""}" href="${esc(q({ filter: f }))}">${label}</a>`;
  return pagina("Overzicht", `
<nav class="tabs">${tab("bestelling", "Bestellingen")}${tab("inschrijving", "Inschrijvingen")}</nav>
<nav class="tabs">${ftab("echt", "Betaald en bevestigd")}${ftab("open", "Nog af te handelen")}${ftab("wacht", "Wacht op betaling")}${ftab("test", "Test")}${ftab("alle", "Alles")}</nav>
<form class="filter" method="get" action="/beheer"><input type="hidden" name="soort" value="${soort}"><input type="hidden" name="filter" value="${filter}">
<input name="q" placeholder="Zoek naam, e-mail, nummer" value="${esc(zoek)}">
<select name="activiteit"><option value="">Alle activiteiten</option>${acts.map((a) => `<option ${a.activiteit === act ? "selected" : ""}>${esc(a.activiteit)}</option>`).join("")}</select>
<button>Zoeken</button><a class="knop licht" href="${esc("/beheer/export.csv?" + new URLSearchParams({ soort, filter, ...(zoek ? { q: zoek } : {}), ...(act ? { activiteit: act } : {}) }))}">Excel (CSV)</a></form>
<div class="som"><div>Aantal<b>${rijen.length}</b></div><div>Totaal<b>${eur(totaal)}</b></div></div>
${rijen.length ? `<table><thead><tr><th>Datum</th><th>Nummer</th><th>Klant</th>${soort === "inschrijving" ? '<th class="mob">Activiteit</th>' : ""}<th class="mob">Wat</th><th>Totaal</th><th>Status</th></tr></thead><tbody>${lijnen}</tbody></table>`
  : '<div class="kaart leeg">Nog niets hier.</div>'}`, email);
}

/* ---------------- detail ---------------- */

const STATUSSEN = ["Betaald", "Wacht op betaling", "Bevestigd (gratis)", "Geannuleerd", "Terugbetaald"];

async function detail(nummer, env, email, melding = "") {
  const r = await env.SHOP_DB.prepare("SELECT * FROM registraties WHERE nummer = ?").bind(nummer).first();
  if (!r) return pagina("Niet gevonden", '<div class="kaart leeg">Niet gevonden. <a href="/beheer">Terug</a></div>', email);
  let d = {}; try { d = JSON.parse(r.data); } catch {}
  const lev = d.levering || {};
  const inhoud = r.soort === "bestelling"
    ? `<dt>Levering</dt><dd>${esc(leveringTekst(lev))}${lev.activiteit ? " – " + esc(lev.activiteit) : ""}${lev.type === "verzenden" ? "<br>" + esc(adres(lev)) : ""}</dd>
       <dt>Artikels</dt><dd><pre>${esc(artikelTekst(d))}</pre></dd><dt>Subtotaal</dt><dd>${eur(d.subtotaal)}</dd><dt>Verzending</dt><dd>${eur(d.verzending)}</dd><dt>Steun</dt><dd>${eur(d.donatie)}</dd>`
    : `<dt>Activiteit</dt><dd>${esc(d.activiteit_titel)}</dd><dt>Onderdelen</dt><dd><pre>${esc(lijnTekst(d))}</pre></dd>
       ${d.tijdslot ? `<dt>Tijdslot</dt><dd>${esc(d.tijdslot)}</dd>` : ""}${d.wagen ? `<dt>Land Rover</dt><dd>${esc(d.wagen)}</dd>` : ""}`;
  return pagina(r.nummer, `
<p><a href="/beheer?soort=${r.soort}">← Terug naar ${r.soort === "bestelling" ? "bestellingen" : "inschrijvingen"}</a></p>
${melding ? `<div class="kaart">${esc(melding)}</div>` : ""}
<div class="kaart"><h2>${esc(r.nummer)} ${badge(r.status)}${r.test ? ' <span class="badge b-test">test</span>' : ""}</h2>
<dl><dt>Aangemaakt</dt><dd>${datum(r.aangemaakt)}</dd><dt>Klant</dt><dd>${esc(r.naam)}<br><a href="mailto:${esc(r.email)}">${esc(r.email)}</a><br><a href="tel:${esc(r.telefoon)}">${esc(r.telefoon)}</a></dd>
${inhoud}<dt>Totaal</dt><dd><b>${eur(r.totaal)}</b></dd>${d.opmerking ? `<dt>Opmerking klant</dt><dd><pre>${esc(d.opmerking)}</pre></dd>` : ""}
<dt>Viva ordercode</dt><dd>${esc(r.viva_ordercode || "–")}</dd><dt>Transactie</dt><dd>${esc(r.transactie || "–")}</dd><dt>Betaald op</dt><dd>${datum(r.betaald_op) || "–"}</dd>
<dt>Mail klant</dt><dd>${esc(r.mail_klant || "–")}</dd></dl></div>
<form class="kaart" method="post" action="/beheer/r/${esc(r.nummer)}"><h2>Afhandelen</h2>
<p><label><input type="checkbox" name="afgehandeld" value="1" ${r.afgehandeld ? "checked" : ""}> ${r.soort === "bestelling" ? "Afgehaald of verzonden" : "Afgehandeld"}</label></p>
<p><label>Status<br><select name="status">${[...new Set([r.status, ...STATUSSEN])].map((s) => `<option ${s === r.status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label></p>
<p><label>Interne notitie<br><textarea name="notitie" rows="3" style="width:100%">${esc(r.notitie || "")}</textarea></label></p>
<button>Opslaan</button></form>`, email);
}

async function bewaar(request, nummer, env, email) {
  const f = await request.formData();
  const status = String(f.get("status") || "").slice(0, 60);
  const huidig = await env.SHOP_DB.prepare("SELECT status FROM registraties WHERE nummer = ?").bind(nummer).first();
  if (!huidig) return detail(nummer, env, email);
  const toegestaan = new Set([huidig.status, ...STATUSSEN]);
  await env.SHOP_DB.prepare("UPDATE registraties SET afgehandeld = ?, status = ?, notitie = ?, bijgewerkt = ? WHERE nummer = ?")
    .bind(f.get("afgehandeld") ? 1 : 0, toegestaan.has(status) ? status : huidig.status, String(f.get("notitie") || "").slice(0, 2000), new Date().toISOString(), nummer).run();
  return detail(nummer, env, email, "Opgeslagen.");
}

/* ---------------- export ---------------- */

async function exporteer(url, env) {
  const soort = url.searchParams.get("soort") === "inschrijving" ? "inschrijving" : "bestelling";
  const filter = FILTERS[url.searchParams.get("filter")] ? url.searchParams.get("filter") : "echt";
  const zoek = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const act = (url.searchParams.get("activiteit") || "").slice(0, 80);
  let sql = `SELECT * FROM registraties WHERE soort = ? AND (${FILTERS[filter]})`;
  const p = [soort];
  if (zoek) { sql += " AND (naam LIKE ? OR email LIKE ? OR nummer LIKE ? OR telefoon LIKE ?)"; p.push(...Array(4).fill(`%${zoek}%`)); }
  if (act) { sql += " AND activiteit = ?"; p.push(act); }
  sql += " ORDER BY aangemaakt";
  const { results = [] } = await env.SHOP_DB.prepare(sql).bind(...p).all();
  const kolommen = soort === "bestelling"
    ? ["Aangemaakt", "Nummer", "Status", "Afgehandeld", "Naam", "E-mail", "Telefoon", "Levering", "Activiteit", "Adres", "Artikels", "Subtotaal", "Verzending", "Steun", "Totaal", "Opmerking", "Notitie"]
    : ["Aangemaakt", "Nummer", "Status", "Afgehandeld", "Naam", "E-mail", "Telefoon", "Activiteit", "Onderdelen", "Tijdslot", "Land Rover", "Totaal", "Opmerking", "Notitie"];
  const cel = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const getal = (n) => Number(n || 0).toFixed(2).replace(".", ",");
  const rijen = results.map((r) => {
    let d = {}; try { d = JSON.parse(r.data); } catch {}
    const basis = [datum(r.aangemaakt), r.nummer, r.status, r.afgehandeld ? "ja" : "nee", r.naam, r.email, r.telefoon];
    const rest = soort === "bestelling"
      ? [leveringTekst(d.levering || {}), d.levering?.activiteit || "", d.levering?.type === "verzenden" ? adres(d.levering) : "", artikelTekst(d), getal(d.subtotaal), getal(d.verzending), getal(d.donatie), getal(r.totaal), d.opmerking || "", r.notitie || ""]
      : [d.activiteit_titel || r.activiteit, lijnTekst(d), d.tijdslot || "", d.wagen || "", getal(r.totaal), d.opmerking || "", r.notitie || ""];
    return [...basis, ...rest].map(cel).join(";");
  });
  const csv = "﻿" + [kolommen.join(";"), ...rijen].join("\r\n");
  return new Response(csv, { headers: {
    "content-type": "text/csv; charset=utf-8", "cache-control": "no-store",
    "content-disposition": `attachment; filename="rover-co-${soort === "bestelling" ? "bestellingen" : "inschrijvingen"}-${new Date().toISOString().slice(0, 10)}.csv"`,
  } });
}

/* ---------------- router ---------------- */

export async function beheer(request, env, url) {
  const p = url.pathname;
  if (p !== "/beheer" && !p.startsWith("/beheer/")) return null;
  if (!env.SHOP_DB) return html("Database ontbreekt.", 500);
  if (p === "/beheer/login") return login(request, env, url);
  if (p === "/beheer/uitloggen") return uitloggen(request, env);
  const w = await wie(request, env);
  if (!w) return new Response(null, { status: 303, headers: { location: "/beheer/login", "cache-control": "no-store" } });

  if (request.method === "POST") {
    // Alleen formulieren van het beheer zelf.
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return html("Geweigerd.", 403);
  }
  if (p === "/beheer" || p === "/beheer/") return lijst(url, env, w.email);
  if (p === "/beheer/export.csv") return exporteer(url, env);
  const m = p.match(/^\/beheer\/r\/([A-Z]{2}-\d{6}-[A-Z0-9]{5})$/);
  if (m) return request.method === "POST" ? bewaar(request, m[1], env, w.email) : detail(m[1], env, w.email);
  return html("Niet gevonden.", 404);
}
