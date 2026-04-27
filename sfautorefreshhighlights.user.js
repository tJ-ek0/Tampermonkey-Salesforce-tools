// ==UserScript==
// @name         Salesforce List Markierung + Snippets
// @namespace    https://github.com/tJ-ek0/Tampermonkey-Salesforce-tools
// @version      4.0.1
// @description  Markiert Case-Listen farblich + Textbausteine mit Trigger, Platzhaltern, Rich-Text. Drag&Drop, Farbpalette, Auto-Refresh. UND/NICHT/Regex-Regeln, Clipboard-Kopie. DOM-basierte Platzhalter.
// @author       Tobias Jurgan - SIS Endress + Hauser (Deutschland) GmbH+Co.KG
// @license      MIT
// @match        https://endress.lightning.force.com/lightning/o/Case/list*
// @match        https://endress.lightning.force.com/lightning/r/WorkOrder*
// @grant        none
// @run-at       document-end
// @noframes
// @homepageURL  https://github.com/tJ-ek0/Tampermonkey-Salesforce-tools
// @supportURL   https://github.com/tJ-ek0/Tampermonkey-Salesforce-tools/issues
// @downloadURL  https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js
// @updateURL    https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js
// ==/UserScript==

(function () {
  'use strict';
  // Nicht in iframes ausführen (Hauptseite handhabt iframes via doAttachToDoc)
  if (window !== window.top) return;
  const VERSION = '4.0.1';
  console.log('[SFHL] v' + VERSION + ' gestartet');

  // ===== Storage Keys =====
  const LS_CFG      = 'sfhl_config_v4';
  const LS_CFG_OLD  = 'sfhl_config_v3';
  const LS_REFRESH  = 'sfhl_refresh_secs_v1';
  const LS_REF_ON   = 'sfhl_refresh_enabled';
  const LS_PANEL_W  = 'sfhl_panel_width';
  const LS_SNIP     = 'sfhl_snippets_v1';
  const LS_PREFIX   = 'sfhl_snip_prefix';
  const LS_UNAME    = 'sfhl_snip_username';
  const LS_FOLDERS  = 'sfhl_rule_folders_v1';
  const LS_SNIP_VER  = 'sfhl_snip_defaults_ver';
  const LS_RECENT    = 'sfhl_recent_v1';       // zuletzt verwendete Snippet-IDs
  const LS_DATA_VER  = 'sfhl_data_version';    // Migrations-Version
  const LS_WRAP_ON   = 'sfhl_wrap_enabled';    // Auto-Wrap an/aus
  const LS_WRAP_ANR  = 'sfhl_wrap_anrede';     // Trigger des Anrede-Snippets
  const LS_WRAP_SIG  = 'sfhl_wrap_signatur';   // Trigger des Signatur-Snippets
  const LS_DEF_LANG  = 'sfhl_default_language'; // 'de' oder 'en'

  // ===== Helpers =====
  function uid() { return 'k' + Math.random().toString(36).slice(2, 10); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function norm(s) { return (s || '').toString().toLowerCase(); }
  function escH(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  const PREFIXES = [';;', '//', '::', '!!', '@@'];

  // HTML Sanitizer (whitelist-based)
  const SAFE_TAGS = new Set(['b','i','u','a','br','p','ul','ol','li','strong','em','span']);
  const SAFE_ATTRS = { a: new Set(['href','target','title']), span: new Set(['style']) };
  function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    function clean(node) {
      const children = Array.from(node.childNodes);
      for (const ch of children) {
        if (ch.nodeType === 3) continue; // text node OK
        if (ch.nodeType !== 1) { ch.remove(); continue; }
        const tag = ch.tagName.toLowerCase();
        if (!SAFE_TAGS.has(tag)) { ch.replaceWith(...ch.childNodes); continue; }
        const allowed = SAFE_ATTRS[tag] || new Set();
        for (const attr of Array.from(ch.attributes)) {
          if (!allowed.has(attr.name) || attr.value.trim().toLowerCase().startsWith('javascript:')) ch.removeAttribute(attr.name);
        }
        clean(ch);
      }
    }
    clean(doc.body);
    return doc.body.innerHTML;
  }

  // Markdown links [text](url) -> <a> or plain url
  function resolveLinks(text, asHtml) {
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      return asHtml ? `<a href="${escH(url)}" target="_blank" rel="noopener">${escH(label)}</a>` : `${label}: ${url}`;
    });
  }

  // ===== Color Presets =====
  const COLOR_PRESETS = [
    { hex:'#E6FFE6', name:'Gr\u00fcn' },{ hex:'#FFCCCC', name:'Rot' },{ hex:'#FFFFCC', name:'Gelb' },
    { hex:'#FFE5CC', name:'Orange' },{ hex:'#E6F0FF', name:'Blau' },{ hex:'#F0E6FF', name:'Lila' },
    { hex:'#E6FFFA', name:'T\u00fcrkis' },{ hex:'#FFE6F0', name:'Pink' },{ hex:'#FFF5E6', name:'Pfirsich' },{ hex:'#F0F0F0', name:'Grau' },
  ];

  // ===== Config: Rules =====
  const RULE_DEFAULTS = [
    { id:uid(), term:'24/7, 2h, Visual Support, Smart Support', color:'#ffcccc', enabled:true },
    { id:uid(), term:'8/5, 4h, Visual Support, Smart Support',  color:'#ffe5b4', enabled:true },
    { id:uid(), term:'Support Case - SLA SOS',                  color:'#ffffcc', enabled:true },
    { id:uid(), term:'Complaint - Prio',                        color:'#ffd8b1', enabled:true },
    { id:uid(), term:'ET:',                                     color:'#f8d7da', enabled:true },
  ];
  function loadRules() {
    try {
      let raw = localStorage.getItem(LS_CFG);
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map(e => ({ id:e.id||uid(), term:String(e.term||''), color:e.color||'#ffffcc', enabled:e.enabled!==false, folder:e.folder||null })); }
      raw = localStorage.getItem(LS_CFG_OLD);
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p.slice().sort((a,b)=>(b.priority||0)-(a.priority||0)).map(e=>({id:e.id||uid(),term:String(e.term||''),color:e.color||'#ffffcc',enabled:true,folder:null})); }
    } catch {}
    return RULE_DEFAULTS.map(e => ({ ...e, id: uid(), folder: null }));
  }
  function saveRules() { localStorage.setItem(LS_CFG, JSON.stringify(RULES)); }

  // ===== Config: Snippets =====
  const SNIP_DEFAULTS = [
    { id:uid(), trigger:"anrede", label:"Anrede DE", body:'Guten Tag {!Contact.Salutation} {!Contact.LastName},', richText:true, category:"Standard", favorite:false },
    { id:uid(), trigger:"anredeen", label:"Anrede EN", body:'Dear {!Contact.Salutation} {!Contact.LastName},', richText:true, category:"Standard", favorite:false },
    { id:uid(), trigger:"sig", label:"Signatur DE", body:'Freundliche Grüße<br><br>{name}<br><br>Produkt- und Anwendungsspezialist<br><br>Technischer Support | Endress+Hauser Deutschland<br><br>Endress+Hauser (Deutschland) GmbH+Co. KG<br>Colmarer Str. 6 | 79576 Weil am Rhein<br>Phone: +49 7621 975 11575 | 0800-3443573<br>mytechsupport.de@endress.com<br><a href="https://www.de.endress.com/technischer-support">https://www.de.endress.com/technischer-support</a>', richText:true, category:"Standard", favorite:false },
    { id:uid(), trigger:"abfkontakt", label:"DE-AbfrageKontaktdaten", body:'um Sie bei Ihrem Anliegen unterstützen zu können, lassen Sie uns bitte noch Ihre vollständigen Kontaktdaten, einschließlich Ihres (Firmen-)Standorts an dem Sie sich befinden und des Hauptsitzes des Unternehmens für das Sie tätig sind, zukommen.<br><br>Sobald uns diese Daten vorliegen können wir Ihr Anliegen weiter bearbeiten.<br><br>Vielen Dank vorab für Ihre Unterstützung.', richText:true, category:"Kontaktdaten", favorite:false },
    { id:uid(), trigger:"abfkontakten", label:"DE-AbfrageKontaktdaten EN", body:'in order to assist you, can you please provide your full contact data including where you are located and the company\'s headquarters?<br><br>As soon as we have this data, we can process your request further.<br><br>Thank you in advance', richText:true, category:"Kontaktdaten", favorite:false },
    { id:uid(), trigger:"abfkportal", label:"DE-AbfrageKontaktdatenPortal", body:'um unser Service Portal nutzen zu können, lassen Sie uns bitte noch Ihre vollständigen Kontaktdaten, einschließlich Ihres (Firmen-)Standorts an dem Sie sich befinden und dem Hauptsitz des Unternehmens für das Sie tätig sind, zukommen.<br><br>Sobald uns diese Daten vorliegen können wir Ihren Account vervollständigen und freischalten.<br><br>Vielen Dank vorab für Ihre Unterstützung.', richText:true, category:"Kontaktdaten", favorite:false },
    { id:uid(), trigger:"abfkportalmm", label:"DE-AbfrageKontaktdatenPortal MehrereMailAdressen", body:'aktuell haben wir Sie mit zwei unterschiedlichen E-Mail-Adressen bei uns im System hinterlegt. Um unser Service Portal nutzen zu können, nennen Sie uns bitte Ihre primäre E-Mail-Adresse sowie Ihre vollständigen und aktuellen Kontaktdaten, einschließlich Ihres (Firmen-) Standorts an dem Sie sich befinden und den Hauptsitz des Unternehmens für das Sie tätig sind.<br><br>Sobald uns diese Daten vorliegen können wir Ihren Account vervollständigen und freischalten.<br><br>Vielen Dank vorab für Ihre Unterstützung.', richText:true, category:"Kontaktdaten", favorite:false },
    { id:uid(), trigger:"vsbericht", label:"DE-Bericht visueller Support", body:'anbei erhalten Sie den Inbetriebnahmebericht/Tätigkeitsbericht zur SightCall Visual Support Inbetriebnahme.<br><br>Sollten Sie zu dieser Inbetriebnahme Rückfragen haben, stehen wir Ihnen gerne zur Verfügung. Antworten Sie dazu bitte direkt auf diese E-Mail.<br><br>Bei telefonischen Rückfragen beziehen Sie sich bitte auf die Vorgangsnummer {!Case.CaseNumber}.', richText:true, category:"Service", favorite:false },
    { id:uid(), trigger:"fieldcare", label:"DE-FieldCare Abfrage", body:'Um die Problematik mit der Installation von FieldCare lösen zu können, benötigen wir weitere Informationen von Ihnen.<br><br>Welches Betriebssystem kommt zum Einsatz?<br>Ist dies eine 64 oder 32-Bit Version?<br>Welche Version von FieldCare soll installiert werden?<br>Soll eine vorhandene FieldCare Version upgedatet werden?<br>Wenn ja, welche Version war davor installiert?<br>Haben Sie die Installationsdateien vom Internet geladen oder haben Sie einen Datenträger vorliegen?<br>Haben Sie vollwertige (lokale) Administratorrechte an Ihrem PC?<br><br>Bei der Installation werden Log-Dateien erzeugt. Bitte kopieren Sie alle Dateien aus:<br><br>FieldCare &lt; 2.11: C:\\Programme (x86)\\Microsoft SQL Server\\100\\Setup Bootstrap\\Log<br>FieldCare 2.11: C:\\Programme (x86)\\Microsoft SQL Server\\120\\Setup Bootstrap\\Log + C:\\Programme (x86)\\Endress+Hauser\\FIM<br><br>Komprimieren Sie das Verzeichnis als ZIP und senden Sie es uns per E-Mail zu (max. 7 MB).', richText:true, category:"Support", favorite:false },
    { id:uid(), trigger:"remote", label:"DE-Freigabe Remotezugriff", body:'Sie haben fachliche Unterstützung durch Endress+Hauser angefordert. Der Support soll durch eine Remote-Verbindung zu Ihrem PC/System geleistet werden.<br><br>Sie sind damit einverstanden, für die technische Unterstützung Fernzugriff zu gewähren. Für Schäden durch den Remote-Zugriff haftet Endress+Hauser nur bei vorsätzlichem oder grob fahrlässigem Handeln.<br><br>Bitte senden Sie die ausgefüllte Einverständniserklärung zurück:<br><br>Geräteseriennummer:<br>Bestellcode:<br>Zugangsart:<br>Zugangsdaten:<br>Kurze Tätigkeitsbeschreibung:<br><br>Ich bin damit einverstanden, dem Endress+Hauser Techniker Fernzugriff zu meinem PC/System zu gewähren.<br><br>Ort:<br>Datum:<br>Unterschrift:', richText:true, category:"Support", favorite:false },
    { id:uid(), trigger:"fussnote", label:"DE-Fussnote Inbetriebnahme", body:'Für zusätzlichen Support bei der Inbetriebnahme des Geräts stehen Ihnen verschiedene Optionen zur Verfügung. Dieser Service kann im Rahmen eines Supportvertrags oder einmalig über eine Inbetriebnahme-Pauschale in Anspruch genommen werden.<br><br>Informationen zu unseren Supportverträgen: <a href="https://www.de.endress.com/smart-support">https://www.de.endress.com/smart-support</a>', richText:true, category:"Service", favorite:false },
    { id:uid(), trigger:"infos", label:"DE-Informationen nachreichen", body:'zu Ihrer Anfrage benötigen wir zusätzliche Informationen um Ihnen gezielter helfen zu können:<br><br>- Gerätetype / Seriennummer und ggf. Bestellcode (Typenschild am Gerät oder Lieferunterlagen)<br>- Einbauort/-position bzw. Montageart / verwendete Armatur<br>- Welches Medium wird gemessen (inkl. Temperatur, Druck, Durchfluss, pH-Wert, Leitfähigkeit, Viskosität)<br>- Betriebssystem ggf. inkl. Version / Update-Stand<br>- Programmversion / Firmwareversion<br>- Fehlermeldung bzw. Fehlercode<br><br>Lassen Sie uns gerne auch Bilder / Screenshots zukommen.', richText:true, category:"Support", favorite:false },
    { id:uid(), trigger:"kdaten", label:"DE-Kontaktdaten", body:'anbei erhalten Sie die Kontaktdaten zur Anfrage mit der Vorgangsnummer: {!Case.CaseNumber}<br><br>Bei Rückfragen antworten Sie bitte direkt auf diese E-Mail oder nutzen Sie unser Service Portal: <a href="https://www.services.endress.com/?language=de">https://www.services.endress.com/?language=de</a>', richText:true, category:"Kontaktdaten", favorite:false },
    { id:uid(), trigger:"kvertrieb", label:"DE-Kontaktdaten Vertrieb", body:'zu Ihrer Anfrage erhalten Sie direkt von Ihrem Ansprechpartner unseres Vertriebsteams ein Angebot bzw. weitere Informationen. Sie werden persönlich betreut von {!Account.Internal_Sales_Engineer__c}. Unser Vertriebsteam erreichen Sie unter der kostenlosen Rufnummer 0800 3483787.<br><br>Die Anfrage an den technischen Support (Vorgang {!Case.CaseNumber}) sehen wir daher aus technischer Sicht als gelöst an.<br><br>Bei Rückfragen zum Angebot können Sie sich gerne direkt an den oben genannten Ansprechpartner wenden.', richText:true, category:"Intern", favorite:false },
    { id:uid(), trigger:"ksgc", label:"DE-Kontaktdaten SGC (Serviceeinsatz)", body:'unsere Einsatzplanung kommt bezüglich der Terminabstimmung eines Serviceeinsatzes vor Ort auf Sie zu. Bei Rückfragen oder Änderungswünschen erreichen Sie das Team direkt unter +49 (0)7621 975-19191. Bitte beziehen Sie sich hier auf den Arbeitsauftrag {!Case.Work_Order__c}.<br><br>Die Anfrage an den technischen Support (Vorgang {!Case.CaseNumber}) würden wir daher aus technischer Sicht als gelöst ansehen.', richText:true, category:"Intern", favorite:false },
    { id:uid(), trigger:"ksiz", label:"DE-Kontaktdaten SIZ (Serviceeinsatz)", body:'unsere Einsatzplanung kommt bezüglich der Terminabstimmung eines Serviceeinsatzes vor Ort auf Sie zu. Bei Rückfragen oder Änderungswünschen erreichen Sie das Team direkt unter +49 (0)7621 975-11666. Bitte beziehen Sie sich hier auf den Arbeitsauftrag {!Case.Work_Order__c}.<br><br>Die Anfrage an den technischen Support (Vorgang {!Case.CaseNumber}) würden wir daher aus technischer Sicht als gelöst ansehen.', richText:true, category:"Intern", favorite:false },
    { id:uid(), trigger:"kportalweb", label:"DE-Kundenportal (Webformular)", body:'Sie haben über unsere Webseite einen Kundenvorgang in unserem System eröffnet.<br><br>Damit wir Ihre Anfrage bearbeiten können, benötigen wir noch:<br><br>Telefonnummer:<br>Firmensitz:<br><br>Vielen Dank', richText:true, category:"Kontaktdaten", favorite:false },
    { id:uid(), trigger:"offen", label:"DE-Offene R\u00fcckmeldung", body:'da bisher keine Rückmeldung auf unser Gespräch / die E-Mail vom {datum} erfolgte, gehe ich davon aus, dass die Anfrage "{!Case.Subject}" ({!Case.CaseNumber}) als "gelöst" angesehen werden kann. Diese wird dann automatisch in einigen Tagen geschlossen.<br><br>Sollten Sie noch Fragen offen haben, melden Sie sich bitte per E-Mail an mytechsupport.de@endress.com, per Kontaktformular (<a href="https://www.de.endress.com/technischer-support)">https://www.de.endress.com/technischer-support)</a> oder per Telefon 07621 975 11575. Bei telefonischen Rückfragen beziehen Sie sich bitte auf die Vorgangsnummer {!Case.CaseNumber}.', richText:true, category:"Abschluss", favorite:false },
    { id:uid(), trigger:"portalfrei", label:"DE-Portalfreischaltung", body:'in Zusammenhang mit Ihrer Anfrage zu "{!Case.Subject}" ({!Case.CaseNumber}) haben wir Sie in unserem kostenlosen Serviceportal freigeschaltet.<br><br>Die Zugangsinformationen erhalten Sie in einer separaten E-Mail.<br><br>Mit unserem Dienstleistungspaket Smart Support profitieren Sie zusätzlich von einer zugesicherten Reaktionszeit und werden durch unsere Experten via Remote-Support bei Inbetriebnahmen und Fehlerbehebung unterstützt.<br><br>Weiter Informationen: <a href="https://www.de.endress.com/smart-support">https://www.de.endress.com/smart-support</a>', richText:true, category:"Portal", favorite:false },
    { id:uid(), trigger:"rueckruf", label:"DE-R\u00fcckruf", body:'wir konnten Sie telefonisch unter der Rufnummer {!Contact.PhoneFormula__c} / {!Contact.MobilePhone} nicht persönlich zum Vorgang {!Case.CaseNumber} zu "{!Case.Subject}" erreichen.<br><br>Bitte rufen Sie uns unter der Telefonnummer +49 7621 975 11575 oder 0800-3443573 zurück.<br><br>Gerne können Sie uns Ihr Anliegen auch per E-Mail näher beschreiben. Noch besser, nutzen Sie unser Service Portal: <a href="https://www.services.endress.com/?language=de">https://www.services.endress.com/?language=de</a>', richText:true, category:"Kontaktdaten", favorite:false },
    { id:uid(), trigger:"repair", label:"DE-R\u00fccksendung Reparatur", body:'unser Ziel ist es, Ihnen mit einer fachgerechten und sicheren Abwicklung möglichst kurze Durchlaufzeiten zu bieten.<br><br>Unter der Adresse <a href="https://www.de.endress.com/ruecksendung">https://www.de.endress.com/ruecksendung</a> finden Sie die "Dekontaminationserklärung", welche Sie bitte ausgefüllt und unterschrieben gut sichtbar außen an der Verpackung anbringen. Wir können mit der Reparatur erst nach Vorlage dieser Erklärung beginnen.<br><br>Notieren Sie bitte auf dem Formular die Vorgangsnummer {!Case.CaseNumber} sowie kurz das Fehlerbild.<br><br>Bitte senden Sie das Produkt an:<br>Endress+Hauser (Deutschland) GmbH+Co. KG<br>Kalibrier- und Service Center D-A-CH<br>Colmarer Straße 6 | D-79576 Weil am Rhein<br><br>Rückfragen: 0800 - 34737247 | repair.de@endress.com', richText:true, category:"Service", favorite:false },
    { id:uid(), trigger:"repairgm", label:"DE-R\u00fccksendung Reparatur GM", body:'unser Ziel ist es, Ihnen mit einer fachgerechten und sicheren Abwicklung möglichst kurze Durchlaufzeiten zu bieten. Unter der Adresse <a href="https://www.de.endress.com/ruecksendung">https://www.de.endress.com/ruecksendung</a> finden Sie die "Unbedenklichkeitserklärung Gas Measurement", welche Sie bitte ausgefüllt und unterschrieben gut sichtbar außen an der Verpackung anbringen.<br><br>Rückfragen zu Reparaturen:<br>Tel. +49 7621 975 19 195<br>E-Mail: repair-gasmeasurement.de@endress.com', richText:true, category:"Service", favorite:false },
    { id:uid(), trigger:"slsbericht", label:"DE-SLS Bericht", body:'Tätigkeitsbericht<br>Auftragsnr. {!Case.CaseNumber}<br>Techniker {!Case.Communication_Owner__c}<br><br>Auftraggeber<br>Kundennr. {!Account.SAPAccountID__c}<br>Kunde {!Account.FTXTAccountName__c}<br>Strasse {!Account.Street__c}<br>Ort {!Account.City__c}<br>Kontaktperson {!Contact.Name}<br>Telefon {!Contact.PhoneFormula__c}<br><br>Kurzbeschreibung {!Case.Subject}<br><br>Lösungstext: {!Case.Solution_Steps__c}<br>Gelöst am: {datum}', richText:true, category:"Intern", favorite:false },
    { id:uid(), trigger:"dtmlib", label:"DE-SLS DTM Library + Installation log", body:'bei der Installation der aktuellen Geräte-DTMs ist in Ihrem System ein Problem aufgetreten.<br><br>Während der Installation werden im Verzeichnis %Temp% Logdateien angelegt. Bitte senden Sie uns diese per E-Mail zu (als ZIP, max. 7 MB).<br><br>Öffnen Sie den Windows-Explorer, geben Sie %Temp% in die Adresszeile ein, suchen Sie alle Dateien mit "DTM" im Namen, kopieren Sie diese in einen neuen Ordner und komprimieren Sie diesen.', richText:true, category:"Support", favorite:false },
    { id:uid(), trigger:"smartinfo", label:"DE-SmartSupportInfo", body:'wie vereinbart haben wir Sie in unserem Kundenportal freigeschaltet. Die Zugangsinformationen haben Sie in einer separaten E-Mail erhalten.<br><br>Mit unserem Dienstleistungspaket Smart Support können Sie sich zusätzlich eine noch schnellere Reaktionszeit sichern und werden durch unsere Experten via Remote-Support bei Inbetriebnahmen und Fehlerbehebungen unterstützt.<br><br>Weiter Informationen: <a href="https://www.de.endress.com/smart-support">https://www.de.endress.com/smart-support</a>', richText:true, category:"Portal", favorite:false },
    { id:uid(), trigger:"startupber", label:"DE-Start-Up Bericht", body:'anbei erhalten Sie den Inbetriebnahmebericht der Smart Start-Up Remote Inbetriebnahme. Alle relevanten Einstellungen sind dort dokumentiert.<br><br>Sollten Sie zu dieser Inbetriebnahme noch Rückfragen haben können Sie sich gerne bei uns melden. Antworten Sie dazu bitte direkt auf diese E-Mail.', richText:true, category:"Service", favorite:false },
    { id:uid(), trigger:"startupterm", label:"DE-Start-Up Termin", body:'Sie haben sich bezüglich Ihrer Smart Start-Up Remote Inbetriebnahme bei uns gemeldet.<br><br>Für die Inbetriebnahme haben wir einen Produkt- und Anwendungsspezialisten am [DATUM EINTRAGEN] zwischen [UHRZEIT VON BIS EINTRAGEN] Uhr reserviert.<br><br>Damit die Inbetriebnahme reibungslos durchgeführt werden kann benötigen wir noch einige wichtige Informationen zu Ihrer Messstelle. Dazu haben wir eine individuelle Checkliste angehängt.<br><br>Bitte senden Sie uns die ausgefüllte Checkliste bis spätestens zwei Tage vor dem geplanten Termin zurück.', richText:true, category:"Service", favorite:false },
    { id:uid(), trigger:"survey", label:"DE-Survey Smart Start-Up", body:'vielen Dank für Ihre Teilnahme an unserer Umfrage zum Technischen Support.<br><br>Sie interessieren sich für technischen Support via App mit Live-Videoübertragung. Mit dem Smart Start-Up bieten wir Ihnen genau diese Möglichkeit an.<br><br>Haben wir Ihr Interesse geweckt? <a href="https://www.de.endress.com/de/dienstleistungsportfolio/Inbetriebnahme/StartUp">https://www.de.endress.com/de/dienstleistungsportfolio/Inbetriebnahme/StartUp</a>', richText:true, category:"Portal", favorite:false },
    { id:uid(), trigger:"wissen", label:"DE-Wissensartikel", body:'anbei übersenden wir Ihnen einen Lösungsvorschlag zu Ihrer Anfrage:<br><br>!HIER WISSENSARTIKEL EINFÜGEN!<br><br>Sollte der Lösungsvorschlag nicht den gewünschten Erfolg erzielen, stehen wir für weitere Fragen zum Vorgang {!Case.CaseNumber} gerne zur Verfügung.', richText:true, category:"Support", favorite:false },
    { id:uid(), trigger:"wissenen", label:"DE-Wissensartikel EN", body:'we hereby send you a proposal for a solution to your request:<br><br>!INSERT KNOWLEDGE ARTICLE HERE!<br><br>If the proposed solution does not achieve the desired success, we are glad to answer any further questions about the support-Case {!Case.CaseNumber}.', richText:true, category:"Support", favorite:false },
    { id:uid(), trigger:"doku", label:"DE-Dokumentation Seriennummer", body:'hier, wie gewünscht, die Geräte-Dokumentation.<br><br>Link zu Informationen für Seriennummer {!Case.Serial_number__c}: <a href="https://portal.endress.com/webapp/DeviceViewer/?cc=0007&amp;lang=de&amp;serialNumber=">https://portal.endress.com/webapp/DeviceViewer/?cc=0007&amp;lang=de&amp;serialNumber=</a>{!Case.Serial_number__c}', richText:true, category:"Support", favorite:false },
  ];
  function loadSnippets() {
    try {
      const raw = localStorage.getItem(LS_SNIP);
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map(e => ({ id:e.id||uid(), trigger:String(e.trigger||''), label:String(e.label||''), body:String(e.body||''), bodyEn:String(e.bodyEn||''), richText:true, category:String(e.category||''), favorite:!!e.favorite, usageCount:Number(e.usageCount)||0 })); }
    } catch {}
    return SNIP_DEFAULTS.map(e => ({ ...e, id: uid() }));
  }
  // Dirty-Flag-Saves (#26): bündelt mehrere Saves in einen Schreibvorgang
  let _snipDirty = false, _rulesDirty = false;
  function saveSnippets(immediate=false) {
    if (immediate) { localStorage.setItem(LS_SNIP, JSON.stringify(SNIPPETS)); _snipDirty=false; return; }
    _snipDirty = true;
    const flush = () => { if (_snipDirty) { localStorage.setItem(LS_SNIP, JSON.stringify(SNIPPETS)); _snipDirty=false; } };
    if ('requestIdleCallback' in window) requestIdleCallback(flush, {timeout:500});
    else setTimeout(flush, 500);
  }
  function loadPrefix() { return localStorage.getItem(LS_PREFIX) || ';;'; }
  function savePrefix(p) { localStorage.setItem(LS_PREFIX, p); }
  function loadUname() { return localStorage.getItem(LS_UNAME) || ''; }
  function saveUname(n) { localStorage.setItem(LS_UNAME, n); }

  // Refresh helpers
  function loadRefreshSecs() { const n = parseInt(localStorage.getItem(LS_REFRESH),10); return Number.isFinite(n)&&n>0?n:60; }
  function saveRefreshSecs(n) { const v = Math.max(5,Math.min(86400,Math.round(n))); localStorage.setItem(LS_REFRESH,String(v)); return v; }
  function loadRefreshOn() { const r = localStorage.getItem(LS_REF_ON); return r===null?true:r==='1'; }
  function saveRefreshOn(on) { localStorage.setItem(LS_REF_ON, on?'1':'0'); }

  // Wrap helpers (Anrede + Signatur)
  function loadWrapOn() { const r = localStorage.getItem(LS_WRAP_ON); return r===null?true:r==='1'; }
  function saveWrapOn(on) { localStorage.setItem(LS_WRAP_ON, on?'1':'0'); }
  function loadWrapAnrede() { return localStorage.getItem(LS_WRAP_ANR) || 'anrede'; }
  function saveWrapAnrede(t) { localStorage.setItem(LS_WRAP_ANR, t); }
  function loadWrapSignatur() { return localStorage.getItem(LS_WRAP_SIG) || 'sig'; }
  function saveWrapSignatur(t) { localStorage.setItem(LS_WRAP_SIG, t); }
  function loadDefaultLang() { return localStorage.getItem(LS_DEF_LANG) || 'de'; }
  function saveDefaultLang(lang) { localStorage.setItem(LS_DEF_LANG, lang); }

  // ===== i18n: Übersetzungswörterbuch =====
  // Das Skript wird in Deutsch geschrieben; bei Sprache=en werden die DE-Strings nach EN übersetzt.
  // Eine Runtime-Funktion applyTranslations() ersetzt den Text aller UI-Elemente beim Sprachwechsel.
  const I18N = {
    'Markierung': 'Highlights',
    'Snippets': 'Snippets',
    'Aktualisierung': 'Auto-Refresh',
    'Einstellungen': 'Settings',
    'Hilfe': 'Help',
    'Neue Regel': 'New rule',
    'Ordner': 'Folder',
    'Abbrechen': 'Cancel',
    'Hinzufügen': 'Add',
    'Speichern': 'Save',
    'Löschen': 'Delete',
    'Duplizieren': 'Duplicate',
    'Teilen \u2197': 'Share \u2197',
    'Trigger': 'Trigger',
    'Bezeichnung': 'Label',
    'Kategorie': 'Category',
    'Text': 'Text',
    'Neue Vorlage': 'New template',
    'Vorlagen suchen\u2026': 'Search templates\u2026',
    'Stichwort eingeben\u2026': 'Enter keyword\u2026',
    'Treffer: ': 'Matches: ',
    'Intervall': 'Interval',
    'Sekunden': 'seconds',
    '\u00dcbernehmen': 'Apply',
    'Auto-Refresh aktiv': 'Auto-refresh active',
    'Der Auto-Refresh ist nur auf Case-Listenseiten aktiv. Der Countdown wird direkt im SF-Refresh-Button angezeigt.': 'Auto-refresh is only active on case list pages. The countdown is shown directly in the SF refresh button.',
    'Allgemein': 'General',
    'Trigger-Prefix': 'Trigger prefix',
    'Dein Name': 'Your name',
    'Default language': 'Default language',
    'E-Mail Bausteine': 'Email building blocks',
    'Auto-Wrap': 'Auto-wrap',
    'Anrede + Signatur automatisch einf\u00fcgen': 'Automatically insert salutation + signature',
    'Anrede': 'Salutation',
    'Signatur': 'Signature',
    'Wenn aktiv, wird beim Einf\u00fcgen eines Snippets automatisch die Anrede davor und die Signatur danach eingef\u00fcgt. Gilt nicht wenn das Snippet selbst die Anrede oder Signatur ist.': 'When active, salutation is inserted before and signature after each snippet. Skipped if the snippet itself is the salutation or signature.',
    'Export': 'Export',
    'Import': 'Import',
    'Alles exportieren': 'Export all',
    '\u2193 Alles exportieren': '\u2193 Export all',
    '\u2193 Markierungen': '\u2193 Rules',
    '\u2193 Snippets': '\u2193 Snippets',
    '\u2191 Datei importieren': '\u2191 Import file',
    'Importierte Regeln/Snippets ersetzen die bestehenden.': 'Imported rules/snippets replace existing ones.',
    'Zur\u00fccksetzen': 'Reset',
    'Markierungen zur\u00fccksetzen': 'Reset rules',
    'Snippets zur\u00fccksetzen': 'Reset snippets',
    'Alles zur\u00fccksetzen': 'Reset everything',
    '\u00dcberblick': 'Overview',
    'Markierung (Regeln)': 'Highlights (Rules)',
    'Operatoren im Stichwort-Feld:': 'Operators in keyword field:',
    'einfache Textsuche (case-insensitive)': 'simple text search (case-insensitive)',
    'UND: beide m\u00fcssen vorkommen': 'AND: both must be present',
    'ODER: mindestens einer': 'OR: at least one',
    'NICHT: darf nicht vorkommen': 'NOT: must not be present',
    'Regul\u00e4rer Ausdruck': 'Regular expression',
    'Beispiele:': 'Examples:',
    'Ordner:': 'Folders:',
    'Tastatur im Dropdown:': 'Keyboard in dropdown:',
    'Sprachwahl beim Einf\u00fcgen:': 'Language selection on insert:',
    'Ohne Pr\u00e4fix: Standard-Sprache aus Einstellungen': 'Without prefix: default language from settings',
    'Dynamische Abfrage:': 'Dynamic input:',
    'Salesforce-Merge-Felder:': 'Salesforce merge fields:',
    'Weitere Features:': 'More features:',
    'Tastenk\u00fcrzel': 'Shortcuts',
    'Probleme?': 'Problems?',
    'Panel \u00f6ffnen/schlie\u00dfen': 'Open/close panel',
    'Panel/Dropdown schlie\u00dfen': 'Close panel/dropdown',
    'Snippet-Dropdown \u00f6ffnen (in Textfeldern)': 'Open snippet dropdown (in text fields)',
    'Platzhalter per ': 'Insert placeholders via ',
    '-Button oben einf\u00fcgen. Cursor-Position: ': ' button above. Cursor position: ',
    'Eingabe-Variable: ': 'Input variable: ',
    '\u2192 fragt beim Einf\u00fcgen nach dem Wert (#45)': '\u2192 prompts for value when inserting',
    'Fett': 'Bold',
    'Kursiv': 'Italic',
    'Unterstrichen': 'Underlined',
    'Durchgestrichen': 'Strikethrough',
    'Aufz\u00e4hlung': 'Bullet list',
    'Nummeriert': 'Numbered',
    'Link einf\u00fcgen': 'Insert link',
    'Formatierung entfernen': 'Clear formatting',
    'Platzhalter einf\u00fcgen': 'Insert placeholder',
    'Vorlage einf\u00fcgen': 'Insert template',
    '+ Vorlage': '+ Template',
    'Vorlagen-Editor': 'Template editor',
    'neu': 'new',
    'bearbeiten': 'edit',
    'Keine Snippets vorhanden': 'No snippets available',
    'Keine Regeln vorhanden': 'No rules available',
  };

  function t(s) {
    if (loadDefaultLang() !== 'en') return s;
    return I18N[s] || s;
  }

  // Ersetzt UI-Text bei Sprachwechsel
  function applyTranslations() {
    try {
      // Alle Elemente mit data-i18n Attribut aktualisieren
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
      });
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = t(key);
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
      });
    } catch {}
  }

  // ===== Datenmigration (#18) =====
  function runMigrations() {
    const ver = localStorage.getItem(LS_DATA_VER) || '0';
    if (ver < '4.9.0') {
      // Sicherstellen dass alle Snippets usageCount + bodyEn haben
      try {
        const raw = localStorage.getItem(LS_SNIP);
        if (raw) {
          const p = JSON.parse(raw);
          if (Array.isArray(p)) {
            const migrated = p.map(e => ({
              ...e,
              usageCount: Number(e.usageCount) || 0,
              bodyEn: String(e.bodyEn || '')
            }));
            localStorage.setItem(LS_SNIP, JSON.stringify(migrated));
          }
        }
      } catch {}
      localStorage.setItem(LS_DATA_VER, '4.9.0');
    }
  }
  runMigrations();

  let RULES = loadRules(); saveRules();
  let SNIPPETS = loadSnippets();

  // ===== Neue Default-Snippets automatisch einmergen =====
  // Logik: Nur Snippets einfügen deren Trigger noch NICHT existiert.
  // Eigene Snippets und bearbeitete Defaults bleiben unberührt.
  (function mergeDefaultSnippets() {
    const CURRENT_VER = '4.9.0';
    if (localStorage.getItem(LS_SNIP_VER) === CURRENT_VER) return; // schon gemergt
    const existingTriggers = new Set(SNIPPETS.map(s => s.trigger.toLowerCase()));
    let added = 0;
    for (const def of SNIP_DEFAULTS) {
      if (!existingTriggers.has(def.trigger.toLowerCase())) {
        SNIPPETS.push({ ...def, id: uid() });
        added++;
      }
    }
    if (added > 0) {
      saveSnippets();
    }
    localStorage.setItem(LS_SNIP_VER, CURRENT_VER);
  })();

  saveSnippets();

  // ===== Recently Used (#15) =====
  function loadRecent() { try { const r = localStorage.getItem(LS_RECENT); return r ? JSON.parse(r) : []; } catch { return []; } }
  function addRecent(id) {
    let r = loadRecent().filter(x => x !== id);
    r.unshift(id);
    r = r.slice(0, 8); // letzte 8 merken
    localStorage.setItem(LS_RECENT, JSON.stringify(r));
  }

  function loadFolders() { try { const r = localStorage.getItem(LS_FOLDERS); return r ? JSON.parse(r) : []; } catch { return []; } }
  function saveFolders() { localStorage.setItem(LS_FOLDERS, JSON.stringify(FOLDERS)); }
  let FOLDERS = loadFolders();

  function toast(msg, type='info', dur=2500) {
    const t = document.createElement('div'); t.className = `sfhl-toast sfhl-toast--${type}`; t.textContent = msg;
    document.documentElement.appendChild(t);
    requestAnimationFrame(()=>requestAnimationFrame(()=>t.classList.add('vis')));
    setTimeout(()=>{t.classList.remove('vis');setTimeout(()=>t.remove(),350);},dur);
  }



  // ===== HTML → Plaintext (für SF-Felder die kein insertHTML unterstützen) =====
  function htmlToPlain(html) {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
      .replace(/\n{3,}/g,'\n\n').trim();
  }

  // ===== Placeholder resolution =====
  // Shadow-DOM-durchdringender querySelector/querySelectorAll
  // SF Lightning rendert ALLES in Shadow Roots → normales querySelector findet nichts.
  function deepQueryAll(root, selector) {
    const results = [];
    try {
      results.push(...Array.from(root.querySelectorAll ? root.querySelectorAll(selector) : []));
      const all = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
      for (const el of all) {
        if (el.shadowRoot) results.push(...deepQueryAll(el.shadowRoot, selector));
      }
    } catch {}
    return results;
  }

  function deepQuery(root, selector) {
    try {
      const r = root.querySelector ? root.querySelector(selector) : null;
      if (r) return r;
      const all = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
      for (const el of all) {
        if (el.shadowRoot) { const r2 = deepQuery(el.shadowRoot, selector); if (r2) return r2; }
      }
    } catch {}
    return null;
  }


  // Liest ALL Text aus einem Element inkl. aller verschachtelten Shadow Roots.
  // Nötig für SF Lightning Picklist/Lookup-Felder (lightning-formatted-picklist etc.)
  function getDeepText(el) {
    if (!el) return '';
    let out = '';
    (function walk(n) {
      if (!n) return;
      if (n.nodeType === 3) { out += n.textContent; return; }
      if (n.nodeType !== 1) return;
      Array.from(n.childNodes || []).forEach(walk);
      if (n.shadowRoot) Array.from(n.shadowRoot.childNodes || []).forEach(walk);
    })(el);
    return out.replace(/\s+/g, ' ').trim();
  }

  function readSFField(labelTexts) {
    try {
      const lowLabels = labelTexts.map(l => l.toLowerCase());
      // Erweiterte Container-Suche: auch Highlights-Panel und lightning-output-field
      const CTR_SEL  = '.slds-form-element,force-record-layout-item,records-record-layout-item,lightning-output-field,force-highlights-details-item';
      // Erweiterte Value-Suche: Picklist + Lookup explizit
      const VAL_SEL  = 'lightning-formatted-text,lightning-formatted-name,lightning-formatted-picklist,lightning-formatted-lookup,.slds-form-element__static,dd,p,a.textUnderline,a[data-recordid],a[href*="/r/"]';
      const LBL_SEL  = '.slds-form-element__label,dt,label,span.label,abbr,.slds-text-title';

      const containers = deepQueryAll(document, CTR_SEL);
      const candidates = [];

      for (const ctr of containers) {
        const lbl = ctr.shadowRoot
          ? deepQuery(ctr.shadowRoot, LBL_SEL)
          : ctr.querySelector(LBL_SEL);
        if (!lbl) continue;
        const t = (lbl.textContent || '').trim().toLowerCase();
        if (!t) continue;
        let rank = 0;
        if (lowLabels.includes(t)) rank = 3;
        else if (lowLabels.some(l => t.startsWith(l))) rank = 2;
        else if (lowLabels.some(l => t.includes(l))) rank = 1;
        if (!rank) continue;

        // 1. Versuch: spezifisches Value-Element finden
        const val = ctr.shadowRoot
          ? deepQuery(ctr.shadowRoot, VAL_SEL)
          : ctr.querySelector(VAL_SEL);
        if (val) {
          // getDeepText traversiert auch shadow roots von lightning-formatted-picklist etc.
          const v = getDeepText(val) || (val.textContent || '').trim();
          if (v && v !== t && v.length < 200) { candidates.push({ rank, v }); continue; }
        }

        // 2. Fallback: kompletten Container-Text holen, Label-Text abziehen
        const full = getDeepText(ctr);
        const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const stripped = full.replace(new RegExp('^\\s*' + escaped + '\\s*', 'i'), '').trim();
        if (stripped && stripped.length < 200) candidates.push({ rank: rank - 0.5, v: stripped });
      }

      if (candidates.length) {
        candidates.sort((a, b) => b.rank - a.rank);
        return candidates[0].v;
      }

      // Letzter Fallback: flache Label-Suche im gesamten DOM
      const allLabels = deepQueryAll(document, 'span,dt,label,.slds-form-element__label,.slds-text-title');
      for (const lbl of allLabels) {
        const t = (lbl.textContent || '').trim().toLowerCase();
        if (!t || t.length > 50) continue;
        if (!lowLabels.some(l => t === l || t.startsWith(l))) continue;
        const parent = lbl.parentElement;
        if (!parent) continue;
        let sib = lbl.nextElementSibling;
        while (sib) {
          const vt = getDeepText(sib);
          if (vt && vt !== t && vt.length < 200) return vt;
          sib = sib.nextElementSibling;
        }
        const valEl = parent.querySelector('lightning-formatted-text,lightning-formatted-name,lightning-formatted-picklist,.slds-form-element__static,dd,a.textUnderline');
        if (valEl) {
          const v = getDeepText(valEl);
          if (v && v !== t && v.length < 200) return v;
        }
      }
    } catch {}
    return '';
  }

  // Betreff/Subject: SF rendert ihn nicht als normales Formularfeld
  function readSubject() {
    try {
      // 1. Email-Betreff: ".emailMessageSubject .uiOutputText"
      const emailSubjects = document.querySelectorAll('.emailMessageSubject .uiOutputText, .emailMessageSubject span');
      for (const el of emailSubjects) {
        const t = (el.textContent || '').trim();
        if (!t || t.length < 3) continue;
        const cleaned = t.replace(/^(?:RE:\s*|AW:\s*|FW:\s*|WG:\s*)*(?:Case#?\s*\d+\s*:\s*)?/i, '').trim();
        if (cleaned && cleaned.length > 2) return cleaned;
      }
      // 2. Lookup-Link
      const lookupLink = document.querySelector('.outputLookupContainer a.textUnderline');
      if (lookupLink) {
        const v = lookupLink.textContent.trim();
        if (v && v.length > 2 && v.length < 300) return v;
      }
    } catch {}
    // 3. Label-basiert (Fallback)
    return readSFField(['betreff','subject']);
  }

  // Kontaktname: sucht in Highlight-Feldern und im Detail-Layout
  function readContactName() {
    try {
      // 1. Zuverlässigste Methode: Contact-Link direkt aus Lookup-Feldern
      //    SF rendert Lookup-Werte als <a href="/lightning/r/Contact/...">
      const contactLinks = deepQueryAll(document, 'a[href*="/lightning/r/Contact/"], a[href*="/r/Contact/"]');
      for (const a of contactLinks) {
        const v = (a.textContent || '').trim();
        if (v && v.length > 1 && v.length < 100) return v;
      }

      // 2. Highlights-Panel: force-highlights-details-item mit Kontakt-Label
      const highlights = deepQueryAll(document, 'force-highlights-details-item');
      for (const item of highlights) {
        const labelEl = deepQuery(item.shadowRoot || item, '.slds-text-title, .slds-form-element__label, dt, label, p');
        if (!labelEl) continue;
        const lt = (labelEl.textContent || '').trim().toLowerCase();
        if (!['kontaktname','kontakt','contact name','contact','name'].includes(lt)) continue;
        const v = getDeepText(item).replace(new RegExp('^' + lt, 'i'), '').trim();
        if (v && v.length > 1 && v.length < 100) return v;
      }

      // 3. Form-Felder mit Kontakt-Label (getDeepText für Shadow-DOM Lookup-Werte)
      const containers = deepQueryAll(document, '.slds-form-element,force-record-layout-item,records-record-layout-item,lightning-output-field');
      for (const ctr of containers) {
        const lbl = ctr.shadowRoot
          ? deepQuery(ctr.shadowRoot, '.slds-form-element__label,dt,label,span.label')
          : ctr.querySelector('.slds-form-element__label,dt,label,span.label');
        if (!lbl) continue;
        const lt = (lbl.textContent || '').trim().toLowerCase();
        if (!['kontaktname','kontakt','contact name','contact name','name'].includes(lt)) continue;
        // Lookup-Link suchen
        const link = ctr.shadowRoot
          ? deepQuery(ctr.shadowRoot, 'a[href*="/r/Contact/"], a[href*="/Contact/"], force-lookup a, lightning-formatted-lookup a')
          : ctr.querySelector('a[href*="/r/Contact/"], a[href*="/Contact/"], force-lookup a, lightning-formatted-lookup a');
        if (link) {
          const v = (link.textContent || '').trim();
          if (v && v.length > 1 && v.length < 100) return v;
        }
        // Fallback: getDeepText auf gesamten Container, Label abziehen
        const full = getDeepText(ctr);
        const stripped = full.replace(new RegExp('^\\s*' + lt + '\\s*', 'i'), '').trim();
        if (stripped && stripped.length > 1 && stripped.length < 100) return stripped;
      }

      // 4. readSFField als letzter Fallback
      return readSFField(['kontaktname','kontakt','contact name','contact','name']);
    } catch {}
    return '';
  }

  function resolvePlaceholders(text) {
    const now = new Date();
    const pad = n => String(n).padStart(2,'0');
    const dateStr = `${pad(now.getDate())}.${pad(now.getMonth()+1)}.${now.getFullYear()}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    // Case-Nummer: Seitentitel > DOM
    let caseNum = '';
    { const tm = document.title.match(/\b(\d{5,9})\b/); if (tm) caseNum = tm[1]; }
    if (!caseNum) deepQueryAll(document,'lightning-formatted-text').forEach(n=>{
      const v=n.textContent.trim(); if(!caseNum&&/^\d{5,9}$/.test(v)) caseNum=v;
    });

    // Alle Felder via DOM-Suche (Shadow-DOM-durchdringend)
    const betreff    = readSubject();
    const seriennr   = readSFField(['seriennummer','serial number']);
    const arbeitsauf = readSFField(['arbeitsauftrag','work order']);
    const techniker  = readSFField(['kommunikation','techniker','communication owner']);
    const loesung    = '';
    const produkt    = readSFField(['produkt','product','device type','gerätetyp']);
    const anrede     = readSFField(['anrede','salutation']);
    const kontakt    = readContactName();
    const nachname   = readSFField(['nachname','last name']) || (kontakt ? kontakt.split(' ').pop() : '');
    const vorname    = kontakt ? kontakt.split(' ').slice(0,-1).join(' ') : '';
    const telefon    = readSFField(['telefon','phone']);
    const mobil      = readSFField(['mobil','mobile']);
    const firma      = readSFField(['account','firma','account name']);
    const kunde      = firma;
    const vertrieb   = readSFField(['vertrieb','innendienst','internal sales']);
    const kundennr   = readSFField(['kundennr','sap','customer number']);
    const strasse    = readSFField(['straße','strasse','street','anschrift']);
    const ort        = readSFField(['ort','city','stadt']);
    // {!SF.MergeField} → alle via DOM aufgelöst
    text = text
      .replace(/\{!Case\.CaseNumber\}/gi,                    caseNum    || '{!Case.CaseNumber}')
      .replace(/\{!Case\.Subject\}/gi,                       betreff    || '{!Case.Subject}')
      .replace(/\{!Case\.Serial_number__c\}/gi,              seriennr   || '{!Case.Serial_number__c}')
      .replace(/\{!Case\.Work_Order__c\}/gi,                 arbeitsauf || '{!Case.Work_Order__c}')
      .replace(/\{!Case\.Communication_Owner__c\}/gi,        techniker  || '{!Case.Communication_Owner__c}')
      .replace(/\{!Case\.Solution_Steps__c\}/gi,             loesung    || '{!Case.Solution_Steps__c}')
      .replace(/\{!Contact\.Salutation\}/gi,                 anrede     || '')
      .replace(/\{!Contact\.LastName\}/gi,                   nachname   || '')
      .replace(/\{!Contact\.Name\}/gi,                       kontakt    || '')
      .replace(/\{!Contact\.PhoneFormula__c\}/gi,            telefon    || '{!Contact.PhoneFormula__c}')
      .replace(/\{!Contact\.MobilePhone\}/gi,                mobil      || '{!Contact.MobilePhone}')
      .replace(/\{!User\.Name\}/gi,                          loadUname()|| '{!User.Name}')
      .replace(/\{!Today\}/gi,                               dateStr)
      .replace(/\{!Account\.Internal_Sales_Engineer__c\}/gi, vertrieb   || '{!Account.Internal_Sales_Engineer__c}')
      .replace(/\{!Account\.SAPAccountID__c\}/gi,            kundennr   || '{!Account.SAPAccountID__c}')
      .replace(/\{!Account\.FTXTAccountName__c\}/gi,         firma      || '{!Account.FTXTAccountName__c}')
      .replace(/\{!Account\.Street__c\}/gi,                  strasse    || '{!Account.Street__c}')
      .replace(/\{!Account\.City__c\}/gi,                    ort        || '{!Account.City__c}');

    // Eingabe-Variablen auflösen (#45): {eingabe:Beschriftung} → fragt Nutzer
    // WICHTIG: Diese Auflösung passiert erst beim Einfügen (nicht in der Vorschau)
    text = text.replace(/\{eingabe:([^}]+)\}/gi, (_, label) => {
      const val = prompt(label + ':');
      return val !== null ? val : '{eingabe:' + label + '}';
    });

    return text
      .replace(/\{name\}/gi,          loadUname()  || '[Name]')
      .replace(/\{datum\}/gi,          dateStr)
      .replace(/\{uhrzeit\}/gi,        timeStr)
      .replace(/\{case\}/gi,           caseNum      || '[Case-Nr.]')
      .replace(/\{betreff\}/gi,        betreff      || '[Betreff]')
      .replace(/\{anrede\}/gi,         anrede       || '')
      .replace(/\{nachname\}/gi,       nachname     || '[Name]')
      .replace(/\{kontakt\}/gi,        kontakt      || '[Kontakt]')
      .replace(/\{kunde\}/gi,          kunde        || '[Kunde]')
      .replace(/\{produkt\}/gi,        produkt      || '[Produkt]')
      .replace(/\{seriennummer\}/gi,   seriennr     || '[Seriennr.]')
      .replace(/\{telefon\}/gi,        telefon      || '[Telefon]')
      .replace(/\{mobil\}/gi,          mobil        || '[Mobil]')
      .replace(/\{arbeitsauftrag\}/gi, arbeitsauf   || '[Arbeitsauftrag]')
      .replace(/\{vertrieb\}/gi,       vertrieb     || '[Vertrieb ASP]')
      .replace(/\{techniker\}/gi,      techniker    || '[Techniker]')
      .replace(/\{kundennr\}/gi,       kundennr     || '[Kundennr.]')
      .replace(/\{firma\}/gi,          firma        || '[Firma]')
      .replace(/\{strasse\}/gi,        strasse      || '[Straße]')
      .replace(/\{ort\}/gi,            ort          || '[Ort]')
      .replace(/\{loesung\}/gi,        '[Lösungstext]');
  }

  // ===== Count matches for a term =====
  function countMatches(term) {
    if (!term) return 0;
    const rows = getRows();
    let n = 0;
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      let txt = '';
      for (const c of cells) txt += ' ' + (c.innerText || c.textContent || '');
      if (matchesRule(txt, term)) n++;
    }
    return n;
  }

  // ===== Styles =====
  const styleEl = document.createElement('style');
  styleEl.id = 'sfhl-style-v4';
  styleEl.textContent = `
    /* Row highlighting */
    .tm-sfhl-mark,.tm-sfhl-mark>td,.tm-sfhl-mark [role="gridcell"],.tm-sfhl-mark .slds-hint-parent,.tm-sfhl-mark .slds-cell-wrap{background-color:var(--sfhl-bg)!important}
    @keyframes sfhl-blink{0%,100%{opacity:1}50%{opacity:.3}}
    .sfhl-new-match td,.sfhl-new-match [role="gridcell"]{animation:sfhl-blink .5s ease 3}

    /* Toast */
    .sfhl-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(8px);padding:8px 18px;border-radius:8px;z-index:2147483647;font:500 12.5px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;pointer-events:none;opacity:0;transition:opacity .2s,transform .2s}
    .sfhl-toast.vis{opacity:1;transform:translateX(-50%) translateY(0)}
    .sfhl-toast--info{background:#1e293b;color:#e2e8f0} .sfhl-toast--success{background:#065f46;color:#d1fae5} .sfhl-toast--error{background:#991b1b;color:#fee2e2}

    /* Trigger pill */
    .sfhl-trigger{position:fixed;right:16px;bottom:16px;z-index:2147483646;display:none;align-items:center;gap:7px;padding:0 14px;height:36px;border-radius:99px;background:#fff;border:1px solid #e5e7eb;color:#374151;font:500 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;cursor:pointer;user-select:none;box-shadow:0 1px 3px rgba(0,0,0,.08),0 8px 24px rgba(0,0,0,.06);transition:box-shadow .15s,transform .15s,border-color .15s}
    .sfhl-trigger:hover{box-shadow:0 2px 8px rgba(0,0,0,.1),0 12px 32px rgba(0,0,0,.1);border-color:#d1d5db;transform:translateY(-1px)} .sfhl-trigger:active{transform:translateY(0) scale(.98)}
    .sfhl-trigger .sfhl-dot{width:7px;height:7px;border-radius:50%;background:#10b981;box-shadow:0 0 0 2px rgba(16,185,129,.18)} .sfhl-trigger .sfhl-dot.off{background:#94a3b8;box-shadow:none}

    /* Backdrop + Panel */
    .sfhl-backdrop{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.08);opacity:0;pointer-events:none;transition:opacity .25s} .sfhl-backdrop.vis{opacity:1;pointer-events:auto}
    .sfhl-panel{position:fixed;top:0;right:0;bottom:0;width:420px;min-width:340px;max-width:700px;background:#fff;z-index:2147483647;box-shadow:-8px 0 40px rgba(0,0,0,.12);transform:translateX(100%);transition:transform .28s cubic-bezier(.22,.68,0,1);display:flex;flex-direction:column;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a}
    .sfhl-panel.open{transform:translateX(0)} .sfhl-panel.resizing{transition:none;user-select:none}
    .sfhl-resize{position:absolute;left:-3px;top:0;bottom:0;width:6px;cursor:ew-resize;z-index:5}
    .sfhl-resize::after{content:'';position:absolute;left:2px;top:50%;transform:translateY(-50%);width:2px;height:32px;background:#d1d5db;border-radius:2px;opacity:0;transition:opacity .15s}
    .sfhl-resize:hover::after,.sfhl-panel.resizing .sfhl-resize::after{opacity:1}

    /* Header + Tabs */
    .sfhl-hdr{padding:10px 16px 0;border-bottom:1px solid #e5e7eb;background:#f9fafb;flex-shrink:0}
    .sfhl-hdr-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
    .sfhl-hdr-top h2{font-size:14px;font-weight:600;margin:0;color:#111}
    .sfhl-hdr-acts{display:flex;align-items:center;gap:2px}
    .sfhl-ib{width:30px;height:30px;border-radius:6px;background:transparent;cursor:pointer;color:#6b7280;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,color .12s;position:relative}
    .sfhl-ib:hover{background:#f3f4f6;color:#111} .sfhl-ib svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .sfhl-tabs{display:flex;gap:0;margin:0 -16px;padding:0 16px}
    .sfhl-tab{padding:8px 16px;font-size:12.5px;font-weight:500;color:#9ca3af;cursor:pointer;border-bottom:2px solid transparent;transition:color .12s,border-color .12s;white-space:nowrap}
    .sfhl-tab:hover{color:#374151} .sfhl-tab.active{color:#4f46e5;border-bottom-color:#4f46e5}
    .sfhl-tab-badge{font-size:10px;font-weight:600;background:#e5e7eb;color:#6b7280;padding:0 5px;border-radius:99px;margin-left:4px}
    .sfhl-tab.active .sfhl-tab-badge{background:#eef2ff;color:#4f46e5}

    /* Tab content */
    .sfhl-tab-content{display:none;flex:1;flex-direction:column;min-height:0;overflow:hidden}
    .sfhl-tab-content.active{display:flex}

    /* Overflow menu */
    .sfhl-overflow{position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);min-width:160px;padding:4px;z-index:10;opacity:0;transform:translateY(-4px);pointer-events:none;transition:opacity .15s,transform .15s}
    .sfhl-overflow.vis{opacity:1;transform:translateY(0);pointer-events:auto}
    .sfhl-oi{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:none;border-radius:5px;background:none;cursor:pointer;font-size:12.5px;color:#374151;text-align:left;transition:background .1s}
    .sfhl-oi:hover{background:#f3f4f6} .sfhl-oi svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
    .sfhl-oi.danger{color:#dc2626} .sfhl-oi.danger:hover{background:#fef2f2}
    .sfhl-overflow hr{border:none;border-top:1px solid #f3f4f6;margin:3px 0}

    /* Search bar (shared) */
    .sfhl-search{padding:8px 16px;border-bottom:1px solid #f3f4f6;flex-shrink:0}
    .sfhl-search input{width:100%;padding:6px 10px 6px 30px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E") 10px center no-repeat;transition:border-color .12s}
    .sfhl-search input:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.1)}

    /* Rules tab styles */
    .sfhl-colhdr{display:grid;grid-template-columns:20px minmax(0,1fr) 28px auto;gap:4px;padding:6px 16px;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f3f4f6;flex-shrink:0}
    .sfhl-list{flex:1;overflow-y:auto;overflow-x:hidden;padding:2px 0;min-height:0}
    .sfhl-list::-webkit-scrollbar{width:4px} .sfhl-list::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:4px}
    .sfhl-row{display:grid;grid-template-columns:20px minmax(0,1fr) 28px auto;gap:4px;padding:5px 16px;align-items:center;transition:background .12s;cursor:grab;border-left:3px solid transparent}
    .sfhl-row:hover{background:#f9fafb} .sfhl-row.disabled{opacity:.45} .sfhl-row.disabled .sfhl-r-term{text-decoration:line-through;color:#9ca3af}
    .sfhl-row.dragging{opacity:.3;background:#eef2ff} .sfhl-row.drag-over-top{border-top:2px solid #6366f1} .sfhl-row.drag-over-bot{border-bottom:2px solid #6366f1}
    .sfhl-grip{color:#d1d5db;cursor:grab;display:flex;align-items:center;justify-content:center}
    .sfhl-grip svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
    .sfhl-row:hover .sfhl-grip{color:#9ca3af}
    .sfhl-r-term{width:100%;padding:4px 8px;border:1px solid transparent;border-radius:5px;font-size:12.5px;background:transparent;color:#1a1a1a;transition:border-color .12s,background .12s;text-overflow:ellipsis}
    .sfhl-r-term:hover{border-color:#e5e7eb;background:#fff} .sfhl-r-term:focus{outline:none;border-color:#6366f1;background:#fff;box-shadow:0 0 0 2px rgba(99,102,241,.1)}
    .sfhl-sw{position:relative;width:24px;height:24px;border-radius:5px;cursor:pointer;overflow:visible;border:2px solid #fff;box-shadow:0 0 0 1px #e5e7eb;transition:box-shadow .12s,transform .1s;margin:0 auto}
    .sfhl-sw:hover{box-shadow:0 0 0 1px #a5b4fc;transform:scale(1.1)}
    .sfhl-sw .sfhl-sw-fill{position:absolute;inset:0;border-radius:3px} .sfhl-sw input[type="color"]{position:absolute;opacity:0;width:0;height:0;pointer-events:none}
    .sfhl-palette{position:fixed;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.14);padding:8px;z-index:2147483647;opacity:0;pointer-events:none;transition:opacity .12s;min-width:200px}
    .sfhl-palette.vis{opacity:1;pointer-events:auto}
    .sfhl-palette-label{font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px}
    .sfhl-palette-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:8px}
    .sfhl-preset{width:30px;height:30px;border-radius:6px;border:2px solid transparent;cursor:pointer;transition:border-color .1s,transform .1s;position:relative}
    .sfhl-preset:hover{transform:scale(1.12);border-color:#a5b4fc} .sfhl-preset.active{border-color:#4f46e5;box-shadow:0 0 0 1px #4f46e5}
    .sfhl-preset-name{position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);font-size:7px;color:#9ca3af;white-space:nowrap;opacity:0;transition:opacity .1s;pointer-events:none}
    .sfhl-preset:hover .sfhl-preset-name{opacity:1}
    .sfhl-palette-custom{display:flex;align-items:center;gap:6px;padding:6px 8px 2px;border-top:1px solid #f3f4f6;margin:0 -8px;cursor:pointer;font-size:11px;color:#6b7280;transition:color .1s}
    .sfhl-palette-custom:hover{color:#4f46e5} .sfhl-palette-custom svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2}
    .sfhl-row-acts{display:flex;gap:3px;align-items:center}
    .sfhl-ra{height:22px;border:none;border-radius:4px;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:3px;transition:color .1s,background .1s;padding:0 5px;font-size:10.5px;font-weight:500;white-space:nowrap}
    .sfhl-ra svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
    .sfhl-ra.toggle-on{color:#16a34a} .sfhl-ra.toggle-on svg{fill:#16a34a;stroke:none}
    .sfhl-ra.toggle-off{color:#9ca3af} .sfhl-ra.toggle-off svg{stroke:#9ca3af}
    .sfhl-ra:hover{background:#f3f4f6} .sfhl-ra.del{color:#c4c4c4;padding:0 3px} .sfhl-ra.del:hover{color:#ef4444;background:#fef2f2}
    .sfhl-add-bar{display:flex;gap:6px;padding:8px 16px;border-top:1px solid #f3f4f6;flex-shrink:0}
    .sfhl-add-toggle{display:flex;align-items:center;gap:6px;padding:5px 10px;border:1px dashed #d1d5db;border-radius:6px;background:none;cursor:pointer;color:#9ca3af;font-size:12px;transition:all .15s;width:100%;justify-content:center}
    .sfhl-add-toggle:hover{border-color:#6366f1;color:#6366f1;background:#f5f3ff}
    .sfhl-add-toggle svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
    .sfhl-add-form{display:none;padding:10px 16px;border-top:1px solid #f3f4f6;background:#fafafa;flex-shrink:0} .sfhl-add-form.vis{display:block}
    .sfhl-add-row{display:grid;grid-template-columns:minmax(0,1fr) 32px;gap:6px;align-items:center}
    .sfhl-add-form input[type="text"]{padding:7px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12.5px;width:100%}
    .sfhl-add-form input[type="text"]:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.1)}
    .sfhl-add-acts{display:flex;gap:6px;margin-top:8px;justify-content:space-between;align-items:center}
    .sfhl-match-badge{font-size:11px;color:#6b7280;display:flex;align-items:center;gap:4px} .sfhl-match-badge .num{font-weight:600;color:#4f46e5}
    .sfhl-btn-sm{padding:5px 12px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid #e5e7eb;background:#fff;color:#374151;transition:all .12s} .sfhl-btn-sm:hover{background:#f9fafb}
    .sfhl-btn-primary{background:#4f46e5!important;border-color:#4f46e5!important;color:#fff!important} .sfhl-btn-primary:hover{background:#4338ca!important}
    .sfhl-rf-sec{border-top:1px solid #e5e7eb;flex-shrink:0;background:#f9fafb}
    .sfhl-rf-hdr{display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 16px;cursor:pointer;font-size:12.5px;font-weight:500;color:#374151;transition:background .12s} .sfhl-rf-hdr:hover{background:#f3f4f6}
    .sfhl-rf-hdr svg{width:14px;height:14px;stroke:#9ca3af;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .2s} .sfhl-rf-hdr svg.rot{transform:rotate(180deg)}
    .sfhl-sp{font-size:10px;font-weight:600;padding:1px 6px;border-radius:99px;margin-left:8px} .sfhl-sp-on{background:#d1fae5;color:#065f46} .sfhl-sp-off{background:#f1f5f9;color:#64748b}
    .sfhl-rf-body{display:none;padding:0 16px 12px} .sfhl-rf-body.vis{display:block}
    .sfhl-rf-body .rfr{display:flex;align-items:center;gap:10px;margin-bottom:8px} .sfhl-rf-body label{font-size:12px;color:#6b7280;white-space:nowrap}
    .sfhl-rf-body input[type="number"]{width:70px;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;text-align:center;-moz-appearance:textfield}
    .sfhl-rf-body input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none}
    .sfhl-tgl{position:relative;width:36px;height:20px;display:inline-block;flex-shrink:0} .sfhl-tgl input{opacity:0;width:0;height:0;position:absolute}
    .sfhl-tgl .sl{position:absolute;inset:0;background:#d1d5db;border-radius:99px;cursor:pointer;transition:background .2s}
    .sfhl-tgl .sl::before{content:'';position:absolute;width:16px;height:16px;left:2px;top:2px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 2px rgba(0,0,0,.15)}
    .sfhl-tgl input:checked+.sl{background:#4f46e5} .sfhl-tgl input:checked+.sl::before{transform:translateX(16px)}

    /* ===== Snippets Tab ===== */
    .sfhl-snip-list{flex:1;overflow-y:auto;padding:4px 0;min-height:0}
    .sfhl-snip-list::-webkit-scrollbar{width:4px} .sfhl-snip-list::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:4px}
    .sfhl-snip-row{padding:8px 16px;border-bottom:1px solid #f8f8f8;cursor:pointer;transition:background .1s}
    .sfhl-snip-row:hover{background:#f9fafb}
    .sfhl-snip-row-top{display:flex;align-items:center;gap:8px}
    .sfhl-snip-trigger{font-family:monospace;font-size:12px;font-weight:600;color:#4f46e5;background:#eef2ff;padding:1px 6px;border-radius:4px;flex-shrink:0}
    .sfhl-snip-label{font-size:12.5px;font-weight:500;color:#1a1a1a;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sfhl-snip-cat{font-size:10px;color:#9ca3af;flex-shrink:0}
    .sfhl-snip-preview{font-size:11px;color:#9ca3af;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
    .sfhl-snip-acts{display:flex;gap:2px;flex-shrink:0;margin-left:auto}
    .sfhl-snip-copy{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:5px;background:transparent;cursor:pointer;color:#c4c4c4;flex-shrink:0;transition:color .12s,background .12s;padding:0;border:none}
    .sfhl-snip-copy:hover{color:#4f46e5;background:#eef2ff}
    .sfhl-snip-copy svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

    /* Snippet editor (inline) */
    .sfhl-snip-editor{display:none;padding:12px 16px;border-top:1px solid #f3f4f6;background:#fafafa;flex-shrink:0;overflow-y:auto;max-height:50vh}
    .sfhl-snip-editor.vis{display:block}
    .sfhl-snip-editor .sfhl-field{margin-bottom:8px}
    .sfhl-snip-editor .sfhl-field label{display:block;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.3px;margin-bottom:3px}
    .sfhl-snip-editor input,.sfhl-snip-editor select{width:100%;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12.5px}
    .sfhl-snip-editor input:focus,.sfhl-snip-editor select:focus,.sfhl-snip-editor textarea:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.1)}
    .sfhl-snip-editor textarea{width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:monospace;min-height:100px;resize:vertical;line-height:1.5}
    .sfhl-snip-editor .sfhl-ed-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .sfhl-snip-editor .sfhl-ed-foot{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb}
    .sfhl-snip-editor .sfhl-richtext-hint{font-size:10px;color:#9ca3af;display:flex;align-items:center;gap:4px}

    /* Snippet settings area */
    .sfhl-snip-settings{padding:10px 16px;border-top:1px solid #e5e7eb;background:#f9fafb;flex-shrink:0}
    .sfhl-snip-settings .sfhl-set-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px}
    .sfhl-snip-settings label{color:#6b7280;white-space:nowrap;font-size:12px}
    .sfhl-snip-settings input[type="text"]{flex:1;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px}
    .sfhl-snip-settings select{padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px}

    /* ===== Snippet Dropdown (trigger autocomplete) ===== */
    .sfhl-dropdown{position:fixed;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.16);padding:4px;z-index:2147483647;min-width:260px;max-width:400px;max-height:240px;overflow-y:auto;opacity:0;pointer-events:none;transition:opacity .1s}
    .sfhl-dropdown.vis{opacity:1;pointer-events:auto}
    .sfhl-dropdown::-webkit-scrollbar{width:4px} .sfhl-dropdown::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:4px}
    .sfhl-dd-item{display:flex;flex-direction:column;padding:8px 10px;border-radius:6px;cursor:pointer;transition:background .1s}
    .sfhl-dd-item:hover,.sfhl-dd-item.selected{background:#f3f4f6}
    .sfhl-dd-item-top{display:flex;align-items:center;gap:6px}
    .sfhl-dd-trigger{font-family:monospace;font-size:11px;font-weight:600;color:#4f46e5;background:#eef2ff;padding:1px 5px;border-radius:3px}
    .sfhl-dd-label{font-size:12px;font-weight:500;color:#1a1a1a}
    .sfhl-dd-cat{font-size:10px;color:#9ca3af;margin-left:auto}
    .sfhl-dd-preview{font-size:11px;color:#9ca3af;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sfhl-dd-hint{padding:6px 10px;font-size:10px;color:#9ca3af;border-top:1px solid #f3f4f6;margin-top:2px}

    /* Category headers (snippets) */
    .sfhl-cat-hdr{display:flex;align-items:center;gap:6px;padding:6px 16px;cursor:pointer;user-select:none;background:#f9fafb;border-bottom:1px solid #f3f4f6;border-top:1px solid #f3f4f6;font-size:11px;font-weight:600;color:#6b7280;transition:background .12s}
    .sfhl-cat-hdr:hover{background:#f3f4f6}
    .sfhl-cat-hdr svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;transition:transform .2s;flex-shrink:0}
    .sfhl-cat-hdr.collapsed svg{transform:rotate(-90deg)}
    .sfhl-cat-count{margin-left:auto;font-size:10px;font-weight:500;color:#9ca3af}
    .sfhl-cat-body.collapsed{display:none}

    /* Folder headers (rules) */
    .sfhl-folder-hdr{display:flex;align-items:center;gap:6px;padding:5px 12px 5px 16px;cursor:pointer;user-select:none;background:#f5f3ff;border-bottom:1px solid #ede9fe;border-top:1px solid #ede9fe;font-size:11px;font-weight:600;color:#5b21b6;transition:background .12s}
    .sfhl-folder-hdr:hover{background:#ede9fe}
    .sfhl-folder-hdr .sfhl-chev{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;transition:transform .2s;flex-shrink:0}
    .sfhl-folder-hdr.collapsed .sfhl-chev{transform:rotate(-90deg)}
    .sfhl-folder-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sfhl-folder-count{font-size:10px;font-weight:500;color:#7c3aed;opacity:.7;padding:0 4px}
    .sfhl-folder-del{padding:2px 4px;border-radius:4px;color:#a78bfa;transition:color .1s,background .1s;margin-left:4px;display:flex;align-items:center}
    .sfhl-folder-del:hover{color:#dc2626;background:#fef2f2}
    .sfhl-folder-del svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
    .sfhl-folder-body.collapsed{display:none}
    .sfhl-folder-body .sfhl-row{padding-left:28px}
    .sfhl-folder-hdr.drag-over-folder{background:#ddd6fe!important;outline:2px dashed #7c3aed}
    .sfhl-ungrouped-body.drag-over-folder{outline:2px dashed #9ca3af;background:#f9fafb}
    .sfhl-ungrouped-hdr{display:flex;align-items:center;gap:6px;padding:4px 16px;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f3f4f6;background:#fafafa;flex-shrink:0}
    .sfhl-folder-add-btn{display:flex;align-items:center;gap:4px;padding:5px 10px;border:1px dashed #c4b5fd;border-radius:6px;background:none;cursor:pointer;color:#7c3aed;font-size:11px;font-weight:500;transition:all .15s;white-space:nowrap;flex-shrink:0}
    .sfhl-folder-add-btn:hover{border-color:#7c3aed;background:#f5f3ff}

    /* Rich-Text Toolbar */
    .sfhl-rte-wrap{border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;display:none}
    .sfhl-rte-wrap.vis{display:block}
    .sfhl-rte-toolbar{display:flex;gap:2px;padding:4px 6px;background:#f9fafb;border-bottom:1px solid #e5e7eb;flex-wrap:wrap}
    .sfhl-rtb{width:26px;height:26px;border:none;border-radius:4px;background:transparent;cursor:pointer;color:#374151;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;transition:background .1s}
    .sfhl-rtb:hover{background:#e5e7eb} .sfhl-rtb.active{background:#ddd6fe;color:#4f46e5}
    .sfhl-rtb svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .sfhl-rte-divider{width:1px;background:#e5e7eb;margin:3px 2px;flex-shrink:0}
    .sfhl-rte-body{min-height:100px;max-height:200px;overflow-y:auto;padding:8px 10px;font-size:12.5px;line-height:1.6;outline:none;word-break:break-word}
    .sfhl-rte-body:focus{box-shadow:inset 0 0 0 2px rgba(99,102,241,.15)}
    .sfhl-rte-body ul,.sfhl-rte-body ol{padding-left:18px;margin:2px 0}
    .sfhl-rte-body a{color:#4f46e5;text-decoration:underline}
    /* Usage badge */
    .sfhl-usage-badge{font-size:9.5px;font-weight:600;color:#7c3aed;background:#f5f3ff;padding:0 5px;border-radius:99px;flex-shrink:0;margin-left:auto}
    /* Settings tab */
    .sfhl-settings-body{flex:1;overflow-y:auto;padding:12px 16px;min-height:0}
    .sfhl-settings-body::-webkit-scrollbar{width:4px} .sfhl-settings-body::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:4px}
    .sfhl-set-section{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #f3f4f6}
    .sfhl-set-section:last-child{border-bottom:none;margin-bottom:0}
    .sfhl-set-section h3{font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px}
    .sfhl-set-row2{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12.5px;color:#374151}
    .sfhl-set-row2 label{min-width:80px;font-size:12px;color:#6b7280;flex-shrink:0}
    .sfhl-set-row2 input[type="text"],.sfhl-set-row2 select{flex:1;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12.5px}
    .sfhl-set-row2 input:focus,.sfhl-set-row2 select:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.1)}
    .sfhl-set-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
    .sfhl-btn-danger{padding:6px 12px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid #fca5a5;background:#fef2f2;color:#dc2626;transition:all .12s}
    .sfhl-btn-danger:hover{background:#fee2e2;border-color:#f87171}
    /* Refresh tab */
    .sfhl-refresh-body{flex:1;overflow-y:auto;padding:16px;min-height:0}
    .sfhl-rf-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:12px}
    .sfhl-rf-card h3{font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px}
    .sfhl-rf-card .rfr{display:flex;align-items:center;gap:10px;margin-bottom:8px}
    .sfhl-rf-card label{font-size:12px;color:#6b7280;white-space:nowrap}
    .sfhl-rf-card input[type="number"]{width:70px;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;text-align:center;-moz-appearance:textfield}
    .sfhl-rf-card input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none}
    /* Editor always-on toolbar (plain mode too) */
    .sfhl-editor-wrap{border:1px solid #e5e7eb;border-radius:6px;overflow:hidden}
    .sfhl-editor-content{min-height:110px;max-height:200px;overflow-y:auto;padding:8px 10px;font-size:12.5px;line-height:1.6;outline:none;word-break:break-word;font-family:inherit}
    .sfhl-editor-content:focus{box-shadow:inset 0 0 0 2px rgba(99,102,241,.15)}
    .sfhl-editor-content ul,.sfhl-editor-content ol{padding-left:18px;margin:2px 0}
    .sfhl-editor-content a{color:#4f46e5;text-decoration:underline;cursor:pointer}

    /* Snippet Drag&Drop (#9) */
    .sfhl-snip-row{cursor:default}
    .sfhl-snip-row[draggable="true"]{cursor:grab}
    .sfhl-snip-row.sfhl-sn-dragging{opacity:.3;background:#eef2ff}
    .sfhl-snip-row.sfhl-sn-over-top{border-top:2px solid #6366f1}
    .sfhl-snip-row.sfhl-sn-over-bot{border-bottom:2px solid #6366f1}
    .sfhl-snip-grip{color:#d1d5db;cursor:grab;flex-shrink:0;padding:0 2px;display:flex;align-items:center}
    .sfhl-snip-grip svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
    .sfhl-snip-row:hover .sfhl-snip-grip{color:#9ca3af}
    /* Kategorie-Umbenennung (#7) */
    .sfhl-cat-hdr span.sfhl-cat-name{cursor:text}
    /* Recently Used (#15) */
    .sfhl-recent-hdr{display:flex;align-items:center;gap:6px;padding:5px 16px;font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.5px;background:#f5f3ff;border-bottom:1px solid #ede9fe}
    /* Lang-Tabs (#34) */
    .sfhl-lang-tab{padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #e5e7eb;background:#fff;color:#9ca3af;transition:all .12s}
    .sfhl-lang-tab.active{background:#eef2ff;border-color:#6366f1;color:#4f46e5}
    /* Share-Button (#35) */
    .sfhl-ed-share{font-size:11px}
    /* Favoriten-Stern */
    .sfhl-fav{font-size:14px;cursor:pointer;flex-shrink:0;opacity:.35;transition:opacity .15s,color .15s;padding:0 2px;user-select:none;line-height:1}
    .sfhl-fav:hover{opacity:.7}
    .sfhl-fav.on{opacity:1;color:#f59e0b}

    /* Platzhalter-Picker (#43) */
    .sfhl-ph-picker{position:fixed;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.14);z-index:2147483647;width:300px;max-height:320px;overflow-y:auto;opacity:0;pointer-events:none;transition:opacity .12s}
    .sfhl-ph-picker.vis{opacity:1;pointer-events:auto}
    .sfhl-ph-picker::-webkit-scrollbar{width:4px} .sfhl-ph-picker::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:4px}
    .sfhl-ph-hdr{padding:8px 12px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f3f4f6;background:#f9fafb;position:sticky;top:0}
    .sfhl-ph-item{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;cursor:pointer;transition:background .1s;border-bottom:1px solid #f8f8f8}
    .sfhl-ph-item:hover{background:#f3f4f6}
    .sfhl-ph-code{font-family:monospace;font-size:11px;font-weight:600;color:#4f46e5;background:#eef2ff;padding:1px 5px;border-radius:3px}
    .sfhl-ph-val{font-size:11px;color:#6b7280;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* Markdown-Import (#44) */
    .sfhl-rtb-md{font-size:10px;font-weight:700;letter-spacing:-.3px}

    /* Eingabe-Variable (#45) */
    .sfhl-var-hint{font-size:10px;color:#7c3aed;margin-top:2px}
    /* Zeichen-/Wortzähler */
    .sfhl-counter{font-size:10px;color:#9ca3af;margin-top:3px;text-align:right;height:14px}
    .sfhl-counter .warn{color:#f59e0b;font-weight:600}
    /* Spellcheck-Sprachumschalter */
    .sfhl-spell-lang{font-size:10px;color:#9ca3af;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
    .sfhl-spell-lang:hover{color:#4f46e5}
    /* Footer */
    .sfhl-footer{padding:6px 16px;text-align:right;font-size:10px;color:#c4c4c4;border-top:1px solid #f3f4f6;flex-shrink:0;letter-spacing:.2px}
  `;
  (document.head || document.documentElement).appendChild(styleEl);

  // ===== Build DOM =====
  const backdrop = document.createElement('div');
  backdrop.className = 'sfhl-backdrop';
  document.documentElement.appendChild(backdrop);

  const panel = document.createElement('div');
  panel.className = 'sfhl-panel';
  panel.innerHTML = `
    <div class="sfhl-resize"></div>
    <div class="sfhl-hdr">
      <div class="sfhl-hdr-top">
        <h2>Salesforce Tools</h2>
        <div class="sfhl-hdr-acts">
          <div class="sfhl-ib sfhl-close-btn" role="button" tabindex="0" title="Schlie\u00dfen">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
        </div>
      </div>
      <div class="sfhl-tabs">
        <div class="sfhl-tab active" data-tab="rules"><span data-i18n="Markierung">Markierung</span> <span class="sfhl-tab-badge sfhl-rules-count">0</span></div>
        <div class="sfhl-tab" data-tab="snippets"><span data-i18n="Snippets">Snippets</span> <span class="sfhl-tab-badge sfhl-snip-count">0</span></div>
        <div class="sfhl-tab" data-tab="refresh" data-i18n="Aktualisierung">Aktualisierung</div>
        <div class="sfhl-tab" data-tab="settings" data-i18n="Einstellungen">Einstellungen</div>
        <div class="sfhl-tab" data-tab="help" data-i18n="Hilfe">Hilfe</div>
      </div>
    </div>

    <!-- ===== Markierung Tab ===== -->
    <div class="sfhl-tab-content active" data-tab="rules">
      <div class="sfhl-search"><input type="text" placeholder="Regeln durchsuchen\u2026" class="sfhl-search-input"></div>
      <div class="sfhl-colhdr"><div></div><div>Stichwort</div><div>Farbe</div><div>Aktionen</div></div>
      <div class="sfhl-list"></div>
      <div class="sfhl-add-bar"><div class="sfhl-add-toggle" role="button"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Neue Regel</div><div class="sfhl-folder-add-btn" role="button"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Ordner</div></div>
      <div class="sfhl-add-form">
        <div class="sfhl-add-row">
          <input type="text" placeholder="Begriff | A + B | !nicht | /regex/" class="sfhl-new-term" title="Operatoren:&#10;  A + B  = AND (beide müssen vorkommen)&#10;  A | B  = OR (mindestens eins)&#10;  !text  = NICHT (darf nicht vorkommen)&#10;  /regex/i = Regulärer Ausdruck&#10;&#10;Beispiel: SLA + dringend | urgent">
          <div class="sfhl-sw sfhl-add-sw" style="margin:0 auto" data-color="#e6ffe6"><div class="sfhl-sw-fill" style="background:#e6ffe6"></div><input type="color" value="#e6ffe6" class="sfhl-new-color"></div>
        </div>
        <div class="sfhl-add-acts">
          <div class="sfhl-match-badge">Treffer: <span class="num">0</span></div>
          <div style="display:flex;gap:6px"><div class="sfhl-btn-sm sfhl-add-cancel" role="button">Abbrechen</div><div class="sfhl-btn-sm sfhl-btn-primary sfhl-add-save" role="button">Hinzuf\u00fcgen</div></div>
        </div>
      </div>
    </div>

    <!-- ===== Snippets Tab ===== -->
    <div class="sfhl-tab-content" data-tab="snippets">
      <div class="sfhl-search"><input type="text" placeholder="Snippets durchsuchen\u2026" class="sfhl-snip-search-input"></div>
      <div class="sfhl-snip-list"></div>
      <div class="sfhl-add-bar"><div class="sfhl-add-toggle sfhl-snip-add-toggle" role="button"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Neues Snippet</div></div>
      <div class="sfhl-snip-editor" data-mode="add">
        <div class="sfhl-ed-row"><div class="sfhl-field"><label data-i18n="Trigger">Trigger</label><input type="text" class="sfhl-ed-trigger" placeholder="gruss"></div><div class="sfhl-field"><label data-i18n="Bezeichnung">Bezeichnung</label><input type="text" class="sfhl-ed-label" placeholder="Standardgru\u00df DE"></div></div>
        <div class="sfhl-field"><label data-i18n="Kategorie">Kategorie</label><input type="text" class="sfhl-ed-category" list="sfhl-cat-list" placeholder="z.B. Begr\u00fc\u00dfung"><datalist id="sfhl-cat-list"></datalist></div>
        <div class="sfhl-field">
          <label style="display:flex;align-items:center;justify-content:space-between">
            <span>Text</span>
            <span style="display:flex;gap:3px">
              <span class="sfhl-lang-tab active" data-lang="de" role="button">DE</span>
              <span class="sfhl-lang-tab" data-lang="en" role="button">EN</span>
            </span>
          </label>
          <div class="sfhl-editor-wrap">
            <div class="sfhl-rte-toolbar">
                            <button class="sfhl-rtb" data-cmd="bold" title="Fett"><b>B</b></button>
              <button class="sfhl-rtb" data-cmd="italic" title="Kursiv"><i style="font-style:italic">I</i></button>
              <button class="sfhl-rtb" data-cmd="underline" title="Unterstrichen"><u>U</u></button>
              <button class="sfhl-rtb" data-cmd="strikeThrough" title="Durchgestrichen"><s>S</s></button>
              <div class="sfhl-rte-divider"></div>
              <button class="sfhl-rtb" data-cmd="insertUnorderedList" title="Aufz\u00e4hlung"><svg viewBox="0 0 24 24"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="2" fill="currentColor" stroke="none"/></svg></button>
              <button class="sfhl-rtb" data-cmd="insertOrderedList" title="Nummeriert"><svg viewBox="0 0 24 24"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="1" y="9" font-size="9" fill="currentColor" stroke="none">1.</text><text x="1" y="15" font-size="9" fill="currentColor" stroke="none">2.</text><text x="1" y="21" font-size="9" fill="currentColor" stroke="none">3.</text></svg></button>
              <div class="sfhl-rte-divider"></div>
              <button class="sfhl-rtb sfhl-rtb-link" title="Link einf\u00fcgen"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>
              <button class="sfhl-rtb sfhl-rtb-clear" title="Formatierung entfernen"><svg viewBox="0 0 24 24"><path d="M6 13.87A4 4 0 0 1 7.41 6h8.18M18 12v6M6 18h8"/><line x1="2" y1="2" x2="22" y2="22"/></svg></button>
              <div class="sfhl-rte-divider"></div>
              <button class="sfhl-rtb sfhl-rtb-placeholder" title="Platzhalter einf\u00fcgen" style="font-size:11px;font-weight:700;letter-spacing:-.3px">{x}</button>
              <div class="sfhl-rte-divider"></div>
              <select class="sfhl-rtb-snip-insert" title="Vorlage einf\u00fcgen" style="height:26px;font-size:11px;border:1px solid #e5e7eb;border-radius:4px;padding:0 4px;cursor:pointer;max-width:110px"><option value="">+ Vorlage</option></select>
            </div>
            <div class="sfhl-editor-content sfhl-rte-body" contenteditable="true" spellcheck="true" lang="de"></div>
          </div>
          <textarea class="sfhl-ed-body" style="display:none"></textarea>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px"><span class="sfhl-spell-lang" data-lang="de">🔤 Sprachprüfung: DE</span><span class="sfhl-counter"></span></div>
        <div style="font-size:10px;color:#9ca3af;margin-top:4px">Platzhalter per <b>{x}</b>-Button oben einf\u00fcgen. Cursor-Position: {|}</div>
        <div class="sfhl-var-hint">Eingabe-Variable: <code style="background:#f3e8ff;padding:0 3px;border-radius:2px">{eingabe:Beschriftung}</code> → fragt beim Einfügen nach dem Wert (#45)</div>
        <div class="sfhl-ed-foot">
          <div class="sfhl-btn-sm sfhl-ed-cancel" role="button">Abbrechen</div>
          <div style="display:flex;gap:6px"><div class="sfhl-btn-sm sfhl-ed-delete danger" role="button" style="display:none;color:#dc2626">L\u00f6schen</div><div class="sfhl-btn-sm sfhl-ed-duplicate" role="button" style="display:none">Duplizieren</div><div class="sfhl-btn-sm sfhl-ed-share" role="button" style="display:none;font-size:11px">Teilen \u2197</div><div class="sfhl-btn-sm sfhl-btn-primary sfhl-ed-save" role="button">Speichern</div></div>
        </div>
      </div>
    </div>

    <!-- ===== Aktualisierung Tab ===== -->
    <div class="sfhl-tab-content" data-tab="refresh">
      <div class="sfhl-refresh-body">
        <div class="sfhl-rf-card">
          <h3>Auto-Refresh</h3>
          <div class="rfr"><label>Status</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-rf-enabled"><span class="sl"></span></span><span class="sfhl-sp" style="margin-left:8px"></span></div>
          <div class="rfr"><label data-i18n="Intervall">Intervall</label><input type="number" min="5" step="5" class="sfhl-rf-secs" placeholder="60"><label data-i18n="Sekunden">Sekunden</label></div>
          <div class="sfhl-btn-sm sfhl-btn-primary sfhl-rf-apply" role="button" style="margin-top:6px">\u00dcbernehmen</div>
        </div>
        <p style="font-size:11px;color:#9ca3af;padding:0 2px">Der Auto-Refresh ist nur auf Case-Listenseiten aktiv. Der Countdown wird direkt im SF-Refresh-Button angezeigt.</p>
      </div>
    </div>

    <!-- ===== Einstellungen Tab ===== -->
    <div class="sfhl-tab-content" data-tab="settings">
      <div class="sfhl-settings-body">
        <div class="sfhl-set-section">
          <h3 data-i18n="Allgemein">Allgemein</h3>
          <div class="sfhl-set-row2"><label data-i18n="Trigger-Prefix">Trigger-Prefix</label><select class="sfhl-set-prefix">${PREFIXES.map(p=>`<option value="${p}">${p}</option>`).join('')}</select></div>
          <div class="sfhl-set-row2"><label data-i18n="Dein Name">Dein Name</label><input type="text" class="sfhl-set-uname" placeholder="Max Mustermann"></div>
          <div class="sfhl-set-row2"><label data-i18n="Default language">Default language</label><select class="sfhl-set-lang"><option value="de">Deutsch</option><option value="en">English</option></select></div>
          <p style="font-size:11px;color:#9ca3af;margin-top:6px">Tip: Type <code>;;en</code> to temporarily show English snippets, <code>;;de</code> for German.</p>
        </div>
        <div class="sfhl-set-section">
          <h3 data-i18n="E-Mail Bausteine">E-Mail Bausteine</h3>
          <div class="sfhl-set-row2"><label data-i18n="Auto-Wrap">Auto-Wrap</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-wrap-enabled"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Anrede + Signatur automatisch einf\u00fcgen</span></div>
          <div class="sfhl-set-row2"><label data-i18n="Anrede">Anrede</label><select class="sfhl-wrap-anrede"></select></div>
          <div class="sfhl-set-row2"><label data-i18n="Signatur">Signatur</label><select class="sfhl-wrap-sig"></select></div>
          <p style="font-size:11px;color:#9ca3af;margin-top:6px">Wenn aktiv, wird beim Einf\u00fcgen eines Snippets automatisch die Anrede davor und die Signatur danach eingef\u00fcgt. Gilt nicht wenn das Snippet selbst die Anrede oder Signatur ist.</p>
        </div>
        <div class="sfhl-set-section">
          <h3 data-i18n="Export">Export</h3>
          <div class="sfhl-set-actions">
            <div class="sfhl-btn-sm sfhl-act-export" role="button" data-i18n="\u2193 Alles exportieren">\u2193 Alles exportieren</div>
            <div class="sfhl-btn-sm sfhl-act-export-rules" role="button" data-i18n="\u2193 Markierungen">\u2193 Markierungen</div>
            <div class="sfhl-btn-sm sfhl-act-export-snips" role="button" data-i18n="\u2193 Snippets">\u2193 Snippets</div>
          </div>
        </div>
        <div class="sfhl-set-section">
          <h3 data-i18n="Import">Import</h3>
          <div class="sfhl-set-actions">
            <div class="sfhl-btn-sm sfhl-act-import" role="button" data-i18n="\u2191 Datei importieren">\u2191 Datei importieren</div>
          </div>
          <p style="font-size:11px;color:#9ca3af;margin-top:6px">Importierte Regeln/Snippets ersetzen die bestehenden.</p>
        </div>
        <div class="sfhl-set-section">
          <h3 data-i18n="Zur\u00fccksetzen">Zur\u00fccksetzen</h3>
          <div class="sfhl-set-actions">
            <div class="sfhl-btn-danger sfhl-act-reset-rules" role="button" data-i18n="Markierungen zur\u00fccksetzen">Markierungen zur\u00fccksetzen</div>
            <div class="sfhl-btn-danger sfhl-act-reset-snips" role="button" data-i18n="Snippets zur\u00fccksetzen">Snippets zur\u00fccksetzen</div>
            <div class="sfhl-btn-danger sfhl-act-reset" role="button" data-i18n="Alles zur\u00fccksetzen">Alles zur\u00fccksetzen</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== Hilfe Tab ===== -->
    <div class="sfhl-tab-content" data-tab="help">
      <div class="sfhl-settings-body" style="font-size:12px;line-height:1.55;color:#374151">
        <div class="sfhl-set-section">
          <h3>\u00dcberblick</h3>
          <p>Dieses Tool erweitert Salesforce Lightning um drei Hauptfunktionen: <b>Zeilen-Markierung</b> in Case-Listen, <b>Text-Snippets</b> mit Platzhaltern und <b>Auto-Refresh</b> mit Countdown. Der SF-Tools-Button unten rechts \u00f6ffnet dieses Panel (Shortcut: <code>Alt+R</code>).</p>
        </div>

        <div class="sfhl-set-section">
          <h3>Markierung (Regeln)</h3>
          <p>Markiert Zeilen in Case-Listen farbig basierend auf Textinhalten. Die Regeln werden in der Reihenfolge gepr\u00fcft, die erste passende Regel gewinnt.</p>
          <p><b>Operatoren im Stichwort-Feld:</b></p>
          <ul style="margin:4px 0 4px 18px;padding:0">
            <li><code>Begriff</code> \u2014 einfache Textsuche (case-insensitive)</li>
            <li><code>A + B</code> \u2014 UND: beide m\u00fcssen vorkommen</li>
            <li><code>A | B</code> oder <code>A OR B</code> \u2014 ODER: mindestens einer</li>
            <li><code>!text</code> \u2014 NICHT: darf nicht vorkommen</li>
            <li><code>/regex/i</code> \u2014 Regul\u00e4rer Ausdruck</li>
          </ul>
          <p><b>Beispiele:</b><br>
          <code>SLA + dringend</code> \u2014 SLA UND dringend<br>
          <code>urgent | eilig</code> \u2014 urgent ODER eilig<br>
          <code>SLA + !closed</code> \u2014 SLA aber NICHT closed<br>
          <code>/Fehler\\s*\\d+/i</code> \u2014 "Fehler" gefolgt von Nummer</p>
          <p><b>Ordner:</b> Regeln lassen sich in Ordnern gruppieren (Klick auf "Ordner"-Button). Ordner k\u00f6nnen auf-/zugeklappt werden.</p>
        </div>

        <div class="sfhl-set-section">
          <h3>Snippets</h3>
          <p>Tippe den Trigger-Prefix (Standard <code>;;</code>) gefolgt vom Trigger-Namen in einem beliebigen Textfeld, um ein Snippet einzuf\u00fcgen. Das Dropdown \u00f6ffnet sich sofort bei <code>;;</code> und filtert beim Weitertippen.</p>
          <p><b>Tastatur im Dropdown:</b></p>
          <ul style="margin:4px 0 4px 18px;padding:0">
            <li><code>\u2193 \u2191</code> \u2014 durch Vorschl\u00e4ge navigieren</li>
            <li><code>Enter</code> oder <code>Tab</code> \u2014 ausgew\u00e4hltes Snippet einf\u00fcgen</li>
            <li><code>Esc</code> \u2014 Dropdown schlie\u00dfen</li>
          </ul>
          <p><b>Sprachwahl beim Einf\u00fcgen:</b></p>
          <ul style="margin:4px 0 4px 18px;padding:0">
            <li><code>;;en gruss</code> \u2014 zeigt EN-Variante</li>
            <li><code>;;de gruss</code> \u2014 zeigt DE-Variante</li>
            <li>Ohne Pr\u00e4fix: Standard-Sprache aus Einstellungen</li>
          </ul>
          <p><b>Platzhalter</b> (per <code>{x}</code>-Button im Editor oder direkt tippen): <code>{name}</code> <code>{datum}</code> <code>{uhrzeit}</code> <code>{case}</code> <code>{betreff}</code> <code>{anrede}</code> <code>{nachname}</code> <code>{kontakt}</code> <code>{kunde}</code> <code>{produkt}</code> <code>{seriennummer}</code> <code>{telefon}</code> <code>{mobil}</code> <code>{arbeitsauftrag}</code> <code>{vertrieb}</code> <code>{firma}</code> <code>{|}</code> (Cursor-Position nach Einf\u00fcgen)</p>
          <p><b>Dynamische Abfrage:</b> <code>{eingabe:Beschriftung}</code> fragt beim Einf\u00fcgen nach dem Wert.</p>
          <p><b>Salesforce-Merge-Felder:</b> <code>{!Case.Subject}</code>, <code>{!Contact.Name}</code>, <code>{!Contact.Salutation}</code> etc. werden aus der aktuellen Case-Seite gelesen (DOM-basiert).</p>
          <p><b>Auto-Wrap</b> (in Einstellungen): F\u00fcgt automatisch Anrede davor und Signatur danach ein. Wird \u00fcbersprungen wenn das Snippet selbst die Anrede/Signatur ist.</p>
          <p><b>Weitere Features:</b> Favoriten (Stern), Nutzungs-Z\u00e4hler, Suche, Kategorien, Drag&Drop zum Umsortieren, Import/Export, Duplizieren, Teilen via Link.</p>
        </div>

        <div class="sfhl-set-section">
          <h3>Aktualisierung (Auto-Refresh)</h3>
          <p>Klickt automatisch den SF-Refresh-Button in Case-Listen in einem einstellbaren Intervall. Ein Countdown im Button zeigt die Sekunden bis zur n\u00e4chsten Aktualisierung. Neu hereingekommene Eintr\u00e4ge werden kurz blinkend hervorgehoben.</p>
        </div>

        <div class="sfhl-set-section">
          <h3>Einstellungen</h3>
          <ul style="margin:4px 0 4px 18px;padding:0">
            <li><b>Trigger-Prefix</b> \u2014 z.B. <code>;;</code>, <code>::</code>, <code>//</code></li>
            <li><b>Dein Name</b> \u2014 wird f\u00fcr <code>{name}</code> verwendet</li>
            <li><b>Default language</b> \u2014 welche Snippet-Variante standardm\u00e4\u00dfig verwendet wird</li>
            <li><b>E-Mail Bausteine (Auto-Wrap)</b> \u2014 Anrede/Signatur automatisch</li>
            <li><b>Export/Import</b> \u2014 Regeln+Snippets als JSON sichern/wiederherstellen</li>
          </ul>
          <p><b>Hinweis zur UI-Sprache:</b> Die UI-Texte sind aktuell auf Deutsch. Die Sprachwahl betrifft nur die Snippet-Sprache, nicht die Men\u00fcs. Vollst\u00e4ndige UI-\u00dcbersetzung ist geplant.</p>
        </div>

        <div class="sfhl-set-section">
          <h3>Tastenk\u00fcrzel</h3>
          <ul style="margin:4px 0 4px 18px;padding:0">
            <li><code>Alt+R</code> \u2014 Panel \u00f6ffnen/schlie\u00dfen</li>
            <li><code>Esc</code> \u2014 Panel/Dropdown schlie\u00dfen</li>
            <li><code>;;</code> \u2014 Snippet-Dropdown \u00f6ffnen (in Textfeldern)</li>
          </ul>
        </div>

        <div class="sfhl-set-section">
          <h3>Probleme?</h3>
          <p>Bei Fehlern hilft oft: Seite neu laden (F5), Tab schlie\u00dfen und neu \u00f6ffnen, oder Browser-Konsole \u00f6ffnen (F12) um <code>[SFHL]</code>-Meldungen zu sehen. Feedback gerne via GitHub-Link unten.</p>
        </div>
      </div>
    </div>

    <div class="sfhl-footer">v${VERSION} &nbsp;·&nbsp; Tobias Jurgan &nbsp;·&nbsp; <a href="https://github.com/tJ-ek0/Tampermonkey-Salesforce-tools" target="_blank" rel="noopener" style="color:#c4c4c4;text-decoration:none" onmouseover="this.style.color='#6366f1'" onmouseout="this.style.color='#c4c4c4'">GitHub ↗</a></div>
  `;
  document.documentElement.appendChild(panel);

  const triggerBtn = document.createElement('div');
  triggerBtn.className = 'sfhl-trigger'; triggerBtn.setAttribute('role','button');
  triggerBtn.innerHTML = '<span class="sfhl-dot"></span><span>SF Tools</span><span class="sfhl-count" style="font-size:10px;font-weight:600;color:#9ca3af;padding-left:5px;border-left:1px solid #f3f4f6;margin-left:2px"></span>';
  document.documentElement.appendChild(triggerBtn);

  const fileInput = document.createElement('input'); fileInput.type='file'; fileInput.accept='.txt,.json'; fileInput.style.display='none';
  document.documentElement.appendChild(fileInput);

  // Shared palette
  const paletteEl = document.createElement('div'); paletteEl.className = 'sfhl-palette';
  paletteEl.innerHTML = `<div class="sfhl-palette-label">Farbe w\u00e4hlen</div><div class="sfhl-palette-grid">${COLOR_PRESETS.map(p=>`<div class="sfhl-preset" data-color="${p.hex}" style="background:${p.hex}" title="${p.name}"><span class="sfhl-preset-name">${p.name}</span></div>`).join('')}</div><div class="sfhl-palette-custom" role="button"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>Eigene Farbe\u2026</div>`;
  document.documentElement.appendChild(paletteEl);

  // Platzhalter-Picker (#43)
  const phPicker = document.createElement('div'); phPicker.className = 'sfhl-ph-picker';
  document.documentElement.appendChild(phPicker);

  // Dropdown for snippet trigger
  const dropdown = document.createElement('div'); dropdown.className = 'sfhl-dropdown';
  document.documentElement.appendChild(dropdown);

  // ===== Refs =====
  const $ = s => panel.querySelector(s);
  const listEl      = $('.sfhl-list');
  const snipListEl  = $('.sfhl-snip-list');
  const searchInput = $('.sfhl-search-input');
  const snipSearch  = $('.sfhl-snip-search-input');
  const addForm     = $('.sfhl-add-form');
  const addTermEl   = $('.sfhl-new-term');
  const addSw       = $('.sfhl-add-sw');
  const addColorEl  = $('.sfhl-new-color');
  const matchBadge  = $('.sfhl-match-badge .num');
  const rfInput     = $('.sfhl-rf-secs');
  const rfCb        = $('.sfhl-rf-enabled');
  const statusPill  = $('.sfhl-sp');
  const snipEditor  = $('.sfhl-snip-editor');
  const setPrefix   = $('.sfhl-set-prefix');
  const setUname    = $('.sfhl-set-uname');
  const setLang     = $('.sfhl-set-lang');
  const wrapCb      = $('.sfhl-wrap-enabled');
  const wrapAnrSel  = $('.sfhl-wrap-anrede');
  const wrapSigSel  = $('.sfhl-wrap-sig');

  rfInput.value = String(loadRefreshSecs());
  rfCb.checked = loadRefreshOn();
  setPrefix.value = loadPrefix();
  setUname.value = loadUname();
  setLang.value = loadDefaultLang();
  wrapCb.checked = loadWrapOn();

  // Wrap-Dropdowns befüllen
  function updateWrapDropdowns() {
    const prefix = loadPrefix();
    const opts = SNIPPETS.map(s => `<option value="${escH(s.trigger)}">${escH(prefix+s.trigger)} \u2014 ${escH(s.label)}</option>`).join('');
    wrapAnrSel.innerHTML = opts;
    wrapSigSel.innerHTML = opts;
    wrapAnrSel.value = loadWrapAnrede();
    wrapSigSel.value = loadWrapSignatur();
  }

  // ===== Tab switching =====
  function switchTab(tabName) {
    panel.querySelectorAll('.sfhl-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    panel.querySelectorAll('.sfhl-tab-content').forEach(c => c.classList.toggle('active', c.dataset.tab === tabName));
    snipEditor.classList.remove('vis');
    panel.querySelectorAll('.sfhl-add-bar').forEach(b => b.style.display = 'flex');
    addForm.classList.remove('vis');
  }
  panel.querySelectorAll('.sfhl-tab').forEach(tab => { tab.onclick = () => switchTab(tab.dataset.tab); });

  function updatePill() {
    const on = loadRefreshOn();
    const pill = $('.sfhl-sp');
    if (pill) { pill.textContent = on ? loadRefreshSecs()+'s' : 'Aus'; pill.className = 'sfhl-sp ' + (on ? 'sfhl-sp-on' : 'sfhl-sp-off'); }
    const dot = triggerBtn.querySelector('.sfhl-dot');
    if (dot) dot.className = 'sfhl-dot' + (on ? '' : ' off');
  }

  function updateBadges() {
    $('.sfhl-rules-count').textContent = String(RULES.length);
    $('.sfhl-snip-count').textContent = String(SNIPPETS.length);
  }
  updateBadges();
  applyTranslations();

  // ===== Panel open/close =====
  let activeSwatch = null;
  function openPanel() { panel.classList.add('open'); backdrop.classList.add('vis'); }
  function closePanel() { panel.classList.remove('open'); backdrop.classList.remove('vis'); closeOF(); closePalette(); }
  function closeOF() { }  // no-op, overflow menu removed
  function closePalette() { paletteEl.classList.remove('vis'); activeSwatch = null; }

  updatePill();

  triggerBtn.onclick = openPanel;
  backdrop.onclick = closePanel;
  $('.sfhl-close-btn').onclick = closePanel;
  // Panel schließen bei Klick außerhalb
  document.addEventListener('mousedown', e => {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(e.target) || triggerBtn.contains(e.target)) return;
    if (dropdown.contains(e.target)) return; // Dropdown nicht stören
    if (paletteEl.contains(e.target)) return;
    if (phPicker.contains(e.target)) return;
    closePanel();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePanel(); closeDropdown(); }
    if (e.altKey && e.key.toLowerCase() === 'r') { e.preventDefault(); panel.classList.contains('open') ? closePanel() : openPanel(); }
  });

  // Resize
  const savedW = parseInt(localStorage.getItem(LS_PANEL_W), 10);
  if (savedW >= 340 && savedW <= 700) panel.style.width = savedW + 'px';
  const resizeHandle = panel.querySelector('.sfhl-resize');
  resizeHandle.addEventListener('mousedown', e => {
    e.preventDefault(); panel.classList.add('resizing');
    const onMove = ev => { panel.style.width = Math.max(340, Math.min(700, window.innerWidth - ev.clientX)) + 'px'; };
    const onUp = () => { panel.classList.remove('resizing'); localStorage.setItem(LS_PANEL_W, String(parseInt(panel.style.width,10))); document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Settings tab actions
  $('.sfhl-act-export').onclick       = () => doExport('all');
  $('.sfhl-act-export-rules').onclick  = () => doExport('rules');
  $('.sfhl-act-export-snips').onclick  = () => doExport('snips');
  $('.sfhl-act-import').onclick = () => { fileInput.value = ''; fileInput.click(); };
  $('.sfhl-act-reset').onclick  = () => doReset();
  $('.sfhl-act-reset-rules').onclick = () => {
    if (!confirm('Markierungsregeln auf Standard zur\u00fccksetzen?')) return;
    RULES = RULE_DEFAULTS.map(e=>({...e,id:uid(),folder:null})); saveRules(); renderRules(); rescanSoon(true);
    updateBadges(); toast('Markierungen zur\u00fcckgesetzt','info');
  };
  $('.sfhl-act-reset-snips').onclick = () => {
    if (!confirm('Snippets auf Standard zur\u00fccksetzen?')) return;
    SNIPPETS = SNIP_DEFAULTS.map(e=>({...e,id:uid(),favorite:!!e.favorite})); saveSnippets(); renderSnippets();
    updateBadges(); toast('Snippets zur\u00fcckgesetzt','info');
  };

  // Palette logic
  function showPalette(sw) {
    if (activeSwatch === sw && paletteEl.classList.contains('vis')) { closePalette(); return; }
    activeSwatch = sw;
    const rect = sw.getBoundingClientRect();
    let top = rect.bottom + 6, left = rect.right - 200;
    if (left < 8) left = 8;
    if (top + 220 > window.innerHeight) top = rect.top - 220;
    paletteEl.style.top = top + 'px'; paletteEl.style.left = left + 'px';
    const cur = (sw.dataset.color || '').toLowerCase();
    paletteEl.querySelectorAll('.sfhl-preset').forEach(p => p.classList.toggle('active', p.dataset.color.toLowerCase() === cur));
    paletteEl.classList.add('vis');
  }
  paletteEl.addEventListener('click', e => {
    const preset = e.target.closest('.sfhl-preset');
    if (preset && activeSwatch) { e.stopPropagation(); applyColor(activeSwatch, preset.dataset.color); closePalette(); return; }
    const custom = e.target.closest('.sfhl-palette-custom');
    if (custom && activeSwatch) { e.stopPropagation(); const inp = activeSwatch.querySelector('input[type="color"]'); if (inp) { closePalette(); inp.click(); } }
  });
  panel.addEventListener('click', e => {
    const fill = e.target.closest('.sfhl-sw-fill');
    if (fill) { e.stopPropagation(); showPalette(fill.closest('.sfhl-sw')); return; }
    if (!e.target.closest('.sfhl-palette')) closePalette();
  });
  document.addEventListener('click', e => { if (!e.target.closest('.sfhl-palette') && !e.target.closest('.sfhl-sw')) closePalette(); });
  panel.addEventListener('change', e => { if (e.target.matches('input[type="color"]')) { const sw = e.target.closest('.sfhl-sw'); if (sw) applyColor(sw, e.target.value); } });
  panel.addEventListener('input', e => { if (e.target.matches('input[type="color"]')) { const sw = e.target.closest('.sfhl-sw'); if (sw) { const f = sw.querySelector('.sfhl-sw-fill'); if (f) f.style.background = e.target.value; } } });
  function applyColor(sw, color) {
    const fill = sw.querySelector('.sfhl-sw-fill'), inp = sw.querySelector('input[type="color"]');
    if (fill) fill.style.background = color; if (inp) inp.value = color; sw.dataset.color = color;
    const row = sw.closest('.sfhl-row');
    if (row) { const item = RULES.find(x => x.id === row.dataset.ruleId); if (item) { item.color = color; row.style.borderLeftColor = color; saveRules(); highlightRows(true); } }
  }

  // ===== Rules Tab: Add/Search/Render/Drag =====
  let ruleSearch = '', dragSrcId = null, dragSrcFolder = null, collapsedFolders = new Set(), collapsedSnipCats = new Set();
  searchInput.addEventListener('input', () => { ruleSearch = searchInput.value.toLowerCase().trim(); renderRules(); });
  $('.sfhl-add-toggle').onclick = () => { addForm.classList.add('vis'); $('.sfhl-add-bar').style.display = 'none'; setTimeout(() => addTermEl.focus(), 50); };
  $('.sfhl-add-cancel').onclick = () => { addForm.classList.remove('vis'); panel.querySelector('[data-tab="rules"] .sfhl-add-bar').style.display = 'flex'; };
  const updateMatchCount = debounce(() => { matchBadge.textContent = String(countMatches(addTermEl.value.trim())); }, 150);
  addTermEl.addEventListener('input', updateMatchCount);
  $('.sfhl-add-save').onclick = () => {
    const term = (addTermEl.value||'').trim(); if (!term) { addTermEl.focus(); return; }
    RULES.unshift({ id:uid(), term, color:addSw?.dataset.color||addColorEl.value||'#ffffcc', enabled:true });
    saveRules(); renderRules(); rescanSoon(true); addTermEl.value = '';
    if (addSw) { addSw.dataset.color='#e6ffe6'; const f=addSw.querySelector('.sfhl-sw-fill'); if(f) f.style.background='#e6ffe6'; } if(addColorEl) addColorEl.value='#e6ffe6';
    addForm.classList.remove('vis'); panel.querySelector('[data-tab="rules"] .sfhl-add-bar').style.display='flex'; toast('Regel hinzugef\u00fcgt','success');
  };
  addTermEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('.sfhl-add-save').click(); } });

  // Refresh tab
  $('.sfhl-rf-apply').onclick = () => { const v=parseInt(rfInput.value,10); const s=saveRefreshSecs(Number.isFinite(v)?v:60); rfInput.value=String(s); restartRefresh(); updatePill(); toast(`Intervall: ${s}s`,'success'); };
  rfCb.onchange = () => { saveRefreshOn(rfCb.checked); if(rfCb.checked) restartRefresh(); else stopRefresh(); updatePill(); toast(rfCb.checked?'Auto-Refresh an':'Auto-Refresh aus','info'); };

  function doExport(mode='all') {
    try {
      const dt=new Date(), pad=n=>String(n).padStart(2,'0'), ds=`${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
      let d, name;
      if (mode==='rules')      { d = { rules: RULES, folders: FOLDERS }; name = `sfhl_markierungen_${ds}.txt`; }
      else if (mode==='snips') { d = { snippets: SNIPPETS, prefix: loadPrefix(), username: loadUname() }; name = `sfhl_snippets_${ds}.txt`; }
      else                     { d = { rules: RULES, snippets: SNIPPETS, folders: FOLDERS, prefix: loadPrefix(), username: loadUname() }; name = `sfhl_export_${ds}.txt`; }
      const blob = new Blob([JSON.stringify(d,null,2)],{type:'application/json'}); const a=document.createElement('a');
      a.href=URL.createObjectURL(blob); a.download=name;
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove(); toast('Exportiert','success');
    } catch { toast('Export fehlgeschlagen','error'); }
  }
  function sanitizeSnippetImport(e) {
    const trigger = String(e.trigger || '').trim().replace(/\s+/g, '').slice(0, 40);
    if (!trigger) return null;
    const body   = sanitizeHtml(String(e.body   || '').slice(0, 50000));
    const bodyEn = sanitizeHtml(String(e.bodyEn || '').slice(0, 50000));
    const label  = String(e.label    || trigger).slice(0, 120);
    const cat    = String(e.category || '').slice(0, 60);
    return { trigger, label, body, bodyEn, category: cat, richText: true };
  }

  fileInput.onchange = async ev => {
    const file = ev.target.files?.[0]; if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (Array.isArray(raw)) { RULES = raw.map(e=>({id:e.id||uid(),term:String(e.term||''),color:e.color||'#ffffcc',enabled:e.enabled!==false})); saveRules(); renderRules(); rescanSoon(true); toast(`${RULES.length} Regeln importiert`,'success'); return; }
      if (raw.rules) { RULES = raw.rules.map(e=>({id:e.id||uid(),term:String(e.term||''),color:e.color||'#ffffcc',enabled:e.enabled!==false,folder:e.folder||null})); saveRules(); renderRules(); rescanSoon(true); }
      if (raw.folders) { FOLDERS = raw.folders.map(f=>({id:f.id||uid(),name:String(f.name||'')})); saveFolders(); }
      if (raw.snippets) {
        const valid = raw.snippets.map(e => { const s = sanitizeSnippetImport(e); return s ? { id: uid(), ...s, favorite: !!e.favorite, usageCount: Number(e.usageCount) || 0 } : null; }).filter(Boolean);
        SNIPPETS = valid; saveSnippets(); renderSnippets();
      }
      if (raw.prefix && PREFIXES.includes(raw.prefix)) { savePrefix(raw.prefix); setPrefix.value = raw.prefix; }
      if (raw.username) { saveUname(raw.username); setUname.value = raw.username; }
      updateBadges(); toast('Import erfolgreich','success');
    } catch { toast('Ung\u00fcltiges Format','error',3500); }
  };
  function doReset() {
    if (!confirm('Alles auf Standard zur\u00fccksetzen? (Regeln + Snippets)')) return;
    RULES = RULE_DEFAULTS.map(e=>({...e,id:uid(),folder:null})); saveRules(); renderRules(); rescanSoon(true);
    FOLDERS = []; saveFolders();
    SNIPPETS = SNIP_DEFAULTS.map(e=>({...e,id:uid(),favorite:!!e.favorite})); saveSnippets(); renderSnippets();
    updateBadges(); toast('Zur\u00fcckgesetzt','info');
  }

  // Build a single rule row DOM element
  function makeRuleRow(item) {
    const row = document.createElement('div');
    row.className = 'sfhl-row' + (item.enabled ? '' : ' disabled');
    row.dataset.ruleId = item.id; row.dataset.folderId = item.folder || ''; row.draggable = true; row.style.borderLeftColor = item.color;
    const eye = item.enabled
      ? '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    row.innerHTML = `<div class="sfhl-grip"><svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg></div><input type="text" value="${escH(item.term)}" title="${escH(item.term)}" class="sfhl-r-term"><div class="sfhl-sw" data-color="${item.color}"><div class="sfhl-sw-fill" style="background:${item.color}"></div><input type="color" value="${item.color}" class="sfhl-r-color"></div><div class="sfhl-row-acts"><div class="sfhl-ra ${item.enabled?'toggle-on':'toggle-off'} sfhl-toggle-rule" role="button" title="${item.enabled?'Deaktivieren':'Aktivieren'}">${eye}${item.enabled?'An':'Aus'}</div><div class="sfhl-ra del sfhl-del-rule" role="button" title="L\u00f6schen"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div></div>`;
    return row;
  }

  // Render rules list with folder grouping
  function renderRules() {
    listEl.innerHTML = '';
    const filtered = ruleSearch ? RULES.filter(r => norm(r.term).includes(ruleSearch)) : RULES;
    const ungrouped = filtered.filter(r => !r.folder);

    // Ungrouped section header (only when folders exist)
    if (FOLDERS.length > 0) {
      const uh = document.createElement('div');
      uh.className = 'sfhl-ungrouped-hdr';
      uh.innerHTML = '<svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg> Ohne Ordner';
      listEl.appendChild(uh);
    }
    const ub = document.createElement('div'); ub.className = 'sfhl-ungrouped-body'; ub.dataset.folderId = '';
    for (const item of ungrouped) ub.appendChild(makeRuleRow(item));
    listEl.appendChild(ub);

    // Folders
    for (const folder of FOLDERS) {
      const fRules = filtered.filter(r => r.folder === folder.id);
      const isCollapsed = collapsedFolders.has(folder.id);
      const fh = document.createElement('div');
      fh.className = 'sfhl-folder-hdr' + (isCollapsed ? ' collapsed' : '');
      fh.dataset.folderId = folder.id;
      fh.innerHTML = `<svg class="sfhl-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><span class="sfhl-folder-name">${escH(folder.name)}</span><span class="sfhl-folder-count">${fRules.length}</span><span class="sfhl-folder-del" role="button" title="Ordner l\u00f6schen"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>`;
      listEl.appendChild(fh);
      const fb = document.createElement('div');
      fb.className = 'sfhl-folder-body' + (isCollapsed ? ' collapsed' : '');
      fb.dataset.folderId = folder.id;
      for (const item of fRules) fb.appendChild(makeRuleRow(item));
      listEl.appendChild(fb);
    }
    updateBadges();
  }

  // Rules event delegation
  listEl.addEventListener('change', e => { const item = RULES.find(x=>x.id===e.target.closest('.sfhl-row')?.dataset.ruleId); if(!item) return; if(e.target.matches('.sfhl-r-term')){item.term=e.target.value;e.target.title=e.target.value;saveRules();rescanSoon(true);} });
  listEl.addEventListener('click', e => {
    // Folder header toggle (not del button)
    const fhdr = e.target.closest('.sfhl-folder-hdr');
    if (fhdr && !e.target.closest('.sfhl-folder-del')) {
      const fid = fhdr.dataset.folderId;
      if (collapsedFolders.has(fid)) collapsedFolders.delete(fid); else collapsedFolders.add(fid);
      fhdr.classList.toggle('collapsed', collapsedFolders.has(fid));
      const fb = fhdr.nextElementSibling; if (fb) fb.classList.toggle('collapsed', collapsedFolders.has(fid));
      return;
    }
    // Folder delete
    const fdel = e.target.closest('.sfhl-folder-del');
    if (fdel) {
      const fid = fdel.closest('.sfhl-folder-hdr')?.dataset.folderId; if (!fid) return;
      if (!confirm('Ordner l\u00f6schen? Enthaltene Regeln werden in "Ohne Ordner" verschoben.')) return;
      RULES.forEach(r => { if (r.folder === fid) r.folder = null; });
      FOLDERS = FOLDERS.filter(f => f.id !== fid);
      saveFolders(); saveRules(); renderRules(); rescanSoon(true); toast('Ordner gel\u00f6scht', 'info'); return;
    }
    const tgl = e.target.closest('.sfhl-toggle-rule'); if(tgl){const item=RULES.find(x=>x.id===tgl.closest('.sfhl-row')?.dataset.ruleId);if(item){item.enabled=!item.enabled;saveRules();renderRules();rescanSoon(true);}return;}
    const del = e.target.closest('.sfhl-del-rule'); if(del){RULES=RULES.filter(x=>x.id!==del.closest('.sfhl-row')?.dataset.ruleId);saveRules();renderRules();rescanSoon(true);toast('Gel\u00f6scht','info');}
  });

  // Drag & Drop (mit Ordner-Drop-Support)
  listEl.addEventListener('dragstart', e => {
    const r = e.target.closest('.sfhl-row'); if (!r) return;
    dragSrcId = r.dataset.ruleId; dragSrcFolder = r.dataset.folderId || null;
    r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragSrcId);
  });
  listEl.addEventListener('dragend', e => {
    const r = e.target.closest('.sfhl-row'); if (r) r.classList.remove('dragging');
    listEl.querySelectorAll('.drag-over-top,.drag-over-bot,.drag-over-folder').forEach(el => el.classList.remove('drag-over-top','drag-over-bot','drag-over-folder'));
    dragSrcId = null; dragSrcFolder = null;
  });
  listEl.addEventListener('dragover', e => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    listEl.querySelectorAll('.drag-over-top,.drag-over-bot,.drag-over-folder').forEach(el => el.classList.remove('drag-over-top','drag-over-bot','drag-over-folder'));
    const fhdr = e.target.closest('.sfhl-folder-hdr');
    if (fhdr) { fhdr.classList.add('drag-over-folder'); return; }
    const ub = e.target.closest('.sfhl-ungrouped-body,.sfhl-ungrouped-hdr');
    if (ub && !e.target.closest('.sfhl-row')) { listEl.querySelector('.sfhl-ungrouped-body')?.classList.add('drag-over-folder'); return; }
    const r = e.target.closest('.sfhl-row'); if (!r || r.dataset.ruleId === dragSrcId) return;
    const rect = r.getBoundingClientRect(); r.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bot');
  });
  listEl.addEventListener('drop', e => {
    e.preventDefault();
    listEl.querySelectorAll('.drag-over-top,.drag-over-bot,.drag-over-folder').forEach(el => el.classList.remove('drag-over-top','drag-over-bot','drag-over-folder'));
    if (!dragSrcId) return;
    const srcItem = RULES.find(x => x.id === dragSrcId); if (!srcItem) return;
    // Drop on folder header → in diesen Ordner verschieben
    const fhdr = e.target.closest('.sfhl-folder-hdr');
    if (fhdr && !e.target.closest('.sfhl-folder-del')) {
      srcItem.folder = fhdr.dataset.folderId || null; saveRules(); renderRules(); rescanSoon(true); toast('In Ordner verschoben', 'info'); return;
    }
    // Drop on ungrouped area → aus Ordner entfernen
    const ub = e.target.closest('.sfhl-ungrouped-body,.sfhl-ungrouped-hdr');
    if (ub && !e.target.closest('.sfhl-row')) {
      srcItem.folder = null; saveRules(); renderRules(); rescanSoon(true); toast('Aus Ordner entfernt', 'info'); return;
    }
    // Drop on rule row → reorder + ggf. Ordner wechseln
    const r = e.target.closest('.sfhl-row'); if (!r) return;
    const tid = r.dataset.ruleId; if (dragSrcId === tid) return;
    const si = RULES.findIndex(x => x.id === dragSrcId), ti = RULES.findIndex(x => x.id === tid);
    if (si < 0 || ti < 0) return;
    srcItem.folder = RULES[ti].folder || null; // Ordner des Ziels uebernehmen
    const [m] = RULES.splice(si, 1);
    const newTi = RULES.findIndex(x => x.id === tid);
    const rect = r.getBoundingClientRect();
    RULES.splice(e.clientY < rect.top + rect.height / 2 ? newTi : newTi + 1, 0, m);
    saveRules(); renderRules(); rescanSoon(true); toast('Reihenfolge ge\u00e4ndert', 'info');
  });
  renderRules();

  // Ordner-Erstellen Button
  $('.sfhl-folder-add-btn').onclick = () => {
    const name = prompt('Ordnername:');
    if (!name || !name.trim()) return;
    FOLDERS.push({ id: uid(), name: name.trim() });
    saveFolders(); renderRules(); toast('Ordner erstellt', 'success');
  };

  // ===== Snippets Tab =====
  let snipSearchTerm = '', editingSnipId = null;
  snipSearch.addEventListener('input', () => { snipSearchTerm = snipSearch.value.toLowerCase().trim(); renderSnippets(); });

  function renderSnippets() {
    // DocumentFragment für bessere Performance (#24)
    const frag = document.createDocumentFragment();
    const prefix = loadPrefix();
    // Suche auch nach Kategorie (#12)
    const filtered = snipSearchTerm
      ? SNIPPETS.filter(s => norm(s.trigger).includes(snipSearchTerm) || norm(s.label).includes(snipSearchTerm) || norm(s.category).includes(snipSearchTerm) || norm(s.body).includes(snipSearchTerm))
      : SNIPPETS;

    // Recently Used (#15)
    const recentIds = loadRecent().filter(id => SNIPPETS.some(s => s.id === id));
    if (recentIds.length > 0 && !snipSearchTerm) {
      const rh = document.createElement('div');
      rh.className = 'sfhl-recent-hdr';
      rh.innerHTML = '⏱ Zuletzt verwendet';
      frag.appendChild(rh);
      const rb2 = document.createElement('div'); rb2.className = 'sfhl-cat-body';
      for (const id of recentIds.slice(0,5)) {
        const snip = SNIPPETS.find(s => s.id === id); if (!snip) continue;
        rb2.appendChild(makeSnipRow(snip, prefix));
      }
      frag.appendChild(rb2);
    }

    // Kategorien gruppieren
    const catMap = new Map();
    for (const snip of filtered) {
      const cat = snip.category || '(Keine Kategorie)';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat).push(snip);
    }
    // Favoriten-Kategorie immer zuerst
    const favSnips = filtered.filter(s => s.favorite);
    if (favSnips.length > 0) { catMap.set('★ Favoriten', favSnips); }
    const cats = [...catMap.keys()].sort((a, b) => {
      if (a === '★ Favoriten') return -1;
      if (b === '★ Favoriten') return 1;
      if (a === '(Keine Kategorie)') return 1;
      if (b === '(Keine Kategorie)') return -1;
      return a.localeCompare(b, 'de');
    });

    for (const cat of cats) {
      const snips = catMap.get(cat);
      const isCollapsed = collapsedSnipCats.has(cat);
      const ch = document.createElement('div');
      ch.className = 'sfhl-cat-hdr' + (isCollapsed ? ' collapsed' : '');
      ch.dataset.cat = cat;
      // Kategorie-Name doppelklickbar zum Umbenennen (#7)
      ch.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg><span class="sfhl-cat-name" title="Doppelklick zum Umbenennen">${escH(cat)}</span><span class="sfhl-cat-count">${snips.length}</span>`;
      frag.appendChild(ch);
      const cb = document.createElement('div');
      cb.className = 'sfhl-cat-body' + (isCollapsed ? ' collapsed' : '');
      for (const snip of snips) cb.appendChild(makeSnipRow(snip, prefix));
      frag.appendChild(cb);
    }
    snipListEl.innerHTML = '';
    snipListEl.appendChild(frag);
    updateBadges();
    updateCatDatalist();
    updateSnipInsertDropdown();
  }

  // Snippet-Zeile bauen — ausgelagert für DocumentFragment + D&D
  function makeSnipRow(snip, prefix) {
    const row = document.createElement('div');
    row.className = 'sfhl-snip-row';
    row.dataset.snipId = snip.id;
    row.draggable = true; // D&D (#9)
    // HTML-bereinigte Vorschau (#13): Tags entfernen, echten Text zeigen
    const plainPrev = htmlToPlain(snip.body).replace(/\n/g,' ').slice(0,80);

    row.innerHTML = `<div class="sfhl-snip-row-top"><span class="sfhl-snip-grip" title="Ziehen zum Sortieren"><svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg></span><span class="sfhl-snip-trigger">${escH(prefix+snip.trigger)}</span><span class="sfhl-snip-label">${escH(snip.label)}</span><span style="font-size:9px;color:#9ca3af;flex-shrink:0">${snip.usageCount>0?snip.usageCount+'×':''}</span><span class="sfhl-snip-copy" data-copy-id="${snip.id}" title="Kopieren"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span><span class="sfhl-fav${snip.favorite?' on':''}" data-fav-id="${snip.id}" title="Favorit">★</span></div><div class="sfhl-snip-preview">${escH(plainPrev)}${plainPrev.length>=80?'\u2026':''}</div>`;
    return row;
  }

  // Kategorie-Datalist befüllen (für Editor-Dropdown)
  function updateCatDatalist() {
    const dl = document.getElementById('sfhl-cat-list'); if (!dl) return;
    const cats = [...new Set(SNIPPETS.map(s => s.category).filter(Boolean))].sort((a,b) => a.localeCompare(b,'de'));
    dl.innerHTML = cats.map(cat => `<option value="${escH(cat)}">`).join('');
  }

  // Snippet-Einfügen-Dropdown im RTE-Toolbar befüllen
  function updateSnipInsertDropdown() {
    const sel = snipEditor.querySelector('.sfhl-rtb-snip-insert'); if (!sel) return;
    const prefix = loadPrefix();
    sel.innerHTML = '<option value="">+ Vorlage</option>' +
      SNIPPETS.map(s => `<option value="${escH(s.id)}">${escH(prefix+s.trigger)} — ${escH(s.label)}</option>`).join('');
  }

  // Click snippet row or category header -> open editor
  snipListEl.addEventListener('click', e => {
    if (e.target.closest('.sfhl-snip-grip')) return; // Grip = nur D&D, kein Editor öffnen
    const ch = e.target.closest('.sfhl-cat-hdr');
    if (ch) {
      const cat = ch.dataset.cat; const body = ch.nextElementSibling;
      if (collapsedSnipCats.has(cat)) { collapsedSnipCats.delete(cat); ch.classList.remove('collapsed'); if (body) body.classList.remove('collapsed'); }
      else { collapsedSnipCats.add(cat); ch.classList.add('collapsed'); if (body) body.classList.add('collapsed'); }
      return;
    }
    // Clipboard-Copy
    const copyBtn = e.target.closest('.sfhl-snip-copy');
    if (copyBtn) {
      e.stopPropagation();
      const snip = SNIPPETS.find(s => s.id === copyBtn.dataset.copyId); if (!snip) return;
      let resolved = resolvePlaceholders(snip.body);
      const plain = htmlToPlain(resolveLinks(resolved, false)).replace(/\{[|]?\}/g, '');
      navigator.clipboard.writeText(plain).then(
        () => toast('In Zwischenablage kopiert', 'success', 1800),
        () => toast('Kopieren fehlgeschlagen', 'error')
      );
      return;
    }
    // Stern-Toggle (Favorit)
    const favBtn = e.target.closest('.sfhl-fav');
    if (favBtn) {
      e.stopPropagation();
      const snip = SNIPPETS.find(s => s.id === favBtn.dataset.favId); if (!snip) return;
      snip.favorite = !snip.favorite;
      saveSnippets(); renderSnippets();
      toast(snip.favorite ? '★ Favorit gesetzt' : 'Favorit entfernt', 'info', 1500);
      return;
    }
    const row = e.target.closest('.sfhl-snip-row'); if (!row) return;
    const snip = SNIPPETS.find(s => s.id === row.dataset.snipId); if (!snip) return;
    openSnipEditor(snip);
  });

  // Kategorie umbenennen per Doppelklick (#7)
  snipListEl.addEventListener('dblclick', e => {
    const nameEl = e.target.closest('.sfhl-cat-name');
    if (!nameEl) return;
    const ch = nameEl.closest('.sfhl-cat-hdr'); if (!ch) return;
    const oldCat = ch.dataset.cat;
    if (oldCat === '★ Favoriten' || oldCat === '(Keine Kategorie)') return;
    const newCat = prompt('Kategorie umbenennen:', oldCat);
    if (!newCat || !newCat.trim() || newCat.trim() === oldCat) return;
    SNIPPETS.forEach(s => { if (s.category === oldCat) s.category = newCat.trim(); });
    if (collapsedSnipCats.has(oldCat)) { collapsedSnipCats.delete(oldCat); collapsedSnipCats.add(newCat.trim()); }
    saveSnippets(); renderSnippets(); toast('Kategorie umbenannt', 'success');
  });

  // Snippets Drag & Drop (#9)
  let _snipDragId = null;
  snipListEl.addEventListener('dragstart', e => {
    const row = e.target.closest('.sfhl-snip-row'); if (!row) return;
    _snipDragId = row.dataset.snipId;
    row.classList.add('sfhl-sn-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', _snipDragId);
  });
  snipListEl.addEventListener('dragend', e => {
    snipListEl.querySelectorAll('.sfhl-sn-dragging,.sfhl-sn-over-top,.sfhl-sn-over-bot').forEach(el => el.classList.remove('sfhl-sn-dragging','sfhl-sn-over-top','sfhl-sn-over-bot'));
    _snipDragId = null;
  });
  snipListEl.addEventListener('dragover', e => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    snipListEl.querySelectorAll('.sfhl-sn-over-top,.sfhl-sn-over-bot').forEach(el => el.classList.remove('sfhl-sn-over-top','sfhl-sn-over-bot'));
    const row = e.target.closest('.sfhl-snip-row'); if (!row || row.dataset.snipId === _snipDragId) return;
    const rect = row.getBoundingClientRect();
    row.classList.add(e.clientY < rect.top + rect.height / 2 ? 'sfhl-sn-over-top' : 'sfhl-sn-over-bot');
  });
  snipListEl.addEventListener('drop', e => {
    e.preventDefault();
    snipListEl.querySelectorAll('.sfhl-sn-over-top,.sfhl-sn-over-bot').forEach(el => el.classList.remove('sfhl-sn-over-top','sfhl-sn-over-bot'));
    if (!_snipDragId) return;
    const tRow = e.target.closest('.sfhl-snip-row'); if (!tRow || tRow.dataset.snipId === _snipDragId) return;
    const si = SNIPPETS.findIndex(s => s.id === _snipDragId);
    const ti = SNIPPETS.findIndex(s => s.id === tRow.dataset.snipId);
    if (si < 0 || ti < 0) return;
    const [moved] = SNIPPETS.splice(si, 1);
    const newTi = SNIPPETS.findIndex(s => s.id === tRow.dataset.snipId);
    const rect = tRow.getBoundingClientRect();
    SNIPPETS.splice(e.clientY < rect.top + rect.height / 2 ? newTi : newTi + 1, 0, moved);
    saveSnippets(); renderSnippets(); toast('Reihenfolge geändert', 'info');
  });

  // Add snippet
  $('.sfhl-snip-add-toggle').onclick = () => {
    openSnipEditor(null); // null = add mode
  };

  function rteToggle(isRich) {
    // Editor ist jetzt immer sichtbar (contenteditable für beide Modi).
    // richText-Checkbox steuert nur ob HTML oder Plaintext gespeichert/eingefügt wird.
    // Kein visueller Unterschied — nur das Speicherformat ändert sich.
  }

  let _editorLang = 'de'; // aktuell aktive Sprache im Editor (#34)

  function openSnipEditor(snip) {
    editingSnipId = snip ? snip.id : null;
    _editorLang = 'de';
    snipEditor.dataset.mode = snip ? 'edit' : 'add';
    $('.sfhl-ed-trigger').value = snip ? snip.trigger : '';
    $('.sfhl-ed-label').value = snip ? snip.label : '';
    $('.sfhl-ed-category').value = snip ? snip.category : '';
    const rb = $('.sfhl-rte-body');
    if (snip) {
      rb.innerHTML = snip.richText ? snip.body : escH(snip.body).replace(/\n/g,'<br>');
    } else {
      rb.innerHTML = '';
    }
    // Sprach-Tabs zurücksetzen (#34)
    snipEditor.querySelectorAll('.sfhl-lang-tab').forEach(t => t.classList.toggle('active', t.dataset.lang === 'de'));
    $('.sfhl-ed-delete').style.display = snip ? 'block' : 'none';
    $('.sfhl-ed-duplicate').style.display = snip ? 'block' : 'none';
    $('.sfhl-ed-share').style.display = snip ? 'block' : 'none';
    snipEditor.classList.add('vis');
    panel.querySelector('[data-tab="snippets"] .sfhl-add-bar').style.display = 'none';
    updateSnipInsertDropdown();
    setTimeout(() => { $('.sfhl-ed-trigger').focus(); updateCounter(); }, 50);
  }

  // Sprach-Tab wechseln (#34)
  snipEditor.addEventListener('click', e => {
    const lt = e.target.closest('.sfhl-lang-tab'); if (!lt) return;
    const lang = lt.dataset.lang;
    if (lang === _editorLang) return;
    // Aktuellen Inhalt im Snippet speichern (in memory, nicht persistieren)
    const rb = $('.sfhl-rte-body');
    if (editingSnipId) {
      const snip = SNIPPETS.find(s => s.id === editingSnipId);
      if (snip) {
        if (_editorLang === 'de') snip.body = rb.innerHTML;
        else snip.bodyEn = rb.innerHTML;
      }
    }
    _editorLang = lang;
    snipEditor.querySelectorAll('.sfhl-lang-tab').forEach(t => t.classList.toggle('active', t.dataset.lang === lang));
    if (editingSnipId) {
      const snip = SNIPPETS.find(s => s.id === editingSnipId);
      if (snip) rb.innerHTML = lang === 'de' ? (snip.body||'') : (snip.bodyEn||'');
    }
  });



  // Toolbar button handler
  snipEditor.addEventListener('mousedown', e => {
    const btn = e.target.closest('.sfhl-rtb'); if (!btn) return;
    e.preventDefault(); // don't lose editor focus
    const cmd = btn.dataset.cmd;
    if (cmd) { document.execCommand(cmd, false, null); return; }
    if (btn.classList.contains('sfhl-rtb-link')) {
      const url = prompt('URL eingeben:'); if (url) document.execCommand('createLink', false, url);
      return;
    }
    if (btn.classList.contains('sfhl-rtb-clear')) {
      document.execCommand('removeFormat', false, null);
      document.execCommand('unlink', false, null);
      return;
    }
    // Platzhalter-Picker (#43)
    if (btn.classList.contains('sfhl-rtb-placeholder')) {
      showPhPicker(btn); return;
    }
    // Markdown-Import (#44)
    if (btn.classList.contains('sfhl-rtb-markdown')) {
      const md = prompt('Markdown einfügen (wird in HTML konvertiert):');
      if (md) {
        const html = sanitizeHtml(markdownToHtml(md));
        document.execCommand('insertHTML', false, html);
      }
    }
  });

  // ===== Platzhalter-Picker (#43) =====
  const ALL_PLACEHOLDERS = [
    { code:'{name}', label:'Dein Name' },
    { code:'{datum}', label:'Heutiges Datum' },
    { code:'{uhrzeit}', label:'Aktuelle Uhrzeit' },
    { code:'{case}', label:'Vorgangsnummer' },
    { code:'{betreff}', label:'Betreff' },
    { code:'{anrede}', label:'Anrede (Herr/Frau)' },
    { code:'{nachname}', label:'Nachname Kontakt' },
    { code:'{kontakt}', label:'Voller Name Kontakt' },
    { code:'{telefon}', label:'Telefon' },
    { code:'{mobil}', label:'Mobil' },
    { code:'{kunde}', label:'Firmenname' },
    { code:'{firma}', label:'Account-Name' },
    { code:'{produkt}', label:'Gerätetyp' },
    { code:'{seriennummer}', label:'Seriennummer' },
    { code:'{arbeitsauftrag}', label:'Arbeitsauftrag-Nr.' },
    { code:'{vertrieb}', label:'Vertrieb ASP' },
    { code:'{kundennr}', label:'SAP-Kundennr.' },
    { code:'{strasse}', label:'Straße' },
    { code:'{ort}', label:'Ort' },
    { code:'{loesung}', label:'Lösungstext' },
    { code:'{|}', label:'Cursor-Position' },
    { code:'{eingabe:Bezeichnung}', label:'Eingabe-Variable (anpassen!)' },
    { code:'{!Case.CaseNumber}', label:'SF: Vorgangsnummer' },
    { code:'{!Case.Subject}', label:'SF: Betreff' },
    { code:'{!Contact.Salutation}', label:'SF: Anrede' },
    { code:'{!Contact.LastName}', label:'SF: Nachname' },
    { code:'{!Contact.Name}', label:'SF: Voller Name' },
    { code:'{!Contact.PhoneFormula__c}', label:'SF: Telefon' },
    { code:'{!Account.Name}', label:'SF: Firmenname' },
    { code:'{!Case.Work_Order__c}', label:'SF: Arbeitsauftrag' },
    { code:'{!Case.Serial_number__c}', label:'SF: Seriennummer' },
  ];

  function showPhPicker(btn) {
    if (phPicker.classList.contains('vis')) { phPicker.classList.remove('vis'); return; }
    // Werte aus Cache auflösen für Vorschau
    const resolved = resolvePlaceholders('{name}|{datum}|{case}|{nachname}|{kontakt}|{telefon}|{firma}|{seriennummer}');
    const vals = resolved.split('|');
    const valMap = { '{name}':vals[0], '{datum}':vals[1], '{case}':vals[2], '{nachname}':vals[3], '{kontakt}':vals[4], '{telefon}':vals[5], '{firma}':vals[6], '{seriennummer}':vals[7] };

    phPicker.innerHTML = '<div class="sfhl-ph-hdr">Platzhalter wählen — Klick zum Einfügen</div>' +
      ALL_PLACEHOLDERS.map(p => {
        const val = valMap[p.code] || (p.code.startsWith('{!') ? '(API)' : '');
        return `<div class="sfhl-ph-item" data-code="${escH(p.code)}"><span class="sfhl-ph-code">${escH(p.code)}</span><span class="sfhl-ph-val" title="${escH(val)}">${escH(p.label)}${val && val !== p.code ? ' → '+escH(val) : ''}</span></div>`;
      }).join('');

    const rect = btn.getBoundingClientRect();
    let top = rect.bottom + 4, left = rect.left;
    if (left + 300 > window.innerWidth) left = window.innerWidth - 310;
    if (top + 320 > window.innerHeight) top = rect.top - 325;
    phPicker.style.top = top + 'px'; phPicker.style.left = left + 'px';
    phPicker.classList.add('vis');
  }

  phPicker.addEventListener('click', e => {
    const item = e.target.closest('.sfhl-ph-item'); if (!item) return;
    const code = item.dataset.code;
    const rb = $('.sfhl-rte-body'); rb.focus();
    document.execCommand('insertText', false, code);
    phPicker.classList.remove('vis');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.sfhl-ph-picker') && !e.target.closest('.sfhl-rtb-placeholder')) {
      phPicker.classList.remove('vis');
    }
  });

  // ===== Markdown-Import (#44) =====
  function markdownToHtml(md) {
    return md
      // Überschriften → Fett+Zeilenumbruch (kein h1/h2 da nicht in whitelist)
      .replace(/^#{1,3} (.+)$/gm, '<b>$1</b>')
      // Fett **text** oder __text__
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<b>$1</b>')
      // Kursiv *text* oder _text_
      .replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/_([^_]+)_/g, '<i>$1</i>')
      // Code `text` → monospace span
      .replace(/`([^`]+)`/g, '<span style="font-family:monospace;background:#f3f4f6;padding:0 2px;border-radius:2px">$1</span>')
      // Links [text](url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      // Ungeordnete Listen
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      // Geordnete Listen 1. 2.
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      // Horizontale Linie
      .replace(/^---+$/gm, '<hr>')
      // Zeilenumbrüche
      .replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  }

  // ===== Zeichen- & Wortzähler =====
  function updateCounter() {
    const rb = $('.sfhl-rte-body');
    const counterEl = snipEditor.querySelector('.sfhl-counter');
    if (!rb || !counterEl) return;
    const plain = htmlToPlain(rb.innerHTML);
    const chars = plain.length;
    const words = plain.trim() ? plain.trim().split(/\s+/).length : 0;
    const warnClass = chars > 2000 ? 'warn' : '';
    counterEl.innerHTML = `<span class="${warnClass}">${chars} Zeichen</span> · ${words} Wörter`;
  }

  // ===== Sprachprüfung umschalten =====
  snipEditor.addEventListener('click', e => {
    const sp = e.target.closest('.sfhl-spell-lang'); if (!sp) return;
    const rb = $('.sfhl-rte-body');
    const cur = sp.dataset.lang || 'de';
    const next = cur === 'de' ? 'en' : cur === 'en' ? 'de-CH' : 'de';
    const labels = { 'de':'DE', 'en':'EN', 'de-CH':'DE-CH' };
    sp.dataset.lang = next;
    sp.textContent = `🔤 Sprachprüfung: ${labels[next]}`;
    if (rb) rb.setAttribute('lang', next);
  });

  // Update toolbar active states
  $('.sfhl-rte-body').addEventListener('keyup', () => { updateRtbState(); updateCounter(); });
  $('.sfhl-rte-body').addEventListener('mouseup', updateRtbState);
  $('.sfhl-rte-body').addEventListener('input', updateCounter);
  // Paste-Handler: reinigt eingefügten Text von überflüssigen Zeilenumbrüchen
  $('.sfhl-rte-body').addEventListener('paste', e => {
    e.preventDefault();
    let html = e.clipboardData.getData('text/html');
    if (html) {
      // Überflüssige leere Absätze und mehrfache <br> reduzieren
      html = html
        .replace(/<p[^>]*>\s*<\/p>/gi, '')
        .replace(/<div[^>]*>\s*<\/div>/gi, '')
        .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
        .replace(/\n{3,}/g, '\n\n');
      html = sanitizeHtml(html);
      document.execCommand('insertHTML', false, html);
    } else {
      const text = e.clipboardData.getData('text/plain');
      if (text) {
        // Plaintext: einzelne Zeilenumbrüche → <br>, doppelte → Absatz
        const cleaned = escH(text).replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').replace(/\n/g,'<br>');
        document.execCommand('insertHTML', false, cleaned);
      }
    }
    updateCounter();
  });
  function updateRtbState() {
    snipEditor.querySelectorAll('.sfhl-rtb[data-cmd]').forEach(btn => {
      try { btn.classList.toggle('active', document.queryCommandState(btn.dataset.cmd)); } catch {}
    });
  }

  // Vorlage in RTE-Editor einfügen
  snipEditor.querySelector('.sfhl-rtb-snip-insert').addEventListener('change', function() {
    const id = this.value; this.value = ''; if (!id) return;
    const snip = SNIPPETS.find(s => s.id === id); if (!snip) return;
    const resolved = resolvePlaceholders(snip.body);
    const rb = $('.sfhl-rte-body'); rb.focus();
    if (snip.richText) {
      let html = resolveLinks(resolved, true);
      html = sanitizeHtml(html.replace(/\n/g, '<br>')).replace('{|}','');
      document.execCommand('insertHTML', false, html);
    } else {
      document.execCommand('insertText', false, resolveLinks(resolved, false).replace('{|}',''));
    }
  });

  $('.sfhl-ed-cancel').onclick = () => {
    snipEditor.classList.remove('vis');
    panel.querySelector('[data-tab="snippets"] .sfhl-add-bar').style.display = 'flex';
    editingSnipId = null;
  };

  $('.sfhl-ed-save').onclick = () => {
    const trigger = ($('.sfhl-ed-trigger').value||'').trim().replace(/^[;/:!@]+/,''); // strip prefix chars
    if (!trigger) { $('.sfhl-ed-trigger').focus(); return; }
    const rb = $('.sfhl-rte-body');
    const bodyVal = rb.innerHTML || '';
    const existingSnip = editingSnipId ? SNIPPETS.find(s => s.id === editingSnipId) : null;
    // Wenn gerade EN aktiv: EN-Body lesen, DE-Body aus snip.body
    const isEditingEn = _editorLang === 'en';
    const deBody = isEditingEn ? (existingSnip?.body||'') : bodyVal;
    const enBody = isEditingEn ? bodyVal : (existingSnip?.bodyEn||'');
    const data = { trigger, label: $('.sfhl-ed-label').value.trim() || trigger, body: deBody, bodyEn: enBody, richText: true, category: $('.sfhl-ed-category').value.trim(), favorite: existingSnip ? !!existingSnip.favorite : false, usageCount: existingSnip ? (existingSnip.usageCount||0) : 0 };
    if (editingSnipId) {
      const snip = SNIPPETS.find(s => s.id === editingSnipId);
      if (snip) Object.assign(snip, data);
    } else {
      SNIPPETS.push({ id: uid(), ...data });
    }
    saveSnippets(); renderSnippets();
    snipEditor.classList.remove('vis');
    panel.querySelector('[data-tab="snippets"] .sfhl-add-bar').style.display = 'flex';
    editingSnipId = null;
    toast(editingSnipId ? 'Snippet aktualisiert' : 'Snippet erstellt', 'success');
  };

  $('.sfhl-ed-delete').onclick = () => {
    if (!editingSnipId) return;
    const snip = SNIPPETS.find(s => s.id === editingSnipId);
    if (!confirm(`Snippet "${snip?.label||editingSnipId}" wirklich löschen?`)) return;
    SNIPPETS = SNIPPETS.filter(s => s.id !== editingSnipId);
    saveSnippets(); renderSnippets();
    snipEditor.classList.remove('vis');
    panel.querySelector('[data-tab="snippets"] .sfhl-add-bar').style.display = 'flex';
    editingSnipId = null;
    toast('Snippet gel\u00f6scht', 'info');
  };

  // Snippet duplizieren (#8)
  $('.sfhl-ed-duplicate').onclick = () => {
    if (!editingSnipId) return;
    const orig = SNIPPETS.find(s => s.id === editingSnipId); if (!orig) return;
    const rb = $('.sfhl-rte-body');
    const copy = { ...orig, id: uid(), trigger: orig.trigger + '2', label: orig.label + ' (Kopie)',
      body: _editorLang === 'de' ? rb.innerHTML : orig.body,
      bodyEn: _editorLang === 'en' ? rb.innerHTML : (orig.bodyEn||''),
      favorite: false, usageCount: 0 };
    SNIPPETS.push(copy);
    saveSnippets(); renderSnippets();
    openSnipEditor(copy);
    toast('Kopie erstellt', 'success');
  };

  // Snippet teilen via URL (#35)
  $('.sfhl-ed-share').onclick = () => {
    if (!editingSnipId) return;
    const snip = SNIPPETS.find(s => s.id === editingSnipId); if (!snip) return;
    try {
      const data = { trigger: snip.trigger, label: snip.label, body: snip.body, bodyEn: snip.bodyEn||'', category: snip.category };
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
      const url = location.origin + location.pathname + '#sfhl-share=' + encoded;
      navigator.clipboard.writeText(url).then(() => toast('Link kopiert! Kollege kann ihn in SF öffnen.', 'success', 4000));
    } catch { toast('Teilen fehlgeschlagen', 'error'); }
  };

  // Beim Seitenstart: Import-Link prüfen (#35)
  (function checkShareUrl() {
    const hash = location.hash;
    if (!hash.startsWith('#sfhl-share=')) return;
    try {
      const encoded = hash.replace('#sfhl-share=', '');
      const data = JSON.parse(decodeURIComponent(escape(atob(encoded))));
      if (!data.trigger) return;
      history.replaceState(null, '', location.pathname + location.search); // Hash entfernen
      setTimeout(() => {
        const validated = sanitizeSnippetImport(data);
        if (!validated) return;
        if (confirm(`Snippet "${escH(validated.label)}" (;;${escH(validated.trigger)}) importieren?`)) {
          const existing = SNIPPETS.find(s => s.trigger === validated.trigger);
          if (existing) { Object.assign(existing, validated); }
          else { SNIPPETS.push({ id: uid(), ...validated, favorite: false, usageCount: 0 }); }
          saveSnippets(); renderSnippets();
          toast(`Snippet "${validated.label}" importiert!`, 'success', 4000);
        }
      }, 800);
    } catch {}
  })();

  // Settings
  setPrefix.onchange = () => { savePrefix(setPrefix.value); renderSnippets(); updateWrapDropdowns(); };
  setUname.onchange = () => saveUname(setUname.value);
  setLang.onchange = () => {
    saveDefaultLang(setLang.value);
    applyTranslations();
    toast('Default language: ' + (setLang.value==='en'?'English':'Deutsch'), 'info');
  };
  wrapCb.onchange = () => { saveWrapOn(wrapCb.checked); toast(wrapCb.checked ? 'Auto-Wrap an' : 'Auto-Wrap aus', 'info'); };
  wrapAnrSel.onchange = () => saveWrapAnrede(wrapAnrSel.value);
  wrapSigSel.onchange = () => saveWrapSignatur(wrapSigSel.value);

  renderSnippets();
  updateWrapDropdowns();

  // ===== Snippet Trigger Engine =====
  let ddSelectedIdx = -1;

  function closeDropdown() { dropdown.classList.remove('vis'); ddSelectedIdx = -1; }

  function getCaretCoords(el) {
    try {
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        const rect = el.getBoundingClientRect();
        return { top: rect.bottom + 4, left: rect.left + 20 };
      }
      // iframe-Offset: Koordinaten aus iframe-Viewport → äußeres Fenster umrechnen
      let iframeOffset = { top: 0, left: 0 };
      if (el.ownerDocument !== document) {
        try {
          // Das iframe-Element im äußeren DOM finden und seinen Rect holen
          const iframeEl = el.ownerDocument.defaultView?.frameElement;
          if (iframeEl) {
            const fr = iframeEl.getBoundingClientRect();
            iframeOffset = { top: fr.top, left: fr.left };
          }
        } catch {}
      }
      const elWin = el.ownerDocument?.defaultView || window;
      const sel = elWin.getSelection ? elWin.getSelection() : window.getSelection();
      if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0).getClientRects();
        if (r.length) return {
          top:  r[0].bottom + iframeOffset.top  + 4,
          left: r[0].left   + iframeOffset.left
        };
      }
      const rect = el.getBoundingClientRect();
      return {
        top:  rect.bottom + iframeOffset.top  + 4,
        left: rect.left   + iframeOffset.left + 20
      };
    } catch { return { top: 200, left: 200 }; }
  }

  function getTriggerText(el) {
    const prefix = loadPrefix();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const val = el.value, pos = el.selectionStart;
      const before = val.slice(0, pos);
      const idx = before.lastIndexOf(prefix);
      if (idx < 0) return null;
      const afterPrefix = before.slice(idx + prefix.length);
      if (/\s/.test(afterPrefix)) return null;
      return { text: afterPrefix, start: idx, end: pos, type: 'plain' };
    }
    // contenteditable / Shadow DOM / SF Email (TinyMCE iframe)
    // Fuer iframe-Elemente: el.ownerDocument.defaultView.getSelection() noetig,
    // da window.getSelection() nur die Selektion im aeusseren Fenster zeigt.
    const elWin = el.ownerDocument?.defaultView || window;
    const sel = elWin.getSelection ? elWin.getSelection() : window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    if (node.nodeType !== 3) {
      try {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const tn = walker.nextNode();
        if (!tn) return null;
        node = tn;
      } catch { return null; }
    }
    const val = node.textContent, pos = range.startOffset;
    const before = val.slice(0, pos);
    const idx = before.lastIndexOf(prefix);
    if (idx < 0) return null;
    const afterPrefix = before.slice(idx + prefix.length);
    if (/\s/.test(afterPrefix)) return null;
    return { text: afterPrefix, start: idx, end: pos, type: 'rich', node };
  }

  function insertSnippet(el, triggerInfo, snippet) {
    // Sprache aus Dropdown oder Default
    const activeLang = dropdown._activeLang || loadDefaultLang();
    const bodyToInsert = (activeLang === 'en' && snippet.bodyEn) ? snippet.bodyEn : snippet.body;
    // Usage tracken (#15)
    snippet.usageCount = (snippet.usageCount||0) + 1;
    addRecent(snippet.id);
    saveSnippets();

    // Auto-Wrap: Anrede + Body + Signatur (wenn aktiviert und Snippet nicht selbst Anrede/Sig ist)
    let fullBody = bodyToInsert;
    const wrapOn = loadWrapOn();
    const wrapAnr = loadWrapAnrede();
    const wrapSig = loadWrapSignatur();
    const isAnrede = snippet.trigger === wrapAnr;
    const isSignatur = snippet.trigger === wrapSig;
    if (wrapOn && !isAnrede && !isSignatur) {
      const anrSnip = SNIPPETS.find(s => s.trigger === wrapAnr);
      const sigSnip = SNIPPETS.find(s => s.trigger === wrapSig);
      const anrBody = anrSnip ? ((activeLang === 'en' && anrSnip.bodyEn) ? anrSnip.bodyEn : anrSnip.body) : '';
      const sigBody = sigSnip ? ((activeLang === 'en' && sigSnip.bodyEn) ? sigSnip.bodyEn : sigSnip.body) : '';
      if (anrBody) fullBody = anrBody + '<br><br>' + fullBody;
      if (sigBody) fullBody = fullBody + '<br><br>' + sigBody;
    }

    const resolved = resolvePlaceholders(fullBody);
    const cursorMarker = '{|}';
    const hasCursor = resolved.includes(cursorMarker);
    const prefix = loadPrefix();

    if (triggerInfo.type === 'plain') {
      const val = el.value;
      const before = val.slice(0, triggerInfo.start);
      const after = val.slice(triggerInfo.end);
      let insertText = resolveLinks(resolved, false).replace(cursorMarker, '');
      el.value = before + insertText + after;
      // Set cursor
      const cursorPos = hasCursor ? before.length + resolveLinks(resolved, false).indexOf(cursorMarker) : before.length + insertText.length;
      el.selectionStart = el.selectionEnd = Math.min(cursorPos, el.value.length);
      try { el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true })); } catch(e) {}
      try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch(e) {}
    } else {
      // contenteditable / Shadow DOM / SF Email-Composer
      el.focus();
      // Selektion setzen — iframe braucht el.ownerDocument.defaultView.getSelection()
      try {
        const elWin = el.ownerDocument?.defaultView || window;
        let sel = elWin.getSelection ? elWin.getSelection() : window.getSelection();
        if (sel) {
          const range = (el.ownerDocument || document).createRange();
          range.setStart(triggerInfo.node, triggerInfo.start);
          range.setEnd(triggerInfo.node, triggerInfo.end);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch(e) {}
      // execCommand auf dem richtigen Dokument
      const execDoc = el.ownerDocument || document;
      const inIframe = el.ownerDocument !== document;

      // Hilfsfunktion: Text mit Zeilenumbrüchen via insertText + insertLineBreak einfügen
      function insertLinesInto(lines) {
        try { execDoc.execCommand('insertText', false, lines[0] || ''); } catch {}
        for (let i = 1; i < lines.length; i++) {
          try { execDoc.execCommand('insertLineBreak'); } catch {
            try { execDoc.execCommand('insertParagraph'); } catch {}
          }
          if (lines[i]) try { execDoc.execCommand('insertText', false, lines[i]); } catch {}
        }
      }

      if (true) { // immer HTML-Einfüge-Pfad für contenteditable
        let html = resolveLinks(resolved, true);
        html = sanitizeHtml(html.replace(/\n/g, '<br>')).replace(cursorMarker, '');
        if (inIframe) {
          // TinyMCE: execCommand insertHTML
          try { execDoc.execCommand('insertHTML', false, html); } catch {}
        } else {
          // Reguläre SF-Felder: Formatierung via execCommand-Sequenz.
          // Aura akzeptiert bold/italic/insertText/insertLineBreak/createLink korrekt.
          // Selektion auf Trigger setzen → execCommand('delete') → HTML-Baum via execCmds einfügen.
          try {
            const elWin2 = el.ownerDocument.defaultView || window;
            const sel2 = elWin2.getSelection ? elWin2.getSelection() : window.getSelection();
            const range2 = el.ownerDocument.createRange();
            range2.setStart(triggerInfo.node, triggerInfo.start);
            range2.setEnd(triggerInfo.node, triggerInfo.end);
            if (sel2) { sel2.removeAllRanges(); sel2.addRange(range2); }
            execDoc.execCommand('delete'); // Trigger-Text löschen (Aura-konform)

            // HTML-Baum rekursiv via execCommands einfügen
            const tmpDiv2 = execDoc.createElement('div');
            tmpDiv2.innerHTML = html;
            // Sicherstellen: Formatierung ist am Start neutral
            ['bold','italic','underline','strikeThrough'].forEach(cmd => {
              try { if (execDoc.queryCommandState(cmd)) execDoc.execCommand(cmd); } catch {}
            });
            function walkNode(node) {
              if (node.nodeType === 3) {
                if (node.textContent) try { execDoc.execCommand('insertText', false, node.textContent); } catch {}
                return;
              }
              if (node.nodeType !== 1) return;
              const tag = node.tagName.toLowerCase();
              if (tag === 'br') {
                try { execDoc.execCommand('insertLineBreak'); } catch { try { execDoc.execCommand('insertParagraph'); } catch {} }
                return;
              }
              if (tag === 'p' || tag === 'div') {
                Array.from(node.childNodes).forEach(walkNode);
                if (node.nextSibling) try { execDoc.execCommand('insertLineBreak'); } catch {}
                return;
              }
              if (tag === 'li') {
                try { execDoc.execCommand('insertText', false, '\u2022 '); } catch {}
                Array.from(node.childNodes).forEach(walkNode);
                if (node.nextSibling) try { execDoc.execCommand('insertLineBreak'); } catch {}
                return;
              }
              if (tag === 'a') {
                const href = node.getAttribute('href');
                const txt = node.textContent;
                if (!txt) return;
                const s3 = sel2 || (elWin2.getSelection ? elWin2.getSelection() : null);
                try { execDoc.execCommand('insertText', false, txt); } catch {}
                if (href && s3 && s3.rangeCount > 0) {
                  try {
                    const r3 = s3.getRangeAt(0);
                    const r4 = execDoc.createRange();
                    r4.setStart(r3.endContainer, Math.max(0, r3.endOffset - txt.length));
                    r4.setEnd(r3.endContainer, r3.endOffset);
                    s3.removeAllRanges(); s3.addRange(r4);
                    execDoc.execCommand('createLink', false, href);
                    if (s3.rangeCount > 0) s3.collapseToEnd();
                  } catch {}
                }
                return;
              }
              const fmtMap = { b:'bold', strong:'bold', i:'italic', em:'italic', u:'underline', s:'strikeThrough', strike:'strikeThrough' };
              const cmd = fmtMap[tag];
              if (cmd) {
                const was = execDoc.queryCommandState(cmd);
                if (!was) try { execDoc.execCommand(cmd); } catch {}
                Array.from(node.childNodes).forEach(walkNode);
                if (!was) try { execDoc.execCommand(cmd); } catch {}
              } else {
                Array.from(node.childNodes).forEach(walkNode);
              }
            }
            Array.from(tmpDiv2.childNodes).forEach(walkNode);
          } catch {
            const plain = htmlToPlain(html);
            insertLinesInto(plain.split('\n'));
          }
        }
      }
    }
    closeDropdown();
  }

  function showDropdown(el, triggerInfo) {
    let query = triggerInfo.text.toLowerCase();
    // "en " als Sprach-Switch: zeigt nur Snippets mit EN-Variante, nutzt EN-Body
    let forceLang = null;
    if (query === 'en' || query.startsWith('en ') || query.startsWith('en:')) {
      forceLang = 'en';
      query = query.replace(/^en[\s:]*/, '');
    } else if (query === 'de' || query.startsWith('de ') || query.startsWith('de:')) {
      forceLang = 'de';
      query = query.replace(/^de[\s:]*/, '');
    }
    const activeLang = forceLang || loadDefaultLang();
    const matches = SNIPPETS
      .filter(s => {
        // Im EN-Modus nur Snippets mit EN-Variante
        if (forceLang === 'en' && !s.bodyEn) return false;
        return s.trigger.toLowerCase().startsWith(query) || s.label.toLowerCase().includes(query) || norm(s.category).includes(query);
      })
      .slice().sort((a, b) => {
        if (b.favorite !== a.favorite) return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
        return (b.usageCount||0) - (a.usageCount||0);
      });
    if (matches.length === 0) { closeDropdown(); return; }

    const prefix = loadPrefix();
    dropdown.innerHTML = matches.map((s, i) => {
      const bodyToShow = (activeLang === 'en' && s.bodyEn) ? s.bodyEn : s.body;
      const preview = htmlToPlain(bodyToShow).replace(/\n/g,' ').slice(0,70);
      const favBadge = s.favorite ? '<span style="color:#f59e0b;margin-left:2px">\u2605</span>' : '';
      const safeLang = escH((['de','en'].includes(activeLang) ? activeLang : 'de').toUpperCase());
      const langBadge = s.bodyEn ? `<span style="font-size:9px;background:${activeLang==='en'?'#dbeafe':'#f3f4f6'};color:${activeLang==='en'?'#1d4ed8':'#6b7280'};padding:0 4px;border-radius:3px;margin-left:4px">${safeLang}</span>` : '';
      return `<div class="sfhl-dd-item${i===0?' selected':''}" data-snip-id="${s.id}"><div class="sfhl-dd-item-top"><span class="sfhl-dd-trigger">${escH(prefix+s.trigger)}</span><span class="sfhl-dd-label">${escH(s.label)}${favBadge}${langBadge}</span><span class="sfhl-dd-cat">${escH(s.category)}</span></div><div class="sfhl-dd-preview">${escH(preview)}${preview.length>=70?'\u2026':''}</div></div>`;
    }).join('') + `<div class="sfhl-dd-hint"><span>${loadWrapOn()?'<span style="color:#10b981;font-weight:600">\u2713 Anrede+Signatur</span> \u2022 ':''}Enter = einf\u00fcgen \u2022 \u2191\u2193 = navigieren \u2022 Esc = schlie\u00dfen</span></div>`;

    const pos = getCaretCoords(el);
    let top = pos.top, left = pos.left;
    if (top + 250 > window.innerHeight) top = pos.top - 260;
    if (left + 300 > window.innerWidth) left = window.innerWidth - 310;
    dropdown.style.top = top + 'px';
    dropdown.style.left = left + 'px';
    dropdown.classList.add('vis');
    ddSelectedIdx = 0;

    dropdown._matches = matches;
    dropdown._el = el;
    dropdown._triggerInfo = triggerInfo;
    dropdown._activeLang = activeLang;
  }

  // Dropdown darf Editor-Fokus NICHT stehlen (sonst schlägt insertSnippet fehl)
  dropdown.addEventListener('mousedown', e => { e.preventDefault(); });

  // Click on dropdown item
  dropdown.addEventListener('click', e => {
    const item = e.target.closest('.sfhl-dd-item'); if (!item) return;
    const snip = SNIPPETS.find(s => s.id === item.dataset.snipId);
    if (snip && dropdown._el && dropdown._triggerInfo) insertSnippet(dropdown._el, dropdown._triggerInfo, snip);
  });

  // Dropdown schließen bei Klick irgendwo anders
  document.addEventListener('mousedown', e => {
    if (!dropdown.classList.contains('vis')) return;
    if (dropdown.contains(e.target)) return;
    closeDropdown();
  }, true);

  // Global input listener for trigger detection
  // WICHTIG: composedPath() muss SYNCHRON im Event-Handler aufgerufen werden —
  // nach debounce() ist der Event bereits fertig und composedPath() gibt [] zurück.
  // Daher: Element sofort ermitteln, dann debounced weiterverarbeiten.
  function findEditableEl(e) {
    // composedPath() synchron aufrufen (nur während Event-Dispatch gültig)
    const path = (e.composedPath ? e.composedPath() : null) || [e.target];
    for (const node of path) {
      if (!node || typeof node.tagName !== 'string') continue;
      if (panel.contains(node)) return null;
      if (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') return node;
      if (node.isContentEditable) return node;
      if (node.getAttribute?.('role') === 'textbox' || node.getAttribute?.('contenteditable') === 'true') return node;
    }
    return null;
  }

  // checkTrigger erhält das ELEMENT (nicht das Event) — composedPath ist da schon ausgewertet
  const checkTrigger = debounce((el) => {
    if (!el) return;
    const info = getTriggerText(el);
if (info) { showDropdown(el, info); } else { closeDropdown(); }
  }, 150);

  // Hilfsfunktion: editable Element aus InputEvent (synchron, ohne composedPath-Problem)
  function findEditableElFromTarget(target) {
    if (!target || typeof target.tagName !== 'string') return null;
    // Panel-Editor selbst ausschließen — dort soll kein Trigger laufen
    if (panel.contains(target)) return null;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return target;
    if (target.isContentEditable) return target;
    if (target.getAttribute?.('role') === 'textbox' || target.getAttribute?.('contenteditable') === 'true') return target;
    return null;
  }

  // Handler für input-Events (outer document + iframes)
  function onInputEvent(e) {
    // composedPath() synchron aufrufen — nach debounce wäre es leer
    const el = findEditableEl(e) || findEditableElFromTarget(e.target);
    if (el) {
      checkTrigger(el);
    } else if (dropdown.classList.contains('vis')) closeDropdown();
  }

  // Keyboard-Handler — muss auch in iframe-Dokumenten registriert werden
  function onKeydownEvent(e) {
    if (!dropdown.classList.contains('vis') || !dropdown._matches) return;
    const items = dropdown.querySelectorAll('.sfhl-dd-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); ddSelectedIdx = Math.min(ddSelectedIdx + 1, items.length - 1); items.forEach((it,i) => it.classList.toggle('selected', i === ddSelectedIdx)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ddSelectedIdx = Math.max(ddSelectedIdx - 1, 0); items.forEach((it,i) => it.classList.toggle('selected', i === ddSelectedIdx)); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      if (ddSelectedIdx >= 0 && ddSelectedIdx < dropdown._matches.length) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        insertSnippet(dropdown._el, dropdown._triggerInfo, dropdown._matches[ddSelectedIdx]);
      }
    }
    else if (e.key === 'Escape') { closeDropdown(); }
  }

  document.addEventListener('input',   onInputEvent,   true);
  document.addEventListener('keydown', onKeydownEvent, true);
  // Auch keyup abfangen für Fälle wo input-Event nicht feuert (manche SF-Editoren)
  document.addEventListener('keyup', e => {
    if (dropdown.classList.contains('vis')) return; // Schon offen, nicht nochmal triggern
    const el = findEditableElFromTarget(e.target);
    if (el && !panel.contains(el)) checkTrigger(el);
  }, true);

  // ===== iframe-Support für SF Email-Composer (TinyMCE) =====
  // TinyMCE wird innerhalb eines Shadow DOM erstellt → querySelectorAll + MutationObserver
  // durchdringen Shadow Roots NICHT. Lösung: rekursives Scanning + TinyMCE-API-Zugriff.
  const attachedIframeDocs = new WeakSet();

  function doAttachToDoc(doc, label) {
    if (!doc || attachedIframeDocs.has(doc) || doc === document) return false;
    try {
      if (!doc.body) return false; // noch nicht bereit
      attachedIframeDocs.add(doc);
      // input Event
      doc.addEventListener('input', (e) => {
        const path = (e.composedPath ? e.composedPath() : null) || [e.target];
        let el = null;
        for (const node of path) {
          if (!node || typeof node.tagName !== 'string') continue;
          if (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') { el = node; break; }
          if (node.isContentEditable) { el = node; break; }
          if (node.getAttribute?.('role') === 'textbox' || node.getAttribute?.('contenteditable') === 'true') { el = node; break; }
        }
        if (!el) el = findEditableElFromTarget(e.target);
        // Fallback: CKEditor rendert contenteditable direkt auf body
        if (!el && doc.body?.isContentEditable) el = doc.body;
        if (el) checkTrigger(el);
        else if (dropdown.classList.contains('vis')) closeDropdown();
      }, true);
      doc.addEventListener('keydown', onKeydownEvent, true);
      // CKEditor: body ist contenteditable → keyup-Fallback
      doc.addEventListener('keyup', (e) => {
        if (dropdown.classList.contains('vis')) return;
        let el = findEditableElFromTarget(e.target);
        if (!el && doc.body?.isContentEditable) el = doc.body;
        if (el) checkTrigger(el);
      }, true);
      return true;
    } catch { return false; }
  }

  function tryAttachIframe(iframe) {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      // Bessere Label-Erkennung: auch Shadow-DOM-Host identifizieren
      let label = iframe.id || iframe.name || iframe.src?.slice(0,40);
      if (!label) {
        const host = iframe.getRootNode?.()?.host;
        label = host ? `iframe-in-${host.tagName.toLowerCase()}` : 'anon-iframe';
      }
      // Ohne src kann contentDocument noch nicht bereit sein → retry
      if (!doc || !doc.body) {
        // load-Event abwarten
        iframe.addEventListener('load', () => {
          setTimeout(() => {
            const d = iframe.contentDocument || iframe.contentWindow?.document;
            if (d) doAttachToDoc(d, label);
          }, 100);
        }, { once: true });
        // Zusätzlich: polling für iframes ohne src die per JS befüllt werden
        let tries = 0;
        const pollId = setInterval(() => {
          tries++;
          const d = iframe.contentDocument || iframe.contentWindow?.document;
          if (d?.body) {
            clearInterval(pollId);
            doAttachToDoc(d, label);
          } else if (tries > 30) {
            clearInterval(pollId); // Aufgeben nach 15s
          }
        }, 500);
        return;
      }
      doAttachToDoc(doc, label);
    } catch(e) {}
  }

  // Rekursives Scanning inkl. Shadow Roots (durchdringt LWC/Aura Shadow DOM)
  function deepScanIframes(root) {
    try {
      if (!root) return;
      // Iframes in diesem Root
      (root.querySelectorAll ? Array.from(root.querySelectorAll('iframe')) : []).forEach(tryAttachIframe);
      // Shadow Roots rekursiv
      const all = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
      for (const el of all) {
        if (el.shadowRoot) deepScanIframes(el.shadowRoot);
      }
    } catch {}
  }

  // TinyMCE-API: direkter Zugriff auf Editor-Dokumente (zuverlässigste Methode)
  function tryAttachTinyMCE() {
    try {
      const tmc = window.tinymce;
      if (!tmc) return;
      const editors = tmc.editors || (tmc.activeEditor ? [tmc.activeEditor] : []);
      editors.forEach(ed => {
        try {
          const doc = ed.getDoc?.() || ed.contentDocument;
          if (doc) doAttachToDoc(doc, 'TinyMCE:' + (ed.id || 'editor'));
        } catch {}
      });
      // TinyMCE event: neuer Editor wird initialisiert
      if (!tmc._sfhlHooked) {
        tmc._sfhlHooked = true;
        tmc.on?.('AddEditor', (ev) => {
          setTimeout(() => {
            try {
              const doc = ev.editor?.getDoc?.();
              if (doc) doAttachToDoc(doc, 'TinyMCE-new:' + (ev.editor?.id || ''));
            } catch {}
          }, 200);
        });
      }
    } catch {}
  }

  // MutationObserver statt setInterval für iframe-Erkennung (#23)
  // Nur neue Elemente auslösen den Scan — kein permanentes Polling
  function periodicScan() {
    deepScanIframes(document);
    tryAttachTinyMCE();
    tryAttachCKEditor();
  }

  // CKEditor 4 (Aloha Page in Work Order Email) hooken
  function tryAttachCKEditor() {
    try {
      const CKE = window.CKEDITOR;
      if (!CKE || !CKE.instances) return;
      for (const key of Object.keys(CKE.instances)) {
        const editor = CKE.instances[key];
        if (!editor || editor._sfhlHooked) continue;
        editor._sfhlHooked = true;
        try {
          // Nach Editor-Ready: iframe-doc attachen
          const attach = () => {
            try {
              const editable = editor.editable?.();
              const doc = editable?.$?.ownerDocument || editor.document?.$;
              if (doc) doAttachToDoc(doc, 'CKEditor:' + editor.name);
            } catch {}
          };
          if (editor.status === 'ready') attach();
          else editor.on?.('instanceReady', attach);
        } catch {}
      }
      // Neue Editor-Instanzen hooken
      if (!CKE._sfhlGlobalHooked) {
        CKE._sfhlGlobalHooked = true;
        CKE.on?.('instanceReady', (ev) => {
          setTimeout(() => {
            try {
              const ed = ev.editor;
              const doc = ed.editable?.()?.$?.ownerDocument || ed.document?.$;
              if (doc) doAttachToDoc(doc, 'CKEditor-new:' + ed.name);
            } catch {}
          }, 100);
        });
      }
    } catch {}
  }
  periodicScan();
  // MutationObserver: neue Iframes/Shadow-Elemente/Editoren erkennen
  const _iframeObserver = new MutationObserver(muts => {
    let needsScan = false;
    for (const mu of muts) {
      for (const n of mu.addedNodes) {
        if (n instanceof Element && (
          n.tagName === 'IFRAME' || n.querySelector?.('iframe') || n.shadowRoot ||
          n.isContentEditable || n.querySelector?.('[contenteditable="true"]') ||
          n.classList?.contains('richtexteditor') || n.classList?.contains('cuf-richTextArea') ||
          n.querySelector?.('.richtexteditor, .cuf-richTextArea, [role="textbox"]')
        )) {
          needsScan = true; break;
        }
      }
      if (needsScan) break;
    }
    if (needsScan) periodicScan();
  });
  _iframeObserver.observe(document.documentElement, { childList: true, subtree: true });
  // TinyMCE + generelle Editor-Erkennung (Polling als Fallback)
  // ===== Highlighting =====
  const ROW_STRATEGIES = [
    {name:'css:lst-common',type:'css',sel:'lst-common-list-internal table tbody tr'},
    {name:'css:lst-manager',type:'css',sel:'lst-list-view-manager table tbody tr'},
    {name:'css:object-home',type:'css',sel:'lst-object-home table tbody tr'},
    {name:'xpath:short',type:'xpath',sel:'//lst-list-view-manager//table//tbody//tr'},
    {name:'xpath:fallback',type:'xpath',sel:'//lst-list-view-manager//div//tr | //lst-list-view-manager//tr'},
  ];
  let _lrs = '';
  function getRows() {
    for (const s of ROW_STRATEGIES) {
      try { let rows; if(s.type==='css'){rows=Array.from(document.querySelectorAll(s.sel));}else{const snap=document.evaluate(s.sel,document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);rows=[];for(let i=0;i<snap.snapshotLength;i++)rows.push(snap.snapshotItem(i));}
        rows = rows.filter(tr => tr.querySelector('td'));
        if(rows.length>0){_lrs=s.name;return rows;}
      } catch {} }
    return [];
  }
  const REFRESH_STRATEGIES = [
    {name:'css:title',type:'cf',sel:'lst-list-view-manager-button-bar lightning-button-icon button',filter:b=>/refresh|aktualisieren/i.test(b.title||b.getAttribute('aria-label')||'')},
    {name:'css:header',type:'cf',sel:'lst-list-view-manager-header lightning-button-icon button',filter:b=>/refresh|aktualisieren/i.test(b.title||b.getAttribute('aria-label')||'')},
    {name:'css:first',type:'css',sel:'lst-list-view-manager-button-bar lightning-button-icon:first-of-type button'},
    {name:'xpath:short',type:'xpath',sel:'//lst-list-view-manager-button-bar//lightning-button-icon//button'},
    {name:'xpath:legacy',type:'xpath',sel:"//*[@id='brandBand_1']/div/div/div/div/lst-object-home/div/lst-list-view-manager/lst-common-list-internal/lst-list-view-manager-header/div/div[2]/div[4]/lst-list-view-manager-button-bar/div/div[1]/lightning-button-icon/button"},
  ];
  let _lrfs = '';
  function getRefreshButton() {
    for(const s of REFRESH_STRATEGIES){try{let r=null;if(s.type==='css')r=document.querySelector(s.sel);else if(s.type==='cf')r=Array.from(document.querySelectorAll(s.sel)).find(s.filter)||null;else r=document.evaluate(s.sel,document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;if(r){_lrfs=s.name;return r;}}catch{}}
    return null;
  }
  // ===== Advanced Rule Matching (UND/NICHT/Regex) =====
  const _regexCache = new Map();
  function matchesSingleCondition(lowTxt, cond) {
    cond = cond.trim();
    if (!cond) return true;
    const isNot = cond.startsWith('!');
    if (isNot) cond = cond.slice(1).trim();
    if (!cond) return true;
    let result;
    const rxMatch = cond.match(/^\/(.+)\/([gimsuy]*)$/);
    if (rxMatch) {
      const key = rxMatch[1] + '/' + rxMatch[2];
      if (!_regexCache.has(key)) {
        try { _regexCache.set(key, new RegExp(rxMatch[1], rxMatch[2])); }
        catch { _regexCache.set(key, null); }
      }
      const rx = _regexCache.get(key);
      result = rx ? rx.test(lowTxt) : lowTxt.includes(norm(cond));
    } else {
      result = lowTxt.includes(norm(cond));
    }
    return isNot ? !result : result;
  }
  function matchesRule(txt, term) {
    if (!term) return false;
    const low = norm(txt);
    // OR hat niedrigere Priorität als AND: "A + B | C + D" = "(A AND B) OR (C AND D)"
    // Trennt bei " | " oder " OR " (case-insensitive, mit Leerzeichen)
    const orGroups = term.split(/\s*\|\s*|\s+OR\s+/i);
    return orGroups.some(group => {
      const andParts = group.split(/\s\+\s/);
      return andParts.every(part => matchesSingleCondition(low, part));
    });
  }
  function bestMatch(txt) { if(!txt)return null;for(const e of RULES){if(e.enabled&&e.term&&matchesRule(txt,e.term))return e;}return null; }
  function markRow(row,m) { row.classList.add('tm-sfhl-mark'); row.style.setProperty('--sfhl-bg',m.color,'important'); row.dataset.sfhlRule=m.id; }
  function unmarkRow(row) { row.classList.remove('tm-sfhl-mark','sfhl-new-match'); row.style.removeProperty('--sfhl-bg'); delete row.dataset.sfhlRule; }
  function updateHighlightCount() { const n=document.querySelectorAll('.tm-sfhl-mark').length;const c=triggerBtn.querySelector('.sfhl-count');if(c)c.textContent=n>0?`${n} markiert`:''; }
  function highlightRows(full=false) { const rows=getRows();if(rows.length===0)return false;for(const row of rows){if(full)unmarkRow(row);const cells=row.querySelectorAll('td');let txt='';for(const c of cells)txt+=' '+(c.innerText||c.textContent||'');const m=bestMatch(txt);if(m)markRow(row,m);else if(full)unmarkRow(row);}updateHighlightCount();return true; }
  function snapshotMarked() { const set=new Set();document.querySelectorAll('.tm-sfhl-mark').forEach(r=>{const cells=r.querySelectorAll('td');let t='';for(const c of cells)t+=(c.innerText||'');set.add(t);});return set; }
  function highlightAndBlink(snap) { highlightRows(true);if(!snap)return;document.querySelectorAll('.tm-sfhl-mark').forEach(r=>{const cells=r.querySelectorAll('td');let t='';for(const c of cells)t+=(c.innerText||'');if(!snap.has(t)){r.classList.add('sfhl-new-match');setTimeout(()=>r.classList.remove('sfhl-new-match'),3000);}}); }

  // ===== Visibility =====
  function isCaseListPage() {
    const h = location.href;
    return h.includes('/lightning/o/Case/list') || h.includes('/lightning/r/WorkOrder');
  }
  function updateVis() { triggerBtn.style.display = 'inline-flex'; }
  updateVis();
  const origPush = history.pushState;
  history.pushState = function() { const r=origPush.apply(this,arguments);setTimeout(()=>{updateVis();if(isCaseListPage())highlightRows(true);},100);setTimeout(restartRefresh,500);return r; };
  window.addEventListener('popstate', () => { setTimeout(()=>{updateVis();if(isCaseListPage())highlightRows(true);},100);setTimeout(restartRefresh,500); });

  // ===== Auto-Refresh =====
  let cdId=null,rfId=null,rfObs=null,plId=null,nextAt=null;
  let _lastActivity = 0;
  document.addEventListener('input',     () => { _lastActivity = Date.now(); }, { passive: true, capture: true });
  document.addEventListener('mousedown', () => { _lastActivity = Date.now(); }, { passive: true, capture: true });
  function clearCd(){if(cdId){clearInterval(cdId);cdId=null;}} function clearRf(){if(rfId){clearInterval(rfId);rfId=null;}}
  function setLbl(b,s){if(b){b.innerText=String(s);b.title=`Refresh in ${s}s`;}} function clrLbl(){const b=getRefreshButton();if(b){b.innerText='';b.title='Auto-Refresh aus';}}
  function startCd(secs){const b=getRefreshButton();if(!b)return;clearCd();nextAt=Date.now()+secs*1000;setLbl(b,secs);cdId=setInterval(()=>{const rem=Math.max(0,nextAt-Date.now());setLbl(getRefreshButton(),Math.ceil(rem/1000));if(rem<=0)clearCd();},1000);}
  function startLoop(){const secs=loadRefreshSecs();if(!loadRefreshOn()){stopRefresh();return;}clearRf();clearCd();startCd(secs);rfId=setInterval(()=>{const b=getRefreshButton();if(!b){waitBtn(startLoop);clearRf();clearCd();return;}if(Date.now()-_lastActivity<5000){startCd(secs);return;}const snap=snapshotMarked();b.click();setTimeout(()=>highlightAndBlink(snap),1500);startCd(secs);},secs*1000);}
  function stopRefresh(){clearRf();clearCd();clrLbl();}
  function restartRefresh(){if(loadRefreshOn()&&isCaseListPage())waitBtn(startLoop);else stopRefresh();}
  function waitBtn(cb){if(getRefreshButton()){cb?.();return;}if(rfObs){rfObs.disconnect();rfObs=null;}if(plId){clearInterval(plId);plId=null;}rfObs=new MutationObserver(()=>{if(getRefreshButton()){rfObs.disconnect();rfObs=null;if(plId){clearInterval(plId);plId=null;}cb?.();}});rfObs.observe(document.documentElement,{childList:true,subtree:true});plId=setInterval(()=>{if(getRefreshButton()){if(rfObs){rfObs.disconnect();rfObs=null;}clearInterval(plId);plId=null;cb?.();}},1000);}
  window.addEventListener('load', () => setTimeout(restartRefresh, 800));

  // ===== Triggers =====
  const rescanSoon = debounce((full=false) => { if(isCaseListPage()) highlightRows(full); }, 80);
  (function kick(){let tries=0;const k=setInterval(()=>{if(!isCaseListPage()){clearInterval(k);return;}if(highlightRows())clearInterval(k);if(++tries>120)clearInterval(k);},200);})();
  if(document.body){const obs=new MutationObserver(muts=>{for(const mu of muts){if(mu.addedNodes?.length){for(const n of mu.addedNodes){if(n instanceof Element&&(n.matches?.('tr,table')||n.querySelector?.('tr,table'))){rescanSoon(false);return;}}}if(mu.type==='characterData'){rescanSoon(false);return;}}});obs.observe(document.body,{childList:true,subtree:true,characterData:true});}
  setInterval(() => { tryAttachTinyMCE(); periodicScan(); if (isCaseListPage()) highlightRows(); }, 5000);

  console.log('[SFHL] Init complete');
})();