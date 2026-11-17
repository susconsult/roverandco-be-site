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
import { esc, datum, banner, pagina, naar, eigenOrigin, sha, willekeurig, mail, metVlag } from "./sjabloon.js";
import { eur } from "./opslag.js";
import { aantalOngelezen, garageKaarten } from "./forum-extra.js";

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
    "SELECT l.* FROM lid_sessies s JOIN leden l ON l.id = s.lid_id WHERE s.token_hash = ? AND s.verloopt > ?"
  ).bind(await sha(token), Date.now()).first();
  if (!lid || lid.geblokkeerd) return null;
  lid.beheerder = !!lid.bevestigd_op && toegelaten(env).includes(String(lid.email).toLowerCase());
  return lid;
}

async function nieuweSessie(env, lidId) {
  const token = willekeurig();
  await env.SHOP_DB.prepare("DELETE FROM lid_sessies WHERE verloopt < ?").bind(Date.now()).run();
  await env.SHOP_DB.prepare("INSERT INTO lid_sessies (token_hash, lid_id, verloopt) VALUES (?, ?, ?)").bind(await sha(token), lidId, Date.now() + SESSIE_DAGEN * 86400_000).run();
  // Tweede cookie zonder inhoud: laat de site (site.js) weten dat er iemand ingelogd is, voor het belletje.
  return [`${COOKIE}=${token}; Path=/; Max-Age=${SESSIE_DAGEN * 86400}; HttpOnly; Secure; SameSite=Lax`, `rc_lid_aan=1; Path=/; Max-Age=${SESSIE_DAGEN * 86400}; Secure; SameSite=Lax`];
}

/* ---------------- mails met eenmalige link ---------------- */

async function maakToken(env, lidId, soort, dagen) {
  const t = willekeurig();
  await env.SHOP_DB.prepare("DELETE FROM lid_tokens WHERE verloopt < ? OR (lid_id = ? AND soort = ?)").bind(Date.now(), lidId, soort).run();
  await env.SHOP_DB.prepare("INSERT INTO lid_tokens (token_hash, lid_id, soort, verloopt, aangemaakt) VALUES (?, ?, ?, ?, ?)").bind(await sha(t), lidId, soort, Date.now() + dagen * 86400_000, Date.now()).run();
  return t;
}
async function leesToken(env, t, soort) {
  if (!/^[a-f0-9]{64}$/.test(t || "")) return null;
  return env.SHOP_DB.prepare("SELECT l.* FROM lid_tokens k JOIN leden l ON l.id = k.lid_id WHERE k.token_hash = ? AND k.soort = ? AND k.verloopt > ?")
    .bind(await sha(t), soort, Date.now()).first();
}

const SLOT = "\n\nDit is een automatische mail, je kan er niet op antwoorden. Vragen? Mail naar info@roverandco.be";

async function stuurBevestiging(env, origin, lid) {
  const t = await maakToken(env, lid.id, "bevestig", 7);
  return mail(env, {
    aan: lid.email, onderwerp: "Bevestig je mailadres voor Rover & Co",
    tekst: `Hallo${lid.gebruikersnaam ? " " + lid.gebruikersnaam : ""},\n\nWelkom bij Rover & Co. Klik op deze link om je mailadres te bevestigen:\n${origin}/account/bevestig?t=${t}\n\nDe link is 7 dagen geldig. Na de bevestiging zie je ook je bestellingen en inschrijvingen in je account.${SLOT}`,
  });
}

// Ook gebruikt na een bestelling of inschrijving (automatisch account): geeft de link terug.
export async function wachtwoordLink(env, origin, lidId) {
  return `${origin}/account/wachtwoord?t=${await maakToken(env, lidId, "wachtwoord", 30)}`;
}

