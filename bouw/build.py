#!/usr/bin/env python3
"""Bouwt de pagina's van roverandco.be naar public/.

Gebruik (vanuit de hoofdmap van de repo):  python3 bouw/build.py
Het resultaat in public/ wordt mee gecommit; Cloudflare hoeft niets te bouwen.
Inhoud staat in data/ (site.json, activiteiten.json, shop.json, ecwid/producten.json).
Vereist: Python 3 + Pillow (alleen om productfoto's te verkleinen).
"""
import json, os, re, html
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
DATA = os.path.join(ROOT, "data")

site = json.load(open(os.path.join(DATA, "site.json"), encoding="utf-8"))
alle_acts = json.load(open(os.path.join(DATA, "activiteiten.json"), encoding="utf-8"))
acts = [a for a in alle_acts if not a.get("verborgen")]  # verborgen = testactiviteit: niet in lijsten, noindex
shop = json.load(open(os.path.join(DATA, "shop.json"), encoding="utf-8"))["producten"]
ecwid = {p["ecwid_id"]: p for p in json.load(open(os.path.join(DATA, "ecwid", "producten.json"), encoding="utf-8"))}
VERSIE = date.today().isoformat()
pages = []  # voor sitemap

e = html.escape


def prijs_float(s):
    return float(str(s).replace(",", ".") or 0)


def eur(n):
    return "€" + f"{n:.2f}".replace(".", ",")


def schoon_html(h):
    """Ecwid-omschrijving opkuisen: inline stijlen, lege alinea's en spans weg."""
    h = re.sub(r"</?span\b[^>]*>", "", h)
    h = re.sub(r"<(?!a\b)(\w+)\b[^>]*>", r"<\1>", h)  # alle attributen weg, behalve bij links
    h = re.sub(r"<p>\s*(<br>)?\s*</p>", "", h)
    return h


def img(name, alt, cls="", sizes="100vw", lazy=True, prio=False):
    attrs = f'class="{cls}" ' if cls else ""
    load = ' fetchpriority="high"' if prio else (' loading="lazy"' if lazy else "")
    return (f'<img {attrs}src="/assets/img/{name}-s.webp" srcset="/assets/img/{name}-s.webp 800w, /assets/img/{name}.webp 1600w" '
            f'sizes="{sizes}" alt="{e(alt)}"{load}>')


def layout(path, title, desc, body, hero=False, noindex=False):
    menu = "".join(
        f'<li><a href="{href}"{" aria-current=\"page\"" if path == href or (href != "/" and path.startswith(href + "/")) else ""}>{e(lbl)}</a></li>'
        for lbl, href in site["menu"])
    full_title = f"{title} | Rover & Co" if path != "/" else "Rover & Co VZW | Land Rover-vereniging uit Oostham"
    canon = site["domein"] + path
    return f"""<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(full_title)}</title>
<meta name="description" content="{e(desc)}">{'<meta name="robots" content="noindex">' if noindex or path in ("/afrekenen", "/bedankt", "/404") else ""}
<link rel="canonical" href="{canon}">
<meta property="og:title" content="{e(full_title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="{site['domein']}/assets/img/964.webp">
<meta property="og:locale" content="nl_BE">
<link rel="icon" href="/favicon.png">
<link rel="preload" href="/assets/fonts/big-shoulders-display-latin-900-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css?v={VERSIE}">
</head>
<body{"" if hero else ' class="no-hero"'}>
<a class="sr-only" href="#inhoud">Naar de inhoud</a>
<header class="site">
  <div class="wrap nav">
    <a href="/" class="logo"><img src="/assets/img/logo-licht.webp" alt="Rover &amp; Co" width="84" height="84"></a>
    <ul class="menu" id="menu">{menu}</ul>
    <div class="nav-right">
      <button class="cart-btn" type="button" aria-label="Winkelmandje openen" data-open-cart>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>
        <span class="cart-count">0</span>
      </button>
      <button class="burger" type="button" aria-label="Menu" aria-controls="menu" aria-expanded="false">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
    </div>
  </div>
</header>
<main id="inhoud">
{body}
</main>
<footer class="site">
  <div class="wrap">
    <div class="foot">
      <div>
        <a href="/" class="logo"><img src="/assets/img/logo-licht.webp" alt="Rover &amp; Co" width="110" height="110" loading="lazy"></a>
        <p>Land Rover-liefhebbers samen, op plekken waar je anders niet komt.</p>
      </div>
      <div>
        <h4>Contact</h4>
        <p><a href="mailto:{site['email']}">{site['email']}</a></p>
        <p><a href="tel:{site['telefoon_link']}">{site['telefoon']}</a></p>
        <p>{'<br>'.join(e(x) for x in site['adres'])}</p>
      </div>
      <div>
        <h4>Site</h4>
        <ul>{''.join(f'<li><a href="{h}">{e(l)}</a></li>' for l, h in site['menu'])}</ul>
      </div>
      <div>
        <h4>Volg ons</h4>
        <ul><li><a href="{site['instagram']}" rel="noopener">Instagram</a></li><li><a href="{site['facebook']}" rel="noopener">Facebook</a></li></ul>
      </div>
    </div>
    <div class="legal">
      <span>{e(site['naam'])} · {site['ondernemingsnummer']} · <a href="/privacy">Privacy</a></span>
      <span>Made with love by <a href="https://susconsult.be" rel="noopener">SUS Consult</a></span>
    </div>
  </div>
</footer>
<div class="drawer-bg" data-close-cart></div>
<aside class="drawer" aria-label="Winkelmandje">
  <div class="drawer-h"><h2>Je mandje</h2><button type="button" data-close-cart aria-label="Mandje sluiten">×</button></div>
  <div class="lines" id="lines"></div>
  <div class="drawer-f">
    <div class="total"><span>Totaal</span><span id="total">€0,00</span></div>
    <a class="btn btn-solid" id="checkout" href="/afrekenen" style="width:100%;justify-content:center">Afrekenen</a>
  </div>
</aside>
<div class="lightbox" id="lightbox" role="dialog" aria-label="Foto"><button type="button" aria-label="Sluiten">×</button><img alt=""></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script src="/assets/js/site.js?v={VERSIE}" defer></script>
</body>
</html>
"""


def write(path, title, desc, body, hero=False, noindex=False):
    rel = "index.html" if path == "/" else path.strip("/") + ".html"
    out = os.path.join(PUB, rel)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w", encoding="utf-8").write(layout(path, title, desc, body, hero, noindex))
    if not noindex and path not in ("/404", "/afrekenen", "/bedankt"):
        pages.append(path)


