# roverandco-be-site

Nieuwe website + webshop van **Rover & Co VZW** (roverandco.be), gebouwd als wolfpakket (Cloudflare Worker `roverandco-be-site`, statische site).

## Stand (15 november 2026)

- Homepage-ontwerp in afwerking, nog niet in deze repo.
- Ecwid (huidige shop) is volledig geëxporteerd. Productgegevens en productfoto's staan hier, klant- en bestelgegevens **niet** (zie onder).

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
