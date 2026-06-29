# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

### JUnit XML reporter + README refresh

- [x] **T-135** JUnit XML reporter for `reqly run` and `reqly run-flow`
  - Add `--format junit` to the CLI alongside existing `--format console` (default) and `--format json`.
  - Output a standard JUnit XML `<testsuite>` / `<testcase>` document to stdout when `--format junit` is passed. Shape:
    ```xml
    <testsuite name="collection-name" tests="N" failures="F" time="T">
      <testcase name="request-name :: assertion-label" classname="collection-name" time="T">
        <!-- on failure only: -->
        <failure message="expected 200, got 404">full diff or description</failure>
      </testcase>
    </testsuite>
    ```
  - Each assertion on a request = one `<testcase>`. A request with no assertions = one `<testcase>` that passes if status < 500.
  - `time` attribute is seconds (float, 3dp).
  - Write output to stdout so CI can redirect: `reqly run my-collection --format junit > results.xml`
  - Update `src/server/run-command.ts` and `src/server/run-flow-command.ts` to branch on `parsed.flags.format`.
  - Extract a `src/engine/reporters/junit.ts` module with a pure function `toJUnit(results): string` - no side effects, easy to test.
  - TDD: `junit.test.ts` - at minimum: all-pass suite, suite with one failure, suite with multiple assertions per request, request with no assertions (implicit pass). Run against the existing result shape from `CollectionRunner`.
  - Update the scaffolded GitHub Actions export (`github-actions-export.ts`) to pass `--format junit` and add an `actions/upload-artifact` step for `results.xml` in the generated workflow.
  - Update `docs/llms.txt` and README CLI reference section to document `--format junit`.

- [x] **T-136** README refresh - hero GIF, quick start, works-with logos, star chart
  - **GIF**: Record a ~30s looping screen capture showing the core MCP workflow: agent types "create a collection for my Express API" -> Reqly MCP tool fires -> collection appears in the UI sidebar -> agent runs it -> response shown. Export as an optimised GIF or MP4 (use `ffmpeg` or Kap). Embed near the top of README, below the one-line description.
    - If recording tooling isn't available, add a placeholder `docs/assets/demo.gif` path and an HTML comment `<!-- TODO: record demo GIF -->` so it's clear where it goes.
  - **Badges row** (top of README, one line): npm version badge, license badge, CI status badge (GitHub Actions). Use shields.io.
  - **"Works with" logos**: add a row of small icons/text for Cursor, Claude Code, Gemini CLI, VS Code (Claude extension). Can use simple text links or SVG badges - no need for custom graphics.
  - **Install block**: make sure `npm install -g reqly` is visible without scrolling, in a fenced code block, immediately after the one-sentence description.
  - **Quick start section**: five steps max, copy-pasteable. `npm i -g reqly` -> `cd my-project` -> `reqly init` -> `reqly setup cursor` -> "Ask Cursor: list my Reqly collections". Should take under 2 minutes.
  - **Star history**: add a `[![Star History Chart](https://api.star-history.com/svg?repos=RutvikPansare/Reqly&type=Date)](https://star-history.com/#RutvikPansare/Reqly)` block near the bottom. Renders as a live chart on GitHub.
  - **Sync**: after updating README.md, apply the same install/quick-start/CLI changes to `docs/llms.txt` so agents reading that file stay current.

### Right-click context menus - duplicate actions

