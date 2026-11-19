// Account anoniem maken (recht op vergetelheid): persoonsgegevens weg, forumberichten blijven als "verwijderd-<id>",
// bestellingen en inschrijvingen blijven bewaard voor de boekhouding.
export async function anonimiseer(env, lidId) {
  const db = env.SHOP_DB;
  const l = await db.prepare("SELECT avatar_id FROM leden WHERE id = ?").bind(lidId).first();
  if (!l) return false;
  const fotos = [l.avatar_id, ...(((await db.prepare("SELECT foto_id FROM lid_wagens WHERE lid_id = ?").bind(lidId).all()).results || []).map((x) => x.foto_id))].filter(Boolean);
  await db.batch([
    db.prepare("UPDATE leden SET email = ?, gebruikersnaam = ?, wachtwoord = NULL, naam = NULL, telefoon = NULL, woonplaats = NULL, straat = NULL, postcode = NULL, gemeente = NULL, land = NULL, landrover = NULL, geboortedatum = NULL, avatar_id = NULL, bevestigd_op = NULL, geblokkeerd = 0, laatst_cb = NULL, verwijderd_op = ? WHERE id = ?")
      .bind(`verwijderd-${lidId}@roverandco.invalid`, `verwijderd-${lidId}`, new Date().toISOString(), lidId),
    db.prepare("DELETE FROM lid_sessies WHERE lid_id = ?").bind(lidId),
    db.prepare("DELETE FROM lid_tokens WHERE lid_id = ?").bind(lidId),
    db.prepare("DELETE FROM lid_wagens WHERE lid_id = ?").bind(lidId),
    db.prepare("DELETE FROM lid_meldingen WHERE lid_id = ?").bind(lidId),
    db.prepare("DELETE FROM forum_volgen WHERE lid_id = ?").bind(lidId),
    db.prepare("DELETE FROM lid_bewaard WHERE lid_id = ?").bind(lidId),
    db.prepare("DELETE FROM cb_berichten WHERE lid_id = ?").bind(lidId),
    db.prepare("DELETE FROM cb_audio WHERE lid_id = ?").bind(lidId),
    db.prepare("DELETE FROM cb_reacties WHERE lid_id = ?").bind(lidId),
    db.prepare("DELETE FROM cb_gelezen WHERE lid_id = ?").bind(lidId),
    db.prepare("DELETE FROM lid_log WHERE lid_id = ?").bind(lidId),
    ...fotos.map((fid) => db.prepare("DELETE FROM forum_fotos WHERE id = ? AND lid_id = ?").bind(fid, lidId)),
  ]);
  return true;
}
