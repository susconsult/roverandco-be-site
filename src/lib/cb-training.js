import { Buffer } from "node:buffer";
// CB-kanaal 40: privé NATO-training. Geen berichten, alleen oefenen zoals Duolingo:
// tikken, kiezen of spreken met PTT (spraak naar tekst in de browser). Scores, dagreeks en ranglijst in D1.
import { esc } from "./sjabloon.js";
import { log } from "./log.js";

export const TRAINING = 40;
export const TRAINING_KANAAL = [TRAINING, "NATO-training", "Privé: alleen jij hoort jezelf. Oefen het NATO-alfabet zoals op de radio."];

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const dagVan = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const plusDagen = (dag, n) => { const d = new Date(dag + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const maandag = (dag) => { const w = new Date(dag + "T12:00:00Z").getUTCDay(); return plusDagen(dag, -((w + 6) % 7)); };

let klaar = false;
export async function zorgTraining(env) {
  if (klaar) return;
  const db = env.SHOP_DB;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS nato_score (lid_id INTEGER PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, reeks INTEGER NOT NULL DEFAULT 0, langste INTEGER NOT NULL DEFAULT 0, laatste_dag TEXT, sessies INTEGER NOT NULL DEFAULT 0, juist INTEGER NOT NULL DEFAULT 0, totaal INTEGER NOT NULL DEFAULT 0, bijgewerkt TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS nato_dagen (lid_id INTEGER NOT NULL, dag TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (lid_id, dag))"),
    // Kanaal 40 is vast en privé. Had een lid het als eigen kanaal geopend, dan wordt het nu de training.
    db.prepare("INSERT INTO cb_kanalen (nr, naam, omschrijving, lid_id, vast, aangemaakt) VALUES (?, ?, ?, NULL, 1, ?) ON CONFLICT (nr) DO UPDATE SET naam = excluded.naam, omschrijving = excluded.omschrijving, lid_id = NULL, vast = 1").bind(...TRAINING_KANAAL, new Date().toISOString()),
    db.prepare("DELETE FROM cb_berichten WHERE nr = ?").bind(TRAINING),
  ]);
  // Levels (26 nov 2026): niveau 1-5 en de laatste antwoorden op dat niveau ("1101…", hoogstens 10).
  for (const kol of ["niveau INTEGER NOT NULL DEFAULT 1", "venster TEXT NOT NULL DEFAULT ''"]) {
    try { await db.prepare(`ALTER TABLE nato_score ADD COLUMN ${kol}`).run(); } catch { /* bestaat al */ }
  }
  klaar = true;
}

async function mijnScore(env, lid) {
  const s = await env.SHOP_DB.prepare("SELECT * FROM nato_score WHERE lid_id = ?").bind(lid.id).first();
  const vandaag = dagVan();
  const reeks = s && (s.laatste_dag === vandaag || s.laatste_dag === plusDagen(vandaag, -1)) ? s.reeks : 0;
  const week = (await env.SHOP_DB.prepare("SELECT COALESCE(SUM(xp), 0) n FROM nato_dagen WHERE lid_id = ? AND dag >= ?").bind(lid.id, maandag(vandaag)).first()).n;
  return { niveau: s?.niveau || 1, venster: s?.venster || "", xp: s?.xp || 0, week, reeks, langste: s?.langste || 0, sessies: s?.sessies || 0, juist: s?.juist || 0, totaal: s?.totaal || 0, vandaag: s?.laatste_dag === vandaag };
}

async function ranglijst(env, lid) {
  const actief = "l.geblokkeerd = 0 AND l.verwijderd_op IS NULL AND l.gebruikersnaam IS NOT NULL";
  const week = (await env.SHOP_DB.prepare(`SELECT l.id, l.gebruikersnaam naam, SUM(d.xp) xp, (SELECT niveau FROM nato_score s WHERE s.lid_id = l.id) niveau FROM nato_dagen d JOIN leden l ON l.id = d.lid_id WHERE d.dag >= ? AND ${actief} GROUP BY l.id HAVING xp > 0 ORDER BY xp DESC, MIN(d.dag) LIMIT 10`).bind(maandag(dagVan())).all()).results || [];
  const altijd = (await env.SHOP_DB.prepare(`SELECT l.id, l.gebruikersnaam naam, s.xp, s.langste, s.niveau FROM nato_score s JOIN leden l ON l.id = s.lid_id WHERE s.xp > 0 AND ${actief} ORDER BY s.xp DESC, s.bijgewerkt LIMIT 10`).all()).results || [];
  const zet = (r) => r.map((x, i) => ({ plaats: i + 1, naam: x.naam, xp: x.xp, niveau: x.niveau || 1, ik: x.id === lid.id }));
  return { week: zet(week), altijd: zet(altijd) };
}

async function stand(env, lid) {
  return { ok: true, mijn: await mijnScore(env, lid), ...(await ranglijst(env, lid)) };
}

// Na elk antwoord in het gesprek. 10 XP per juist antwoord. Level omhoog bij 8 juist op de laatste 10 vragen van je level.
export const MAX_NIVEAU = 5;
const laatsteAntwoord = new Map();
async function antwoord(request, env, lid) {
  let d = {}; try { d = await request.json(); } catch { /* leeg */ }
  const juist = d.juist === true, vraagNiveau = Math.round(Number(d.niveau)) || 1;
  if (Date.now() - (laatsteAntwoord.get(lid.id) || 0) < 800) return json({ ok: false, fout: "Rustig aan." }, 429);
  laatsteAntwoord.set(lid.id, Date.now());
  const oud = await env.SHOP_DB.prepare("SELECT * FROM nato_score WHERE lid_id = ?").bind(lid.id).first();
  const vandaag = dagVan(), t = new Date().toISOString();
  const reeks = oud?.laatste_dag === vandaag ? oud.reeks : oud?.laatste_dag === plusDagen(vandaag, -1) ? oud.reeks + 1 : 1;
  let niveau = oud?.niveau || 1, venster = oud?.venster || "", omhoog = false;
  if (vraagNiveau === niveau) {
    venster = (venster + (juist ? "1" : "0")).slice(-10);
    if (niveau < MAX_NIVEAU && venster.length >= 10 && [...venster].filter((x) => x === "1").length >= 8) { niveau++; venster = ""; omhoog = true; }
  }
  const xp = juist ? 10 : 0;
  await env.SHOP_DB.batch([
    env.SHOP_DB.prepare(`INSERT INTO nato_score (lid_id, xp, reeks, langste, laatste_dag, sessies, juist, totaal, bijgewerkt, niveau, venster) VALUES (?1, ?2, ?3, ?3, ?4, 0, ?5, 1, ?6, ?7, ?8)
      ON CONFLICT (lid_id) DO UPDATE SET xp = xp + ?2, reeks = ?3, langste = MAX(langste, ?3), laatste_dag = ?4, juist = juist + ?5, totaal = totaal + 1, bijgewerkt = ?6, niveau = ?7, venster = ?8`).bind(lid.id, xp, reeks, vandaag, juist ? 1 : 0, t, niveau, venster),
    env.SHOP_DB.prepare("INSERT INTO nato_dagen (lid_id, dag, xp) VALUES (?1, ?2, ?3) ON CONFLICT (lid_id, dag) DO UPDATE SET xp = xp + ?3").bind(lid.id, vandaag, xp),
  ]);
  if (!oud) await log(env, lid.id, "cb", "Begonnen met de NATO-training op CB-kanaal 40", "/cb/40");
  if (omhoog) await log(env, lid.id, "cb", `NATO-training: level ${niveau} gehaald`, "/cb/40");
  return json({ ...(await stand(env, lid)), omhoog });
}

// (Oud) na elke les: aantal juist bij de eerste poging. 10 XP per juist antwoord, 20 extra voor een foutloze les.
async function sessie(request, env, lid) {
  let d = {}; try { d = await request.json(); } catch { /* leeg */ }
  const totaal = Math.round(Number(d.totaal)), juist = Math.round(Number(d.juist));
  if (!(totaal >= 5 && totaal <= 15 && juist >= 0 && juist <= totaal)) return json({ ok: false, fout: "Ongeldige les." }, 400);
  const oud = await env.SHOP_DB.prepare("SELECT * FROM nato_score WHERE lid_id = ?").bind(lid.id).first();
  if (oud?.bijgewerkt && Date.now() - Date.parse(oud.bijgewerkt) < 20_000) return json({ ok: false, fout: "Die les was wel heel snel. Probeer opnieuw." }, 429);
  const xp = juist * 10 + (juist === totaal ? 20 : 0);
  const vandaag = dagVan(), t = new Date().toISOString();
  const reeks = oud?.laatste_dag === vandaag ? oud.reeks : oud?.laatste_dag === plusDagen(vandaag, -1) ? oud.reeks + 1 : 1;
  await env.SHOP_DB.batch([
    env.SHOP_DB.prepare(`INSERT INTO nato_score (lid_id, xp, reeks, langste, laatste_dag, sessies, juist, totaal, bijgewerkt) VALUES (?1, ?2, ?3, ?3, ?4, 1, ?5, ?6, ?7)
      ON CONFLICT (lid_id) DO UPDATE SET xp = xp + ?2, reeks = ?3, langste = MAX(langste, ?3), laatste_dag = ?4, sessies = sessies + 1, juist = juist + ?5, totaal = totaal + ?6, bijgewerkt = ?7`).bind(lid.id, xp, reeks, vandaag, juist, totaal, t),
    env.SHOP_DB.prepare("INSERT INTO nato_dagen (lid_id, dag, xp) VALUES (?1, ?2, ?3) ON CONFLICT (lid_id, dag) DO UPDATE SET xp = xp + ?3").bind(lid.id, vandaag, xp),
  ]);
  if (!oud) await log(env, lid.id, "cb", "Eerste NATO-training gedaan op CB-kanaal 40", "/cb/40");
  return json({ ...(await stand(env, lid)), verdiend: xp });
}

// Spraak naar tekst met Whisper op Cloudflare Workers AI (binding AI). De opname wordt niet bewaard.
const AUDIO = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/wav", "audio/x-m4a"];
const PROMPT = "NATO phonetic alphabet on the radio: Alfa, Bravo, Charlie, Delta, Echo, Foxtrot, Golf, Hotel, India, Juliett, Kilo, Lima, Mike, November, Oscar, Papa, Quebec, Romeo, Sierra, Tango, Uniform, Victor, Whiskey, X-ray, Yankee, Zulu. Figures one, two, tree, fower, fife, six, seven, eight, niner, zero. I spell. Rover Convoy, this is Rover two seven, say again, wilco, roger, over.";
const laatsteSpraak = new Map();
async function spraak(request, env, lid) {
  if (!env.AI) return json({ ok: false, fout: "Spraak staat nog niet aan op de server. Typ je antwoord." }, 501);
  const type = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!AUDIO.includes(type)) return json({ ok: false, fout: "Dit soort opname wordt niet ondersteund. Typ je antwoord." }, 415);
  const data = await request.arrayBuffer();
  if (data.byteLength < 500) return json({ ok: true, tekst: "" });
  if (data.byteLength > 600_000) return json({ ok: false, fout: "De opname is te lang. Hou het kort." }, 413);
  if (Date.now() - (laatsteSpraak.get(lid.id) || 0) < 1000) return json({ ok: false, fout: "Rustig aan, probeer opnieuw." }, 429);
  laatsteSpraak.set(lid.id, Date.now());
  try {
    const r = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: Buffer.from(data).toString("base64"), language: "en", vad_filter: true, initial_prompt: PROMPT });
    let tekst = String(r?.text || "").replace(/\s+/g, " ").trim();
    if (tekst.length > 300 || /phonetic alphabet/i.test(tekst)) tekst = ""; // Whisper herhaalt soms de prompt bij stilte
    return json({ ok: true, tekst });
  } catch (e) {
    console.log("whisper fout", e?.message || e);
    return json({ ok: false, fout: "Omzetten lukte niet. Probeer opnieuw of typ je antwoord." }, 502);
  }
}

