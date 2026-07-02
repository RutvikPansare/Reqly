# Copilot Instructions for Reqly

> Keep CLAUDE.md and GEMINI.md in sync. These two files mirror the same project rules for different AI agents. When you change a shared section in one (repo structure, roadmap, project management, testing, ways of working, living docs, general rules), apply the same change to the other in the same commit.

## What this project is

Reqly is a prompt-first, agent-native API client. It is a local background service that developers install once and run alongside their projects. It exposes two interfaces from the same engine:

1. **MCP server (stdio)** - AI coding agents (Cursor, Claude Code, Windsurf) call Reqly's tools directly to fire requests, manage collections, and verify API behaviour. Zero UI, zero LLM cost on our side.
2. **Localhost web UI** - Humans open `localhost:4242` to browse collections and run requests visually. No AI logic is built into the UI.

Collections are YAML files in `.reqly/` inside the user's project directory - git-native, human-readable.

**Reqly contains no AI logic.** The server fires HTTP requests and manages YAML files. There are no LLM calls anywhere in the codebase. Do not add LLM calls to the server, routes, or engine.

## Repo organization

| File | What it's for |
|------|---------------|
| `knowledge.md` | What Reqly is, target users, principles. Slow-moving reference. |
| `roadmap.md` | Milestones and current focus. Single source of truth for direction. |
| `docs/todo.md` | **Queued tasks. Read before starting any planned work.** |
| `docs/done.md` | Archive of completed tasks. Append-only history. |
| `docs/architecture.md` | System design, module structure, data flow. |
| `docs/decision-log.md` | Why we made key product and tech decisions. |

Read `roadmap.md` before picking up planned work or discussing next features.

## Commands

```bash
npm run dev       # run server in dev mode (tsx, no build)
npm run build     # tsc + build UI + copy to dist/
npm test          # run all tests with vitest
npm start         # run from dist/ (after build)

# Run a single test file:
npx vitest run src/engine/collection-manager.test.ts

# CLI subcommands (via npm run dev or the built binary):
reqly setup
reqly use <model>
reqly status
reqly stop
reqly run <collection>
reqly exec <command>
```

## Architecture

### Module layout

- `src/engine/` - Core primitives: HTTP executor, collection manager, environment manager, auth manager, proxy, variable substitutor, assertion runner, response/history stores. **All files here require TDD - write the test first.**
- `src/mcp/` - MCP server + tool handlers. Each tool is a file in `src/mcp/tools/` exporting a `definition` (name, description, inputSchema) and a `handler(args, context)`. **All files here require TDD.**
- `src/server/` - Express server (`express.ts`), CLI entry point (`index.ts`), CLI subcommand handlers, and process lock management (`lock.ts`).
- `src/ui/` - React + Tailwind app. Has its own `package.json` and build; built separately and copied to `dist/ui/`.
- `src/types/` - Shared TypeScript interfaces (`Collection`, `RequestConfig`, `Environment`, `AuthProfile`, `Assertion`, `HttpResponse`).

### Key data flow

1. `src/server/index.ts` - entry point. Parses CLI args, instantiates engine classes, assembles `EngineContext`, starts both the MCP stdio server and the Express server.
2. `EngineContext` (defined in `src/mcp/tools/types.ts`) is the single dependency container passed to every MCP tool handler. It holds instances of all engine classes.
3. MCP tools call engine classes directly via `context`. The Express REST API (`src/server/express.ts`) calls the same engine classes via the same `context`.
4. Variable substitution uses `{{variableName}}` syntax. Cross-request chaining uses `{{requestName.response.fieldPath}}`, resolved via `ResponseStore`.

### Collection storage structure

```
<project>/.reqly/
  <collection-name>/
    <request-name>.yaml    # one file per request
  environments.yaml        # all environments in one file
```

### Singleton server with project switching

Only one Reqly process owns the Express server at a time. A lock file at `~/.reqly/running.json` tracks `{pid, projectDir, port}`. When a second instance starts, it detects the live lock, sends a `POST /api/switch-project` to the running instance, then starts in `mcpOnly` mode (MCP stdio only, no Express). Test files that read/write this lock run serially (`fileParallelism: false` in `vitest.config.ts`).

### Adding a new MCP tool

1. Create `src/mcp/tools/<tool-name>.test.ts` with tests against `definition` and `handler`.
2. Create `src/mcp/tools/<tool-name>.ts` exporting `definition: ToolDefinition` and `handler(args, context)`.
3. Import and add it to the `tools` array in `src/mcp/server.ts`.
4. Tool descriptions must tell an agent exactly what the tool does, when to use it, and what it returns. They are not optional.

## Key conventions

### TDD is mandatory for engine and MCP code

Pragmatic TDD - Red -> Green -> Refactor:
- **Mandatory for `src/engine/` and `src/mcp/`:** Write the failing test first, then implement minimal code to pass, then refactor. Never write implementation before a test exists.
- **Flexible for UI (`src/ui/`):** Pure UI components may use visual verification.

