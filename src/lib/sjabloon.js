// Pagina's die de Worker zelf maakt (account, forum) in dezelfde opmaak als de rest van de site.
// bouw/build.py schrijft public/_sjabloon.html met plaatshouders; die vullen we hier in.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const datum = (iso, kort = false) => {
  if (!iso) return "";
  const d = new Date(iso);
  const o = kort ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };
  return d.toLocaleString("nl-BE", { timeZone: "Europe/Brussels", ...o });
};

// Kruimelpad: [["Shop", "/shop"], ["Product"]] → Home › Shop › Product
export const kruimel = (delen = []) => delen === "slot" ? "<!--kruim-->" : delen.length ? `<nav class="kruimel" aria-label="Kruimelpad"><a href="/">Home</a>${delen.map(([t, h]) => `<span aria-hidden="true">›</span>${h ? `<a href="${esc(h)}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`}`).join("")}</nav>` : "";
const BANNERFOTO = { "Mijn account": "leden-defender-110-zonsondergang-achter", Forum: "leden-lightweight-110", "Rover & Co": "leden-vuur-avond" };
export const bannerFoto = (naam) => naam.startsWith("/") ? `<img src="${esc(naam)}" alt="" fetchpriority="high">` : `<img src="/assets/img/${naam}-s.webp" srcset="/assets/img/${naam}-s.webp 800w, /assets/img/${naam}.webp 1600w" sizes="100vw" alt="" fetchpriority="high">`;
export function banner(eyebrow, titel, intro = "", kruim = null, foto = null) {
  return `<section class="banner banner-foto">${bannerFoto(foto || BANNERFOTO[eyebrow] || "968")}<div class="wrap">${kruimel(kruim || [[eyebrow === "Rover & Co" ? titel : eyebrow]])}<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(titel)}</h1>${intro ? `<p>${esc(intro)}</p>` : ""}</div></section>`;
}

let cache = null;
async function sjabloon(env, request) {
  if (cache) return cache;
  const r = await env.ASSETS.fetch(new Request(new URL("/_sjabloon", request.url)));
  cache = await r.text();
  return cache;
}

// pad = adres voor canonical en het actieve menu-item.
export async function pagina(env, request, { titel, desc = "", inhoud, pad, noindex = false, status = 200, headers = {} }) {
  const url = new URL(request.url);
  pad = pad || url.pathname;
  let h = await sjabloon(env, request);
  h = h.replaceAll("__TITEL__", esc(titel)).replaceAll("__DESC__", esc(desc)).replaceAll("/__PAD__", esc(pad));
  if (noindex) h = h.replace("</title>", '</title>\n<meta name="robots" content="noindex">');
  const deel = "/" + (pad.split("/")[1] || "");
  h = h.replace(`<a href="${deel}">`, `<a href="${deel}" aria-current="page">`);
  // Een kruimelpad dat in de inhoud staat (forum) verhuist naar de banner, zodat elke pagina hetzelfde oogt.
  if (inhoud.includes("<!--kruim-->")) {
    const m = inhoud.match(/<nav class="f-kruimel"[^>]*>[\s\S]*?<\/nav>/);
    inhoud = inhoud.replace("<!--kruim-->", m ? m[0].replace('class="f-kruimel"', 'class="kruimel"') : "");
    if (m) inhoud = inhoud.replace(/(<\/section>[\s\S]*?)<nav class="f-kruimel"[^>]*>[\s\S]*?<\/nav>/, "$1");
  }
  h = h.replace("__INHOUD__", () => inhoud);
  const hdr = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers };
  if (noindex || url.hostname.endsWith(".workers.dev")) hdr["x-robots-tag"] = "noindex, nofollow";
  return new Response(h, { status, headers: hdr });
}

export const naar = (pad, extra = {}) => {
  const h = new Headers({ location: pad, "cache-control": "no-store" });
  for (const [k, v] of Object.entries(extra)) for (const x of [].concat(v)) h.append(k, x);
  return new Response(null, { status: 303, headers: h });
};

// Alleen formulieren van onze eigen site aanvaarden.
export const eigenOrigin = (request, url) => {
  const o = request.headers.get("origin");
  return !o || o === url.origin;
};

export async function sha(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const willekeurig = (n = 32) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function mail(env, { aan, onderwerp, tekst, sleutel }) {
  if (!env.RESEND_API_KEY) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", ...(sleutel ? { "idempotency-key": sleutel } : {}) },
      body: JSON.stringify({ from: "Rover & Co VZW <noreply@roverandco.be>", to: [aan], subject: onderwerp, text: tekst }),
    });
    return r.ok;
  } catch { return false; }
}

// Ingelogd maar de vlag-cookie voor het belletje ontbreekt (bv. ingelogd voor die cookie bestond)? Dan zetten we hem.
export function metVlag(request, res, lid) {
  if (!lid || !res || /(^|;\s*)rc_lid_aan=1/.test(request.headers.get("cookie") || "")) return res;
  try { res.headers.append("set-cookie", "rc_lid_aan=1; Path=/; Max-Age=7776000; Secure; SameSite=Lax"); } catch {}
  return res;
}

// Eenvoudige lijn-icoontjes (geen emoji), kleur via currentColor.
const ICONEN = {
  auto: '<path d="M3 16V9l2-4h9l2 4h4v7H3Z"/><path d="M5 9h11"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
  bel: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Z"/><path d="M10 21h4"/>',
  hart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  kalender: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11Z"/><circle cx="12" cy="10" r="2.2"/>',
  vink: '<path d="m5 12 4.5 4.5L19 7"/>',
};
export const ico = (naam) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONEN[naam] || ""}</svg>`;
