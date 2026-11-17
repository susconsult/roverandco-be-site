// /cb: de CB-chat. Kanalen 1 tot 40 zoals op een echte CB. Berichten blijven 24 uur staan.
// Vaste kanalen + kanalen die leden zelf openen. Kanaal 1 is het Albertkanaal: daar heet iedereen Albert.
import { esc, banner, pagina, naar, eigenOrigin, mail } from "./sjabloon.js";
import { huidigLid } from "./leden.js";
import { meld } from "./forum-extra.js";
import { log } from "./log.js";

export const CB_UREN = 24;
const MAX_KANAAL = 40;
const ALBERT = 1;
const VAST = [
  [1, "Albertkanaal", "Hier heet iedereen Albert. Zeg maar wat je wil, Albert."],
  [4, "Nieuwe leden", "Stel je voor en vraag alles wat je wil weten"],
  [7, "Techniek", "Snel iets vragen over je Land Rover"],
  [9, "Pech onderweg", "Sta je stil? Vraag hier hulp aan wie in de buurt is"],
  [11, "Ritten en afspraken", "Wie rijdt er mee, waar spreken we af"],
  [14, "Onderdelen", "Te koop, gezocht of te leen"],
  [19, "Algemeen", "Het hoofdkanaal: alles wat nergens anders past"],
  [22, "Overland en kamperen", "Daktenten, routes en kampeerplekken"],
  [27, "Café", "Over koetjes en kalfjes, met of zonder Land Rover"],
];

const nu = () => new Date().toISOString();
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const grens = () => new Date(Date.now() - CB_UREN * 3600_000).toISOString();

let klaar = false;
async function zaai(env) {
  if (klaar) return;
  await env.SHOP_DB.batch(VAST.map(([nr, naam, oms]) => env.SHOP_DB.prepare("INSERT OR IGNORE INTO cb_kanalen (nr, naam, omschrijving, vast, aangemaakt) VALUES (?, ?, ?, 1, ?)").bind(nr, naam, oms, nu())));
  klaar = true;
}

async function kanalen(env, lid) {
  // Eigen kanalen van leden verdwijnen 24 uur na het openen, samen met hun berichten.
  const oud = (await env.SHOP_DB.prepare("SELECT nr FROM cb_kanalen WHERE vast = 0 AND aangemaakt < ?").bind(grens()).all()).results || [];
  if (oud.length) await env.SHOP_DB.batch(oud.flatMap((k) => [
    env.SHOP_DB.prepare("DELETE FROM cb_kanalen WHERE nr = ? AND vast = 0").bind(k.nr),
    env.SHOP_DB.prepare("DELETE FROM cb_berichten WHERE nr = ?").bind(k.nr),
    env.SHOP_DB.prepare("DELETE FROM cb_gelezen WHERE nr = ?").bind(k.nr),
  ]));
  const r = (await env.SHOP_DB.prepare(`SELECT k.*, (SELECT COUNT(*) FROM cb_berichten b WHERE b.nr = k.nr AND b.verwijderd = 0 AND b.aangemaakt > ? AND b.id > COALESCE((SELECT laatste_id FROM cb_gelezen g WHERE g.nr = k.nr AND g.lid_id = ?), 0) AND b.lid_id <> ?) ongelezen,
    (SELECT MAX(b.aangemaakt) FROM cb_berichten b WHERE b.nr = k.nr AND b.verwijderd = 0 AND b.aangemaakt > ?) laatste FROM cb_kanalen k ORDER BY k.nr`).bind(grens(), lid.id, lid.id, grens()).all()).results || [];
  return r;
}

function berichtJson(b, lid) {
  const albert = b.nr === ALBERT;
  return { id: b.id, naam: albert ? "Albert" : b.gebruikersnaam || "lid", av: albert ? null : b.avatar_id || null, tekst: b.tekst, t: b.aangemaakt, eigen: b.lid_id === lid.id, audio: b.audio_id || null, duur: b.duur || null };
}

