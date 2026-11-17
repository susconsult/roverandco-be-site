// /beheer/producten en /beheer/activiteiten: producten en activiteiten beheren (alleen voor wie in /beheer mag).
// Gegevens in D1 (tabellen producten, activiteiten, media); de site toont ze meteen (src/aanbod.js).
// De bewerkschermen werken met verborgen JSON-velden die public/assets/js/beheer.js omzet naar knoppen en rijen.
import { pagina, esc } from "./beheer.js";
import { producten, activiteiten, product, activiteit, eur } from "./aanbod.js";

const nu = () => new Date().toISOString();
const slugify = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " en ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const code = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
const tekst = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const getal = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const geheel = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const naar = (pad) => new Response(null, { status: 303, headers: { location: pad, "cache-control": "no-store" } });
const leesJson = (v, standaard) => { try { const x = JSON.parse(v); return x ?? standaard; } catch { return standaard; } };

// Opgemaakte tekst uit de editor: alleen eenvoudige opmaak en links blijven over.
const TOEGELATEN = new Set(["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "h2", "h3", "a", "blockquote"]);
export function schoonHtml(h) {
  let s = String(h || "").slice(0, 60000);
  s = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/<\/?([a-zA-Z0-9]+)\b([^>]*)>/g, (tag, naam, attrs) => {
    naam = naam.toLowerCase();
    if (naam === "div") return tag.startsWith("</") ? "</p>" : "<p>";
    if (!TOEGELATEN.has(naam)) return "";
    if (tag.startsWith("</")) return `</${naam}>`;
    if (naam === "a") {
      const m = attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)')/i);
      const href = (m && (m[2] ?? m[3]) || "").trim();
      if (!/^(https?:\/\/|mailto:|\/)/i.test(href)) return "<a>";
      const extern = /^https?:\/\//i.test(href);
      return `<a href="${href.replace(/"/g, "&quot;")}"${extern ? ' rel="noopener"' : ""}>`;
    }
    return naam === "br" ? "<br>" : `<${naam}>`;
  });
  return s.replace(/<p>\s*(<br>)?\s*<\/p>/g, "").trim();
}

/* ---------------- opmaak ---------------- */

const STIJL = `<style>
.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px}.form-grid .breed{grid-column:1/-1}
.veld label{display:block;font-weight:600;font-size:13px;margin-bottom:4px}.veld input,.veld select,.veld textarea{width:100%}
.veld small{display:block;color:var(--m);font-size:12px;margin-top:3px}
.kaart h3{margin:0 0 8px;font-size:16px}.rij{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
.rij input[type=text],.rij input:not([type]){flex:1;min-width:90px}.rij input.smal,.rij .smal{width:90px;flex:none;min-width:0}
.groep{border:1px solid #e3ddcc;border-radius:10px;padding:12px;margin-bottom:10px;background:#fbfaf6}
.knop.klein{padding:5px 10px;font-size:13px}.knop.rood{background:#a32d2d;border-color:#a32d2d}.knop.grijs{background:#fff;color:var(--i);border-color:#ccc}
.fotos{display:flex;gap:10px;flex-wrap:wrap}.foto{width:120px;border:1px solid #ddd;border-radius:8px;overflow:hidden;background:#fff;font-size:12px}
.foto img{width:120px;height:90px;object-fit:cover;display:block}.foto .acties{display:flex;justify-content:space-between;padding:4px}
.foto button{background:none;border:0;color:var(--g);cursor:pointer;padding:2px 4px}.foto input{width:100%;border:0;border-top:1px solid #eee;border-radius:0;font-size:12px;padding:4px}
.editor-balk{display:flex;gap:4px;margin-bottom:4px}.editor-balk button{background:#fff;color:var(--i);border-color:#ccc;padding:4px 10px}
.editor{min-height:160px;border:1px solid #ccc;border-radius:8px;padding:10px 12px;background:#fff;line-height:1.55}.editor:focus{outline:2px solid var(--g)}
.lijst td img{width:56px;height:56px;object-fit:cover;border-radius:6px}.lijst td{vertical-align:middle}
.uit{opacity:.5}.melding{background:#dcefe2;color:#1F3B2A;border-radius:8px;padding:10px 14px;margin-bottom:12px}.melding.fout{background:#f7dede;color:#791f1f}
.foto-kies{display:flex;gap:10px;align-items:center}.foto-kies img{width:96px;height:64px;object-fit:cover;border-radius:6px;background:#eee}
.knoppen{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;position:sticky;bottom:0;background:#f6f4ee;padding:10px 0}
@media(max-width:700px){.form-grid{grid-template-columns:1fr}}
</style>`;