async function stuurWachtwoordLink(env, origin, lid) {
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
    inhoud: banner("Mijn account", "Inloggen") + kader(`
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

function registreerPagina(env, request, { m = "", w = {}, terug = "" } = {}) {
  return pagina(env, request, {
    titel: "Registreren", noindex: true, pad: "/account/registreren",
    inhoud: banner("Mijn account", "Registreren", "Eén account voor het forum, de shop en je inschrijvingen.") + kader(`
      ${melding(m)}
      <form method="post" action="/account/registreren">
        <input type="hidden" name="terug" value="${esc(terug)}">
        <div style="position:absolute;left:-9999px" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>
        ${veld("gebruikersnaam", "Gebruikersnaam", { waarde: w.gebruikersnaam, auto: "username", extra: 'required minlength="3" maxlength="20" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,19}"', hulp: "3 tot 20 tekens: letters, cijfers, punt, streepje of underscore. Dit zien anderen op het forum." })}
        ${veld("email", "E-mailadres", { type: "email", waarde: w.email, auto: "email", extra: "required" })}
        ${veld("wachtwoord", "Wachtwoord", { type: "password", auto: "new-password", extra: 'required minlength="8"', hulp: "Minstens 8 tekens." })}
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
  if (!lid) return inlogPagina(env, request, { m: fout, email: login, terug });
  if (lid.fout_tot > Date.now()) return inlogPagina(env, request, { m: "Te veel foute pogingen. Probeer het over 15 minuten opnieuw, of vraag een nieuw wachtwoord.", email: login, terug });
  if (!lid.wachtwoord) {
    await stuurWachtwoordLink(env, url.origin, lid);
    return inlogPagina(env, request, { m: "Voor dit account is nog geen wachtwoord gekozen. We stuurden je net een mail met een link om dat te doen.", soort: "info", email: login, terug });
  }
  if (!(await klopt(String(f.get("wachtwoord") || ""), lid.wachtwoord))) {
    const teller = lid.fout_teller + 1;
    await env.SHOP_DB.prepare("UPDATE leden SET fout_teller = ?, fout_tot = ? WHERE id = ?").bind(teller >= 8 ? 0 : teller, teller >= 8 ? Date.now() + 15 * 60_000 : 0, lid.id).run();
    return inlogPagina(env, request, { m: fout, email: login, terug });
  }
  if (lid.geblokkeerd) return inlogPagina(env, request, { m: "Dit account is geblokkeerd. Vragen? Mail naar info@roverandco.be." });
  await env.SHOP_DB.prepare("UPDATE leden SET fout_teller = 0, fout_tot = 0, laatst_gezien = ? WHERE id = ?").bind(nu(), lid.id).run();
  return naar(terug || "/account", { "set-cookie": await nieuweSessie(env, lid.id) });
}

async function registreren(request, env, url) {
  if (request.method !== "POST") return registreerPagina(env, request, { terug: veilig(url.searchParams.get("terug")) });
  const f = await request.formData();
  const w = { gebruikersnaam: tekst(f.get("gebruikersnaam"), 20), email: tekst(f.get("email"), 160).toLowerCase() };
  const terug = veilig(tekst(f.get("terug"), 300));
  if (f.get("website")) return naar("/account/inloggen"); // spam-val
  const ww = String(f.get("wachtwoord") || "");
  if (!naamOk(w.gebruikersnaam)) return registreerPagina(env, request, { m: "Kies een gebruikersnaam van 3 tot 20 tekens: letters, cijfers, punt, streepje of underscore.", w, terug });
  if (!emailOk(w.email)) return registreerPagina(env, request, { m: "Vul een geldig e-mailadres in.", w, terug });
  if (ww.length < 8) return registreerPagina(env, request, { m: "Je wachtwoord moet minstens 8 tekens hebben.", w, terug });
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
  const r = await env.SHOP_DB.prepare("INSERT INTO leden (email, gebruikersnaam, wachtwoord, aangemaakt, laatst_gezien) VALUES (?, ?, ?, ?, ?)")
    .bind(w.email, w.gebruikersnaam, await maakHash(ww), nu(), nu()).run();
  const lid = { id: r.meta.last_row_id, email: w.email, gebruikersnaam: w.gebruikersnaam };
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
    inhoud: banner("Mijn account", "Wachtwoord vergeten") + kader(`${melding(m, soort)}
      <form method="post" action="/account/wachtwoord-vergeten">
        ${veld("email", "E-mailadres", { type: "email", auto: "email", extra: "required autofocus" })}
        <button class="btn btn-solid" type="submit">Stuur me een link</button>
      </form><p class="acc-links"><a href="/account/inloggen">Terug naar inloggen</a></p>`),
  });
  if (request.method !== "POST") return inhoud();
  const f = await request.formData();
  const email = tekst(f.get("email"), 160).toLowerCase();
  const lid = emailOk(email) ? await env.SHOP_DB.prepare("SELECT * FROM leden WHERE email = ?").bind(email).first() : null;
  if (lid && !lid.geblokkeerd) await stuurWachtwoordLink(env, url.origin, lid);
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
  return naar("/account?ww=1", { "set-cookie": await nieuweSessie(env, lid.id) });
}

