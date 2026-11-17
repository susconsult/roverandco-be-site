// Producten en activiteiten uit de database (D1, tabellen producten/activiteiten/media), beheerd via /beheer.
// De Worker bouwt hiermee live:
//   /shop, /shop/<slug>, /activiteiten, /activiteiten/<slug> (met inschrijfformulier)
// en vult de delen in op statische pagina's die erop steunen (HTMLRewriter):
//   / (eerstvolgende, activiteiten, shop), /kalender (Rover & Co-activiteiten), /afrekenen (ophalen op activiteit), /sitemap.xml
// Ook de prijscontrole bij afrekenen en inschrijven (laadCatalogus) leest uit de database.
import { esc as e, pagina, kruimel } from "./sjabloon.js";
import kalenderAnderen from "../data/kalender.json";

const DOMEIN = "https://roverandco.be";
const vandaag = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
export const eur = (n) => "€" + Number(n || 0).toFixed(2).replace(".", ",");
const PER = { persoon: "per persoon", wagen: "per wagen", stuk: "per stuk" };

/* ---------------- gegevens ---------------- */

const lees = (r) => { try { return JSON.parse(r.data); } catch { return null; } };

export async function producten(env, { ookVerborgen = false } = {}) {
  const r = (await env.SHOP_DB.prepare(`SELECT * FROM producten ${ookVerborgen ? "" : "WHERE zichtbaar = 1"} ORDER BY volgorde, naam`).all()).results || [];
  return r.map((x) => ({ ...lees(x), slug: x.slug, zichtbaar: !!x.zichtbaar, volgorde: x.volgorde })).filter((p) => p.naam);
}
export async function product(env, slug) {
  const x = await env.SHOP_DB.prepare("SELECT * FROM producten WHERE slug = ?").bind(slug).first();
  return x ? { ...lees(x), slug: x.slug, zichtbaar: !!x.zichtbaar, volgorde: x.volgorde } : null;
}
// Activiteiten op datum; "verborgen" = niet in lijsten (pagina blijft bereikbaar, noindex).
export async function activiteiten(env) {
  const r = (await env.SHOP_DB.prepare("SELECT * FROM activiteiten ORDER BY CASE WHEN datum = '' THEN 1 ELSE 0 END, datum, volgorde").all()).results || [];
  return r.map((x) => ({ ...lees(x), slug: x.slug, verborgen: !x.zichtbaar })).filter((a) => a.titel);
}
export async function activiteit(env, slug) {
  const x = await env.SHOP_DB.prepare("SELECT * FROM activiteiten WHERE slug = ?").bind(slug).first();
  return x ? { ...lees(x), slug: x.slug, verborgen: !x.zichtbaar } : null;
}
// Zichtbaar en nog niet voorbij (einde of datum >= vandaag; zonder datum = altijd).
const komend = (a) => !a.verborgen && (!a.datum || (a.einde || a.datum) >= vandaag());

export const gratis = (a) => (a.inschrijving?.onderdelen || [{ prijs: 1 }]).every((o) => !o.prijs);
export const inschrijvingOpen = (a) => {
  const i = a.inschrijving;
  return !!(i && i.open && (!i.sluit || i.sluit >= vandaag()) && (i.onderdelen || []).length);
};

// Zelfde vorm als het vroegere src/catalogus.json: voor de prijscontrole in src/index.js.
export async function laadCatalogus(env) {
  const cat = {};
  for (const p of await producten(env)) {
    cat[p.slug] = { naam: p.naam, prijs: Number(p.prijs) || 0, opties: (p.opties || []).map((o) => ({
      naam: o.naam, verplicht: !!o.verplicht, waarden: (o.waarden || []).filter((v) => !v.uit).map((v) => ({ waarde: v.waarde, meerprijs: Number(v.meerprijs) || 0 })),
    })) };
  }
  const acts = await activiteiten(env);
  cat.__activiteiten = acts.filter((a) => komend(a) && a.datum).map((a) => `${a.titel} (${a.datum_label})`);
  cat.__inschrijvingen = {};
  for (const a of acts) if (inschrijvingOpen(a)) cat.__inschrijvingen[a.slug] = {
    titel: a.titel, datum_label: a.datum_label, sluit: a.inschrijving.sluit || a.datum,
    onderdelen: a.inschrijving.onderdelen, tijdsloten: a.inschrijving.tijdsloten || null, wagen: !!a.inschrijving.wagen,
  };
  return cat;
}

/* ---------------- media ---------------- */

