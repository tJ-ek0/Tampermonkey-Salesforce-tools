// ==UserScript==
// @name         Salesforce List Markierung + Refresh
// @namespace    https://github.com/tJ-ek0/Tampermonkey-Salesforce-tools
// @version      3.4.0
// @description  Markiert Salesforce-Case-Listen farblich. Drag&Drop-Prioritaet, Quick-Toggle, Suchfeld, Live-Vorschau, Auto-Refresh.
// @author       Tobias Jurgan - SIS Endress + Hauser (Deutschland) GmbH+Co.KG
// @license      MIT
// @match        https://endress.lightning.force.com/lightning/o/Case/*
// @grant        none
// @run-at       document-end
// @homepageURL  https://github.com/tJ-ek0/Tampermonkey-Salesforce-tools
// @supportURL   https://github.com/tJ-ek0/Tampermonkey-Salesforce-tools/issues
// @downloadURL  https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js
// @updateURL    https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js
// ==/UserScript==

(function () {
  'use strict';
  console.log('[SFHL] v3.4.0 gestartet');

  // ===== Storage =====
  const LS_KEY       = 'sfhl_config_v4';
  const LS_KEY_OLD   = 'sfhl_config_v3';
  const LS_REFRESH   = 'sfhl_refresh_secs_v1';
  const LS_REF_ON    = 'sfhl_refresh_enabled';

  // ===== Helpers =====
  function uid() { return 'k' + Math.random().toString(36).slice(2, 10); }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function norm(s) { return (s || '').toString().toLowerCase(); }
  function escHtml(s) { return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  // Preset pastel colors – high readability, distinct hues
  const COLOR_PRESETS = [
    { hex: '#E6FFE6', name: 'Gr\u00fcn' },
    { hex: '#FFCCCC', name: 'Rot' },
    { hex: '#FFFFCC', name: 'Gelb' },
    { hex: '#FFE5CC', name: 'Orange' },
    { hex: '#E6F0FF', name: 'Blau' },
    { hex: '#F0E6FF', name: 'Lila' },
    { hex: '#E6FFFA', name: 'T\u00fcrkis' },
    { hex: '#FFE6F0', name: 'Pink' },
    { hex: '#FFF5E6', name: 'Pfirsich' },
    { hex: '#F0F0F0', name: 'Grau' },
  ];

  // ===== Config (v4: array order = priority, first wins. No priority field.) =====
  const DEFAULTS = [
    { id: uid(), term: '24/7, 2h, Visual Support, Smart Support', color: '#ffcccc', enabled: true },
    { id: uid(), term: '8/5, 4h, Visual Support, Smart Support',  color: '#ffe5b4', enabled: true },
    { id: uid(), term: 'Support Case - SLA SOS',                  color: '#ffffcc', enabled: true },
    { id: uid(), term: 'Complaint - Prio',                        color: '#ffd8b1', enabled: true },
    { id: uid(), term: 'ET:',                                     color: '#f8d7da', enabled: true },
  ];

  function loadConfig() {
    try {
      // Try v4 first
      let raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) return p.map(e => ({
          id: e.id || uid(), term: String(e.term || ''), color: e.color || '#ffffcc',
          enabled: typeof e.enabled === 'boolean' ? e.enabled : true
        }));
      }
      // Migrate v3 -> v4
      raw = localStorage.getItem(LS_KEY_OLD);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) {
          const migrated = p
            .slice()
            .sort((a, b) => (b.priority || 0) - (a.priority || 0))
            .map(e => ({ id: e.id || uid(), term: String(e.term || ''), color: e.color || '#ffffcc', enabled: true }));
          console.log('[SFHL] Migrated v3 config ->', migrated.length, 'rules');
          return migrated;
        }
      }
    } catch (err) { console.error('[SFHL] Config load error:', err); }
    return DEFAULTS.map(e => ({ ...e, id: uid() }));
  }
  function saveConfig() { localStorage.setItem(LS_KEY, JSON.stringify(CONFIG)); }

  function loadRefreshSecs() { const n = parseInt(localStorage.getItem(LS_REFRESH), 10); return Number.isFinite(n) && n > 0 ? n : 60; }
  function saveRefreshSecs(n) { const v = Math.max(5, Math.min(86400, Math.round(n))); localStorage.setItem(LS_REFRESH, String(v)); return v; }
  function loadRefreshOn() { const r = localStorage.getItem(LS_REF_ON); return r === null ? true : r === '1'; }
  function saveRefreshOn(on) { localStorage.setItem(LS_REF_ON, on ? '1' : '0'); }

  let CONFIG = loadConfig();
  saveConfig(); // persist migration immediately

  // ===== Toast =====
  function toast(msg, type = 'info', dur = 2500) {
    const t = document.createElement('div');
    t.className = `sfhl-toast sfhl-toast--${type}`;
    t.textContent = msg;
    document.documentElement.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('vis')));
    setTimeout(() => { t.classList.remove('vis'); setTimeout(() => t.remove(), 350); }, dur);
  }

  // ===== Count matches for a term against current SF rows =====
  function countMatches(term) {
    if (!term) return 0;
    const low = norm(term);
    const rows = getRows();
    let n = 0;
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      let txt = '';
      for (const c of cells) txt += ' ' + (c.innerText || c.textContent || '');
      if (norm(txt).includes(low)) n++;
    }
    return n;
  }

  // ===== Styles =====
  const styleEl = document.createElement('style');
  styleEl.id = 'sfhl-style-v3';
  styleEl.textContent = `
    /* Row highlighting */
    .tm-sfhl-mark, .tm-sfhl-mark > td, .tm-sfhl-mark [role="gridcell"],
    .tm-sfhl-mark .slds-hint-parent, .tm-sfhl-mark .slds-cell-wrap {
      background-color: var(--sfhl-bg) !important;
    }
    /* Blink animation for new matches after refresh */
    @keyframes sfhl-blink { 0%,100%{opacity:1} 50%{opacity:.3} }
    .sfhl-new-match td, .sfhl-new-match [role="gridcell"] {
      animation: sfhl-blink .5s ease 3;
    }

    /* Toast */
    .sfhl-toast { position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(8px);padding:8px 18px;border-radius:8px;z-index:2147483647;font:500 12.5px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;pointer-events:none;opacity:0;transition:opacity .2s,transform .2s; }
    .sfhl-toast.vis { opacity:1;transform:translateX(-50%) translateY(0); }
    .sfhl-toast--info{background:#1e293b;color:#e2e8f0} .sfhl-toast--success{background:#065f46;color:#d1fae5} .sfhl-toast--error{background:#991b1b;color:#fee2e2}

    /* Trigger pill */
    .sfhl-trigger { position:fixed;right:16px;bottom:16px;z-index:2147483646;display:none;align-items:center;gap:7px;padding:0 14px;height:36px;border-radius:99px;background:#fff;border:1px solid #e5e7eb;color:#374151;font:500 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;cursor:pointer;user-select:none;box-shadow:0 1px 3px rgba(0,0,0,.08),0 8px 24px rgba(0,0,0,.06);transition:box-shadow .15s,transform .15s,border-color .15s; }
    .sfhl-trigger:hover{box-shadow:0 2px 8px rgba(0,0,0,.1),0 12px 32px rgba(0,0,0,.1);border-color:#d1d5db;transform:translateY(-1px)} .sfhl-trigger:active{transform:translateY(0) scale(.98)}
    .sfhl-trigger .sfhl-dot{width:7px;height:7px;border-radius:50%;background:#10b981;box-shadow:0 0 0 2px rgba(16,185,129,.18)} .sfhl-trigger .sfhl-dot.off{background:#94a3b8;box-shadow:none}

    /* Backdrop + Panel */
    .sfhl-backdrop{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.08);opacity:0;pointer-events:none;transition:opacity .25s} .sfhl-backdrop.vis{opacity:1;pointer-events:auto}
    .sfhl-panel{position:fixed;top:0;right:0;bottom:0;width:400px;min-width:320px;max-width:700px;background:#fff;z-index:2147483647;box-shadow:-8px 0 40px rgba(0,0,0,.12);transform:translateX(100%);transition:transform .28s cubic-bezier(.22,.68,0,1);display:flex;flex-direction:column;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a} .sfhl-panel.open{transform:translateX(0)}
    .sfhl-panel.resizing{transition:none;user-select:none}

    /* Resize handle */
    .sfhl-resize{position:absolute;left:-3px;top:0;bottom:0;width:6px;cursor:ew-resize;z-index:5}
    .sfhl-resize::after{content:'';position:absolute;left:2px;top:50%;transform:translateY(-50%);width:2px;height:32px;background:#d1d5db;border-radius:2px;opacity:0;transition:opacity .15s}
    .sfhl-resize:hover::after,.sfhl-panel.resizing .sfhl-resize::after{opacity:1}

    /* Header */
    .sfhl-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e5e7eb;background:#f9fafb;flex-shrink:0}
    .sfhl-hdr h2{font-size:14px;font-weight:600;margin:0;color:#111;display:flex;align-items:center;gap:8px}
    .sfhl-pill{font-size:10px;font-weight:600;padding:2px 7px;border-radius:99px;background:#eef2ff;color:#4338ca}
    .sfhl-hdr-acts{display:flex;align-items:center;gap:2px}
    .sfhl-ib{width:30px;height:30px;border-radius:6px;background:transparent;cursor:pointer;color:#6b7280;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,color .12s;position:relative}
    .sfhl-ib:hover{background:#f3f4f6;color:#111} .sfhl-ib svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

    /* Overflow menu */
    .sfhl-overflow{position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);min-width:160px;padding:4px;z-index:10;opacity:0;transform:translateY(-4px);pointer-events:none;transition:opacity .15s,transform .15s}
    .sfhl-overflow.vis{opacity:1;transform:translateY(0);pointer-events:auto}
    .sfhl-oi{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:none;border-radius:5px;background:none;cursor:pointer;font-size:12.5px;color:#374151;text-align:left;transition:background .1s}
    .sfhl-oi:hover{background:#f3f4f6} .sfhl-oi svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
    .sfhl-oi.danger{color:#dc2626} .sfhl-oi.danger:hover{background:#fef2f2}
    .sfhl-overflow hr{border:none;border-top:1px solid #f3f4f6;margin:3px 0}

    /* Search */
    .sfhl-search{padding:8px 16px;border-bottom:1px solid #f3f4f6;flex-shrink:0}
    .sfhl-search input{width:100%;padding:6px 10px 6px 30px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E") 10px center no-repeat;transition:border-color .12s}
    .sfhl-search input:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.1)}

    /* Column header */
    .sfhl-colhdr{display:grid;grid-template-columns:20px minmax(0,1fr) 28px auto;gap:4px;padding:6px 16px;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f3f4f6;flex-shrink:0}

    /* Rules list */
    .sfhl-list{flex:1;overflow-y:auto;overflow-x:hidden;padding:2px 0;min-height:0}
    .sfhl-list::-webkit-scrollbar{width:4px} .sfhl-list::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:4px}

    /* Rule row */
    .sfhl-row{display:grid;grid-template-columns:20px minmax(0,1fr) 28px auto;gap:4px;padding:5px 16px;align-items:center;transition:background .12s;cursor:grab;border-left:3px solid transparent}
    .sfhl-row:hover{background:#f9fafb}
    .sfhl-row.disabled{opacity:.45}
    .sfhl-row.disabled .sfhl-r-term{text-decoration:line-through;color:#9ca3af}
    .sfhl-row.dragging{opacity:.3;background:#eef2ff}
    .sfhl-row.drag-over-top{border-top:2px solid #6366f1}
    .sfhl-row.drag-over-bot{border-bottom:2px solid #6366f1}

    /* Drag handle */
    .sfhl-grip{color:#d1d5db;cursor:grab;display:flex;align-items:center;justify-content:center}
    .sfhl-grip svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
    .sfhl-row:hover .sfhl-grip{color:#9ca3af}

    /* Term input */
    .sfhl-r-term{width:100%;padding:4px 8px;border:1px solid transparent;border-radius:5px;font-size:12.5px;background:transparent;color:#1a1a1a;transition:border-color .12s,background .12s;text-overflow:ellipsis}
    .sfhl-r-term:hover{border-color:#e5e7eb;background:#fff} .sfhl-r-term:focus{outline:none;border-color:#6366f1;background:#fff;box-shadow:0 0 0 2px rgba(99,102,241,.1)}

    /* Color swatch + palette */
    .sfhl-sw{position:relative;width:24px;height:24px;border-radius:5px;cursor:pointer;overflow:visible;border:2px solid #fff;box-shadow:0 0 0 1px #e5e7eb;transition:box-shadow .12s,transform .1s;margin:0 auto}
    .sfhl-sw:hover{box-shadow:0 0 0 1px #a5b4fc;transform:scale(1.1)}
    .sfhl-sw .sfhl-sw-fill{position:absolute;inset:0;border-radius:3px}
    .sfhl-sw input[type="color"]{position:absolute;opacity:0;width:0;height:0;pointer-events:none}

    /* Palette popup (single shared, fixed position) */
    .sfhl-palette{position:fixed;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.14);padding:8px;z-index:2147483647;opacity:0;pointer-events:none;transition:opacity .12s;min-width:200px}
    .sfhl-palette.vis{opacity:1;pointer-events:auto}
    .sfhl-palette-label{font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px}
    .sfhl-palette-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:8px}
    .sfhl-preset{width:30px;height:30px;border-radius:6px;border:2px solid transparent;cursor:pointer;transition:border-color .1s,transform .1s;position:relative}
    .sfhl-preset:hover{transform:scale(1.12);border-color:#a5b4fc}
    .sfhl-preset.active{border-color:#4f46e5;box-shadow:0 0 0 1px #4f46e5}
    .sfhl-preset-name{position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);font-size:7px;color:#9ca3af;white-space:nowrap;opacity:0;transition:opacity .1s;pointer-events:none}
    .sfhl-preset:hover .sfhl-preset-name{opacity:1}
    .sfhl-palette-custom{display:flex;align-items:center;gap:6px;padding:5px 8px;border-top:1px solid #f3f4f6;margin:0 -8px;padding:6px 8px 2px;cursor:pointer;font-size:11px;color:#6b7280;transition:color .1s}
    .sfhl-palette-custom:hover{color:#4f46e5}
    .sfhl-palette-custom svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2}

    /* Row actions (always visible) */
    .sfhl-row-acts{display:flex;gap:3px;align-items:center}
    .sfhl-ra{height:22px;border:none;border-radius:4px;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:3px;transition:color .1s,background .1s;padding:0 5px;font-size:10.5px;font-weight:500;white-space:nowrap}
    .sfhl-ra svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
    .sfhl-ra.toggle-on{color:#16a34a} .sfhl-ra.toggle-on svg{fill:#16a34a;stroke:none}
    .sfhl-ra.toggle-off{color:#9ca3af} .sfhl-ra.toggle-off svg{stroke:#9ca3af}
    .sfhl-ra:hover{background:#f3f4f6}
    .sfhl-ra.del{color:#c4c4c4;padding:0 3px} .sfhl-ra.del:hover{color:#ef4444;background:#fef2f2}

    /* Add rule area */
    .sfhl-add-bar{display:flex;padding:8px 16px;border-top:1px solid #f3f4f6;flex-shrink:0}
    .sfhl-add-toggle{display:flex;align-items:center;gap:6px;padding:5px 10px;border:1px dashed #d1d5db;border-radius:6px;background:none;cursor:pointer;color:#9ca3af;font-size:12px;transition:all .15s;width:100%;justify-content:center}
    .sfhl-add-toggle:hover{border-color:#6366f1;color:#6366f1;background:#f5f3ff}
    .sfhl-add-toggle svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
    .sfhl-add-form{display:none;padding:10px 16px;border-top:1px solid #f3f4f6;background:#fafafa;flex-shrink:0}
    .sfhl-add-form.vis{display:block}
    .sfhl-add-row{display:grid;grid-template-columns:minmax(0,1fr) 32px;gap:6px;align-items:center}
    .sfhl-add-form input[type="text"]{padding:7px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12.5px;width:100%}
    .sfhl-add-form input[type="text"]:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.1)}
    .sfhl-add-acts{display:flex;gap:6px;margin-top:8px;justify-content:space-between;align-items:center}
    .sfhl-match-badge{font-size:11px;color:#6b7280;display:flex;align-items:center;gap:4px}
    .sfhl-match-badge .num{font-weight:600;color:#4f46e5}
    .sfhl-btn-sm{padding:5px 12px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid #e5e7eb;background:#fff;color:#374151;transition:all .12s}
    .sfhl-btn-sm:hover{background:#f9fafb}
    .sfhl-btn-primary{background:#4f46e5!important;border-color:#4f46e5!important;color:#fff!important} .sfhl-btn-primary:hover{background:#4338ca!important}

    /* Refresh section */
    .sfhl-rf-sec{border-top:1px solid #e5e7eb;flex-shrink:0;background:#f9fafb}
    .sfhl-rf-hdr{display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 16px;cursor:pointer;font-size:12.5px;font-weight:500;color:#374151;transition:background .12s}
    .sfhl-rf-hdr:hover{background:#f3f4f6}
    .sfhl-rf-hdr svg{width:14px;height:14px;stroke:#9ca3af;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .2s} .sfhl-rf-hdr svg.rot{transform:rotate(180deg)}
    .sfhl-sp{font-size:10px;font-weight:600;padding:1px 6px;border-radius:99px;margin-left:8px}
    .sfhl-sp-on{background:#d1fae5;color:#065f46} .sfhl-sp-off{background:#f1f5f9;color:#64748b}
    .sfhl-rf-body{display:none;padding:0 16px 12px} .sfhl-rf-body.vis{display:block}
    .sfhl-rf-body .rfr{display:flex;align-items:center;gap:10px;margin-bottom:8px}
    .sfhl-rf-body label{font-size:12px;color:#6b7280;white-space:nowrap}
    .sfhl-rf-body input[type="number"]{width:70px;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;text-align:center;-moz-appearance:textfield}
    .sfhl-rf-body input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none}
    .sfhl-tgl{position:relative;width:36px;height:20px;display:inline-block;flex-shrink:0}
    .sfhl-tgl input{opacity:0;width:0;height:0;position:absolute}
    .sfhl-tgl .sl{position:absolute;inset:0;background:#d1d5db;border-radius:99px;cursor:pointer;transition:background .2s}
    .sfhl-tgl .sl::before{content:'';position:absolute;width:16px;height:16px;left:2px;top:2px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 2px rgba(0,0,0,.15)}
    .sfhl-tgl input:checked+.sl{background:#4f46e5} .sfhl-tgl input:checked+.sl::before{transform:translateX(16px)}
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
      <h2>Regeln <span class="sfhl-pill">Oben = h\u00f6chste Prio</span></h2>
      <div class="sfhl-hdr-acts">
        <div class="sfhl-ib sfhl-menu-btn" role="button" tabindex="0" title="Optionen">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/></svg>
          <div class="sfhl-overflow">
            <div class="sfhl-oi sfhl-act-export" role="button"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export</div>
            <div class="sfhl-oi sfhl-act-import" role="button"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Import</div>
            <hr>
            <div class="sfhl-oi sfhl-act-reset danger" role="button"><svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>Auf Standard</div>
          </div>
        </div>
        <div class="sfhl-ib sfhl-close-btn" role="button" tabindex="0" title="Schlie\u00dfen">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </div>
      </div>
    </div>
    <div class="sfhl-search"><input type="text" placeholder="Regeln durchsuchen\u2026" class="sfhl-search-input"></div>
    <div class="sfhl-colhdr"><div></div><div>Stichwort</div><div>Farbe</div><div>Aktionen</div></div>
    <div class="sfhl-list"></div>
    <div class="sfhl-add-bar">
      <div class="sfhl-add-toggle" role="button">
        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Neue Regel
      </div>
    </div>
    <div class="sfhl-add-form">
      <div class="sfhl-add-row">
        <input type="text" placeholder="Stichwort eingeben\u2026" class="sfhl-new-term">
        <div class="sfhl-sw sfhl-add-sw" style="margin:0 auto" data-color="#e6ffe6"><div class="sfhl-sw-fill" style="background:#e6ffe6"></div><input type="color" value="#e6ffe6" class="sfhl-new-color"></div>
      </div>
      <div class="sfhl-add-acts">
        <div class="sfhl-match-badge">Treffer: <span class="num">0</span></div>
        <div style="display:flex;gap:6px">
          <div class="sfhl-btn-sm sfhl-add-cancel" role="button">Abbrechen</div>
          <div class="sfhl-btn-sm sfhl-btn-primary sfhl-add-save" role="button">Hinzuf\u00fcgen</div>
        </div>
      </div>
    </div>
    <div class="sfhl-rf-sec">
      <div class="sfhl-rf-hdr" role="button">
        <span>Auto-Refresh <span class="sfhl-sp"></span></span>
        <svg class="sfhl-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="sfhl-rf-body">
        <div class="rfr">
          <label>Intervall</label>
          <input type="number" min="5" step="5" class="sfhl-rf-secs" placeholder="60">
          <label>Sek.</label>
          <div class="sfhl-btn-sm sfhl-rf-apply" role="button">\u00dcbernehmen</div>
        </div>
        <div class="rfr">
          <label>Aktiv</label>
          <span class="sfhl-tgl"><input type="checkbox" class="sfhl-rf-enabled"><span class="sl"></span></span>
        </div>
      </div>
    </div>
  `;
  document.documentElement.appendChild(panel);

  const triggerBtn = document.createElement('div');
  triggerBtn.className = 'sfhl-trigger'; triggerBtn.setAttribute('role', 'button');
  triggerBtn.innerHTML = '<span class="sfhl-dot"></span><span>Regeln</span><span class="sfhl-count" style="font-size:10px;font-weight:600;color:#9ca3af;padding-left:5px;border-left:1px solid #f3f4f6;margin-left:2px"></span>';
  document.documentElement.appendChild(triggerBtn);

  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.txt,.json'; fileInput.style.display = 'none';
  document.documentElement.appendChild(fileInput);

  // ===== UI Refs =====
  const $ = (s) => panel.querySelector(s);
  const listEl      = $('.sfhl-list');
  const searchInput = $('.sfhl-search-input');
  const addForm     = $('.sfhl-add-form');
  const addTermEl   = $('.sfhl-new-term');
  const addColorEl  = $('.sfhl-new-color');
  const addSw       = $('.sfhl-add-sw');
  const matchBadge  = $('.sfhl-match-badge .num');
  const rfInput     = $('.sfhl-rf-secs');
  const rfCb        = $('.sfhl-rf-enabled');
  const statusPill  = $('.sfhl-sp');
  const chevron     = $('.sfhl-chev');
  const rfBody      = $('.sfhl-rf-body');
  const menuBtn     = $('.sfhl-menu-btn');
  const overflow    = $('.sfhl-overflow');

  rfInput.value = String(loadRefreshSecs());
  rfCb.checked  = loadRefreshOn();

  // ===== Shared color palette (one element, positioned dynamically) =====
  let activeSwatch = null; // currently open swatch element

  const paletteEl = document.createElement('div');
  paletteEl.className = 'sfhl-palette';
  paletteEl.innerHTML = `
    <div class="sfhl-palette-label">Farbe w\u00e4hlen</div>
    <div class="sfhl-palette-grid">
      ${COLOR_PRESETS.map(p => `<div class="sfhl-preset" data-color="${p.hex}" style="background:${p.hex}" title="${p.name}"><span class="sfhl-preset-name">${p.name}</span></div>`).join('')}
    </div>
    <div class="sfhl-palette-custom" role="button"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>Eigene Farbe\u2026</div>
  `;
  document.documentElement.appendChild(paletteEl);

  function showPalette(sw) {
    if (activeSwatch === sw && paletteEl.classList.contains('vis')) {
      closePalette(); return;
    }
    activeSwatch = sw;
    const rect = sw.getBoundingClientRect();
    // Position below the swatch, right-aligned
    let top = rect.bottom + 6;
    let left = rect.right - 200;
    // Keep on screen
    if (left < 8) left = 8;
    if (top + 220 > window.innerHeight) top = rect.top - 220;
    paletteEl.style.top = top + 'px';
    paletteEl.style.left = left + 'px';
    // Highlight active preset
    const cur = (sw.dataset.color || '').toLowerCase();
    paletteEl.querySelectorAll('.sfhl-preset').forEach(p => {
      p.classList.toggle('active', p.dataset.color.toLowerCase() === cur);
    });
    paletteEl.classList.add('vis');
  }
  function closePalette() {
    paletteEl.classList.remove('vis');
    activeSwatch = null;
  }

  // Palette: click preset
  paletteEl.addEventListener('click', e => {
    const preset = e.target.closest('.sfhl-preset');
    if (preset && activeSwatch) {
      e.stopPropagation();
      applyColor(activeSwatch, preset.dataset.color);
      closePalette();
      return;
    }
    const custom = e.target.closest('.sfhl-palette-custom');
    if (custom && activeSwatch) {
      e.stopPropagation();
      const input = activeSwatch.querySelector('input[type="color"]');
      if (input) { closePalette(); input.click(); }
    }
  });

  // Click on swatch fill -> show/toggle palette
  panel.addEventListener('click', e => {
    const fill = e.target.closest('.sfhl-sw-fill');
    if (fill) {
      e.stopPropagation();
      const sw = fill.closest('.sfhl-sw');
      if (sw) showPalette(sw);
      return;
    }
    // Click elsewhere in panel -> close
    if (!e.target.closest('.sfhl-palette')) closePalette();
  });
  // Close on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.sfhl-palette') && !e.target.closest('.sfhl-sw')) closePalette();
  });

  // Native color picker change
  panel.addEventListener('change', e => {
    if (!e.target.matches('input[type="color"]')) return;
    const sw = e.target.closest('.sfhl-sw');
    if (sw) applyColor(sw, e.target.value);
  });
  panel.addEventListener('input', e => {
    if (!e.target.matches('input[type="color"]')) return;
    const sw = e.target.closest('.sfhl-sw');
    if (sw) { const fill = sw.querySelector('.sfhl-sw-fill'); if (fill) fill.style.background = e.target.value; }
  });

  function applyColor(sw, color) {
    const fill = sw.querySelector('.sfhl-sw-fill');
    const input = sw.querySelector('input[type="color"]');
    if (fill) fill.style.background = color;
    if (input) input.value = color;
    sw.dataset.color = color;
    // If in a rule row, save to config
    const row = sw.closest('.sfhl-row');
    if (row) {
      const item = CONFIG.find(x => x.id === row.dataset.ruleId);
      if (item) { item.color = color; row.style.borderLeftColor = color; saveConfig(); highlightRows(true); }
    }
  }

  function updatePill() {
    const on = loadRefreshOn();
    statusPill.textContent = on ? `${loadRefreshSecs()}s` : 'Aus';
    statusPill.className = 'sfhl-sp ' + (on ? 'sfhl-sp-on' : 'sfhl-sp-off');
    const dot = triggerBtn.querySelector('.sfhl-dot');
    if (dot) dot.className = 'sfhl-dot' + (on ? '' : ' off');
  }
  function updateCount() {
    // Rule count is visible in the panel; trigger button shows marked-row count via updateHighlightCount
  }
  updatePill(); updateCount();

  // ===== Panel open/close =====
  function openPanel()  { panel.classList.add('open'); backdrop.classList.add('vis'); }
  function closePanel() { panel.classList.remove('open'); backdrop.classList.remove('vis'); closeOF(); closePalette(); }
  function closeOF()    { overflow.classList.remove('vis'); }

  triggerBtn.onclick = openPanel;
  backdrop.onclick = closePanel;
  $('.sfhl-close-btn').onclick = closePanel;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePanel();
    if (e.altKey && e.key.toLowerCase() === 'r') { e.preventDefault(); panel.classList.contains('open') ? closePanel() : openPanel(); }
  });

  // ===== Panel resize (drag left edge) =====
  const LS_PANEL_W = 'sfhl_panel_width';
  const savedW = parseInt(localStorage.getItem(LS_PANEL_W), 10);
  if (savedW >= 320 && savedW <= 700) panel.style.width = savedW + 'px';

  const resizeHandle = panel.querySelector('.sfhl-resize');
  let resizing = false;
  resizeHandle.addEventListener('mousedown', e => {
    e.preventDefault();
    resizing = true;
    panel.classList.add('resizing');
    const onMove = ev => {
      if (!resizing) return;
      const w = Math.max(320, Math.min(700, window.innerWidth - ev.clientX));
      panel.style.width = w + 'px';
    };
    const onUp = () => {
      resizing = false;
      panel.classList.remove('resizing');
      localStorage.setItem(LS_PANEL_W, String(parseInt(panel.style.width, 10)));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  menuBtn.onclick = e => { e.stopPropagation(); overflow.classList.toggle('vis'); };
  document.addEventListener('click', e => { if (!menuBtn.contains(e.target)) closeOF(); });
  $('.sfhl-act-export').onclick = () => { closeOF(); doExport(); };
  $('.sfhl-act-import').onclick = () => { closeOF(); fileInput.value = ''; fileInput.click(); };
  $('.sfhl-act-reset').onclick  = () => { closeOF(); doReset(); };

  // ===== Search =====
  let searchTerm = '';
  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value.toLowerCase().trim();
    renderList();
  });

  // ===== Add rule =====
  $('.sfhl-add-toggle').onclick = () => {
    addForm.classList.add('vis'); $('.sfhl-add-bar').style.display = 'none';
    matchBadge.textContent = '0';
    setTimeout(() => addTermEl.focus(), 50);
  };
  $('.sfhl-add-cancel').onclick = () => {
    addForm.classList.remove('vis'); $('.sfhl-add-bar').style.display = 'flex';
    addTermEl.value = '';
  };

  // Live match count
  const updateMatchCount = debounce(() => {
    const n = countMatches(addTermEl.value.trim());
    matchBadge.textContent = String(n);
  }, 150);
  addTermEl.addEventListener('input', updateMatchCount);

  $('.sfhl-add-save').onclick = () => {
    const term = (addTermEl.value || '').trim();
    if (!term) { addTermEl.focus(); return; }
    CONFIG.unshift({ id: uid(), term, color: addSw?.dataset.color || addColorEl.value || '#ffffcc', enabled: true });
    saveConfig(); renderList(); rescanSoon(true);
    addTermEl.value = '';
    // Reset swatch to default green
    if (addSw) { addSw.dataset.color = '#e6ffe6'; const f = addSw.querySelector('.sfhl-sw-fill'); if (f) f.style.background = '#e6ffe6'; }
    if (addColorEl) addColorEl.value = '#e6ffe6';
    addForm.classList.remove('vis'); $('.sfhl-add-bar').style.display = 'flex';
    toast('Regel hinzugef\u00fcgt', 'success');
  };
  addTermEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('.sfhl-add-save').click(); } });

  // ===== Refresh section =====
  $('.sfhl-rf-hdr').onclick = () => {
    const open = rfBody.classList.toggle('vis');
    chevron.classList.toggle('rot', open);
  };
  $('.sfhl-rf-apply').onclick = () => {
    const v = parseInt(rfInput.value, 10);
    const secs = saveRefreshSecs(Number.isFinite(v) ? v : 60);
    rfInput.value = String(secs);
    restartRefresh(); updatePill();
    toast(`Intervall: ${secs}s`, 'success');
  };
  rfCb.onchange = () => {
    saveRefreshOn(rfCb.checked);
    if (rfCb.checked) restartRefresh(); else stopRefresh();
    updatePill();
    toast(rfCb.checked ? 'Auto-Refresh an' : 'Auto-Refresh aus', 'info');
  };

  // Export / Import / Reset
  function doExport() {
    try {
      const blob = new Blob([JSON.stringify(CONFIG, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); const d = new Date(), pad = n => String(n).padStart(2,'0');
      a.href = URL.createObjectURL(blob);
      a.download = `sfhl_export_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.txt`;
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
      toast('Exportiert', 'success');
    } catch { toast('Export fehlgeschlagen', 'error'); }
  }
  fileInput.onchange = async ev => {
    const file = ev.target.files?.[0]; if (!file) return;
    try {
      const p = JSON.parse(await file.text());
      if (!Array.isArray(p)) throw 0;
      CONFIG = p.map(e => ({ id: e.id||uid(), term: String(e.term||''), color: e.color||'#ffffcc', enabled: e.enabled !== false }));
      saveConfig(); renderList(); rescanSoon(true);
      toast(`${CONFIG.length} Regeln importiert`, 'success');
    } catch { toast('Ung\u00fcltiges Format', 'error', 3500); }
  };
  function doReset() {
    if (!confirm('Auf Standard zur\u00fccksetzen?')) return;
    CONFIG = DEFAULTS.map(e => ({ ...e, id: uid() }));
    saveConfig(); renderList(); rescanSoon(true);
    toast('Zur\u00fcckgesetzt', 'info');
  }

  // ===== Render list =====
  let dragSrcId = null;

  function renderList() {
    listEl.innerHTML = '';
    const filtered = searchTerm
      ? CONFIG.filter(r => norm(r.term).includes(searchTerm))
      : CONFIG;

    for (const item of filtered) {
      const row = document.createElement('div');
      row.className = 'sfhl-row' + (item.enabled ? '' : ' disabled');
      row.dataset.ruleId = item.id;
      row.draggable = true;
      row.style.borderLeftColor = item.color;

      const eyeIcon = item.enabled
        ? '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

      row.innerHTML = `
        <div class="sfhl-grip"><svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg></div>
        <input type="text" value="${escHtml(item.term)}" title="${escHtml(item.term)}" class="sfhl-r-term">
        <div class="sfhl-sw" data-color="${item.color}">
          <div class="sfhl-sw-fill" style="background:${item.color}"></div>
          <input type="color" value="${item.color}" class="sfhl-r-color">
        </div>
        <div class="sfhl-row-acts">
          <div class="sfhl-ra ${item.enabled ? 'toggle-on' : 'toggle-off'} sfhl-toggle-rule" role="button" title="${item.enabled ? 'Deaktivieren' : 'Aktivieren'}">${eyeIcon}${item.enabled ? 'An' : 'Aus'}</div>
          <div class="sfhl-ra del sfhl-del-rule" role="button" title="L\u00f6schen"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
        </div>
      `;
      listEl.appendChild(row);
    }
    updateCount();
  }

  // ===== Event delegation on list =====
  function findItem(el) { const id = el.closest('.sfhl-row')?.dataset.ruleId; return CONFIG.find(x => x.id === id); }

  // Term change
  listEl.addEventListener('change', e => {
    const item = findItem(e.target); if (!item) return;
    if (e.target.matches('.sfhl-r-term')) {
      item.term = e.target.value; e.target.title = e.target.value;
      saveConfig(); rescanSoon(true);
    }
  });

  // Toggle + Delete clicks
  listEl.addEventListener('click', e => {
    const toggle = e.target.closest('.sfhl-toggle-rule');
    if (toggle) {
      const item = findItem(toggle); if (!item) return;
      item.enabled = !item.enabled;
      saveConfig(); renderList(); rescanSoon(true);
      return;
    }
    const del = e.target.closest('.sfhl-del-rule');
    if (del) {
      const id = del.closest('.sfhl-row')?.dataset.ruleId;
      CONFIG = CONFIG.filter(x => x.id !== id);
      saveConfig(); renderList(); rescanSoon(true);
      toast('Gel\u00f6scht', 'info');
    }
  });

  // ===== Drag & Drop =====
  listEl.addEventListener('dragstart', e => {
    const row = e.target.closest('.sfhl-row'); if (!row) return;
    dragSrcId = row.dataset.ruleId;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcId);
  });
  listEl.addEventListener('dragend', e => {
    const row = e.target.closest('.sfhl-row'); if (row) row.classList.remove('dragging');
    listEl.querySelectorAll('.drag-over-top,.drag-over-bot').forEach(r => r.classList.remove('drag-over-top', 'drag-over-bot'));
    dragSrcId = null;
  });
  listEl.addEventListener('dragover', e => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.sfhl-row'); if (!row || row.dataset.ruleId === dragSrcId) return;
    listEl.querySelectorAll('.drag-over-top,.drag-over-bot').forEach(r => r.classList.remove('drag-over-top', 'drag-over-bot'));
    const rect = row.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    row.classList.add(e.clientY < midY ? 'drag-over-top' : 'drag-over-bot');
  });
  listEl.addEventListener('drop', e => {
    e.preventDefault();
    const row = e.target.closest('.sfhl-row'); if (!row || !dragSrcId) return;
    const targetId = row.dataset.ruleId;
    if (dragSrcId === targetId) return;

    const srcIdx = CONFIG.findIndex(x => x.id === dragSrcId);
    const tgtIdx = CONFIG.findIndex(x => x.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    const [moved] = CONFIG.splice(srcIdx, 1);
    const rect = row.getBoundingClientRect();
    const insertIdx = e.clientY < rect.top + rect.height / 2 ? tgtIdx : tgtIdx + (srcIdx < tgtIdx ? 0 : 1);
    CONFIG.splice(insertIdx, 0, moved);

    saveConfig(); renderList(); rescanSoon(true);
    toast('Reihenfolge ge\u00e4ndert', 'info');
  });

  renderList();

  // ===== Highlighting =====
  const ROW_STRATEGIES = [
    { name:'css:lst-common',  type:'css', sel:'lst-common-list-internal table tbody tr' },
    { name:'css:lst-manager', type:'css', sel:'lst-list-view-manager table tbody tr' },
    { name:'css:object-home', type:'css', sel:'lst-object-home table tbody tr' },
    { name:'xpath:short',     type:'xpath', sel:'//lst-list-view-manager//table//tbody//tr' },
    { name:'xpath:fallback',  type:'xpath', sel:'//lst-list-view-manager//div//tr | //lst-list-view-manager//tr' },
  ];
  let _lrs = '';

  function getRows() {
    for (const s of ROW_STRATEGIES) {
      try {
        let rows;
        if (s.type === 'css') {
          rows = Array.from(document.querySelectorAll(s.sel));
        } else {
          const snap = document.evaluate(s.sel, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          rows = []; for (let i = 0; i < snap.snapshotLength; i++) rows.push(snap.snapshotItem(i));
        }
        rows = rows.filter(tr => tr.querySelector('td'));
        if (rows.length > 0) {
          if (_lrs !== s.name) { _lrs = s.name; console.log(`[SFHL] Rows: "${s.name}" (${rows.length})`); }
          return rows;
        }
      } catch {}
    }
    return [];
  }

  const REFRESH_STRATEGIES = [
    { name:'css:title',  type:'cf', sel:'lst-list-view-manager-button-bar lightning-button-icon button', filter: b => /refresh|aktualisieren/i.test(b.title||b.getAttribute('aria-label')||'') },
    { name:'css:header', type:'cf', sel:'lst-list-view-manager-header lightning-button-icon button',     filter: b => /refresh|aktualisieren/i.test(b.title||b.getAttribute('aria-label')||'') },
    { name:'css:first',  type:'css', sel:'lst-list-view-manager-button-bar lightning-button-icon:first-of-type button' },
    { name:'xpath:short', type:'xpath', sel:'//lst-list-view-manager-button-bar//lightning-button-icon//button' },
    { name:'xpath:legacy', type:'xpath', sel:"//*[@id='brandBand_1']/div/div/div/div/lst-object-home/div/lst-list-view-manager/lst-common-list-internal/lst-list-view-manager-header/div/div[2]/div[4]/lst-list-view-manager-button-bar/div/div[1]/lightning-button-icon/button" },
  ];
  let _lrfs = '';

  function getRefreshButton() {
    for (const s of REFRESH_STRATEGIES) {
      try {
        let r = null;
        if (s.type === 'css') r = document.querySelector(s.sel);
        else if (s.type === 'cf') r = Array.from(document.querySelectorAll(s.sel)).find(s.filter) || null;
        else r = document.evaluate(s.sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (r) { if (_lrfs !== s.name) { _lrfs = s.name; console.log(`[SFHL] Refresh: "${s.name}"`); } return r; }
      } catch {}
    }
    return null;
  }

  // Match logic: first enabled rule in CONFIG order wins (index 0 = highest prio)
  function bestMatch(txt) {
    if (!txt) return null;
    const low = norm(txt);
    for (const e of CONFIG) {
      if (e.enabled && e.term && low.includes(norm(e.term))) return e;
    }
    return null;
  }

  function markRow(row, match) {
    row.classList.add('tm-sfhl-mark');
    row.style.setProperty('--sfhl-bg', match.color, 'important');
    row.dataset.sfhlRule = match.id;
  }
  function unmarkRow(row) {
    row.classList.remove('tm-sfhl-mark', 'sfhl-new-match');
    row.style.removeProperty('--sfhl-bg');
    delete row.dataset.sfhlRule;
  }

  function updateHighlightCount() {
    const n = document.querySelectorAll('.tm-sfhl-mark').length;
    const c = triggerBtn.querySelector('.sfhl-count');
    if (c) c.textContent = n > 0 ? `${n} markiert` : '';
  }

  function highlightRows(full = false) {
    const rows = getRows(); if (rows.length === 0) return false;
    for (const row of rows) {
      if (full) unmarkRow(row);
      const cells = row.querySelectorAll('td');
      let txt = ''; for (const c of cells) txt += ' ' + (c.innerText || c.textContent || '');
      const m = bestMatch(txt);
      if (m) markRow(row, m); else if (full) unmarkRow(row);
    }
    updateHighlightCount();
    return true;
  }

  // Blink new matches after auto-refresh
  function snapshotMarked() {
    const set = new Set();
    document.querySelectorAll('.tm-sfhl-mark').forEach(r => {
      const cells = r.querySelectorAll('td');
      let txt = ''; for (const c of cells) txt += (c.innerText || '');
      set.add(txt);
    });
    return set;
  }
  function highlightAndBlink(oldSnapshot) {
    highlightRows(true);
    if (!oldSnapshot) return;
    document.querySelectorAll('.tm-sfhl-mark').forEach(r => {
      const cells = r.querySelectorAll('td');
      let txt = ''; for (const c of cells) txt += (c.innerText || '');
      if (!oldSnapshot.has(txt)) {
        r.classList.add('sfhl-new-match');
        setTimeout(() => r.classList.remove('sfhl-new-match'), 3000);
      }
    });
  }

  // ===== Visibility =====
  function isCasePage() { return location.href.startsWith('https://endress.lightning.force.com/lightning/o/Case/'); }
  function updateVis() {
    triggerBtn.style.display = isCasePage() ? 'inline-flex' : 'none';
    if (!isCasePage()) closePanel();
  }
  updateVis();

  const origPush = history.pushState;
  history.pushState = function() {
    const r = origPush.apply(this, arguments);
    setTimeout(() => { updateVis(); highlightRows(true); }, 100);
    setTimeout(restartRefresh, 500);
    return r;
  };
  window.addEventListener('popstate', () => {
    setTimeout(() => { updateVis(); highlightRows(true); }, 100);
    setTimeout(restartRefresh, 500);
  });

  // ===== Auto-Refresh =====
  let cdId = null, rfId = null, rfObs = null, plId = null, nextAt = null;
  function clearCd() { if (cdId) { clearInterval(cdId); cdId = null; } }
  function clearRf() { if (rfId) { clearInterval(rfId); rfId = null; } }
  function setLbl(b, s) { if (b) { b.innerText = String(s); b.title = `Refresh in ${s}s`; } }
  function clrLbl() { const b = getRefreshButton(); if (b) { b.innerText = ''; b.title = 'Auto-Refresh aus'; } }

  function startCd(secs) {
    const b = getRefreshButton(); if (!b) return;
    clearCd(); nextAt = Date.now() + secs * 1000; setLbl(b, secs);
    cdId = setInterval(() => { const rem = Math.max(0, nextAt - Date.now()); setLbl(getRefreshButton(), Math.ceil(rem/1000)); if (rem <= 0) clearCd(); }, 1000);
  }
  function startLoop() {
    const secs = loadRefreshSecs();
    if (!loadRefreshOn()) { stopRefresh(); return; }
    clearRf(); clearCd(); startCd(secs);
    rfId = setInterval(() => {
      const b = getRefreshButton(); if (!b) { waitBtn(startLoop); clearRf(); clearCd(); return; }
      const snap = snapshotMarked();
      b.click();
      // After SF re-renders the list, re-highlight with blink
      setTimeout(() => highlightAndBlink(snap), 1500);
      startCd(secs);
    }, secs * 1000);
  }
  function stopRefresh() { clearRf(); clearCd(); clrLbl(); }
  function restartRefresh() { if (loadRefreshOn()) waitBtn(startLoop); else stopRefresh(); }

  function waitBtn(cb) {
    if (getRefreshButton()) { cb?.(); return; }
    if (rfObs) { rfObs.disconnect(); rfObs = null; }
    if (plId) { clearInterval(plId); plId = null; }
    rfObs = new MutationObserver(() => { if (getRefreshButton()) { rfObs.disconnect(); rfObs = null; if (plId) { clearInterval(plId); plId = null; } cb?.(); } });
    rfObs.observe(document.documentElement, { childList: true, subtree: true });
    plId = setInterval(() => { if (getRefreshButton()) { if (rfObs) { rfObs.disconnect(); rfObs = null; } clearInterval(plId); plId = null; cb?.(); } }, 1000);
  }

  window.addEventListener('load', () => setTimeout(restartRefresh, 800));

  // ===== Triggers =====
  const rescanSoon = debounce((full = false) => highlightRows(full), 80);

  (function kick() {
    let tries = 0;
    const k = setInterval(() => { if (!isCasePage()) { clearInterval(k); return; } if (highlightRows()) clearInterval(k); if (++tries > 120) clearInterval(k); }, 200);
  })();

  if (document.body) {
    const obs = new MutationObserver(muts => {
      for (const mu of muts) {
        if (mu.addedNodes?.length) { for (const n of mu.addedNodes) { if (n instanceof Element && (n.matches?.('tr,table') || n.querySelector?.('tr,table'))) { rescanSoon(false); return; } } }
        if (mu.type === 'characterData') { rescanSoon(false); return; }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  setInterval(() => { if (isCasePage()) highlightRows(); }, 5000);

  console.log('[SFHL] Init complete');
})();
