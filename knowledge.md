# Reqly - Knowledge Base

<!--
This is the CONTEXT layer: what Reqly is and what we believe.
Reference material - slow-moving. Read it to stay aligned; don't churn it.
For what to build next, see the Roadmap section in CLAUDE.md / GEMINI.md (direction) and docs/todo.md (active work).
-->

## Core Philosophy
Reqly is an execution engine, not an AI product. The AI always lives outside Reqly. Its job is to expose reliable, well-typed tools that any AI agent can call.

- **Tool-First:** If it can't be called via MCP, it doesn't exist.
- **Dumb Server:** The server fires HTTP requests and manages files. No LLM logic.
- **Plain Text:** Collections are YAML. No binary formats.

## Architecture
- **Runtime:** Node.js + TypeScript
- **Server:** Express/Fastify serving MCP stdio interface and localhost web UI.
- **UI:** React, served as static build.
- **Config:** `~/.reqly/config.json` for global settings (reserved for future preferences - no BYOK key, agents talk to Reqly via MCP).

## What's Built
- **Core Engine:** HTTP execution, Collection Management (YAML), Environment substitution, Auth profiles.
- **MCP Server:** Tools to create, list, run requests/collections, and manage proxy.
- **Local UI:** Left icon navigation rail (Collections / Environments / History / Capture / Settings) driving switchable sidebar panels, Request Editor with params/headers/body/auth/assertions, Response Viewer with syntax highlighting and assertions results, Settings panel (placeholder for future preferences), Multiple Tabs support for parallel editing.
- **Differentiators:** 
  - **Auto-Capture Proxy:** Captures live traffic and saves requests.
  - **Test Assertions:** Verify response status, latency, and JSON body paths.
  - **Collection Runner:** Sequentially run all requests in a collection with pass/fail tracking.
  - **Request Chaining:** Downstream requests can access previous response data via `{{requestName.response.path}}`.
- **Environment Editor:** Full CRUD for environments and variables from the UI nav rail - create, rename-by-recreate, edit variables inline, delete with confirmation. Backed by `POST/PUT/DELETE /api/environments`.
- **Collection Manager UI:** Full CRUD from sidebar - right-click context menus on collections (Add Request, Rename, Delete) and requests (Rename, Duplicate, Delete), inline rename via Enter/Escape, +New collection input. Backed by existing `/api/collections` CRUD endpoints.
- **Request History:** In-memory log (last 200) of every fired request - timestamp, method, URL, status, latency. History panel in nav rail lists newest first, click to load request into editor, Clear button. Backed by `GET/DELETE /api/history`. Appended on adhoc runs, MCP `run_request`, and collection runs.
- **Search / Command Palette:** ⌘K / Ctrl+K overlay searches across collection names, request names, and URLs. Keyboard-navigable (arrow keys, Enter, Escape). Results grouped by type, click opens request in editor. Runs over in-memory `GET /api/collections` - no backend search index. Trigger button in the top bar is a wide (`w-72`) pill sitting left-of-center, not crammed against Settings.
- **Request Tabs:** Closeable X buttons, unsaved-changes dot indicator (per-tab saved snapshot diff), active-tab blue underline, left/right scroll arrows for overflow. Live edits flow back from RequestEditor via `onChange` for dirty tracking.
- **Variables Tab:** Read-only tab in the request editor showing the active environment's variables (Key as `{{name}}`, Value, source = active env name). Helps debug unresolved variables. Editing stays in the Environments panel.
- **GraphQL Workspace:** Dedicated nav rail icon (between History and Capture) opens a full-area GraphQL workspace (`src/ui/src/components/GraphQLWorkspace.tsx`), replacing the REST tab bar/editor entirely rather than living inside it. URL bar, Query editor (CodeMirror, schema-aware highlighting once introspected) + Variables sub-tab (JSON), Introspect button, Send button, and a Response panel (reuses `ResponseViewer`). State is local to the workspace - GraphQL requests are not REST collection items and do not appear in the Collections sidebar or get saved to YAML. On Send it assembles `{ query, variables }` as the request body via the same `/api/run/adhoc` endpoint REST requests use - the HTTP executor stringifies object bodies and sets `Content-Type: application/json` transparently, so no executor or MCP changes were needed. The REST `RequestEditor` no longer has any GraphQL mode or toggle.
- **Visual Polish:** Shared `lib/colors.ts` helpers enforce a consistent Hoppscotch palette across all panels - method badges (GET=#22c55e, POST=#eab308, PUT=#3b82f6, PATCH=#f97316, DELETE=#ef4444, rendered as pills via `methodBadgeClass`/`METHOD_BADGE_BASE`) and status badges (2xx green, 3xx blue, 4xx yellow, 5xx red). Replaced per-component inline color switches in CollectionsPanel, HistoryPanel, SpotlightSearch, CapturePanel, App tab bar, and ResponseViewer. All icons across the app (nav rail, tab close/new, send/save, tree expand arrows, environment edit/delete, key-value enable/remove, response spinner) use Lucide React (`lucide-react`) instead of hand-rolled inline SVG. Nav rail active state is a colored chip (`bg-blue-500/10` rounded square) plus left accent bar, not just a color swap.
- **UI State Persistence:** Open tabs, active tab, and active nav panel persist across page refreshes via a debounced `useLocalStorage` hook (`src/ui/src/hooks/useLocalStorage.ts`). Tabs are sanitized before writing - response bodies and auth credentials are stripped (ephemeral / sensitive). Active environment already persists server-side in `environments.yaml` (`store.active`), so no config.json change was needed.
- **CLI Runner & Distribution:** Added `reqly run <collection>` for headless execution with JSON and TAP reporters for CI/CD integration. The engine is fully installable globally via `npm install -g reqly` and features a `reqly setup` command to natively configure MCP servers in Cursor and Claude without manual JSON editing.
