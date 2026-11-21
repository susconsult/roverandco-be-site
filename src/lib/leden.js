// Accounts van roverandco.be: één account voor het forum, de shop en de inschrijvingen.
// - /account                  : mijn account (gegevens, bestellingen en inschrijvingen)
// - /account/registreren      : nieuw account (met Cloudflare Turnstile tegen spambots)
// - /account/inloggen         : inloggen met e-mail of gebruikersnaam + wachtwoord
// - /account/uitloggen
// - /account/wachtwoord-vergeten : link per mail
// - /account/wachtwoord?t=    : wachtwoord kiezen (ook voor accounts die automatisch aangemaakt werden bij een bestelling)
// - /account/bevestig?t=      : mailadres bevestigen
// - /account/gegevens, /account/nieuw-wachtwoord : wijzigen
// - /api/account/ik           : gegevens van wie ingelogd is (om formulieren in te vullen)
// Wachtwoorden: PBKDF2-SHA256, 100 000 rondes, eigen zout per lid. Sessie: cookie rc_lid (HttpOnly, Secure), 90 dagen.
// Variabelen: TURNSTILE_SITEKEY + TURNSTILE_SECRET (zonder deze twee: geen spamcheck), RESEND_API_KEY, BEHEER_EMAILS.
import { esc, ico, datum, banner, pagina, naar, eigenOrigin, sha, willekeurig, mail, metVlag } from "./sjabloon.js";
import { eur } from "./opslag.js";
import { log } from "./log.js";
import { anonimiseer } from "./anoniem.js";
import { aantalOngelezen, garageKaarten } from "./forum-extra.js";
import { ticketPdf } from "./ticket.js";

const COOKIE = "rc_lid";
const SESSIE_DAGEN = 90;
const RONDES = 100000;
const nu = () => new Date().toISOString();
const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const naamOk = (s) => /^[A-Za-z0-9][A-Za-z0-9_.-]{2,19}$/.test(s);
const tekst = (v, max = 200) => String(v ?? "").trim().slice(0, max);

/* ---------------- wachtwoorden ---------------- */

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s) => new Uint8Array(s.match(/../g).map((x) => parseInt(x, 16)));
async function pbkdf2(wachtwoord, zout, rondes) {
  const sleutel = await crypto.subtle.importKey("raw", new TextEncoder().encode(wachtwoord), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: zout, iterations: rondes }, sleutel, 256));
}
async function maakHash(wachtwoord) {
  const zout = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${RONDES}$${hex(zout)}$${await pbkdf2(wachtwoord, zout, RONDES)}`;
}
async function klopt(wachtwoord, opgeslagen) {
  const [soort, r, z, h] = String(opgeslagen || "").split("$");
  if (soort !== "pbkdf2" || !h) return false;
  const t = await pbkdf2(wachtwoord, unhex(z), parseInt(r, 10));
  let verschil = t.length ^ h.length;
  for (let i = 0; i < Math.min(t.length, h.length); i++) verschil |= t.charCodeAt(i) ^ h.charCodeAt(i);
  return verschil === 0;
}

/* ---------------- sessies ---------------- */

function cookie(request, naam) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${naam}=([^;]+)`));
  return m ? m[1] : null;
}
const toegelaten = (env) => (env.BEHEER_EMAILS || "pieter@roverandco.be").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);

