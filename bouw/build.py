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
import hashlib as _h
VERSIE = _h.sha1(b"".join(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "assets", f), "rb").read() for f in ("css/site.css", "js/site.js", "js/forum.js"))).hexdigest()[:10]
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


def img(name, alt, cls="", sizes="100vw", lazy=True, prio=False, pos=None):
    attrs = f'class="{cls}" ' if cls else ""
    if pos:
        attrs += f'style="object-position:{pos}" '
    load = ' fetchpriority="high"' if prio else (' loading="lazy"' if lazy else "")
    return (f'<img {attrs}src="/assets/img/{name}-s.webp" srcset="/assets/img/{name}-s.webp 800w, /assets/img/{name}.webp 1600w" '
            f'sizes="{sizes}" alt="{e(alt)}"{load}>')


def layout(path, title, desc, body, hero=False, noindex=False):
    menu = "".join(
        f'<li><a href="{href}"{" aria-current=\"page\"" if path == href or (href != "/" and path.startswith(href + "/")) else ""}>{e(lbl)}</a></li>'
        for lbl, href in site["menu"])
    full_title = f"{title} | Rover & Co" if path != "/" else "Rover & Co VZW | Land Rover-club in België"
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
      <a class="cart-btn acct-btn" href="/account" aria-label="Mijn account" title="Mijn account">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
      </a>
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
        <p>Land Rover-liefhebbers die elkaar vinden. Op de weg, ernaast en rond het kampvuur.</p>
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
        <ul><li><a href="{site['instagram']}" target="_blank" rel="noopener">Instagram</a></li><li><a href="{site['facebook']}" target="_blank" rel="noopener">Facebook</a></li></ul>
      </div>
    </div>
    <div class="legal">
      <span>{e(site['naam'])} · {site['ondernemingsnummer']} · <a href="/voorwaarden">Voorwaarden</a> · <a href="/privacy">Privacy</a></span>
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


def kruimel(delen):
    if not delen: return ""
    s = '<nav class="kruimel" aria-label="Kruimelpad"><a href="/">Home</a>'
    for d in delen:
        s += '<span aria-hidden="true">›</span>' + (f'<a href="{e(d[1])}">{e(d[0])}</a>' if len(d) > 1 else f'<span aria-current="page">{e(d[0])}</span>')
    return s + "</nav>"