const tabs = (aan) => `<nav class="tabs"><a href="/beheer?soort=bestelling">Bestellingen</a><a href="/beheer?soort=inschrijving">Inschrijvingen</a>
  <a class="${aan === "p" ? "aan" : ""}" href="/beheer/producten">Producten</a><a class="${aan === "a" ? "aan" : ""}" href="/beheer/activiteiten">Activiteiten</a></nav>`;
const veld = (naam, label, waarde = "", { type = "text", hulp = "", breed = false, extra = "" } = {}) =>
  `<div class="veld${breed ? " breed" : ""}"><label for="v-${naam}">${label}</label><input id="v-${naam}" name="${naam}" type="${type}" value="${esc(waarde ?? "")}" ${extra}>${hulp ? `<small>${hulp}</small>` : ""}</div>`;
const vink = (naam, label, aan) => `<label class="rij"><input type="checkbox" name="${naam}" value="1"${aan ? " checked" : ""}> ${label}</label>`;
const editor = (naam, html) => `<div class="veld breed"><label>Omschrijving</label>
  <div class="editor-balk"><button type="button" data-cmd="bold"><b>B</b></button><button type="button" data-cmd="italic"><i>I</i></button><button type="button" data-cmd="insertUnorderedList">• Lijst</button><button type="button" data-cmd="formatBlock" data-arg="h3">Tussentitel</button><button type="button" data-cmd="createLink">Link</button></div>
  <div class="editor" contenteditable="true" data-editor="${naam}">${html || "<p></p>"}</div><textarea name="${naam}" hidden>${esc(html || "")}</textarea></div>`;
const fotoKiezer = (naam, label, waarde, hulp = "") => `<div class="veld"><label>${label}</label><div class="foto-kies" data-fotoveld="${naam}">
  <img src="${esc(waarde ? (String(waarde).startsWith("/") ? waarde : `/assets/img/${waarde}-s.webp`) : "")}" alt=""${waarde ? "" : " hidden"}>
  <input type="hidden" name="${naam}" value="${esc(waarde || "")}"><label class="knop klein">Foto kiezen<input type="file" accept="image/*" hidden></label>
  ${waarde ? '<button type="button" class="knop klein grijs" data-wis>Weg</button>' : ""}</div>${hulp ? `<small>${hulp}</small>` : ""}</div>`;
const script = `<script src="/assets/js/beheer.js?v=2" defer></script>`;

/* ---------------- producten ---------------- */

async function productLijst(env, email, url) {
  const lijst = await producten(env, { ookVerborgen: true });
  const m = url.searchParams.get("ok") ? `<div class="melding">Bewaard. De shop is meteen bijgewerkt.</div>` : url.searchParams.get("weg") ? `<div class="melding">Product verwijderd.</div>` : "";
  return pagina("Producten", `${STIJL}${tabs("p")}${m}
  <p><a class="knop" href="/beheer/producten/nieuw">+ Nieuw product</a> <a class="knop licht" href="/shop" target="_blank">Shop bekijken ↗</a></p>
  <table class="lijst"><thead><tr><th></th><th>Product</th><th>Prijs</th><th>Opties</th><th>In de shop</th></tr></thead><tbody>
  ${lijst.map((p) => `<tr class="${p.zichtbaar ? "" : "uit"}"><td>${p.fotos?.[0] ? `<img src="${esc(p.fotos[0].klein)}" alt="">` : ""}</td>
    <td><a href="/beheer/producten/${esc(p.slug)}">${esc(p.naam)}</a><br><small>${esc(p.categorie || "")}${p.lint ? " · " + esc(p.lint) : ""}</small></td>
    <td>${eur(p.prijs)}</td><td><small>${(p.opties || []).map((o) => esc(o.naam)).join(", ") || "–"}</small></td><td>${p.zichtbaar ? "Ja" : "Verborgen"}</td></tr>`).join("") || '<tr><td colspan="5">Nog geen producten.</td></tr>'}
  </tbody></table>`, email);
}

