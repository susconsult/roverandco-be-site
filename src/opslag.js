// Opslag van bestellingen en inschrijvingen in D1 (binding SHOP_DB), in de plaats van de Google Sheet.
// Zelfde acties en antwoorden als het vroegere Apps Script, zodat index.js amper verandert:
//  nieuw      : rij toevoegen of bijwerken (zelfde nummer = opnieuw proberen). Controleert tijdsloten en capaciteit.
//  ordercode  : Viva-ordercode bij de rij zetten.
//  betaald    : rij op "Betaald" zetten (de Worker heeft de betaling bij Viva gecontroleerd) en meldingen sturen.
//  mailstatus : resultaat van de klantmail (Resend) noteren.
// Meldingen naar Pieter gaan via Resend (vroeger MailApp).

const MELDING_AAN = "pieter@roverandco.be";
const VRAGEN_AAN = "info@roverandco.be";
const AFZENDER = "Rover & Co VZW <noreply@roverandco.be>";
const BETAALD = "Betaald";

const nu = () => new Date().toISOString();

export async function opslag(env, actie, b) {
  try {
    if (actie === "nieuw") return await nieuw(env, b);
    if (actie === "ordercode") return await zetOrdercode(env, b);
    if (actie === "betaald") return await betaald(env, b);
    if (actie === "mailstatus") return await mailstatus(env, b);
    return { ok: false, fout: "onbekende actie" };
  } catch (e) {
    console.log("opslag fout", actie, String(e));
    return null;
  }
}

const db = (env) => env.SHOP_DB;
const haal = (env, nummer) => db(env).prepare("SELECT * FROM registraties WHERE nummer = ?").bind(nummer).first();

// Telt mee voor capaciteit: betaald, test, gratis bevestigd, of nog aan het betalen binnen de betaaltijd.
function teltMee(r, grensMs) {
  const st = String(r.status);
  return st === BETAALD || st.startsWith("Test") || st.startsWith("Bevestigd") ||
    (st === "Wacht op betaling" && Date.now() - new Date(r.aangemaakt).getTime() < grensMs);
}

async function andere(env, b, eigenNummer) {
  const { results } = await db(env)
    .prepare("SELECT nummer, status, aangemaakt, tijdslot, slot_personen, data FROM registraties WHERE soort = 'inschrijving' AND activiteit = ? AND nummer != ?")
    .bind(b.activiteit, eigenNummer || "").all();
  const grens = (Number(b.betaaltijd_min) || 15) * 60 * 1000;
  return (results || []).filter((r) => teltMee(r, grens));
}

function telOnderdelen(rijen) {
  const som = {};
  for (const r of rijen) {
    let d; try { d = JSON.parse(r.data); } catch { continue; }
    for (const l of d.lijnen || []) som[l.id] = (som[l.id] || 0) + l.aantal;
  }
  return som;
}

