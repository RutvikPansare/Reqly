# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-005** Variable Substitutor (`src/engine/variable-substitutor.ts`)
  - Follow TDD: write `src/engine/variable-substitutor.test.ts` first
  - `substitute(template: string, variables: Record<string, string>): string`
  - Replaces all `{{varName}}` occurrences with values from the variables map
  - Unknown variables are left as-is (do not throw)
  - `substituteConfig(config: RequestConfig, variables: Record<string, string>): RequestConfig` - applies substitution to url, headers, body (if string), and query params
  - Pure function - no side effects, no file I/O
  - Extracted as its own module (DRY: reused by executor and future request chaining)

- [ ] **T-006** Collection Manager (`src/engine/collection-manager.ts`)
  - Follow TDD: write `src/engine/collection-manager.test.ts` first (use temp dirs via `os.tmpdir()`)
  - `CollectionManager` class - takes a `baseDir` (path to `.reqly/collections/`) in constructor (DI, testable)
  - `createCollection(name: string): Promise<Collection>`
  - `getCollection(name: string): Promise<Collection>`
  - `listCollections(): Promise<Collection[]>`
  - `addRequest(collectionName: string, req: CollectionRequest): Promise<void>`
  - `getRequest(collectionName: string, requestName: string): Promise<CollectionRequest>`
  - `deleteRequest(collectionName: string, requestName: string): Promise<void>`
  - Each collection is a folder under `baseDir/`, each request is a `<name>.yaml` file inside it
  - YAML serialization via `js-yaml`
  - Throws typed errors: `CollectionNotFoundError`, `RequestNotFoundError`

- [ ] **T-007** Environment Manager (`src/engine/environment-manager.ts`)
  - Follow TDD: write `src/engine/environment-manager.test.ts` first
  - `EnvironmentManager` class - takes `configPath` in constructor (path to `.reqly/environments.yaml`)
  - `createEnvironment(name: string, variables: Record<string, string>): Promise<Environment>`
  - `getEnvironment(name: string): Promise<Environment>`
  - `listEnvironments(): Promise<Environment[]>`
  - `setActiveEnvironment(name: string): Promise<void>`
  - `getActiveEnvironment(): Promise<Environment | null>`
  - `updateVariable(envName: string, key: string, value: string): Promise<void>`
  - All environments stored in a single `environments.yaml` file with an `active` field
  - SOLID: no knowledge of HTTP execution or collections

- [ ] **T-008** Auth Manager (`src/engine/auth-manager.ts`)
  - Follow TDD: write `src/engine/auth-manager.test.ts` first
  - `AuthManager` class - takes `configPath` (path to `~/.reqly/config.json`) in constructor
  - `createProfile(profile: Omit<AuthProfile, 'id'>): Promise<AuthProfile>`
  - `getProfile(id: string): Promise<AuthProfile>`
  - `listProfiles(): Promise<AuthProfile[]>`
  - `deleteProfile(id: string): Promise<void>`
  - Stored in `~/.reqly/config.json` under `authProfiles` key
  - Never logs or exposes credential values in error messages
  - SOLID: auth storage only - no HTTP logic

- [ ] **T-009** MCP Server (`src/mcp/server.ts` + `src/mcp/tools/`)
  - Follow TDD: write tool contract tests in `src/mcp/tools/*.test.ts` first - assert input schema, output shape
  - `src/mcp/server.ts`: initialise `McpServer` from `@modelcontextprotocol/sdk`, register all 7 tools, connect stdio transport
  - One file per tool in `src/mcp/tools/`: `run-request.ts`, `create-request.ts`, `create-collection.ts`, `list-collections.ts`, `set-environment.ts`, `run-collection.ts`, `get-response.ts`
  - Each tool file exports: `definition` (name, description, inputSchema) and `handler(args, engine) -> Promise<ToolResult>`
  - `engine` is a dependency-injected object containing instances of all engine modules (DI - testable without stdio)
  - Tool descriptions must be precise enough for an AI agent to call correctly with no docs
  - All tools return structured JSON - no freeform text
  - `get-response` stores last response per request name in memory (simple Map cache)
  - Run collection sequentially, stop on first error, return per-request pass/fail summary

- [ ] **T-010** CLI entry point (`src/server/index.ts`)
  - Wire together all engine modules and MCP server
  - Read `.reqly/` path from cwd (where the developer runs `reqly`)
  - Instantiate `CollectionManager`, `EnvironmentManager`, `AuthManager` with correct paths
  - Start MCP server on stdio
  - `package.json` `bin` field: `"reqly": "dist/server/index.js"`
  - After build: `reqly` command available globally via `npm link` or `npm install -g`
  - No UI yet - stdio MCP only for M1

## Backlog