function productFormulier(p, email, fout = "") {
  const nieuw = !p.slug;
  return pagina(nieuw ? "Nieuw product" : p.naam, `${STIJL}${tabs("p")}
  <p><a href="/beheer/producten">← Alle producten</a>${nieuw ? "" : ` · <a href="/shop/${esc(p.slug)}" target="_blank">Bekijken in de shop ↗</a>`}</p>
  ${fout ? `<div class="melding fout">${esc(fout)}</div>` : ""}
  <form method="post" class="kaart" data-beheer-form>
    <h2>${nieuw ? "Nieuw product" : esc(p.naam)}</h2>
    <div class="form-grid">
      ${veld("naam", "Naam", p.naam, { extra: "required maxlength=120", breed: true })}
      ${veld("prijs", "Prijs (€)", p.prijs ?? "", { extra: 'required inputmode="decimal"' })}
      ${veld("slug", "Adres (/shop/…)", p.slug, { hulp: nieuw ? "Leeg laten: wordt gemaakt uit de naam." : "Liever niet wijzigen: oude links werken dan niet meer." })}
      ${veld("categorie", "Categorie", p.categorie, { hulp: "Bv. T-shirt, Mok, Sticker" })}
      ${veld("lint", "Label op de foto", p.lint, { hulp: "Bv. Bestseller, Nieuw. Leeg = geen label." })}
      ${veld("volgorde", "Volgorde in de shop", p.volgorde ?? 0, { type: "number", hulp: "Lager = eerder." })}
      <div class="veld">${vink("zichtbaar", "Zichtbaar in de shop", p.zichtbaar !== false)}</div>
    </div>
    <h3 style="margin-top:18px">Foto's</h3><p><small>De eerste foto is de hoofdfoto. Foto's worden automatisch verkleind.</small></p>
    <div data-fotolijst><input type="hidden" name="fotos" value="${esc(JSON.stringify(p.fotos || []))}"></div>
    <h3 style="margin-top:18px">Opties</h3><p><small>Bv. Maat of Kleur. Zet een waarde uit als ze tijdelijk niet beschikbaar is.</small></p>
    <div data-optielijst><input type="hidden" name="opties" value="${esc(JSON.stringify(p.opties || []))}"></div>
    ${editor("omschrijving", p.omschrijving)}
    <div class="knoppen"><button type="submit">Bewaren</button><a class="knop grijs" href="/beheer/producten">Annuleren</a>
      ${nieuw ? "" : `<button type="submit" name="actie" value="verwijder" class="knop rood" data-bevestig="${esc(p.naam)} definitief verwijderen? Verbergen kan ook.">Verwijderen</button>`}</div>
  </form>${script}`, email);
}

