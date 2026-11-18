// Worker voor roverandco.be
// - /api/bestelling   : bestelling uit de shop (prijzen opnieuw berekend uit de database, zie laadCatalogus in src/aanbod.js)
// - /api/inschrijving : inschrijving voor een activiteit (prijzen en tijdsloten uit de database)
// - /shop, /activiteiten, / , /kalender, /afrekenen, /sitemap.xml, /media/<id>: live uit de database (src/aanbod.js)
//   Beide: eerst bewaren in de database (D1, binding SHOP_DB, zie src/opslag.js), dan een Viva-betaalorder
//   maken en de bezoeker naar Viva Smart Checkout sturen.
// - /betaald          : terugkeer uit Viva (succes-URL). De Worker vraagt bij Viva na of er echt betaald is.
// - /api/viva/webhook : melding van Viva (Transaction Payment Created), vangnet als de browser sluit.
// - /planner, /api/planner/* : terreinplanner achter login (zie src/planner.js)
// - /api/kalender     : activiteiten van andere clubs indienen/goedkeuren/ophalen (zie src/kalender.js)
// - /beheer         : bestellingen en inschrijvingen beheren, login met code per mail (zie src/beheer.js)
// - /account, /api/account/ik : accounts (zie src/leden.js); elke bestelling/inschrijving hangt aan een account
// - /forum           : het forum (zie src/forum.js)
// - Alle andere adressen: statische bestanden uit public/.
//
// Secrets in Cloudflare (geen waarden in deze repo):
//   VIVA_CLIENT_ID, VIVA_CLIENT_SECRET, VIVA_SOURCE_CODE, VIVA_WEBHOOK_KEY,
//   VIVA_MERCHANT_ID + VIVA_API_KEY (alternatief voor VIVA_WEBHOOK_KEY: de Worker haalt de sleutel zelf op),
//   RESEND_API_KEY (bevestigingsmail naar de klant vanaf noreply@roverandco.be)
//   Optioneel: VIVA_OMGEVING = "demo" (anders live).
// Zolang VIVA_CLIENT_ID / VIVA_CLIENT_SECRET / VIVA_SOURCE_CODE ontbreken: testmodus, er wordt niet betaald.
import { planner } from "./planner.js";
import { kalender } from "./kalender.js";
import { opslag } from "./opslag.js";
import { beheer } from "./beheer.js";
import { leden, lidVoorBestelling, wachtwoordLink } from "./leden.js";
import { forum } from "./forum.js";
import { cb } from "./cb.js";
import { melden } from "./melden.js";
import { aanbod, laadCatalogus } from "./aanbod.js";
import { verstuur } from "./mail.js";
import { kassa } from "./kassa.js";
import { klantMailOpmaak } from "./mails-klant.js";

const VERZENDKOST = 7.5;
const GRATIS_VERZENDING_VANAF = 100;
const BETAALTIJD_SEC = 900;
const AFZENDER = "Rover & Co VZW <noreply@roverandco.be>"; // 15 minuten om te betalen; zo lang blijft een plaats in een tijdslot vastgehouden

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const naar = (pad) => new Response(null, { status: 303, headers: { location: pad, "cache-control": "no-store" } });

const r2 = (n) => Math.round(n * 100) / 100;
const tekst = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const geheel = (v, min, max) => Math.min(max, Math.max(min, parseInt(v, 10) || 0));

function nieuwNummer(prefix) {
  const datum = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(5)), (x) => a[x % a.length]).join("");
  return `${prefix}-${datum}-${rnd}`;
}
const nummerOk = (prefix, s) => new RegExp(`^${prefix}-\\d{6}-[A-Z0-9]{5}$`).test(s || "");

function controleerKlant(k = {}, fouten) {
  const klant = { naam: tekst(k.naam, 120), email: tekst(k.email, 160).toLowerCase(), telefoon: tekst(k.telefoon, 40) };
  if (klant.naam.length < 2) fouten.push("naam");
  if (!emailOk(klant.email)) fouten.push("email");
  if (klant.telefoon.replace(/\D/g, "").length < 8) fouten.push("telefoon");
  return klant;
}