def banner(eyebrow, title, intro="", foto=None, alt=""):
    pic = img(foto, alt, prio=True) if foto else ""
    return f'<section class="banner">{pic}<div class="wrap"><div class="eyebrow">{e(eyebrow)}</div><h1>{e(title)}</h1>{f"<p>{e(intro)}</p>" if intro else ""}</div></section>'


# ---------- productfoto's ----------
def product_fotos(p, slug):
    from PIL import Image
    d = os.path.join(PUB, "assets", "producten", slug)
    os.makedirs(d, exist_ok=True)
    out = []
    for i, f in enumerate(p["fotos"], 1):
        if not f.get("bestand"):
            continue
        src = os.path.join(ROOT, f["bestand"])
        for w, suf in ((900, "-s"), (1600, "")):
            dst = os.path.join(d, f"{i}{suf}.webp")
            if not os.path.exists(dst):
                im = Image.open(src).convert("RGB")
                im.thumbnail((w, w * 2))
                im.save(dst, "WEBP", quality=80)
        out.append(f"/assets/producten/{slug}/{i}")
    return out


producten = []
for s in shop:
    p = ecwid[s["ecwid_id"]]
    fotos = product_fotos(p, s["slug"])
    producten.append({**s, "prijs": prijs_float(p["prijs"]), "fotos": fotos, "opties": p["opties"],
                      "omschrijving": schoon_html(p["omschrijving_html"])})


def product_card(pr):
    lint = f'<span class="tag">{e(pr["lint"])}</span>' if pr["lint"] else ""
    return (f'<a class="prod" href="/shop/{pr["slug"]}"><div class="prod-img">'
            f'<img src="{pr["fotos"][0]}-s.webp" alt="{e(pr["naam"])}" loading="lazy">{lint}</div>'
            f'<div class="prod-b"><span class="eyebrow" style="font-size:12px">{e(pr["categorie"])}</span>'
            f'<h3>{e(pr["naam"])}</h3><span class="price">{eur(pr["prijs"])}</span></div></a>')


def ev_card(a, big=False):
    href = a.get("extern_url") or f"/activiteiten/{a['slug']}"
    ext = ' rel="noopener"' if a.get("extern_url") else ""
    meta = "".join(f"<span>{e(k)}</span>" for k in a["kenmerken"])
    extra = (f'<p>{e(a["kort"])}</p><div class="ev-meta">{meta}</div>'
             f'<span class="btn btn-white">{"Inschrijven" if a["inschrijven_url"] else "Meer info"}</span>') if big else f'<div class="ev-meta" style="margin:6px 0 0">{meta}</div>'
    return (f'<a href="{href}" class="ev"{ext}>{img(a["foto"], a["foto_alt"], sizes="(max-width:880px) 100vw, 50vw")}'
            f'<div class="ev-body"><span class="ev-date">{e(a["datum_label"])}</span><h3>{e(a["titel"])}</h3>{extra}</div></a>')


GALERIJ = [("730", "Defender 110 spat door de modder"), ("5644", "Series met duim omhoog"), ("905", "Defender met daktent in het bos"),
           ("968", "Colonne op een landweg"), ("815", "Series 3 in de modder"), ("publiek", "Publiek kijkt naar de modderbaan"),
           ("900", "Forward Control in het bos"), ("5739", "Zicht over de motorkap op een bospad"), ("959", "Defenders in het stof"),
           ("5577", "Defender 110 op een zandweg"), ("5511", "Nieuwe Defender in het stof"), ("5498", "Defender 110 met zwaaiende chauffeur"),
           ("870", "Series door de modder"), ("977", "Colonne Defenders in het bos"), ("964", "Defender met daktent in een stoffige bosweg"),
           ("standen", "Rally-Defenders op het festivalterrein")]


def galerij(items):
    return '<div class="gallery">' + "".join(
        f'<button type="button" data-full="/assets/img/{n}.webp" aria-label="Foto groot bekijken: {e(a)}"><img src="/assets/img/{n}-s.webp" alt="{e(a)}" loading="lazy"></button>'
        for n, a in items) + "</div>"


OVER_TEKST = ("Rover & Co is een Belgische vzw die Land Rover-liefhebbers samenbrengt. Met ritten, bijeenkomsten en evenementen "
              "maken we ruimte voor ontmoeting, avontuur en het delen van ervaringen. Het draait niet alleen om de wagens, "
              "maar vooral om de mensen, de verhalen en de community eromheen.")