// Wie is ingelogd? Geeft het lid terug (met .beheerder) of null.
export async function huidigLid(request, env) {
  if (!env.SHOP_DB) return null;
  const token = cookie(request, COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const lid = await env.SHOP_DB.prepare(
    "SELECT l.*, s.als_door AS als_door FROM lid_sessies s JOIN leden l ON l.id = s.lid_id WHERE s.token_hash = ? AND s.verloopt > ?"
  ).bind(await sha(token), Date.now()).first();
  if (!lid || (lid.geblokkeerd && !lid.als_door)) return null;
  // "Bekijk als" vanuit /beheer: de beheerder kijkt mee als dit lid, alleen lezen (src/worker.ts blokkeert wijzigingen).
  lid.bekijkAls = lid.als_door || null;
  lid.beheerder = !lid.bekijkAls && !!lid.bevestigd_op && toegelaten(env).includes(String(lid.email).toLowerCase());
  return lid;
}

// Start "Bekijk als": korte sessie (1 uur) voor dit lid, gemarkeerd met wie meekijkt. De eigen login van de beheerder
// wordt bewaard in rc_lid_terug en teruggezet bij /account/bekijk-stop.
export async function startBekijkAls(request, env, lidId, doorEmail) {
  const token = willekeurig();
  await env.SHOP_DB.prepare("INSERT INTO lid_sessies (token_hash, lid_id, verloopt, als_door) VALUES (?, ?, ?, ?)").bind(await sha(token), lidId, Date.now() + 3600_000, doorEmail).run();
  const eigen = cookie(request, COOKIE);
  const c = [`${COOKIE}=${token}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`, "rc_lid_aan=1; Path=/; Max-Age=3600; Secure; SameSite=Lax", "rc_als=1; Path=/; Max-Age=3600; Secure; SameSite=Lax"];
  if (eigen && /^[a-f0-9]{64}$/.test(eigen) && !cookie(request, "rc_lid_terug")) c.push(`rc_lid_terug=${eigen}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`);
  return c;
}

export async function stopBekijkAls(request, env) {
  const token = cookie(request, COOKIE);
  let lidId = "";
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const s = await env.SHOP_DB.prepare("SELECT lid_id, als_door FROM lid_sessies WHERE token_hash = ?").bind(await sha(token)).first();
    if (s?.als_door) { lidId = s.lid_id; await env.SHOP_DB.prepare("DELETE FROM lid_sessies WHERE token_hash = ?").bind(await sha(token)).run(); }
  }
  const terug = cookie(request, "rc_lid_terug");
  const c = ["rc_als=; Path=/; Max-Age=0; Secure; SameSite=Lax", "rc_lid_terug=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"];
  c.push(terug && /^[a-f0-9]{64}$/.test(terug) ? `${COOKIE}=${terug}; Path=/; Max-Age=${SESSIE_DAGEN * 86400}; HttpOnly; Secure; SameSite=Lax` : `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return naar(lidId ? `/beheer/leden/${lidId}` : "/beheer/leden", { "set-cookie": c });
}

async function nieuweSessie(env, lidId) {
  const token = willekeurig();
  await env.SHOP_DB.prepare("DELETE FROM lid_sessies WHERE verloopt < ?").bind(Date.now()).run();
  await env.SHOP_DB.prepare("INSERT INTO lid_sessies (token_hash, lid_id, verloopt) VALUES (?, ?, ?)").bind(await sha(token), lidId, Date.now() + SESSIE_DAGEN * 86400_000).run();
  // Tweede cookie zonder inhoud: laat de site (site.js) weten dat er iemand ingelogd is, voor het belletje.
  return [`${COOKIE}=${token}; Path=/; Max-Age=${SESSIE_DAGEN * 86400}; HttpOnly; Secure; SameSite=Lax`, `rc_lid_aan=1; Path=/; Max-Age=${SESSIE_DAGEN * 86400}; Secure; SameSite=Lax`];
}

/* ---------------- mails met eenmalige link ---------------- */

async function maakToken(env, lidId, soort, dagen, { behoud = false } = {}) {
  const t = willekeurig();
  // behoud: oudere, nog geldige links van dezelfde soort blijven werken (bv. twee mails kort na elkaar).
  if (behoud) await env.SHOP_DB.prepare("DELETE FROM lid_tokens WHERE verloopt < ?").bind(Date.now()).run();
  else await env.SHOP_DB.prepare("DELETE FROM lid_tokens WHERE verloopt < ? OR (lid_id = ? AND soort = ?)").bind(Date.now(), lidId, soort).run();
  await env.SHOP_DB.prepare("INSERT INTO lid_tokens (token_hash, lid_id, soort, verloopt, aangemaakt) VALUES (?, ?, ?, ?, ?)").bind(await sha(t), lidId, soort, Date.now() + dagen * 86400_000, Date.now()).run();
  return t;
}
async function leesToken(env, t, soort) {
  if (!/^[a-f0-9]{64}$/.test(t || "")) return null;
  return env.SHOP_DB.prepare("SELECT l.* FROM lid_tokens k JOIN leden l ON l.id = k.lid_id WHERE k.token_hash = ? AND k.soort = ? AND k.verloopt > ?")
    .bind(await sha(t), soort, Date.now()).first();
}

const SLOT = "\n\nDit is een automatische mail. Vragen? Antwoord op deze mail of mail naar info@roverandco.be.";

export async function stuurBevestiging(env, origin, lid) {
  const t = await maakToken(env, lid.id, "bevestig", 7);
  return mail(env, {
    aan: lid.email, onderwerp: "Bevestig je mailadres voor Rover & Co",
    tekst: `Hallo${lid.gebruikersnaam ? " " + lid.gebruikersnaam : ""},\n\nWelkom bij Rover & Co. Klik op deze link om je mailadres te bevestigen:\n${origin}/account/bevestig?t=${t}\n\nDe link is 7 dagen geldig. Na de bevestiging zie je ook je bestellingen en inschrijvingen in je account.${SLOT}`,
  });
}

// Ook gebruikt na een bestelling of inschrijving (automatisch account): geeft de link terug.
export async function wachtwoordLink(env, origin, lidId, { behoud = false } = {}) {
  return `${origin}/account/wachtwoord?t=${await maakToken(env, lidId, "wachtwoord", 30, { behoud })}`;
}

// Afmeldlink voor nieuwsmails (lang geldig, ook via one-click List-Unsubscribe).
export async function afmeldLink(env, origin, lidId) {
  return `${origin}/account/afmelden?t=${await maakToken(env, lidId, "afmelden", 400)}`;
}
async function afmelden(request, env, url) {
  const t = url.searchParams.get("t") || "";
  const lid = await leesToken(env, t, "afmelden");
  if (!lid) return pagina(env, request, { titel: "Link verlopen", noindex: true, status: 400,
    inhoud: banner("Nieuwsmails", "Link verlopen") + kader(`<p>Deze afmeldlink werkt niet meer. Log in en zet de nieuwsmails uit bij je gegevens, of mail naar <a href="mailto:info@roverandco.be">info@roverandco.be</a>.</p>`) });
  if (request.method === "POST") {
    await env.SHOP_DB.prepare("UPDATE leden SET marketing = 0 WHERE id = ?").bind(lid.id).run();
    await log(env, lid.id, "account", "Afgemeld voor nieuwsmails");
    if (url.searchParams.has("klik") || !(request.headers.get("content-type") || "").includes("form")) return new Response("Afgemeld.", { status: 200 });
    return pagina(env, request, { titel: "Afgemeld", noindex: true,
      inhoud: banner("Nieuwsmails", "Je bent afgemeld") + kader(`<p>Je krijgt van ons geen nieuwsmails meer op <b>${esc(lid.email)}</b>. Mails over je eigen bestellingen en inschrijvingen krijg je wel nog.</p>`) });
  }
  return pagina(env, request, { titel: "Afmelden", noindex: true,
    inhoud: banner("Nieuwsmails", "Afmelden") + kader(`<p>Wil je geen nieuwsmails meer van Rover &amp; Co op <b>${esc(lid.email)}</b>?</p>
      <form method="post" action="/account/afmelden?t=${esc(t)}"><button class="btn btn-solid" type="submit">Ja, meld me af</button></form>`) });
}

export async function stuurWachtwoordLink(env, origin, lid) {
  // Hoogstens één mail per 5 minuten, zodat niemand een mailbox kan bestoken.
  const recent = await env.SHOP_DB.prepare("SELECT COUNT(*) n FROM lid_tokens WHERE lid_id = ? AND soort = 'wachtwoord' AND aangemaakt > ?").bind(lid.id, Date.now() - 5 * 60_000).first();
  if (recent?.n) return true;
  const link = `${origin}/account/wachtwoord?t=${await maakToken(env, lid.id, "wachtwoord", 1)}`;
  return mail(env, {
    aan: lid.email, onderwerp: lid.wachtwoord ? "Nieuw wachtwoord voor Rover & Co" : "Kies je wachtwoord voor Rover & Co",
    tekst: `Hallo${lid.gebruikersnaam ? " " + lid.gebruikersnaam : ""},\n\nKlik op deze link om ${lid.wachtwoord ? "een nieuw" : "je"} wachtwoord te kiezen:\n${link}\n\nDe link is 24 uur geldig. Heb je dit niet gevraagd? Dan mag je deze mail negeren.${SLOT}`,
  });
}

/* ---------------- automatisch account bij bestelling of inschrijving ---------------- */

// Zoekt of maakt het lid voor een bestelling/inschrijving. Geeft { id, nieuw, zonderWachtwoord } terug.
export async function lidVoorBestelling(env, request, klant) {
  const ingelogd = await huidigLid(request, env);
  if (ingelogd) return { id: ingelogd.id, zonderWachtwoord: !ingelogd.wachtwoord };
  const email = String(klant.email || "").toLowerCase();
  let lid = await env.SHOP_DB.prepare("SELECT id, wachtwoord FROM leden WHERE email = ?").bind(email).first();
  if (!lid) {
    await env.SHOP_DB.prepare("INSERT OR IGNORE INTO leden (email, naam, telefoon, aangemaakt, auto) VALUES (?, ?, ?, ?, 1)")
      .bind(email, klant.naam || null, klant.telefoon || null, nu()).run();
    lid = await env.SHOP_DB.prepare("SELECT id, wachtwoord FROM leden WHERE email = ?").bind(email).first();
    if (lid) await log(env, lid.id, "account", "Account automatisch aangemaakt bij bestelling of inschrijving");
  }
  return lid ? { id: lid.id, zonderWachtwoord: !lid.wachtwoord } : null;
}

/* ---------------- Turnstile ---------------- */

const TURNSTILE_ACTIE = "registreren";
const turnstileAan = (env) => !!(env.TURNSTILE_SITEKEY && env.TURNSTILE_SECRET);
const turnstileHosts = (env) => String(env.TURNSTILE_HOSTNAMES || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
// Controle aan de serverkant: token uit cf-turnstile-response, siteverify met secret + IP + timeout,
// en dan success, de juiste action en een toegelaten hostname. Bij elke fout: weigeren.
async function turnstileOk(env, f, request) {
  if (!turnstileAan(env)) return true;
  const token = String(f.get("cf-turnstile-response") || "");
  if (!token || token.length > 2048) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    if (d.success !== true) return false;
    if (d.action !== TURNSTILE_ACTIE) return false;
    const hosts = turnstileHosts(env);
    if (hosts.length && !hosts.includes(String(d.hostname || "").toLowerCase())) return false;
    return true;
  } catch { return false; }
}
const turnstileVeld = (env) => turnstileAan(env)
  ? `<div class="cf-turnstile" data-sitekey="${esc(env.TURNSTILE_SITEKEY)}" data-action="${TURNSTILE_ACTIE}" data-language="nl" style="margin:6px 0 14px"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
  : "";

/* ---------------- formulieren ---------------- */

const veld = (naam, label, { type = "text", waarde = "", auto = "", extra = "", hulp = "" } = {}) =>
  `<div class="veld"><label for="f-${naam}">${label}</label><input id="f-${naam}" name="${naam}" type="${type}" value="${esc(waarde)}"${auto ? ` autocomplete="${auto}"` : ""} ${extra}>${hulp ? `<small class="hulp">${hulp}</small>` : ""}</div>`;
const melding = (m, soort = "fout") => m ? `<div class="melding melding-${soort}" role="alert">${esc(m)}</div>` : "";
const kader = (inhoud, breed = false) => `<section class="${breed ? "wrap" : "narrow"} acc-sectie"><div class="acc-kaart">${inhoud}</div></section>`;
const veilig = (s) => (s && s.startsWith("/") && !s.startsWith("//") ? s : "");

function inlogPagina(env, request, { m = "", email = "", terug = "", soort = "fout" } = {}) {
  return pagina(env, request, {
    titel: "Inloggen", noindex: true, pad: "/account/inloggen",
    inhoud: banner("Mijn account", "Inloggen", "Eén account voor het forum, de shop en je inschrijvingen.", [["Mijn account", "/account"], ["Inloggen"]]) + kader(`
      ${melding(m, soort)}
      <form method="post" action="/account/inloggen">
        <input type="hidden" name="terug" value="${esc(terug)}">
        ${veld("login", "E-mailadres of gebruikersnaam", { waarde: email, auto: "username", extra: "required autofocus" })}
        ${veld("wachtwoord", "Wachtwoord", { type: "password", auto: "current-password", extra: "required" })}
        <button class="btn btn-solid" type="submit">Inloggen</button>
      </form>
      <p class="acc-links"><a href="/account/wachtwoord-vergeten">Wachtwoord vergeten?</a> · Nog geen account? <a href="/account/registreren${terug ? "?terug=" + encodeURIComponent(terug) : ""}">Registreer je</a></p>`),
  });
}

// Minimumleeftijd 16 (beslissing nov 2026): laatste geboortedatum die nog mag, als JJJJ-MM-DD.
function zestienJaarGeleden() {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 16);
  return d.toISOString().slice(0, 10);
}

function registreerPagina(env, request, { m = "", w = {}, terug = "" } = {}) {
  return pagina(env, request, {
    titel: "Registreren", noindex: true, pad: "/account/registreren",
    inhoud: banner("Mijn account", "Registreren", "Eén account voor het forum, de shop en je inschrijvingen.", [["Mijn account", "/account"], ["Registreren"]]) + kader(`
      ${melding(m)}
      <form method="post" action="/account/registreren">
        <input type="hidden" name="terug" value="${esc(terug)}">
        <div style="position:absolute;left:-9999px" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>
        ${veld("gebruikersnaam", "Gebruikersnaam", { waarde: w.gebruikersnaam, auto: "username", extra: 'required minlength="3" maxlength="20" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,19}"', hulp: "3 tot 20 tekens: letters, cijfers, punt, streepje of underscore. Dit zien anderen op het forum." })}
        ${veld("email", "E-mailadres", { type: "email", waarde: w.email, auto: "email", extra: "required" })}
        ${veld("wachtwoord", "Wachtwoord", { type: "password", auto: "new-password", extra: 'required minlength="8"', hulp: "Minstens 8 tekens." })}
        ${veld("geboortedatum", "Geboortedatum", { type: "date", waarde: w.geboortedatum, auto: "bday", extra: `required max="${zestienJaarGeleden()}"`, hulp: "Je moet minstens 16 jaar zijn. Anderen zien dit niet." })}
        ${turnstileVeld(env)}
        <label class="vink"><input type="checkbox" name="akkoord" value="ja" required><span>Ik ga akkoord met de <a href="/voorwaarden" target="_blank">voorwaarden</a> en de <a href="/privacy" target="_blank">privacyverklaring</a>.</span></label>
        <button class="btn btn-solid" type="submit">Account maken</button>
      </form>
      <p class="acc-links">Heb je al een account? <a href="/account/inloggen">Log in</a></p>`),
  });
}

/* ---------------- acties ---------------- */

async function inloggen(request, env, url) {
  if (request.method !== "POST") {
    if (await huidigLid(request, env)) return naar("/account");
    return inlogPagina(env, request, { terug: veilig(url.searchParams.get("terug")) });
  }
  const f = await request.formData();
  const login = tekst(f.get("login"), 160).toLowerCase();
  const terug = veilig(tekst(f.get("terug"), 300));
  const lid = await env.SHOP_DB.prepare("SELECT * FROM leden WHERE email = ? OR gebruikersnaam = ?").bind(login, login).first();
  const fout = "E-mailadres, gebruikersnaam of wachtwoord klopt niet.";
  if (!lid || lid.verwijderd_op) return inlogPagina(env, request, { m: fout, email: login, terug });
  if (lid.fout_tot > Date.now()) return inlogPagina(env, request, { m: "Te veel foute pogingen. Probeer het over 15 minuten opnieuw, of vraag een nieuw wachtwoord.", email: login, terug });
  if (!lid.wachtwoord) {
    await stuurWachtwoordLink(env, url.origin, lid);
    return inlogPagina(env, request, { m: "Voor dit account is nog geen wachtwoord gekozen. We stuurden je net een mail met een link om dat te doen.", soort: "info", email: login, terug });
  }
  if (!(await klopt(String(f.get("wachtwoord") || ""), lid.wachtwoord))) {
    const teller = lid.fout_teller + 1;
    await log(env, lid.id, "account", teller >= 8 ? "Mislukte login, account 15 minuten vergrendeld" : "Mislukte login (verkeerd wachtwoord)");
    await env.SHOP_DB.prepare("UPDATE leden SET fout_teller = ?, fout_tot = ? WHERE id = ?").bind(teller >= 8 ? 0 : teller, teller >= 8 ? Date.now() + 15 * 60_000 : 0, lid.id).run();
    return inlogPagina(env, request, { m: fout, email: login, terug });
  }
  if (lid.geblokkeerd) { await log(env, lid.id, "account", "Inlogpoging terwijl geblokkeerd"); return inlogPagina(env, request, { m: "Dit account is geblokkeerd. Vragen? Mail naar info@roverandco.be." }); }
  await env.SHOP_DB.prepare("UPDATE leden SET fout_teller = 0, fout_tot = 0, laatst_gezien = ? WHERE id = ?").bind(nu(), lid.id).run();
  await log(env, lid.id, "account", "Ingelogd");
  return naar(terug || "/account", { "set-cookie": await nieuweSessie(env, lid.id) });
}

async function registreren(request, env, url) {
  if (request.method !== "POST") return registreerPagina(env, request, { terug: veilig(url.searchParams.get("terug")) });
  const f = await request.formData();
  const w = { gebruikersnaam: tekst(f.get("gebruikersnaam"), 20), email: tekst(f.get("email"), 160).toLowerCase(), geboortedatum: tekst(f.get("geboortedatum"), 10) };
  const terug = veilig(tekst(f.get("terug"), 300));
  if (f.get("website")) return naar("/account/inloggen"); // spam-val
  const ww = String(f.get("wachtwoord") || "");
  if (!naamOk(w.gebruikersnaam)) return registreerPagina(env, request, { m: "Kies een gebruikersnaam van 3 tot 20 tekens: letters, cijfers, punt, streepje of underscore.", w, terug });
  if (!emailOk(w.email)) return registreerPagina(env, request, { m: "Vul een geldig e-mailadres in.", w, terug });
  if (ww.length < 8) return registreerPagina(env, request, { m: "Je wachtwoord moet minstens 8 tekens hebben.", w, terug });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w.geboortedatum) || w.geboortedatum < "1900-01-01") return registreerPagina(env, request, { m: "Vul je geboortedatum in.", w, terug });
  if (w.geboortedatum > zestienJaarGeleden()) return registreerPagina(env, request, { m: "Je moet minstens 16 jaar zijn om een account te maken.", w, terug });
  if (f.get("akkoord") !== "ja") return registreerPagina(env, request, { m: "Vink aan dat je akkoord gaat met de voorwaarden.", w, terug });
  if (!(await turnstileOk(env, f, request))) return registreerPagina(env, request, { m: "De spamcheck lukte niet. Probeer opnieuw.", w, terug });

  if (await env.SHOP_DB.prepare("SELECT 1 FROM leden WHERE gebruikersnaam = ?").bind(w.gebruikersnaam).first())
    return registreerPagina(env, request, { m: "Die gebruikersnaam is al bezet. Kies een andere.", w, terug });
  const bestaand = await env.SHOP_DB.prepare("SELECT * FROM leden WHERE email = ?").bind(w.email).first();
  if (bestaand) {
    if (!bestaand.wachtwoord) {
      // Account bestond al door een bestelling: niet zomaar overnemen, eerst via de mail bevestigen.
      await stuurWachtwoordLink(env, url.origin, bestaand);
      return inlogPagina(env, request, { m: "Je hebt al een account door een eerdere bestelling of inschrijving. We stuurden je een mail met een link om je wachtwoord te kiezen.", soort: "info", email: w.email });
    }
    return inlogPagina(env, request, { m: "Er bestaat al een account met dit e-mailadres. Log in, of vraag een nieuw wachtwoord.", email: w.email, terug });
  }
  const r = await env.SHOP_DB.prepare("INSERT INTO leden (email, gebruikersnaam, wachtwoord, geboortedatum, aangemaakt, laatst_gezien) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(w.email, w.gebruikersnaam, await maakHash(ww), w.geboortedatum, nu(), nu()).run();
  const lid = { id: r.meta.last_row_id, email: w.email, gebruikersnaam: w.gebruikersnaam };
  await log(env, lid.id, "account", "Account geregistreerd");
  await stuurBevestiging(env, url.origin, lid);
  return naar(terug || "/account?welkom=1", { "set-cookie": await nieuweSessie(env, lid.id) });
}

