# Reqly - Done

<!--
This is the WORK layer: an append-only archive of completed tasks.
When a task on docs/todo.md is finished, cut its line here under today's date.
Newest date first. Don't edit history - only append.
-->

## 2026-06-24
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
