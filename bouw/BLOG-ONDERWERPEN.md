# Blog Rover & Co: werkwijze en onderwerpen

Elke week komen er 2 nieuwe artikels bij:
- **dinsdag:** een technisch artikel van **Dolf Borré** (`auteur: dolf`);
- **vrijdag:** een artikel van **Pieter Van Baekel** (`auteur: pieter`).

Neem telkens het eerste onderwerp dat nog niet afgevinkt is, in de lijst van die auteur.

## Regels voor elk artikel

1. **Alleen waarheden, altijd met bronnen.** Zoek bronnen op het web en open elke bron die je gebruikt. Elk feit, cijfer en jaartal moet in een bron staan. Wat alleen in een forum of advertentie staat, schrijf je als "volgens een gebruiker op ...". Twijfel je, laat het weg. Onderaan staat altijd `## Bronnen` met links.
2. **Niets over wetgeving.** Geen O-plaat, keuring, bosdecreet, verkeersregels of waar je mag rijden.
3. **Geen claims over Rover & Co** die niet op onze eigen site of op wildandwheels.be staan.
4. **Geen dubbels.** Lees eerst de titels en beschrijvingen van alle bestaande artikels in `data/blog/`. Bestaat het onderwerp al, vink het af met "(overgeslagen: dubbel met <slug>)" en neem het volgende. Overlapt het deels, kies een eigen invalshoek en verwijs naar het bestaande artikel.
5. **Taal en toon:** Nederlands (Vlaams), "je", korte zinnen, geen streepjes als leesteken, geen opsmuk. Ongeveer 700 tot 900 woorden.
6. **Opbouw:** inleiding, tussenkoppen (`##`), minstens één foto in de tekst, `## Meer lezen` met een link naar het overzichtsartikel van die rubriek, `## Bronnen`. Gerelateerde artikels komen er automatisch onder.
7. **Rubriek:** een van Onderhoud, Geschiedenis, Land Rover in België, Community, Partners. `volgorde`: het volgende vrije nummer in die rubriek. `datum`: vandaag.

## Foto's

- Elke foto mag maar één keer als hoofdfoto gebruikt worden (veld `foto`). Kijk na welke al gebruikt zijn.
- Bij voorkeur van Wikimedia Commons (vrije licentie). Zoek het bestand, open de bestandspagina en noteer de auteur en de licentie (geen NC- of ND-licenties).
- Downloaden gaat via een standaard thumbnail van 1280 px breed: `https://upload.wikimedia.org/wikipedia/commons/thumb/<a>/<ab>/<Naam>/1280px-<Naam>`, waarbij `<a>/<ab>` de eerste 1 en 2 tekens zijn van de md5 van de bestandsnaam (spaties als `_`). Gebruik een User-Agent met contactgegevens en wacht 5 tot 15 seconden tussen downloads (Wikimedia beperkt het aantal verzoeken).
- Zet de foto om naar `public/assets/img/blog/<slug>.webp` en `<slug>-s.webp` (800 px). Een foto in de tekst wordt `public/assets/img/blog/inline-<slug>-<n>.webp` en `-s.webp`.
- Bekijk elke foto zelf voor je hem gebruikt: hij moet bij het onderwerp passen.
- Hoofdfoto: velden `foto: blog/<slug>`, `foto_alt` en `foto_credit: <auteur>, <licentie>, via <a href="<bestandspagina>" rel="noopener">Wikimedia Commons</a>`.
- Foto in de tekst: een eigen regel `[[foto: blog/inline-<slug>-1 | alt-tekst | <auteur>, <licentie>, via <a href="..." rel="noopener">Wikimedia Commons</a>]]`.
- Geen foto's van forums, nieuwssites of andere sites zonder vrije licentie. Lukt het niet, gebruik dan een eigen foto uit `public/assets/img/` (zonder credit) en meld dat in de mail.

## Onderwerpen Dolf (technisch)

- [x] Remmen van een Series: trommelremmen afstellen en ontluchten
- [x] Het koelsysteem van een klassieke Land Rover
- [ ] 200Tdi en 300Tdi: de verschillen
- [ ] De distributieriem van een Tdi
- [ ] 12 of 24 volt: de elektriciteit van een ex-legerwagen
- [ ] De Td5: bekende zwakke punten
- [ ] Parabolische of standaard bladveren
- [ ] Een lier op je Land Rover: soorten en veilig gebruik
- [ ] Banden voor een Defender: all-terrain of mud-terrain
- [ ] De tussenbak van een Land Rover: hoog en laag gearing

## Onderwerpen Pieter

- [x] De Range Rover Classic: hoe het begon
- [ ] Santana: de Spaanse Land Rover
- [ ] De Camel Trophy en de Land Rover
- [ ] De Land Rover Discovery: van 1989 tot vandaag
- [ ] De Land Rover Lightweight: een legerwagen voor onder de helikopter
- [ ] De Forward Control: de vrachtwagen van Land Rover
- [ ] Overlanding: wat is het en hoe begin je
- [ ] Daktenten: soorten en waar je op let
- [ ] De Defender in andere legers: de Wolf in Nederland en Groot-Brittannië
- [ ] De One Ten en de Ninety: de eerste jaren van de Defender
