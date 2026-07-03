# Reqly Decision Log

<!--
Append any non-obvious product or architecture calls here so the reasoning isn't lost.
Each entry records: date, the decision, and why it was taken.
Newest entries at the top.
-->

## 2026-07-02 - Electron app to bundle server binary + add 1-click AI agent setup wizard

**Decision:** Reverse the 2026-06-29 decision to not bundle the server. The Electron app will bundle a pre-compiled standalone server binary and ship a setup wizard that injects MCP config for AI agents without any terminal interaction.

**Why:** The original decision prioritised developer convenience (keep the CLI and the GUI on the same npm version). But non-technical users (PMs, QAs) who download the DMG hit an immediate dead end - they need npm or Homebrew just to get past the loading screen. Since Reqly's value proposition now extends to non-technical users who want to use AI agents, the "install CLI first" requirement is an adoption blocker.

**Architecture:**
- Electron app bundles a standalone server binary in `packages/desktop/resources/bin/reqly` (compiled for each platform via `pkg` or `@vercel/ncc`)
- On first launch, a setup wizard appears: "Connect your AI Agent" with buttons for Claude Desktop, Cursor, Windsurf
- Each button writes the MCP config file for that agent. Path priority: Homebrew CLI > npm CLI (detected via `which reqly`) > bundled binary absolute path. This ensures developers who already have the CLI use it (so `brew upgrade` keeps agents current), while non-technical users transparently get the bundled path
- Optional "Install `reqly` in PATH" button for developers who want terminal access - creates a symlink from `/usr/local/bin/reqly` to the bundled binary (one-time permission prompt)
- Versioning is preserved: the bundled binary and the Electron app ship together as one artefact, so they are always the same version

**Supersedes:** 2026-06-29 decision "Desktop app requires the `reqly` CLI pre-installed, doesn't bundle it"

---

## 2026-07-02 - Multi-project workspace storage: separate root vs. inside repo

**Decision:** Cross-repo workspace files and flows live in `~/.reqly/workspaces/<name>/`. Individual repo collections stay in `<repoDir>/.reqly/` as today.

**Why:** A flow that references requests from two different repos cannot logically belong to either repo - it is a workspace-level artifact. Forcing it into one repo is arbitrary. The workspace definition (`workspace.yaml`, cross-repo flows, shared environments) must live at a level above any individual repo. Individual repo `.reqly/` folders continue to hold that repo's own collections and are committed to git as today. `reqly init` will auto-add `history.ndjson` and `responses.json` to `.gitignore` so runtime state is never committed.

---

## 2026-07-02 - v2 architecture: disk-persisted state, fully independent processes

**Decision:** Migrate `HistoryStore` and `ResponseStore` from in-memory to disk-persisted files in `<projectDir>/.reqly/`. Remove the singleton lock coordination pattern. Each process (Electron, `reqly mcp`, CLI) runs its own full engine instance independently.

**Why:** The current singleton lock (`~/.reqly/running.json`) exists solely because state lives in RAM. When two processes are running, one must proxy to the other to stay consistent. Moving state to disk eliminates the need for coordination entirely - the filesystem becomes the source of truth, same as collections already are. This unblocks: (1) Electron desktop app with no coupling to `reqly mcp`, (2) true multi-project workspaces where multiple processes work on different repos simultaneously, (3) history that survives process restarts. The lock file is retained as a process registry only (for `reqly stop`/`reqly status`/`reqly app`) but loses its role as a state coordinator.

**Format chosen:** Append-only NDJSON (`history.ndjson`) for history, JSON for responses (`responses.json`). SQLite was considered and rejected for v1: appends are atomic at OS level for small payloads, NDJSON is human-readable and fits Reqly's plain-text philosophy, and Reqly's concurrency level (a PM + one agent) does not produce realistic write collisions. Revisit SQLite if concurrent write corruption is observed in practice.