/* ---------------- Viva ---------------- */

const vivaActief = (env) => !!(env.VIVA_CLIENT_ID && env.VIVA_CLIENT_SECRET && env.VIVA_SOURCE_CODE);

function vivaAdressen(env) {
  const demo = env.VIVA_OMGEVING === "demo";
  return {
    token: demo ? "https://demo-accounts.vivapayments.com/connect/token" : "https://accounts.vivapayments.com/connect/token",
    api: demo ? "https://demo-api.vivapayments.com" : "https://api.vivapayments.com",
    checkout: demo ? "https://demo.vivapayments.com/web/checkout?ref=" : "https://www.vivapayments.com/web/checkout?ref=",
  };
}

async function vivaToken(env) {
  const r = await fetch(vivaAdressen(env).token, {
    method: "POST",
    headers: {
      authorization: "Basic " + btoa(`${env.VIVA_CLIENT_ID}:${env.VIVA_CLIENT_SECRET}`),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.access_token) throw new Error(`Viva-token mislukt (${r.status}) ${JSON.stringify(d).slice(0, 300)}`);
  return d.access_token;
}

// Het ordernummer van Viva heeft 16 cijfers: te groot voor een gewoon JavaScript-getal.
// Daarom lezen we het als tekst uit het ruwe antwoord.
const orderCodeUit = (ruw) => (ruw.match(/"orderCode"\s*:\s*"?(\d{10,20})/i) || [])[1] || null;

async function vivaOrder(env, { bedrag, omschrijving, klant, ref }) {
  const token = await vivaToken(env);
  const r = await fetch(vivaAdressen(env).api + "/checkout/v2/orders", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      amount: Math.round(bedrag * 100), // in cent
      customerTrns: omschrijving,
      customer: { email: klant.email, fullName: klant.naam, phone: klant.telefoon, countryCode: "BE" },
      paymentTimeout: BETAALTIJD_SEC,
      merchantTrns: ref,
      sourceCode: env.VIVA_SOURCE_CODE,
    }),
  });
  const ruw = await r.text();
  const code = r.ok ? orderCodeUit(ruw) : null;
  if (!code) throw new Error(`Viva-order mislukt (${r.status}) ${ruw.slice(0, 400)}`);
  return code;
}

async function vivaTransactie(env, id) {
  const token = await vivaToken(env);
  const r = await fetch(`${vivaAdressen(env).api}/checkout/v2/transactions/${id}`, { headers: { authorization: `Bearer ${token}` } });
  const ruw = await r.text();
  if (!r.ok) throw new Error(`Viva-transactie niet gevonden (${r.status})`);
  const d = JSON.parse(ruw);
  return { orderCode: orderCodeUit(ruw), statusId: d.statusId, bedrag: Number(d.amount), ref: d.merchantTrns || "" };
}

/* ---------------- Klantmail via Resend ---------------- */

async function stuurKlantmail(env, m, origin) {
  if (!m || !env.RESEND_API_KEY) return;
  // Account zonder wachtwoord (automatisch aangemaakt bij deze bestelling)? Dan de link om er een te kiezen erbij.
  let link = "";
  try {
    const lid = await env.SHOP_DB.prepare("SELECT l.id, l.wachtwoord FROM registraties r JOIN leden l ON l.id = r.lid_id WHERE r.nummer = ?").bind(m.nummer).first();
    if (lid && !lid.wachtwoord && origin) {
      link = await wachtwoordLink(env, origin, lid.id);
      m = { ...m, tekst: m.tekst.replace("Dit is een automatische mail", `Je account bij Rover & Co\nWe maakten een account voor je aan met dit mailadres. Daarin vind je je bestellingen en inschrijvingen terug, en je kan ermee op ons forum. Kies hier je wachtwoord (de link is 30 dagen geldig):\n${link}\n\nDit is een automatische mail`) };
    }
  } catch (e) { console.error("wachtwoordlink", e?.message); }
  let opmaak = { html: "", bijlagen: [] };
  try { opmaak = await klantMailOpmaak(env, m, { wachtwoordLink: link }); } catch (e) { console.error("mailopmaak", m.nummer, e?.message); }
  const r = await verstuur(env, { aan: m.aan, onderwerp: m.onderwerp, tekst: m.tekst, html: opmaak.html || undefined, bijlagen: opmaak.bijlagen, sleutel: `bevestiging-${m.nummer}` });
  const status = r.ok ? `verstuurd ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC (Resend ${r.id})` : `fout bij Resend (${r.status || "-"}): ${r.fout}`;
  await opslag(env, "mailstatus", { soort: m.soort, nummer: m.nummer, status });
}

/* ---------------- Shop: bestelling ---------------- */

function controleerBestelling(b, catalogus) {
  const fouten = [];
  const klant = controleerKlant(b.klant, fouten);

  const artikels = [];
  for (const a of Array.isArray(b.artikels) ? b.artikels.slice(0, 50) : []) {
    const p = catalogus[a.id];
    const aantal = geheel(a.aantal, 1, 50);
    if (!p || a.id.startsWith("__")) { fouten.push("artikel"); continue; }
    let prijs = p.prijs;
    const keuzes = {};
    for (const o of p.opties) {
      const w = o.waarden.find((x) => x.waarde === a.keuzes?.[o.naam]);
      if (!w) { if (o.verplicht) fouten.push(`optie ${o.naam}`); continue; }
      prijs += w.meerprijs;
      keuzes[o.naam] = w.waarde;
    }
    artikels.push({ id: a.id, naam: p.naam, keuzes, aantal, prijs: r2(prijs), lijn: r2(prijs * aantal) });
  }
  if (!artikels.length) fouten.push("mandje leeg");

  const l = b.levering || {};
  const levering = { type: tekst(l.type, 20) };
  if (levering.type === "activiteit") {
    levering.activiteit = tekst(l.activiteit, 80);
    if (!catalogus.__activiteiten.includes(levering.activiteit)) fouten.push("activiteit");
  } else if (levering.type === "verzenden") {
    Object.assign(levering, { straat: tekst(l.straat, 120), postcode: tekst(l.postcode, 10), gemeente: tekst(l.gemeente, 80), land: tekst(l.land, 2) });
    if (levering.straat.length < 3 || levering.postcode.length < 4 || levering.gemeente.length < 2) fouten.push("adres");
    if (!["BE", "NL"].includes(levering.land)) fouten.push("land");
  } else if (levering.type !== "oostham") fouten.push("levering");

  const subtotaal = r2(artikels.reduce((s, a) => s + a.lijn, 0));
  const verzending = levering.type === "verzenden" && subtotaal < GRATIS_VERZENDING_VANAF ? VERZENDKOST : 0;
  const d = b.donatie || {};
  let donatie = 0;
  if (d.type === "10") donatie = r2(subtotaal * 0.1);
  else if (d.type === "15") donatie = r2(subtotaal * 0.15);
  else if (d.type === "eigen") donatie = r2(Math.min(1000, Math.max(0, parseFloat(String(d.bedrag).replace(",", ".")) || 0)));
  if (b.akkoord !== true) fouten.push("akkoord");

  return {
    fouten,
    record: { klant, artikels, levering, subtotaal, verzending, donatie, donatie_type: tekst(d.type, 10), totaal: r2(subtotaal + verzending + donatie), opmerking: tekst(b.opmerking, 1000) },
  };
}

/* ---------------- Activiteit: inschrijving ---------------- */

function controleerInschrijving(b, catalogus) {
  const fouten = [];
  const slug = tekst(b.activiteit, 80);
  const cfg = (catalogus.__inschrijvingen || {})[slug];
  if (!cfg) return { fouten: ["activiteit"] };
  const vandaag = new Date().toISOString().slice(0, 10);
  if (cfg.sluit && vandaag > cfg.sluit) return { fouten: ["gesloten"] };

  const klant = controleerKlant(b.klant, fouten);
  const lijnen = [];
  for (const o of cfg.onderdelen) {
    const aantal = geheel(b.aantallen?.[o.id], 0, o.max || 20);
    if (aantal > 0) lijnen.push({ id: o.id, naam: o.naam, per: o.per, aantal, prijs: o.prijs, lijn: r2(o.prijs * aantal) });
  }
  // capaciteit (harde grens over alle inschrijvingen) en meldingsgrens per onderdeel, gecontroleerd in de sheet
  const limieten = lijnen.map((l) => {
    const o = cfg.onderdelen.find((x) => x.id === l.id);
    return { id: l.id, naam: l.naam, per: l.per, aantal: l.aantal, capaciteit: o.capaciteit || 0, melding: o.melding_vanaf || 0 };
  }).filter((l) => l.capaciteit || l.melding);
  if (!lijnen.length) fouten.push("aantal");

  let tijdslot = "", slot_personen = 0;
  if (cfg.tijdsloten) {
    const l = lijnen.find((x) => x.id === cfg.tijdsloten.onderdeel);
    if (l) {
      tijdslot = tekst(b.tijdslot, 10);
      slot_personen = l.aantal;
      if (!cfg.tijdsloten.slots.includes(tijdslot)) fouten.push("tijdslot");
    }
  }
  const wagen = cfg.wagen ? tekst(b.wagen, 120) : "";
  if (b.akkoord !== true) fouten.push("akkoord");

  return {
    fouten,
    record: {
      klant, activiteit: slug, activiteit_titel: `${cfg.titel} (${cfg.datum_label})`, activiteit_naam: cfg.titel, activiteit_datum_label: cfg.datum_label, activiteit_datum_lang: cfg.datum_lang || "", activiteit_locatie: cfg.locatie || "", activiteit_uren: cfg.uren || "", lijnen, tijdslot, slot_personen,
      max_per_slot: cfg.tijdsloten?.max_per_slot || 0, limieten, wagen, totaal: r2(lijnen.reduce((s, x) => s + x.lijn, 0)), opmerking: tekst(b.opmerking, 1000),
    },
  };
}

/* ---------------- Gemeenschappelijk: bewaren en betalen ---------------- */

const SOORTEN = {
  bestelling: { prefix: "RC", controleer: controleerBestelling, omschrijving: (r, nr) => `Rover & Co bestelling ${nr}` },
  inschrijving: { prefix: "RI", controleer: controleerInschrijving, omschrijving: (r, nr) => `Rover & Co inschrijving ${r.activiteit_titel} ${nr}` },
};

async function plaats(request, env, soort) {
  const S = SOORTEN[soort];
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, fout: "Ongeldige aanvraag." }, 400); }
  if (b.website) return json({ ok: true, nummer: `${S.prefix}-OK`, klaar: true }); // spam-val: bot geen hint geven
  if (!env.SHOP_DB) return json({ ok: false, fout: "Dit is nog niet gekoppeld. Probeer later opnieuw." }, 503);
  const res = S.controleer(b, await laadCatalogus(env));
  if (res.fouten.includes("gesloten")) return json({ ok: false, fout: "De inschrijvingen voor deze activiteit zijn afgesloten." }, 422);
  if (res.fouten.length) return json({ ok: false, fout: "Controleer je gegevens.", velden: res.fouten }, 422);
  if (!env.SHOP_DB) return json({ ok: false, fout: "Dit is nog niet gekoppeld. Probeer later opnieuw." }, 503);

  const betaal = vivaActief(env);
  const nr = nummerOk(S.prefix, b.nummer) ? b.nummer : nieuwNummer(S.prefix); // zelfde nummer bij opnieuw proberen = geen dubbel
  const metBetaling = betaal && res.record.totaal > 0;
  const status = metBetaling ? "Wacht op betaling" : betaal ? "Bevestigd (gratis)" : "Test (niet betaald)";
  const payload = { ...res.record, soort, nummer: nr, test: !betaal, status, aangemaakt: new Date().toISOString(), betaaltijd_min: BETAALTIJD_SEC / 60, site: new URL(request.url).origin, resend: !!env.RESEND_API_KEY };

  const fout = "Dit kon niet bewaard worden. Probeer opnieuw.";
  const a = await opslag(env, "nieuw", payload);
  if (a?.fout === "vol" && a.onderdeel) return json({ ok: false, fout: `${a.onderdeel} is volzet. Pas je keuze aan.`, velden: ["aantal"] }, 409);
  if (a?.fout === "vol") return json({ ok: false, fout: "Dit tijdslot is intussen volzet. Kies een ander tijdslot.", velden: ["tijdslot"] }, 409);
  if (!a || a.ok !== true || a.nummer !== nr) return json({ ok: false, fout }, 502);
  // Elke bestelling of inschrijving hangt aan een account (automatisch aangemaakt als het nog niet bestaat).
  try {
    const lid = await lidVoorBestelling(env, request, res.record.klant);
    if (lid) await env.SHOP_DB.prepare("UPDATE registraties SET lid_id = ? WHERE nummer = ?").bind(lid.id, nr).run();
    // Gegevens bewaren in het account, zodat ze de volgende keer al ingevuld zijn.
    if (lid) {
      const k = res.record.klant || {}, lv = res.record.levering || {};
      await env.SHOP_DB.prepare("UPDATE leden SET naam = COALESCE(?, naam), telefoon = COALESCE(?, telefoon) WHERE id = ?").bind(k.naam || null, k.telefoon || null, lid.id).run();
      if (lv.type === "verzenden" && lv.straat) await env.SHOP_DB.prepare("UPDATE leden SET straat = ?, postcode = ?, gemeente = ?, land = ? WHERE id = ?").bind(lv.straat, lv.postcode, lv.gemeente, lv.land || "BE", lid.id).run();
    }
  } catch (e) { console.error("lid koppelen", nr, e?.message); }
  if (a.betaald || !metBetaling) {
    await stuurKlantmail(env, a.mail, payload.site);
    return json({ ok: true, nummer: nr, klaar: true, test: !betaal, gratis: betaal && !a.betaald });
  }

  let code;
  try {
    code = await vivaOrder(env, { bedrag: payload.totaal, omschrijving: S.omschrijving(res.record, nr), klant: res.record.klant, ref: nr });
  } catch (e) {
    console.error("vivaOrder", nr, e?.message);
    try { await env.SHOP_DB.prepare("UPDATE registraties SET notitie = ? WHERE nummer = ?").bind("Viva-fout: " + String(e?.message || e).slice(0, 500), nr).run(); } catch {}
    return json({ ok: false, fout: "Betalen lukt nu even niet. Je gegevens zijn bewaard, probeer zo meteen opnieuw." }, 502);
  }
  const c = await opslag(env, "ordercode", { soort, nummer: nr, ordercode: code });
  if (!c || c.ok !== true) return json({ ok: false, fout }, 502);
  return json({ ok: true, nummer: nr, betalen: vivaAdressen(env).checkout + code + "&color=1F3B2A" });
}

