// Webshopbestellingen gaan naar Wolf Workwear (die maakt en verstuurt de kledij en mokken).
// - Bij elke betaalde bestelling: mail naar Wolf met een knop naar /wolf/<token> (geen login nodig).
// - Op die pagina duidt Wolf aan: "Verzonden" (vervoerder + track & trace verplicht) of "Ligt klaar in Ham".
//   De klant krijgt dan automatisch een mail; de bestelling is voor ons afgehandeld.
// - Klikt Wolf niet: herinnering na 5 dagen, daarna om de 7 dagen. Na 14 dagen een mail naar het beheer
//   en een rode balk op /beheer (zie thuis() in beheer-leden.js). Loopt via de Cron Trigger (src/worker.ts).
import { verstuur, htmlMail, alinea, kader, knop, kop2, esc } from "./mail.js";

const WOLF = (env) => env.WOLF_EMAIL || "wolfworkwear@gmail.com";
const BEHEER = (env) => (env.BEHEER_EMAILS || "pieter@roverandco.be").split(",")[0].trim();
const SITE = "https://roverandco.be";
const DAG = 86400_000;
export const WOLF_EERSTE_HERINNERING = 5, WOLF_HERHAAL = 7, WOLF_ESCALATIE = 14; // dagen
export const VERVOERDERS = ["bpost", "PostNL", "DPD", "GLS", "UPS", "Andere"];
export const AFHAALPUNT = { naam: "The Wolf Garage", adres: "Olmensesteenweg 105, 3945 Tessenderlo-Ham", uren: "ma–vr 09:00–17:00 (za en zo gesloten)" };

const nu = () => new Date().toISOString();
const datum = (iso) => iso ? new Date(iso).toLocaleString("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";

let klaarGemaakt = false;
export async function wolfTabel(env) {
  if (klaarGemaakt) return;
  await env.SHOP_DB.prepare(`CREATE TABLE IF NOT EXISTS wolf_opvolging (nummer TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, gestuurd_op TEXT NOT NULL,
    herinnerd_op TEXT, herinneringen INTEGER NOT NULL DEFAULT 0, geescaleerd_op TEXT, status TEXT NOT NULL DEFAULT 'open',
    vervoerder TEXT, tt TEXT, klaar_op TEXT)`).run();
  klaarGemaakt = true;
}

const token = () => [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, "0")).join("");
const leveringTekst = (l) => ({ activiteit: "Ophalen op activiteit", oostham: "Ophalen (Ham)", verzenden: "Verzenden" }[l?.type] || l?.type || "");
const adresTekst = (l) => [l.straat, [l.postcode, l.gemeente].filter(Boolean).join(" "), l.land].filter(Boolean).join(", ");
const artikelLijnen = (d) => (d.artikels || d.lijnen || []).map((a) => {
  const k = Object.keys(a.keuzes || {}).map((n) => `${n}: ${a.keuzes[n]}`).join(", ");
  return `${a.aantal} × ${a.naam}${k ? ` (${k})` : ""}`;
});

function bestelKader(r, d) {
  const lev = d.levering || {};
  const rijen = [["Bestelnummer", r.nummer], ["Klant", r.naam || d.klant?.naam || ""], ["Telefoon", r.telefoon || d.klant?.telefoon || ""], ["E-mail", r.email || d.klant?.email || ""],
    ["Levering", leveringTekst(lev) + (lev.activiteit ? ` – ${lev.activiteit}` : "")]];
  if (lev.type === "verzenden") rijen.push(["Adres", adresTekst(lev)]);
  return rijen.filter(([, w]) => w);
}

/* ---------- 1. bestelling naar Wolf ---------- */

// Na een betaalde webshopbestelling. Stuurt nooit twee keer (zelfde nummer = niets doen).
// Schakelaar in /beheer (Overzicht › Instellingen). Standaard UIT tot Pieter de testmails heeft goedgekeurd.
export async function wolfAan(env) {
  const r = await env.SHOP_DB.prepare("SELECT waarde FROM instellingen WHERE sleutel = 'wolf'").first().catch(() => null);
  return r?.waarde === "aan";
}
export async function zetWolf(env, aan) {
  await env.SHOP_DB.prepare("INSERT INTO instellingen (sleutel, waarde) VALUES ('wolf', ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde").bind(aan ? "aan" : "uit").run();
}

