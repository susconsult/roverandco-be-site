// Pagina's die de Worker zelf maakt (account, forum) in dezelfde opmaak als de rest van de site.
// bouw/build.py schrijft public/_sjabloon.html met plaatshouders; die vullen we hier in.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const datum = (iso, kort = false) => {
  if (!iso) return "";
  const d = new Date(iso);
  const o = kort ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };
  return d.toLocaleString("nl-BE", { timeZone: "Europe/Brussels", ...o });
};

export function banner(eyebrow, titel, intro = "") {
  return `<section class="banner banner-groen"><div class="wrap"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(titel)}</h1>${intro ? `<p>${esc(intro)}</p>` : ""}</div></section>`;
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
