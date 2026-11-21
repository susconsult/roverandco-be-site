// Tickets voor inschrijvingen: één willekeurige code per inschrijving (registraties.ticket),
// als QR in de mail (PNG via cid) en als PDF-bijlage. De scanpagina (/scan) scant de QR (zie scan.js).
import qrcode from "qrcode-generator";
import { LOGO_JPG } from "./mail-logo.js";

export const TICKET_PREFIX = "RCT-";
export const nieuweTicketCode = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
export const ticketInhoud = (code) => TICKET_PREFIX + code;

// Geeft de ticketcode van een inschrijving; maakt er een als die nog niet bestaat.
export async function ticketVoor(env, nummer) {
  const r = await env.SHOP_DB.prepare("SELECT ticket FROM registraties WHERE nummer = ?").bind(nummer).first();
  if (r?.ticket) return r.ticket;
  const code = nieuweTicketCode();
  await env.SHOP_DB.prepare("UPDATE registraties SET ticket = ? WHERE nummer = ? AND ticket IS NULL").bind(code, nummer).run();
  const n = await env.SHOP_DB.prepare("SELECT ticket FROM registraties WHERE nummer = ?").bind(nummer).first();
  return n?.ticket || code;
}

/* ---------- QR ---------- */

export function qrMatrix(tekst) {
  const qr = qrcode(0, "M");
  qr.addData(tekst);
  qr.make();
  const n = qr.getModuleCount();
  return { n, donker: (r, c) => qr.isDark(r, c) };
}

/* ---------- PNG (grijswaarden, zonder bibliotheek) ---------- */

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

async function deflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

function chunk(type, data) {
  const t = new TextEncoder().encode(type);
  const tc = new Uint8Array(t.length + data.length); tc.set(t); tc.set(data, t.length);
  return [...be32(data.length), ...tc, ...be32(crc32(tc))];
}

