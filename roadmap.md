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
- [ ] **Import from Postman/Bruno** - Import existing collections instantly. Biggest switching cost removed. High-leverage for growth.
- [ ] **Response Diffing** - Show what changed between the last run and this run. Detect silent API contract breaks. No other tool does this well.
- [ ] **GraphQL Support** - First-class GraphQL alongside REST. Single `POST /graphql` execution through the same HTTP Executor (done). Schema introspection (done). Query editor in the UI with syntax highlighting and autocomplete from the schema (done) - lives in its own nav-rail workspace, not the REST editor (T-053). Variables panel (done). Remaining: persist GraphQL requests to collection YAML typed as `graphql`, and have MCP tool `run_request` handle GraphQL transparently. Targets developers hitting GitHub, Shopify, Linear, and other GraphQL APIs.
- [ ] **Webhook Testing** - Expose a temporary public URL that captures incoming webhook payloads. Essential for testing Stripe, Shopify, and other inbound webhooks locally.
- [ ] **OAuth 2.0 Flow** - Full authorization code flow support, not just token storage. Auto-refresh tokens.

---

## Later: Team Secrets Layer

**Why not M4:** Collections are YAML in git - teams already sync them via `git pull`. What can't go in git is secrets: auth tokens, environment variable values (API keys, passwords). A secrets layer syncs those across teammates' machines. This is a harder product (encryption at rest, access controls, SOC 2 territory) and a real paid tier - but only worth building once the core tool has users. Not "cloud sync of collections" - that's redundant with git.

- [ ] **Team Secrets Vault** - Sync auth profiles and environment variable secret values across a team. Encrypted at rest. Access-controlled per team member. First true cloud infrastructure Reqly needs.