def banner(eyebrow, title, intro="", foto=None, alt="", pos=None, groen=False, kruim=None):
    foto = foto or {"Contact": "905", "Voorwaarden": "5739", "Privacy": "5739", "404": "730", "Shop": "5577"}.get(eyebrow, "leden-zonsondergang")
    pic = img(foto, alt, prio=True, pos=pos)
    if kruim is None:
        kruim = [(title if eyebrow in ("Rover & Co", "404") else eyebrow,)]
    return f'<section class="banner banner-foto{" banner-groen" if groen else ""}">{pic}<div class="wrap">{kruimel(kruim)}<div class="eyebrow">{e(eyebrow)}</div><h1>{e(title)}</h1>{f"<p>{e(intro)}</p>" if intro else ""}</div></section>'


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
    return (f'<a href="{href}" class="ev"{ext}>{img(a["foto"], a["foto_alt"], sizes="(max-width:880px) 100vw, 50vw", pos=a.get("foto_pos"))}'
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


WEETJES = json.load(open(os.path.join(ROOT, "data", "weetjes.json"), encoding="utf-8"))


def weetje_blok():
    """Wist-je-datje: willekeurig weetje uit data/weetjes.json, knop voor het volgende. Elk weetje heeft een bron."""
    data = json.dumps([{"t": w["tekst"], "b": w["bron"]} for w in WEETJES], ensure_ascii=False).replace("</", "<\\/")
    eerste = WEETJES[0]
    return (f'<section class="weetje-sec"><div class="wrap"><div class="weetje">'
            f'<div class="eyebrow">Wist je dat?</div><div class="weetje-vak"><p class="weetje-tekst">{e(eerste["tekst"])}</p>'
            '<div class="weetje-denk" aria-hidden="true"><svg class="weetje-wiel" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="6" stroke-dasharray="7 4"/>'
            '<circle cx="24" cy="24" r="11" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="24" cy="24" r="3.5" fill="currentColor"/>'
            '<path d="M24 13v7M24 28v7M13 24h7M28 24h7" stroke="currentColor" stroke-width="2.5"/></svg>'
            '<span class="weetje-denktekst">Even in de archieven duiken<i>.</i><i>.</i><i>.</i></span></div></div>'
            f'<div class="weetje-voet"><a class="weetje-bron" href="{e(eerste["bron"])}" rel="noopener">Bron: Wikipedia</a>'
            f'<button type="button" class="btn btn-white weetje-knop">Volgend weetje</button></div></div></div>'
            f'<script type="application/json" class="weetjes-data">{data}</script>'
            '<script>(function(){var s=document.currentScript.parentNode,d=JSON.parse(s.querySelector(".weetjes-data").textContent),'
            'p=s.querySelector(".weetje-tekst"),b=s.querySelector(".weetje-bron"),i=Math.floor(Math.random()*d.length);'
            'function toon(){p.textContent=d[i].t;b.href=d[i].b}toon();'
            'var w=s.querySelector(".weetje"),k=s.querySelector(".weetje-knop"),T=["Even in de archieven duiken","Even onder de motorkap kijken","Even in het werkplaatsboek bladeren","Even de oude roadbooks nalezen"];'
            'k.onclick=function(){if(w.classList.contains("denkt"))return;var n=i;while(d.length>1&&n===i)n=Math.floor(Math.random()*d.length);i=n;'
            's.querySelector(".weetje-denktekst").firstChild.nodeValue=T[Math.floor(Math.random()*T.length)];'
            'var snel=matchMedia("(prefers-reduced-motion: reduce)").matches;w.classList.add("denkt");k.disabled=true;'
            'setTimeout(function(){toon();w.classList.remove("denkt");w.classList.add("nieuw");k.disabled=false;setTimeout(function(){w.classList.remove("nieuw")},700)},snel?150:1300)}})();</script>'
            '</section>')


OVER_TEKST = ("Rover & Co is een Belgische vzw die Land Rover-liefhebbers samenbrengt. Met ritten, bijeenkomsten en evenementen "
              "maken we ruimte voor ontmoeting, avontuur en het delen van ervaringen. Het draait niet alleen om de wagens, "
              "maar vooral om de mensen, de verhalen en de community eromheen.")

# ---------- home ----------
eerst = acts[0]

def tegel(href, foto, titel, tekst, label=""):
    return (f'<a class="tegel" href="{href}">{img(foto, "", sizes="(max-width:880px) 50vw, 25vw")}'
            f'<div class="tegel-b">{f"<span class=tegel-label>{e(label)}</span>" if label else ""}<b>{e(titel)}</b><span>{e(tekst)}</span></div></a>')

PARTNERS_HOME = [("partner-the-wolfgarage", "The Wolfgarage"), ("partner-pp-hekwerk", "P&P Hekwerk"), ("partner-pakawi", "Pakawi Park"),
                 ("partner-epc-verbeteraars", "EPC Verbeteraars"), ("partner-elektrofix", "ElektroFix"), ("partner-sus-consult", "SUS Consult")]

home = f"""
<section class="hero hero-nieuw" style="padding:0">
  {img("964", "Defender met daktent in een stoffige bosweg", "hero-img", prio=True)}
  <div class="wrap hero-in">
    <div class="eyebrow" style="color:#CFE3D4">Land Rover-club · België</div>
    <h1>For the ones built different</h1>
    <p>Land Rover-liefhebbers die elkaar vinden. Op de weg, ernaast en rond het kampvuur.</p>
    <div class="ctas"><a href="/activiteiten" class="btn btn-white">Rij mee</a><a href="/account/registreren" class="btn btn-ghost-w" data-gast>Word lid, gratis</a></div>
  </div>
</section>
<div class="wrap volgende-wrap"><a href="/activiteiten/{eerst['slug']}" class="volgende" data-dyn="volgende"><small>Eerstvolgende</small><strong>{e(eerst['titel'])}</strong><span>{e(eerst['datum_label'])} · {e(eerst['locatie'])}</span></a></div>
<section class="tegels-sec"><div class="wrap tegels">
  {tegel("/activiteiten", "977", "Activiteiten", "Ritten, roadbooks en weekends")}
  {tegel("/forum", "leden-vuur-avond", "Forum", "Vragen, verhalen en samen rijden", "Nieuw")}
  {tegel("/shop", "5577", "Shop", "T-shirts, hoodies en mokken")}
  {tegel("/blog", "5739", "Blog", "Onderhoud, geschiedenis en verhalen")}
</div></section>
<section>
  <div class="wrap">
    <div class="sec-head"><div><div class="eyebrow">Activiteiten</div><h2>Rij mee</h2></div><div class="ctas"><a href="/activiteiten" class="btn btn-solid">Alle activiteiten</a><a href="/kalender" class="btn">Kalender</a></div></div>
    <div class="events" data-dyn="events">{ev_card(acts[0], True)}<div class="ev-stack">{''.join(ev_card(a) for a in acts[1:3])}</div></div>
    <a class="kal-tip" href="/kalender"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg><span><b>Ook events van andere clubs</b> Land Rover-clubs, 4x4-dagen, beurzen en overland in België en Nederland, op één kalender.</span><span class="pijl">→</span></a>
  </div>
</section>
<section class="forum-band topo">
  <div class="wrap forum-in">
    <div>
      <div class="eyebrow">Forum</div>
      <h2>Wat leeft er</h2>
      <p>Geen algoritme, geen reclame. Vragen stellen, kennis delen en afspreken om samen te rijden. Jouw berichten blijven van jou.</p>
      <div class="ctas"><a href="/account/registreren" class="btn btn-wit" data-gast>Maak je gratis account</a><a href="/forum" class="btn">Naar het forum</a></div>
    </div>
    <div class="forum-lijst" data-dyn="forum"><a class="forum-rij" href="/forum"><span>Het forum is open</span><small>Start jij het eerste topic?</small></a></div>
  </div>
</section>
<section class="garage-sec">
  <div class="wrap">
    <div class="sec-head"><div><div class="eyebrow">Uit de garage</div><h2>Wagens van leden</h2></div><a href="/account/garage" class="btn btn-solid">Zet je Land Rover erbij</a></div>
    <div class="garage-rij" data-dyn="garage"><a class="garage-leeg" href="/account/garage">Nog niemand. Zet als eerste je Land Rover in de garage.</a></div>
  </div>
</section>
__BLOGHOME__
<section class="shop-sec">
  <div class="wrap">
    <div class="sec-head"><div><div class="eyebrow">Shop</div><h2>Draag het</h2></div><a href="/shop" class="btn btn-solid">Naar de shop</a></div>
    <div class="products" data-dyn="producten">{''.join(product_card(p) for p in producten)}</div>
  </div>
</section>
<section class="gallery-sec">
  <div class="wrap">
    <div class="sec-head"><div><div class="eyebrow">Foto's</div><h2>Onderweg</h2></div><a href="/fotos" class="btn btn-ghost-w">Alle foto's</a></div>
    {galerij(GALERIJ[:8])}
  </div>
</section>
<section>
  <div class="wrap about">
    {img("leden-daktenten-rij", "Defenders met daktenten op een kampeerterrein", "about-img", sizes="(max-width:880px) 100vw, 50vw")}
    <div>
      <div class="eyebrow">Over ons</div>
      <h2>Een club van en voor liefhebbers</h2>
      <p>{e(OVER_TEKST)}</p>
      <a href="/over-ons" class="btn btn-solid">Lees ons verhaal</a>
      <div class="partners-home"><small>Met dank aan onze partners</small><div>{''.join(f'<a href="/blog/{s}" title="{e(n)}"><img src="/assets/img/blog/{s}-s.webp" alt="{e(n)}" loading="lazy"></a>' for s, n in PARTNERS_HOME)}</div></div>
    </div>
  </div>
</section>"""


# ---------- activiteiten ----------
# /activiteiten en /activiteiten/<slug> maakt de Worker live uit de database (src/aanbod.js). Hieronder enkel nog
# de opmaak die de startpagina en de zaai-data nodig hebben.
_ongebruikt = ("/activiteiten", "Activiteiten", "Ritten, meetings en evenementen van Rover & Co: Church of Rover en Wild & Wheels.",
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


def gratis(a):
    return all(not o.get("prijs") for o in (a.get("inschrijving") or {}).get("onderdelen", [{"prijs": 1}]))


def inschrijving_open(a):
    i = a.get("inschrijving")
    return bool(i and i.get("open") and (not i.get("sluit") or i["sluit"] >= date.today().isoformat()))


for a in alle_acts:
    if a.get("extern_url"):
        continue
    if inschrijving_open(a):
        knop = ('<a class="btn btn-solid" href="#inschrijven" style="width:100%;justify-content:center">Inschrijven</a>'
                f'<p class="note">Het formulier staat onderaan deze pagina. {"Inschrijven is gratis." if gratis(a) else "Je betaalt veilig online via Viva."}</p>')
    else:
      knop = (f'<a class="btn btn-solid" href="{a["inschrijven_url"]}" rel="noopener" style="width:100%;justify-content:center">{e(a["inschrijven_label"])}</a>'
            '<p class="note">Inschrijven en betalen gebeurt voorlopig nog via onze huidige webshop.</p>') if a["inschrijven_url"] else \
           f'<span class="btn btn-solid" aria-disabled="true" style="width:100%;justify-content:center">{e(a["inschrijven_label"])}</span>' if a["inschrijven_label"] else ""
    body = banner(a["datum_lang"], a["titel"], a["kort"], a.get("banner_foto", a["foto"]), a["foto_alt"], a.get("banner_pos", a.get("foto_pos")), a.get("banner_groen", False)) + aftellen(a) + f"""
<section><div class="wrap detail">
  <div class="prose">{a['omschrijving_html']}</div>
  <div class="ev-side"><aside class="card"><h3>In het kort</h3><ul class="facts">
    <li><span>Datum</span><span>{e(a['datum_lang'])}</span></li>
    <li><span>Locatie</span><span>{e(a['locatie'])}</span></li>
    {f"<li><span>Uur</span><span>{e(a['uren'])}</span></li>" if a['uren'] else ''}
  </ul>{knop}</aside>{affiche(a)}</div>
</div></section>"""
    body += fotoblok(a)
    if a.get("foto_credit"):
        body += f'<section style="padding-top:0"><div class="wrap"><p class="fotocredit">Foto bovenaan: {a["foto_credit"]}</p></div></section>'
    if inschrijving_open(a):
        EVENT_BODY[a["slug"]] = body  # wordt geschreven samen met het inschrijfformulier (zie onder)
        continue
    pass  # (pagina wordt live gemaakt door de Worker)

# ---------- kalender ----------
KAL_ANDEREN = json.load(open(os.path.join(ROOT, "data", "kalender.json"), encoding="utf-8"))
kal_items = [{"club": "Rover & Co", "ons": True, "titel": a["titel"], "datum": a["datum"], "einde": a.get("einde", ""),
              "label": a["datum_label"], "plaats": a["locatie"] + (" · " + a["uren"] if a.get("uren") else ""), "link": f"/activiteiten/{a['slug']}", "org": "Rover & Co VZW", "soort": "club", "info": a.get("kort", "")} for a in acts]
kal_items += [{**k, "ons": False} for k in KAL_ANDEREN]
kal_data = json.dumps(sorted(kal_items, key=lambda x: x["datum"]), ensure_ascii=False).replace("</", "<\\/")
kalender = banner("Kalender", "Wat staat er op de planning", "Onze activiteiten, andere Land Rover-clubs, 4x4-dagen, beurzen en overland, op één plek.", "968", "Colonne op een landweg") + f"""
<section><div class="wrap">
  <div class="kal-filter" role="group" aria-label="Filter de kalender">
    <label class="kf"><span class="kf-l">Soort</span><select id="kf-soort">
      <option value="alles">Alles</option><option value="ons">Rover &amp; Co</option><option value="club">Land Rover-clubs</option>
      <option value="4x4">4x4 en offroad</option><option value="beurs">Beurzen en shows</option><option value="overland">Overland en kamperen</option></select></label>
    <label class="kf"><span class="kf-l">Wanneer</span><select id="kf-maand"><option value="">Alle data</option></select></label>
    <span class="kf-n" id="kf-n" aria-live="polite"></span>
  </div>
  <div id="kal-lijst" class="kal-lijst" aria-live="polite"></div>
  <p class="note">Bij activiteiten van andere clubs gebeuren info en inschrijving bij de club zelf. Klik door naar hun pagina.</p>
</div></section>
<section class="kal-indienen" id="indienen"><div class="wrap narrow">
  <div class="eyebrow">Indienen</div><h2>Staat jouw activiteit er niet bij?</h2>
  <p>Organiseer je met je club een Land Rover-activiteit? Laat het ons weten. We bekijken elke inzending en zetten ze daarna op de kalender.</p>
  <form id="kal-form" class="co-blok" novalidate>
    <div class="veld2"><div class="veld"><label for="k-club">Club of organisator</label><input id="k-club" name="club" required><div class="err" data-voor="club"></div></div>
      <div class="veld"><label for="k-titel">Naam van de activiteit</label><input id="k-titel" name="titel" required><div class="err" data-voor="titel"></div></div></div>
    <div class="veld2"><div class="veld"><label for="k-datum">Datum</label><input id="k-datum" name="datum" type="date" required><div class="err" data-voor="datum"></div></div>
      <div class="veld"><label for="k-einde">Einddatum <small>(optioneel)</small></label><input id="k-einde" name="einde" type="date"><div class="err" data-voor="einde"></div></div></div>
    <div class="veld2"><div class="veld"><label for="k-plaats">Plaats</label><input id="k-plaats" name="plaats" required><div class="err" data-voor="plaats"></div></div>
      <div class="veld"><label for="k-link">Link met meer info <small>(optioneel)</small></label><input id="k-link" name="link" type="url" placeholder="https://"><div class="err" data-voor="link"></div></div></div>
    <div class="veld2"><div class="veld"><label for="k-naam">Jouw naam <small>(optioneel)</small></label><input id="k-naam" name="naam" autocomplete="name"></div>
      <div class="veld"><label for="k-email">Jouw e-mailadres</label><input id="k-email" name="email" type="email" autocomplete="email" required><div class="err" data-voor="email"></div></div></div>
    <div class="veld"><label for="k-soort">Soort activiteit</label><select id="k-soort" name="soort"><option value="club">Land Rover-club</option><option value="4x4">4x4 en offroad</option><option value="beurs">Beurs of show</option><option value="overland">Overland en kamperen</option></select></div>
    <div class="veld"><label for="k-opm">Opmerking <small>(optioneel)</small></label><textarea id="k-opm" name="opmerking" rows="3"></textarea></div>
    <div class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
    <button class="btn btn-solid" type="submit" id="k-knop">Activiteit indienen</button>
    <div class="err" id="k-fout" role="alert"></div>
  </form>
  <div class="co-blok" id="k-bedankt" hidden><h3>Bedankt!</h3><p>We bekijken je activiteit en zetten ze daarna op de kalender.</p></div>
</div></section>
<script type="application/json" id="kal-data">{kal_data}</script>
<script>(function(){{
var basis=JSON.parse(document.getElementById("kal-data").textContent),lijst=document.getElementById("kal-lijst"),filter="alles",maandF="",alle=basis.slice();
var MAANDEN=["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
var KORT=["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];var DAGEN=["zo","ma","di","wo","do","vr","za"],grid;
var PIN='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="currentColor"/></svg>';
var KAL='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2"/></svg>';
function el(t,c,x){{var n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n}}
function d(s){{var p=s.split("-");return new Date(+p[0],+p[1]-1,+p[2])}}
function teken(){{var vandaag=new Date();vandaag.setHours(0,0,0,0);lijst.textContent="";var maand="",n=0;
  alle.filter(function(a){{return d(a.einde||a.datum)>=vandaag&&(filter==="alles"||(filter==="ons"?a.ons:(a.soort||"club").split(",").indexOf(filter)>-1))&&(!maandF||a.datum.slice(0,7)<=maandF&&(a.einde||a.datum).slice(0,7)>=maandF)}}).sort(function(a,b){{return a.datum<b.datum?-1:1}}).forEach(function(a){{
    var dt=d(a.datum),m=MAANDEN[dt.getMonth()]+" "+dt.getFullYear();if(m!==maand){{maand=m;var blok=el("div","kal-blok");blok.append(el("h3","kal-maand",m));grid=el("div","kal-grid");blok.append(grid);lijst.append(blok)}}
    var r=el(a.link?"a":"div","kal-kaart"+(a.ons?" ons":""));if(a.link){{r.href=a.link;if(!a.ons)r.rel="noopener"}}
    var dag=el("div","kal-datum");dag.append(el("span","kal-wd",DAGEN[dt.getDay()]),el("b",null,dt.getDate()),el("span",null,KORT[dt.getMonth()]));
    var b=el("div","kal-body");b.append(el("div","kal-org",a.org||a.club),el("h4","kal-titel",a.titel));
    var meta=el("ul","kal-meta");var li=el("li");li.innerHTML=PIN;li.append(a.plaats);meta.append(li);
    if(a.einde&&a.einde!==a.datum){{var e=d(a.einde),li2=el("li");li2.innerHTML=KAL;li2.append(dt.getDate()+" "+KORT[dt.getMonth()]+" – "+e.getDate()+" "+KORT[e.getMonth()]);meta.append(li2)}}
    b.append(meta);if(a.info)b.append(el("p","kal-info",a.info));
    if(a.link)b.append(el("span","kal-meer",a.ons?"Info en inschrijven →":"Meer info bij "+a.club+" ↗"));
    r.append(dag,b);grid.append(r);n++}});
  if(!n)lijst.append(el("p","note","Geen activiteiten gevonden."));document.getElementById("kf-n").textContent=n+(n===1?" activiteit":" activiteiten")}}
function maanden(){{var sel=document.getElementById("kf-maand"),v=sel.value,vd=new Date(),nu=vd.getFullYear()+"-"+String(vd.getMonth()+1).padStart(2,"0"),m={{}};
  alle.forEach(function(a){{var k=a.datum.slice(0,7),e=(a.einde||a.datum).slice(0,7);while(k<=e){{if(k>=nu)m[k]=1;var y=+k.slice(0,4),mm=+k.slice(5)+1;if(mm>12){{mm=1;y++}}k=y+"-"+String(mm).padStart(2,"0")}}}});
  sel.length=1;Object.keys(m).sort().forEach(function(k){{var o=document.createElement("option");o.value=k;o.textContent=MAANDEN[+k.slice(5)-1]+" "+k.slice(0,4);sel.append(o)}});sel.value=v}}
document.getElementById("kf-soort").onchange=function(){{filter=this.value;teken()}};
document.getElementById("kf-maand").onchange=function(){{maandF=this.value;teken()}};
maanden();teken();
fetch("/api/kalender").then(function(r){{return r.json()}}).then(function(j){{if(j&&j.items){{alle=basis.concat(j.items.map(function(x){{x.ons=false;return x}}));maanden();teken()}}}}).catch(function(){{}});
var f=document.getElementById("kal-form");
f.addEventListener("submit",function(ev){{ev.preventDefault();var fd=new FormData(f),o={{}};fd.forEach(function(v,k){{o[k]=v}});
  f.querySelectorAll(".err").forEach(function(x){{x.textContent=""}});var knop=document.getElementById("k-knop");knop.disabled=true;
  fetch("/api/kalender",{{method:"POST",headers:{{"content-type":"application/json"}},body:JSON.stringify(o)}}).then(function(r){{return r.json()}}).then(function(j){{
    knop.disabled=false;if(j.ok){{f.hidden=true;document.getElementById("k-bedankt").hidden=false;return}}
    var M={{club:"Vul de club in.",titel:"Vul de naam van de activiteit in.",datum:"Kies een datum vanaf vandaag.",einde:"De einddatum ligt voor de startdatum.",plaats:"Vul de plaats in.",link:"Dat is geen geldige link (begin met https://).",email:"Vul een geldig e-mailadres in."}};
    (j.fouten||[]).forEach(function(k){{var x=f.querySelector('.err[data-voor="'+k+'"]');if(x)x.textContent=M[k]||"Kijk dit veld na."}});
    if(!j.fouten)document.getElementById("k-fout").textContent=j.fout||"Er ging iets mis. Probeer het opnieuw."}}).catch(function(){{knop.disabled=false;document.getElementById("k-fout").textContent="Geen verbinding. Probeer het opnieuw."}})}});
}})();</script>"""
write("/kalender", "Kalender", "Land Rover-kalender: activiteiten van Rover & Co en andere clubs in België en Nederland. Dien ook je eigen activiteit in.", kalender)

# ---------- shop ----------
# /shop en /shop/<slug> maakt de Worker live uit de database (src/aanbod.js).
_ongebruikt = ("/shop", "Shop", "Merch van Rover & Co: T-shirts en emaille mok. Met elke aankoop steun je de vereniging.",
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
    pass  # (pagina wordt live gemaakt door de Worker)

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
<section class="banner">{'' if a['foto'].startswith('blog/partner-') or a['foto']=='blog/onze-partners' else img(a['foto'], a['foto_alt'], prio=True)}<div class="wrap">{kruimel([("Blog", "/blog"), (a['titel'],)])}<div class="eyebrow">{e(a['rubriek'])}{' · Cornerstone' if a.get('cornerstone') == 'ja' else ''}</div><h1>{e(a['titel'])}</h1></div></section>
<section><article class="narrow prose blogtekst">
  {'<div class="testbanner" role="note"><strong>Concept.</strong> Dit artikel is nog niet gepubliceerd en niet zichtbaar voor zoekmachines.</div>' if concept else ''}
  <p class="artikel-meta">{nl_datum(a['datum'])} · {a['minuten']} min lezen</p>
  {f'<img class="logobanner" src="/assets/img/{a["foto"]}.webp" alt="{e(a["foto_alt"])}" width="1280" height="900">' if a['foto'].startswith('blog/partner-') or a['foto']=='blog/onze-partners' else ''}
  {a['html']}
  {f'<p class="fotocredit">Foto bovenaan: {a["foto_credit"]}</p>' if a.get('foto_credit') else ''}
  <div class="auteur-onder"><span class="auteur-label">Geschreven door</span>{auteur_blok(a['auteur'])}</div>
  <div class="schrijf-mee"><h3>Zelf een artikel schrijven?</h3><p>Heb je kennis, een verhaal of een tip over Land Rovers? Wil je zelf ook eens een artikel schrijven, laat het ons weten via <a href="mailto:{site['email']}?subject=Artikel%20voor%20de%20blog">{site['email']}</a>.</p></div>
  <p><a class="btn" href="/blog">Alle artikels</a></p>
</article></section>
{weetje_blok()}
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
blogbody += '<div class="blogzoek"><input type="search" id="blogzoek" placeholder="Zoek een artikel" aria-label="Zoek in de blog"></div>'
blogbody += f'<div class="blogfilter" role="group" aria-label="Filter op onderwerp">{chips}</div>'
blogbody += '<div class="blogfeed">' + "".join(kaart(a) for a in feed) + '</div>'
blogbody += '<p class="bloggeen" hidden>Geen artikels gevonden.</p>'
blogbody += f'<div class="schrijf-mee"><h3>Zelf een artikel schrijven?</h3><p>Wil je zelf ook eens een artikel schrijven, laat het ons weten via <a href="mailto:{site["email"]}?subject=Artikel%20voor%20de%20blog">{site["email"]}</a>.</p></div>'
blogbody += """</div></section>
<script>
var rub='',zk=document.getElementById('blogzoek');
function toon(){var q=zk.value.trim().toLowerCase(),n=0;
  document.querySelectorAll('.blogfeed .blogkaart').forEach(function(k){
    var ok=(!rub||k.getAttribute('data-rubriek')===rub)&&(!q||k.textContent.toLowerCase().indexOf(q)>-1);
    k.hidden=!ok;if(ok)n++});
  document.querySelector('.bloggeen').hidden=n>0}
document.querySelectorAll('.blogfilter .chip').forEach(function(b){b.addEventListener('click',function(){
  rub=b.getAttribute('data-filter');
  document.querySelectorAll('.blogfilter .chip').forEach(function(x){x.classList.toggle('actief',x===b)});toon()})});
zk.addEventListener('input',toon);
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
write("/over-ons", "Over ons", "Rover & Co VZW brengt Land Rover-liefhebbers uit heel België samen. Onze missie en ons doel.",
      banner("Over ons", "Missie en doel", "", "959", "Defenders in het stof op een bosweg") + f"""
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
      banner("Contact", "Contacteer ons", "Een vraag over een activiteit of een bestelling? Laat het ons weten.", None) + f"""
<section><div class="wrap contact-grid">
  <div class="rubriek"><h3>Mail</h3><p><a href="mailto:{site['email']}">{site['email']}</a></p></div>
  <div class="rubriek"><h3>Bel</h3><p><a href="tel:{site['telefoon_link']}">{site['telefoon']}</a></p></div>
  <div class="rubriek"><h3>Adres</h3><p>{e(site['naam'])}<br>{'<br>'.join(e(x) for x in site['adres'])}</p><p><a href="https://www.google.com/maps/search/?api=1&query=Olmensesteenweg+105+3945+Oostham" rel="noopener">Routebeschrijving</a></p></div>
  <div class="rubriek"><h3>Volg ons</h3><p><a href="{site['instagram']}" target="_blank" rel="noopener">Instagram</a><br><a href="{site['facebook']}" target="_blank" rel="noopener">Facebook</a></p></div>
</div></section>""")

# ---------- algemene voorwaarden ----------
write("/voorwaarden", "Algemene voorwaarden", "Algemene voorwaarden van Rover & Co VZW voor de webshop en inschrijvingen.",
      banner("Voorwaarden", "Algemene voorwaarden", "", None) + f"""
<section><div class="narrow prose">
  <h2>Wie zijn we</h2>
  <p>{e(site['naam'])}, {', '.join(site['adres'])} · {site['ondernemingsnummer']} · <a href="mailto:{site['email']}">{site['email']}</a> · <a href="tel:{site['telefoon_link']}">{site['telefoon']}</a></p>
  <h2>Bestellen en betalen</h2>
  <p>Je bestelling of inschrijving is definitief zodra de betaling via Viva gelukt is. Je krijgt een bevestiging per mail. Alle prijzen staan in euro.</p>
  <h2>Levering</h2>
  <ul>
    <li>Ophalen op een activiteit: gratis.</li>
    <li>Ophalen in Oostham: gratis, op afspraak.</li>
    <li>Verzenden: €7,50, gratis vanaf €100. Wij kiezen de vervoerder. We versturen je bestelling zo snel mogelijk en uiterlijk binnen 30 dagen.</li>
  </ul>
  <h2>Herroepen en retour (shopartikelen)</h2>
  <p>Je hebt 14 dagen na ontvangst om zonder opgave van reden af te zien van je aankoop. Laat het ons weten via <a href="mailto:{site['email']}">{site['email']}</a> en stuur of breng het artikel ongebruikt terug binnen 14 dagen na je bericht. De kosten om het terug te sturen zijn voor jou.</p>
  <p>We betalen alles terug, ook de verzendkost en een eventuele gift, binnen 14 dagen nadat we je bericht krijgen. We mogen wachten met terugbetalen tot we het artikel terug hebben.</p>
  <h2>Inschrijvingen voor activiteiten</h2>
  <p>Een inschrijving voor een activiteit op een vaste datum kan je niet herroepen en wordt niet terugbetaald. Je mag je inschrijving wel doorgeven aan iemand anders: mail ons de naam van de nieuwe deelnemer.</p>
  <p>Gaat een activiteit niet door door een beslissing van ons, dan betalen we je inschrijving terug.</p>
  <h2>Vragen en klachten</h2>
  <p>Mail naar <a href="mailto:{site['email']}">{site['email']}</a>. We antwoorden zo snel mogelijk.</p>
</div></section>""")

# ---------- privacy ----------
write("/privacy", "Privacy", "Privacyverklaring van Rover & Co VZW.",
      banner("Privacy", "Privacyverklaring", "", None) + f"""
<section><div class="narrow prose">
  <p>{e(site['naam'])} ({site['ondernemingsnummer']}, {', '.join(site['adres'])}) is verantwoordelijk voor de gegevens die je ons bezorgt.</p>
  <h2>Wat we gebruiken en waarom</h2>
  <p>We gebruiken je naam, e-mailadres, telefoonnummer en adres alleen om je inschrijving of bestelling af te handelen, je account te beheren en je te contacteren over onze activiteiten. We verkopen je gegevens niet.</p>
  <h2>Je account en het forum</h2>
  <p>Wie iets bestelt of zich inschrijft, krijgt automatisch een account met dat e-mailadres. Daarin zie je je bestellingen en inschrijvingen terug. Je kiest zelf een wachtwoord via de link in je bevestigingsmail. Je wachtwoord bewaren we alleen versleuteld.</p>
  <p>Met je account kan je ook berichten plaatsen op het forum. Je gebruikersnaam, je berichten en wat je zelf op je profiel zet (woonplaats, je Land Rover, profielfoto) zijn voor iedereen zichtbaar. Je e-mailadres en telefoonnummer niet.</p>
  <h2>Wie helpt ons daarbij</h2>
  <ul>
    <li>Betalingen verlopen via Viva. Wij zien je kaartgegevens niet.</li>
    <li>De website, je account, het forum, bestellingen en inschrijvingen draaien bij Cloudflare. Bij het registreren gebruiken we Cloudflare Turnstile om spambots tegen te houden.</li>
    <li>Mails (bevestigingen, wachtwoordlinks) versturen we via Resend.</li>
  </ul>
  <h2>Hoe lang</h2>
  <p>We bewaren bestel- en betaalgegevens zo lang als de wettelijke boekhoudplicht vraagt.</p>
  <h2>Cookies</h2>
  <p>Deze website plaatst geen tracking- of advertentiecookies. Als je inlogt, zetten we twee kleine cookies die nodig zijn om je ingelogd te houden en je meldingen te tonen. Je winkelmandje wordt alleen in je eigen browser bewaard.</p>
  <h2>Jouw rechten</h2>
  <p>Je kan je gegevens altijd opvragen, laten aanpassen of laten verwijderen via <a href="mailto:{site['email']}">{site['email']}</a>. Ben je niet tevreden, dan kan je een klacht indienen bij de <a href="https://www.gegevensbeschermingsautoriteit.be" rel="noopener">Gegevensbeschermingsautoriteit</a>.</p>
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
# Zaai-data voor de database (eenmalig ingeladen; daarna beheer via /beheer). Zie bouw/db/schema-aanbod.sql.
def _sql(v):
    return "'" + str(v).replace("'", "''") + "'"
_zaai = []
for i, pr in enumerate(producten):
    d = {"naam": pr["naam"], "categorie": pr["categorie"], "lint": pr["lint"], "prijs": pr["prijs"],
         "fotos": [{"klein": f + "-s.webp", "groot": f + ".webp"} for f in pr["fotos"]],
         "opties": [{"naam": o["naam"], "verplicht": o["verplicht"], "waarden": [{"waarde": v["waarde"], "meerprijs": prijs_float(v["meerprijs"]), "standaard": v["standaard"]} for v in o["waarden"]]} for o in pr["opties"]],
         "omschrijving": pr["omschrijving"]}
    _zaai.append(f"INSERT OR IGNORE INTO producten (slug, naam, data, zichtbaar, volgorde, bijgewerkt) VALUES ({_sql(pr['slug'])}, {_sql(pr['naam'])}, {_sql(json.dumps(d, ensure_ascii=False))}, 1, {i * 10}, '{VANDAAG}');")
for i, a in enumerate(alle_acts):
    d = {k: v for k, v in a.items() if k not in ("slug", "verborgen")}
    _zaai.append(f"INSERT OR IGNORE INTO activiteiten (slug, titel, datum, data, zichtbaar, volgorde, bijgewerkt) VALUES ({_sql(a['slug'])}, {_sql(a['titel'])}, {_sql(a.get('datum', ''))}, {_sql(json.dumps(d, ensure_ascii=False))}, {0 if a.get('verborgen') else 1}, {i * 10}, '{VANDAAG}');")
open(os.path.join(ROOT, "bouw", "db", "zaai-aanbod.sql"), "w", encoding="utf-8").write("\n".join(_zaai) + "\n")

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
        <label class="akkoord"><input type="checkbox" id="akkoord" name="akkoord"> Ik ga akkoord met de <a href="/voorwaarden">algemene voorwaarden</a> en de <a href="/privacy">privacyverklaring</a>.</label>
        <div class="err" data-voor="akkoord"></div>
        <button class="btn btn-solid" type="submit" id="co-knop" style="width:100%;justify-content:center">{"Inschrijven" if gratis(a) else "Verder naar betalen"}</button>
        <div class="err" id="co-fout" role="alert"></div>
        <p class="note">{"Inschrijven is gratis. Daarna krijg je een bevestiging per mail." if gratis(a) else "Je betaalt veilig online via Viva. Daarna krijg je een bevestiging per mail."} Je inschrijving komt in je <a href="/account">account</a>; heb je er nog geen, dan maken we er een voor je aan.</p>{'' if gratis(a) else '<p class="betaal-met">Betalen via '+'<img class="viva-logo" src="/assets/img/viva-logo.svg" alt="viva.com" width="73" height="13">'+'</p>'}
      </div>
    </aside>
  </form>
</div></section>"""
    pass  # pagina + inschrijfformulier maakt de Worker live (src/aanbod.js); oude /inschrijven-adressen stuurt de Worker door

# ---------- afrekenen ----------
act_opts = "".join(f'<option value="{e(x)}">{e(x)}</option>' for x in cat["__activiteiten"])
afrekenen = banner("Shop", "Afrekenen", "", None, kruim=[("Shop", "/shop"), ("Afrekenen",)]) + f"""
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
        <label class="akkoord"><input type="checkbox" id="akkoord" name="akkoord"> Ik ga akkoord met de <a href="/voorwaarden">algemene voorwaarden</a> en de <a href="/privacy">privacyverklaring</a>.</label>
        <div class="err" data-voor="akkoord"></div>
        <button class="btn btn-solid" type="submit" id="co-knop" style="width:100%;justify-content:center">Verder naar betalen</button>
        <div class="err" id="co-fout" role="alert"></div>
        <p class="note">Je betaalt veilig online via Viva. Daarna krijg je een bevestiging per mail. Je bestelling komt in je <a href="/account">account</a>; heb je er nog geen, dan maken we er een voor je aan.</p>
        <p class="betaal-met">Betalen via <img class="viva-logo" src="/assets/img/viva-logo.svg" alt="viva.com" width="73" height="13"></p>
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

# ---------- sjabloon voor pagina's die de Worker maakt (account, forum: zie src/sjabloon.js) ----------
open(os.path.join(PUB, "_sjabloon.html"), "w", encoding="utf-8").write(layout("/__PAD__", "__TITEL__", "__DESC__", "__INHOUD__"))
pages.append("/forum")

# ---------- sitemap + robots ----------

# home: blog-blok en schrijven (na de artikels)
home = home.replace("__BLOGHOME__", '<section class="blog-home"><div class="wrap"><div class="sec-head"><div><div class="eyebrow">Blog</div><h2>Kennis en verhalen</h2></div><a href="/blog" class="btn btn-solid">Alle artikels</a></div><div class="blogfeed">' + "".join(kaart(x) for x in gepubliceerd[:3]) + '</div></div></section>')
write("/", "Home", "Rover & Co VZW brengt Land Rover-liefhebbers samen: ritten, roadbooks, een forum, een shop en verhalen over Land Rover.", home, hero=True)

sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + \
     "".join(f"  <url><loc>{site['domein']}{p}</loc><lastmod>{VERSIE}</lastmod></url>\n" for p in pages) + "</urlset>\n"
open(os.path.join(PUB, "sitemap.xml"), "w").write(sm)
open(os.path.join(PUB, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nDisallow: /planner\nDisallow: /account\nDisallow: /forum/nieuw\nDisallow: /forum/lid/\nSitemap: {site['domein']}/sitemap.xml\n")
print(f"{len(pages)} pagina's gebouwd + 404, sitemap en robots.txt")
