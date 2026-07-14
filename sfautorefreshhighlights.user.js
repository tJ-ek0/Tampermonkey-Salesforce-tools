// ==UserScript==
// @name         Salesforce List Markierung + Snippets
// @namespace    https://github.com/tJ-ek0/Tampermonkey-Salesforce-tools
// @version      4.15.0
// @description  Markiert Case-Listen farblich + Textbausteine mit Trigger, Platzhaltern, Rich-Text. Drag&Drop, Farbpalette, Auto-Refresh. UND/NICHT/Regex-Regeln, Clipboard-Kopie. DOM-basierte Platzhalter.
// @author       Tobias Jurgan
// @license      MIT
// @match        https://*.lightning.force.com/lightning/*
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
  const VERSION = '4.15.0';
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
  const LS_DATA_VER  = 'sfhl_data_version';    // Migrations-Version
  const LS_WRAP_ON   = 'sfhl_wrap_enabled';    // Auto-Wrap an/aus
  const LS_WRAP_ANR  = 'sfhl_wrap_anrede';     // Trigger des Anrede-Snippets
  const LS_WRAP_SIG  = 'sfhl_wrap_signatur';   // Trigger des Signatur-Snippets
  const LS_DEF_LANG  = 'sfhl_default_language'; // 'de' oder 'en'

  // ===== Helpers =====
  function uid() { return 'k' + Math.random().toString(36).slice(2, 10); }
  // FIX v4.6.4: localStorage-Schreibfehler (Quota) nicht mehr stumm schlucken —
  // Nutzer verliert sonst Daten ohne es zu merken. toast() existiert erst später,
  // daher try/catch um den Aufruf.
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); return true; }
    catch (e) {
      console.warn('[SFHL] localStorage-Schreibfehler (' + key + '):', e);
      try { toast('Speichern fehlgeschlagen — localStorage voll? Bitte exportieren!', 'error', 8000); } catch {}
      return false;
    }
  }
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

  // v4.14.0: Backup-Reminder entfernt — verwaiste Keys aus Alt-Installationen löschen
  try { localStorage.removeItem('sfhl_last_export'); localStorage.removeItem('sfhl_backup_hint_at'); } catch {}

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
    { hex:'#E6FFE6', name:'Gr\u00fcn' },    { hex:'#FFCCCC', name:'Rot' },     { hex:'#FFFFCC', name:'Gelb' },    { hex:'#FFE5CC', name:'Orange' },  { hex:'#E6F0FF', name:'Blau' },
    { hex:'#D6F5D6', name:'Gr\u00fcn+' },   { hex:'#FFB3B3', name:'Rot+' },    { hex:'#FFF0A0', name:'Gelb+' },   { hex:'#FFD0A0', name:'Orange+' }, { hex:'#CCE0FF', name:'Blau+' },
    { hex:'#F0E6FF', name:'Lila' },    { hex:'#E6FFFA', name:'T\u00fcrkis' },  { hex:'#FFE6F0', name:'Pink' },    { hex:'#FFF5E6', name:'Pfirsich' },{ hex:'#F0F0F0', name:'Grau' },
    { hex:'#E0CCFF', name:'Lila+' },   { hex:'#CCF5EE', name:'Mint' },    { hex:'#F5CCDF', name:'Rose' },    { hex:'#E8F5D0', name:'Limette' }, { hex:'#D8D8D8', name:'Grau+' },
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
  function saveRules() { lsSet(LS_CFG, JSON.stringify(RULES)); }

  // ===== Config: Snippets =====
  const SNIP_DEFAULTS = [
    { id:uid(), trigger:"anrede", label:"Anrede DE", body:'Guten Tag {!Contact.Salutation} {!Contact.LastName},', richText:true, category:"Standard", favorite:false },
    { id:uid(), trigger:"anredeen", label:"Anrede EN", body:'Dear {!Contact.Salutation} {!Contact.LastName},', richText:true, category:"Standard", favorite:false },
    { id:uid(), trigger:"sig", label:"Signatur DE", body:'Freundliche Grüße<br><br>{name}', richText:true, category:"Standard", favorite:false },
  ];
  function loadSnippets() {
    try {
      const raw = localStorage.getItem(LS_SNIP);
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map(e => ({ id:e.id||uid(), trigger:String(e.trigger||''), label:String(e.label||''), body:String(e.body||''), bodyEn:String(e.bodyEn||''), richText:true, category:String(e.category||''), favorite:!!e.favorite })); }
    } catch {}
    return SNIP_DEFAULTS.map(e => ({ ...e, id: uid() }));
  }
  // FIX #10: Dirty-Flag-Saves — verhindert mehrfache requestIdleCallback-Registrierung
  let _snipDirty = false, _snipFlushScheduled = false, _rulesDirty = false;
  function saveSnippets(immediate=false) {
    if (immediate) { lsSet(LS_SNIP, JSON.stringify(SNIPPETS)); _snipDirty=false; _snipFlushScheduled=false; return; }
    _snipDirty = true;
    if (_snipFlushScheduled) return;
    _snipFlushScheduled = true;
    const flush = () => { if (_snipDirty) { lsSet(LS_SNIP, JSON.stringify(SNIPPETS)); _snipDirty=false; } _snipFlushScheduled=false; };
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
  // v4.5.0: SLA-Alarm-Kanäle (sfhl_sla_blink/sound/notify). Blink default an, Rest aus.
  function loadSla(k) { const v = localStorage.getItem('sfhl_sla_' + k); return k === 'blink' ? v !== '0' : v === '1'; }
  function saveSla(k, on) { localStorage.setItem('sfhl_sla_' + k, on ? '1' : '0'); }
  // v4.5.0: Listen-Features (Farb-Legende #2, Regel aus Auswahl #3) — beide default an.
  function loadLegendOn() { return localStorage.getItem('sfhl_legend') !== '0'; }
  function saveLegendOn(on) { localStorage.setItem('sfhl_legend', on ? '1' : '0'); }
  function loadSelRuleOn() { return localStorage.getItem('sfhl_selrule') !== '0'; }
  function saveSelRuleOn(on) { localStorage.setItem('sfhl_selrule', on ? '1' : '0'); }
  // v4.5.0 #4: Button-Position (header | floating | hidden). Default floating = bisheriges Verhalten.
  function loadBtnPos() { return localStorage.getItem('sfhl_btn_pos') === 'floating' ? 'floating' : 'header'; }
  function saveBtnPos(v) { localStorage.setItem('sfhl_btn_pos', v); }
  // v4.6.0 Geräte-Doku-Lookup: KEINE URLs als Default (öffentliches Repo) — alle Link-
  // Vorlagen werden lokal per Config-Import geladen. Eintrag: {id,key,label,type,url}.
  // type ∈ root|serial|auftrag|order|free. url nutzt %s als Platzhalter (alle Vorkommen).
  function loadDokuOn() { return localStorage.getItem('sfhl_doku_enabled') !== '0'; }
  function saveDokuOn(on) { localStorage.setItem('sfhl_doku_enabled', on ? '1' : '0'); }
  // v4.15.0: eigene Adresse als Startpunkt für den "Route"-Auswahl-Shortcut
  function loadHomeAddr() { return localStorage.getItem('sfhl_home_address') || ''; }
  function saveHomeAddr(a) { localStorage.setItem('sfhl_home_address', String(a || '').slice(0, 200)); }
  function loadRulesOn() { return localStorage.getItem('sfhl_rules_enabled') !== '0'; }
  function saveRulesOn(on) { localStorage.setItem('sfhl_rules_enabled', on ? '1' : '0'); }
  function loadSnipOn() { return localStorage.getItem('sfhl_snip_enabled') !== '0'; }
  function saveSnipOn(on) { localStorage.setItem('sfhl_snip_enabled', on ? '1' : '0'); }
  // FIX v4.6.4 (Security): nur http(s)-URLs mit %s-Platzhalter zulassen —
  // "javascript:…%s" hätte sonst einen klickbaren JS-Link im Doku-Popup erzeugt.
  function isSafeDokuUrl(u) { return /^https?:\/\//i.test(u) && /%s/.test(u); }
  function loadDokuLinks() {
    try { const raw = localStorage.getItem('sfhl_doku_links'); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map(e => ({ id:e.id||uid(), key:String(e.key||''), label:String(e.label||''), type:String(e.type||'root'), url:String(e.url||''), category:String(e.category||''), enabled:e.enabled !== false })).filter(e => isSafeDokuUrl(e.url)); } } catch {}
    return [];
  }
  function saveDokuLinks(arr) { lsSet('sfhl_doku_links', JSON.stringify(arr || [])); }
  function loadDokuCatOrder() { try { const r = localStorage.getItem('sfhl_doku_cat_order_v1'); const p = r ? JSON.parse(r) : []; return Array.isArray(p) ? p.map(String) : []; } catch { return []; } }
  function saveDokuCatOrder(a) { lsSet('sfhl_doku_cat_order_v1', JSON.stringify(a || [])); }
  // v4.6.5: Reihenfolge der Snippet-Kategorien (Array von Namen). Kategorien, die nicht
  // in der Liste stehen, werden alphabetisch dahinter einsortiert.
  function loadCatOrder() { try { const r = localStorage.getItem('sfhl_cat_order_v1'); const p = r ? JSON.parse(r) : []; return Array.isArray(p) ? p.map(String) : []; } catch { return []; } }
  function saveCatOrder(a) { lsSet('sfhl_cat_order_v1', JSON.stringify(a || [])); }
  // FIX #7: loadDefaultLang cachen
  let _cachedLang = null;
  function loadDefaultLang() { if (_cachedLang === null) _cachedLang = localStorage.getItem(LS_DEF_LANG) || 'de'; return _cachedLang; }
  function saveDefaultLang(lang) { _cachedLang = lang; localStorage.setItem(LS_DEF_LANG, lang); }


  // ===== Datenmigration (#18) =====
  function runMigrations() {
    const ver = localStorage.getItem(LS_DATA_VER) || '0';
    if (semverLt(ver, DATA_VERSION)) { // FIX #1: semantischer Versionsvergleich
      // Sicherstellen dass alle Snippets bodyEn haben
      try {
        const raw = localStorage.getItem(LS_SNIP);
        if (raw) {
          const p = JSON.parse(raw);
          if (Array.isArray(p)) {
            const migrated = p.map(e => ({
              ...e,
              bodyEn: String(e.bodyEn || '')
            }));
            lsSet(LS_SNIP, JSON.stringify(migrated));
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

  function loadFolders() { try { const r = localStorage.getItem(LS_FOLDERS); return r ? JSON.parse(r) : []; } catch { return []; } }
  function saveFolders() { lsSet(LS_FOLDERS, JSON.stringify(FOLDERS)); }
  let FOLDERS = loadFolders();

  // QF5: nur ein Toast gleichzeitig — schnelle Folge-Toasts ersetzen den alten statt zu stapeln.
  // Optionales action={label,fn} rendert einen Button (z.B. "Rückgängig" nach Löschen).
  let _toastEl = null;
  function toast(msg, type='info', dur=2500, action=null) {
    if (_toastEl) { _toastEl.remove(); _toastEl = null; }
    const el = document.createElement('div'); el.className = `sfhl-toast sfhl-toast--${type}`; el.textContent = msg;
    if (action && typeof action.fn === 'function') {
      el.classList.add('has-action');
      const btn = document.createElement('button');
      btn.className = 'sfhl-toast-act'; btn.textContent = action.label || 'OK';
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
    // FIX v4.6.4 (Bug 2): wortweise prüfen statt Substring — "Neumann" enthält "neu",
    // "Newton" enthält "new", "Mehringer" enthält "mehr" → echte Nachnamen wurden verworfen.
    // Mehrwort-/Sonderzeichen-Einträge (z. B. "siehe alle", "×") weiter per Substring.
    const nameWords = new Set(lower.split(/[^a-zäöüß]+/).filter(Boolean));
    for (const bad of UI_BLACKLIST) {
      if (/[^a-zäöüß]/.test(bad)) { if (lower.includes(bad)) return false; }
      else if (nameWords.has(bad)) return false;
    }
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
        // FIX v4.6.4 (Datenschutz): nur die Record-Id loggen — Name/Telefon gehören
        // nicht in die Browser-Konsole (bleibt dort auch nach Navigation lesbar).
        console.log('[SFHL] Contact via UI API geladen (Id: ' + contactId + ')');
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
    // FIX v4.6.4 (Bug 3): Werte als Funktion übergeben — sonst interpretiert .replace()
    // "$&", "$'" usw. in gescrapten Feldwerten als Ersetzungsmuster.
    const _rep = v => () => v;
    text = text
      .replace(/\{!Case\.CaseNumber\}/gi,                    _rep(caseNum    || '[Case-Nr.]'))
      .replace(/\{!Case\.Subject\}/gi,                       _rep(betreff    || '[Betreff]'))
      .replace(/\{!Case\.Serial_number__c\}/gi,              _rep(seriennr   || '[Seriennr.]'))
      .replace(/\{!Case\.Work_Order__c\}/gi,                 _rep(arbeitsauf || '[Arbeitsauftrag]'))
      .replace(/\{!Case\.Communication_Owner__c\}/gi,        _rep(techniker  || '[Techniker]'))
      .replace(/\{!Case\.Solution_Steps__c\}/gi,             _rep(loesung    || '[Lösungstext]'))
      .replace(/\{!Contact\.Salutation\}/gi,                 _rep(anrede     || ''))
      .replace(/\{!Contact\.LastName\}/gi,                   _rep(nachname   || ''))
      .replace(/\{!Contact\.Name\}/gi,                       _rep(kontakt    || ''))
      .replace(/\{!Contact\.PhoneFormula__c\}/gi,            _rep(telefon    || '[Telefon]'))
      .replace(/\{!Contact\.MobilePhone\}/gi,                _rep(mobil      || '[Mobil]'))
      .replace(/\{!User\.Name\}/gi,                          _rep(loadUname()||'[Name]'))
      .replace(/\{!Today\}/gi,                               _rep(dateStr))
      .replace(/\{!Account\.Internal_Sales_Engineer__c\}/gi, _rep(vertrieb   || '[Vertrieb ASP]'))
      .replace(/\{!Account\.SAPAccountID__c\}/gi,            _rep(kundennr   || '[Kundennr.]'))
      .replace(/\{!Account\.FTXTAccountName__c\}/gi,         _rep(firma      || '[Firma]'))
      .replace(/\{!Account\.Street__c\}/gi,                  _rep(strasse    || '[Straße]'))
      .replace(/\{!Account\.City__c\}/gi,                    _rep(ort        || '[Ort]'));

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
      .replace(/\{name\}/gi,          _rep(loadUname() || '[Name]'))
      .replace(/\{datum\}/gi,          _rep(dateStr))
      .replace(/\{uhrzeit\}/gi,        _rep(timeStr))
      .replace(/\{case\}/gi,           _rep(caseNum      || '[Case-Nr.]'))
      .replace(/\{betreff\}/gi,        _rep(betreff      || '[Betreff]'))
      .replace(/\{anrede\}/gi,         _rep(anrede       || ''))
      .replace(/\{nachname\}/gi,       _rep(nachname     || '[Name]'))
      .replace(/\{kontakt\}/gi,        _rep(kontakt      || '[Kontakt]'))
      .replace(/\{kunde\}/gi,          _rep(kunde        || '[Kunde]'))
      .replace(/\{produkt\}/gi,        _rep(produkt      || '[Produkt]'))
      .replace(/\{seriennummer\}/gi,   _rep(seriennr     || '[Seriennr.]'))
      .replace(/\{telefon\}/gi,        _rep(telefon      || '[Telefon]'))
      .replace(/\{mobil\}/gi,          _rep(mobil        || '[Mobil]'))
      .replace(/\{arbeitsauftrag\}/gi, _rep(arbeitsauf   || '[Arbeitsauftrag]'))
      .replace(/\{vertrieb\}/gi,       _rep(vertrieb     || '[Vertrieb ASP]'))
      .replace(/\{techniker\}/gi,      _rep(techniker    || '[Techniker]'))
      .replace(/\{kundennr\}/gi,       _rep(kundennr     || '[Kundennr.]'))
      .replace(/\{firma\}/gi,          _rep(firma        || '[Firma]'))
      .replace(/\{strasse\}/gi,        _rep(strasse      || '[Straße]'))
      .replace(/\{ort\}/gi,            _rep(ort          || '[Ort]'))
      .replace(/\{loesung\}/gi,        _rep('[Lösungstext]'));
  }

  // ===== Count matches for a term =====
  function countMatches(term) {
    if (!term) return 0;
    const rows = getRows();
    const needCols = term.includes('=');
    let n = 0;
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      let txt = '';
      for (const c of cells) txt += ' ' + (c.innerText || c.textContent || '');
      if (matchesRule(txt, term, needCols ? getRowCols(row) : null)) n++;
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

    /* v4.7.0: Import-Dialog (Vorschau + Ersetzen/Hinzufügen) */
    .sfhl-modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
    .sfhl-modal{background:#fff;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.3);width:360px;max-width:92vw;padding:16px}
    .sfhl-modal h3{margin:0 0 8px;font-size:14px;font-weight:700;color:#1a1a1a}
    .sfhl-modal-body{font-size:12.5px;color:#374151;margin:0 0 14px;line-height:1.6}
    .sfhl-modal-acts{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}

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
    .sfhl-panel{position:fixed;top:0;right:0;bottom:0;width:460px;min-width:340px;max-width:700px;background:#fff;z-index:2147483647;box-shadow:-8px 0 40px rgba(0,0,0,.12);transform:translateX(100%);transition:transform .28s cubic-bezier(.22,.68,0,1);display:flex;flex-direction:column;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a}
    .sfhl-panel.open{transform:translateX(0)} .sfhl-panel.resizing{transition:none;user-select:none}
    .sfhl-resize{position:absolute;left:-4px;top:0;bottom:0;width:8px;cursor:ew-resize;z-index:5}
    .sfhl-resize::after{content:'';position:absolute;left:3px;top:50%;transform:translateY(-50%);width:2px;height:40px;background:#d1d5db;border-radius:2px;opacity:.25;transition:opacity .15s,background .15s}
    .sfhl-resize:hover::after,.sfhl-panel.resizing .sfhl-resize::after{opacity:1;background:#0176d3}

    /* Header + Tabs */
    .sfhl-hdr{padding:10px 16px 0;border-bottom:1px solid #e5e7eb;background:#f9fafb;flex-shrink:0}
    .sfhl-hdr-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
    .sfhl-hdr-top h2{font-size:14px;font-weight:600;margin:0;color:#111}
    .sfhl-hdr-acts{display:flex;align-items:center;gap:2px}
    .sfhl-ib{width:30px;height:30px;border-radius:6px;background:transparent;cursor:pointer;color:#6b7280;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,color .12s;position:relative}
    .sfhl-ib:hover{background:#f3f4f6;color:#111} .sfhl-ib svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .sfhl-ib.sfhl-help-btn.active{background:#eef4ff;color:#0176d3}
    .sfhl-ib.sfhl-settings-btn.active{background:#eef4ff;color:#0176d3}
    .sfhl-tabs{display:flex;gap:0;margin:0 -16px;padding:0 16px}
    .sfhl-tab{padding:8px 10px;font-size:12.5px;font-weight:500;color:#9ca3af;cursor:pointer;border-bottom:2px solid transparent;transition:color .12s,border-color .12s;white-space:nowrap;display:flex;align-items:center;gap:4px}
    .sfhl-tab svg{flex-shrink:0;opacity:.7;transition:opacity .12s} .sfhl-tab.active svg,.sfhl-tab:hover svg{opacity:1}
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
    .sfhl-search{padding:8px 16px;border-bottom:1px solid #f3f4f6;flex-shrink:0;position:relative}
    .sfhl-search input{width:100%;padding:6px 28px 6px 30px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E") 10px center no-repeat;transition:border-color .12s}
    .sfhl-search input:focus{outline:none;border-color:#0176d3;box-shadow:0 0 0 2px rgba(1,118,211,.1)}
    .sfhl-search-clear{position:absolute;right:20px;top:50%;transform:translateY(-50%);cursor:pointer;color:#9ca3af;font-size:13px;width:18px;height:18px;display:none;align-items:center;justify-content:center;border-radius:50%;transition:background .12s,color .12s}
    .sfhl-search-clear:hover{background:#f3f4f6;color:#374151} .sfhl-search-clear.vis{display:flex}

    /* Rules tab styles */
    .sfhl-colhdr{display:grid;grid-template-columns:20px 36px minmax(0,1fr) 28px auto;gap:4px;padding:6px 16px;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f3f4f6;flex-shrink:0}
    .sfhl-list{flex:1;overflow-y:auto;overflow-x:hidden;padding:2px 0;min-height:0}
    .sfhl-list::-webkit-scrollbar{width:4px} .sfhl-list::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:4px}
    .sfhl-row{display:grid;grid-template-columns:20px 36px minmax(0,1fr) 28px auto;gap:4px;padding:5px 16px;align-items:center;transition:background .12s;cursor:grab;border-left:3px solid transparent}
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
    .sfhl-palette-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:8px;max-width:180px}
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
    .sfhl-sel-wrap{position:absolute;z-index:2147483646;display:flex;gap:4px}
    .sfhl-sel-btn{background:#0176d3;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;font-weight:600;padding:5px 10px;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;user-select:none;white-space:nowrap}
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
    /* Doku Tab */
    .sfhl-doku-tab-bar,.sfhl-feat-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #f3f4f6;flex-shrink:0}
    .sfhl-feat-bar-label{font-size:11px;color:#6b7280}
    .sfhl-feat-bar.off .sfhl-feat-bar-label{color:#9ca3af;text-decoration:line-through}
    .sfhl-doku-form{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-top:1px solid #eef4ff;background:#f8faff;flex-shrink:0}
    .sfhl-doku-form-row{display:flex;gap:6px}
    .sfhl-doku-f-key{flex:0 0 100px;padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-size:12px}
    .sfhl-doku-f-type{flex:1;padding:5px 6px;border:1px solid #e5e7eb;border-radius:5px;font-size:12px;background:#fff}
    .sfhl-doku-f-label,.sfhl-doku-f-url,.sfhl-doku-f-cat{width:100%;box-sizing:border-box;padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-size:12px}
    .sfhl-doku-f-url:invalid{border-color:#f87171}
    .sfhl-doku-form-acts{display:flex;gap:6px;justify-content:flex-end}
    .sfhl-doku-link-list{flex:1;overflow-y:auto;padding:6px 0}
    .sfhl-doku-entry{display:flex;flex-direction:column;gap:3px;padding:7px 12px;border-bottom:1px solid #f9fafb;cursor:default}
    .sfhl-doku-entry:hover{background:#f9fafb}
    .sfhl-doku-entry-top{display:flex;align-items:center;gap:6px}
    .sfhl-doku-entry-key{font-size:11px;font-weight:700;background:#eef4ff;color:#0176d3;border-radius:4px;padding:1px 6px;flex-shrink:0}
    .sfhl-doku-entry-type{font-size:10px;color:#9ca3af;background:#f3f4f6;border-radius:3px;padding:1px 5px;flex-shrink:0}
    .sfhl-doku-entry-label{font-size:12px;font-weight:500;color:#1a1a1a;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sfhl-doku-entry-url{font-size:10.5px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sfhl-doku-entry-acts{display:flex;gap:4px;flex-shrink:0}
    .sfhl-doku-entry-edit,.sfhl-doku-entry-del{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:4px;cursor:pointer;color:#9ca3af;transition:background .1s,color .1s}
    .sfhl-doku-entry-edit:hover{background:#eef4ff;color:#0176d3}
    .sfhl-doku-entry-del:hover{background:#fee2e2;color:#dc2626}
    .sfhl-doku-entry.disabled .sfhl-doku-entry-key,.sfhl-doku-entry.disabled .sfhl-doku-entry-label,.sfhl-doku-entry.disabled .sfhl-doku-entry-url{opacity:.4;text-decoration:line-through}
    .sfhl-doku-empty{padding:24px 16px;text-align:center;color:#9ca3af;font-size:12px}
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
    .sfhl-snip-editor{display:none;padding:12px 16px;border-top:1px solid #f3f4f6;background:#fafafa;flex-shrink:0;overflow-y:auto;max-height:75vh}
    .sfhl-snip-editor.vis{display:block}
    .sfhl-snip-editor .sfhl-field{margin-bottom:8px}
    .sfhl-snip-editor .sfhl-field label{display:block;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.3px;margin-bottom:3px}
    .sfhl-snip-editor input,.sfhl-snip-editor select{width:100%;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12.5px}
    .sfhl-snip-editor input:focus,.sfhl-snip-editor select:focus,.sfhl-snip-editor textarea:focus{outline:none;border-color:#0176d3;box-shadow:0 0 0 2px rgba(1,118,211,.1)}
    .sfhl-snip-editor textarea{width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:monospace;min-height:160px;resize:vertical;line-height:1.5;white-space:pre;overflow-x:auto}
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
    .sfhl-cat-del{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:3px;cursor:pointer;color:#d1d5db;font-size:11px;flex-shrink:0;line-height:1;transition:background .1s,color .1s}
    .sfhl-cat-del:hover{background:#fee2e2;color:#dc2626}

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
    /* v4.6.5: Sortier-Pfeile für Ordner + Snippet-Kategorien */
    .sfhl-mv{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;cursor:pointer;color:#9ca3af;font-size:9px;flex-shrink:0;user-select:none;transition:background .1s,color .1s}
    .sfhl-mv:hover{background:#dbeafe;color:#0176d3}
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
    .sfhl-rte-body{min-height:160px;max-height:420px;overflow-y:auto;overflow-x:auto;padding:8px 10px;font-size:12.5px;line-height:1.6;outline:none;white-space:pre-wrap}
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
    .sfhl-rule-prio{min-width:34px;height:26px;border-radius:6px;background:#f3f4f6;color:#b0b7c3;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:monospace}
    /* v4.6.5: Prio direkt eintippbar — löst das Priorisieren über Ordnergrenzen hinweg */
    .sfhl-rule-prio-inp{width:34px;height:26px;box-sizing:border-box;border:1px solid #cfe3fb;border-radius:6px;background:#eef4ff;color:#0176d3;font-size:13px;font-weight:700;text-align:center;font-family:monospace;padding:0;flex-shrink:0;cursor:text}
    .sfhl-rule-prio-inp:hover{border-color:#0176d3}
    .sfhl-rule-prio-inp:focus{outline:none;border-color:#0176d3;background:#fff;box-shadow:0 0 0 2px rgba(1,118,211,.15)}
    .sfhl-row:not(.disabled) .sfhl-rule-prio.has-prio{background:#eef4ff;color:#0176d3}
    /* Category chips */
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
    .sfhl-set-row2 label{min-width:128px;font-size:12px;color:#6b7280;flex-shrink:0}
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
    .sfhl-rf-presets{display:flex;gap:6px;margin-top:4px;flex-wrap:wrap}
    .sfhl-rf-preset{padding:3px 10px;border-radius:99px;border:1px solid #e5e7eb;background:#fff;font-size:11px;font-weight:500;color:#374151;cursor:pointer;transition:all .12s}
    .sfhl-rf-preset:hover{background:#eef4ff;border-color:#0176d3;color:#0176d3}
    .sfhl-rf-preset.active{background:#0176d3;border-color:#0176d3;color:#fff}
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
    /* Lang-Tabs (#34) */
    .sfhl-lang-tab{padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #e5e7eb;background:#fff;color:#9ca3af;transition:all .12s}
    .sfhl-lang-tab.active{background:#eef4ff;border-color:#0176d3;color:#0176d3}
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
        <div class="sfhl-tab active" data-tab="rules"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg><span>Markierung</span><span class="sfhl-tab-badge sfhl-rules-count">0</span></div>
        <div class="sfhl-tab" data-tab="snippets"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg><span>Snippets</span><span class="sfhl-tab-badge sfhl-snip-count">0</span></div>
        <div class="sfhl-tab" data-tab="doku"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg><span>Doku</span><span class="sfhl-tab-badge sfhl-doku-count-badge">0</span></div>
        <div class="sfhl-tab" data-tab="refresh"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg><span>Aktualisierung</span></div>
      </div>
    </div>

    <!-- ===== Markierung Tab ===== -->
    <div class="sfhl-tab-content active" data-tab="rules">
      <div class="sfhl-feat-bar sfhl-rules-feat-bar"><label class="sfhl-tgl" style="flex-shrink:0"><input type="checkbox" class="sfhl-rules-enabled"><span class="sl"></span></label><span class="sfhl-feat-bar-label">Markierung aktiv</span><span style="flex:1"></span></div>
      <div class="sfhl-search"><input type="text" placeholder="Regeln durchsuchen\u2026" class="sfhl-search-input"><span class="sfhl-search-clear" role="button" title="L\u00f6schen">\u2715</span></div>
      <div class="sfhl-colhdr"><div></div><div title="Priorität: 1 = wird zuerst geprüft. Zahl anklicken und ändern zum Umsortieren.">Prio</div><div>Stichwort</div><div>Farbe</div><div>Aktionen</div></div>
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
      <div class="sfhl-feat-bar sfhl-snip-feat-bar"><label class="sfhl-tgl" style="flex-shrink:0"><input type="checkbox" class="sfhl-snip-enabled"><span class="sl"></span></label><span class="sfhl-feat-bar-label">Snippets aktiv</span><span style="flex:1"></span></div>
      <div class="sfhl-search"><input type="text" placeholder="Snippets durchsuchen\u2026" class="sfhl-snip-search-input"><span class="sfhl-search-clear" role="button" title="L\u00f6schen">\u2715</span></div>
      <div class="sfhl-snip-list"></div>
      <div class="sfhl-add-bar"><div class="sfhl-add-toggle sfhl-snip-add-toggle" role="button"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Neues Snippet</div><div class="sfhl-folder-add-btn sfhl-snip-folder-add-btn" role="button"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Ordner</div></div>
      <div class="sfhl-snip-editor" data-mode="add">
        <div class="sfhl-ed-row"><div class="sfhl-field"><label>Trigger</label><input type="text" class="sfhl-ed-trigger" placeholder="gruss"></div><div class="sfhl-field"><label>Bezeichnung</label><input type="text" class="sfhl-ed-label" placeholder="Standardgru\u00df DE"></div></div>
        <div class="sfhl-field"><label>Ordner</label><input type="text" class="sfhl-ed-category" list="sfhl-cat-list" placeholder="z.B. Begr\u00fc\u00dfung"><datalist id="sfhl-cat-list"></datalist></div>
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
              <button class="sfhl-rtb sfhl-rtb-markdown sfhl-rtb-md" title="Markdown importieren (wird in HTML konvertiert)">MD</button>
              <div class="sfhl-rte-divider"></div>
              <select class="sfhl-rtb-snip-insert" title="Vorlage einf\u00fcgen" style="height:26px;font-size:11px;border:1px solid #e5e7eb;border-radius:4px;padding:0 4px;cursor:pointer;max-width:110px"><option value="">+ Vorlage</option></select>
            </div>
            <div class="sfhl-editor-content sfhl-rte-body" contenteditable="true" spellcheck="true" lang="de"></div>
          </div>
          <textarea class="sfhl-ed-body" style="display:none" wrap="off"></textarea>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px"><span class="sfhl-spell-lang" data-lang="de">🔤 Sprachprüfung: DE</span><span class="sfhl-counter"></span></div>
        <div style="font-size:10px;color:#9ca3af;margin-top:4px">Platzhalter per <b>{x}</b>-Button oben einf\u00fcgen. Cursor-Position: {|}</div>
        <div class="sfhl-var-hint">Eingabe-Variable: <code style="background:#f3e8ff;padding:0 3px;border-radius:2px">{eingabe:Beschriftung}</code> → fragt beim Einfügen nach dem Wert (#45)</div>
        <div class="sfhl-ed-foot">
          <div class="sfhl-btn-sm sfhl-ed-cancel" role="button">Abbrechen</div>
          <div style="display:flex;gap:6px"><div class="sfhl-btn-sm sfhl-ed-delete danger" role="button" style="display:none;color:#dc2626">L\u00f6schen</div><div class="sfhl-btn-sm sfhl-ed-duplicate" role="button" style="display:none">Duplizieren</div><div class="sfhl-btn-sm sfhl-btn-primary sfhl-ed-save" role="button">Speichern</div></div>
        </div>
      </div>
    </div>

    <!-- ===== Doku Tab ===== -->
    <div class="sfhl-tab-content" data-tab="doku">
      <div class="sfhl-feat-bar sfhl-doku-tab-bar">
        <label class="sfhl-tgl" style="flex-shrink:0"><input type="checkbox" class="sfhl-doku-enabled"><span class="sl"></span></label>
        <span class="sfhl-feat-bar-label">Lookup aktiv</span>
        <span style="flex:1"></span>
      </div>
      <div class="sfhl-search"><input type="text" placeholder="Doku durchsuchen\u2026" class="sfhl-doku-search-input"><span class="sfhl-search-clear" role="button" title="L\u00f6schen">\u2715</span></div>
      <div class="sfhl-doku-link-list"></div>
      <div class="sfhl-add-bar"><div class="sfhl-add-toggle sfhl-doku-new-btn" role="button"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Neuer Eintrag</div><div class="sfhl-folder-add-btn sfhl-doku-folder-add-btn" role="button"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Ordner</div></div>
      <div class="sfhl-doku-form" style="display:none">
        <div class="sfhl-doku-form-row">
          <input type="text" class="sfhl-doku-f-key" placeholder="Code-Präfix (z.B. FMR)" maxlength="24">
          <select class="sfhl-doku-f-type">
            <option value="root">Produkt-Root</option>
            <option value="order">Ordercode</option>
            <option value="serial">Seriennummer</option>
            <option value="auftrag">Auftrag</option>
            <option value="free">Suche (immer)</option>
          </select>
        </div>
        <input type="text" class="sfhl-doku-f-label" placeholder="Bezeichnung (max. 100 Zeichen)" maxlength="100">
        <input type="text" class="sfhl-doku-f-url" placeholder="URL mit %s (z.B. https://example.com/?q=%s)" maxlength="500">
        <input type="text" class="sfhl-doku-f-cat" list="sfhl-doku-cat-list" placeholder="Ordner (optional)" maxlength="60"><datalist id="sfhl-doku-cat-list"></datalist>
        <div class="sfhl-doku-form-acts">
          <div class="sfhl-btn-sm sfhl-doku-f-cancel" role="button">Abbrechen</div>
          <div class="sfhl-btn-sm sfhl-btn-primary sfhl-doku-f-save" role="button">Speichern</div>
        </div>
      </div>
    </div>

    <!-- ===== Aktualisierung Tab ===== -->
    <div class="sfhl-tab-content" data-tab="refresh">
      <div class="sfhl-refresh-body">
        <div class="sfhl-rf-card">
          <h3>Auto-Refresh</h3>
          <div class="rfr"><label>Auto-Refresh</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-rf-enabled"><span class="sl"></span></span><span class="sfhl-sp" style="margin-left:8px"></span></div>
          <div class="rfr"><label>Intervall</label><input type="number" min="5" step="5" class="sfhl-rf-secs" placeholder="60"><label>Sekunden</label></div>
          <div class="sfhl-rf-presets">
            <span class="sfhl-rf-preset" data-secs="30">30s</span>
            <span class="sfhl-rf-preset" data-secs="60">1 min</span>
            <span class="sfhl-rf-preset" data-secs="120">2 min</span>
            <span class="sfhl-rf-preset" data-secs="300">5 min</span>
          </div>
          <p style="font-size:11px;color:#9ca3af;margin-top:8px;margin-bottom:0">Nur auf Case-Listenseiten aktiv. Countdown erscheint im SF-Refresh-Button.</p>
        </div>
        <div class="sfhl-rf-ring-wrap">
          <div class="sfhl-rf-ring">
            <svg viewBox="0 0 100 100"><circle class="sfhl-rf-ring-bg" cx="50" cy="50" r="42"/><circle class="sfhl-rf-ring-prog" cx="50" cy="50" r="42"/></svg>
            <span class="sfhl-rf-ring-lbl">–</span>
          </div>
          <span class="sfhl-rf-ring-status"></span>
        </div>
      </div>
    </div>

    <!-- ===== Einstellungen Tab ===== -->
    <div class="sfhl-tab-content" data-tab="settings">
      <div class="sfhl-settings-body">
        <div class="sfhl-set-section">
          <h3>Allgemein</h3>
          <div class="sfhl-set-row2"><label>Trigger-Prefix</label><select class="sfhl-set-prefix">${PREFIXES.map(p=>`<option value="${p}">${p}</option>`).join('')}</select></div>
          <div class="sfhl-set-row2"><label>Dein Name</label><input type="text" class="sfhl-set-uname" placeholder="Max Mustermann"></div>
          <div class="sfhl-set-row2"><label>Snippet-Sprache</label><select class="sfhl-set-lang"><option value="de">Deutsch</option><option value="en">English</option></select></div>
          <div class="sfhl-set-row2"><label>Button</label><select class="sfhl-set-btnpos"><option value="floating">Schwebend (unten rechts)</option><option value="header">SF-Kopfleiste</option></select></div>
          <p style="font-size:11px;color:#9ca3af;margin-top:6px">Tipp: <code>;;en</code> zeigt vorübergehend die EN-Snippet-Varianten, <code>;;de</code> die deutschen. Das Panel öffnet immer auch mit <code>Alt+R</code>.</p>
        </div>
        <div class="sfhl-set-section">
          <h3>E-Mail Bausteine</h3>
          <div class="sfhl-set-row2"><label>Auto-Wrap</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-wrap-enabled"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Anrede + Signatur automatisch einf\u00fcgen</span></div>
          <div class="sfhl-set-row2"><label>Anrede</label><select class="sfhl-wrap-anrede"></select></div>
          <div class="sfhl-set-row2"><label>Signatur</label><select class="sfhl-wrap-sig"></select></div>
          <p style="font-size:11px;color:#9ca3af;margin-top:6px">Wenn aktiv, wird beim Einf\u00fcgen eines Snippets automatisch die Anrede davor und die Signatur danach eingef\u00fcgt. Gilt nicht wenn das Snippet selbst die Anrede oder Signatur ist.</p>
        </div>
        <div class="sfhl-set-section">
          <h3>Liste</h3>
          <div class="sfhl-set-row2"><label>Farb-Legende</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-legend-enabled"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Legende der aktiven Markierungen \u00fcber der Case-Liste</span></div>
          <div class="sfhl-set-row2"><label>Regel aus Auswahl</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-selrule-enabled"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Listentext markieren \u2192 Schaltfl\u00e4che \u201eRegel aus Auswahl"</span></div>
        </div>
        <div class="sfhl-set-section">
          <h3>Karten / Route</h3>
          <div class="sfhl-set-row2"><label>Meine Adresse</label><input type="text" class="sfhl-set-homeaddr" placeholder="Musterstra\u00dfe 1, 12345 Musterstadt" maxlength="200"></div>
          <p style="font-size:11px;color:#9ca3af;margin-top:6px">Adresse in Salesforce markieren \u2192 \u201e\ud83d\uddfa\ufe0f GMaps\u201c sucht sie in Google Maps, \u201e\ud83d\ude97 Route\u201c plant die Route von deiner Adresse dorthin. Die Adresse wird nur lokal gespeichert. Beide Shortcuts h\u00e4ngen am \u201eLookup aktiv\u201c-Schalter im Doku-Tab.</p>
        </div>
        <div class="sfhl-set-section">
          <h3>SLA-Alarm</h3>
          <div class="sfhl-set-row2"><label>Tab-Blinken</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-sla-blink"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Tab-Titel blinkt bei neuem Treffer</span></div>
          <div class="sfhl-set-row2"><label>Ton</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-sla-sound"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Kurzer Signalton</span></div>
          <div class="sfhl-set-row2"><label>Benachrichtigung</label><span class="sfhl-tgl"><input type="checkbox" class="sfhl-sla-notify"><span class="sl"></span></span><span style="font-size:11px;color:#6b7280;margin-left:6px">Desktop-Benachrichtigung</span></div>
          <p style="font-size:11px;color:#9ca3af;margin-top:6px">Greift, wenn der Auto-Refresh einen <b>neuen</b> Treffer einer Regel mit aktiviertem <span style="color:#dc2626">\ud83d\udd14</span>-Alarm findet. Alarm pro Regel \u00fcber das Glocken-Symbol in der Markierungs-Liste schalten.</p>
        </div>
        <div class="sfhl-set-section">
          <h3>Backup</h3>
          <div class="sfhl-set-actions">
            <div class="sfhl-btn-sm sfhl-act-export" role="button">\u2193 Alles exportieren</div>
            <div class="sfhl-btn-sm sfhl-act-export-rules" role="button">\u2193 Markierungen</div>
            <div class="sfhl-btn-sm sfhl-act-export-snips" role="button">\u2193 Snippets</div>
            <div class="sfhl-btn-sm sfhl-act-export-doku" role="button">\u2193 Doku-Links</div>
            <div class="sfhl-btn-sm sfhl-act-import" role="button">\u2191 Datei importieren</div>
          </div>
          <p style="font-size:11px;color:#9ca3af;margin-top:6px">\u201eAlles exportieren\u201c sichert Regeln, Snippets, Doku-Links und Einstellungen. Import ersetzt die bestehenden Daten.</p>
        </div>
        <div class="sfhl-set-section">
          <h3>Zur\u00fccksetzen</h3>
          <div class="sfhl-set-actions">
            <div class="sfhl-btn-danger sfhl-act-reset-rules" role="button">Markierungen zur\u00fccksetzen</div>
            <div class="sfhl-btn-danger sfhl-act-reset-snips" role="button">Snippets zur\u00fccksetzen</div>
            <div class="sfhl-btn-danger sfhl-act-reset" role="button">Alles zur\u00fccksetzen</div>
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
              <p>Dieses Tool erweitert Salesforce Lightning um vier Hauptfunktionen: <b>Zeilen-Markierung</b> in Case-Listen, <b>Text-Snippets</b> mit Platzhaltern, <b>Ger\u00e4te-Doku-Lookup</b> und <b>Auto-Refresh</b> mit Countdown.</p>
              <p>Die Tabs <b>Markierung</b>, <b>Snippets</b> und <b>Doku</b> sind gleich aufgebaut: oben ein Ein/Aus-Schalter f\u00fcr die ganze Funktion und ein Suchfeld, unten die Buttons zum Anlegen von Eintr\u00e4gen und Ordnern.</p>
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
              <p><b>Priorit\u00e4t:</b> Die Zahl links neben jeder Regel zeigt die Pr\u00fcf-Reihenfolge (1 = zuerst). Zahl anklicken, neue Position eintippen, Enter \u2014 die Regel wird global umsortiert, auch \u00fcber Ordnergrenzen hinweg.</p>
              <table class="sfhl-help-tbl">
                <tr><th>Operator</th><th>Bedeutung</th><th>Beispiel</th></tr>
                <tr><td><code>Begriff</code></td><td>Textsuche (case-insensitive)</td><td><code>dringend</code></td></tr>
                <tr><td><code>A + B</code></td><td>UND: beide m\u00fcssen vorkommen</td><td><code>SLA + dringend</code></td></tr>
                <tr><td><code>A | B</code></td><td>ODER: mindestens einer</td><td><code>urgent | eilig</code></td></tr>
                <tr><td><code>!text</code></td><td>NICHT: darf nicht vorkommen</td><td><code>SLA + !closed</code></td></tr>
                <tr><td><code>/regex/i</code></td><td>Regul\u00e4rer Ausdruck</td><td><code>/Fehler\s*\d+/i</code></td></tr>
                <tr><td><code>Spalte=Wert</code></td><td>Nur in dieser Spalte suchen</td><td><code>Status=Neu</code></td></tr>
              </table>
              <p style="font-size:11px;color:#9ca3af"><code>Spalte=Wert</code> pr\u00fcft nur die Zelle, deren Spalten\u00fcberschrift den Namen enth\u00e4lt \u2014 kombinierbar: <code>Status=Neu + dringend</code>.</p>
              <p><b>Ordner:</b> Regeln lassen sich in Ordnern gruppieren. \u201eOrdner\u201c-Button erstellt einen neuen Ordner, Regeln per Drag &amp; Drop hineinziehen.</p>
              <p><b>Regel aus Auswahl:</b> Text in der Case-Liste markieren \u2192 die Schaltfl\u00e4che \u201eRegel aus Auswahl\u201c legt daraus direkt eine Regel an (abschaltbar unter Einstellungen \u2192 Liste).</p>
              <p><b>SLA-Alarm:</b> Das Glocken-Symbol an einer Regel meldet neue Treffer nach dem Auto-Refresh \u2014 per Tab-Blinken, Ton oder Desktop-Benachrichtigung (Einstellungen \u2192 SLA-Alarm).</p>
              <p><b>Farb-Legende:</b> Zeigt die aktiven Markierungen \u00fcber der Case-Liste (Einstellungen \u2192 Liste).</p>
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
                <tr><td><code>{case}</code> / <code>{betreff}</code></td><td>Vorgangsnummer / Betreff</td></tr>
                <tr><td><code>{anrede}</code> / <code>{nachname}</code></td><td>Anrede / Nachname des Kontakts</td></tr>
                <tr><td><code>{kontakt}</code> / <code>{telefon}</code></td><td>Voller Name / Telefon des Kontakts</td></tr>
                <tr><td><code>{firma}</code></td><td>Firmenname (Account)</td></tr>
                <tr><td><code>{seriennummer}</code></td><td>Seriennummer aus dem Case</td></tr>
                <tr><td><code>{|}</code></td><td>Cursor-Position nach Einf\u00fcgen</td></tr>
                <tr><td><code>{eingabe:Text}</code></td><td>Fragt interaktiv nach dem Wert</td></tr>
                <tr><td><code>{!Case.Subject}</code></td><td>SF Merge-Feld (DOM-basiert)</td></tr>
              </table>
              <p><b>Auto-Wrap</b> (in Einstellungen): F\u00fcgt automatisch Anrede und Signatur um jeden Textbaustein.</p>
              <p><b>Ordner:</b> Snippets lassen sich \u00fcber das Feld \u201eOrdner\u201c im Editor oder den \u201eOrdner\u201c-Button gruppieren. Sortieren per \u25b2\u25bc, Umbenennen per Doppelklick, leere Ordner l\u00f6schen per \u2715. Weitere Features: Favoriten, Duplizieren.</p>
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
              <div class="sfhl-help-dot" style="background:#14b8a6"></div>
              <span class="sfhl-help-lbl">Ger\u00e4te-Doku-Lookup</span>
              <svg class="sfhl-help-chv" viewBox="0 0 12 12"><polyline points="2,4 6,8 10,4"/></svg>
            </div>
            <div class="sfhl-help-bdy"><div class="sfhl-help-inn">
              <p>Text in Salesforce markieren (z.B. Ordercode oder Seriennummer) \u2192 ein Popup zeigt passende Doku-Links.</p>
              <p>Im Tab <b>Doku</b> werden die Link-Vorlagen gepflegt: <b>+ Eintrag</b> erstellt eine Vorlage (Code-Pr\u00e4fix, Typ, Bezeichnung, URL mit <code>%s</code> als Platzhalter). Eintr\u00e4ge lassen sich in <b>Ordner</b> gruppieren und per \u25b2\u25bc sortieren.</p>
              <p>Jeder Eintrag l\u00e4sst sich \u00fcber seinen Schalter einzeln deaktivieren \u2014 er bleibt gespeichert, taucht aber nicht mehr im Popup auf. Der Lookup funktioniert auch im E-Mail-Editor.</p>
              <p><b>Adress-Shortcuts:</b> Eine Adresse markieren \u2192 \u201e\ud83d\uddfa\ufe0f GMaps\u201c sucht sie in Google Maps, \u201e\ud83d\ude97 Route\u201c plant die Route von deiner eigenen Adresse dorthin (Startadresse unter Einstellungen \u2192 Karten / Route hinterlegen). Beide h\u00e4ngen am \u201eLookup aktiv\u201c-Schalter.</p>
              <p>Export der Doku-Links: Einstellungen \u2192 Backup \u2192 \u201e\u2193 Doku-Links\u201c. Import \u00fcber \u201e\u2191 Datei importieren\u201c.</p>
            </div></div>
          </div>

          <div class="sfhl-help-sec">
            <div class="sfhl-help-hdr">
              <div class="sfhl-help-dot" style="background:#8b5cf6"></div>
              <span class="sfhl-help-lbl">Einstellungen &amp; Backup</span>
              <svg class="sfhl-help-chv" viewBox="0 0 12 12"><polyline points="2,4 6,8 10,4"/></svg>
            </div>
            <div class="sfhl-help-bdy"><div class="sfhl-help-inn">
              <ul>
                <li><b>Trigger-Prefix</b> \u2014 z.B. <code>;;</code>, <code>::</code>, <code>//</code></li>
                <li><b>Dein Name</b> \u2014 wird f\u00fcr <code>{name}</code> verwendet</li>
                <li><b>Snippet-Sprache</b> \u2014 Snippet-Variante DE/EN beim Einf\u00fcgen</li>
                <li><b>Auto-Wrap</b> \u2014 Anrede/Signatur automatisch ein-/ausschalten</li>
                <li><b>Button</b> \u2014 Panel-Button schwebend (unten rechts) oder in der SF-Kopfleiste</li>
                <li><b>Liste</b> \u2014 Farb-Legende und \u201eRegel aus Auswahl\u201c ein-/ausschalten</li>
                <li><b>Karten / Route</b> \u2014 eigene Adresse als Startpunkt f\u00fcr den \u201eRoute\u201c-Shortcut (nur lokal gespeichert)</li>
                <li><b>SLA-Alarm</b> \u2014 Tab-Blinken, Ton oder Desktop-Benachrichtigung bei neuen Treffern</li>
                <li><b>Alles exportieren</b> \u2014 Regeln, Snippets, Doku-Links, Ordner und Einstellungen als JSON-Datei sichern</li>
                <li><b>Import</b> \u2014 zeigt vor dem Einlesen, was die Datei enth\u00e4lt. <b>Ersetzen</b> \u00fcberschreibt, <b>Hinzuf\u00fcgen</b> erg\u00e4nzt nur Neues (praktisch zum Teilen mit Kollegen). Per Toast-Button r\u00fcckg\u00e4ngig machbar</li>
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
  const slaBlinkCb  = $('.sfhl-sla-blink');
  const slaSoundCb  = $('.sfhl-sla-sound');
  const slaNotifyCb = $('.sfhl-sla-notify');
  const legendCb    = $('.sfhl-legend-enabled');
  const selRuleCb   = $('.sfhl-selrule-enabled');
  const btnPosSel   = $('.sfhl-set-btnpos');
  const setHomeAddr = $('.sfhl-set-homeaddr');
  rfInput.value = String(loadRefreshSecs());
  rfCb.checked = loadRefreshOn();
  setPrefix.value = loadPrefix();
  setUname.value = loadUname();
  setLang.value = loadDefaultLang();
  wrapCb.checked = loadWrapOn();
  slaBlinkCb.checked = loadSla('blink');
  slaSoundCb.checked = loadSla('sound');
  slaNotifyCb.checked = loadSla('notify');
  legendCb.checked = loadLegendOn();
  selRuleCb.checked = loadSelRuleOn();
  btnPosSel.value = loadBtnPos();
  setHomeAddr.value = loadHomeAddr();

  // Wrap-Dropdowns befüllen — FIX v4.6.4: wird jetzt bei jedem renderSnippets()
  // aufgerufen (vorher nur bei Init/Prefix-Wechsel → neue/umbenannte Snippets fehlten
  // bis F5). Fehlt das gespeicherte Trigger-Snippet, wird das sichtbar markiert.
  function updateWrapDropdowns() {
    const prefix = loadPrefix();
    const opts = SNIPPETS.map(s => `<option value="${escH(s.trigger)}">${escH(prefix+s.trigger)} \u2014 ${escH(s.label)}</option>`).join('');
    for (const [sel, val] of [[wrapAnrSel, loadWrapAnrede()], [wrapSigSel, loadWrapSignatur()]]) {
      const exists = SNIPPETS.some(s => s.trigger === val);
      sel.innerHTML = (exists ? '' : `<option value="${escH(val)}">⚠ ${escH(prefix+val)} — Snippet fehlt</option>`) + opts;
      sel.value = val;
    }
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
    panel.querySelector('.sfhl-doku-form').style.display = 'none';
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

  // ===== Panel open/close =====
  let activeSwatch = null;
  function openPanel() { panel.classList.add('open'); backdrop.classList.add('vis'); applyPanelMinW(); }
  function closePanel() { panel.classList.remove('open'); backdrop.classList.remove('vis'); closePalette(); }
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
    // FIX v4.6.4: zusätzlich e.code prüfen — auf macOS liefert Alt+R '®' als e.key
    if (e.altKey && !e.ctrlKey && (e.key.toLowerCase() === 'r' || e.code === 'KeyR')) { e.preventDefault(); panel.classList.contains('open') ? closePanel() : openPanel(); }
  });
  // FIX v4.6.5: SF-Globalkürzel (Omni-Channel 'o', Edit 'e', usw.) dürfen nicht feuern,
  // wenn der Fokus im Panel liegt. Capture-Phase auf *window* — window ist die erste
  // Station im Capture-Pfad, also vor allen document-Level-Listenern von Salesforce,
  // unabhängig davon wann diese registriert wurden.
  window.addEventListener('keydown', e => {
    if (!panel.contains(e.target)) return;
    if (e.key === 'Escape') { closePanel(); closeDropdown(); }
    if (e.altKey && !e.ctrlKey && (e.key.toLowerCase() === 'r' || e.code === 'KeyR')) { e.preventDefault(); closePanel(); }
    e.stopImmediatePropagation();
  }, true);

  // Resize — Mindestbreite dynamisch: alle Tabs müssen sichtbar bleiben
  const tabsRowEl = panel.querySelector('.sfhl-tabs');
  function minPanelW() {
    let w = 34;
    tabsRowEl.querySelectorAll('.sfhl-tab').forEach(t => { w += t.offsetWidth; });
    return Math.max(340, Math.min(700, w));
  }
  function applyPanelMinW() {
    const m = minPanelW();
    panel.style.minWidth = m + 'px';
    if (panel.offsetWidth < m) panel.style.width = m + 'px';
  }
  const savedW = parseInt(localStorage.getItem(LS_PANEL_W), 10);
  if (savedW >= 340 && savedW <= 700) panel.style.width = savedW + 'px';
  const resizeHandle = panel.querySelector('.sfhl-resize');
  resizeHandle.addEventListener('mousedown', e => {
    e.preventDefault(); panel.classList.add('resizing');
    const minW = minPanelW();
    const onMove = ev => { panel.style.width = Math.max(minW, Math.min(700, window.innerWidth - ev.clientX)) + 'px'; };
    const onUp = () => { panel.classList.remove('resizing'); localStorage.setItem(LS_PANEL_W, String(parseInt(panel.style.width,10))); document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Settings tab actions
  $('.sfhl-act-export').onclick       = () => doExport('all');
  $('.sfhl-act-export-rules').onclick  = () => doExport('rules');
  $('.sfhl-act-export-snips').onclick  = () => doExport('snips');
  $('.sfhl-act-import').onclick = () => { fileInput.value = ''; fileInput.click(); };
  // v4.6.6: Doku-Export jetzt in den Einstellungen (Backup-Sektion); Import läuft
  // über den zentralen "Datei importieren" — der versteht das {dokuLinks:[...]}-Format.
  $('.sfhl-act-export-doku').onclick = () => {
    try {
      const dt=new Date(), pad=n=>String(n).padStart(2,'0'), ds=`${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
      const blob = new Blob([JSON.stringify({ dokuLinks: loadDokuLinks(), dokuCatOrder: loadDokuCatOrder() }, null, 2)], { type:'application/json' });
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`sfhl_doku_links_${ds}.txt`;
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
      toast('Doku-Links exportiert','success');
    } catch { toast('Export fehlgeschlagen','error'); }
  };
  // ===== Doku Tab =====
  const DOKU_TYPES = ['root','serial','auftrag','order','free'];
  const DOKU_TYPE_LABELS = { root:'Produkt-Root', order:'Ordercode', serial:'Seriennummer', auftrag:'Auftrag', free:'Suche' };
  const dokuTab = $('.sfhl-tab-content[data-tab="doku"]');
  const dokuForm = dokuTab.querySelector('.sfhl-doku-form');
  const dokuLinkList = dokuTab.querySelector('.sfhl-doku-link-list');
  const dokuEnabledCb = dokuTab.querySelector('.sfhl-doku-enabled');
  const dokuFKey = dokuTab.querySelector('.sfhl-doku-f-key');
  const dokuFType = dokuTab.querySelector('.sfhl-doku-f-type');
  const dokuFLabel = dokuTab.querySelector('.sfhl-doku-f-label');
  const dokuFUrl = dokuTab.querySelector('.sfhl-doku-f-url');
  const dokuFCat = dokuTab.querySelector('.sfhl-doku-f-cat');
  let _dokuEditId = null;

  function _makeDokuEntry(lnk) {
    const el = document.createElement('div');
    el.className = 'sfhl-doku-entry' + (lnk.enabled ? '' : ' disabled'); el.dataset.dokuId = lnk.id;
    const eyeSvg = lnk.enabled ? '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" stroke="none"><ellipse cx="12" cy="12" rx="3.5" ry="3.5"/><path d="M1 12C3 7 7 4 12 4s9 3 11 8c-2 5-6 8-11 8S3 17 1 12z" fill="none" stroke="currentColor" stroke-width="2"/></svg>' : '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="2" x2="22" y2="22"/><path d="M6.7 6.7A10 10 0 0 0 1 12c2 5 6 8 11 8 2.3 0 4.4-.7 6.1-1.9M9.9 4.2A10 10 0 0 1 12 4c5 0 9 3 11 8a10 10 0 0 1-2.1 3.3"/></svg>';
    el.innerHTML = `<div class="sfhl-doku-entry-top"><span class="sfhl-doku-entry-key">${escH(lnk.key)}</span><span class="sfhl-doku-entry-type">${escH(DOKU_TYPE_LABELS[lnk.type]||lnk.type)}</span><span class="sfhl-doku-entry-label">${escH(lnk.label)}</span><div class="sfhl-doku-entry-acts"><span class="sfhl-ra ${lnk.enabled?'toggle-on':'toggle-off'} sfhl-doku-toggle" title="${lnk.enabled?'Deaktivieren':'Aktivieren'}">${eyeSvg}${lnk.enabled?'An':'Aus'}</span><span class="sfhl-doku-entry-edit" title="Bearbeiten"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span><span class="sfhl-doku-entry-del" title="Löschen"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></span></div></div><div class="sfhl-doku-entry-url">${escH(lnk.url)}</div>`;
    el.querySelector('.sfhl-doku-toggle').onclick = () => { const arr = loadDokuLinks(); const x = arr.find(x => x.id === lnk.id); if(x){ x.enabled = !x.enabled; saveDokuLinks(arr); renderDokuLinks(); } };
    el.querySelector('.sfhl-doku-entry-edit').onclick = () => openDokuForm(lnk);
    el.querySelector('.sfhl-doku-entry-del').onclick = () => { saveDokuLinks(loadDokuLinks().filter(x => x.id !== lnk.id)); renderDokuLinks(); };
    return el;
  }
  function _updateDokuCatDatalist() {
    const dl = document.getElementById('sfhl-doku-cat-list'); if (!dl) return;
    const cats = [...new Set(loadDokuLinks().map(e => e.category).filter(Boolean))].sort((a,b) => a.localeCompare(b,'de'));
    dl.innerHTML = cats.map(c => `<option value="${escH(c)}">`).join('');
  }

  function renderDokuLinks() {
    const _dokuST = (typeof dokuSearchTerm !== 'undefined') ? dokuSearchTerm : '';
    const links = loadDokuLinks().filter(l => !_dokuST || l.key.toLowerCase().includes(_dokuST) || l.label.toLowerCase().includes(_dokuST) || l.url.toLowerCase().includes(_dokuST));
    const badge = $('.sfhl-doku-count-badge');
    if (badge) badge.textContent = String(loadDokuLinks().length);
    dokuLinkList.innerHTML = '';
    _updateDokuCatDatalist();
    if (!links.length) {
      const dokuCatOrder = loadDokuCatOrder();
      if (dokuCatOrder.length === 0) {
        dokuLinkList.innerHTML = '<div class="sfhl-doku-empty">Keine Einträge. Klicke "+ Eintrag" um einen hinzuzufügen.</div>';
        return;
      }
    }
    const frag = document.createDocumentFragment();
    // Gruppieren nach Ordner
    const dokuCatOrder = loadDokuCatOrder();
    const catMap = new Map();
    for (const lnk of links) {
      const cat = lnk.category || '';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat).push(lnk);
    }
    // Leere Ordner aus catOrder anzeigen
    for (const name of dokuCatOrder) { if (name && !catMap.has(name)) catMap.set(name, []); }
    const hasCats = catMap.size > 1 || (catMap.size === 1 && !catMap.has(''));
    if (!hasCats) {
      // Keine Ordner — flache Liste
      for (const lnk of links) frag.appendChild(_makeDokuEntry(lnk));
    } else {
      const orderedCats = [...catMap.keys()].sort((a, b) => {
        if (!a) return 1; if (!b) return -1;
        const ia = dokuCatOrder.indexOf(a), ib = dokuCatOrder.indexOf(b);
        return ((ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib)) || a.localeCompare(b, 'de');
      });
      for (const cat of orderedCats) {
        const catLinks = catMap.get(cat);
        const isEmpty = catLinks.length === 0;
        const ch = document.createElement('div');
        ch.className = 'sfhl-cat-hdr'; ch.dataset.dokuCat = cat || '';
        const mvBtns = cat ? `<span class="sfhl-mv sfhl-doku-cat-up" role="button" title="Ordner nach oben">▲</span><span class="sfhl-mv sfhl-doku-cat-down" role="button" title="Ordner nach unten">▼</span>` : '';
        const delBtn = (cat && isEmpty) ? '<span class="sfhl-cat-del sfhl-doku-cat-del" role="button" title="Leeren Ordner löschen">✕</span>' : '';
        ch.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg><span>${escH(cat || '(Kein Ordner)')}</span>${mvBtns}${delBtn}<span class="sfhl-cat-count">${catLinks.length}</span>`;
        frag.appendChild(ch);
        const cb = document.createElement('div'); cb.className = 'sfhl-cat-body';
        for (const lnk of catLinks) cb.appendChild(_makeDokuEntry(lnk));
        frag.appendChild(cb);
      }
    }
    dokuLinkList.appendChild(frag);
  }

  function openDokuForm(lnk) {
    _dokuEditId = lnk ? lnk.id : null;
    dokuFKey.value = lnk ? lnk.key : '';
    dokuFType.value = lnk ? lnk.type : 'root';
    dokuFLabel.value = lnk ? lnk.label : '';
    dokuFUrl.value = lnk ? lnk.url : '';
    dokuFCat.value = lnk ? (lnk.category || '') : '';
    dokuForm.style.display = 'flex';
    dokuTab.querySelector('.sfhl-add-bar').style.display = 'none';
    dokuFKey.focus();
  }

  function closeDokuForm() {
    _dokuEditId = null;
    dokuForm.style.display = 'none';
    dokuTab.querySelector('.sfhl-add-bar').style.display = 'flex';
    dokuFKey.value = ''; dokuFType.value = 'root'; dokuFLabel.value = ''; dokuFUrl.value = ''; dokuFCat.value = '';
  }

  dokuEnabledCb.checked = loadDokuOn();
  dokuEnabledCb.onchange = () => {
    if (!dokuEnabledCb.checked) {
      dokuEnabledCb.checked = true;
      showConfirm('Der Doku-Lookup wird beim Markieren von Text nicht mehr angezeigt.<br>Deine Einträge bleiben gespeichert.', () => {
        saveDokuOn(false); dokuEnabledCb.checked = false;
        dokuTab.querySelector('.sfhl-doku-tab-bar').classList.add('off');
        toast('Doku-Lookup aus', 'info');
      });
    } else { saveDokuOn(true); dokuTab.querySelector('.sfhl-doku-tab-bar').classList.remove('off'); toast('Doku-Lookup an', 'info'); }
  };
  dokuTab.querySelector('.sfhl-doku-tab-bar').classList.toggle('off', !loadDokuOn());
  // Doku-Suche
  const dokuSearch = dokuTab.querySelector('.sfhl-doku-search-input');
  let dokuSearchTerm = '';
  dokuSearch.addEventListener('input', () => { dokuSearchTerm = dokuSearch.value.toLowerCase().trim(); renderDokuLinks(); dokuSearch.nextElementSibling?.classList.toggle('vis', dokuSearch.value.length > 0); });
  dokuSearch.nextElementSibling?.addEventListener('click', () => { dokuSearch.value = ''; dokuSearch.dispatchEvent(new Event('input')); dokuSearch.focus(); });
  dokuTab.querySelector('.sfhl-doku-new-btn').onclick = () => openDokuForm(null);
  dokuTab.querySelector('.sfhl-doku-f-cancel').onclick = closeDokuForm;
  dokuTab.querySelector('.sfhl-doku-f-save').onclick = () => {
    const key = dokuFKey.value.trim().slice(0, 24);
    const label = dokuFLabel.value.trim().slice(0, 100);
    const type = DOKU_TYPES.includes(dokuFType.value) ? dokuFType.value : 'root';
    const url = dokuFUrl.value.trim().slice(0, 500);
    const category = dokuFCat.value.trim().slice(0, 60);
    if (!key) { toast('Code-Präfix fehlt', 'error'); return; }
    if (!label) { toast('Bezeichnung fehlt', 'error'); return; }
    if (!isSafeDokuUrl(url)) { toast('URL ungültig (muss https:// und %s enthalten)', 'error'); return; }
    const arr = loadDokuLinks();
    const wasEdit = !!_dokuEditId;
    if (_dokuEditId) {
      const idx = arr.findIndex(x => x.id === _dokuEditId);
      if (idx >= 0) arr[idx] = { id: _dokuEditId, key, label, type, url, category };
      else arr.push({ id: uid(), key, label, type, url, category });
    } else {
      arr.push({ id: uid(), key, label, type, url, category });
    }
    // Neuer Ordner? In die Reihenfolge-Liste aufnehmen
    if (category) { const o = loadDokuCatOrder(); if (!o.includes(category)) { o.push(category); saveDokuCatOrder(o); } }
    saveDokuLinks(arr); closeDokuForm(); renderDokuLinks();
    toast(wasEdit ? 'Eintrag aktualisiert' : 'Eintrag hinzugefügt', 'success');
  };
  // v4.6.6: Doku-Ordner erstellen (wie bei Markierung)
  dokuTab.querySelector('.sfhl-doku-folder-add-btn').onclick = () => {
    const name = (prompt('Name des neuen Ordners:') || '').trim().slice(0, 60);
    if (!name) return;
    const o = loadDokuCatOrder();
    if (o.includes(name)) { toast('Ordner existiert bereits', 'error'); return; }
    o.push(name); saveDokuCatOrder(o); renderDokuLinks();
    toast('Ordner erstellt — beim Eintrag im Feld "Ordner" auswählen', 'success', 4000);
  };
  // v4.6.6: Doku-Ordner sortieren / leeren Ordner löschen
  dokuLinkList.addEventListener('click', e => {
    const hdr = e.target.closest('.sfhl-cat-hdr'); if (!hdr) return;
    const cat = hdr.dataset.dokuCat || '';
    const del = e.target.closest('.sfhl-doku-cat-del');
    if (del && cat) {
      saveDokuCatOrder(loadDokuCatOrder().filter(c => c !== cat));
      renderDokuLinks(); toast('Ordner gelöscht', 'info');
      return;
    }
    const mv = e.target.closest('.sfhl-doku-cat-up,.sfhl-doku-cat-down');
    if (mv && cat) {
      const vis = [...dokuLinkList.querySelectorAll('.sfhl-cat-hdr')].map(h => h.dataset.dokuCat).filter(Boolean);
      const i = vis.indexOf(cat);
      const j = mv.classList.contains('sfhl-doku-cat-up') ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < vis.length) { [vis[i], vis[j]] = [vis[j], vis[i]]; saveDokuCatOrder(vis); renderDokuLinks(); }
    }
  });
  renderDokuLinks();

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
  searchInput.addEventListener('input', () => { ruleSearch = searchInput.value.toLowerCase().trim(); renderRules(); searchInput.nextElementSibling?.classList.toggle('vis', searchInput.value.length > 0); });
  searchInput.nextElementSibling?.addEventListener('click', () => { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); searchInput.focus(); });
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
  // Refresh tab
  function applyRfInterval(val) { const v=parseInt(val,10); const s=saveRefreshSecs(Number.isFinite(v)?v:60); rfInput.value=String(s); restartRefresh(); updatePill(); updateRfPresets(); }
  rfInput.addEventListener('blur', () => applyRfInterval(rfInput.value));
  rfInput.addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); applyRfInterval(rfInput.value); rfInput.blur(); } });
  function updateRfPresets() { const cur=loadRefreshSecs(); panel.querySelectorAll('.sfhl-rf-preset').forEach(p=>p.classList.toggle('active', Number(p.dataset.secs)===cur)); }
  panel.querySelectorAll('.sfhl-rf-preset').forEach(p => p.addEventListener('click', () => applyRfInterval(p.dataset.secs)));
  updateRfPresets();
  rfCb.onchange = () => { saveRefreshOn(rfCb.checked); if(rfCb.checked) restartRefresh(); else stopRefresh(); updatePill(); toast(rfCb.checked?'Auto-Refresh an':'Auto-Refresh aus','info'); };

  // Markierung-Toggle
  const rulesFeatBar = panel.querySelector('.sfhl-rules-feat-bar');
  const rulesEnabledCb = rulesFeatBar.querySelector('.sfhl-rules-enabled');
  rulesEnabledCb.checked = loadRulesOn();
  rulesFeatBar.classList.toggle('off', !loadRulesOn());
  rulesEnabledCb.onchange = () => {
    if (!rulesEnabledCb.checked) {
      rulesEnabledCb.checked = true;
      showConfirm('Die Zeilen-Markierung wird ausgeblendet.<br>Deine Regeln bleiben gespeichert.', () => {
        saveRulesOn(false); rulesEnabledCb.checked = false; rulesFeatBar.classList.add('off');
        highlightRows(true); toast('Markierung aus', 'info');
      });
    } else { saveRulesOn(true); rulesFeatBar.classList.remove('off'); highlightRows(true); toast('Markierung an', 'info'); }
  };

  // Snippets-Toggle
  const snipFeatBar = panel.querySelector('.sfhl-snip-feat-bar');
  const snipEnabledCb = snipFeatBar.querySelector('.sfhl-snip-enabled');
  snipEnabledCb.checked = loadSnipOn();
  snipFeatBar.classList.toggle('off', !loadSnipOn());
  snipEnabledCb.onchange = () => {
    if (!snipEnabledCb.checked) {
      snipEnabledCb.checked = true;
      showConfirm('Das Snippet-Dropdown wird nicht mehr ausgelöst.<br>Deine Snippets bleiben gespeichert.', () => {
        saveSnipOn(false); snipEnabledCb.checked = false; snipFeatBar.classList.add('off');
        toast('Snippets aus', 'info');
      });
    } else { saveSnipOn(true); snipFeatBar.classList.remove('off'); toast('Snippets an', 'info'); }
  };

  function doExport(mode='all') {
    try {
      const dt=new Date(), pad=n=>String(n).padStart(2,'0'), ds=`${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
      let d, name;
      if (mode==='rules')      { d = { rules: RULES, folders: FOLDERS }; name = `sfhl_markierungen_${ds}.txt`; }
      else if (mode==='snips') { d = { snippets: SNIPPETS, catOrder: loadCatOrder(), prefix: loadPrefix(), username: loadUname() }; name = `sfhl_snippets_${ds}.txt`; }
      else {
        // v4.6.5: "Alles exportieren" ist jetzt ein echter Voll-Export — auch Doku-Links,
        // Ordner-Reihenfolgen und Einstellungen (vorher nur Regeln + Snippets).
        d = {
          rules: RULES, snippets: SNIPPETS, folders: FOLDERS,
          prefix: loadPrefix(), username: loadUname(),
          dokuLinks: loadDokuLinks(), catOrder: loadCatOrder(), dokuCatOrder: loadDokuCatOrder(),
          settings: {
            defaultLang: loadDefaultLang(), wrapOn: loadWrapOn(), wrapAnrede: loadWrapAnrede(), wrapSignatur: loadWrapSignatur(),
            refreshSecs: loadRefreshSecs(), refreshOn: loadRefreshOn(),
            slaBlink: loadSla('blink'), slaSound: loadSla('sound'), slaNotify: loadSla('notify'),
            legend: loadLegendOn(), selRule: loadSelRuleOn(), btnPos: loadBtnPos(), dokuOn: loadDokuOn(), homeAddr: loadHomeAddr()
          }
        };
        name = `sfhl_export_${ds}.txt`;
      }
      const blob = new Blob([JSON.stringify(d,null,2)],{type:'application/json'}); const a=document.createElement('a');
      a.href=URL.createObjectURL(blob); a.download=name;
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
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

  // FIX v4.6.4: Import ersetzt alle Daten \u2014 vorher Snapshot ziehen, damit ein
  // versehentlicher Import (falsche Datei) per Toast-Button r\u00fcckg\u00e4ngig gemacht werden kann.
  let _bak = null;
  function _undoImport() {
    if (!_bak) return;
    RULES = _bak.rules; FOLDERS = _bak.folders; SNIPPETS = _bak.snippets;
    saveRules(); saveFolders(); saveSnippets(true);
    saveDokuLinks(_bak.dokuLinks); saveCatOrder(_bak.catOrder); saveDokuCatOrder(_bak.dokuCatOrder);
    renderRules(); renderSnippets(); renderDokuLinks(); rescanSoon(true); updateBadges();
    _bak = null;
    toast('Import r\u00fcckg\u00e4ngig gemacht', 'success');
  }
  // v4.7.0: Import-Vorschau \u2014 zeigt den Datei-Inhalt und bietet Ersetzen ODER Hinzuf\u00fcgen
  // (Merge) an, statt kommentarlos alles zu \u00fcberschreiben.
  function _importSnapshot() {
    _bak = { rules: RULES.slice(), folders: FOLDERS.slice(), snippets: SNIPPETS.slice(), dokuLinks: loadDokuLinks(), catOrder: loadCatOrder(), dokuCatOrder: loadDokuCatOrder() };
  }
  function showImportDialog(summaryHtml, onReplace, onMerge) {
    document.querySelector('.sfhl-modal-ov')?.remove();
    const ov = document.createElement('div'); ov.className = 'sfhl-modal-ov';
    ov.innerHTML = `<div class="sfhl-modal"><h3>Datei importieren</h3><div class="sfhl-modal-body">${summaryHtml}</div><div class="sfhl-modal-acts"><div class="sfhl-btn-sm sfhl-m-cancel" role="button">Abbrechen</div><div class="sfhl-btn-sm sfhl-m-merge" role="button">Hinzuf\u00fcgen</div><div class="sfhl-btn-sm sfhl-btn-primary sfhl-m-replace" role="button">Ersetzen</div></div></div>`;
    const close = () => ov.remove();
    ov.onclick = e => { if (e.target === ov) close(); };
    ov.querySelector('.sfhl-m-cancel').onclick = close;
    ov.querySelector('.sfhl-m-replace').onclick = () => { close(); onReplace(); };
    ov.querySelector('.sfhl-m-merge').onclick = () => { close(); onMerge(); };
    document.documentElement.appendChild(ov);
  }
  fileInput.onchange = async ev => {
    const file = ev.target.files?.[0]; if (!file) return;
    let raw;
    try { raw = JSON.parse(await file.text()); } catch { toast('Ung\u00fcltiges Format','error',3500); return; }
    const isArr = Array.isArray(raw);
    const nRules = isArr ? raw.length : (Array.isArray(raw.rules) ? raw.rules.length : 0);
    const nFold  = !isArr && Array.isArray(raw.folders) ? raw.folders.length : 0;
    const nSnips = !isArr && Array.isArray(raw.snippets) ? raw.snippets.length : 0;
    const nDoku  = !isArr && Array.isArray(raw.dokuLinks) ? raw.dokuLinks.length : 0;
    const hasSet = !isArr && raw.settings && typeof raw.settings === 'object';
    if (!nRules && !nSnips && !nDoku && !hasSet) { toast('Kein bekanntes Export-Format','error',3500); return; }
    const parts = [];
    if (nRules) parts.push(`${nRules} Regel${nRules===1?'':'n'}${nFold ? ` (${nFold} Ordner)` : ''}`);
    if (nSnips) parts.push(`${nSnips} Snippet${nSnips===1?'':'s'}`);
    if (nDoku)  parts.push(`${nDoku} Doku-Link${nDoku===1?'':'s'}`);
    if (hasSet) parts.push('Einstellungen');
    const summary = `Die Datei enth\u00e4lt:<br><b>${parts.join(' \u00b7 ')}</b><br><br><b>Ersetzen</b> \u00fcberschreibt die vorhandenen Daten der enthaltenen Bereiche.<br><b>Hinzuf\u00fcgen</b> erg\u00e4nzt nur Neues (Duplikate werden \u00fcbersprungen), eigene Einstellungen bleiben unver\u00e4ndert.`;
    showImportDialog(summary, () => applyImportReplace(raw), () => applyImportMerge(raw));
  };
  function showConfirm(msg, onOk) {
    const ov = document.createElement('div'); ov.className = 'sfhl-modal-ov';
    ov.innerHTML = `<div class="sfhl-modal"><h3>Bitte bestätigen</h3><div class="sfhl-modal-body">${msg}</div><div class="sfhl-modal-acts"><div class="sfhl-btn-sm sfhl-m-cancel" role="button">Abbrechen</div><div class="sfhl-btn-sm sfhl-btn-primary sfhl-m-ok" role="button">Deaktivieren</div></div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector('.sfhl-m-cancel').onclick = close;
    ov.querySelector('.sfhl-m-ok').onclick = () => { close(); onOk(); };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
  }
  function applyImportReplace(raw) {
    try {
      _importSnapshot();
      if (Array.isArray(raw)) { RULES = raw.map(e=>({id:e.id||uid(),term:String(e.term||''),color:safeColor(e.color),enabled:e.enabled!==false,alarm:e.alarm===true})); saveRules(); renderRules(); rescanSoon(true); toast(`${RULES.length} Regeln importiert`,'success',8000,{label:'R\u00fcckg\u00e4ngig',fn:_undoImport}); return; }
      if (raw.rules) { RULES = raw.rules.map(e=>({id:e.id||uid(),term:String(e.term||''),color:safeColor(e.color),enabled:e.enabled!==false,folder:e.folder||null,alarm:e.alarm===true})); saveRules(); renderRules(); rescanSoon(true); }
      if (raw.folders) { FOLDERS = raw.folders.map(f=>({id:f.id||uid(),name:String(f.name||'')})); saveFolders(); }
      if (raw.snippets) {
        const valid = raw.snippets.map(e => { const s = sanitizeSnippetImport(e); return s ? { id: uid(), ...s, favorite: !!e.favorite } : null; }).filter(Boolean);
        SNIPPETS = valid; saveSnippets(); renderSnippets();
      }
      if (raw.prefix && PREFIXES.includes(raw.prefix)) { savePrefix(raw.prefix); setPrefix.value = raw.prefix; }
      if (raw.username) { saveUname(raw.username); setUname.value = raw.username; }
      // v4.6.5: Voll-Export einlesen \u2014 Doku-Links, Kategorie-Reihenfolge, Einstellungen
      if (Array.isArray(raw.dokuLinks)) {
        const TYPES = ['root','serial','auftrag','order','free'];
        const clean = raw.dokuLinks.map(e => ({ id:uid(), key:String(e.key||'').slice(0,24), label:String(e.label||'').slice(0,100), type:TYPES.includes(e.type)?e.type:'root', url:String(e.url||'').slice(0,500), category:String(e.category||'').slice(0,60) })).filter(e => isSafeDokuUrl(e.url));
        saveDokuLinks(clean); renderDokuLinks();
      }
      if (Array.isArray(raw.catOrder)) saveCatOrder(raw.catOrder.map(String));
      if (Array.isArray(raw.dokuCatOrder)) { saveDokuCatOrder(raw.dokuCatOrder.map(String)); renderDokuLinks(); }
      if (raw.settings && typeof raw.settings === 'object') {
        const s = raw.settings;
        if (s.defaultLang === 'de' || s.defaultLang === 'en') { saveDefaultLang(s.defaultLang); setLang.value = s.defaultLang; }
        if (typeof s.wrapOn === 'boolean') { saveWrapOn(s.wrapOn); wrapCb.checked = s.wrapOn; }
        if (typeof s.wrapAnrede === 'string') saveWrapAnrede(s.wrapAnrede);
        if (typeof s.wrapSignatur === 'string') saveWrapSignatur(s.wrapSignatur);
        if (Number.isFinite(s.refreshSecs)) rfInput.value = String(saveRefreshSecs(s.refreshSecs));
        if (typeof s.refreshOn === 'boolean') { saveRefreshOn(s.refreshOn); rfCb.checked = s.refreshOn; }
        if (typeof s.slaBlink === 'boolean') { saveSla('blink', s.slaBlink); slaBlinkCb.checked = s.slaBlink; }
        if (typeof s.slaSound === 'boolean') { saveSla('sound', s.slaSound); slaSoundCb.checked = s.slaSound; }
        if (typeof s.slaNotify === 'boolean') { saveSla('notify', s.slaNotify); slaNotifyCb.checked = s.slaNotify; }
        if (typeof s.legend === 'boolean') { saveLegendOn(s.legend); legendCb.checked = s.legend; }
        if (typeof s.selRule === 'boolean') { saveSelRuleOn(s.selRule); selRuleCb.checked = s.selRule; }
        if (s.btnPos === 'header' || s.btnPos === 'floating') { saveBtnPos(s.btnPos); btnPosSel.value = s.btnPos; updateVis(); }
        if (typeof s.dokuOn === 'boolean') { saveDokuOn(s.dokuOn); dokuEnabledCb.checked = s.dokuOn; }
        if (typeof s.homeAddr === 'string') { saveHomeAddr(s.homeAddr); setHomeAddr.value = loadHomeAddr(); }
        updateWrapDropdowns(); updatePill(); restartRefresh();
      }
      updateBadges(); toast('Import erfolgreich','success',8000,{label:'R\u00fcckg\u00e4ngig',fn:_undoImport});
    } catch { toast('Import fehlgeschlagen','error',3500); }
  }
  // v4.7.0: Merge-Import \u2014 erg\u00e4nzt nur Neues. Duplikat-Kriterien: Regeln \u00fcber das
  // Stichwort, Snippets \u00fcber den Trigger, Doku-Links \u00fcber Pr\u00e4fix+URL. Regel-Ordner
  // werden \u00fcber den Namen zusammengef\u00fchrt (IDs der Datei werden remappt).
  // Einstellungen/Prefix/Name werden beim Merge bewusst NICHT \u00fcbernommen.
  function applyImportMerge(raw) {
    try {
      _importSnapshot();
      const added = { rules: 0, snippets: 0, doku: 0 };
      const impRules = Array.isArray(raw) ? raw : (Array.isArray(raw.rules) ? raw.rules : []);
      if (impRules.length) {
        const impFolders = (!Array.isArray(raw) && Array.isArray(raw.folders)) ? raw.folders : [];
        const idToName = new Map(impFolders.map(f => [f.id, String(f.name || '')]));
        const nameToLocal = new Map(FOLDERS.map(f => [f.name, f.id]));
        const have = new Set(RULES.map(r => norm(r.term).trim()));
        for (const e of impRules) {
          const term = String(e.term || '');
          if (!term || have.has(norm(term).trim())) continue;
          let folder = null;
          const fname = idToName.get(e.folder);
          if (fname) {
            if (!nameToLocal.has(fname)) { const nf = { id: uid(), name: fname }; FOLDERS.push(nf); nameToLocal.set(fname, nf.id); }
            folder = nameToLocal.get(fname);
          }
          RULES.push({ id: uid(), term, color: safeColor(e.color), enabled: e.enabled !== false, folder, alarm: e.alarm === true });
          have.add(norm(term).trim()); added.rules++;
        }
        if (added.rules) { saveRules(); saveFolders(); renderRules(); rescanSoon(true); }
      }
      if (!Array.isArray(raw) && Array.isArray(raw.snippets)) {
        const have = new Set(SNIPPETS.map(s => s.trigger.toLowerCase()));
        for (const e of raw.snippets) {
          const s = sanitizeSnippetImport(e);
          if (!s || have.has(s.trigger.toLowerCase())) continue;
          SNIPPETS.push({ id: uid(), ...s, favorite: !!e.favorite });
          have.add(s.trigger.toLowerCase()); added.snippets++;
        }
        if (Array.isArray(raw.catOrder)) { const o = loadCatOrder(); for (const c of raw.catOrder.map(String)) if (c && !o.includes(c)) o.push(c); saveCatOrder(o); }
        if (added.snippets) { saveSnippets(); renderSnippets(); }
      }
      if (!Array.isArray(raw) && Array.isArray(raw.dokuLinks)) {
        const TYPES = ['root','serial','auftrag','order','free'];
        const arr = loadDokuLinks();
        const have = new Set(arr.map(d => d.key.toLowerCase() + '|' + d.url));
        for (const e of raw.dokuLinks) {
          const d = { id: uid(), key: String(e.key||'').slice(0,24), label: String(e.label||'').slice(0,100), type: TYPES.includes(e.type)?e.type:'root', url: String(e.url||'').slice(0,500), category: String(e.category||'').slice(0,60) };
          const dupKey = d.key.toLowerCase() + '|' + d.url;
          if (!isSafeDokuUrl(d.url) || have.has(dupKey)) continue;
          arr.push(d); have.add(dupKey); added.doku++;
        }
        if (Array.isArray(raw.dokuCatOrder)) { const o = loadDokuCatOrder(); for (const c of raw.dokuCatOrder.map(String)) if (c && !o.includes(c)) o.push(c); saveDokuCatOrder(o); }
        if (added.doku) { saveDokuLinks(arr); }
        renderDokuLinks();
      }
      updateBadges();
      const msg = [];
      if (added.rules) msg.push(`${added.rules} Regel${added.rules===1?'':'n'}`);
      if (added.snippets) msg.push(`${added.snippets} Snippet${added.snippets===1?'':'s'}`);
      if (added.doku) msg.push(`${added.doku} Doku-Link${added.doku===1?'':'s'}`);
      if (msg.length) toast(msg.join(', ') + ' hinzugef\u00fcgt', 'success', 8000, {label:'R\u00fcckg\u00e4ngig', fn:_undoImport});
      else { _bak = null; toast('Nichts Neues \u2014 alle Eintr\u00e4ge sind schon vorhanden', 'info', 4000); }
    } catch { toast('Import fehlgeschlagen','error',3500); }
  }
  function doReset() {
    if (!confirm('Alles auf Standard zur\u00fccksetzen? (Regeln + Snippets)')) return;
    RULES = RULE_DEFAULTS.map(e=>({...e,id:uid(),folder:null})); saveRules(); renderRules(); rescanSoon(true);
    FOLDERS = []; saveFolders();
    SNIPPETS = SNIP_DEFAULTS.map(e=>({...e,id:uid(),favorite:!!e.favorite})); saveSnippets(); renderSnippets();
    updateBadges(); toast('Zur\u00fcckgesetzt','info');
  }

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
      const needCols = anyColRule();
      const texts = rows.map(row => { const cells = row.querySelectorAll('td'); let t2 = ''; for (const c of cells) t2 += ' ' + (c.innerText || c.textContent || ''); return { txt: t2, cols: needCols ? getRowCols(row) : null }; });
      const map = new Map();
      for (const r of RULES) {
        if (!r.enabled || !r.term) continue;
        let n = 0;
        for (const tx of texts) if (matchesRule(tx.txt, r.term, tx.cols)) n++;
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
    // v4.6.5: Prio als Eingabefeld \u2014 Zahl eintippen sortiert die Regel global um.
    // L\u00f6st das Priorisieren, wenn Regeln in Ordnern stecken (Drag \u00fcber Ordnergrenzen
    // hinweg \u00e4ndert sonst die Ordnerzugeh\u00f6rigkeit statt nur die Reihenfolge).
    const prioBadge = prio > 0
      ? `<input type="text" inputmode="numeric" class="sfhl-rule-prio-inp" value="${prio}" title="Priorit\u00e4t ${prio} von ${enabledWithTerm.length} \u2014 Zahl \u00e4ndern + Enter sortiert um (1 = wird zuerst gepr\u00fcft)">`
      : `<div class="sfhl-rule-prio" title="Inaktiv \u2014 Regel ist deaktiviert oder leer">\u2013</div>`;
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
      // FIX v4.6.4: Bei aktiver Suche Ordner immer aufklappen — sonst sind Treffer
      // in zugeklappten Ordnern unsichtbar und die Suche wirkt kaputt.
      const isCollapsed = !ruleSearch && collapsedFolders.has(folder.id);
      const fh = document.createElement('div');
      fh.className = 'sfhl-folder-hdr' + (isCollapsed ? ' collapsed' : '');
      fh.dataset.folderId = folder.id;
      fh.innerHTML = `<svg class="sfhl-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><span class="sfhl-folder-name">${escH(folder.name)}</span><span class="sfhl-folder-count">${fRules.length}</span><span class="sfhl-mv sfhl-folder-up" role="button" title="Ordner nach oben">\u25b2</span><span class="sfhl-mv sfhl-folder-down" role="button" title="Ordner nach unten">\u25bc</span><span class="sfhl-folder-del" role="button" title="Ordner l\u00f6schen"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>`;
      listEl.appendChild(fh);
      const fb = document.createElement('div');
      fb.className = 'sfhl-folder-body' + (isCollapsed ? ' collapsed' : '');
      fb.dataset.folderId = folder.id;
      for (const item of fRules) fb.appendChild(makeRuleRow(item, enabledWithTerm, hitMap));
      listEl.appendChild(fb);
    }
    updateBadges();
  }

  // v4.6.5: Regel per eingetippter Prio-Zahl global umsortieren. target = gewünschte
  // Position unter den aktiven Regeln (1-basiert); die Regel wird im RULES-Array direkt
  // vor die Regel geschoben, die aktuell an dieser Position steht. Ordnerzugehörigkeit
  // bleibt unverändert — nur die Prüf-Reihenfolge ändert sich.
  function setRulePriority(ruleId, target) {
    const rule = RULES.find(r => r.id === ruleId); if (!rule) return;
    const others = RULES.filter(r => r.enabled && r.term && r.id !== ruleId);
    const pos = Math.max(1, Math.min(Math.round(target) || 1, others.length + 1));
    RULES = RULES.filter(r => r.id !== ruleId);
    if (pos > others.length) {
      const last = others[others.length - 1];
      RULES.splice(last ? RULES.indexOf(last) + 1 : RULES.length, 0, rule);
    } else {
      RULES.splice(RULES.indexOf(others[pos - 1]), 0, rule);
    }
    saveRules(); renderRules(); rescanSoon(true);
    toast('Priorität: #' + pos, 'info', 1500);
  }
  // Rules event delegation
  listEl.addEventListener('change', e => {
    const item = RULES.find(x=>x.id===e.target.closest('.sfhl-row')?.dataset.ruleId); if(!item) return;
    if(e.target.matches('.sfhl-r-term')){item.term=e.target.value;e.target.title=e.target.value;saveRules();rescanSoon(true);if(invalidRegexIn(item.term).length)toast('Ungültige Regex — Regel wird als einfache Textsuche behandelt','error',4500);}
    if(e.target.matches('.sfhl-rule-prio-inp')){const n=parseInt(e.target.value,10);if(Number.isFinite(n))setRulePriority(item.id,n);else renderRules();}
  });
  // Enter im Prio-Feld bestätigt sofort (change feuert sonst erst beim Verlassen)
  listEl.addEventListener('keydown', e => {
    if (e.target.matches('.sfhl-rule-prio-inp') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });
  listEl.addEventListener('click', e => {
    // v4.6.5: Ordner per Pfeil nach oben/unten sortieren
    const mvF = e.target.closest('.sfhl-folder-up,.sfhl-folder-down');
    if (mvF) {
      const fid = mvF.closest('.sfhl-folder-hdr')?.dataset.folderId;
      const i = FOLDERS.findIndex(f => f.id === fid);
      const j = mvF.classList.contains('sfhl-folder-up') ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < FOLDERS.length) {
        [FOLDERS[i], FOLDERS[j]] = [FOLDERS[j], FOLDERS[i]];
        saveFolders(); renderRules();
      }
      return;
    }
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
    const name = prompt('Ordnername:');
    if (!name || !name.trim()) return;
    FOLDERS.push({ id: uid(), name: name.trim() });
    saveFolders(); renderRules(); toast('Ordner erstellt', 'success');
  };

  // ===== Snippets Tab =====
  let snipSearchTerm = '', editingSnipId = null;
  snipSearch.addEventListener('input', () => { snipSearchTerm = snipSearch.value.toLowerCase().trim(); renderSnippets(); snipSearch.nextElementSibling?.classList.toggle('vis', snipSearch.value.length > 0); });
  snipSearch.nextElementSibling?.addEventListener('click', () => { snipSearch.value = ''; snipSearch.dispatchEvent(new Event('input')); snipSearch.focus(); });


  function renderSnippets() {
    // DocumentFragment für bessere Performance (#24)
    const frag = document.createDocumentFragment();
    const prefix = loadPrefix();
    if (SNIPPETS.length === 0) {
      snipListEl.innerHTML = `<div class="sfhl-empty"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><p class="sfhl-empty-title">Noch keine Snippets</p><p class="sfhl-empty-sub">Erstelle einen Textbaustein und füge ihn überall per Prefix ein.</p></div>`;
      updateBadges(); updateCatDatalist(); updateWrapDropdowns(); return;
    }
    // Suche auch nach Kategorie (#12)
    // FIX #20: body-Suche auf ersten 500 Zeichen begrenzt — verhindert massives String-Normalisieren bei jedem Tastendruck
    let filtered = snipSearchTerm
      ? SNIPPETS.filter(s => norm(s.trigger).includes(snipSearchTerm) || norm(s.label).includes(snipSearchTerm) || norm(s.category).includes(snipSearchTerm) || norm(s.body.slice(0,500)).includes(snipSearchTerm))
      : SNIPPETS;

    // Ordner gruppieren
    const catMap = new Map();
    for (const snip of filtered) {
      const cat = snip.category || '(Kein Ordner)';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat).push(snip);
    }
    // Favoriten-Ordner immer zuerst
    const favSnips = filtered.filter(s => s.favorite);
    if (favSnips.length > 0) {
      const existing = catMap.get('★ Favoriten') || [];
      catMap.set('★ Favoriten', [...new Set([...favSnips, ...existing])]);
    }
    // Leere Ordner aus catOrder einblenden (explizit erstellt, noch ohne Snippets)
    const catOrder = loadCatOrder();
    if (!snipSearchTerm) {
      for (const name of catOrder) {
        if (name && name !== '★ Favoriten' && name !== '(Kein Ordner)' && !catMap.has(name)) catMap.set(name, []);
      }
    }
    const cats = [...catMap.keys()].sort((a, b) => {
      if (a === '★ Favoriten') return -1;
      if (b === '★ Favoriten') return 1;
      if (a === '(Kein Ordner)') return 1;
      if (b === '(Kein Ordner)') return -1;
      const ia = catOrder.indexOf(a), ib = catOrder.indexOf(b);
      return ((ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib)) || a.localeCompare(b, 'de');
    });

    for (const cat of cats) {
      const snips = catMap.get(cat);
      const isEmpty = snips.length === 0;
      const isCollapsed = collapsedSnipCats.has(cat);
      const ch = document.createElement('div');
      ch.className = 'sfhl-cat-hdr' + (isCollapsed ? ' collapsed' : '');
      ch.dataset.cat = cat;
      const canMove = cat !== '★ Favoriten' && cat !== '(Kein Ordner)';
      const mvBtns = canMove ? '<span class="sfhl-mv sfhl-cat-up" role="button" title="Ordner nach oben">▲</span><span class="sfhl-mv sfhl-cat-down" role="button" title="Ordner nach unten">▼</span>' : '';
      const delBtn = (canMove && isEmpty) ? '<span class="sfhl-cat-del" role="button" title="Leeren Ordner löschen">✕</span>' : '';
      ch.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg><span class="sfhl-cat-name" title="Doppelklick zum Umbenennen">${escH(cat)}</span>${mvBtns}${delBtn}<span class="sfhl-cat-count">${snips.length}</span>`;
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
    updateWrapDropdowns(); // FIX v4.6.4: Auto-Wrap-Auswahl sofort aktualisieren
  }

  // Snippet-Zeile bauen — ausgelagert für DocumentFragment + D&D
  function makeSnipRow(snip, prefix) {
    const row = document.createElement('div');
    row.className = 'sfhl-snip-row';
    row.dataset.snipId = snip.id;
    row.draggable = true; // D&D (#9)
    // HTML-bereinigte Vorschau (#13): Tags entfernen, echten Text zeigen
    const plainPrev = htmlToPlain(snip.body).replace(/\n/g,' ').slice(0,80);

    row.innerHTML = `<div class="sfhl-snip-row-top"><span class="sfhl-snip-grip" title="Ziehen zum Sortieren"><svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg></span><span class="sfhl-snip-trigger">${escH(prefix+snip.trigger)}</span><span class="sfhl-snip-label">${escH(snip.label)}</span><span class="sfhl-snip-copy" data-copy-id="${snip.id}" title="Kopieren"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span><span class="sfhl-fav${snip.favorite?' on':''}" data-fav-id="${snip.id}" title="Favorit">★</span></div><div class="sfhl-snip-preview">${escH(plainPrev)}${plainPrev.length>=80?'\u2026':''}</div>`;
    return row;
  }

  // Ordner-Datalist befüllen (für Editor-Dropdown) — auch leere, explizit erstellte Ordner
  function updateCatDatalist() {
    const dl = document.getElementById('sfhl-cat-list'); if (!dl) return;
    const cats = [...new Set([...SNIPPETS.map(s => s.category), ...loadCatOrder()].filter(Boolean))].sort((a,b) => a.localeCompare(b,'de'));
    dl.innerHTML = cats.map(cat => `<option value="${escH(cat)}">`).join('');
  }

  // Snippet-Einfügen-Dropdown im RTE-Toolbar befüllen
  function updateSnipInsertDropdown() {
    const sel = snipEditor.querySelector('.sfhl-rtb-snip-insert'); if (!sel) return;
    const prefix = loadPrefix();
    sel.innerHTML = '<option value="">+ Vorlage</option>' +
      SNIPPETS.map(s => `<option value="${escH(s.id)}">${escH(prefix+s.trigger)} — ${escH(s.label)}</option>`).join('');
  }

  // Click snippet row or folder header -> open editor
  snipListEl.addEventListener('click', e => {
    if (e.target.closest('.sfhl-snip-grip')) return; // Grip = nur D&D, kein Editor öffnen
    // v4.6.6: leeren Ordner löschen
    const delC = e.target.closest('.sfhl-cat-del');
    if (delC) {
      const cat = delC.closest('.sfhl-cat-hdr')?.dataset.cat;
      if (cat) { saveCatOrder(loadCatOrder().filter(c => c !== cat)); renderSnippets(); toast('Ordner gelöscht', 'info'); }
      return;
    }
    // v4.6.5: Ordner per Pfeil sortieren — Reihenfolge wird persistiert.
    // v4.6.6: volle Order-Liste mergen statt überschreiben (Suche darf keine Ordner verwerfen)
    const mvC = e.target.closest('.sfhl-cat-up,.sfhl-cat-down');
    if (mvC) {
      const cat = mvC.closest('.sfhl-cat-hdr')?.dataset.cat;
      const vis = [...snipListEl.querySelectorAll('.sfhl-cat-hdr')].map(h => h.dataset.cat).filter(c => c !== '★ Favoriten' && c !== '(Kein Ordner)');
      const full = vis.slice();
      for (const c of loadCatOrder()) if (!full.includes(c)) full.push(c);
      const i = full.indexOf(cat);
      const j = mvC.classList.contains('sfhl-cat-up') ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < full.length) {
        [full[i], full[j]] = [full[j], full[i]];
        saveCatOrder(full); renderSnippets();
      }
      return;
    }
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
      // FIX v4.6.4: Standard-Sprache respektieren — bei EN wird die EN-Variante kopiert (falls vorhanden)
      const bodyForCopy = (loadDefaultLang() === 'en' && snip.bodyEn) ? snip.bodyEn : snip.body;
      let resolved = resolvePlaceholders(bodyForCopy);
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

  // Ordner umbenennen per Doppelklick (#7)
  snipListEl.addEventListener('dblclick', e => {
    const nameEl = e.target.closest('.sfhl-cat-name');
    if (!nameEl) return;
    const ch = nameEl.closest('.sfhl-cat-hdr'); if (!ch) return;
    const oldCat = ch.dataset.cat;
    if (oldCat === '★ Favoriten' || oldCat === '(Kein Ordner)') return;
    const newCat = prompt('Ordner umbenennen:', oldCat);
    if (!newCat || !newCat.trim() || newCat.trim() === oldCat) return;
    SNIPPETS.forEach(s => { if (s.category === oldCat) s.category = newCat.trim(); });
    if (collapsedSnipCats.has(oldCat)) { collapsedSnipCats.delete(oldCat); collapsedSnipCats.add(newCat.trim()); }
    // v4.6.5: gespeicherte Ordner-Reihenfolge mit umbenennen
    const _ord = loadCatOrder(); const _oi = _ord.indexOf(oldCat);
    if (_oi !== -1) { _ord[_oi] = newCat.trim(); saveCatOrder(_ord); }
    saveSnippets(); renderSnippets(); toast('Ordner umbenannt', 'success');
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
  // v4.6.6: Snippet-Ordner erstellen (wie bei Markierung)
  $('.sfhl-snip-folder-add-btn').onclick = () => {
    const name = (prompt('Name des neuen Ordners:') || '').trim().slice(0, 60);
    if (!name) return;
    if (name === '★ Favoriten' || name === '(Kein Ordner)') { toast('Dieser Name ist reserviert', 'error'); return; }
    const o = loadCatOrder();
    if (o.includes(name) || SNIPPETS.some(s => s.category === name)) { toast('Ordner existiert bereits', 'error'); return; }
    o.push(name); saveCatOrder(o); renderSnippets();
    toast('Ordner erstellt — beim Snippet im Feld "Ordner" auswählen', 'success', 4000);
  };

  let _editorLang = 'de'; // aktuell aktive Sprache im Editor (#34)
  // FIX v4.6.4 (Bug 4): Editor-Inhalte DE/EN in lokalem Puffer statt direkt im SNIPPETS-
  // Objekt — vorher ging beim Speichern im EN-Tab der DE-Text eines neuen Snippets
  // verloren, und Abbrechen nach Sprachwechsel persistierte Änderungen ungewollt.
  let _editorBodies = { de: '', en: '' };

  function openSnipEditor(snip) {
    editingSnipId = snip ? snip.id : null;
    _editorLang = 'de';
    snipEditor.dataset.mode = snip ? 'edit' : 'add';
    $('.sfhl-ed-trigger').value = snip ? snip.trigger : '';
    $('.sfhl-ed-label').value = snip ? snip.label : '';
    $('.sfhl-ed-category').value = snip ? snip.category : '';
    const rb = $('.sfhl-rte-body');
    _editorBodies = {
      de: snip ? (snip.richText ? snip.body : escH(snip.body).replace(/\n/g,'<br>')) : '',
      en: snip ? (snip.bodyEn || '') : ''
    };
    rb.innerHTML = _editorBodies.de;
    // Sprach-Tabs zurücksetzen (#34)
    snipEditor.querySelectorAll('.sfhl-lang-tab').forEach(t => t.classList.toggle('active', t.dataset.lang === 'de'));
    $('.sfhl-ed-delete').style.display = snip ? 'block' : 'none';
    $('.sfhl-ed-duplicate').style.display = snip ? 'block' : 'none';
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
    // FIX v4.6.4 (Bug 4): über den lokalen Puffer wechseln — funktioniert auch für neue
    // Snippets (editingSnipId null) und fasst das SNIPPETS-Objekt nicht an.
    const rb = $('.sfhl-rte-body');
    _editorBodies[_editorLang] = rb.innerHTML;
    _editorLang = lang;
    snipEditor.querySelectorAll('.sfhl-lang-tab').forEach(t => t.classList.toggle('active', t.dataset.lang === lang));
    rb.innerHTML = _editorBodies[lang] || '';
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
    // FIX v4.6.4: Steuerzeichen als Trenner statt "|" — Feldwerte können Pipes enthalten
    // (z. B. Firmenname "A | B"), was die Zuordnung verschoben hätte.
    const SEP = '\u0001';
    const resolved = resolvePlaceholders(['{name}','{datum}','{case}','{nachname}','{kontakt}','{telefon}','{firma}','{seriennummer}'].join(SEP));
    const vals = resolved.split(SEP);
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
    // FIX v4.6.4: Leerzeichen im Trigger entfernen — Trigger mit Leerzeichen sind
    // über das Tippen nie erreichbar (Wortgrenze beendet die Trigger-Erkennung).
    const trigger = ($('.sfhl-ed-trigger').value||'').replace(/\s+/g,'').replace(/^[;/:!@]+/,''); // strip prefix chars + whitespace
    if (!trigger) { $('.sfhl-ed-trigger').focus(); return; }
    // QF1: Doppelte Trigger machen Auto-Wrap + Einfügen mehrdeutig (erstes gefundenes Snippet gewinnt)
    const dup = SNIPPETS.find(s => s.trigger.toLowerCase() === trigger.toLowerCase() && s.id !== editingSnipId);
    if (dup && !confirm(`Trigger "${loadPrefix()+trigger}" existiert bereits ("${dup.label}").\nTrotzdem speichern? Beim Einfügen gewinnt das zuerst gefundene Snippet.`)) {
      $('.sfhl-ed-trigger').focus(); return;
    }
    const rb = $('.sfhl-rte-body');
    const existingSnip = editingSnipId ? SNIPPETS.find(s => s.id === editingSnipId) : null;
    // FIX v4.6.4 (Bug 4): beide Sprachvarianten aus dem Editor-Puffer lesen —
    // der DE-Text bleibt auch erhalten, wenn gerade der EN-Tab aktiv ist (auch bei neuen Snippets).
    _editorBodies[_editorLang] = rb.innerHTML || '';
    const deBody = _editorBodies.de;
    const enBody = _editorBodies.en;
    const data = { trigger, label: $('.sfhl-ed-label').value.trim() || trigger, body: deBody, bodyEn: enBody, richText: true, category: $('.sfhl-ed-category').value.trim(), favorite: existingSnip ? !!existingSnip.favorite : false };
    // v4.6.6: neuen Ordner in die Reihenfolge-Liste aufnehmen
    if (data.category) { const _o = loadCatOrder(); if (!_o.includes(data.category)) { _o.push(data.category); saveCatOrder(_o); } }
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
      favorite: false };
    SNIPPETS.push(copy);
    saveSnippets(); renderSnippets();
    openSnipEditor(copy);
    toast('Kopie erstellt', 'success');
  };



  // Settings
  setPrefix.onchange = () => { savePrefix(setPrefix.value); renderSnippets(); updateWrapDropdowns(); };
  setUname.onchange = () => saveUname(setUname.value);
  setHomeAddr.onchange = () => { saveHomeAddr(setHomeAddr.value); toast(setHomeAddr.value.trim() ? 'Adresse gespeichert' : 'Adresse entfernt', 'info'); };
  setLang.onchange = () => {
    saveDefaultLang(setLang.value);
    toast('Snippet-Sprache: ' + (setLang.value==='en'?'English':'Deutsch'), 'info');
  };
  wrapCb.onchange = () => { saveWrapOn(wrapCb.checked); toast(wrapCb.checked ? 'Auto-Wrap an' : 'Auto-Wrap aus', 'info'); };
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
  btnPosSel.onchange = () => { saveBtnPos(btnPosSel.value); updateVis(); const lbl = btnPosSel.value === 'header' ? 'SF-Kopfleiste' : 'schwebend'; toast('Button: '+lbl, 'info'); };
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

    finishInsert(el, triggerInfo, snippet, fullBody);
  }


  function finishInsert(el, triggerInfo, snippet, fullBody) {
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
      console.warn('[SFHL] Platzhalter nicht aufgelöst:', fields);
    }
    closeDropdown(); // FIX #15: orphaned } from if(true) removed
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
        return a.trigger.localeCompare(b.trigger, 'de');
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
    if (!loadSnipOn()) { closeDropdown(); return; }
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
      // v4.6.3: Doku-Lookup/Regel-aus-Auswahl auch für Markierungen IM iframe (E-Mail-Editor)
      doc.addEventListener('mouseup', handleSelectionMouseup);
      doc.addEventListener('mousedown', handleSelectionMousedown, true);
      return true;
    } catch { return false; }
  }

  // FIX v4.6.4: pro iframe nur EIN Poller/Listener — deepScanIframes läuft periodisch
  // und hätte sonst für dasselbe (noch nicht bereite) iframe immer neue Intervalle gestartet.
  const _pendingIframes = new WeakSet();
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
        if (_pendingIframes.has(iframe)) return;
        _pendingIframes.add(iframe);
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
  function _condHits(lowTxt, cond) {
    const rxMatch = cond.match(/^\/(.+)\/([gimsuy]*)$/);
    if (rxMatch) {
      const key = rxMatch[1] + '/' + rxMatch[2];
      if (!_regexCache.has(key)) {
        if (_regexCache.size >= _REGEX_CACHE_MAX) _regexCache.delete(_regexCache.keys().next().value); // FIX #8: LRU eviction
        try { _regexCache.set(key, new RegExp(rxMatch[1], rxMatch[2])); }
        catch { _regexCache.set(key, null); }
      }
      const rx = _regexCache.get(key);
      return rx ? rx.test(lowTxt) : lowTxt.includes(norm(cond));
    }
    return lowTxt.includes(norm(cond));
  }
  function matchesSingleCondition(lowTxt, cond, cols) {
    cond = cond.trim();
    if (!cond) return true;
    const isNot = cond.startsWith('!');
    if (isNot) cond = cond.slice(1).trim();
    if (!cond) return true;
    let result;
    // v4.7.0: "Spalte=Wert" — sucht nur in der Zelle, deren Spaltenüberschrift den Namen
    // enthält. Ohne Header-Infos (cols=null) zählt die Bedingung als nicht erfüllt,
    // damit sie nicht überraschend als Volltextsuche nach "spalte=wert" fehlschlägt.
    const eq = cond.startsWith('/') ? -1 : cond.indexOf('=');
    if (eq > 0) {
      const colName = norm(cond.slice(0, eq).trim());
      const val = cond.slice(eq + 1).trim();
      const cell = (cols && colName && val) ? cols.find(c => c.name.includes(colName)) : null;
      result = cell ? _condHits(cell.text, val) : false;
    } else {
      result = _condHits(lowTxt, cond);
    }
    return isNot ? !result : result;
  }
  // FIX v4.6.4 (Bug 1): "|" innerhalb einer /regex/ darf nicht als ODER-Trenner gedeutet
  // werden (z. B. /urgent|eilig/i). Nach dem naiven Split werden Teile wieder zusammen-
  // gefügt, solange die letzte Bedingung der Vorgruppe eine begonnene, aber noch nicht
  // geschlossene Regex ist (beginnt mit "/", endet noch nicht auf "/flags").
  function splitOrGroups(term) {
    const raw = String(term || '').split(/\s*\|\s*|\s+OR\s+/i);
    const groups = [];
    for (const part of raw) {
      if (groups.length) {
        const prev = groups[groups.length - 1];
        const lastCond = prev.split(/\s\+\s/).pop().trim().replace(/^!/, '').trim();
        // v4.7.0: auch "Spalte=/regex..." erkennen — der Regex-Teil steht hinter dem "="
        const rxPart = lastCond.startsWith('/') ? lastCond
          : (lastCond.indexOf('=') > 0 ? lastCond.slice(lastCond.indexOf('=') + 1).trim() : '');
        if (rxPart.startsWith('/') && !/^\/(.+)\/[gimsuy]*$/.test(rxPart)) {
          groups[groups.length - 1] = prev + '|' + part;
          continue;
        }
      }
      groups.push(part);
    }
    return groups;
  }
  // QF2: Ungültige /regex/ fällt in matchesSingleCondition still auf Textsuche zurück —
  // diese Funktion findet solche Teile, damit die UI beim Speichern warnen kann.
  function invalidRegexIn(term) {
    const bad = [];
    for (const group of splitOrGroups(term)) {
      for (let part of group.split(/\s\+\s/)) {
        part = part.trim();
        if (part.startsWith('!')) part = part.slice(1).trim();
        const m = part.match(/^\/(.+)\/([gimsuy]*)$/);
        if (m) { try { new RegExp(m[1], m[2]); } catch { bad.push(part); } }
      }
    }
    return bad;
  }
  function matchesRule(txt, term, cols) {
    if (!term) return false;
    const low = norm(txt);
    // OR hat niedrigere Priorität als AND: "A + B | C + D" = "(A AND B) OR (C AND D)"
    // Trennt bei " | " oder " OR " (case-insensitive); Pipes in /regex/ bleiben erhalten.
    const orGroups = splitOrGroups(term);
    return orGroups.some(group => {
      const andParts = group.split(/\s\+\s/);
      return andParts.every(part => matchesSingleCondition(low, part, cols));
    });
  }
  function bestMatch(txt, cols) { if(!txt)return null;for(const e of RULES){if(e.enabled&&e.term&&matchesRule(txt,e.term,cols))return e;}return null; }
  // v4.7.0: Spaltennamen pro Tabelle für "Spalte=Wert"-Bedingungen (Header-Cache).
  // row.cells und thead-th laufen index-parallel (beide enthalten Checkbox-/Nummernspalten).
  const _headerCache = new WeakMap();
  function _getHeaderNames(table) {
    if (_headerCache.has(table)) return _headerCache.get(table);
    const names = [...table.querySelectorAll('thead th')].map(th =>
      norm(th.getAttribute('aria-label') || th.getAttribute('title') || th.innerText || th.textContent || '').trim());
    _headerCache.set(table, names);
    return names;
  }
  function getRowCols(row) {
    const table = row.closest('table'); if (!table) return null;
    const names = _getHeaderNames(table); if (!names.some(n => n)) return null;
    const cells = row.cells, cols = [];
    for (let i = 0; i < cells.length && i < names.length; i++) {
      if (names[i]) cols.push({ name: names[i], text: norm(cells[i].innerText || cells[i].textContent || '') });
    }
    return cols.length ? cols : null;
  }
  // Spalten nur einlesen, wenn mindestens eine aktive Regel "=" nutzt (spart innerText-Reads)
  function anyColRule() { return RULES.some(r => r.enabled && r.term && r.term.includes('=')); }
  function markRow(row,m) { row.classList.add('tm-sfhl-mark'); row.style.setProperty('--sfhl-bg',m.color,'important'); row.dataset.sfhlRule=m.id; }
  function unmarkRow(row) { row.classList.remove('tm-sfhl-mark','sfhl-new-match'); row.style.removeProperty('--sfhl-bg'); delete row.dataset.sfhlRule; }
  function updateHighlightCount() { const n=document.querySelectorAll('.tm-sfhl-mark').length;const c=triggerBtn.querySelector('.sfhl-count');if(c)c.textContent=n>0?`${n} markiert`:''; }
  // innerText wird bevorzugt: SF Locker Service patcht es für Synthetic-Shadow-Traversal.
  // textContent als Fallback für Umgebungen ohne innerText (z.B. SVG-Knoten).
  function highlightRows(full=false) { if(!loadRulesOn()){if(full){const rows=getRows();rows.forEach(r=>unmarkRow(r));}updateHighlightCount();removeLegend();return false;} const rows=getRows();if(rows.length===0)return false;const needCols=anyColRule();for(const row of rows){if(full)unmarkRow(row);const cells=row.querySelectorAll('td');let txt='';for(const c of cells)txt+=' '+(c.innerText||c.textContent||'');const m=bestMatch(txt,needCols?getRowCols(row):null);if(m)markRow(row,m);else if(full)unmarkRow(row);}updateHighlightCount();ensureLegend(rows);return true; }

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
  // v4.15.0: mehrere Buttons nebeneinander (z.B. GMaps + Route + Regel)
  function showSelButtons(x,y,btns){
    hideSelButton();
    const wrap=document.createElement('div');
    wrap.className='sfhl-sel-wrap';
    wrap.style.left=Math.round(x)+'px';
    wrap.style.top=Math.round(y)+'px';
    for(const b of btns){
      const el=document.createElement('div');
      el.className='sfhl-sel-btn';
      el.textContent=b.label;
      el.title=b.title;
      // mousedown statt click: verhindert, dass die Textauswahl vorher kollabiert
      el.addEventListener('mousedown', ev=>{ ev.preventDefault(); ev.stopPropagation(); b.onAct(); hideSelButton(); });
      wrap.appendChild(el);
    }
    document.body.appendChild(wrap);
    _selBtn=wrap;
  }
  function showSelButton(x,y,label,title,onAct){ showSelButtons(x,y,[{label,title,onAct}]); }
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
    const all = loadDokuLinks().filter(l => l.enabled !== false);
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

  // --- v4.15.0: Adress-Shortcuts (GMaps-Suche + Route von der eigenen Adresse) ---
  // Heuristik für Adressen: mehrteiliger Text mit Zahl, der eine PLZ, eine
  // Straße mit Hausnummer oder ein Komma enthält. Codes (ohne Leerzeichen)
  // laufen vorher in detectCodeType und kollidieren daher nicht.
  function looksLikeAddress(s){
    if(!s || s.length<8 || s.length>80 || !/\s/.test(s) || !/\d/.test(s) || !/[A-Za-zÄÖÜäöüß]{3}/.test(s)) return false;
    return /\b\d{5}\b/.test(s)
        || /(straße|strasse|str\.|weg|platz|allee|gasse|ring|damm|ufer|chaussee)\s*\.?\s*\d/i.test(s)
        || s.includes(',');
  }
  function mapsSearchUrl(q){ return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q); }
  function mapsRouteUrl(from,to){ return 'https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(from)+'&destination='+encodeURIComponent(to); }
  function openRoute(dest){
    const home=loadHomeAddr().trim();
    if(!home){ toast('Bitte zuerst deine Adresse in den Einstellungen (Karten / Route) hinterlegen','info',5000); return; }
    window.open(mapsRouteUrl(home,dest),'_blank','noopener');
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
    if(e.target.closest && e.target.closest('.sfhl-panel,.sfhl-sel-wrap,.sfhl-doku-pop,.sfhl-trigger')) return;
    const { x, y, win } = selEventCoords(e);
    setTimeout(()=>{ // Selektion ist erst nach dem mouseup final
      // unsichtbare Zeichen entfernen (Zero-Width, NBSP) und Whitespace normalisieren
      const t=getSelectionText(e.target, win).replace(/[​-‏﻿ ]/g,' ').trim().replace(/\s+/g,' ');
      if(t.length<2||t.length>80){ hideSelButton(); return; }
      // für die Code-Erkennung Rand-Satzzeichen/Klammern abstreifen: „(FMR10B)" → „FMR10B"
      const code=t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g,'');
      const ct = loadDokuOn() ? detectCodeType(code) : null;
      if(ct){ showSelButton(x+6, y+10, '📄 Doku-Links', '„'+code+'" — Dokumentations-Links öffnen', ()=>showDokuPopup(x+6, y+10, code, ct)); return; }
      // v4.15.0: Adresse markiert → GMaps-Suche + Route (Startadresse aus den Einstellungen)
      if(loadDokuOn() && looksLikeAddress(t)){
        const btns=[
          { label:'🗺️ GMaps', title:'„'+t+'" in Google Maps suchen', onAct:()=>window.open(mapsSearchUrl(t),'_blank','noopener') },
          { label:'🚗 Route', title:'Route von deiner Adresse (Einstellungen) nach „'+t+'"', onAct:()=>openRoute(t) },
        ];
        if(loadSelRuleOn() && isCaseListView()) btns.push({ label:'➕ Regel', title:'„'+t+'" als Markierungs-Regel anlegen', onAct:()=>createRuleFromSelection(t) });
        showSelButtons(x+6, y+10, btns);
        return;
      }
      // v4.14.0: nur auf echten Case-Listenansichten — auf WorkOrder-/Detailseiten stört der Button
      if(loadSelRuleOn() && isCaseListView()){ showSelButton(x+6, y+10, '➕ Regel aus Auswahl', '„'+t+'" als Markierungs-Regel anlegen', ()=>createRuleFromSelection(t)); return; }
      hideSelButton();
    },10);
  }
  function handleSelectionMousedown(e){
    if(_selBtn && !(e.target.closest && e.target.closest('.sfhl-sel-wrap'))) hideSelButton();
    if(_dokuPop && !(e.target.closest && e.target.closest('.sfhl-doku-pop'))) hideDokuPopup();
  }
  document.addEventListener('mouseup', handleSelectionMouseup);
  document.addEventListener('mousedown', handleSelectionMousedown, true);
  // FIX v4.6.4: Zeilen über den Datensatz-Link (Record-Id) identifizieren statt über den
  // Zeilentext — sonst gilt eine Zeile als "neu", sobald sich z. B. eine Alters-Spalte
  // ("vor 5 Minuten" → "vor 6 Minuten") ändert → Fehlalarme. Text nur als Fallback.
  function rowKey(r) {
    try {
      const a = r.querySelector('a[href*="/lightning/r/"]');
      if (a) { const m = (a.getAttribute('href')||'').match(/\/r\/\w+\/([a-zA-Z0-9]{15,18})\//); if (m) return 'id:'+m[1]; }
    } catch {}
    const cells=r.querySelectorAll('td');let t='';for(const c of cells)t+=(c.innerText||c.textContent||'');return 'tx:'+t;
  }
  function snapshotMarked() { const set=new Set();document.querySelectorAll('.tm-sfhl-mark').forEach(r=>set.add(rowKey(r)));return set; }
  function highlightAndBlink(snap) {
    highlightRows(true);
    if(!snap)return;
    let alarmHits=0;
    document.querySelectorAll('.tm-sfhl-mark').forEach(r=>{
      if(!snap.has(rowKey(r))){
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
    const typing = Date.now() - _lastActivity < 5000;
    if (statusEl) statusEl.textContent = !isCaseListView() ? 'Nicht auf Case-Listenseite' : typing ? 'Pausiert – du tippst gerade' : 'Nächster Refresh in…';
    ringEl.classList.add('vis');
  }
  function startCd(secs){const b=getRefreshButton();if(!b)return;clearCd();nextAt=Date.now()+secs*1000;setLbl(b,secs);updateRfRing();cdId=setInterval(()=>{const rem=Math.max(0,nextAt-Date.now());setLbl(getRefreshButton(),Math.ceil(rem/1000));updateRfRing();if(rem<=0)clearCd();},1000);}
  function startLoop(){const secs=loadRefreshSecs();if(!loadRefreshOn()){stopRefresh();return;}clearRf();clearCd();startCd(secs);rfId=setInterval(()=>{const b=getRefreshButton();if(!b){waitBtn(startLoop);clearRf();clearCd();return;}if(Date.now()-_lastActivity<5000){startCd(secs);return;}const snap=snapshotMarked();b.click();setTimeout(()=>highlightAndBlink(snap),1500);startCd(secs);},secs*1000);}
  // FIX (B3): stopRefresh räumt auch waitBtn-Observer + Polling auf — sonst läuft nach
  // SPA-Navigation weg von der Case-Liste ein 1s-Intervall + MutationObserver endlos weiter.
  function stopRefresh(){clearRf();clearCd();if(rfObs){rfObs.disconnect();rfObs=null;}if(plId){clearInterval(plId);plId=null;}clrLbl();updateRfRing();}
  function restartRefresh(){if(loadRefreshOn()&&isCaseListView())waitBtn(startLoop);else stopRefresh();}
  function waitBtn(cb){if(getRefreshButton()){cb?.();return;}if(rfObs){rfObs.disconnect();rfObs=null;}if(plId){clearInterval(plId);plId=null;}rfObs=new MutationObserver(()=>{if(getRefreshButton()){rfObs.disconnect();rfObs=null;if(plId){clearInterval(plId);plId=null;}cb?.();}});rfObs.observe(document.documentElement,{childList:true,subtree:true});plId=setInterval(()=>{if(getRefreshButton()){if(rfObs){rfObs.disconnect();rfObs=null;}clearInterval(plId);plId=null;cb?.();}},1000);}
  // FIX v4.6.4: Wird das Skript erst NACH dem load-Event injiziert (langsamer
  // Tampermonkey-Start), feuerte der Listener nie → Auto-Refresh blieb bis zur ersten
  // Navigation tot. readyState-Check als Absicherung.
  const _initAfterLoad = () => {
    setTimeout(restartRefresh, 800);
    setTimeout(prefetchContactApi, 1500);
  };
  if (document.readyState === 'complete') _initAfterLoad();
  else window.addEventListener('load', _initAfterLoad);

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

  console.log('[SFHL] Init complete');
})();