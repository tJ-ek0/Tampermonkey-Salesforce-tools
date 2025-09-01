# 📘 Salesforce Tampermonkey Scripts

## Übersicht
Diese Sammlung enthält zwei benutzerdefinierte Tampermonkey-Skripte zur Verbesserung der Benutzererfahrung in Salesforce Lightning, speziell auf der **Case-Listenansicht** (`/lightning/o/Case/*`). Beide Skripte wurden von **Tobias Jurgan** entwickelt und sind auf die Umgebung von **Endress+Hauser Deutschland** zugeschnitten.

---

## 📄 1. Salesforce Auto Refresh with Countdown

### 🔍 Beschreibung
Dieses Skript führt automatisch einen Seiten-Refresh in der Case-Listenansicht durch – mit einem sichtbaren Countdown direkt im Refresh-Button.

### 🧩 Funktionen
- Automatischer Refresh alle 60 Sekunden (konfigurierbar).
- Countdown-Anzeige im Button inkl. Tooltip.
- Robuste DOM-Erkennung: erkennt, wenn der Button neu gerendert wird.
- Verhindert doppelte Timer durch sauberes Management.
- Unterstützt SPA-Navigation (z. B. durch `popstate`-Events in Salesforce Lightning).

### 🔧 Technische Details
- XPath-basierte Button-Erkennung.
- Fallback-Mechanismen via `MutationObserver` und Polling.
- Kein `@grant` notwendig – läuft im Kontext der Seite.

---

## 📄 2. Salesforce Highlight Rows

### 🔍 Beschreibung
Dieses Skript hebt Zeilen in der Case-Listenansicht farblich hervor – basierend auf benutzerdefinierten Stichwörtern, Farben und Prioritäten. Es bietet eine vollständige UI zur Konfiguration.

### 🧩 Funktionen
- Zeilenhervorhebung basierend auf Textinhalt (z. B. Namen, Stichwörter).
- Prioritätssystem: Höhere Priorität überschreibt niedrigere.
- UI-Panel mit:
  - Hinzufügen neuer Regeln (Text, Farbe, Prio)
  - Speichern als Standard
  - Export/Import der Konfiguration (JSON)
  - Sofortige Anwendung durch Klick auf ✓
- Lokale Speicherung der Konfiguration im `localStorage`.
- Sichtbar nur auf der Case-Listenansicht.
- Reagiert auf DOM-Änderungen und SPA-Navigation.

### 🎨 Beispielhafte Standardregeln
| Begriff            | Farbe     | Prio |
|--------------------|-----------|------|
| User 1             | #ccffcc   | 30   |
| User 2             | #ffffcc   | 20   |
| Complaint - Prio   | #ffcccc   | 10   |

---

## 🛠 Installation
1. **Tampermonkey installieren** (falls noch nicht vorhanden): [https://www.tampermonkey.net/](https://www.tampermonkey.net/)
2. Skripte importieren:
   - Öffne Tampermonkey Dashboard → „+“ → Code einfügen → Speichern
   - Alternativ: `.user.js` Datei erstellen und per Drag & Drop in Tampermonkey ziehen

---

## 📌 Hinweise
- Beide Skripte sind speziell für die URL-Struktur `https://endress.lightning.force.com/lightning/o/Case/*` geschrieben.
- Anpassungen für andere Salesforce-Objekte oder Layouts sind möglich, erfordern aber ggf. Änderungen an den XPath-Selektoren.
