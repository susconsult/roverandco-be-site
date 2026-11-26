/* CB-kanaal 40: NATO-training als CB-gesprek. "Rover Base" stelt vragen, jij antwoordt met tekst of PTT (spraak via Whisper).
   Levels: 1 letters, 2 cijfers, 3 woorden, 4 nummerplaten, 5 oproepen. Level omhoog bij 8 juist op de laatste 10 (server beslist). */
(function () {
  "use strict";
  const logEl = document.getElementById("nt-log");
  if (!logEl) return;
  let data = {};
  try { data = JSON.parse(document.getElementById("nt-data").textContent); } catch (e) { /* leeg */ }
  const rx = document.getElementById("cb-rx");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const kies = (a) => a[Math.floor(Math.random() * a.length)];
  const schud = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const bewaar = { lees(k, d) { try { return JSON.parse(localStorage.getItem("nt-" + k)) ?? d; } catch (e) { return d; } }, zet(k, v) { try { localStorage.setItem("nt-" + k, JSON.stringify(v)); } catch (e) { /* geen opslag */ } } };
  /* ---------------- het alfabet ---------------- */
  const WOORD = { A: "Alfa", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot", G: "Golf", H: "Hotel", I: "India", J: "Juliett", K: "Kilo", L: "Lima", M: "Mike", N: "November", O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango", U: "Uniform", V: "Victor", W: "Whiskey", X: "X-ray", Y: "Yankee", Z: "Zulu" };
  const CIJFER = ["Zero", "One", "Two", "Tree", "Fower", "Fife", "Six", "Seven", "Eight", "Niner"];
  const LETTERS = Object.keys(WOORD);
  // Afleiders: oude alfabetten en veelgemaakte fouten. Nooit woorden die hetzelfde klinken (Viktor/Victor), want op de radio is dat geen fout.
  const FOUT = { A: ["Alfred", "Apple", "Amsterdam"], B: ["Baker", "Boy", "Banana"], C: ["Charles", "Coca", "Casablanca"], D: ["David", "Dog", "Dolly"], E: ["Easy", "Edward", "Everest"], F: ["Fox", "Freddy", "Frank"], G: ["George", "Gulf", "Gold"], H: ["Harry", "How", "Henry"], I: ["Indigo", "Item", "Italy"], J: ["Julia", "Jupiter", "Jack"], K: ["King", "Kenny", "Kilometer"], L: ["London", "Love", "Lena"], M: ["Mama", "Mary", "Metro"], N: ["Nancy", "Nan", "Nebraska"], O: ["Oslo", "Oboe", "Ocean"], P: ["Peter", "Paris", "Panda"], Q: ["Queen", "Quiz", "Quartz"], R: ["Robert", "Roger", "Rome"], S: ["Sugar", "Santiago", "Samba"], T: ["Tommy", "Tare", "Texas"], U: ["Uncle", "Union", "Unicorn"], V: ["Victory", "Vienna", "Venus"], W: ["Willie", "William", "Wolf"], X: ["Xylophone", "Xerxes", "X-men"], Y: ["Yellow", "Yoke", "Yoga"], Z: ["Zebra", "Zero", "Zorro"] };
  const lokvogels = (l, n) => schud(FOUT[l]).slice(0, n);
  // Afleiders met dezelfde beginletter: je moet het juiste woord kennen, niet alleen de letter.
  const tegelsVoor = (tok, n = 3) => { const ls = schud([...new Set(tok.filter((t) => /^[A-Z]$/.test(t)))]).slice(0, n); return ls.map((l) => "~" + lokvogels(l, 1)[0]); };
  const TIP = { A: "Geschreven als Alfa, uitgesproken als al-fah.", J: "Juliett, met dubbele t. Niet Julia.", W: "Whiskey, niet Willie.", M: "Mike, niet Mama. Papa is P.", X: "X-ray, uitgesproken als eks-ree.", Q: "Quebec, uitgesproken als kee-bek." };

  /* ---------------- spraak en tekst omzetten naar NATO-tokens ---------------- */
  const SYN = {};
  const zet = (tok, ...w) => w.forEach((x) => { SYN[x] = tok; });
  zet("A", "alfa", "alpha", "alfah"); zet("B", "bravo", "brava"); zet("C", "charlie", "charley", "charly", "sharly", "sharlie"); zet("D", "delta");
  zet("E", "echo", "eko", "ekko"); zet("F", "foxtrot", "foxtrott"); zet("G", "golf", "gulf", "golfe"); zet("H", "hotel", "hotell");
  zet("I", "india", "indya"); zet("J", "juliett", "juliet", "juliette"); zet("K", "kilo", "keelo", "kilos"); zet("L", "lima", "leema", "lima's");
  zet("M", "mike", "mic", "mik", "mikes"); zet("N", "november"); zet("O", "oscar", "oskar"); zet("P", "papa", "pappa"); zet("Q", "quebec", "kebec", "kebek", "québec");
  zet("R", "romeo"); zet("S", "sierra", "siera", "cierra"); zet("T", "tango"); zet("U", "uniform", "uniforms"); zet("V", "victor", "viktor");
  zet("W", "whiskey", "whisky"); zet("X", "xray", "x-ray"); zet("Y", "yankee", "yankees", "yanky", "yankie"); zet("Z", "zulu", "zoeloe");
  zet("0", "zero", "nul"); zet("1", "one", "won", "wun"); zet("2", "two", "to", "too", "tu"); zet("3", "tree", "tri", "trie", "three", "free");
  zet("4", "fower", "fowr", "fouwer", "fauer", "power", "flower"); zet("4*", "four", "for", "fore"); zet("5", "fife", "fyfe", "fyf", "five"); zet("5*", "fiver", "fifer"); zet("6", "six", "sicks");
  zet("7", "seven"); zet("8", "eight", "ate"); zet("9", "niner", "nyner", "niener", "nina"); zet("9*", "nine", "nein");
  // Streng (keuze Pieter): 4 en 9 tellen alleen als "fower" en "niner" (dat hoort Whisper). Tree/three en fife/five klinken voor Whisper hetzelfde, die mogen allebei. "Fiver" blijft fout.
  for (let d = 0; d <= 9; d++) SYN[String(d)] = String(d); // herkenning schrijft cijfers vaak als "578"
  zet("FIG", "figures", "figure", "figgers", "figuers"); zet("SPELL", "spell", "ispell", "spel", "spells");
  zet("OVER", "over", "ova"); zet("OUT", "out"); zet("ROGER", "roger"); zet("WILCO", "wilco"); zet("SAY", "say"); zet("AGAIN", "again");
  zet("ROVER", "rover", "rovers", "rova"); zet("CONVOY", "convoy", "convey", "convoi", "envoy", "konvooi"); zet("THIS", "this", "dis"); zet("IS", "is", "his");
  zet("BASE", "base"); zet("WAIT", "wait"); zet("NUMBER", "number");
  const VERKEERD = { julia: "J", willie: "W", willy: "W", william: "W", mama: "M", mary: "M", alfred: "A", apple: "A", baker: "B", george: "G", king: "K", queen: "Q", sugar: "S", zebra: "Z", peter: "P", yellow: "Y", london: "L", indigo: "I", easy: "E", fox: "F", charles: "C", david: "D", harry: "H", nancy: "N", robert: "R", tommy: "T", uncle: "U", victory: "V", xylophone: "X" };

  function tokens(tekst) {
    const t = String(tekst).toLowerCase().replace(/x[\s-]?ray|ex[\s-]?ray/g, "xray").replace(/fox[\s-]trot/g, "foxtrot").replace(/\bi[\s-]+spell\b|\beye[\s-]+spell\b/g, "ispell")
      .replace(/(\d)/g, " $1 ").replace(/[^a-z0-9éè'\s-]/g, " ");
    const uit = [];
    t.split(/\s+/).filter(Boolean).forEach((w) => {
      w = w.replace(/^'+|'+$/g, "");
      if (SYN[w]) uit.push({ t: SYN[w], w });
      else if (VERKEERD[w]) uit.push({ t: "?" + VERKEERD[w], w });
      // losse letters ("k t w") tellen niet als NATO-woord
    });
    return uit;
  }
  const toon = (tok) => tok[0] === "~" ? tok.slice(1) : /^[A-Z]$/.test(tok) ? WOORD[tok] : /^\d$/.test(tok) ? CIJFER[+tok] : { FIG: "Figures", SPELL: "I spell", OVER: "over", OUT: "out", ROGER: "roger", WILCO: "wilco", SAY: "say", AGAIN: "again", ROVER: "Rover", CONVOY: "Convoy", THIS: "this", IS: "is", BASE: "Base", WAIT: "wait", NUMBER: "number" }[tok] || tok;

  // Vergelijk wat verwacht wordt met wat gezegd of getikt is. streng: exact; anders: verwacht moet in volgorde voorkomen (extra woorden mogen).
  function vergelijk(verwacht, gezegd, streng) {
    const g = gezegd.map((x) => x.t);
    const n = verwacht.length, m = g.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = verwacht[i] === g[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ok = new Array(n).fill(false);
    for (let i = 0, j = 0; i < n && j < m;) { if (verwacht[i] === g[j]) { ok[i] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
    const raak = ok.filter(Boolean).length;
    const extra = streng ? g.filter((x) => !/^(OVER)$/.test(x)).length - raak : 0;
    return { juist: raak === n && extra <= 0, ok, extra: Math.max(0, extra) };
  }

  /* ---------------- oefeningen maken ---------------- */
  const zwak = bewaar.lees("zwak", {});
  function letter() {
    // Letters die je vaak fout had komen vaker terug.
    const pot = []; LETTERS.forEach((l) => { for (let i = 0; i < 1 + Math.min(4, zwak[l] || 0); i++) pot.push(l); });
    return kies(pot);
  }
  const spelTok = (woord) => woord.toUpperCase().replace(/[^A-Z]/g, "").split("");
  const WOORDEN = ["ROVER", "LANDY", "SNORKEL", "WINCH", "MODDER", "OOSTHAM", "DEFENDER", "AXLE", "JERRYCAN", "QUIZ", "KOFFIE", "DAKTENT", "ROADBOOK", "BELGIUM", "JUKEBOX", "OVERLAND", "TOUW", "LIER", "ZWAAI", "FIX", "KAMP", "SERIES", "WAGEN", "JEEP", "BUSH", "QUAD", "GAZ", "VELG", "BANDEN", "PECH"];
  function plaat() {
    const d = () => String(Math.floor(Math.random() * 10)), l = () => kies(LETTERS);
    return { tekst: `${1 + Math.floor(Math.random() * 2)}-${l()}${l()}${l()}-${d()}${d()}${d()}` };
  }
  function plaatTok(p) {
    const [a, b, c] = p.split("-");
    return ["FIG", ...a.split(""), "SPELL", ...b.split(""), "FIG", ...c.split("")];
  }
  const zin = (tok) => { // tokens naar een leesbare radiozin
    let s = ""; tok.forEach((t, i) => { const w = toon(t); s += (i ? (["FIG", "SPELL", "OVER", "SAY", "THIS", "WILCO"].includes(t) ? ", " : " ") : "") + w; });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  /* ---------------- vragen per level ---------------- */
  const NIVEAUS = { 1: "letters", 2: "cijfers", 3: "woorden spellen", 4: "nummerplaten", 5: "echte oproepen" };
  const naam = data.naam || "Rover";
  const TIP_CIJFER = "Op de radio zeg je cijfers één voor één: tree, fower, fife, niner.";
  const TIP_PLAAT = "Zeg “Figures” voor de cijfers en “I spell” voor de letters, één keer per groep. Geen “number”.";
  function getal() { const n = 2 + Math.floor(Math.random() * 3); let g = String(1 + Math.floor(Math.random() * 9)); while (g.length < n) g += Math.floor(Math.random() * 10); return g; }
  const MAKER = {
    1: () => { const l = letter(); return { niveau: 1, vraag: `${l}?`, verwacht: [l], streng: true, letters: [l], tip: TIP[l] }; },
    2: () => { const g = getal(); return { niveau: 2, vraag: `Zeg dit getal op de radio: <b>${g}</b>`, verwacht: g.split(""), streng: true, tip: TIP_CIJFER }; },
    3: () => { const w = kies(WOORDEN); return { niveau: 3, vraag: `Spel: <b>${w}</b>`, verwacht: spelTok(w), streng: true, letters: spelTok(w) }; },
    4: () => { const p = plaat().tekst; return { niveau: 4, vraag: `Geef deze plaat door: <b class="nt-plaatje">${p}</b>`, verwacht: plaatTok(p), streng: true, letters: p.split("-")[1].split(""), tip: TIP_PLAAT }; },
    5: () => kies([
      () => ({ niveau: 5, vraag: "Je staat stil met pech. Roep het konvooi op.", verwacht: ["ROVER", "CONVOY", "THIS", "IS", "OVER"], streng: false, tip: "Een oproep: wie je roept, “this is”, wie jij bent, “over”.",
        vervolg: () => { const p = plaat().tekst; return { niveau: 5, wie: "Rover Convoy", vraag: `${esc(naam)}, this is Rover Convoy, send your message, over.<br><small>Geef de plaat van je wagen door en sluit af: <b class="nt-plaatje">${p}</b></small>`, verwacht: [...plaatTok(p), "OVER"], streng: false, tip: TIP_PLAAT + " Sluit af met “over”." }; } }),
      () => ({ niveau: 5, wie: "Rover Convoy", vraag: `${esc(naam)}, this is Rover Convoy, wacht aan de volgende afslag, over.<br><small>Zeg dat je het begrepen hebt en het doet.</small>`, verwacht: ["WILCO", "OVER"], streng: false, tip: "“Wilco” = begrepen en ik doe het. Sluit af met “over”." }),
      () => ({ niveau: 5, wie: "Rover Convoy", vraag: `${esc(naam)}, this is Rover Convoy, kshhh… afslag… kshhh, over.<br><small>Je verstond het niet. Vraag om herhaling.</small>`, verwacht: ["SAY", "AGAIN", "OVER"], streng: false, tip: "“Say again, over.” Zeg nooit “repeat”." }),
      () => ({ niveau: 5, vraag: "Je bent klaar met praten en verwacht een antwoord. Welk woord zeg je?", verwacht: ["OVER"], streng: false }),
      () => ({ niveau: 5, vraag: "Het gesprek is gedaan, je verwacht geen antwoord. Welk woord?", verwacht: ["OUT"], streng: false }),
      () => ({ niveau: 5, vraag: "Je hebt het bericht goed ontvangen. Welk woord?", verwacht: ["ROGER"], streng: false }),
    ])(),
  };

  let niveau = data.mijn?.niveau || 1, vraag = null, teller = 0, herhaal = [], bezig = false;
  function nieuweVraag() {
    teller++;
    const klaar = herhaal.findIndex((h) => h.na <= teller);
    if (klaar >= 0) { const q = herhaal.splice(klaar, 1)[0].q; return { ...q, herhaling: true, vervolg: undefined }; }
    // Meestal je eigen level, af en toe een herhaling van een lager level.
    const n = niveau > 1 && Math.random() < 0.2 ? 1 + Math.floor(Math.random() * (niveau - 1)) : niveau;
    return MAKER[n]();
  }

  const WEET_NIET = /\b(i )?(do ?n'?o?t|dunno)( really)? know\b|\bdunno\b|no idea|not sure|\bpass\b|\bskip\b|\bhelp\b|weet (het |dat )?niet|geen (idee|flauw)|\bbeu\b|ik weet het niet|^\s*\?+\s*$|^\s*\.{2,}\s*$/i;
  const EZEL = { A: "Als in alfabet.", B: "Bravo, zoals applaus.", C: "Charlie, een jongensnaam.", D: "Delta, zoals de Deltawerken.", E: "Echo, het geluid dat terugkomt.", F: "Foxtrot, een dans.", G: "Golf, de sport.", H: "Hotel, waar je slaapt.", I: "India, het land.", J: "Juliett, van Romeo en Juliet, met dubbele t.", K: "Kilo, zoals een kilo.", L: "Lima, de hoofdstad van Peru.", M: "Mike, een jongensnaam.", N: "November, de maand.", O: "Oscar, de filmprijs.", P: "Papa, zoals je vader.", Q: "Quebec, de Canadese provincie.", R: "Romeo, van Romeo en Juliet.", S: "Sierra, de bergketen.", T: "Tango, een dans.", U: "Uniform, wat een soldaat draagt.", V: "Victor, zoals victorie.", W: "Whiskey, het drankje.", X: "X-ray, een röntgenfoto.", Y: "Yankee, een Amerikaan.", Z: "Zulu, het volk in Zuid-Afrika." };

  /* ---------------- het gesprek ---------------- */
  let geschiedenis = bewaar.lees("log", []);
  function bericht(b, opslaan = true) {
    const stil = logEl.querySelector(".cb-stil"); if (stil) stil.remove();
    const d = document.createElement("div");
    const eigen = b.wie === "ik";
    d.className = "cb-bericht" + (eigen ? " eigen" : "") + (b.soort ? " nt-" + b.soort : "");
    const wie = eigen ? naam : b.wie || "Rover Base";
    const t = b.t ? new Date(b.t) : new Date();
    d.innerHTML = `<span class="cb-av">${esc(eigen ? (naam[0] || "?").toUpperCase() : wie === "Rover Convoy" ? "RC" : "RB")}</span>
      <div><span class="cb-wie"><b>${esc(wie)}</b> <time>${t.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}</time>${b.spraak ? ' <small class="nt-spraak">spraak</small>' : ""}</span><p>${b.html}</p></div>`;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
    if (!eigen && rx) { rx.classList.add("aan"); setTimeout(() => rx.classList.remove("aan"), 600); }
    if (opslaan) { geschiedenis.push({ ...b, t: t.toISOString() }); geschiedenis = geschiedenis.slice(-30); bewaar.zet("log", geschiedenis); }
  }
  const later = (f, ms) => setTimeout(f, ms);
  function stel(q) {
    vraag = q;
    bericht({ wie: q.wie || "Rover Base", html: q.vraag + (q.herhaling ? ' <small class="nt-klein">(nog eens)</small>' : "") });
    zetLv();
  }
  function zetLv(pop) {
    const lv = document.getElementById("nt-lv");
    if (!lv) return;
    lv.textContent = "★ L" + niveau;
    lv.title = `Level ${niveau}: ${NIVEAUS[niveau]}`;
    if (pop) { lv.classList.remove("pop"); void lv.offsetWidth; lv.classList.add("pop"); }
  }

  function beantwoord(tekst, spraak) {
    if (!vraag || bezig) return;
    tekst = String(tekst || "").trim();
    if (!tekst) return;
    bericht({ wie: "ik", html: esc(tekst), spraak });
    const q = vraag; vraag = null; bezig = true;
    // "Ik weet het niet": geen afstraffing, gewoon het antwoord met een ezelsbruggetje. Telt als fout en komt terug.
    if (WEET_NIET.test(tekst) && !tokens(tekst).length) {
      (q.letters || []).forEach((l) => { zwak[l] = (zwak[l] || 0) + 2; });
      bewaar.zet("zwak", zwak);
      if (!q.herhaling) herhaal.push({ q, na: teller + 3 });
      const l = q.verwacht.length === 1 && /^[A-Z]$/.test(q.verwacht[0]) ? q.verwacht[0] : null;
      const html = l ? `Geen probleem. ${l} is <b>${WOORD[l]}</b>. ${esc(EZEL[l] || "")} Die komt straks nog eens terug.`
        : `Geen probleem, zo zeg je het: <b>${esc(zin(q.verwacht))}</b>${q.tip ? `<br><small>${esc(q.tip)}</small>` : ""}<br><small>Die komt straks nog eens terug.</small>`;
      fetch("/api/cb/40/antwoord", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ juist: false, niveau: q.niveau }) }).catch(() => {});
      later(() => { bericht({ wie: q.wie || "Rover Base", html, soort: "hulp" }); later(() => { bezig = false; stel(nieuweVraag()); }, 900); }, 350);
      return;
    }
    const gezegd = tokens(tekst);
    const v = vergelijk(q.verwacht, gezegd, q.streng);
    const juist = v.juist;
    (q.letters || []).forEach((l) => { zwak[l] = Math.max(0, (zwak[l] || 0) + (juist ? -1 : 2)); });
    bewaar.zet("zwak", zwak);
    let html;
    if (juist) html = kies(["Roger, juist.", "Luid en duidelijk.", "Roger.", "Juist, goed zo."]);
    else {
      const fout = gezegd.filter((x) => x.t[0] === "?").map((x) => `“${esc(x.w)}” bestaat niet, dat is ${WOORD[x.t.slice(1)]}.`).join(" ")
        + (gezegd.some((x) => x.t.endsWith("*")) ? ` Op de radio zeg je ${[...new Set(gezegd.filter((x) => x.t.endsWith("*")).map((x) => `“${CIJFER[+x.t[0]]}”, niet “${esc(x.w)}”`))].join(", ")}.` : "");
      html = `Bijna. Juist is: <b>${esc(zin(q.verwacht))}</b>` + (q.verwacht.length > 1 ? `<span class="nt-chips">${q.verwacht.map((t, i) => `<span class="${v.ok[i] ? "ok" : "mis"}">${esc(toon(t))}</span>`).join("")}</span>` : "") +
        (fout ? `<br><small>${fout}</small>` : "") + (q.tip && !gezegd.some((x) => x.t.endsWith("*")) ? `<br><small>${esc(q.tip)}</small>` : "");
      if (!q.herhaling) herhaal.push({ q, na: teller + 3 });
    }
    fetch("/api/cb/40/antwoord", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ juist, niveau: q.niveau }) })
      .then((r) => r.json()).then((d) => { if (d && d.ok) { data = { ...data, ...d }; if (d.mijn.niveau !== niveau) { const omhoog = d.mijn.niveau > niveau; niveau = d.mijn.niveau; if (omhoog) volgendeExtra = `★ Level ${niveau} gehaald! Vanaf nu: ${NIVEAUS[niveau]}.`; zetLv(true); } tekenMeer(); } })
      .catch(() => { /* score bewaren mislukt: oefenen gaat door */ })
      .then(() => {
        later(() => {
          bericht({ wie: q.wie || "Rover Base", html, soort: juist ? "goed" : "fout" });
          later(() => {
            if (volgendeExtra) { bericht({ wie: "Rover Base", html: `<b>${volgendeExtra}</b>`, soort: "level" }); volgendeExtra = ""; }
            bezig = false;
            stel(juist && q.vervolg ? q.vervolg() : nieuweVraag());
          }, 700);
        }, 350);
      });
  }
  let volgendeExtra = "";

  /* ---------------- invoer: typen of PTT ---------------- */
  const form = document.getElementById("nt-zend"), veld = document.getElementById("nt-tekst"), ptt = document.getElementById("nt-ptt"), hint = document.getElementById("nt-hint");
  const zegHint = (t, fout) => { if (hint) { hint.innerHTML = t; hint.classList.toggle("fout", !!fout); } };
  form.addEventListener("submit", (e) => { e.preventDefault(); if (veld.value.trim()) { beantwoord(veld.value, false); veld.value = ""; } });

  let stroom = null, mime = "";
  const kanOpnemen = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  if (kanOpnemen) ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].some((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m) && (mime = m));
  const mic = () => stroom && stroom.getTracks().some((t) => t.readyState === "live") ? Promise.resolve(stroom) : navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((s) => (stroom = s));
  let rec = null, stuks = [], begin = 0, los = false, houd = null, klok = null;
  const HINT = "Typ en druk op PTT, of <b>houd PTT ingedrukt</b> en spreek in het Engels.";
  function stop() { los = true; clearInterval(klok); ptt.classList.remove("tx"); if (rec && rec.state === "recording") setTimeout(() => rec.state === "recording" && rec.stop(), 250); }
  function neemOp() {
    los = false;
    mic().then((s) => {
      if (los) { zegHint("Microfoon staat klaar. Houd PTT nu ingedrukt terwijl je praat."); return; }
      stuks = []; rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (ev) => { if (ev.data.size) stuks.push(ev.data); };
      rec.onstop = () => {
        if (Date.now() - begin < 600) { zegHint("Te kort. Houd PTT ingedrukt zolang je praat."); return; }
        const type = (rec.mimeType || mime || "audio/webm").split(";")[0];
        zegHint("Even luisteren…"); ptt.classList.add("zendt");
        fetch("/api/cb/40/spraak", { method: "POST", credentials: "same-origin", headers: { "content-type": type }, body: new Blob(stuks, { type }) })
          .then((r) => r.json())
          .then((d) => {
            if (!d.ok) return zegHint(esc(d.fout || "Omzetten lukte niet. Probeer opnieuw of typ je antwoord."), true);
            if (!d.tekst) return zegHint("Ik hoorde niets. Houd PTT ingedrukt en spreek duidelijk.", true);
            zegHint(HINT); beantwoord(d.tekst, true);
          })
          .catch(() => zegHint("Omzetten lukte niet. Controleer je verbinding of typ je antwoord.", true))
          .then(() => ptt.classList.remove("zendt"));
      };
      rec.start(); begin = Date.now(); ptt.classList.add("tx");
      zegHint("Je zendt… laat PTT los als je klaar bent.");
      klok = setInterval(() => { if (Date.now() - begin > 15000) stop(); }, 250);
    }).catch(() => zegHint("Geen toegang tot je microfoon. Sta die toe in je browser, of typ je antwoord.", true));
  }
  ptt.type = "button";
  ptt.addEventListener("click", (e) => { e.preventDefault(); if (ptt.dataset.lang) { delete ptt.dataset.lang; return; } if (veld.value.trim()) { beantwoord(veld.value, false); veld.value = ""; } else zegHint(HINT); });
  if (kanOpnemen) {
    ptt.addEventListener("pointerdown", (e) => {
      if (veld.value.trim()) return;
      e.preventDefault(); ptt.setPointerCapture && ptt.setPointerCapture(e.pointerId);
      houd = setTimeout(() => { houd = null; ptt.dataset.lang = "1"; neemOp(); }, 200);
    });
    const loslaten = () => { if (houd) { clearTimeout(houd); houd = null; return; } stop(); };
    ptt.addEventListener("pointerup", loslaten); ptt.addEventListener("pointercancel", loslaten);
    ptt.addEventListener("contextmenu", (e) => e.preventDefault());
  } else zegHint("Typ je antwoord en druk op PTT. Opnemen werkt niet in deze browser.");
  document.addEventListener("visibilitychange", () => { if (document.hidden && stroom) { stroom.getTracks().forEach((t) => t.stop()); stroom = null; } });

  /* ---------------- ranglijst en spiekbriefje ---------------- */
  let tab = bewaar.lees("tab", "week");
  function tekenMeer() {
    const el = document.getElementById("nt-meer"); if (!el) return;
    const m = data.mijn || {};
    const rij = data[tab] || [];
    const juistVenster = [...(m.venster || "")].filter((x) => x === "1").length;
    el.innerHTML = `<p class="nt-klein">Level ${niveau} (${NIVEAUS[niveau]})${niveau < 5 ? ` · laatste 10: ${juistVenster}/${(m.venster || "").length} juist, 8 nodig` : " · hoogste level"} · ${m.reeks || 0} ${m.reeks === 1 ? "dag" : "dagen"} op rij · ${m.xp || 0} XP</p>
      <div class="nt-tabs" role="tablist"><button type="button" role="tab" data-tab="week" aria-selected="${tab === "week"}">Deze week</button><button type="button" role="tab" data-tab="altijd" aria-selected="${tab === "altijd"}">Altijd</button></div>
      ${rij.length ? `<ol class="nt-rang">${rij.map((x) => `<li class="${x.ik ? "ik" : ""}"><b>${x.plaats}</b><span>${esc(x.naam)} <small class="nt-lv">★ L${x.niveau}</small></span><em>${x.xp} XP</em></li>`).join("")}</ol>` : `<p class="nt-klein">Nog niemand. Wees de eerste!</p>`}
      <div class="nt-tabel">${LETTERS.map((l) => `<span><b>${l}</b>${WOORD[l]}</span>`).join("")}${CIJFER.map((w, i) => `<span><b>${i}</b>${w}</span>`).join("")}</div>
      <p class="nt-klein">Cijfers één voor één. “Figures” voor een groep cijfers, “I spell” voor een groep letters. “Over” als je antwoord verwacht, “out” als het gesprek gedaan is.</p>`;
  }
  document.getElementById("nt-meer")?.addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { tab = b.dataset.tab; bewaar.zet("tab", tab); tekenMeer(); } });

  /* ---------------- start ---------------- */
  geschiedenis.forEach((b) => bericht(b, false));
  if (geschiedenis.length) { const s = document.createElement("p"); s.className = "nt-scheiding"; s.textContent = "nieuwe sessie"; logEl.appendChild(s); }
  tekenMeer(); zetLv();
  const welkom = niveau === 1 && !(data.mijn && data.mijn.totaal)
    ? `${esc(naam)}, this is Rover Base. Welkom op kanaal 40! We oefenen het NATO-alfabet, net als op de radio. Ik zeg een letter, jij zegt het woord. Typ het, of houd PTT ingedrukt en zeg het. Bij 8 op 10 juist ga je een level hoger. Daar gaan we, over.`
    : `${esc(naam)}, this is Rover Base. Je zit op <b>level ${niveau}: ${NIVEAUS[niveau]}</b>. Daar gaan we, over.`;
  bericht({ wie: "Rover Base", html: welkom });
  later(() => stel(nieuweVraag()), 600);
})();