async function nieuw(env, b) {
  if (!["bestelling", "inschrijving"].includes(b.soort) || !b.nummer || !b.klant) return { ok: false, fout: "onvolledig" };
  const bestaand = await haal(env, b.nummer);
  if (bestaand?.status === BETAALD) return { ok: true, nummer: b.nummer, betaald: true };

  let voor = {};
  if (b.soort === "inschrijving") {
    const rijen = await andere(env, b, b.nummer);
    if (b.max_per_slot > 0 && b.tijdslot) {
      const bezet = rijen.filter((r) => String(r.tijdslot) === b.tijdslot).reduce((s, r) => s + (Number(r.slot_personen) || 0), 0);
      if (bezet + b.slot_personen > b.max_per_slot) return { ok: false, fout: "vol" };
    }
    voor = telOnderdelen(rijen);
    for (const l of b.limieten || []) {
      if (l.capaciteit > 0 && (voor[l.id] || 0) + l.aantal > l.capaciteit) return { ok: false, fout: "vol", onderdeel: l.naam };
    }
  }

  const t = nu();
  await db(env).prepare(
    `INSERT INTO registraties (nummer, soort, aangemaakt, bijgewerkt, test, status, naam, email, telefoon, activiteit, tijdslot, slot_personen, totaal, viva_ordercode, data)
     VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL, ?13)
     ON CONFLICT(nummer) DO UPDATE SET bijgewerkt = ?3, test = ?4, status = ?5, naam = ?6, email = ?7, telefoon = ?8,
       activiteit = ?9, tijdslot = ?10, slot_personen = ?11, totaal = ?12, viva_ordercode = NULL, data = ?13`
  ).bind(
    b.nummer, b.soort, b.aangemaakt || t, b.test ? 1 : 0, b.status, b.klant.naam, b.klant.email, b.klant.telefoon,
    b.soort === "inschrijving" ? b.activiteit : (b.levering?.activiteit || null),
    b.tijdslot || null, b.slot_personen || 0, b.totaal, JSON.stringify(b)
  ).run();

  // Zonder betaling (testmodus of gratis): meteen melden.
  const res = { ok: true, nummer: b.nummer };
  if (b.status !== "Wacht op betaling" && !bestaand) {
    await stuurMelding(env, b, "");
    if (b.soort === "inschrijving") await controleerGrenzen(env, b, voor);
    if (!b.test) {
      const status = b.resend ? "wordt verstuurd" : "niet verstuurd: Resend is nog niet ingesteld";
      await db(env).prepare("UPDATE registraties SET mail_klant = ? WHERE nummer = ?").bind(status, b.nummer).run();
      if (b.resend) res.mail = klantMail(b);
    }
  }
  return res;
}

async function zetOrdercode(env, b) {
  const r = await db(env).prepare("UPDATE registraties SET viva_ordercode = ?, bijgewerkt = ? WHERE nummer = ?")
    .bind(String(b.ordercode), nu(), b.nummer).run();
  return r.meta.changes ? { ok: true } : { ok: false, fout: "niet gevonden" };
}

async function betaald(env, b) {
  let rij = b.ordercode ? await db(env).prepare("SELECT * FROM registraties WHERE viva_ordercode = ?").bind(String(b.ordercode)).first() : null;
  if (!rij && b.ref) rij = await haal(env, b.ref);
  if (!rij) return { ok: false, fout: "niet gevonden" };
  if (rij.status === BETAALD) return { ok: true, nummer: rij.nummer, soort: rij.soort }; // al verwerkt

  const data = JSON.parse(rij.data);
  const voor = rij.soort === "inschrijving" ? telOnderdelen(await andere(env, data, rij.nummer)) : {};
  const juist = Math.abs(Number(rij.totaal) - Number(b.bedrag)) < 0.005;
  const status = juist ? BETAALD : `Bedrag klopt niet: € ${Number(b.bedrag).toFixed(2)}`;
  const mailKlant = !juist ? "niet verstuurd: bedrag klopt niet" : b.resend ? "wordt verstuurd" : "niet verstuurd: Resend is nog niet ingesteld";

  // Alleen bijwerken als de status nog niet Betaald is: zo verwerken browser en webhook het nooit twee keer.
  const upd = await db(env).prepare(
    "UPDATE registraties SET status = ?, transactie = ?, betaald_op = ?, mail_klant = ?, bijgewerkt = ? WHERE nummer = ? AND status != ?"
  ).bind(status, b.transactie, nu(), mailKlant, nu(), rij.nummer, BETAALD).run();
  if (!upd.meta.changes) return { ok: true, nummer: rij.nummer, soort: rij.soort };

  await stuurMelding(env, data, (juist ? "Betaald" : `LET OP: betaald bedrag (${eur(b.bedrag)}) klopt niet met het totaal`) +
    ` – Viva-transactie ${b.transactie}\nMail naar klant: ${mailKlant}`);
  if (rij.soort === "inschrijving") await controleerGrenzen(env, data, voor);
  const res = { ok: true, nummer: rij.nummer, soort: rij.soort };
  if (juist && b.resend) res.mail = klantMail(data);
  return res;
}

