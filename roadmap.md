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

**Goal:** A human-usable interface at `localhost:4242`. Developers who prefer a visual interface can use the same engine their agents use. BYOK prompt interface makes it AI-native.

- [x] **Sidebar** - Collection tree: folders, requests, environments. Click to open, right-click to rename/delete.
- [x] **Request Editor** - Method dropdown, URL bar, tabs for Headers / Body / Auth / Params. Pre-filled from saved request, editable before firing.
- [x] **Response Viewer** - Status code, latency, response body (JSON pretty-printed), response headers. Copy button. Save response as example.
- [x] **Environment Switcher** - Dropdown in top bar. Switch between dev/staging/prod instantly.
- [x] **Settings Panel** - BYOK API key input stored in `~/.reqly/config.json`. Model selector (GPT-4o, Claude, etc.). Never stored in the repo.
- [x] **Prompt Bar** - Text input. User describes what they want. Sends to LLM with their API key. LLM calls MCP tools. Result appears in the UI. Zero AI cost on our side.

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

## M5 - Now: Windows Support + Desktop App

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

- [ ] **Electron wrapper** - Reqly server spawns as a child process from Electron's main process. `BrowserWindow` opens pointing at `http://localhost:4242`. On close: minimise to tray rather than quit (server keeps running).
- [ ] **System tray** - tray icon with menu: "Open Reqly", "Active project: \<path\>", "Stop Reqly", "Quit". On double-click: open/focus the browser window.
- [ ] **Auto-start on login** - opt-in toggle in Settings. Uses `app.setLoginItemSettings()` on Mac, registry key on Windows.
- [ ] **Auto-updater** - `electron-updater` checks GitHub Releases on startup, prompts to install in the background. Required for users who installed via DMG/EXE rather than npm.
- [ ] **Installers** - DMG for Mac (via `electron-builder`), NSIS installer for Windows. Code-signed on both platforms - Apple Developer account ($99/year) for Mac notarization; EV certificate (~$400/year) for Windows SmartScreen clearance. Without signing, users see security warnings on first run.
- [ ] **`reqly app` CLI command** - opens the Electron window if running, launches it if not. Bridges the CLI and desktop app workflows.

---

## M6 - Next: Script Power + Developer UX

**Goal:** Close the scripting gap versus Bruno and Postman. Developers switching from those tools expect Chai-style test assertions, a pre-script `req` object for dynamic signing, and variable autocomplete. These are daily-driver features that directly affect the decision to switch.

- [ ] **T-143** Chai-style `test()` / `expect()` assertions in post-run scripts - add Chai BDD API to the script sandbox; each `test('label', fn)` call produces a named pass/fail result shown in a "Tests" sub-tab alongside existing YAML assertions; named results included in JUnit XML output; existing YAML assertions untouched
- [ ] **T-144** `req` object in pre-run scripts - full Bruno-compatible req API: `req.getUrl()` / `req.setUrl(url)`, `req.getMethod()` / `req.setMethod(method)`, `req.getHeaders()` / `req.getHeader(name)` / `req.setHeader(name, value)` / `req.removeHeader(name)`, `req.getBody()` / `req.setBody(body)`, `req.setTimeout(ms)`, `req.setMaxRedirects(n)`; all mutations take effect on the outbound request before it fires; primary use cases: HMAC signing, dynamic timestamps, conditional auth header injection
- [ ] **T-145** Variable `{{` autocomplete in URL bar, header value fields, and body editor - dropdown appears on `{{` showing all available variables with source label (env, collection, .env); pure UI, no backend change
- [ ] **T-146** History panel: clicking an entry restores the saved response body into the response viewer - currently only repopulates the request editor; body is already stored in `HistoryEntry` (up to 10KB); show a "historical" badge so the user knows it's not a live result
- [ ] **T-153** Bruno script compatibility layer - expose `res.getStatus()`, `res.getBody()`, `res.getHeader(name)`, `res.getResponseTime()` as aliases in the post-run sandbox so Bruno scripts paste in and run without changes; show a one-page "Script API" nudge in the UI when a Bruno collection is imported mapping `bru.*` to `reqly.*` equivalents
- [ ] **T-154** Collection-scoped variables in scripts - `reqly.setVar(key, value)` / `reqly.getVar(key)` for variables scoped to the collection (not the environment); survives environment switches; resolves between collection vars and env vars in the existing precedence chain; available in both pre and post scripts
- [ ] **T-155** `require()` in scripts - allow `require()` with a safelist of built-in Node modules: `crypto`, `buffer`, `path`, `url`, `querystring`, `util`; covers the primary use case (HMAC signing via `crypto`) without opening arbitrary filesystem or network access; unsupported modules throw a clear error naming the safelist
- [ ] **T-156** Script flow control - `reqly.setNextRequest(name)` jumps to a named request in the collection runner (skipping everything between); `reqly.runner.stop()` halts the collection run entirely; `reqly.sleep(ms)` adds a delay before the next step; all three are no-ops when running a single request outside the collection runner
- [ ] **T-157** Extended Chai assertions - `jsonSchema` assertion validates response body against a JSON Schema object via Ajv (already a project dependency - zero new deps); `jsonBody` assertion does a readable partial-match check (`expect(res.getBody()).to.have.jsonBody({ id: 1 })` passes even if the response has extra fields); both exposed as Chai plugins added to the sandbox on startup

