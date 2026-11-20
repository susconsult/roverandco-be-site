// Eenmalige mails bij de overstap van de Ecwid-webshop naar de nieuwe site:
// 1. ticketmail voor wie zich via Ecwid inschreef voor Church of Rover (QR + PDF)
// 2. aankondiging van de nieuwe site voor alle klanten uit Ecwid (dienstbericht, met afmeldlink)
// Elke functie geeft { onderwerp, tekst, html, bijlagen, headers } terug; versturen gebeurt elders.
import { htmlMail, alinea, kader, overzicht, knop, kop2, esc } from "./mail.js";
import { eur } from "./opslag.js";
import { ticketVoor, ticketInhoud, qrPng, ticketPdf, bytesNaarB64 } from "./ticket.js";
import ACTIVITEITEN from "../../data/activiteiten.json";

const GROEN = "#1F3B2A", GROEN3 = "#3E7350", LICHTGROEN = "#9FC5A8", ZACHT = "#F6F3EA", ZAND2 = "#DED5BF", INKT = "#141815", GRIJS = "#5B625C";
const FONT = "Inter,'Helvetica Neue',Arial,sans-serif";
const voornaam = (n) => { const v = String(n || "").trim().split(/\s+/)[0] || ""; return v ? v[0].toUpperCase() + v.slice(1) : ""; };
// Ecwid-namen staan soms volledig in kleine letters: "pieter van baekel" wordt "Pieter Van Baekel".
const netteNaam = (n) => { const t = String(n || "").trim(); return t && t === t.toLowerCase() ? t.replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : t; };
const COR = ACTIVITEITEN.find((a) => a.slug === "church-of-rover") || {};

const spamTip = () => alinea(`Tip: zet <b>noreply@roverandco.be</b> bij je contacten, dan komen onze mails niet in je spam terecht.`, `font-size:13px;color:${GRIJS}`);

// Ecwid bewaarde de keuzes als tekst ("Roadbook: Ik rijd mee ! (per wagen)", "Kerkbezoek (met rondleiding): 10:30").
function corOnderdelen(b) {
  const uit = [];
  let tijdslot = b.tijdslot || "";
  for (const l of b.lijnen || []) {
    const opties = l.opties || [];
    for (const o of opties) {
      if (/roadbook/i.test(o)) uit.push({ naam: "Rondrit met roadbook", sub: "per wagen" });
      else if (/kerkbezoek/i.test(o)) {
        const uur = (o.match(/(\d{1,2}:\d{2})/) || [])[1] || "";
        if (uur && !tijdslot) tijdslot = uur;
        uit.push({ naam: "Bezoek kerktoren met rondleiding", sub: uur ? `tijdslot ${uur}` : "" });
      } else uit.push({ naam: o, sub: "" });
    }
    if (opties.length === 1 && l.aantal > 1) uit[uit.length - 1].naam = `${l.aantal} × ${uit[uit.length - 1].naam}`;
  }
  if (!uit.length) uit.push({ naam: "Inschrijving Church of Rover", sub: "" });
  return { onderdelen: uit, tijdslot };
}

/* ---------- 1. ticketmail Church of Rover ---------- */

