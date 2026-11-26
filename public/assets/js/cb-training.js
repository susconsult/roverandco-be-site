/* CB-kanaal 40: NATO-training. Lessen van 10 oefeningen: kiezen, tegels tikken of spreken met PTT.
   Spraak naar tekst op onze eigen server (Cloudflare Workers AI, Whisper). Fouten komen achteraan terug, zoals bij Duolingo. */
(function () {
  "use strict";
  const doos = document.getElementById("nt");
  if (!doos) return;
  let data = {};
  try { data = JSON.parse(document.getElementById("nt-data").textContent); } catch (e) { /* leeg */ }
  const lcdNaam = document.querySelector(".cb-naam"), rx = document.getElementById("cb-rx");
  const lcd = (t) => { if (lcdNaam) { lcdNaam.dataset.oud ||= lcdNaam.textContent; lcdNaam.textContent = t || lcdNaam.dataset.oud; } };
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
  zet("0", "zero", "nul"); zet("1", "one", "won", "wun"); zet("2", "two", "to", "too", "tu"); zet("3", "three", "tree", "tri", "free");
  zet("4", "four", "fower", "for", "fore", "power", "flower"); zet("5", "five", "fife", "fiver", "fifer", "fyfe"); zet("6", "six", "sicks");
  zet("7", "seven"); zet("8", "eight", "ate"); zet("9", "nine", "niner", "nein", "nina");
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

  const kanPraten = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  let stil = bewaar.lees("stil", false); // "ik kan nu niet praten"
  const spreken = () => kanPraten && !stil;

  // Elke oefening: { soort: kies|tegels|spreek, vraag, uitleg, opties|tegels, verwacht (tokens of antwoord), streng, letter, tip }
  function oefLetter() {
    const l = letter(), r = Math.random();
    if (r < 0.4) return { soort: "kies", niveau: 1, vraag: `Welk woord hoort bij <b class="nt-groot">${l}</b>?`, opties: schud([WOORD[l], ...lokvogels(l, 3)]), antwoord: WOORD[l], letters: [l], tip: TIP[l] };
    if (r < 0.65) return { soort: "kies", niveau: 1, vraag: `Welke letter is <b class="nt-groot">${WOORD[l]}</b>?`, opties: schud([l, ...schud(LETTERS.filter((x) => x !== l)).slice(0, 3)]), antwoord: l, letters: [l] };
    return { soort: "spreek", niveau: 1, vraag: `Zeg de letter <b class="nt-groot">${l}</b>`, verwacht: [l], streng: true, letters: [l], tip: TIP[l] };
  }
  function oefWoord() {
    const w = kies(WOORDEN), tok = spelTok(w), r = Math.random();
    if (r < 0.2) {
      const andere = schud(WOORDEN.filter((x) => x !== w && x.length === w.length)).slice(0, 3);
      while (andere.length < 3) andere.push(schud(WOORDEN.filter((x) => x !== w && !andere.includes(x)))[0]);
      return { soort: "kies", niveau: 2, vraag: `Je hoort op de radio:<br><i class="nt-radio">“${esc(zin(tok))}”</i><br>Welk woord is dat?`, opties: schud([w, ...andere]), antwoord: w, letters: tok };
    }
    const vraag = `Spel <b class="nt-groot">${w}</b>`;
    if (r < 0.6) return { soort: "tegels", niveau: 2, vraag, verwacht: tok, tegels: schud([...tok, ...tegelsVoor(tok)]), letters: tok };
    return { soort: "spreek", niveau: 2, vraag, verwacht: tok, streng: true, letters: tok };
  }
  function oefPlaat() {
    const p = plaat().tekst, tok = plaatTok(p), r = Math.random(), letters = p.split("-")[1].split("");
    const tip = "Zeg “Figures” voor cijfers en “I spell” voor letters, telkens één keer per groep. Niet “number” voor elk cijfer.";
    if (r < 0.2) {
      const opties = new Set([p]); while (opties.size < 4) { const q = p.split(""); const i = kies([0, 2, 3, 4, 6, 7, 8]); q[i] = /\d/.test(q[i]) ? String((+q[i] + 1 + Math.floor(Math.random() * 8)) % 10) : kies(LETTERS); opties.add(q.join("")); }
      return { soort: "kies", niveau: 3, vraag: `Je hoort:<br><i class="nt-radio">“${esc(zin(tok))}”</i><br>Welke nummerplaat is het?`, opties: schud([...opties]), antwoord: p, letters, plaat: true };
    }
    const vraag = `Geef de nummerplaat door:<span class="nt-plaat">${p}</span>`;
    if (r < 0.6) {
      const cijfers = [...new Set(tok.filter((t) => /^\d$/.test(t)))];
      const extra = schud(["NUMBER", ...LETTERS.filter((x) => !letters.includes(x)).slice(0, 8), ...["3", "4", "5", "9"].filter((x) => !cijfers.includes(x))]).slice(0, 3);
      return { soort: "tegels", niveau: 3, vraag, verwacht: tok, tegels: schud([...tok, ...extra.slice(0, 2), ...tegelsVoor(tok, 2)]), letters, tip };
    }
    return { soort: "spreek", niveau: 3, vraag, verwacht: tok, streng: true, letters, tip };
  }
  const PROWORDS = [
    ["Over", "Ik ben klaar en wacht op antwoord"], ["Out", "Gesprek afgelopen, geen antwoord nodig"], ["Roger", "Ik heb je bericht goed ontvangen"], ["Wilco", "Begrepen, ik doe het"],
    ["Say again", "Herhaal je laatste bericht"], ["Wait", "Even wachten, ik kom terug"], ["I spell", "Nu volgt een woord in letters"], ["Figures", "Nu volgen cijfers"],
  ];
  function oefRadio() {
    const roep = ["ROVER", String(1 + Math.floor(Math.random() * 9)), String(Math.floor(Math.random() * 10))];
    const roepTxt = zin(roep), r = Math.random();
    const oproep = ["ROVER", "CONVOY", "THIS", "IS", ...roep, "OVER"];
    const dist = schud(["OUT", "ROGER", "BASE", "WILCO", "WAIT"]).slice(0, 3);
    if (r < 0.3) {
      const [w, b] = kies(PROWORDS);
      return Math.random() < 0.5
        ? { soort: "kies", niveau: 4, vraag: `Wat betekent <b class="nt-groot">${w}</b> op de radio?`, opties: schud([b, ...schud(PROWORDS.filter((x) => x[0] !== w)).slice(0, 3).map((x) => x[1])]), antwoord: b }
        : { soort: "kies", niveau: 4, vraag: `Wat zeg je als je wil zeggen: <b>${b.toLowerCase()}</b>?`, opties: schud([w, ...schud(PROWORDS.filter((x) => x[0] !== w)).slice(0, 3).map((x) => x[0])]), antwoord: w };
    }
    const situaties = [
      { vraag: `Je roepnaam is <b>${roepTxt}</b>. Roep het konvooi op.`, verwacht: oproep },
      { vraag: `Je roepnaam is <b>${roepTxt}</b>. Je hoorde het konvooi niet goed. Vraag om herhaling.`, verwacht: ["ROVER", "CONVOY", "THIS", "IS", ...roep, "SAY", "AGAIN", "OVER"] },
      { vraag: `Je roepnaam is <b>${roepTxt}</b>. Het konvooi vraagt je te wachten aan de afslag. Zeg dat je het begrepen hebt en het doet.`, verwacht: ["ROVER", "CONVOY", "THIS", "IS", ...roep, "WILCO", "OVER"] },
    ];
    if (r < 0.55) {
      const p = plaat().tekst;
      const s = { vraag: `Het konvooi vraagt de plaat van de wagen met pech. Zeg ze, en sluit af zodat ze kunnen antwoorden:<span class="nt-plaat">${p}</span>`, verwacht: [...plaatTok(p), "OVER"], letters: p.split("-")[1].split("") };
      return Math.random() < 0.5 && spreken() ? { soort: "spreek", niveau: 4, ...s, streng: false } : { soort: "tegels", niveau: 4, ...s, tegels: schud([...s.verwacht, "OUT", "NUMBER", ...tegelsVoor(s.verwacht, 2)]) };
    }
    const s = kies(situaties);
    const tip = "Een oproep gaat altijd zo: wie je roept, “this is”, wie jij bent, en “over”.";
    return Math.random() < 0.5 && spreken() ? { soort: "spreek", niveau: 4, ...s, streng: false, tip } : { soort: "tegels", niveau: 4, ...s, tegels: schud([...s.verwacht, ...dist]), tip, roep };
  }
  const MAKER = { 1: oefLetter, 2: oefWoord, 3: oefPlaat, 4: oefRadio };
  const LESSEN = [
    [1, "Letters", "Van Alfa tot Zulu"], [2, "Woorden spellen", "Defender, snorkel, jerrycan…"], [3, "Nummerplaten", "Met Figures en I spell"], [4, "Radio-oproepen", "Rover Convoy, this is…"], [0, "Alles door elkaar", "Een mix van alles"],
  ];

  /* ---------------- les ---------------- */
  const LENGTE = 10;
  let les = null;
  function startLes(niveau) {
    const lijst = [];
    for (let i = 0; i < LENGTE; i++) {
      const n = niveau || 1 + (i % 4);
      let o = MAKER[n]();
      if (o.soort === "spreek" && !spreken()) o = { ...o, soort: o.verwacht.length > 1 ? "tegels" : "kies", ...(o.verwacht.length > 1 ? { tegels: schud([...o.verwacht, ...tegelsVoor(o.verwacht)]) } : { opties: schud([WOORD[o.verwacht[0]], ...lokvogels(o.verwacht[0], 3)]), antwoord: WOORD[o.verwacht[0]] }) };
      lijst.push(o);
    }
    les = { niveau, lijst: niveau ? lijst : schud(lijst), i: 0, juist: 0, eerste: LENGTE, herhaald: 0, start: Date.now() };
    oefening();
  }

  let keuze = null, gelegd = [];
  function voortgang() { return `<div class="nt-kop"><button type="button" class="nt-stop" data-stop aria-label="Les stoppen">×</button><div class="nt-balk"><i style="width:${Math.round((les.i / les.lijst.length) * 100)}%"></i></div><span>${Math.min(les.i + 1, les.lijst.length)}/${les.lijst.length}</span></div>`; }

  function oefening() {
    const o = les.lijst[les.i]; keuze = null; gelegd = [];
    lcd(`LES ${les.i + 1}/${les.lijst.length}`);
    let antwoord = "";
    if (o.soort === "kies") antwoord = `<div class="nt-opties">${o.opties.map((x) => `<button type="button" class="nt-optie" data-optie="${esc(x)}">${esc(x)}</button>`).join("")}</div>`;
    if (o.soort === "tegels") antwoord = `<div class="nt-lijn" id="nt-lijn" aria-label="Jouw antwoord"></div><div class="nt-bank" id="nt-bank">${o.tegels.map((t, i) => `<button type="button" class="nt-tegel" data-tegel="${i}">${esc(toon(t))}</button>`).join("")}</div>`;
    if (o.soort === "spreek") antwoord = `<div class="nt-spreek"><button type="button" class="cb-ptt" id="nt-ptt" aria-label="Houd ingedrukt en spreek"><span>PTT</span><small>Houd in</small></button>
      <div class="nt-gehoord" id="nt-gehoord"><small>Houd PTT ingedrukt, spreek in het Engels, laat los.</small></div></div>
      <p class="nt-klein"><button type="button" class="linkknop" data-stil>Ik kan nu niet praten</button> · <button type="button" class="linkknop" data-typ>Liever typen</button></p>`;
    doos.innerHTML = voortgang() + `<div class="nt-vraag">${o.vraag}</div>${o.uitleg ? `<p class="nt-klein">${o.uitleg}</p>` : ""}${antwoord}
      <div class="nt-voet" id="nt-voet"><button type="button" class="btn btn-solid nt-controleer" id="nt-controleer" disabled>Controleer</button></div>`;
    if (o.soort === "spreek") koppelPtt(o);
  }

  function legTegels(o) {
    const lijn = document.getElementById("nt-lijn"), bank = document.getElementById("nt-bank");
    lijn.innerHTML = gelegd.map((i, k) => `<button type="button" class="nt-tegel" data-terug="${k}">${esc(toon(o.tegels[i]))}</button>`).join("");
    bank.querySelectorAll("[data-tegel]").forEach((b) => b.classList.toggle("weg", gelegd.includes(+b.dataset.tegel)));
    document.getElementById("nt-controleer").disabled = !gelegd.length;
  }

  function controleer(gesproken) {
    const o = les.lijst[les.i];
    let juist = false, detail = "";
    if (o.soort === "kies") juist = keuze === o.antwoord;
    else {
      const gezegd = o.soort === "tegels" ? gelegd.map((i) => ({ t: o.tegels[i], w: toon(o.tegels[i]) })) : tokens(gesproken || "");
      const v = vergelijk(o.verwacht, gezegd, o.streng);
      juist = o.soort === "tegels" ? gezegd.map((x) => x.t).join(" ") === o.verwacht.join(" ") : v.juist;
      if (o.soort === "spreek") {
        const fout = gezegd.filter((x) => x.t[0] === "?");
        detail = `<p class="nt-klein">Ik hoorde: “${esc(gesproken || "niets")}”</p>` + (fout.length ? `<p class="nt-klein">${fout.map((x) => `“${esc(x.w)}” is niet juist, dat is ${esc(WOORD[x.t.slice(1)])}.`).join(" ")}</p>` : "");
        if (!juist && !v.juist) detail += `<p class="nt-chips">${o.verwacht.map((t, i) => `<span class="${v.ok[i] ? "ok" : "mis"}">${esc(toon(t))}</span>`).join("")}</p>`;
      }
    }
    (o.letters || []).forEach((l) => { zwak[l] = Math.max(0, (zwak[l] || 0) + (juist ? -1 : 2)); });
    bewaar.zet("zwak", zwak);
    if (les.i < les.eerste && juist) les.juist++;
    if (!juist && les.herhaald < 3 && !o.herhaling) { les.lijst.push({ ...o, herhaling: true, opties: o.opties && schud(o.opties), tegels: o.tegels && schud(o.tegels) }); les.herhaald++; }
    if (rx) { rx.classList.add("aan"); setTimeout(() => rx.classList.remove("aan"), 700); }
    const goed = o.antwoord ?? zin(o.verwacht);
    const voet = document.getElementById("nt-voet");
    voet.className = "nt-voet " + (juist ? "goed" : "fout");
    voet.innerHTML = `<div class="nt-oordeel"><b>${juist ? kies(["Roger, juist!", "Helemaal juist!", "Luid en duidelijk!", "Perfect!"]) : "Niet helemaal."}</b>
      ${juist ? "" : `<p>Juist antwoord: <b>${esc(goed)}</b></p>`}${detail}${o.tip && !juist ? `<p class="nt-klein">${esc(o.tip)}</p>` : ""}${!juist && !o.herhaling && les.herhaald <= 3 ? `<p class="nt-klein">Deze komt straks nog eens terug.</p>` : ""}</div>
      <button type="button" class="btn btn-solid" id="nt-verder" autofocus>Verder</button>`;
    doos.querySelectorAll(".nt-optie,.nt-tegel,#nt-ptt,[data-stil],[data-typ]").forEach((b) => { b.disabled = true; if (o.soort === "kies" && b.dataset.optie) b.classList.toggle("juist", b.dataset.optie === o.antwoord); });
    document.getElementById("nt-verder").focus();
  }

  function verder() {
    les.i++;
    if (les.i < les.lijst.length) return oefening();
    einde();
  }

  function einde() {
    lcd(""); micUit();
    const { juist, eerste } = les;
    doos.innerHTML = `<div class="nt-einde"><p class="nt-groot">${juist}/${eerste}</p><p>${juist === eerste ? "Foutloos! Over and out." : juist >= eerste * 0.7 ? "Goed bezig, bijna radiovast." : "Blijven oefenen, dan zit het er zo in."}</p><p class="nt-klein" id="nt-xp">Score bewaren…</p>
      <div class="nt-knoppen"><button type="button" class="btn btn-solid" data-les="${les.niveau}">Nog een les</button><button type="button" class="btn" data-start>Naar het overzicht</button></div></div>`;
    fetch("/api/cb/40/sessie", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ niveau: les.niveau, juist, totaal: eerste }) })
      .then((r) => r.json()).then((d) => {
        const el = document.getElementById("nt-xp");
        if (d.ok) { data = { ...data, ...d }; if (el) el.innerHTML = `+${d.verdiend} XP · reeks: <b>${d.mijn.reeks} ${d.mijn.reeks === 1 ? "dag" : "dagen"}</b> · deze week ${d.mijn.week} XP`; }
        else if (el) el.textContent = d.fout || "Score bewaren lukte niet.";
      }).catch(() => { const el = document.getElementById("nt-xp"); if (el) el.textContent = "Score bewaren lukte niet. Controleer je verbinding."; });
  }

  /* ---------------- PTT: opnemen, op de server omzetten naar tekst (Whisper) ---------------- */
  // De microfoon blijft open tijdens een les, zodat het eerste woord niet verloren gaat en je niet telkens toestemming moet geven.
  let stroom = null, mime = "";
  if (kanPraten) ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].some((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m) && (mime = m));
  function micUit() { if (stroom) { stroom.getTracks().forEach((t) => t.stop()); stroom = null; } }
  function mic() {
    if (stroom && stroom.getTracks().some((t) => t.readyState === "live")) return Promise.resolve(stroom);
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((s) => (stroom = s));
  }
  function koppelPtt(o) {
    const ptt = document.getElementById("nt-ptt"), uit = document.getElementById("nt-gehoord");
    let rec = null, stuks = [], begin = 0, los = false, klok = null;
    const zeg = (t, fout) => { uit.innerHTML = `<small class="${fout ? "fout" : ""}">${t}</small>`; };
    const stop = () => { los = true; clearInterval(klok); ptt.classList.remove("tx"); if (rec && rec.state === "recording") setTimeout(() => rec.state === "recording" && rec.stop(), 250); };
    ptt.addEventListener("pointerdown", (e) => {
      e.preventDefault(); if (ptt.disabled || (rec && rec.state === "recording")) return;
      ptt.setPointerCapture && ptt.setPointerCapture(e.pointerId);
      los = false;
      mic().then((s) => {
        if (los) { zeg("Microfoon staat klaar. Houd PTT nu ingedrukt terwijl je praat."); return; }
        stuks = []; rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
        rec.ondataavailable = (ev) => { if (ev.data.size) stuks.push(ev.data); };
        rec.onstop = () => {
          if (Date.now() - begin < 600) { zeg("Te kort. Houd PTT ingedrukt zolang je praat."); return; }
          const type = (rec.mimeType || mime || "audio/webm").split(";")[0];
          ptt.disabled = true; zeg("Even luisteren…");
          fetch("/api/cb/40/spraak", { method: "POST", credentials: "same-origin", headers: { "content-type": type }, body: new Blob(stuks, { type }) })
            .then((r) => r.json())
            .then((d) => {
              ptt.disabled = false;
              if (!d.ok) return zeg(esc(d.fout || "Omzetten lukte niet. Probeer opnieuw of typ je antwoord."), true);
              if (!d.tekst) return zeg("Ik hoorde niets. Houd PTT ingedrukt en spreek duidelijk.", true);
              uit.innerHTML = `<p>${esc(d.tekst)}</p>`;
              controleer(d.tekst);
            })
            .catch(() => { ptt.disabled = false; zeg("Omzetten lukte niet. Controleer je verbinding of typ je antwoord.", true); });
        };
        rec.start(); begin = Date.now(); ptt.classList.add("tx");
        zeg("Je zendt… laat PTT los als je klaar bent.");
        klok = setInterval(() => { if (Date.now() - begin > 15000) stop(); }, 250);
      }).catch(() => zeg("Geen toegang tot je microfoon. Sta die toe in je browser, of kies “Ik kan nu niet praten”.", true));
    });
    ptt.addEventListener("pointerup", stop); ptt.addEventListener("pointercancel", stop);
    ptt.addEventListener("contextmenu", (e) => e.preventDefault());
    ptt.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") e.preventDefault(); });
  }
  function typVeld() {
    const o = les.lijst[les.i];
    const plek = doos.querySelector(".nt-spreek");
    plek.outerHTML = `<form class="nt-typ" id="nt-typ"><input id="nt-typtekst" autocomplete="off" placeholder="${o.verwacht.length > 1 ? "Bv. Kilo Tango Whiskey" : "Bv. Kilo"}" aria-label="Typ wat je zou zeggen"></form>`;
    doos.querySelector(".nt-klein [data-typ]")?.parentNode.remove();
    const veld = document.getElementById("nt-typtekst"), knop = document.getElementById("nt-controleer");
    veld.focus(); veld.addEventListener("input", () => { knop.disabled = !veld.value.trim(); });
    document.getElementById("nt-typ").addEventListener("submit", (e) => { e.preventDefault(); if (veld.value.trim()) controleer(veld.value); });
  }

  /* ---------------- overzicht ---------------- */
  let tab = bewaar.lees("tab", "week");
  function lijstHtml(rij) {
    if (!rij || !rij.length) return `<p class="nt-klein">Nog niemand. Wees de eerste!</p>`;
    return `<ol class="nt-rang">${rij.map((x) => `<li class="${x.ik ? "ik" : ""}"><b>${x.plaats}</b><span>${esc(x.naam)}</span><em>${x.xp} XP</em></li>`).join("")}</ol>`;
  }
  function start() {
    les = null; lcd(""); micUit();
    const m = data.mijn || { xp: 0, reeks: 0, week: 0, juist: 0, totaal: 0 };
    const pct = m.totaal ? Math.round((m.juist / m.totaal) * 100) : 0;
    doos.innerHTML = `<div class="nt-start">
      <div class="nt-stats"><div><b>${m.reeks}</b><small>${m.reeks === 1 ? "dag" : "dagen"} op rij${m.reeks && !m.vandaag ? ", oefen vandaag!" : ""}</small></div><div><b>${m.week}</b><small>XP deze week</small></div><div><b>${m.xp}</b><small>XP in totaal</small></div><div><b>${pct}%</b><small>juist</small></div></div>
      <h3 class="nt-h">Kies een les</h3>
      <div class="nt-lessen">${LESSEN.map(([n, t, s]) => `<button type="button" class="nt-les" data-les="${n}"><b>${n || "★"}</b><span>${t}<small>${s}</small></span></button>`).join("")}</div>
      <p class="nt-klein">${kanPraten ? (stil ? `Spreekoefeningen staan uit. <button type="button" class="linkknop" data-praat>Zet ze aan</button>` : "Bij spreekoefeningen houd je PTT ingedrukt en spreek je in het Engels.") : "Je browser kan niet opnemen. Je tikt of typt je antwoorden."}</p>
      <h3 class="nt-h">Ranglijst</h3>
      <div class="nt-tabs" role="tablist"><button type="button" role="tab" data-tab="week" aria-selected="${tab === "week"}">Deze week</button><button type="button" role="tab" data-tab="altijd" aria-selected="${tab === "altijd"}">Altijd</button></div>
      ${lijstHtml(data[tab])}
      <details class="nt-spiek"><summary>Spiekbriefje</summary><div class="nt-tabel">${LETTERS.map((l) => `<span><b>${l}</b>${WOORD[l]}</span>`).join("")}${CIJFER.map((w, i) => `<span><b>${i}</b>${w}</span>`).join("")}</div>
        <p class="nt-klein">Cijfers zeg je één voor één. Zeg “Figures” voor een groep cijfers en “I spell” voor een groep letters. Sluit af met “over” als je antwoord verwacht, met “out” als het gesprek gedaan is.</p></details>
    </div>`;
  }

  doos.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.les !== undefined) return startLes(+b.dataset.les);
    if (b.hasAttribute("data-start") || b.hasAttribute("data-stop")) return start();
    if (b.dataset.tab) { tab = b.dataset.tab; bewaar.zet("tab", tab); return start(); }
    if (b.hasAttribute("data-praat")) { stil = false; bewaar.zet("stil", false); return start(); }
    if (!les) return;
    const o = les.lijst[les.i];
    if (b.id === "nt-verder") return verder();
    if (b.id === "nt-controleer") { if (o.soort === "spreek") { const v = document.getElementById("nt-typtekst"); if (v && v.value.trim()) controleer(v.value); } else controleer(); return; }
    if (b.dataset.optie !== undefined) { keuze = b.dataset.optie; doos.querySelectorAll(".nt-optie").forEach((x) => x.classList.toggle("gekozen", x === b)); document.getElementById("nt-controleer").disabled = false; return; }
    if (b.dataset.tegel !== undefined) { const i = +b.dataset.tegel; if (!gelegd.includes(i)) { gelegd.push(i); legTegels(o); } return; }
    if (b.dataset.terug !== undefined) { gelegd.splice(+b.dataset.terug, 1); legTegels(o); return; }
    if (b.hasAttribute("data-stil")) {
      stil = true; bewaar.zet("stil", true);
      // Deze en de volgende spreekoefeningen worden tik-oefeningen.
      les.lijst = les.lijst.map((x, k) => k < les.i || x.soort !== "spreek" ? x : x.verwacht.length > 1 ? { ...x, soort: "tegels", tegels: schud([...x.verwacht, ...tegelsVoor(x.verwacht)]) } : { ...x, soort: "kies", opties: schud([WOORD[x.verwacht[0]], ...lokvogels(x.verwacht[0], 3)]), antwoord: WOORD[x.verwacht[0]] });
      return oefening();
    }
    if (b.hasAttribute("data-typ")) return typVeld();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !les || e.target.id === "nt-typtekst" || e.target.closest("button, a, input, select, textarea, summary")) return;
    const v = document.getElementById("nt-verder"), c = document.getElementById("nt-controleer");
    if (v) { e.preventDefault(); verder(); } else if (c && !c.disabled) { e.preventDefault(); c.click(); }
  });

  if (!kanPraten) stil = true;
  start();
})();
