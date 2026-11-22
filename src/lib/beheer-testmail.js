// /beheer/testmail: voorbeeldmails versturen naar een adres naar keuze, om de opmaak te bekijken.
// De QR in de testmail is een willekeurige code die niet in de database staat (werkt dus niet bij het scannen).
import { esc, pagina } from "./beheer.js";
import { verstuur } from "./mail.js";
import { klantMailOpmaak } from "./mails-bevestiging.js";
import { nieuweTicketCode } from "./ticket.js";
import { mailBestelling, mailInschrijving } from "./opslag.js";
import { corTicketMail, aankondigingMail } from "./mails-lancering.js";
import { wolfMailInhoud, klantWolfMail, escalatieMail } from "./wolf.js";

const VOORBEELD_COR = { nummer: "EC-TEST0001", naam: "Pieter Van Baekel", totaal: 20,
  data: { bron: "ecwid", soort: "inschrijving", klant: { naam: "Pieter Van Baekel" }, lijnen: [{ naam: "CHURCH OF ROVER -- 22 november 2026", aantal: 1, prijs: 20, lijn: 20, opties: ["Roadbook: Ik rijd mee ! (per wagen)", "Kerkbezoek (met rondleiding): 10:30"] }], totaal: 20 } };

const VOORBEELD_INSCHRIJVING = {
  soort: "inschrijving", nummer: "RI-000000-TEST1", activiteit: "church-of-rover", activiteit_titel: "Church of Rover (Zo 22 nov)", activiteit_naam: "Church of Rover",
  activiteit_datum_lang: "zondag 22 november 2026", activiteit_locatie: "Kerk van Oostham", activiteit_uren: "Vanaf 10:00", klant: { naam: "Pieter Van Baekel" },
  tijdslot: "10:30", wagen: "Defender 110", totaal: 35, test: true,
  lijnen: [{ aantal: 4, naam: "Bezoek kerktoren met rondleiding", prijs: 5, per: "persoon", lijn: 20 }, { aantal: 1, naam: "Rondrit met roadbook", prijs: 15, per: "wagen", lijn: 15 }],
};
const VOORBEELD_BESTELLING = {
  soort: "bestelling", nummer: "RC-000000-TEST1", klant: { naam: "Pieter Van Baekel" }, levering: { type: "oostham" },
  artikels: [{ aantal: 2, naam: "T-shirt Rover & Co", keuzes: { Maat: "L" }, lijn: 50 }], subtotaal: 50, verzending: 0, donatie: 5, totaal: 55,
};