# ---------- home ----------
eerst = acts[0]
home = f"""
<section class="hero" style="padding:0">
  {img("964", "Defender met daktent in een stoffige bosweg", "hero-img", prio=True)}
  <div class="wrap hero-in">
    <div class="eyebrow" style="color:#CFE3D4">Land Rover-vereniging · Oostham</div>
    <h1>Waar de weg ophoudt, begint het</h1>
    <p>We brengen Land Rover-liefhebbers samen op plekken waar je anders niet komt. Geen parkeerplaats, wel een belevenis.</p>
    <div class="ctas"><a href="/activiteiten" class="btn btn-white">Bekijk activiteiten</a><a href="/shop" class="btn btn-ghost-w">Naar de shop</a></div>
  </div>
  <a href="/activiteiten/{eerst['slug']}" class="next-pill"><small>Eerstvolgende</small><strong>{e(eerst['titel'])}</strong><span style="font-size:14px">{e(eerst['datum_label'])} · {e(eerst['locatie'])}</span></a>
</section>
<div class="strip" aria-hidden="true"><div class="strip-track">{''.join(f'<span>{e(a["titel"])}</span>·' for a in acts) * 2}<span>Series · Defender · Discovery · Range Rover</span>·{''.join(f'<span>{e(a["titel"])}</span>·' for a in acts)}<span>Series · Defender · Discovery · Range Rover</span>·</div></div>
<section>
  <div class="wrap">
    <div class="sec-head"><div><div class="eyebrow">Activiteiten</div><h2>Rij mee</h2></div><a href="/activiteiten" class="btn btn-solid">Alle activiteiten</a></div>
    <div class="events">{ev_card(acts[0], True)}<div class="ev-stack">{''.join(ev_card(a) for a in acts[1:3])}</div></div>
  </div>
</section>
<section class="gallery-sec">
  <div class="wrap">
    <div class="sec-head"><div><div class="eyebrow">Foto's</div><h2>Onderweg</h2></div><a href="/fotos" class="btn btn-ghost-w">Alle foto's</a></div>
    {galerij(GALERIJ[:12])}
  </div>
</section>
<section>
  <div class="wrap about">
    {img("5498", "Lachende chauffeur in een witte Defender", "about-img", sizes="(max-width:880px) 100vw, 50vw")}
    <div>
      <div class="eyebrow">Over ons</div>
      <h2>Voor wie liever modder dan asfalt ziet</h2>
      <p>{e(OVER_TEKST)}</p>
      <div class="pillars">
        <div class="pillar"><b>Rijden</b><span>Ritten en roadbooks op bijzondere plekken</span></div>
        <div class="pillar"><b>Ontmoeten</b><span>Klassiek of nieuw, iedereen is welkom</span></div>
        <div class="pillar"><b>Teruggeven</b><span>Opbrengst gaat terug naar de community</span></div>
      </div>
      <a href="/over-ons" class="btn btn-solid">Lees ons verhaal</a>
    </div>
  </div>
</section>
<section class="shop-sec">
  <div class="wrap">
    <div class="sec-head"><div><div class="eyebrow">Shop</div><h2>Draag het</h2></div><a href="/shop" class="btn btn-solid">Naar de shop</a></div>
    <div class="products">{''.join(product_card(p) for p in producten)}</div>
  </div>
</section>
<section class="cta-band">
  <div class="wrap">
    <div class="eyebrow">Mee op pad?</div>
    <h2>Blijf op de hoogte van de volgende rit</h2>
    <p>Volg ons op Instagram en Facebook, of schrijf je in voor een activiteit. Iedere Land Rover is welkom.</p>
    <div class="ctas" style="justify-content:center"><a href="{site['instagram']}" class="btn btn-white" rel="noopener">Instagram</a><a href="{site['facebook']}" class="btn btn-ghost-w" rel="noopener">Facebook</a></div>
  </div>
</section>"""
write("/", "Home", "Rover & Co VZW brengt Land Rover-liefhebbers samen op plekken waar je anders niet komt. Activiteiten, ritten en merch.", home, hero=True)

# ---------- activiteiten ----------
write("/activiteiten", "Activiteiten", "Ritten, meetings en evenementen van Rover & Co: Church of Rover en Wild & Wheels.",
      banner("Activiteiten", "Rij mee", "Elke activiteit is een belevenis op een bijzondere plek. Schrijf je in en rij mee.", "977", "Colonne Defenders in het bos") +
      f'<section><div class="wrap"><div class="ev-list">{"".join(ev_card(a, True) for a in acts)}</div></div></section>')

def aftellen(a):
    """Countdown-balk onder de banner, als de activiteit een 'aftellen'-veld heeft (start/einde met tijdzone)."""
    c = a.get("aftellen")
    if not c:
        return ""
    vak = lambda k, l: f'<div class="ct-vak"><b data-ct="{k}">0</b><span>{l}</span></div>'
    return (f'<section class="aftellen" data-start="{e(c["start"])}" data-einde="{e(c.get("einde", c["start"]))}">'
            f'<div class="wrap ct-in"><p class="ct-titel">Nog even geduld tot {e(a["titel"])}</p>'
            f'<div class="ct-vakken">{vak("d", "dagen")}{vak("u", "uren")}{vak("m", "minuten")}{vak("s", "seconden")}</div></div>'
            '<script>(function(){var el=document.currentScript.parentNode,s=Date.parse(el.dataset.start),n=Date.parse(el.dataset.einde),'
            't=el.querySelector(".ct-titel"),v=el.querySelector(".ct-vakken");function z(){var nu=Date.now(),r=s-nu;'
            'if(nu>=n){el.hidden=true;return}if(r<=0){t.textContent="Het is zover: we zijn bezig!";v.hidden=true;return}'
            'var d=Math.floor(r/864e5),u=Math.floor(r/36e5)%24,m=Math.floor(r/6e4)%60,c=Math.floor(r/1e3)%60;'
            'el.querySelector("[data-ct=d]").textContent=d;el.querySelector("[data-ct=u]").textContent=u;'
            'el.querySelector("[data-ct=m]").textContent=m;el.querySelector("[data-ct=s]").textContent=c;setTimeout(z,1000)}z()})();</script>'
            '</section>')


EVENT_BODY = {}


def affiche(a):
    """Affiche van de activiteit (veld 'affiche' = naam onder /assets/img/), klik = groot."""
    n = a.get("affiche")
    if not n:
        return ""
    return (f'<button type="button" class="affiche" data-full="/assets/img/{n}.webp" aria-label="Affiche groot bekijken">'
            f'<img src="/assets/img/{n}-s.webp" alt="Affiche {e(a["titel"])}" loading="lazy"></button>')


def fotoblok(a):
    """Fotogalerij op de activiteitpagina, uit het veld 'fotos' ([naam, alt] onder /assets/img/)."""
    if not a.get("fotos"):
        return ""
    return (f'<section class="gallery-sec"><div class="wrap"><div class="sec-head"><div><div class="eyebrow">Foto\'s</div>'
            f'<h2>{e(a.get("fotos_titel", "Sfeerbeelden"))}</h2></div></div>{galerij([tuple(x) for x in a["fotos"]])}</div></section>')


def inschrijving_open(a):
    i = a.get("inschrijving")
    return bool(i and i.get("open") and (not i.get("sluit") or i["sluit"] >= date.today().isoformat()))


for a in alle_acts:
    if a.get("extern_url"):
        continue
    if inschrijving_open(a):
        knop = ('<a class="btn btn-solid" href="#inschrijven" style="width:100%;justify-content:center">Inschrijven</a>'
                '<p class="note">Het formulier staat onderaan deze pagina. Je betaalt veilig online via Viva.</p>')
    else:
      knop = (f'<a class="btn btn-solid" href="{a["inschrijven_url"]}" rel="noopener" style="width:100%;justify-content:center">{e(a["inschrijven_label"])}</a>'
            '<p class="note">Inschrijven en betalen gebeurt voorlopig nog via onze huidige webshop.</p>') if a["inschrijven_url"] else \
           f'<span class="btn btn-solid" aria-disabled="true" style="width:100%;justify-content:center">{e(a["inschrijven_label"])}</span>' if a["inschrijven_label"] else ""
    body = banner(a["datum_lang"], a["titel"], a["kort"], a["foto"], a["foto_alt"]) + aftellen(a) + f"""
<section><div class="wrap detail">
  <div class="prose">{a['omschrijving_html']}</div>
  <div class="ev-side"><aside class="card"><h3>In het kort</h3><ul class="facts">
    <li><span>Datum</span><span>{e(a['datum_lang'])}</span></li>
    <li><span>Locatie</span><span>{e(a['locatie'])}</span></li>
    {f"<li><span>Uur</span><span>{e(a['uren'])}</span></li>" if a['uren'] else ''}
  </ul>{knop}</aside>{affiche(a)}</div>
</div></section>"""
    body += fotoblok(a)
    if inschrijving_open(a):
        EVENT_BODY[a["slug"]] = body  # wordt geschreven samen met het inschrijfformulier (zie onder)
        continue
    write(f"/activiteiten/{a['slug']}", a["titel"], f"{a['titel']}: {a['kort']}", body, noindex=bool(a.get("verborgen")))