async function berichten(env, nr, lid, na = 0) {
  return ((await env.SHOP_DB.prepare(`SELECT b.*, l.gebruikersnaam, l.avatar_id FROM cb_berichten b JOIN leden l ON l.id = b.lid_id
    WHERE b.nr = ? AND b.verwijderd = 0 AND b.aangemaakt > ? AND b.id > ? ORDER BY b.id DESC LIMIT 200`).bind(nr, grens(), na).all()).results || []).reverse().map((b) => berichtJson(b, lid));
}

const SOORTEN = ["hart", "lach", "duim"];
async function reacties(env, nr, lid) {
  const r = (await env.SHOP_DB.prepare(`SELECT x.bericht_id id, x.soort, COUNT(*) n, SUM(x.lid_id = ?) mijn FROM cb_reacties x JOIN cb_berichten b ON b.id = x.bericht_id
    WHERE b.nr = ? AND b.verwijderd = 0 AND b.aangemaakt > ? GROUP BY x.bericht_id, x.soort`).bind(lid.id, nr, grens()).all()).results || [];
  const m = {};
  for (const x of r) { m[x.id] ||= {}; m[x.id][x.soort] = [x.n, x.mijn ? 1 : 0]; }
  return m;
}

async function reageer(request, env, lid, id) {
  if (!mag(lid)) return json({ ok: false, fout: "Bevestig eerst je mailadres." }, 403);
  let d = {}; try { d = await request.json(); } catch { /* leeg */ }
  if (!SOORTEN.includes(d.soort)) return json({ ok: false }, 400);
  const b = await env.SHOP_DB.prepare("SELECT nr FROM cb_berichten WHERE id = ? AND verwijderd = 0 AND aangemaakt > ?").bind(id, grens()).first();
  if (!b) return json({ ok: false }, 404);
  const had = await env.SHOP_DB.prepare("SELECT 1 FROM cb_reacties WHERE bericht_id = ? AND lid_id = ? AND soort = ?").bind(id, lid.id, d.soort).first();
  if (had) await env.SHOP_DB.prepare("DELETE FROM cb_reacties WHERE bericht_id = ? AND lid_id = ? AND soort = ?").bind(id, lid.id, d.soort).run();
  else await env.SHOP_DB.prepare("INSERT OR IGNORE INTO cb_reacties (bericht_id, lid_id, soort, aangemaakt) VALUES (?, ?, ?, ?)").bind(id, lid.id, d.soort, nu()).run();
  return json({ ok: true, reacties: (await reacties(env, b.nr, lid))[id] || {} });
}

