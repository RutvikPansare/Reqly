# Reqly - Roadmap

Horizons: **Now** = active focus · **Next** = queued · **Later** = on the radar.  
When a milestone becomes the focus, break it into `T-NNN` tasks in `docs/todo.md` tagged with the milestone name.

> **Build rule (mandatory on every task):** Every feature must ship three things together: (1) the implementation, (2) MCP tool coverage - new response fields in the tool return shape, new operations as new/extended tools, updated tool descriptions; (3) doc updates - `README.md`, `docs/llms.txt`, and `knowledge.md`. A feature that skips any of these is not done.

---

## M1 - Done: Core Engine

**Goal:** A working local execution engine with an MCP interface that AI agents (Cursor, Claude Code) can use immediately. No UI yet. Pure capability.

- [x] **HTTP Executor** - Fire GET, POST, PUT, PATCH, DELETE requests. Handle headers, body (JSON, form, raw), query params. Return status, response body, latency, headers.
- [x] **Collection Manager** - Create and manage collections as YAML files in `.reqly/collections/`. Each collection is a folder, each request is a file. Full CRUD.
- [x] **Environment Manager** - Named environments (dev, staging, prod) with variable sets. `{{baseUrl}}`, `{{apiKey}}` substituted at request time. Active environment set per-session.
- [x] **Auth Manager** - Store auth profiles: Bearer token, API key (header or query param), Basic auth. Profiles attach to collections or individual requests.
- [x] **MCP Server** - Expose these 7 tools to agents via stdio transport:
  - `run_request` - fire a saved request by name
  - `create_request` - create a new request in a collection
  - `create_collection` - scaffold a new collection
  - `list_collections` - list all collections and requests
  - `set_environment` - switch active environment
  - `run_collection` - fire all requests in a collection sequentially
  - `get_response` - retrieve last response for a request

---

## M2 - Done: Localhost UI

**Goal:** A human-usable interface at `localhost:4242`. Developers who prefer a visual interface can use the same engine their agents use.

- [x] **Sidebar** - Collection tree: folders, requests, environments. Click to open, right-click to rename/delete.
- [x] **Request Editor** - Method dropdown, URL bar, tabs for Headers / Body / Auth / Params. Pre-filled from saved request, editable before firing.
- [x] **Response Viewer** - Status code, latency, response body (JSON pretty-printed), response headers. Copy button. Save response as example.
- [x] **Environment Switcher** - Dropdown in top bar. Switch between dev/staging/prod instantly.
- [x] **Settings Panel** - Placeholder for future global preferences. Config is stored in `~/.reqly/config.json`.
- [x] **Prompt Bar** - (Removed) We removed the prompt bar to enforce the engine-only philosophy. Agents run via MCP, not the UI.

---

## M3 - Done: Differentiators

**Goal:** Features that make Reqly genuinely better than Postman or Bruno for the AI-native developer. Auto-capture is the most important - it removes all manual work.

- [x] **Auto-Capture Proxy** - Local proxy between the dev's app and the internet. Watches HTTP traffic, auto-builds collection entries from real calls. Zero manual request writing. Core wedge for User B (frontend/fullstack devs calling third-party APIs).
- [x] **Request Chaining** - Use values from one response in the next request. `{{login.response.token}}` auto-populates auth headers downstream. Essential for real-world multi-step flows.
- [x] **Test Assertions** - Per-request assertions: status equals 200, body contains field, latency under threshold. Written in plain text or via prompt. Failures show exactly what was expected vs. received.
- [x] **Collection Runner** - Run an entire collection sequentially. Pass/fail per request, summary at the end. Foundation for CI integration later.

---

## M4 - Done: Growth

**Goal:** Distribution and the features that give developers a reason to switch from Postman/Bruno. Paid tier comes from CI/CD and team workflows - not cloud sync, since collections are already in git.