async function uitloggen(request, env) {
  const token = cookie(request, COOKIE);
  if (token) await env.SHOP_DB.prepare("DELETE FROM lid_sessies WHERE token_hash = ?").bind(await sha(token)).run();
  return naar("/", { "set-cookie": [`${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`, "rc_lid_aan=; Path=/; Max-Age=0; Secure; SameSite=Lax"] });
}

async function vergeten(request, env, url) {
  const inhoud = (m, soort) => pagina(env, request, {
    titel: "Wachtwoord vergeten", noindex: true,
    inhoud: banner("Mijn account", "Wachtwoord vergeten", "Vul je e-mailadres in, dan sturen we je een link om een nieuw wachtwoord te kiezen.", [["Mijn account", "/account"], ["Wachtwoord vergeten"]]) + kader(`${melding(m, soort)}
      <form method="post" action="/account/wachtwoord-vergeten">
        ${veld("email", "E-mailadres", { type: "email", auto: "email", extra: "required autofocus" })}
        <button class="btn btn-solid" type="submit">Stuur me een link</button>
      </form><p class="acc-links"><a href="/account/inloggen">Terug naar inloggen</a></p>`),
  });
  if (request.method !== "POST") return inhoud();
  const f = await request.formData();
  const email = tekst(f.get("email"), 160).toLowerCase();
  const lid = emailOk(email) ? await env.SHOP_DB.prepare("SELECT * FROM leden WHERE email = ?").bind(email).first() : null;
  if (lid && !lid.geblokkeerd && !lid.verwijderd_op) { await stuurWachtwoordLink(env, url.origin, lid); await log(env, lid.id, "account", "Wachtwoord vergeten: link gevraagd"); }
  return inhoud("Als er een account bestaat voor dit adres, staat er nu een mail met een link in je mailbox.", "info");
}

