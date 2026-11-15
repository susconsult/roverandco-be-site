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
| `/blog`, `/blog/<slug>` | Tijdlijn met uitgelicht artikel en filter per rubriek, 31 artikels |
| `/fotos` | Fotogalerij met vergroting |
| `/over-ons`, `/contact`, `/privacy` | Info. Privacy is een **concept**, na te kijken door het bestuur |
| `404.html` | Eigen 404-pagina |

## Hoe het gebouwd wordt

- Gewone statische HTML, geen framework. Cloudflare bouwt niets: elke push naar `main` publiceert `public/` (Worker `roverandco-be-site`, instellingen in `wrangler.jsonc`).
- Header, footer en de pagina's worden gemaakt door `bouw/build.py` uit de bestanden in `data/`. Na een wijziging in `data/` of `bouw/`: `python3 bouw/build.py` draaien en het resultaat in `public/` mee committen. (Vereist Python 3 + Pillow.)
- CSS: `public/assets/css/site.css`, JS: `public/assets/js/site.js`. Lettertypes (Big Shoulders Display, Manrope) staan zelf op de site, dus geen Google Fonts en geen cookiebanner nodig.
- Huisregel logo: de wolfjes zijn altijd licht. Logo = `public/assets/img/logo-licht.webp` (600 × 600, vector ontbreekt nog).

## Bestellen en inschrijven (betalen via Viva Smart Checkout)

**Flow (shop én activiteiten):** formulier → Worker herrekent de prijs en bewaart eerst in de sheet ("Wacht op betaling") → Viva-betaalorder → bezoeker betaalt op Viva → terug op `/betaald` → Worker vraagt bij Viva na of er echt betaald is (status F, bedrag, ordernummer) → sheet "Betaald" → mail naar klant + melding naar pieter@roverandco.be → `/bedankt`. Viva stuurt ook een webhook naar `/api/viva/webhook` als vangnet (als de browser sluit voor de terugkeer). Opnieuw verwerken is veilig: niets gebeurt dubbel.

- **Shop:** `/afrekenen` (één pagina): gegevens, levering (ophalen op activiteit / in Oostham / verzenden €7,50, gratis vanaf €100), steun (geen, 10%, 15%, eigen bedrag), opmerking, privacy. Nummer `RC-JJMMDD-XXXXX`. Het mandje blijft staan tot de betaling gelukt is.
- **Inschrijven:** `/activiteiten/<slug>/inschrijven`, alleen voor activiteiten met een blok `inschrijving` in `data/activiteiten.json` (`open`, `sluit`, `onderdelen` met `prijs` en `per` persoon/wagen/stuk en `max`, optioneel `tijdsloten` met `max_per_slot`, optioneel `wagen`). Nummer `RI-JJMMDD-XXXXX`. Een plaats in een tijdslot wordt 15 minuten vastgehouden tijdens het betalen.
- **Testactiviteit:** `/activiteiten/testinschrijving` (verborgen, noindex, nergens gelinkt, €1 + €0,50) om live te testen. Weghalen na de test: het blok uit `data/activiteiten.json` en opnieuw bouwen.
- `/betaling-mislukt`: bij annuleren of mislukken, met knop terug naar het formulier.
- Prijzen uit de browser worden nooit vertrouwd (`src/catalogus.json`, gemaakt door `bouw/build.py`). Spam-val: onzichtbaar veld `website`.
- **Testmodus:** zolang de Viva-Secrets ontbreken, wordt niet betaald en is alles gemarkeerd als test (alleen melding naar Pieter, geen mail naar de klant).

**Google Sheet** "Rover & Co – Webshop bestellingen" in Drive KLANTEN → Rover&Co (pieter@susconsult.be), tabbladen *Bestellingen* en *Inschrijvingen* (maakt het script zelf). Script: `bouw/apps-script/Bestellingen.gs`. Na elke wijziging: nieuwe versie van de implementatie publiceren.
- Bevestiging naar de klant vertrekt van **noreply@roverandco.be** (naam "Rover & Co VZW", antwoorden naar info@roverandco.be). Dat adres moet in Gmail van pieter@susconsult.be als "Verzenden als" staan; anders gaat er geen klantmail en staat de reden in de kolom *Mail klant*.

**Cloudflare-Secrets** (Worker → Settings → Variables and Secrets): `APPS_SCRIPT_URL`, `VIVA_CLIENT_ID`, `VIVA_CLIENT_SECRET` (Smart Checkout-gegevens), `VIVA_SOURCE_CODE` (4 cijfers van de betaalbron), `VIVA_WEBHOOK_KEY`. Optioneel `VIVA_OMGEVING` = `demo`.

**In Viva** (live account Rover & Co VZW): betaalbron met domein van de site, succes-URL `betaald`, fout-URL `betaling-mislukt`; webhook "Transaction Payment Created" naar `/api/viva/webhook`. Bij de verhuis naar roverandco.be: domein in de betaalbron en het webhookadres aanpassen.

## Wat (nog) niet werkt

- **Betalen:** gebouwd, wacht op de Viva-Secrets en een live test.
- **Inschrijven:** Church of Rover blijft via de huidige Ecwid-shop (gekozen door Pieter). Nieuwe activiteiten krijgen een blok `inschrijving`.
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

## Blog

- Artikels staan in `data/blog/<slug>.md`: een kop met velden tussen `---`, daarna Markdown. `python3 bouw/build.py` maakt er `/blog/<slug>` van.
- Velden: `titel`, `rubriek`, `volgorde`, `auteur` (sleutel uit `data/auteurs.json`), `datum`, `status`, `beschrijving`, `foto` (naam uit `public/assets/img`), `foto_alt`, optioneel `cornerstone: ja`.
- `status: concept`: de pagina bestaat, maar met noindex, niet in de sitemap en niet op /blog. Alle concepten staan op `/blog/concepten` (niet gelinkt, noindex). Publiceren = de regel `status: concept` weghalen en opnieuw bouwen.
- Auteurs: technische en historische artikels onder Dolf Borré, de rest onder Pieter Van Baekel. Een auteursfoto komt in `public/assets/img/auteurs/` en de bestandsnaam in `data/auteurs.json` (veld `foto`). Zolang er geen foto is, tonen we de initialen.
- Elk artikel heeft bronnen onderaan (`## Bronnen`). Alleen feiten die in een bron staan.
- Stand: 31 artikels live in 5 rubrieken (Land Rover in België, Onderhoud, Geschiedenis, Community, Partners).
- Regels: niets over wetgeving (O-plaat, keuring, bosdecreet, waar je mag rijden), geen claims over hoe Rover & Co rijdt. Dolf Borré schrijft ongeveer 30%, altijd de technische artikels. Info over partners alleen van hun eigen website. Nalees- en meldingsmails gaan naar pieter@roverandco.be.
