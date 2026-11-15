# roverandco-be-site

Nieuwe website + webshop van **Rover & Co VZW** (roverandco.be), gebouwd als wolfpakket (Cloudflare Worker `roverandco-be-site`, statische site).

## Stand (15 november 2026)

- Eerste versie van de site staat in `public/` en draait op `roverandco-be-site.pieter-2d7.workers.dev`. Het domein roverandco.be hangt er nog **niet** aan (draait nog op Ecwid).
- Design wordt nog verfijnd. Daarna: Viva-betalingen, inschrijvingen, database en admin (dan overstap naar Astro, afgesproken met Pieter).
- Ecwid (huidige shop) is volledig geëxporteerd. Productgegevens en productfoto's staan hier, klant- en bestelgegevens **niet** (zie onder).

## Pagina's

| Adres | Inhoud |
|---|---|
| `/` | Home: hero, activiteiten, foto's, over ons, shop, oproep sociale media |
| `/activiteiten`, `/activiteiten/<slug>` | Overzicht + detail per activiteit (uit `data/activiteiten.json`) |
| `/shop`, `/shop/<slug>` | 4 bestsellers + productpagina met opties en mandje (uit `data/shop.json` + `data/ecwid/producten.json`) |
| `/blog` | Rubrieken, artikels volgen |
| `/fotos` | Fotogalerij met vergroting |
| `/over-ons`, `/contact`, `/privacy` | Info. Privacy is een **concept**, na te kijken door het bestuur |
| `404.html` | Eigen 404-pagina |

## Hoe het gebouwd wordt

- Gewone statische HTML, geen framework. Cloudflare bouwt niets: elke push naar `main` publiceert `public/` (Worker `roverandco-be-site`, instellingen in `wrangler.jsonc`).
- Header, footer en de pagina's worden gemaakt door `bouw/build.py` uit de bestanden in `data/`. Na een wijziging in `data/` of `bouw/`: `python3 bouw/build.py` draaien en het resultaat in `public/` mee committen. (Vereist Python 3 + Pillow.)
- CSS: `public/assets/css/site.css`, JS: `public/assets/js/site.js`. Lettertypes (Big Shoulders Display, Manrope) staan zelf op de site, dus geen Google Fonts en geen cookiebanner nodig.
- Huisregel logo: de wolfjes zijn altijd licht. Logo = `public/assets/img/logo-licht.webp` (600 × 600, vector ontbreekt nog).

## Wat (nog) niet werkt

- **Afrekenen:** het mandje werkt (bewaard in de browser), maar betalen nog niet. De knop meldt dat Viva binnenkort komt.
- **Inschrijven:** de knop bij Church of Rover verwijst naar de huidige Ecwid-shop. Zodra roverandco.be naar deze site verhuist, werkt die link niet meer en moet de eigen inschrijving klaar zijn.
- Geen contactformulier, geen meetscripts.

## Wat staat waar

| Wat | Waar | Opmerking |
|---|---|---|
| Productcatalogus (Ecwid-export, origineel) | `data/ecwid/catalog_2026-11-15.csv` | 18 producten, 175 optieregels, 2 categorieën. Scheidingsteken `;` |
| Productcatalogus (gestructureerd) | `data/ecwid/producten.json` | per product: naam, prijs, opties met waarden en meerprijs, omschrijving (HTML), SEO, foto's |
| Productfoto's (origineel formaat) | `data/ecwid/fotos/<ecwid-id>_<naam>/` | 81 foto's. `manifest.json` koppelt elk bestand aan zijn Ecwid-URL |
| Klanten, bestellingen, bestsellers | Google Drive, KLANTEN → Rover&Co → *Ecwid export 2026-11-15* (account pieter@susconsult.be) | Persoonsgegevens: **nooit in deze repo** |
| Ecwid-beheer | my.ecwid.com, winkel-ID 128924077 | |

## Controle van de export

- 182 bestellingen (196 artikelregels), totaal € 13 804,70: gelijk aan het totaal in Ecwid.
- 166 klanten; elk e-mailadres uit de bestellingen staat in de klantenlijst.
- 82 fotolinks in de catalogus, 81 gedownload. Eén link is in Ecwid zelf kapot (`images-tmp/.../5518504012.png`, uitgeschakeld Wool & Wheels T-shirt).
- In de bestellingen staat "Shepherd's Trail T-Shirt" (1 verkocht); dat product bestaat niet meer in de catalogus.
- Ecwid exporteert geen productvariaties (combinaties met eigen prijs of voorraad); opties met meerprijs zitten wel in de export.

## Gepland

- Webshop met inschrijvingen en merch, betalen via Viva (Smart Checkout).
- Eigen database (Cloudflare D1) met producten, klanten en volledige bestelgeschiedenis uit Ecwid, te beheren via een admin-pagina.