- [x] **CLI Runner** - `reqly run <collection>` for CI/CD pipelines without the UI. Exit code 1 on failures. First natural paid tier: teams run this in GitHub Actions, pay per seat or usage.
- [x] **Import from Postman/Bruno** - Import existing collections instantly. Biggest switching cost removed. High-leverage for growth.
- [x] **Response Diffing** - Show what changed between the last run and this run. Detect silent API contract breaks. No other tool does this well.
- [x] **GraphQL Support** - First-class GraphQL alongside REST. Single `POST /graphql` execution through the same HTTP Executor (done). Schema introspection (done). Query editor in the UI with syntax highlighting and autocomplete from the schema (done) - lives in its own nav-rail workspace, not the REST editor (T-053). Variables panel (done). Remaining: persist GraphQL requests to collection YAML typed as `graphql`, and have MCP tool `run_request` handle GraphQL transparently. Targets developers hitting GitHub, Shopify, Linear, and other GraphQL APIs.
- [x] **Webhook Testing** - Expose a temporary public URL that captures incoming webhook payloads. Essential for testing Stripe, Shopify, and other inbound webhooks locally.
- [x] **Code snippet generation** - generate fetch/axios/curl snippets from any request; one-click copy; accessible via the `</>` button in the URL bar and the `generate_code` MCP tool
- [x] **Response-to-TypeScript interface** - infers typed TS interface from any JSON response body; `{TS}` button in the response viewer; works client-side with no server round-trip
- [x] **Collection export** - export any collection as Postman v2.1 JSON or OpenAPI 3.0 JSON; right-click context menu in the sidebar; `GET /api/collections/:name/export` and `export_collection` MCP tool
- [x] **Script console output** - `console.log/warn/error` calls in pre/post scripts are captured and shown in a Console tab in the response viewer with color-coded levels
- [x] **cURL import** - paste a cURL command in the terminal icon modal in the URL bar; populates method, URL, headers, body instantly; also available as `POST /api/import/curl`
- [x] **Pre-run and Post-run Scripts** - Save pre/post execution scripts per request within a collection. Scripts have programmatic access to read and update environment variables. Console output captured and shown in the response viewer Console tab.

- [x] **Collection-level variables and auth** - per-collection variable set that takes precedence over environment variables when both define the same key; a bulletproof variable resolver handles merge order (collection vars > env vars); collection-level auth type + value (variable reference or hardcoded) auto-injected into every request in the collection; coexists with "Save as Profile" (profiles are reusable across collections, collection auth is scoped to one collection)
  - [x] T-088: engine + MCP for variables
  - [x] T-089: UI for variables (CollectionSettingsModal, Variables tab)
  - [x] T-090: engine + MCP for auth (precedence logic, 3 MCP tools, Express routes)
  - [x] T-091: UI for auth (Auth tab in CollectionSettingsModal, Inherited panel shows source=collection)

- [x] Teaching agents how to use the app and create collections using response chaining, also using variables whenever possible for base urls, client ids etc; provide an example collection with full env variable usage in the package that acts as a guide for agents - shipped as the `reqly init` starter collection (collection variables, postScript extraction, request chaining, a flow) plus the `reqly://getting-started` MCP resource pointing agents at the same patterns on first connect.

- [x] **T-077** OAuth 2.0 authorization code flow - full PKCE flow, auto token refresh, UI editor for client credentials + "Authorize" button

- [x] **T-152 Keyboard shortcuts palette** - searchable `?` drawer listing all shortcuts with groups (Request, Navigation, Editor); consistent with the shortcuts already wired for `cmd+enter` / `cmd+s`

- [x] **Environment import/export** - import Postman environment JSON; export any active environment as a `.json` file; both via UI env switcher dropdown and MCP tool `import_environment` / `export_environment`

- [x] **Inherited headers panel** - read-only panel in the request editor showing which headers will be injected by the active auth profile and collection-level auth, so the developer sees the complete outbound request before firing

- [x] **Collection example responses** - save one or more example responses against a request as documentation; stored in YAML alongside the request; visible in the response viewer as a "Saved Examples" tab; MCP tool `save_example` / `list_examples`

- [x] **Insomnia + OpenAPI import** - extend the existing import engine to handle Insomnia v4 JSON and OpenAPI 3.0/Swagger 2.0 YAML/JSON; currently only Postman v2.1 and Bruno are supported

- [x] **Test Flows** - SoapUI-style e2e API automation. Flows are separate YAML files in `.reqly/flows/`, separate from collections. Step types: `run` (fire a collection request), `extract` (property transfer into flow-local scope), `assert`, `poll` (retry until condition, for async APIs), `conditional` (if/goto branching). Data-driven via top-level `data` array (runs flow once per row). Flow-local variable scope sits above collection vars and env vars in the resolver chain. Full MCP tool parity so agents can write and run flows without the UI. CLI `reqly run-flow <name>` for CI. Tasks: T-095 through T-100.

