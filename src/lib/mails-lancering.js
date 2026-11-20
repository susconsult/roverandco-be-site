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

const WAT = [
  ["Activiteiten", "Schrijf je in en krijg meteen je ticket met QR-code."],
  ["Kalender", "Alle Land Rover-evenementen op een rij, ook die van andere clubs."],
  ["Forum en CB-chat", "Praat mee met andere Land Rover-rijders, vraag raad of toon je wagen."],
  ["Blog", "Verhalen en de geschiedenis van Land Rover."],
  ["Shop", "Onze kledij en merch, op te halen of thuis geleverd."],
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

// lid = rij uit leden; wachtwoordLink leeg als het lid al een wachtwoord heeft.
export function aankondigingMail(lid, { site, wachtwoordLink = "", afmeldLink = "", test = false, vandaag = new Date().toISOString().slice(0, 10) }) {
  const vn = voornaam(lid.naam || lid.voornaam || "");
  const acts = komende(vandaag);

  const watHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT};font-size:14px;margin:0 0 18px">` +
    WAT.map(([t, u]) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${ZAND2}"><b style="color:${INKT}">${esc(t)}</b><br><span style="color:${GRIJS}">${esc(u)}</span></td></tr>`).join("") + `</table>`;

  const accountHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ZACHT};border-radius:10px;margin:4px 0 18px"><tr><td style="padding:16px 18px;font-family:${FONT}">` +
    alinea(`We maakten al een account voor je aan met dit mailadres. Daarmee kan je:`, "margin:0 0 8px") +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5;color:${INKT}">` +
    ACCOUNT.map((t) => `<tr><td style="padding:3px 10px 3px 0;vertical-align:top;color:${GROEN3};font-weight:700">&#10003;</td><td style="padding:3px 0">${esc(t)}</td></tr>`).join("") + `</table>` +
    (wachtwoordLink ? `<div style="text-align:center;margin:14px 0 4px">${knop("Kies je wachtwoord", wachtwoordLink)}</div>` +
      `<div style="text-align:center;font-size:12px;color:${GRIJS}">De link is 30 dagen geldig. Liever geen account? Dan hoef je niets te doen.</div>`
      : `<div style="text-align:center;margin:14px 0 4px">${knop("Naar mijn account", `${site}/account`)}</div>`) +
    `</td></tr></table>`;

  const actsHtml = !acts.length ? "" : kop2("Binnenkort") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT};font-size:14px;margin:0 0 18px">` +
    acts.map((a) => `<tr><td style="padding:9px 0;border-bottom:1px solid ${ZAND2}"><a href="${esc(`${site}/activiteiten/${a.slug}`)}" style="color:${INKT};font-weight:700;text-decoration:none">${esc(a.titel)}</a><br><span style="color:${GROEN3};font-size:13px">${esc(a.datum_lang || "")}${a.locatie ? " · " + esc(a.locatie) : ""}</span></td></tr>`).join("") + `</table>`;

  const inhoud =
    alinea(`Je bestelde ooit iets of schreef je in via onze webshop. Die webshop hebben we vervangen door een eigen website. Alles over Rover &amp; Co staat nu op één plek: <a href="${site}" style="color:${GROEN3};font-weight:600">roverandco.be</a>.`, `color:${GRIJS}`) +
    kop2("Wat vind je er") + watHtml +
    kop2("Je account staat klaar") + accountHtml +
    actsHtml +
    `<div style="text-align:center;margin:0 0 18px">${knop("Bekijk de nieuwe site", site, !!wachtwoordLink)}</div>` +
    spamTip();

  const voet = `Vragen? Antwoord op deze mail of mail naar <a href="mailto:info@roverandco.be" style="color:#ffffff">info@roverandco.be</a>.` +
    (afmeldLink ? `<br>Geen nieuws meer van ons? <a href="${esc(afmeldLink)}" style="color:#ffffff">Afmelden</a>` : "");
  const html = htmlMail({ eyebrow: "Nieuw bij Rover & Co", titel: `Onze nieuwe website is online${vn ? ", " + vn : ""}`, inhoud, voet });

  const tekst = [
    `Hallo${vn ? " " + vn : ""},`, "",
    `Je bestelde ooit iets of schreef je in via onze webshop. Die webshop hebben we vervangen door een eigen website. Alles over Rover & Co staat nu op één plek: ${site}`, "",
    "Wat vind je er:", ...WAT.map(([t, u]) => `- ${t}: ${u}`), "",
    "Je account staat klaar. We maakten al een account voor je aan met dit mailadres. Daarmee kan je:", ...ACCOUNT.map((t) => `- ${t}`), "",
    ...(wachtwoordLink ? ["Kies hier je wachtwoord (30 dagen geldig):", wachtwoordLink, "Liever geen account? Dan hoef je niets te doen.", ""] : [`Naar je account: ${site}/account`, ""]),
    ...(acts.length ? ["Binnenkort:", ...acts.map((a) => `- ${a.titel}, ${a.datum_lang || ""}: ${site}/activiteiten/${a.slug}`), ""] : []),
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
