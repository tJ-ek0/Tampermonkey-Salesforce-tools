# Salesforce Tools – Tampermonkey Userscript

> **Internes Werkzeug** für autorisierte Mitarbeiter von Endress+Hauser (Deutschland) GmbH+Co. KG.
> Entwickelt von Tobias Jurgan · Technischer Support · Version 4.0.0

Erweitert Salesforce Lightning um drei Hauptfunktionen:
**Zeilen-Markierung** in Case-Listen, **Text-Snippets** mit Platzhalterauflösung und **Auto-Refresh** mit Countdown.

---

## Inhalt

- [Installation](#installation)
- [Funktionen im Überblick](#funktionen-im-überblick)
- [Markierung (Regeln)](#markierung-regeln)
- [Snippets / Textbausteine](#snippets--textbausteine)
- [Auto-Refresh](#auto-refresh)
- [Einstellungen](#einstellungen)
- [Export / Import](#export--import)
- [Tastenkürzel](#tastenkürzel)
- [Datenschutz](#datenschutz)
- [Troubleshooting](#troubleshooting)
- [Entwicklung](#entwicklung)
- [Lizenz](#lizenz)

---

## Installation

1. **Tampermonkey** im Browser installieren:
   - [Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=de)
   - [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

2. **Entwicklermodus aktivieren:**
   - **Chrome:** `chrome://extensions/` → „Entwicklermodus" → bei Tampermonkey „Details" → „Nutzerscripts zulassen"
   - **Edge:** `edge://extensions/` → „Entwicklermodus" einschalten

3. **Installationslink öffnen:**
   [sfautorefreshhighlights.user.js](https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js)

4. Tampermonkey fragt zur Bestätigung → **Installieren** klicken.

**Automatische Updates:** Tampermonkey prüft regelmäßig auf neue Versionen und installiert Updates selbstständig.

---

## Funktionen im Überblick

| Funktion | Beschreibung |
|---|---|
| **Zeilen-Markierung** | Case-Listenzeilen farblich hervorheben nach frei definierbaren Regeln |
| **Snippets** | Textbausteine per Kürzel in beliebige SF-Textfelder einfügen |
| **Platzhalterauflösung** | `{name}`, `{datum}`, `{!Case.CaseNumber}` etc. werden automatisch aus der Seite befüllt |
| **Auto-Refresh** | Automatischer Refresh der Case-Liste mit Countdown im SF-Button |
| **Auto-Wrap** | Anrede und Signatur automatisch um jeden Textbaustein legen |
| **Rich-Text-Editor** | Fett, Kursiv, Links, Listen direkt im Snippet-Editor |
| **Import/Export** | Regeln und Snippets als JSON-Datei sichern und teilen |
| **Sprache** | Deutsch/Englisch pro Snippet, Sprachumschaltung beim Einfügen |

---

## Markierung (Regeln)

Regeln werden in der angezeigten Reihenfolge geprüft. **Die erste passende Regel gewinnt.**

### Stichwort-Syntax

| Operator | Bedeutung | Beispiel |
|---|---|---|
| `Begriff` | Einfache Textsuche (Groß-/Kleinschreibung egal) | `dringend` |
| `A + B` | UND: beide müssen vorkommen | `SLA + dringend` |
| `A \| B` | ODER: mindestens einer | `urgent \| eilig` |
| `!Begriff` | NICHT: darf nicht vorkommen | `SLA + !closed` |
| `/regex/i` | Regulärer Ausdruck | `/Fehler\s*\d+/i` |

Kombinationen sind möglich: `SLA + dringend | urgent | eilig`

### Ordner

Regeln lassen sich in Ordnern gruppieren. Klick auf den „Ordner"-Button im Panel erstellt einen neuen Ordner. Regeln per Drag & Drop in Ordner ziehen.

---

## Snippets / Textbausteine

Tippt man den konfigurierten Prefix (Standard: `;;`) in ein beliebiges Textfeld, öffnet sich ein Dropdown mit passenden Snippets.

### Einfügen

```
;;anrede      → öffnet Dropdown, filtert nach "anrede"
;;            → zeigt alle Snippets
;;en gruss    → zeigt nur EN-Variante
Tab / Enter   → ausgewähltes Snippet einfügen
↑ ↓           → im Dropdown navigieren
Esc           → Dropdown schließen
```

### Platzhalter

Platzhalter werden beim Einfügen automatisch aus der aktuellen SF-Seite befüllt:

| Platzhalter | Wert |
|---|---|
| `{name}` | Dein Name (aus Einstellungen) |
| `{datum}` | Heutiges Datum (TT.MM.JJJJ) |
| `{uhrzeit}` | Aktuelle Uhrzeit |
| `{case}` | Vorgangsnummer |
| `{betreff}` | Betreff des Vorgangs |
| `{anrede}` | Anrede des Kontakts |
| `{nachname}` | Nachname des Kontakts |
| `{kontakt}` | Voller Name des Kontakts |
| `{telefon}` | Telefonnummer |
| `{firma}` | Firmenname (Account) |
| `{seriennummer}` | Seriennummer aus dem Case |
| `{|}` | Cursor-Position nach dem Einfügen |
| `{eingabe:Beschriftung}` | Fragt beim Einfügen interaktiv nach dem Wert |
| `{!Case.CaseNumber}` | SF-Merge-Feld: Vorgangsnummer |
| `{!Contact.Salutation}` | SF-Merge-Feld: Anrede des Kontakts |
| `{!Contact.LastName}` | SF-Merge-Feld: Nachname des Kontakts |
| `{!Account.FTXTAccountName__c}` | SF-Merge-Feld: Account-Name |

### Auto-Wrap

Wenn in den Einstellungen aktiviert, wird beim Einfügen eines Snippets automatisch die konfigurierte Anrede davor und die Signatur danach eingefügt. Gilt nicht, wenn das Snippet selbst die Anrede oder Signatur ist.

### Snippet teilen

Im Editor: „Teilen ↗" kopiert einen Import-Link in die Zwischenablage. Kollegen können den Link im Browser öffnen — das Skript importiert das Snippet automatisch nach Bestätigung.

---

## Auto-Refresh

- Nur aktiv auf Case-Listen- und WorkOrder-Seiten
- Countdown erscheint direkt im Salesforce-Refresh-Button
- Refresh wird **übersprungen** wenn der Benutzer gerade aktiv tippt (verhindert Datenverlust)
- Neu eingetroffene Zeilen blinken nach dem Refresh kurz auf
- Intervall frei einstellbar (min. 5 Sek.)

---

## Einstellungen

| Einstellung | Beschreibung |
|---|---|
| **Trigger-Prefix** | Zeichen das das Snippet-Dropdown auslöst (Standard: `;;`) |
| **Dein Name** | Wird für den `{name}`-Platzhalter verwendet |
| **Default language** | Welche Snippet-Sprache standardmäßig verwendet wird (DE/EN) |
| **Auto-Wrap** | Anrede und Signatur automatisch ein-/ausschalten |
| **Anrede / Signatur** | Welche Snippets für Auto-Wrap genutzt werden |

---

## Export / Import

### Export

Im Panel → Tab „Einstellungen":
- **↓ Alles exportieren** — Regeln + Snippets als eine JSON-Datei
- **↓ Markierungen** — nur Regeln
- **↓ Snippets** — nur Snippets

### Import

- **↑ Datei importieren** — JSON-Datei auswählen (ersetzt bestehende Daten)

### Format (v4.0.0)

```json
{
  "rules": [
    { "id": "k1abc", "term": "24/7 + SLA", "color": "#ffcccc", "enabled": true, "folder": null }
  ],
  "snippets": [
    { "id": "k2def", "trigger": "anrede", "label": "Anrede DE", "body": "Guten Tag ...", "bodyEn": "Dear ...", "category": "Standard", "richText": true }
  ],
  "folders": [],
  "prefix": ";;",
  "username": "Max Mustermann"
}
```

---

## Tastenkürzel

| Kürzel | Aktion |
|---|---|
| `Alt+R` | Panel öffnen/schließen |
| `Esc` | Panel oder Snippet-Dropdown schließen |
| `;;` | Snippet-Dropdown öffnen (in Textfeldern) |
| `↑ ↓` | Im Snippet-Dropdown navigieren |
| `Enter` / `Tab` | Snippet einfügen |

---

## Datenschutz

Das Skript verarbeitet Daten ausschließlich lokal im Browser des angemeldeten Benutzers.

**Was das Skript tut:**
- Liest Feldwerte aus dem Salesforce-DOM, die dem Benutzer bereits angezeigt werden (Vorgangsnummer, Kontaktname, Anrede, Telefon u. a.)
- Speichert Regeln, Snippets und Einstellungen im lokalen Browserspeicher (`localStorage`) des jeweiligen Geräts
- Stellt Textbausteine mit aufgelösten Platzhaltern zur Verfügung

**Was das Skript nicht tut:**
- Überträgt keine Daten an externe Server oder Dritte
- Speichert keine Daten außerhalb des lokalen Browsers
- Greift nicht auf Salesforce-APIs oder Backend-Dienste zu
- Zeichnet keine Nutzerinteraktionen auf

**Hinweis:** Die Nutzung des Skripts erfolgt im Rahmen der bestehenden CRM-Nutzung und der dafür geltenden betrieblichen Regelungen. Es gelten die Datenschutzrichtlinien der Endress+Hauser (Deutschland) GmbH+Co. KG sowie die Vorgaben der DSGVO.

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| Skript lädt nicht | Browser neu laden (F5). Tampermonkey-Icon prüfen ob Skript aktiv |
| Button nicht sichtbar | Skript ist nur auf Case-Listen und WorkOrder-Seiten aktiv |
| Snippet-Dropdown erscheint nicht | Prefix korrekt? Standard ist `;;`. In Einstellungen prüfen |
| Anrede/Name leer | Feld muss im SF-Layout sichtbar sein. Seite neu laden und erneut versuchen |
| Regeln verschwunden | localStorage gelöscht? → Export-Datei einspielen |
| Auto-Refresh funktioniert nicht | F12-Konsole prüfen auf `[SFHL]`-Meldungen. SF könnte Button-Selektoren geändert haben |

**Debug:** Browser-Konsole (F12) öffnen — alle Skript-Meldungen erscheinen mit `[SFHL]`-Prefix.

---

## Entwicklung

**Aktive URLs (`@match`):**
- `https://endress.lightning.force.com/lightning/o/Case/list*`
- `https://endress.lightning.force.com/lightning/r/WorkOrder*`

**localStorage-Keys:**

| Key | Inhalt |
|---|---|
| `sfhl_config_v4` | Regeln (Array, Reihenfolge = Priorität) |
| `sfhl_snippets_v1` | Snippets (Array) |
| `sfhl_rule_folders_v1` | Ordner (Array) |
| `sfhl_refresh_secs_v1` | Refresh-Intervall in Sekunden |
| `sfhl_refresh_enabled` | Refresh ein/aus |
| `sfhl_panel_width` | Panel-Breite in Pixeln |
| `sfhl_snip_prefix` | Snippet-Trigger-Prefix |
| `sfhl_snip_username` | Benutzername für `{name}` |
| `sfhl_default_language` | Standard-Snippetsprache (`de`/`en`) |
| `sfhl_wrap_enabled` | Auto-Wrap ein/aus |
| `sfhl_recent_v1` | Zuletzt verwendete Snippet-IDs |

**Auto-Update (Tampermonkey):**
```
@downloadURL  https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js
@updateURL    https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js
```

---

## Lizenz

MIT License — Copyright (c) 2025–2026 Tobias Jurgan, Endress+Hauser (Deutschland) GmbH+Co. KG

Vollständiger Lizenztext inkl. Datenschutz- und Markenrechtshinweisen: [LICENSE.txt](LICENSE.txt)

> **Hinweis:** „Salesforce" und „Salesforce Lightning" sind eingetragene Marken der Salesforce, Inc.
> Dieses Projekt steht in keiner Verbindung zu Salesforce, Inc.
