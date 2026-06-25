# Reqly - Done

## 2026-06-25

- [x] **T-075** Response Diffing (M4) - `src/engine/response-differ.ts` with `diffResponses(prev, curr): ResponseDiff` comparing status, latency delta, and body changes. JSON object bodies get top-level key diff (added +, removed -, changed ~); non-JSON falls back to set-based line diff. `HistoryEntry` extended with `body?: string` (truncated to 10 KB); `HistoryStore.getLastTwo(requestName)` returns the two most recent entries for a request. `run_request` MCP tool computes and returns `diff` when a prior run exists. `POST /api/run/adhoc` likewise returns `diff`. UI `ResponseViewer` shows a yellow "Diff" tab when changes are detected; green lines for additions, red for removals, yellow for changes. 24 new tests - all 185 tests pass.
- [x] **T-074** Import from Postman/Bruno (M4) - `src/engine/importer.ts` with `parsePostman`, `parseBruno` (brace-depth parser handles nested JSON in `body:json` blocks), `importFromFile` (CLI/MCP - file path), and `importFromContent` (UI - raw string). `import_collection` MCP tool (`src/mcp/tools/import-collection.ts`) registered in `src/mcp/server.ts`. `reqly import <file>` CLI sub-command (`src/server/import-command.ts`) auto-detects format from extension. `POST /api/import` Express route. UI `CollectionsPanel` gains an Upload icon button that opens a file picker (`<input type="file" accept=".json,.bru">`), reads the file with `FileReader`, posts to `/api/import`, and reloads the sidebar on success. 30 new tests across engine and MCP tool - all 166 tests pass.

## 2026-06-24

- [x] **T-073** Webhook Testing (M4) - `localtunnel` integration with `TunnelManager` tracking the active proxy. Added endpoints `POST /api/tunnel/start` and `/stop` to expose `localhost:4242` publicly (`xxxx.loca.lt`). `ALL /webhooks/*` catcher endpoint intercepts incoming external requests (like Stripe webhooks) and automatically saves them as timestamped entries in the "Webhooks" collection. `CapturePanel` UI updated to feature a tabbed interface ("Outbound" and "Webhooks") offering immediate copy-paste public webhook URLs for external service configs.
- [x] **T-072** Variable Autocomplete in UI inputs - A generic `<VariableInput>` component replaces text inputs and textareas in `RequestEditor` and `KeyValueEditor`, providing a `{{` triggered autocomplete dropdown that filters available environment variables.
- [x] **T-071** Fix "Save" for new requests - "Save to collection" picker replaced the alert with a small modal, handles default request names, and updates tab.id seamlessly upon saving to avoid duplicates on sidebar clicks.
- [x] **T-070** Middleware SDK shipped in three parts. (1) `packages/reqly-middleware/` - new npm package exporting `reqlyMiddleware()` (Express), `reqlyMiddlewareHook()` (Fastify), and `reqlyNextMiddleware()` (Next.js, `reqly-middleware/next`); fires non-blocking `POST {endpoint}/inbound` with `{method, url, headers, body, collection, timestamp}`, swallows all fetch errors, filters `ignoreRoutes`. Backend: `POST /capture/inbound` added to `src/server/express.ts`, dedupes by method+url and saves into the named collection via `CollectionManager` (same shape as proxy captures). Root `package.json` gained `"workspaces": ["packages/*"]`; root `vitest.config.ts` include extended to `packages/**/*.test.ts`. (2) `install_middleware` MCP tool (`src/mcp/tools/install-middleware.ts`) - reads the project's `package.json` deps (via new `CollectionManager.getBaseDir()`), detects Next/Fastify/Express, returns `{framework, installCommand, snippet, file, note}`; registered in `src/mcp/server.ts`. (3) MCP server top-level `description` (read by every agent at connect, before any tool call) now lists all Reqly capabilities and proactive-suggestion rules; `reqly://workflow` resource rewritten to combine a REQLY FEATURES list with PRIMARY/SECONDARY/TERTIARY workflows and proactive-suggestion triggers; README and llms.txt updated with the inbound-middleware install steps and tool tables.
- [x] **T-069** Rewrote `description` on every MCP tool definition (`src/mcp/tools/*.ts`) to state what the tool does, a "When to use" line, and a "Preferred pattern" line where relevant - so agents read the correct workflow at connect time instead of guessing (most default to traffic capture first). Added a new `reqly://workflow` resource (`src/mcp/server.ts`) returning a plain-text guide ranking codebase-read as PRIMARY and proxy capture as SECONDARY. New test `src/mcp/server.test.ts` asserts the resource is registered and returns the guide text.
- [x] **T-067** `reqly exec <command>` CLI sub-command (`src/server/exec-command.ts`) and `exec_with_proxy` MCP tool (`src/mcp/tools/exec-with-proxy.ts`) - both start the auto-capture proxy and run the dev command with `HTTP_PROXY`/`HTTPS_PROXY` injected, eliminating the manual env-var step. CLI version runs in the foreground (`stdio: 'inherit'`, forwards SIGINT, stops proxy + prints capture summary on exit). MCP version spawns detached (logs to `~/.reqly/exec.log`), always tries to spawn itself first and only returns a `fallbackCommand` if spawning fails. `stop_proxy` now also kills the tracked exec child (process-group kill via negative pid, falls back to direct pid). Deviation from spec: the child pid is tracked in-memory on `EngineContext.execChildPid` rather than written into the shared `~/.reqly/running.json` lock file - the lock file is the *single* Express-owning process, but `exec_with_proxy` can run from an MCP-only stdio session too (T-066), so writing the child pid into the shared lock would corrupt the owning instance's state for an unrelated session. Also added `vitest.config.ts` `fileParallelism: false` - lock/switch-project/stop-command tests all read/write the real `~/.reqly/running.json` and raced under parallel file execution.
- [x] **T-068 (part 1)** README.md and llms.txt now headline the AI-writes-collection workflow ("Read my Express routes and build a Reqly collection for every endpoint") right after Quick Setup/Install, ahead of the proxy/capture flow. Also synced both docs' MCP tool tables with `create_environment`, `set_variable`, `get_variables`, `delete_variable`, `get_response_full` (previously undocumented). Middleware SDK section remains queued in todo.md, blocked on M5.
- [x] **T-066** Single-instance enforcement with live project switching - `src/server/lock.ts` (lock file at `~/.reqly/running.json`: pid/projectDir/port/startedAt), `POST /api/switch-project` hot-swaps `context.collectionManager`/`environmentManager` on the running instance, `POST /api/shutdown` for graceful remote stop, startup detect-and-delegate logic in `src/server/index.ts` (switches the running instance then starts its own MCP-only stdio server instead of exiting or fighting for port 4242), stale-lock cleanup via `isProcessAlive`, new `reqly stop` CLI command (`src/server/stop-command.ts`)
- [x] **T-065** `reqly use <path>` + `reqly status` commands - `activeProject` field in `~/.reqly/config.json` as final fallback in the project-dir resolution chain (flag > env var > config > cwd), for hosts like Claude Desktop with no per-project launch context
- [x] **T-064** Add `REQLY_PROJECT_DIR` env var fallback for project root resolution (fixes ENOENT when MCP host launches reqly with wrong cwd)
- [x] **T-062** Response truncation for large payloads (MCP + engine)
- [x] **T-063** MCP tools for environment and variable management
- [x] **T-061** AI-readable README and llms.txt
- [x] **T-060** `reqly setup` - one-command MCP configuration
- [x] **T-059** npm package publishing setup
- [x] **T-058** CI-friendly output reporters
- [x] **T-057** `reqly run` - CLI collection runner with output and exit codes
- [x] **T-056** CLI sub-command routing
- [x] **T-055** UI icon and styling refresh - Lucide React throughout, pill method badges, nav rail active chip
- [x] **T-054** Widen search bar in top bar, reposition left-of-center
- [x] **T-053** Move GraphQL to dedicated nav rail section (full workspace)
- [x] **T-052** Remove prompt bar and strip BYOK from settings
- [x] **T-051** GraphQL IDE Autocomplete (CodeMirror + cm6-graphql)
- [x] **T-050** Fix URL input field flickering by updating React useEffect dependencies
- [x] **T-049** UI state persistence across page refreshes (M4 UI)
- [x] **T-048** Visual polish pass - match Hoppscotch aesthetic (M4 UI)
- [x] **T-047** GraphQL mode in request editor (M4 UI)
- [x] **T-046** Variables tab in request editor (M4 UI)
- [x] **T-045** Request tabs - polish and closeable (M4 UI)
- [x] **T-044** Search / command palette (M4 UI)
- [x] **T-049** Fix and update Anthropic API key in settings
- [x] **T-043** Request history panel + backend (M4 UI)
- [x] **T-042** Collection manager UI - full CRUD from sidebar (M4 UI)
- [x] **T-041** Environment editor - full CRUD in UI (M4 UI)
- [x] **T-040** Left icon navigation rail (M4 UI)
- [x] **T-034** Add graceful shutdown handlers for Express and proxy servers

