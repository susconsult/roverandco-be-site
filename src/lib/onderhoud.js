// Onderhoudsmodus voor roverandco.be (nov 2026).
// - Aan/uit via een knop in /beheer (tabel instellingen, sleutel "onderhoud" = "aan"/"uit").
// - Geldt op elk adres: roverandco.be, www en het testadres op workers.dev (keuze Pieter 20 nov 2026).
// - Bezoekers krijgen een 503 met noindex. Alleen een ingelogde beheerder (lid met BEHEER_EMAILS, mail bevestigd) komt erdoor.
// - Altijd open: inloggen/wachtwoord, /beheer, Viva (webhook + terugkeer), oude Ecwid-links (301), assets, robots.txt.
import { huidigLid } from "./leden.js";
import { HEADERS } from "./veiligheid.js";

let cache = { waarde: null, tot: 0 };

export async function onderhoudAan(env) {
  if (Date.now() < cache.tot) return cache.waarde;
  let aan = false;
  try {
    const r = await env.SHOP_DB.prepare("SELECT waarde FROM instellingen WHERE sleutel = 'onderhoud'").first();
    aan = r?.waarde === "aan";
  } catch { aan = false; }
  cache = { waarde: aan, tot: Date.now() + 15_000 };
  return aan;
}

export async function zetOnderhoud(env, aan) {
  await env.SHOP_DB.prepare("INSERT INTO instellingen (sleutel, waarde) VALUES ('onderhoud', ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde")
    .bind(aan ? "aan" : "uit").run();
  cache = { waarde: aan, tot: 0 };
}

const OPEN = [
  /^\/assets\//, /^\/favicon\.png$/, /^\/apple-touch-icon\.png$/, /^\/robots\.txt$/,
  /^\/account\/(inloggen|uitloggen|wachtwoord|wachtwoord-vergeten|bevestig|afmelden)$/,
  /^\/beheer(\/|$)/, /^\/scan(\/|$)/, /^\/api\/scan\//, /^\/planner(\/|$)/,
  /^\/api\/viva\/webhook$/, /^\/betaald\/?$/, /^\/betaling-mislukt(\.html)?$/,
  /^\/products(\/|$)/, /^\/woolandwheels\/?$/, /^\/demopage02\/?$/,
];

// Geeft een Response (onderhoudspagina) of null (gewoon doorlaten).
export async function onderhoud(request, env) {
  const url = new URL(request.url);
  if (OPEN.some((re) => re.test(url.pathname))) return null;
  if (!(await onderhoudAan(env))) return null;
  const lid = await huidigLid(request, env).catch(() => null);
  if (lid?.beheerder) return null;
  return pagina(url);
}

function pagina(url) {
  const body = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Rover &amp; Co VZW – we bouwen aan iets nieuws</title>
<link rel="icon" href="/favicon.png">
<style>
@font-face{font-family:"Big Shoulders Display";font-weight:900;font-display:swap;src:url(/assets/fonts/big-shoulders-display-latin-900-normal.woff2) format("woff2")}
@font-face{font-family:Inter;font-weight:400;font-display:swap;src:url(/assets/fonts/inter-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:Inter;font-weight:600;font-display:swap;src:url(/assets/fonts/inter-latin-600-normal.woff2) format("woff2")}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:#1F3B2A;color:#fff;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;padding:32px}
main{max-width:520px}
img{width:150px;height:auto;margin:0 auto 28px;display:block}
h1{font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:clamp(40px,8vw,64px);line-height:1;margin:0 0 16px;text-transform:uppercase;letter-spacing:.01em}
p{font-size:18px;line-height:1.55;margin:0 0 28px;color:rgba(255,255,255,.85)}
.knoppen{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
a.k{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:6px;font-weight:600;font-size:15px;text-decoration:none;color:#fff;border:1.5px solid rgba(255,255,255,.6)}
a.k:hover{background:rgba(255,255,255,.1)}
a.k svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.inlog{margin-top:40px;font-size:14px}.inlog a{color:rgba(255,255,255,.7)}
</style></head><body><main>
<img src="/assets/img/logo-licht.webp" alt="Rover &amp; Co" width="150" height="150">
<h1>We bouwen aan iets nieuws</h1>
<p>Onze nieuwe site is bijna klaar. Tot dan vind je ons op Facebook en Instagram.</p>
<div class="knoppen">
<a class="k" href="https://www.facebook.com/roverandcobe/" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/></svg>Facebook</a>
<a class="k" href="https://www.instagram.com/roverandco.be/" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6"/></svg>Instagram</a>
</div>
<div class="inlog"><a href="/account/inloggen?terug=${encodeURIComponent(url.pathname + url.search)}">Inloggen</a></div>
</main></body></html>`;
  return new Response(body, {
    status: 503,
    headers: { ...HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "3600", "x-robots-tag": "noindex, nofollow" },
  });
}