// r = rij uit registraties (nummer, naam, email, totaal, data); wachtwoordLink mag leeg zijn (account heeft al een wachtwoord).
export async function corTicketMail(env, r, { site, wachtwoordLink = "", test = false }) {
  const b = typeof r.data === "string" ? JSON.parse(r.data) : (r.data || {});
  const naam = netteNaam(r.naam || b.klant?.naam || "");
  const vn = voornaam(naam);
  const { onderdelen, tijdslot } = corOnderdelen(b);
  const code = await ticketVoor(env, r.nummer);
  const qr = await qrPng(ticketInhoud(code), 8, 4);
  const totaal = Number(r.totaal ?? b.totaal ?? 0);

  const rijen = [["Wanneer", COR.datum_lang || "zondag 22 november 2026"], ["Uur", COR.uren || "Vanaf 10:00"], ["Waar", COR.locatie || "Kerk van Oostham"],
    ...(tijdslot ? [["Kerkbezoek", tijdslot]] : []), ["Inschrijfnummer", r.nummer]];

  const programma = [
    ["10:00 – 12:00", "Bezoek aan de kerktoren, in tijdsloten van 10 minuten"],
    ["13:00 – 14:30", "Nog meer torenbezoeken"],
    ["Hele dag", "Winterbar, hotdogs en vuurkorven"],
    ["14:30", "Wijding, daarna samen op rondrit met roadbook"],
  ];
  const programmaHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT};font-size:14px;margin:0 0 18px">` +
    programma.map(([u, t]) => `<tr><td style="padding:7px 14px 7px 0;color:${GROEN3};font-weight:700;white-space:nowrap;vertical-align:top;border-bottom:1px solid ${ZAND2}">${esc(u)}</td><td style="padding:7px 0;color:${INKT};border-bottom:1px solid ${ZAND2}">${esc(t)}</td></tr>`).join("") + `</table>`;

  const inhoud =
    alinea(`Je schreef je in via onze vorige webshop. Ondertussen hebben we een nieuwe website, en daarom krijg je nu je ticket van ons. Toon zondag de QR-code aan de ingang, op je gsm of op papier.`, `color:${GRIJS}`) +
    kader(rijen) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GROEN};border-radius:12px;margin:0 0 20px"><tr><td align="center" style="padding:20px 16px">` +
    `<div style="font-family:${FONT};font-size:12px;letter-spacing:2px;font-weight:700;color:${LICHTGROEN};margin-bottom:10px">JE TICKET</div>` +
    `<img src="cid:rc-qr" width="190" height="190" alt="QR-code van je ticket" style="display:block;border:0;width:190px;height:190px;border-radius:8px;background:#fff">` +
    `<div style="font-family:${FONT};font-size:14px;line-height:1.5;color:#ffffff;margin-top:12px">${esc(naam)}<br><span style="color:${LICHTGROEN}">Het ticket zit ook als PDF in bijlage.</span></div></td></tr></table>` +
    kop2("Je inschrijving") +
    overzicht(onderdelen.map((o) => ({ naam: o.naam, sub: o.sub, bedrag: "" })), totaal > 0 ? [["Betaald", eur(totaal), true]] : []) +
    kop2("Het programma") + programmaHtml +
    `<div style="text-align:center;margin:0 0 18px">${knop("Alle info over Church of Rover", `${site}/activiteiten/church-of-rover`)}</div>` +
    (wachtwoordLink ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${ZAND2};border-radius:10px;margin:6px 0 18px"><tr><td style="padding:14px 16px;text-align:center">` +
      alinea("Op de nieuwe site staat al een account voor je klaar, met dit ticket en je vorige inschrijvingen erin. Kies een wachtwoord en je kan ook op het forum. De link is 30 dagen geldig.", `font-size:14px;color:${GRIJS}`) +
      knop("Kies je wachtwoord", wachtwoordLink, true) + `</td></tr></table>` : "") +
    spamTip();

  const html = htmlMail({ eyebrow: "Je ticket voor zondag", titel: `Tot zondag op Church of Rover${vn ? ", " + vn : ""}`, inhoud,
    voet: `Vragen? Antwoord op deze mail of mail naar <a href="mailto:info@roverandco.be" style="color:#ffffff">info@roverandco.be</a>.` });

  const tekst = [
    `Hallo${vn ? " " + vn : ""},`, "",
    "Je schreef je in via onze vorige webshop voor Church of Rover. Ondertussen hebben we een nieuwe website, en daarom krijg je nu je ticket van ons. Toon zondag de QR-code aan de ingang (in de PDF in bijlage), op je gsm of op papier.", "",
    `Wanneer: ${COR.datum_lang || "zondag 22 november 2026"}`, `Uur: ${COR.uren || "Vanaf 10:00"}`, `Waar: ${COR.locatie || "Kerk van Oostham"}`,
    ...(tijdslot ? [`Kerkbezoek: ${tijdslot}`] : []), `Inschrijfnummer: ${r.nummer}`, "",
    "Je inschrijving:", ...onderdelen.map((o) => `- ${o.naam}${o.sub ? " (" + o.sub + ")" : ""}`), ...(totaal > 0 ? [`Betaald: ${eur(totaal)}`] : []), "",
    "Het programma:", ...programma.map(([u, t]) => `- ${u}: ${t}`), "",
    `Alle info: ${site}/activiteiten/church-of-rover`, "",
    ...(wachtwoordLink ? ["Op de nieuwe site staat al een account voor je klaar, met dit ticket en je vorige inschrijvingen erin. Kies hier een wachtwoord (30 dagen geldig):", wachtwoordLink, ""] : []),
    "Vragen? Antwoord op deze mail of mail naar info@roverandco.be.", "", "Tot zondag!", "Rover & Co VZW",
  ].join("\n");

  const pdf = ticketPdf({
    titel: "Church of Rover", datum: COR.datum_lang || "", uren: COR.uren || "", locatie: COR.locatie || "",
    naam, nummer: r.nummer, tijdslot, wagen: "", test,
    lijnen: onderdelen.map((o) => ({ tekst: o.naam + (o.sub ? ` (${o.sub})` : ""), bedrag: "" })),
    totaal: totaal > 0 ? eur(totaal) : "", code,
  });

  return {
    onderwerp: `${test ? "[TEST] " : ""}Je ticket voor Church of Rover, zondag 22 november`,
    tekst, html,
    bijlagen: [
      { filename: "ticket-qr.png", content: bytesNaarB64(qr), content_type: "image/png", content_id: "rc-qr" },
      { filename: `ticket-${r.nummer}.pdf`, content: bytesNaarB64(pdf), content_type: "application/pdf" },
    ],
  };
}