export async function naarWolf(env, nummer, { handmatig = false } = {}) {
  try {
    if (!handmatig && !(await wolfAan(env))) return { ok: false, fout: "doorsturen naar Wolf staat uit" };
    await wolfTabel(env);
    const r = await env.SHOP_DB.prepare("SELECT * FROM registraties WHERE nummer = ? AND soort = 'bestelling'").bind(nummer).first();
    if (!r || r.test) return { ok: false, fout: "geen echte bestelling" };
    const t = token();
    const ins = await env.SHOP_DB.prepare("INSERT OR IGNORE INTO wolf_opvolging (nummer, token, gestuurd_op) VALUES (?, ?, ?)").bind(nummer, t, nu()).run();
    if (!ins.meta.changes) return { ok: true, al: true };
    return await stuurWolfMail(env, r, t, 0);
  } catch (e) {
    console.log("naarWolf fout", nummer, String(e));
    return { ok: false, fout: String(e) };
  }
}

async function stuurWolfMail(env, r, t, herinnering) {
  const m = wolfMailInhoud(r, t, herinnering);
  const res = await verstuur(env, { aan: WOLF(env), ...m, sleutel: `wolf-${r.nummer}-${herinnering}` });
  if (!res.ok) console.log("wolfmail fout", r.nummer, res.fout);
  return res;
}