// Wachtwoord kiezen via de link uit de mail. Wie nog geen gebruikersnaam heeft, kiest die hier ook.
async function wachtwoordKiezen(request, env, url) {
  const t = url.searchParams.get("t") || "";
  const lid = await leesToken(env, t, "wachtwoord");
  if (!lid) return pagina(env, request, { titel: "Link verlopen", noindex: true, status: 400,
    inhoud: banner("Mijn account", "Link verlopen") + kader(`<p>Deze link is verlopen of al gebruikt.</p><p><a class="btn btn-solid" href="/account/wachtwoord-vergeten">Vraag een nieuwe link</a></p>`) });
  const toon = (m) => pagina(env, request, {
    titel: "Kies je wachtwoord", noindex: true, pad: "/account/wachtwoord",
    inhoud: banner("Mijn account", lid.wachtwoord ? "Nieuw wachtwoord" : "Kies je wachtwoord") + kader(`${melding(m)}
      <p>Account: <b>${esc(lid.email)}</b></p>
      <form method="post" action="/account/wachtwoord?t=${esc(t)}">
        ${lid.gebruikersnaam ? "" : veld("gebruikersnaam", "Gebruikersnaam", { auto: "username", extra: 'required minlength="3" maxlength="20"', hulp: "Dit zien anderen op het forum. 3 tot 20 tekens: letters, cijfers, punt, streepje of underscore." })}
        ${veld("wachtwoord", "Nieuw wachtwoord", { type: "password", auto: "new-password", extra: 'required minlength="8" autofocus', hulp: "Minstens 8 tekens." })}
        <button class="btn btn-solid" type="submit">Bewaren en inloggen</button>
      </form>`),
  });
  if (request.method !== "POST") return toon();
  const f = await request.formData();
  const ww = String(f.get("wachtwoord") || "");
  let gn = lid.gebruikersnaam;
  if (!gn) {
    gn = tekst(f.get("gebruikersnaam"), 20);
    if (!naamOk(gn)) return toon("Kies een gebruikersnaam van 3 tot 20 tekens: letters, cijfers, punt, streepje of underscore.");
    if (await env.SHOP_DB.prepare("SELECT 1 FROM leden WHERE gebruikersnaam = ? AND id <> ?").bind(gn, lid.id).first()) return toon("Die gebruikersnaam is al bezet. Kies een andere.");
  }
  if (ww.length < 8) return toon("Je wachtwoord moet minstens 8 tekens hebben.");
  // De link kwam per mail binnen: daarmee is het mailadres meteen bevestigd.
  await env.SHOP_DB.prepare("UPDATE leden SET wachtwoord = ?, gebruikersnaam = ?, bevestigd_op = COALESCE(bevestigd_op, ?), fout_teller = 0, fout_tot = 0, auto = 0 WHERE id = ?")
    .bind(await maakHash(ww), gn, nu(), lid.id).run();
  await env.SHOP_DB.prepare("DELETE FROM lid_tokens WHERE lid_id = ? AND soort = 'wachtwoord'").bind(lid.id).run();
  await env.SHOP_DB.prepare("DELETE FROM lid_sessies WHERE lid_id = ?").bind(lid.id).run(); // overal elders uitloggen
  await log(env, lid.id, "account", lid.wachtwoord ? "Nieuw wachtwoord gekozen via mail" : "Eerste wachtwoord gekozen via mail");
  return naar("/account?ww=1", { "set-cookie": await nieuweSessie(env, lid.id) });
}

async function bevestig(request, env, url) {
  const lid = await leesToken(env, url.searchParams.get("t") || "", "bevestig");
  if (!lid) return pagina(env, request, { titel: "Link verlopen", noindex: true, status: 400,
    inhoud: banner("Mijn account", "Link verlopen") + kader(`<p>Deze link is verlopen of al gebruikt. Log in en vraag een nieuwe bevestigingsmail aan in je account.</p><p><a class="btn btn-solid" href="/account">Naar mijn account</a></p>`) });
  await env.SHOP_DB.prepare("UPDATE leden SET bevestigd_op = COALESCE(bevestigd_op, ?) WHERE id = ?").bind(nu(), lid.id).run();
  await env.SHOP_DB.prepare("DELETE FROM lid_tokens WHERE lid_id = ? AND soort = 'bevestig'").bind(lid.id).run();
  await log(env, lid.id, "account", "E-mailadres bevestigd");
  return naar("/account?bevestigd=1");
}

/* ---------------- mijn account ---------------- */

const STATUS_KLAS = (s) => /niet betaald/i.test(s) ? "nee" : /betaald|bevestigd/i.test(s) ? "ok" : /wacht/i.test(s) ? "wacht" : "";