async function bevestig(request, env, url) {
  const lid = await leesToken(env, url.searchParams.get("t") || "", "bevestig");
  if (!lid) return pagina(env, request, { titel: "Link verlopen", noindex: true, status: 400,
    inhoud: banner("Mijn account", "Link verlopen") + kader(`<p>Deze link is verlopen of al gebruikt. Log in en vraag een nieuwe bevestigingsmail aan in je account.</p><p><a class="btn btn-solid" href="/account">Naar mijn account</a></p>`) });
  await env.SHOP_DB.prepare("UPDATE leden SET bevestigd_op = COALESCE(bevestigd_op, ?) WHERE id = ?").bind(nu(), lid.id).run();
  await env.SHOP_DB.prepare("DELETE FROM lid_tokens WHERE lid_id = ? AND soort = 'bevestig'").bind(lid.id).run();
  return naar("/account?bevestigd=1");
}

/* ---------------- mijn account ---------------- */

const STATUS_KLAS = (s) => /betaald|bevestigd/i.test(s) ? "ok" : /wacht/i.test(s) ? "wacht" : "";

async function overzicht(request, env, url, lid) {
  const rijen = (await env.SHOP_DB.prepare(
    `SELECT nummer, soort, aangemaakt, status, totaal, activiteit, data FROM registraties
     WHERE lid_id = ?1 OR (?2 = 1 AND email = ?3 COLLATE NOCASE) ORDER BY aangemaakt DESC LIMIT 100`
  ).bind(lid.id, lid.bevestigd_op ? 1 : 0, lid.email).all()).results || [];
  const lijst = (soort) => {
    const r = rijen.filter((x) => x.soort === soort);
    if (!r.length) return `<p class="acc-leeg">${soort === "bestelling" ? "Nog geen bestellingen." : "Nog geen inschrijvingen."}</p>`;
    return `<table class="acc-tabel"><thead><tr><th>Datum</th><th>${soort === "bestelling" ? "Bestelling" : "Activiteit"}</th><th>Status</th><th class="r">Totaal</th></tr></thead><tbody>${r.map((x) => {
      let d = {}; try { d = JSON.parse(x.data); } catch {}
      const wat = soort === "bestelling" ? (d.artikels || []).map((a) => `${a.aantal} × ${esc(a.naam)}`).join("<br>") : esc(d.activiteit_titel || x.activiteit);
      return `<tr><td>${datum(x.aangemaakt, true)}</td><td><small>${esc(x.nummer)}</small><br>${wat}</td><td><span class="acc-status ${STATUS_KLAS(x.status)}">${esc(x.status)}</span></td><td class="r">${eur(x.totaal)}</td></tr>`;
    }).join("")}</tbody></table>`;
  };
  const m = url.searchParams.has("welkom") ? melding("Welkom! Je account is klaar. Bevestig nog je mailadres via de mail die we je stuurden.", "ok")
    : url.searchParams.has("bevestigd") ? melding("Je mailadres is bevestigd.", "ok")
    : url.searchParams.has("ww") ? melding("Je wachtwoord is bewaard.", "ok")
    : url.searchParams.has("opgeslagen") ? melding("Je gegevens zijn bewaard.", "ok")
    : url.searchParams.has("mail") ? melding("We stuurden je een nieuwe bevestigingsmail.", "info") : "";
  const onbevestigd = lid.bevestigd_op ? "" : `<div class="melding melding-info">Je mailadres is nog niet bevestigd. Daarna zie je ook bestellingen en inschrijvingen die je eerder met dit adres deed.
    <form method="post" action="/account/bevestig-opnieuw" style="display:inline"><button class="linkknop" type="submit">Stuur de mail opnieuw</button></form></div>`;
  return pagina(env, request, {
    titel: "Mijn account", noindex: true, pad: "/account",
    inhoud: banner("Mijn account", lid.gebruikersnaam ? `Hallo ${lid.gebruikersnaam}` : "Mijn account") + `<section class="wrap acc-sectie">${m}${onbevestigd}
      <div class="acc-grid">
        <div class="acc-kaart"><h2>Mijn inschrijvingen</h2>${lijst("inschrijving")}</div>
        <div class="acc-kaart"><h2>Mijn bestellingen</h2>${lijst("bestelling")}</div>
        <div class="acc-kaart"><h2>Mijn gegevens</h2>
          <dl class="acc-dl"><dt>Gebruikersnaam</dt><dd>${esc(lid.gebruikersnaam || "–")}</dd><dt>E-mail</dt><dd>${esc(lid.email)}</dd>
          <dt>Naam</dt><dd>${esc(lid.naam || "–")}</dd><dt>Telefoon</dt><dd>${esc(lid.telefoon || "–")}</dd><dt>Woonplaats</dt><dd>${esc(lid.woonplaats || "–")}</dd><dt>Mijn Land Rover</dt><dd>${esc(lid.landrover || "–")}</dd></dl>
          <p class="acc-knoppen"><a class="btn btn-solid" href="/account/gegevens">Gegevens wijzigen</a> <a class="btn" href="/account/nieuw-wachtwoord">Wachtwoord wijzigen</a></p></div>
        <div class="acc-kaart"><h2>Mijn garage</h2>${await garageMini(env, lid)}<p class="acc-knoppen"><a class="btn btn-solid" href="/account/garage">Garage beheren</a></p></div>
        <div class="acc-kaart"><h2>Meldingen</h2><p>${(n => n ? `Je hebt <b>${n}</b> nieuwe ${n === 1 ? "melding" : "meldingen"}.` : "Geen nieuwe meldingen.")(await aantalOngelezen(env, lid.id))}</p><p class="acc-knoppen"><a class="btn btn-solid" href="/account/meldingen">Bekijk meldingen</a></p></div>
        <div class="acc-kaart"><h2>Forum</h2><p>${lid.gebruikersnaam ? `Je profiel: <a href="/forum/lid/${encodeURIComponent(lid.gebruikersnaam)}">${esc(lid.gebruikersnaam)}</a>` : "Kies eerst een gebruikersnaam bij je gegevens."}</p>
          <p class="acc-knoppen"><a class="btn btn-solid" href="/forum">Naar het forum</a> <a class="btn" href="/account/uitloggen">Uitloggen</a></p></div>
      </div></section>`,
  });
}