// Adres van de site voor links in mails (bewaard bij de bestelling).
function siteVan(env, a) {
  return a?.site || env.SITE_URL || "https://roverandco.be";
}

// Controleert een betaling bij Viva en zet ze in de sheet op "Betaald" (veilig om meermaals te doen).
async function verwerkBetaling(env, transactieId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transactieId || "")) return { ok: false, status: "onbekend" };
  const tr = await vivaTransactie(env, transactieId);
  if (tr.statusId !== "F") return { ok: false, status: tr.statusId, nummer: tr.ref };
  const a = await opslag(env, "betaald", { ordercode: tr.orderCode, transactie: transactieId, bedrag: tr.bedrag, ref: tr.ref, resend: !!env.RESEND_API_KEY });
  if (!a || a.ok !== true) throw new Error("Sheet niet bijgewerkt");
  await stuurKlantmail(env, a.mail, siteVan(env, a));
  return { ok: true, nummer: a.nummer, soort: a.soort };
}

async function terugUitViva(url, env) {
  const t = url.searchParams.get("t");
  if (!vivaActief(env) || !t) return naar("/betaling-mislukt");
  try {
    const r = await verwerkBetaling(env, t);
    if (r.ok) return naar(`/bedankt?nr=${encodeURIComponent(r.nummer)}&soort=${r.soort}`);
    if (["E", "X"].includes(r.status) || r.status === "onbekend") return naar("/betaling-mislukt");
    return naar(`/bedankt?nr=${encodeURIComponent(r.nummer || "")}&status=verwerking`); // nog niet afgerond: de webhook volgt
  } catch {
    return naar(`/bedankt?status=verwerking`);
  }
}