async function registratieLijsten(env, lid) {
  const rijen = (await env.SHOP_DB.prepare(
    `SELECT nummer, soort, aangemaakt, status, totaal, activiteit, ticket, gescand_op, data FROM registraties
     WHERE lid_id = ?1 OR (?2 = 1 AND email = ?3 COLLATE NOCASE) ORDER BY aangemaakt DESC LIMIT 100`
  ).bind(lid.id, lid.bevestigd_op ? 1 : 0, lid.email).all()).results || [];
  const lijst = (soort) => {
    const r = rijen.filter((x) => x.soort === soort);
    if (!r.length) return `<p class="acc-leeg">${soort === "bestelling" ? "Nog geen bestellingen." : "Nog geen inschrijvingen."}</p>`;
    return `<div class="acc-lijst">${r.map((x) => {
      let d = {}; try { d = JSON.parse(x.data); } catch {}
      // Niet betaald binnen de betaaltijd? Dan is de betaling verlopen.
      let status = x.status;
      if (/wacht/i.test(status) && Date.now() - Date.parse(x.aangemaakt) > ((d.betaaltijd_min || 15) + 5) * 60_000) status = "Niet betaald";
      const artikels = `<ul>${(d.artikels || []).map((a) => {
            const k = Object.values(a.keuzes || {}).filter(Boolean).join(", ");
            return `<li><span>${a.aantal} × ${esc(a.naam)}${k ? ` <small>(${esc(k)})</small>` : ""}</span><span>${eur(a.lijn ?? a.prijs * a.aantal)}</span></li>`;
          }).join("")}</ul>`;
      // Bestellingen uit de vorige webshop (Ecwid, tot nov 2026): enkel historiek, met de lijnen erbij.
      const oud = d.bron === "ecwid" ? `<small class="acc-meta">Uit onze vorige webshop</small>` : "";
      const wat = soort === "bestelling"
        ? oud + artikels
        : `<p class="acc-wat">${esc(d.activiteit_titel || x.activiteit)}</p>${oud}${d.bron === "ecwid" ? artikels : ""}${x.ticket && /betaald|bevestigd|test/i.test(status) && !/niet/i.test(status) ? `<p class="acc-wat"><a class="btn btn-solid" href="/account/ticket/${esc(x.nummer)}">Ticket downloaden (PDF)</a>${x.gescand_op ? " <small>Gescand aan de ingang.</small>" : ""}</p>` : ""}`;
      return `<div class="acc-rij"><div class="acc-kop"><b>${esc(x.nummer)}</b><span class="acc-status ${STATUS_KLAS(status)}">${esc(status)}</span></div>
        <small class="acc-meta">${datum(x.aangemaakt, true)}</small>${wat}<div class="acc-tot"><span>Totaal</span><b>${eur(x.totaal)}</b></div></div>`;
    }).join("")}</div>`;
  };
  return lijst;
}

const ACC_IC = {
  bon: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>',
  auto: '<path d="M3 16V9l2-4h9l2 4h4v7H3Z"/><path d="M5 9h11"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
  bewaar: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>',
  bel: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Z"/><path d="M10 21h4"/>',
  profiel: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  instel: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  kassa: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M18 18h3v3h-3z"/>',
  cb: '<path d="M4 14a8 8 0 0 1 16 0"/><path d="M8 14a4 4 0 0 1 8 0"/><circle cx="12" cy="15" r="1.5"/><path d="M12 16.5V21"/>',
};
const accTegel = (href, ic, titel, sub) => `<a class="acc-tegel" href="${href}"><span class="acc-ic"><svg viewBox="0 0 24 24" aria-hidden="true">${ACC_IC[ic]}</svg></span><b>${titel}</b><small>${sub}</small></a>`;

async function overzicht(request, env, url, lid) {
  const db = env.SHOP_DB;
  const [reg, wagens, bewaard, nieuw] = await Promise.all([
    db.prepare("SELECT COUNT(*) n FROM registraties WHERE lid_id = ?1 OR (?2 = 1 AND email = ?3 COLLATE NOCASE)").bind(lid.id, lid.bevestigd_op ? 1 : 0, lid.email).first(),
    db.prepare("SELECT COUNT(*) n FROM lid_wagens WHERE lid_id = ?").bind(lid.id).first(),
    db.prepare("SELECT COUNT(*) n FROM lid_bewaard WHERE lid_id = ?").bind(lid.id).first().catch(() => ({ n: 0 })),
    aantalOngelezen(env, lid.id),
  ]);
  const meer = (n, een, veel) => `${n} ${n === 1 ? een : veel}`;
  const m = url.searchParams.has("welkom") ? melding("Welkom! Je account is klaar. Bevestig nog je mailadres via de mail die we je stuurden.", "ok")
    : url.searchParams.has("bevestigd") ? melding("Je mailadres is bevestigd.", "ok")
    : url.searchParams.has("ww") ? melding("Je wachtwoord is bewaard.", "ok")
    : url.searchParams.has("opgeslagen") ? melding("Je gegevens zijn bewaard.", "ok")
    : url.searchParams.has("mail") ? melding("We stuurden je een nieuwe bevestigingsmail.", "info") : "";
  const onbevestigd = lid.bevestigd_op ? "" : `<div class="melding melding-info">Je mailadres is nog niet bevestigd. Daarna zie je ook bestellingen en inschrijvingen die je eerder met dit adres deed.
    <form method="post" action="/account/bevestig-opnieuw" style="display:inline"><button class="linkknop" type="submit">Stuur de mail opnieuw</button></form></div>`;
  return pagina(env, request, {
    titel: "Mijn account", noindex: true, pad: "/account",
    inhoud: banner("Mijn account", lid.gebruikersnaam ? `Hallo ${lid.gebruikersnaam}` : "Mijn account", "Alles van jou op één plek. Kies hieronder waar je naartoe wil.", [["Mijn account"]]) + `<section class="wrap acc-sectie">${m}${onbevestigd}
      <div class="app-blok" data-app-blok hidden></div>
      <div class="acc-tegels">
        ${accTegel("/account/bestellingen", "bon", "Bestellingen en inschrijvingen", reg.n ? meer(reg.n, "bestelling of inschrijving", "bestellingen en inschrijvingen") : "Nog niets besteld")}
        ${accTegel("/account/garage", "auto", "Mijn Landy", wagens.n ? meer(wagens.n, "Land Rover", "Land Rovers") : "Zet je Land Rover erin")}
        ${accTegel("/account/meldingen", "bel", "Meldingen", nieuw ? `<b class="acc-nieuw">${nieuw} nieuw</b>` : "Geen nieuwe meldingen")}
        ${accTegel("/account/bewaard", "bewaar", "Bewaard", bewaard.n ? meer(bewaard.n, "item", "items") : "Berichten en foto's om terug te vinden")}
        ${lid.gebruikersnaam ? accTegel(`/forum/lid/${encodeURIComponent(lid.gebruikersnaam)}`, "profiel", "Mijn profiel", "Zo zien anderen je op het forum") : ""}
        ${accTegel("/account/gegevens", "instel", "Gegevens en wachtwoord", esc(lid.email))}
        ${accTegel("/cb", "cb", "Op de CB", "Live praten met andere leden")}
        ${lid.kassa || lid.beheerder ? accTegel("/scan", "kassa", "Scan", "Tickets scannen aan de ingang") : ""}
      </div>
      <p class="acc-uit"><a href="/account/uitloggen">Uitloggen</a></p></section>`,
  });
}