async function mailstatus(env, b) {
  const r = await db(env).prepare("UPDATE registraties SET mail_klant = ?, bijgewerkt = ? WHERE nummer = ?")
    .bind(String(b.status).slice(0, 300), nu(), b.nummer).run();
  return r.meta.changes ? { ok: true } : { ok: false, fout: "niet gevonden" };
}

/* ---------- mails ---------- */

async function resend(env, aan, onderwerp, tekst, sleutel) {
  if (!env.RESEND_API_KEY) { console.log("melding niet verstuurd (geen RESEND_API_KEY):", onderwerp); return; }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", ...(sleutel ? { "idempotency-key": sleutel } : {}) },
      body: JSON.stringify({ from: AFZENDER, to: [aan], subject: onderwerp, text: tekst }),
    });
  } catch (e) { console.log("melding fout", String(e)); }
}

async function stuurMelding(env, b, extra) {
  const soortTekst = b.soort === "bestelling" ? "bestelling" : "inschrijving";
  const onderwerp = (b.test ? "[TEST] " : "") + `Nieuwe ${soortTekst} ${b.nummer}` +
    (b.soort === "inschrijving" ? ` – ${b.activiteit_titel}` : "") + ` – ${eur(b.totaal)}`;
  const regels = [b.test ? "TEST – er is niet betaald." : "", extra || "", "", `Nummer: ${b.nummer}`,
    `Klant: ${b.klant.naam} – ${b.klant.email} – ${b.klant.telefoon}`];
  if (b.soort === "bestelling") {
    const lev = b.levering || {};
    regels.push(`Levering: ${leveringTekst(lev)}${lev.activiteit ? " – " + lev.activiteit : ""}${lev.type === "verzenden" ? " – " + adres(lev) : ""}`,
      "", artikelTekst(b), "", `Subtotaal: ${eur(b.subtotaal)}`, `Verzending: ${eur(b.verzending)}`, `Steun: ${eur(b.donatie)}`);
  } else {
    regels.push(`Activiteit: ${b.activiteit_titel}`, "", lijnTekst(b), "");
    if (b.tijdslot) regels.push(`Tijdslot: ${b.tijdslot}`);
    if (b.wagen) regels.push(`Land Rover: ${b.wagen}`);
  }
  regels.push(`Totaal: ${eur(b.totaal)}`);
  if (b.opmerking) regels.push("", `Opmerking: ${b.opmerking}`);
  if (b.site) regels.push("", `Alles in het beheer: ${b.site}/beheer`);
  await resend(env, MELDING_AAN, onderwerp, regels.join("\n").replace(/^\n+/, ""), `melding-${b.nummer}-${extra ? "betaald" : "nieuw"}`);
}

async function controleerGrenzen(env, b, voor) {
  for (const l of b.limieten || []) {
    if (!l.melding) continue;
    const oud = voor[l.id] || 0, nieuwAantal = oud + l.aantal;
    if (oud < l.melding && nieuwAantal >= l.melding) {
      await resend(env, MELDING_AAN,
        `${b.test ? "[TEST] " : ""}${b.activiteit_titel}: ${l.naam} heeft ${nieuwAantal} ${l.per === "wagen" ? "wagens" : "stuks"}`,
        `${l.naam} bij ${b.activiteit_titel} is net over de grens van ${l.melding} gegaan (nu ${nieuwAantal}).\n\nLaatste inschrijving: ${b.nummer}`);
    }
  }
}

function klantMail(b) {
  const m = b.soort === "bestelling" ? mailBestelling(b) : mailInschrijving(b);
  return { aan: b.klant.email, onderwerp: m.onderwerp, tekst: m.tekst, nummer: b.nummer, soort: b.soort };
}