## 2026-06-23

- [x] **T-033** Add multiple tabs feature to the UI
- [x] **T-032** Fix server hang by cleaning up dangling Node processes on port 4242
- [x] **T-031** Fix CLI collection path and UI static asset resolution
- [x] **T-025** Request Chaining - response context store
- [x] **T-024** UI: Collection Runner panel
- [x] **T-023** UI: Assertions editor
- [x] **T-022** UI: Proxy capture panel
- [x] **T-021** Collection Runner (`src/engine/collection-runner.ts`)
- [x] **T-020** Auto-Capture Proxy (`src/engine/proxy.ts`)
- [x] **T-019** Test Assertions engine (`src/engine/assertion-runner.ts`)
- [x] **T-018** Prompt Bar Component
- [x] **T-017** Settings Panel Component
- [x] **T-016** Environment Switcher Component
- [x] **T-015** Response Viewer Component
- [x] **T-014** Request Editor Component
- [x] **T-013** Sidebar Component
- [x] **T-012** Express Server & UI Serving (`src/server/express.ts`)
- [x] **T-011** Setup UI Project Scaffold (React + Tailwind CSS) (`src/ui/`)
- [x] **T-010** CLI entry point (`src/server/index.ts`)
- [x] **T-009** MCP Server (`src/mcp/server.ts` + `src/mcp/tools/`)
- [x] **T-008** Auth Manager (`src/engine/auth-manager.ts`)
- [x] **T-007** Environment Manager (`src/engine/environment-manager.ts`)
- [x] **T-006** Collection Manager (`src/engine/collection-manager.ts`)
- [x] **T-005** Variable Substitutor (`src/engine/variable-substitutor.ts`)
- [x] **T-004** HTTP Executor (`src/engine/http-executor.ts`)
- [x] **T-003** Shared TypeScript types (`src/types/`)
- [x] **T-002** Project scaffold
- [x] **T-001** Rename: AgentMan -> Reqly (all doc references updated)
- [x] **T-000** Initial project setup and roadmap definition.

### 2026-06-23

- [x] **T-026** Sidebar - functional collection tree
- [x] **T-027** Top bar - environment switcher + settings icon
- [x] **T-028** Auth tab - complete editor
- [x] **T-029** Response Viewer - complete implementation
- [x] **T-030** Prompt bar - wire up and make visible