export async function mediaTonen(env, id) {
  const f = await env.SHOP_DB.prepare("SELECT type, data FROM media WHERE id = ?").bind(id).first();
  if (!f) return new Response("Niet gevonden", { status: 404 });
  const bytes = f.data instanceof ArrayBuffer ? f.data : new Uint8Array(f.data);
  return new Response(bytes, { headers: { "content-type": f.type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
}

/* ---------------- stukjes opmaak (zelfde als bouw/build.py) ---------------- */

// Foto: naam onder /assets/img/ (met -s.webp en .webp), of een eigen adres (/media/12, /assets/...).
const fotoKlein = (n) => (String(n).startsWith("/") ? n : `/assets/img/${n}-s.webp`);
const fotoGroot = (n) => (String(n).startsWith("/") ? n : `/assets/img/${n}.webp`);
function img(naam, alt, { cls = "", sizes = "100vw", prio = false, pos = null } = {}) {
  if (!naam) return "";
  const a = (cls ? `class="${cls}" ` : "") + (pos ? `style="object-position:${e(pos)}" ` : "");
  const load = prio ? ' fetchpriority="high"' : ' loading="lazy"';
  if (String(naam).startsWith("/")) return `<img ${a}src="${e(naam)}" alt="${e(alt)}"${load}>`;
  return `<img ${a}src="/assets/img/${e(naam)}-s.webp" srcset="/assets/img/${e(naam)}-s.webp 800w, /assets/img/${e(naam)}.webp 1600w" sizes="${sizes}" alt="${e(alt)}"${load}>`;
}
function banner(eyebrow, titel, intro = "", foto = null, alt = "", pos = null, groen = false, kruim = null) {
  return `<section class="banner${groen ? " banner-groen" : ""}">${foto ? img(foto, alt, { prio: true, pos }) : ""}<div class="wrap">${kruimel(kruim || [])}<div class="eyebrow">${e(eyebrow)}</div><h1>${e(titel)}</h1>${intro ? `<p>${e(intro)}</p>` : ""}</div></section>`;
}
function galerij(items) {
  return '<div class="gallery">' + items.map(([n, a]) =>
    `<button type="button" data-full="${e(fotoGroot(n))}" aria-label="Foto groot bekijken: ${e(a)}"><img src="${e(fotoKlein(n))}" alt="${e(a)}" loading="lazy"></button>`).join("") + "</div>";
}
// Productfoto: {klein, groot}
const pf = (p, i = 0) => p.fotos?.[i] || { klein: "/assets/img/870-s.webp", groot: "/assets/img/870.webp" };

export function productKaart(p) {
  const lint = p.lint ? `<span class="tag">${e(p.lint)}</span>` : "";
  return `<a class="prod" href="/shop/${e(p.slug)}"><div class="prod-img"><img src="${e(pf(p).klein)}" alt="${e(p.naam)}" loading="lazy">${lint}</div>`
    + `<div class="prod-b"><span class="eyebrow" style="font-size:12px">${e(p.categorie || "")}</span><h3>${e(p.naam)}</h3><span class="price">${eur(p.prijs)}</span></div></a>`;
}

export function evKaart(a, groot = false) {
  const href = a.extern_url || `/activiteiten/${a.slug}`;
  const ext = a.extern_url ? ' rel="noopener"' : "";
  const meta = (a.kenmerken || []).map((k) => `<span>${e(k)}</span>`).join("");
  const knop = inschrijvingOpen(a) || a.inschrijven_url ? "Inschrijven" : "Meer info";
  const extra = groot ? `<p>${e(a.kort || "")}</p><div class="ev-meta">${meta}</div><span class="btn btn-white">${knop}</span>` : `<div class="ev-meta" style="margin:6px 0 0">${meta}</div>`;
  return `<a href="${e(href)}" class="ev"${ext}>${img(a.foto, a.foto_alt || a.titel, { sizes: "(max-width:880px) 100vw, 50vw", pos: a.foto_pos })}`
    + `<div class="ev-body"><span class="ev-date">${e(a.datum_label || "")}</span><h3>${e(a.titel)}</h3>${extra}</div></a>`;
}

function aftellen(a) {
  const c = a.aftellen;
  if (!c?.start) return "";
  const vak = (k, l) => `<div class="ct-vak"><b data-ct="${k}">0</b><span>${l}</span></div>`;
  return `<section class="aftellen" data-start="${e(c.start)}" data-einde="${e(c.einde || c.start)}"><div class="wrap ct-in"><p class="ct-titel">Nog even geduld tot ${e(a.titel)}</p>`
    + `<div class="ct-vakken">${vak("d", "dagen")}${vak("u", "uren")}${vak("m", "minuten")}${vak("s", "seconden")}</div></div>`
    + `<script>(function(){var el=document.currentScript.parentNode,s=Date.parse(el.dataset.start),n=Date.parse(el.dataset.einde),t=el.querySelector(".ct-titel"),v=el.querySelector(".ct-vakken");function z(){var nu=Date.now(),r=s-nu;if(nu>=n){el.hidden=true;return}if(r<=0){t.textContent="Het is zover: we zijn bezig!";v.hidden=true;return}var d=Math.floor(r/864e5),u=Math.floor(r/36e5)%24,m=Math.floor(r/6e4)%60,c=Math.floor(r/1e3)%60;el.querySelector("[data-ct=d]").textContent=d;el.querySelector("[data-ct=u]").textContent=u;el.querySelector("[data-ct=m]").textContent=m;el.querySelector("[data-ct=s]").textContent=c;setTimeout(z,1000)}z()})();</script></section>`;
}
const affiche = (a) => a.affiche
  ? `<button type="button" class="affiche" data-full="${e(fotoGroot(a.affiche))}" aria-label="Affiche groot bekijken"><img src="${e(fotoKlein(a.affiche))}" alt="Affiche ${e(a.titel)}" loading="lazy"></button>` : "";
const fotoblok = (a) => (a.fotos || []).length
  ? `<section class="gallery-sec"><div class="wrap"><div class="sec-head"><div><div class="eyebrow">Foto's</div><h2>${e(a.fotos_titel || "Sfeerbeelden")}</h2></div><a href="/fotos" class="btn btn-ghost-w">Alle foto's</a></div>${galerij(a.fotos)}</div></section>` : "";

/* ---------------- pagina's ---------------- */

async function shopPagina(env, request) {
  const lijst = await producten(env);
  return pagina(env, request, {
    titel: "Shop", pad: "/shop", desc: "Merch van Rover & Co: T-shirts en emaille mok. Met elke aankoop steun je de vereniging.",
    inhoud: banner("Shop", "Draag het", "Met elke aankoop steun je onze vereniging.", "5577", "Defender 110 op een zandweg")
      + `<section class="shop-sec"><div class="wrap"><div class="products">${lijst.map(productKaart).join("") || "<p>Binnenkort nieuwe merch.</p>"}</div></div></section>`,
  });
}

async function productPagina(env, request, slug) {
  const p = await product(env, slug);
  if (!p || !p.zichtbaar) return null;
  const opts = (p.opties || []).map((o) => {
    const waarden = (o.waarden || []).filter((v) => !v.uit);
    if (!waarden.length) return "";
    const chips = waarden.map((v) => {
      const m = Number(v.meerprijs) || 0;
      return `<label><input type="radio" name="${e(o.naam)}" value="${e(v.waarde)}" data-meer="${m}"${v.standaard ? " checked" : ""}><span>${e(v.waarde)}${m ? ` (+${eur(m)})` : ""}</span></label>`;
    }).join("");
    return `<fieldset class="opt" data-optie="${e(o.naam)}" data-verplicht="${o.verplicht ? "true" : "false"}"><legend>${e(o.naam)}</legend><div class="chips">${chips}</div><div class="err" aria-live="polite"></div></fieldset>`;
  }).join("");
  const fotos = p.fotos?.length ? p.fotos : [pf(p)];
  const thumbs = fotos.map((f, i) => `<button type="button" data-src="${e(f.groot)}" aria-label="Foto ${i + 1}" aria-current="${i === 0}"><img src="${e(f.klein)}" alt="" loading="lazy"></button>`).join("");
  const tekst = String(p.omschrijving || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return pagina(env, request, {
    titel: p.naam, pad: `/shop/${p.slug}`, desc: tekst.slice(0, 155),
    inhoud: `<section class="pdp-sec"><div class="wrap">${kruimel([["Shop", "/shop"], [p.naam]]).replace('class="kruimel"', 'class="kruimel donker"')}</div><div class="wrap pdp"><div><div class="pdp-main"><img id="pdp-main" src="${e(fotos[0].groot)}" alt="${e(p.naam)}" fetchpriority="high"></div><div class="thumbs">${thumbs}</div></div>
  <div><h1>${e(p.naam)}</h1><div class="price" id="prijs">${eur(p.prijs)}</div>
    <form id="product-form" data-id="${e(p.slug)}" data-naam="${e(p.naam)}" data-prijs="${Number(p.prijs) || 0}" novalidate>${opts}
      <div class="opt"><label for="aantal">Aantal</label><input class="qty" id="aantal" type="number" min="1" value="1"></div>
      <button class="btn btn-solid" type="submit">In mandje</button></form>
    <div class="prose" style="margin-top:30px">${p.omschrijving || ""}</div></div></div></section>`,
  });
}

async function activiteitenPagina(env, request) {
  const acts = (await activiteiten(env)).filter(komend);
  return pagina(env, request, {
    titel: "Activiteiten", pad: "/activiteiten", desc: "Ritten, meetings en evenementen van Rover & Co.",
    inhoud: banner("Activiteiten", "Rij mee", "Elke activiteit is een belevenis op een bijzondere plek. Schrijf je in en rij mee.", "977", "Colonne Defenders in het bos")
      + `<section><div class="wrap"><div class="ev-list">${acts.map((a) => evKaart(a, true)).join("") || "<p>Binnenkort nieuwe activiteiten.</p>"}</div></div></section>`,
  });
}

function inschrijfFormulier(a) {
  const i = a.inschrijving, ts = i.tijdsloten;
  const rijen = i.onderdelen.map((o) => `
        <div class="ins-rij" data-onderdeel="${e(o.id)}" data-prijs="${Number(o.prijs) || 0}">
          <div><b>${e(o.naam)}</b><small>${o.prijs ? `${eur(o.prijs)} ${PER[o.per] || ""}` : "Gratis"}${o.beperkt || o.capaciteit ? " · Beperkte plaatsen" : ""}</small>${o.uitleg ? `<small class="uitleg">${e(o.uitleg)}</small>` : ""}</div>
          <div class="teller"><button type="button" data-min aria-label="Minder ${e(o.naam)}">−</button>
            <input type="number" name="aantal_${e(o.id)}" value="0" min="0" max="${o.max || 20}" inputmode="numeric" aria-label="Aantal ${e(o.naam)}">
            <button type="button" data-plus aria-label="Meer ${e(o.naam)}">+</button></div>
        </div>`).join("");
  const slot = ts?.onderdeel && ts.slots?.length ? `
        <div class="sub" data-slot-voor="${e(ts.onderdeel)}" hidden><label for="tijdslot">Kies je tijdslot</label>
          <select id="tijdslot" name="tijdslot"><option value="">Kies een tijdslot</option>${ts.slots.map((x) => `<option value="${e(x)}">${e(x)}</option>`).join("")}</select><div class="err" data-voor="tijdslot"></div></div>` : "";
  const wagen = i.wagen ? `
      <fieldset class="co-blok"><legend><span>3</span> Je Land Rover <small>(optioneel)</small></legend>
        <div class="veld"><label for="wagen">Met welke Land Rover kom je?</label><input id="wagen" name="wagen" placeholder="Bv. Defender 110, 1998"></div></fieldset>` : "";
  const g = gratis(a);
  return `
<section id="inschrijven" class="inschrijf-sec"><div class="wrap">
  <div class="sec-head"><div><div class="eyebrow">Inschrijven</div><h2>Schrijf je in voor ${e(a.titel)}</h2></div></div>
  <form id="inschrijf-form" class="checkout" novalidate data-slug="${e(a.slug)}">
    <div class="co-main">
      <fieldset class="co-blok"><legend><span>1</span> Jouw gegevens</legend>
        <div class="veld"><label for="naam">Voor- en achternaam</label><input id="naam" name="naam" autocomplete="name" required><div class="err" data-voor="naam"></div></div>
        <div class="veld2">
          <div class="veld"><label for="email">E-mailadres</label><input id="email" name="email" type="email" autocomplete="email" required><div class="err" data-voor="email"></div></div>
          <div class="veld"><label for="telefoon">Telefoon</label><input id="telefoon" name="telefoon" type="tel" autocomplete="tel" required><div class="err" data-voor="telefoon"></div></div>
        </div>
      </fieldset>
      <fieldset class="co-blok"><legend><span>2</span> Waarvoor schrijf je in?</legend>${rijen}
        <div class="err" data-voor="aantal"></div>${slot}
      </fieldset>${wagen}
      <fieldset class="co-blok"><legend><span>${i.wagen ? 4 : 3}</span> Opmerking <small>(optioneel)</small></legend>
        <div class="veld"><label for="opmerking" class="sr-only">Opmerking</label><textarea id="opmerking" name="opmerking" rows="3"></textarea></div>
      </fieldset>
      <div class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
    </div>
    <aside class="co-side"><div class="card">
      <h3>Overzicht</h3>
      <ul class="facts"><li><span>Activiteit</span><span>${e(a.titel)}</span></li><li><span>Datum</span><span>${e(a.datum_lang || "")}</span></li></ul>
      <div id="co-lijnen"></div>
      <ul class="facts"><li class="co-totaal"><span>Totaal</span><span id="co-totaal">€0,00</span></li></ul>
      <label class="akkoord"><input type="checkbox" id="akkoord" name="akkoord"> Ik ga akkoord met de <a href="/voorwaarden">algemene voorwaarden</a> en de <a href="/privacy">privacyverklaring</a>.</label>
      <div class="err" data-voor="akkoord"></div>
      <button class="btn btn-solid" type="submit" id="co-knop" style="width:100%;justify-content:center">${g ? "Inschrijven" : "Verder naar betalen"}</button>
      <div class="err" id="co-fout" role="alert"></div>
      <p class="note">${g ? "Inschrijven is gratis. Daarna krijg je een bevestiging per mail." : "Je betaalt veilig online via Viva. Daarna krijg je een bevestiging per mail."} Je inschrijving komt in je <a href="/account">account</a>; heb je er nog geen, dan maken we er een voor je aan.</p>${g ? "" : '<p class="betaal-met">Betalen via <img class="viva-logo" src="/assets/img/viva-logo.svg" alt="viva.com" width="73" height="13"></p>'}
    </div></aside>
  </form>
</div></section>`;
}

async function activiteitPagina(env, request, slug) {
  const a = await activiteit(env, slug);
  if (!a) return null;
  if (a.extern_url) return Response.redirect(a.extern_url, 302);
  const open = inschrijvingOpen(a);
  const knop = open
    ? `<a class="btn btn-solid" href="#inschrijven" style="width:100%;justify-content:center">Inschrijven</a><p class="note">Het formulier staat onderaan deze pagina. ${gratis(a) ? "Inschrijven is gratis." : "Je betaalt veilig online via Viva."}</p>`
    : a.inschrijven_url ? `<a class="btn btn-solid" href="${e(a.inschrijven_url)}" rel="noopener" style="width:100%;justify-content:center">${e(a.inschrijven_label || "Inschrijven")}</a><p class="note">Inschrijven en betalen gebeurt voorlopig nog via onze huidige webshop.</p>`
    : a.inschrijven_label ? `<span class="btn btn-solid" aria-disabled="true" style="width:100%;justify-content:center">${e(a.inschrijven_label)}</span>` : "";
  let body = banner(a.datum_lang || "", a.titel, a.kort || "", a.banner_foto || a.foto, a.foto_alt || a.titel, a.banner_pos || a.foto_pos, !!a.banner_groen, [["Activiteiten", "/activiteiten"], [a.titel]]) + aftellen(a) + `
<section><div class="wrap detail">
  <div class="prose">${a.omschrijving_html || ""}</div>
  <div class="ev-side"><aside class="card"><h3>In het kort</h3><ul class="facts">
    ${a.datum_lang ? `<li><span>Datum</span><span>${e(a.datum_lang)}</span></li>` : ""}
    ${a.locatie ? `<li><span>Locatie</span><span>${e(a.locatie)}</span></li>` : ""}
    ${a.uren ? `<li><span>Uur</span><span>${e(a.uren)}</span></li>` : ""}
  </ul>${knop}</aside>${affiche(a)}</div>
</div></section>` + fotoblok(a);
  if (a.foto_credit) body += `<section style="padding-top:0"><div class="wrap"><p class="fotocredit">Foto bovenaan: ${e(a.foto_credit)}</p></div></section>`;
  if (open) body += inschrijfFormulier(a);
  return pagina(env, request, { titel: a.titel, pad: `/activiteiten/${a.slug}`, desc: `${a.titel}: ${a.kort || ""}`, inhoud: body, noindex: a.verborgen });
}

/* ---------------- delen van statische pagina's invullen ---------------- */

const vervang = (html) => ({ element(el) { el.setInnerContent(html, { html: true }); } });

async function home(env, request) {
  const [acts, prods, r] = await Promise.all([activiteiten(env), producten(env), env.ASSETS.fetch(request)]);
  const lijst = acts.filter(komend);
  const eerst = lijst[0];
  const titels = lijst.map((a) => `<span>${e(a.titel)}</span>·`).join("");
  return new HTMLRewriter()
    .on('[data-dyn="volgende"]', {
      element(el) {
        if (!eerst) { el.remove(); return; }
        el.setAttribute("href", eerst.extern_url || `/activiteiten/${eerst.slug}`);
        el.setInnerContent(`<small>Eerstvolgende</small><strong>${e(eerst.titel)}</strong><span style="font-size:14px">${e(eerst.datum_label || "")}${eerst.locatie ? " · " + e(eerst.locatie) : ""}</span>`, { html: true });
      },
    })
    .on('[data-dyn="strip"]', vervang(`${titels.repeat(2)}<span>Series · Defender · Discovery · Range Rover</span>·${titels}<span>Series · Defender · Discovery · Range Rover</span>·`))
    .on('[data-dyn="events"]', vervang(lijst.length ? `${evKaart(lijst[0], true)}<div class="ev-stack">${lijst.slice(1, 3).map((a) => evKaart(a)).join("")}</div>` : "<p>Binnenkort nieuwe activiteiten.</p>"))
    .on('[data-dyn="producten"]', vervang(prods.map(productKaart).join("")))
    .transform(new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), "cache-control": "no-store" } }));
}

