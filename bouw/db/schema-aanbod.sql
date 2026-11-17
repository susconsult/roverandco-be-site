-- D1-database roverandco-shop (binding SHOP_DB): producten en activiteiten, beheerd via /beheer (zie src/aanbod.js).
-- data = JSON met alle velden (zelfde vorm als vroeger data/activiteiten.json en de shop-producten).
CREATE TABLE IF NOT EXISTS producten (slug TEXT PRIMARY KEY, naam TEXT NOT NULL, data TEXT NOT NULL, zichtbaar INTEGER NOT NULL DEFAULT 1, volgorde INTEGER NOT NULL DEFAULT 0, bijgewerkt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activiteiten (slug TEXT PRIMARY KEY, titel TEXT NOT NULL, datum TEXT NOT NULL DEFAULT '', data TEXT NOT NULL, zichtbaar INTEGER NOT NULL DEFAULT 1, volgorde INTEGER NOT NULL DEFAULT 0, bijgewerkt TEXT NOT NULL);
-- Foto's die via /beheer opgeladen worden (in de browser verkleind), getoond op /media/<id>.
CREATE TABLE IF NOT EXISTS media (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, data BLOB NOT NULL, grootte INTEGER NOT NULL, naam TEXT, aangemaakt TEXT NOT NULL);