async function gegevens(request, env, url, lid) {
  const toon = (m, w = lid) => pagina(env, request, {
    titel: "Gegevens wijzigen", noindex: true,
    inhoud: banner("Mijn account", "Gegevens wijzigen") + kader(`${melding(m)}
      <form method="post" action="/account/gegevens" id="gegevens-form">
        ${veld("gebruikersnaam", "Gebruikersnaam", { waarde: w.gebruikersnaam, auto: "username", extra: 'required minlength="3" maxlength="20"' })}
        ${veld("naam", "Voor- en achternaam", { waarde: w.naam, auto: "name" })}
        ${veld("telefoon", "Telefoon", { type: "tel", waarde: w.telefoon, auto: "tel" })}
        ${veld("woonplaats", "Woonplaats", { waarde: w.woonplaats, auto: "address-level2", hulp: "Zichtbaar op je forumprofiel." })}
        <p>Je Land Rovers zet je in je <a href="/account/garage">garage</a>.</p>
        <div class="veld"><label>Profielfoto</label><div class="avatar-kies">${avatar(w, 64)}<input type="file" accept="image/*" data-avatar><input type="hidden" name="avatar_id" value="${esc(w.avatar_id || "")}"></div><small class="hulp">Bijvoorbeeld een foto van je Land Rover.</small></div>
        <p>E-mailadres: <b>${esc(lid.email)}</b> <small>(wijzigen? Mail naar info@roverandco.be)</small></p>
        <button class="btn btn-solid" type="submit">Bewaren</button> <a class="btn" href="/account">Annuleren</a>
      </form><script src="/assets/js/forum.js" defer></script>`),
  });
  if (request.method !== "POST") return toon();
  const f = await request.formData();
  const w = { gebruikersnaam: tekst(f.get("gebruikersnaam"), 20), naam: tekst(f.get("naam"), 120), telefoon: tekst(f.get("telefoon"), 40), woonplaats: tekst(f.get("woonplaats"), 80), landrover: lid.landrover, avatar_id: parseInt(f.get("avatar_id"), 10) || null };
  if (!naamOk(w.gebruikersnaam)) return toon("Kies een gebruikersnaam van 3 tot 20 tekens: letters, cijfers, punt, streepje of underscore.", { ...lid, ...w });
  if (await env.SHOP_DB.prepare("SELECT 1 FROM leden WHERE gebruikersnaam = ? AND id <> ?").bind(w.gebruikersnaam, lid.id).first()) return toon("Die gebruikersnaam is al bezet.", { ...lid, ...w });
  if (w.avatar_id && !(await env.SHOP_DB.prepare("SELECT 1 FROM forum_fotos WHERE id = ? AND lid_id = ?").bind(w.avatar_id, lid.id).first())) w.avatar_id = lid.avatar_id;
  await env.SHOP_DB.prepare("UPDATE leden SET gebruikersnaam = ?, naam = ?, telefoon = ?, woonplaats = ?, landrover = ?, avatar_id = ? WHERE id = ?")
    .bind(w.gebruikersnaam, w.naam || null, w.telefoon || null, w.woonplaats || null, w.landrover || null, w.avatar_id, lid.id).run();
  return naar("/account?opgeslagen=1");
}

