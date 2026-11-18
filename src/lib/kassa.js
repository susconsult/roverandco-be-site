// Kassa aan de ingang: tickets (QR) van inschrijvingen scannen.
// Toegang: leden met kassa-rechten (leden.kassa = 1, aan te zetten in /beheer/leden) en beheerders.
//  GET  /kassa                   : scanpagina (camera, activiteit kiezen, zoeken op naam of nummer)
//  POST /api/kassa/scan          : { code, activiteit, toch } -> verwerkt het ticket of zegt waarom niet
//  POST /api/kassa/ongedaan      : { nummer } -> scan terugdraaien (vergissing)
//  GET  /api/kassa/stand?act=x   : aantal binnen / totaal
//  GET  /api/kassa/zoek?act=x&q= : inschrijvingen zoeken (als een gsm geen ticket kan tonen)
import { esc, naar, eigenOrigin } from "./sjabloon.js";
import { huidigLid } from "./leden.js";
import { TICKET_PREFIX } from "./ticket.js";

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const geldig = (st) => { st = String(st || ""); return st === "Betaald" || st.startsWith("Bevestigd") || st.startsWith("Test"); };
const PER = { persoon: "pers.", wagen: "wagen", stuk: "st." };

function samenvatting(r, door) {
  let d = {}; try { d = JSON.parse(r.data); } catch {}
  return {
    nummer: r.nummer, naam: r.naam, activiteit: r.activiteit, titel: d.activiteit_naam || d.activiteit_titel || r.activiteit,
    lijnen: (d.lijnen || []).map((l) => `${l.aantal} × ${l.naam}`), tijdslot: r.tijdslot || "", wagen: d.wagen || "",
    test: String(r.status).startsWith("Test"), gescand_op: r.gescand_op || "", door: door || "", opmerking: d.opmerking || "",
  };
}

async function doorNaam(env, id) {
  if (!id) return "";
  const l = await env.SHOP_DB.prepare("SELECT gebruikersnaam, naam FROM leden WHERE id = ?").bind(id).first();
  return l ? (l.gebruikersnaam || l.naam || "") : "";
}

async function scan(request, env, lid) {
  let b; try { b = await request.json(); } catch { return json({ status: "ongeldig", reden: "Onleesbare aanvraag." }, 400); }
  const ruw = String(b.code || "").trim();
  const m = ruw.match(/^RCT-([a-f0-9]{32})$/i) || ruw.match(/^([a-f0-9]{32})$/i);
  // Manueel gekozen in de zoeklijst: op nummer.
  const r = m ? await env.SHOP_DB.prepare("SELECT * FROM registraties WHERE ticket = ?").bind(m[1].toLowerCase()).first()
    : /^RI-[A-Z0-9-]{3,30}$/.test(ruw) ? await env.SHOP_DB.prepare("SELECT * FROM registraties WHERE nummer = ? AND soort = 'inschrijving'").bind(ruw).first() : null;
  if (!r) return json({ status: "ongeldig", reden: ruw.startsWith(TICKET_PREFIX) || m ? "Dit ticket bestaat niet." : "Dit is geen ticket van Rover & Co." });
  if (!geldig(r.status)) return json({ status: "niet-betaald", reden: `Status: ${r.status}`, ...samenvatting(r) });
  if (r.gescand_op) return json({ status: "al", ...samenvatting(r, await doorNaam(env, r.gescand_door)) });
  if (b.activiteit && r.activiteit !== b.activiteit && !b.toch) return json({ status: "andere", ...samenvatting(r) });
  const nu = new Date().toISOString();
  const u = await env.SHOP_DB.prepare("UPDATE registraties SET gescand_op = ?, gescand_door = ? WHERE nummer = ? AND gescand_op IS NULL").bind(nu, lid.id, r.nummer).run();
  if (!u.meta.changes) { const n = await env.SHOP_DB.prepare("SELECT * FROM registraties WHERE nummer = ?").bind(r.nummer).first(); return json({ status: "al", ...samenvatting(n, await doorNaam(env, n.gescand_door)) }); }
  return json({ status: "ok", ...samenvatting({ ...r, gescand_op: nu }, lid.gebruikersnaam || lid.naam || "") });
}