- [x] **Mock server** - `reqly mock <collection>` serves saved example responses as a real HTTP server on a configurable port (default 4243). Route matching on method + URL pattern; falls back to 404 with a helpful error if no example exists. Agents can spin up a mock via the `start_mock` MCP tool and tear it down with `stop_mock`. UI shows mock status in the Capture panel's Mock tab with active route count. Enables frontend development against a backend that isn't ready, and lets agents test client code against controlled responses. Collections already store example responses - the mock server just serves them. Tasks: T-101 through T-103.

- [x] **.env file integration** - Reqly automatically reads a `.env` file in the project root and makes every key available as a variable in all requests, resolved at the lowest priority (collection vars > env vars > .env file). Secrets stay out of the YAML that travels with git. Zero config - if `.env` exists, it's loaded. Hot-reloads on file change. Variables tab in the request editor shows `.env` as the source. MCP tool `get_variables` includes `.env` keys with `source: ".env"`. Agents can reference `{{STRIPE_SECRET_KEY}}` without ever writing the value into a collection file. Tasks: T-104.

- [x] **OpenAPI contract validation** - after any request is fired, optionally validate the response against an OpenAPI spec (pointed at via a file path or URL in collection settings). Reports: missing required fields, wrong types, unexpected status codes, schema violations. Shown as a new "Contract" tab in the response viewer alongside Assertions. MCP tool `validate_response` returns structured violations so agents can catch contract breaks in CI. `reqly run <collection> --validate-spec <path>` flag for CLI. Tasks: T-105 through T-107.

---

## M5 - Done: Windows Support + Desktop App

**Goal:** Remove the two biggest friction points for non-Mac developers and non-CLI-comfortable users. Sequencing: Windows support first (2 weeks), then Electron desktop app (3-4 weeks). Both are prerequisite to meaningful adoption outside the Mac/CLI niche.

### Windows Support - Done

All Windows Support items shipped (T-115 through T-119).

- [x] **`reqly setup` Windows paths** - `APPDATA`-aware config path resolution; clear error if env var unset (T-115)
- [x] **Process kill cross-platform** - `killProcessTree(pid)`: `taskkill /T /F` on Windows, `process.kill(-pid)` on Unix (T-116)
- [x] **Shell detection** - `exec-command.ts` now passes `shell: true`; `terminal.ts` already used `cmd /c` on Windows (T-117)
- [x] **File path audit + fs.watch** - no hardcoded `/` separators found; `spec-loader.ts` migrated from `fs.watch` to chokidar (T-118)
- [x] **CI matrix** - `.github/workflows/ci.yml` runs ubuntu-latest + windows-latest; README and llms.txt updated with platform + Homebrew caveat (T-119)

### Desktop App (Electron)

**Why Electron over Tauri for V1:** the Reqly server is already Node.js - it runs naturally inside Electron's main process with no language boundary. Tauri requires Rust and gives a smaller bundle (5-15MB vs 150MB) but adds 4-6 weeks of complexity. Ship Electron now, consider Tauri for V2.

- [x] **Electron wrapper** (T-120) - `packages/desktop/` Electron main process spawns `reqly start` as a child (only if no server is already running), opens a `BrowserWindow` on `http://localhost:4242` after a readiness poll, hides-not-quits on close, and kills the server on quit only if it spawned it. Zero `src/` changes.
- [x] **System tray** (T-121) - tray icon with menu: "Open Reqly", "Active project: \<path\>", "Launch at login", "Quit". On double-click: open/focus the browser window.
- [x] **Auto-start on login** (T-122) - opt-in toggle in Settings. Uses `app.setLoginItemSettings()`, persisted to `~/.reqly/config.json`.
- [x] **Auto-updater** (T-123) - `electron-updater` checks GitHub Releases on startup, prompts to install in the background. Required for users who installed via DMG/EXE rather than npm.
- [x] **Installers** (T-124) - DMG/ZIP for Mac, NSIS installer for Windows (via `electron-builder`), unsigned for v1 (no Apple Developer account / EV cert yet - documented bypass in README FAQ and `docs/decision-log.md`). `release.yml` builds and publishes to GitHub Releases on `v*` tags.
- [x] **`reqly app` CLI command** (T-125) - opens the running server's URL in the system default browser; works for both CLI-started and desktop-app-started servers. Prints a "not running" hint and exits 1 if no server is up.

