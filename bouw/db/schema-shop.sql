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