/* ---------- 2. aankondiging nieuwe site ---------- */
// Opgebouwd zoals goede lanceringsmails: grote foto bovenaan, korte tekst, fototegels per onderdeel,
// één hoofdknop, foto's als JPG van onze eigen site (/assets/mail, WebP werkt niet in Outlook), overal alt-tekst.

const WAT = [
  ["activiteiten", "Activiteiten", "Schrijf je in en krijg meteen je ticket met QR-code.", "/activiteiten"],
  ["kalender", "Kalender", "Alle Land Rover-evenementen op een rij, ook van andere clubs.", "/kalender"],
  ["forum", "Forum en CB-chat", "Praat mee, vraag raad of toon je wagen.", "/forum"],
  ["blog", "Blog", "Verhalen, tips en de geschiedenis van Land Rover.", "/blog"],
];
const ACCOUNT = [
  "Je vorige bestellingen en inschrijvingen terugvinden (ze staan er al in)",
  "Je tickets altijd bij de hand, ook op je gsm",
  "Sneller inschrijven en bestellen, je gegevens staan al klaar",
  "Je eigen Land Rover tonen bij Mijn Landy",
  "Meepraten op het forum en een melding krijgen als iemand antwoordt",
];

function komende(vandaag) {
  return ACTIVITEITEN.filter((a) => a.datum && a.datum >= vandaag && !/test/i.test(a.slug)).sort((x, y) => x.datum.localeCompare(y.datum)).slice(0, 3);
}

const foto = (src, alt, w, h, stijl = "") => `<img src="${esc(src)}" width="${w}" height="${h}" alt="${esc(alt)}" style="display:block;border:0;width:100%;max-width:${w}px;height:auto;${stijl}">`;
const kopje = (t, kleur = GROEN3) => `<div style="font-family:${FONT};font-size:12px;letter-spacing:2px;font-weight:700;color:${kleur};text-transform:uppercase;margin:0 0 10px">${esc(t)}</div>`;

// lid = rij uit leden; wachtwoordLink leeg als het lid al een wachtwoord heeft.
export function aankondigingMail(lid, { site, wachtwoordLink = "", afmeldLink = "", test = false, vandaag = new Date().toISOString().slice(0, 10), fotoBasis = "" }) {
  const vn = voornaam(lid.naam || "");
  const acts = komende(vandaag);
  const img = (n) => `${fotoBasis || site + "/assets/mail"}/${n}.jpg`;
  const voorkop = "Je account staat al klaar, met je vorige bestellingen erin. Kies een wachtwoord en kijk rond.";

  // Fototegels: twee naast elkaar op een breed scherm, onder elkaar op een gsm (zonder media queries).
  const tegel = ([f, t, u, pad]) => `<div style="display:inline-block;width:100%;max-width:256px;vertical-align:top;margin:0 0 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0 7px;text-align:left">
<a href="${esc(site + pad)}" style="text-decoration:none">${foto(img(f), t, 242, 161, "border-radius:10px")}</a>
<div style="font-family:${FONT};font-size:16px;font-weight:700;color:${INKT};margin:10px 0 2px"><a href="${esc(site + pad)}" style="color:${INKT};text-decoration:none">${esc(t)}</a></div>
<div style="font-family:${FONT};font-size:14px;line-height:1.45;color:${GRIJS}">${esc(u)}</div></td></tr></table></div>`;
  const tegels = `<div style="font-size:0;text-align:center">${WAT.map(tegel).join("")}</div>`;

  const shop = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ZACHT};border-radius:12px;margin:4px 0 22px"><tr>
