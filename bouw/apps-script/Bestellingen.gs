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
 *  - Melding naar MELDING_AAN bij elke nieuwe betaalde, gratis of test-inschrijving/bestelling,
 *    en zodra een onderdeel de meldingsgrens haalt (bv. 100 wagens camping).
 *  - Bevestiging naar de klant (na betaling, of meteen bij een gratis inschrijving):
 *    de Worker stuurt die via Resend vanaf noreply@roverandco.be (geen antwoordadres).
 *    Dit script maakt de tekst en noteert het resultaat in de kolom "Mail klant".
 *
 * Acties (veld "actie" in de aanvraag van de Worker):
 *  nieuw     : rij toevoegen, of bijwerken bij opnieuw proberen (zelfde nummer). Controleert tijdsloten.
 *  ordercode : Viva-ordercode bij de rij zetten.
 *  betaald   : rij op "Betaald" zetten (de Worker heeft de betaling bij Viva gecontroleerd) en mails sturen.
 *  mailstatus: resultaat van de klantmail (Resend) noteren.
 */
var MELDING_AAN = 'pieter@roverandco.be';
var VRAGEN_AAN = 'info@roverandco.be';

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
    if (b.actie === 'mailstatus') return antwoord(mailstatus(b));
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
  var voor = b.soort === 'inschrijving' ? telOnderdelen(sh, k, b, rij) : {};
  if (b.soort === 'inschrijving') {
    var lim = b.limieten || [];
    for (var i = 0; i < lim.length; i++) {
      if (lim[i].capaciteit > 0 && (voor[lim[i].id] || 0) + lim[i].aantal > lim[i].capaciteit) return { ok: false, fout: 'vol', onderdeel: lim[i].naam };
    }
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
  var res = { ok: true, nummer: b.nummer };
  if (b.status !== 'Wacht op betaling' && !rij) {
    stuurMelding(b, '');
    if (b.soort === 'inschrijving') controleerGrenzen(b, voor);
    if (!b.test) {
      var r2 = zoekRij(sh, k['Nummer'], b.nummer);
      res.mail = klantMail(b);
      sh.getRange(r2, k['Mail klant'] + 1).setValue(b.resend ? 'wordt verstuurd' : 'niet verstuurd: Resend is nog niet ingesteld');
      if (!b.resend) delete res.mail;
    }
  }
  return res;
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
    var voor = soort === 'inschrijving' ? telOnderdelen(sh, k, data, rij) : {};
    var juist = Math.abs(Number(r[k['Totaal']]) - Number(b.bedrag)) < 0.005;
    sh.getRange(rij, k['Status'] + 1).setValue(juist ? BETAALD : 'Bedrag klopt niet: € ' + Number(b.bedrag).toFixed(2));
    sh.getRange(rij, k['Transactie'] + 1).setValue(b.transactie);
    sh.getRange(rij, k['Betaald op'] + 1).setValue(new Date());

    var mailKlant = !juist ? 'niet verstuurd: bedrag klopt niet' : b.resend ? 'wordt verstuurd' : 'niet verstuurd: Resend is nog niet ingesteld';
    sh.getRange(rij, k['Mail klant'] + 1).setValue(mailKlant);
    stuurMelding(data, (juist ? 'Betaald' : 'LET OP: betaald bedrag (€ ' + Number(b.bedrag).toFixed(2) + ') klopt niet met het totaal') +
      ' – Viva-transactie ' + b.transactie + '\nMail naar klant: ' + mailKlant);
    if (soort === 'inschrijving') controleerGrenzen(data, voor);
    var res = { ok: true, nummer: nummer, soort: soort };
    if (juist && b.resend) res.mail = klantMail(data);
    return res;
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

function klantMail(b) {
  var m = b.soort === 'bestelling' ? mailBestelling(b) : mailInschrijving(b);
  return { aan: b.klant.email, onderwerp: m.onderwerp, tekst: m.tekst, nummer: b.nummer, soort: b.soort };
}

function mailstatus(b) {
  var t = TABS[b.soort];
  if (!t) return { ok: false, fout: 'soort' };
  var sh = tabblad(b.soort), k = kolomIndex(t), rij = zoekRij(sh, k['Nummer'], b.nummer);
  if (!rij) return { ok: false, fout: 'niet gevonden' };
  sh.getRange(rij, k['Mail klant'] + 1).setValue(String(b.status).slice(0, 300));
  return { ok: true };
}

// Totaal per onderdeel voor een activiteit (betaald, gratis, test of nog aan het betalen), zonder de eigen rij.
function telOnderdelen(sh, k, b, eigenRij) {
  var n = sh.getLastRow(), som = {};
  if (n < 2) return som;
  var rijen = sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues(), nu = Date.now();
  var grens = (Number(b.betaaltijd_min) || 15) * 60 * 1000;
  for (var i = 0; i < rijen.length; i++) {
    if (eigenRij && i + 2 === eigenRij) continue;
    var r = rijen[i];
    if (r[k['Activiteit-code']] !== b.activiteit) continue;
    var st = String(r[k['Status']]);
    var telt = st === BETAALD || st.indexOf('Test') === 0 || st.indexOf('Bevestigd') === 0 ||
      (st === 'Wacht op betaling' && nu - new Date(r[k['Aangemaakt']]).getTime() < grens);
    if (!telt) continue;
    var d; try { d = JSON.parse(r[k['Ruwe data']]); } catch (e) { continue; }
    (d.lijnen || []).forEach(function (l) { som[l.id] = (som[l.id] || 0) + l.aantal; });
  }
  return som;
}

// Mail naar Pieter zodra een onderdeel met deze inschrijving over zijn meldingsgrens gaat.
function controleerGrenzen(b, voor) {
  (b.limieten || []).forEach(function (l) {
    if (!l.melding) return;
    var oud = voor[l.id] || 0, nieuw = oud + l.aantal;
    if (oud < l.melding && nieuw >= l.melding) {
      MailApp.sendEmail(MELDING_AAN, (b.test ? '[TEST] ' : '') + b.activiteit_titel + ': ' + l.naam + ' heeft ' + nieuw + ' ' + (l.per === 'wagen' ? 'wagens' : 'stuks'),
        l.naam + ' bij ' + b.activiteit_titel + ' is net over de grens van ' + l.melding + ' gegaan (nu ' + nieuw + ').\n\n' +
        'Laatste inschrijving: ' + b.nummer + '\n\nAlles in de sheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
    }
  });
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
    'Dit is een automatische mail, je kan er niet op antwoorden.',
    'Vragen? Mail naar ' + VRAGEN_AAN + ' en vermeld je bestelnummer.', '',
    'Bedankt voor je steun!', 'Rover & Co VZW');
  return { onderwerp: 'Je bestelling bij Rover & Co (' + b.nummer + ')', tekst: regels.join('\n') };
}

function mailInschrijving(b) {
  var regels = [
    'Hallo ' + b.klant.naam + ',', '',
    'Je bent ingeschreven voor ' + b.activiteit_titel + '.' + (b.totaal > 0 ? ' We hebben je betaling van ' + eur(b.totaal) + ' goed ontvangen.' : ''), '',
    'Inschrijfnummer: ' + b.nummer, '', lijnTekst(b)
  ];
  if (b.tijdslot) regels.push('Tijdslot: ' + b.tijdslot);
  if (b.wagen) regels.push('Land Rover: ' + b.wagen);
  if (b.totaal > 0) regels.push('Totaal: ' + eur(b.totaal));
  regels.push('');
  if (b.site) regels.push('Alle info over de activiteit: ' + b.site + '/activiteiten/' + b.activiteit, '');
  regels.push('Dit is een automatische mail, je kan er niet op antwoorden.',
    'Vragen? Mail naar ' + VRAGEN_AAN + ' en vermeld je inschrijfnummer.', '',
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
  return b.lijnen.map(function (l) {
    return l.prijs > 0 ? l.aantal + ' × ' + l.naam + ' (' + eur(l.prijs) + ' ' + (per[l.per] || '') + ') = ' + eur(l.lijn) : l.aantal + ' × ' + l.naam + ' (gratis)';
  }).join('\n');
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