---

## M7 - Later: Data & CI Power

**Goal:** Parameterized testing and collection documentation. Both deepen the CI integration story: data-driven runs mean one collection tests dozens of inputs in GitHub Actions; docs export means collections double as living API references committed alongside the code.

- [ ] **T-147** Data-driven testing - `reqly run <collection> --data data.csv` (or `.json`) runs the collection once per row; each row's keys inject as variables; JUnit XML emits one `<testsuite>` per row so CI can distinguish failures by input; MCP tool `run_collection` gets an optional `dataFile` param
- [ ] **T-149** Collection documentation export - `reqly export docs <collection>` generates a clean markdown API reference from the collection YAML (method, URL, params, headers, body schema, example responses); default output to `docs/api/<collection>.md`; extend `export_collection` MCP tool with `format: "docs"`; no external deps, pure string templating

---

## Later: Protocol Expansion

**Why post-M7:** REST is table stakes and already solid. These protocols are used by a smaller audience and each needs its own UI paradigm. Ship them once the core product is proven.

- [ ] **T-151 WebSocket / SSE** - Persistent connections with a live message stream panel. Send messages, see server pushes in real time. Stored in collections as `type: websocket` / `type: sse` requests.
- [ ] **T-150 gRPC** - First-class gRPC alongside REST and GraphQL. Load `.proto` file per collection; method picker populated from service definition; input editor for request message (JSON form); response viewer shows decoded message. Unary RPCs for v1, streaming in v2. `type: grpc` in collection YAML with `protoFile`, `service`, `method`, `message` fields.
- [ ] **T-148 Client certificates / mTLS** - Per-collection or per-request client cert (PEM cert + key pair). Cert paths stored in collection YAML, files stored in `~/.reqly/certs/` (never committed). HTTP executor passes cert to `undici` dispatcher at request time. "Certificate" tab in collection settings and request Auth tab.
- [ ] **MQTT / Socket.IO** - Additional realtime protocol support for IoT and event-driven apps.
- [ ] **Multipart body editor** - File upload support with per-part content types, filename, and mime type. Essential for testing file upload endpoints.
- [ ] **Shared requests** - URL-shareable requests with embed options - useful for sharing a repro case with a teammate or filing a bug report.

---

## Later: VS Code Extension

