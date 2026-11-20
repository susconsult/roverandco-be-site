// /beheer/versturen: de eenmalige overstapmails versturen vanuit de wachtrij (tabel mail_wachtrij).
// Elke ontvanger staat er één keer in per campagne en krijgt de mail hoogstens één keer
// (status wacht → bezig → verzonden/fout, plus een idempotency-sleutel bij Resend).
// Versturen kan pas als de onderhoudsmodus uit staat: anders leiden de links in de mail naar de onderhoudspagina.
import { esc, pagina } from "./beheer.js";
import { verstuur } from "./mail.js";
import { corTicketMail, aankondigingMail } from "./mails-lancering.js";
import { wachtwoordLink, afmeldLink } from "./leden.js";
import { onderhoudAan } from "./onderhoud.js";
import KALENDER from "../../data/kalender.json";

// Kort mailtje aan organisatoren van wie we activiteiten in de kalender zetten (tekst goedgekeurd door Pieter 20 nov 2026).
// mail_wachtrij: sleutel = waarde van "org" in data/kalender.json, naam = aanspreking.
const MAANDEN = ["", "januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
function kalDatum(x) {
  const [j, m, d] = x.datum.split("-").map(Number);
  if (!x.einde) return `${d} ${MAANDEN[m]} ${j}`;
  const [j2, m2, d2] = x.einde.split("-").map(Number);
  return m === m2 ? `${d} tot ${d2} ${MAANDEN[m2]} ${j2}` : `${d} ${MAANDEN[m]} tot ${d2} ${MAANDEN[m2]} ${j2}`;
}
function kalenderMail(rij) {
  const vandaag = new Date().toISOString().slice(0, 10);
  const acts = KALENDER.filter((x) => (x.org || x.club) === rij.sleutel && (x.einde || x.datum) >= vandaag);
  if (!acts.length) throw new Error("geen activiteiten voor deze organisator");
  const meer = acts.length > 1;
  const lijn = (x) => `${x.titel}, ${kalDatum(x)}`;
  const tekst = [`Hoi ${rij.naam},`, "", `We hebben jullie ${meer ? "activiteiten" : "activiteit"} toegevoegd aan de Land Rover-kalender op onze site:`,
    ...acts.map((x) => `- ${lijn(x)}`), "", `${SITE}/kalender`, "", "Klopt er iets niet, of willen jullie nog iets toevoegen? Laat het gerust weten.", "", "Groetjes,", "Rover & Co"].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#141815">` +
    `<p>Hoi ${esc(rij.naam)},</p><p>We hebben jullie ${meer ? "activiteiten" : "activiteit"} toegevoegd aan de Land Rover-kalender op onze site:</p>` +
    `<ul>${acts.map((x) => `<li>${esc(lijn(x))}</li>`).join("")}</ul>` +
    `<p><a href="${SITE}/kalender" style="color:#3E7350">${SITE.replace("https://", "")}/kalender</a></p>` +
    `<p>Klopt er iets niet, of willen jullie nog iets toevoegen? Laat het gerust weten.</p><p>Groetjes,<br>Rover &amp; Co</p></div>`;
  return { van: "Rover & Co <info@roverandco.be>", zonderLogo: true, onderwerp: "Jullie activiteit staat in onze kalender", tekst, html, bijlagen: [] };
}

const CAMPAGNES = {
  "cor-ticket": { titel: "Ticket Church of Rover", uitleg: "Voor iedereen die zich via de vorige webshop inschreef. Met QR-code en PDF-ticket. Vóór zondag versturen." },
  "aankondiging": { titel: "Aankondiging nieuwe site", uitleg: "Voor alle klanten uit de vorige webshop. Liefst in een paar rondes, niet alles tegelijk." },
  "kalender": { titel: "Organisatoren kalender", uitleg: "Kort mailtje aan clubs van wie we activiteiten in de kalender zetten. Van info@roverandco.be." },
};
const PER_KEER = 10;
const SITE = "https://roverandco.be";
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

async function bouw(env, campagne, rij) {
  const lid = rij.lid_id ? await env.SHOP_DB.prepare("SELECT * FROM leden WHERE id = ?").bind(rij.lid_id).first() : null;
  const ww = lid && !lid.wachtwoord ? await wachtwoordLink(env, SITE, lid.id, { behoud: true }) : "";
  if (campagne === "kalender") return kalenderMail(rij);
  if (campagne === "cor-ticket") {
    const r = await env.SHOP_DB.prepare("SELECT nummer, naam, email, totaal, data FROM registraties WHERE nummer = ?").bind(rij.sleutel).first();
    if (!r) throw new Error("inschrijving niet gevonden");
    return corTicketMail(env, r, { site: SITE, wachtwoordLink: ww });
  }
  if (!lid) throw new Error("lid niet gevonden");
  return aankondigingMail(lid, { site: SITE, wachtwoordLink: ww, afmeldLink: await afmeldLink(env, SITE, lid.id) });
}

export async function verstuurRonde(env, campagne, email) {
  const rijen = (await env.SHOP_DB.prepare("SELECT * FROM mail_wachtrij WHERE campagne = ? AND status = 'wacht' ORDER BY id LIMIT ?").bind(campagne, PER_KEER).all()).results || [];
  let ok = 0, fout = 0;
  for (const rij of rijen) {
    // Eerst claimen, zodat een dubbele klik of twee tabbladen nooit twee keer dezelfde mail sturen.
    const claim = await env.SHOP_DB.prepare("UPDATE mail_wachtrij SET status = 'bezig' WHERE id = ? AND status = 'wacht'").bind(rij.id).run();
    if (!claim.meta?.changes) continue;
    try {
      const m = await bouw(env, campagne, rij);
      const r = await verstuur(env, { aan: rij.email, ...m, sleutel: `${campagne}-${rij.sleutel}` });
      if (!r.ok) throw new Error(r.fout || `status ${r.status}`);
      await env.SHOP_DB.prepare("UPDATE mail_wachtrij SET status = 'verzonden', verzonden_op = ?, resend_id = ?, fout = NULL WHERE id = ?").bind(new Date().toISOString(), r.id || "", rij.id).run();
      ok++;
    } catch (e) {
      await env.SHOP_DB.prepare("UPDATE mail_wachtrij SET status = 'fout', fout = ? WHERE id = ?").bind(String(e.message || e).slice(0, 300), rij.id).run();
      fout++;
    }
    await wacht(400); // rustig aan: Resend laat een paar mails per seconde toe
  }
  if (ok || fout) await env.SHOP_DB.prepare("INSERT INTO lid_log (lid_id, soort, tekst, link, aangemaakt) VALUES (0, 'beheer', ?, '/beheer/versturen', ?)")
    .bind(`${CAMPAGNES[campagne].titel}: ${ok} verstuurd${fout ? `, ${fout} mislukt` : ""} door ${email}`, new Date().toISOString()).run().catch(() => {});
  return { ok, fout };
}

/* ---------- druppelsgewijs (Cron Trigger, zie wrangler.jsonc) ---------- */
// Elke 15 minuten: de volgende 10 tickets (altijd) en de volgende 10 aankondigingen (alleen 8–21 u Belgische tijd).
// Aan/uit met de knop op /beheer/versturen (instellingen.druppel). Nooit tijdens onderhoud.
const uurBrussel = () => Number(new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "numeric", hour12: false }).format(new Date()));
async function druppelAan(env) {
  const r = await env.SHOP_DB.prepare("SELECT waarde FROM instellingen WHERE sleutel = 'druppel'").first().catch(() => null);
  return r?.waarde === "aan";
}
export async function druppel(env) {
  if (!(await druppelAan(env)) || (await onderhoudAan(env))) return;
  await verstuurRonde(env, "cor-ticket", "automatisch");
  await verstuurRonde(env, "kalender", "automatisch");
  const u = uurBrussel();
  if (u >= 8 && u < 21) await verstuurRonde(env, "aankondiging", "automatisch");
}