// Ticket (PDF) van een eigen inschrijving opnieuw downloaden.
async function ticketDownload(env, lid, nummer) {
  const r = await env.SHOP_DB.prepare("SELECT * FROM registraties WHERE nummer = ? AND soort = 'inschrijving' AND ticket IS NOT NULL AND (lid_id = ? OR (? = 1 AND email = ? COLLATE NOCASE))")
    .bind(nummer, lid.id, lid.bevestigd_op ? 1 : 0, lid.email).first();
  if (!r) return new Response("Niet gevonden.", { status: 404 });
  const d = JSON.parse(r.data);
  const pdf = ticketPdf({
    titel: d.activiteit_naam || String(d.activiteit_titel || "").replace(/\s*\([^)]*\)$/, ""), datum: d.activiteit_datum_lang || d.activiteit_datum_label || "", uren: d.activiteit_uren || "",
    locatie: d.activiteit_locatie || "", naam: r.naam, nummer: r.nummer, tijdslot: r.tijdslot || "", wagen: d.wagen || "", test: String(r.status).startsWith("Test"),
    lijnen: (d.lijnen || []).map((l) => ({ tekst: `${l.aantal} × ${l.naam}`, bedrag: l.prijs > 0 ? eur(l.lijn) : "gratis" })), totaal: r.totaal > 0 ? eur(r.totaal) : "", code: r.ticket,
  });
  return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="ticket-${r.nummer}.pdf"`, "cache-control": "private, no-store" } });
}

async function bestellingen(request, env, url, lid) {
  const lijst = await registratieLijsten(env, lid);
  return pagina(env, request, {
    titel: "Bestellingen en inschrijvingen", noindex: true, pad: "/account/bestellingen",
    inhoud: banner("Mijn account", "Bestellingen en inschrijvingen", "Al je inschrijvingen voor activiteiten en je bestellingen uit de shop.", [["Mijn account", "/account"], ["Bestellingen en inschrijvingen"]]) + `<section class="wrap acc-sectie">
      <div class="acc-grid">
        <div class="acc-kaart"><h2 class="acc-h"><span class="acc-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/><path d="m9 15 2 2 4-4"/></svg></span>Mijn inschrijvingen</h2>${lijst("inschrijving")}</div>
        <div class="acc-kaart"><h2 class="acc-h"><span class="acc-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg></span>Mijn bestellingen</h2>${lijst("bestelling")}</div>
      </div>
      <p><a href="/account">← Terug naar mijn account</a></p></section>`,
  });
}

async function gegevens(request, env, url, lid) {
  const toon = (m, w = lid) => pagina(env, request, {
    titel: "Gegevens wijzigen", noindex: true,
    inhoud: banner("Mijn account", "Gegevens wijzigen", "Je gegevens zie alleen jij. Op het forum tonen we enkel je gebruikersnaam.", [["Mijn account", "/account"], ["Gegevens wijzigen"]]) + kader(`${melding(m)}
      <form method="post" action="/account/gegevens" id="gegevens-form">
        ${veld("gebruikersnaam", "Gebruikersnaam", { waarde: w.gebruikersnaam, auto: "username", extra: 'required minlength="3" maxlength="20"' })}
        ${veld("naam", "Voor- en achternaam", { waarde: w.naam, auto: "name" })}
        ${veld("telefoon", "Telefoon", { type: "tel", waarde: w.telefoon, auto: "tel" })}
        ${veld("straat", "Straat en nummer", { waarde: w.straat, auto: "street-address", hulp: "Voor verzendingen uit de shop. Alleen zichtbaar voor jou." })}
        <div class="veld2">${veld("postcode", "Postcode", { waarde: w.postcode, auto: "postal-code" })}${veld("gemeente", "Gemeente", { waarde: w.gemeente || w.woonplaats, auto: "address-level2" })}</div>
        <p>Je Land Rovers zet je bij <a href="/account/garage">Mijn Landy</a>.</p>
        <div class="veld"><label>Profielfoto</label><div class="avatar-kies">${avatar(w, 64)}<input type="file" accept="image/*" data-avatar><input type="hidden" name="avatar_id" value="${esc(w.avatar_id || "")}"></div><small class="hulp">Bijvoorbeeld een foto van je Land Rover.</small></div>
        <p>E-mailadres: <b>${esc(lid.email)}</b> <small>(wijzigen? Mail naar info@roverandco.be)</small></p>
        <button class="btn btn-solid" type="submit">Bewaren</button> <a class="btn" href="/account">Annuleren</a>
      </form><p class="acc-links"><a href="/account/nieuw-wachtwoord">Wachtwoord wijzigen</a> · <a href="/account/mijn-gegevens.json" download>Download al mijn gegevens</a> · <a href="/account/verwijderen">Account verwijderen</a></p><script src="/assets/js/forum.js" defer></script>`),
  });
  if (request.method !== "POST") return toon();
  const f = await request.formData();
  const w = { gebruikersnaam: tekst(f.get("gebruikersnaam"), 20), naam: tekst(f.get("naam"), 120), telefoon: tekst(f.get("telefoon"), 40), straat: tekst(f.get("straat"), 120), postcode: tekst(f.get("postcode"), 10), gemeente: tekst(f.get("gemeente"), 80), landrover: lid.landrover, avatar_id: parseInt(f.get("avatar_id"), 10) || null };
  w.woonplaats = w.gemeente;
  if (!naamOk(w.gebruikersnaam)) return toon("Kies een gebruikersnaam van 3 tot 20 tekens: letters, cijfers, punt, streepje of underscore.", { ...lid, ...w });
  if (await env.SHOP_DB.prepare("SELECT 1 FROM leden WHERE gebruikersnaam = ? AND id <> ?").bind(w.gebruikersnaam, lid.id).first()) return toon("Die gebruikersnaam is al bezet.", { ...lid, ...w });
  if (w.avatar_id && !(await env.SHOP_DB.prepare("SELECT 1 FROM forum_fotos WHERE id = ? AND lid_id = ?").bind(w.avatar_id, lid.id).first())) w.avatar_id = lid.avatar_id;
  await env.SHOP_DB.prepare("UPDATE leden SET gebruikersnaam = ?, naam = ?, telefoon = ?, woonplaats = ?, straat = ?, postcode = ?, gemeente = ?, landrover = ?, avatar_id = ? WHERE id = ?")
    .bind(w.gebruikersnaam, w.naam || null, w.telefoon || null, w.woonplaats || null, w.straat || null, w.postcode || null, w.gemeente || null, w.landrover || null, w.avatar_id, lid.id).run();
  await log(env, lid.id, "profiel", w.gebruikersnaam !== lid.gebruikersnaam ? `Gegevens gewijzigd (gebruikersnaam ${lid.gebruikersnaam || "-"} → ${w.gebruikersnaam})` : w.avatar_id !== lid.avatar_id ? "Gegevens en profielfoto gewijzigd" : "Gegevens gewijzigd");
  return naar("/account?opgeslagen=1");
}

async function nieuwWachtwoord(request, env, url, lid) {
  const toon = (m) => pagina(env, request, {
    titel: "Wachtwoord wijzigen", noindex: true,
    inhoud: banner("Mijn account", "Wachtwoord wijzigen", "Kies een nieuw wachtwoord van minstens 8 tekens.", [["Mijn account", "/account"], ["Wachtwoord wijzigen"]]) + kader(`${melding(m)}
      <form method="post" action="/account/nieuw-wachtwoord">
        ${lid.wachtwoord ? veld("huidig", "Huidig wachtwoord", { type: "password", auto: "current-password", extra: "required" }) : ""}
        ${veld("wachtwoord", "Nieuw wachtwoord", { type: "password", auto: "new-password", extra: 'required minlength="8"', hulp: "Minstens 8 tekens." })}
        <button class="btn btn-solid" type="submit">Bewaren</button> <a class="btn" href="/account">Annuleren</a>
      </form>`),
  });
  if (request.method !== "POST") return toon();
  const f = await request.formData();
  if (lid.wachtwoord && !(await klopt(String(f.get("huidig") || ""), lid.wachtwoord))) return toon("Je huidige wachtwoord klopt niet.");
  const ww = String(f.get("wachtwoord") || "");
  if (ww.length < 8) return toon("Je nieuwe wachtwoord moet minstens 8 tekens hebben.");
  await env.SHOP_DB.prepare("UPDATE leden SET wachtwoord = ? WHERE id = ?").bind(await maakHash(ww), lid.id).run();
  await log(env, lid.id, "account", "Wachtwoord gewijzigd in account");
  await env.SHOP_DB.prepare("DELETE FROM lid_sessies WHERE lid_id = ?").bind(lid.id).run();
  return naar("/account?ww=1", { "set-cookie": await nieuweSessie(env, lid.id) });
}

export const avatar = (lid, maat = 40) => lid?.avatar_id
  ? `<img class="avatar" src="/forum/foto/${lid.avatar_id}" width="${maat}" height="${maat}" alt="" loading="lazy">`
  : `<span class="avatar avatar-leeg" style="width:${maat}px;height:${maat}px;font-size:${Math.round(maat / 2.4)}px" aria-hidden="true">${esc(String(lid?.gebruikersnaam || "?").slice(0, 1).toUpperCase())}</span>`;

/* ---------------- garage ---------------- */

async function garageMini(env, lid) {
  const w = (await env.SHOP_DB.prepare("SELECT * FROM lid_wagens WHERE lid_id = ? ORDER BY volgorde, id").bind(lid.id).all()).results || [];
  return w.length ? garageKaarten(w) : "<p>Nog leeg. Zet hier je Land Rovers: andere leden zien ze bij je berichten op het forum.</p>";
}

async function garage(request, env, url, lid) {
  const wagens = (await env.SHOP_DB.prepare("SELECT * FROM lid_wagens WHERE lid_id = ? ORDER BY volgorde, id").bind(lid.id).all()).results || [];
  if (request.method === "POST") {
    const f = await request.formData();
    const id = parseInt(f.get("id"), 10) || 0;
    const eigen = id ? wagens.find((x) => x.id === id) : null;
    if (id && !eigen) return naar("/account/garage");
    if (f.get("actie") === "verwijder" && eigen) {
      await env.SHOP_DB.prepare("DELETE FROM lid_wagens WHERE id = ? AND lid_id = ?").bind(id, lid.id).run();
      await log(env, lid.id, "garage", `Wagen verwijderd: ${eigen.type}`);
      return naar("/account/garage?weg=1");
    }
    const type = tekst(f.get("type"), 80);
    if (!type) return naar("/account/garage?fout=type");
    const jaar = parseInt(f.get("bouwjaar"), 10);
    const bouwjaar = jaar >= 1948 && jaar <= new Date().getFullYear() + 1 ? jaar : null;
    let foto = parseInt(f.get("foto_id"), 10) || null;
    if (foto && !(await env.SHOP_DB.prepare("SELECT 1 FROM forum_fotos WHERE id = ? AND lid_id = ?").bind(foto, lid.id).first())) foto = eigen?.foto_id || null;
    const v = [tekst(f.get("naam"), 60) || null, type, bouwjaar, foto, tekst(f.get("omschrijving"), 300) || null];
    if (eigen) await env.SHOP_DB.prepare("UPDATE lid_wagens SET naam = ?, type = ?, bouwjaar = ?, foto_id = ?, omschrijving = ? WHERE id = ? AND lid_id = ?").bind(...v, id, lid.id).run();
    else if (wagens.length < 30) await env.SHOP_DB.prepare("INSERT INTO lid_wagens (naam, type, bouwjaar, foto_id, omschrijving, lid_id, volgorde, aangemaakt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(...v, lid.id, wagens.length, new Date().toISOString()).run();
    // Geen eigen profielfoto? Dan wordt de foto van je eerste Land Rover je profielfoto.
    if (!lid.avatar_id) await env.SHOP_DB.prepare("UPDATE leden SET avatar_id = (SELECT foto_id FROM lid_wagens WHERE lid_id = ? AND foto_id IS NOT NULL ORDER BY volgorde, id LIMIT 1) WHERE id = ? AND avatar_id IS NULL").bind(lid.id, lid.id).run();
    await log(env, lid.id, "garage", `${eigen ? "Wagen gewijzigd" : "Wagen toegevoegd"}: ${type}${foto && foto !== eigen?.foto_id ? " (nieuwe foto)" : ""}`, foto ? `/forum/foto/${foto}` : null);
    return naar("/account/garage?ok=1");
  }
  const formulier = (w = {}) => `<form method="post" action="/account/garage" class="garage-form">
      <input type="hidden" name="id" value="${w.id || ""}">
      <div class="avatar-kies">${w.foto_id ? `<img class="wagen-mini" src="/forum/foto/${w.foto_id}" alt="">` : `<span class="wagen-mini leeg">${ico("auto")}</span>`}<label class="btn">Foto kiezen<input type="file" accept="image/*" data-wagenfoto hidden></label><input type="hidden" name="foto_id" value="${w.foto_id || ""}"></div>
      <div class="veld2">${veld("type" + (w.id || ""), "Type", { waarde: w.type, extra: 'name="type" required maxlength="80" placeholder="Defender 110 Td5"' }).replace(`name="type${w.id || ""}"`, "")}
        ${veld("bouwjaar" + (w.id || ""), "Bouwjaar", { type: "number", waarde: w.bouwjaar || "", extra: 'name="bouwjaar" min="1948" max="2030"' }).replace(`name="bouwjaar${w.id || ""}"`, "")}</div>
      <div class="veld2">${veld("naam" + (w.id || ""), "Bijnaam <small>(optioneel)</small>", { waarde: w.naam, extra: 'name="naam" maxlength="60" placeholder="Otis"' }).replace(`name="naam${w.id || ""}"`, "")}
        ${veld("oms" + (w.id || ""), "Iets over deze wagen <small>(optioneel)</small>", { waarde: w.omschrijving, extra: 'name="omschrijving" maxlength="300"' }).replace(`name="oms${w.id || ""}"`, "")}</div>
      <button class="btn btn-solid" type="submit">${w.id ? "Bewaren" : "Land Rover toevoegen"}</button>
      ${w.id ? `<button class="btn" type="submit" name="actie" value="verwijder" data-bevestig="Deze Land Rover verwijderen?">Verwijderen</button>` : ""}
    </form>`;
  const m = url.searchParams.has("ok") ? melding("Bewaard.", "ok") : url.searchParams.has("weg") ? melding("Land Rover verwijderd.", "ok") : url.searchParams.has("fout") ? melding("Vul minstens het type in.") : "";
  return pagina(env, request, {
    titel: "Mijn Landy", noindex: true,
    inhoud: banner("Mijn account", "Mijn Landy", "Zet hier je Land Rovers. Niets is verplicht. Andere leden zien ze op je profiel en bij je berichten op het forum.", [["Mijn account", "/account"], ["Mijn Landy"]]) + `<section class="narrow acc-sectie">${m}
      ${wagens.map((w) => `<div class="acc-kaart"><h2>${esc(w.type)}${w.bouwjaar ? ` <small>${w.bouwjaar}</small>` : ""}</h2>${formulier(w)}</div>`).join("")}
      <div class="acc-kaart"><h2>${wagens.length ? "Nog een Land Rover toevoegen" : "Je eerste Land Rover"}</h2>${formulier()}</div>
      <p><a href="/account">← Terug naar mijn account</a>${lid.gebruikersnaam ? ` · <a href="/forum/lid/${encodeURIComponent(lid.gebruikersnaam)}#garage">Bekijk je profiel</a>` : ""}</p>
    </section><script src="/assets/js/forum.js" defer></script>`,
  });
}

async function meldingen(request, env, lid) {
  const r = (await env.SHOP_DB.prepare("SELECT * FROM lid_meldingen WHERE lid_id = ? ORDER BY id DESC LIMIT 100").bind(lid.id).all()).results || [];
  await env.SHOP_DB.prepare("UPDATE lid_meldingen SET gelezen = 1 WHERE lid_id = ? AND gelezen = 0").bind(lid.id).run();
  await env.SHOP_DB.prepare("DELETE FROM lid_meldingen WHERE lid_id = ? AND gelezen = 1 AND aangemaakt < ?").bind(lid.id, new Date(Date.now() - 90 * 86400_000).toISOString()).run();
  return pagina(env, request, {
    titel: "Meldingen", noindex: true,
    inhoud: banner("Mijn account", "Meldingen", "Nieuwe reacties en likes op wat je volgt.", [["Mijn account", "/account"], ["Meldingen"]]) + `<section class="narrow acc-sectie"><div class="acc-kaart">
      ${r.length ? `<ul class="meldingen">${r.map((x) => `<li class="${x.gelezen ? "" : "nieuw"}"><a href="${esc(x.link)}">${esc(x.tekst)}</a><small>${datum(x.aangemaakt)}</small></li>`).join("")}</ul>`
        : "<p>Nog geen meldingen. Volg een categorie, topic of #hashtag op het forum, dan krijg je hier een melding bij nieuwe berichten.</p>"}
      </div><p><a href="/account">← Terug naar mijn account</a> · <a href="/forum">Naar het forum</a></p></section>`,
  });
}

/* ---------------- router ---------------- */

/* ---------------- privacy: gegevens downloaden en account verwijderen ---------------- */

async function export_(env, lid) {
  const db = env.SHOP_DB;
  const alle = async (sql, ...a) => (await db.prepare(sql).bind(...a).all()).results || [];
  const data = {
    uitgevoerd_op: new Date().toISOString(),
    account: { gebruikersnaam: lid.gebruikersnaam, email: lid.email, naam: lid.naam, telefoon: lid.telefoon, straat: lid.straat, postcode: lid.postcode, gemeente: lid.gemeente, land: lid.land, aangemaakt: lid.aangemaakt, mail_bevestigd: lid.bevestigd_op, laatst_ingelogd: lid.laatst_gezien },
    garage: await alle("SELECT naam, type, bouwjaar, omschrijving, foto_id, aangemaakt FROM lid_wagens WHERE lid_id = ?", lid.id),
    bestellingen_en_inschrijvingen: (await alle("SELECT nummer, soort, aangemaakt, status, totaal, activiteit, data FROM registraties WHERE lid_id = ?1 OR (?2 = 1 AND email = ?3 COLLATE NOCASE) ORDER BY aangemaakt", lid.id, lid.bevestigd_op ? 1 : 0, lid.email)).map((r) => { try { r.data = JSON.parse(r.data); } catch {} return r; }),
    forumberichten: await alle("SELECT b.id, t.titel AS topic, b.tekst, b.aangemaakt, b.bewerkt_op FROM forum_berichten b JOIN forum_topics t ON t.id = b.topic_id WHERE b.lid_id = ? AND b.verwijderd = 0 ORDER BY b.id", lid.id),
    likes: await alle("SELECT bericht_id, aangemaakt FROM forum_likes WHERE lid_id = ?", lid.id),
    volgt: await alle("SELECT soort, sleutel, aangemaakt FROM forum_volgen WHERE lid_id = ?", lid.id),
    bewaard: await alle("SELECT soort, sleutel, aangemaakt FROM lid_bewaard WHERE lid_id = ?", lid.id),
    cb_berichten_laatste_24u: await alle("SELECT nr AS kanaal, tekst, audio_id, aangemaakt FROM cb_berichten WHERE lid_id = ?", lid.id),
    meldingen: await alle("SELECT tekst, link, gelezen, aangemaakt FROM lid_meldingen WHERE lid_id = ?", lid.id),
    activiteit_laatste_90_dagen: await alle("SELECT soort, tekst, aangemaakt FROM lid_log WHERE lid_id = ? ORDER BY id", lid.id),
    fotos: "Je foto's staan op /forum/foto/<foto_id> (zie Mijn Landy en forumberichten).",
  };
  await log(env, lid.id, "account", "Gegevens gedownload");
  return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="rover-en-co-mijn-gegevens.json"`, "cache-control": "no-store" } });
}