- [ ] **T-141** Duplicate collection and environment - backend + UI gaps
  - Request duplicate is already fully implemented (backend endpoint + `handleDuplicateReq` in `CollectionsPanel.tsx` + `duplicateRequest` in `api.ts`). Collection and environment duplicate are missing. Environments have no context menu at all.

  **What's already done (do not reimplement):**
  - Request duplicate: `duplicateRequest` in `api.ts`, `handleDuplicateReq` in `CollectionsPanel.tsx`, wired into the existing request context menu.
  - Collection context menu: already exists with rename, delete, settings, export. Just missing "Duplicate".
  - Request context menu: already exists with rename, duplicate, delete.

  **What needs to be built:**

  1. `POST /api/collections/:name/duplicate` (backend, TDD required)
     - Deep-copies the collection directory to `"Copy of <name>"` (increment suffix if collision)
     - Returns `{ name: "Copy of <name>" }`
     - TDD: `duplicate-collection.test.ts` - success, name collision increments, source not found 404

  2. `duplicateCollection(name)` in `src/ui/src/api.ts` - calls the new endpoint

  3. Wire "Duplicate" into the existing collection context menu in `CollectionsPanel.tsx` - same pattern as the existing export/rename/delete items already there

  4. `POST /api/environments/duplicate` (backend, TDD required)
     - Body: `{ name: string }`
     - Creates `"Copy of <name>"` environment with the same variables (increment if collision)
     - Returns `{ name: "Copy of <name>" }`
     - TDD: `duplicate-environment.test.ts` - success, name collision, source not found 404

  5. Right-click context menu for environments in `EnvironmentsPanel.tsx` - currently has no context menu at all, only a plain delete button. Add `onContextMenu` to each environment row, render a floating menu with: Duplicate (wired), Rename (wired - rename already works via `updateEnvironment`), Delete (move existing delete button logic here). Dismiss on click-outside or Escape.

- [ ] **T-142** Move request between collections - drag and drop + right-click "Move to"
  - Two ways to trigger the same underlying move operation: drag-and-drop in the sidebar and a "Move to" option in the existing request context menu.

  **Backend (TDD required):**

  - `POST /api/collections/:collection/requests/:request/move`
    - Body: `{ targetCollection: string }`
    - Reads the request YAML from the source collection, writes it to the target collection directory, deletes the source file
    - If a request with the same name already exists in the target, append ` (1)`, ` (2)` etc. to avoid collision
    - Returns `{ name: string, collection: string }` - the final name and target collection
    - TDD: `move-request.test.ts` - success path, name collision resolution, source not found 404, target collection not found 404

  - Add `moveRequest(collection, request, targetCollection)` to `src/ui/src/api.ts`

  **UI - drag and drop:**

  - Add `draggable={true}` and `onDragStart` to each request row in `CollectionsPanel.tsx`. Store `{ col, req }` in the drag event via `dataTransfer.setData('application/json', ...)`.
  - Add `onDragOver` (call `e.preventDefault()`) and `onDrop` to each collection header row. On drop: read the source `{ col, req }` from `dataTransfer`, call `POST /api/collections/:col/requests/:req/move` with `{ targetCollection: droppedOnCol }`, then refresh.
  - Visual feedback during drag: highlight the collection header the user is hovering over with a 1px blue border or subtle background tint (`bg-blue-900/30`). Remove highlight on `onDragLeave` and `onDrop`.
  - Do not allow dropping onto the same collection the request came from - no-op and no highlight if `sourcecol === targetCol`.

  **UI - "Move to" in context menu:**

  - Add "Move to..." as a new item in the existing request context menu in `CollectionsPanel.tsx`, below "Duplicate" and above "Delete".
  - On click: open a small inline modal (reuse the existing `Modal` component) titled "Move to collection".
  - Modal contents: a list of all collections except the current one, rendered as clickable rows. Single-click selects, a "Move" confirm button fires the API call. "Cancel" closes without action.
  - After successful move: close modal, refresh collections list, open the request in its new collection automatically (same behaviour as clicking it in the sidebar).

### M5 - Windows Support

### Project switcher MCP tools + UI

### Agent onboarding nudge (empty state)

### M5 - Desktop App (Electron)

**Architecture principle (mandatory for all Electron tasks):**
The existing `reqly start` server is never modified. Electron is a launcher and a window - nothing more. The server runs on `localhost:4242` exactly as it does today. CLI users (`reqly start`, `reqly run`, MCP connections) are completely unaffected whether or not the Electron app is installed. The `BrowserWindow` just opens `http://localhost:4242` in a chromium frame. No embedded server, no IPC for API calls, no Electron-specific code paths in `src/server/` or `src/engine/`.

