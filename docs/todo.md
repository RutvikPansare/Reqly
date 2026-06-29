# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

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

### M6 - Script Power + Developer UX

- [ ] **T-143** Chai-style `test()` / `expect()` assertions in post-run scripts
  - Add `test('label', fn)` and `expect()` (Chai BDD) to the post-run script sandbox
  - Each `test()` call produces a named pass/fail result shown in a "Tests" sub-tab in the response viewer alongside existing YAML assertions
  - Chai API: `.to.equal`, `.to.have.property`, `.to.include`, `.to.be.above`, `.to.deep.equal` - match Chai exactly, not a custom DSL
  - Existing YAML assertions are untouched; `test()` is purely additive
  - Script sandbox receives: `test`, `expect`, `reqly.response` (status, body, headers, latency), `reqly.setEnvVar`, `reqly.getEnvVar`
  - Named test results included in JUnit XML output from `reqly run --format junit`
  - **MCP:** `run_request` and `run_collection` response shape gains a `testResults` array: `[{ name: string, passed: boolean, error?: string }]` - one entry per `test()` call in the script; update tool descriptions to document this field
  - TDD required: `script-runner.test.ts` - test() pass, test() fail, expect() pass, expect() throws, multiple tests per script, mix with env var ops

- [ ] **T-144** `req` object in pre-run scripts - full Bruno-compatible API
  - Expose the full Bruno req method API in pre-run scripts:
    - `req.getUrl()` / `req.setUrl(url)`
    - `req.getMethod()` / `req.setMethod(method)`
    - `req.getHeaders()` / `req.getHeader(name)` / `req.setHeader(name, value)` / `req.removeHeader(name)`
    - `req.getBody()` / `req.setBody(body)`
    - `req.setTimeout(ms)` / `req.setMaxRedirects(n)`
  - All mutations take effect on the outbound request before it fires
  - Primary use cases: HMAC signing, dynamic timestamps, conditional auth header injection
  - The executor reads the mutated req state after the pre-script completes
  - TDD required: `pre-script.test.ts` - getUrl, setUrl, setHeader, removeHeader, setBody, setTimeout; verify mutations are reflected in the fired request

- [ ] **T-145** Variable `{{` autocomplete in URL bar, header value fields, and body editor
  - Dropdown appears when user types `{{` in URL bar, any header value input, or the body editor
  - Shows all available variable names with source label (env, collection, .env)
  - Selecting an entry completes `{{varName}}` pattern
  - Variable list already available client-side from existing API calls - no backend change needed
  - Pure UI; no TDD required

- [ ] **T-146** History panel: clicking an entry restores the saved response body
  - Currently clicking a history entry only populates method + URL in the request editor; does not load the saved response
  - After the fix: load body (and status/latency) from the `HistoryEntry` into the response viewer panel
  - Show a "historical" muted badge with the original timestamp so the user knows it's not a live result
  - Body is already stored in `HistoryEntry` (up to 10KB) - no backend change needed
  - Pure UI fix; no TDD required

- [ ] **T-153** Bruno script compatibility layer
  - Expose `res.getStatus()`, `res.getBody()`, `res.getHeader(name)`, `res.getResponseTime()` as aliases in the post-run script sandbox - Bruno scripts should paste in and run without modification
  - Also expose `bru.setEnvVar()` / `bru.getEnvVar()` as aliases for `reqly.setEnvVar()` / `reqly.getEnvVar()` so the `bru.*` namespace works out of the box
  - Show a one-page "Script migration" nudge in the UI when a Bruno collection is imported: a table mapping `bru.*` and `res.*` to their `reqly.*` equivalents
  - No backend change; aliases wired in the sandbox setup
  - TDD required: `script-compat.test.ts` - res.getStatus() returns status, res.getBody() returns body, bru.setEnvVar() sets env var, bru.getEnvVar() reads it

- [ ] **T-154** Collection-scoped variables in scripts (`reqly.setVar` / `reqly.getVar`)
  - `reqly.setVar(key, value)` and `reqly.getVar(key)` in both pre and post scripts
  - Scoped to the collection - survives environment switches, isolated from other collections
  - Stored in memory on the server keyed by collection name; cleared on server restart
  - Resolves in the existing precedence chain: collection vars > env vars > .env file
  - Use case: storing a token from a login request and reusing it across subsequent requests in the same collection without polluting the environment
  - **MCP:** extend `get_variables` to include runtime script vars with `source: "script"` so agents can inspect what the last script run set; update tool description accordingly
  - TDD required: `collection-vars.test.ts` - setVar persists across requests in same collection, getVar returns undefined if not set, isolated between collections

- [ ] **T-155** `require()` in scripts - safelisted Node built-ins
  - Allow `require()` inside pre and post scripts with a safelist of built-in Node modules: `crypto`, `buffer`, `path`, `url`, `querystring`, `util`
  - Covers the primary use case: `const { createHmac } = require('crypto')` for HMAC signing
  - Modules outside the safelist throw a clear error: "require('module-name') is not allowed in Reqly scripts. Allowed modules: crypto, buffer, path, url, querystring, util"
  - No npm module resolution - built-ins only; no filesystem access via `require()`
  - TDD required: `script-require.test.ts` - require('crypto') works, require('fs') throws with message, require('axios') throws with message

