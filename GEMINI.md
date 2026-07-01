# Reqly Project Instructions

This file contains foundational mandates for the Reqly codebase. All AI agents and developers must adhere to these conventions.

> **Keep CLAUDE.md and GEMINI.md in sync.** These two files mirror the same project rules for different AI agents. When you change a shared section in one (repo structure, roadmap, project management, testing, ways of working, living docs, general rules), apply the same change to the other in the same commit.

## What Reqly is

Reqly is a prompt-first, agent-native API client. It is a local background service that developers install once and run alongside their projects. It exposes two interfaces from the same engine:

1. **MCP server (stdio)** - AI coding agents (Cursor, Claude Code, Windsurf) call Reqly's tools directly to fire requests, manage collections, and verify API behaviour. Zero UI, zero LLM cost on our side.
2. **Localhost web UI** - Humans open `localhost:4242` to browse collections, run requests visually, and use a prompt bar (BYOK) to describe what they want. The LLM is the user's own, on their own API key.

Collections are stored as YAML files in `.reqly/` inside the user's project directory. They live alongside the code and travel with the repo via git.

Reqly does not host AI. It is an execution engine with an MCP interface. The intelligence always lives in the user's AI agent or their own API key.

## How this repo is organized

| File | What it's for |
|------|---------------|
| `knowledge.md` | What Reqly is, target users, principles. Slow-moving reference. |
| `roadmap.md` | Milestones and current focus. Single source of truth for direction. |
| `docs/todo.md` | **Queued tasks. Read before starting any planned work.** |
| `docs/done.md` | Archive of completed tasks. Append-only history. |
| `docs/architecture.md` | System design, module structure, data flow. |
| `docs/decision-log.md` | Why we made key product and tech decisions. |

## Roadmap

See `roadmap.md` for milestones, current focus, and what's remaining. Read it before picking up planned work or discussing next features.

## Project management

### Task IDs
Format `T-NNN`. Never reuse an ID. Increment from the highest ID found in either `docs/todo.md` or `docs/done.md`.

### Workflow

**Ad-hoc / single-session work (most common):**
1. Do the work.
2. Append to `docs/done.md` under today's date with a fresh `T-NNN`.
3. Reference the ID in the commit message (e.g. `T-014: add collection runner`).

**Planned work (from todo.md):**
1. Read `roadmap.md` to understand current focus, then read `docs/todo.md`. Pick the top queued task, unless directed otherwise.
2. Do the work.
3. On completion: check the box `[x]`, cut the line into `docs/done.md` under today's date, reference the ID in the commit.

**New work discovered mid-task:** add to `docs/todo.md` as a new `T-NNN` - don't silently expand scope. Before adding, check `docs/done.md` to confirm it hasn't already shipped.

**Multi-session work:** note progress inline in the todo item (e.g. `_in progress: done X, need Y_`).

### Task format
Tasks in `docs/todo.md` are flexible. A single line is fine for simple work. Add bullets when the agent needs context to implement without back-and-forth:

```md
- [ ] **T-005** Auto-capture proxy (M3)
  - Local proxy between dev's app and the internet
  - Watches HTTP traffic, auto-builds collection entries
  - Zero manual request writing required
```

### Spec docs
For genuinely complex features (non-obvious design decisions, data format changes, multi-module coordination), create `docs/tasks/T-NNN.md`. Most tasks don't need one - use judgment.

### Decisions
When we make a non-obvious product or architecture call, append it to `docs/decision-log.md` (date, decision, why) so the reasoning isn't lost.

## CORE ARCHITECTURAL PRINCIPLE: Tool-First, Engine Agnostic (MANDATORY)

**Read this before writing any feature.**

Reqly is an execution engine, not an AI product. The AI always lives outside Reqly - in the user's Cursor, their Claude Code, or their own BYOK API key. Reqly's job is to expose reliable, well-typed tools that any AI agent can call.

This means:

- **Every capability must be a tool first.** If it can't be called via MCP, it doesn't exist as a feature. The localhost UI is a visual wrapper around the same tools - it never has capabilities the MCP interface doesn't have.
- **No AI logic inside the engine.** The server fires HTTP requests and manages YAML files. It does not call any LLM. The only LLM calls in the codebase are in the UI's prompt bar, which forwards to the user's own API key.
- **Collections are plain text.** YAML files, human-readable, git-diffable. Never a proprietary binary format or a database-only format. A developer must be able to read, edit, and commit a collection with a text editor.
- **BYOK is non-negotiable.** The user's API key is stored in `~/.reqly/config.json` on their machine. It is never sent to our servers, never logged, never stored in the repo.