async function productBewaren(request, env, oud, email) {
  const f = await request.formData();
  if (oud && f.get("actie") === "verwijder") {
    await env.SHOP_DB.prepare("DELETE FROM producten WHERE slug = ?").bind(oud.slug).run();
    return naar("/beheer/producten?weg=1");
  }
  const opties = leesJson(f.get("opties"), []).filter((o) => o && tekst(o.naam, 40)).slice(0, 10).map((o) => ({
    naam: tekst(o.naam, 40), verplicht: !!o.verplicht,
    waarden: (o.waarden || []).filter((v) => v && tekst(v.waarde, 60)).slice(0, 60).map((v) => ({ waarde: tekst(v.waarde, 60), meerprijs: getal(v.meerprijs), standaard: !!v.standaard, uit: !!v.uit })),
  }));
  const fotos = leesJson(f.get("fotos"), []).filter((x) => x && /^\/(media|assets)\//.test(x.groot || "")).slice(0, 12)
    .map((x) => ({ klein: String(x.klein || x.groot), groot: String(x.groot), alt: tekst(x.alt, 150) }));
  const d = {
    naam: tekst(f.get("naam"), 120), prijs: getal(f.get("prijs")), categorie: tekst(f.get("categorie"), 60), lint: tekst(f.get("lint"), 30),
    opties, fotos, omschrijving: schoonHtml(f.get("omschrijving")),
  };
  const slug = slugify(tekst(f.get("slug"), 80) || d.naam);
  const terug = (fout) => productFormulier({ ...oud, ...d, slug: oud?.slug || "", zichtbaar: f.get("zichtbaar") === "1", volgorde: geheel(f.get("volgorde")) }, email, fout);
  if (!d.naam) return terug("Geef het product een naam.");
  if (!(d.prijs > 0)) return terug("Geef een prijs groter dan 0.");
  if (!slug) return terug("Het adres is leeg.");
  if (slug !== oud?.slug && await env.SHOP_DB.prepare("SELECT 1 FROM producten WHERE slug = ?").bind(slug).first()) return terug(`Er bestaat al een product met adres /shop/${slug}.`);
  if (oud && slug !== oud.slug) await env.SHOP_DB.prepare("DELETE FROM producten WHERE slug = ?").bind(oud.slug).run();
  await env.SHOP_DB.prepare(`INSERT INTO producten (slug, naam, data, zichtbaar, volgorde, bijgewerkt) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET naam = excluded.naam, data = excluded.data, zichtbaar = excluded.zichtbaar, volgorde = excluded.volgorde, bijgewerkt = excluded.bijgewerkt`)
    .bind(slug, d.naam, JSON.stringify(d), f.get("zichtbaar") === "1" ? 1 : 0, parseInt(f.get("volgorde"), 10) || 0, nu()).run();
  return naar("/beheer/producten?ok=1");
}

/* ---------------- activiteiten ---------------- */

async function activiteitLijst(env, email, url) {
  const lijst = await activiteiten(env);
  const m = url.searchParams.get("ok") ? `<div class="melding">Bewaard. De site is meteen bijgewerkt.</div>` : url.searchParams.get("weg") ? `<div class="melding">Activiteit verwijderd.</div>` : "";
  const v = new Date().toISOString().slice(0, 10);
  return pagina("Activiteiten", `${STIJL}${tabs("a")}${m}
  <p><a class="knop" href="/beheer/activiteiten/nieuw">+ Nieuwe activiteit</a> <a class="knop licht" href="/activiteiten" target="_blank">Activiteiten bekijken ↗</a></p>
  <table class="lijst"><thead><tr><th>Datum</th><th>Activiteit</th><th>Inschrijven</th><th>Op de site</th></tr></thead><tbody>
  ${lijst.map((a) => {
    const voorbij = a.datum && (a.einde || a.datum) < v;
    const ins = a.inschrijving?.open ? `Open${a.inschrijving.sluit ? " tot " + esc(a.inschrijving.sluit) : ""}` : a.inschrijven_url ? "Externe link" : "–";
    return `<tr class="${a.verborgen || voorbij ? "uit" : ""}"><td>${esc(a.datum_label || a.datum || "–")}</td><td><a href="/beheer/activiteiten/${esc(a.slug)}">${esc(a.titel)}</a><br><small>${esc(a.locatie || "")}</small></td>
      <td><small>${ins}</small></td><td>${a.verborgen ? "Verborgen" : voorbij ? "Voorbij" : "Ja"}</td></tr>`;
  }).join("") || '<tr><td colspan="4">Nog geen activiteiten.</td></tr>'}</tbody></table>`, email);
}

// "2027-05-28T18:00" (Brusselse tijd) -> "2027-05-28T18:00:00+02:00"
function brussel(lokaal) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(lokaal || "")) return "";
  const gok = new Date(lokaal + ":00Z");
  const delen = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", timeZoneName: "shortOffset" }).formatToParts(gok);
  const off = (delen.find((x) => x.type === "timeZoneName")?.value || "GMT+1").replace("GMT", "");
  const [u, mi = "00"] = off.replace("+", "").replace("-", "").split(":");
  return `${lokaal}:00${off.startsWith("-") ? "-" : "+"}${u.padStart(2, "0")}:${mi.padStart(2, "0")}`;
}
const lokaal = (iso) => (iso ? String(iso).slice(0, 16) : "");

const DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function datumTeksten(datum, einde) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum || "")) return { label: "", lang: "" };
  const d = new Date(datum + "T12:00:00Z"), dag = d.getUTCDay(), n = d.getUTCDate(), m = d.getUTCMonth(), j = d.getUTCFullYear();
  if (einde && einde > datum && /^\d{4}-\d{2}-\d{2}$/.test(einde)) {
    const e2 = new Date(einde + "T12:00:00Z");
    const zelfde = e2.getUTCMonth() === m;
    return {
      label: zelfde ? `${n}–${e2.getUTCDate()} ${KORT[m]}` : `${n} ${KORT[m]} – ${e2.getUTCDate()} ${KORT[e2.getUTCMonth()]}`,
      lang: `${DAGEN[dag]} ${n}${zelfde ? "" : " " + MAANDEN[m]} tot ${DAGEN[e2.getUTCDay()]} ${e2.getUTCDate()} ${MAANDEN[e2.getUTCMonth()]} ${e2.getUTCFullYear()}`,
    };
  }
  return { label: `${DAGEN[dag].slice(0, 2).replace(/^./, (c) => c.toUpperCase())} ${n} ${KORT[m]}`, lang: `${DAGEN[dag]} ${n} ${MAANDEN[m]} ${j}` };
}