async function ongedaan(request, env) {
  let b; try { b = await request.json(); } catch { return json({ ok: false }, 400); }
  const u = await env.SHOP_DB.prepare("UPDATE registraties SET gescand_op = NULL, gescand_door = NULL WHERE nummer = ? AND soort = 'inschrijving'").bind(String(b.nummer || "")).run();
  return json({ ok: !!u.meta.changes });
}

async function stand(env, act) {
  const { results } = await env.SHOP_DB.prepare("SELECT status, gescand_op, data FROM registraties WHERE soort = 'inschrijving' AND activiteit = ?").bind(act).all();
  const rijen = (results || []).filter((r) => geldig(r.status));
  const personen = (rs) => rs.reduce((s, r) => { try { return s + Math.max(0, ...(JSON.parse(r.data).lijnen || []).filter((l) => l.per === "persoon").map((l) => l.aantal)); } catch { return s; } }, 0);
  const binnen = rijen.filter((r) => r.gescand_op);
  return json({ binnen: binnen.length, totaal: rijen.length, personen_binnen: personen(binnen), personen: personen(rijen) });
}

async function zoek(env, act, q) {
  q = String(q || "").trim().slice(0, 60);
  if (q.length < 2) return json({ lijst: [] });
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const { results } = await env.SHOP_DB.prepare(
    "SELECT * FROM registraties WHERE soort = 'inschrijving' AND (?1 = '' OR activiteit = ?1) AND (naam LIKE ?2 OR nummer LIKE ?2 OR email LIKE ?2) ORDER BY naam LIMIT 20"
  ).bind(act || "", like).all();
  return json({ lijst: (results || []).filter((r) => geldig(r.status)).map((r) => samenvatting(r)) });
}

async function activiteiten(env) {
  const { results } = await env.SHOP_DB.prepare(
    "SELECT activiteit, MAX(aangemaakt) laatst, COUNT(*) n, MAX(json_extract(data, '$.activiteit_naam')) naam, MAX(json_extract(data, '$.activiteit_titel')) titel FROM registraties WHERE soort = 'inschrijving' GROUP BY activiteit ORDER BY laatst DESC LIMIT 20"
  ).all();
  return (results || []).map((r) => ({ slug: r.activiteit, naam: r.naam || r.titel || r.activiteit }));
}

const STIJL = `*{box-sizing:border-box}html{touch-action:pan-x pan-y}body{margin:0;font-family:Inter,system-ui,sans-serif;background:#10241a;color:#fff;-webkit-text-size-adjust:100%}
header{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#1F3B2A}header img{width:38px;height:38px;border-radius:6px}header b{font-size:16px;flex:1}header a{color:#9FC5A8;font-size:14px}
main{max-width:560px;margin:0 auto;padding:12px}select,input{width:100%;font-size:16px;padding:12px;border-radius:10px;border:0;margin:0 0 10px;font-family:inherit}
.stand{display:flex;justify-content:space-between;font-size:14px;color:#9FC5A8;margin:0 2px 10px}.stand b{color:#fff;font-size:18px}
.cam{position:relative;background:#000;border-radius:14px;overflow:hidden;aspect-ratio:1/1}.cam video{width:100%;height:100%;object-fit:cover;display:block}
.cam .kader{position:absolute;inset:16%;border:3px solid rgba(255,255,255,.75);border-radius:16px}.cam .info{position:absolute;inset:auto 0 0 0;padding:10px;text-align:center;font-size:14px;background:rgba(0,0,0,.45)}
.knop{display:block;width:100%;padding:14px;border-radius:12px;border:0;font-size:17px;font-weight:700;font-family:inherit;margin:10px 0;background:#fff;color:#1F3B2A}
.knop.licht{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.5)}
#uitslag{position:fixed;inset:0;display:none;flex-direction:column;justify-content:center;padding:28px 22px;z-index:5}#uitslag.ok{background:#1f8a4c}#uitslag.al,#uitslag.niet-betaald,#uitslag.ongeldig{background:#b3261e}#uitslag.andere{background:#b26a00}
#uitslag h1{font-size:40px;margin:0 0 6px}#uitslag .naam{font-size:26px;font-weight:700;margin:0 0 10px}#uitslag ul{padding-left:20px;font-size:19px;line-height:1.5;margin:0 0 10px}#uitslag p{font-size:16px;margin:4px 0;opacity:.95}
.lijst{list-style:none;padding:0;margin:0}.lijst li{background:#1F3B2A;border-radius:10px;padding:12px;margin:0 0 8px;display:flex;justify-content:space-between;gap:10px;align-items:center}.lijst small{color:#9FC5A8;display:block}.lijst button{font-size:15px;padding:10px 12px;border-radius:8px;border:0;font-weight:700;background:#fff;color:#1F3B2A}
.binnen{color:#9FC5A8;font-size:13px}h2{font-size:15px;color:#9FC5A8;margin:18px 2px 8px;font-weight:600}`;

