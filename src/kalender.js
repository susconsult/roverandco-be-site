// Kalender: activiteiten van andere clubs indienen en goedkeuren.
// - POST /api/kalender            : iemand dient een activiteit in (status "wacht"), mail naar Pieter met goedkeurlinks
// - GET  /api/kalender            : goedgekeurde, nog niet voorbije activiteiten (de pagina /kalender toont ze)
// - GET  /api/kalender/beslis     : ?id=..&t=..&actie=ok|nee  (link uit de mail; token per inzending)
// Opslag: tabel kalender in D1 (binding PLANNER_DB, database roverandco-planner).
// Mail via Resend (RESEND_API_KEY). Zonder sleutel wordt de inzending wel bewaard, maar geen mail gestuurd.

const AAN = "pieter@roverandco.be";
const VAN = "Rover & Co VZW <noreply@roverandco.be>";

const kjson = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const t = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const datumOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const urlOk = (s) => !s || /^https?:\/\/[^\s]+\.[^\s]{2,}/i.test(s);
const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function pagina(titel, tekst) {
  return new Response(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(titel)}</title><style>body{font-family:system-ui,sans-serif;background:#ECE6D6;color:#141815;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px}
div{background:#fff;border-radius:14px;padding:28px;max-width:440px}h1{margin:0 0 10px;font-size:1.5rem}a{color:#1F3B2A;font-weight:700}</style></head>
<body><div><h1>${esc(titel)}</h1><p>${tekst}</p><p><a href="/kalender">Naar de kalender</a></p></div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "no-store" } });
}

async function indienen(request, env) {
  let d;
  try { d = await request.json(); } catch { return kjson({ ok: false, fout: "Ongeldige gegevens." }, 400); }
  if (t(d.website)) return kjson({ ok: true }); // spam-val
  const a = {
    club: t(d.club, 100), titel: t(d.titel, 120), datum: t(d.datum, 10), einde: t(d.einde, 10),
    plaats: t(d.plaats, 120), link: t(d.link, 300), naam: t(d.naam, 100), email: t(d.email, 160).toLowerCase(), opmerking: t(d.opmerking, 1000),
  };
  const fouten = [];
  if (a.club.length < 2) fouten.push("club");
  if (a.titel.length < 3) fouten.push("titel");
  if (!datumOk(a.datum) || a.datum < new Date().toISOString().slice(0, 10)) fouten.push("datum");
  if (a.einde && (!datumOk(a.einde) || a.einde < a.datum)) fouten.push("einde");
  if (a.plaats.length < 2) fouten.push("plaats");
  if (!urlOk(a.link)) fouten.push("link");
  if (!emailOk(a.email)) fouten.push("email");
  if (fouten.length) return kjson({ ok: false, fouten }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "";
  const recent = await env.PLANNER_DB.prepare("SELECT COUNT(*) AS n FROM kalender WHERE ip = ? AND aangemaakt > ?").bind(ip, Date.now() - 3600e3).first();
  if ((recent?.n || 0) >= 5) return kjson({ ok: false, fout: "Te veel inzendingen. Probeer het later opnieuw." }, 429);

  const id = "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const token = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
  await env.PLANNER_DB.prepare("INSERT INTO kalender (id, status, data, token, aangemaakt, ip) VALUES (?, 'wacht', ?, ?, ?, ?)")
    .bind(id, JSON.stringify(a), token, Date.now(), ip).run();

  if (env.RESEND_API_KEY) {
    const basis = new URL(request.url).origin + `/api/kalender/beslis?id=${id}&t=${token}`;
    const tekst = [
      "Nieuwe activiteit ingediend voor de kalender:", "",
      `Club: ${a.club}`, `Activiteit: ${a.titel}`, `Datum: ${a.datum}${a.einde ? " tot " + a.einde : ""}`, `Plaats: ${a.plaats}`,
      `Link: ${a.link || "-"}`, `Ingediend door: ${a.naam || "-"} <${a.email}>`, `Opmerking: ${a.opmerking || "-"}`, "",
      `Goedkeuren (komt meteen op de kalender): ${basis}&actie=ok`, `Weigeren: ${basis}&actie=nee`,
    ].join("\n");
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", "idempotency-key": `kalender-${id}` },
        body: JSON.stringify({ from: VAN, to: [AAN], reply_to: a.email, subject: `Kalender: ${a.titel} (${a.club})`, text: tekst }),
      });
    } catch { /* inzending staat in de database; mail is enkel een melding */ }
  }
  return kjson({ ok: true });
}

async function beslis(url, env) {
  const id = t(url.searchParams.get("id"), 40), tok = t(url.searchParams.get("t"), 64), actie = url.searchParams.get("actie");
  const r = await env.PLANNER_DB.prepare("SELECT status, data, token FROM kalender WHERE id = ?").bind(id).first();
  if (!r || r.token !== tok || !["ok", "nee"].includes(actie)) return pagina("Link werkt niet", "Deze link is ongeldig of verlopen.");
  const nieuw = actie === "ok" ? "ok" : "nee";
  await env.PLANNER_DB.prepare("UPDATE kalender SET status = ? WHERE id = ?").bind(nieuw, id).run();
  const a = JSON.parse(r.data);
  return pagina(nieuw === "ok" ? "Goedgekeurd" : "Geweigerd",
    nieuw === "ok" ? `<b>${esc(a.titel)}</b> van ${esc(a.club)} staat nu op de kalender.` : `<b>${esc(a.titel)}</b> komt niet op de kalender.`);
}

async function lijst(env) {
  const vandaag = new Date().toISOString().slice(0, 10);
  const rijen = (await env.PLANNER_DB.prepare("SELECT id, data FROM kalender WHERE status = 'ok'").all()).results;
  const items = rijen.map((r) => {
    const a = JSON.parse(r.data);
    return { id: r.id, club: a.club, titel: a.titel, datum: a.datum, einde: a.einde || "", plaats: a.plaats, link: a.link };
  }).filter((a) => (a.einde || a.datum) >= vandaag);
  return new Response(JSON.stringify({ ok: true, items }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
}

export async function kalender(request, env, url) {
  const p = url.pathname;
  if (!p.startsWith("/api/kalender")) return null;
  if (!env.PLANNER_DB) return kjson({ ok: false, fout: "Database niet gekoppeld." }, 500);
  if (p === "/api/kalender" && request.method === "POST") return indienen(request, env);
  if (p === "/api/kalender" && request.method === "GET") return lijst(env);
  if (p === "/api/kalender/beslis" && request.method === "GET") return beslis(url, env);
  return kjson({ ok: false, fout: "Onbekend adres." }, 404);
}