**Electron implication:** Electron main process runs its own full engine + Express on any free port (tries 4242, falls back to OS-assigned). It writes the lock with its pid and port. `reqly mcp` processes detect the lock and, in v1 interim, go MCP-only against Electron's Express. In v2, `reqly mcp` runs its own full engine - no lock coordination needed. Closing Electron has zero effect on the agent's MCP connection (agents connect to `reqly mcp` over stdio, not to Electron's Express).

---

## 2026-07-02 - switch_project MCP tool: local context swap in v2, not HTTP call

**Decision:** In v2, `switch_project` re-instantiates the process's own `CollectionManager` and `EnvironmentManager` pointing at the new `projectDir`. No HTTP call to another process.

**Why:** In v1 the tool must call `POST /api/switch-project` on the singleton Express because all state lives there. Once state is on disk, "switching project" is just reading a different directory - a local operation with no inter-process dependency. The `/api/switch-project` Express endpoint is removed in v2.



Two different signing modes are required because browser WebSocket APIs cannot send custom HTTP headers at connection time.

**REST and GraphQL (header signing):** `aws4.sign()` mutates a signing options object that mirrors the fetch request - host, method, path, headers, and body. The signed headers (`Authorization`, `X-Amz-Date`, optionally `X-Amz-Security-Token`) are merged back into the request headers before `fetch()` is called. This runs entirely in `http-executor.ts` with no new abstractions.

**WebSocket (query param presigning):** `signRealtimeUrlForAws()` in `realtime-executor.ts` uses `aws4`'s `signQuery: true` option to append signature params to the URL path. `wss://` is temporarily rewritten to `https://` for `aws4` (which only understands http/https host resolution), then the scheme is restored on the output URL. This is the standard pattern for AWS AppSync, IoT Core, and API Gateway WebSocket endpoints.

**Why `awsv4` string value (not `aws_v4` or `AWS_V4`):** Consistent with existing auth type strings in the codebase (`bearer`, `apiKey`, `basic`, `oauth2`, `mtls`). UI and YAML use the string value; TypeScript code uses the `AuthType.AWS_V4` enum.



When adding gRPC support to `flow-runner.ts`, the question was whether to introduce a new step type (`type: grpc-run`) or reuse the existing `run` step with routing inside `fireRequest`.

**Decision:** Reuse the existing `run` step type. `fireRequest` checks `config.type === 'grpc'` and branches to `fireGrpcRequest`, which calls `runGrpcRequest` and adapts the `GrpcResponse` to a standard `HttpResponse` (status 200 = OK, status 500 = any error). All downstream steps (assert, extract, conditional) work unchanged.

**Why:** The `run` step already captures collection + request name. Introducing a new step type would require changes to the type union, YAML schema, MCP tool schemas, and flow-step-schema.ts - significant breaking surface for no real user benefit. The adaptation layer is a clean internal concern; users and agents only see the unified `HttpResponse` shape.



Two fundamentally different use cases require two different architectures.

**Agent/MCP use (ephemeral, bounded):** AI agents need to verify that a realtime endpoint works - "connect, grab a few messages, confirm the protocol handshake, disconnect." This maps naturally to the same buffered executor pattern as gRPC streaming: `realtime-executor.ts` opens a connection, buffers messages for `captureTimeout` seconds, closes, returns `{ messages, truncated }`. Stateless, no server-side sessions, no cleanup required. One MCP tool: `run_realtime`.

**UI interactive use (long-lived, persistent):** Human developers need to stay connected for minutes or hours, send and receive messages interactively. Proxying through the Reqly Node.js server creates double-hop latency (client → Reqly → target), doubles file descriptors, and loses sessions on server restart. The correct architecture is direct browser connections: `new WebSocket()` and `new EventSource()` are native browser APIs (zero packages). `socket.io-client` and `mqtt` browser builds go in `src/ui/package.json` only. The browser holds the session; the Reqly server is not in the data path.

**Why this is the only case where UI has capabilities MCP doesn't replicate 1:1:** Interactive long-lived sessions are inherently a human concern. An agent that needs to monitor a stream for 10 minutes would hold up the entire agentic workflow. The buffered-capture pattern (ephemeral connect+capture) covers every real agent use case (verify endpoint, capture message sample, test pub/sub round-trip). Long-lived monitoring is a human task; direct browser connections are the right tool for it.

**Rule for future protocol additions:** If the protocol is stateless/request-response, add it to the engine and expose via MCP first, UI second (same as REST and gRPC unary). If the protocol requires a persistent connection: buffered executor for MCP, direct browser connection for UI.

## 2026-07-01 - Realtime workspace reuses the main CollectionsPanel with a type filter

The custom `RealtimeCollectionsPanel` was replaced with the existing `CollectionsPanel` plus a `typeFilter` prop limited to realtime request types. Reasoning: the REST sidebar already had project switching, search, drag-drop move, rename, delete, export, context menus, and better empty states. Keeping a second sidebar in sync would create feature drift and extra UI maintenance for no product value. Filtering the shared panel keeps realtime saved requests in the same collection model while preserving a focused realtime-only view.

## 2026-07-01 - gRPC streaming split into separate grpc-streaming.ts, not merged into grpc-runner.ts

Streaming modes (server/client/bidirectional) live in `src/engine/grpc-streaming.ts` rather than being overloaded into `grpc-runner.ts`. Reasoning: unary and streaming RPCs have fundamentally different callback shapes (callback vs EventEmitter). Keeping them separate keeps each file focused and testable in isolation without fake streaming infrastructure contaminating unary tests.

## 2026-07-01 - gRPC Metadata uses the same `headers` field as REST

Rather than adding a separate `metadata` concept to the YAML schema, gRPC requests re-use the existing `headers` field and map it directly to gRPC Metadata entries. Reasoning: users already understand headers; grpc-js treats metadata as string key/value pairs just like HTTP headers; this avoids an unnecessary schema divergence between REST and gRPC request configs.

## 2026-07-01 - Proto files stored in .reqly/protos/ with includeDirs for cross-file imports

Proto files live at `.reqly/protos/` (project-level, not inside a collection folder). `@grpc/proto-loader` is configured with `includeDirs: [protosDir]` so `import "google/protobuf/timestamp.proto"` and cross-file service imports resolve correctly without requiring users to manage separate include paths. The location is outside collections so proto files are shared across all gRPC collections in the project.

## 2026-07-01 - list_grpc_services returns service names only (no raw binary blobs to agents)

`discoverServicesViaReflection()` fetches raw `FileDescriptorProto` binary blobs, but `list_grpc_services` MCP tool returns only `{ services: [{ name }], fileDescriptorCount }`. Binary protobuf blobs would be large, unreadable, and uselessly noisy in an agent's context window. The count tells agents how many files were fetched as a sanity check.

## 2026-06-30 - GraphQL subscription detection by query keyword, not by saved type

`GraphQLWorkspace` detects subscription mode at runtime by scanning the query text for the `subscription` keyword rather than relying on a `type: graphql-subscription` flag on the saved request. Reasoning: users often paste or type a subscription query into the playground before saving. Requiring them to set a type field first would create friction. The subscription stream panel appears automatically when the query starts with `subscription`, and reverts to the normal response viewer when they switch to a `query` or `mutation`. Saved requests still carry `type: graphql-subscription` as a forward-compatible marker for the engine and MCP.

## 2026-06-30 - Schema cache stored per URL hash in .reqly/.schema-cache/

Introspection results are cached per-URL as `<sha256-of-url>.json` inside `.reqly/.schema-cache/`. This directory is inside the project's `.reqly/` folder so it travels with the repo if committed, or can be gitignored if preferred. The hash-based naming prevents collisions between different endpoints (staging vs prod). The cache is written both by the UI (on manual introspection) and by the `introspect_graphql` MCP tool so either path benefits the other.

## 2026-06-30 - graphql package added to server root for MCP introspect_graphql tool

`getIntrospectionQuery()` from the `graphql` npm package is used in the `introspect_graphql` MCP tool to generate the full introspection query. Previously the package was only in `src/ui/`. Adding it to the root `package.json` makes it available to server-side code without duplicating the query string inline.

## 2026-06-30 - Nav rail architecture for multiple protocols

Each protocol workspace gets a nav rail icon only when its interaction model is genuinely distinct from a REST request. Concretely:

- **gRPC**: dedicated nav rail icon. Workflow is proto loading / server reflection, service browser, method picker, message editor - this can't be crammed into the REST request editor without making both worse.
- **WebSocket + SSE**: share one "Realtime" nav rail icon. Both are persistent-connection stream protocols with the same UI paradigm (Connect button, append-only message log, composer). Two separate icons for two similar things would be wasteful.
- **mTLS**: no nav rail icon. It is auth configuration, not a protocol workspace. Lives in the Certificate tab of Collection/Request Settings (T-148). Adding a nav rail item would misrepresent it as a separate mode of operation.
- **REST + GraphQL**: already have their own icons.

The nav rail icons are exploratory playgrounds. Saved requests of any type live in the Collections panel; opening one from there switches the request editor into the appropriate adaptive view.

Final nav rail order: Collections / Environments / Flows / GraphQL / gRPC / Realtime / History / Capture / Settings (9 items, within usable limit for a developer-focused tool).

## 2026-06-29 - Desktop installers ship unsigned for v1

Mac: no Apple Developer account ($99/year) for v1 - notarization isn't worth the cost before there's traction. `electron-builder.yml` deliberately omits `hardenedRuntime`/`entitlements`/`gatekeeperAssess` since those only matter for notarization. Users see "cannot be opened because the developer cannot be verified" on first launch; workaround is right-click > Open > Open anyway (one-time, well-known to the dev audience). Homebrew tap users bypass this entirely. Revisit when there's budget for a Developer account.

Windows: no EV certificate ($300-500/year) for the same reason. SmartScreen shows "Unknown publisher"; workaround is "More info" > "Run anyway". The warning clears automatically once the installer accumulates download reputation (roughly a few hundred downloads). Binaries are still signed with Sigstore/cosign (free, GitHub identity-based) for tamper-evidence even though it doesn't buy SmartScreen trust. Revisit EV signing once traction justifies it.

## 2026-06-29 - Desktop app requires the `reqly` CLI pre-installed, doesn't bundle it

Bundling Node + the compiled server into the Electron app (so DMG/EXE users need nothing else installed) was considered but rejected for v1 - it roughly doubles the packaging surface (cross-platform Node binary bundling, keeping it in sync with the npm package) for a problem that has a one-line workaround. Instead `packages/desktop/src/main.ts` detects `reqly` on PATH via `which`/`where` before attempting to spawn it, and shows a one-time setup screen ("Install Reqly CLI first: npm install -g reqly-app") if missing, rather than hanging on the loading screen for 10s. Revisit bundling if "install the CLI first" proves to be a real adoption blocker.

## 2026-06-28 - `switch-project.test.ts` stops the dotenv watcher in `afterEach`

`POST /api/switch-project`'s "re-points dotEnvLoader" test starts a real chokidar watcher (via the handler's `context.dotEnvLoader.watch()`) on a temp dir, then the test deletes that dir before the watcher is ever stopped. On `windows-latest` CI the orphaned watcher threw an async `EPERM` during the *next* test, crashing the run despite every assertion passing (590/590 green, 1 stray error). Added `context.dotEnvLoader.stopWatching()` to the describe block's `afterEach` - mirrors what the real `switch_project` handler already does correctly before creating a new watcher.