---

## M6 - Done: Script Power + Developer UX

**Goal:** Close the scripting gap versus Bruno and Postman. Developers switching from those tools expect Chai-style test assertions, a pre-script `req` object for dynamic signing, and variable autocomplete. These are daily-driver features that directly affect the decision to switch.

- [x] **T-143** Chai-style `test()` / `expect()` assertions in post-run scripts - Chai BDD API in the script sandbox; each `test('label', fn)` call produces a named pass/fail result shown in the Tests tab alongside YAML assertions; UI renders `testResults` array (T-159 bug fix shipped alongside)
- [x] **T-144** `req` object in pre-run scripts - full Bruno-compatible req API with getter/setter methods; mutations applied to the outbound request before it fires
- [x] **T-145** Variable `{{` autocomplete in URL bar, header value fields, and body editor - already fully implemented in `VariableInput.tsx`; verified working
- [x] **T-146** History panel: clicking an entry restores the saved response body into the response viewer with a "Historical" badge
- [x] **T-153** Bruno script compatibility layer - `res.getStatus()`, `res.getBody()`, `res.getHeader(name)`, `res.getResponseTime()` and `bru.*` aliases in the post-run sandbox; Bruno import migration nudge in UI
- [x] **T-154** Collection-scoped variables in scripts - `reqly.setVar(key, value)` / `reqly.getVar(key)` scoped to the collection; same-script read-back fixed (T-160 bug fix)
- [x] **T-155** `require()` in scripts - safelisted Node built-ins: `crypto`, `buffer`, `path`, `url`, `querystring`, `util`
- [x] **T-156** Script flow control - `reqly.setNextRequest(name)`, `reqly.runner.stop()`, `reqly.sleep(ms)` in the collection runner
- [x] **T-157** Extended Chai assertions - `jsonSchema` and `jsonBody` Chai plugins via Ajv

---

## M7 - Now: Data & CI Power

**Goal:** Parameterized testing and collection documentation. Both deepen the CI integration story: data-driven runs mean one collection tests dozens of inputs in GitHub Actions; docs export means collections double as living API references committed alongside the code.

- [ ] **T-147** Data-driven testing - `reqly run <collection> --data data.csv` (or `.json`) runs the collection once per row; each row's keys inject as variables; JUnit XML emits one `<testsuite>` per row so CI can distinguish failures by input; MCP tool `run_collection` gets an optional `dataFile` param
- [ ] **T-149** Collection documentation export - `reqly export docs <collection>` generates a clean markdown API reference from the collection YAML (method, URL, params, headers, body schema, example responses); default output to `docs/api/<collection>.md`; extend `export_collection` MCP tool with `format: "docs"`; no external deps, pure string templating
- [ ] **T-161** `preScriptFile` / `postScriptFile` - agents write complex scripts as plain `.js` files (no JSON escaping), reference by path relative to collection folder; engine reads at run time; inline `preScript`/`postScript` stays for one-liners and wins on conflict; path traversal outside collection folder rejected

---

## Later: Realtime Protocol Workspace (WebSocket, SSE, Socket.IO, MQTT)

**Why here:** REST, GraphQL, and gRPC cover the synchronous API surface. Realtime protocols are a distinct interaction model - long-lived connections, bidirectional message streams, pub/sub. Each requires a different UI paradigm and a different MCP execution model.

**Architecture (non-negotiable - see `knowledge.md` for rationale):**
- MCP/agent use: buffered executor (`src/engine/realtime-executor.ts`) - connect, capture for N seconds, disconnect, return messages. Same pattern as `grpc-streaming.ts`.
- UI interactive use: direct browser connections (native WebSocket/EventSource for WS+SSE; `socket.io-client` and `mqtt` browser builds for SIO+MQTT). No server-side proxy.
- Protocol npm packages (`socket.io-client`, `mqtt`) go in `src/ui/package.json` only. Root `package.json` gets nothing new for this feature.