If you find yourself writing LLM logic into the server, a cron job, or a route handler - stop. The server is dumb by design. Keep it that way.

## Protocol Architecture Rule: Request/Response vs. Long-Lived Connections

This distinction is **mandatory reading before implementing any new protocol**.

### Request/Response protocols (REST, GraphQL, gRPC)
The server owns the full lifecycle. Engine class executes the request, returns a result. MCP tool and Express route both call the same engine. UI calls the Express route and renders the result. Standard Reqly pattern.

### Realtime protocols (WebSocket, SSE, Socket.IO, MQTT)
Connections are long-lived. A server-side proxy creates fatal problems: double-hop latency, sessions lost on server restart, doubled file descriptors. The correct split:

**For agents (MCP):** Buffered executor - connect → capture `captureTimeout` seconds → disconnect → return `{ messages, truncated }`. Lives in `src/engine/realtime-executor.ts`, exposed via MCP `run_realtime`. Stateless.

**For humans (UI):** Direct browser connections. No proxy through Reqly server.
- WebSocket + SSE: native browser APIs (`new WebSocket()`, `new EventSource()`), zero packages
- Socket.IO + MQTT: browser builds in `src/ui/package.json` only, never root `package.json`

Realtime requests ARE saved to collections as YAML (`type: websocket`, etc.) so agents can reference them via `run_realtime`.

## Tech stack


- **Runtime:** Node.js + TypeScript
- **Local server:** Express or Fastify serving the MCP stdio interface and the localhost web UI
- **UI:** React (served as static build from the local server at `localhost:4242`)
- **Styling:** Tailwind CSS
- **Collection format:** YAML files in `.reqly/` in the user's project directory
- **MCP SDK:** `@modelcontextprotocol/sdk` - handles stdio transport, tool registration, schema validation
- **HTTP client:** `undici` or native `fetch` for firing user API requests
- **Config storage:** `~/.reqly/config.json` for global settings (BYOK key, model preference)
- **Test framework:** Vitest
  - Run all tests: `npm test`
  - Single file: `npx vitest run src/lib/example.test.ts`
- **Path alias:** `@/*` -> `src/*`
- **Package layout:**
  - `src/server/` - local Express/Fastify server, MCP server, tool handlers
  - `src/engine/` - HTTP executor, collection manager, environment manager, auth manager
  - `src/ui/` - React app served at localhost:4242
  - `src/mcp/` - MCP tool definitions and schemas
  - `src/types/` - shared TypeScript types
- Test files live next to the code they test: `*.test.ts` / `*.test.tsx`

## UI Reference: Hoppscotch

The `example/hoppscotch/` folder contains a clone of the Hoppscotch open source API client (MIT licensed). Use it as a **visual and component reference only** when building `src/ui/`.

- Match Hoppscotch's layout patterns, spacing, and interaction design where possible
- Do NOT copy their Vue components directly - Reqly's UI is React
- Do NOT copy their HTTP execution, collection storage, or auth logic - Reqly has its own engine
- Useful references: `example/hoppscotch/packages/hoppscotch-common/src/components/` for component structure, and the live site at `hoppscotch.io` as a visual target
- The goal is a UI that feels as polished as Hoppscotch, built on top of Reqly's own `/api/*` endpoints

## Testing Standards

### 1. Colocation Policy
- Unit and integration tests must be colocated with the source code.
- Pattern: `path/to/File.ts` -> `path/to/File.test.ts`

### 2. The Testing Pyramid

1. **Engine logic (High Priority):** 100% TDD for `src/engine/` and `src/mcp/`. HTTP execution, YAML parsing, variable substitution, auth injection.
2. **MCP tool contracts (High Priority):** Each tool must have tests asserting its input/output schema is correct. Agents depend on these being stable.
3. **UI interactions (Medium Priority):** Interaction testing for key flows (fire request, switch environment, save collection).

### 3. What to Ignore (For Now)
- No snapshot testing - too brittle.
- No visual regression - manual check for styling.
- No exhaustive UI testing for static components.

## Ways of Working

