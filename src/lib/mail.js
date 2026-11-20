// Alle mails van Rover & Co gaan hierlangs: altijd een opgemaakte HTML-versie (logo, groene kop en voet)
// plus de gewone tekst voor wie geen opmaak ziet. Wie zelf geen HTML meegeeft, krijgt een nette
// omzetting van de tekst: "Label: waarde"-regels worden een overzicht, losse links worden knoppen.
import { LOGO_PNG } from "./mail-logo.js";

const VAN = "Rover & Co VZW <noreply@roverandco.be>";
const GROEN = "#1F3B2A", GROEN3 = "#3E7350", LICHTGROEN = "#9FC5A8", ZAND = "#ECE6D6", ZAND2 = "#DED5BF", ZACHT = "#F6F3EA", INKT = "#141815", GRIJS = "#5B625C";
const FONT = "Inter,'Helvetica Neue',Arial,sans-serif";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const URL_RE = /https?:\/\/[^\s<>"')]+/g;
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<>&"']+(?:&amp;[^\s<>&"']+)*/g, (u) => `<a href="${u}" style="color:${GROEN3};word-break:break-all">${u}</a>`);

/* ---------- bouwstenen ---------- */

export const knop = (tekst, url, licht = false) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px auto"><tr><td style="border-radius:8px;background:${licht ? "#ffffff" : GROEN};border:1px solid ${GROEN}">` +
  `<a href="${esc(url)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:${licht ? GROEN : "#ffffff"};text-decoration:none;border-radius:8px">${esc(tekst)}</a></td></tr></table>`;

export const alinea = (html, stijl = "") => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INKT};${stijl}">${html}</p>`;

// Kader met label/waarde-regels (wanneer, waar, nummer ...).
export const kader = (rijen) => !rijen.length ? "" :
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ZACHT};border-radius:10px;margin:4px 0 18px"><tr><td style="padding:12px 16px">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT};font-size:14px">` +
  rijen.map(([l, w]) => `<tr><td style="padding:4px 12px 4px 0;color:${GRIJS};vertical-align:top;white-space:nowrap">${esc(l)}</td><td style="padding:4px 0;text-align:right;color:${INKT}">${linkify(w)}</td></tr>`).join("") +
  `</table></td></tr></table>`;

// Overzicht van lijnen met bedragen; totaal vet onderaan.
export const overzicht = (lijnen, totalen = []) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT};font-size:14px;margin:0 0 18px">` +
  lijnen.map((l) => `<tr><td style="padding:9px 12px 9px 0;border-bottom:1px solid ${ZAND2};color:${INKT}">${esc(l.naam)}${l.sub ? `<br><span style="color:${GRIJS};font-size:12px">${esc(l.sub)}</span>` : ""}</td><td style="padding:9px 0;border-bottom:1px solid ${ZAND2};text-align:right;white-space:nowrap;vertical-align:top">${esc(l.bedrag)}</td></tr>`).join("") +
  totalen.map(([l, w, vet]) => `<tr><td style="padding:${vet ? "11px" : "6px"} 12px 0 0;color:${vet ? INKT : GRIJS};${vet ? "font-weight:700;font-size:15px" : ""}">${esc(l)}</td><td style="padding:${vet ? "11px" : "6px"} 0 0;text-align:right;white-space:nowrap;${vet ? "font-weight:700;font-size:15px" : `color:${GRIJS}`}">${esc(w)}</td></tr>`).join("") +
  `</table>`;

export const kop2 = (t) => `<div style="font-family:${FONT};font-size:12px;letter-spacing:2px;font-weight:700;color:${GROEN3};text-transform:uppercase;margin:6px 0 8px">${esc(t)}</div>`;