- [ ] **T-156** Script flow control for collection runner
  - `reqly.setNextRequest(name)` - jumps to the named request in the collection run, skipping everything between; name must match a request in the same collection
  - `reqly.runner.stop()` - halts the collection run immediately; remaining requests are skipped, not failed
  - `reqly.sleep(ms)` - pauses execution for `ms` milliseconds before the next request fires; useful for rate-limited APIs
  - All three are no-ops when running a single request outside the collection runner (no error thrown)
  - `setNextRequest` with an unknown name throws immediately with a clear message listing valid request names
  - **MCP:** `run_collection` response gains a `stoppedEarly: boolean` field and a `jumpedTo?: string` field so agents know if a script halted or redirected the run; update `run_collection` tool description
  - TDD required: `flow-control.test.ts` - setNextRequest skips to correct request, runner.stop() halts remaining, sleep() delays by expected duration, no-op outside runner

- [ ] **T-157** Extended Chai assertions: `jsonSchema` and `jsonBody`
  - `jsonSchema` Chai plugin: `expect(res.getBody()).to.have.jsonSchema({ type: 'object', required: ['id'] })` - validates response body against a JSON Schema; Ajv is already a project dependency so no new packages needed
  - `jsonBody` Chai plugin: `expect(res.getBody()).to.have.jsonBody({ id: 1 })` - partial deep match; passes if the response contains all the specified keys/values, ignores extra fields
  - Both registered as Chai plugins in the sandbox setup before any script runs
  - On failure, error message shows: expected schema / actual body excerpt for jsonSchema; expected subset / actual body for jsonBody
  - **MCP:** results from `jsonSchema` and `jsonBody` assertions appear in the same `testResults` array introduced in T-143 - no separate field needed; update `run_request` tool description to note Chai plugin assertions are included
  - TDD required: `chai-plugins.test.ts` - jsonSchema pass, jsonSchema fail (wrong type), jsonSchema fail (missing required), jsonBody pass with extra fields, jsonBody fail

### M7 - Data & CI Power

- [ ] **T-147** Data-driven testing: CSV/JSON collection runner
  - `reqly run <collection> --data data.csv` (or `data.json`) runs the collection once per row
  - Each row's keys become variables for that run at env-var precedence level
  - CSV: first row is header (variable names), subsequent rows are data sets
  - JSON: array of objects, each object is one data set
  - Console output: one labeled result block per row ("Row 1 / Row 2...")
  - JUnit XML: one `<testsuite>` per row so CI can distinguish failures by input set
  - MCP tool `run_collection` gets an optional `dataFile` param
  - TDD required: `data-runner.test.ts` - CSV parse, JSON parse, variable injection per row, multi-row output shape, JUnit shape

- [ ] **T-149** Collection documentation export
  - `reqly export docs <collection>` generates a clean markdown API reference from the collection YAML
  - Structure: H1 = collection name, H2 per request, table for headers/params, fenced code block for body + example responses
  - Default output path: `docs/api/<collection>.md`; `--output <path>` to override
  - Also available as `POST /api/collections/:name/export?format=docs`
  - Extend existing `export_collection` MCP tool with `format: "docs"` option alongside existing `postman` and `openapi`
  - No external deps - pure string templating from existing collection YAML
  - TDD required: `docs-exporter.test.ts` - collection with no requests, collection with headers/body/examples, output path resolution

### Protocol Expansion (Later)

- [ ] **T-151** WebSocket / SSE support
  - `type: websocket` and `type: sse` request types stored in collection YAML alongside REST requests
  - UI: persistent connection panel with live message stream; send messages (WebSocket); read event stream (SSE)
  - MCP tool `run_request` handles both types; response is the first message or first N events for MCP consumers

- [ ] **T-150** gRPC support
  - `type: grpc` in collection YAML with `protoFile`, `service`, `method`, `message` fields
  - `.proto` file stored at `.reqly/collections/<name>/service.proto`
  - UI: method picker dropdown populated from proto service definition; JSON-form input for request message; response viewer shows decoded message
  - Unary RPCs for v1; streaming in v2
  - MCP tool `run_request` handles `type: grpc` transparently

- [ ] **T-148** Client certificates / mTLS
  - Per-collection or per-request client certificate (PEM cert + key pair)
  - Cert paths referenced in collection YAML; actual files stored in `~/.reqly/certs/` (never committed)
  - UI: "Certificate" tab in collection settings modal and request Auth tab; file picker for cert + key
  - HTTP executor passes cert to `undici` dispatcher at request time
  - `set_collection_auth` MCP tool extended with `type: mtls` and cert path params
  - TDD required: `cert-loader.test.ts` - cert file read, invalid path error, cert passed through to executor options
