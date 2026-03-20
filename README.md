# Salesforce List Markierung + Refresh (Tampermonkey)

Markiert Salesforce Case-Listen farblich anhand frei definierbarer Regeln. Modernes Steuerungspanel mit Drag & Drop, Farbpalette, Suchfeld und Auto-Refresh.

**Highlights:**
- **Drag & Drop Priorität** — Regeln per Ziehen sortieren, oben gewinnt
- **10 Pastell-Presets** — Optimiert für Lesbarkeit, ein Klick genügt
- **Quick-Toggle** — Regeln ein-/ausschalten ohne zu löschen
- **Live-Vorschau** — Beim Anlegen sehen wie viele Zeilen matchen
- **Suchfeld** — Regeln im Panel filtern
- **Blink-Effekt** — Neue Treffer nach Auto-Refresh blinken 3×
- **Resize** — Panel-Breite per Drag anpassbar (320–700 px)
- **Tastenkürzel** — `Alt+R` öffnet/schließt das Panel
- **Export/Import** — Regeln als JSON-Datei portabel zwischen Rechnern
- **Auto-Refresh** — Countdown im SF-Refresh-Button, konfigurierbares Intervall

> **Install/Update-URL (Tampermonkey):**
> [https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js](https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js)

---

## Inhalt
- [Installation](#installation)
- [Funktionen](#funktionen)
- [Steuerfenster](#steuerfenster)
- [Farbpalette](#farbpalette)
- [Drag & Drop Priorität](#drag--drop-priorität)
- [Export / Import](#export--import)
- [Auto-Refresh](#auto-refresh)
- [Tastenkürzel](#tastenkürzel)
- [Update von älteren Versionen](#update-von-älteren-versionen)
- [Entwicklung](#entwicklung)
- [Troubleshooting](#troubleshooting)
- [Lizenz](#lizenz)

---

## Installation

1. **Tampermonkey** im Browser installieren (Chrome, Edge).
   - [Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=de)
   - [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
2. **Entwicklermodus einschalten:**
   - **Edge:** `edge://extensions/` → linke Seite „Entwicklermodus" einschalten
   - **Chrome:** `chrome://extensions/` → oben rechts „Entwicklermodus" einschalten → bei Tampermonkey auf „Details" klicken → „Nutzerscripts zulassen" aktivieren
3. **Installationslink öffnen:**
   [https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js](https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js)
4. Tampermonkey fragt → **Installieren** klicken.
5. Falls das Skript nicht sofort lädt: Browser einmal aktualisieren (F5).

**Automatische Updates:** Tampermonkey prüft regelmäßig auf neue Versionen und installiert Updates automatisch.

---

## Funktionen

| Feature | Beschreibung |
|---|---|
| **Regeln definieren** | Stichwort eingeben → Farbe wählen → Zeilen werden automatisch markiert |
| **Drag & Drop** | Regeln per Ziehen sortieren. Position = Priorität (oben gewinnt) |
| **Quick-Toggle** | Regeln mit dem Auge-Symbol ein-/ausschalten. Deaktivierte Regeln bleiben gespeichert |
| **Farbpalette** | 10 Pastell-Presets + eigene Farbe per Browser-Colorpicker |
| **Live-Vorschau** | Beim Anlegen zeigt ein Badge wie viele SF-Zeilen matchen |
| **Suchfeld** | Regeln im Panel live filtern |
| **Blink-Effekt** | Nach Auto-Refresh blinken neue Treffer 3× auf |
| **Resize** | Panel-Breite per Drag am linken Rand anpassen (320–700 px, wird gespeichert) |
| **Export/Import** | JSON-Datei, portabel zwischen Rechnern und Kollegen |
| **Auto-Refresh** | Konfigurierbarer Countdown im SF-Refresh-Button |

---

## Steuerfenster

Das Panel öffnet sich als Sidebar von rechts. Zugang über:
- **Pill-Button** unten rechts (zeigt Anzahl markierter Zeilen)
- **Alt+R** Tastenkürzel
- **Escape** oder Klick auf den Hintergrund zum Schließen

### Aufbau
- **Suchfeld** — Regeln live filtern
- **Regelliste** — Jede Zeile: Grip-Handle · Stichwort · Farbfeld · An/Aus · Löschen
- **„+ Neue Regel"** — Klappt Formular auf mit Live-Trefferanzeige
- **Auto-Refresh** — Aufklappbar, mit Intervall-Eingabe und Toggle
- **⋯ Menü** — Export, Import, Auf Standard zurücksetzen

---

## Farbpalette

Klick auf ein Farbfeld öffnet die Palette:

| Farbe | Hex | RGB |
|---|---|---|
| Grün | `#E6FFE6` | 230, 255, 230 |
| Rot | `#FFCCCC` | 255, 204, 204 |
| Gelb | `#FFFFCC` | 255, 255, 204 |
| Orange | `#FFE5CC` | 255, 229, 204 |
| Blau | `#E6F0FF` | 230, 240, 255 |
| Lila | `#F0E6FF` | 240, 230, 255 |
| Türkis | `#E6FFFA` | 230, 255, 250 |
| Pink | `#FFE6F0` | 255, 230, 240 |
| Pfirsich | `#FFF5E6` | 255, 245, 230 |
| Grau | `#F0F0F0` | 240, 240, 240 |

Alle Farben sind bewusst hell (RGB 200–255) damit schwarzer Text darauf immer gut lesbar bleibt.

**„Eigene Farbe…"** öffnet den nativen Browser-Colorpicker für volle Freiheit.

---

## Drag & Drop Priorität

Regeln werden per Drag & Drop sortiert. **Die erste Regel in der Liste gewinnt.** Wenn eine Zeile zu mehreren Regeln passt, wird die Farbe der höchsten (= obersten) Regel angewendet.

- Greifen: Grip-Handle (⠿) links an jeder Zeile
- Ziehen: Blaue Linie zeigt die Einfügeposition
- Loslassen: Reihenfolge wird sofort gespeichert

---

## Export / Import

- **Export:** ⋯ Menü → Export → lädt eine `.txt`-Datei (JSON) mit allen Regeln
- **Import:** ⋯ Menü → Import → Datei auswählen → Regeln werden übernommen

**Format (v3.4.0+):**
```json
[
  { "id": "k1abc2def", "term": "24/7 Support", "color": "#ffcccc", "enabled": true },
  { "id": "k3ghi4jkl", "term": "Complaint",    "color": "#ffd8b1", "enabled": false }
]
```

Älteres Format (mit `priority`-Feld) wird beim Import automatisch migriert.

---

## Auto-Refresh

- **Countdown** erscheint direkt im Salesforce-Refresh-Button
- **Toggle** schaltet Refresh global ein/aus
- **Intervall** frei einstellbar (min. 5 Sek., max. 24 Std.)
- **Blink-Effekt:** Nach jedem Auto-Refresh blinken **neue** Treffer 3× auf — so siehst du sofort was sich geändert hat

---

## Tastenkürzel

| Kürzel | Aktion |
|---|---|
| `Alt+R` | Panel öffnen/schließen |
| `Escape` | Panel schließen |
| `Enter` | Neue Regel bestätigen (im Eingabefeld) |

---

## Update von älteren Versionen

Beim Update von einer beliebigen älteren Version (v1.x, v2.x, v3.0–v3.3) werden bestehende Regeln **automatisch migriert:**

- Alte Regeln (mit `priority`-Feld) werden nach Priorität sortiert ins neue Format konvertiert
- Alle Regeln starten als „An" (enabled)
- Auto-Refresh-Einstellungen bleiben erhalten
- Der Migrationsprozess läuft einmalig beim ersten Start

In der Browser-Konsole (F12) erscheint: `[SFHL] Migrated v3 config -> X rules`

---

## Entwicklung

- **Match-URL:** `https://endress.lightning.force.com/lightning/o/Case/*`
- **Storage Keys:**
  - `sfhl_config_v4` — Regeln (Array, Reihenfolge = Priorität)
  - `sfhl_refresh_secs_v1` — Refresh-Intervall in Sekunden
  - `sfhl_refresh_enabled` — Refresh ein/aus (`"1"` / `"0"`)
  - `sfhl_panel_width` — Panel-Breite in Pixeln

### Header (wichtig für Auto-Update)
```js
// @downloadURL  https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js
// @updateURL    https://raw.githubusercontent.com/tJ-ek0/Tampermonkey-Salesforce-tools/main/sfautorefreshhighlights.user.js
```

### Selektoren
Das Skript nutzt eine Multi-Strategie-Kaskade für die Erkennung von Tabellen-Zeilen und dem Refresh-Button. CSS-Selektoren werden bevorzugt, XPath nur als Fallback. In der Konsole wird geloggt welche Strategie aktiv ist:
```
[SFHL] Rows: "css:lst-common" (24)
[SFHL] Refresh: "css:title"
```

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| Skript lädt nicht | Browser komplett neu laden (F5). Tampermonkey-Icon prüfen ob das Skript aktiv ist |
| Button nicht sichtbar | Nur auf Case-Listen-Seiten aktiv. URL muss mit `endress.lightning.force.com/lightning/o/Case/` beginnen |
| Regeln verschwunden | Browserdaten / localStorage gelöscht? → Import-Funktion nutzen |
| Auto-Refresh funktioniert nicht | Konsole (F12) prüfen ob `[SFHL] Refresh: "..."` erscheint. Falls nicht, hat SF den Button geändert |
| Farbpalette geht nicht auf | Konsole auf Fehler prüfen. Ggf. Tampermonkey-Skript neu installieren |

**Debug-Modus:** Öffne die Browser-Konsole (F12) — das Skript loggt alle wichtigen Schritte mit `[SFHL]` Prefix.

---

## Lizenz

MIT License — siehe [LICENSE.txt](LICENSE.txt)
