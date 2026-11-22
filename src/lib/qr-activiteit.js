// QR per activiteit: /activiteiten/<slug>/qr (printpagina) + /qr.svg, /qr.eps.
// De QR verwijst altijd naar https://roverandco.be/activiteiten/<slug>. PNG maakt de browser zelf (canvas).
// Publiek, maar noindex.
import { qrMatrix } from "./ticket.js";
import { esc as e } from "./sjabloon.js";

const DOMEIN = "https://roverandco.be";
const RAND = 4; // stille zone in modules
const NOINDEX = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "public, max-age=300" };

export const activiteitUrl = (slug) => `${DOMEIN}/activiteiten/${slug}`;

function svg(url) {
  const { n, donker } = qrMatrix(url);
  const z = n + RAND * 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (donker(r, c)) d += `M${c + RAND} ${r + RAND}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${z} ${z}" shape-rendering="crispEdges"><rect width="${z}" height="${z}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// Vector-EPS (zwart op wit), 1 module = 10 pt.
function eps(url, titel) {
  const { n, donker } = qrMatrix(url);
  const s = 10, z = (n + RAND * 2) * s;
  const lijnen = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (donker(r, c)) lijnen.push(`${(c + RAND) * s} ${z - (r + RAND + 1) * s} m`);
  return `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 ${z} ${z}
%%Title: QR ${titel.replace(/[()\\\r\n]/g, "")}
%%Creator: roverandco.be
%%EndComments
/m { ${s} ${s} rectfill } bind def
1 setgray 0 0 ${z} ${z} rectfill
0 setgray
${lijnen.join("\n")}
showpage
%%EOF
`;
}

function printPagina(a, url) {
  const t = e(a.titel), qr = svg(url);
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>QR – ${t}</title>
<link rel="stylesheet" href="/assets/css/site.css">
<style>
body{margin:0;background:#f3efe6;font-family:Inter,system-ui,sans-serif;color:#1a1a1a}
.blad{max-width:560px;margin:32px auto;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.08)}
.kop{background:#1F3B2A;color:#fff;text-align:center;padding:28px 24px 22px}
.kop img{display:block;width:110px;height:auto;margin:0 auto}
.kop h1{font-family:"Big Shoulders Display",sans-serif;font-weight:900;text-transform:uppercase;font-size:44px;line-height:1;margin:14px 0 6px;color:#fff}
.kop p{margin:0;font-size:16px;opacity:.9}
.qr{padding:28px 48px 8px}.qr svg{display:block;width:100%;height:auto}
.url{text-align:center;font-weight:600;font-size:15px;padding:0 24px 28px;word-break:break-all}
.knoppen{max-width:560px;margin:0 auto 40px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.knoppen a,.knoppen button{font:600 15px Inter,sans-serif;padding:10px 18px;border:2px solid #1F3B2A;background:#fff;color:#1F3B2A;text-decoration:none;cursor:pointer;border-radius:4px}
.knoppen .vol{background:#1F3B2A;color:#fff}
@media print{body{background:#fff}.blad{box-shadow:none;margin:0 auto}.knoppen{display:none}.kop{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="blad">
  <div class="kop"><img src="/assets/img/logo-licht.webp" alt="Rover &amp; Co"><h1>${t}</h1>${a.datum_lang || a.locatie ? `<p>${e([a.datum_lang, a.locatie].filter(Boolean).join(" · "))}</p>` : ""}</div>
  <div class="qr" id="qr">${qr}</div>
  <div class="url">${e(url.replace(/^https:\/\//, ""))}</div>
</div>
<div class="knoppen">
  <button class="vol" onclick="print()">Afdrukken</button>
  <button id="png">Download PNG</button>
  <a href="/activiteiten/${e(a.slug)}/qr.svg" download="qr-${e(a.slug)}.svg">Download SVG</a>
  <a href="/activiteiten/${e(a.slug)}/qr.eps" download="qr-${e(a.slug)}.eps">Download EPS</a>
</div>
<script>
document.getElementById("png").onclick=function(){
  var s=document.querySelector("#qr svg"),x=new XMLSerializer().serializeToString(s),i=new Image();
  i.onload=function(){var c=document.createElement("canvas");c.width=c.height=2000;var g=c.getContext("2d");g.imageSmoothingEnabled=false;g.drawImage(i,0,0,2000,2000);
    c.toBlob(function(b){var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="qr-${e(a.slug)}.png";a.click();});};
  i.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(x);
};
</script>
</body></html>`;
}

// soort: "pagina" | "svg" | "eps"
export function qrActiviteit(a, soort) {
  const url = activiteitUrl(a.slug);
  if (soort === "svg") return new Response(svg(url), { headers: { "Content-Type": "image/svg+xml; charset=utf-8", ...NOINDEX } });
  if (soort === "eps") return new Response(eps(url, a.titel || a.slug), { headers: { "Content-Type": "application/postscript", "Content-Disposition": `attachment; filename="qr-${a.slug}.eps"`, ...NOINDEX } });
  return new Response(printPagina(a, url), { headers: { "Content-Type": "text/html; charset=utf-8", ...NOINDEX } });
}
