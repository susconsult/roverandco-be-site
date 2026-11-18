// Bevestigingsmails naar de klant (inschrijving met ticket, webshopbestelling) in de Rover & Co-opmaak.
import { htmlMail, alinea, kader, overzicht, knop, kop2, esc } from "./mail.js";
import { eur, adres, leveringTekst } from "./opslag.js";
import { ticketVoor, ticketInhoud, qrPng, ticketPdf, bytesNaarB64 } from "./ticket.js";

const PER = { persoon: "per persoon", wagen: "per wagen", stuk: "per stuk" };
const voornaam = (n) => String(n || "").trim().split(/\s+/)[0] || "";

const accountBlok = (link) => !link ? "" :
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #DED5BF;border-radius:10px;margin:6px 0 18px"><tr><td style="padding:14px 16px;text-align:center">` +
  alinea("We maakten een account voor je aan met dit mailadres. Daarin vind je je bestellingen en tickets terug en kan je op het forum. De link is 30 dagen geldig.", "font-size:14px;color:#5B625C") +
  knop("Kies je wachtwoord", link, true) + `</td></tr></table>`;

// Bouwt { html, bijlagen } voor de klantmail. m.data = het volledige record (b).
export async function klantMailOpmaak(env, m, { wachtwoordLink = "" } = {}) {
  const b = m.data || {};
  const site = b.site || "";
  if (b.soort === "inschrijving") return inschrijving(env, b, site, wachtwoordLink);
  return { html: bestelling(b, site, wachtwoordLink), bijlagen: [] };
}

async function inschrijving(env, b, site, wachtwoordLink) {
  const code = await ticketVoor(env, b.nummer);
  const qr = await qrPng(ticketInhoud(code), 8, 4);
  const titel = b.activiteit_naam || String(b.activiteit_titel || "").replace(/\s*\([^)]*\)$/, "");
  const lijnen = (b.lijnen || []).map((l) => ({ naam: `${l.aantal} × ${l.naam}`, sub: l.prijs > 0 ? `${eur(l.prijs)} ${PER[l.per] || ""}`.trim() : "gratis", bedrag: l.prijs > 0 ? eur(l.lijn) : "gratis" }));
  const rijen = [
    ["Wanneer", b.activiteit_datum_lang || b.activiteit_datum_label || ""],
    ["Uur", b.activiteit_uren || ""],
    ["Waar", b.activiteit_locatie || ""],
    ["Tijdslot", b.tijdslot || ""],
    ["Land Rover", b.wagen || ""],
    ["Inschrijfnummer", b.nummer],
  ].filter((r) => r[1]);

  const inhoud =
    alinea(b.totaal > 0 ? `Je bent ingeschreven. Je betaling van <b>${esc(eur(b.totaal))}</b> is goed ontvangen.` : "Je bent ingeschreven.", "color:#5B625C") +
    kader(rijen) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1F3B2A;border-radius:12px;margin:0 0 20px"><tr><td align="center" style="padding:20px 16px">` +
    `<div style="font-family:Inter,Arial,sans-serif;font-size:12px;letter-spacing:2px;font-weight:700;color:#9FC5A8;margin-bottom:10px">JE TICKET</div>` +
    `<img src="cid:rc-qr" width="190" height="190" alt="QR-code van je ticket" style="display:block;border:0;width:190px;height:190px;border-radius:8px;background:#fff">` +
    `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.5;color:#ffffff;margin-top:12px">Toon deze code aan de ingang.<br><span style="color:#9FC5A8">Het ticket zit ook als PDF in bijlage.</span></div></td></tr></table>` +
    kop2("Je inschrijving") +
    overzicht(lijnen, b.totaal > 0 ? [["Totaal betaald", eur(b.totaal), true]] : []) +
    (site ? `<div style="text-align:center;margin:0 0 18px">${knop("Alle info over de activiteit", `${site}/activiteiten/${b.activiteit}`)}</div>` : "") +
    accountBlok(wachtwoordLink);

  const html = htmlMail({ eyebrow: "Inschrijving bevestigd", titel: `Tot op ${titel}${voornaam(b.klant?.naam) ? ", " + voornaam(b.klant.naam) : ""}`, inhoud,
    voet: `Vragen? Mail naar <a href="mailto:info@roverandco.be" style="color:#ffffff">info@roverandco.be</a> met je inschrijfnummer.` });

  const pdf = ticketPdf({
    titel, datum: b.activiteit_datum_lang || b.activiteit_datum_label || "", uren: b.activiteit_uren || "", locatie: b.activiteit_locatie || "",
    naam: b.klant?.naam || "", nummer: b.nummer, tijdslot: b.tijdslot || "", wagen: b.wagen || "", test: !!b.test,
    lijnen: (b.lijnen || []).map((l) => ({ tekst: `${l.aantal} × ${l.naam}`, bedrag: l.prijs > 0 ? eur(l.lijn) : "gratis" })),
    totaal: b.totaal > 0 ? eur(b.totaal) : "", code,
  });
  return {
    html,
    bijlagen: [
      { filename: "ticket-qr.png", content: bytesNaarB64(qr), content_type: "image/png", content_id: "rc-qr" },
      { filename: `ticket-${b.nummer}.pdf`, content: bytesNaarB64(pdf), content_type: "application/pdf" },
    ],
  };
}

function bestelling(b, site, wachtwoordLink) {
  const lev = b.levering || {};
  const hoe = lev.type === "activiteit" ? `Je haalt je bestelling op tijdens ${esc(lev.activiteit)}.`
    : lev.type === "oostham" ? "Je haalt je bestelling op in Oostham. We nemen contact met je op om een moment af te spreken."
    : `We versturen je bestelling naar ${esc(adres(lev))}.`;
  const lijnen = (b.artikels || []).map((a) => {
    const k = Object.keys(a.keuzes || {}).map((n) => `${n}: ${a.keuzes[n]}`).join(", ");
    return { naam: `${a.aantal} × ${a.naam}`, sub: k, bedrag: eur(a.lijn) };
  });
  const totalen = [["Subtotaal", eur(b.subtotaal)], ["Verzending", b.verzending > 0 ? eur(b.verzending) : "gratis"]];
  if (b.donatie > 0) totalen.push(["Steun aan de vzw", eur(b.donatie)]);
  totalen.push(["Totaal betaald", eur(b.totaal), true]);

  const inhoud =
    alinea(`We hebben je betaling van <b>${esc(eur(b.totaal))}</b> goed ontvangen.`, "color:#5B625C") +
    kader([["Bestelnummer", b.nummer], ["Levering", leveringTekst(lev)]]) +
    kop2("Je bestelling") + overzicht(lijnen, totalen) +
    alinea(hoe) +
    (site ? `<div style="text-align:center;margin:0 0 18px">${knop("Je bestellingen", `${site}/account/bestellingen`)}</div>` : "") +
    accountBlok(wachtwoordLink);
  return htmlMail({ eyebrow: "Bestelling ontvangen", titel: `Bedankt voor je bestelling${voornaam(b.klant?.naam) ? ", " + voornaam(b.klant.naam) : ""}`, inhoud,
    voet: `Vragen? Mail naar <a href="mailto:info@roverandco.be" style="color:#ffffff">info@roverandco.be</a> met je bestelnummer.` });
}