**Tasks scoped in `docs/todo.md` (T-185 to T-194):**
- T-185: Types + badge colors
- T-186: Engine: `realtime-executor.ts` (buffered capture, TDD)
- T-187: Engine context wiring + Express `/api/run/realtime` route
- T-188: MCP tool: `run_realtime` (connect-buffer-disconnect pattern)
- T-189: UI: `api.ts` client + shared `RealtimeMessageLog` display component
- T-190: UI: NavRail `Wifi` icon + App.tsx routing
- T-191: UI: `RealtimeCollectionsPanel` + `useRealtimeTabs` + `RealtimeTabBar`
- T-192: UI: `WebSocketPanel` + `SSEPanel` (native browser APIs, no packages)
- T-193: UI: `SocketIOPanel` + `MQTTPanel` (browser-build packages in `src/ui/package.json`)
- T-194: UI: `RealtimeWorkspace` shell + save/load + state persistence


- [x] **gRPC Epic (T-164 through T-168)** - Full BloomRPC-beating gRPC support. Shipped:
  - **T-164** Core engine: unary RPCs, multi-file proto support via `.reqly/protos/` with `includeDirs`, gRPC status codes distinct from HTTP, `run_request` MCP transparent routing
  - **T-165** Metadata + auth: headers map to gRPC Metadata automatically; existing Bearer/API Key/Basic auth profiles inject into Metadata without manual config
  - **T-166** Message auto-generation: `create_request` MCP returns typed JSON scaffold so agents don't guess the message shape; `scaffoldMessage()` in `src/engine/proto-scaffold.ts`
  - **T-167** Server reflection: `list_grpc_services` MCP tool discovers schema from a live server via `grpc.reflection.v1alpha.ServerReflection` - no .proto file needed
  - **T-168** Full streaming: `runGrpcServerStream`, `runGrpcClientStream`, `runGrpcBidiStream` in `src/engine/grpc-streaming.ts`; `run_request` routes streaming modes; MCP returns `{ messages, truncated }` for headless agent testing
- [ ] **T-148 Client certificates / mTLS** - Per-collection or per-request client cert (PEM cert + key pair). Cert paths stored in collection YAML, files stored in `~/.reqly/certs/` (never committed). HTTP executor passes cert to `undici` dispatcher at request time. "Certificate" tab in collection settings and request Auth tab.
- [ ] **MQTT / Socket.IO** - Additional realtime protocol support for IoT and event-driven apps.
- [ ] **Multipart body editor** - File upload support with per-part content types, filename, and mime type. Essential for testing file upload endpoints.
- [ ] **Shared requests** - URL-shareable requests with embed options - useful for sharing a repro case with a teammate or filing a bug report.

---

## Done: Regression + Self-Verification Harness

**T-243** (shipped 2026-07-04; queued as "T-238", renumbered - that id was already used) - End-to-end regression suite that Fable runs at the end of every task to verify its own work. Two layers: MCP tool verification (every tool in the T-243 list called against a live server with the committed fixture project, 17 assertions) and Playwright UI tests (9 key user journeys across REST, GraphQL, gRPC, Realtime workspaces). Both must be green before T-227 begins. Run via `npm run test:e2e` (see `tests/e2e/README.md`). First run caught and fixed two production bugs: optional MCP params were rejected when a tool schema had no `required` array, and gRPC reflection (`list_grpc_services`) had never worked outside unit tests.

---

## Done: VS Code Extension

**Why:** Protocol surface is complete (REST, GraphQL, gRPC, Realtime all shipped). T-225 multi-project sidebar is done. The extension is a pure distribution play - surfaces existing capability natively inside the editor. Cursor, Windsurf, and all VS Code-compatible editors get it automatically.

**What makes it worth building over just using localhost:4242:** the native VS Code integrations (CodeLens, command palette, status bar, YAML validation) put Reqly exactly where the developer is writing code. Embedding the full web UI as a webview is not the goal - that's what Thunder Client does and it feels like a browser inside VS Code.

- [x] **T-240** Foundation + collection tree + status bar + command palette + marketplace publish workflow (`packages/vscode/`, publishes as `reqly.reqly` on `v*` tags)
- [x] **T-241** CodeLens: "▶ Run with Reqly" on fetch/axios/got calls in JS/TS
- [x] **T-242** YAML schema validation for `.reqly/**/*.yaml` (schemas generated from the TS types in `src/types/`; hover docs + enum autocomplete via redhat.vscode-yaml)