async function online(env) {
  return (await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM leden WHERE laatst_cb > ?").bind(new Date(Date.now() - 2 * 60_000).toISOString()).first()).n;
}

async function aanwezig(env, lid) {
  if (!lid.laatst_cb || Date.now() - Date.parse(lid.laatst_cb) > 60_000)
    await env.SHOP_DB.prepare("UPDATE leden SET laatst_cb = ? WHERE id = ?").bind(nu(), lid.id).run();
}

async function gelezen(env, lid, nr, id) {
  if (id) await env.SHOP_DB.prepare("INSERT INTO cb_gelezen (lid_id, nr, laatste_id) VALUES (?, ?, ?) ON CONFLICT (lid_id, nr) DO UPDATE SET laatste_id = MAX(laatste_id, excluded.laatste_id)").bind(lid.id, nr, id).run();
}

const mag = (lid) => !!lid?.bevestigd_op;
const lamp = (k) => k.laatste && Date.now() - Date.parse(k.laatste) < 10 * 60_000 ? "aan" : k.laatste ? "zwak" : "";
const kanaalRij = (x, nr) => `<a class="cb-rij${x.nr === nr ? " aan" : ""}" href="/cb/${x.nr}" data-nr="${x.nr}" title="${esc(x.omschrijving || "")}"><i class="cb-lamp ${lamp(x)}" aria-hidden="true"></i><b>${String(x.nr).padStart(2, "0")}</b><span>${esc(x.naam)}</span>${x.ongelezen && x.nr !== nr ? `<em>${x.ongelezen > 99 ? "99+" : x.ongelezen}</em>` : ""}</a>`;

async function opruimen(env) {
  await env.SHOP_DB.batch([
    env.SHOP_DB.prepare("DELETE FROM cb_berichten WHERE aangemaakt < ?").bind(grens()),
    env.SHOP_DB.prepare("DELETE FROM cb_audio WHERE aangemaakt < ?").bind(grens()),
    env.SHOP_DB.prepare("DELETE FROM cb_reacties WHERE aangemaakt < ?").bind(grens()),
  ]);
}

const sinds = (s) => new Date(Date.now() - s * 1000).toISOString();
async function teSnel(env, lid) {
  const r = await env.SHOP_DB.prepare("SELECT SUM(aangemaakt > ?) kort, COUNT(*) minuut FROM cb_berichten WHERE lid_id = ? AND aangemaakt > ?").bind(sinds(2), lid.id, sinds(60)).first();
  return r.kort > 0 || r.minuut >= 20;
}

// Spraakbericht: ruwe opname (webm/ogg/mp4) in de body, hoogstens 20 s en 600 kB.
const AUDIO = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac"];
async function zendAudio(request, env, lid, nr) {
  if (!mag(lid)) return json({ ok: false, fout: "Bevestig eerst je mailadres." }, 403);
  if (!(await env.SHOP_DB.prepare("SELECT nr FROM cb_kanalen WHERE nr = ?").bind(nr).first())) return json({ ok: false, fout: "Dit kanaal bestaat niet meer." }, 404);
  const type = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!AUDIO.includes(type)) return json({ ok: false, fout: "Dit soort opname wordt niet ondersteund." }, 415);
  const data = await request.arrayBuffer();
  if (data.byteLength < 500) return json({ ok: false, fout: "De opname is leeg." }, 400);
  if (data.byteLength > 600_000) return json({ ok: false, fout: "De opname is te lang (max. 20 seconden)." }, 413);
  if (await teSnel(env, lid)) return json({ ok: false, fout: "Rustig aan, wacht even voor je opnieuw zendt." }, 429);
  const duur = Math.max(1, Math.min(20, Math.round(Number(new URL(request.url).searchParams.get("duur")) || 0))) || null;
  const t = nu();
  const a = await env.SHOP_DB.prepare("INSERT INTO cb_audio (lid_id, type, data, aangemaakt) VALUES (?, ?, ?, ?)").bind(lid.id, type, data, t).run();
  const ins = await env.SHOP_DB.prepare("INSERT INTO cb_berichten (nr, lid_id, tekst, audio_id, duur, aangemaakt) VALUES (?, ?, '', ?, ?, ?)").bind(nr, lid.id, a.meta.last_row_id, duur, t).run();
  const id = ins.meta.last_row_id;
  await gelezen(env, lid, nr, id);
  await aanwezig(env, lid);
  if (Math.random() < 0.1) await opruimen(env);
  return json({ ok: true, bericht: berichtJson({ id, nr, lid_id: lid.id, tekst: "", audio_id: a.meta.last_row_id, duur, aangemaakt: t, gebruikersnaam: lid.gebruikersnaam, avatar_id: lid.avatar_id }, lid) });
}