## 2026-06-28 - `stop-proxy.test.ts` pinned to unix for the process-group-kill tests

Two tests asserted `process.kill(-pid)` unconditionally, but `killProcessTree` uses `taskkill` on win32 and never calls `process.kill` there - failing on `windows-latest` CI. Pinned `process.platform` to `'linux'` in those two tests, matching the pattern `process-utils.test.ts` already uses for the same function.

## 2026-06-28 - `terminal.test.ts` skipped on `windows-latest` CI only

After fixing the undici/Node-22 issue, `windows-latest` still failed: `node-pty`'s conpty backend calls `AttachConsole`, which throws because GitHub's Windows runner has no console window attached to the test process (no TTY in headless CI). This is an environment limitation, not a code bug - real Windows dev machines and self-hosted runners with a console are unaffected. Skipped the suite with `describe.skipIf(process.platform === 'win32' && !!process.env.CI)` rather than mocking `node-pty` (would stop testing the real PTY behavior the Windows desktop terminal feature depends on) or dropping the Windows CI matrix leg entirely (still want ubuntu-equivalent coverage of everything else on Windows).

## 2026-06-28 - CI bumped to Node 22, `engines.node >=22.19.0` added

`undici@8.5.0` requires Node `>=22.19.0` (`npm view undici@8.5.0 engines`). CI was pinned to Node 20, so every run crashed with `webidl.util.markAsUncloneable is not a function` on any test file importing `undici` (auth-manager, capture-inbound, run-adhoc, switch-project, terminal). Bumped `.github/workflows/ci.yml` to `node-version: 22` and added `engines.node` to `package.json` so a future downgrade fails fast at `npm install` instead of failing obscurely in CI. Also fixed `cli-parser.test.ts`'s `resolveProjectDir` tests, which hardcoded POSIX-style expected paths (`/home/user/...`) - these always failed on `windows-latest` since `path.resolve` returns native Windows paths; rewrote expectations to build via `path.resolve` so they're platform-agnostic instead of POSIX-only.