async function verwijderen(request, env, url, lid) {
  const toon = (m = "") => pagina(env, request, {
    titel: "Account verwijderen", noindex: true,
    inhoud: banner("Mijn account", "Account verwijderen", "Je gegevens worden gewist. Dit kan niet ongedaan gemaakt worden.", [["Mijn account", "/account"], ["Account verwijderen"]]) + kader(`${melding(m)}
      <p>Dit gebeurt er:</p>
      <ul><li>Je naam, e-mail, telefoon, adres, profielfoto en Land Rovers worden gewist.</li>
      <li>Je CB-berichten, bewaarde items, meldingen en activiteitenlog worden gewist.</li>
      <li>Je forumberichten blijven staan, maar onder een anonieme naam. Wil je ze ook weg? Verwijder ze eerst zelf of mail ons.</li>
      <li>Bestellingen en inschrijvingen bewaren we zolang de boekhoudwet dat vraagt.</li></ul>
      <form method="post" action="/account/verwijderen">
        ${lid.wachtwoord ? veld("wachtwoord", "Je wachtwoord ter bevestiging", { type: "password", auto: "current-password", extra: "required" }) : ""}
        <label class="akkoord"><input type="checkbox" name="zeker" value="ja" required> <span>Ik begrijp het en wil mijn account verwijderen.</span></label>
        <p><button class="btn btn-solid" type="submit">Account definitief verwijderen</button> <a class="btn" href="/account">Annuleren</a></p>
      </form><p class="acc-links"><a href="/account/mijn-gegevens.json" download>Eerst al je gegevens downloaden</a></p>`),
  });
  if (request.method !== "POST") return toon();
  const f = await request.formData();
  if (f.get("zeker") !== "ja") return toon("Vink aan dat je je account wil verwijderen.");
  if (lid.wachtwoord && !(await klopt(String(f.get("wachtwoord") || ""), lid.wachtwoord))) return toon("Je wachtwoord klopt niet.");
  await anonimiseer(env, lid.id);
  await log(env, lid.id, "account", "Account verwijderd door het lid zelf");
  return naar("/?account=verwijderd", { "set-cookie": [`${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`, "rc_lid_aan=; Path=/; Max-Age=0; Secure; SameSite=Lax"] });
}