async function pagina(env, lid) {
  const acts = await activiteiten(env);
  return new Response(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#1F3B2A">
<title>Kassa – Rover &amp; Co</title><link rel="icon" href="/favicon.png"><style>${STIJL}</style></head><body>
<header><img src="/apple-touch-icon.png" alt=""><b>Kassa</b><a href="/">Naar de site</a></header>
<main data-ik="${esc(lid.gebruikersnaam || lid.naam || "")}">
<select id="act" aria-label="Activiteit">${acts.map((a) => `<option value="${esc(a.slug)}">${esc(a.naam)}</option>`).join("") || '<option value="">Nog geen inschrijvingen</option>'}</select>
<div class="stand"><span>Binnen: <b id="binnen">-</b> van <span id="totaal">-</span> inschrijvingen</span><span id="pers"></span></div>
<div class="cam"><video id="video" playsinline muted></video><div class="kader"></div><div class="info" id="caminfo">Tik op Start camera</div></div>
<button class="knop" id="start">Start camera</button>
<h2>Geen ticket bij? Zoek op naam of nummer</h2>
<input id="q" type="search" placeholder="Naam of inschrijfnummer" autocomplete="off">
<ul class="lijst" id="resultaten"></ul>
</main>
<div id="uitslag" role="alert"></div>
<canvas id="doek" hidden></canvas>
<script src="/assets/js/jsqr.js"></script><script src="/assets/js/kassa.js"></script></body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function kassa(request, env, url) {
  const p = url.pathname;
  const api = p.startsWith("/api/kassa/");
  if (p !== "/kassa" && !api) return null;
  const lid = await huidigLid(request, env);
  if (!lid) return api ? json({ status: "ongeldig", reden: "Log opnieuw in." }, 401) : naar(`/account/inloggen?terug=${encodeURIComponent(p)}`);
  if (!(lid.kassa || lid.beheerder)) return api ? json({ status: "ongeldig", reden: "Geen kassa-rechten." }, 403)
    : new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kassa</title><p style="font-family:system-ui;padding:24px">Je hebt geen kassa-rechten. Vraag ze aan de beheerder.</p>`, { status: 403, headers: { "content-type": "text/html; charset=utf-8" } });
  if (request.method === "POST" && !eigenOrigin(request, url)) return json({ status: "ongeldig" }, 403);
  if (p === "/kassa") return pagina(env, lid);
  if (p === "/api/kassa/scan" && request.method === "POST") return scan(request, env, lid);
  if (p === "/api/kassa/ongedaan" && request.method === "POST") return ongedaan(request, env);
  if (p === "/api/kassa/stand") return stand(env, url.searchParams.get("act") || "");
  if (p === "/api/kassa/zoek") return zoek(env, url.searchParams.get("act") || "", url.searchParams.get("q"));
  return null;
}