- [ ] **T-120** Electron wrapper and server process
  - **Package layout:** create `packages/desktop/` as a new workspace package. Keep it entirely separate from `src/`. The root `package.json` already has `"workspaces": ["packages/*"]` so it will be picked up automatically.
  - **Entry point:** `packages/desktop/src/main.ts` - the Electron main process. Compile with `tsc` or `esbuild` into `packages/desktop/dist/main.js`.
  - **Server spawn:** on `app.whenReady()`, check if a Reqly server is already running by doing a quick `GET http://localhost:4242/api/ping` (or reading `~/.reqly/running.json` lock file). If already running (user started via CLI), skip spawn - just open the window. If not running, spawn: `child_process.spawn('reqly', ['start'], { stdio: 'pipe', detached: false })`. Store the child reference. Pipe child stdout/stderr to `console.log` for debugging in Electron DevTools.
  - **BrowserWindow:** `new BrowserWindow({ width: 1280, height: 800, webPreferences: { nodeIntegration: false, contextIsolation: true } })` then `win.loadURL('http://localhost:4242')`. No preload script needed - the UI is a plain web app served by Express, not an Electron-bundled app. Poll `http://localhost:4242` with a 200ms interval for up to 10 seconds before loading - show a plain "Starting Reqly..." html string in the window while waiting.
  - **Window close behaviour:** intercept `win.on('close', e => { e.preventDefault(); win.hide(); })`. The server keeps running. Window is just hidden, not destroyed.
  - **Quit behaviour:** `app.on('before-quit')` - if Electron spawned the server child (not a pre-existing instance), kill it: `child.kill('SIGTERM')`, wait up to 3 seconds, then `child.kill('SIGKILL')` if still alive. If the server was pre-existing (user started via CLI), do NOT kill it on quit.
  - **Dev script:** `packages/desktop/package.json` scripts: `"dev": "electron ."` (points at compiled main.js), `"build": "tsc && electron-builder"`.
  - **No changes to `src/` at all.** Verify by running `npm test` from the root - all existing tests must still pass.

- [ ] **T-121** System tray icon
  - **Tray setup:** in `main.ts`, after `app.whenReady()`, create `new Tray(iconPath)`. Use a 16x16 (Mac) / 32x32 (Windows) PNG. Store icon assets at `packages/desktop/assets/tray-icon.png` and `tray-icon@2x.png`.
  - **Context menu items:**
    - "Open Reqly" - calls `win.show()` and `win.focus()`
    - "Active project: <path>" - reads `~/.reqly/running.json` lock file to get the current project dir. Truncate to last 2 path segments if too long. Greyed out (not clickable), just informational.
    - Separator
    - "Launch at login" - checkbox item, toggles `app.setLoginItemSettings`. Reads current state from `app.getLoginItemSettings().openAtLogin` to set initial checked state.
    - Separator
    - "Quit" - triggers the quit flow from T-120 (kill child if spawned, then `app.quit()`)
  - **Double-click:** `tray.on('double-click', () => { win.show(); win.focus(); })` - opens/focuses the window.
  - **Dynamic project label:** re-build the context menu every time `tray.on('click')` fires so the active project label is always fresh (user may have switched projects since last click).
  - **`app.dock.hide()`** on Mac - Reqly should not appear in the Dock when the window is hidden. Call this after spawning. Call `app.dock.show()` when `win.show()` is called.

- [ ] **T-122** Auto-start on login
  - **Settings UI toggle:** add a "Launch at login" toggle to the existing Settings panel in `src/ui/src/`. It calls a new `GET /api/app/login-item` endpoint (returns `{ enabled: boolean }`) and `POST /api/app/login-item` (`{ enabled: boolean }`).
  - **Express endpoints:** add to `src/server/express.ts`. On Mac/Windows inside Electron: forward to Electron's `app.setLoginItemSettings` / `app.getLoginItemSettings` via a flag file at `~/.reqly/config.json` key `launchAtLogin`. On non-Electron (CLI-only users), return `{ enabled: false, supported: false }` so the toggle is hidden in the UI.
  - **Electron side:** on startup, read `launchAtLogin` from `~/.reqly/config.json` and call `app.setLoginItemSettings({ openAtLogin: true/false })` to sync the OS state with the stored preference.
  - **Non-breaking:** if Reqly is running via CLI (not Electron), the toggle is hidden. The endpoints exist but return `supported: false`. No behaviour change for CLI/MCP users.