async function webhookSleutel(env) {
  // Vaste sleutel als die er is, anders zelf ophalen bij Viva met Merchant ID + API Key.
  if (env.VIVA_WEBHOOK_KEY && env.VIVA_WEBHOOK_KEY !== "xxx") return env.VIVA_WEBHOOK_KEY;
  if (!env.VIVA_MERCHANT_ID || !env.VIVA_API_KEY) return "";
  const basis = env.VIVA_OMGEVING === "demo" ? "https://demo.vivapayments.com" : "https://www.vivapayments.com";
  const r = await fetch(basis + "/api/messages/config/token", {
    headers: { authorization: "Basic " + btoa(`${env.VIVA_MERCHANT_ID}:${env.VIVA_API_KEY}`) },
  });
  if (!r.ok) return "";
  return (await r.json()).Key || "";
}

async function webhook(request, env) {
  // Viva controleert het adres eerst met een GET en verwacht de sleutel terug.
  if (request.method === "GET") return json({ Key: await webhookSleutel(env) });
  if (request.method !== "POST") return json({ ok: false }, 405);
  let d;
  try { d = JSON.parse(await request.text()); } catch { return json({ ok: false }, 400); }
  if (d.EventTypeId !== 1796) return json({ ok: true, genegeerd: true }); // alleen "Transaction Payment Created"
  try {
    await verwerkBetaling(env, d.EventData?.TransactionId);
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 500); // Viva probeert later opnieuw
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    // www.roverandco.be → roverandco.be (één adres, voor Google en voor de login-cookie).
    if (url.hostname === "www.roverandco.be") { url.hostname = "roverandco.be"; return Response.redirect(url.href, 301); }
    if (p === "/_sjabloon" || p === "/_sjabloon.html") return new Response("Niet gevonden", { status: 404 });
    // Oude Ecwid-adressen (roverandco.be tot nov 2026) naar de nieuwe site.
    if (p === "/products" || p.startsWith("/products/")) {
      const OUD = {
        "church-of-rover-22-11-2026": "/activiteiten/church-of-rover",
        "rover--co-t-shirt": "/shop/rover-co-t-shirt",
        "built-for-the-wild-t-shirt": "/shop/built-for-the-wild-t-shirt",
        "life-is-better-in-low-range-t-shirt": "/shop/life-is-better-in-low-range-t-shirt",
        "rover--co-emaille-mok": "/shop/emaille-mok",
        "wool--wheels-stel-je-eigen-weekend-samen": "/activiteiten/wild-and-wheels",
        "cart": "/afrekenen", "account": "/account",
      };
      const deel = p.split("/")[2] || "";
      return Response.redirect(new URL(OUD[deel] || "/shop", url.origin).href, 301);
    }
    const ld = await leden(request, env, url);
    if (ld) return ld;
    const fo = await forum(request, env, url);
    if (fo) return fo;
    const md = await melden(request, env, url);
    if (md) return md;
    const cbr = await cb(request, env, url);
    if (cbr) return cbr;
    const ks = await kassa(request, env, url);
    if (ks) return ks;
    const bh = await beheer(request, env, url);
    if (bh) return bh;
    const pl = await planner(request, env, url);
    if (pl) return pl;
    const kal = await kalender(request, env, url);
    if (kal) return kal;
    if (p === "/api/bestelling" || p === "/api/inschrijving") {
      if (request.method !== "POST") return json({ ok: false, fout: "Alleen POST." }, 405);
      return plaats(request, env, p === "/api/bestelling" ? "bestelling" : "inschrijving");
    }
    if (p === "/api/viva/webhook") return webhook(request, env);
    if (p === "/betaald" || p === "/betaald/") return terugUitViva(url, env);
    const ab = await aanbod(request, env, url);
    if (ab) return ab;
    if (p.startsWith("/api/")) return json({ ok: false, fout: "Onbekend adres." }, 404);
    return env.ASSETS.fetch(request);
  },
};
