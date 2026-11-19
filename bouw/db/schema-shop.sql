-- D1-database roverandco-shop (binding SHOP_DB): bestellingen en inschrijvingen van de website.
CREATE TABLE IF NOT EXISTS registraties (
  nummer TEXT PRIMARY KEY,
  soort TEXT NOT NULL CHECK (soort IN ('bestelling','inschrijving')),
  aangemaakt TEXT NOT NULL,
  bijgewerkt TEXT NOT NULL,
  test INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  naam TEXT, email TEXT, telefoon TEXT,
  activiteit TEXT,
  tijdslot TEXT, slot_personen INTEGER DEFAULT 0,
  totaal REAL NOT NULL DEFAULT 0,
  viva_ordercode TEXT, transactie TEXT, betaald_op TEXT,
  mail_klant TEXT, afgehandeld INTEGER NOT NULL DEFAULT 0, notitie TEXT,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reg_ordercode ON registraties(viva_ordercode);
CREATE INDEX IF NOT EXISTS idx_reg_activiteit ON registraties(activiteit, status);
CREATE INDEX IF NOT EXISTS idx_reg_aangemaakt ON registraties(soort, aangemaakt);

-- Login voor /beheer: code per mail (10 min geldig, max 5 pogingen) en sessies (30 dagen).
CREATE TABLE IF NOT EXISTS beheer_codes (email TEXT NOT NULL, code_hash TEXT NOT NULL, aangemaakt INTEGER NOT NULL, verloopt INTEGER NOT NULL, pogingen INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_codes_email ON beheer_codes(email, aangemaakt);
CREATE TABLE IF NOT EXISTS beheer_sessies (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, verloopt INTEGER NOT NULL);
-- Instellingen (sleutel/waarde), o.a. onderhoud = aan/uit (src/lib/onderhoud.js)
CREATE TABLE IF NOT EXISTS instellingen (sleutel TEXT PRIMARY KEY, waarde TEXT NOT NULL);