## 2026-06-28 - JUnit reporter uses `--reporter junit`, not `--format junit`

T-135's spec text said `--format junit`, but the CLI's `--format` flag was already in use by `export-flow` to pick the generated CI workflow type (`github-actions`), while `--reporter` was already the flag selecting `run`/`run-flow` output shape (`pretty`/`json`/`tap`). Adding a second flag with overlapping meaning would have been confusing and inconsistent with the existing convention. Implemented junit as a fourth `--reporter` value instead, alongside `pretty`/`json`/`tap`.

## 2026-06-27 - Network error messages append the underlying cause code (e.g. `fetch failed (ECONNREFUSED)`)

`http-executor.ts`'s catch blocks used to throw `RequestError(err.message)` verbatim. undici's `fetch` collapses connection failures into a generic `"fetch failed"` TypeError with the real reason in `err.cause.code` - so agents and the UI alike only ever saw "fetch failed" with no actionable detail. Added `formatNetworkError(err)` to append `(CODE)` when present. This is a response-body format change visible to MCP tool callers (`run_request` etc.) as well as the UI, but it's strictly additive (more detail, same prefix) so no consumer should break - flagging here since it touches the shape of an error string that scripts/assertions could theoretically pattern-match on.

## 2026-06-27 - SSE `project` event only fires on an actual switch, not any 200 from `/api/switch-project`

The generic SSE-emit middleware in `express.ts` matched on route path alone (`p === '/api/switch-project'`) to decide when to broadcast the `project` event, which the UI treats as "the project changed - reload the page." Adding `needsReqlyDir`/`notFound` responses to that route (T-128) meant a 200 response that explicitly did NOT switch anything (the `.reqly/`-missing case) still triggered a full page reload, wiping the confirmation modal before the user could see it. Fixed by gating the emit on the response body's `ok` field rather than the path/status code. Lesson: path-based middleware that infers "did a mutation happen" from route + status code breaks as soon as a route grows multiple non-mutating success responses - check the actual body where it matters.

## 2026-06-27

**Decision:** T-112's embedded terminal (`/terminal` WebSocket, `child_process.spawn`, no auth) shipped exactly as specced after explicit user confirmation - the safety classifier flagged it mid-implementation as an arbitrary command-execution surface and blocked further tool calls until confirmed.
**Why:** The spec's own rationale ("no authentication needed - Reqly already only binds to localhost") matches the project's existing trust model (`exec_with_proxy` already spawns child processes from an MCP tool call with no extra auth). Still, a raw WS-to-shell bridge is a meaningfully different risk shape (any page that can reach localhost can run commands) worth a deliberate yes/no rather than silent implementation - asked, got an explicit "proceed as specced," then continued.