**Testing pyramid:**
- **Level 1 - Engine logic (High Priority):** 100% TDD for `src/engine/` and `src/mcp/`. HTTP execution, YAML parsing, variable substitution, auth injection.
- **Level 2 - MCP tool contracts (High Priority):** Each tool must have tests asserting its input/output schema is correct. Agents depend on these being stable.
- **Level 3 - UI interactions (Medium Priority):** Interaction testing for key flows (fire request, switch environment, save collection).

### All imports use `.js` extensions

TypeScript is compiled with `"module": "NodeNext"`, so all local imports must end in `.js` even when the source file is `.ts`:
```ts
import { CollectionManager } from '../engine/collection-manager.js';
```

### Path alias `@/*` maps to `src/*`

Defined in `tsconfig.json`. Use it for cross-package imports to avoid deep relative paths.

### Tool handlers return `ToolHandlerResult`

```ts
{ content: [{ type: 'text', text: JSON.stringify(data) }] }          // success
{ content: [{ type: 'text', text: errorMessage }], isError: true }   // error
```

Never return freeform unstructured text from a tool handler - agents parse these responses programmatically.

### MCP tool schemas are a public API

- Never rename a tool without a deprecation period.
- Never remove a required parameter without bumping the tool version.
- Schema changes that break existing agent integrations must be treated as breaking changes.

### UI aesthetic and reference

Dark-mode first. No `box-shadow` - use 1px borders and background contrast for depth. No gradients. Minimal and developer-focused - no marketing chrome.

The `example/hoppscotch/` folder contains a clone of the Hoppscotch open source API client (MIT licensed). Use it as a **visual and component reference only**:
- Match Hoppscotch's layout patterns, spacing, and interaction design where possible
- Do NOT copy their Vue components directly - Reqly's UI is React
- Do NOT copy their HTTP execution, collection storage, or auth logic - Reqly has its own engine
- Useful reference: `example/hoppscotch/packages/hoppscotch-common/src/components/`
- The goal is a UI that feels as polished as Hoppscotch, built on top of Reqly's own `/api/*` endpoints

### Config and secrets

- Global config: `~/.reqly/config.json` (active project, `maxBodyBytes`).
- Never log or store the user's API key anywhere in the repo or server.

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

Tasks in `docs/todo.md` are flexible. A single line is fine for simple work. Add bullets when context is needed:

```md
- [ ] **T-005** Auto-capture proxy (M3)
  - Local proxy between dev's app and the internet
  - Watches HTTP traffic, auto-builds collection entries
  - Zero manual request writing required
```

### Spec docs

For genuinely complex features (non-obvious design decisions, data format changes, multi-module coordination), create `docs/tasks/T-NNN.md`. Most tasks don't need one - use judgment.

### Decisions

When a non-obvious product or architecture call is made, append it to `docs/decision-log.md` (date, decision, why) so the reasoning isn't lost.

## Ways of working (MANDATORY)

These apply to every code change. No exceptions for "small" changes.

### Execution flow

- **NEVER Act on Your Own:** ALWAYS ask for explicit permission before starting a new queued task, building a new feature, or making any product or technical decisions that weren't specifically requested.
- **Checkpoints:** Pause for confirmation before large or hard-to-reverse changes (breaking MCP tool schema changes, collection format changes, config file format changes). Complete explicitly requested tasks, then report and wait.
- **Small Steps:** Work in incremental, verified chunks with focused commits.
- **Verification:** Run `npm test` after every logical change.

### Definition of Done

Before declaring any task "complete", confirm living docs are updated:
- [ ] `todo.md` (removed task)
- [ ] `done.md` (added task)
- [ ] `knowledge.md` (updated if task added or changed a user-facing feature)
- [ ] `docs/decision-log.md` (logged any new architecture calls)
- [ ] `roadmap.md` (checked if milestone is now complete, promoted next if so)

### Living Docs (MANDATORY)

Keep the planning docs current on every task. Update them in the same change as the code, before suggesting the commit.

1. **`roadmap.md`:** Any time a feature's direction or scope changes, update the milestone it belongs to. When a task completes, check if all remaining items for the current "Now" milestone are done - if so, mark it complete and promote the next milestone to "Now".

2. **`docs/todo.md` + `docs/done.md`:** On completion, check the box and cut the task line into `docs/done.md` under today's date (newest first). After updating `done.md`, check `knowledge.md` and update the "What's built" section if the task added or changed a user-facing feature.

3. **`docs/decision-log.md`:** Any time a decision is made (technical, product, or process), append an entry with: date, the decision, and why it was taken. Newest entries at the top.

## Typography rule

No em dashes anywhere in code, comments, or documentation. Use hyphens (-) or colons (:) instead.