async function kalender(env, request) {
  const [acts, r] = await Promise.all([activiteiten(env), env.ASSETS.fetch(request)]);
  const ons = acts.filter((a) => komend(a) && a.datum).map((a) => ({
    club: "Rover & Co", ons: true, titel: a.titel, datum: a.datum, einde: a.einde || "", label: a.datum_label,
    plaats: (a.locatie || "") + (a.uren ? " · " + a.uren : ""), link: a.extern_url || `/activiteiten/${a.slug}`, org: "Rover & Co VZW", soort: a.kalender_soort || "club", info: a.kort || "",
  }));
  const alle = [...ons, ...kalenderAnderen.map((k) => ({ ...k, ons: false }))].sort((x, y) => (x.datum < y.datum ? -1 : 1));
  return new HTMLRewriter().on("script#kal-data", vervang(JSON.stringify(alle).replace(/</g, "\\u003c")))
    .transform(new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), "cache-control": "no-store" } }));
}

async function afrekenen(env, request) {
  const [cat, r] = await Promise.all([laadCatalogus(env), env.ASSETS.fetch(request)]);
  const opts = cat.__activiteiten.map((x) => `<option value="${e(x)}">${e(x)}</option>`).join("") || '<option value="">Geen activiteit gepland</option>';
  return new HTMLRewriter().on("select#activiteit", vervang(opts))
    .transform(new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), "cache-control": "no-store" } }));
}