**Decision:** `attachTerminal(server, getProjectRoot: () => string)` takes a getter, not a static path - it re-reads `path.dirname(context.collectionManager.getBaseDir())` on every `run` message rather than capturing the project root once at server startup.
**Why:** `/api/switch-project` reassigns `context.collectionManager` to a new project's manager at any time (single global Express instance, see the 2026-06-24 single-instance-enforcement entry). A static path captured at WS-attach time would silently keep spawning commands in the old project's directory after a switch - same bug class as the dotEnvLoader closure bug fixed in T-104, caught proactively this time instead of by a failing test.

## 2026-06-27

**Decision:** `ContractCheckResult` (shared `checkContract` helper) carries `path`/`method` (the matched spec operation's path template) separately from `inferredPath` (the request's actual resolved path, only set when unmatched).
**Why:** The UI spec wants "All checks passed · `GET /users/{id}` · `getUser`" on a match (the spec's path template + operationId) but "No matching operation found... inferred path: /orders/9" on a miss (what the request actually resolved to). These are different strings serving different purposes - conflating them into one field would make one of the two UI states wrong.

**Decision:** Added a `delete_collection_spec` MCP tool even though T-106's spec only listed four tools (`set_collection_spec`, `get_collection_spec`, `list_spec_operations`, `validate_response`). The Express route list already included `DELETE /api/collections/:name/spec`.
**Why:** CLAUDE.md's tool-first principle: "If it can't be called via MCP, it doesn't exist as a feature." A DELETE route with no MCP equivalent would mean an agent could configure a spec but never remove one - a real gap, not scope creep, since the capability was already implied by the route list.

**Decision:** OpenAPI contract validation (T-105) lives in a standalone `ContractValidator` (`src/engine/contract-validator.ts`) that callers run AFTER `execute()`, not "wired into `http-executor.ts`" as the task spec literally said. The executor keeps its existing signature and stays free of any spec/filesystem dependency.
**Why:** `http-executor.ts` is the engine-pure HTTP layer - it deliberately knows nothing about assertions or response diffing either; both are computed by the callers (the express adhoc route, the collection runner) after the response comes back. Pushing spec loading + ajv validation into the executor would drag `swagger-parser`/`ajv`/`fs` into the one module that must stay a thin request-firer, and would diverge from the established assertion/diff pattern that T-106's `run_request`/route/CLI wiring already mirrors. `ContractValidator.validate(operation, response)` is pure and unit-tested in isolation; T-106 composes `specLoader.load()` + `findOperation()` + `validate()` at each call site, exactly where assertions are computed today.

**Decision:** `ajv-formats` is imported and then normalized with `(addFormatsModule as any).default ?? addFormatsModule` rather than a plain default import.
**Why:** `ajv-formats` is a CommonJS package; under this repo's `NodeNext` module resolution `tsc` rejects the plain `import addFormats from 'ajv-formats'` default-call ("has no call signatures") even though it runs fine via esbuild/vitest. The runtime callable is on `.default` in some resolutions and is the module itself in others, so normalizing covers both and makes `tsc --noEmit`, the `tsc -p .` build, and the runtime all agree. `ajv` itself uses its named `{ Ajv }` export for the same reason.

## 2026-06-26

**Decision:** `DotEnvLoader` resolves `.env` files relative to the project root (`cwd`/`path.dirname(collectionManager.getBaseDir())`), not `CollectionManager.getBaseDir()` as T-104's spec text literally said.
**Why:** `getBaseDir()` returns `<project>/.reqly`, not the project root - a `.env` file lives at the project root by universal convention (and the roadmap's own "Later" entry for this feature explicitly says "a `.env` file in the project root"). Following the literal spec text would have looked for `.env` inside `.reqly/`, which no developer would ever put there. Caught before shipping by cross-checking the roadmap wording against the todo.md task text.

**Decision:** The Settings panel's "Environment files" reorder control uses up/down arrow buttons instead of the spec's literal "drag-to-reorder".
**Why:** No drag-and-drop library exists in the project yet, and order only needs to move one position at a time for the realistic case (one or two files). Arrow buttons give the same reordering capability with far less code and no new dependency; full DnD can be added later if a real need for reordering many files shows up.

**Decision:** T-100's reference mockup (`docs/tasks/T-100-flows-ui-reference.html`) uses the Tabler icon webfont via a CDN `<link>`. The real implementation uses `lucide-react`'s `GitBranch` icon instead, with no new icon dependency added.
**Why:** An earlier decision (2026-06-24) standardized the entire UI on `lucide-react` as the single icon library, specifically to avoid the kind of inconsistency a second icon system (font-based, CDN-loaded) would reintroduce. The mockup is a static visual reference for pixel-matching colors/spacing/layout, not a literal instruction to add a webfont dependency - `GitBranch` is visually equivalent to `ti-git-branch` and keeps the one-import-path rule intact.

**Decision:** Flows and collections share the same `.reqly/` base directory (`FlowManager` reads/writes `.reqly/flows/`, `CollectionManager` reads/writes everything else directly under `.reqly/`), with `CollectionManager.listCollections()` excluding a small `RESERVED_DIRS` set (currently just `flows`) rather than giving flows their own top-level root.
**Why:** T-095 already chose `.reqly/flows/<name>.yaml` to keep flows alongside collections in the same git-tracked tree (consistent with "collections are plain text, travel with the repo"). The cost is that `CollectionManager`, which lists every directory under its base dir as a collection, picked up `flows/` as a fake collection with one fake "request" per flow file - caught while wiring the Flows UI's sidebar (T-100), which rendered exactly that. A reserved-name exclusion is the minimal fix; the alternative (a separate root directory for flows) would have meant passing a second path through every CLI/MCP/Express entry point for no real benefit, since the two managers already don't share any file-reading code.

**Decision:** The "Collection Settings" modal (T-089) saves on an explicit Save button against a local draft, not on every `KeyValueEditor` keystroke.
**Why:** `KeyValueEditor`'s `onChange` fires on every field edit, so a naive per-keystroke persist would fire a set/delete API call per character typed - wasteful, and a half-typed key could get persisted then immediately deleted on the next keystroke. `EnvironmentsPanel` already solved this exact problem (local draft state, diff-and-persist on Save), so the new modal copies that pattern rather than inventing a new one.

**Decision:** Collection-level variables (T-088) are stored in a reserved `collection.yaml` file inside each collection folder, and the variable resolver was rewritten as a layered scope chain (`resolveVariables(template, layers[], responseStore?)`) rather than a hardcoded two-level merge.
**Why:** Collections are folders of `<request>.yaml` files with no metadata file; `collection.yaml` is the natural home for collection-scoped metadata (variables now, auth in T-090), and `CollectionManager.getCollection` simply skips it when listing requests (`addRequest` also rejects a request named "collection" so it can't clobber the metadata file). The resolver is layered because the upcoming flow runner (T-092+) needs to prepend a flow-local scope (`[flowLocalScope, collectionVars, envVars]`) without touching resolver internals - a two-level `collection-over-env` merge would have to be torn out again. First-layer-wins gives the required "collection wins over env on collision" precedence as a special case of the general design. Plain `{{name}}` lookups and dotted `{{x.response.y}}` chaining stay on separate resolution paths so they never collide. `substitute`/`substituteConfig` keep accepting a single vars object for back-compat (wrapped into a one-element layer array internally), so existing callers were untouched.

**Decision:** `homebrew-reqly`'s `Formula/reqly.rb` points at the scoped npm tarball `https://registry.npmjs.org/getreqly/-/reqly-1.0.5.tgz` with `license "ISC"`, diverging from the original task spec's template (unscoped `reqly` URL, `MIT` license).
**Why:** The spec was written before the package was actually published and assumed an unscoped name and a license that was never accurate - `package.json` has always said `ISC`. Formula correctness was verified by testing, not by following the template literally: built and ran `brew test`/`reqly --version` against a local tap first, then again against the real pushed repo, before treating the task as done.

**Decision:** Fixed `package.json`'s `repository`/`homepage`/`bugs` URLs (were `github.com/RutvikPansare/AgentMan`, an old project name) to `github.com/RutvikPansare/Reqly`, matching the actual git remote.
**Why:** Found while building the Homebrew formula's `homepage` field - the npm package metadata was still pointing at a renamed-away repo, which would have been wrong information shipped to every npm install.

**Decision:** Added a build step (`tsc`, new `packages/reqly-middleware/tsconfig.json`) to `reqly-middleware` and repointed its `main`/`exports`/`files` at compiled `dist/` output instead of raw `src/*.ts`.
**Why:** The package as originally written had no compiled output - `main: "src/index.ts"` and `exports` pointing straight at TypeScript source. That's unusable by a plain Node consumer with no TS loader, which is exactly who this middleware targets (any Express/Fastify/Next.js app). Caught this while publishing `reqly-middleware@0.1.0` to npm as part of T-086 - fixed before publishing rather than shipping a broken package.

**Decision:** Replaced `.npmignore`-based exclusion with an explicit `files` allowlist in `package.json` for npm publishing, and moved `tsx`/`typescript`/`vitest` from `dependencies` to `devDependencies`.
**Why:** `npm pack --dry-run` (T-086 pre-publish check) revealed `.npmignore`'s `src/` rule was not reliably excluding nested content - `src/ui/node_modules` alone leaked in 8516 files, ballooning the tarball to 149.7MB unpacked. An explicit `files` allowlist (`dist`, `packages/reqly-middleware/src/*.ts`, `packages/reqly-middleware/package.json`, `README.md`, `llms.txt`) is unambiguous regardless of ignore-pattern quirks. `tsx`/`typescript`/`vitest` are only used by dev scripts and the test suite - the built CLI (`dist/server/index.js`) runs under plain `node` per its shebang, so they don't belong in runtime `dependencies` for end users installing the package.

## 2026-06-24

**Decision:** `reqly-middleware` lives at `packages/reqly-middleware/` as its own npm-publishable package inside the main repo (workspaces, not a separate repo), and the inbound-capture payload includes a `collection` field even though the original T-070 spec text only listed `{method, url, headers, body, timestamp}`.
**Why:** A monorepo subfolder keeps the middleware versioned and tested alongside the engine it talks to, without forcing a second repo/release pipeline for a package this small. The `collection` field was a necessary addition - the backend route has no other way to know which collection an inbound capture belongs to, and the middleware's own config already exposes a `collection` option, so passing it through the wire format was the only way to honor that option end-to-end.

**Decision:** T-067's `exec_with_proxy` tracks the spawned dev-command pid in-memory on `EngineContext.execChildPid`, not in the shared `~/.reqly/running.json` lock file as the task spec originally proposed.
**Why:** T-066 made it possible for a process to run MCP-only (no Express, no lock ownership) when another instance already owns port 4242. If `exec_with_proxy` wrote the child pid into the shared lock file, an MCP-only session's exec'd process would overwrite whatever the lock-owning instance had stored there - on `stop_proxy`, the wrong instance could kill the wrong child. Each process already holds its own `EngineContext`, so an in-memory field gives exact correctness with no cross-process coordination needed; only that process's `stop_proxy` call can kill the process it itself spawned, which is also the only thing that should be able to.

**Decision:** Single-instance enforcement (T-066) - one process binds port 4242 and serves Express/UI at any time, tracked via `~/.reqly/running.json`. When a second `reqly start --project-dir X` is launched, it switches the running instance's project (`POST /api/switch-project`, hot-swaps `collectionManager`/`environmentManager` on the shared context) and then runs its own MCP stdio server in "mcp-only" mode (no Express, no port bind) rather than exiting.
**Why:** Two AI tools (e.g. Cursor on one project, Claude Code on another) each spawning their own `reqly start` previously raced for port 4242 - the loser crashed, or worse, both MCP stdio sessions silently shared the first instance's `collectionManager`, writing collections to the wrong project's `.reqly/` folder. Switching the existing instance's context (instead of running N independent engines) keeps exactly one Express/UI process alive while still giving every AI tool's stdio session its own correctly-scoped MCP server. `reqly stop` was added so a user can cleanly shut the lone Express instance down without hunting for its pid.

**Decision:** Added `reqly use <path>` and `reqly status` CLI commands, plus an `activeProject` field in `~/.reqly/config.json` as the final fallback in the project-dir resolution chain (priority: `--project-dir` flag > `REQLY_PROJECT_DIR` env var > `activeProject` config field > `process.cwd()`).
**Why:** Claude Desktop spawns one global `reqly` MCP server process shared across every project, with no `${workspaceFolder}` equivalent and no way to inject per-project launch args or env vars per chat. T-064's env var fallback still required hand-editing `claude_desktop_config.json` per project switch. `reqly use` lets the user (or an agent) point the server at a project with a single command and no JSON editing; `reqly status` reports which source won, for debugging "why is it looking in the wrong folder".

**Decision:** Added `REQLY_PROJECT_DIR` env var as a fallback (priority: `--project-dir` flag > `REQLY_PROJECT_DIR` env var > `process.cwd()`) for resolving the project root the server treats as the `.reqly` home. Extracted into a pure `resolveProjectDir()` in `src/server/cli-parser.ts`.
**Why:** A user reported `mkdir '/.reqly' ENOENT` in a real project (Tellero) - their MCP host spawned `reqly start` with cwd `/` and no `--project-dir` flag, and the actual MCP launch config couldn't be located in any standard config file to add the flag. Some MCP host UIs let users set per-server env vars without exposing the launch args at all, so an env var escape hatch fixes the class of bug even when the args can't be edited. `reqly setup`'s Claude Code instructions now mention it.

**Decision:** Adopted `lucide-react` as the single icon library for the localhost UI, replacing all hand-rolled inline `<svg>` blocks (stroke-style nav icons and Bootstrap-icons-style fill paths that had crept in across components).
**Why:** Two inconsistent icon styles (stroke vs Bootstrap fill) had accumulated across NavRail, KeyValueEditor, EnvironmentsPanel, EnvironmentSwitcher, ResponseViewer, and App.tsx tab bar. Lucide is MIT-licensed, tree-shakeable, and matches the Hoppscotch-reference aesthetic CLAUDE.md's UI section calls for. One import path going forward instead of copy-pasted SVG markup per icon.

**Decision:** GraphQL moved out of the REST request editor into its own full-workspace nav rail section (`GraphQLWorkspace.tsx`), replacing the earlier REST/GQL mode toggle inside `RequestEditor.tsx`. GraphQL requests are not persisted to collection YAML and have no save/collection affordance - the workspace is ephemeral, scoped to one query/variables/response at a time.
**Why:** A mode toggle buried inside the REST editor made GraphQL feel like an afterthought and complicated `RequestEditor.tsx` with parallel state (query, variables, schema, introspection) that only applied in one of two modes. Hoppscotch's pattern - GraphQL as its own first-class workspace - is clearer for users and keeps the REST editor simple. Not persisting GraphQL requests to collections is a deliberate scope cut for this task; saved/named GraphQL requests can be a follow-up if needed.

**Decision:** Remove the in-app Prompt Bar and BYOK (API key + model selector) from Settings. Settings panel stays in the UI as an empty placeholder for future preferences; `GET/POST /api/config` and `~/.reqly/config.json` stay in place as generic config storage, just with no BYOK fields written to them anymore.
**Why:** Reqly's tool-first principle puts the AI outside the engine - developers already drive Reqly via MCP from their own Cursor/Claude Code agent. An in-app LLM prompt bar duplicated that capability with extra surface area (a second LLM integration, a second API key to manage) for no advantage at this stage.

**Decision:** Persist active UI state (tabs, active tab, active nav panel) to `localStorage` via a debounced `useLocalStorage` hook, and strip response bodies + auth credentials from tabs before writing. Active environment continues to persist in `environments.yaml` (server-side), not `config.json` as the task spec suggested.
**Why:** The spec assumed active environment was in-memory only, but `EnvironmentManager.setActiveEnvironment` already writes `store.active` to `environments.yaml` and `getActiveEnvironment` reads it back - so the server-side half was already satisfied and no config.json change was needed. For localStorage, response bodies are ephemeral and can be large (would blow past the ~5MB quota fast), and auth credentials / env variable values are sensitive - both must be stripped before persisting tabs. The 300ms debounce prevents a storage write on every keystroke (the dirty-tracking `onChange` fires continuously). Rehydrated tabs restore with `response: null` and `isSending: false`.

**Decision:** GraphQL support is a UI-mode toggle on the request editor (`mode: 'graphql'`), not a separate request type, executor path, or MCP tool. The editor assembles `{ query, variables }` as the body object and the existing HTTP executor handles it transparently (it already stringifies object bodies and sets `Content-Type: application/json`).
**Why:** The executor is method+body agnostic - a GraphQL request is just a POST with a JSON `{ query, variables }` body. Adding a parallel GraphQL executor or a new MCP tool would duplicate the HTTP path for no behavioural gain and violate the engine-agnostic principle. Keeping the mode flag on the request (persisted to YAML) lets the UI render the query/variables editor while the engine stays dumb. Introspection runs through the normal adhoc run endpoint, so no new backend route was needed either. Schema autocomplete is intentionally minimal (field list display) for the MVP - a full CodeMirror-style autocomplete is deferred.

**Decision:** Request history lives in a dedicated `HistoryStore` engine module (in-memory, capped at 200 entries) on `EngineContext`, parallel to `ResponseStore`, rather than as a server-only array or persisted file.
**Why:** History must capture every fired request regardless of entry point - adhoc UI runs, MCP `run_request`, and collection runs all need to append. Putting the store on `EngineContext` (the shared seam both the MCP tools and Express handlers already hold) means every execution path logs through one `append` call with no special-casing, and the UI's `GET /api/history` reads the same source. In-memory (no YAML persistence) matches the T-043 spec's MVP scope: history is a working scratchpad, not a committed artifact. The 200-entry cap bounds memory for long sessions.

**Decision:** Environment editing moved from a modal dialog to an inline, expandable variable table inside the Environments nav-rail panel; the standalone EnvironmentEditor modal was removed.
**Why:** The nav rail already owns the Environments surface. Inlining the Key/Value table with add/remove rows and per-environment Save keeps editing in context (the user is already looking at the list), avoids a second modal for routine variable tweaks, and matches Hoppscotch's inline environments editor pattern. Required adding `EnvironmentManager.deleteEnvironment` (TDD) and `DELETE /api/environments/:name`, which the task spec assumed already existed.

**Decision:** Split the monolithic Sidebar into a left icon NavRail plus switchable per-function panels (Collections / Environments / History / Capture).
**Why:** The M4 UI growth tasks (T-041 environment editor, T-043 history panel) need dedicated sidebar surfaces. A nav rail that swaps the panel content keeps a single 64px sidebar column while giving each function its own full-height view, matching Hoppscotch's Sidenav pattern without mirroring its right-side collection layout. Settings stays a modal (BYOK config does not fit a narrow column); the rail's Settings icon opens that modal rather than rendering inline.

## 2026-06-23

**Decision:** Reqly will not host any AI models itself.
**Why:** Reqly is purely an execution engine. The intelligence lives in the user's AI agent (Cursor, Claude Code) or via a BYOK API key. This keeps the engine fast, reliable, and decoupled from rapidly changing LLM landscapes.

**Decision:** Collections will be stored as YAML files.
**Why:** YAML is human-readable, git-diffable, and easily editable in a text editor. This allows the API collections to travel with the repository and be modified cleanly by both humans and AI agents.