// Het volledige kader rond elke mail.
export function htmlMail({ eyebrow = "", titel = "", inhoud = "", voet = "" }) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(titel)}</title></head>
<body style="margin:0;padding:0;background:${ZAND}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ZAND}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td align="center" style="background:${GROEN};padding:22px 20px 18px"><img src="cid:rc-logo" width="110" height="110" alt="Rover &amp; Co" style="display:block;border:0;width:110px;height:110px"></td></tr>
<tr><td style="padding:26px 26px 8px;font-family:${FONT}">
${eyebrow ? `<div style="font-size:12px;letter-spacing:2px;font-weight:700;color:${GROEN3};text-transform:uppercase;margin-bottom:6px">${esc(eyebrow)}</div>` : ""}
${titel ? `<h1 style="margin:0 0 14px;font-size:23px;line-height:1.25;color:${INKT};font-weight:700">${esc(titel)}</h1>` : ""}
${inhoud}
</td></tr>
<tr><td align="center" style="background:${GROEN};padding:16px 24px;font-family:${FONT};font-size:12px;line-height:1.7;color:#ffffff">${voet || `Vragen? Mail naar <a href="mailto:info@roverandco.be" style="color:#ffffff">info@roverandco.be</a>.`}<br><span style="color:${LICHTGROEN}">Rover &amp; Co VZW &middot; Oostham &middot; Dit is een automatische mail.</span></td></tr>
</table></td></tr></table></body></html>`;
}

/* ---------- gewone tekst omzetten ---------- */

const SLOT = /^(dit is een automatische mail|vragen\?|rover & co vzw$|tot dan|bedankt voor je steun|groeten)/i;

export function tekstNaarHtml(tekst, onderwerp = "") {
  const blokken = String(tekst || "").replace(/\r/g, "").split(/\n{2,}/).map((b) => b.split("\n").map((r) => r.trimEnd()).filter(Boolean)).filter((b) => b.length);
  let inhoud = "", knoppen = 0;
  for (const regels of blokken) {
    // Regels die enkel uit "Label: link" of een link bestaan: knoppen.
    const alsKnop = regels.map((r) => { const m = r.match(/^(?:(.{1,60}?):\s*)?(https?:\/\/\S+)$/); return m ? { label: m[1] || "Openen", url: m[2] } : null; });
    if (alsKnop.every(Boolean)) {
      inhoud += `<div style="text-align:center;margin:4px 0 16px">${alsKnop.map((k) => knop(k.label.replace(/\s*\(.*\)$/, ""), k.url, knoppen++ > 0)).join("")}</div>`;
      continue;
    }
    // Blok met minstens 2 "Label: waarde"-regels: overzicht in een kader.
    const paren = regels.map((r) => r.match(/^([A-Za-zÀ-ÿ][^:]{0,30}):\s+(.+)$/));
    if (regels.length >= 2 && paren.every(Boolean)) { inhoud += kader(paren.map((m) => [m[1], m[2]])); continue; }
    if (regels.every((r) => SLOT.test(r))) continue; // standaardslot staat al in de voet
    const tekstHtml = regels.map((r) => linkify(r)).join("<br>");
    inhoud += alinea(tekstHtml);
  }
  return htmlMail({ titel: onderwerp.replace(/\s*\((R[CI]-[^)]+)\)$/, ""), inhoud });
}

/* ---------- versturen ---------- */

// Standaard antwoorden naar info@: wie op "beantwoorden" klikt, komt bij een mens terecht.
const ANTWOORD = "info@roverandco.be";
// m: { aan, onderwerp, tekst, html?, sleutel?, reply_to?, headers?, bijlagen?: [{ filename, content(base64), content_type, content_id? }] }
export async function verstuur(env, m) {
  if (!env.RESEND_API_KEY) return { ok: false, fout: "geen RESEND_API_KEY" };
  const html = m.html || tekstNaarHtml(m.tekst, m.onderwerp);
  const attachments = [{ filename: "rover-en-co.png", content: LOGO_PNG, content_type: "image/png", content_id: "rc-logo" }, ...(m.bijlagen || [])];
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", ...(m.sleutel ? { "idempotency-key": m.sleutel } : {}) },
      body: JSON.stringify({ from: m.van || VAN, to: Array.isArray(m.aan) ? m.aan : [m.aan], subject: m.onderwerp, text: m.tekst, html, attachments, reply_to: m.reply_to || ANTWOORD, ...(m.headers ? { headers: m.headers } : {}) }),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && !!d.id, id: d.id, status: r.status, fout: d.message || "" };
  } catch (e) {
    return { ok: false, fout: "geen verbinding" };
  }
}

export { URL_RE };