<td width="44%" style="padding:0;vertical-align:middle"><a href="${site}/shop">${foto(img("shop"), "Emaille mok van Rover & Co", 230, 153, "border-radius:12px 0 0 12px")}</a></td>
<td style="padding:14px 18px;vertical-align:middle;font-family:${FONT}"><div style="font-size:16px;font-weight:700;color:${INKT};margin-bottom:4px">Shop</div>
<div style="font-size:14px;line-height:1.45;color:${GRIJS};margin-bottom:8px">T-shirts, hoodies, petjes en onze emaille mok.</div>
<a href="${site}/shop" style="font-size:14px;font-weight:700;color:${GROEN3};text-decoration:none">Naar de shop &rarr;</a></td></tr></table>`;

  const account = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GROEN};border-radius:14px;margin:0 0 24px;overflow:hidden"><tr><td style="padding:0">
${foto(img("account"), "Land Rovers met daktenten op een kampeerweekend", 524, 349, "max-width:100%")}</td></tr>
<tr><td style="padding:20px 22px 22px;font-family:${FONT}">
${kopje("Je account staat klaar", LICHTGROEN)}
<div style="font-size:20px;line-height:1.3;font-weight:700;color:#ffffff;margin:0 0 10px">We maakten al een account voor je aan</div>
<div style="font-size:15px;line-height:1.6;color:#ffffff;margin:0 0 12px">Met dit mailadres. Daarmee kan je:</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5;color:#ffffff">` +
    ACCOUNT.map((t) => `<tr><td style="padding:3px 10px 3px 0;vertical-align:top;color:${LICHTGROEN};font-weight:700">&#10003;</td><td style="padding:3px 0">${esc(t)}</td></tr>`).join("") + `</table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto 8px"><tr><td style="border-radius:8px;background:#ffffff">
<a href="${esc(wachtwoordLink || site + "/account")}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:700;color:${GROEN};text-decoration:none;border-radius:8px">${wachtwoordLink ? "Kies je wachtwoord" : "Naar mijn account"}</a></td></tr></table>
${wachtwoordLink ? `<div style="text-align:center;font-size:12px;color:${LICHTGROEN}">De link is 30 dagen geldig. Liever geen account? Dan hoef je niets te doen.</div>` : ""}
</td></tr></table>`;

  const actsHtml = !acts.length ? "" : kopje("Binnenkort") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT};margin:0 0 22px">` +
    acts.map((a) => `<tr><td width="92" style="padding:8px 14px 8px 0;vertical-align:middle"><a href="${esc(`${site}/activiteiten/${a.slug}`)}">${foto(img("act-" + a.slug), a.titel, 80, 80, "border-radius:10px")}</a></td>
<td style="padding:8px 0;vertical-align:middle;border-bottom:1px solid ${ZAND2}"><a href="${esc(`${site}/activiteiten/${a.slug}`)}" style="font-size:16px;color:${INKT};font-weight:700;text-decoration:none">${esc(a.titel)}</a>
<div style="font-size:13px;color:${GROEN3};margin-top:2px">${esc(a.datum_lang || "")}${a.locatie ? " &middot; " + esc(a.locatie) : ""}</div></td></tr>`).join("") + `</table>`;

  const strip = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0"><tr>` +
    [1, 2, 3].map((i) => `<td width="33%" style="padding:0">${foto(img("strip-" + i), "Land Rover van Rover & Co", 187, 187)}</td>`).join("") + `</tr></table>`;
  const volg = `<tr><td align="center" style="background:${GROEN};padding:18px 20px 6px;font-family:${FONT}">
<div style="font-size:15px;font-weight:700;color:#ffffff;margin-bottom:10px">Volg ons voor foto's van elke rit</div>
<a href="https://www.facebook.com/roverandcobe/" style="display:inline-block;margin:0 5px 8px;padding:9px 16px;border:1px solid ${LICHTGROEN};border-radius:8px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">Facebook</a>
<a href="https://www.instagram.com/roverandco.be/" style="display:inline-block;margin:0 5px 8px;padding:9px 16px;border:1px solid ${LICHTGROEN};border-radius:8px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">Instagram</a></td></tr>`;

  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>Rover &amp; Co heeft een nieuwe website</title></head>
