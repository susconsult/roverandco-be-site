// Worker voor roverandco.be
// - /api/bestelling: controleert een bestelling (prijzen opnieuw berekend uit src/catalogus.json)
//   en stuurt ze door naar de Google Sheet (Apps Script web-app, adres in variabele APPS_SCRIPT_URL).
// - Alle andere adressen: statische bestanden uit public/.
import catalogus from "./catalogus.json";

const VERZENDKOST = 7.5;
const GRATIS_VERZENDING_VANAF = 100;
const TESTMODUS = true; // zolang Viva niet gekoppeld is: alle bestellingen zijn testbestellingen

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

const r2 = (n) => Math.round(n * 100) / 100;
const tekst = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

function bestelnummer() {
  const d = new Date();
  const datum = d.toISOString().slice(2, 10).replace(/-/g, "");
  const rnd = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(5, "0").slice(0, 5);
  return `RC-${datum}-${rnd}`;
}

function controleer(b) {
  const fouten = [];
  if (b.website) return { spam: true }; // onzichtbaar veld ingevuld = bot
  const k = b.klant || {};
  const klant = { naam: tekst(k.naam, 120), email: tekst(k.email, 160).toLowerCase(), telefoon: tekst(k.telefoon, 40) };
  if (klant.naam.length < 2) fouten.push("naam");
  if (!emailOk(klant.email)) fouten.push("email");
  if (klant.telefoon.replace(/\D/g, "").length < 8) fouten.push("telefoon");

  // artikels: prijs opnieuw berekenen, nooit de prijs uit de browser vertrouwen
  const artikels = [];
  for (const a of Array.isArray(b.artikels) ? b.artikels.slice(0, 50) : []) {
    const p = catalogus[a.id];
    const aantal = Math.min(50, Math.max(1, parseInt(a.aantal, 10) || 0));
    if (!p) { fouten.push("artikel"); continue; }
    let prijs = p.prijs;
    const keuzes = {};
    for (const o of p.opties) {
      const gekozen = a.keuzes?.[o.naam];
      const w = o.waarden.find((x) => x.waarde === gekozen);
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
  const totaal = r2(subtotaal + verzending + donatie);

  return { fouten, bestelling: { klant, artikels, levering, subtotaal, verzending, donatie, donatie_type: tekst(d.type, 10), totaal, opmerking: tekst(b.opmerking, 1000) } };
}

async function plaatsBestelling(request, env) {
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, fout: "Ongeldige aanvraag." }, 400); }
  const res = controleer(b);
  if (res.spam) return json({ ok: true, bestelnummer: "RC-OK" }); // bot geen hint geven
  if (res.fouten.length) return json({ ok: false, fout: "Controleer je gegevens.", velden: res.fouten }, 422);
  if (!env.APPS_SCRIPT_URL) return json({ ok: false, fout: "Bestellen is nog niet gekoppeld. Probeer later opnieuw." }, 503);

  const nr = /^RC-\d{6}-[A-Z0-9]{5}$/.test(b.bestelnummer || "") ? b.bestelnummer : bestelnummer(); // zelfde nummer bij opnieuw proberen = geen dubbel
  const payload = { ...res.bestelling, bestelnummer: nr, test: TESTMODUS, besteld_op: new Date().toISOString() };
  try {
    const r = await fetch(env.APPS_SCRIPT_URL, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(payload), redirect: "follow" });
    const antwoord = await r.json().catch(() => null);
    // Apps Script geeft ook bij een fout status 200: alleen een expliciete bevestiging telt
    if (antwoord && antwoord.ok === true && antwoord.bestelnummer === nr) {
      return json({ ok: true, bestelnummer: nr, totaal: payload.totaal, test: TESTMODUS });
    }
    return json({ ok: false, fout: "Je bestelling kon niet bewaard worden. Probeer opnieuw." }, 502);
  } catch {
    return json({ ok: false, fout: "Je bestelling kon niet bewaard worden. Probeer opnieuw." }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/bestelling") {
      if (request.method !== "POST") return json({ ok: false, fout: "Alleen POST." }, 405);
      return plaatsBestelling(request, env);
    }
    if (url.pathname.startsWith("/api/")) return json({ ok: false, fout: "Onbekend adres." }, 404);
    return env.ASSETS.fetch(request);
  },
};
