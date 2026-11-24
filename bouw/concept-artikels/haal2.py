import hashlib, io, json, re, sys, time, urllib.parse, urllib.request
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
UA = "RoverAndCoBlog/1.0 (https://roverandco.be)"
meta = {}
for f in ("res1.txt", "res2.txt"):
    for r in open(f):
        d = r.rstrip("\n").split(" | ")
        if len(d) == 4:
            meta[d[3]] = (d[1].strip(), d[2].strip())
cr = json.load(open("img/credits.json"))
for regel in open(sys.argv[1]):
    if not regel.strip(): continue
    naam, titel = regel.rstrip("\n").split("\t")
    if naam in cr: continue
    fn = titel[5:].replace(" ", "_")
    h = hashlib.md5(fn.encode()).hexdigest()
    url = f"https://upload.wikimedia.org/wikipedia/commons/{h[0]}/{h[:2]}/{urllib.parse.quote(fn)}"
    for p in range(4):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120).read(); break
        except Exception as e:
            ra = getattr(e, "headers", None) and e.headers.get("Retry-After")
            print(" !", naam, repr(e)[:60], ra, flush=True); time.sleep((int(ra) if ra and ra.isdigit() else 60) + 5)
    else:
        print("MISLUKT", naam, flush=True); continue
    im = Image.open(io.BytesIO(data)); im.draft("RGB", (2560, 2560)); im = im.convert("RGB")
    for w, suf, q in ((1280, "", 80), (800, "-s", 78)):
        k = im.copy()
        if k.width > w: k = k.resize((w, round(k.height * w / k.width)), Image.LANCZOS)
        k.save(f"img/{naam}{suf}.webp", "WEBP", quality=q, method=6)
    lic, aut = meta.get(titel, ("", ""))
    cr[naam] = {"titel": titel, "auteur": aut, "licentie": lic, "pagina": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(fn), "w": im.width, "h": im.height}
    json.dump(cr, open("img/credits.json", "w"), indent=1, ensure_ascii=False)
    print("ok", naam, aut, lic, flush=True); time.sleep(15)