export async function beheerVersturen(request, env, url, email) {
  if (url.pathname !== "/beheer/versturen") return null;
  const dicht = await onderhoudAan(env);
  let melding = "";
  if (request.method === "POST") {
    const f = await request.formData();
    const campagne = String(f.get("campagne") || "");
    const actie = String(f.get("actie") || "");
    if (!CAMPAGNES[campagne]) melding = "!Onbekende mail.";
    else if (actie === "druppel-aan" || actie === "druppel-uit") {
      await env.SHOP_DB.prepare("INSERT INTO instellingen (sleutel, waarde) VALUES ('druppel', ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde").bind(actie === "druppel-aan" ? "aan" : "uit").run();
      melding = actie === "druppel-aan" ? "Automatisch versturen staat aan." : "Automatisch versturen staat uit.";
    } else if (actie === "opnieuw") {
      await env.SHOP_DB.prepare("UPDATE mail_wachtrij SET status = 'wacht', fout = NULL WHERE campagne = ? AND status = 'fout'").bind(campagne).run();
      melding = "Mislukte mails staan terug klaar.";
    } else if (dicht) melding = "!De site staat nog in onderhoud. Zet die eerst uit, anders werken de links in de mail niet.";
    else {
      const r = await verstuurRonde(env, campagne, email);
      melding = `${r.fout ? "!" : ""}${r.ok} mail${r.ok === 1 ? "" : "s"} verstuurd${r.fout ? `, ${r.fout} mislukt (zie de lijst)` : ""}.`;
    }
  }

  const auto = await druppelAan(env);
  const alle = (await env.SHOP_DB.prepare("SELECT * FROM mail_wachtrij ORDER BY id").all()).results || [];
  const kaarten = Object.entries(CAMPAGNES).map(([k, c]) => {
    const rijen = alle.filter((r) => r.campagne === k);
    const n = (s) => rijen.filter((r) => r.status === s).length;
    const klaar = n("wacht");
    const knop = klaar
      ? `<button type="submit" name="actie" value="stuur" ${dicht ? "disabled" : ""} onclick="this.disabled=true;this.textContent='Bezig met versturen…';this.form.submit()">Verstuur de volgende ${Math.min(PER_KEER, klaar)}</button>`
      : `<span class="badge b-betaald">Alles verstuurd</span>`;
    const lijst = rijen.map((r) => `<tr><td>${esc(r.naam || "")}</td><td>${esc(r.email)}</td><td>${r.status === "verzonden" ? `<span class="badge b-betaald">verzonden</span>` : r.status === "fout" ? `<span class="badge b-fout" title="${esc(r.fout || "")}">mislukt</span>` : `<span class="badge">${esc(r.status)}</span>`}</td></tr>`).join("");
    return `<div class="kaart"><h2>${esc(c.titel)}</h2><p>${esc(c.uitleg)}</p>
<div class="som"><div><b>${rijen.length}</b>ontvangers</div><div><b>${n("verzonden")}</b>verzonden</div><div><b>${klaar}</b>nog te versturen</div>${n("fout") ? `<div><b>${n("fout")}</b>mislukt</div>` : ""}</div>
<form method="post" action="/beheer/versturen" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input type="hidden" name="campagne" value="${k}">${knop}
${n("fout") ? `<button type="submit" name="actie" value="opnieuw">Mislukte opnieuw klaarzetten</button>` : ""}<a href="/beheer/testmail">Eerst een testmail naar mezelf</a></form>
<details style="margin-top:12px"><summary>Lijst van ontvangers</summary><table><tr><th>Naam</th><th>Mail</th><th>Status</th></tr>${lijst}</table></details></div>`;
  }).join("");

  return pagina("Overstapmails versturen", `<!--aan:versturen-->${melding ? `<div class="${melding.startsWith("!") ? "melding-fout" : "melding-ok"}">${esc(melding.replace(/^!/, ""))}</div>` : ""}
${dicht ? `<div class="melding-fout">De site staat nog in onderhoud: versturen kan pas als je die uitzet op <a href="/beheer">Te doen</a>.</div>` : ""}
<div class="kaart"><h2>Automatisch versturen: ${auto ? "aan" : "uit"}</h2><p>Elke 15 minuten gaan de volgende ${PER_KEER} tickets en de volgende ${PER_KEER} aankondigingen weg. Aankondigingen alleen tussen 8 en 21 uur.</p>
<form method="post" action="/beheer/versturen"><input type="hidden" name="campagne" value="aankondiging"><button type="submit" name="actie" value="${auto ? "druppel-uit" : "druppel-aan"}">${auto ? "Stop automatisch versturen" : "Start automatisch versturen"}</button></form></div>
<p>Per klik gaan er ${PER_KEER} mails weg. Iedereen krijgt elke mail hoogstens één keer.</p>${kaarten}`, email);
}