# ---------- shop ----------
write("/shop", "Shop", "Merch van Rover & Co: T-shirts en emaille mok. Met elke aankoop steun je de vereniging.",
      banner("Shop", "Draag het", "Met elke aankoop steun je onze vereniging.", "5577", "Defender 110 op een zandweg") +
      f'<section class="shop-sec"><div class="wrap"><div class="products">{"".join(product_card(p) for p in producten)}</div></div></section>')

for pr in producten:
    opts = ""
    for o in pr["opties"]:
        chips = "".join(
            f'<label><input type="radio" name="{e(o["naam"])}" value="{e(v["waarde"])}" data-meer="{prijs_float(v["meerprijs"])}"{" checked" if v["standaard"] else ""}><span>{e(v["waarde"])}'
            f'{" (+" + eur(prijs_float(v["meerprijs"])) + ")" if prijs_float(v["meerprijs"]) else ""}</span></label>'
            for v in o["waarden"])
        opts += (f'<fieldset class="opt" data-optie="{e(o["naam"])}" data-verplicht="{str(o["verplicht"]).lower()}">'
                 f'<legend>{e(o["naam"])}</legend><div class="chips">{chips}</div><div class="err" aria-live="polite"></div></fieldset>')
    thumbs = "".join(
        f'<button type="button" data-src="{f}.webp" aria-label="Foto {i}" aria-current="{"true" if i == 1 else "false"}"><img src="{f}-s.webp" alt="" loading="lazy"></button>'
        for i, f in enumerate(pr["fotos"], 1))
    body = f"""
<section><div class="wrap pdp">
  <div>
    <div class="pdp-main"><img id="pdp-main" src="{pr['fotos'][0]}.webp" alt="{e(pr['naam'])}" fetchpriority="high"></div>
    <div class="thumbs">{thumbs}</div>
  </div>
  <div>
    <a href="/shop" class="eyebrow" style="text-decoration:none">← Shop</a>
    <h1>{e(pr['naam'])}</h1>
    <div class="price" id="prijs">{eur(pr['prijs'])}</div>
    <form id="product-form" data-id="{pr['slug']}" data-naam="{e(pr['naam'])}" data-prijs="{pr['prijs']}" novalidate>
      {opts}
      <div class="opt"><label for="aantal">Aantal</label><input class="qty" id="aantal" type="number" min="1" value="1"></div>
      <button class="btn btn-solid" type="submit">In mandje</button>
    </form>
    <div class="prose" style="margin-top:30px">{pr['omschrijving']}</div>
  </div>
</div></section>"""
    tekst = re.sub(r"<[^>]+>", " ", pr["omschrijving"])
    write(f"/shop/{pr['slug']}", pr["naam"], " ".join(tekst.split())[:155], body)

# ---------- blog ----------
# Artikels staan in data/blog/<slug>.md: kop met velden tussen '---', daarna Markdown.
# status: concept  -> pagina bestaat, maar noindex, niet in sitemap en niet op /blog.
# Overzicht van concepten (ook noindex, niet gelinkt): /blog/concepten
import markdown as _md
RUBRIEKEN = [("Onderhoud", "Praktische artikels om je Land Rover in topvorm te houden."),
             ("Geschiedenis", "Van de Series I uit 1948 tot vandaag."),
             ("Land Rover in België", "Minerva, ABL en de Belgische Land Rover-geschiedenis."),
             ("Community", "Ritverslagen, leden en hun wagens."),
             ("Partners", "De bedrijven en standhouders die ons steunen.")]
AUTEURS = json.load(open(os.path.join(DATA, "auteurs.json"), encoding="utf-8"))
MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]


def lees_artikel(pad):
    t = open(pad, encoding="utf-8").read()
    m = re.match(r"---\n(.*?)\n---\n(.*)", t, re.S)
    meta = {k: v.strip().strip('"') for k, v in re.findall(r"^(\w+):\s*(.*)$", m.group(1), re.M)}
    meta["slug"] = os.path.basename(pad)[:-3]
    meta["md"] = m.group(2)
    return meta


def nl_datum(d):
    j, m, dd = d.split("-")
    return f"{int(dd)} {MAANDEN[int(m) - 1]} {j}"


def auteur_blok(sleutel):
    a = AUTEURS[sleutel]
    foto = (f'<img src="/assets/img/auteurs/{a["foto"]}" alt="{e(a["naam"])}" width="64" height="64">' if a.get("foto")
            else f'<span class="initialen" aria-hidden="true">{e("".join(w[0] for w in a["naam"].split() if w[0].isupper())[:2])}</span>')
    return f'<div class="auteur">{foto}<div><b>{e(a["naam"])}</b><span>{e(a["rol"])}</span></div></div>'


artikels = sorted((lees_artikel(os.path.join(DATA, "blog", f)) for f in os.listdir(os.path.join(DATA, "blog")) if f.endswith(".md")),
                  key=lambda a: (a["rubriek"], a.get("volgorde", "9")))
for a in artikels:
    concept = a.get("status") == "concept"
    inhoud = _md.markdown(a["md"], extensions=["extra"])
    # Afbeelding in de tekst: een eigen regel [[foto: naam | alt-tekst | naamsvermelding (optioneel)]]
    def _figuur(m):
        delen = [x.strip() for x in m.group(1).split("|")]
        naam, alt = delen[0], delen[1]
        credit = delen[2] if len(delen) > 2 and delen[2] else ""
        return (f'<figure class="artikelfoto">{img(naam, alt, sizes="(max-width:880px) 100vw, 760px")}'
                + (f'<figcaption>Foto: {credit}</figcaption>' if credit else "") + "</figure>")
    inhoud = re.sub(r"<p>\[\[foto:(.*?)\]\]</p>", _figuur, inhoud)
    woorden = len(re.sub(r"<[^>]+>", " ", inhoud).split())
    a["woorden"] = woorden
    a["minuten"] = max(1, round(woorden / 220))
    a["html"] = inhoud

