// ==UserScript==
// @name         Salesforce List Markierung + Snippets
// @namespace    https://github.com/tJ-ek0/Tampermonkey-Salesforce-tools
// @version      4.12.0
// @description  Markiert Case-Listen farblich + Textbausteine mit Trigger, Platzhaltern, Rich-Text. Drag&Drop, Farbpalette, Auto-Refresh. UND/NICHT/Regex-Regeln, Clipboard-Kopie. DOM-basierte Platzhalter.
// @author       Tobias Jurgan - SIS Endress + Hauser (Deutschland) GmbH+Co.KG
// @license      MIT
// @match        https://endress.lightning.force.com/lightning/*
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
  const VERSION = '4.12.0';
  console.log('[SFHL] v' + VERSION + ' gestartet');

  // Feature 3 (v4.4.0): „Was ist neu" — Stichpunkte pro Version (DE/EN). Wird einmalig nach einem Update angezeigt.
  const CHANGELOG = {
    '4.12.0': {
      de: [
        'Geräte-Doku ist jetzt ein eigener Reiter oben im Panel (neben „Aktualisierung") statt unter den Einstellungen — es ist ja eine eigene Funktion. (Die experimentelle Auto-Markierung wurde wieder entfernt.)',
        'Der Einstieg sitzt jetzt immer in der Salesforce-Kopfleiste (das Tools-Icon oben rechts). Die Einstellung „Button-Position" ist entfallen; Alt+R öffnet das Panel weiterhin.',
      ],
      en: [
        'Device docs is now its own tab at the top of the panel (next to “Refresh”) instead of under Settings — it is a feature of its own. (The experimental auto-highlight was removed again.)',
        'The entry point now always sits in the Salesforce header (the tools icon, top right). The “Button position” setting was removed; Alt+R still opens the panel.',
      ],
    },
    '4.10.0': {
      de: [
        'Automatische Sicherungen: Vor jedem Import oder Zurücksetzen wird dein vorheriger Stand (Regeln + Snippets) automatisch gesichert — die letzten 3. Unter Einstellungen → Sicherung kannst du sie mit einem Klick wiederherstellen (der aktuelle Stand wird dabei ebenfalls gesichert).',
      ],
      en: [
        'Automatic backups: before every import or reset your previous state (rules + snippets) is saved automatically — the last 3. Under Settings → Backup you can restore them with one click (your current state is saved too).',
      ],
    },
    '4.9.0': {
      de: [
        'Snippet-Dropdown: Tippfehlertoleranz. Wenn deine Eingabe sonst nichts findet, zeigt das Dropdown jetzt ähnliche Treffer (z. B. „dku" → „doku") statt leer zu bleiben — markiert mit „≈ ähnliche Treffer".',
      ],
      en: [
        'Snippet dropdown: typo tolerance. When your input would otherwise find nothing, the dropdown now shows similar matches (e.g. “dku” → “doku”) instead of staying empty — flagged with “≈ similar matches”.',
      ],
    },
    '4.8.0': {
      de: [
        'Snippet-Dropdown: Die ersten neun Einträge sind nummeriert — mit Alt+1 bis Alt+9 fügst du einen Eintrag direkt ein, ohne erst mit den Pfeiltasten zu navigieren.',
      ],
      en: [
        'Snippet dropdown: the first nine entries are numbered — press Alt+1 to Alt+9 to insert an entry directly, without navigating with the arrow keys.',
      ],
    },
    '4.7.0': {
      de: [
        'Geräte-Doku: Link-Vorlagen lassen sich jetzt direkt in den Einstellungen bearbeiten (Einstellungen → Geräte-Doku → „✎ Vorlagen bearbeiten") — Kürzel, Beschriftung, Typ und URL anlegen/ändern/löschen, ohne Datei-Import.',
      ],
      en: [
        'Device docs: link templates can now be edited directly in the settings (Settings → Device docs → “✎ Edit templates”) — create/change/delete key, label, type and URL without importing a file.',
      ],
    },
    '4.6.3': {
      de: [
        'Doku-Lookup funktioniert jetzt auch für Codes, die im E-Mail-Editor markiert werden (der läuft in einem iframe und wurde vorher von der Auswahl-Erkennung nicht erfasst).',
      ],
      en: [
        'Doc lookup now also works for codes selected in the email editor (it runs in an iframe and was previously not seen by the selection detection).',
      ],
    },
    '4.6.2': {
      de: [
        'Doku-Lookup erkennt mehr Codes: auch in Eingabefeldern markiert, mit Rand-Klammern/unsichtbaren Zeichen, sowie Ordercodes mit „+" (z. B. FMR10B-…+Z1).',
      ],
      en: [
        'Doc lookup detects more codes: also when selected inside input fields, with surrounding brackets/invisible characters, and order codes containing “+” (e.g. FMR10B-…+Z1).',
      ],
    },
    '4.6.1': {
      de: [
        'Doku-Lookup: Seriennummern werden jetzt zuverlässig erkannt (vorher teils als Produkt-Root → falsche Links). Das Popup zeigt die erkannte Gruppe zuerst; alle anderen Typen lassen sich über „▸ Andere Typen" aufklappen.',
      ],
      en: [
        'Doc lookup: serial numbers are now detected reliably (previously sometimes treated as product root → wrong links). The popup shows the detected group first; all other types expand via “▸ Other types”.',
      ],
    },
    '4.6.0': {
      de: [
        'Neu: Geräte-Doku-Lookup. Gerätecode markieren (Produkt-Root, Seriennummer, Auftrag oder Ordercode) → „📄 Doku-Links" öffnet ein Popup mit passenden Links. Link-Vorlagen werden per Config-Datei importiert (Einstellungen → Geräte-Doku); es sind keine im Skript hinterlegt.',
      ],
      en: [
        'New: device documentation lookup. Select a device code (product root, serial, order or order code) → “📄 Doc links” opens a popup with matching links. Link templates are imported via a config file (Settings → Device docs); none are bundled in the script.',
      ],
    },
    '4.5.3': {
      de: [
        'Fix für die Salesforce-Konsole mit mehreren Tabs: Snippets lesen jetzt Kontakt/Betreff/Case-Nr. nur noch aus dem aktiven Tab. Vorher konnte beim Tab-Wechsel der Name aus dem vorherigen Tab eingefügt werden (bis F5).',
      ],
      en: [
        'Fix for the Salesforce console with multiple tabs: snippets now read contact/subject/case no. only from the active tab. Previously, switching tabs could insert the name from the previous tab (until F5).',
      ],
    },
    '4.5.2': {
      de: [
        'Platzhalter-Verbesserung: Leere {!…}-Felder schreiben keinen rohen Merge-Code mehr in die Mail, sondern einen lesbaren [Platzhalter] zum manuellen Ausfüllen (z. B. [Seriennr.]).',
        'Fix: {!Case.Communication_Owner__c} (Techniker) verwechselte „Kommunikationssprache" und fügte teils „Deutsch" ein — behoben.',
      ],
      en: [
        'Placeholder improvement: empty {!…} fields no longer write raw merge code into the email but a readable [placeholder] to fill in manually (e.g. [Serial no.]).',
        'Fix: {!Case.Communication_Owner__c} (technician) confused “communication language” and sometimes inserted “German” — fixed.',
      ],
    },
    '4.5.1': {
      de: [
        'Fix: Die Schalter in den Einstellungen (Vorschau, Ton, Benachrichtigung, Legende u. a.) ließen sich nicht per Klick umschalten — jetzt behoben.',
      ],
      en: [
        'Fix: the settings toggles (preview, sound, notification, legend, etc.) could not be switched by clicking — now fixed.',
      ],
    },
    '4.5.0': {
      de: [
        'SLA-Alarm: Regeln können einzeln einen 🔔-Alarm bekommen (Glocke in der Markierungs-Liste). Neuer Treffer beim Auto-Refresh → Tab-Titel blinkt, optional Ton + Desktop-Benachrichtigung.',
        'Farb-Legende über der Case-Liste: zeigt die aktiven Markierungen mit Trefferzahl.',
        'Regel aus Auswahl: Listentext markieren → Schaltfläche legt direkt eine Markierungs-Regel an.',
        'Button-Position wählbar (Einstellungen): SF-Kopfleiste, schwebend oder ausgeblendet (Alt+R bleibt).',
        'Optik an Salesforce angeglichen (SLDS-Blau, SLDS-Toasts).',
      ],
      en: [
        'SLA alarm: rules can individually get a 🔔 alarm (bell in the highlight list). New match on auto-refresh → tab title blinks, optional sound + desktop notification.',
        'Color legend above the case list: shows active highlights with hit counts.',
        'Rule from selection: select list text → a button creates a highlight rule directly.',
        'Button position is configurable (settings): SF header, floating or hidden (Alt+R stays).',
        'Look aligned with Salesforce (SLDS blue, SLDS toasts).',
      ],
    },
    '4.4.1': {
      de: [
        'Langzeit-Bug behoben: Anrede und Nachname werden jetzt zuverlässig erkannt (z. B. „Guten Tag Frau Abohamzeh,"). Bisher las das Skript wegen Salesforce-Shadow-DOM/Slots den Feldwert nicht und fügte UI-Text wie „50× bearbeiten" ein. Zusätzliches Sicherheitsnetz: lässt sich kein gültiger Name lesen, bleibt das Feld leer (mit Hinweis) statt Müll einzufügen.',
      ],
      en: [
        'Long-standing bug fixed: salutation and last name are now read reliably (e.g. “Hello Mrs Abohamzeh,”). Previously the script failed to read the field value through Salesforce shadow DOM/slots and inserted UI text like “50× edit”. Added safety net: if no valid name can be read, the field stays blank (with a notice) instead of inserting junk.',
      ],
    },
    '4.4.0': {
      de: [
        'Sicherheitsnetz: Warn-Hinweis, wenn Anrede, Nachname oder Kontaktname beim Einfügen leer bleiben.',
        'Optionale Vorschau vor dem Einfügen (in den Einstellungen aktivierbar) — zeigt das fertige Snippet und fragt alle {eingabe:}-Felder gebündelt ab.',
        'Dieser „Was ist neu"-Hinweis nach einem Update.',
      ],
      en: [
        'Safety net: warning when salutation, last name or contact name resolve empty on insert.',
        'Optional preview before inserting (enable in settings) — shows the final snippet and asks for all {eingabe:} fields at once.',
        'This “what’s new” notice after an update.',
      ],
    },
  };

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
  const LS_LAST_EXPORT = 'sfhl_last_export';    // Timestamp des letzten Exports (Backup-Reminder)
  const LS_BACKUP_HINT = 'sfhl_backup_hint_at'; // Timestamp des letzten Backup-Hinweises
  const LS_BACKUPS = 'sfhl_backups_v1';         // rotierende Auto-Backups (max 3) vor Import/Reset
  const LS_PREVIEW_ON  = 'sfhl_preview_enabled'; // Feature 2 (v4.4.0): Vorschau vor dem Einfügen an/aus
  const LS_LAST_VER    = 'sfhl_last_seen_version'; // Feature 3 (v4.4.0): zuletzt gesehene Version für „Was ist neu"

  // ===== Helpers =====
  function uid() { return 'k' + Math.random().toString(36).slice(2, 10); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function norm(s) { return (s || '').toString().toLowerCase(); }
  function escH(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  // SECURITY: Farbwerte aus localStorage/Import landen unescaped in innerHTML-Templates —
  // nur valide Hex-Farben durchlassen, sonst Default.
  function safeColor(c, fallback = '#ffffcc') { return /^#[0-9a-fA-F]{3,8}$/.test(String(c || '')) ? c : fallback; }

  // FIX #1: Semantischer Versionsvergleich statt String-Vergleich
  function semverLt(a, b) {
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((pa[i]||0) !== (pb[i]||0)) return (pa[i]||0) < (pb[i]||0); }
    return false;
  }

  // Daten-Version für Migrationen + Default-Snippet-Merge (sfhl_data_version, sfhl_snip_defaults_ver).
  // ACHTUNG: Bewusst von VERSION entkoppelt — historisch steht sie auf 4.9.0 und läuft der
  // Skript-Version voraus. Bei neuen Migrationen oder neuen Default-Snippets HIER erhöhen
  // (muss semver-größer als der gespeicherte Wert sein), NICHT an @version koppeln.
  const DATA_VERSION = '4.9.0';

  const PREFIXES = [';;', '//', '::', '!!', '@@'];

  // HTML Sanitizer (whitelist-based)
  const SAFE_TAGS = new Set(['b','i','u','a','br','p','ul','ol','li','strong','em','span']);
  const SAFE_ATTRS = { a: new Set(['href','target','title']), span: new Set(['style']) };
  // FIX #14 (Security): Allowlist für href-Protokolle statt nur javascript:-Blocklist
  const SAFE_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:']);
  // SECURITY: style-Attribut auf harmlose Text-Properties beschränken —
  // verhindert url()-Exfiltration, position:fixed-Overlays etc.
  const SAFE_STYLE_PROPS = new Set(['color','background-color','font-weight','font-style','font-size','font-family','text-decoration']);
  function sanitizeStyle(value) {
    return String(value).split(';').map(decl => {
      const i = decl.indexOf(':');
      if (i < 0) return '';
      const prop = decl.slice(0, i).trim().toLowerCase();
      const val  = decl.slice(i + 1).trim();
      if (!SAFE_STYLE_PROPS.has(prop)) return '';
      if (/url\s*\(|expression|javascript|@import/i.test(val)) return '';
      return prop + ':' + val;
    }).filter(Boolean).join(';');
  }
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
          if (!allowed.has(attr.name)) { ch.removeAttribute(attr.name); continue; }
          if (attr.name === 'href') {
            try {
              const proto = new URL(attr.value, location.href).protocol;
              if (!SAFE_PROTOCOLS.has(proto)) { ch.removeAttribute(attr.name); continue; }
            } catch { ch.removeAttribute(attr.name); continue; }
          }
          if (attr.name === 'style') {
            const cleaned = sanitizeStyle(attr.value);
            if (cleaned) ch.setAttribute('style', cleaned);
            else { ch.removeAttribute(attr.name); continue; }
          }
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
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map(e => ({ id:e.id||uid(), term:String(e.term||''), color:safeColor(e.color), enabled:e.enabled!==false, folder:e.folder||null, alarm:e.alarm===true })); }
      raw = localStorage.getItem(LS_CFG_OLD);
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p.slice().sort((a,b)=>(b.priority||0)-(a.priority||0)).map(e=>({id:e.id||uid(),term:String(e.term||''),color:safeColor(e.color),enabled:true,folder:null})); }
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
  // FIX #10: Dirty-Flag-Saves — verhindert mehrfache requestIdleCallback-Registrierung
  let _snipDirty = false, _snipFlushScheduled = false, _rulesDirty = false;
  function saveSnippets(immediate=false) {
    if (immediate) { localStorage.setItem(LS_SNIP, JSON.stringify(SNIPPETS)); _snipDirty=false; _snipFlushScheduled=false; return; }
    _snipDirty = true;
    if (_snipFlushScheduled) return;
    _snipFlushScheduled = true;
    const flush = () => { if (_snipDirty) { localStorage.setItem(LS_SNIP, JSON.stringify(SNIPPETS)); _snipDirty=false; } _snipFlushScheduled=false; };
    if ('requestIdleCallback' in window) requestIdleCallback(flush, {timeout:500});
    else setTimeout(flush, 500);
  }
  // FIX #16: loadPrefix/loadDefaultLang cachen — vermeidet localStorage-Lesen bei jedem Tastendruck
  let _cachedPrefix = null;
  function loadPrefix() { if (_cachedPrefix === null) _cachedPrefix = localStorage.getItem(LS_PREFIX) || ';;'; return _cachedPrefix; }
  function savePrefix(p) { _cachedPrefix = p; localStorage.setItem(LS_PREFIX, p); }
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
  // Feature 2 (v4.4.0): Vorschau vor dem Einfügen (optional, Default aus)
  function loadPreviewOn() { return localStorage.getItem(LS_PREVIEW_ON) === '1'; }
  function savePreviewOn(on) { localStorage.setItem(LS_PREVIEW_ON, on?'1':'0'); }
  // v4.5.0: SLA-Alarm-Kanäle (sfhl_sla_blink/sound/notify). Blink default an, Rest aus.
  function loadSla(k) { const v = localStorage.getItem('sfhl_sla_' + k); return k === 'blink' ? v !== '0' : v === '1'; }
  function saveSla(k, on) { localStorage.setItem('sfhl_sla_' + k, on ? '1' : '0'); }
  // v4.5.0: Listen-Features (Farb-Legende #2, Regel aus Auswahl #3) — beide default an.
  function loadLegendOn() { return localStorage.getItem('sfhl_legend') !== '0'; }
  function saveLegendOn(on) { localStorage.setItem('sfhl_legend', on ? '1' : '0'); }
  function loadSelRuleOn() { return localStorage.getItem('sfhl_selrule') !== '0'; }
  function saveSelRuleOn(on) { localStorage.setItem('sfhl_selrule', on ? '1' : '0'); }
  // v4.12.0: Button fest in der SF-Kopfleiste (Einstellung entfernt). Floating bleibt nur als
  // automatischer Fallback, falls die Header-Injektion scheitert (siehe updateVis).
  function loadBtnPos() { return 'header'; }
  // v4.6.0 Geräte-Doku-Lookup: KEINE URLs als Default (öffentliches Repo) — alle Link-
  // Vorlagen werden lokal per Config-Import geladen. Eintrag: {id,key,label,type,url}.
  // type ∈ root|serial|auftrag|order|free. url nutzt %s als Platzhalter (alle Vorkommen).
  function loadDokuOn() { return localStorage.getItem('sfhl_doku_enabled') !== '0'; }
  function saveDokuOn(on) { localStorage.setItem('sfhl_doku_enabled', on ? '1' : '0'); }
  function loadDokuLinks() {
    try { const raw = localStorage.getItem('sfhl_doku_links'); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map(e => ({ id:e.id||uid(), key:String(e.key||''), label:String(e.label||''), type:String(e.type||'root'), url:String(e.url||'') })).filter(e => e.url && /%s/.test(e.url)); } } catch {}
    return [];
  }
  function saveDokuLinks(arr) { localStorage.setItem('sfhl_doku_links', JSON.stringify(arr || [])); }
  // FIX #7: loadDefaultLang cachen
  let _cachedLang = null;
  function loadDefaultLang() { if (_cachedLang === null) _cachedLang = localStorage.getItem(LS_DEF_LANG) || 'de'; return _cachedLang; }
  function saveDefaultLang(lang) { _cachedLang = lang; localStorage.setItem(LS_DEF_LANG, lang); }

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
    'Nachname': 'Last name',
    'Kontaktname': 'Contact name',
    'konnte nicht ermittelt werden – bitte vor dem Senden prüfen.': 'could not be resolved – please check before sending.',
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
    // Toasts & Dialoge (toast() übersetzt automatisch via t())
    'Regel hinzugefügt': 'Rule added',
    'Gelöscht': 'Deleted',
    'Rückgängig': 'Undo',
    'Regel wiederhergestellt': 'Rule restored',
    'Snippet wiederhergestellt': 'Snippet restored',
    'Ordner erstellt': 'Folder created',
    'Ordner gelöscht': 'Folder deleted',
    'In Ordner verschoben': 'Moved to folder',
    'Aus Ordner entfernt': 'Removed from folder',
    'Reihenfolge geändert': 'Order changed',
    'Exportiert': 'Exported',
    'Export fehlgeschlagen': 'Export failed',
    'Import erfolgreich': 'Import successful',
    'Ungültiges Format': 'Invalid format',
    'Zurückgesetzt': 'Reset done',
    'In Zwischenablage kopiert': 'Copied to clipboard',
    'Kopieren fehlgeschlagen': 'Copy failed',
    'Snippet aktualisiert': 'Snippet updated',
    'Snippet erstellt': 'Snippet created',
    'Snippet gelöscht': 'Snippet deleted',
    'Kopie erstellt': 'Copy created',
    'Kategorie umbenannt': 'Category renamed',
    '★ Favorit gesetzt': '★ Favorite set',
    'Favorit entfernt': 'Favorite removed',
    'Auto-Refresh an': 'Auto-refresh on',
    'Auto-Refresh aus': 'Auto-refresh off',
    'Auto-Wrap an': 'Auto-wrap on',
    'Auto-Wrap aus': 'Auto-wrap off',
    'Vorschau': 'Preview',
    'Vorschau an': 'Preview on',
    'Vorschau aus': 'Preview off',
    'Vorschau vor dem Einfügen': 'Preview before inserting',
    'Vor dem Einfügen Vorschau zeigen und {eingabe:}-Felder abfragen': 'Show a preview before inserting and ask for {eingabe:} fields',
    'Einfügen': 'Insert',
    'Abbrechen': 'Cancel',
    'Was ist neu': "What's new",
    'Verstanden': 'Got it',
    'Link kopiert! Kollege kann ihn in SF öffnen.': 'Link copied! A colleague can open it in SF.',
    'Teilen fehlgeschlagen': 'Sharing failed',
    'Ungültige Regex — Regel wird als einfache Textsuche behandelt': 'Invalid regex — rule is treated as plain text search',
    'Backup-Tipp: Regeln & Snippets seit über 30 Tagen nicht exportiert': 'Backup tip: rules & snippets not exported for over 30 days',
    'Jetzt exportieren': 'Export now',
    'Markierungsregeln auf Standard zurücksetzen?': 'Reset highlight rules to defaults?',
    'Snippets auf Standard zurücksetzen?': 'Reset snippets to defaults?',
    'Alles auf Standard zurücksetzen? (Regeln + Snippets)': 'Reset everything to defaults? (rules + snippets)',
    'Ordner löschen? Enthaltene Regeln werden in "Ohne Ordner" verschoben.': 'Delete folder? Contained rules move to "No folder".',
    'Ordnername:': 'Folder name:',
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
    if (semverLt(ver, DATA_VERSION)) { // FIX #1: semantischer Versionsvergleich
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
      localStorage.setItem(LS_DATA_VER, DATA_VERSION);
    }
  }
  runMigrations();

  let RULES = loadRules(); saveRules();
  let SNIPPETS = loadSnippets();

  // ===== Neue Default-Snippets automatisch einmergen =====
  // Logik: Nur Snippets einfügen deren Trigger noch NICHT existiert.
  // Eigene Snippets und bearbeitete Defaults bleiben unberührt.
  (function mergeDefaultSnippets() {
    if (localStorage.getItem(LS_SNIP_VER) === DATA_VERSION) return; // schon gemergt
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
    localStorage.setItem(LS_SNIP_VER, DATA_VERSION);
  })();

  // FIX #3: Doppeltes saveSnippets() entfernt — mergeDefaultSnippets() speichert bereits wenn nötig

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

  // QF5: nur ein Toast gleichzeitig — schnelle Folge-Toasts ersetzen den alten statt zu stapeln.
  // Optionales action={label,fn} rendert einen Button (z.B. "Rückgängig" nach Löschen).
  // Statische Meldungen werden automatisch via t() übersetzt.
  let _toastEl = null;
  function toast(msg, type='info', dur=2500, action=null) {
    msg = t(msg);
    if (_toastEl) { _toastEl.remove(); _toastEl = null; }
    const el = document.createElement('div'); el.className = `sfhl-toast sfhl-toast--${type}`; el.textContent = msg;
    if (action && typeof action.fn === 'function') {
      el.classList.add('has-action');
      const btn = document.createElement('button');
      btn.className = 'sfhl-toast-act'; btn.textContent = t(action.label || 'OK');
      btn.onclick = () => { el.remove(); if (_toastEl === el) _toastEl = null; try { action.fn(); } catch {} };
      el.appendChild(btn);
      dur = Math.max(dur, 5000);
    }
    document.documentElement.appendChild(el);
    _toastEl = el;
    requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('vis')));
    setTimeout(()=>{el.classList.remove('vis');setTimeout(()=>{el.remove();if(_toastEl===el)_toastEl=null;},350);},dur);
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
  // FIX #2: Shadow-DOM-Traversal per iterativer Queue statt O(n²) querySelectorAll('*')
  // SF Lightning rendert ALLES in Shadow Roots → normales querySelector findet nichts.
  function _collectShadowRoots(root) {
    const roots = [root];
    try {
      const withShadow = root.querySelectorAll ? Array.from(root.querySelectorAll('*')).filter(e => e.shadowRoot) : [];
      for (const el of withShadow) roots.push(..._collectShadowRoots(el.shadowRoot));
    } catch {}
    return roots;
  }

  function deepQueryAll(root, selector) {
    const results = [];
    for (const r of _collectShadowRoots(root)) {
      try { if (r.querySelectorAll) results.push(...r.querySelectorAll(selector)); } catch {}
    }
    return results;
  }

  function deepQuery(root, selector) {
    for (const r of _collectShadowRoots(root)) {
      try { const found = r.querySelector ? r.querySelector(selector) : null; if (found) return found; } catch {}
    }
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
      // v4.5.0: Assistive-Text überspringen. SF rendert in Inline-Edit-Felder den
      // versteckten Bleistift-Text "<Label> bearbeiten" (class slds-assistive-text).
      // Der ist kein sichtbarer Feldwert und führte sonst zu "Guten Tag Name bearbeiten,".
      if (n.classList && n.classList.contains('slds-assistive-text')) return;
      // v4.5.0: <slot> auflösen. SF-LWC (z.B. records-record-layout-output-field)
      // projizieren den Feldwert per <slot name="outputField"> aus dem Light-DOM des
      // Hosts in den Shadow-Tree. Ohne assignedNodes() sieht getDeepText nur das Label
      // und verfehlt den Wert komplett ("Name" statt "Frau Ronja Isert").
      if (n.tagName === 'SLOT' && typeof n.assignedNodes === 'function') {
        const assigned = n.assignedNodes();
        (assigned && assigned.length ? assigned : Array.from(n.childNodes || [])).forEach(walk);
        return;
      }
      // Flattened-Tree-Semantik: hat das Element einen Shadow-Root, NUR den Shadow-Tree
      // laufen — die Light-DOM-Kinder werden über <slot> an ihrer projizierten Position
      // eingezogen. Sonst würde slotted Content doppelt gezählt.
      if (n.shadowRoot) {
        Array.from(n.shadowRoot.childNodes || []).forEach(walk);
      } else {
        Array.from(n.childNodes || []).forEach(walk);
      }
    })(el);
    return out.replace(/\s+/g, ' ').trim();
  }

  function readSFField(labelTexts, excludeLabels) {
    try {
      const lowLabels = labelTexts.map(l => l.toLowerCase());
      // v4.5.1: Labels, die NICHT matchen dürfen (z.B. "kommunikationssprache" beim
      // Techniker-Lookup 'kommunikation' — sonst landet "Deutsch" im Snippet).
      const lowExclude = (excludeLabels || []).map(l => l.toLowerCase());
      const isExcluded = t => lowExclude.some(x => t === x || t.startsWith(x));
      // Erweiterte Container-Suche: auch Highlights-Panel und lightning-output-field
      const CTR_SEL  = '.slds-form-element,force-record-layout-item,records-record-layout-item,lightning-output-field,force-highlights-details-item';
      // Erweiterte Value-Suche: Picklist + Lookup explizit
      const VAL_SEL  = 'lightning-formatted-text,lightning-formatted-name,lightning-formatted-picklist,lightning-formatted-lookup,.slds-form-element__static,dd,p,a.textUnderline,a[data-recordid],a[href*="/r/"]';
      const LBL_SEL  = '.slds-form-element__label,dt,label,span.label,abbr,.slds-text-title';

      const containers = deepQueryAll(document, CTR_SEL);
      const candidates = [];

      for (const ctr of containers) {
        if (!isVisibleEl(ctr)) continue; // v4.5.3: inaktive Konsolen-Tabs überspringen
        const lbl = ctr.shadowRoot
          ? deepQuery(ctr.shadowRoot, LBL_SEL)
          : ctr.querySelector(LBL_SEL);
        if (!lbl) continue;
        const t = (lbl.textContent || '').trim().toLowerCase();
        if (!t || isExcluded(t)) continue;
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
        if (!isVisibleEl(lbl)) continue; // v4.5.3: inaktive Konsolen-Tabs überspringen
        const t = (lbl.textContent || '').trim().toLowerCase();
        if (!t || t.length > 50 || isExcluded(t)) continue;
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
        if (!isVisibleEl(el)) continue; // v4.5.3: nur aktiver Konsolen-Tab
        const t = (el.textContent || '').trim();
        if (!t || t.length < 3) continue;
        const cleaned = t.replace(/^(?:RE:\s*|AW:\s*|FW:\s*|WG:\s*)*(?:Case#?\s*\d+\s*:\s*)?/i, '').trim();
        if (cleaned && cleaned.length > 2) return cleaned;
      }
      // 2. Lookup-Link (nur sichtbarer/aktiver Tab)
      for (const lookupLink of document.querySelectorAll('.outputLookupContainer a.textUnderline')) {
        if (!isVisibleEl(lookupLink)) continue;
        const v = lookupLink.textContent.trim();
        if (v && v.length > 2 && v.length < 300) return v;
      }
    } catch {}
    // 3. Label-basiert (Fallback)
    return readSFField(['betreff','subject']);
  }

  // Kontaktname: sucht in Highlight-Feldern und im Detail-Layout
  // Validiert, ob ein String wirklich ein Personenname sein kann.
  // Filtert SF-UI-Texte wie "36× bearbeiten", "Neu", Zahlen-Counter etc. aus.
  function isLikelyPersonName(s) {
    if (!s) return false;
    const v = s.trim();
    if (v.length < 2 || v.length > 100) return false;
    if (!/^[A-Za-zÄÖÜäöüßéèàâêîôûÉÈÀÂÊÎÔÛñÑçÇ]/.test(v)) return false;
    if (!/[A-Za-zÄÖÜäöüß]{2,}/.test(v)) return false;
    const lower = v.toLowerCase();
    const UI_BLACKLIST = [
      'bearbeiten','edit','löschen','delete','speichern','save','abbrechen','cancel',
      'erstellen','create','neu','new','mehr','more','weniger','less','zeigen anzeigen',
      'klicken','click','auswählen','select','aktion','action','folgen','follow',
      'teilen','share','verknüpfen','link','suchen','search','filter','sortieren','sort',
      'aktualisieren','refresh','laden','load','×','records','datensätze','elemente','items',
      'entfernen','remove','hinzufügen','add','schließen','close','öffnen','open',
      'siehe alle','view all','show all','alle anzeigen','no value','keine'
    ];
    for (const bad of UI_BLACKLIST) if (lower.includes(bad)) return false;
    const letters = (v.match(/[A-Za-zÄÖÜäöüß]/g) || []).length;
    if (letters / v.length < 0.5) return false;
    // Einzelwort-Namen müssen typische Nicht-Personen-Begriffe ausschließen
    const SINGLE_WORD_BLACKLIST = new Set([
      'portal','account','owner','user','system','admin','administrator','support',
      'service','customer','kunde','firma','company','contact','kontakt','vertrieb',
      'sales','help','hilfe','team','gruppe','group','public','intern','extern',
      'standard','default','test','demo','muster','beispiel','sample','dummy',
      'anonym','anonymous','unbekannt','unknown','sonstige','other','keine','none'
    ]);
    const words = v.split(/\s+/);
    if (words.length === 1 && SINGLE_WORD_BLACKLIST.has(lower)) return false;
    return true;
  }

  // Prüft, ob ein Element in einem Navigations-/Sidebar-Bereich liegt
  // (Recently Viewed, Tab-Bar, Utility-Bar etc. — NICHT der Hauptdatensatz)
  function isInsideNavigation(el) {
    const NAV_TAGS = new Set([
      'one-app-nav-bar','one-utility-bar','one-app-launcher-menu','one-base-app-launcher',
      'force-tabs-tabset','navex-laf-tabset','one-app-nav-bar-item-root',
      'global-search','one-global-navigation','force-relatedlist-related-list-item',
      'navex-console-navigation-menu','navex-recent-items','one-recent-items'
    ]);
    let n = el;
    let hops = 0;
    while (n && hops < 50) {
      const tag = (n.tagName || '').toLowerCase();
      if (NAV_TAGS.has(tag)) return true;
      if (tag.startsWith('navex-') && tag.includes('tab')) return true;
      n = n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
      hops++;
    }
    return false;
  }

  // v4.5.3: In der Lightning-Konsole bleiben mehrere Workspace-Tabs gleichzeitig im DOM —
  // der inaktive ist nur per CSS/aria versteckt, nicht entfernt. Ohne diesen Filter greift
  // die Feldsuche den ERSTEN DOM-Treffer, evtl. aus einem inaktiven Tab → falscher Kontakt
  // (z.B. Anrede aus dem vorherigen Tab). Nur sichtbare Elemente des aktiven Tabs zählen.
  function isVisibleEl(el) {
    try {
      if (!el) return false;
      // aria-hidden-Vorfahr (inaktiver Konsolen-Tab) — shadow-übergreifend hochlaufen
      let n = el, hops = 0;
      while (n && hops < 80) {
        if (n.nodeType === 1 && n.getAttribute && n.getAttribute('aria-hidden') === 'true') return false;
        n = n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
        hops++;
      }
      // tatsächlich gerendert? display:none / 0-Größe → keine ClientRects
      if (el.getClientRects && el.getClientRects().length === 0) return false;
      return true;
    } catch { return true; }
  }

  // Sucht eine Section/Karte mit Titel wie "Contact-Details" / "Kontakt-Details"
  // und liefert das Container-Element. Dort sind Salutation/LastName direkt
  // als output-fields sichtbar (page-layout-spezifisch).
  function findContactDetailsSection() {
    try {
      const TITLE_PATTERNS = [/^contact[\s\-_]*details?$/i, /^kontakt[\s\-_]*details?$/i, /^contact\s*info/i];
      // Salesforce rendert Section-Titles in verschiedenen Elementen:
      const titleSelectors = 'h1,h2,h3,h4,h5,header,.slds-card__header-title,.slds-section__title,span.title,lightning-formatted-text';
      const titles = deepQueryAll(document, titleSelectors);
      for (const t of titles) {
        if (isInsideNavigation(t)) continue;
        if (!isVisibleEl(t)) continue; // v4.5.3: nur aktiver Konsolen-Tab
        const txt = (t.textContent || '').trim();
        if (!txt || txt.length > 60) continue;
        if (!TITLE_PATTERNS.some(rx => rx.test(txt))) continue;
        // Container hochlaufen: Section/Card/Flexipage-Tab
        let n = t;
        let hops = 0;
        while (n && hops < 12) {
          const tag = (n.tagName || '').toLowerCase();
          if (tag === 'lightning-card' || tag === 'flexipage-component2' ||
              tag === 'flexipage-component' || tag === 'records-record-layout-section' ||
              tag.startsWith('flexipage-') || (n.classList && n.classList.contains('slds-card'))) {
            return n;
          }
          n = n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
          hops++;
        }
        // Fallback: nimm direkten Eltern-Container
        if (t.parentElement) return t.parentElement.parentElement || t.parentElement;
      }
    } catch {}
    return null;
  }

  const _VAL_SEL = 'lightning-formatted-name,lightning-formatted-picklist,' +
    'lightning-formatted-text,lightning-formatted-phone,' +
    'lightning-formatted-email,lightning-formatted-url,' +
    'a[href*="/r/Contact"],a[href*="/r/"],.slds-form-element__static,dd';
  const _LBL_SEL = '.slds-form-element__label,dt,label,span.label,abbr';

  // Liest den Wert eines lightning-output-field anhand seines field-name-Attributs.
  // WICHTIG: shadow-root des Elements explizit als Suchroot übergeben, weil
  // deepQuery(el, ...) nur das Light-DOM von el durchsucht, nicht el.shadowRoot.
  function readOutputFieldValue(container, ...fieldNames) {
    for (const fieldName of fieldNames) {
      try {
        const els = deepQueryAll(container,
          `lightning-output-field[field-name="${fieldName}"],` +
          `records-record-layout-output-field[field-name="${fieldName}"]`);
        for (const el of els) {
          const root = el.shadowRoot || el;
          const valEl = deepQuery(root, _VAL_SEL);
          if (valEl) {
            const v = getDeepText(valEl) || (valEl.textContent || '').trim();
            if (v && v.toLowerCase() !== fieldName.toLowerCase()) return v.trim();
          }
        }
      } catch {}
    }
    return '';
  }

  // Liest ein Feld nach Label-Text aus einem bestimmten Container (Shadow-DOM-fähig)
  function readFieldFromContainer(container, labels) {
    if (!container) return '';
    const lows = labels.map(l => l.toLowerCase());
    try {
      const ctrs = deepQueryAll(container,
        '.slds-form-element,lightning-output-field,records-record-layout-item,force-record-layout-item');
      for (const ctr of ctrs) {
        const root = ctr.shadowRoot || ctr;
        const lbl = deepQuery(root, _LBL_SEL);
        if (!lbl) continue;
        const lt = (lbl.textContent || '').trim().toLowerCase();
        if (!lows.some(l => lt === l || lt.startsWith(l))) continue;

        // Strategie 1: .slds-form-element__control ist der SF-Standard-Value-Container
        // Er enthält NUR den Wert — kein Label, kein Edit-Button.
        const ctrl = root.querySelector('.slds-form-element__control,.slds-form-element__static');
        if (ctrl) {
          const v = getDeepText(ctrl);
          if (v && v.toLowerCase() !== lt && v.length > 0 && v.length < 200) return v.trim();
        }

        // Strategie 2: formatted-Element suchen, explizit nicht im Label
        const allVals = deepQueryAll(root, _VAL_SEL);
        for (const ve of allVals) {
          if (ve === lbl || lbl.contains(ve)) continue;
          const v = getDeepText(ve) || (ve.textContent || '').trim();
          if (v && v.toLowerCase() !== lt && v.length < 200) return v.trim();
        }
      }
    } catch {}
    return '';
  }

  // Liest komplette Contact-Daten direkt aus der "Contact-Details"-Section.
  // Nutzt field-name-Attribute (präzise) mit Label-Fallback.
  function readContactFromDetailsSection() {
    const section = findContactDetailsSection();
    // FIX #4: Diagnose-console.log/warn aus Produktionscode entfernt
    if (!section) return null;

    // Methode 1: field-name Attribut (API-Feldname, zuverlässig)
    const nameRaw = readOutputFieldValue(section, 'Name');
    const sal     = readOutputFieldValue(section, 'Salutation');
    const fn      = readOutputFieldValue(section, 'FirstName');
    const ln      = readOutputFieldValue(section, 'LastName');
    const phone   = readOutputFieldValue(section, 'Phone');
    const mob     = readOutputFieldValue(section, 'MobilePhone');

    // Methode 2: Label-Fallback wenn field-name nicht gefunden
    // v4.5.0: Jeden gescrapten Namens-/Anrede-Wert gegen UI-Müll absichern. isLikelyPersonName
    // wirft "Name bearbeiten", "50× bearbeiten" etc. raus (›bearbeiten‹/›×‹ stehen auf der
    // Blacklist) und lässt echte Namen + Anreden (Herr/Frau) durch. Lieber leer als Müll.
    const clean   = v => isLikelyPersonName(v) ? v : '';
    const salFb   = clean(sal   || readFieldFromContainer(section, ['anrede','salutation']));
    const fnFb    = clean(fn    || readFieldFromContainer(section, ['vorname','first name']));
    const lnFb    = clean(ln    || readFieldFromContainer(section, ['nachname','last name']));
    const nameFb  = clean(nameRaw || readFieldFromContainer(section, ['name','kontaktname','contact name']));

    if (!nameFb && !lnFb && !salFb) {
      console.warn('[SFHL] Section gefunden aber kein valider Name/Anrede lesbar (nur leer/UI-Text)');
      return null;
    }

    // Wenn Name "Frau Ronja Isert" enthält: parseContactName zur Zerlegung nutzen
    const parsed  = (!salFb || !lnFb) && nameFb ? parseContactName(nameFb) : null;

    return {
      Salutation:  salFb  || parsed?.salutation || '',
      FirstName:   fnFb   || parsed?.firstName  || '',
      LastName:    lnFb   || parsed?.lastName   || '',
      Name:        nameFb || [salFb, fnFb, lnFb].filter(Boolean).join(' '),
      Phone:       phone  || readFieldFromContainer(section, ['telefon','phone']) || '',
      MobilePhone: mob    || readFieldFromContainer(section, ['mobil','mobile'])  || ''
    };
  }

  function readContactName() {
    try {
      // 1a. Bevorzugt: lightning-output-field mit field-name="ContactId"
      //     (das ist garantiert die Contact-Lookup im Hauptdatensatz)
      const outputFields = deepQueryAll(document, 'lightning-output-field[field-name="ContactId"], records-record-layout-output-field[field-name="ContactId"]');
      for (const of_ of outputFields) {
        if (!isVisibleEl(of_)) continue; // v4.5.3: nur aktiver Konsolen-Tab
        const link = deepQuery(of_, 'a[href*="/r/Contact/"], a[href*="/Contact/"]');
        if (link) {
          const v = (link.textContent || '').trim();
          if (isLikelyPersonName(v)) return v;
        }
        const txt = getDeepText(of_);
        if (isLikelyPersonName(txt)) return txt;
      }

      // 1b. Contact-Link, aber NUR im Hauptdatensatz (nicht in Sidebar/Tabs/Recent Items)
      const contactLinks = deepQueryAll(document, 'a[href*="/lightning/r/Contact/"], a[href*="/r/Contact/"]');
      for (const a of contactLinks) {
        if (isInsideNavigation(a) || !isVisibleEl(a)) continue;
        const v = (a.textContent || '').trim();
        if (isLikelyPersonName(v)) return v;
      }

      // 2. Highlights-Panel mit Kontakt-Label (Label muss exakt matchen)
      const highlights = deepQueryAll(document, 'force-highlights-details-item');
      for (const item of highlights) {
        if (!isVisibleEl(item)) continue; // v4.5.3: nur aktiver Konsolen-Tab
        const labelEl = deepQuery(item.shadowRoot || item, '.slds-text-title, .slds-form-element__label, dt, label, p');
        if (!labelEl) continue;
        const lt = (labelEl.textContent || '').trim().toLowerCase();
        if (!['kontaktname','kontakt','contact name','contact'].includes(lt)) continue;
        const v = getDeepText(item).replace(new RegExp('^' + lt, 'i'), '').trim();
        if (isLikelyPersonName(v)) return v;
      }

      // 3. Form-Felder mit exaktem Kontakt-Label
      const containers = deepQueryAll(document, '.slds-form-element,force-record-layout-item,records-record-layout-item,lightning-output-field');
      for (const ctr of containers) {
        if (!isVisibleEl(ctr)) continue; // v4.5.3: nur aktiver Konsolen-Tab
        const lbl = ctr.shadowRoot
          ? deepQuery(ctr.shadowRoot, '.slds-form-element__label,dt,label,span.label')
          : ctr.querySelector('.slds-form-element__label,dt,label,span.label');
        if (!lbl) continue;
        const lt = (lbl.textContent || '').trim().toLowerCase();
        if (!['kontaktname','kontakt','contact name','contact'].includes(lt)) continue;
        const link = ctr.shadowRoot
          ? deepQuery(ctr.shadowRoot, 'a[href*="/r/Contact/"], a[href*="/Contact/"], force-lookup a, lightning-formatted-lookup a')
          : ctr.querySelector('a[href*="/r/Contact/"], a[href*="/Contact/"], force-lookup a, lightning-formatted-lookup a');
        if (link) {
          const v = (link.textContent || '').trim();
          if (isLikelyPersonName(v)) return v;
        }
        const full = getDeepText(ctr);
        const stripped = full.replace(new RegExp('^\\s*' + lt + '\\s*', 'i'), '').trim();
        if (isLikelyPersonName(stripped)) return stripped;
      }

      // 4. readSFField als letzter Fallback (mit Validierung)
      const fallback = readSFField(['kontaktname','kontakt','contact name']);
      if (isLikelyPersonName(fallback)) return fallback;
    } catch {}
    return '';
  }

  // ===== Salesforce UI API: Contact-Daten vorab laden =====
  // DOM-Scraping liefert Salutation/LastName nicht zuverlässig, da diese Felder
  // nicht im Case-Page-Layout sind. Die UI API funktioniert mit Lightning-Session-Cookies
  // (same-origin) ohne extra Bearer-Token.
  let _contactApiCache = null;
  let _contactApiCacheId = null;
  let _contactApiFetching = false;
  let _contactApiDisabled = false; // Circuit-Breaker: nach 3 Fehlern abschalten
  let _contactApiFailCount = 0;

  function extractContactId() {
    try {
      const links = deepQueryAll(document, 'a[href*="/lightning/r/Contact/"], a[href*="/r/Contact/"]');
      for (const a of links) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/\/Contact\/([a-zA-Z0-9]{15,18})\//);
        if (m) return m[1];
      }
    } catch {}
    return null;
  }

  // Versucht, die Case-ID aus der URL zu lesen (z.B. WorkOrder zeigt nicht direkt Contact)
  function extractCaseIdFromPage() {
    try {
      // Case-Link im DOM
      const links = deepQueryAll(document, 'a[href*="/lightning/r/Case/"]');
      for (const a of links) {
        const m = (a.getAttribute('href') || '').match(/\/Case\/([a-zA-Z0-9]{15,18})\//);
        if (m) return m[1];
      }
      // URL selbst (falls direkt auf Case-Seite)
      const u = location.href.match(/\/lightning\/r\/Case\/([a-zA-Z0-9]{15,18})\//);
      if (u) return u[1];
    } catch {}
    return null;
  }

  async function fetchUiApiRecord(recordId, fieldList) {
    const fields = fieldList.join(',');
    const url = `/services/data/v59.0/ui-api/records/${recordId}?fields=${encodeURIComponent(fields)}`;
    // Lightning-spezifische Header: ohne diese verweigert SF die Auth (401)
    const resp = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Salesforce-Lightning-Request-Source': 'aura',
        'X-SFDC-Page-Cache': 'true'
      }
    });
    if (!resp.ok) {
      _contactApiFailCount++;
      if (_contactApiFailCount >= 3) {
        _contactApiDisabled = true;
        console.warn('[SFHL] UI API deaktiviert nach 3 Fehlern (Status ' + resp.status + '). DOM-Fallback aktiv.');
      } else {
        console.warn('[SFHL] UI API Fehler', resp.status, url);
      }
      return null;
    }
    _contactApiFailCount = 0;
    return await resp.json();
  }

  async function prefetchContactApi() {
    if (_contactApiFetching || _contactApiDisabled) return;
    let contactId = extractContactId();

    // Falls kein direkter Contact-Link sichtbar ist (z.B. auf WorkOrder),
    // erst Case laden, dort ContactId rausziehen
    if (!contactId) {
      const caseId = extractCaseIdFromPage();
      if (!caseId) return;
      if (caseId === _contactApiCacheId && _contactApiCache) return;
      _contactApiFetching = true;
      try {
        const caseData = await fetchUiApiRecord(caseId, ['Case.ContactId']);
        contactId = caseData?.fields?.ContactId?.value || null;
      } catch (e) { console.warn('[SFHL] Case-Lookup fehlgeschlagen:', e); }
      if (!contactId) { _contactApiFetching = false; return; }
    } else {
      if (contactId === _contactApiCacheId && _contactApiCache) return;
      _contactApiFetching = true;
    }

    try {
      const data = await fetchUiApiRecord(contactId, [
        'Contact.Salutation','Contact.FirstName','Contact.LastName',
        'Contact.Name','Contact.Phone','Contact.MobilePhone'
      ]);
      if (data?.fields) {
        const f = data.fields;
        _contactApiCache = {
          Salutation:  f.Salutation?.value  || '',
          FirstName:   f.FirstName?.value   || '',
          LastName:    f.LastName?.value    || '',
          Name:        f.Name?.value        || '',
          Phone:       f.Phone?.value       || '',
          MobilePhone: f.MobilePhone?.value || ''
        };
        _contactApiCacheId = contactId;
        console.log('[SFHL] Contact via UI API geladen:', _contactApiCache);
      }
    } catch (e) {
      console.warn('[SFHL] Contact-Fetch Exception:', e);
    }
    _contactApiFetching = false;
  }

  const _prefetchContactDebounced = debounce(prefetchContactApi, 600);

  // ===== Fallback: Anrede/Nachname aus Contact-Anzeigename parsen =====
  // Wenn die API nicht verfügbar ist (z.B. 401), versuchen wir aus dem
  // sichtbaren Contact-Namen "Herr Dr. Max Mustermann" zu zerlegen.
  const KNOWN_SALUTATIONS = ['herr','frau','mr.','mrs.','ms.','mx.','sehr geehrte','sehr geehrter'];
  const KNOWN_TITLES = ['dr.','dr','prof.','prof','dipl.','ing.','dipl.-ing.','prof.dr.','dr.med.','dr.-ing.'];
  const NAME_PARTICLES = ['von','van','de','der','del','di','da','zu','vom','zum','mc','mac','o\''];

  function parseContactName(fullName) {
    if (!fullName) return { salutation:'', firstName:'', lastName:'' };
    const tokens = fullName.trim().split(/\s+/);
    let salutation = '';
    let i = 0;
    // Erste(s) Token als Anrede prüfen
    while (i < tokens.length) {
      const t = tokens[i].toLowerCase();
      if (KNOWN_SALUTATIONS.includes(t)) { salutation = (salutation ? salutation + ' ' : '') + tokens[i]; i++; continue; }
      if (KNOWN_TITLES.includes(t)) { salutation = (salutation ? salutation + ' ' : '') + tokens[i]; i++; continue; }
      break;
    }
    const rest = tokens.slice(i);
    if (rest.length === 0) return { salutation, firstName:'', lastName:'' };
    if (rest.length === 1) return { salutation, firstName:'', lastName: rest[0] };
    // Nachnamen-Partikel zusammenfügen: "von Stein", "van der Berg"
    let lastIdx = rest.length - 1;
    while (lastIdx > 1 && NAME_PARTICLES.includes(rest[lastIdx - 1].toLowerCase())) lastIdx--;
    const lastName = rest.slice(lastIdx).join(' ');
    const firstName = rest.slice(0, lastIdx).join(' ');
    return { salutation: salutation.trim(), firstName, lastName };
  }

  function resolvePlaceholders(text, meta) {
    const _origForMeta = String(text || ''); // Feature 1 (v4.4.0): Quelltext für Leer-Prüfung kritischer Platzhalter
    const now = new Date();
    const pad = n => String(n).padStart(2,'0');
    const dateStr = `${pad(now.getDate())}.${pad(now.getMonth()+1)}.${now.getFullYear()}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    // Case-Nummer: Seitentitel > DOM
    let caseNum = '';
    { const tm = document.title.match(/\b(\d{5,9})\b/); if (tm) caseNum = tm[1]; }
    if (!caseNum) deepQueryAll(document,'lightning-formatted-text').forEach(n=>{
      if(caseNum||!isVisibleEl(n))return; const v=n.textContent.trim(); if(/^\d{5,9}$/.test(v)) caseNum=v;
    });

    // Alle Felder via DOM-Suche (Shadow-DOM-durchdringend)
    const betreff    = readSubject();
    const seriennr   = readSFField(['seriennummer','serial number']);
    const arbeitsauf = readSFField(['arbeitsauftrag','work order']);
    const techniker  = readSFField(['kommunikation','techniker','communication owner'], ['kommunikationssprache']);
    const loesung    = '';
    const produkt    = readSFField(['produkt','product','device type','gerätetyp']);
    // Priorität: API > Contact-Details-Section > generisches DOM-Scraping > Namens-Parser
    const _api       = _contactApiCache;
    const _section   = !_api ? readContactFromDetailsSection() : null;
    const _src       = _api || _section;
    // v4.5.0: Titelunabhängiger Fallback. Findet findContactDetailsSection() die Karte
    // nicht (Titel ≠ "Kontaktdetails"), den Kontakt-Anzeigenamen direkt aus dem "Name"-Feld
    // lesen. Das enthält die Anrede ("Frau Elham Abohamzeh") und ist dank Slot-Auflösung in
    // getDeepText jetzt lesbar; parseContactName zerlegt daraus Anrede + Nachname.
    let kontakt      = (_src && _src.Name) || readContactName();
    if (!kontakt) { const _nm = readSFField(['kontaktname','contact name','name']); if (isLikelyPersonName(_nm)) kontakt = _nm; }
    const _parsed    = !_src && kontakt ? parseContactName(kontakt) : null;
    // FIX #4: console.log entfernt
    // v4.5.0: generische readSFField-Fallbacks für Name/Anrede gegen UI-Müll absichern
    // (z.B. "50× bearbeiten" aus einem Related-List-Zähler). Nur validierte Werte zulassen.
    const _validName = v => isLikelyPersonName(v) ? v : '';
    const anrede     = (_src && _src.Salutation)   || _validName(readSFField(['anrede','salutation'])) || (_parsed?.salutation || '');
    const nachname   = (_src && _src.LastName)     || _validName(readSFField(['nachname','last name'])) || (_parsed?.lastName || '');
    const vorname    = (_src && _src.FirstName)    || (_parsed?.firstName || (kontakt ? kontakt.split(' ').slice(0, -1).join(' ') : ''));
    const telefon    = (_src && _src.Phone)        || readSFField(['telefon','phone']);
    const mobil      = (_src && _src.MobilePhone)  || readSFField(['mobil','mobile']);
    // API-Daten für nächsten Aufruf vorab laden (nicht-blockierend)
    _prefetchContactDebounced();
    const firma      = readSFField(['account','firma','account name']);
    const kunde      = firma;
    const vertrieb   = readSFField(['vertrieb','innendienst','internal sales']);
    const kundennr   = readSFField(['kundennr','sap','customer number']);
    const strasse    = readSFField(['straße','strasse','street','anschrift']);
    const ort        = readSFField(['ort','city','stadt']);
    // {!SF.MergeField} → alle via DOM aufgelöst
    // v4.5.1: Leere {!…}-Felder NIE mehr als rohe Merge-Syntax in die Mail schreiben,
    // sondern als lesbaren [Platzhalter]. Anrede/Nachname/Kontakt bleiben leer ('') —
    // dafür greift das Sicherheitsnetz (Warn-Toast), '[Anrede]' o.Ä. will man nicht im Text.
    text = text
      .replace(/\{!Case\.CaseNumber\}/gi,                    caseNum    || '[Case-Nr.]')
      .replace(/\{!Case\.Subject\}/gi,                       betreff    || '[Betreff]')
      .replace(/\{!Case\.Serial_number__c\}/gi,              seriennr   || '[Seriennr.]')
      .replace(/\{!Case\.Work_Order__c\}/gi,                 arbeitsauf || '[Arbeitsauftrag]')
      .replace(/\{!Case\.Communication_Owner__c\}/gi,        techniker  || '[Techniker]')
      .replace(/\{!Case\.Solution_Steps__c\}/gi,             loesung    || '[Lösungstext]')
      .replace(/\{!Contact\.Salutation\}/gi,                 anrede     || '')
      .replace(/\{!Contact\.LastName\}/gi,                   nachname   || '')
      .replace(/\{!Contact\.Name\}/gi,                       kontakt    || '')
      .replace(/\{!Contact\.PhoneFormula__c\}/gi,            telefon    || '[Telefon]')
      .replace(/\{!Contact\.MobilePhone\}/gi,                mobil      || '[Mobil]')
      .replace(/\{!User\.Name\}/gi,                          loadUname()|| '[Name]')
      .replace(/\{!Today\}/gi,                               dateStr)
      .replace(/\{!Account\.Internal_Sales_Engineer__c\}/gi, vertrieb   || '[Vertrieb ASP]')
      .replace(/\{!Account\.SAPAccountID__c\}/gi,            kundennr   || '[Kundennr.]')
      .replace(/\{!Account\.FTXTAccountName__c\}/gi,         firma      || '[Firma]')
      .replace(/\{!Account\.Street__c\}/gi,                  strasse    || '[Straße]')
      .replace(/\{!Account\.City__c\}/gi,                    ort        || '[Ort]');

    // Eingabe-Variablen auflösen (#45): {eingabe:Beschriftung} → fragt Nutzer
    // WICHTIG: Diese Auflösung passiert erst beim Einfügen (nicht in der Vorschau)
    text = text.replace(/\{eingabe:([^}]+)\}/gi, (_, label) => {
      const val = prompt(label + ':');
      return val !== null ? val : '{eingabe:' + label + '}';
    });

    // Feature 1 (v4.4.0): Platzhalter-Sicherheitsnetz — kritische Kontaktfelder sammeln,
    // die im Quelltext stehen, aber leer aufgelöst werden (nicht-blockierender Warn-Toast in insertSnippet).
    if (meta && typeof meta === 'object') {
      meta.empty = meta.empty || [];
      const _crit = [
        { re:/\{anrede\}|\{!Contact\.Salutation\}/i, val:anrede,   label:'Anrede' },
        { re:/\{nachname\}|\{!Contact\.LastName\}/i,  val:nachname,  label:'Nachname' },
        { re:/\{kontakt\}|\{!Contact\.Name\}/i,       val:kontakt,   label:'Kontaktname' },
      ];
      for (const c of _crit) {
        if (c.re.test(_origForMeta) && !String(c.val||'').trim() && !meta.empty.includes(c.label)) meta.empty.push(c.label);
      }
    }

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
    /* #6 Toasts im SLDS-Look (Theme-Farben, 0.25rem, Icon je Typ). Unten-mittig → keine Kollision mit SF-Toasts (oben-mittig). */
    .sfhl-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(8px);display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:.25rem;z-index:2147483647;font:400 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#fff;pointer-events:none;opacity:0;box-shadow:0 2px 12px rgba(0,0,0,.25);transition:opacity .2s,transform .2s}
    .sfhl-toast.vis{opacity:1;transform:translateX(-50%) translateY(0)}
    .sfhl-toast::before{font-size:14px;font-weight:700;line-height:1;flex-shrink:0}
    .sfhl-toast--info{background:#16325c} .sfhl-toast--info::before{content:'\\2139'}
    .sfhl-toast--success{background:#2e844a} .sfhl-toast--success::before{content:'\\2713'}
    .sfhl-toast--error{background:#ba0517} .sfhl-toast--error::before{content:'\\26A0'}
    .sfhl-toast.has-action{pointer-events:auto;gap:12px}
    .sfhl-toast-act{border:1px solid rgba(255,255,255,.5);background:transparent;color:inherit;border-radius:.25rem;padding:3px 12px;font:600 12px/1.5 inherit;cursor:pointer;white-space:nowrap}

    /* Insert-Vorschau-Dialog (Feature 2, v4.4.0) */
    .sfhl-ovl{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    .sfhl-dlg{background:#fff;color:#1a1a1a;width:min(560px,92vw);max-height:86vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden}
    .sfhl-dlg-h{padding:14px 18px;font-size:14px;font-weight:600;border-bottom:1px solid #eef0f3;display:flex;align-items:center;gap:8px}
    .sfhl-dlg-b{padding:16px 18px;overflow:auto}
    .sfhl-dlg-f{padding:12px 18px;border-top:1px solid #eef0f3;display:flex;justify-content:flex-end;gap:8px}
    .sfhl-dlg-fld{margin-bottom:12px}
    .sfhl-dlg-fld label{display:block;font-size:11.5px;font-weight:600;color:#6b7280;margin-bottom:4px}
    .sfhl-dlg-fld input,.sfhl-dlg-fld textarea{width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;font-family:inherit}
    .sfhl-dlg-fld input:focus,.sfhl-dlg-fld textarea:focus{outline:none;border-color:#0176d3;box-shadow:0 0 0 2px rgba(1,118,211,.12)}
    .sfhl-dlg-pv-l{font-size:11.5px;font-weight:600;color:#6b7280;margin:4px 0 6px}
    .sfhl-dlg-pv{border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f9fafb;max-height:34vh;overflow:auto;font-size:13px;line-height:1.5;word-break:break-word}
    .sfhl-dlg-btn{border:none;border-radius:7px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer}
    .sfhl-dlg-btn--p{background:#0176d3;color:#fff} .sfhl-dlg-btn--p:hover{background:#014486}
    .sfhl-dlg-btn--s{background:#f3f4f6;color:#374151} .sfhl-dlg-btn--s:hover{background:#e5e7eb}
    .sfhl-toast-act:hover{background:rgba(255,255,255,.18)}

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
    .sfhl-ib.sfhl-help-btn.active{background:#eef4ff;color:#0176d3}
    .sfhl-ib.sfhl-settings-btn.active{background:#eef4ff;color:#0176d3}
    .sfhl-tabs{display:flex;gap:0;margin:0 -16px;padding:0 16px;overflow-x:auto;scrollbar-width:none}
    .sfhl-tabs::-webkit-scrollbar{display:none}
    .sfhl-tab{padding:8px 13px;font-size:12.5px;font-weight:500;color:#9ca3af;cursor:pointer;border-bottom:2px solid transparent;transition:color .12s,border-color .12s;white-space:nowrap;flex-shrink:0}
    .sfhl-tab:hover{color:#374151} .sfhl-tab.active{color:#0176d3;border-bottom-color:#0176d3}
    .sfhl-tab-badge{font-size:10px;font-weight:600;background:#e5e7eb;color:#6b7280;padding:0 5px;border-radius:99px;margin-left:4px}
    .sfhl-tab.active .sfhl-tab-badge{background:#eef4ff;color:#0176d3}

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
    .sfhl-search input:focus{outline:none;border-color:#0176d3;box-shadow:0 0 0 2px rgba(1,118,211,.1)}

    /* Rules tab styles */
    .sfhl-colhdr{display:grid;grid-template-columns:20px minmax(0,1fr) 28px auto;gap:4px;padding:6px 16px;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f3f4f6;flex-shrink:0}
    .sfhl-list{flex:1;overflow-y:auto;overflow-x:hidden;padding:2px 0;min-height:0}
    .sfhl-list::-webkit-scrollbar{width:4px} .sfhl-list::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:4px}
    .sfhl-row{display:grid;grid-template-columns:20px 22px minmax(0,1fr) 28px auto;gap:4px;padding:5px 16px;align-items:center;transition:background .12s;cursor:grab;border-left:3px solid transparent}
    .sfhl-row:hover{background:#f9fafb} .sfhl-row.disabled{opacity:.45} .sfhl-row.disabled .sfhl-r-term{text-decoration:line-through;color:#9ca3af}
    .sfhl-row.dragging{opacity:.3;background:#eef4ff} .sfhl-row.drag-over-top{border-top:2px solid #0176d3} .sfhl-row.drag-over-bot{border-bottom:2px solid #0176d3}
    .sfhl-grip{color:#d1d5db;cursor:grab;display:flex;align-items:center;justify-content:center}
    .sfhl-grip svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
    .sfhl-row:hover .sfhl-grip{color:#9ca3af}
    .sfhl-r-term{width:100%;padding:4px 8px;border:1px solid transparent;border-radius:5px;font-size:12.5px;background:transparent;color:#1a1a1a;transition:border-color .12s,background .12s;text-overflow:ellipsis}
    .sfhl-r-term:hover{border-color:#e5e7eb;background:#fff} .sfhl-r-term:focus{outline:none;border-color:#0176d3;background:#fff;box-shadow:0 0 0 2px rgba(1,118,211,.1)}
    .sfhl-sw{position:relative;width:24px;height:24px;border-radius:5px;cursor:pointer;overflow:visible;border:2px solid #fff;box-shadow:0 0 0 1px #e5e7eb;transition:box-shadow .12s,transform .1s;margin:0 auto}
    .sfhl-sw:hover{box-shadow:0 0 0 1px #90d0fe;transform:scale(1.1)}
    .sfhl-sw .sfhl-sw-fill{position:absolute;inset:0;border-radius:3px} .sfhl-sw input[type="color"]{position:absolute;opacity:0;width:0;height:0;pointer-events:none}
    .sfhl-palette{position:fixed;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.14);padding:8px;z-index:2147483647;opacity:0;pointer-events:none;transition:opacity .12s;min-width:200px}
    .sfhl-palette.vis{opacity:1;pointer-events:auto}
    .sfhl-palette-label{font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px}
    .sfhl-palette-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:8px}
    .sfhl-preset{width:30px;height:30px;border-radius:6px;border:2px solid transparent;cursor:pointer;transition:border-color .1s,transform .1s;position:relative}
    .sfhl-preset:hover{transform:scale(1.12);border-color:#90d0fe} .sfhl-preset.active{border-color:#0176d3;box-shadow:0 0 0 1px #0176d3}
    .sfhl-preset-name{position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);font-size:7px;color:#9ca3af;white-space:nowrap;opacity:0;transition:opacity .1s;pointer-events:none}
    .sfhl-preset:hover .sfhl-preset-name{opacity:1}
    .sfhl-palette-custom{display:flex;align-items:center;gap:6px;padding:6px 8px 2px;border-top:1px solid #f3f4f6;margin:0 -8px;cursor:pointer;font-size:11px;color:#6b7280;transition:color .1s}
    .sfhl-palette-custom:hover{color:#0176d3} .sfhl-palette-custom svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2}
    .sfhl-row-acts{display:flex;gap:3px;align-items:center}
    .sfhl-ra{height:22px;border:none;border-radius:4px;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:3px;transition:color .1s,background .1s;padding:0 5px;font-size:10.5px;font-weight:500;white-space:nowrap}
    .sfhl-ra svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
    .sfhl-ra.toggle-on{color:#16a34a} .sfhl-ra.toggle-on svg{fill:#16a34a;stroke:none}
    .sfhl-ra.toggle-off{color:#9ca3af} .sfhl-ra.toggle-off svg{stroke:#9ca3af}
    .sfhl-ra.alarm-on{color:#dc2626} .sfhl-ra.alarm-on svg{stroke:#dc2626;fill:#fee2e2}
    .sfhl-ra.alarm-off svg{stroke:#cbd5e1;fill:none} .sfhl-ra.alarm-off:hover svg{stroke:#dc2626}
    /* #2 Farb-Legende über der Case-Liste */
    .sfhl-legend{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 10px;margin:0 0 4px;background:#f8f9fb;border:1px solid #e5e7eb;border-radius:6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
    .sfhl-legend-ttl{font-size:10.5px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.4px;margin-right:2px}
    .sfhl-legend-chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:#374151;background:#fff;border:1px solid #e5e7eb;border-radius:99px;padding:2px 8px}
    .sfhl-legend-chip b{color:#0176d3;font-size:11px}
    .sfhl-legend-sw{width:10px;height:10px;border-radius:3px;flex-shrink:0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
    .sfhl-legend-bell{font-size:10px}
    /* #3 „Regel aus Auswahl"-Button */
    .sfhl-sel-btn{position:absolute;z-index:2147483646;background:#0176d3;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;font-weight:600;padding:5px 10px;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;user-select:none;white-space:nowrap}
    .sfhl-sel-btn:hover{background:#014486}
    /* v4.6.0 Geräte-Doku-Lookup Popup */
    .sfhl-doku-pop{position:absolute;z-index:2147483646;min-width:200px;max-width:340px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:8px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
    .sfhl-doku-hd{font-size:12px;font-weight:700;color:#0176d3;margin:0 0 6px;word-break:break-all}
    .sfhl-doku-grp{font-size:9.5px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.4px;margin:6px 0 3px}
    .sfhl-doku-row{display:flex;flex-wrap:wrap;gap:5px}
    .sfhl-doku-lnk{display:inline-block;font-size:11.5px;font-weight:600;color:#0176d3;background:#eef4ff;border:1px solid #cfe3fb;border-radius:5px;padding:3px 9px;text-decoration:none;cursor:pointer}
    .sfhl-doku-lnk:hover{background:#0176d3;color:#fff;border-color:#0176d3}
    .sfhl-doku-more{margin-top:8px;font-size:11px;font-weight:600;color:#0176d3;cursor:pointer;user-select:none}
    .sfhl-doku-more:hover{text-decoration:underline}
    /* v4.7.0 Vorlagen-Editor (Stufe 1.5) */
    .sfhl-doku-ed-wrap{margin-top:8px}
    .sfhl-doku-ed{max-height:280px;overflow-y:auto;overflow-x:hidden;padding:2px}
    .sfhl-doku-ed::-webkit-scrollbar{width:4px} .sfhl-doku-ed::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:4px}
    .sfhl-de-card{border:1px solid #e5e7eb;border-radius:6px;padding:6px;margin-bottom:6px;background:#fafafa}
    .sfhl-de-line{display:flex;gap:5px;align-items:center;margin-bottom:4px}
    .sfhl-de-line:last-child{margin-bottom:0}
    .sfhl-de-card input,.sfhl-de-card select{padding:4px 7px;border:1px solid #e5e7eb;border-radius:5px;font-size:11.5px;min-width:0;background:#fff;color:#374151}
    .sfhl-de-card input:focus,.sfhl-de-card select:focus{outline:none;border-color:#0176d3;box-shadow:0 0 0 2px rgba(1,118,211,.1)}
    .sfhl-de-key{width:80px;flex-shrink:0;font-weight:600}
    .sfhl-de-type{flex:1}
    .sfhl-de-label{flex:1}
    .sfhl-de-url{flex:1;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px}
    .sfhl-de-url.sfhl-de-bad{border-color:#e5a000;background:#fffbeb}
    .sfhl-de-del{flex-shrink:0;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:5px;color:#9ca3af;cursor:pointer;font-size:13px;line-height:1}
    .sfhl-de-del:hover{background:#fde8e8;color:#dc2626}
    .sfhl-de-hint{font-size:10.5px;color:#9ca3af;margin:2px 2px 0}
    .sfhl-de-hint b{color:#e5a000}
    /* v4.10.0 Rotierende Auto-Backups */
    .sfhl-backup-list{display:flex;flex-direction:column;gap:6px}
    .sfhl-bk-row{display:flex;align-items:center;gap:8px;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;background:#fafafa}
    .sfhl-bk-meta{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
    .sfhl-bk-when{font-size:12px;font-weight:600;color:#374151}
    .sfhl-bk-reason{font-size:10.5px;color:#6b7280}
    .sfhl-bk-counts{font-size:10px;color:#9ca3af}
    .sfhl-bk-row .sfhl-btn-sm{flex-shrink:0}
    /* #4 Header-Icon in der SLDS-Kopfleiste */
    .sfhl-hdr-item .sfhl-hdr-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;min-width:2rem;background:transparent;border:none;cursor:pointer;color:inherit;padding:0}
    .sfhl-hdr-mark{display:inline-flex;width:20px;height:20px}
    .sfhl-hdr-mark svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .sfhl-hdr-btn .sfhl-hdr-dot{position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;background:#10b981;box-shadow:0 0 0 1.5px rgba(255,255,255,.6)}
    .sfhl-hdr-btn:hover{opacity:.75}
    .sfhl-ra:hover{background:#f3f4f6} .sfhl-ra.del{color:#c4c4c4;padding:0 3px} .sfhl-ra.del:hover{color:#ef4444;background:#fef2f2}
    .sfhl-add-bar{display:flex;gap:6px;padding:8px 16px;border-top:1px solid #f3f4f6;flex-shrink:0}
    .sfhl-add-toggle{display:flex;align-items:center;gap:6px;padding:5px 10px;border:1px dashed #d1d5db;border-radius:6px;background:none;cursor:pointer;color:#9ca3af;font-size:12px;transition:all .15s;width:100%;justify-content:center}
    .sfhl-add-toggle:hover{border-color:#0176d3;color:#0176d3;background:#eef4ff}
    .sfhl-add-toggle svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
    .sfhl-add-form{display:none;padding:10px 16px;border-top:1px solid #f3f4f6;background:#fafafa;flex-shrink:0} .sfhl-add-form.vis{display:block}
    .sfhl-add-row{display:grid;grid-template-columns:minmax(0,1fr) 32px;gap:6px;align-items:center}
    .sfhl-add-form input[type="text"]{padding:7px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12.5px;width:100%}
    .sfhl-add-form input[type="text"]:focus{outline:none;border-color:#0176d3;box-shadow:0 0 0 2px rgba(1,118,211,.1)}
    .sfhl-add-acts{display:flex;gap:6px;margin-top:8px;justify-content:space-between;align-items:center}
    .sfhl-match-badge{font-size:11px;color:#6b7280;display:flex;align-items:center;gap:4px} .sfhl-match-badge .num{font-weight:600;color:#0176d3}
    .sfhl-btn-sm{padding:5px 12px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid #e5e7eb;background:#fff;color:#374151;transition:all .12s} .sfhl-btn-sm:hover{background:#f9fafb}
    .sfhl-btn-primary{background:#0176d3!important;border-color:#0176d3!important;color:#fff!important} .sfhl-btn-primary:hover{background:#014486!important}
    .sfhl-rf-sec{border-top:1px solid #e5e7eb;flex-shrink:0;background:#f9fafb}
    .sfhl-rf-hdr{display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 16px;cursor:pointer;font-size:12.5px;font-weight:500;color:#374151;transition:background .12s} .sfhl-rf-hdr:hover{background:#f3f4f6}
    .sfhl-rf-hdr svg{width:14px;height:14px;stroke:#9ca3af;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .2s} .sfhl-rf-hdr svg.rot{transform:rotate(180deg)}
    .sfhl-sp{font-size:10px;font-weight:600;padding:1px 6px;border-radius:99px;margin-left:8px} .sfhl-sp-on{background:#d1fae5;color:#065f46} .sfhl-sp-off{background:#f1f5f9;color:#64748b}
    .sfhl-rf-body{display:none;padding:0 16px 12px} .sfhl-rf-body.vis{display:block}
    .sfhl-rf-body .rfr{display:flex;align-items:center;gap:10px;margin-bottom:8px} .sfhl-rf-body label{font-size:12px;color:#6b7280;white-space:nowrap}
    .sfhl-rf-body input[type="number"]{width:70px;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;text-align:center;-moz-appearance:textfield}
    .sfhl-rf-body input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none}
    .sfhl-tgl{position:relative;width:36px;height:20px;display:inline-block;flex-shrink:0} .sfhl-tgl input{opacity:0;position:absolute;inset:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:1}
    .sfhl-tgl .sl{position:absolute;inset:0;background:#d1d5db;border-radius:99px;cursor:pointer;transition:background .2s}
    .sfhl-tgl .sl::before{content:'';position:absolute;width:16px;height:16px;left:2px;top:2px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 2px rgba(0,0,0,.15)}
    .sfhl-tgl input:checked+.sl{background:#0176d3} .sfhl-tgl input:checked+.sl::before{transform:translateX(16px)}

    /* ===== Snippets Tab ===== */
    .sfhl-snip-list{flex:1;overflow-y:auto;padding:4px 0;min-height:0}
    .sfhl-snip-list::-webkit-scrollbar{width:4px} .sfhl-snip-list::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:4px}
    .sfhl-snip-row{padding:8px 16px;border-bottom:1px solid #f8f8f8;cursor:pointer;transition:background .1s}
    .sfhl-snip-row:hover{background:#f9fafb}
    .sfhl-snip-row-top{display:flex;align-items:center;gap:8px}
    .sfhl-snip-trigger{font-family:monospace;font-size:12px;font-weight:600;color:#0176d3;background:#eef4ff;padding:1px 6px;border-radius:4px;flex-shrink:0}
    .sfhl-snip-label{font-size:12.5px;font-weight:500;color:#1a1a1a;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sfhl-snip-cat{font-size:10px;color:#9ca3af;flex-shrink:0}
    .sfhl-snip-preview{font-size:11px;color:#9ca3af;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
    .sfhl-snip-acts{display:flex;gap:2px;flex-shrink:0;margin-left:auto}
    .sfhl-snip-copy{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:5px;background:transparent;cursor:pointer;color:#c4c4c4;flex-shrink:0;transition:color .12s,background .12s;padding:0;border:none}
    .sfhl-snip-copy:hover{color:#0176d3;background:#eef4ff}
    .sfhl-snip-copy svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

    /* Snippet editor (inline) */
    .sfhl-snip-editor{display:none;padding:12px 16px;border-top:1px solid #f3f4f6;background:#fafafa;flex-shrink:0;overflow-y:auto;max-height:50vh}
    .sfhl-snip-editor.vis{display:block}
    .sfhl-snip-editor .sfhl-field{margin-bottom:8px}
    .sfhl-snip-editor .sfhl-field label{display:block;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.3px;margin-bottom:3px}
    .sfhl-snip-editor input,.sfhl-snip-editor select{width:100%;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12.5px}
    .sfhl-snip-editor input:focus,.sfhl-snip-editor select:focus,.sfhl-snip-editor textarea:focus{outline:none;border-color:#0176d3;box-shadow:0 0 0 2px rgba(1,118,211,.1)}
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
    .sfhl-dd-num{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;font-size:9.5px;font-weight:700;color:#9ca3af;background:#f3f4f6;border-radius:3px;flex-shrink:0}
    .sfhl-dd-item.selected .sfhl-dd-num{color:#0176d3;background:#eef4ff}
    .sfhl-dd-trigger{font-family:monospace;font-size:11px;font-weight:600;color:#0176d3;background:#eef4ff;padding:1px 5px;border-radius:3px}
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
    .sfhl-folder-hdr{display:flex;align-items:center;gap:6px;padding:5px 12px 5px 16px;cursor:pointer;user-select:none;background:#eef4ff;border-bottom:1px solid #eef4ff;border-top:1px solid #eef4ff;font-size:11px;font-weight:600;color:#014486;transition:background .12s}
    .sfhl-folder-hdr:hover{background:#eef4ff}
    .sfhl-folder-hdr .sfhl-chev{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;transition:transform .2s;flex-shrink:0}
    .sfhl-folder-hdr.collapsed .sfhl-chev{transform:rotate(-90deg)}
    .sfhl-folder-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sfhl-folder-count{font-size:10px;font-weight:500;color:#0176d3;opacity:.7;padding:0 4px}
    .sfhl-folder-del{padding:2px 4px;border-radius:4px;color:#a78bfa;transition:color .1s,background .1s;margin-left:4px;display:flex;align-items:center}
    .sfhl-folder-del:hover{color:#dc2626;background:#fef2f2}
    .sfhl-folder-del svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
    .sfhl-folder-body.collapsed{display:none}
    .sfhl-folder-body .sfhl-row{padding-left:28px}
    .sfhl-folder-hdr.drag-over-folder{background:#ddd6fe!important;outline:2px dashed #0176d3}
    .sfhl-ungrouped-body.drag-over-folder{outline:2px dashed #9ca3af;background:#f9fafb}
    .sfhl-ungrouped-hdr{display:flex;align-items:center;gap:6px;padding:4px 16px;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f3f4f6;background:#fafafa;flex-shrink:0}
    .sfhl-folder-add-btn{display:flex;align-items:center;gap:4px;padding:5px 10px;border:1px dashed #c4b5fd;border-radius:6px;background:none;cursor:pointer;color:#0176d3;font-size:11px;font-weight:500;transition:all .15s;white-space:nowrap;flex-shrink:0}
    .sfhl-folder-add-btn:hover{border-color:#0176d3;background:#eef4ff}

    /* Rich-Text Toolbar */
    .sfhl-rte-wrap{border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;display:none}
    .sfhl-rte-wrap.vis{display:block}
    .sfhl-rte-toolbar{display:flex;gap:2px;padding:4px 6px;background:#f9fafb;border-bottom:1px solid #e5e7eb;flex-wrap:wrap}
    .sfhl-rtb{width:26px;height:26px;border:none;border-radius:4px;background:transparent;cursor:pointer;color:#374151;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;transition:background .1s}
    .sfhl-rtb:hover{background:#e5e7eb} .sfhl-rtb.active{background:#ddd6fe;color:#0176d3}
    .sfhl-rtb svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .sfhl-rte-divider{width:1px;background:#e5e7eb;margin:3px 2px;flex-shrink:0}
    .sfhl-rte-body{min-height:100px;max-height:200px;overflow-y:auto;padding:8px 10px;font-size:12.5px;line-height:1.6;outline:none;word-break:break-word}
    .sfhl-rte-body:focus{box-shadow:inset 0 0 0 2px rgba(1,118,211,.15)}
    .sfhl-rte-body ul,.sfhl-rte-body ol{padding-left:18px;margin:2px 0}
    .sfhl-rte-body a{color:#0176d3;text-decoration:underline}
    /* Usage badge */
    .sfhl-usage-badge{font-size:9.5px;font-weight:600;color:#0176d3;background:#eef4ff;padding:0 5px;border-radius:99px;flex-shrink:0;margin-left:auto}
    /* Settings tab */
    .sfhl-settings-body{flex:1;overflow-y:auto;padding:12px 16px;min-height:0}
    .sfhl-settings-body::-webkit-scrollbar{width:4px} .sfhl-settings-body::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:4px}
    .sfhl-set-section{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #f3f4f6}
    .sfhl-set-section:last-child{border-bottom:none;margin-bottom:0}
    .sfhl-set-section h3{font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px}
    /* Help accordion */
    .sfhl-help-acc{display:flex;flex-direction:column;gap:5px;padding:10px 14px 14px}
    .sfhl-help-sec{border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
    .sfhl-help-hdr{display:flex;align-items:center;gap:9px;padding:10px 12px;cursor:pointer;user-select:none;background:#f9fafb;transition:background .15s}
    .sfhl-help-hdr:hover{background:#f3f4f6}
    .sfhl-help-sec.sfhl-open>.sfhl-help-hdr{background:#eef4ff}
    .sfhl-help-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .sfhl-help-lbl{font-size:12.5px;font-weight:600;color:#374151;flex:1}
    .sfhl-help-chv{width:12px;height:12px;stroke:#9ca3af;fill:none;stroke-width:2;stroke-linecap:round;flex-shrink:0;transition:transform .2s}
    .sfhl-help-sec.sfhl-open>.sfhl-help-hdr>.sfhl-help-chv{transform:rotate(180deg)}
    .sfhl-help-bdy{max-height:0;overflow:hidden;transition:max-height .28s ease}
    .sfhl-help-sec.sfhl-open>.sfhl-help-bdy{max-height:1200px}
    .sfhl-help-inn{padding:10px 14px 12px;font-size:12px;line-height:1.6;color:#374151;border-top:1px solid #f3f4f6}
    .sfhl-help-inn p{margin:0 0 7px}.sfhl-help-inn p:last-child{margin-bottom:0}
    .sfhl-help-inn ul{margin:3px 0 7px 16px;padding:0}.sfhl-help-inn li{margin-bottom:2px}
    .sfhl-help-inn code{background:#f3f4f6;border-radius:3px;padding:1px 4px;font-size:11px;font-family:monospace;color:#0176d3}
    .sfhl-help-tbl{width:100%;border-collapse:collapse;font-size:11.5px;margin:5px 0 6px}
    .sfhl-help-tbl th{text-align:left;padding:4px 7px;font-weight:600;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:11px}
    .sfhl-help-tbl td{padding:4px 7px;border-bottom:1px solid #f9fafb;vertical-align:top}
    .sfhl-help-tbl tr:last-child td{border-bottom:none}
    .sfhl-help-tbl td:first-child{white-space:nowrap;color:#4b5563}
    /* Regel-Tester */
    .sfhl-tester-bar{border-top:1px solid #f3f4f6;flex-shrink:0}
    .sfhl-tester-toggle{display:flex;align-items:center;gap:6px;padding:7px 14px;cursor:pointer;font-size:11.5px;color:#6b7280;user-select:none;transition:background .15s}
    .sfhl-tester-toggle:hover{background:#f9fafb;color:#374151}
    .sfhl-tester-toggle svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;flex-shrink:0}
    .sfhl-tester-chv{margin-left:auto;transition:transform .2s}
    .sfhl-tester-bar.open .sfhl-tester-chv{transform:rotate(180deg)}
    .sfhl-tester-body{display:none;padding:0 14px 10px}
    .sfhl-tester-bar.open .sfhl-tester-body{display:block}
    .sfhl-tester-input{width:100%;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;box-sizing:border-box;outline:none;background:#fff}
    .sfhl-tester-input:focus{border-color:#0176d3;box-shadow:0 0 0 2px rgba(1,118,211,.1)}
    .sfhl-tester-result{margin-top:6px;font-size:11.5px;min-height:20px;display:flex;align-items:center}
    /* Snippet-Vorschau Popup */
    .sfhl-snip-prev{position:fixed;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.18);padding:12px 14px;z-index:2147483648;width:280px;max-height:220px;overflow:hidden;pointer-events:none;opacity:0;transition:opacity .12s}
    .sfhl-snip-prev.vis{opacity:1}
    .sfhl-snip-prev-lbl{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.4px;margin-bottom:7px}
    .sfhl-snip-prev-body{font-size:12px;line-height:1.55;color:#374151;overflow:hidden;max-height:170px}
    .sfhl-snip-prev-body b,.sfhl-snip-prev-body strong{font-weight:600}
    .sfhl-snip-prev-body i,.sfhl-snip-prev-body em{font-style:italic}
    .sfhl-snip-prev-body ul,.sfhl-snip-prev-body ol{padding-left:16px;margin:2px 0}
    .sfhl-snip-prev-body a{color:#0176d3;text-decoration:underline}
    /* Empty states */
    .sfhl-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 16px;gap:7px;color:#9ca3af}
    .sfhl-empty svg{width:38px;height:38px;stroke:#d1d5db;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
    .sfhl-empty-title{font-size:13px;font-weight:600;color:#6b7280;margin:0}
    .sfhl-empty-sub{font-size:11.5px;text-align:center;line-height:1.5;max-width:210px;margin:0}
    /* Hit count badge (Trefferstatistik) */
    .sfhl-hits{font-size:9px;font-weight:700;color:#0176d3;background:#eef4ff;border-radius:99px;padding:1px 5px;flex-shrink:0;cursor:default}
    /* Priority badge */
    .sfhl-rule-prio{min-width:20px;height:20px;border-radius:4px;background:#f3f4f6;color:#b0b7c3;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:monospace}
    .sfhl-row:not(.disabled) .sfhl-rule-prio.has-prio{background:#eef4ff;color:#0176d3}
    /* Category chips */
    .sfhl-cat-chips{display:flex;flex-wrap:wrap;gap:4px;padding:5px 12px 2px;flex-shrink:0;min-height:0}
    .sfhl-cat-chips:empty{display:none}
    .sfhl-cat-chip{padding:2px 9px;border-radius:99px;font-size:11px;font-weight:500;cursor:pointer;border:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;transition:all .12s;white-space:nowrap;user-select:none;line-height:1.7}
    .sfhl-cat-chip:hover{border-color:#c4b5fd;color:#0176d3}
    .sfhl-cat-chip.active{background:#eef4ff;border-color:#0176d3;color:#0176d3;font-weight:600}
    /* RF countdown ring */
    .sfhl-rf-ring-wrap{display:flex;flex-direction:column;align-items:center;padding:14px 0 8px;gap:5px}
    .sfhl-rf-ring{position:relative;width:88px;height:88px;opacity:0;transition:opacity .4s}
    .sfhl-rf-ring.vis{opacity:1}
    .sfhl-rf-ring svg{width:88px;height:88px;transform:rotate(-90deg)}
    .sfhl-rf-ring-bg{fill:none;stroke:#f3f4f6;stroke-width:7}
    .sfhl-rf-ring-prog{fill:none;stroke:#0176d3;stroke-width:7;stroke-linecap:round;stroke-dasharray:263.9;stroke-dashoffset:0;transition:stroke-dashoffset .9s linear}
    .sfhl-rf-ring-lbl{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;color:#374151}
    .sfhl-rf-ring-status{font-size:11px;color:#9ca3af;font-weight:500}
    .sfhl-set-row2{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12.5px;color:#374151}
    .sfhl-set-row2 label{min-width:80px;font-size:12px;color:#6b7280;flex-shrink:0}
    .sfhl-set-row2 input[type="text"],.sfhl-set-row2 select{flex:1;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12.5px}
    .sfhl-set-row2 input:focus,.sfhl-set-row2 select:focus{outline:none;border-color:#0176d3;box-shadow:0 0 0 2px rgba(1,118,211,.1)}
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
    .sfhl-editor-content:focus{box-shadow:inset 0 0 0 2px rgba(1,118,211,.15)}
    .sfhl-editor-content ul,.sfhl-editor-content ol{padding-left:18px;margin:2px 0}
    .sfhl-editor-content a{color:#0176d3;text-decoration:underline;cursor:pointer}

    /* Snippet Drag&Drop (#9) */
    .sfhl-snip-row{cursor:default}
    .sfhl-snip-row[draggable="true"]{cursor:grab}
    .sfhl-snip-row.sfhl-sn-dragging{opacity:.3;background:#eef4ff}
    .sfhl-snip-row.sfhl-sn-over-top{border-top:2px solid #0176d3}
    .sfhl-snip-row.sfhl-sn-over-bot{border-bottom:2px solid #0176d3}
    .sfhl-snip-grip{color:#d1d5db;cursor:grab;flex-shrink:0;padding:0 2px;display:flex;align-items:center}
    .sfhl-snip-grip svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
    .sfhl-snip-row:hover .sfhl-snip-grip{color:#9ca3af}
    /* Kategorie-Umbenennung (#7) */
    .sfhl-cat-hdr span.sfhl-cat-name{cursor:text}
    /* Recently Used (#15) */
    .sfhl-recent-hdr{display:flex;align-items:center;gap:6px;padding:5px 16px;font-size:10px;font-weight:700;color:#0176d3;text-transform:uppercase;letter-spacing:.5px;background:#eef4ff;border-bottom:1px solid #eef4ff}
    /* Lang-Tabs (#34) */
    .sfhl-lang-tab{padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #e5e7eb;background:#fff;color:#9ca3af;transition:all .12s}
    .sfhl-lang-tab.active{background:#eef4ff;border-color:#0176d3;color:#0176d3}
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
    .sfhl-ph-code{font-family:monospace;font-size:11px;font-weight:600;color:#0176d3;background:#eef4ff;padding:1px 5px;border-radius:3px}
    .sfhl-ph-val{font-size:11px;color:#6b7280;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* Markdown-Import (#44) */
    .sfhl-rtb-md{font-size:10px;font-weight:700;letter-spacing:-.3px}

    /* Eingabe-Variable (#45) */
    .sfhl-var-hint{font-size:10px;color:#0176d3;margin-top:2px}
    /* Zeichen-/Wortzähler */
    .sfhl-counter{font-size:10px;color:#9ca3af;margin-top:3px;text-align:right;height:14px}
    .sfhl-counter .warn{color:#f59e0b;font-weight:600}
    /* Spellcheck-Sprachumschalter */
    .sfhl-spell-lang{font-size:10px;color:#9ca3af;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
    .sfhl-spell-lang:hover{color:#0176d3}
    /* Footer */
    .sfhl-footer{padding:6px 16px;text-align:right;font-size:10px;color:#c4c4c4;border-top:1px solid #f3f4f6;flex-shrink:0;letter-spacing:.2px}
    .sfhl-footer a{color:#c4c4c4;text-decoration:none;transition:color .12s}
    .sfhl-footer a:hover{color:#0176d3}
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
          <div class="sfhl-ib sfhl-settings-btn" role="button" tabindex="0" title="Einstellungen">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <div class="sfhl-ib sfhl-help-btn" role="button" tabindex="0" title="Hilfe">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div class="sfhl-ib sfhl-close-btn" role="button" tabindex="0" title="Schlie\u00dfen">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
        </div>
      </div>
      <div class="sfhl-tabs">
        <div class="sfhl-tab active" data-tab="rules"><span data-i18n="Markierung">Markierung</span> <span class="sfhl-tab-badge sfhl-rules-count">0</span></div>
        <div class="sfhl-tab" data-tab="snippets"><span data-i18n="Snippets">Snippets</span> <span class="sfhl-tab-badge sfhl-snip-count">0</span></div>
        <div class="sfhl-tab" data-tab="refresh" data-i18n="Aktualisierung">Aktualisierung</div>
        <div class="sfhl-tab" data-tab="doku" data-i18n="Doku">Doku</div>
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
      <div class="sfhl-tester-bar">
        <div class="sfhl-tester-toggle" role="button">
          <svg viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4"/><line x1="9.5" y1="9.5" x2="14" y2="14"/></svg>Regel testen
          <svg class="sfhl-tester-chv" viewBox="0 0 12 12" style="width:10px;height:10px;stroke:#9ca3af;fill:none;stroke-width:2;stroke-linecap:round"><polyline points="2,4 6,8 10,4"/></svg>
        </div>
        <div class="sfhl-tester-body">
          <input type="text" class="sfhl-tester-input" placeholder="Beispieltext eingeben\u2026">
          <div class="sfhl-tester-result"></div>
        </div>
      </div>
    </div>

    <!-- ===== Snippets Tab ===== -->
    <div class="sfhl-tab-content" data-tab="snippets">
      <div class="sfhl-search"><input type="text" placeholder="Snippets durchsuchen\u2026" class="sfhl-snip-search-input"></div>
      <div class="sfhl-cat-chips"></div>
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
        <div class="sfhl-rf-ring-wrap">
          <div class="sfhl-rf-ring">
            <svg viewBox="0 0 100 100"><circle class="sfhl-rf-ring-bg" cx="50" cy="50" r="42"/><circle class="sfhl-rf-ring-prog" cx="50" cy="50" r="42"/></svg>
            <span class="sfhl-rf-ring-lbl">–</span>
          </div>
          <span class="sfhl-rf-ring-status"></span>
        </div>
      </div>
    </div>

    <!-- ===== Ger\u00e4te-Doku Tab ===== -->
    <div class="sfhl-tab-content" data-tab="doku">
      <div class="sfhl-settings-body">
        <div class="sfhl-set-section">
          <h3 data-i18n="Ger\u00e4te-Doku">Ger\u00e4te-Doku</h3>
          <div class="sfhl-set-row2"><label data-i18n="Doku-Lookup">Doku-Lookup</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-doku-enabled"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Ger\u00e4tecode markieren \u2192 \u201e\ud83d\udcc4 Doku-Links"</span></div>
          <p style="font-size:11px;color:#9ca3af;margin:2px 0 6px"><span class="sfhl-doku-count">0</span> Link-Vorlagen geladen. Vorlagen werden per Config-Datei importiert (keine im Skript hinterlegt).</p>
          <div class="sfhl-set-actions">
            <div class="sfhl-btn-sm sfhl-act-doku-edit" role="button">\u270e Vorlagen bearbeiten</div>
            <div class="sfhl-btn-sm sfhl-act-doku-import" role="button">\u2191 Importieren</div>
            <div class="sfhl-btn-sm sfhl-act-doku-export" role="button">\u2193 Exportieren</div>
            <div class="sfhl-btn-danger sfhl-act-doku-clear" role="button">Leeren</div>
          </div>
          <div class="sfhl-doku-ed-wrap" style="display:none">
            <div class="sfhl-doku-ed"></div>
            <div class="sfhl-set-actions" style="margin-top:6px">
              <div class="sfhl-btn-sm sfhl-btn-primary sfhl-act-doku-add" role="button">+ Vorlage</div>
            </div>
            <p class="sfhl-de-hint">K\u00fcrzel = Link-Beschriftung (z.\u202fB. BA, TI). URL muss <b>%s</b> enthalten \u2014 wird durch den markierten Code ersetzt. Typ steuert, bei welcher Code-Art die Vorlage erscheint.</p>
          </div>
        </div>
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
          <p style="font-size:11px;color:#9ca3af;margin-top:6px">Tip: Type <code>;;en</code> to temporarily show English snippets, <code>;;de</code> for German. Das Panel öffnet immer auch mit <code>Alt+R</code>.</p>
        </div>
        <div class="sfhl-set-section">
          <h3 data-i18n="E-Mail Bausteine">E-Mail Bausteine</h3>
          <div class="sfhl-set-row2"><label data-i18n="Auto-Wrap">Auto-Wrap</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-wrap-enabled"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Anrede + Signatur automatisch einf\u00fcgen</span></div>
          <div class="sfhl-set-row2"><label data-i18n="Anrede">Anrede</label><select class="sfhl-wrap-anrede"></select></div>
          <div class="sfhl-set-row2"><label data-i18n="Signatur">Signatur</label><select class="sfhl-wrap-sig"></select></div>
          <p style="font-size:11px;color:#9ca3af;margin-top:6px">Wenn aktiv, wird beim Einf\u00fcgen eines Snippets automatisch die Anrede davor und die Signatur danach eingef\u00fcgt. Gilt nicht wenn das Snippet selbst die Anrede oder Signatur ist.</p>
          <div class="sfhl-set-row2" style="margin-top:10px"><label data-i18n="Vorschau">Vorschau</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-preview-enabled"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px" data-i18n="Vor dem Einf\u00fcgen Vorschau zeigen und {eingabe:}-Felder abfragen">Vor dem Einf\u00fcgen Vorschau zeigen und {eingabe:}-Felder abfragen</span></div>
        </div>
        <div class="sfhl-set-section">
          <h3 data-i18n="SLA-Alarm">SLA-Alarm</h3>
          <div class="sfhl-set-row2"><label data-i18n="Tab-Blinken">Tab-Blinken</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-sla-blink"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Tab-Titel blinkt bei neuem Treffer</span></div>
          <div class="sfhl-set-row2"><label data-i18n="Ton">Ton</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-sla-sound"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Kurzer Signalton</span></div>
          <div class="sfhl-set-row2"><label data-i18n="Benachrichtigung">Benachrichtigung</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-sla-notify"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Desktop-Benachrichtigung</span></div>
          <p style="font-size:11px;color:#9ca3af;margin-top:6px">Greift, wenn der Auto-Refresh einen <b>neuen</b> Treffer einer Regel mit aktiviertem <span style="color:#dc2626">\ud83d\udd14</span>-Alarm findet. Alarm pro Regel \u00fcber das Glocken-Symbol in der Markierungs-Liste schalten.</p>
        </div>
        <div class="sfhl-set-section">
          <h3 data-i18n="Liste">Liste</h3>
          <div class="sfhl-set-row2"><label data-i18n="Farb-Legende">Farb-Legende</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-legend-enabled"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Legende der aktiven Markierungen \u00fcber der Case-Liste</span></div>
          <div class="sfhl-set-row2"><label data-i18n="Regel aus Auswahl">Regel aus Auswahl</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-selrule-enabled"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Listentext markieren \u2192 Schaltfl\u00e4che \u201eRegel aus Auswahl"</span></div>
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
          <h3 data-i18n="Sicherung">Sicherung</h3>
          <p style="font-size:11px;color:#9ca3af;margin:0 0 8px">Vor jedem Import oder Zur\u00fccksetzen wird der vorherige Stand automatisch gesichert (die letzten 3). Wiederherstellen sichert vorher den aktuellen Stand.</p>
          <div class="sfhl-backup-list"></div>
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
      <div class="sfhl-settings-body" style="padding:0">
        <div class="sfhl-help-acc">

          <div class="sfhl-help-sec sfhl-open">
            <div class="sfhl-help-hdr">
              <div class="sfhl-help-dot" style="background:#0176d3"></div>
              <span class="sfhl-help-lbl">\u00dcberblick</span>
              <svg class="sfhl-help-chv" viewBox="0 0 12 12"><polyline points="2,4 6,8 10,4"/></svg>
            </div>
            <div class="sfhl-help-bdy"><div class="sfhl-help-inn">
              <p>Dieses Tool erweitert Salesforce Lightning um drei Hauptfunktionen: <b>Zeilen-Markierung</b> in Case-Listen, <b>Text-Snippets</b> mit Platzhaltern und <b>Auto-Refresh</b> mit Countdown.</p>
              <p>Das Panel \u00f6ffnet sich mit dem <b>SF Tools</b>-Button unten rechts oder mit <code>Alt+R</code>. Die Breite l\u00e4sst sich am linken Rand per Drag &amp; Drop ver\u00e4ndern.</p>
            </div></div>
          </div>

          <div class="sfhl-help-sec">
            <div class="sfhl-help-hdr">
              <div class="sfhl-help-dot" style="background:#f59e0b"></div>
              <span class="sfhl-help-lbl">Markierung (Regeln)</span>
              <svg class="sfhl-help-chv" viewBox="0 0 12 12"><polyline points="2,4 6,8 10,4"/></svg>
            </div>
            <div class="sfhl-help-bdy"><div class="sfhl-help-inn">
              <p>Markiert Zeilen in Case-Listen farbig. Regeln werden in der Reihenfolge gepr\u00fcft \u2014 die <b>erste passende Regel</b> gewinnt.</p>
              <table class="sfhl-help-tbl">
                <tr><th>Operator</th><th>Bedeutung</th><th>Beispiel</th></tr>
                <tr><td><code>Begriff</code></td><td>Textsuche (case-insensitive)</td><td><code>dringend</code></td></tr>
                <tr><td><code>A + B</code></td><td>UND: beide m\u00fcssen vorkommen</td><td><code>SLA + dringend</code></td></tr>
                <tr><td><code>A | B</code></td><td>ODER: mindestens einer</td><td><code>urgent | eilig</code></td></tr>
                <tr><td><code>!text</code></td><td>NICHT: darf nicht vorkommen</td><td><code>SLA + !closed</code></td></tr>
                <tr><td><code>/regex/i</code></td><td>Regul\u00e4rer Ausdruck</td><td><code>/Fehler\s*\d+/i</code></td></tr>
              </table>
              <p><b>Ordner:</b> Regeln lassen sich in Ordnern gruppieren. \u201eOrdner\u201c-Button erstellt einen neuen Ordner, Regeln per Drag &amp; Drop hineinziehen.</p>
            </div></div>
          </div>

          <div class="sfhl-help-sec">
            <div class="sfhl-help-hdr">
              <div class="sfhl-help-dot" style="background:#10b981"></div>
              <span class="sfhl-help-lbl">Snippets / Textbausteine</span>
              <svg class="sfhl-help-chv" viewBox="0 0 12 12"><polyline points="2,4 6,8 10,4"/></svg>
            </div>
            <div class="sfhl-help-bdy"><div class="sfhl-help-inn">
              <p>Tippe <code>;;</code> (oder deinen Trigger-Prefix) in ein beliebiges Textfeld. Das Dropdown \u00f6ffnet sich und filtert beim Weitertippen.</p>
              <p><b>Navigation:</b> <code>\u2191\u2193</code> ausw\u00e4hlen &nbsp;&middot;&nbsp; <code>Enter</code>/<code>Tab</code> einf\u00fcgen &nbsp;&middot;&nbsp; <code>Esc</code> schlie\u00dfen</p>
              <p><b>Sprache:</b> <code>;;en gruss</code> zeigt EN-Variante &nbsp;&middot;&nbsp; <code>;;de gruss</code> zeigt DE-Variante</p>
              <p><b>Platzhalter:</b></p>
              <table class="sfhl-help-tbl">
                <tr><th>Platzhalter</th><th>Wert</th></tr>
                <tr><td><code>{name}</code></td><td>Dein Name (aus Einstellungen)</td></tr>
                <tr><td><code>{datum}</code> / <code>{uhrzeit}</code></td><td>Heutiges Datum / Uhrzeit</td></tr>
                <tr><td><code>{case}</code></td><td>Vorgangsnummer</td></tr>
                <tr><td><code>{anrede}</code> / <code>{nachname}</code></td><td>Anrede / Nachname des Kontakts</td></tr>
                <tr><td><code>{firma}</code></td><td>Firmenname (Account)</td></tr>
                <tr><td><code>{seriennummer}</code></td><td>Seriennummer aus dem Case</td></tr>
                <tr><td><code>{|}</code></td><td>Cursor-Position nach Einf\u00fcgen</td></tr>
                <tr><td><code>{eingabe:Text}</code></td><td>Fragt interaktiv nach dem Wert</td></tr>
                <tr><td><code>{!Case.Subject}</code></td><td>SF Merge-Feld (DOM-basiert)</td></tr>
              </table>
              <p><b>Auto-Wrap</b> (in Einstellungen): F\u00fcgt automatisch Anrede und Signatur um jeden Textbaustein. Weitere Features: Favoriten, Kategorien, Nutzungsz\u00e4hler, Duplizieren, Teilen via Link.</p>
            </div></div>
          </div>

          <div class="sfhl-help-sec">
            <div class="sfhl-help-hdr">
              <div class="sfhl-help-dot" style="background:#3b82f6"></div>
              <span class="sfhl-help-lbl">Auto-Refresh</span>
              <svg class="sfhl-help-chv" viewBox="0 0 12 12"><polyline points="2,4 6,8 10,4"/></svg>
            </div>
            <div class="sfhl-help-bdy"><div class="sfhl-help-inn">
              <p>Klickt automatisch den SF-Refresh-Button in Case-Listen. Ein Countdown im Button zeigt die Sekunden bis zur n\u00e4chsten Aktualisierung.</p>
              <ul>
                <li>Neu eingetroffene Eintr\u00e4ge blinken kurz auf</li>
                <li>Refresh wird \u00fcbersprungen, wenn aktiv getippt wird (verhindert Datenverlust)</li>
                <li>Intervall frei einstellbar (min. 5 Sek.)</li>
              </ul>
            </div></div>
          </div>

          <div class="sfhl-help-sec">
            <div class="sfhl-help-hdr">
              <div class="sfhl-help-dot" style="background:#8b5cf6"></div>
              <span class="sfhl-help-lbl">Einstellungen &amp; Export</span>
              <svg class="sfhl-help-chv" viewBox="0 0 12 12"><polyline points="2,4 6,8 10,4"/></svg>
            </div>
            <div class="sfhl-help-bdy"><div class="sfhl-help-inn">
              <ul>
                <li><b>Trigger-Prefix</b> \u2014 z.B. <code>;;</code>, <code>::</code>, <code>//</code></li>
                <li><b>Dein Name</b> \u2014 wird f\u00fcr <code>{name}</code> verwendet</li>
                <li><b>Default language</b> \u2014 Snippet-Variante DE/EN beim Einf\u00fcgen</li>
                <li><b>Auto-Wrap</b> \u2014 Anrede/Signatur automatisch ein-/ausschalten</li>
                <li><b>Export</b> \u2014 Regeln + Snippets als JSON-Datei sichern</li>
                <li><b>Import</b> \u2014 JSON-Datei einlesen (ersetzt bestehende Daten)</li>
              </ul>
            </div></div>
          </div>

          <div class="sfhl-help-sec">
            <div class="sfhl-help-hdr">
              <div class="sfhl-help-dot" style="background:#6b7280"></div>
              <span class="sfhl-help-lbl">Tastenk\u00fcrzel</span>
              <svg class="sfhl-help-chv" viewBox="0 0 12 12"><polyline points="2,4 6,8 10,4"/></svg>
            </div>
            <div class="sfhl-help-bdy"><div class="sfhl-help-inn">
              <table class="sfhl-help-tbl">
                <tr><th>K\u00fcrzel</th><th>Aktion</th></tr>
                <tr><td><code>Alt+R</code></td><td>Panel \u00f6ffnen / schlie\u00dfen</td></tr>
                <tr><td><code>Esc</code></td><td>Panel oder Dropdown schlie\u00dfen</td></tr>
                <tr><td><code>;;</code></td><td>Snippet-Dropdown \u00f6ffnen (in Textfeldern)</td></tr>
                <tr><td><code>\u2191 \u2193</code></td><td>Im Dropdown navigieren</td></tr>
                <tr><td><code>Alt+1</code>\u2026<code>9</code></td><td>Eintrag 1\u20139 direkt einf\u00fcgen</td></tr>
                <tr><td><code>Enter</code> / <code>Tab</code></td><td>Snippet einf\u00fcgen</td></tr>
              </table>
            </div></div>
          </div>

          <div class="sfhl-help-sec">
            <div class="sfhl-help-hdr">
              <div class="sfhl-help-dot" style="background:#ef4444"></div>
              <span class="sfhl-help-lbl">Probleme &amp; Tipps</span>
              <svg class="sfhl-help-chv" viewBox="0 0 12 12"><polyline points="2,4 6,8 10,4"/></svg>
            </div>
            <div class="sfhl-help-bdy"><div class="sfhl-help-inn">
              <table class="sfhl-help-tbl">
                <tr><th>Problem</th><th>L\u00f6sung</th></tr>
                <tr><td>Markierung fehlt</td><td>Seite neu laden (F5), Regeln pr\u00fcfen</td></tr>
                <tr><td>Snippet-Dropdown erscheint nicht</td><td>Prefix in Einstellungen pr\u00fcfen (Standard: <code>;;</code>)</td></tr>
                <tr><td>Anrede / Name leer</td><td>Feld muss im SF-Layout sichtbar sein, Seite neu laden</td></tr>
                <tr><td>Auto-Refresh stoppt</td><td>F12 \u00f6ffnen, auf <code>[SFHL]</code>-Meldungen achten</td></tr>
                <tr><td>Regeln verschwunden</td><td>localStorage gel\u00f6scht? \u2192 Export-Datei einspielen</td></tr>
              </table>
              <p><b>Debug:</b> Alle Skript-Meldungen erscheinen in der Browser-Konsole (F12) mit dem Prefix <code>[SFHL]</code>.</p>
            </div></div>
          </div>

        </div>
      </div>
    </div>

    <div class="sfhl-footer">v${VERSION} &nbsp;·&nbsp; Tobias Jurgan &nbsp;·&nbsp; <a href="https://github.com/tJ-ek0/Tampermonkey-Salesforce-tools" target="_blank" rel="noopener">GitHub ↗</a> &nbsp;·&nbsp; <a href="https://opentoolkit.de" target="_blank" rel="noopener">opentoolkit.de ↗</a></div>
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
  const snipPrev = document.createElement('div'); snipPrev.className = 'sfhl-snip-prev';
  document.documentElement.appendChild(snipPrev);
  let _snipPrevTimer = null;

  // ===== Refs =====
  const $ = s => panel.querySelector(s);
  const listEl      = $('.sfhl-list');
  const snipListEl  = $('.sfhl-snip-list');
  const catChipsEl  = $('.sfhl-cat-chips');
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
  const previewCb   = $('.sfhl-preview-enabled');
  const slaBlinkCb  = $('.sfhl-sla-blink');
  const slaSoundCb  = $('.sfhl-sla-sound');
  const slaNotifyCb = $('.sfhl-sla-notify');
  const legendCb    = $('.sfhl-legend-enabled');
  const selRuleCb   = $('.sfhl-selrule-enabled');
  const dokuCb      = $('.sfhl-doku-enabled');
  const dokuCountEl = $('.sfhl-doku-count');

  rfInput.value = String(loadRefreshSecs());
  rfCb.checked = loadRefreshOn();
  setPrefix.value = loadPrefix();
  setUname.value = loadUname();
  setLang.value = loadDefaultLang();
  wrapCb.checked = loadWrapOn();
  previewCb.checked = loadPreviewOn();
  slaBlinkCb.checked = loadSla('blink');
  slaSoundCb.checked = loadSla('sound');
  slaNotifyCb.checked = loadSla('notify');
  legendCb.checked = loadLegendOn();
  selRuleCb.checked = loadSelRuleOn();
  dokuCb.checked = loadDokuOn();
  function updateDokuCount() { if (dokuCountEl) dokuCountEl.textContent = String(loadDokuLinks().length); }
  // v4.7.0 Vorlagen-Editor (Stufe 1.5): In-UI bearbeiten statt nur Import.
  const DOKU_TYPES = [['root','Produkt-Root'],['serial','Seriennummer'],['auftrag','Auftragsnummer'],['order','Ordercode'],['free','Suche']];
  let dokuEditArr = null;
  function renderDokuEditor() {
    const box = $('.sfhl-doku-ed'); if (!box) return;
    if (!dokuEditArr) dokuEditArr = loadDokuLinks();
    if (!dokuEditArr.length) { box.innerHTML = '<p class="sfhl-de-hint" style="margin:6px 2px">Noch keine Vorlagen — „+ Vorlage" anlegen oder oben eine Config importieren.</p>'; return; }
    box.innerHTML = dokuEditArr.map(e => {
      const opts = DOKU_TYPES.map(([v,l]) => `<option value="${v}"${e.type===v?' selected':''}>${escH(l)}</option>`).join('');
      const bad = !/%s/.test(e.url || '');
      return `<div class="sfhl-de-card" data-id="${escH(e.id)}">
        <div class="sfhl-de-line">
          <input class="sfhl-de-key" type="text" value="${escH(e.key)}" placeholder="Kürzel" maxlength="24">
          <select class="sfhl-de-type">${opts}</select>
          <div class="sfhl-de-del" role="button" title="Vorlage löschen">✕</div>
        </div>
        <div class="sfhl-de-line"><input class="sfhl-de-label" type="text" value="${escH(e.label)}" placeholder="Beschriftung (optional)" maxlength="100"></div>
        <div class="sfhl-de-line"><input class="sfhl-de-url${bad?' sfhl-de-bad':''}" type="text" value="${escH(e.url)}" placeholder="https://…%s…" maxlength="500"></div>
      </div>`;
    }).join('');
  }
  updateDokuCount();

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
    $('.sfhl-help-btn').classList.toggle('active', tabName === 'help');
    $('.sfhl-settings-btn').classList.toggle('active', tabName === 'settings');
    snipEditor.classList.remove('vis');
    panel.querySelectorAll('.sfhl-add-bar').forEach(b => b.style.display = 'flex');
    addForm.classList.remove('vis');
  }
  panel.querySelectorAll('.sfhl-tab').forEach(tab => { tab.onclick = () => switchTab(tab.dataset.tab); });
  $('.sfhl-settings-btn').onclick = () => {
    const isSettings = $('.sfhl-tab-content[data-tab="settings"]').classList.contains('active');
    switchTab(isSettings ? 'rules' : 'settings');
  };
  $('.sfhl-help-btn').onclick = () => {
    const isHelp = $('.sfhl-tab-content[data-tab="help"]').classList.contains('active');
    switchTab(isHelp ? 'rules' : 'help');
  };

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
    // QF3: !e.ctrlKey — sonst feuert AltGr+R (= Ctrl+Alt+R auf DE-Tastaturen) das Panel
    if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); panel.classList.contains('open') ? closePanel() : openPanel(); }
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
  // v4.6.0 Geräte-Doku-Lookup
  dokuCb.onchange = () => { saveDokuOn(dokuCb.checked); toast(dokuCb.checked ? 'Doku-Lookup an' : 'Doku-Lookup aus', 'info'); };
  $('.sfhl-act-doku-export').onclick = () => {
    try {
      const dt=new Date(), pad=n=>String(n).padStart(2,'0'), ds=`${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
      const blob = new Blob([JSON.stringify({ dokuLinks: loadDokuLinks() }, null, 2)], { type:'application/json' });
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`sfhl_doku_links_${ds}.json`;
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
      toast('Doku-Links exportiert','success');
    } catch { toast('Export fehlgeschlagen','error'); }
  };
  $('.sfhl-act-doku-import').onclick = () => {
    const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,.txt';
    inp.onchange = async ev => {
      const f=ev.target.files?.[0]; if(!f) return;
      try {
        const raw=JSON.parse(await f.text());
        const arr=Array.isArray(raw)?raw:(raw.dokuLinks||raw.links||null);
        if(!Array.isArray(arr)){ toast('Kein gültiges Doku-Link-Format','error',3500); return; }
        const TYPES=['root','serial','auftrag','order','free'];
        const clean=arr.map(e=>({ id:uid(), key:String(e.key||'').slice(0,24), label:String(e.label||'').slice(0,100), type:TYPES.includes(e.type)?e.type:'root', url:String(e.url||'').slice(0,500) })).filter(e=>e.url && /%s/.test(e.url));
        saveDokuLinks(clean); dokuEditArr = null; updateDokuCount(); renderDokuEditor();
        toast(`${clean.length} Doku-Links importiert`,'success');
      } catch { toast('Ungültiges Format','error',3500); }
    };
    inp.click();
  };
  $('.sfhl-act-doku-clear').onclick = () => {
    if(!confirm(t('Alle Doku-Link-Vorlagen löschen?'))) return;
    saveDokuLinks([]); dokuEditArr = null; updateDokuCount(); renderDokuEditor(); toast('Doku-Links geleert','info');
  };
  // v4.7.0 Vorlagen-Editor: Aufklappen, Hinzufügen, Inline-Bearbeiten, Löschen
  const dokuEdWrap = $('.sfhl-doku-ed-wrap');
  $('.sfhl-act-doku-edit').onclick = () => {
    const open = dokuEdWrap.style.display !== 'none';
    if (open) { dokuEdWrap.style.display = 'none'; return; }
    renderDokuEditor(); dokuEdWrap.style.display = '';
  };
  $('.sfhl-act-doku-add').onclick = () => {
    if (!dokuEditArr) dokuEditArr = loadDokuLinks();
    dokuEditArr.push({ id:uid(), key:'', label:'', type:'root', url:'' });
    saveDokuLinks(dokuEditArr); updateDokuCount(); renderDokuEditor();
    const box = $('.sfhl-doku-ed'); const last = box && box.querySelector('.sfhl-de-card:last-child .sfhl-de-key'); if (last) last.focus();
  };
  function dokuEdEntry(target) {
    const card = target.closest('.sfhl-de-card'); if (!card || !dokuEditArr) return null;
    return dokuEditArr.find(x => x.id === card.dataset.id) || null;
  }
  $('.sfhl-doku-ed').addEventListener('input', e => {
    const it = dokuEdEntry(e.target); if (!it) return;
    if (e.target.matches('.sfhl-de-key')) it.key = e.target.value;
    else if (e.target.matches('.sfhl-de-label')) it.label = e.target.value;
    else if (e.target.matches('.sfhl-de-url')) { it.url = e.target.value; e.target.classList.toggle('sfhl-de-bad', !/%s/.test(it.url)); }
    else return;
    saveDokuLinks(dokuEditArr); updateDokuCount();
  });
  $('.sfhl-doku-ed').addEventListener('change', e => {
    const it = dokuEdEntry(e.target); if (!it || !e.target.matches('.sfhl-de-type')) return;
    it.type = e.target.value; saveDokuLinks(dokuEditArr);
  });
  $('.sfhl-doku-ed').addEventListener('click', e => {
    if (!e.target.closest('.sfhl-de-del')) return;
    const card = e.target.closest('.sfhl-de-card'); if (!card || !dokuEditArr) return;
    dokuEditArr = dokuEditArr.filter(x => x.id !== card.dataset.id);
    saveDokuLinks(dokuEditArr); updateDokuCount(); renderDokuEditor();
  });
  $('.sfhl-act-reset').onclick  = () => doReset();
  $('.sfhl-act-reset-rules').onclick = () => {
    if (!confirm(t('Markierungsregeln auf Standard zur\u00fccksetzen?'))) return;
    pushBackup('reset-rules');
    RULES = RULE_DEFAULTS.map(e=>({...e,id:uid(),folder:null})); saveRules(); renderRules(); rescanSoon(true);
    updateBadges(); renderBackups(); toast('Markierungen zur\u00fcckgesetzt','info');
  };
  $('.sfhl-act-reset-snips').onclick = () => {
    if (!confirm(t('Snippets auf Standard zur\u00fccksetzen?'))) return;
    pushBackup('reset-snips');
    SNIPPETS = SNIP_DEFAULTS.map(e=>({...e,id:uid(),favorite:!!e.favorite})); saveSnippets(); renderSnippets();
    updateBadges(); renderBackups(); toast('Snippets zur\u00fcckgesetzt','info');
  };
  $('.sfhl-backup-list').addEventListener('click', e => {
    const b = e.target.closest('.sfhl-act-bk-restore'); if (b) restoreBackup(+b.dataset.bk);
  });

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
    const hdr = e.target.closest('.sfhl-help-hdr');
    if (hdr) { const sec = hdr.closest('.sfhl-help-sec'); if (sec) sec.classList.toggle('sfhl-open'); }
  });
  // FIX #18: Kurzschluss wenn Palette nicht sichtbar — vermeidet closest()-Traversal bei jedem Klick
  document.addEventListener('click', e => { if (!paletteEl.classList.contains('vis')) return; if (!e.target.closest('.sfhl-palette') && !e.target.closest('.sfhl-sw')) closePalette(); });
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
    RULES.unshift({ id:uid(), term, color:addSw?.dataset.color||addColorEl.value||'#ffffcc', enabled:true, alarm:false });
    saveRules(); renderRules(); rescanSoon(true); addTermEl.value = '';
    if (addSw) { addSw.dataset.color='#e6ffe6'; const f=addSw.querySelector('.sfhl-sw-fill'); if(f) f.style.background='#e6ffe6'; } if(addColorEl) addColorEl.value='#e6ffe6';
    addForm.classList.remove('vis'); panel.querySelector('[data-tab="rules"] .sfhl-add-bar').style.display='flex';
    // QF2: bei stillem Regex-Fehler warnen statt Erfolg zu melden (Einzeltoast-Policy)
    if (invalidRegexIn(term).length) toast('Ung\u00fcltige Regex \u2014 Regel wird als einfache Textsuche behandelt','error',4500);
    else toast('Regel hinzugef\u00fcgt','success');
  };
  addTermEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('.sfhl-add-save').click(); } });
  $('.sfhl-tester-toggle').onclick = () => {
    const bar = $('.sfhl-tester-bar');
    const isOpen = bar.classList.toggle('open');
    if (isOpen) bar.querySelector('.sfhl-tester-input').focus();
  };
  $('.sfhl-tester-input').addEventListener('input', e => {
    const txt = e.target.value.trim();
    const res = $('.sfhl-tester-result');
    if (!txt) { res.innerHTML = ''; return; }
    const match = bestMatch(txt);
    if (match) {
      res.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px 3px 6px;border-radius:5px;background:${escH(match.color)};font-size:11.5px"><span style="width:8px;height:8px;border-radius:50%;background:rgba(0,0,0,.12);flex-shrink:0"></span><b>${escH(match.term)}</b></span>`;
    } else {
      res.innerHTML = '<span style="color:#9ca3af;font-size:11.5px">Keine Regel trifft zu.</span>';
    }
  });

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
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
      localStorage.setItem(LS_LAST_EXPORT, String(Date.now())); // Backup-Reminder zurücksetzen
      toast('Exportiert','success');
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
      pushBackup('import'); renderBackups(); // aktuellen Stand sichern, bevor er ersetzt wird
      if (Array.isArray(raw)) { RULES = raw.map(e=>({id:e.id||uid(),term:String(e.term||''),color:safeColor(e.color),enabled:e.enabled!==false,alarm:e.alarm===true})); saveRules(); renderRules(); rescanSoon(true); toast(`${RULES.length} Regeln importiert`,'success'); return; }
      if (raw.rules) { RULES = raw.rules.map(e=>({id:e.id||uid(),term:String(e.term||''),color:safeColor(e.color),enabled:e.enabled!==false,folder:e.folder||null,alarm:e.alarm===true})); saveRules(); renderRules(); rescanSoon(true); }
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
  // v4.10.0 Rotierende Auto-Backups: vor Import/Reset den aktuellen Stand sichern (max 3, neueste zuerst).
  const BACKUP_MAX = 3;
  const BACKUP_REASONS = { 'import':'vor Import', 'reset-all':'vor \u201eAlles zur\u00fccksetzen"', 'reset-rules':'vor \u201eMarkierungen zur\u00fccksetzen"', 'reset-snips':'vor \u201eSnippets zur\u00fccksetzen"', 'restore':'vor Wiederherstellung' };
  function loadBackups() { try { const r = localStorage.getItem(LS_BACKUPS); const a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a : []; } catch { return []; } }
  function pushBackup(reason) {
    try {
      const snap = { at: Date.now(), reason, rules: RULES, folders: FOLDERS, snippets: SNIPPETS, prefix: loadPrefix(), username: loadUname() };
      let arr = loadBackups(); arr.unshift(snap); arr = arr.slice(0, BACKUP_MAX);
      // Quota-sicher: bei \u00dcberlauf \u00e4lteste verwerfen und erneut versuchen
      while (arr.length) {
        try { localStorage.setItem(LS_BACKUPS, JSON.stringify(arr)); break; }
        catch { arr.pop(); if (!arr.length) console.warn('[SFHL] Auto-Backup zu gro\u00df f\u00fcr localStorage, \u00fcbersprungen'); }
      }
    } catch (e) { console.warn('[SFHL] Auto-Backup fehlgeschlagen:', e); }
  }
  function renderBackups() {
    const box = $('.sfhl-backup-list'); if (!box) return;
    const arr = loadBackups();
    if (!arr.length) { box.innerHTML = '<p style="font-size:11px;color:#9ca3af;margin:2px">Noch keine Sicherungen vorhanden.</p>'; return; }
    const pad = n => String(n).padStart(2,'0');
    box.innerHTML = arr.map((s,i) => {
      const d = new Date(s.at||0);
      const ds = `${pad(d.getDate())}.${pad(d.getMonth()+1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const nR = Array.isArray(s.rules)?s.rules.length:0, nS = Array.isArray(s.snippets)?s.snippets.length:0;
      const reason = BACKUP_REASONS[s.reason] || s.reason || '';
      return `<div class="sfhl-bk-row"><div class="sfhl-bk-meta"><span class="sfhl-bk-when">${escH(ds)}</span><span class="sfhl-bk-reason">${escH(reason)}</span><span class="sfhl-bk-counts">${nR} Regeln \u00b7 ${nS} Snippets</span></div><div class="sfhl-btn-sm sfhl-act-bk-restore" data-bk="${i}" role="button">Wiederherstellen</div></div>`;
    }).join('');
  }
  function restoreBackup(idx) {
    const arr = loadBackups(); const snap = arr[idx]; if (!snap) return;
    if (!confirm(t('Diesen Sicherungsstand wiederherstellen? Der aktuelle Stand wird vorher gesichert.'))) return;
    pushBackup('restore'); // aktuellen Stand sichern \u2192 Wiederherstellung ist selbst r\u00fcckg\u00e4ngig machbar
    if (Array.isArray(snap.rules)) { RULES = snap.rules.map(e=>({id:e.id||uid(),term:String(e.term||''),color:safeColor(e.color),enabled:e.enabled!==false,folder:e.folder||null,alarm:e.alarm===true})); saveRules(); renderRules(); rescanSoon(true); }
    if (Array.isArray(snap.folders)) { FOLDERS = snap.folders.map(f=>({id:f.id||uid(),name:String(f.name||'')})); saveFolders(); }
    if (Array.isArray(snap.snippets)) { SNIPPETS = snap.snippets.map(e=>({ id:e.id||uid(), trigger:String(e.trigger||''), label:String(e.label||''), body:String(e.body||''), bodyEn:String(e.bodyEn||''), category:String(e.category||''), richText:e.richText!==false, favorite:!!e.favorite, usageCount:Number(e.usageCount)||0 })); saveSnippets(true); renderSnippets(); }
    if (snap.prefix && PREFIXES.includes(snap.prefix)) { savePrefix(snap.prefix); if (setPrefix) setPrefix.value = snap.prefix; }
    if (snap.username) { saveUname(snap.username); if (setUname) setUname.value = snap.username; }
    updateBadges(); renderBackups(); toast('Sicherung wiederhergestellt','success');
  }
  function doReset() {
    if (!confirm(t('Alles auf Standard zur\u00fccksetzen? (Regeln + Snippets)'))) return;
    pushBackup('reset-all');
    RULES = RULE_DEFAULTS.map(e=>({...e,id:uid(),folder:null})); saveRules(); renderRules(); rescanSoon(true);
    FOLDERS = []; saveFolders();
    SNIPPETS = SNIP_DEFAULTS.map(e=>({...e,id:uid(),favorite:!!e.favorite})); saveSnippets(); renderSnippets();
    updateBadges(); renderBackups(); toast('Zur\u00fcckgesetzt','info');
  }
  renderBackups(); // initiale Liste beim Panel-Aufbau

  // Trefferstatistik: wie viele Zeilen der aktuellen Liste trifft jede Regel
  // (unabhängig von Priorität/first-wins). 3s-Cache, damit die Regel-Suche beim Tippen
  // nicht pro Tastendruck O(Regeln × Zeilen) rechnet.
  let _hitCache = null, _hitCacheAt = 0;
  function computeRuleHits() {
    if (Date.now() - _hitCacheAt < 3000) return _hitCache;
    _hitCacheAt = Date.now(); _hitCache = null;
    try {
      if (!isCaseListPage()) return null;
      const rows = getRows();
      if (!rows.length) return null;
      const texts = rows.map(row => { const cells = row.querySelectorAll('td'); let t2 = ''; for (const c of cells) t2 += ' ' + (c.innerText || c.textContent || ''); return t2; });
      const map = new Map();
      for (const r of RULES) {
        if (!r.enabled || !r.term) continue;
        let n = 0;
        for (const tx of texts) if (matchesRule(tx, r.term)) n++;
        map.set(r.id, n);
      }
      _hitCache = map;
    } catch {}
    return _hitCache;
  }

  // Build a single rule row DOM element
  // FIX #12: enabledWithTerm als Parameter — kein O(n) RULES.filter mehr pro Zeile
  function makeRuleRow(item, enabledWithTerm, hitMap) {
    const row = document.createElement('div');
    row.className = 'sfhl-row' + (item.enabled ? '' : ' disabled');
    row.dataset.ruleId = item.id; row.dataset.folderId = item.folder || ''; row.draggable = true; row.style.borderLeftColor = item.color;
    const eye = item.enabled
      ? '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    const prio = (item.enabled && item.term) ? enabledWithTerm.indexOf(item) + 1 : 0;
    const prioBadge = prio > 0
      ? `<div class="sfhl-rule-prio has-prio" title="Priorit\u00e4t ${prio}">#${prio}</div>`
      : `<div class="sfhl-rule-prio" title="Inaktiv">\u2013</div>`;
    const col = safeColor(item.color);
    const hits = (hitMap && item.enabled && item.term) ? hitMap.get(item.id) : null;
    const hitBadge = (typeof hits === 'number' && hits > 0) ? `<span class="sfhl-hits" title="${hits} Zeile(n) in der aktuellen Liste treffen (unabh\u00e4ngig von Priorit\u00e4t)">${hits}</span>` : '';
    const bell = '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
    const alarmBtn = `<div class="sfhl-ra ${item.alarm?'alarm-on':'alarm-off'} sfhl-alarm-rule" role="button" title="${item.alarm?'SLA-Alarm an \u2014 meldet neue Treffer dieser Regel':'SLA-Alarm aus \u2014 klicken zum Aktivieren'}">${bell}</div>`;
    row.innerHTML = `<div class="sfhl-grip"><svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg></div>${prioBadge}<input type="text" value="${escH(item.term)}" title="${escH(item.term)}" class="sfhl-r-term"><div class="sfhl-sw" data-color="${col}"><div class="sfhl-sw-fill" style="background:${col}"></div><input type="color" value="${col}" class="sfhl-r-color"></div><div class="sfhl-row-acts">${hitBadge}${alarmBtn}<div class="sfhl-ra ${item.enabled?'toggle-on':'toggle-off'} sfhl-toggle-rule" role="button" title="${item.enabled?'Deaktivieren':'Aktivieren'}">${eye}${item.enabled?'An':'Aus'}</div><div class="sfhl-ra del sfhl-del-rule" role="button" title="L\u00f6schen"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div></div>`;
    return row;
  }

  // Render rules list with folder grouping
  function renderRules() {
    listEl.innerHTML = '';
    const filtered = ruleSearch ? RULES.filter(r => norm(r.term).includes(ruleSearch)) : RULES;
    if (RULES.length === 0) {
      listEl.innerHTML = `<div class="sfhl-empty"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p class="sfhl-empty-title">Noch keine Regeln</p><p class="sfhl-empty-sub">Erstelle eine Regel um Zeilen in Case-Listen farbig hervorzuheben.</p></div>`;
      updateBadges(); return;
    }
    if (ruleSearch && filtered.length === 0) {
      listEl.innerHTML = `<div class="sfhl-empty"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><p class="sfhl-empty-title">Keine Treffer</p><p class="sfhl-empty-sub">Kein Begriff passt zu „${escH(ruleSearch)}".</p></div>`;
      updateBadges(); return;
    }
    // FIX #12: einmalig berechnen, nicht O(n) pro Zeile
    const enabledWithTerm = RULES.filter(r => r.enabled && r.term);
    const hitMap = computeRuleHits(); // Trefferstatistik (null außerhalb von Case-Listen)
    const ungrouped = filtered.filter(r => !r.folder);

    // Ungrouped section header (only when folders exist)
    if (FOLDERS.length > 0) {
      const uh = document.createElement('div');
      uh.className = 'sfhl-ungrouped-hdr';
      uh.innerHTML = '<svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg> Ohne Ordner';
      listEl.appendChild(uh);
    }
    const ub = document.createElement('div'); ub.className = 'sfhl-ungrouped-body'; ub.dataset.folderId = '';
    for (const item of ungrouped) ub.appendChild(makeRuleRow(item, enabledWithTerm, hitMap));
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
      for (const item of fRules) fb.appendChild(makeRuleRow(item, enabledWithTerm, hitMap));
      listEl.appendChild(fb);
    }
    updateBadges();
  }

  // Rules event delegation
  listEl.addEventListener('change', e => { const item = RULES.find(x=>x.id===e.target.closest('.sfhl-row')?.dataset.ruleId); if(!item) return; if(e.target.matches('.sfhl-r-term')){item.term=e.target.value;e.target.title=e.target.value;saveRules();rescanSoon(true);if(invalidRegexIn(item.term).length)toast('Ungültige Regex — Regel wird als einfache Textsuche behandelt','error',4500);} });
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
      if (!confirm(t('Ordner l\u00f6schen? Enthaltene Regeln werden in "Ohne Ordner" verschoben.'))) return;
      RULES.forEach(r => { if (r.folder === fid) r.folder = null; });
      FOLDERS = FOLDERS.filter(f => f.id !== fid);
      saveFolders(); saveRules(); renderRules(); rescanSoon(true); toast('Ordner gel\u00f6scht', 'info'); return;
    }
    const alm = e.target.closest('.sfhl-alarm-rule'); if(alm){const item=RULES.find(x=>x.id===alm.closest('.sfhl-row')?.dataset.ruleId);if(item){item.alarm=!item.alarm;saveRules();renderRules();toast(item.alarm?'SLA-Alarm für diese Regel an':'SLA-Alarm für diese Regel aus','info');}return;}
    const tgl = e.target.closest('.sfhl-toggle-rule'); if(tgl){const item=RULES.find(x=>x.id===tgl.closest('.sfhl-row')?.dataset.ruleId);if(item){item.enabled=!item.enabled;saveRules();renderRules();rescanSoon(true);}return;}
    const del = e.target.closest('.sfhl-del-rule');
    if(del){
      const id = del.closest('.sfhl-row')?.dataset.ruleId;
      const idx = RULES.findIndex(x => x.id === id);
      if (idx < 0) return;
      const [removed] = RULES.splice(idx, 1);
      saveRules(); renderRules(); rescanSoon(true);
      // Undo: gel\u00f6schte Regel an alter Position wiederherstellen
      toast('Gel\u00f6scht','info',5000,{label:'R\u00fcckg\u00e4ngig',fn:()=>{
        RULES.splice(Math.min(idx, RULES.length), 0, removed);
        saveRules(); renderRules(); rescanSoon(true);
        toast('Regel wiederhergestellt','success');
      }});
    }
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
    const name = prompt(t('Ordnername:'));
    if (!name || !name.trim()) return;
    FOLDERS.push({ id: uid(), name: name.trim() });
    saveFolders(); renderRules(); toast('Ordner erstellt', 'success');
  };

  // ===== Snippets Tab =====
  let snipSearchTerm = '', editingSnipId = null, activeCatFilter = null;
  snipSearch.addEventListener('input', () => { snipSearchTerm = snipSearch.value.toLowerCase().trim(); renderSnippets(); });
  catChipsEl.addEventListener('click', e => {
    const chip = e.target.closest('.sfhl-cat-chip'); if (!chip) return;
    activeCatFilter = chip.dataset.cat || null;
    renderSnippets();
  });

  function renderCatChips() {
    if (!catChipsEl) return;
    const cats = [...new Set(SNIPPETS.map(s => s.category || '(Keine Kategorie)'))].sort((a,b) => {
      if (a === '(Keine Kategorie)') return 1; if (b === '(Keine Kategorie)') return -1;
      return a.localeCompare(b, 'de');
    });
    if (cats.length <= 1) { catChipsEl.innerHTML = ''; return; }
    catChipsEl.innerHTML = `<span class="sfhl-cat-chip${!activeCatFilter?' active':''}" data-cat="">Alle</span>` +
      cats.map(c => `<span class="sfhl-cat-chip${activeCatFilter===c?' active':''}" data-cat="${escH(c)}">${escH(c)}</span>`).join('');
  }

  function renderSnippets() {
    renderCatChips();
    // DocumentFragment für bessere Performance (#24)
    const frag = document.createDocumentFragment();
    const prefix = loadPrefix();
    if (SNIPPETS.length === 0) {
      snipListEl.innerHTML = `<div class="sfhl-empty"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><p class="sfhl-empty-title">Noch keine Snippets</p><p class="sfhl-empty-sub">Erstelle einen Textbaustein und füge ihn überall per Prefix ein.</p></div>`;
      updateBadges(); updateCatDatalist(); return;
    }
    // Suche auch nach Kategorie (#12)
    // FIX #20: body-Suche auf ersten 500 Zeichen begrenzt — verhindert massives String-Normalisieren bei jedem Tastendruck
    let filtered = snipSearchTerm
      ? SNIPPETS.filter(s => norm(s.trigger).includes(snipSearchTerm) || norm(s.label).includes(snipSearchTerm) || norm(s.category).includes(snipSearchTerm) || norm(s.body.slice(0,500)).includes(snipSearchTerm))
      : SNIPPETS;
    if (activeCatFilter) filtered = filtered.filter(s => (s.category || '(Keine Kategorie)') === activeCatFilter);

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
    // Favoriten-Kategorie immer zuerst (FIX B7: echte Kategorie "★ Favoriten" nicht überschreiben)
    const favSnips = filtered.filter(s => s.favorite);
    if (favSnips.length > 0) {
      const existing = catMap.get('★ Favoriten') || [];
      catMap.set('★ Favoriten', [...new Set([...favSnips, ...existing])]);
    }
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
  // FIX #18: Guard wenn phPicker nicht sichtbar
  document.addEventListener('click', e => {
    if (!phPicker.classList.contains('vis')) return;
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
  // FIX #19: updateCounter debounced — htmlToPlain() nicht bei jedem Tastendruck
  const updateCounterDebounced = debounce(updateCounter, 200);
  $('.sfhl-rte-body').addEventListener('keyup', () => { updateRtbState(); updateCounterDebounced(); });
  $('.sfhl-rte-body').addEventListener('mouseup', updateRtbState);
  $('.sfhl-rte-body').addEventListener('input', updateCounterDebounced);
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
    // QF1: Doppelte Trigger machen Auto-Wrap + Einfügen mehrdeutig (erstes gefundenes Snippet gewinnt)
    const dup = SNIPPETS.find(s => s.trigger.toLowerCase() === trigger.toLowerCase() && s.id !== editingSnipId);
    if (dup && !confirm(`Trigger "${loadPrefix()+trigger}" existiert bereits ("${dup.label}").\nTrotzdem speichern? Beim Einfügen gewinnt das zuerst gefundene Snippet.`)) {
      $('.sfhl-ed-trigger').focus(); return;
    }
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
    // FIX #11: wasEditing vor dem Nullsetzen merken — sonst zeigt Toast immer 'erstellt'
    const wasEditing = !!editingSnipId;
    editingSnipId = null;
    toast(wasEditing ? 'Snippet aktualisiert' : 'Snippet erstellt', 'success');
  };

  $('.sfhl-ed-delete').onclick = () => {
    if (!editingSnipId) return;
    const _delIdx = SNIPPETS.findIndex(s => s.id === editingSnipId);
    if (_delIdx < 0) return;
    const snip = SNIPPETS[_delIdx];
    if (!confirm(`Snippet "${snip?.label||editingSnipId}" wirklich löschen?`)) return;
    SNIPPETS = SNIPPETS.filter(s => s.id !== editingSnipId);
    saveSnippets(); renderSnippets();
    snipEditor.classList.remove('vis');
    panel.querySelector('[data-tab="snippets"] .sfhl-add-bar').style.display = 'flex';
    editingSnipId = null;
    // Undo: gel\u00f6schtes Snippet an alter Position wiederherstellen
    toast('Snippet gel\u00f6scht', 'info', 5000, {label:'R\u00fcckg\u00e4ngig',fn:()=>{
      SNIPPETS.splice(Math.min(_delIdx, SNIPPETS.length), 0, snip);
      saveSnippets(); renderSnippets();
      toast('Snippet wiederhergestellt','success');
    }});
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
        if (confirm(`Snippet "${validated.label}" (;;${validated.trigger}) importieren?`)) {
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
  previewCb.onchange = () => { savePreviewOn(previewCb.checked); toast(previewCb.checked ? 'Vorschau an' : 'Vorschau aus', 'info'); };
  slaBlinkCb.onchange = () => { saveSla('blink', slaBlinkCb.checked); toast(slaBlinkCb.checked ? 'Tab-Blinken an' : 'Tab-Blinken aus', 'info'); };
  slaSoundCb.onchange = () => { saveSla('sound', slaSoundCb.checked); if(slaSoundCb.checked){try{playBeep();}catch{}} toast(slaSoundCb.checked ? 'Alarm-Ton an' : 'Alarm-Ton aus', 'info'); };
  slaNotifyCb.onchange = () => {
    if (slaNotifyCb.checked && 'Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission().then(p => {
        if (p !== 'granted') { slaNotifyCb.checked = false; saveSla('notify', false); toast('Benachrichtigung vom Browser blockiert', 'error'); }
        else { saveSla('notify', true); toast('Benachrichtigung an', 'info'); }
      });
      return;
    }
    saveSla('notify', slaNotifyCb.checked); toast(slaNotifyCb.checked ? 'Benachrichtigung an' : 'Benachrichtigung aus', 'info');
  };
  legendCb.onchange = () => { saveLegendOn(legendCb.checked); if(legendCb.checked){ if(isCaseListPage())highlightRows(false); } else removeLegend(); toast(legendCb.checked ? 'Farb-Legende an' : 'Farb-Legende aus', 'info'); };
  selRuleCb.onchange = () => { saveSelRuleOn(selRuleCb.checked); if(!selRuleCb.checked)hideSelButton(); toast(selRuleCb.checked ? 'Regel aus Auswahl an' : 'Regel aus Auswahl aus', 'info'); };
  wrapAnrSel.onchange = () => saveWrapAnrede(wrapAnrSel.value);
  wrapSigSel.onchange = () => saveWrapSignatur(wrapSigSel.value);

  renderSnippets();
  updateWrapDropdowns();

  // ===== Snippet Trigger Engine =====
  let ddSelectedIdx = -1;

  function closeDropdown() { dropdown.classList.remove('vis'); snipPrev.classList.remove('vis'); ddSelectedIdx = -1; }

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
        const walker = (node.ownerDocument || document).createTreeWalker(node, NodeFilter.SHOW_TEXT); // FIX #13: richtiger Dokument-Kontext für iframe-Elemente
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

    // Feature 2 (v4.4.0): optionale Vorschau vor dem Einfügen + gebündelte {eingabe:}-Felder.
    // Wenn aktiv, zeigt ein Dialog die aufgelöste Vorschau und sammelt alle {eingabe:}-Felder
    // gebündelt; bei Bestätigung werden die Werte vorab eingesetzt (kein Doppel-Prompt im Resolver).
    if (loadPreviewOn()) {
      const _labels = [];
      fullBody.replace(/\{eingabe:([^}]+)\}/gi, (_, l) => { l = l.trim(); if (l && !_labels.includes(l)) _labels.push(l); return ''; });
      showInsertDialog(fullBody, _labels, (substitutedBody, ok) => {
        if (!ok) { closeDropdown(); return; }
        finishInsert(el, triggerInfo, snippet, substitutedBody);
      });
      return;
    }
    finishInsert(el, triggerInfo, snippet, fullBody);
  }

  // Feature 2 (v4.4.0): {eingabe:LABEL} → Wert aus map einsetzen (gebündelt, gleiche Labels teilen Wert)
  function substituteEingabe(body, values) {
    return body.replace(/\{eingabe:([^}]+)\}/gi, (m, l) => {
      const v = values[l.trim()];
      return v != null ? v : m;
    });
  }

  // Feature 2 (v4.4.0): Vorschau-/Eingabe-Dialog. cb(substitutedBody, confirmed)
  function showInsertDialog(fullBody, labels, cb) {
    let done = false;
    const finish = (ok, vals) => {
      if (done) return; done = true;
      try { document.removeEventListener('keydown', onKey, true); } catch {}
      ovl.remove();
      cb(ok ? substituteEingabe(fullBody, vals || {}) : null, ok);
    };
    const ovl = document.createElement('div');
    ovl.className = 'sfhl-ovl';
    const fieldsHtml = labels.map((l, i) =>
      `<div class="sfhl-dlg-fld"><label>${escH(l)}</label><input type="text" data-sfhl-eingabe="${i}" placeholder="${escH(l)}"></div>`
    ).join('');
    ovl.innerHTML =
      `<div class="sfhl-dlg" role="dialog" aria-modal="true">
        <div class="sfhl-dlg-h">📋 ${t('Vorschau vor dem Einfügen')}</div>
        <div class="sfhl-dlg-b">
          ${fieldsHtml}
          <div class="sfhl-dlg-pv-l">${t('Vorschau')}</div>
          <div class="sfhl-dlg-pv" data-sfhl-pv></div>
        </div>
        <div class="sfhl-dlg-f">
          <button class="sfhl-dlg-btn sfhl-dlg-btn--s" data-sfhl-cancel>${t('Abbrechen')}</button>
          <button class="sfhl-dlg-btn sfhl-dlg-btn--p" data-sfhl-ok>${t('Einfügen')}</button>
        </div>
      </div>`;
    document.documentElement.appendChild(ovl);

    const inputs = Array.from(ovl.querySelectorAll('[data-sfhl-eingabe]'));
    const pvEl = ovl.querySelector('[data-sfhl-pv]');
    const collect = () => { const v = {}; inputs.forEach((inp, i) => { v[labels[i]] = inp.value; }); return v; };
    const updatePreview = () => {
      const substituted = substituteEingabe(fullBody, collect());
      const resolved = resolvePlaceholders(substituted); // ohne meta → keine Doppel-Sammlung
      let html = resolveLinks(resolved, true);
      html = sanitizeHtml(html.replace(/\n/g, '<br>')).replace('{|}', '');
      pvEl.innerHTML = html;
    };
    inputs.forEach(inp => inp.addEventListener('input', updatePreview));
    updatePreview();

    ovl.querySelector('[data-sfhl-ok]').onclick = () => finish(true, collect());
    ovl.querySelector('[data-sfhl-cancel]').onclick = () => finish(false);
    ovl.addEventListener('mousedown', e => { if (e.target === ovl) finish(false); });
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); finish(true, collect()); }
    };
    document.addEventListener('keydown', onKey, true);
    if (inputs.length) inputs[0].focus();
  }

  function finishInsert(el, triggerInfo, snippet, fullBody) {
    // Usage tracken (#15) — erst beim tatsächlichen Einfügen, nicht bei abgebrochener Vorschau
    snippet.usageCount = (snippet.usageCount||0) + 1;
    addRecent(snippet.id);
    saveSnippets();

    const insMeta = {}; // Feature 1 (v4.4.0): sammelt leer aufgelöste Pflicht-Platzhalter
    const resolved = resolvePlaceholders(fullBody, insMeta);
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

      // FIX #15: if(true) war tote Bedingung — direkt ausführen
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
    // Feature 1 (v4.4.0): Warnung, wenn Anrede/Nachname/Kontakt leer aufgelöst wurden
    if (insMeta.empty && insMeta.empty.length) {
      const fields = insMeta.empty.map(t).join(', ');
      toast('⚠️ ' + fields + ': ' + t('konnte nicht ermittelt werden – bitte vor dem Senden prüfen.'), 'error', 6000);
    }
    closeDropdown(); // FIX #15: orphaned } from if(true) removed
  }

  // v4.9.0 Fuzzy-Fallback fürs Snippet-Dropdown: greift nur, wenn die strikte
  // Suche (startsWith/includes) nichts findet — tippfehlertolerant, ohne die
  // exakte Suche zu verändern. Levenshtein mit früher Schranke.
  function boundedLev(a, b, max) {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let prev = []; for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
      const cur = [i]; let rowMin = i; const ca = a.charCodeAt(i - 1);
      for (let j = 1; j <= lb; j++) {
        const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
        const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        cur[j] = v; if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1; // kann nicht mehr unter die Schranke
      prev = cur;
    }
    return prev[lb];
  }
  // 0 = kein Treffer, sonst >0 (größer = besser). Trigger zählt am stärksten.
  function fuzzyScore(query, s) {
    const q = query;
    const maxDist = q.length <= 3 ? 1 : q.length <= 6 ? 2 : 3;
    const fields = [[s.trigger, 1], [s.label, 0.7], [s.category, 0.5]];
    let best = 0;
    for (const [raw, weight] of fields) {
      const txt = (raw || '').toLowerCase(); if (!txt) continue;
      const tokens = [txt, ...txt.split(/[\s\-_/]+/)].filter(Boolean);
      for (const tok of tokens) {
        // q gegen den Wortanfang vergleichen (Länge q bzw. q+1) → Tippfehler vorn
        for (const len of [q.length, q.length + 1]) {
          const piece = tok.slice(0, len); if (!piece) continue;
          const d = boundedLev(q, piece, maxDist);
          if (d <= maxDist) { const score = (1 - d / (q.length + 1)) * weight; if (score > best) best = score; }
        }
      }
    }
    return best;
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
    const strictMatches = SNIPPETS
      .filter(s => {
        // Im EN-Modus nur Snippets mit EN-Variante
        if (forceLang === 'en' && !s.bodyEn) return false;
        return s.trigger.toLowerCase().startsWith(query) || s.label.toLowerCase().includes(query) || norm(s.category).includes(query);
      })
      .slice().sort((a, b) => {
        if (b.favorite !== a.favorite) return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
        return (b.usageCount||0) - (a.usageCount||0);
      });
    // Fuzzy-Fallback (Tippfehlertoleranz): nur wenn die strikte Suche leer bleibt
    let isFuzzy = false;
    let matches = strictMatches;
    if (strictMatches.length === 0 && query.length >= 2) {
      isFuzzy = true;
      matches = SNIPPETS
        .filter(s => !(forceLang === 'en' && !s.bodyEn))
        .map(s => ({ s, score: fuzzyScore(query, s) }))
        .filter(x => x.score > 0)
        .sort((a, b) => {
          if (b.s.favorite !== a.s.favorite) return (b.s.favorite ? 1 : 0) - (a.s.favorite ? 1 : 0);
          if (b.score !== a.score) return b.score - a.score;
          return (b.s.usageCount || 0) - (a.s.usageCount || 0);
        })
        .slice(0, 8)
        .map(x => x.s);
    }
    if (matches.length === 0) { closeDropdown(); return; }

    const prefix = loadPrefix();
    dropdown.innerHTML = matches.map((s, i) => {
      const bodyToShow = (activeLang === 'en' && s.bodyEn) ? s.bodyEn : s.body;
      const preview = htmlToPlain(bodyToShow).replace(/\n/g,' ').slice(0,70);
      const favBadge = s.favorite ? '<span style="color:#f59e0b;margin-left:2px">\u2605</span>' : '';
      const safeLang = escH((['de','en'].includes(activeLang) ? activeLang : 'de').toUpperCase());
      const langBadge = s.bodyEn ? `<span style="font-size:9px;background:${activeLang==='en'?'#dbeafe':'#f3f4f6'};color:${activeLang==='en'?'#1d4ed8':'#6b7280'};padding:0 4px;border-radius:3px;margin-left:4px">${safeLang}</span>` : '';
      const numBadge = i < 9 ? `<span class="sfhl-dd-num" title="Alt+${i+1}">${i+1}</span>` : '';
      return `<div class="sfhl-dd-item${i===0?' selected':''}" data-snip-id="${s.id}"><div class="sfhl-dd-item-top">${numBadge}<span class="sfhl-dd-trigger">${escH(prefix+s.trigger)}</span><span class="sfhl-dd-label">${escH(s.label)}${favBadge}${langBadge}</span><span class="sfhl-dd-cat">${escH(s.category)}</span></div><div class="sfhl-dd-preview">${escH(preview)}${preview.length>=70?'\u2026':''}</div></div>`;
    }).join('') + `<div class="sfhl-dd-hint"><span>${isFuzzy?'<span style="color:#f59e0b;font-weight:600">\u2248 \u00e4hnliche Treffer</span> \u2022 ':''}${loadWrapOn()?'<span style="color:#10b981;font-weight:600">\u2713 Anrede+Signatur</span> \u2022 ':''}Enter = einf\u00fcgen \u2022 \u2191\u2193 = navigieren \u2022 Alt+1\u20139 = direkt \u2022 Esc = schlie\u00dfen</span></div>`;

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

  // Snippet-Vorschau beim Hover
  dropdown.addEventListener('mouseover', e => {
    const item = e.target.closest('.sfhl-dd-item'); if (!item) return;
    clearTimeout(_snipPrevTimer);
    const snip = (dropdown._matches || []).find(s => s.id === item.dataset.snipId);
    if (!snip) return;
    const lang = dropdown._activeLang || 'de';
    const body = (lang === 'en' && snip.bodyEn) ? snip.bodyEn : snip.body;
    snipPrev.innerHTML = `<div class="sfhl-snip-prev-lbl">${escH(snip.label)}</div><div class="sfhl-snip-prev-body">${sanitizeHtml(body)}</div>`;
    const ddRect = dropdown.getBoundingClientRect();
    const prevW = 280;
    let left = ddRect.left - prevW - 8;
    if (left < 8) left = ddRect.right + 8;
    const top = Math.max(8, Math.min(item.getBoundingClientRect().top, window.innerHeight - 230));
    snipPrev.style.left = left + 'px';
    snipPrev.style.top = top + 'px';
    snipPrev.classList.add('vis');
  });
  dropdown.addEventListener('mouseleave', () => {
    _snipPrevTimer = setTimeout(() => snipPrev.classList.remove('vis'), 80);
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
    // Alt+1…9: n-tes Snippet direkt einfügen. e.code statt e.key, damit es
    // layout-unabhängig ist (Alt erzeugt je nach Tastatur Sonderzeichen als e.key).
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const dm = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
      if (dm) {
        const idx = +dm[1] - 1;
        if (idx < dropdown._matches.length) {
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
          insertSnippet(dropdown._el, dropdown._triggerInfo, dropdown._matches[idx]);
        }
        return;
      }
    }
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
      // v4.6.3: Doku-Lookup/Regel-aus-Auswahl auch für Markierungen IM iframe (E-Mail-Editor)
      doc.addEventListener('mouseup', handleSelectionMouseup);
      doc.addEventListener('mousedown', handleSelectionMousedown, true);
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
  // FIX #17: Bekannte funktionierende Strategie cachen — vermeidet wiederholtes Probieren aller Strategien
  let _lrs = '', _cachedRowStrategy = null;
  function _tryRowStrategy(s) {
    let rows;
    if(s.type==='css'){rows=Array.from(document.querySelectorAll(s.sel));}else{const snap=document.evaluate(s.sel,document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);rows=[];for(let i=0;i<snap.snapshotLength;i++)rows.push(snap.snapshotItem(i));}
    return rows.filter(tr => tr.querySelector('td'));
  }
  function getRows() {
    if (_cachedRowStrategy) {
      try { const rows = _tryRowStrategy(_cachedRowStrategy); if(rows.length>0){_lrs=_cachedRowStrategy.name;return rows;} } catch {}
      _cachedRowStrategy = null;
    }
    for (const s of ROW_STRATEGIES) {
      try { const rows = _tryRowStrategy(s); if(rows.length>0){_lrs=s.name;_cachedRowStrategy=s;return rows;} } catch {}
    }
    return [];
  }
  const REFRESH_STRATEGIES = [
    {name:'css:title',type:'cf',sel:'lst-list-view-manager-button-bar lightning-button-icon button',filter:b=>/refresh|aktualisieren/i.test(b.title||b.getAttribute('aria-label')||'')},
    {name:'css:header',type:'cf',sel:'lst-list-view-manager-header lightning-button-icon button',filter:b=>/refresh|aktualisieren/i.test(b.title||b.getAttribute('aria-label')||'')},
    {name:'css:first',type:'css',sel:'lst-list-view-manager-button-bar lightning-button-icon:first-of-type button'},
    {name:'xpath:short',type:'xpath',sel:'//lst-list-view-manager-button-bar//lightning-button-icon//button'},
  ];
  // QF4: Strategie-Cache wie bei getRows (FIX #17) — getRefreshButton läuft im Countdown
  // jede Sekunde; ohne Cache werden jedes Mal alle Strategien durchprobiert.
  let _lrfs = '', _cachedRefreshStrategy = null;
  function _tryRefreshStrategy(s) {
    if (s.type === 'css') return document.querySelector(s.sel);
    if (s.type === 'cf')  return Array.from(document.querySelectorAll(s.sel)).find(s.filter) || null;
    return document.evaluate(s.sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }
  function getRefreshButton() {
    if (_cachedRefreshStrategy) {
      try { const r = _tryRefreshStrategy(_cachedRefreshStrategy); if (r) { _lrfs = _cachedRefreshStrategy.name; return r; } } catch {}
      _cachedRefreshStrategy = null;
    }
    for (const s of REFRESH_STRATEGIES) {
      try { const r = _tryRefreshStrategy(s); if (r) { _lrfs = s.name; _cachedRefreshStrategy = s; return r; } } catch {}
    }
    return null;
  }
  // ===== Advanced Rule Matching (UND/NICHT/Regex) =====
  // FIX #8: Regex-Cache auf 200 Einträge begrenzt — verhindert unbegrenztes Speicherwachstum
  const _regexCache = new Map();
  const _REGEX_CACHE_MAX = 200;
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
        if (_regexCache.size >= _REGEX_CACHE_MAX) _regexCache.delete(_regexCache.keys().next().value); // FIX #8: LRU eviction
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
  // QF2: Ungültige /regex/ fällt in matchesSingleCondition still auf Textsuche zurück —
  // diese Funktion findet solche Teile, damit die UI beim Speichern warnen kann.
  function invalidRegexIn(term) {
    const bad = [];
    for (const group of String(term || '').split(/\s*\|\s*|\s+OR\s+/i)) {
      for (let part of group.split(/\s\+\s/)) {
        part = part.trim();
        if (part.startsWith('!')) part = part.slice(1).trim();
        const m = part.match(/^\/(.+)\/([gimsuy]*)$/);
        if (m) { try { new RegExp(m[1], m[2]); } catch { bad.push(part); } }
      }
    }
    return bad;
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
  // innerText wird bevorzugt: SF Locker Service patcht es für Synthetic-Shadow-Traversal.
  // textContent als Fallback für Umgebungen ohne innerText (z.B. SVG-Knoten).
  function highlightRows(full=false) { const rows=getRows();if(rows.length===0)return false;for(const row of rows){if(full)unmarkRow(row);const cells=row.querySelectorAll('td');let txt='';for(const c of cells)txt+=' '+(c.innerText||c.textContent||'');const m=bestMatch(txt);if(m)markRow(row,m);else if(full)unmarkRow(row);}updateHighlightCount();ensureLegend(rows);return true; }

  // ===== v4.5.0 #2: Farb-Legende über der Case-Liste =====
  function removeLegend(){ const l=document.querySelector('.sfhl-legend'); if(l)l.remove(); }
  function ensureLegend(rows){
    if(!isCaseListPage()||!loadLegendOn()){ removeLegend(); return; }
    rows = rows && rows.length ? rows : getRows();
    const table = rows.length ? rows[0].closest('table') : null;
    if(!table||!table.parentElement){ removeLegend(); return; }
    const hits = computeRuleHits();
    const items = hits ? RULES.filter(r=>r.enabled&&r.term&&hits.get(r.id)>0) : [];
    let leg = document.querySelector('.sfhl-legend');
    if(!items.length){ if(leg)leg.remove(); return; }
    if(!leg){ leg=document.createElement('div'); leg.className='sfhl-legend'; }
    if(table.previousElementSibling!==leg) table.parentElement.insertBefore(leg, table);
    leg.innerHTML = '<span class="sfhl-legend-ttl">Legende</span>' + items.map(r=>{
      const term = r.term.length>30 ? r.term.slice(0,29)+'…' : r.term;
      const bell = r.alarm ? '<span class="sfhl-legend-bell" title="SLA-Alarm aktiv">🔔</span>' : '';
      return `<span class="sfhl-legend-chip" title="${escH(r.term)}"><span class="sfhl-legend-sw" style="background:${safeColor(r.color)}"></span>${escH(term)}${bell}<b>${hits.get(r.id)}</b></span>`;
    }).join('');
  }

  // ===== v4.5.0 #3: Regel aus Auswahl  +  v4.6.0: Geräte-Doku-Lookup =====
  let _selBtn=null;
  function hideSelButton(){ if(_selBtn){_selBtn.remove();_selBtn=null;} }
  function showSelButton(x,y,label,title,onAct){
    hideSelButton();
    _selBtn=document.createElement('div');
    _selBtn.className='sfhl-sel-btn';
    _selBtn.textContent=label;
    _selBtn.title=title;
    _selBtn.style.left=Math.round(x)+'px';
    _selBtn.style.top=Math.round(y)+'px';
    // mousedown statt click: verhindert, dass die Textauswahl vorher kollabiert
    _selBtn.addEventListener('mousedown', ev=>{ ev.preventDefault(); ev.stopPropagation(); onAct(); hideSelButton(); });
    document.body.appendChild(_selBtn);
  }
  function createRuleFromSelection(term){
    if(RULES.some(r=>r.term===term)){ toast('Regel existiert bereits','info'); return; }
    RULES.unshift({ id:uid(), term, color:'#fff3a3', enabled:true, alarm:false });
    saveRules(); renderRules(); rescanSoon(true);
    const short = term.length>30 ? term.slice(0,29)+'…' : term;
    toast('Regel angelegt: „'+short+'"','success');
  }

  // --- Geräte-Doku-Lookup: Code-Typ aus markiertem Text erkennen ---
  function detectCodeType(s){
    const t=(s||'').trim();
    if(!t||t.length<3||t.length>40||/\s/.test(t)) return null;
    if(/^[A-Za-z0-9]{2,}-[A-Za-z0-9.\/+]{2,}$/.test(t) && /[A-Za-z]/.test(t)) return 'order'; // RSG30-A1A3ABA1, FMR10B-AAAB…+Z1
    if(/^\d{8,12}$/.test(t)) return 'auftrag';                                               // 3800345039
    if(/^[A-Za-z0-9]+$/.test(t) && /[A-Za-z]/.test(t) && /\d/.test(t)) {
      return t.length >= 9 ? 'serial' : 'root';  // lang+alphanum = Seriennr (MC023616000), kurz = Produkt-Root (FMR60B)
    }
    return null;
  }
  // Wert je Typ — Popup kann alle Typen anbieten, nicht nur den erkannten.
  function dokuCandidates(type, text){
    const root = (type==='order') ? text.split('-')[0] : text;
    return { root, serial:text, auftrag:text, order:text, free:text };
  }
  const _DOKU_GROUPS = [['root','Produkt-Root'],['order','Ordercode'],['serial','Seriennummer'],['auftrag','Auftragsnummer'],['free','Suche']];
  let _dokuPop=null;
  function hideDokuPopup(){ if(_dokuPop){_dokuPop.remove();_dokuPop=null;} }
  function showDokuPopup(x,y,text,type){
    hideDokuPopup();
    const cand = dokuCandidates(type, text);
    const all = loadDokuLinks();
    if(!all.length){ toast('Keine Doku-Vorlagen geladen — bitte Config in den Einstellungen importieren','info',4500); return; }
    const label = gt => (_DOKU_GROUPS.find(g=>g[0]===gt)||[gt,gt])[1];
    const groupHtml = gt => {
      const ls = all.filter(l=>l.type===gt); if(!ls.length) return '';
      const sub = (gt==='root'&&type==='order') ? ' ('+escH(cand.root)+')' : '';
      let h='<div class="sfhl-doku-grp">'+escH(label(gt))+sub+'</div><div class="sfhl-doku-row">';
      for(const l of ls){
        const url=l.url.replace(/%s/g, encodeURIComponent(cand[l.type]));
        h+='<a class="sfhl-doku-lnk" href="'+escH(url)+'" target="_blank" rel="noopener noreferrer" title="'+escH(l.label||l.key)+'">'+escH(l.key||l.label)+'</a>';
      }
      return h+'</div>';
    };
    // erkannte Gruppe(n) zuerst, dann der Rest (über „Andere Typen" aufklappbar)
    const order=['root','order','serial','auftrag','free'];
    const prim = type==='order' ? ['order','root','free'] : (type ? [type,'free'] : ['free']);
    let primHtml='', secHtml='';
    for(const gt of order){ if(prim.includes(gt)) primHtml+=groupHtml(gt); }
    for(const gt of order){ if(!prim.includes(gt)) secHtml+=groupHtml(gt); }
    let html='<div class="sfhl-doku-hd">📄 '+escH(text)+'</div>'+primHtml;
    if(secHtml.trim()) html+='<div class="sfhl-doku-more">▸ Andere Typen</div><div class="sfhl-doku-sec" style="display:none">'+secHtml+'</div>';
    const pop=document.createElement('div'); pop.className='sfhl-doku-pop';
    pop.style.left=Math.round(x)+'px'; pop.style.top=Math.round(y)+'px';
    pop.innerHTML=html;
    document.body.appendChild(pop);
    _dokuPop=pop;
    const more=pop.querySelector('.sfhl-doku-more');
    if(more) more.addEventListener('mousedown', ev=>{ ev.preventDefault(); ev.stopPropagation(); const sec=pop.querySelector('.sfhl-doku-sec'); if(sec){sec.style.display='block'; more.style.display='none';} });
    const r=pop.getBoundingClientRect(); // grob im Viewport halten
    if(r.right>window.innerWidth-8) pop.style.left=Math.max(8, x-r.width)+'px';
    if(r.bottom>window.innerHeight-8) pop.style.top=Math.max(8, y-r.height-16)+'px';
  }

  function getSelectionText(target, win){
    // Auswahl in <input>/<textarea> liefert getSelection() NICHT — direkt aus dem Feld lesen.
    const ae = target;
    if(ae && (ae.tagName==='INPUT'||ae.tagName==='TEXTAREA') && typeof ae.selectionStart==='number' && ae.selectionEnd>ae.selectionStart){
      return String(ae.value||'').substring(ae.selectionStart, ae.selectionEnd);
    }
    const sel=(win||window).getSelection();
    return sel ? sel.toString() : '';
  }
  function selEventCoords(e){
    // v4.6.3: Koordinaten ins äußere Dokument umrechnen (Auswahl im E-Mail-iframe → Offset)
    const doc = (e.target && e.target.ownerDocument) || document;
    const win = doc.defaultView || window;
    if(win !== window && win.frameElement){
      const r = win.frameElement.getBoundingClientRect();
      return { x: r.left + window.scrollX + e.clientX, y: r.top + window.scrollY + e.clientY, win };
    }
    return { x: e.pageX, y: e.pageY, win };
  }
  function handleSelectionMouseup(e){
    if(e.target.closest && e.target.closest('.sfhl-panel,.sfhl-sel-btn,.sfhl-doku-pop,.sfhl-trigger')) return;
    const { x, y, win } = selEventCoords(e);
    setTimeout(()=>{ // Selektion ist erst nach dem mouseup final
      // unsichtbare Zeichen entfernen (Zero-Width, NBSP) und Whitespace normalisieren
      const t=getSelectionText(e.target, win).replace(/[​-‏﻿ ]/g,' ').trim().replace(/\s+/g,' ');
      if(t.length<2||t.length>80){ hideSelButton(); return; }
      // für die Code-Erkennung Rand-Satzzeichen/Klammern abstreifen: „(FMR10B)" → „FMR10B"
      const code=t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g,'');
      const ct = loadDokuOn() ? detectCodeType(code) : null;
      if(ct){ showSelButton(x+6, y+10, '📄 Doku-Links', '„'+code+'" — Dokumentations-Links öffnen', ()=>showDokuPopup(x+6, y+10, code, ct)); return; }
      if(loadSelRuleOn() && isCaseListPage()){ showSelButton(x+6, y+10, '➕ Regel aus Auswahl', '„'+t+'" als Markierungs-Regel anlegen', ()=>createRuleFromSelection(t)); return; }
      hideSelButton();
    },10);
  }
  function handleSelectionMousedown(e){
    if(_selBtn && !(e.target.closest && e.target.closest('.sfhl-sel-btn'))) hideSelButton();
    if(_dokuPop && !(e.target.closest && e.target.closest('.sfhl-doku-pop'))) hideDokuPopup();
  }
  document.addEventListener('mouseup', handleSelectionMouseup);
  document.addEventListener('mousedown', handleSelectionMousedown, true);

  function snapshotMarked() { const set=new Set();document.querySelectorAll('.tm-sfhl-mark').forEach(r=>{const cells=r.querySelectorAll('td');let t='';for(const c of cells)t+=(c.innerText||c.textContent||'');set.add(t);});return set; }
  function highlightAndBlink(snap) {
    highlightRows(true);
    if(!snap)return;
    let alarmHits=0;
    document.querySelectorAll('.tm-sfhl-mark').forEach(r=>{
      const cells=r.querySelectorAll('td');let t='';for(const c of cells)t+=(c.innerText||c.textContent||'');
      if(!snap.has(t)){
        r.classList.add('sfhl-new-match');setTimeout(()=>r.classList.remove('sfhl-new-match'),3000);
        // v4.5.0 SLA-Alarm: neue Treffer-Zeile, deren Regel das alarm-Flag trägt
        const rid=r.dataset.sfhlRule; const rule=rid&&RULES.find(x=>x.id===rid);
        if(rule&&rule.alarm)alarmHits++;
      }
    });
    if(alarmHits>0)fireSlaAlarm(alarmHits);
  }

  // ===== v4.5.0: SLA-Alarm — meldet neue Treffer von Alarm-Regeln nach Auto-Refresh =====
  let _slaBlinkId=null, _slaOrigTitle=null;
  function fireSlaAlarm(n){
    try{ if(loadSla('blink'))startTitleBlink(n); }catch{}
    try{ if(loadSla('sound'))playBeep(); }catch{}
    try{ if(loadSla('notify'))showSlaNotification(n); }catch{}
  }
  function startTitleBlink(n){
    if(document.hasFocus())return; // Tab ist im Blick → kein Blinken nötig
    if(_slaOrigTitle===null)_slaOrigTitle=document.title;
    clearInterval(_slaBlinkId);
    const alt=`🔴 (${n}) neue${n>1?'':'r'} Treffer`;
    let on=false;
    _slaBlinkId=setInterval(()=>{document.title=(on=!on)?alt:(_slaOrigTitle||document.title);},1000);
  }
  function stopTitleBlink(){
    if(_slaBlinkId){clearInterval(_slaBlinkId);_slaBlinkId=null;}
    if(_slaOrigTitle!==null){document.title=_slaOrigTitle;_slaOrigTitle=null;}
  }
  window.addEventListener('focus',stopTitleBlink);
  function playBeep(){
    const Ctx=window.AudioContext||window.webkitAudioContext; if(!Ctx)return;
    const ctx=new Ctx(); if(ctx.resume)ctx.resume();
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type='sine';o.frequency.value=880;o.connect(g);g.connect(ctx.destination);
    const t=ctx.currentTime;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(0.18,t+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.35);
    o.start(t);o.stop(t+0.36);
    o.onended=()=>{try{ctx.close();}catch{}};
  }
  function showSlaNotification(n){
    if(!('Notification'in window)||Notification.permission!=='granted')return;
    const nt=new Notification('Neue Case-Treffer',{body:`${n} neue${n>1?'':'r'} Treffer einer Alarm-Regel in der Liste.`,tag:'sfhl-sla'});
    nt.onclick=()=>{try{window.focus();}catch{}nt.close();};
  }

  // ===== Visibility =====
  function isCaseListPage() {
    const h = location.href;
    return h.includes('/lightning/o/Case/list') || h.includes('/lightning/r/WorkOrder');
  }
  // FIX (B3): Auto-Refresh nur auf echten Case-Listen — auf WorkOrder-Seiten gibt es keinen
  // Refresh-Button, waitBtn() würde dort endlos pollen.
  function isCaseListView() { return location.href.includes('/lightning/o/Case/list'); }

  // ===== v4.5.0 #4: Nativer Einstieg — SLDS-Icon in der Lightning-Kopfleiste =====
  // Strategie-Liste + Re-Injection (wie beim Refresh-Button), Floating-Button als Fallback.
  const HEADER_STRATEGIES = [
    'header.slds-global-header ul.slds-global-actions',
    'ul.slds-global-actions',
    '.slds-global-header__item_actions ul',
    'one-appnav ul.slds-global-actions',
  ];
  function getHeaderActions() {
    for (const s of HEADER_STRATEGIES) { try { const el = document.querySelector(s); if (el) return el; } catch {} }
    return null;
  }
  let _headerBtn = null;
  function buildHeaderBtn() {
    const li = document.createElement('li');
    li.className = 'slds-global-actions__item sfhl-hdr-item';
    li.innerHTML = '<button type="button" class="slds-button slds-button_icon slds-button_icon-container slds-global-actions__item-action sfhl-hdr-btn" title="SF Tools (Alt+R)" aria-label="SF Tools öffnen"><span class="sfhl-hdr-mark"><svg viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M6 16l8.5-8.5a2.1 2.1 0 0 1 3 3L9 19l-4 1 1-4z"/></svg></span><span class="sfhl-hdr-dot"></span></button>';
    li.querySelector('button').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); panel.classList.contains('open') ? closePanel() : openPanel(); });
    return li;
  }
  function ensureHeaderBtn() {
    if (loadBtnPos() !== 'header') { if (_headerBtn) { _headerBtn.remove(); _headerBtn = null; } return false; }
    const host = getHeaderActions();
    if (!host) { if (_headerBtn) { _headerBtn.remove(); _headerBtn = null; } return false; }
    if (_headerBtn && _headerBtn.isConnected && host.contains(_headerBtn)) return true;
    if (_headerBtn) _headerBtn.remove();
    _headerBtn = buildHeaderBtn();
    host.insertBefore(_headerBtn, host.firstChild);
    return true;
  }
  function updateVis() {
    const pos = loadBtnPos();
    const headerOk = ensureHeaderBtn();
    // Floating zeigen, wenn so gewählt — oder als Fallback, wenn Header gewollt, aber nicht gefunden.
    const showFloat = pos === 'floating' || (pos === 'header' && !headerOk);
    triggerBtn.style.display = showFloat ? 'inline-flex' : 'none';
  }
  updateVis();
  // Re-Injection: SF rendert den Header bei Navigation neu — Icon regelmäßig wiederherstellen.
  setInterval(updateVis, 2500);
  // FIX #5: Cache-Invalidierung in pushState + popstate integriert (statt 1s-Polling)
  const origPush = history.pushState;
  history.pushState = function() { const r=origPush.apply(this,arguments);_contactApiCache=null;_contactApiCacheId=null;setTimeout(()=>{updateVis();if(isCaseListPage())highlightRows(true);},100);setTimeout(restartRefresh,500);setTimeout(prefetchContactApi,1500);return r; };
  window.addEventListener('popstate', () => { _contactApiCache=null;_contactApiCacheId=null;setTimeout(()=>{updateVis();if(isCaseListPage())highlightRows(true);},100);setTimeout(restartRefresh,500);setTimeout(prefetchContactApi,1500); });

  // ===== Auto-Refresh =====
  let cdId=null,rfId=null,rfObs=null,plId=null,nextAt=null;
  let _lastActivity = 0;
  document.addEventListener('input',     () => { _lastActivity = Date.now(); }, { passive: true, capture: true });
  document.addEventListener('mousedown', () => { _lastActivity = Date.now(); }, { passive: true, capture: true });
  function clearCd(){if(cdId){clearInterval(cdId);cdId=null;}} function clearRf(){if(rfId){clearInterval(rfId);rfId=null;}}
  function setLbl(b,s){if(b){b.innerText=String(s);b.title=`Refresh in ${s}s`;}} function clrLbl(){const b=getRefreshButton();if(b){b.innerText='';b.title='Auto-Refresh aus';}}
  function updateRfRing() {
    const ringEl = panel.querySelector('.sfhl-rf-ring');
    const statusEl = panel.querySelector('.sfhl-rf-ring-status');
    const lblEl = panel.querySelector('.sfhl-rf-ring-lbl');
    const progEl = panel.querySelector('.sfhl-rf-ring-prog');
    if (!ringEl) return;
    if (!nextAt || !loadRefreshOn()) {
      ringEl.classList.remove('vis');
      if (statusEl) statusEl.textContent = loadRefreshOn() ? 'Warte auf Seite…' : 'Refresh deaktiviert';
      return;
    }
    const total = loadRefreshSecs();
    const rem = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
    if (progEl) progEl.style.strokeDashoffset = String(263.9 * (1 - rem / total));
    if (lblEl) lblEl.textContent = rem + 's';
    if (statusEl) statusEl.textContent = isCaseListView() ? 'Nächster Refresh in…' : 'Nicht auf Case-Listenseite';
    ringEl.classList.add('vis');
  }
  function startCd(secs){const b=getRefreshButton();if(!b)return;clearCd();nextAt=Date.now()+secs*1000;setLbl(b,secs);updateRfRing();cdId=setInterval(()=>{const rem=Math.max(0,nextAt-Date.now());setLbl(getRefreshButton(),Math.ceil(rem/1000));updateRfRing();if(rem<=0)clearCd();},1000);}
  function startLoop(){const secs=loadRefreshSecs();if(!loadRefreshOn()){stopRefresh();return;}clearRf();clearCd();startCd(secs);rfId=setInterval(()=>{const b=getRefreshButton();if(!b){waitBtn(startLoop);clearRf();clearCd();return;}if(Date.now()-_lastActivity<5000){startCd(secs);return;}const snap=snapshotMarked();b.click();setTimeout(()=>highlightAndBlink(snap),1500);startCd(secs);},secs*1000);}
  // FIX (B3): stopRefresh räumt auch waitBtn-Observer + Polling auf — sonst läuft nach
  // SPA-Navigation weg von der Case-Liste ein 1s-Intervall + MutationObserver endlos weiter.
  function stopRefresh(){clearRf();clearCd();if(rfObs){rfObs.disconnect();rfObs=null;}if(plId){clearInterval(plId);plId=null;}clrLbl();updateRfRing();}
  function restartRefresh(){if(loadRefreshOn()&&isCaseListView())waitBtn(startLoop);else stopRefresh();}
  function waitBtn(cb){if(getRefreshButton()){cb?.();return;}if(rfObs){rfObs.disconnect();rfObs=null;}if(plId){clearInterval(plId);plId=null;}rfObs=new MutationObserver(()=>{if(getRefreshButton()){rfObs.disconnect();rfObs=null;if(plId){clearInterval(plId);plId=null;}cb?.();}});rfObs.observe(document.documentElement,{childList:true,subtree:true});plId=setInterval(()=>{if(getRefreshButton()){if(rfObs){rfObs.disconnect();rfObs=null;}clearInterval(plId);plId=null;cb?.();}},1000);}
  window.addEventListener('load', () => {
    setTimeout(restartRefresh, 800);
    setTimeout(prefetchContactApi, 1500);
  });

  // FIX #5: URL-Polling entfernt — pushState-Override + popstate decken SPA-Navigation bereits ab

  // ===== Triggers =====
  const rescanSoon = debounce((full=false) => { if(isCaseListPage()) highlightRows(full); }, 80);
  (function kick(){let tries=0;const k=setInterval(()=>{if(!isCaseListPage()){clearInterval(k);return;}if(highlightRows())clearInterval(k);if(++tries>120)clearInterval(k);},200);})();
  if(document.body){const obs=new MutationObserver(muts=>{for(const mu of muts){if(mu.addedNodes?.length){for(const n of mu.addedNodes){if(n instanceof Element&&(n.matches?.('tr,table')||n.querySelector?.('tr,table'))){rescanSoon(false);return;}}}if(mu.type==='characterData'){rescanSoon(false);return;}}});obs.observe(document.body,{childList:true,subtree:true,characterData:true});}
  // Periodic fallback: MutationObserver greift nicht über SF native Shadow DOM Boundaries.
  // highlightRows(false) markiert neue Zeilen nach, ohne bereits korrekte zu entfernen.
  setInterval(() => { if (isCaseListPage()) highlightRows(false); }, 5000);
  // FIX (B4): Deep-Scan (querySelectorAll('*') über alle Shadow Roots) ist teuer — als reiner
  // Fallback reicht 30s; neue Editoren/Iframes erkennt primär der MutationObserver oben.
  setInterval(periodicScan, 30000);

  // ===== Backup-Reminder =====
  // localStorage-Verlust = Datenverlust (siehe README-Troubleshooting). Erinnert dezent,
  // wenn >30 Tage nicht exportiert wurde — max. 1× pro 7 Tage, nur bei aktiver Nutzung.
  (function backupReminder() {
    try {
      const DAY = 86400000;
      const lastExp  = parseInt(localStorage.getItem(LS_LAST_EXPORT), 10) || 0;
      const lastHint = parseInt(localStorage.getItem(LS_BACKUP_HINT), 10) || 0;
      if (loadRecent().length === 0) return;           // Nutzungs-Proxy: noch nie Snippet eingefügt → kein Hinweis
      if (Date.now() - lastExp  < 30 * DAY) return;
      if (Date.now() - lastHint <  7 * DAY) return;
      localStorage.setItem(LS_BACKUP_HINT, String(Date.now()));
      setTimeout(() => toast('Backup-Tipp: Regeln & Snippets seit über 30 Tagen nicht exportiert', 'info', 8000,
        { label: 'Jetzt exportieren', fn: () => doExport('all') }), 4000);
    } catch {}
  })();

  // ===== „Was ist neu" nach Update (Feature 3, v4.4.0) =====
  function showWhatsNew(version, bullets) {
    const ovl = document.createElement('div');
    ovl.className = 'sfhl-ovl';
    const items = bullets.map(b => `<li style="margin-bottom:8px">${escH(b)}</li>`).join('');
    ovl.innerHTML =
      `<div class="sfhl-dlg" role="dialog" aria-modal="true">
        <div class="sfhl-dlg-h">🎉 ${t('Was ist neu')} — v${escH(version)}</div>
        <div class="sfhl-dlg-b"><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.5">${items}</ul></div>
        <div class="sfhl-dlg-f"><button class="sfhl-dlg-btn sfhl-dlg-btn--p" data-sfhl-ok>${t('Verstanden')}</button></div>
      </div>`;
    document.documentElement.appendChild(ovl);
    const close = () => { try { document.removeEventListener('keydown', onKey, true); } catch {} ovl.remove(); };
    ovl.querySelector('[data-sfhl-ok]').onclick = close;
    ovl.addEventListener('mousedown', e => { if (e.target === ovl) close(); });
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
  }
  (function whatsNewCheck() {
    try {
      const seen = localStorage.getItem(LS_LAST_VER);
      if (seen === VERSION) return;
      localStorage.setItem(LS_LAST_VER, VERSION);
      if (!seen) return; // Erstinstallation → kein Changelog
      const entry = CHANGELOG[VERSION];
      if (!entry) return;
      const bullets = (entry[loadDefaultLang()] || entry.de) || [];
      if (bullets.length) setTimeout(() => showWhatsNew(VERSION, bullets), 1800);
    } catch {}
  })();

  console.log('[SFHL] Init complete');
})();