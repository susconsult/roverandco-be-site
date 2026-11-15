/**
 * Rover & Co – bestellingen en inschrijvingen van de website naar deze sheet, plus mails.
 *
 * Installatie (eenmalig, in de sheet "Rover & Co – Webshop bestellingen"):
 *  Extensies > Apps Script > deze code plakken > Opslaan
 *  Implementeren > Nieuwe implementatie > Type: Web-app
 *    Uitvoeren als: Ik   |   Toegang: Iedereen
 *  Het web-app-adres (…/exec) komt als Secret APPS_SCRIPT_URL in Cloudflare.
 *  Na elke wijziging aan dit script: Implementeren > Implementaties beheren > bewerken > Nieuwe versie.
 *
 * Mails:
 *  - Melding naar MELDING_AAN bij elke nieuwe betaalde (of test-)bestelling en inschrijving.
 *  - Bevestiging naar de klant vanaf AFZENDER, alleen na een betaling.
 *    AFZENDER moet in Gmail van het account achter dit script staan als "Verzenden als"-adres
 *    (Gmail > Instellingen > Accounts > Mail verzenden als). Staat het er niet, dan gaat er GEEN mail
 *    naar de klant en staat in de kolom "Mail klant" waarom.
 *
 * Acties (veld "actie" in de aanvraag van de Worker):
 *  nieuw     : rij toevoegen, of bijwerken bij opnieuw proberen (zelfde nummer). Controleert tijdsloten.
 *  ordercode : Viva-ordercode bij de rij zetten.
 *  betaald   : rij op "Betaald" zetten (de Worker heeft de betaling bij Viva gecontroleerd) en mails sturen.
 */
var MELDING_AAN = 'pieter@roverandco.be';
var AFZENDER = 'noreply@roverandco.be';
var AFZENDER_NAAM = 'Rover & Co VZW';
var ANTWOORD_AAN = 'info@roverandco.be';