gepubliceerd = [a for a in artikels if a.get("status") != "concept"]


def kaart(a, groot=False):
    return (f'<a class="blogkaart{" blogkaart-groot" if groot else ""}" href="/blog/{a["slug"]}" data-rubriek="{e(a["rubriek"])}">'
            f'<img src="/assets/img/{a["foto"]}{"" if groot else "-s"}.webp" alt="{e(a["foto_alt"])}" loading="{"eager" if groot else "lazy"}">'
            f'<div class="bk-tekst"><div class="eyebrow">{e(a["rubriek"])}</div><h3>{e(a["titel"])}</h3><p>{e(a["beschrijving"])}</p>'
            f'<small>{e(AUTEURS[a["auteur"]]["naam"])} · {nl_datum(a["datum"])} · {a["minuten"]} min lezen</small></div></a>')


def gerelateerd(a, n=3):
    """Drie artikels onderaan: eerst uit dezelfde rubriek, dan aangevuld met andere rubrieken."""
    zelfde = [x for x in gepubliceerd if x is not a and x["rubriek"] == a["rubriek"]]
    zelfde.sort(key=lambda x: int(x.get("volgorde", 9)))
    eigen = int(a.get("volgorde", 9))
    zelfde = [x for x in zelfde if int(x.get("volgorde", 9)) > eigen] + [x for x in zelfde if int(x.get("volgorde", 9)) <= eigen]
    anders = [x for x in gepubliceerd if x is not a and x["rubriek"] != a["rubriek"] and x.get("cornerstone") == "ja"]
    return (zelfde + anders)[:n]


for a in artikels:
    concept = a.get("status") == "concept"
    body = f"""
<section class="banner">{img(a['foto'], a['foto_alt'], prio=True)}<div class="wrap"><div class="eyebrow">{e(a['rubriek'])}{' · Cornerstone' if a.get('cornerstone') == 'ja' else ''}</div><h1>{e(a['titel'])}</h1></div></section>
<section><article class="narrow prose blogtekst">
  {'<div class="testbanner" role="note"><strong>Concept.</strong> Dit artikel is nog niet gepubliceerd en niet zichtbaar voor zoekmachines.</div>' if concept else ''}
  <p class="artikel-meta">{nl_datum(a['datum'])} · {a['minuten']} min lezen</p>
  {a['html']}
  {f'<p class="fotocredit">Foto bovenaan: {a["foto_credit"]}</p>' if a.get('foto_credit') else ''}
  <div class="auteur-onder"><span class="auteur-label">Geschreven door</span>{auteur_blok(a['auteur'])}</div>
  <div class="schrijf-mee"><h3>Zelf een artikel schrijven?</h3><p>Heb je kennis, een verhaal of een tip over Land Rovers? Wil je zelf ook eens een artikel schrijven, laat het ons weten via <a href="mailto:{site['email']}?subject=Artikel%20voor%20de%20blog">{site['email']}</a>.</p></div>
  <p><a class="btn" href="/blog">Alle artikels</a></p>
</article></section>
<section class="gerelateerd"><div class="wrap"><h2>Lees ook</h2><div class="blogfeed">{"".join(kaart(x) for x in gerelateerd(a))}</div></div></section>"""
    write(f"/blog/{a['slug']}", a["titel"], a["beschrijving"], body, noindex=(a.get("status") == "concept"))


# Een echte blog: één tijdlijn, nieuwste eerst. Bij dezelfde datum wisselen de rubrieken elkaar af.
def blogvolgorde(lijst):
    uit = []
    for d in sorted({a["datum"] for a in lijst}, reverse=True):
        dag = [a for a in lijst if a["datum"] == d]
        per = [sorted([a for a in dag if a["rubriek"] == r], key=lambda a: int(a.get("volgorde", 9))) for r, _ in RUBRIEKEN]
        for i in range(max((len(x) for x in per), default=0)):
            uit += [x[i] for x in per if i < len(x)]
    return uit


feed = blogvolgorde(gepubliceerd)
chips = '<button type="button" class="chip actief" data-filter="">Alles</button>' + "".join(
    f'<button type="button" class="chip" data-filter="{e(r)}">{e(r)}</button>' for r, _ in RUBRIEKEN)
blogbody = banner("Blog", "Verhalen en kennis", "Onderhoud, geschiedenis, verhalen en alles rond Land Rover.", "5739", "Zicht over de motorkap op een bospad")
blogbody += '<section><div class="wrap">'
if feed:
    blogbody += kaart(feed[0], groot=True)
blogbody += f'<div class="blogfilter" role="group" aria-label="Filter op onderwerp">{chips}</div>'
blogbody += '<div class="blogfeed">' + "".join(kaart(a) for a in feed[1:]) + '</div>'
blogbody += f'<div class="schrijf-mee"><h3>Zelf een artikel schrijven?</h3><p>Wil je zelf ook eens een artikel schrijven, laat het ons weten via <a href="mailto:{site["email"]}?subject=Artikel%20voor%20de%20blog">{site["email"]}</a>.</p></div>'
blogbody += """</div></section>
<script>
document.querySelectorAll('.blogfilter .chip').forEach(function(b){b.addEventListener('click',function(){
  var f=b.getAttribute('data-filter');
  document.querySelectorAll('.blogfilter .chip').forEach(function(x){x.classList.toggle('actief',x===b)});
  document.querySelectorAll('.blogfeed .blogkaart, .blogkaart-groot').forEach(function(k){k.hidden=!!f&&k.getAttribute('data-rubriek')!==f});
})});
</script>"""
write("/blog", "Blog", "Artikels over Land Rover-onderhoud, geschiedenis, Land Rover in België (Minerva, ABL), community en partners.", blogbody)

write("/blog/concepten", "Concepten", "Overzicht van de blogconcepten.",
      banner("Blog", "Concepten ter goedkeuring", "Deze pagina is niet gelinkt en niet zichtbaar voor zoekmachines.") +
      '<section><div class="wrap"><div class="rubrieken">' + "".join(
          kaart(a).replace("</small>", f' · {a["woorden"]} woorden</small>') for a in artikels if a.get("status") == "concept") + "</div></div></section>", noindex=True)