// Ook gebruikt door /beheer/testmail. Bewust kaal en functioneel (geen logo/kader): wat, naar wie, knop.
const kort = (naam) => String(naam).replace(/^Rover & Co\s+/i, "").replace(/^Emaille\s+/i, "");
export function wolfMailInhoud(r, t, herinnering) {
  const d = JSON.parse(r.data || "{}");
  const lev = d.levering || {};
  const link = `${SITE}/wolf/${t}`;
  const dagen = Math.floor((Date.now() - new Date(r.betaald_op || r.aangemaakt).getTime()) / DAG);
  const items = (d.artikels || d.lijnen || []).map((a) => {
    const k = Object.values(a.keuzes || {}).join(", ");
    return { lang: `${a.aantal} × ${a.naam}${k ? ` (${k})` : ""}`, kort: `${a.aantal}× ${kort(a.naam)}` };
  });
  const naam = r.naam || d.klant?.naam || "", tel = r.telefoon || d.klant?.telefoon || "";
  const [waarKop, waar] = lev.type === "verzenden" ? ["Verzenden naar", adresTekst(lev)]
    : lev.type === "activiteit" ? ["Meegeven naar", lev.activiteit || "activiteit"] : ["Afhalen", "in Ham"];
  const onderwerp = herinnering ? `Nog open (${dagen} dagen): ${r.nummer}` : `Bestelling ${r.nummer}: ${items.map((i) => i.kort).join(", ")}`.slice(0, 140);
  const F = "font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#141815";
  const kop = (t) => `<p style="${F};margin:18px 0 4px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5B625C">${esc(t)}</p>`;
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:16px;background:#ffffff">
<div style="max-width:520px">
${herinnering ? `<p style="${F};margin:0 0 6px;font-size:15px;font-weight:700;color:#a32d2d">Staat al ${dagen} dagen open.</p>` : ""}
<p style="${F};margin:0;font-size:13px;color:#5B625C">Rover &amp; Co · ${esc(r.nummer)}</p>
${kop("Te maken")}
<p style="${F};margin:0;font-size:17px;line-height:1.5;font-weight:600">${items.map((i) => esc(i.lang)).join("<br>")}</p>
${kop(waarKop)}
<p style="${F};margin:0;font-size:15px;line-height:1.5">${esc(naam)}${tel ? ` · <a href="tel:${esc(tel.replace(/\s/g, ""))}" style="color:#141815">${esc(tel)}</a>` : ""}<br>${esc(waar)}</p>
${d.opmerking ? `<p style="${F};margin:12px 0 0;font-size:15px"><b>Opmerking:</b> ${esc(d.opmerking)}</p>` : ""}
<p style="margin:22px 0 0"><a href="${link}" style="${F};display:inline-block;background:#1F3B2A;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:13px 22px;border-radius:8px">Verzonden / klaar →</a></p>
</div></body></html>`;
  const tekst = [herinnering ? `Staat al ${dagen} dagen open.\n` : "", `Rover & Co · ${r.nummer}`, "", "TE MAKEN", ...items.map((i) => i.lang), "", waarKop.toUpperCase(), `${naam}${tel ? " · " + tel : ""}`, waar,
    d.opmerking ? `\nOpmerking: ${d.opmerking}` : "", "", `Verzonden / klaar: ${link}`].join("\n");
  return { onderwerp, tekst, html, zonderLogo: true };
}

/* ---------- 2. de pagina voor Wolf ---------- */

const pagina = (titel, inhoud, status = 200) => new Response(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(titel)} – Rover &amp; Co</title><link rel="icon" href="/favicon.png"><style>
:root{--g:#1F3B2A;--m:#5B625C}*{box-sizing:border-box}body{margin:0;background:#ECE6D6;font:16px/1.5 Inter,system-ui,sans-serif;color:#141815}
header{background:var(--g);color:#fff;padding:14px 18px;font-weight:700}main{max-width:520px;margin:0 auto;padding:16px}
.kaart{background:#fff;border-radius:12px;padding:16px;margin-bottom:14px}h1{font-size:20px;margin:0 0 6px}small,.m{color:var(--m)}
ul{margin:8px 0 0;padding-left:18px}dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:10px 0 0;font-size:15px}dt{color:var(--m)}
.keuze{display:grid;grid-template-columns:1fr 1fr;gap:8px}.keuze label{border:2px solid #DED5BF;border-radius:10px;padding:14px 10px;text-align:center;font-weight:600;cursor:pointer}
.keuze input{position:absolute;opacity:0}.keuze label:has(input:checked){background:var(--g);border-color:var(--g);color:#fff}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 12px}.chips label{border:1.5px solid #DED5BF;border-radius:99px;padding:6px 14px;cursor:pointer}.chips input{position:absolute;opacity:0}.chips label:has(input:checked){background:var(--g);border-color:var(--g);color:#fff}
input[type=text]{width:100%;font-size:16px;padding:11px 12px;border:1.5px solid #DED5BF;border-radius:8px}
button{width:100%;margin-top:14px;background:var(--g);color:#fff;border:0;border-radius:10px;padding:14px;font-size:16px;font-weight:700}
.fout{background:#f7dede;color:#791f1f;padding:10px 12px;border-radius:8px;margin-bottom:12px}.ok{background:#dcefe2;color:#1F3B2A;padding:12px;border-radius:8px}
[hidden]{display:none!important}</style></head><body><header>Rover &amp; Co · bestelling</header><main>${inhoud}</main></body></html>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" } });

function bestelBlok(r, d) {
  return `<div class="kaart"><h1>${esc(r.nummer)}</h1><small>Betaald op ${esc(datum(r.betaald_op || r.aangemaakt))}</small>
<ul>${artikelLijnen(d).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<dl>${bestelKader(r, d).filter(([l]) => l !== "Bestelnummer").map(([l, w]) => `<dt>${esc(l)}</dt><dd style="margin:0">${esc(w)}</dd>`).join("")}</dl>
${d.opmerking ? `<p><b>Opmerking:</b> ${esc(d.opmerking)}</p>` : ""}</div>`;
}

function formulier(r, d, t, fout = "", w = {}) {
  const wat = w.wat || "verzonden";
  return pagina(r.nummer, `${bestelBlok(r, d)}<form class="kaart" method="post" action="/wolf/${t}">
${fout ? `<div class="fout">${esc(fout)}</div>` : ""}
<p style="margin-top:0"><b>Wat is er gebeurd?</b></p>
<div class="keuze"><label><input type="radio" name="wat" value="verzonden" ${wat === "verzonden" ? "checked" : ""}>Verzonden</label><label><input type="radio" name="wat" value="klaar" ${wat === "klaar" ? "checked" : ""}>${d.levering?.type === "activiteit" ? "Ligt klaar" : "Ligt klaar in Ham"}</label></div>
<div id="verz" ${wat === "klaar" ? "hidden" : ""}><p style="margin:16px 0 0">Verzonden met</p>
<div class="chips">${VERVOERDERS.map((v) => `<label><input type="radio" name="vervoerder" value="${v}" ${w.vervoerder === v ? "checked" : ""}>${v}</label>`).join("")}</div>
<label>Track &amp; trace (verplicht)<input type="text" name="tt" value="${esc(w.tt || "")}" maxlength="80" autocomplete="off" autocapitalize="characters"></label></div>
<div id="klaar" class="m" ${wat === "klaar" ? "" : "hidden"}><p>${d.levering?.type === "activiteit" && d.levering?.activiteit
    ? `Let op: de klant haalt dit op op <b>${esc(d.levering.activiteit)}</b>. Geef het mee naar die activiteit; de klant krijgt een mail dat het klaar is.`
    : `De klant krijgt een mail dat de bestelling klaarligt bij ${esc(AFHAALPUNT.naam)}, ${esc(AFHAALPUNT.adres)} (${esc(AFHAALPUNT.uren)}).`}</p></div>
<button type="submit">Bevestigen</button></form>
<script>document.querySelectorAll('input[name=wat]').forEach(function(i){i.addEventListener('change',function(){var k=document.querySelector('input[name=wat]:checked').value==='klaar';document.getElementById('verz').hidden=k;document.getElementById('klaar').hidden=!k})})</script>`);
}

export async function wolfPagina(request, env, url) {
  const m = url.pathname.match(/^\/wolf\/([a-f0-9]{40})$/);
  if (!m) return url.pathname.startsWith("/wolf/") ? pagina("Niet gevonden", `<div class="kaart">Deze link klopt niet.</div>`, 404) : null;
  await wolfTabel(env);
  const o = await env.SHOP_DB.prepare("SELECT * FROM wolf_opvolging WHERE token = ?").bind(m[1]).first();
  if (!o) return pagina("Niet gevonden", `<div class="kaart">Deze link klopt niet (meer).</div>`, 404);
  const r = await env.SHOP_DB.prepare("SELECT * FROM registraties WHERE nummer = ?").bind(o.nummer).first();
  if (!r) return pagina("Niet gevonden", `<div class="kaart">Bestelling niet gevonden.</div>`, 404);
  const d = JSON.parse(r.data || "{}");
  if (o.status !== "open") return pagina(r.nummer, `${bestelBlok(r, d)}<div class="kaart ok">Staat genoteerd op ${esc(datum(o.klaar_op))}: ${o.status === "verzonden" ? `verzonden met ${esc(o.vervoerder)} (track &amp; trace ${esc(o.tt)})` : "ligt klaar in Ham"}. De klant kreeg een mail. Bedankt!</div><p class="m">Klopt er iets niet? Mail naar info@roverandco.be.</p>`);
  if (request.method !== "POST") return formulier(r, d, m[1]);

  const f = await request.formData();
  const wat = f.get("wat") === "klaar" ? "klaar" : "verzonden";
  const vervoerder = VERVOERDERS.includes(String(f.get("vervoerder"))) ? String(f.get("vervoerder")) : "";
  const tt = String(f.get("tt") || "").trim().replace(/\s+/g, "").slice(0, 80);
  if (wat === "verzonden" && !vervoerder) return formulier(r, d, m[1], "Kies met wie je het verzonden hebt.", { wat, tt });
  if (wat === "verzonden" && tt.length < 5) return formulier(r, d, m[1], "Vul de track & trace in.", { wat, vervoerder, tt });
  // Alleen de eerste klik telt (dubbel tikken = geen twee mails).
  const upd = await env.SHOP_DB.prepare("UPDATE wolf_opvolging SET status = ?, vervoerder = ?, tt = ?, klaar_op = ? WHERE token = ? AND status = 'open'")
    .bind(wat, wat === "verzonden" ? vervoerder : null, wat === "verzonden" ? tt : null, nu(), m[1]).run();
  if (upd.meta.changes) {
    await env.SHOP_DB.prepare("UPDATE registraties SET afgehandeld = 1, bijgewerkt = ? WHERE nummer = ?").bind(nu(), r.nummer).run();
    await klantMail(env, r, d, { status: wat, vervoerder, tt });
  }
  return new Response(null, { status: 303, headers: { location: `/wolf/${m[1]}`, "cache-control": "no-store" } });
}

/* ---------- 3. mail naar de klant ---------- */

export function klantWolfMail(r, d, o) {
  const naam = (r.naam || d.klant?.naam || "").split(" ")[0];
  const lijnen = artikelLijnen(d);
  if (o.status === "verzonden") {
    const rijen = [["Bestelnummer", r.nummer], ["Verzonden met", o.vervoerder], ["Track & trace", o.tt]];
    return { onderwerp: `Je bestelling is onderweg (${r.nummer})`,
      html: htmlMail({ eyebrow: "Onderweg", titel: "Je bestelling is onderweg", inhoud: alinea(`Hallo ${esc(naam)},`) +
        alinea("Goed nieuws: je bestelling bij Rover &amp; Co is verzonden. Met de track &amp; trace volg je het pakje op de site van de vervoerder.") + kader(rijen) +
        kop2("In het pakje") + alinea(lijnen.map(esc).join("<br>")) + alinea("Veel plezier ermee!") }),
      tekst: [`Hallo ${naam},`, "", "Goed nieuws: je bestelling bij Rover & Co is verzonden.", "", ...rijen.map(([l, w]) => `${l}: ${w}`), "", "In het pakje:", ...lijnen, "", "Veel plezier ermee!", "Rover & Co VZW"].join("\n") };
  }
  const opAct = d.levering?.type === "activiteit" && d.levering?.activiteit;
  if (opAct) {
    const rijen = [["Bestelnummer", r.nummer], ["Ophalen op", d.levering.activiteit]];
    return { onderwerp: `Je bestelling ligt klaar (${r.nummer})`,
      html: htmlMail({ eyebrow: "Klaar", titel: "Je bestelling ligt klaar", inhoud: alinea(`Hallo ${esc(naam)},`) +
        alinea("Je bestelling bij Rover &amp; Co is klaar. Je krijgt ze op de activiteit; vermeld daar je bestelnummer.") + kader(rijen) +
        kop2("Wat ligt er klaar") + alinea(lijnen.map(esc).join("<br>")) + alinea("Tot dan!") }),
      tekst: [`Hallo ${naam},`, "", "Je bestelling bij Rover & Co is klaar. Je krijgt ze op de activiteit; vermeld daar je bestelnummer.", "", ...rijen.map(([l, w]) => `${l}: ${w}`), "", ...lijnen, "", "Tot dan!", "Rover & Co VZW"].join("\n") };
  }
  const rijen = [["Bestelnummer", r.nummer], ["Afhalen bij", AFHAALPUNT.naam], ["Adres", AFHAALPUNT.adres], ["Open", AFHAALPUNT.uren]];
  return { onderwerp: `Je bestelling ligt klaar (${r.nummer})`,
    html: htmlMail({ eyebrow: "Klaar om af te halen", titel: "Je bestelling ligt klaar", inhoud: alinea(`Hallo ${esc(naam)},`) +
      alinea("Je bestelling bij Rover &amp; Co ligt klaar. Je kan ze afhalen tijdens de openingsuren; vermeld je bestelnummer.") + kader(rijen) +
      kop2("Wat ligt er klaar") + alinea(lijnen.map(esc).join("<br>")) + alinea("Tot binnenkort!") }),
    tekst: [`Hallo ${naam},`, "", "Je bestelling bij Rover & Co ligt klaar. Je kan ze afhalen tijdens de openingsuren; vermeld je bestelnummer.", "", ...rijen.map(([l, w]) => `${l}: ${w}`), "", ...lijnen, "", "Tot binnenkort!", "Rover & Co VZW"].join("\n") };
}

async function klantMail(env, r, d, o) {
  const aan = r.email || d.klant?.email;
  if (!aan) return;
  const m = klantWolfMail(r, d, o);
  const res = await verstuur(env, { aan, ...m, sleutel: `wolf-klant-${r.nummer}` });
  await env.SHOP_DB.prepare("UPDATE registraties SET notitie = CASE WHEN coalesce(notitie, '') = '' THEN ?1 ELSE notitie || char(10) || ?1 END WHERE nummer = ?2")
    .bind(`${datum(nu())}: ${o.status === "verzonden" ? `verzonden door Wolf met ${o.vervoerder} (${o.tt})` : "klaar in Ham (Wolf)"}; klantmail ${res.ok ? "verstuurd" : "MISLUKT: " + res.fout}`, r.nummer).run();
}

/* ---------- 4. opvolging (cron) ---------- */

export async function wolfOpvolging(env, { altijd = false } = {}) {
  if (!altijd && !(await wolfAan(env))) return;
  const uur = Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false }));
  if (!altijd && (uur < 8 || uur >= 21)) return; // geen herinneringen 's nachts
  await wolfTabel(env);
  const open = (await env.SHOP_DB.prepare("SELECT o.*, r.data, r.naam, r.email, r.telefoon, r.aangemaakt, r.betaald_op, r.test FROM wolf_opvolging o JOIN registraties r ON r.nummer = o.nummer WHERE o.status = 'open' ORDER BY o.gestuurd_op LIMIT 20").all()).results || [];
  const t = Date.now();
  for (const o of open) {
    const oud = (t - new Date(o.gestuurd_op).getTime()) / DAG;
    const sindsHerinnering = o.herinnerd_op ? (t - new Date(o.herinnerd_op).getTime()) / DAG : Infinity;
    if ((o.herinneringen === 0 && oud >= WOLF_EERSTE_HERINNERING) || (o.herinneringen > 0 && sindsHerinnering >= WOLF_HERHAAL)) {
      const n = o.herinneringen + 1;
      const c = await env.SHOP_DB.prepare("UPDATE wolf_opvolging SET herinneringen = ?, herinnerd_op = ? WHERE nummer = ? AND herinneringen = ?").bind(n, new Date().toISOString(), o.nummer, o.herinneringen).run();
      if (c.meta.changes) await stuurWolfMail(env, o, o.token, n);
    }
    if (oud >= WOLF_ESCALATIE && !o.geescaleerd_op) {
      const c = await env.SHOP_DB.prepare("UPDATE wolf_opvolging SET geescaleerd_op = ? WHERE nummer = ? AND geescaleerd_op IS NULL").bind(new Date().toISOString(), o.nummer).run();
      if (c.meta.changes) {
        const d = JSON.parse(o.data || "{}");
        await verstuur(env, { aan: BEHEER(env), ...escalatieMail(o, d, oud), sleutel: `wolf-escalatie-${o.nummer}` });
      }
    }
  }
}

export const escalatieMail = (o, d, oud) => ({ onderwerp: `Wolf: bestelling ${o.nummer} staat al ${Math.floor(oud)} dagen open`,
  tekst: [`Bestelling ${o.nummer} (${o.naam}) is nog niet als verzonden of klaar aangeduid door Wolf.`, `Doorgestuurd: ${datum(o.gestuurd_op)}`, `Herinneringen: ${o.herinneringen}`, "", ...artikelLijnen(d), "", `In het beheer: ${SITE}/beheer/r/${o.nummer}`].join("\n") });

/* ---------- 5. voor het beheer ---------- */

export async function wolfStand(env) {
  await wolfTabel(env);
  const r = await env.SHOP_DB.prepare("SELECT COUNT(*) n, MIN(gestuurd_op) oudste, SUM(gestuurd_op < ?) laat FROM wolf_opvolging WHERE status = 'open'")
    .bind(new Date(Date.now() - WOLF_ESCALATIE * DAG).toISOString()).first();
  return { open: Number(r?.n || 0), laat: Number(r?.laat || 0), oudsteDagen: r?.oudste ? Math.floor((Date.now() - new Date(r.oudste).getTime()) / DAG) : 0 };
}

export async function wolfInfo(env, nummer) {
  await wolfTabel(env);
  return env.SHOP_DB.prepare("SELECT * FROM wolf_opvolging WHERE nummer = ?").bind(nummer).first();
}
