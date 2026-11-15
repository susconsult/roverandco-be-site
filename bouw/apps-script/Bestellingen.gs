/**
 * Rover & Co – bestellingen van de website naar deze sheet + meldingsmail.
 *
 * Installatie (eenmalig, in de sheet "Rover & Co – Webshop bestellingen"):
 *  Extensies > Apps Script > deze code plakken > Opslaan
 *  Implementeren > Nieuwe implementatie > Type: Web-app
 *    Uitvoeren als: Ik   |   Toegang: Iedereen
 *  Het web-app-adres (…/exec) komt als Secret APPS_SCRIPT_URL in Cloudflare.
 *  Na elke wijziging aan dit script: Implementeren > Implementaties beheren > nieuwe versie.
 */
var TABBLAD = 'Bestellingen';
var MELDING_AAN = 'pieter@roverandco.be';
var KOLOMMEN = ['Besteld op', 'Bestelnummer', 'Test', 'Status', 'Naam', 'E-mail', 'Telefoon', 'Levering', 'Activiteit',
  'Straat', 'Postcode', 'Gemeente', 'Land', 'Artikels', 'Stuks', 'Subtotaal', 'Verzending', 'Donatie', 'Totaal', 'Opmerking', 'Ruwe data'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var b = JSON.parse(e.postData.contents);
    if (!b.bestelnummer || !b.klant || !b.artikels) return antwoord({ ok: false, fout: 'onvolledig' });

    var sh = tabblad();
    var nummers = sh.getRange(2, 2, Math.max(sh.getLastRow() - 1, 1), 1).getValues().map(function (r) { return r[0]; });
    if (nummers.indexOf(b.bestelnummer) !== -1) return antwoord({ ok: true, bestelnummer: b.bestelnummer, dubbel: true });

    var artikels = b.artikels.map(function (a) {
      var k = Object.keys(a.keuzes || {}).map(function (n) { return n + ': ' + a.keuzes[n]; }).join(', ');
      return a.aantal + ' × ' + a.naam + (k ? ' (' + k + ')' : '') + ' = € ' + a.lijn.toFixed(2);
    }).join('\n');
    var stuks = b.artikels.reduce(function (s, a) { return s + a.aantal; }, 0);
    var lev = b.levering || {};
    var leveringTekst = { activiteit: 'Ophalen op activiteit', oostham: 'Ophalen in Oostham', verzenden: 'Verzenden' }[lev.type] || lev.type;

    sh.appendRow([new Date(b.besteld_op), b.bestelnummer, b.test ? 'ja' : 'nee', 'Nieuw', b.klant.naam, b.klant.email, "'" + b.klant.telefoon,
      leveringTekst, lev.activiteit || '', lev.straat || '', lev.postcode ? "'" + lev.postcode : '', lev.gemeente || '', lev.land || '',
      artikels, stuks, b.subtotaal, b.verzending, b.donatie, b.totaal, b.opmerking || '', JSON.stringify(b)]);

    var onderwerp = (b.test ? '[TEST] ' : '') + 'Nieuwe bestelling ' + b.bestelnummer + ' – € ' + b.totaal.toFixed(2);
    var tekst = [
      (b.test ? 'TESTBESTELLING – er is niet betaald.\n' : ''),
      'Bestelnummer: ' + b.bestelnummer,
      'Klant: ' + b.klant.naam + ' – ' + b.klant.email + ' – ' + b.klant.telefoon,
      'Levering: ' + leveringTekst + (lev.activiteit ? ' – ' + lev.activiteit : '') +
        (lev.type === 'verzenden' ? ' – ' + lev.straat + ', ' + lev.postcode + ' ' + lev.gemeente + ' (' + lev.land + ')' : ''),
      '', artikels, '',
      'Subtotaal: € ' + b.subtotaal.toFixed(2), 'Verzending: € ' + b.verzending.toFixed(2),
      'Donatie: € ' + b.donatie.toFixed(2), 'Totaal: € ' + b.totaal.toFixed(2),
      (b.opmerking ? '\nOpmerking: ' + b.opmerking : ''),
      '\nAlle bestellingen: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
    ].join('\n');
    MailApp.sendEmail(MELDING_AAN, onderwerp, tekst);

    return antwoord({ ok: true, bestelnummer: b.bestelnummer });
  } catch (err) {
    return antwoord({ ok: false, fout: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function tabblad() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TABBLAD) || ss.insertSheet(TABBLAD);
  if (sh.getLastRow() === 0) { sh.appendRow(KOLOMMEN); sh.setFrozenRows(1); sh.getRange(1, 1, 1, KOLOMMEN.length).setFontWeight('bold'); }
  return sh;
}

function antwoord(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
