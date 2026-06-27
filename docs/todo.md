# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

### M5 - Windows Support

- [x] **T-118** Replace `fs.watch` with `chokidar` in engine watchers (M5)

- [ ] **T-119** Windows CI matrix + doc updates (M5)
  - **CI matrix:** find the main test workflow in `.github/workflows/` (likely `ci.yml` or `test.yml`). Add `windows-latest` to the `os` matrix: `strategy: { matrix: { os: [ubuntu-latest, windows-latest] } }` with `runs-on: ${{ matrix.os }}`. No code changes.
  - **README.md** (`Quick Setup` section, lines 37-52): `npm install -g` already works on Windows. Add a one-liner below the Homebrew block flagging it as macOS-only: "On Windows, use npm (above). Homebrew is macOS-only." Add a platform note at the top of the section: "Reqly runs on macOS, Linux, and Windows."
  - **llms.txt** (`Installation and Setup` section, lines 3-14): add the same Homebrew caveat and platform note. This is the higher-priority fix - agents read `llms.txt` when helping users install Reqly, so a Windows user's agent must not suggest `brew install`.
  - **knowledge.md**: scan the "What's built" section for Mac-implicit language ("shell", "terminal") and add Windows equivalents (PowerShell) where relevant.

### M5 - Desktop App (Electron)

- [ ] **T-120** Electron wrapper and server process (M5)
  - `packages/app/` Electron entry point
  - Main process spawns the Reqly server as a child process (`child_process.spawn('reqly', ['start'])` or direct module import)
  - `BrowserWindow` opens pointing at `http://localhost:4242`
  - On window close: hide to tray rather than quit (server keeps running)
  - On tray quit: kill child process cleanly

- [ ] **T-121** System tray icon (M5)
  - Tray icon with context menu: "Open Reqly", "Active project: \<path\>", "Stop Reqly", "Quit"
  - Double-click tray icon: open/focus the `BrowserWindow`
  - Show server status (running/stopped) as tray icon badge or tooltip

- [ ] **T-122** Auto-start on login (M5)
  - Opt-in toggle in Settings UI: "Launch Reqly at login"
  - Mac: `app.setLoginItemSettings({ openAtLogin: true })`
  - Windows: write registry key `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
  - Persist preference to `~/.reqly/config.json`

- [ ] **T-123** Auto-updater (M5)
  - Integrate `electron-updater` (from `electron-builder`)
  - On startup: check GitHub Releases for a newer version
  - Download in background, prompt user to restart and install
  - Required for users who installed via DMG/EXE rather than npm (npm users get updates via `npm update -g`)

- [ ] **T-124** Installers and code signing (M5)
  - `electron-builder` config for DMG (Mac) and NSIS installer (Windows)
  - Mac: Apple Developer account required for notarization. Without it macOS blocks the app on first run.
  - Windows: EV code signing certificate required for SmartScreen clearance. Without it Windows shows "Unknown publisher" warning on install.
  - GitHub Actions build matrix: produce signed DMG and signed NSIS in CI
  - Document signing setup in `docs/decision-log.md`

- [ ] **T-125** `reqly app` CLI command (M5)
  - `reqly app` opens the Electron window if already running, launches it if not
  - Bridges users who started via CLI into the desktop app experience
  - Works via IPC socket or checking for the Electron process by name