export async function trainingApi(request, env, url, lid, pad) {
  await zorgTraining(env);
  if (pad === "stand" && request.method === "GET") return json(await stand(env, lid));
  if (pad === "sessie" && request.method === "POST") return sessie(request, env, lid);
  if (pad === "antwoord" && request.method === "POST") return antwoord(request, env, lid);
  if (pad === "spraak" && request.method === "POST") return spraak(request, env, lid);
  return json({ ok: false, fout: "Kanaal 40 is privé: hier kan je alleen oefenen." }, 403);
}

// Het scherm van de radio op kanaal 40. Alles daarbinnen bouwt /assets/js/cb-training.js op.
export async function trainingScherm(env, lid) {
  await zorgTraining(env);
  const s = await stand(env, lid);
  return `<p class="cb-oms">${esc(TRAINING_KANAAL[2])}</p>
    <div class="cb-log" id="nt-log" aria-live="polite"></div>
    <form class="cb-zend" id="nt-zend" autocomplete="off">
      <div class="nt-veld"><input id="nt-tekst" maxlength="200" placeholder="Jouw antwoord…" aria-label="Jouw antwoord"><span class="nt-lv" id="nt-lv" title="Jouw level">★ L${s.mijn.niveau}</span></div>
      <button class="cb-ptt" type="submit" id="nt-ptt" aria-label="Zenden. Houd ingedrukt om te praten."><span>PTT</span><small>Zenden</small></button>
    </form>
    <p class="cb-hint" id="nt-hint">Typ en druk op PTT, of <b>houd PTT ingedrukt</b> en spreek in het Engels.</p>
    <details class="nt-meer"><summary>Ranglijst en spiekbriefje</summary><div id="nt-meer"></div></details>
    <script type="application/json" id="nt-data">${JSON.stringify({ ...s, naam: lid.gebruikersnaam || "" }).replace(/</g, "\\u003c")}</script>
    <script src="/assets/js/cb-training.js?v=2" defer></script>`;
}
