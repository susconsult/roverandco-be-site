-- D1-database roverandco-shop (binding SHOP_DB): de bedrijvengids op /gids (src/lib/gids.js, beheer: src/lib/beheer-gids.js).
-- Veilig om opnieuw uit te voeren (IF NOT EXISTS). Daarna eenmalig bouw/db/zaai-gids.sql.

-- Eén rij per zaak. data = JSON met naam, categorieen, gemeente, provincie, land, telefoon, website, adres, postcode,
-- email, openingsuren, omschrijving, fotos, zoektermen, locatie_bron, sponsor {van, tot, taken}.
-- eigenaar_lid_id = lid dat de zaak claimde (na goedkeuring) en de pagina zelf mag aanpassen.
CREATE TABLE IF NOT EXISTS gids_zaken (
  slug TEXT PRIMARY KEY, naam TEXT NOT NULL, data TEXT NOT NULL, lat REAL, lon REAL,
  zichtbaar INTEGER NOT NULL DEFAULT 1, volgorde INTEGER NOT NULL DEFAULT 0, eigenaar_lid_id INTEGER, bijgewerkt TEXT NOT NULL
);
-- Tellers per zaak, soort en maand (geen persoonsgegevens, geen cookies). soort: bekeken, bel, route, website, mail, meerinfo.
-- slug '_gids' telt het overzicht zelf (bekeken, zoek).
CREATE TABLE IF NOT EXISTS gids_kliks (slug TEXT NOT NULL, soort TEXT NOT NULL, maand TEXT NOT NULL, aantal INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (slug, soort, maand));
-- Ervaringen van leden (één per lid per zaak; verborgen = door de beheerder weggehaald).
CREATE TABLE IF NOT EXISTS gids_ervaringen (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, lid_id INTEGER NOT NULL, tekst TEXT NOT NULL,
  aangemaakt TEXT NOT NULL, bewerkt_op TEXT, verborgen INTEGER NOT NULL DEFAULT 0, UNIQUE (slug, lid_id)
);
-- Aanvragen: soort 'claim' (dit is mijn zaak) of 'voorstel' (een lid stelt een zaak voor). status: open, goed, af.
CREATE TABLE IF NOT EXISTS gids_aanvragen (
  id INTEGER PRIMARY KEY AUTOINCREMENT, soort TEXT NOT NULL, slug TEXT, lid_id INTEGER NOT NULL, data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', aangemaakt TEXT NOT NULL, behandeld_op TEXT
);
CREATE INDEX IF NOT EXISTS idx_gids_aanvragen_status ON gids_aanvragen(status, aangemaakt);
