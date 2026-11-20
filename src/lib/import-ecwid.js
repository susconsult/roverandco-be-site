// TIJDELIJK (nov 2026): eenmalige Ecwid-import. Wordt na de import weer verwijderd.
// Werkt alleen met een eenmalig token waarvan de hash in instellingen.import_token staat (via de D1-console gezet).
// Laat alleen INSERT OR IGNORE INTO leden/registraties en UPDATE leden ... WHERE email = toe.
const MAG = [/^INSERT OR IGNORE INTO leden \(/, /^INSERT OR IGNORE INTO registraties \(/, /^UPDATE leden SET marketing = COALESCE/];

async function sha(t) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function importEcwid(request, env) {
  if (request.method !== "POST") return new Response("Niet gevonden.", { status: 404 });
  const token = request.headers.get("x-import-token") || "";
  const rij = await env.SHOP_DB.prepare("SELECT waarde FROM instellingen WHERE sleutel = 'import_token'").first();
  if (!rij || !token || (await sha(token)) !== rij.waarde) return new Response("Geen toegang.", { status: 403 });
  const lijst = await request.json();
  if (!Array.isArray(lijst) || !lijst.length || lijst.length > 200) return new Response("Ongeldig.", { status: 400 });
  for (const s of lijst) if (typeof s !== "string" || !MAG.some((re) => re.test(s))) return new Response("Niet toegelaten: " + String(s).slice(0, 60), { status: 400 });
  const res = await env.SHOP_DB.batch(lijst.map((s) => env.SHOP_DB.prepare(s)));
  return Response.json({ ok: true, aantal: res.length, wijzigingen: res.reduce((a, r) => a + (r.meta?.changes || 0), 0) });
}
