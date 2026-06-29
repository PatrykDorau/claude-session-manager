# Claude Session Switcher

Mała, zawsze-na-wierzchu aplikacja na **Windows** (Electron + Vue) do zarządzania wszystkimi
sesjami **Claude Code** w jednym miejscu. Widzisz, która sesja pracuje, która czeka na Twoją
zgodę, a którą skończyłeś — i jednym kliknięciem do niej wracasz.

## Funkcje

- **Wykrywanie sesji** — skanuje `~/.claude/projects` (transkrypty `*.jsonl`) i `~/.claude/ide`
  (lock-files otwartych okien VS Code) i buduje listę wszystkich sesji.
- **Dwie sekcje (zwijane):**
  - **Watched** — sesje przypięte ręcznie ★ oraz wszystkie aktualnie otwarte w VS Code,
  - **Other** — pozostałe, z **wyszukiwarką po kodzie zadania** (np. `SOFKRS-8010`).
- **Statusy na żywo** (oparte na hookach Claude Code):
  - 🟢 **working** — Claude pracuje/myśli lub wykonuje narzędzie,
  - 🟠 **needs you** — czeka na Twoją zgodę (permission); wiersz miga, a ikona w pasku
    zadań dostaje czerwoną plakietkę i miga,
  - 🔵 **check output** — skończył turę, jeszcze nie sprawdziłeś,
  - 🟡 **idle** — otwarta, ale nic nie robi,
  - ⚪ **not active** — niedziałająca / zamknięta.
- **Kliknięcie sesji:**
  - żywa → przełącza na właściwe okno VS Code (Win32 `SetForegroundWindow`),
  - zamknięta → otwiera projekt w VS Code i wznawia `claude --resume <id>` w terminalu
    bocznym (przez skrót VS Code).
- **Akcje na wierszu:** kopiowanie ID sesji, otwarcie zadania w **Jira**
  (`https://jira.redge.com/browse/<TICKET>`), własna nazwa sesji, usunięcie sesji
  (z **podwójnym potwierdzeniem**), przypięcie ★.
- **Tryb dla daltonistów** (przełącznik ◑ w nagłówku, zapamiętywany).
- **Tray + globalny skrót** `Ctrl+Shift+Space` (pokaż/ukryj), autostart, zawsze-na-wierzchu,
  responsywny układ (działa też przy małej szerokości okna).

## Architektura

Proces główny Electrona (Node) skanuje pliki, wyprowadza `Session[]` i wysyła je do
renderera Vue przez IPC. Czysta logika (parsowanie, statusy, agregacja) jest wydzielona do
modułów bez I/O i pokryta testami.

```
src/main/
  index.ts        cykl życia, okno, tray, hotkey, IPC, watcher, plakietka uwagi
  paths.ts        ścieżki ~/.claude (projects, ide, needs-input, active, done)
  ticket.ts       extractTicket()                 [pure]
  status.ts       deriveStatus()                  [pure]
  transcript.ts   parseTranscriptHead/parseTail() [pure]
  lock.ts         parseLockFile/normalizePath()   [pure]
  aggregate.ts    buildSessions/computeOpen()     [pure]
  processes.ts    skan procesów `claude --resume` [I/O]
  scanner.ts      scanRaw() — odczyt plików       [I/O]
  launcher.ts     focusOrOpen() — VS Code/PowerShell
  store.ts        watched/nazwy → state.json
src/preload/      mostek contextBridge (window.api)
src/renderer/     App.vue + components/SessionRow.vue
```

### Jak rozpoznawany jest status

- **Żywa/otwarta sesja** — wykryta przez skan procesów `claude --resume <id>` oraz przez
  najnowszą sesję w każdym otwartym folderze VS Code (lock-file). Stan jest „lepki": sesja
  pozostaje otwarta dopóki nie zamkniesz okna VS Code.
- **needs you / working / check output** — wyznaczane przez **hooki Claude Code**, które
  zapisują znaczniki w `~/.claude/{needs-input,active,done}/<session_id>`.

## Wymagana konfiguracja hooków

Aby statusy `needs you` / `working` / `check output` działały, w `~/.claude/settings.json`
muszą być hooki wywołujące `~/.claude/needs-input-hook.js`:

- **Notification** → `needs-input set` (tylko gdy wiadomość zawiera „permission"),
- **UserPromptSubmit** → `active set`, `needs-input clear`, `done clear`,
- **Stop** → `active clear`, `needs-input clear`, `done set`,
- **PostToolUse** (dowolne narzędzie) → `needs-input clear`.

Dodatkowo w skrótach VS Code (`keybindings.json`):

```json
{ "key": "ctrl+alt+f9", "command": "workbench.action.createTerminalEditorSide" }
```

(używane przy wznawianiu zamkniętej sesji w terminalu bocznym).

## Uruchomienie

Wymagania: Node.js, npm, Windows 11, zainstalowane VS Code (`code` w PATH) oraz Claude Code.

```bash
npm install
npm run dev          # tryb deweloperski (HMR)
npm test             # testy jednostkowe (Vitest)
npm run typecheck    # sprawdzenie typów
npm run build:win    # instalator NSIS → dist/claude-session-switcher-<wersja>-setup.exe
```

Instalator tworzy skrót na pulpicie i wpis w menu Start; uruchomiona aplikacja pojawia się
też w pasku zadań (z ikoną i plakietką uwagi).

## Stack technologiczny

Electron · Vue 3 + TypeScript (electron-vite) · Vitest · chokidar · electron-builder ·
PowerShell (focus okna / skan procesów / SendKeys).