**Why post-Protocol Expansion:** Cursor (the primary Reqly user's tool) is VS Code-compatible, so this extension reaches them automatically. The extension is a distribution play - it surfaces existing capability natively inside the editor without adding new engine features. Worth building once the protocol surface is complete so the extension exposes the full product.

**What makes it worth building over just using localhost:4242:** the native VS Code integrations (CodeLens, command palette, status bar, YAML validation) put Reqly exactly where the developer is writing code. Embedding the full web UI as a webview is not the goal - that's what Thunder Client does and it just feels like a browser inside VS Code.

- [ ] **CodeLens provider** - detect `fetch()`, `axios()`, `got()`, and similar HTTP calls in JS/TS files. Show "Run with Reqly" inline above each call. On click: fire the matching saved request (or offer to create one) and show the response status + body inline below the line, similar to how VS Code shows test results inline.
- [ ] **Collection tree view** - activity bar icon opens a sidebar panel with the collection tree: collection folders, requests, environments. Click a request to preview its config. Right-click context menu: Run, Duplicate, Delete. Talks to the running Reqly server at `localhost:4242` via the existing REST API.
- [ ] **Status bar environment switcher** - persistent item in the VS Code status bar showing the active environment (e.g. "Reqly: dev"). Click to open a quick-pick dropdown and switch environment without leaving VS Code.
- [ ] **Command palette** - register commands: `Reqly: Run request`, `Reqly: Run collection`, `Reqly: Switch environment`, `Reqly: Start proxy`, `Reqly: Open UI`. All keyboard-accessible via Cmd+Shift+P.
- [ ] **YAML schema validation** - contribute a JSON schema for `.reqly/**/*.yaml` files. Red squiggles on wrong field names (e.g. `type:` instead of `field:` in assertions), autocomplete for operators and step types, hover documentation on each field.
- [ ] **Marketplace publication** - publish to VS Code Marketplace as `reqly.reqly`. Works in Cursor, Windsurf, and any VS Code-compatible editor automatically.

---

## Later: Multi-Project Workspace

**Why post-VS Code Extension:** the single-project model works well for the initial target user. This becomes important when microservices developers start using Reqly across 5+ services and need to see everything simultaneously without switching. Needs a meaningful user base to validate the right design before investing in the complexity.

**Competitive context:** Bruno partially solves this today - it lets you open multiple collection directories and they appear together in the sidebar. Postman and Insomnia solve it differently by abandoning project-directory scoping entirely (cloud workspace, all collections flat). The design target is Bruno parity as the floor (multi-directory sidebar) plus Reqly's agent-native layer on top (per-project MCP scoping, cross-project flows). No other tool has the full picture: local-first + git-native + multi-project + MCP server.

**Current workaround for microservices developers:** use `reqly use <path>` for instant project switching, and point multiple projects at a shared `.env` file via `set_dotenv_files` to share secrets across services without switching. Agents can also coordinate across projects by holding extracted values in their context window and calling `switch-project` between steps.

**Goal:** add multiple project roots to one Reqly instance. Sidebar shows all projects grouped by name (project → collections → requests). Each project retains its own environment context, history, and flows. No cross-project request chaining - environment variables are the bridge. The MCP stdio transport stays per-project (already correct).

- [ ] **Workspace model** - `reqly workspace add <path>` registers a project root. `reqly workspace list` shows all registered roots. The UI sidebar gets a project-level grouping layer above collections. Switching the "active project" (for MCP stdio sessions and the mock server) still uses the existing `switch-project` mechanism - workspace is a UI concept, not an engine change.
- [ ] **Per-project environment context** - when multiple projects are loaded, each project's requests resolve variables against that project's own environments. No cross-contamination.
- [ ] **Unified history** - the history panel shows requests across all workspace projects, tagged with the project name.
- [ ] **Cross-project flows** - a flow step can reference `project/collection/request` instead of just `collection/request`. The flow runner switches project context per step. This is the only cross-project feature worth building - agents can write e2e flows spanning a full microservices stack.

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

---

## Later: Team Secrets Layer

**Why last:** Collections are YAML in git - teams already sync them via `git pull`. What can't go in git is secrets: auth tokens, environment variable values (API keys, passwords). This milestone makes sense only after there is a paying team user base to justify it - V1 is integrations with existing secret managers (no infrastructure cost), V2 is a hosted vault (significant infrastructure investment).

**V1 approach - integrate with existing secret managers, no custom cloud:** Build on tools teams already have rather than building a full vault from scratch. This is 4-6 weeks of integration work vs 3-6 months of cloud infrastructure. Custom vault comes later once there's revenue to justify it.

- [ ] **1Password integration** - read secret values from a 1Password vault via the 1Password SDK (`@1password/sdk`). Developers reference `{{op://vault/item/field}}` in collection variables. Reqly resolves it at request time. MCP tool `get_secret` returns the resolved value. Zero custom cloud required.
- [ ] **HashiCorp Vault / AWS Secrets Manager integration** - same pattern for enterprise teams. Read-only access, key referenced in collection YAML, resolved at request time. Priority driven by user demand.
- [ ] **Team Secrets Vault (V2)** - Reqly-hosted encrypted vault for teams who don't have a dedicated secret manager. Encrypted at rest, access-controlled per team member. First true cloud infrastructure Reqly builds. Gated on having a paid user base to justify the infrastructure cost.