async function nieuwWachtwoord(request, env, url, lid) {
  const toon = (m) => pagina(env, request, {
    titel: "Wachtwoord wijzigen", noindex: true,
    inhoud: banner("Mijn account", "Wachtwoord wijzigen") + kader(`${melding(m)}
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
    return naar("/account/garage?ok=1");
  }
  const formulier = (w = {}) => `<form method="post" action="/account/garage" class="garage-form">
      <input type="hidden" name="id" value="${w.id || ""}">
      <div class="avatar-kies">${w.foto_id ? `<img class="wagen-mini" src="/forum/foto/${w.foto_id}" alt="">` : '<span class="wagen-mini leeg">🚙</span>'}<label class="btn">Foto kiezen<input type="file" accept="image/*" data-wagenfoto hidden></label><input type="hidden" name="foto_id" value="${w.foto_id || ""}"></div>
      <div class="veld2">${veld("type" + (w.id || ""), "Type", { waarde: w.type, extra: 'name="type" required maxlength="80" placeholder="Defender 110 Td5"' }).replace(`name="type${w.id || ""}"`, "")}
        ${veld("bouwjaar" + (w.id || ""), "Bouwjaar", { type: "number", waarde: w.bouwjaar || "", extra: 'name="bouwjaar" min="1948" max="2030"' }).replace(`name="bouwjaar${w.id || ""}"`, "")}</div>
      <div class="veld2">${veld("naam" + (w.id || ""), "Bijnaam <small>(optioneel)</small>", { waarde: w.naam, extra: 'name="naam" maxlength="60" placeholder="Otis"' }).replace(`name="naam${w.id || ""}"`, "")}
        ${veld("oms" + (w.id || ""), "Iets over deze wagen <small>(optioneel)</small>", { waarde: w.omschrijving, extra: 'name="omschrijving" maxlength="300"' }).replace(`name="oms${w.id || ""}"`, "")}</div>
      <button class="btn btn-solid" type="submit">${w.id ? "Bewaren" : "Toevoegen aan garage"}</button>
      ${w.id ? `<button class="btn" type="submit" name="actie" value="verwijder" data-bevestig="Deze wagen uit je garage halen?">Verwijderen</button>` : ""}
    </form>`;
  const m = url.searchParams.has("ok") ? melding("Bewaard.", "ok") : url.searchParams.has("weg") ? melding("Verwijderd uit je garage.", "ok") : url.searchParams.has("fout") ? melding("Vul minstens het type in.") : "";
  return pagina(env, request, {
    titel: "Mijn garage", noindex: true,
    inhoud: banner("Mijn account", "Mijn garage", "Zet hier je Land Rovers. Niets is verplicht. Andere leden zien ze op je profiel en bij je berichten op het forum.") + `<section class="narrow acc-sectie">${m}
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
    inhoud: banner("Mijn account", "Meldingen") + `<section class="narrow acc-sectie"><div class="acc-kaart">
      ${r.length ? `<ul class="meldingen">${r.map((x) => `<li class="${x.gelezen ? "" : "nieuw"}"><a href="${esc(x.link)}">${esc(x.tekst)}</a><small>${datum(x.aangemaakt)}</small></li>`).join("")}</ul>`
        : "<p>Nog geen meldingen. Volg een categorie, topic of #hashtag op het forum, dan krijg je hier een melding bij nieuwe berichten.</p>"}
      </div><p><a href="/account">← Terug naar mijn account</a> · <a href="/forum">Naar het forum</a></p></section>`,
  });
}

/* ---------------- router ---------------- */

export async function leden(request, env, url) {
  const p = url.pathname.replace(/\/$/, "") || "/";
  if (p === "/api/account/ik") {
    const lid = await huidigLid(request, env);
    return new Response(JSON.stringify(lid ? { ingelogd: true, gebruikersnaam: lid.gebruikersnaam, naam: lid.naam, email: lid.email, telefoon: lid.telefoon, meldingen: await aantalOngelezen(env, lid.id) } : { ingelogd: false }),
      { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  if (p !== "/account" && !p.startsWith("/account/")) return null;
  if (!env.SHOP_DB) return new Response("Nog niet gekoppeld.", { status: 503 });
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