async function sitemap(env, request) {
  const [acts, prods, r] = await Promise.all([activiteiten(env), producten(env), env.ASSETS.fetch(request)]);
  let xml = (await r.text()).replace(/<url><loc>[^<]*\/(shop|activiteiten)\/[^<]*<\/loc><\/url>\s*/g, "");
  const extra = [...prods.map((p) => `/shop/${p.slug}`), ...acts.filter((a) => !a.verborgen && !a.extern_url).map((a) => `/activiteiten/${a.slug}`)]
    .map((p) => `<url><loc>${DOMEIN}${p}</loc></url>`).join("\n");
  xml = xml.replace("</urlset>", extra + "\n</urlset>");
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

/* ---------------- router ---------------- */

export async function aanbod(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const p = url.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  if (!env.SHOP_DB) return null;
  let m;
  if ((m = p.match(/^\/media\/(\d{1,10})$/))) return mediaTonen(env, m[1]);
  if (p === "/") return home(env, request);
  if (p === "/kalender") return kalender(env, request);
  if (p === "/afrekenen") return afrekenen(env, request);
  if (p === "/sitemap.xml") return sitemap(env, request);
  if (p === "/shop") return shopPagina(env, request);
  if ((m = p.match(/^\/shop\/([a-z0-9-]{1,80})$/))) return productPagina(env, request, m[1]);
  if (p === "/activiteiten") return activiteitenPagina(env, request);
  if ((m = p.match(/^\/activiteiten\/([a-z0-9-]{1,80})\/inschrijven$/))) return Response.redirect(new URL(`/activiteiten/${m[1]}#inschrijven`, url), 301);
  if ((m = p.match(/^\/activiteiten\/([a-z0-9-]{1,80})$/))) return activiteitPagina(env, request, m[1]);
  return null;
}