async function audioTonen(env, id) {
  const a = await env.SHOP_DB.prepare("SELECT type, data FROM cb_audio WHERE id = ? AND aangemaakt > ?").bind(id, grens()).first();
  if (!a) return new Response("Niet meer beschikbaar", { status: 404 });
  const bytes = a.data instanceof ArrayBuffer ? a.data : new Uint8Array(a.data);
  return new Response(bytes, { headers: { "content-type": a.type, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
}

/* ---------------- pagina ---------------- */

async function radio(request, env, url, lid, nr) {
  const lijst = await kanalen(env, lid);
  const k = lijst.find((x) => x.nr === nr);
  if (!k) return naar("/cb/19");
  const eerste = await berichten(env, nr, lid);
  await gelezen(env, lid, nr, eerste.at(-1)?.id);
  await aanwezig(env, lid);
  const n = await online(env);
  const vrij = []; for (let i = 1; i <= MAX_KANAAL; i++) if (!lijst.some((x) => x.nr === i)) vrij.push(i);
  const idx = lijst.indexOf(k);
  const vorige = lijst[(idx - 1 + lijst.length) % lijst.length].nr, volgende = lijst[(idx + 1) % lijst.length].nr;
  const albert = nr === ALBERT;
  const eigenKanalen = lijst.filter((x) => x.lid_id === lid.id).length;
  const magOpheffen = !k.vast && (lid.beheerder || k.lid_id === lid.id);
  const m = url.searchParams.get("m");
  return pagina(env, request, {
    titel: `Kanaal ${nr} · ${k.naam} – CB`, noindex: true, pad: "/cb",
    inhoud: banner("CB", "Op de CB", `Praat live met andere leden. Kies een kanaal, druk op zenden. Berichten verdwijnen na ${CB_UREN} uur, net als op een echte CB.`, [["CB"]], "leden-zonsondergang") + `
<section class="wrap cb-sectie">
  ${m === "nieuw" ? `<div class="melding melding-ok">Kanaal ${nr} is open. Roep de anderen erbij!</div>` : m ? `<div class="melding melding-fout" role="alert">${esc(m)}</div>` : ""}
  <div class="cb-opstelling">
  <div class="cb-radio" data-nr="${nr}" data-albert="${albert ? 1 : 0}" data-mod="${lid.beheerder ? 1 : 0}" data-ik="${esc(lid.gebruikersnaam || "")}">
    <div class="cb-front">
      <a class="cb-draai" href="/cb/${vorige}" aria-label="Vorig kanaal (${vorige})"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></a>
      <div class="cb-lcd" aria-label="Kanaal ${nr}, ${esc(k.naam)}">
        <span class="cb-ch">CH</span><span class="cb-nr">${String(nr).padStart(2, "0")}</span>
        <span class="cb-naam">${esc(k.naam)}</span>
        <span class="cb-rx" id="cb-rx">RX</span>
      </div>
      <a class="cb-draai" href="/cb/${volgende}" aria-label="Volgend kanaal (${volgende})"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></a>
      <div class="cb-smeter" title="Leden op de CB in de laatste 2 minuten" aria-label="${n} ${n === 1 ? "lid" : "leden"} op de CB">
        <span class="cb-s">S</span><span class="cb-bars" id="cb-bars" data-n="${n}">${Array.from({ length: 9 }, (_, i) => `<i class="${i < Math.min(9, n) ? "aan" : ""}"></i>`).join("")}</span><small id="cb-online">${n} op de CB</small>
      </div>
    </div>
    <p class="cb-oms">${esc(k.omschrijving || "")}${!k.vast ? ` · eigen kanaal van een lid, verdwijnt over ${Math.max(1, Math.ceil((Date.parse(k.aangemaakt) + CB_UREN * 3600_000 - Date.now()) / 3600_000))} uur` : ""}</p>
    <div class="cb-log" id="cb-log" aria-live="polite">${eerste.length ? "" : `<p class="cb-stil">Stilte op kanaal ${nr}. Breek de stilte!</p>`}</div>
    <form class="cb-zend" id="cb-zend" autocomplete="off">
      ${mag(lid) ? `<input id="cb-tekst" maxlength="500" placeholder="${albert ? "Zeg iets, Albert" : `Bericht op kanaal ${nr}`}" aria-label="Bericht" required>
      <button class="cb-ptt" type="submit" id="cb-ptt" aria-label="Zenden. Houd ingedrukt om een spraakbericht op te nemen."><span>PTT</span><small>Zenden</small></button>` : `<p>Bevestig eerst je mailadres om te zenden. <a href="/account">Naar mijn account</a></p>`}
    </form>
    ${mag(lid) ? `<p class="cb-hint" id="cb-hint">Typ en druk op PTT, of <b>houd PTT ingedrukt</b> om te praten (max. 20 s).</p>` : ""}
  </div>
  <aside class="cb-paneel" aria-label="Alle kanalen"><div class="cb-paneel-kop">Kanalen <small><i class="cb-lamp aan"></i> actief</small></div>
    <nav class="cb-lijst" id="cb-lijst">${lijst.map((x) => kanaalRij(x, nr)).join("")}</nav></aside>
  </div>
  <script type="application/json" id="cb-data">${JSON.stringify(eerste).replace(/</g, "\\u003c")}</script>
  <script type="application/json" id="cb-reacties">${JSON.stringify(await reacties(env, nr, lid))}</script>


  ${mag(lid) && vrij.length && eigenKanalen < 2 ? `<details class="cb-nieuw"><summary>Zelf een kanaal openen</summary>
    <form method="post" action="/cb/nieuw">
      <label>Kanaal<select name="nr">${vrij.map((i) => `<option>${i}</option>`).join("")}</select></label>
      <label>Naam<input name="naam" maxlength="30" required placeholder="Defender-rijders Limburg"></label>
      <label>Waarover?<input name="omschrijving" maxlength="80" placeholder="Korte uitleg"></label>
      <button class="btn btn-solid" type="submit">Kanaal openen</button>
    </form><small>Je kan zelf 2 kanalen openen. Een eigen kanaal verdwijnt na ${CB_UREN} uur, handig voor een rit of een dag.</small></details>` : ""}
  ${magOpheffen ? `<form method="post" action="/cb/${nr}/opheffen" class="cb-op" data-bevestig="Kanaal ${nr} opheffen?"><button class="linkknop rood" type="submit">Kanaal ${nr} opheffen</button></form>` : ""}
</section><script src="/assets/js/cb.js" defer></script>`,
  });
}

/* ---------------- api ---------------- */

async function ophalen(env, url, lid, nr) {
  const na = parseInt(url.searchParams.get("na"), 10) || 0;
  const b = await berichten(env, nr, lid, na);
  await gelezen(env, lid, nr, b.at(-1)?.id);
  await aanwezig(env, lid);
  const lijst = await kanalen(env, lid);
  return json({ berichten: b, reacties: await reacties(env, nr, lid), online: await online(env), kanalen: lijst.map((x) => ({ nr: x.nr, naam: x.naam, ongelezen: x.nr === nr ? 0 : x.ongelezen, lamp: lamp(x) })) });
}

async function zenden(request, env, url, lid, nr) {
  if (!mag(lid)) return json({ ok: false, fout: "Bevestig eerst je mailadres." }, 403);
  const k = await env.SHOP_DB.prepare("SELECT nr FROM cb_kanalen WHERE nr = ?").bind(nr).first();
  if (!k) return json({ ok: false, fout: "Dit kanaal bestaat niet meer." }, 404);
  let d = {}; try { d = await request.json(); } catch { /* leeg */ }
  const tekst = String(d.tekst || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!tekst) return json({ ok: false, fout: "Leeg bericht." }, 400);
  if (await teSnel(env, lid)) return json({ ok: false, fout: "Rustig aan, wacht even voor je opnieuw zendt." }, 429);
  const t = nu();
  const ins = await env.SHOP_DB.prepare("INSERT INTO cb_berichten (nr, lid_id, tekst, aangemaakt) VALUES (?, ?, ?, ?)").bind(nr, lid.id, tekst, t).run();
  const id = ins.meta.last_row_id;
  await gelezen(env, lid, nr, id);
  if (Math.random() < 0.1) await opruimen(env);
  // @gebruikersnaam: melding in de bel (niet op het Albertkanaal, daar is iedereen Albert).
  if (nr !== ALBERT) {
    const namen = [...new Set((tekst.match(/@([A-Za-z0-9._-]{3,20})/g) || []).map((x) => x.slice(1).toLowerCase()))].slice(0, 10);
    if (namen.length) {
      const ids = ((await env.SHOP_DB.prepare(`SELECT id FROM leden WHERE lower(gebruikersnaam) IN (${namen.map(() => "?").join(",")}) AND id <> ? AND geblokkeerd = 0`).bind(...namen, lid.id).all()).results || []).map((x) => x.id);
      await meld(env, ids, `${lid.gebruikersnaam} riep je op CB-kanaal ${nr}`, `/cb/${nr}`);
    }
  }
  await aanwezig(env, lid);
  return json({ ok: true, bericht: berichtJson({ id, nr, lid_id: lid.id, tekst, aangemaakt: t, gebruikersnaam: lid.gebruikersnaam, avatar_id: lid.avatar_id }, lid) });
}

async function melden(request, env, url, lid, id) {
  const b = await env.SHOP_DB.prepare("SELECT b.*, l.gebruikersnaam, k.naam kanaal FROM cb_berichten b JOIN leden l ON l.id = b.lid_id JOIN cb_kanalen k ON k.nr = b.nr WHERE b.id = ? AND b.verwijderd = 0").bind(id).first();
  if (!b) return json({ ok: false }, 404);
  const recent = await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM lid_log WHERE lid_id = ? AND soort = 'cb' AND tekst LIKE 'CB-bericht gemeld%' AND aangemaakt > ?").bind(lid.id, new Date(Date.now() - 3600_000).toISOString()).first();
  if (recent.n >= 5) return json({ ok: true });
  const aan = (env.BEHEER_EMAILS || "pieter@roverandco.be").split(",")[0].trim();
  await mail(env, {
    aan, onderwerp: `Melding op de CB: kanaal ${b.nr}`,
    tekst: `Er werd een bericht gemeld op de CB.\n\nKanaal: ${b.nr} · ${b.kanaal}\nBericht van: ${b.gebruikersnaam || "?"}${b.nr === ALBERT ? " (toont als Albert)" : ""}\nGemeld door: ${lid.gebruikersnaam}\n\nBericht:\n${b.audio_id ? `(spraakbericht) ${url.origin}/cb/audio/${b.audio_id}` : b.tekst}\n\nVerwijderen kan op ${url.origin}/cb/${b.nr} (ingelogd als moderator). Het lid bekijken of blokkeren: ${url.origin}/beheer/leden/${b.lid_id}\nAlle meldingen: ${url.origin}/beheer/meldingen\nCB-berichten verdwijnen vanzelf na ${CB_UREN} uur.`,
  });
  await env.SHOP_DB.prepare("INSERT INTO forum_meldingen (bericht_id, cb_id, lid_id, reden, aangemaakt) VALUES (0, ?, ?, ?, ?)").bind(b.id, lid.id, "Gemeld op de CB", nu()).run();
  await log(env, lid.id, "cb", `CB-bericht gemeld op kanaal ${b.nr}`, `/cb/${b.nr}`);
  await log(env, b.lid_id, "cb", `CB-bericht van dit lid werd gemeld op kanaal ${b.nr}: ${b.audio_id ? "(spraakbericht)" : b.tekst.slice(0, 120)}`, `/cb/${b.nr}`);
  return json({ ok: true });
}

async function wegdoen(env, lid, id) {
  if (!lid.beheerder) return json({ ok: false }, 403);
  const b = await env.SHOP_DB.prepare("SELECT lid_id, nr, tekst FROM cb_berichten WHERE id = ?").bind(id).first();
  if (!b) return json({ ok: false }, 404);
  await env.SHOP_DB.prepare("UPDATE cb_berichten SET verwijderd = 1 WHERE id = ?").bind(id).run();
  await log(env, b.lid_id, "beheer", `CB-bericht verwijderd door beheer op kanaal ${b.nr}: ${b.tekst.slice(0, 120)}`);
  return json({ ok: true });
}

async function nieuwKanaal(request, env, lid) {
  if (!mag(lid)) return naar("/cb/19");
  const f = await request.formData();
  const nr = parseInt(f.get("nr"), 10);
  const naam = String(f.get("naam") || "").replace(/\s+/g, " ").trim().slice(0, 30);
  const oms = String(f.get("omschrijving") || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const fout = (m) => naar(`/cb/19?m=${encodeURIComponent(m)}`);
  if (!(nr >= 1 && nr <= MAX_KANAAL)) return fout("Kies een kanaal tussen 1 en 40.");
  if (naam.length < 3) return fout("Geef je kanaal een naam van minstens 3 tekens.");
  const eigen = (await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM cb_kanalen WHERE lid_id = ?").bind(lid.id).first()).n;
  if (eigen >= 2 && !lid.beheerder) return fout("Je hebt al 2 eigen kanalen.");
  const r = await env.SHOP_DB.prepare("INSERT OR IGNORE INTO cb_kanalen (nr, naam, omschrijving, lid_id, vast, aangemaakt) VALUES (?, ?, ?, ?, 0, ?)").bind(nr, naam, oms || null, lid.id, nu()).run();
  if (!r.meta.changes) return fout(`Kanaal ${nr} is net door iemand anders genomen. Kies een ander.`);
  await log(env, lid.id, "cb", `Eigen CB-kanaal ${nr} geopend: ${naam}`, `/cb/${nr}`);
  return naar(`/cb/${nr}?m=nieuw`);
}

async function opheffen(env, lid, nr) {
  const k = await env.SHOP_DB.prepare("SELECT * FROM cb_kanalen WHERE nr = ?").bind(nr).first();
  if (!k || k.vast || !(lid.beheerder || k.lid_id === lid.id)) return naar(`/cb/${nr}`);
  await env.SHOP_DB.batch([
    env.SHOP_DB.prepare("DELETE FROM cb_kanalen WHERE nr = ?").bind(nr),
    env.SHOP_DB.prepare("DELETE FROM cb_berichten WHERE nr = ?").bind(nr),
    env.SHOP_DB.prepare("DELETE FROM cb_gelezen WHERE nr = ?").bind(nr),
  ]);
  await log(env, lid.id, lid.beheerder && k.lid_id !== lid.id ? "beheer" : "cb", `CB-kanaal ${nr} (${k.naam}) opgeheven`);
  return naar("/cb/19");
}

export async function cb(request, env, url) {
  const p = url.pathname;
  const api = p.startsWith("/api/cb/");
  if (p !== "/cb" && !p.startsWith("/cb/") && !api) return null;
  if (!env.SHOP_DB) return new Response("Database ontbreekt.", { status: 500 });
  const lid = await huidigLid(request, env);
  if (!lid) return api ? json({ ok: false, fout: "Log opnieuw in." }, 401) : naar(`/account/inloggen?terug=${encodeURIComponent(p)}`);
  if (request.method === "POST" && !eigenOrigin(request, url)) return json({ ok: false }, 403);
  await zaai(env);
  let m;
  if (p === "/cb" || p === "/cb/") return naar("/cb/19");
  if ((m = p.match(/^\/cb\/(\d{1,2})$/))) return radio(request, env, url, lid, +m[1]);
  if (p === "/cb/nieuw" && request.method === "POST") return nieuwKanaal(request, env, lid);
  if ((m = p.match(/^\/cb\/(\d{1,2})\/opheffen$/)) && request.method === "POST") return opheffen(env, lid, +m[1]);
  if ((m = p.match(/^\/api\/cb\/(\d{1,2})$/))) return request.method === "POST" ? zenden(request, env, url, lid, +m[1]) : ophalen(env, url, lid, +m[1]);
  if ((m = p.match(/^\/api\/cb\/(\d{1,2})\/audio$/)) && request.method === "POST") return zendAudio(request, env, lid, +m[1]);
  if ((m = p.match(/^\/cb\/audio\/(\d{1,10})$/))) return audioTonen(env, +m[1]);
  if ((m = p.match(/^\/api\/cb\/reactie\/(\d{1,10})$/)) && request.method === "POST") return reageer(request, env, lid, +m[1]);
  if ((m = p.match(/^\/api\/cb\/meld\/(\d{1,10})$/)) && request.method === "POST") return melden(request, env, url, lid, +m[1]);
  if ((m = p.match(/^\/api\/cb\/weg\/(\d{1,10})$/)) && request.method === "POST") return wegdoen(env, lid, +m[1]);
  return null;
}