- [ ] **T-123** Auto-updater
  - **Library:** `electron-updater` from `electron-builder`. Add to `packages/desktop/package.json` dependencies only - not the root package.
  - **Flow:** on `app.whenReady()` (after window loads), call `autoUpdater.checkForUpdatesAndNotify()`. This checks the GitHub Releases feed for a newer version, downloads in the background, and shows a native OS notification "Reqly update ready - restart to install". User can dismiss and update later.
  - **Update feed:** configure `electron-builder`'s `publish` field to point at `github` provider with `owner: RutvikPansare` and `repo: Reqly`. `electron-updater` reads this to find releases.
  - **Only relevant for DMG/EXE installs.** npm global installs get updates via `npm update -g reqly-app`. Add a comment in the code explaining this so future maintainers don't remove it thinking it's redundant.
  - **No auto-restart without user consent.** `autoUpdater.on('update-downloaded')` should show a dialog: "Update downloaded. Restart now?" with "Restart" and "Later" buttons. Only call `autoUpdater.quitAndInstall()` if user clicks "Restart".

- [ ] **T-124** Installers and code signing
  - **electron-builder config:** add `electron-builder.yml` at `packages/desktop/electron-builder.yml`:
    ```yaml
    appId: com.reqly.app
    productName: Reqly
    directories:
      output: packages/desktop/release
    files:
      - packages/desktop/dist/**
      - node_modules/**
    mac:
      category: public.app-category.developer-tools
      target: [dmg, zip]
    win:
      target: [nsis]
    publish:
      provider: github
      owner: RutvikPansare
      repo: Reqly
    ```
  - **Mac - ship unsigned for v1.** Do not require an Apple Developer account. Remove `hardenedRuntime`, `entitlements`, and `gatekeeperAssess` from the electron-builder config for now - they only matter for notarization. On first launch macOS shows "cannot be opened because the developer cannot be verified." The bypass is: right-click the app > Open > Open anyway. This is a one-time step and the developer audience knows it well. Homebrew tap users bypass this entirely. Document the workaround in the README FAQ and in `docs/decision-log.md`. Revisit notarization when there is budget for an Apple Developer account.
  - **Windows - ship unsigned for v1.** No EV certificate (costs $300-500/year, not worth it at this stage). SmartScreen shows "Unknown publisher" on install - user clicks "More info" > "Run anyway". SmartScreen warning disappears automatically once the installer accumulates enough download reputation (roughly a few hundred downloads). Sign binaries with Sigstore/cosign (free, GitHub identity-based) for tamper-evidence even without SmartScreen trust - add a `cosign sign` step to the release workflow. Document the workaround in the README and `docs/decision-log.md`. Revisit EV signing when traction justifies the cost.
  - **GitHub Actions build matrix:** add `.github/workflows/release.yml` that triggers on `push` to tags matching `v*`. Matrix: `[macos-latest, windows-latest]`. Steps: checkout, setup Node 20, `npm ci`, `npm run build` (root), `cd packages/desktop && npm run build`, `npx electron-builder --publish always`. No signing secrets needed for v1 - just build and publish the unsigned artifacts.
  - **`reqly` binary must be bundled or pre-installed.** The DMG/EXE user won't have npm. Two options: (a) bundle `node` and the compiled server into the Electron app resources, or (b) require Node to be installed and show an error on startup if `reqly` isn't found in PATH. Option (b) is simpler for now - detect with `which reqly` / `where reqly` on startup and show a one-time setup screen if missing: "Install Reqly CLI first: npm install -g reqly-app". Document this decision in `docs/decision-log.md`.

- [ ] **T-125** `reqly app` CLI command
  - Add `'app'` to the valid commands list in `src/server/cli-parser.ts`.
  - **Behaviour:** check `~/.reqly/running.json` lock file. If a Reqly server is running, open `http://localhost:<port>` in the system default browser as a fallback, OR if the Electron process is detected (check by process name via `pgrep -x Reqly` on Mac, `tasklist` on Windows), send it a signal to show its window.
  - **Simpler first implementation:** just open `http://localhost:4242` in the default browser if a server is running, or print "Reqly is not running. Start it with: reqly start" if not. This works for both CLI users (browser opens) and Electron users (Electron intercepts the URL if it's registered as the handler, otherwise browser opens which is also fine).
  - **Add to `reqly setup` output** so users know about it: "Tip: run `reqly app` to open the UI in your browser at any time."
  - **No breaking changes:** `reqly start`, `reqly run`, all other commands unaffected.