# ---------- foto's ----------
write("/fotos", "Foto's", "Foto's van de ritten en evenementen van Rover & Co.",
      banner("Foto's", "Onderweg", "Een greep uit onze ritten en evenementen.", "968", "Colonne op een landweg") +
      f'<section class="gallery-sec"><div class="wrap">{galerij(GALERIJ)}</div></section>')

# ---------- over ons ----------
write("/over-ons", "Over ons", "Rover & Co VZW uit Oostham brengt Land Rover-liefhebbers samen. Onze missie en ons doel.",
      banner("Over ons", "Missie en doel", "", "5498", "Lachende chauffeur in een witte Defender") + f"""
<section><div class="narrow prose">
  <p>{e(OVER_TEKST)}</p>
  <p>Elk evenement wil een unieke ervaring bieden, door de locatie of door de activiteit. Geen bijeenkomst op een parkeerplaats, wel een dag rond een kerktoren, in het bos of op een terrein waar je anders niet komt.</p>
  <p>Eventuele opbrengsten uit onze activiteiten vloeien terug naar de community of naar goede doelen. We bouwen aan een open en warme werking waarin iedereen met een passie voor Land Rovers en het buitenleven welkom is.</p>
  <div class="pillars">
    <div class="pillar"><b>Rijden</b><span>Ritten en roadbooks op bijzondere plekken</span></div>
    <div class="pillar"><b>Ontmoeten</b><span>Klassiek of nieuw, iedereen is welkom</span></div>
    <div class="pillar"><b>Teruggeven</b><span>Opbrengst gaat terug naar de community</span></div>
  </div>
  <h3>Gegevens</h3>
  <p>{e(site['naam'])}<br>{'<br>'.join(e(x) for x in site['adres'])}<br>Ondernemingsnummer {site['ondernemingsnummer']}</p>
</div></section>""")

# ---------- contact ----------
write("/contact", "Contact", "Contacteer Rover & Co VZW in Oostham: e-mail, telefoon en adres.",
      banner("Contact", "Contact", "Een vraag over een activiteit of een bestelling? Laat het ons weten.", None) + f"""
<section><div class="wrap contact-grid">
  <div class="rubriek"><h3>Mail</h3><p><a href="mailto:{site['email']}">{site['email']}</a></p></div>
  <div class="rubriek"><h3>Bel</h3><p><a href="tel:{site['telefoon_link']}">{site['telefoon']}</a></p></div>
  <div class="rubriek"><h3>Adres</h3><p>{e(site['naam'])}<br>{'<br>'.join(e(x) for x in site['adres'])}</p><p><a href="https://www.google.com/maps/search/?api=1&query=Olmensesteenweg+105+3945+Oostham" rel="noopener">Routebeschrijving</a></p></div>
  <div class="rubriek"><h3>Volg ons</h3><p><a href="{site['instagram']}" rel="noopener">Instagram</a><br><a href="{site['facebook']}" rel="noopener">Facebook</a></p></div>
</div></section>""")

# ---------- privacy (concept) ----------
write("/privacy", "Privacy", "Privacyverklaring van Rover & Co VZW.",
      banner("Privacy", "Privacyverklaring", "", None) + f"""
<section><div class="narrow prose">
  <p><strong>Concept, nog na te kijken door het bestuur.</strong></p>
  <p>{e(site['naam'])} ({site['ondernemingsnummer']}, {', '.join(site['adres'])}) is verantwoordelijk voor de gegevens die je ons bezorgt.</p>
  <p>We gebruiken je naam, e-mailadres, telefoonnummer en adres alleen om je inschrijving of bestelling af te handelen en je te contacteren over onze activiteiten. We verkopen je gegevens niet.</p>
  <p>Deze website plaatst geen tracking- of advertentiecookies. Je winkelmandje wordt alleen in je eigen browser bewaard.</p>
  <p>Je kan je gegevens altijd opvragen, laten aanpassen of laten verwijderen via <a href="mailto:{site['email']}">{site['email']}</a>.</p>
</div></section>""")

# ---------- 404 ----------
write("/404", "Pagina niet gevonden", "Deze pagina bestaat niet.",
      banner("404", "Verkeerde afslag", "Deze pagina bestaat niet (meer).", None) +
      '<section><div class="narrow"><a class="btn btn-solid" href="/">Terug naar home</a></div></section>')

# ---------- catalogus voor de Worker (prijscontrole) ----------
VANDAAG = date.today().isoformat()
komend = [a for a in acts if a["datum"] and a["datum"] >= VANDAAG]
cat = {pr["slug"]: {"naam": pr["naam"], "prijs": pr["prijs"],
                    "opties": [{"naam": o["naam"], "verplicht": o["verplicht"],
                                "waarden": [{"waarde": v["waarde"], "meerprijs": prijs_float(v["meerprijs"])} for v in o["waarden"]]}
                               for o in pr["opties"]]} for pr in producten}
cat["__activiteiten"] = [f'{a["titel"]} ({a["datum_label"]})' for a in komend]
cat["__inschrijvingen"] = {
    a["slug"]: {"titel": a["titel"], "datum_label": a["datum_label"], "sluit": a["inschrijving"].get("sluit") or a["datum"],
                "onderdelen": a["inschrijving"]["onderdelen"], "tijdsloten": a["inschrijving"].get("tijdsloten"),
                "wagen": bool(a["inschrijving"].get("wagen"))}
    for a in alle_acts if inschrijving_open(a)}