### 1. Pragmatic TDD
- **Mandatory for engine and MCP code:** Red-Green-Refactor for all `src/engine/` and `src/mcp/` files.
- **Flexible for UI:** Manual verification is standard for styling.
- Never write implementation for engine/MCP files before a test exists.

### 2. Execution Flow
- **Small Steps:** Work in incremental, verified chunks with focused commits.
- **NEVER Act on Your Own:** ALWAYS ask for explicit permission before starting a new queued task, building a new feature, or making any product or technical decisions that weren't specifically requested.
- **Checkpoints:** Pause for confirmation before large or hard-to-reverse changes (breaking MCP tool schema changes, collection format changes, config file format changes).
- **Verification:** Run `npm test` after every logical change.

### 3. Definition of Done
Before declaring any task "complete", output a short checklist confirming living docs are updated:
- [ ] `todo.md` (removed task)
- [ ] `done.md` (added task)
- [ ] `knowledge.md` (updated if task added or changed a user-facing feature)
- [ ] `README.md` (updated if task added a new feature, tool, or changed install/usage - keep the MCP tools table and quick-start accurate)
- [ ] `docs/llms.txt` (updated if task added or changed any MCP tool, CLI command, or variable resolution behaviour - AI agents read this file to understand Reqly)
- [ ] `docs/decision-log.md` (logged any new architecture calls)
- [ ] `roadmap.md` (checked if milestone is now complete, promoted next if so)

### MCP Coverage Rule (MANDATORY)
Every new feature that adds data, a new operation, or changes script/variable behaviour MUST ship MCP tool coverage in the same task. Agents can only use what MCP exposes - a feature with no MCP tool is invisible to the agent ecosystem Reqly is built for.

Concretely:
- New response fields (e.g. `testResults`, `contractViolations`) must appear in the relevant MCP tool's return shape and be documented in the tool `description`.
- New operations (e.g. duplicate collection, export docs) must have a corresponding MCP tool or extend an existing one with a new parameter.
- Changes to variable resolution, script sandbox, or auth precedence must be reflected in the descriptions of any tool that invokes those paths (`run_request`, `run_collection`, `get_variables`, etc.).
- The tool `description` is the feature's API contract for agents. Treat it with the same discipline as a public API - never leave it stale.

### 4. General Principles
- Prefer simple, readable, maintainable code.
- Follow clean architecture and separation of concerns.
- Follow SOLID and DRY principles when writing code.
- If something is unclear, **ask instead of assuming**.

## MCP Tool Contract Rules (MANDATORY)

MCP tool schemas are a public API. AI agents depend on them being stable and well-typed.

- **Never rename a tool** without a deprecation period and a new tool name first.
- **Never remove a required parameter** without bumping the tool version.
- **Every tool must have a description** that tells an AI agent exactly what it does, what it expects, and what it returns.
- **Return structured, predictable shapes.** Freeform text responses are not acceptable for tool returns.

## Living Docs (MANDATORY)

Keep the planning docs current on every task. Update them in the same change as the code, before suggesting the commit.

### 1. `roadmap.md` (direction, always up to date)
- Any time a feature's direction or scope changes, update the milestone it belongs to.
- When a task completes, check `roadmap.md`. If all remaining items for the current "Now" milestone are done, mark it complete and promote the next milestone to "Now".

### 2. `docs/todo.md` + `docs/done.md` (work, always up to date)
- `todo.md` holds the queue of upcoming tasks.
- On completion, check the box and cut the task line into `docs/done.md` under today's date (newest first).
- After updating `done.md`, check `knowledge.md` and update the "What's built" section if the task added or changed a user-facing feature.

### 3. `docs/decision-log.md` (always up to date)
- Any time a decision is made (technical, product, or process), append an entry.
- Each entry records: date, the decision, and **why** it was taken (the reasoning/trade-off).
- Newest entries at the top.

## General Rules & Personalization
- **User Address:** Always address the user as Rutvik once per response. Avoid overusing the name in every sentence.
- **Typography:** No use of em dashes (-) anywhere in the project or documentation. Use standard hyphens (-) or colons (:).

## UI Aesthetic (for localhost UI)
- **Minimal and developer-focused.** No marketing chrome. No gradients. Dense information, clean typography.
- **Flat Design:** No `box-shadow`. Use 1px borders and background contrast for depth.
- **Dark-mode first** - developers keep their editors dark. The UI should match.