function activiteitFormulier(a, email, fout = "") {
  const nieuw = !a.slug;
  const i = a.inschrijving || { open: false, onderdelen: [] };
  return pagina(nieuw ? "Nieuwe activiteit" : a.titel, `${STIJL}${tabs("a")}
  <p><a href="/beheer/activiteiten">← Alle activiteiten</a>${nieuw ? "" : ` · <a href="/activiteiten/${esc(a.slug)}" target="_blank">Bekijken op de site ↗</a>`}</p>
  ${fout ? `<div class="melding fout">${esc(fout)}</div>` : ""}
  <form method="post" data-beheer-form>
  <div class="kaart"><h2>${nieuw ? "Nieuwe activiteit" : esc(a.titel)}</h2>
    <div class="form-grid">
      ${veld("titel", "Titel", a.titel, { extra: "required maxlength=120", breed: true })}
      ${veld("datum", "Datum", a.datum, { type: "date" })}
      ${veld("einde", "Einddatum (meerdaags)", a.einde, { type: "date", hulp: "Leeg bij één dag." })}
      ${veld("datum_label", "Datum kort", a.datum_label, { hulp: "Bv. Zo 22 nov. Leeg = automatisch." })}
      ${veld("datum_lang", "Datum lang", a.datum_lang, { hulp: "Bv. zondag 22 november 2026. Leeg = automatisch." })}
      ${veld("locatie", "Locatie", a.locatie)}
      ${veld("uren", "Uur", a.uren, { hulp: "Bv. Vanaf 10:00" })}
      ${veld("kort", "Korte tekst", a.kort, { breed: true, extra: "maxlength=300", hulp: "Op de kaartjes en bovenaan de pagina." })}
      <div class="veld breed"><label for="v-kenmerken">Kenmerken</label><textarea id="v-kenmerken" name="kenmerken" rows="3">${esc((a.kenmerken || []).join("\n"))}</textarea><small>Eén per lijn, bv. "Roadbook €15 per wagen". Staan als labels op de kaartjes.</small></div>
      ${veld("slug", "Adres (/activiteiten/…)", a.slug, { hulp: nieuw ? "Leeg laten: wordt gemaakt uit de titel." : "Liever niet wijzigen: oude links werken dan niet meer." })}
      <div class="veld">${vink("zichtbaar", "Zichtbaar op de site", !a.verborgen)}<small>Verborgen = niet in lijsten, pagina blijft bereikbaar via de link (handig om te testen).</small></div>
    </div>
    ${editor("omschrijving_html", a.omschrijving_html)}
  </div>
  <div class="kaart"><h3>Foto's</h3>
    <div class="form-grid">
      ${fotoKiezer("foto", "Hoofdfoto (kaartjes en banner)", a.foto)}
      ${veld("foto_alt", "Wat staat er op de hoofdfoto?", a.foto_alt, { hulp: "Voor blinden en Google." })}
      ${fotoKiezer("banner_foto", "Andere bannerfoto (optioneel)", a.banner_foto)}
      ${fotoKiezer("affiche", "Affiche (optioneel)", a.affiche, "Staat naast 'In het kort'; klik = groot.")}
      ${veld("foto_credit", "Fotocredit (optioneel)", a.foto_credit, { hulp: "Bv. lid Rover & Co" })}
      <div class="veld">${vink("banner_groen", "Groene waas over de banner", !!a.banner_groen)}</div>
      ${veld("fotos_titel", "Titel fotogalerij", a.fotos_titel, { breed: true })}
    </div>
    <p><small>Fotogalerij onderaan de pagina:</small></p>
    <div data-galerij><input type="hidden" name="fotos" value="${esc(JSON.stringify(a.fotos || []))}"></div>
  </div>
  <div class="kaart"><h3>Inschrijven</h3>
    ${vink("ins_open", "Inschrijven via deze site staat open", !!i.open)}
    <div class="form-grid">
      ${veld("ins_sluit", "Inschrijven sluit op", i.sluit, { type: "date", hulp: "Leeg = tot de dag zelf." })}
      <div class="veld">${vink("ins_wagen", "Vraag met welke Land Rover ze komen", !!i.wagen)}</div>
    </div>
    <p><small>Onderdelen: wat kan je kiezen? Prijs 0 = gratis. "Volzet bij" is een harde grens over alle inschrijvingen; "Mail mij bij" stuurt jou een melding.</small></p>
    <div data-onderdelen><input type="hidden" name="onderdelen" value="${esc(JSON.stringify(i.onderdelen || []))}"></div>
    <div class="form-grid" style="margin-top:10px">
      ${veld("ts_onderdeel", "Tijdsloten voor onderdeel (code)", i.tijdsloten?.onderdeel, { hulp: "Optioneel. De code van het onderdeel, bv. toren." })}
      ${veld("ts_max", "Max. personen per tijdslot", i.tijdsloten?.max_per_slot || "", { type: "number" })}
      ${veld("ts_slots", "Tijdsloten", (i.tijdsloten?.slots || []).join(", "), { breed: true, hulp: "Gescheiden door komma's, bv. 10:00, 10:20, 10:40" })}
    </div>
    <p><small>Of: inschrijven via een andere site (bv. de oude Ecwid-shop)</small></p>
    <div class="form-grid">${veld("inschrijven_url", "Link naar inschrijven elders", a.inschrijven_url, { type: "url" })}${veld("inschrijven_label", "Tekst op die knop", a.inschrijven_label)}</div>
  </div>
  <div class="kaart"><h3>Extra</h3>
    <div class="form-grid">
      ${veld("aftellen_start", "Aftellen tot (start)", lokaal(a.aftellen?.start), { type: "datetime-local", hulp: "Toont een aftelklok onder de banner. Leeg = geen." })}
      ${veld("aftellen_einde", "Einde activiteit", lokaal(a.aftellen?.einde), { type: "datetime-local" })}
      ${veld("extern_url", "Hele activiteit staat op een andere site", a.extern_url, { type: "url", breed: true, hulp: "Leeg laten tenzij de kaartjes moeten doorlinken naar een andere site." })}
      ${veld("kalender_soort", "Soort in de kalender", a.kalender_soort || "club", { hulp: "club, 4x4, beurs, overland. Meerdere mag, met komma's (bv. club,overland)." })}
      ${veld("foto_pos", "Uitsnede hoofdfoto", a.foto_pos, { hulp: "Bv. 50% 70% (horizontaal verticaal)" })}
      ${veld("banner_pos", "Uitsnede banner", a.banner_pos)}
    </div>
  </div>
  <div class="knoppen"><button type="submit">Bewaren</button><a class="knop grijs" href="/beheer/activiteiten">Annuleren</a>
    ${nieuw ? "" : `<button type="submit" name="actie" value="verwijder" class="knop rood" data-bevestig="${esc(a.titel)} definitief verwijderen? Verbergen kan ook. Inschrijvingen blijven bewaard.">Verwijderen</button>`}</div>
  </form>${script}`, email);
}

