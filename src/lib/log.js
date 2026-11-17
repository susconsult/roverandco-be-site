// Activiteitenlog per lid. Alleen zichtbaar in /beheer, 90 dagen bewaard, geen IP-adressen.
export const LOG_DAGEN = 90;

export async function log(env, lidId, soort, tekst, link = null) {
  if (!env.SHOP_DB || !lidId) return;
  try {
    await env.SHOP_DB.prepare("INSERT INTO lid_log (lid_id, soort, tekst, link, aangemaakt) VALUES (?, ?, ?, ?, ?)")
      .bind(lidId, soort, String(tekst).slice(0, 300), link, new Date().toISOString()).run();
    if (Math.random() < 0.05) await opruimen(env);
  } catch { /* de log mag nooit een actie doen mislukken */ }
}

export async function opruimen(env) {
  await env.SHOP_DB.prepare("DELETE FROM lid_log WHERE aangemaakt < ?").bind(new Date(Date.now() - LOG_DAGEN * 86400_000).toISOString()).run();
}
