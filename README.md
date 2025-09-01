# Salesforce List Markierung + Refresh (Tampermonkey)

Markiert Salesforce Case-Listen farblich anhand frei definierbarer Regeln und bringt ein praktisches Steuerfenster mit:
- Regeln: **Wort/Stichwort · Farbe · Priorität** (höhere Prio gewinnt)
- Farbe per **✓** bestätigen (sofort in der Liste sichtbar)
- **Export/Import** der Regeln als Datei
- **Auto-Refresh** mit Countdown direkt im Salesforce-Refresh-Button
- **Ein/Aus-Toggle** und **Intervall** (Standard: 60 s)
- UI nur auf **Case-Listen** sichtbar

> **Install/Update-URL (Tampermonkey):**  
> [https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/refs/heads/main/sfautorefreshhighlights.user.js](https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/refs/heads/main/sfautorefreshhighlights.user.js)

---

## Inhalt
- [Installation](#installation)
- [Funktionen](#funktionen)
- [Steuerfenster](#steuerfenster)
- [Export / Import](#export--import)
- [Auto-Refresh](#auto-refresh)
- [Standard zurücksetzen](#standard-zurücksetzen)
- [Entwicklung](#entwicklung)
- [Versionierung & Updates](#versionierung--updates)
- [Troubleshooting](#troubleshooting)
- [Lizenz](#lizenz)

---

## Installation

1. **Tampermonkey** im Browser installieren (Chrome, Edge).
- [Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=de)
- [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
2. Entwicklermodus einschalten.
- <edge://extensions/>
- Linke Seite Entwicklermodus einschalten
- <chrome://extensions/>
- Oben Rechts Entwicklermodus einschalten
      
4. Installationslink öffnen:  
   [https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/refs/heads/main/sfautorefreshhighlights.user.js](https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/refs/heads/main/sfautorefreshhighlights.user.js)
5. Tampermonkey fragt -> **Installieren**.

**Automatische Updates:** erfolgen über denselben Link. Bei neuen Versionen einfach die Datei im Repo aktualisieren (Version hochzählen), Tampermonkey zieht das Update.

---

## Funktionen

- **Regeln definieren:** Text (Substring-Match), Farbe (Colorpicker), **Prio** (Zahl; höher gewinnt)
- **Live-Vorschau:** Farbe wird erst per **✓** übernommen (explizite Bestätigung)
- **Langes Feld „Wort/Stichwort“:** 3× Breite, Titel-Tooltip zeigt vollständigen Text
- **UI auf Case-Listen:** Schwebender Button **„Addon Steuerung“**
- **Export/Import:** JSON-Datei (Textdatei), portabel zwischen Rechnern

---

## Steuerfenster

- **Regel-Liste** mit Spalten: **Wort/Stichwort** · **Farbe** · **Prio** · **✓** · **✕**
- **Neue Regel** unten hinzufügen (sticky)
- **Auto-Refresh**-Optionen **ganz unten** (sticky):
  - **Auto-Refresh (Sek.)**: Intervall einstellen
  - **Auto-Refresh**: iOS-Style Toggle (**EIN** standardmäßig)
  - **Übernehmen**: Intervall speichern & Timer neu starten
- **Footer-Buttons**:  
  - **Auf Standard** → setzt auf die im Skript hinterlegten Basis-Regeln zurück  
  - **Export** → Regeln als Datei exportieren  
  - **Import** → Datei einlesen

---

## Export / Import

- **Export:** Klick → lädt eine `*.txt` (JSON) mit allen Regeln.
- **Import:** JSON-Datei auswählen → Regeln werden übernommen.  
  Erwartetes Format: Array von Objekten `{ term, color, priority }`.

---

## Auto-Refresh

- Countdown erscheint **im Salesforce-Refresh-Button** (Zahl + Tooltip).
- **Toggle** schaltet Refresh global ein/aus.
- **Intervall** (Sekunden) wird lokal gespeichert (min. 5 s, max. 24 h).

---

## Standard zurücksetzen

- **Auf Standard** setzt die Regeln auf die im Skript-Code hinterlegte Liste zurück (kein separater „gespeicherter Standard“).

---

## Entwicklung

- Datei: `Salesforce Highlight Rows + Refresh.user.js`
- Bitte bei Änderungen **`@version`** im Header erhöhen (SemVer).
- Test-URL: `https://endress.lightning.force.com/lightning/o/Case/*`

### Header (wichtig für Auto-Update)
```js
// @downloadURL  https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/Salesforce%20Highlight%20Rows%20%2B%20Refresh.user.js
// @updateURL    https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/Salesforce%20Highlight%20Rows%20%2B%20Refresh.user.js