async function activiteitBewaren(request, env, oud, email) {
  const f = await request.formData();
  if (oud && f.get("actie") === "verwijder") {
    await env.SHOP_DB.prepare("DELETE FROM activiteiten WHERE slug = ?").bind(oud.slug).run();
    return naar("/beheer/activiteiten?weg=1");
  }
  const g = (k, max = 300) => tekst(f.get(k), max);
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(g("datum")) ? g("datum") : "";
  const einde = /^\d{4}-\d{2}-\d{2}$/.test(g("einde")) && g("einde") > datum ? g("einde") : "";
  const auto = datumTeksten(datum, einde);
  const ids = new Set();
  const onderdelen = leesJson(f.get("onderdelen"), []).filter((o) => o && tekst(o.naam, 80)).slice(0, 20).map((o) => {
    let id = code(o.id) || slugify(o.naam).slice(0, 30) || "onderdeel";
    while (ids.has(id)) id += "-2";
    ids.add(id);
    const x = { id, naam: tekst(o.naam, 80), prijs: getal(o.prijs), per: ["persoon", "wagen", "stuk"].includes(o.per) ? o.per : "persoon", max: geheel(o.max) || 20 };
    if (geheel(o.capaciteit)) x.capaciteit = geheel(o.capaciteit);
    if (geheel(o.melding_vanaf)) x.melding_vanaf = geheel(o.melding_vanaf);
    if (o.beperkt) x.beperkt = true;
    if (tekst(o.uitleg)) x.uitleg = tekst(o.uitleg, 200);
    return x;
  });
  const slots = g("ts_slots", 2000).split(/[,\n]+/).map((x) => x.trim()).filter(Boolean).slice(0, 60);
  const inschrijving = { open: f.get("ins_open") === "1", sluit: /^\d{4}-\d{2}-\d{2}$/.test(g("ins_sluit")) ? g("ins_sluit") : "", wagen: f.get("ins_wagen") === "1", onderdelen };
  if (g("ts_onderdeel") && slots.length) inschrijving.tijdsloten = { onderdeel: code(g("ts_onderdeel")), slots, max_per_slot: geheel(f.get("ts_max")) || 0 };
  const foto = (k) => { const v = g(k, 200); return /^(\/(media|assets)\/[\w./-]+|[\w-]+)$/.test(v) ? v : ""; };
  const galerij = leesJson(f.get("fotos"), []).filter((x) => Array.isArray(x) && /^(\/(media|assets)\/[\w./-]+|[\w-]+)$/.test(String(x[0]))).slice(0, 40).map((x) => [String(x[0]), tekst(x[1], 150)]);
  const d = {
    ...(oud ? Object.fromEntries(Object.entries(oud).filter(([k]) => !["slug", "verborgen"].includes(k))) : {}),
    titel: g("titel", 120), datum, einde, datum_label: g("datum_label", 40) || auto.label, datum_lang: g("datum_lang", 80) || auto.lang,
    locatie: g("locatie", 120), uren: g("uren", 80), kort: g("kort", 300), kenmerken: g("kenmerken", 2000).split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 8),
    omschrijving_html: schoonHtml(f.get("omschrijving_html")),
    foto: foto("foto"), foto_alt: g("foto_alt", 150), banner_foto: foto("banner_foto"), affiche: foto("affiche"), foto_credit: g("foto_credit", 100),
    banner_groen: f.get("banner_groen") === "1", fotos: galerij, fotos_titel: g("fotos_titel", 100),
    foto_pos: g("foto_pos", 20), banner_pos: g("banner_pos", 20), extern_url: /^https?:\/\//.test(g("extern_url", 300)) ? g("extern_url", 300) : "",
    inschrijven_url: /^https?:\/\//.test(g("inschrijven_url", 300)) ? g("inschrijven_url", 300) : "", inschrijven_label: g("inschrijven_label", 40),
    inschrijving,
    kalender_soort: g("kalender_soort", 60).toLowerCase().split(/[\s,]+/).filter((x) => ["club", "4x4", "beurs", "overland"].includes(x)).join(",") || "club",
  };
  const as = brussel(g("aftellen_start", 20)), ae = brussel(g("aftellen_einde", 20));
  if (as) d.aftellen = { start: as, einde: ae || as }; else delete d.aftellen;
  for (const k of ["banner_foto", "affiche", "foto_credit", "fotos_titel", "foto_pos", "banner_pos", "extern_url", "einde"]) if (!d[k]) delete d[k];
  if (!d.fotos.length) delete d.fotos;
  const slug = slugify(g("slug", 80) || d.titel);
  const zichtbaar = f.get("zichtbaar") === "1";
  const terug = (fout) => activiteitFormulier({ ...d, slug: oud?.slug || "", verborgen: !zichtbaar }, email, fout);
  if (!d.titel) return terug("Geef de activiteit een titel.");
  if (!slug) return terug("Het adres is leeg.");
  if (inschrijving.open && !onderdelen.length) return terug("Inschrijven staat open, maar er zijn geen onderdelen. Voeg minstens één onderdeel toe.");
  if (inschrijving.tijdsloten && !onderdelen.some((o) => o.id === inschrijving.tijdsloten.onderdeel)) return terug(`De tijdsloten horen bij onderdeel "${inschrijving.tijdsloten.onderdeel}", maar dat bestaat niet. Gebruik de code van een onderdeel.`);
  if (slug !== oud?.slug && await env.SHOP_DB.prepare("SELECT 1 FROM activiteiten WHERE slug = ?").bind(slug).first()) return terug(`Er bestaat al een activiteit met adres /activiteiten/${slug}.`);
  if (oud && slug !== oud.slug) await env.SHOP_DB.prepare("DELETE FROM activiteiten WHERE slug = ?").bind(oud.slug).run();
  await env.SHOP_DB.prepare(`INSERT INTO activiteiten (slug, titel, datum, data, zichtbaar, volgorde, bijgewerkt) VALUES (?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(slug) DO UPDATE SET titel = excluded.titel, datum = excluded.datum, data = excluded.data, zichtbaar = excluded.zichtbaar, bijgewerkt = excluded.bijgewerkt`)
    .bind(slug, d.titel, d.datum, JSON.stringify(d), zichtbaar ? 1 : 0, nu()).run();
  return naar("/beheer/activiteiten?ok=1");
}