function mailBestelling(b) {
  const lev = b.levering || {};
  const ophalen = lev.type === "activiteit" ? `Je kan je bestelling ophalen op ${lev.activiteit}.`
    : lev.type === "oostham" ? "Je haalt je bestelling op in Oostham. We nemen contact met je op om een moment af te spreken."
    : `We versturen je bestelling naar: ${adres(lev)}.`;
  const regels = [`Hallo ${b.klant.naam},`, "",
    `Bedankt voor je bestelling bij Rover & Co VZW. We hebben je betaling van ${eur(b.totaal)} goed ontvangen.`, "",
    `Bestelnummer: ${b.nummer}`, "", artikelTekst(b), "", `Subtotaal: ${eur(b.subtotaal)}`, `Verzending: ${eur(b.verzending)}`];
  if (b.donatie > 0) regels.push(`Steun aan de vzw: ${eur(b.donatie)}`);
  regels.push(`Totaal: ${eur(b.totaal)}`, "", ophalen, "", "Dit is een automatische mail, je kan er niet op antwoorden.",
    `Vragen? Mail naar ${VRAGEN_AAN} en vermeld je bestelnummer.`, "", "Bedankt voor je steun!", "Rover & Co VZW");
  return { onderwerp: `Je bestelling bij Rover & Co (${b.nummer})`, tekst: regels.join("\n") };
}

function mailInschrijving(b) {
  const regels = [`Hallo ${b.klant.naam},`, "",
    `Je bent ingeschreven voor ${b.activiteit_titel}.` + (b.totaal > 0 ? ` We hebben je betaling van ${eur(b.totaal)} goed ontvangen.` : ""), "",
    `Inschrijfnummer: ${b.nummer}`, "", lijnTekst(b)];
  if (b.tijdslot) regels.push(`Tijdslot: ${b.tijdslot}`);
  if (b.wagen) regels.push(`Land Rover: ${b.wagen}`);
  if (b.totaal > 0) regels.push(`Totaal: ${eur(b.totaal)}`);
  regels.push("");
  if (b.site) regels.push(`Alle info over de activiteit: ${b.site}/activiteiten/${b.activiteit}`, "");
  regels.push("Dit is een automatische mail, je kan er niet op antwoorden.",
    `Vragen? Mail naar ${VRAGEN_AAN} en vermeld je inschrijfnummer.`, "", "Tot dan!", "Rover & Co VZW");
  return { onderwerp: `Je inschrijving voor ${b.activiteit_titel} (${b.nummer})`, tekst: regels.join("\n") };
}

/* ---------- hulpjes (ook gebruikt door het beheer) ---------- */

export const eur = (n) => "€ " + Number(n || 0).toFixed(2).replace(".", ",");
const adres = (l) => `${l.straat}, ${l.postcode} ${l.gemeente} (${l.land})`;
export const leveringTekst = (l) => ({ activiteit: "Ophalen op activiteit", oostham: "Ophalen in Oostham", verzenden: "Verzenden" }[l.type] || l.type || "");
export const artikelTekst = (b) => (b.artikels || []).map((a) => {
  const k = Object.keys(a.keuzes || {}).map((n) => `${n}: ${a.keuzes[n]}`).join(", ");
  return `${a.aantal} × ${a.naam}${k ? ` (${k})` : ""} = ${eur(a.lijn)}`;
}).join("\n");
export const lijnTekst = (b) => {
  const per = { persoon: "per persoon", wagen: "per wagen", stuk: "per stuk" };
  return (b.lijnen || []).map((l) => l.prijs > 0 ? `${l.aantal} × ${l.naam} (${eur(l.prijs)} ${per[l.per] || ""}) = ${eur(l.lijn)}` : `${l.aantal} × ${l.naam} (gratis)`).join("\n");
};
export { adres };
