# Salesforce Tools – Tampermonkey Userscript

> Entwickelt von Tobias Jurgan · Version 4.15.0

Erweitert Salesforce Lightning um drei Hauptfunktionen:
**Zeilen-Markierung** in Case-Listen, **Text-Snippets** mit Platzhalterauflösung und **Auto-Refresh** mit Countdown.

---

## Inhalt

- [Installation](#installation)
- [Funktionen im Überblick](#funktionen-im-überblick)
- [Markierung (Regeln)](#markierung-regeln)
- [Snippets / Textbausteine](#snippets--textbausteine)
- [Auto-Refresh](#auto-refresh)
- [Adress-Shortcuts (Google Maps)](#adress-shortcuts-google-maps)
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
| **Adress-Shortcuts** | Markierte Adresse per Klick in Google Maps suchen oder Route von der eigenen Adresse planen |
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
| `Spalte=Wert` | Nur in dieser Spalte suchen | `Status=Neu` |

Kombinationen sind möglich: `SLA + dringend | urgent | eilig`

**Spaltengenau:** `Spalte=Wert` prüft nur die Zelle, deren Spaltenüberschrift den angegebenen Namen enthält (z.B. trifft `Status=geschlossen` nicht, wenn „geschlossen" nur im Betreff steht). Kombinierbar mit allen Operatoren: `Status=Neu + dringend`, `!Status=geschlossen`.

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

### Ordner

Snippets lassen sich in Ordner gruppieren (Feld „Ordner" im Editor oder „Ordner"-Button in der Leiste). Ordner sind auf-/zuklappbar, per ▲▼ sortierbar und per Doppelklick auf den Namen umbenennbar. Leere Ordner zeigen ein ✕ zum Löschen.

---

## Auto-Refresh

- Nur aktiv auf Case-Listen- und WorkOrder-Seiten
- Countdown erscheint direkt im Salesforce-Refresh-Button
- Refresh wird **übersprungen** wenn der Benutzer gerade aktiv tippt (verhindert Datenverlust)
- Neu eingetroffene Zeilen blinken nach dem Refresh kurz auf
- Intervall frei einstellbar (min. 5 Sek.)

---

## Adress-Shortcuts (Google Maps)

Eine Adresse in Salesforce markieren (z.B. die Kundenadresse im Case) → neben der Auswahl erscheinen zwei Schaltflächen:

- **🗺️ GMaps** — sucht die markierte Adresse in Google Maps (neuer Tab)
- **🚗 Route** — plant die Route von der eigenen Adresse (Einstellungen → „Karten / Route" → „Meine Adresse") zur markierten Adresse

Erkannt werden Texte, die wie eine Adresse aussehen (PLZ, Straße mit Hausnummer oder Komma-Schreibweise). Beide Shortcuts hängen am „Lookup aktiv"-Schalter im Doku-Tab. Die Links öffnen sich ausschließlich per Klick — es findet keine automatische Anfrage an Google statt.

---

## Einstellungen

| Einstellung | Beschreibung |
|---|---|
| **Trigger-Prefix** | Zeichen das das Snippet-Dropdown auslöst (Standard: `;;`) |
| **Dein Name** | Wird für den `{name}`-Platzhalter verwendet |
| **Default language** | Welche Snippet-Sprache standardmäßig verwendet wird (DE/EN) |
| **Auto-Wrap** | Anrede und Signatur automatisch ein-/ausschalten |
| **Anrede / Signatur** | Welche Snippets für Auto-Wrap genutzt werden |
| **Meine Adresse** | Startadresse für den „Route"-Shortcut (Sektion „Karten / Route"); wird nur lokal gespeichert |

---

## Export / Import

### Export

Im Panel → Tab „Einstellungen" → Sektion „Backup":
- **↓ Alles exportieren** — Regeln, Snippets, Doku-Links, Ordner-Reihenfolgen und Einstellungen als eine JSON-Datei
- **↓ Markierungen** — nur Regeln + Ordner
- **↓ Snippets** — nur Snippets + Ordner-Reihenfolge
- **↓ Doku-Links** — nur die Doku-Link-Vorlagen

### Import

- **↑ Datei importieren** — JSON-Datei auswählen. Ein Dialog zeigt vorab, was die Datei enthält, und bietet zwei Modi:
  - **Ersetzen** — überschreibt die vorhandenen Daten der enthaltenen Bereiche
  - **Hinzufügen** — ergänzt nur Neues (Duplikate werden über Stichwort/Trigger/URL erkannt und übersprungen); eigene Einstellungen bleiben unverändert. Ideal, um Regeln oder Snippets von Kollegen zu übernehmen.
- Beide Modi sind per Toast-Button rückgängig machbar. Erkennt alle Export-Formate, auch reine Doku-Link-Dateien.

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
- Ruft für die Platzhalter-Auflösung (Anrede, Nachname, Telefon) Kontaktfelder über die Salesforce-eigene UI API ab — ausschließlich same-origin innerhalb der bestehenden Benutzersitzung und nur für Datensätze, die der Benutzer ohnehin geöffnet hat und sehen darf. Diese Daten werden nur flüchtig im Arbeitsspeicher gehalten und nicht gespeichert.
- Speichert Regeln, Snippets und Einstellungen im lokalen Browserspeicher (`localStorage`) des jeweiligen Geräts
- Stellt Textbausteine mit aufgelösten Platzhaltern zur Verfügung
- Öffnet bei den Adress-Shortcuts („GMaps"/„Route") **auf Klick** einen Google-Maps-Link in einem neuen Browser-Tab — die markierte Adresse (und beim Routen die eigene Startadresse) ist dabei Teil der aufgerufenen URL. Das geschieht nie automatisch, sondern nur durch bewussten Klick des Benutzers

**Was das Skript nicht tut:**
- Überträgt keine Daten automatisch an externe Server oder Dritte (einzige Ausnahme: der bewusste Klick auf einen Adress-Shortcut öffnet Google Maps, s.o.)
- Speichert keine Kunden- oder Kontaktdaten dauerhaft (weder lokal noch extern)
- Schreibt oder verändert keine Daten in Salesforce (rein lesender Zugriff)
- Zeichnet keine Nutzerinteraktionen auf

**Hinweis:** Die Nutzung des Skripts erfolgt im Rahmen der betrieblichen Regelungen der jeweiligen Organisation sowie der geltenden Datenschutzgesetze (DSGVO).

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| Skript lädt nicht | Browser neu laden (F5). Tampermonkey-Icon prüfen ob Skript aktiv |
| Button nicht sichtbar | Skript läuft auf allen Lightning-Seiten (`/lightning/*`); Zeilen-Markierung und Auto-Refresh sind nur auf Case-Listen aktiv |
| Snippet-Dropdown erscheint nicht | Prefix korrekt? Standard ist `;;`. In Einstellungen prüfen |
| Anrede/Name leer | Feld muss im SF-Layout sichtbar sein. Seite neu laden und erneut versuchen |
| Regeln verschwunden | localStorage gelöscht? → Export-Datei einspielen |
| Auto-Refresh funktioniert nicht | F12-Konsole prüfen auf `[SFHL]`-Meldungen. SF könnte Button-Selektoren geändert haben |

**Debug:** Browser-Konsole (F12) öffnen — alle Skript-Meldungen erscheinen mit `[SFHL]`-Prefix.

---

## Entwicklung

**Aktive URLs (`@match`):**
- `https://*.lightning.force.com/lightning/*` — Funktioniert auf jeder Salesforce-Org. Snippets laufen auch auf direkt geöffneten Case-/WorkOrder-Detailseiten (Deep-Link, F5). Zeilen-Markierung und Auto-Refresh aktivieren sich nur auf Case-Listenansichten.

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
| `sfhl_cat_order_v1` | Reihenfolge der Snippet-Ordner |
| `sfhl_doku_links` | Doku-Link-Vorlagen (Array) |
| `sfhl_doku_cat_order_v1` | Reihenfolge der Doku-Ordner |
| `sfhl_doku_enabled` | Doku-Lookup ein/aus |
| `sfhl_home_address` | Eigene Adresse für den „Route"-Shortcut |
| `sfhl_rules_enabled` | Zeilen-Markierung ein/aus |
| `sfhl_snip_enabled` | Snippets ein/aus |

**Auto-Update (Tampermonkey):**
```
@downloadURL  https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js
@updateURL    https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js
```

---

## Lizenz

MIT License — Copyright (c) 2025–2026 Tobias Jurgan

Vollständiger Lizenztext inkl. Datenschutz- und Markenrechtshinweisen: [LICENSE.txt](LICENSE.txt)

> **Hinweis:** „Salesforce" und „Salesforce Lightning" sind eingetragene Marken der Salesforce, Inc.
> Dieses Projekt steht in keiner Verbindung zu Salesforce, Inc.