/* ---------------- media ---------------- */

async function mediaOpladen(request, env) {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!["image/jpeg", "image/webp", "image/png"].includes(type)) return json({ ok: false, fout: "Alleen foto's (JPG, PNG of WebP)." }, 415);
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > 1_900_000) return json({ ok: false, fout: "Deze foto is te groot." }, 413);
  const r = await env.SHOP_DB.prepare("INSERT INTO media (type, data, grootte, naam, aangemaakt) VALUES (?, ?, ?, ?, ?)")
    .bind(type, data, data.byteLength, tekst(request.headers.get("x-bestandsnaam"), 120), nu()).run();
  return json({ ok: true, id: r.meta.last_row_id, url: `/media/${r.meta.last_row_id}` });
}

/* ---------------- router ---------------- */

export async function beheerAanbod(request, env, url, email) {
  const p = url.pathname.replace(/\/$/, "");
  const post = request.method === "POST";
  let m;
  if (p === "/beheer/media" && post) return mediaOpladen(request, env);
  if (p === "/beheer/producten") return productLijst(env, email, url);
  if (p === "/beheer/producten/nieuw") return post ? productBewaren(request, env, null, email) : productFormulier({}, email);
  if ((m = p.match(/^\/beheer\/producten\/([a-z0-9-]{1,80})$/))) {
    const x = await product(env, m[1]);
    if (!x) return naar("/beheer/producten");
    return post ? productBewaren(request, env, x, email) : productFormulier(x, email);
  }
  if (p === "/beheer/activiteiten") return activiteitLijst(env, email, url);
  if (p === "/beheer/activiteiten/nieuw") return post ? activiteitBewaren(request, env, null, email) : activiteitFormulier({ inschrijving: { open: false, onderdelen: [] } }, email);
  if ((m = p.match(/^\/beheer\/activiteiten\/([a-z0-9-]{1,80})$/))) {
    const x = await activiteit(env, m[1]);
    if (!x) return naar("/beheer/activiteiten");
    return post ? activiteitBewaren(request, env, x, email) : activiteitFormulier(x, email);
  }
  return null;
}
