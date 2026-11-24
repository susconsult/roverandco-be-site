import json, os, re, shutil, sys

REPO = "/home/claude/roverandco-be-site"
cr = json.load(open("/tmp/wm/img/credits.json"))

ALT = {
    "camel-trophy": "Gele Land Rover Discovery van de Camel Trophy 1990 in Siberië, met dakrek en lampen, in een museum",
    "inline-camel-trophy-1": "Tweedeurs Range Rover in Camel Trophy-kleuren met dakrek en lampenbalk",
    "inline-camel-trophy-2": "Zandgele Land Rover 110 in Camel Trophy-uitvoering met reservewiel op de motorkap",
    "inline-camel-trophy-3": "Bob en Joe Ives, winnaars van de Camel Trophy 1989, in hun Land Rover 110 met Britse vlag",
    "inline-camel-trophy-4": "Discovery Series I in Camel Trophy-kleuren met dakrek en bullbar",
    "pink-panther-land-rover": "Roze Land Rover Series IIA 109 Pink Panther van het SAS met machinegeweren in een museum",
    "inline-pink-panther-land-rover-1": "Pink Panther Land Rover met zandplaten en wapensteunen op een sokkel in een museum",
    "inline-pink-panther-land-rover-2": "Volgeladen Pink Panther Land Rover met jerrycans en uitrusting op een beurs",
    "inline-pink-panther-land-rover-3": "Latere Land Rover 110 in woestijnuitvoering met bemanning en machinegeweren op een legershow",
    "koninklijke-land-rovers": "Koningin Elizabeth II en prins Philip staand in een open Land Rover tijdens hun rondreis in Australië in 1954",
    "inline-koninklijke-land-rovers-1": "Open State Review Land Rover met haltestang achteraan, in het museum van Gaydon",
    "inline-koninklijke-land-rovers-2": "Groene Series IIA station wagon uit 1966 die koningin Elizabeth II zelf reed",
    "inline-koninklijke-land-rovers-3": "Series I 86 uit 1954 van het landgoed Balmoral",
    "lightweight": "Land Rover Series III Lightweight uit 1979 met zijn vlakke, hoekige carrosserie",
    "inline-lightweight-1": "Proefwagen van de Land Rover Lightweight zonder deuren en kap",
    "inline-lightweight-2": "Achterkant van een Series III Lightweight met huif",
    "inline-lightweight-3": "Land Rover 88 Lightweight pick-up uit 1978",
    "land-rover-101-forward-control": "Land Rover 101 Forward Control uit 1976 met huif, de cabine boven de vooras",
    "inline-land-rover-101-forward-control-1": "Land Rover 101 Forward Control uit 1975 in het museum van Gaydon",
    "inline-land-rover-101-forward-control-2": "Land Rover 101 Forward Control op een oldtimertreffen in Praag",
    "inline-land-rover-101-forward-control-3": "Land Rover 101 Forward Control met ambulance-opbouw",
    "land-rovers-in-film": "Zwarte Defender 110 SVX met grote banden uit de Bondfilm Spectre",
    "inline-land-rovers-in-film-1": "Vroege Land Rover Series I 80 inch, het soort wagen uit The Gods Must Be Crazy",
    "inline-land-rovers-in-film-2": "Volgeladen Defender 110 uit de film Lara Croft: Tomb Raider in het museum van Gaydon",
    "inline-land-rovers-in-film-3": "Defender Double Cab pick-up uit de Bondfilm Skyfall in het National Motor Museum in Beaulieu",
    "g4-challenge": "Oranje Range Rover in G4 Challenge-uitvoering",
    "inline-g4-challenge-1": "Oranje Defender 110 Td5 in G4 Challenge-uitvoering",
    "inline-g4-challenge-2": "Oranje Freelander V6 in G4 Challenge-uitvoering",
    "inline-g4-challenge-3": "Discovery in G4-uitvoering",
    "churchill-land-rover": "Land Rover Series I 86 inch uit 1954, hetzelfde type als de wagen van Churchill",
    "inline-churchill-land-rover-1": "Chartwell, het landhuis van Winston Churchill in Kent",
    "inline-churchill-land-rover-2": "Open Series I 86 uit 1954",
    "inline-churchill-land-rover-3": "Chartwell House met de tuinen eromheen",
    "first-overland": "Land Rover Series I met korte en lange wielbasis",
    "inline-first-overland-1": "Land Rover Series I uit 1956",
    "inline-first-overland-2": "Land Rover Series I 80 inch uit 1953",
    "laatste-defender-2016": "HUE 166, de eerste pre-productie Land Rover uit 1948, bijgenaamd Huey",
    "inline-laatste-defender-2016-1": "Defender 90 uit de laatste jaren van de productie",
    "inline-laatste-defender-2016-2": "Huey, de eerste pre-productie Land Rover, van dichtbij",
    "inline-laatste-defender-2016-3": "Land Rovers in het British Motor Museum in Gaydon",
}


def credit(naam):
    c = cr[naam]
    lic = c["licentie"] or "vrije licentie"
    if lic.lower() in ("public domain", "no restrictions"):
        lic = "publiek domein"
    auteur = re.sub(r"\s*\(talk\)", "", c["auteur"]) or "onbekend"
    return f'{auteur}, {lic}, via <a href="{c["pagina"]}" rel="noopener">Wikimedia Commons</a>'


for f in sorted(x for x in os.listdir("/tmp/art") if x[:-3] in cr):
    slug = f[:-3]
    s = open("/tmp/art/" + f).read()
    hoofd = (f"foto: blog/{slug}\nfoto_alt: {ALT[slug]}\nfoto_credit: {credit(slug)}")
    s = s.replace("{{HOOFD}}", hoofd)

    def fn(m):
        naam = f"inline-{slug}-{m.group(1)}"
        if naam not in cr:
            return ""
        return f"[[foto: blog/{naam} | {ALT[naam]} | {credit(naam)}]]"
    s = re.sub(r"\{\{F(\d)\}\}", fn, s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    open(f"{REPO}/data/blog/{f}", "w").write(s)
    for n in [slug] + [k for k in cr if k.startswith(f"inline-{slug}-")]:
        if n in cr:
            for suf in ("", "-s"):
                shutil.copy(f"/tmp/wm/img/{n}{suf}.webp", f"{REPO}/public/assets/img/blog/{n}{suf}.webp")
    print(slug, "ok")