export async function leden(request, env, url) {
  const p = url.pathname.replace(/\/$/, "") || "/";
  if (p === "/api/account/ik") {
    const lid = await huidigLid(request, env);
    return new Response(JSON.stringify(lid ? { ingelogd: true, gebruikersnaam: lid.gebruikersnaam, naam: lid.naam, email: lid.email, telefoon: lid.telefoon, straat: lid.straat, postcode: lid.postcode, gemeente: lid.gemeente, land: lid.land,
      wagen: await env.SHOP_DB.prepare("SELECT type, bouwjaar FROM lid_wagens WHERE lid_id = ? ORDER BY volgorde, id LIMIT 1").bind(lid.id).first().then((w) => w ? [w.type, w.bouwjaar].filter(Boolean).join(", ") : null).catch(() => null),
      beheerder: !!lid.beheerder, kassa: !!(lid.kassa || lid.beheerder), meldingen: await aantalOngelezen(env, lid.id) } : { ingelogd: false }),
      { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  if (p !== "/account" && !p.startsWith("/account/")) return null;
  if (!env.SHOP_DB) return new Response("Nog niet gekoppeld.", { status: 503 });
  // Afmelden mag ook rechtstreeks vanuit het mailprogramma (one-click), dus vóór de origin-check.
  if (p === "/account/afmelden") return afmelden(request, env, url);
  if (request.method === "POST" && !eigenOrigin(request, url)) return new Response("Geweigerd.", { status: 403 });

  if (p === "/account/inloggen") return inloggen(request, env, url);
  if (p === "/account/registreren") return registreren(request, env, url);
  if (p === "/account/uitloggen") return uitloggen(request, env);
  if (p === "/account/wachtwoord-vergeten") return vergeten(request, env, url);
  if (p === "/account/wachtwoord") return wachtwoordKiezen(request, env, url);
  if (p === "/account/bevestig") return bevestig(request, env, url);

  const lid = await huidigLid(request, env);
  if (!lid) return naar("/account/inloggen?terug=" + encodeURIComponent(p));
  if (p === "/account") return metVlag(request, await overzicht(request, env, url, lid), lid);
  if (p === "/account/bestellingen") return bestellingen(request, env, url, lid);
  if (p.startsWith("/account/ticket/")) return ticketDownload(env, lid, decodeURIComponent(p.slice(16)));
  if (p === "/account/mijn-gegevens.json") return export_(env, lid);
  if (p === "/account/verwijderen") return verwijderen(request, env, url, lid);
  if (p === "/account/gegevens") return gegevens(request, env, url, lid);
  if (p === "/account/nieuw-wachtwoord") return nieuwWachtwoord(request, env, url, lid);
  if (p === "/account/garage") return garage(request, env, url, lid);
  if (p === "/account/meldingen") return meldingen(request, env, lid);
  if (p === "/account/bevestig-opnieuw" && request.method === "POST") {
    if (!lid.bevestigd_op) await stuurBevestiging(env, url.origin, lid);
    return naar("/account?mail=1");
  }
  return naar("/account");
}