export async function qrPng(tekst, schaal = 8, rand = 4) {
  const { n, donker } = qrMatrix(tekst);
  const w = (n + rand * 2) * schaal;
  const ruw = new Uint8Array(w * (w + 1));
  for (let y = 0; y < w; y++) {
    ruw[y * (w + 1)] = 0; // filter: geen
    const r = Math.floor(y / schaal) - rand;
    for (let x = 0; x < w; x++) {
      const c = Math.floor(x / schaal) - rand;
      ruw[y * (w + 1) + 1 + x] = r >= 0 && c >= 0 && r < n && c < n && donker(r, c) ? 0 : 255;
    }
  }
  const ihdr = new Uint8Array([...be32(w), ...be32(w), 8, 0, 0, 0, 0]); // 8 bit, grijs
  const png = [137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", ihdr), ...chunk("IDAT", await deflate(ruw)), ...chunk("IEND", new Uint8Array())];
  return new Uint8Array(png);
}

/* ---------- PDF (A4, met de hand opgebouwd) ---------- */

// Helvetica met WinAnsi: Latijnse letters met accenten gaan mee, € wordt 0x80, de rest een vraagteken.
function pdfTekst(s) {
  let o = "";
  for (const ch of String(s ?? "")) {
    let c = ch.codePointAt(0);
    if (ch === "€") c = 0x80; else if (ch === "–" || ch === "—") c = 0x96; else if (ch === "’" || ch === "‘") c = 0x27; else if (ch === "“" || ch === "”") c = 0x22; else if (ch === "·") c = 0xb7;
    else if (c > 255) c = 0x3f;
    if (c === 0x28 || c === 0x29 || c === 0x5c) o += "\\" + String.fromCharCode(c);
    else if (c < 32 || c > 126) o += "\\" + c.toString(8).padStart(3, "0");
    else o += String.fromCharCode(c);
  }
  return `(${o})`;
}

// Benaderde breedte in Helvetica (voor centreren en afbreken).
const BREED = { i: 222, l: 222, j: 222, t: 278, f: 278, r: 333, " ": 278, ".": 278, ",": 278, ":": 278, "(": 333, ")": 333, m: 833, w: 722, M: 833, W: 944 };
const breedte = (s, pt, vet = false) => [...String(s)].reduce((t, ch) => t + (BREED[ch] || (ch >= "A" && ch <= "Z" ? 667 : 556)), 0) * pt / 1000 * (vet ? 1.05 : 1);

function afbreken(s, pt, max, vet) {
  const woorden = String(s).split(/\s+/), regels = [];
  let r = "";
  for (const w of woorden) { const t = r ? r + " " + w : w; if (breedte(t, pt, vet) > max && r) { regels.push(r); r = w; } else r = t; }
  if (r) regels.push(r);
  return regels;
}

const b64naarBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesNaarB64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
export { bytesNaarB64 };

// t: { titel, datum, locatie, uren, naam, nummer, tijdslot, wagen, lijnen: [{tekst, bedrag}], totaal, code, test }
export function ticketPdf(t) {
  const W = 595.28, H = 841.89, M = 48;
  const c = [];
  const kleur = (r, g, b) => `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)}`;
  const GROEN = kleur(31, 59, 42), LICHT = kleur(159, 197, 168), INKT = kleur(20, 24, 21), GRIJS = kleur(91, 98, 92), ZAND = kleur(246, 243, 234), LIJN = kleur(222, 213, 191);
  const tekst = (s, x, y, pt, { vet = false, kl = INKT, midden = false, rechts = false } = {}) => {
    const xx = midden ? x - breedte(s, pt, vet) / 2 : rechts ? x - breedte(s, pt, vet) : x;
    c.push(`BT /${vet ? "F2" : "F1"} ${pt} Tf ${kl} rg ${xx.toFixed(2)} ${y.toFixed(2)} Td ${pdfTekst(s)} Tj ET`);
  };
  const rect = (x, y, w, h, kl) => c.push(`${kl} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);

  // Ticketkaart
  const KX = M, KW = W - 2 * M, KTOP = H - M;
  rect(KX, KTOP - 120, KW, 120, GROEN);
  c.push(`q 92 0 0 92 ${(KX + 20).toFixed(2)} ${(KTOP - 106).toFixed(2)} cm /Logo Do Q`);
  tekst("TICKET", KX + 128, KTOP - 50, 12, { vet: true, kl: LICHT });
  let ty = KTOP - 76;
  for (const r of afbreken(t.titel, 22, KW - 150, true).slice(0, 2)) { tekst(r, KX + 128, ty, 22, { vet: true, kl: "1 1 1" }); ty -= 25; }
  if (t.test) tekst("TEST - NIET BETAALD", KX + KW - 20, KTOP - 50, 10, { vet: true, kl: LICHT, rechts: true });

  // QR rechts, gegevens links
  const qrMaat = 200, qrX = KX + KW - qrMaat - 24, qrY = KTOP - 120 - 30 - qrMaat;
  const { n, donker } = qrMatrix(ticketInhoud(t.code));
  const mod = qrMaat / (n + 8);
  rect(qrX, qrY, qrMaat, qrMaat, "1 1 1");
  const blokjes = [];
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (donker(r, k)) blokjes.push(`${(qrX + (k + 4) * mod).toFixed(2)} ${(qrY + qrMaat - (r + 5) * mod).toFixed(2)} ${(mod + 0.05).toFixed(2)} ${(mod + 0.05).toFixed(2)} re`);
  c.push(`0 0 0 rg ${blokjes.join(" ")} f`);
  tekst("Toon deze code aan de ingang", qrX + qrMaat / 2, qrY - 16, 10, { kl: GRIJS, midden: true });

  let y = KTOP - 120 - 44;
  const rij = (l, w) => { if (!w) return; tekst(l, KX + 24, y, 10, { kl: GRIJS }); for (const r of afbreken(w, 13, qrX - KX - 50, true).slice(0, 2)) { y -= 16; tekst(r, KX + 24, y, 13, { vet: true }); } y -= 22; };
  rij("Naam", t.naam);
  rij("Wanneer", [t.datum, t.uren].filter(Boolean).join(", "));
  rij("Waar", t.locatie);
  rij("Tijdslot", t.tijdslot ? t.tijdslot : "");
  rij("Land Rover", t.wagen);
  rij("Inschrijfnummer", t.nummer);

  // Overzicht
  y = Math.min(y, qrY - 44);
  tekst("JE INSCHRIJVING", KX + 24, y, 10, { vet: true, kl: kleur(62, 115, 80) }); y -= 8;
  for (const l of t.lijnen) {
    y -= 20; tekst(l.tekst, KX + 24, y, 11); tekst(l.bedrag, KX + KW - 24, y, 11, { rechts: true });
    y -= 8; rect(KX + 24, y, KW - 48, 0.6, LIJN);
  }
  if (t.totaal) { y -= 22; tekst("Totaal", KX + 24, y, 12, { vet: true }); tekst(t.totaal, KX + KW - 24, y, 12, { vet: true, rechts: true }); }
  y -= 30;
  const kaartOnder = y;
  // Rand rond de kaart (onder de groene kop)
  c.unshift(`${ZAND} rg ${KX} ${kaartOnder.toFixed(2)} ${KW} ${(KTOP - 120 - kaartOnder).toFixed(2)} re f`);
  c.push(`${LIJN} RG 0.8 w ${KX} ${kaartOnder.toFixed(2)} ${KW} ${(KTOP - kaartOnder).toFixed(2)} re S`);

  // Onder de kaart
  y = kaartOnder - 30;
  for (const r of ["Eén code per inschrijving: bij het scannen worden alle personen en onderdelen hierboven samen verwerkt.",
    "Je kan het ticket afdrukken of op je gsm tonen. Vragen? Mail naar info@roverandco.be met je inschrijfnummer."]) {
    for (const z of afbreken(r, 10, KW, false)) { tekst(z, KX, y, 10, { kl: GRIJS }); y -= 14; }
    y -= 4;
  }
  tekst("Rover & Co VZW · Oostham · roverandco.be", W / 2, M - 10, 9, { kl: GRIJS, midden: true });

  const inhoud = new TextEncoder().encode(c.join("\n"));
  const jpg = b64naarBytes(LOGO_JPG);
  const enc = new TextEncoder();
  const objs = [
    enc.encode("<< /Type /Catalog /Pages 2 0 R >>"),
    enc.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Logo 6 0 R >> >> /Contents 7 0 R >>`),
    enc.encode("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    enc.encode("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
    [enc.encode(`<< /Type /XObject /Subtype /Image /Width 300 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`), jpg, enc.encode("\nendstream")],
    [enc.encode(`<< /Length ${inhoud.length} >>\nstream\n`), inhoud, enc.encode("\nendstream")],
  ];
  const delen = [enc.encode("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")];
  let pos = delen[0].length;
  const xref = [];
  objs.forEach((o, i) => {
    xref.push(pos);
    const stukken = [enc.encode(`${i + 1} 0 obj\n`), ...(Array.isArray(o) ? o : [o]), enc.encode("\nendobj\n")];
    for (const s of stukken) { delen.push(s); pos += s.length; }
  });
  const tabel = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${xref.map((p) => String(p).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  delen.push(enc.encode(tabel));
  const tot = new Uint8Array(delen.reduce((s, d) => s + d.length, 0));
  let o = 0; for (const d of delen) { tot.set(d, o); o += d.length; }
  return tot;
}
