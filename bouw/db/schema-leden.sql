-- D1-database roverandco-shop (binding SHOP_DB): leden (accounts) en het forum.
-- Uitvoeren na schema-shop.sql. Veilig om opnieuw uit te voeren (IF NOT EXISTS), behalve de ALTER onderaan.

-- Leden. gebruikersnaam en wachtwoord zijn leeg bij een account dat automatisch werd aangemaakt
-- bij een bestelling of inschrijving; die worden ingevuld via de mail "Kies je wachtwoord".
CREATE TABLE IF NOT EXISTS leden (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  gebruikersnaam TEXT UNIQUE COLLATE NOCASE,
  wachtwoord TEXT,
  naam TEXT, telefoon TEXT, woonplaats TEXT, landrover TEXT,
  avatar_id INTEGER,
  aangemaakt TEXT NOT NULL,
  bevestigd_op TEXT,
  auto INTEGER NOT NULL DEFAULT 0,
  geblokkeerd INTEGER NOT NULL DEFAULT 0,
  fout_teller INTEGER NOT NULL DEFAULT 0,
  fout_tot INTEGER NOT NULL DEFAULT 0,
  laatst_gezien TEXT
);
CREATE TABLE IF NOT EXISTS lid_sessies (token_hash TEXT PRIMARY KEY, lid_id INTEGER NOT NULL, verloopt INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lid_sessies_lid ON lid_sessies(lid_id);
-- Eenmalige links per mail: soort = 'bevestig' (mailadres) of 'wachtwoord' (wachtwoord kiezen/vergeten).
CREATE TABLE IF NOT EXISTS lid_tokens (token_hash TEXT PRIMARY KEY, lid_id INTEGER NOT NULL, soort TEXT NOT NULL, verloopt INTEGER NOT NULL, aangemaakt INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_lid_tokens_lid ON lid_tokens(lid_id, soort);

-- Forum
CREATE TABLE IF NOT EXISTS forum_categorieen (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, groep TEXT NOT NULL,
  naam TEXT NOT NULL, omschrijving TEXT, icoon TEXT, volgorde INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS forum_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT, categorie_id INTEGER NOT NULL, titel TEXT NOT NULL, lid_id INTEGER NOT NULL,
  aangemaakt TEXT NOT NULL, laatste_op TEXT NOT NULL, laatste_lid_id INTEGER, berichten INTEGER NOT NULL DEFAULT 0,
  vast INTEGER NOT NULL DEFAULT 0, gesloten INTEGER NOT NULL DEFAULT 0, verwijderd INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_topics_cat ON forum_topics(categorie_id, verwijderd, vast, laatste_op);
CREATE TABLE IF NOT EXISTS forum_berichten (
  id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id INTEGER NOT NULL, lid_id INTEGER NOT NULL, tekst TEXT NOT NULL,
  aangemaakt TEXT NOT NULL, bewerkt_op TEXT, verwijderd INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_berichten_topic ON forum_berichten(topic_id, id);
CREATE INDEX IF NOT EXISTS idx_berichten_lid ON forum_berichten(lid_id, aangemaakt);
-- Foto's (verkleind in de browser, max ~1,5 MB) voor berichten en avatars.
CREATE TABLE IF NOT EXISTS forum_fotos (id INTEGER PRIMARY KEY AUTOINCREMENT, lid_id INTEGER NOT NULL, type TEXT NOT NULL, data BLOB NOT NULL, grootte INTEGER NOT NULL, aangemaakt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_fotos_lid ON forum_fotos(lid_id, aangemaakt);
CREATE TABLE IF NOT EXISTS forum_gelezen (lid_id INTEGER NOT NULL, topic_id INTEGER NOT NULL, op TEXT NOT NULL, PRIMARY KEY (lid_id, topic_id));
CREATE TABLE IF NOT EXISTS forum_meldingen (id INTEGER PRIMARY KEY AUTOINCREMENT, bericht_id INTEGER NOT NULL, lid_id INTEGER, ip_hash TEXT, reden TEXT, aangemaakt TEXT NOT NULL, afgehandeld INTEGER NOT NULL DEFAULT 0);

INSERT OR IGNORE INTO forum_categorieen (slug, groep, naam, omschrijving, icoon, volgorde) VALUES
 ('series', 'Techniek', 'Series I, II en III', 'Herstellen, onderdelen en vragen over de Series', 'tool', 10),
 ('defender', 'Techniek', 'Defender 90, 110 en 130', 'Tdi, Td5, Puma en alles daartussen', 'tool', 20),
 ('discovery-range-rover', 'Techniek', 'Discovery en Range Rover', 'Classic, P38, Disco 1 tot 4 en verder', 'tool', 30),
 ('elektriciteit-ombouw', 'Techniek', 'Elektriciteit en ombouw', 'Bedrading, verlichting, lieren, daktenten en inbouw', 'bolt', 40),
 ('ritten', 'Club', 'Ritten en activiteiten', 'Afspreken, carpoolen en verslagen van ritten', 'calendar', 50),
 ('te-koop', 'Club', 'Te koop / gezocht', 'Onderdelen, wagens en materiaal', 'tag', 60),
 ('cafe', 'Club', 'Café', 'Over alles en niks', 'message', 70);

-- Bestellingen en inschrijvingen koppelen aan een lid (eenmalig uitvoeren).
ALTER TABLE registraties ADD COLUMN lid_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_reg_lid ON registraties(lid_id);