<body style="margin:0;padding:0;background:#ECE6D6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ECE6D6">${esc(voorkop)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ECE6D6"><tr><td align="center" style="padding:24px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td align="center" style="background:${GROEN};padding:16px 20px 12px"><a href="${site}"><img src="cid:rc-logo" width="76" height="76" alt="Rover &amp; Co" style="display:block;border:0;width:76px;height:76px"></a></td></tr>
<tr><td style="padding:0;background:${GROEN}"><a href="${site}">${foto(img("hero"), "Colonne Land Rovers op een stoffig bospad", 560, 320, "max-width:100%")}</a></td></tr>
<tr><td style="background:${GROEN};padding:22px 26px 26px;font-family:${FONT}">
${kopje("Nieuw bij Rover & Co", LICHTGROEN)}
<h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;color:#ffffff;font-weight:800">Onze nieuwe website is online${vn ? `, ${esc(vn)}` : ""}</h1>
<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#ffffff">Je bestelde ooit iets of schreef je in via onze webshop. Die vervangen we door een eigen website. Activiteiten, kalender, forum, blog en shop: alles van Rover &amp; Co staat nu op één plek.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;background:#ffffff"><a href="${site}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:700;color:${GROEN};text-decoration:none;border-radius:8px">Bekijk roverandco.be</a></td></tr></table>
</td></tr>
<tr><td style="padding:26px 18px 6px;font-family:${FONT}"><div style="padding:0 7px">${kopje("Wat vind je er")}</div>${tegels}</td></tr>
<tr><td style="padding:0 18px;font-family:${FONT}"><div style="padding:0 7px">${shop}${account}${actsHtml}
<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:${GRIJS}">Tip: zet <b>noreply@roverandco.be</b> bij je contacten, dan komen onze mails niet in je spam terecht.</p></div></td></tr>
<tr><td style="padding:0">${strip}</td></tr>
${volg}
<tr><td align="center" style="background:${GROEN};padding:8px 24px 18px;font-family:${FONT};font-size:12px;line-height:1.7;color:#ffffff">Vragen? Antwoord op deze mail of mail naar <a href="mailto:info@roverandco.be" style="color:#ffffff">info@roverandco.be</a>.<br>
<span style="color:${LICHTGROEN}">Rover &amp; Co VZW &middot; Oostham${afmeldLink ? ` &middot; Geen nieuws meer? <a href="${esc(afmeldLink)}" style="color:${LICHTGROEN}">Afmelden</a>` : ""}</span></td></tr>
</table></td></tr></table></body></html>`;

  const tekst = [
    `Hallo${vn ? " " + vn : ""},`, "",
    `Je bestelde ooit iets of schreef je in via onze webshop. Die vervangen we door een eigen website. Activiteiten, kalender, forum, blog en shop: alles van Rover & Co staat nu op één plek: ${site}`, "",
    "Wat vind je er:", ...WAT.map(([, t, u, pad]) => `- ${t}: ${u} ${site}${pad}`), `- Shop: T-shirts, hoodies, petjes en onze emaille mok. ${site}/shop`, "",
    "Je account staat klaar. We maakten al een account voor je aan met dit mailadres. Daarmee kan je:", ...ACCOUNT.map((t) => `- ${t}`), "",
    ...(wachtwoordLink ? ["Kies hier je wachtwoord (30 dagen geldig):", wachtwoordLink, "Liever geen account? Dan hoef je niets te doen.", ""] : [`Naar je account: ${site}/account`, ""]),
    ...(acts.length ? ["Binnenkort:", ...acts.map((a) => `- ${a.titel}, ${a.datum_lang || ""}: ${site}/activiteiten/${a.slug}`), ""] : []),
    "Volg ons voor foto's van elke rit:", "Facebook: https://www.facebook.com/roverandcobe/", "Instagram: https://www.instagram.com/roverandco.be/", "",
    "Tip: zet noreply@roverandco.be bij je contacten, dan komen onze mails niet in je spam terecht.", "",
    "Vragen? Antwoord op deze mail of mail naar info@roverandco.be.", "", "Tot binnenkort!", "Rover & Co VZW",
    ...(afmeldLink ? ["", `Geen nieuws meer van ons? Afmelden: ${afmeldLink}`] : []),
  ].join("\n");

  return {
    onderwerp: `${test ? "[TEST] " : ""}Rover & Co heeft een nieuwe website`,
    tekst, html, bijlagen: [],
    headers: afmeldLink ? { "List-Unsubscribe": `<${afmeldLink}&klik=1>, <mailto:info@roverandco.be?subject=Afmelden>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
  };
}