os.makedirs(os.path.join(ROOT, "src"), exist_ok=True)
json.dump(cat, open(os.path.join(ROOT, "src", "catalogus.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---------- inschrijven per activiteit ----------
PER = {"persoon": "per persoon", "wagen": "per wagen", "stuk": "per stuk"}
for slug, cfg in cat["__inschrijvingen"].items():
    a = next(x for x in alle_acts if x["slug"] == slug)
    ts = cfg["tijdsloten"]
    rijen = "".join(f"""
        <div class="ins-rij" data-onderdeel="{e(o['id'])}" data-prijs="{o['prijs']}">
          <div><b>{e(o['naam'])}</b><small>{(eur(o['prijs']) + ' ' + PER.get(o['per'], '')) if o['prijs'] else 'Gratis'}{' · Beperkte plaatsen' if o.get('beperkt') or o.get('capaciteit') else ''}</small>{f'<small class="uitleg">{e(o["uitleg"])}</small>' if o.get('uitleg') else ''}</div>
          <div class="teller"><button type="button" data-min aria-label="Minder {e(o['naam'])}">−</button>
            <input type="number" name="aantal_{e(o['id'])}" value="0" min="0" max="{o.get('max', 20)}" inputmode="numeric" aria-label="Aantal {e(o['naam'])}">
            <button type="button" data-plus aria-label="Meer {e(o['naam'])}">+</button></div>
        </div>""" for o in cfg["onderdelen"])
    slot_html = ""
    if ts:
        opts = "".join(f'<option value="{e(x)}">{e(x)}</option>' for x in ts["slots"])
        slot_html = f"""
        <div class="sub" data-slot-voor="{e(ts['onderdeel'])}" hidden><label for="tijdslot">Kies je tijdslot</label>
          <select id="tijdslot" name="tijdslot"><option value="">Kies een tijdslot</option>{opts}</select><div class="err" data-voor="tijdslot"></div></div>"""
    wagen_html = """
      <fieldset class="co-blok"><legend><span>3</span> Je Land Rover <small>(optioneel)</small></legend>
        <div class="veld"><label for="wagen">Met welke Land Rover kom je?</label><input id="wagen" name="wagen" placeholder="Bv. Defender 110, 1998"></div>
      </fieldset>""" if cfg["wagen"] else ""
    nr_opm = 4 if cfg["wagen"] else 3
    body = EVENT_BODY[slug] + f"""
<section id="inschrijven" class="inschrijf-sec"><div class="wrap">
  <div class="sec-head"><div><div class="eyebrow">Inschrijven</div><h2>Schrijf je in voor {e(a['titel'])}</h2></div></div>
  <form id="inschrijf-form" class="checkout" novalidate data-slug="{e(slug)}">
    <div class="co-main">
      <fieldset class="co-blok"><legend><span>1</span> Jouw gegevens</legend>
        <div class="veld"><label for="naam">Voor- en achternaam</label><input id="naam" name="naam" autocomplete="name" required><div class="err" data-voor="naam"></div></div>
        <div class="veld2">
          <div class="veld"><label for="email">E-mailadres</label><input id="email" name="email" type="email" autocomplete="email" required><div class="err" data-voor="email"></div></div>
          <div class="veld"><label for="telefoon">Telefoon</label><input id="telefoon" name="telefoon" type="tel" autocomplete="tel" required><div class="err" data-voor="telefoon"></div></div>
        </div>
      </fieldset>
      <fieldset class="co-blok"><legend><span>2</span> Waarvoor schrijf je in?</legend>{rijen}
        <div class="err" data-voor="aantal"></div>{slot_html}
      </fieldset>{wagen_html}
      <fieldset class="co-blok"><legend><span>{nr_opm}</span> Opmerking <small>(optioneel)</small></legend>
        <div class="veld"><label for="opmerking" class="sr-only">Opmerking</label><textarea id="opmerking" name="opmerking" rows="3"></textarea></div>
      </fieldset>
      <div class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
    </div>
    <aside class="co-side">
      <div class="card">
        <h3>Overzicht</h3>
        <ul class="facts">
          <li><span>Activiteit</span><span>{e(a['titel'])}</span></li>
          <li><span>Datum</span><span>{e(a['datum_lang'])}</span></li>
        </ul>
        <div id="co-lijnen"></div>
        <ul class="facts"><li class="co-totaal"><span>Totaal</span><span id="co-totaal">€0,00</span></li></ul>
        <label class="akkoord"><input type="checkbox" id="akkoord" name="akkoord"> Ik ga akkoord met de <a href="/privacy">privacyverklaring</a>.</label>
        <div class="err" data-voor="akkoord"></div>
        <button class="btn btn-solid" type="submit" id="co-knop" style="width:100%;justify-content:center">Verder naar betalen</button>
        <div class="err" id="co-fout" role="alert"></div>
        <p class="note">Je betaalt veilig online via Viva. Daarna krijg je een bevestiging per mail.</p>
      </div>
    </aside>
  </form>
</div></section>"""
    write(f"/activiteiten/{slug}", a["titel"], f"{a['titel']}: {a['kort']}", body, noindex=bool(a.get("verborgen")))
    # Oud adres /inschrijven blijft werken: doorsturen naar het formulier op de eventpagina.
    doel = f"/activiteiten/{slug}#inschrijven"
    out = os.path.join(PUB, "activiteiten", slug, "inschrijven.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w", encoding="utf-8").write(
        f'<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="robots" content="noindex">'
        f'<meta http-equiv="refresh" content="0; url={doel}"><link rel="canonical" href="{site["domein"]}/activiteiten/{slug}">'
        f'<title>Inschrijven: {e(a["titel"])}</title><script>location.replace("{doel}")</script></head>'
        f'<body><a href="{doel}">Naar het inschrijfformulier</a></body></html>')

# ---------- afrekenen ----------
act_opts = "".join(f'<option value="{e(x)}">{e(x)}</option>' for x in cat["__activiteiten"])
afrekenen = banner("Shop", "Afrekenen", "", None) + f"""
<section><div class="wrap">
  <form id="checkout-form" class="checkout" novalidate data-verzendkost="7.5" data-gratis-vanaf="100">
    <div class="co-main">
      <div class="co-leeg" id="co-leeg" hidden><p>Je mandje is leeg.</p><a class="btn btn-solid" href="/shop">Naar de shop</a></div>
      <fieldset class="co-blok"><legend><span>1</span> Jouw gegevens</legend>
        <div class="veld"><label for="naam">Voor- en achternaam</label><input id="naam" name="naam" autocomplete="name" required><div class="err" data-voor="naam"></div></div>
        <div class="veld2">
          <div class="veld"><label for="email">E-mailadres</label><input id="email" name="email" type="email" autocomplete="email" required><div class="err" data-voor="email"></div></div>
          <div class="veld"><label for="telefoon">Telefoon</label><input id="telefoon" name="telefoon" type="tel" autocomplete="tel" required><div class="err" data-voor="telefoon"></div></div>
        </div>
      </fieldset>
      <fieldset class="co-blok"><legend><span>2</span> Levering</legend>
        <label class="keuze"><input type="radio" name="levering" value="activiteit" checked><span><b>Ophalen op een activiteit</b><small>Gratis</small></span></label>
        <div class="sub" data-toon="activiteit"><label for="activiteit">Op welke activiteit?</label><select id="activiteit" name="activiteit">{act_opts}</select><div class="err" data-voor="activiteit"></div></div>
        <label class="keuze"><input type="radio" name="levering" value="oostham"><span><b>Ophalen in Oostham</b><small>Gratis, op afspraak. Olmensesteenweg 105, 3945 Oostham</small></span></label>
        <label class="keuze"><input type="radio" name="levering" value="verzenden"><span><b>Verzenden</b><small>€7,50 · gratis vanaf €100</small></span></label>
        <div class="sub" data-toon="verzenden" hidden>
          <div class="veld"><label for="straat">Straat en nummer</label><input id="straat" name="straat" autocomplete="street-address"><div class="err" data-voor="straat"></div></div>
          <div class="veld2">
            <div class="veld"><label for="postcode">Postcode</label><input id="postcode" name="postcode" autocomplete="postal-code"><div class="err" data-voor="postcode"></div></div>
            <div class="veld"><label for="gemeente">Gemeente</label><input id="gemeente" name="gemeente" autocomplete="address-level2"><div class="err" data-voor="gemeente"></div></div>
          </div>
          <div class="veld"><label for="land">Land</label><select id="land" name="land" autocomplete="country"><option value="BE">België</option><option value="NL">Nederland</option></select></div>
        </div>
      </fieldset>
      <fieldset class="co-blok"><legend><span>3</span> Steun ons <small>(optioneel)</small></legend>
        <p class="note" style="margin:0 0 12px">Een extra bedrag gaat volledig naar de werking van de vzw.</p>
        <div class="chips">
          <label><input type="radio" name="donatie" value="geen" checked><span>Geen</span></label>
          <label><input type="radio" name="donatie" value="10"><span>10%</span></label>
          <label><input type="radio" name="donatie" value="15"><span>15%</span></label>
          <label><input type="radio" name="donatie" value="eigen"><span>Eigen bedrag</span></label>
        </div>
        <div class="sub" data-toon="eigen" hidden><label for="donatie_bedrag">Bedrag in euro</label><input id="donatie_bedrag" name="donatie_bedrag" type="number" min="1" step="1" inputmode="decimal"><div class="err" data-voor="donatie_bedrag"></div></div>
      </fieldset>
      <fieldset class="co-blok"><legend><span>4</span> Opmerking <small>(optioneel)</small></legend>
        <div class="veld"><label for="opmerking" class="sr-only">Opmerking</label><textarea id="opmerking" name="opmerking" rows="3"></textarea></div>
      </fieldset>
      <div class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
    </div>
    <aside class="co-side">
      <div class="card">
        <h3>Overzicht</h3>
        <div id="co-lijnen"></div>
        <ul class="facts">
          <li><span>Subtotaal</span><span id="co-subtotaal">€0,00</span></li>
          <li><span>Verzending</span><span id="co-verzending">€0,00</span></li>
          <li><span>Steun</span><span id="co-donatie">€0,00</span></li>
          <li class="co-totaal"><span>Totaal</span><span id="co-totaal">€0,00</span></li>
        </ul>
        <label class="akkoord"><input type="checkbox" id="akkoord" name="akkoord"> Ik ga akkoord met de <a href="/privacy">privacyverklaring</a>.</label>
        <div class="err" data-voor="akkoord"></div>
        <button class="btn btn-solid" type="submit" id="co-knop" style="width:100%;justify-content:center">Verder naar betalen</button>
        <div class="err" id="co-fout" role="alert"></div>
        <p class="note">Je betaalt veilig online via Viva. Daarna krijg je een bevestiging per mail.</p>
      </div>
    </aside>
  </form>
</div></section>"""
write("/afrekenen", "Afrekenen", "Rond je bestelling bij Rover & Co af.", afrekenen)

write("/bedankt", "Bedankt", "Bedankt voor je bestelling of inschrijving bij Rover & Co.",
      banner("Rover & Co", "Bedankt!", "", None) + """
<section><div class="narrow prose" id="bedankt" data-status="">
  <div class="testbanner" role="note" data-toon-als="test" hidden><strong>Test.</strong> Er werd niets aangerekend.</div>
  <p data-toon-als="betaald" hidden>Je betaling is gelukt. Je nummer is <strong class="bedankt-nr">–</strong>. Je krijgt zo meteen een bevestiging per mail.</p>
  <p data-toon-als="verwerking" hidden>We hebben je betaling nog niet definitief binnen. Dat kan een paar minuten duren. Zodra ze binnen is, krijg je een bevestiging per mail.<span data-met-nr> Je nummer is <strong class="bedankt-nr">–</strong>.</span></p>
  <p data-toon-als="bevestigd" hidden>Je inschrijving is bevestigd. Je nummer is <strong class="bedankt-nr">–</strong>. Je krijgt zo meteen een bevestiging per mail.</p>
  <p data-toon-als="test" hidden>We hebben je gegevens goed ontvangen. Je nummer is <strong class="bedankt-nr">–</strong>.</p>
  <p>Vragen? Mail naar <a href="mailto:info@roverandco.be">info@roverandco.be</a> en vermeld je nummer.</p>
  <p><a class="btn btn-solid" href="/">Terug naar home</a></p>
</div></section>""", noindex=True)

write("/betaling-mislukt", "Betaling niet gelukt", "De betaling bij Rover & Co is niet gelukt.",
      banner("Rover & Co", "Betaling niet gelukt", "", None) + """
<section><div class="narrow prose">
  <p>Je betaling is niet gelukt of je hebt ze geannuleerd. Er is niets aangerekend.</p>
  <p>Je gegevens staan nog klaar. Je kan het meteen opnieuw proberen.</p>
  <p><a class="btn btn-solid" id="opnieuw" href="/afrekenen">Opnieuw proberen</a></p>
  <p>Lukt het niet? Mail naar <a href="mailto:info@roverandco.be">info@roverandco.be</a>.</p>
</div></section>""", noindex=True)

# ---------- sitemap + robots ----------
sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + \
     "".join(f"  <url><loc>{site['domein']}{p}</loc><lastmod>{VERSIE}</lastmod></url>\n" for p in pages) + "</urlset>\n"
open(os.path.join(PUB, "sitemap.xml"), "w").write(sm)
open(os.path.join(PUB, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nDisallow: /planner\nSitemap: {site['domein']}/sitemap.xml\n")
print(f"{len(pages)} pagina's gebouwd + 404, sitemap en robots.txt")