export async function beheerTestmail(request, env, url, email) {
  if (url.pathname !== "/beheer/testmail") return null;
  let melding = "";
  if (request.method === "POST") {
    const f = await request.formData();
    const aan = String(f.get("aan") || "").trim().toLowerCase();
    const soort = String(f.get("soort") || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(aan)) melding = "!Geen geldig mailadres.";
    else {
      const site = url.origin;
      let m;
      if (soort === "inschrijving" || soort === "bestelling") {
        const b = { ...(soort === "inschrijving" ? VOORBEELD_INSCHRIJVING : VOORBEELD_BESTELLING), site };
        const fakeEnv = { ...env, SHOP_DB: { prepare: () => ({ bind: () => ({ first: async () => ({ ticket: nieuweTicketCode() }), run: async () => ({ meta: { changes: 0 } }) }) }) } };
        const o = await klantMailOpmaak(fakeEnv, { data: b });
        m = { onderwerp: `[TEST] ${soort === "inschrijving" ? "Je inschrijving voor Church of Rover" : "Je bestelling bij Rover & Co"}`, tekst: (soort === "inschrijving" ? mailInschrijving(b) : mailBestelling(b)).tekst, html: o.html, bijlagen: o.bijlagen };
      } else if (soort === "cor") {
        const fakeEnv = { ...env, SHOP_DB: { prepare: () => ({ bind: () => ({ first: async () => ({ ticket: nieuweTicketCode() }), run: async () => ({ meta: { changes: 0 } }) }) }) } };
        m = await corTicketMail(fakeEnv, VOORBEELD_COR, { site, wachtwoordLink: `${site}/account/wachtwoord-vergeten`, test: true });
      } else if (soort.startsWith("wolf-")) {
        // Voorbeeldbestelling; de knop in de Wolf-mail wijst naar een link die niet bestaat (geeft "klopt niet").
        const d = { soort: "bestelling", nummer: "RC-000000-TEST1", klant: { naam: "Pieter Van Baekel", email: aan, telefoon: "0477 00 00 00" },
          levering: { type: "verzenden", straat: "Stokerijstraat 75", postcode: "3945", gemeente: "Ham", land: "België" },
          artikels: [{ aantal: 2, naam: "Rover & Co T-shirt", keuzes: { Maat: "L" } }, { aantal: 1, naam: "Emaille mok" }], opmerking: "Dit is een testbestelling" };
        const r = { nummer: d.nummer, naam: d.klant.naam, email: aan, telefoon: d.klant.telefoon, betaald_op: new Date(Date.now() - (soort === "wolf-herinnering" ? 6 : 0) * 86400_000).toISOString(), data: JSON.stringify(d) };
        const x = soort === "wolf-nieuw" ? wolfMailInhoud(r, "0".repeat(40), 0)
          : soort === "wolf-herinnering" ? wolfMailInhoud(r, "0".repeat(40), 1)
          : soort === "wolf-escalatie" ? escalatieMail({ ...r, gestuurd_op: new Date(Date.now() - 14 * 86400_000).toISOString(), herinneringen: 2 }, d, 14)
          : soort === "wolf-klaar-act" ? klantWolfMail(r, { ...d, levering: { type: "activiteit", activiteit: "Tea on the Tailgate (18 dec)" } }, { status: "klaar" })
          : klantWolfMail(r, d, soort === "wolf-onderweg" ? { status: "verzonden", vervoerder: "bpost", tt: "323212345678901234" } : { status: "klaar" });
        m = { ...x, onderwerp: `[TEST] ${x.onderwerp}` };
      } else if (soort === "aankondiging") {
        m = aankondigingMail({ naam: "Pieter Van Baekel" }, { site, wachtwoordLink: `${site}/account/wachtwoord-vergeten`, afmeldLink: `${site}/account/afmelden?t=test`, test: true });
      } else {
        m = { onderwerp: "[TEST] Nieuw antwoord in Wie heeft er dorst", tekst: `Hallo,\n\nSuzanne antwoordde op je topic "Wie heeft er dorst".\n\nBekijk het antwoord: ${site}/forum\n\nJe krijgt deze mail omdat je dit topic volgt.` };
      }
      const r = await verstuur(env, { aan, ...m });
      melding = r.ok ? `Testmail verstuurd naar ${aan}.` : `!Versturen mislukt: ${r.fout || r.status}`;
    }
  }
  const knop = (s, t) => `<button type="submit" name="soort" value="${s}">${t}</button>`;
  return pagina("Testmail", `<!--aan:testmail-->${melding ? `<div class="${melding.startsWith("!") ? "melding-fout" : "melding-ok"}">${esc(melding.replace(/^!/, ""))}</div>` : ""}
<div class="kaart"><h2>Testmail versturen</h2><p>Stuur een voorbeeld van een mail om de opmaak te bekijken. De QR-code in de testmail werkt niet bij het scannen.</p>
<form method="post" action="/beheer/testmail"><label>Naar<input name="aan" type="email" value="pieter@susconsult.be" required></label>
<p style="display:flex;gap:8px;flex-wrap:wrap">${knop("inschrijving", "Inschrijving met ticket")}${knop("bestelling", "Bestelling webshop")}${knop("gewoon", "Gewone melding")}${knop("cor", "Ticket Church of Rover (Ecwid)")}${knop("aankondiging", "Aankondiging nieuwe site")}</p>
<h2 style="margin-top:18px">Wolf Workwear</h2><p style="display:flex;gap:8px;flex-wrap:wrap">${knop("wolf-nieuw", "Wolf: nieuwe bestelling")}${knop("wolf-herinnering", "Wolf: herinnering")}${knop("wolf-onderweg", "Klant: onderweg")}${knop("wolf-klaar", "Klant: ligt klaar in Ham")}${knop("wolf-klaar-act", "Klant: klaar (ophalen op activiteit)")}${knop("wolf-escalatie", "Jij: 14 dagen open")}</p></form></div>`, email);
}