_(Queued as T-235/236/237; renumbered because those ids were already used. Follow-up before the first tagged release: set the `VSCE_PAT` repo secret.)_

---

## Next: v2 Architecture - Disk-Persisted State + Independent Processes

**Why before Multi-Project Workspace:** the current singleton lock exists solely because state lives in RAM. Multi-project on the singleton architecture requires increasingly complex inter-process coordination. Moving state to disk first makes multi-project trivial - each process reads a different `.reqly/` directory, no coordination needed.

**Goal:** every Reqly process (Electron, `reqly mcp`, CLI) runs a full independent engine. State shared via filesystem. Lock file retained for process registry only, not state coordination.

- [ ] **T-220** Persist `HistoryStore` to `.reqly/history.ndjson` (append-only NDJSON)
- [ ] **T-221** Persist `ResponseStore` to `.reqly/responses.json`
- [ ] **T-222** Remove singleton lock as state coordinator - every process runs full engine, MCP-only mode removed
- [ ] **T-223** Update `switch_project` MCP tool to local context swap (no HTTP call)
- [ ] **T-224** `reqly init` auto-gitignores `history.ndjson` and `responses.json`

---

## Later: Multi-Project Workspace

**Why post-v2 architecture:** requires disk-persisted state. After v2, each process reads its own `.reqly/` independently - multi-project is just pointing at different directories simultaneously.

**How Bruno does it:** Bruno lets you open multiple collection folders and groups them in one sidebar. The "which folders are open" list lives in the app's local config - not in any repo. Collection files stay git-tracked in their respective repos. Simple, zero new file formats.

**Competitive context:** Bruno partially solves this - multiple collection directories in one sidebar. Postman/Insomnia abandoned project-directory scoping for cloud workspaces. Reqly's target: Bruno parity as the floor (Phase 1), plus agent-native cross-repo flows on top (Phase 2). No other tool has local-first + git-native + multi-project + MCP server.

**Current workaround for microservices developers:** use `reqly use <path>` for instant project switching, share secrets via `set_dotenv_files` pointing at a shared `.env`, and have agents coordinate across projects by holding extracted values in their context window.

### Phase 1: Bruno Parity (ship first)

No new file formats. Path list in `~/.reqly/config.json`. Grouped sidebar. Full MCP parity.

- [x] **T-225** Multi-project path list + grouped sidebar
  - `workspaceProjects: string[]` in config; `CollectionManager.loadAll()` for multiple dirs
  - CLI: `reqly workspace add/remove/list`
  - MCP: `add_workspace_project`, `remove_workspace_project`, `list_workspace_projects`
  - UI: sidebar grouped by project folder name, collapsible sections, "Add project" button, active project highlighted, history entries tagged by project

### Phase 2: Reqly Differentiation (beyond Bruno)

Named workspaces with aliases, cross-repo flows. What makes Reqly uniquely agent-native for microservices teams.

- [x] **T-226** Formal workspace model: `~/.reqly/workspaces/<name>/workspace.yaml`
  - Named workspace with `repos: [{ alias, path }]` and optional `sharedEnv`
  - CLI: `reqly workspace create/link/use`; MCP: `create_workspace`, `link_workspace_repo`, `use_workspace`, `list_workspaces`
  - UI: workspace dropdown above the project list in the collections sidebar, workspace settings modal (link/unlink repos, sharedEnv display)

- [ ] **T-227** Cross-repo flows with `repo: <alias>` step field
  - Flow runner resolves alias to `projectDir` via active workspace config
  - Cross-repo flow YAMLs live in `~/.reqly/workspaces/<name>/flows/`
  - `run_flow` / `reqly run-flow` accept `--workspace <name>`
  - UI: repo selector in flow builder step picker, breadcrumb shows `alias / collection / request`

---

## M8 - Later: Inbound Capture

**Goal:** Capture calls coming INTO the user's own app (not outbound). The current proxy captures what the app sends to external APIs. This milestone captures what clients (browsers, mobile, other servers) send to the user's own endpoints.

