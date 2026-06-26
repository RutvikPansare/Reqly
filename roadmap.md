# Reqly - Roadmap

Horizons: **Now** = active focus · **Next** = queued · **Later** = on the radar.  
When a milestone becomes the focus, break it into `T-NNN` tasks in `docs/todo.md` tagged with the milestone name.

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

## M4 - Now: Growth

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

- [ ] **Collection-level variables and auth** - per-collection variable set that takes precedence over environment variables when both define the same key; a bulletproof variable resolver handles merge order (collection vars > env vars); collection-level auth type + value (variable reference or hardcoded) auto-injected into every request in the collection; coexists with "Save as Profile" (profiles are reusable across collections, collection auth is scoped to one collection)

- [ ] Teaching agents how to use the app and create collections using response chaining, also using variables whenever possible for base urls, client ids etc; provide an example collection with full env variable usage in the package that acts as a guide for agents

- [x] **T-077** OAuth 2.0 authorization code flow - full PKCE flow, auto token refresh, UI editor for client credentials + "Authorize" button

- [ ] **Keyboard shortcuts palette** - searchable `?` drawer listing all shortcuts with groups (Request, Navigation, Editor); consistent with the shortcuts already wired for `cmd+enter` / `cmd+s`

- [x] **Environment import/export** - import Postman environment JSON; export any active environment as a `.json` file; both via UI env switcher dropdown and MCP tool `import_environment` / `export_environment`

- [x] **Inherited headers panel** - read-only panel in the request editor showing which headers will be injected by the active auth profile and collection-level auth, so the developer sees the complete outbound request before firing

- [x] **Collection example responses** - save one or more example responses against a request as documentation; stored in YAML alongside the request; visible in the response viewer as a "Saved Examples" tab; MCP tool `save_example` / `list_examples`

- [x] **Insomnia + OpenAPI import** - extend the existing import engine to handle Insomnia v4 JSON and OpenAPI 3.0/Swagger 2.0 YAML/JSON; currently only Postman v2.1 and Bruno are supported

---

## M5 - Later: Inbound Capture

**Goal:** Capture calls coming INTO the user's own app (not outbound). The current proxy captures what the app sends to external APIs. This milestone captures what clients (browsers, mobile, other servers) send to the user's own endpoints.

**Important context:** for AI-native developers (the primary Reqly user), the preferred workflow is NOT traffic capture at all - it's having the AI agent read the codebase and write the collection directly via `create_collection` and `create_request` MCP tools. The agent already knows every route, request shape, and auth requirement from the code. Inbound capture is for cases where the codebase is too complex, undocumented, or the developer prefers to capture real traffic instead.

- [x] **Middleware SDK** *(priority)* - Tiny npm package (`reqly-middleware`) added once to Express/Fastify/Next.js. Captures every inbound request server-side, forwards a copy to the local Reqly instance. Works for all traffic: browser, mobile, webhooks, server-to-server. One line: `app.use(reqlyMiddleware())`. Works for local dev only (middleware phones home to `localhost:4242` - production capture requires the webhook tunnel from M4). Once shipped, update `README.md` and `llms.txt` to document this as a capture option alongside the AI-writes-collection workflow.

- [ ] **Chrome Extension** *(lower priority, after middleware)* - Intercepts XHR/fetch via `chrome.webRequest` API, sends copies to `localhost:4242/capture`. Zero code change. Works for any hosted app the developer browses. Limitation: browser traffic only - no mobile, webhooks, or server-to-server.
- [ ] expert evel request chainin like soap ui

**Note on the current proxy:** the existing auto-capture proxy (M3) captures OUTBOUND calls - what the user's app sends to external APIs (Stripe, Shopify, etc.). M5 is the complement: what comes IN.

---

## Later: Team Secrets Layer

**Why not M4:** Collections are YAML in git - teams already sync them via `git pull`. What can't go in git is secrets: auth tokens, environment variable values (API keys, passwords). A secrets layer syncs those across teammates' machines. This is a harder product (encryption at rest, access controls, SOC 2 territory) and a real paid tier - but only worth building once the core tool has users. Not "cloud sync of collections" - that's redundant with git.

- [ ] **Team Secrets Vault** - Sync auth profiles and environment variable secret values across a team. Encrypted at rest. Access-controlled per team member. First true cloud infrastructure Reqly needs.

---

## Later: Protocol Expansion

**Why post-M4:** REST is table stakes and already solid. These protocols are used by a smaller audience and each needs its own UI paradigm. Ship them once the core product is proven.

- [ ] **WebSocket / SSE** - Persistent connections with a live message stream panel. Send messages, see server pushes in real time. Stored in collections as `type: websocket` requests.
- [ ] **MQTT / Socket.IO** - Additional realtime protocol support for IoT and event-driven apps.
- [ ] **Multipart body editor** - File upload support with per-part content types, filename, and mime type. Essential for testing file upload endpoints.
- [ ] **Shared requests** - URL-shareable requests with embed options - useful for sharing a repro case with a teammate or filing a bug report.
