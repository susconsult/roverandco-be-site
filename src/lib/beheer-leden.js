// /beheer/leden: leden zoeken, bekijken en beheren, plus de activiteitenlog (90 dagen).
import { esc, pagina } from "./beheer.js";
import { stuurWachtwoordLink, stuurBevestiging } from "./leden.js";
import { log, opruimen, LOG_DAGEN } from "./log.js";
import { anonimiseer } from "./anoniem.js";

const naar = (pad) => new Response(null, { status: 303, headers: { location: pad, "cache-control": "no-store" } });
const nu = () => new Date().toISOString();
const dag = (iso) => iso ? new Date(iso).toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Brussels" }) : "–";
const tijd = (iso) => iso ? new Date(iso).toLocaleString("nl-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }) : "–";
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 160;
const naamOk = (n) => /^[A-Za-z0-9._-]{3,20}$/.test(n);
const tekst = (v, max) => String(v ?? "").trim().slice(0, max);

export const hoofdTabs = (aan) => `<!--aan:${aan}-->`;

const STIJL = `<style>
.lid-kop{display:flex;align-items:center;gap:14px;margin-bottom:14px}.lid-kop img,.lid-kop .av{width:56px;height:56px;border-radius:50%;object-fit:cover;background:var(--z);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px}
.lid-naam{font-size:20px;font-weight:700}.lid-kop small{color:var(--m)}
.acties{display:flex;gap:8px;flex-wrap:wrap}.acties form{margin:0}.knop.rood,button.rood{background:#fff;color:#a32d2d;border-color:#e2b4b4}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px}.form-grid label{display:block;font-size:13px;color:var(--m);margin-bottom:4px}.form-grid input{width:100%}
.log li{display:grid;grid-template-columns:120px 76px 1fr;align-items:start;gap:10px;padding:7px 0;border-bottom:1px solid #eee;font-size:14px}.log{list-style:none;margin:0;padding:0}.log time{color:var(--m)}
.soort{font-size:12px;font-weight:600;padding:1px 7px;border-radius:99px;background:#eee;justify-self:start}.s-account{background:#e6e6f6;color:#3c3489}.s-forum,.s-cb{background:#dcefe2;color:#1F3B2A}.s-garage,.s-profiel{background:#fbefd5;color:#7a5200}.s-beheer{background:#f7dede;color:#791f1f}
.wagens{display:flex;gap:10px;flex-wrap:wrap}.wagens figure{margin:0;width:150px;font-size:13px}.wagens img{width:150px;height:100px;object-fit:cover;border-radius:8px;display:block;margin-bottom:4px}
.melding-ok{background:#dcefe2;padding:10px 14px;border-radius:8px;margin-bottom:12px}.melding-fout{background:#f7dede;padding:10px 14px;border-radius:8px;margin-bottom:12px}
@media(max-width:700px){.form-grid{grid-template-columns:1fr}.log li{grid-template-columns:auto 1fr;gap:4px 10px}.log li>span:last-child{grid-column:1/-1}}
</style>`;

function status(l) {
  if (l.verwijderd_op) return `<span class="badge">Verwijderd</span>`;
  if (l.geblokkeerd) return `<span class="badge b-fout">Geblokkeerd</span>`;
  if (!l.wachtwoord) return `<span class="badge b-wacht">Via bestelling</span>`;
  if (!l.bevestigd_op) return `<span class="badge b-wacht">Niet bevestigd</span>`;
  return `<span class="badge b-betaald">Actief</span>${l.kassa ? ' <span class="badge">Kassa</span>' : ""}`;
}

const FILTERS = {
  alle: "verwijderd_op IS NULL",
  actief: "verwijderd_op IS NULL AND geblokkeerd = 0 AND bevestigd_op IS NOT NULL AND wachtwoord IS NOT NULL",
  onbevestigd: "verwijderd_op IS NULL AND wachtwoord IS NOT NULL AND bevestigd_op IS NULL",
  auto: "verwijderd_op IS NULL AND wachtwoord IS NULL",
  geblokkeerd: "verwijderd_op IS NULL AND geblokkeerd = 1",
  verwijderd: "verwijderd_op IS NOT NULL",
};

async function lijst(url, env, email) {
  const filter = FILTERS[url.searchParams.get("filter")] ? url.searchParams.get("filter") : "alle";
  const zoek = tekst(url.searchParams.get("q"), 80);
  let sql = `SELECT l.*, (SELECT COUNT(*) FROM registraties r WHERE r.lid_id = l.id OR lower(r.email) = lower(l.email)) reg,
    (SELECT COUNT(*) FROM forum_berichten b WHERE b.lid_id = l.id AND b.verwijderd = 0) posts FROM leden l WHERE (${FILTERS[filter]})`;
  const args = [];
  if (zoek) { sql += " AND (l.gebruikersnaam LIKE ? OR l.email LIKE ? OR l.naam LIKE ?)"; args.push(`%${zoek}%`, `%${zoek}%`, `%${zoek}%`); }
  sql += " ORDER BY l.id DESC LIMIT 500";
  const rijen = (await env.SHOP_DB.prepare(sql).bind(...args).all()).results || [];
  const totaal = await env.SHOP_DB.prepare(`SELECT COUNT(*) alle, SUM(geblokkeerd) geblokkeerd, SUM(CASE WHEN wachtwoord IS NOT NULL AND bevestigd_op IS NOT NULL THEN 1 ELSE 0 END) actief, SUM(CASE WHEN wachtwoord IS NULL THEN 1 ELSE 0 END) auto FROM leden WHERE verwijderd_op IS NULL`).first();
  const ftab = (f, label) => `<a class="${filter === f ? "aan" : ""}" href="/beheer/leden?filter=${f}${zoek ? "&q=" + encodeURIComponent(zoek) : ""}">${label}</a>`;
  return pagina("Leden", `${STIJL}${hoofdTabs("leden")}
<div class="som"><div>Leden<b>${totaal.alle || 0}</b></div><div>Actief<b>${totaal.actief || 0}</b></div><div>Via bestelling<b>${totaal.auto || 0}</b></div><div>Geblokkeerd<b>${totaal.geblokkeerd || 0}</b></div></div>
<nav class="tabs">${ftab("alle", "Alle")}${ftab("actief", "Actief")}${ftab("onbevestigd", "Niet bevestigd")}${ftab("auto", "Via bestelling")}${ftab("geblokkeerd", "Geblokkeerd")}${ftab("verwijderd", "Verwijderd")}</nav>
<form class="filter" method="get" action="/beheer/leden"><input type="hidden" name="filter" value="${filter}"><input name="q" value="${esc(zoek)}" placeholder="Zoek op gebruikersnaam, naam of e-mail" style="flex:1;min-width:220px"><button type="submit">Zoeken</button></form>
${rijen.length ? `<table><thead><tr><th>Lid</th><th class="mob">Naam</th><th class="mob">Lid sinds</th><th class="mob">Laatst ingelogd</th><th class="mob">Bestellingen</th><th class="mob">Berichten</th><th>Status</th></tr></thead><tbody>
${rijen.map((l) => `<tr><td><a href="/beheer/leden/${l.id}">${esc(l.gebruikersnaam || "(nog geen gebruikersnaam)")}</a><br><small>${esc(l.email)}</small></td><td class="mob">${esc(l.naam || "")}</td><td class="mob">${dag(l.aangemaakt)}</td><td class="mob">${l.laatst_gezien ? dag(l.laatst_gezien) : "nooit"}</td><td class="mob">${l.reg}</td><td class="mob">${l.posts}</td><td>${status(l)}</td></tr>`).join("")}
</tbody></table>` : `<div class="leeg">Geen leden gevonden.</div>`}`, email);
}

async function lidLog(env, lidId, limiet = 200) {
  return (await env.SHOP_DB.prepare("SELECT * FROM lid_log WHERE lid_id = ? ORDER BY id DESC LIMIT ?").bind(lidId, limiet).all()).results || [];
}
const logRij = (r, metLid = false) => `<li><time>${tijd(r.aangemaakt)}</time><span class="soort s-${esc(r.soort)}">${esc(r.soort)}</span><span>${metLid ? `<a href="/beheer/leden/${r.lid_id}">${esc(r.gebruikersnaam || "lid " + r.lid_id)}</a> · ` : ""}${esc(r.tekst)}${r.link ? ` · <a href="${esc(r.link)}" target="_blank" rel="noopener">bekijk</a>` : ""}</span></li>`;

async function detail(id, env, email, melding = "") {
  const l = await env.SHOP_DB.prepare("SELECT * FROM leden WHERE id = ?").bind(id).first();
  if (!l) return null;
  const [reg, posts, wagens, logs] = await Promise.all([
    env.SHOP_DB.prepare("SELECT nummer, soort, aangemaakt, status, totaal, activiteit FROM registraties WHERE lid_id = ? OR lower(email) = lower(?) ORDER BY aangemaakt DESC LIMIT 50").bind(l.id, l.email).all(),
    env.SHOP_DB.prepare("SELECT b.id, b.aangemaakt, t.id tid, t.titel FROM forum_berichten b JOIN forum_topics t ON t.id = b.topic_id WHERE b.lid_id = ? AND b.verwijderd = 0 ORDER BY b.id DESC LIMIT 20").bind(l.id).all(),
    env.SHOP_DB.prepare("SELECT * FROM lid_wagens WHERE lid_id = ? ORDER BY volgorde, id").bind(l.id).all(),
    lidLog(env, l.id),
  ]);
  const regs = reg.results || [], ps = posts.results || [], ws = wagens.results || [];
  const postAantal = (await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM forum_berichten WHERE lid_id = ? AND verwijderd = 0").bind(l.id).first()).n;
  const knop = (actie, label, { rood = false, bevestig = "" } = {}) => `<form method="post" action="/beheer/leden/${l.id}"${bevestig ? ` onsubmit="return confirm('${esc(bevestig)}')"` : ""}><input type="hidden" name="actie" value="${actie}"><button type="submit" class="${rood ? "rood" : "knop licht"}">${label}</button></form>`;
  const weg = !!l.verwijderd_op;
  const melden = melding ? `<div class="${melding.startsWith("!") ? "melding-fout" : "melding-ok"}">${esc(melding.replace(/^!/, ""))}</div>` : "";
  return pagina(l.gebruikersnaam || l.email, `${STIJL}${hoofdTabs("leden")}
<p><a href="/beheer/leden">← Alle leden</a></p>${melden}
<div class="kaart"><div class="lid-kop">${l.avatar_id ? `<img src="/forum/foto/${l.avatar_id}" alt="">` : `<span class="av">${esc(String(l.gebruikersnaam || l.email).slice(0, 1).toUpperCase())}</span>`}
<div><div class="lid-naam">${esc(l.gebruikersnaam || "(nog geen gebruikersnaam)")} ${status(l)}</div><small>${esc(l.email)} · lid sinds ${dag(l.aangemaakt)} · ${l.bevestigd_op ? "mail bevestigd " + dag(l.bevestigd_op) : "mail niet bevestigd"} · laatst ingelogd ${l.laatst_gezien ? tijd(l.laatst_gezien) : "nooit"}</small>
${l.gebruikersnaam && !weg ? `<br><small><a href="/forum/lid/${encodeURIComponent(l.gebruikersnaam)}" target="_blank" rel="noopener">Publiek profiel bekijken</a></small>` : ""}</div></div>
<div class="som"><div>Bestellingen en inschrijvingen<b>${regs.length}</b></div><div>Forumberichten<b>${postAantal}</b></div><div>Wagens<b>${ws.length}</b></div></div>
${weg ? `<p>Dit account werd op ${dag(l.verwijderd_op)} anoniem gemaakt.</p>` : `<div class="acties">
${l.wachtwoord ? knop("wachtwoordlink", "Stuur wachtwoordlink") : knop("wachtwoordlink", "Stuur 'kies je wachtwoord'-mail")}
${!l.bevestigd_op ? knop("bevestigmail", "Bevestigingsmail opnieuw") : ""}
${knop("uitloggen", "Overal uitloggen")}
${l.kassa ? knop("kassa-uit", "Kassa-rechten intrekken") : knop("kassa-aan", "Kassa-rechten geven", { bevestig: "Dit lid mag dan tickets scannen op /kassa." })}
${l.geblokkeerd ? knop("deblokkeer", "Deblokkeren") : knop("blokkeer", "Blokkeren", { rood: true, bevestig: "Dit lid blokkeren? Inloggen lukt dan niet meer." })}
${knop("anoniem", "Account verwijderen", { rood: true, bevestig: "Account anoniem maken? Naam, e-mail, telefoon, Land Rovers en profielfoto worden gewist. Forumberichten blijven staan als 'verwijderd lid', bestellingen blijven voor de boekhouding. Dit kan niet ongedaan worden." })}
</div>`}</div>
${weg ? "" : `<div class="kaart"><h2>Gegevens</h2><form method="post" action="/beheer/leden/${l.id}"><input type="hidden" name="actie" value="gegevens">
<div class="form-grid"><div><label>Gebruikersnaam</label><input name="gebruikersnaam" value="${esc(l.gebruikersnaam || "")}" maxlength="20"></div>
<div><label>E-mailadres</label><input name="email" type="email" value="${esc(l.email)}" maxlength="160"><small>Bij een nieuw adres moet het lid dat opnieuw bevestigen.</small></div>
<div><label>Voor- en achternaam</label><input name="naam" value="${esc(l.naam || "")}" maxlength="120"></div>
<div><label>Telefoon</label><input name="telefoon" value="${esc(l.telefoon || "")}" maxlength="40"></div>
<div><label>Woonplaats</label><input name="woonplaats" value="${esc(l.woonplaats || "")}" maxlength="80"></div></div>
<p><button type="submit">Bewaren</button></p></form></div>`}
<div class="kaart"><h2>Land Rovers</h2>${ws.length ? `<div class="wagens">${ws.map((w) => `<figure>${w.foto_id ? `<a href="/forum/foto/${w.foto_id}" target="_blank" rel="noopener"><img src="/forum/foto/${w.foto_id}" alt=""></a>` : ""}<b>${esc(w.naam || w.type)}</b>${w.naam ? `<br><small>${esc(w.type)}</small>` : ""}${w.foto_id ? `<form method="post" action="/beheer/leden/${l.id}" onsubmit="return confirm('Deze foto verwijderen?')"><input type="hidden" name="actie" value="wagenfoto"><input type="hidden" name="wagen" value="${w.id}"><button class="rood" type="submit" style="padding:4px 8px;font-size:12px;margin-top:4px">Foto verwijderen</button></form>` : ""}</figure>`).join("")}</div>` : `<p class="leeg" style="padding:0">Geen wagens.</p>`}</div>
<div class="kaart"><h2>Bestellingen en inschrijvingen</h2>${regs.length ? `<table><tbody>${regs.map((r) => `<tr><td><a href="/beheer/r/${esc(r.nummer)}">${esc(r.nummer)}</a></td><td class="mob">${dag(r.aangemaakt)}</td><td>${esc(r.soort === "inschrijving" ? r.activiteit || "Inschrijving" : "Bestelling")}</td><td><span class="badge">${esc(r.status)}</span></td></tr>`).join("")}</tbody></table>` : `<p class="leeg" style="padding:0">Nog niets.</p>`}</div>
<div class="kaart"><h2>Laatste forumberichten</h2>${ps.length ? `<ul class="log">${ps.map((b) => `<li><time>${tijd(b.aangemaakt)}</time><span></span><span><a href="/forum/t/${b.tid}#b${b.id}" target="_blank" rel="noopener">${esc(b.titel)}</a></span></li>`).join("")}</ul>` : `<p class="leeg" style="padding:0">Nog geen berichten.</p>`}</div>
<div class="kaart"><h2>Activiteit <small style="font-weight:400;color:var(--m)">(laatste ${LOG_DAGEN} dagen)</small></h2>${logs.length ? `<ul class="log">${logs.map((r) => logRij(r)).join("")}</ul>` : `<p class="leeg" style="padding:0">Nog geen activiteit gelogd.</p>`}</div>`, email);
}

async function actie(request, env, url, id, email) {
  const l = await env.SHOP_DB.prepare("SELECT * FROM leden WHERE id = ?").bind(id).first();
  if (!l) return null;
  const f = await request.formData();
  const a = String(f.get("actie") || "");
  const db = env.SHOP_DB;
  if (l.verwijderd_op) return detail(id, env, email, "!Dit account is al verwijderd.");
  if (a === "wachtwoordlink") {
    await stuurWachtwoordLink(env, url.origin, l);
    await log(env, l.id, "beheer", "Beheer stuurde een wachtwoordlink");
    return detail(id, env, email, `Mail met wachtwoordlink verstuurd naar ${l.email} (hoogstens één per 5 minuten).`);
  }
  if (a === "bevestigmail") {
    await stuurBevestiging(env, url.origin, l);
    await log(env, l.id, "beheer", "Beheer stuurde de bevestigingsmail opnieuw");
    return detail(id, env, email, `Bevestigingsmail verstuurd naar ${l.email}.`);
  }
  if (a === "uitloggen") {
    await db.prepare("DELETE FROM lid_sessies WHERE lid_id = ?").bind(l.id).run();
    await log(env, l.id, "beheer", "Beheer logde dit lid overal uit");
    return detail(id, env, email, "Overal uitgelogd.");
  }
  if (a === "kassa-aan" || a === "kassa-uit") {
    await db.prepare("UPDATE leden SET kassa = ? WHERE id = ?").bind(a === "kassa-aan" ? 1 : 0, l.id).run();
    await log(env, l.id, "beheer", a === "kassa-aan" ? "Kassa-rechten gekregen" : "Kassa-rechten ingetrokken");
    return detail(id, env, email, a === "kassa-aan" ? "Dit lid kan nu tickets scannen op /kassa." : "Kassa-rechten ingetrokken.");
  }
  if (a === "blokkeer" || a === "deblokkeer") {
    await db.prepare("UPDATE leden SET geblokkeerd = ? WHERE id = ?").bind(a === "blokkeer" ? 1 : 0, l.id).run();
    if (a === "blokkeer") await db.prepare("DELETE FROM lid_sessies WHERE lid_id = ?").bind(l.id).run();
    await log(env, l.id, "beheer", a === "blokkeer" ? "Geblokkeerd door beheer" : "Gedeblokkeerd door beheer");
    return detail(id, env, email, a === "blokkeer" ? "Lid geblokkeerd en uitgelogd." : "Lid gedeblokkeerd.");
  }
  if (a === "wagenfoto") {
    const w = await db.prepare("SELECT * FROM lid_wagens WHERE id = ? AND lid_id = ?").bind(parseInt(f.get("wagen"), 10) || 0, l.id).first();
    if (w?.foto_id) {
      await db.prepare("UPDATE lid_wagens SET foto_id = NULL WHERE id = ?").bind(w.id).run();
      await db.prepare("UPDATE forum_meldingen SET afgehandeld = 1 WHERE wagen_id = ?").bind(w.id).run();
      await log(env, l.id, "beheer", `Land Rover-foto verwijderd door beheer: ${w.type}`);
    }
    return detail(id, env, email, "Foto verwijderd.");
  }
  if (a === "gegevens") {
    const w = { gebruikersnaam: tekst(f.get("gebruikersnaam"), 20), email: tekst(f.get("email"), 160).toLowerCase(), naam: tekst(f.get("naam"), 120), telefoon: tekst(f.get("telefoon"), 40), woonplaats: tekst(f.get("woonplaats"), 80) };
    if (w.gebruikersnaam && !naamOk(w.gebruikersnaam)) return detail(id, env, email, "!Gebruikersnaam: 3 tot 20 tekens, letters, cijfers, punt, streepje of underscore.");
    if (!w.gebruikersnaam && l.gebruikersnaam) return detail(id, env, email, "!De gebruikersnaam mag niet leeg zijn.");
    if (!emailOk(w.email)) return detail(id, env, email, "!Dat e-mailadres is niet geldig.");
    if (w.gebruikersnaam && await db.prepare("SELECT 1 FROM leden WHERE gebruikersnaam = ? AND id <> ?").bind(w.gebruikersnaam, l.id).first()) return detail(id, env, email, "!Die gebruikersnaam is al bezet.");
    const nieuwMail = w.email !== String(l.email).toLowerCase();
    if (nieuwMail && await db.prepare("SELECT 1 FROM leden WHERE email = ? AND id <> ?").bind(w.email, l.id).first()) return detail(id, env, email, "!Er bestaat al een account met dat e-mailadres.");
    await db.prepare(`UPDATE leden SET gebruikersnaam = ?, email = ?, naam = ?, telefoon = ?, woonplaats = ?${nieuwMail ? ", bevestigd_op = NULL" : ""} WHERE id = ?`)
      .bind(w.gebruikersnaam || null, w.email, w.naam || null, w.telefoon || null, w.woonplaats || null, l.id).run();
    const wat = [];
    if ((w.gebruikersnaam || null) !== (l.gebruikersnaam || null)) wat.push(`gebruikersnaam ${l.gebruikersnaam || "-"} → ${w.gebruikersnaam}`);
    if (nieuwMail) wat.push(`e-mail ${l.email} → ${w.email}`);
    if ((w.naam || null) !== (l.naam || null) || (w.telefoon || null) !== (l.telefoon || null) || (w.woonplaats || null) !== (l.woonplaats || null)) wat.push("naam, telefoon of woonplaats");
    if (!wat.length) return detail(id, env, email, "Niets gewijzigd.");
    await log(env, l.id, "beheer", `Gegevens aangepast door beheer: ${wat.join("; ")}`);
    if (nieuwMail) {
      await db.prepare("DELETE FROM lid_sessies WHERE lid_id = ?").bind(l.id).run();
      await stuurBevestiging(env, url.origin, { ...l, email: w.email, gebruikersnaam: w.gebruikersnaam || l.gebruikersnaam });
      return detail(id, env, email, `Bewaard. Er ging een bevestigingsmail naar ${w.email}; tot dan staat het adres als niet bevestigd.`);
    }
    return detail(id, env, email, "Bewaard.");
  }
  if (a === "anoniem") {
    await anonimiseer(env, l.id);
    await log(env, l.id, "beheer", "Account anoniem gemaakt door beheer");
    return detail(id, env, email, "Account anoniem gemaakt.");
  }
  return naar(`/beheer/leden/${l.id}`);
}

async function activiteit(url, env, email) {
  await opruimen(env);
  const soort = ["account", "forum", "cb", "garage", "profiel", "beheer"].includes(url.searchParams.get("soort")) ? url.searchParams.get("soort") : "";
  const r = (await env.SHOP_DB.prepare(`SELECT g.*, l.gebruikersnaam FROM lid_log g LEFT JOIN leden l ON l.id = g.lid_id ${soort ? "WHERE g.soort = ?" : ""} ORDER BY g.id DESC LIMIT 300`).bind(...(soort ? [soort] : [])).all()).results || [];
  const t = (s, label) => `<a class="${soort === s ? "aan" : ""}" href="/beheer/log${s ? "?soort=" + s : ""}">${label}</a>`;
  return pagina("Log", `${STIJL}${hoofdTabs("log")}
<nav class="tabs">${t("", "Alles")}${t("account", "Account")}${t("forum", "Forum")}${t("cb", "CB")}${t("garage", "Land Rovers")}${t("profiel", "Profiel")}${t("beheer", "Beheer")}</nav>
<div class="kaart"><p style="margin-top:0;color:var(--m)">Laatste 300 acties. Alles ouder dan ${LOG_DAGEN} dagen wordt automatisch gewist.</p>
${r.length ? `<ul class="log">${r.map((x) => logRij(x, true)).join("")}</ul>` : `<p class="leeg">Nog geen activiteit.</p>`}</div>`, email);
}

/* ---------------- te doen (startpagina) ---------------- */

const OPEN_REG = "(status = 'Betaald' OR status LIKE 'Bevestigd%') AND afgehandeld = 0 AND test = 0";
export async function thuis(env, email) {
  const db = env.SHOP_DB;
  const week = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [best, insch, meld, nieuw, acts, logs] = await Promise.all([
    db.prepare(`SELECT COUNT(*) n FROM registraties WHERE soort = 'bestelling' AND ${OPEN_REG}`).first(),
    db.prepare(`SELECT COUNT(*) n FROM registraties WHERE soort = 'inschrijving' AND ${OPEN_REG}`).first(),
    db.prepare("SELECT COUNT(*) n FROM forum_meldingen WHERE afgehandeld = 0").first(),
    db.prepare("SELECT COUNT(*) n FROM leden WHERE aangemaakt > ? AND verwijderd_op IS NULL").bind(week).first(),
    db.prepare("SELECT activiteit, COUNT(*) n FROM registraties WHERE soort = 'inschrijving' AND test = 0 AND (status = 'Betaald' OR status LIKE 'Bevestigd%') GROUP BY activiteit ORDER BY MAX(aangemaakt) DESC LIMIT 6").all(),
    db.prepare("SELECT g.*, l.gebruikersnaam FROM lid_log g LEFT JOIN leden l ON l.id = g.lid_id WHERE g.soort <> 'account' OR g.tekst LIKE 'Account%' ORDER BY g.id DESC LIMIT 15").all(),
  ]);
  const tegel = (label, n, link, actie, klas = "") => `<a class="tegel ${n ? klas : "ok"}" href="${link}"><small>${label}</small><b>${n}</b><span>${n ? actie : "Niets te doen"}</span></a>`;
  const a = acts.results || [];
  return pagina("Te doen", `${STIJL}${hoofdTabs("home")}
<div class="tegels">
${tegel("Bestellingen af te handelen", best.n, "/beheer?soort=bestelling&filter=open", "Afhandelen →", "let")}
${tegel("Inschrijvingen af te handelen", insch.n, "/beheer?soort=inschrijving&filter=open", "Afhandelen →", "let")}
${tegel("Open meldingen", meld.n, "/beheer/meldingen", "Bekijken →", "let")}
<a class="tegel" href="/beheer/leden"><small>Nieuwe leden (7 dagen)</small><b>${nieuw.n}</b><span>Naar leden →</span></a>
</div>
<div class="twee">
<div class="kaart"><h2>Laatste activiteit</h2>${(logs.results || []).length ? `<ul class="log">${logs.results.map((x) => logRij(x, true)).join("")}</ul><p style="margin:10px 0 0"><a href="/beheer/log">Hele log →</a></p>` : `<p class="leeg" style="padding:0">Nog niets gebeurd.</p>`}</div>
<div class="kaart"><h2>Inschrijvingen per activiteit</h2>${a.length ? `<table><tbody>${a.map((x) => `<tr><td><a href="/beheer?soort=inschrijving&activiteit=${encodeURIComponent(x.activiteit || "")}">${esc(x.activiteit || "–")}</a></td><td style="text-align:right"><b>${x.n}</b></td></tr>`).join("")}</tbody></table>` : `<p class="leeg" style="padding:0">Nog geen inschrijvingen.</p>`}
<p style="margin:14px 0 0"><a href="/beheer/activiteiten">Activiteiten beheren →</a> · <a href="/beheer/producten">Producten →</a></p></div>
</div>`, email);
}

/* ---------------- meldingen ---------------- */

async function meldingen(url, env, email) {
  const alle = url.searchParams.get("toon") === "alle";
  const r = (await env.SHOP_DB.prepare(`SELECT m.*, door.gebruikersnaam door,
      b.tekst btekst, b.lid_id blid, t.id tid, t.titel ttitel, bl.gebruikersnaam bnaam,
      w.type wtype, w.foto_id wfoto, w.lid_id wlid, wl.gebruikersnaam wnaam,
      c.tekst ctekst, c.audio_id caudio, c.nr cnr, c.lid_id clid, cl.gebruikersnaam cnaam
    FROM forum_meldingen m LEFT JOIN leden door ON door.id = m.lid_id
    LEFT JOIN forum_berichten b ON b.id = m.bericht_id AND m.bericht_id > 0 LEFT JOIN forum_topics t ON t.id = b.topic_id LEFT JOIN leden bl ON bl.id = b.lid_id
    LEFT JOIN lid_wagens w ON w.id = m.wagen_id LEFT JOIN leden wl ON wl.id = w.lid_id
    LEFT JOIN cb_berichten c ON c.id = m.cb_id LEFT JOIN leden cl ON cl.id = c.lid_id
    ${alle ? "" : "WHERE m.afgehandeld = 0"} ORDER BY m.id DESC LIMIT 200`).all()).results || [];
  const kaart = (m) => {
    let wat, inhoud, lidId, lidNaam, weg = "";
    if (m.wagen_id) { wat = "Land Rover-foto"; lidId = m.wlid; lidNaam = m.wnaam; inhoud = m.wfoto ? `<a href="/forum/foto/${m.wfoto}" target="_blank" rel="noopener"><img src="/forum/foto/${m.wfoto}" alt="" style="width:160px;height:110px;object-fit:cover;border-radius:8px"></a><br><small>${esc(m.wtype || "")}</small>` : "<i>Foto is al weg</i>"; if (m.wfoto) weg = "wagenfoto"; }
    else if (m.cb_id) { wat = `CB-kanaal ${m.cnr ?? "?"}`; lidId = m.clid; lidNaam = m.cnaam; inhoud = m.ctekst == null ? "<i>Bericht is al verdwenen (na 24 uur)</i>" : m.caudio ? `<audio controls preload="none" src="/cb/audio/${m.caudio}"></audio>` : esc(m.ctekst); if (m.ctekst != null) weg = "cb"; }
    else { wat = "Forumbericht"; lidId = m.blid; lidNaam = m.bnaam; inhoud = m.btekst == null ? "<i>Bericht bestaat niet meer</i>" : `<a href="/forum/t/${m.tid}#b${m.bericht_id}" target="_blank" rel="noopener">${esc(m.ttitel || "")}</a><br>${esc(String(m.btekst).slice(0, 400))}`; if (m.btekst != null) weg = "bericht"; }
    return `<div class="kaart melding${m.afgehandeld ? " klaar" : ""}"><div class="mk-kop"><span class="badge">${wat}</span> <small>${tijd(m.aangemaakt)} · gemeld door ${esc(m.door || "bezoeker")}</small>${m.afgehandeld ? ' <span class="badge b-betaald">Afgehandeld</span>' : ""}</div>
      <p><b>Reden:</b> ${esc(m.reden || "(geen reden)")}</p><div class="mk-inhoud">${inhoud}</div>
      <p><small>Van: ${lidId ? `<a href="/beheer/leden/${lidId}">${esc(lidNaam || "lid " + lidId)}</a>` : "?"}</small></p>
      ${m.afgehandeld ? "" : `<div class="acties">
        <form method="post" action="/beheer/meldingen"><input type="hidden" name="id" value="${m.id}"><input type="hidden" name="actie" value="ok"><button type="submit">Niets aan de hand</button></form>
        ${weg ? `<form method="post" action="/beheer/meldingen" onsubmit="return confirm('Verwijderen?')"><input type="hidden" name="id" value="${m.id}"><input type="hidden" name="actie" value="weg"><button class="rood" type="submit">Verwijderen</button></form>` : ""}
        ${lidId ? `<a class="knop licht" href="/beheer/leden/${lidId}">Lid bekijken of blokkeren</a>` : ""}</div>`}</div>`;
  };
  return pagina("Meldingen", `${STIJL}${hoofdTabs("meldingen")}<style>.melding .mk-kop{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.melding.klaar{opacity:.6}.mk-inhoud{background:#f6f4ee;border-radius:8px;padding:10px 12px;overflow-wrap:anywhere}</style>
<nav class="tabs"><a class="${alle ? "" : "aan"}" href="/beheer/meldingen">Open</a><a class="${alle ? "aan" : ""}" href="/beheer/meldingen?toon=alle">Alle</a></nav>
${r.length ? r.map(kaart).join("") : `<div class="kaart leeg">${alle ? "Nog geen meldingen." : "Geen open meldingen. Alles rustig."}</div>`}`, email);
}

async function meldingActie(request, env, email) {
  const f = await request.formData();
  const id = parseInt(f.get("id"), 10) || 0;
  const m = await env.SHOP_DB.prepare("SELECT * FROM forum_meldingen WHERE id = ?").bind(id).first();
  if (m && f.get("actie") === "weg") {
    if (m.wagen_id) {
      const w = await env.SHOP_DB.prepare("SELECT lid_id, type FROM lid_wagens WHERE id = ?").bind(m.wagen_id).first();
      await env.SHOP_DB.prepare("UPDATE lid_wagens SET foto_id = NULL WHERE id = ?").bind(m.wagen_id).run();
      if (w) await log(env, w.lid_id, "beheer", `Land Rover-foto verwijderd na melding: ${w.type}`);
    } else if (m.cb_id) {
      const c = await env.SHOP_DB.prepare("SELECT lid_id, nr FROM cb_berichten WHERE id = ?").bind(m.cb_id).first();
      await env.SHOP_DB.prepare("UPDATE cb_berichten SET verwijderd = 1 WHERE id = ?").bind(m.cb_id).run();
      if (c) await log(env, c.lid_id, "beheer", `CB-bericht verwijderd na melding (kanaal ${c.nr})`);
    } else if (m.bericht_id) {
      const b = await env.SHOP_DB.prepare("SELECT b.lid_id, b.topic_id, t.titel, (SELECT MIN(id) FROM forum_berichten WHERE topic_id = b.topic_id) eerste FROM forum_berichten b JOIN forum_topics t ON t.id = b.topic_id WHERE b.id = ?").bind(m.bericht_id).first();
      if (b) {
        if (b.eerste === m.bericht_id) await env.SHOP_DB.prepare("UPDATE forum_topics SET verwijderd = 1 WHERE id = ?").bind(b.topic_id).run();
        else {
          await env.SHOP_DB.prepare("UPDATE forum_berichten SET verwijderd = 1 WHERE id = ?").bind(m.bericht_id).run();
          await env.SHOP_DB.prepare("UPDATE forum_topics SET berichten = (SELECT COUNT(*) FROM forum_berichten WHERE topic_id = ? AND verwijderd = 0) WHERE id = ?").bind(b.topic_id, b.topic_id).run();
        }
        await log(env, b.lid_id, "beheer", `${b.eerste === m.bericht_id ? "Topic" : "Forumbericht"} verwijderd na melding: ${b.titel}`);
      }
    }
  }
  if (m) {
    const kol = m.wagen_id ? "wagen_id" : m.cb_id ? "cb_id" : "bericht_id";
    await env.SHOP_DB.prepare(`UPDATE forum_meldingen SET afgehandeld = 1 WHERE ${kol} = ?`).bind(m[kol]).run();
  }
  return naar("/beheer/meldingen");
}

async function tellers(env) {
  const r = await env.SHOP_DB.prepare(`SELECT
    (SELECT COUNT(*) FROM registraties WHERE soort = 'bestelling' AND ${OPEN_REG}) bestellingen,
    (SELECT COUNT(*) FROM registraties WHERE soort = 'inschrijving' AND ${OPEN_REG}) inschrijvingen,
    (SELECT COUNT(*) FROM forum_meldingen WHERE afgehandeld = 0) meldingen,
    (SELECT COUNT(*) FROM leden WHERE aangemaakt > ? AND verwijderd_op IS NULL) leden`).bind(new Date(Date.now() - 7 * 86400_000).toISOString()).first();
  return new Response(JSON.stringify(r), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function beheerLeden(request, env, url, email) {
  const p = url.pathname;
  if (p === "/beheer/api/tellers") return tellers(env);
  if (p === "/beheer/meldingen") return request.method === "POST" ? meldingActie(request, env, email) : meldingen(url, env, email);
  if (p === "/beheer/leden") return lijst(url, env, email);
  if (p === "/beheer/log") return activiteit(url, env, email);
  const m = p.match(/^\/beheer\/leden\/(\d{1,10})$/);
  if (m) return request.method === "POST" ? actie(request, env, url, +m[1], email) : detail(+m[1], env, email);
  return null;
}