var TABS = {
  bestelling: {
    naam: 'Bestellingen',
    kolommen: ['Aangemaakt', 'Nummer', 'Test', 'Status', 'Naam', 'E-mail', 'Telefoon', 'Levering', 'Activiteit',
      'Straat', 'Postcode', 'Gemeente', 'Land', 'Artikels', 'Stuks', 'Subtotaal', 'Verzending', 'Donatie', 'Totaal', 'Opmerking',
      'Viva ordercode', 'Transactie', 'Betaald op', 'Mail klant', 'Ruwe data']
  },
  inschrijving: {
    naam: 'Inschrijvingen',
    kolommen: ['Aangemaakt', 'Nummer', 'Test', 'Status', 'Activiteit', 'Activiteit-code', 'Naam', 'E-mail', 'Telefoon',
      'Onderdelen', 'Tijdslot', 'Personen in slot', 'Wagen', 'Totaal', 'Opmerking',
      'Viva ordercode', 'Transactie', 'Betaald op', 'Mail klant', 'Ruwe data']
  }
};
var BETAALD = 'Betaald';

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var b = JSON.parse(e.postData.contents);
    if (b.actie === 'nieuw') return antwoord(nieuw(b));
    if (b.actie === 'ordercode') return antwoord(zetOrdercode(b));
    if (b.actie === 'betaald') return antwoord(betaald(b));
    return antwoord({ ok: false, fout: 'onbekende actie' });
  } catch (err) {
    return antwoord({ ok: false, fout: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- acties ---------- */

function nieuw(b) {
  var t = TABS[b.soort];
  if (!t || !b.nummer || !b.klant) return { ok: false, fout: 'onvolledig' };
  var sh = tabblad(b.soort), k = kolomIndex(t);
  var rij = zoekRij(sh, k['Nummer'], b.nummer);

  if (rij) {
    var status = sh.getRange(rij, k['Status'] + 1).getValue();
    if (status === BETAALD) return { ok: true, nummer: b.nummer, betaald: true };
  }
  if (b.soort === 'inschrijving' && b.max_per_slot > 0 && b.tijdslot) {
    if (bezet(sh, k, b, rij) + b.slot_personen > b.max_per_slot) return { ok: false, fout: 'vol' };
  }

  var waarden = rijWaarden(b);
  if (rij) {
    waarden[k['Aangemaakt']] = sh.getRange(rij, k['Aangemaakt'] + 1).getValue(); // oorspronkelijke datum behouden
    waarden[k['Viva ordercode']] = '';
    sh.getRange(rij, 1, 1, waarden.length).setValues([waarden]);
  } else {
    sh.appendRow(waarden);
  }
  // Zonder betaling (testmodus of gratis): meteen de melding sturen.
  if (b.status !== 'Wacht op betaling' && !rij) stuurMelding(b, '');
  return { ok: true, nummer: b.nummer };
}

function zetOrdercode(b) {
  var t = TABS[b.soort];
  if (!t) return { ok: false, fout: 'soort' };
  var sh = tabblad(b.soort), k = kolomIndex(t);
  var rij = zoekRij(sh, k['Nummer'], b.nummer);
  if (!rij) return { ok: false, fout: 'niet gevonden' };
  sh.getRange(rij, k['Viva ordercode'] + 1).setValue("'" + b.ordercode); // als tekst: 16 cijfers is te lang voor een getal
  return { ok: true };
}

function betaald(b) {
  var soorten = ['bestelling', 'inschrijving'];
  for (var i = 0; i < soorten.length; i++) {
    var soort = soorten[i], t = TABS[soort], sh = tabblad(soort), k = kolomIndex(t);
    var rij = zoekRij(sh, k['Viva ordercode'], String(b.ordercode)) || (b.ref ? zoekRij(sh, k['Nummer'], b.ref) : 0);
    if (!rij) continue;

    var r = sh.getRange(rij, 1, 1, t.kolommen.length).getValues()[0];
    var nummer = r[k['Nummer']];
    if (r[k['Status']] === BETAALD) return { ok: true, nummer: nummer, soort: soort }; // al verwerkt: niets dubbel doen

    var data = JSON.parse(r[k['Ruwe data']]);
    var juist = Math.abs(Number(r[k['Totaal']]) - Number(b.bedrag)) < 0.005;
    sh.getRange(rij, k['Status'] + 1).setValue(juist ? BETAALD : 'Bedrag klopt niet: € ' + Number(b.bedrag).toFixed(2));
    sh.getRange(rij, k['Transactie'] + 1).setValue(b.transactie);
    sh.getRange(rij, k['Betaald op'] + 1).setValue(new Date());

    var mailKlant = juist ? stuurBevestiging(data) : 'niet verstuurd: bedrag klopt niet';
    sh.getRange(rij, k['Mail klant'] + 1).setValue(mailKlant);
    stuurMelding(data, (juist ? 'Betaald' : 'LET OP: betaald bedrag (€ ' + Number(b.bedrag).toFixed(2) + ') klopt niet met het totaal') +
      ' – Viva-transactie ' + b.transactie + '\nMail naar klant: ' + mailKlant);
    return { ok: true, nummer: nummer, soort: soort };
  }
  return { ok: false, fout: 'niet gevonden' };
}

/* ---------- rijen ---------- */

function rijWaarden(b) {
  var k = kolomIndex(TABS[b.soort]), w = [];
  for (var i = 0; i < TABS[b.soort].kolommen.length; i++) w.push('');
  var zet = function (kol, v) { w[k[kol]] = v; };
  zet('Aangemaakt', new Date(b.aangemaakt)); zet('Nummer', b.nummer); zet('Test', b.test ? 'ja' : 'nee'); zet('Status', b.status);
  zet('Naam', b.klant.naam); zet('E-mail', b.klant.email); zet('Telefoon', "'" + b.klant.telefoon);
  zet('Totaal', b.totaal); zet('Opmerking', b.opmerking || ''); zet('Ruwe data', JSON.stringify(b));
  if (b.soort === 'bestelling') {
    var lev = b.levering || {};
    zet('Levering', leveringTekst(lev)); zet('Activiteit', lev.activiteit || ''); zet('Straat', lev.straat || '');
    zet('Postcode', lev.postcode ? "'" + lev.postcode : ''); zet('Gemeente', lev.gemeente || ''); zet('Land', lev.land || '');
    zet('Artikels', artikelTekst(b)); zet('Stuks', b.artikels.reduce(function (s, a) { return s + a.aantal; }, 0));
    zet('Subtotaal', b.subtotaal); zet('Verzending', b.verzending); zet('Donatie', b.donatie);
  } else {
    zet('Activiteit', b.activiteit_titel); zet('Activiteit-code', b.activiteit); zet('Onderdelen', lijnTekst(b));
    zet('Tijdslot', b.tijdslot ? "'" + b.tijdslot : ''); zet('Personen in slot', b.slot_personen || ''); zet('Wagen', b.wagen || '');
  }
  return w;
}

// Aantal personen dat al in hetzelfde tijdslot zit: betaald, test, gratis, of nog aan het betalen (binnen de betaaltijd).
function bezet(sh, k, b, eigenRij) {
  var n = sh.getLastRow();
  if (n < 2) return 0;
  var rijen = sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues(), som = 0, nu = Date.now();
  var grens = (Number(b.betaaltijd_min) || 15) * 60 * 1000;
  for (var i = 0; i < rijen.length; i++) {
    if (eigenRij && i + 2 === eigenRij) continue;
    var r = rijen[i];
    if (r[k['Activiteit-code']] !== b.activiteit || String(r[k['Tijdslot']]) !== b.tijdslot) continue;
    var st = String(r[k['Status']]);
    var telt = st === BETAALD || st.indexOf('Test') === 0 || st.indexOf('Bevestigd') === 0 ||
      (st === 'Wacht op betaling' && nu - new Date(r[k['Aangemaakt']]).getTime() < grens);
    if (telt) som += Number(r[k['Personen in slot']]) || 0;
  }
  return som;
}

/* ---------- mails ---------- */

function stuurMelding(b, extra) {
  var soortTekst = b.soort === 'bestelling' ? 'bestelling' : 'inschrijving';
  var onderwerp = (b.test ? '[TEST] ' : '') + 'Nieuwe ' + soortTekst + ' ' + b.nummer +
    (b.soort === 'inschrijving' ? ' – ' + b.activiteit_titel : '') + ' – ' + eur(b.totaal);
  var regels = [
    (b.test ? 'TEST – er is niet betaald.' : ''), extra || '', '',
    'Nummer: ' + b.nummer,
    'Klant: ' + b.klant.naam + ' – ' + b.klant.email + ' – ' + b.klant.telefoon
  ];
  if (b.soort === 'bestelling') {
    var lev = b.levering || {};
    regels.push('Levering: ' + leveringTekst(lev) + (lev.activiteit ? ' – ' + lev.activiteit : '') +
      (lev.type === 'verzenden' ? ' – ' + adres(lev) : ''), '', artikelTekst(b), '',
      'Subtotaal: ' + eur(b.subtotaal), 'Verzending: ' + eur(b.verzending), 'Steun: ' + eur(b.donatie));
  } else {
    regels.push('Activiteit: ' + b.activiteit_titel, '', lijnTekst(b), '');
    if (b.tijdslot) regels.push('Tijdslot: ' + b.tijdslot);
    if (b.wagen) regels.push('Land Rover: ' + b.wagen);
  }
  regels.push('Totaal: ' + eur(b.totaal));
  if (b.opmerking) regels.push('', 'Opmerking: ' + b.opmerking);
  regels.push('', 'Alles in de sheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
  MailApp.sendEmail(MELDING_AAN, onderwerp, regels.join('\n').replace(/^\n+/, ''));
}

// Geeft terug wat er gebeurd is, voor de kolom "Mail klant".
function stuurBevestiging(b) {
  if (GmailApp.getAliases().indexOf(AFZENDER) === -1) return 'niet verstuurd: ' + AFZENDER + ' staat niet als "Verzenden als" in Gmail';
  var m = b.soort === 'bestelling' ? mailBestelling(b) : mailInschrijving(b);
  try {
    GmailApp.sendEmail(b.klant.email, m.onderwerp, m.tekst, { from: AFZENDER, name: AFZENDER_NAAM, replyTo: ANTWOORD_AAN });
    return 'verstuurd ' + Utilities.formatDate(new Date(), 'Europe/Brussels', 'dd/MM/yyyy HH:mm');
  } catch (err) {
    return 'fout: ' + String(err).slice(0, 200);
  }
}

function mailBestelling(b) {
  var lev = b.levering || {}, ophalen;
  if (lev.type === 'activiteit') ophalen = 'Je kan je bestelling ophalen op ' + lev.activiteit + '.';
  else if (lev.type === 'oostham') ophalen = 'Je haalt je bestelling op in Oostham. We nemen contact met je op om een moment af te spreken.';
  else ophalen = 'We versturen je bestelling naar: ' + adres(lev) + '.';
  var regels = [
    'Hallo ' + b.klant.naam + ',', '',
    'Bedankt voor je bestelling bij Rover & Co VZW. We hebben je betaling van ' + eur(b.totaal) + ' goed ontvangen.', '',
    'Bestelnummer: ' + b.nummer, '', artikelTekst(b), '',
    'Subtotaal: ' + eur(b.subtotaal), 'Verzending: ' + eur(b.verzending)
  ];
  if (b.donatie > 0) regels.push('Steun aan de vzw: ' + eur(b.donatie));
  regels.push('Totaal: ' + eur(b.totaal), '', ophalen, '',
    'Vragen? Antwoord op deze mail of mail naar ' + ANTWOORD_AAN + ' en vermeld je bestelnummer.', '',
    'Bedankt voor je steun!', 'Rover & Co VZW');
  return { onderwerp: 'Je bestelling bij Rover & Co (' + b.nummer + ')', tekst: regels.join('\n') };
}

function mailInschrijving(b) {
  var regels = [
    'Hallo ' + b.klant.naam + ',', '',
    'Je bent ingeschreven voor ' + b.activiteit_titel + '. We hebben je betaling van ' + eur(b.totaal) + ' goed ontvangen.', '',
    'Inschrijfnummer: ' + b.nummer, '', lijnTekst(b)
  ];
  if (b.tijdslot) regels.push('Tijdslot: ' + b.tijdslot);
  if (b.wagen) regels.push('Land Rover: ' + b.wagen);
  regels.push('Totaal: ' + eur(b.totaal), '');
  if (b.site) regels.push('Alle info over de activiteit: ' + b.site + '/activiteiten/' + b.activiteit, '');
  regels.push('Vragen? Antwoord op deze mail of mail naar ' + ANTWOORD_AAN + ' en vermeld je inschrijfnummer.', '',
    'Tot dan!', 'Rover & Co VZW');
  return { onderwerp: 'Je inschrijving voor ' + b.activiteit_titel + ' (' + b.nummer + ')', tekst: regels.join('\n') };
}

/* ---------- hulpjes ---------- */

function eur(n) { return '€ ' + Number(n || 0).toFixed(2).replace('.', ','); }
function adres(l) { return l.straat + ', ' + l.postcode + ' ' + l.gemeente + ' (' + l.land + ')'; }
function leveringTekst(l) { return { activiteit: 'Ophalen op activiteit', oostham: 'Ophalen in Oostham', verzenden: 'Verzenden' }[l.type] || l.type || ''; }
function artikelTekst(b) {
  return b.artikels.map(function (a) {
    var k = Object.keys(a.keuzes || {}).map(function (n) { return n + ': ' + a.keuzes[n]; }).join(', ');
    return a.aantal + ' × ' + a.naam + (k ? ' (' + k + ')' : '') + ' = ' + eur(a.lijn);
  }).join('\n');
}
function lijnTekst(b) {
  var per = { persoon: 'per persoon', wagen: 'per wagen', stuk: 'per stuk' };
  return b.lijnen.map(function (l) { return l.aantal + ' × ' + l.naam + ' (' + eur(l.prijs) + ' ' + (per[l.per] || '') + ') = ' + eur(l.lijn); }).join('\n');
}

function kolomIndex(t) { var k = {}; t.kolommen.forEach(function (n, i) { k[n] = i; }); return k; }

function zoekRij(sh, kol, waarde) {
  var n = sh.getLastRow();
  if (n < 2 || !waarde) return 0;
  var v = sh.getRange(2, kol + 1, n - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]) === String(waarde)) return i + 2;
  return 0;
}

function tabblad(soort) {
  var t = TABS[soort], ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(t.naam) || ss.insertSheet(t.naam);
  var kop = sh.getLastRow() ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0] : [];
  if (kop.join('|') !== t.kolommen.join('|')) {
    sh.getRange(1, 1, 1, t.kolommen.length).setValues([t.kolommen]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function antwoord(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