**Important context:** for AI-native developers (the primary Reqly user), the preferred workflow is NOT traffic capture at all - it's having the AI agent read the codebase and write the collection directly via `create_collection` and `create_request` MCP tools. The agent already knows every route, request shape, and auth requirement from the code. Inbound capture is for cases where the codebase is too complex, undocumented, or the developer prefers to capture real traffic instead.

- [x] **Middleware SDK** *(priority)* - Tiny npm package (`reqly-middleware`) added once to Express/Fastify/Next.js. Captures every inbound request server-side, forwards a copy to the local Reqly instance. Works for all traffic: browser, mobile, webhooks, server-to-server. One line: `app.use(reqlyMiddleware())`. Works for local dev only (middleware phones home to `localhost:4242` - production capture requires the webhook tunnel from M4). Once shipped, update `README.md` and `llms.txt` to document this as a capture option alongside the AI-writes-collection workflow.

- [ ] **Chrome Extension** *(lower priority, after middleware)* - Intercepts XHR/fetch via `chrome.webRequest` API, sends copies to `localhost:4242/capture`. Zero code change. Works for any hosted app the developer browses. Limitation: browser traffic only - no mobile, webhooks, or server-to-server.

**Note on the current proxy:** the existing auto-capture proxy (M3) captures OUTBOUND calls - what the user's app sends to external APIs (Stripe, Shopify, etc.). M8 is the complement: what comes IN.

---

## Later: Homebrew Cask (Electron app via Homebrew)

Fast follow-on to M5 (T-124). Once the Electron DMG is published to GitHub Releases, add a Homebrew cask so Mac users can install the desktop app with `brew install --cask reqly`. This is separate from the existing Homebrew formula (which installs the CLI via npm). The cask downloads the DMG directly from GitHub Releases and installs `Reqly.app` to `/Applications`. No Apple Developer account required for the cask itself. One PR to `homebrew-reqly` repo adding `Casks/reqly.rb`.

- [ ] **T-158** Homebrew cask for Reqly.app - depends on T-124 DMG being published; one `Casks/reqly.rb` file + README update

---

## Done: Team Secrets Layer (completed 2026-07-06)

**Why now:** VS Code extension, multi-project workspace, and regression harness all shipped. Collections sync via git. The last gap is secrets - API keys and tokens that can't go in git. V1 integrates with secret managers teams already have. No Reqly accounts, no custom cloud infrastructure.

**Architecture decision:** vault integrations only for V1. Enterprises don't want another secret store - they want their existing one to work with Reqly. Indie devs already pay for 1Password or Bitwarden. Reqly plugs into those. Custom hosted vault (V2) is gated on a paying user base to justify the infrastructure cost.

**How it works:** developers put vault URIs directly in their existing `.env` file instead of raw values - `STRIPE_KEY=op://MyVault/Stripe/api_key`. Reqly's `.env` loader detects URI patterns and resolves them from the vault at request time. The collection YAML never changes. Zero new workflow, zero new files to learn. Also supports inline `{{secret:op://...}}` references directly in request fields for one-offs. `reqly secrets resolve` writes resolved values to `.env.local` for tools that don't understand vault URIs.

- [x] **T-245** Infrastructure: extend `.env` loader with `SecretProvider` registry, inline `{{secret:...}}` support, `get_secret` MCP tool, `reqly secrets resolve` CLI, Settings Secrets tab - **done 2026-07-06**
- [x] **T-246** 1Password: `op://vault/item/field` URIs, `@1password/sdk`, `OP_SERVICE_ACCOUNT_TOKEN`, `configure_secret_provider` MCP tool - **done 2026-07-06**
- [x] **T-247** AWS Secrets Manager: `aws://secret-name` URIs, standard AWS credential chain, no Reqly credential storage - **done 2026-07-06**
- [x] **T-248** HashiCorp Vault: `vault://secret/data/path` URIs, `VAULT_ADDR` + `VAULT_TOKEN`, direct HTTP API - **done 2026-07-06**
- [x] **T-249** Bitwarden Secrets Manager: `bw://project/secret-name` URIs, `@bitwarden/sdk-napi` (`@bitwarden/sdk-secrets-manager` does not exist on npm) - **done 2026-07-05**

**V2 (later):** Reqly-hosted encrypted vault for teams without a dedicated secret manager. Gated on revenue to justify infrastructure.
